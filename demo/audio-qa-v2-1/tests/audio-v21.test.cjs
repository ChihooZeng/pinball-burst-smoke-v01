"use strict";
/* 《弹珠超载》音效调试台 V2.1 自动化测试
   覆盖：
   A. 事件表 —— 只有四类事件，只有砖甲受击有两个候选
   B. 路由 —— 删除的旧事件不再被接管，四类事件全部被接管（含静音）
   C. 互斥 —— 同一次碰撞不会同时产生砖甲受击与砖块击破（源码级断言）
   D. 无音效 —— 单独关闭只影响自己，静音时不发声且不回退合成音
   E. 配置 —— 切换、持久化、JSON 导出（含 none 状态）
   F. 静态边界 —— 旧分组 / 旧候选列表 / 外部 CDN 不得回流
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (error) { failures.push({ name, error }); console.log("  ✗ " + name + " → " + error.message); }
}
async function testAsync(name, fn) {
  try { await fn(); pass++; console.log("  ✓ " + name); }
  catch (error) { failures.push({ name, error }); console.log("  ✗ " + name + " → " + error.message); }
}

/* ---------- 最小 DOM / WebAudio / fetch 桩 ---------- */
function makeHarness(seedStorage = null) {
  const started = [], oscillators = [];
  const storage = new Map(seedStorage ? Object.entries(seedStorage) : []);
  /* 可控时钟：冷却与持久化都依赖它，测试才能稳定复现同一帧的连打。 */
  const clock = { now: 1_000_000, advance(ms) { clock.now += ms; } };
  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = { id: "destination" };
    }
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {}, linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {}, setTargetAtTime() {}
        },
        connect() {}, disconnect() {}
      };
    }
    createDynamicsCompressor() {
      return {
        threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
        attack: { value: 0 }, release: { value: 0 }, connect() {}, disconnect() {}
      };
    }
    createBufferSource() {
      const node = {
        buffer: null, playbackRate: { value: 1 }, started: null, stopped: false,
        connect() {}, disconnect() {}, onended: null,
        start(when) { node.started = when; started.push(node); },
        stop() { if (!node.stopped) { node.stopped = true; if (node.onended) node.onended(); } }
      };
      return node;
    }
    createOscillator() {
      const node = {
        type: "sine", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {}, onended: null,
        start() { oscillators.push(node); }, stop() {}
      };
      return node;
    }
    decodeAudioData() {
      const length = 13230; // 0.3s @44.1k
      const data = new Float32Array(length);
      for (let i = 0; i < length; i++) data[i] = Math.sin(i / 12) * .35;
      return Promise.resolve({
        duration: length / 44100,
        sampleRate: 44100,
        numberOfChannels: 1,
        length,
        getChannelData: () => data
      });
    }
    resume() { return Promise.resolve(); }
  }
  const sandbox = {
    console,
    performance: { now: () => clock.now },
    setTimeout, clearTimeout, Promise, Date, Math, Float32Array, ArrayBuffer, JSON, Object,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(64) }),
    document: { hidden: false, addEventListener() {} },
    AudioContext: FakeAudioContext,
    __pinballAudioQaFix: { getStatus: () => ({ wave: 3, phase: "playing" }) }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("sound-pack.js"), sandbox, { filename: "sound-pack.js" });
  return { api: sandbox.window.PinballGameAudio, started, oscillators, storage, sandbox, clock };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
/* vm 里创建的对象原型不同，deepEqual 前先转成宿主对象。 */
const plain = (value) => JSON.parse(JSON.stringify(value));

(async () => {
  console.log("\n【A】事件表：只允许四类事件，只有砖甲受击有两个候选");
  const base = makeHarness();
  const api = base.api;
  api.prime();
  await flush();

  test("describe() 只有四个事件，顺序与命名固定", () => {
    const list = api.describe();
    assert.equal(list.length, 4);
    assert.deepEqual(list.map((x) => x.id), ["brick_hit", "brick_break", "clear_upgrade", "fail"]);
    assert.deepEqual(list.map((x) => x.name), ["砖甲受击", "砖块击破", "清屏升级", "触线失败"]);
  });

  test("砖甲受击恰好两个候选：V5 木质轻敲 / V5 木板闷响", () => {
    const hit = api.describe().find((x) => x.id === "brick_hit");
    assert.equal(hit.fixed, false);
    assert.deepEqual(plain(hit.variants.map((v) => v.id)), ["v5-wood-light", "v5-wood-thud"]);
    assert.deepEqual(plain(hit.variants.map((v) => v.label)), ["V5 木质轻敲", "V5 木板闷响"]);
  });

  test("其余三类各只有一个固定候选，ID 与需求一致", () => {
    const map = Object.fromEntries(api.describe().map((x) => [x.id, x]));
    assert.equal(map.brick_break.fixed, true);
    assert.deepEqual(plain(map.brick_break.variants.map((v) => v.id)), ["break-x11"]);
    assert.equal(map.clear_upgrade.fixed, true);
    assert.deepEqual(plain(map.clear_upgrade.variants.map((v) => v.id)), ["clear-x14"]);
    assert.equal(map.fail.fixed, true);
    assert.deepEqual(plain(map.fail.variants.map((v) => v.id)), ["fail-02"]);
    assert.ok(map.brick_break.variants[0].label.includes("impactGlass heavy 000"));
    assert.ok(map.clear_upgrade.variants[0].label.includes("Upper01"));
    assert.ok(map.fail.variants[0].label.includes("错误提示中音"));
  });

  test("事件表里不存在旧版九个分组", () => {
    const ids = api.describe().map((x) => x.id);
    for (const legacy of ["mg", "hit", "break", "armor", "boom", "skill_select", "clear", "upgrade", "shock"]) {
      assert.ok(!ids.includes(legacy), "旧事件仍在表中：" + legacy);
    }
  });

  test("四个素材文件全部自托管且存在于磁盘", () => {
    const files = [
      "audio/break-x11-impactGlass_heavy_000.ogg",
      "audio/clear-x14-Upper01.wav",
      "audio/fail-02-error_005.ogg",
      "../audio-qa/audio/mg.ogg",
      "../audio-qa/audio/hit.ogg"
    ];
    for (const file of files) {
      const full = path.resolve(ROOT, file);
      assert.ok(fs.existsSync(full), "缺少素材：" + file);
      assert.ok(fs.statSync(full).size > 2000, "素材过小：" + file);
    }
  });

  console.log("\n【B】路由：删除的事件不再发声，四类事件全部被接管");
  const deleted = ["mg", "boom", "shock", "skill_select", "upgrade"];
  test("删除的五个旧事件返回 false（交回合成音层，且 game.js 已不再调用）", () => {
    for (const kind of deleted) assert.equal(api.play(kind), false, kind + " 仍被接管");
  });

  test("四类事件的旧名与新名都被接管（返回 true）", () => {
    for (const kind of ["hit", "armor", "brick_hit", "break", "brick_break", "clear", "clear_upgrade", "fail"]) {
      assert.equal(api.play(kind), true, kind + " 未被接管");
    }
  });

  test("hit 与 armor 合并到同一个事件：任一被静音，另一个也静音", () => {
    api.setMuted("brick_hit", true);
    const before = api.getState().voices;
    api.play("hit"); api.play("armor");
    assert.equal(api.getState().voices, before, "静音后仍在创建音频节点");
    assert.equal(api.play("hit"), true, "静音必须由本层吞掉，不能回退合成音");
    api.setMuted("brick_hit", false);
  });

  await flush();
  test("正常路由会真正创建音频节点（砖甲受击 / 击破 / 清屏 / 失败）", async () => {
    api.stopAll(); base.clock.advance(3000);
    let before = api.getState().voices;
    api.play("armor");
    assert.equal(api.getState().voices, before + 1, "砖甲受击未发声");
    api.play("break");
    assert.equal(api.getState().voices, before + 2, "砖块击破未发声");
    api.play("clear");
    assert.equal(api.getState().voices, before + 3, "清屏升级未发声");
    api.play("fail");
    assert.equal(api.getState().voices, before + 4, "触线失败未发声");
  });

  test("连打冷却：同帧重复触发被合并，不会异常叠音", () => {
    api.stopAll(); base.clock.advance(3000);
    const before = api.getState().voices;
    for (let i = 0; i < 6; i++) api.play("brick_hit");
    assert.equal(api.getState().voices, before + 1, "冷却未生效，出现叠音");
    assert.ok(api.getState().drops.brick_hit >= 5, "未记录被合并的重复触发");
  });

  test("隔帧连打会正常出声（冷却只合并同帧，不吞掉后续命中）", () => {
    api.stopAll(); base.clock.advance(3000);
    const before = api.getState().voices;
    for (let i = 0; i < 4; i++) { api.play("brick_hit"); base.clock.advance(90); }
    assert.equal(api.getState().voices, before + 4, "正常连打被误吞");
  });

  test("清屏升级整体只播一次：1.5 秒内重复请求被丢弃", () => {
    api.stopAll(); base.clock.advance(3000);
    api.play("clear");
    const dropsBefore = api.getState().drops.clear_upgrade || 0;
    api.play("clear");
    assert.ok((api.getState().drops.clear_upgrade || 0) > dropsBefore, "清屏音未被去重");
    assert.equal(api.getState().voices, 1, "清屏音叠了两层");
  });

  console.log("\n【D】无音效：只关自己，可立即恢复");
  test("分别关闭四类，只有被关的那一类静音", () => {
    for (const id of ["brick_hit", "brick_break", "clear_upgrade", "fail"]) {
      api.setMuted(id, true);
      const state = api.getState();
      for (const other of ["brick_hit", "brick_break", "clear_upgrade", "fail"]) {
        assert.equal(state.muted[other], other === id, other + " 的静音状态被误改");
      }
      api.setMuted(id, false);
    }
  });

  test("关闭后音频节点不再增加，恢复后立刻继续播放", () => {
    api.stopAll(); base.clock.advance(3000);
    api.setMuted("fail", true);
    const mutedVoices = api.getState().voices;
    api.play("fail");
    assert.equal(api.getState().voices, mutedVoices, "静音状态下仍创建了音频节点");
    api.setMuted("fail", false);
    base.clock.advance(2000);
    api.play("fail");
    assert.equal(api.getState().voices, mutedVoices + 1, "恢复后没有立即生效");
  });

  test("静音状态不会让 play 返回 false（防止回退到旧合成音）", () => {
    api.setMuted("clear_upgrade", true);
    assert.equal(api.play("clear"), true);
    api.setMuted("clear_upgrade", false);
  });

  console.log("\n【E】配置：切换、持久化、JSON 导出");
  test("切换砖甲受击候选立即生效", () => {
    api.setVariant("brick_hit", "v5-wood-thud");
    assert.equal(api.getState().selected.brick_hit, "v5-wood-thud");
    api.setVariant("brick_hit", "v5-wood-light");
    assert.equal(api.getState().selected.brick_hit, "v5-wood-light");
  });

  test("非法候选被拒绝，不会污染状态", () => {
    assert.equal(api.setVariant("brick_hit", "break-x11"), false);
    assert.equal(api.setVariant("brick_hit", "none-x"), false);
    assert.equal(api.getState().selected.brick_hit, "v5-wood-light");
  });

  test("选「无音效」等价于静音，且导出 selectedId=none", () => {
    api.setVariant("brick_break", "none");
    const state = api.getState();
    assert.equal(state.muted.brick_break, true);
    const item = api.exportConfig().items.find((x) => x.event === "brick_break");
    assert.equal(item.selectedId, "none");
    assert.equal(item.muted, true);
    assert.equal(item.label, "无音效");
    assert.equal(item.file, null);
    api.setVariant("brick_break", "break-x11");
  });

  test("导出 JSON 只含四类事件，字段完整", () => {
    const config = api.exportConfig();
    assert.equal(config.version, "pinball-audio-qa-v2.1");
    assert.equal(config.items.length, 4);
    for (const item of config.items) {
      for (const key of ["event", "name", "selectedId", "label", "muted", "file", "candidateIds", "groupVolume"]) {
        assert.ok(key in item, item.event + " 缺少字段 " + key);
      }
      assert.ok(!["mg", "boom", "shock", "skill_select", "upgrade", "clear", "hit", "armor"].includes(item.event));
    }
    assert.deepEqual(plain(config.items.map((x) => x.event)), ["brick_hit", "brick_break", "clear_upgrade", "fail"]);
  });

  test("每类音量独立调整不影响其他类", () => {
    api.setGroupVolume("brick_hit", .5);
    api.setGroupVolume("fail", 1.3);
    const state = api.getState();
    assert.equal(state.volumes.brick_hit, .5);
    assert.equal(state.volumes.fail, 1.3);
    assert.equal(state.volumes.brick_break, 1);
    assert.equal(state.volumes.clear_upgrade, 1);
  });

  test("刷新页面后保留候选、无音效与音量（重新加载模块）", async () => {
    api.setVariant("brick_hit", "v5-wood-thud");
    api.setMuted("fail", true);
    api.setGroupVolume("clear_upgrade", .8);
    const saved = Object.fromEntries(base.storage);
    const reloaded = makeHarness(saved);
    reloaded.api.prime();
    await flush();
    const state = reloaded.api.getState();
    assert.equal(state.selected.brick_hit, "v5-wood-thud", "候选未保留");
    assert.equal(state.muted.fail, true, "无音效未保留");
    assert.equal(state.muted.brick_hit, false);
    assert.equal(state.volumes.clear_upgrade, .8, "音量未保留");
    const item = reloaded.api.exportConfig().items.find((x) => x.event === "fail");
    assert.equal(item.selectedId, "none");
  });

  console.log("\n【C】互斥：源码级断言，砖甲受击与击破不可能同时触发");
  const gameSrc = read("game.js");

  test("hitBrick：砖块存活时先播砖甲受击并 return false", () => {
    const i = gameSrc.indexOf('playSfx("armor")');
    const segment = gameSrc.slice(Math.max(0, i - 260), i + 40);
    assert.ok(/if\(b\.hp>0\)/.test(segment), "缺少 hp>0 分支判断");
    assert.ok(/return false/.test(segment), "存活分支必须 return false，阻止继续走到击破");
  });

  test("hitBrick：击破音在被摧毁路径上，且只有一处", () => {
    const occurrences = gameSrc.match(/playSfx\("break"\)/g) || [];
    assert.equal(occurrences.length, 1, "击破音触发次数应为 1，实际 " + occurrences.length);
  });

  test("直击回调：只在未被摧毁且非装甲时补播砖甲受击（防止双声）", () => {
    assert.ok(/if\(!destroyed&&!block\.armored\)playSfx\("hit"\)/.test(gameSrc), "直击互斥守卫被改动");
  });

  test("超载冲锋碰撞不再叠加砖甲受击音（撞墙不等于砖甲受击）", () => {
    const i = gameSrc.indexOf("function recordGiantBounce");
    const body = gameSrc.slice(i, i + 420);
    assert.ok(!/playSfx/.test(body), "recordGiantBounce 仍在播音效，会造成同一次碰撞双声");
  });

  console.log("\n【B2】清屏升级合并：只在清屏节点播一次");
  test("清屏音恰好两处：波次清屏 + 20波完成，且都播放同一个事件", () => {
    const occurrences = gameSrc.match(/playSfx\("clear"\)/g) || [];
    assert.equal(occurrences.length, 2, "清屏音触发次数异常：" + occurrences.length);
  });

  test("升级提示与技能选择音已彻底移除", () => {
    assert.equal((gameSrc.match(/playSfx\("upgrade"\)/g) || []).length, 0);
    assert.equal((gameSrc.match(/playSfx\("skill_select"\)/g) || []).length, 0);
  });

  console.log("\n【B3】失败：只触发一次");
  test("触线失败音只有一处，且在 phase=lost 之后", () => {
    const occurrences = gameSrc.match(/playSfx\("fail"\)/g) || [];
    assert.equal(occurrences.length, 1);
    const i = gameSrc.indexOf('playSfx("fail")');
    const before = gameSrc.slice(Math.max(0, i - 400), i);
    assert.ok(/phase="lost"/.test(before), "失败音不在丢命分支内");
  });

  console.log("\n【F】静态边界：旧分组、外部 CDN、本地上传都不得回流");
  const html = read("index.html");
  const pack = read("sound-pack.js");
  const studio = read("qa-studio.js");

  test("index.html 不再加载旧候选目录与旧选择层", () => {
    assert.ok(!html.includes("sound-choice-layer.js"));
    assert.ok(!html.includes("assets/sfx/v4/catalog.js"));
    assert.ok(!html.includes("assets/sfx/v5/more-catalog.js"));
    assert.ok(!html.includes("extra-catalog.js"));
    assert.ok(!html.includes('id="aq-legacy"'), "旧全局 A/B 仍在页面里");
    assert.ok(!html.includes("aq-mode"));
  });

  test("index.html 使用新的版本参数，避免浏览器缓存旧文件", () => {
    assert.ok(html.includes("sound-pack.js?v=v21a"));
    assert.ok(html.includes("game.js?v=v21a"));
    assert.ok(html.includes("qa-studio.js?v=v21a"));
    assert.ok(html.includes("qa-studio.css?v=v21a"));
    assert.ok(!html.includes("audioqa2"));
    assert.ok(!html.includes("bossdiag3"));
  });

  test("音效引擎里没有任何外部 URL（断网可用）", () => {
    assert.ok(!/https?:\/\//.test(pack), "sound-pack.js 仍引用外部地址");
    assert.ok(!/https?:\/\//.test(studio), "qa-studio.js 仍引用外部地址");
  });

  test("调试台不再提供本地上传与候选浏览", () => {
    assert.ok(!studio.includes("setUploaded"));
    assert.ok(!studio.includes('type = "file"'));
    assert.ok(!pack.includes("uploaded"));
  });

  test("调试台为四类事件都提供「无音效」选项", () => {
    assert.ok(studio.includes("noneOpt"), "缺少无音效选项");
    assert.ok(studio.includes("无音效"));
    assert.ok(studio.includes("api.NONE_ID"));
  });

  test("保留 A/B 对照，且只给仍有候选的事件（砖甲受击）", () => {
    assert.ok(/if\s*\(!info\.fixed\)/.test(studio), "A/B 未按候选数量开关");
    assert.ok(studio.includes("previewLegacy"));
    assert.ok(pack.includes("function previewLegacy"));
  });

  test("保留第10关诊断与恢复入口", () => {
    for (const hook of ["startBoss10", "continueUpgrade", "resumePaused", "exportDiagnostics"]) {
      assert.ok(studio.includes(hook), "缺少 " + hook);
    }
  });

  test("V2 旧目录仍然存在，未被覆盖", () => {
    const v2 = path.resolve(ROOT, "..", "audio-qa-v2", "index.html");
    assert.ok(fs.existsSync(v2), "V2 目录被破坏");
    const src = fs.readFileSync(v2, "utf8");
    assert.ok(src.includes("音效重选 · 实战调试 V2"), "V2 页面内容被改写");
    assert.ok(src.includes("sound-choice-layer.js"), "V2 依赖的选择层被删除");
  });

  const total = pass + failures.length;
  console.log("\n" + "─".repeat(64));
  console.log("通过 " + pass + " / " + total + (failures.length ? "，失败 " + failures.length : "，全部通过"));
  if (failures.length) {
    for (const f of failures) console.log("  ✗ " + f.name + "\n    " + f.error.stack.split("\n")[0]);
    process.exit(1);
  }
})();
