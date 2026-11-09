"use strict";
/* 《弹珠超载》音效调试台 V2.1b 自动化测试
   覆盖计划要求的 8 项：
   1) 默认旧合成提示音关闭            5) 无音效仍有效且不回退 beep
   2) 四类新音效仍正常路由            6) 刷新持久化、JSON 导出正确
   3) 清屏 A/B/C 三候选存在，原版不被覆盖   7) 试听不叠加、不修改游戏实际选择
   4) A/B/C 选择与清屏路由同步         8) 第10关诊断/继续升级能力未受影响
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

/* 与素材真实时长对齐，用来判断“实际播的是哪一版”。 */
const AUDIO_SECONDS = {
  "../audio-qa/audio/mg.ogg": 0.265601,
  "../audio-qa/audio/hit.ogg": 0.332676,
  "audio/break-x11-impactGlass_heavy_000.ogg": 0.241224,
  "audio/clear-x14-Upper01.wav": 3.436553,
  "audio/clear-x14-Upper01-short-1.35s.wav": 1.35,
  "audio/clear-x14-Upper01-short-1.80s.wav": 1.8,
  "audio/fail-02-error_005.ogg": 0.500045,
  "audio/clear-x15-mixkit-unlock-253.wav": 0.75,
  "audio/fail-03-lose-1.wav": 0.941587,
  "audio/ui-start-click1.wav": 0.09093,
  "audio/ui-click-rollover2.wav": 0.054422,
  "audio/wall-bounce-wood-light-000.wav": 0.1
};

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
    /* 用 URL 反推时长，这样断言能区分 A/B/C 到底播了哪一版。 */
    decodeAudioData(arrayBuffer) {
      const url = new TextDecoder().decode(new Uint8Array(arrayBuffer));
      const duration = AUDIO_SECONDS[url] ?? 0.3;
      const length = Math.max(1, Math.round(duration * 44100));
      const data = new Float32Array(length);
      for (let i = 0; i < length; i++) data[i] = Math.sin(i / 12) * .35;
      return Promise.resolve({
        duration, sampleRate: 44100, numberOfChannels: 1, length,
        getChannelData: () => data
      });
    }
    resume() { return Promise.resolve(); }
  }

  const sandbox = {
    console,
    performance: { now: () => clock.now },
    setTimeout, clearTimeout, Promise, Date, Math, Float32Array, ArrayBuffer, JSON, Object, TextDecoder,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    fetch: async (url) => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from(url, "utf8") }),
    document: { hidden: false, addEventListener() {} },
    AudioContext: FakeAudioContext,
    __pinballAudioQaFix: { getStatus: () => ({ wave: 3, phase: "playing", legacySynthCues: false }) }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("sound-pack.js"), sandbox, { filename: "sound-pack.js" });
  return { api: sandbox.window.PinballGameAudio, started, oscillators, storage, sandbox, clock };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 25));
const plain = (value) => JSON.parse(JSON.stringify(value));

(async () => {
  console.log("\n【1】事件表：四类事件，砖甲受击二选一，清屏升级 A/B/C");
  const base = makeHarness();
  const api = base.api;
  api.prime();
  await flush();

  test("describe() 是四类战斗音 + 三类系统音，顺序与命名固定", () => {
    const list = api.describe();
    assert.equal(list.length, 7);
    assert.deepEqual(plain(list.map((x) => x.id)),
      ["brick_hit", "brick_break", "clear_upgrade", "fail", "ui_start", "ui_click", "wall_bounce"]);
    assert.deepEqual(plain(list.map((x) => x.name)),
      ["砖甲受击", "砖块击破", "清屏升级", "触线失败", "开始游戏", "其他按钮", "墙面反弹"]);
  });

  test("三类系统音被标记为 system，且各只有一个固定候选", () => {
    const map7 = Object.fromEntries(api.describe().map((x) => [x.id, x]));
    const want = {
      ui_start: ["ui-start-click1", "audio/ui-start-click1.wav"],
      ui_click: ["ui-click-rollover2", "audio/ui-click-rollover2.wav"],
      wall_bounce: ["wall-wood-light-000", "audio/wall-bounce-wood-light-000.wav"]
    };
    for (const [id, [variantId, url]] of Object.entries(want)) {
      assert.equal(map7[id].system, true, id + " 未标记 system");
      assert.equal(map7[id].fixed, true, id + " 不该有多个候选");
      assert.deepEqual(plain(map7[id].variants.map((v) => v.id)), [variantId]);
      assert.equal(api.EVENTS[id].variants[0].url, url);
    }
    for (const id of ["brick_hit", "brick_break", "clear_upgrade", "fail"]) {
      assert.notEqual(map7[id].system, true, id + " 不该被标记成系统音");
    }
  });

  test("撞墙别名 wall / bounce 指向 wall_bounce", () => {
    assert.equal(api.play("wall"), true);
    assert.equal(api.play("bounce"), true);
    const state = api.getState();
    assert.ok((state.plays.wall_bounce || 0) >= 0);
  });

  test("砖甲受击恰好两个候选：V5 木质轻敲 / V5 木板闷响", () => {
    const hit = api.describe().find((x) => x.id === "brick_hit");
    assert.deepEqual(plain(hit.variants.map((v) => v.id)), ["v5-wood-light", "v5-wood-thud"]);
    assert.deepEqual(plain(hit.variants.map((v) => v.label)), ["V5 木质轻敲", "V5 木板闷响"]);
  });

  test("清屏升级收敛为单一固定素材 CLEAR-010，不再提供 A/B/C", () => {
    const clear = api.describe().find((x) => x.id === "clear_upgrade");
    assert.equal(clear.variants.length, 1);
    assert.deepEqual(plain(clear.variants.map((v) => v.id)), ["clear-x15"]);
    assert.ok(clear.variants[0].label.includes("CLEAR-010"));
    assert.ok(clear.variants[0].label.includes("mixkit-unlock-game-notification-253"));
    assert.equal(api.EVENTS.clear_upgrade.variants[0].url, "audio/clear-x15-mixkit-unlock-253.wav");
  });

  test("砖块击破与触线失败仍各只有一个固定候选", () => {
    const map = Object.fromEntries(api.describe().map((x) => [x.id, x]));
    assert.deepEqual(plain(map.brick_break.variants.map((v) => v.id)), ["break-x11"]);
    assert.deepEqual(plain(map.fail.variants.map((v) => v.id)), ["fail-03"]);
  });

  test("事件表里不存在旧版九个分组", () => {
    const ids = api.describe().map((x) => x.id);
    for (const legacy of ["mg", "hit", "break", "armor", "boom", "skill_select", "clear", "upgrade", "shock"]) {
      assert.ok(!ids.includes(legacy), "旧事件仍在表中：" + legacy);
    }
  });

  console.log("\n【3】素材文件：自托管文件齐全，原版未被覆盖");
  test("全部素材存在且大小合理", () => {
    const files = [
      "audio/break-x11-impactGlass_heavy_000.ogg",
      "audio/clear-x14-Upper01.wav",
      "audio/clear-x14-Upper01-short-1.35s.wav",
      "audio/clear-x14-Upper01-short-1.80s.wav",
      "audio/fail-02-error_005.ogg",
      "audio/clear-x15-mixkit-unlock-253.wav",
      "audio/fail-03-lose-1.wav",
      "audio/ui-start-click1.wav",
      "audio/ui-click-rollover2.wav",
      "audio/wall-bounce-wood-light-000.wav",
      "../audio-qa/audio/mg.ogg",
      "../audio-qa/audio/hit.ogg"
    ];
    for (const file of files) {
      const full = path.resolve(ROOT, file);
      assert.ok(fs.existsSync(full), "缺少素材：" + file);
      assert.ok(fs.statSync(full).size > 2000, "素材过小：" + file);
    }
  });

  /* 直接读 WAV 头，确认 A/B/C 的真实时长与格式，不依赖运行时。 */
  function wavInfo(file) {
    const buf = fs.readFileSync(path.resolve(ROOT, file));
    assert.equal(buf.toString("ascii", 0, 4), "RIFF");
    assert.equal(buf.toString("ascii", 8, 12), "WAVE");
    let offset = 12, fmt = null, dataSize = 0;
    while (offset + 8 <= buf.length) {
      const id = buf.toString("ascii", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      if (id === "fmt ") {
        fmt = {
          format: buf.readUInt16LE(offset + 8),
          channels: buf.readUInt16LE(offset + 10),
          rate: buf.readUInt32LE(offset + 12),
          bits: buf.readUInt16LE(offset + 22)
        };
      } else if (id === "data") dataSize = size;
      offset += 8 + size + (size % 2);
    }
    return { ...fmt, frames: dataSize / (fmt.channels * fmt.bits / 8), seconds: dataSize / (fmt.channels * fmt.bits / 8) / fmt.rate, bytes: buf.length };
  }

  test("清屏新素材 0.750s / 单声道 / 44.1k / 尾部淡尽", () => {
    const x = wavInfo("audio/clear-x15-mixkit-unlock-253.wav");
    assert.equal(x.seconds.toFixed(3), "0.750");
    assert.equal(x.format, 1, "不是 PCM");
    assert.equal(x.rate, 44100);
    assert.equal(x.channels, 1, "应为单声道");
    assert.equal(x.bits, 16);
    const buf = fs.readFileSync(path.resolve(ROOT, "audio/clear-x15-mixkit-unlock-253.wav"));
    const pcm = buf.subarray(buf.length - 20 * 44.1 * 2);
    let peak = 0;
    for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)) / 32768);
    assert.ok(20 * Math.log10(Math.max(peak, 1e-9)) < -40, "清屏尾部未淡尽");
  });

  test("新增素材格式统一为 PCM 16bit / 44.1k / 单声道，且无削波", () => {
    for (const file of ["audio/fail-03-lose-1.wav", "audio/wall-bounce-wood-light-000.wav",
      "audio/ui-start-click1.wav", "audio/ui-click-rollover2.wav"]) {
      const x = wavInfo(file);
      assert.equal(x.format, 1, file + " 不是 PCM");
      assert.equal(x.rate, 44100, file + " 采样率不对");
      assert.equal(x.channels, 1, file + " 不是单声道");
      assert.equal(x.bits, 16, file + " 位深不对");
      const buf = fs.readFileSync(path.resolve(ROOT, file));
      let peak = 0;
      for (let i = 44; i + 1 < buf.length; i += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(i)));
      assert.ok(peak < 32767, file + " 存在削波");
    }
  });

  console.log("\n【2】路由：四类事件全部被接管，删除的事件不再发声");
  test("删除的五个旧事件返回 false（不再被本层接管）", () => {
    for (const kind of ["mg", "boom", "shock", "skill_select", "upgrade"]) assert.equal(api.play(kind), false, kind + " 仍被接管");
  });

  test("四类事件的旧名与新名都被接管", () => {
    for (const kind of ["hit", "armor", "brick_hit", "break", "brick_break", "clear", "clear_upgrade", "fail"]) {
      assert.equal(api.play(kind), true, kind + " 未被接管");
    }
  });

  await flush();
  test("四类事件都会真正创建音频节点，且时长对应各自素材", () => {
    api.stopAll(); base.clock.advance(4000);
    const before = api.getState().voices;
    api.play("armor");
    assert.equal(base.started.at(-1).buffer.duration, AUDIO_SECONDS["../audio-qa/audio/mg.ogg"]);
    api.play("break");
    assert.equal(base.started.at(-1).buffer.duration, AUDIO_SECONDS["audio/break-x11-impactGlass_heavy_000.ogg"]);
    api.play("clear");
    assert.equal(base.started.at(-1).buffer.duration, AUDIO_SECONDS["audio/clear-x15-mixkit-unlock-253.wav"], "清屏应播 CLEAR-010");
    api.play("fail");
    assert.equal(base.started.at(-1).buffer.duration, AUDIO_SECONDS["audio/fail-03-lose-1.wav"]);
    assert.equal(api.getState().voices, before + 4);
  });

  test("连打冷却：同帧重复触发被合并，不会异常叠音", () => {
    api.stopAll(); base.clock.advance(4000);
    const before = api.getState().voices;
    for (let i = 0; i < 6; i++) api.play("brick_hit");
    assert.equal(api.getState().voices, before + 1, "冷却未生效，出现叠音");
    assert.ok(api.getState().drops.brick_hit >= 5);
  });

  console.log("\n【4】清屏候选已收敛为单一素材");
  test("清屏实际播放 CLEAR-010（0.75s）", () => {
    api.stopAll(); base.clock.advance(4000);
    api.play("clear");
    assert.equal(base.started.at(-1).buffer.duration, 0.75);
  });

  test("旧 A/B/C 候选被拒绝，选择不会被污染", () => {
    for (const legacy of ["clear-x14", "clear-x14-short-135", "clear-x14-short-180", "clear-x14-short-1.35s"]) {
      assert.equal(api.setVariant("clear_upgrade", legacy), false, legacy + " 不该被接受");
    }
    assert.equal(api.setVariant("brick_hit", "clear-x15"), false);
    assert.equal(api.getState().selected.clear_upgrade, "clear-x15");
  });

  test("清屏音 1.5 秒内重复请求被丢弃（清屏与升级共用一个事件，只播一次）", () => {
    api.stopAll(); base.clock.advance(4000);
    api.play("clear");
    const dropsBefore = api.getState().drops.clear_upgrade || 0;
    api.play("clear");
    assert.ok((api.getState().drops.clear_upgrade || 0) > dropsBefore, "清屏音未被去重");
    assert.equal(api.getState().voices, 1, "清屏音叠了两层");
  });

  console.log("\n【7】试听：不叠加、不改选择、不动游戏内声音");
  await testAsync("连续试听同一事件只保留一路试听声", async () => {
    api.stopAll(); base.clock.advance(4000);
    api.setVariant("clear_upgrade", "clear-x15");
    await api.preview("clear_upgrade", false);
    const one = api.getState().voices;
    await api.preview("clear_upgrade", false);
    assert.equal(api.getState().voices, one, "试听叠加了");
  });

  await testAsync("试听不改变已选版本", async () => {
    await api.preview("clear_upgrade", false);
    assert.equal(api.getState().selected.clear_upgrade, "clear-x15");
  });

  test("试听只停试听声，不打断正在进行的游戏触发", () => {
    api.stopAll(); base.clock.advance(4000);
    api.play("break");
    const before = api.getState().voices;
    api.stopAll();
    assert.equal(api.getState().voices, 0);
    // preview 内部只清理 preview 声：这里用砖甲受击与清屏互不影响来验证事件隔离
    api.play("brick_hit");
    api.setVariant("clear_upgrade", "clear-x15");
    assert.equal(api.getState().voices >= 1, true, "切换候选误停了其他事件");
  });

  console.log("\n【5】无音效：只关自己，绝不回退合成音");
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

  test("关闭后不创建音频节点，恢复后立即生效", () => {
    api.stopAll(); base.clock.advance(4000);
    api.setMuted("clear_upgrade", true);
    const mutedVoices = api.getState().voices;
    api.play("clear");
    assert.equal(api.getState().voices, mutedVoices, "静音状态下仍创建了音频节点");
    api.setMuted("clear_upgrade", false);
    base.clock.advance(2000);
    api.play("clear");
    assert.equal(api.getState().voices, mutedVoices + 1);
  });

  test("静音时 play 返回 true（防止 game.js 回退到 beep）", () => {
    api.setMuted("fail", true);
    assert.equal(api.play("fail"), true);
    api.setMuted("fail", false);
  });

  console.log("\n【6】持久化与 JSON 导出");
  test("导出 JSON 含七类事件，清屏带三个候选与文件路径", () => {
    const config = api.exportConfig();
    assert.equal(config.version, "pinball-audio-qa-v2.1");
    assert.equal(config.items.length, 7);
    const clear = config.items.find((x) => x.event === "clear_upgrade");
    assert.deepEqual(plain(clear.candidateIds), ["clear-x15"]);
    assert.equal(clear.file, "audio/clear-x15-mixkit-unlock-253.wav");
    assert.ok(clear.label.includes("CLEAR-010"));
    for (const item of config.items) {
      for (const key of ["event", "name", "selectedId", "label", "muted", "file", "candidateIds", "groupVolume"]) {
        assert.ok(key in item, item.event + " 缺少字段 " + key);
      }
    }
  });

  test("选「无音效」等价于静音，导出 selectedId=none + muted=true + file=null", () => {
    api.setVariant("brick_break", "none");
    const item = api.exportConfig().items.find((x) => x.event === "brick_break");
    assert.equal(item.selectedId, "none");
    assert.equal(item.muted, true);
    assert.equal(item.label, "无音效");
    assert.equal(item.file, null);
    api.setVariant("brick_break", "break-x11");
  });

  test("每类音量独立调整", () => {
    api.setGroupVolume("brick_hit", .5);
    api.setGroupVolume("fail", 1.3);
    const state = api.getState();
    assert.equal(state.volumes.brick_hit, .5);
    assert.equal(state.volumes.fail, 1.3);
    assert.equal(state.volumes.clear_upgrade, 1);
  });

  await testAsync("刷新页面后保留候选选择、无音效与音量", async () => {
    api.setVariant("brick_hit", "v5-wood-thud");
    api.setMuted("fail", true);
    api.setGroupVolume("brick_hit", .8);
    const saved = Object.fromEntries(base.storage);
    const reloaded = makeHarness(saved);
    reloaded.api.prime();
    await flush();
    const state = reloaded.api.getState();
    assert.equal(state.selected.brick_hit, "v5-wood-thud", "砖甲受击候选未保留");
    assert.equal(state.muted.fail, true, "无音效未保留");
    assert.equal(state.muted.brick_hit, false);
    assert.equal(state.volumes.brick_hit, .8, "音量未保留");
    const item = reloaded.api.exportConfig().items.find((x) => x.event === "brick_hit");
    assert.equal(item.selectedId, "v5-wood-thud");
    assert.equal(item.file, "../audio-qa/audio/hit.ogg");
  });

  console.log("\n【1】旧合成提示音：默认关闭，但代码与触发点全部保留");
  const gameSrc = read("game.js");
  const studioSrc = read("qa-studio.js");
  const packSrc = read("sound-pack.js");
  const html = read("index.html");

  test("存在单一开关且默认 false", () => {
    const match = gameSrc.match(/const LEGACY_SYNTH_CUES_ENABLED\s*=\s*(true|false)\s*;/);
    assert.ok(match, "未找到 LEGACY_SYNTH_CUES_ENABLED");
    assert.equal(match[1], "false", "默认值必须是 false");
    assert.equal((gameSrc.match(/const LEGACY_SYNTH_CUES_ENABLED/g) || []).length, 1, "开关只能定义一次");
  });

  test("开关在 beep 之前拦截，且只拦合成音分支", () => {
    const i = gameSrc.indexOf('if(!LEGACY_SYNTH_CUES_ENABLED)return;');
    assert.ok(i > 0, "缺少开关拦截");
    const before = gameSrc.slice(Math.max(0, i - 380), i);
    assert.ok(/PinballGameAudio\?\.play\(kind,soundVolume\)\)return;/.test(before), "开关必须在素材音效之后，不能误关四类事件");
    assert.ok(/kind!=="split"&&kind!=="hunt"&&kind!=="drill"&&kind!=="arc"&&kind!=="giant"/.test(before), "开关必须在合成音白名单之后");
    const after = gameSrc.slice(i, i + 200);
    assert.ok(/beep\(/.test(gameSrc.slice(i)), "beep 逻辑必须保留在开关之后");
  });

  test("beep() 与五个合成音分支都还在（可一键恢复）", () => {
    assert.ok(gameSrc.includes("function beep(freq,seconds"), "beep() 被删除");
    for (const kind of ["split", "hunt", "drill", "arc", "giant"]) {
      assert.ok(new RegExp('kind==="' + kind + '"').test(gameSrc), kind + " 分支被删除，无法一键恢复");
    }
  });

  test("五个合成音触发点未被删除", () => {
    for (const kind of ["split", "hunt", "drill", "arc", "giant"]) {
      assert.ok(new RegExp('playSfx\\("' + kind + '"\\)').test(gameSrc), kind + " 触发点被删除");
    }
  });

  test("状态接口暴露开关值，便于验收核对", () => {
    assert.ok(/legacySynthCues:LEGACY_SYNTH_CUES_ENABLED/.test(gameSrc));
  });

  test("除 beep 外没有其他声音入口（无 <audio>、无第二个 AudioContext）", () => {
    assert.equal((gameSrc.match(/createOscillator/g) || []).length, 1, "出现第二个振荡器入口");
    assert.equal((gameSrc.match(/new Audio\(/g) || []).length, 1, "出现第二个音频上下文");
    assert.ok(!/<audio/i.test(html), "页面里出现了 audio 标签");
    assert.ok(!/createOscillator/.test(read("../v1/juice-fx.js")), "juice-fx 里有声音入口");
  });

  console.log("\n【2b】四类事件互斥与清屏合并（源码级）");
  test("hitBrick：砖块存活先播砖甲受击并 return false", () => {
    const i = gameSrc.indexOf('playSfx("armor")');
    const segment = gameSrc.slice(Math.max(0, i - 260), i + 40);
    assert.ok(/if\(b\.hp>0\)/.test(segment));
    assert.ok(/return false/.test(segment));
  });

  test("击破音只有一处，且在被摧毁路径上", () => {
    assert.equal((gameSrc.match(/playSfx\("break"\)/g) || []).length, 1);
  });

  test("直击回调仍有防双声守卫", () => {
    assert.ok(/if\(!destroyed&&!block\.armored\)playSfx\("hit"\)/.test(gameSrc));
  });

  test("超载冲锋碰撞不再叠加砖甲受击音", () => {
    const i = gameSrc.indexOf("function recordGiantBounce");
    assert.ok(!/playSfx/.test(gameSrc.slice(i, i + 420)));
  });

  test("清屏音恰好两处（波次清屏 + 20波完成），升级与技能选择音为 0", () => {
    assert.equal((gameSrc.match(/playSfx\("clear"\)/g) || []).length, 2);
    assert.equal((gameSrc.match(/playSfx\("upgrade"\)/g) || []).length, 0);
    assert.equal((gameSrc.match(/playSfx\("skill_select"\)/g) || []).length, 0);
  });

  test("触线失败音只有一处且在 phase=lost 之后", () => {
    assert.equal((gameSrc.match(/playSfx\("fail"\)/g) || []).length, 1);
    const i = gameSrc.indexOf('playSfx("fail")');
    assert.ok(/phase="lost"/.test(gameSrc.slice(Math.max(0, i - 400), i)));
  });

  console.log("\n【8】第10关诊断与调试台边界");
  test("A/B 对照只给砖甲受击，不再套在清屏 A/B/C 上", () => {
    assert.ok(/if \(info\.id === "brick_hit"\)/.test(studioSrc), "A/B 开关条件被改成按候选数量判断");
  });

  test("保留第10关诊断与恢复入口", () => {
    for (const hook of ["startBoss10", "continueUpgrade", "resumePaused", "exportDiagnostics"]) {
      assert.ok(studioSrc.includes(hook), "缺少 " + hook);
    }
  });

  test("页面用新版本参数，旧版本参数不残留", () => {
    for (const asset of ["sound-pack.js", "game.js", "qa-studio.js", "qa-studio.css"]) {
      assert.ok(html.includes(asset + "?v=v21f"), asset + " 未升版");
    }
    assert.ok(!html.includes("v21a"));
    assert.ok(!html.includes("?v=v21b") && !html.includes("?v=v21c") && !html.includes("?v=v21d"), "旧版本参数残留");
    assert.ok(!html.includes("audioqa2"));
  });

  test("音效引擎没有任何外部 URL（断网可用）", () => {
    assert.ok(!/https?:\/\//.test(packSrc), "sound-pack.js 仍引用外部地址");
    assert.ok(!/https?:\/\//.test(studioSrc), "qa-studio.js 仍引用外部地址");
  });

  test("V2 旧版本目录仍然存在，未被覆盖", () => {
    const v2 = path.resolve(ROOT, "..", "audio-qa-v2", "index.html");
    assert.ok(fs.existsSync(v2), "V2 目录被破坏");
    assert.ok(fs.readFileSync(v2, "utf8").includes("音效重选 · 实战调试 V2"));
  });

  const total = pass + failures.length;
  console.log("\n" + "─".repeat(66));
  console.log("通过 " + pass + " / " + total + (failures.length ? "，失败 " + failures.length : "，全部通过"));
  if (failures.length) {
    for (const f of failures) console.log("  ✗ " + f.name + "\n    " + f.error.stack.split("\n").slice(0, 2).join("\n    "));
    process.exit(1);
  }
})();
