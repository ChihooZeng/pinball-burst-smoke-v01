/* 《弹珠超载》音效调试台 V2.1 —— 四类事件控制台
   只呈现砖甲受击 / 砖块击破 / 清屏升级 / 触线失败。
   旧版 9 个独立分组（机枪、普通命中、击碎、装甲命中、爆雷、技能选择、升级提示…）不再提供选择器。 */
(() => {
"use strict";
const api = window.PinballGameAudio;
const root = document.getElementById("aq-rows");
const status = document.getElementById("aq-state");
if (!api || !root) { if (status) status.textContent = "音效台初始化失败：缺少音效引擎脚本"; return; }

const message = document.getElementById("aq-action-status");
const flow = document.getElementById("aq-flow");
const live = document.getElementById("aq-live");
const blocks = new Map();

function note(text) { if (message) message.textContent = text; }

function syncCard(eventId) {
  const ui = blocks.get(eventId);
  if (!ui) return;
  const state = api.getState();
  const muted = !!state.muted[eventId];
  const selected = state.selected[eventId];
  ui.mute.checked = muted;
  ui.select.value = muted ? api.NONE_ID : selected;
  ui.card.classList.toggle("is-muted", muted);
  ui.tag.textContent = muted ? "无音效" : (ui.variantCount === 1 ? "固定素材" : ui.variantCount + " 候选 · 选一");
  ui.tag.classList.toggle("is-muted", muted);
  ui.select.disabled = false;
  ui.volume.value = String(Math.round((state.volumes[eventId] ?? 1) * 100));
  ui.percent.textContent = Math.round((state.volumes[eventId] ?? 1) * 100) + "%";
  if (ui.abGroup) ui.abGroup.hidden = muted;
}

function applyChoice(eventId, value) {
  if (!api.setVariant(eventId, value)) { note("切换失败：未知音效选项"); return; }
  const info = api.describe().find(x => x.id === eventId);
  const variant = info && info.variants.find(v => v.id === value);
  note(value === api.NONE_ID
    ? info.name + " 已关闭：只关闭这一路，其他三类不受影响。刷新后保留。"
    : info.name + " 已切换为「" + variant.label + "」，后续游戏事件立即采用。");
  syncCard(eventId);
  renderLive();
}

for (const info of api.describe()) {
  const card = document.createElement("section");
  card.className = "aq-pick";
  card.dataset.event = info.id;

  const head = document.createElement("div");
  head.className = "aq-pick-head";
  const titleWrap = document.createElement("div");
  titleWrap.className = "aq-pick-title";
  const title = document.createElement("strong");
  title.textContent = info.name;
  const hint = document.createElement("small");
  hint.textContent = info.hint;
  titleWrap.append(title, hint);
  const tag = document.createElement("span");
  tag.className = "aq-tag";
  head.append(titleWrap, tag);

  const muteRow = document.createElement("label");
  muteRow.className = "aq-mute";
  const mute = document.createElement("input");
  mute.type = "checkbox";
  const muteText = document.createElement("span");
  muteText.textContent = "无音效";
  muteRow.append(mute, muteText);

  const select = document.createElement("select");
  select.className = "aq-select";
  select.setAttribute("aria-label", info.name + " 音效选择");
  for (const variant of info.variants) {
    const opt = document.createElement("option");
    opt.value = variant.id;
    opt.textContent = variant.label;
    select.appendChild(opt);
  }
  const noneOpt = document.createElement("option");
  noneOpt.value = api.NONE_ID;
  noneOpt.textContent = "无音效（只关闭这一路）";
  select.appendChild(noneOpt);

  const detail = document.createElement("p");
  detail.className = "aq-detail";
  detail.textContent = info.variants.length === 1
    ? info.variants[0].label + " · " + info.variants[0].detail + " · 不提供其他候选"
    : info.variants.map(v => v.label).join(" / ") + " · 二选一 · 不提供其他候选";

  const actions = document.createElement("div");
  actions.className = "aq-pick-actions";
  const one = document.createElement("button");
  one.type = "button"; one.textContent = "▶ 单次试听";
  const repeat = document.createElement("button");
  repeat.type = "button"; repeat.textContent = "↻ 连播3秒";

  async function audition(loop, button) {
    button.disabled = true;
    note(info.name + "：正在试听");
    try {
      await api.preview(info.id, loop);
      note(info.name + "：试听已播放" + (loop ? "（3秒连播）" : "") + "。游戏内实际触发始终使用当前选中项。");
    } catch (error) {
      note(info.name + "：" + (error.message || error));
    } finally {
      button.disabled = false;
    }
  }
  one.addEventListener("click", () => audition(false, one));
  repeat.addEventListener("click", () => audition(true, repeat));
  actions.append(one, repeat);

  let abGroup = null;
  // A/B 只给仍有候选音效的事件（砖甲受击）：A = 原版合成音，B = 已选素材。
  if (info.id === "brick_hit") {
    abGroup = document.createElement("div");
    abGroup.className = "aq-ab";
    const legA = document.createElement("button");
    legA.type = "button"; legA.textContent = "A 原版合成音";
    const legB = document.createElement("button");
    legB.type = "button"; legB.textContent = "B 已选音效";
    legA.addEventListener("click", () => {
      if (!api.previewLegacy()) note("A 原版合成音：需要先点击页面任意位置开启音频");
      else note("A 原版合成音（旧 beep）：与 B 已选音效对比听感");
    });
    legB.addEventListener("click", () => audition(false, legB));
    abGroup.append(legA, legB);
  }

  const level = document.createElement("div");
  level.className = "aq-level";
  const levelLabel = document.createElement("small");
  levelLabel.textContent = "事件音量";
  const volume = document.createElement("input");
  volume.type = "range"; volume.min = "0"; volume.max = "150"; volume.step = "5";
  volume.setAttribute("aria-label", info.name + " 事件音量");
  const percent = document.createElement("span");
  percent.className = "aq-percent";
  volume.addEventListener("input", () => {
    api.setGroupVolume(info.id, Number(volume.value) / 100);
    percent.textContent = volume.value + "%";
  });
  level.append(levelLabel, volume, percent);

  select.addEventListener("change", () => applyChoice(info.id, select.value));
  mute.addEventListener("change", () => {
    api.setMuted(info.id, mute.checked);
    note(mute.checked
      ? info.name + " 已关闭（无音效）；其他三类照常播放。刷新后保留。"
      : info.name + " 已恢复：" + api.describe().find(x => x.id === info.id).variants.find(v => v.id === api.getState().selected[info.id]).label);
    syncCard(info.id);
    renderLive();
  });

  card.append(head, muteRow, select, detail, actions);
  if (abGroup) card.append(abGroup);
  card.append(level);
  root.appendChild(card);
  blocks.set(info.id, { card, tag, select, mute, volume, percent, abGroup, fixed: info.fixed, variantCount: info.variants.length });
  syncCard(info.id);
}

/* ===== 背景音乐（V2.1m）：不属于七类事件，单独一张卡 ===== */
if (api.BGM && typeof api.getBgmState === "function") {
  const card = document.createElement("section");
  card.className = "aq-pick";
  card.dataset.event = "bgm";

  const head = document.createElement("div");
  head.className = "aq-pick-head";
  const titleWrap = document.createElement("div");
  titleWrap.className = "aq-pick-title";
  const title = document.createElement("strong");
  title.textContent = api.BGM.name;
  const hint = document.createElement("small");
  hint.textContent = api.BGM.hint;
  titleWrap.append(title, hint);
  const tag = document.createElement("span");
  tag.className = "aq-tag";
  head.append(titleWrap, tag);

  const toggleRow = document.createElement("label");
  toggleRow.className = "aq-mute";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  const toggleText = document.createElement("span");
  toggleText.textContent = "开启背景音乐";
  toggleRow.append(toggle, toggleText);

  const detail = document.createElement("p");
  detail.className = "aq-detail";
  detail.textContent = api.BGM.label + " · " + api.BGM.hint + " · " + api.BGM.detail;

  /* CC BY 4.0 要求可见署名：这里同步显示，正式位置后续迁到「设置 · 说明」 */
  const credit = document.createElement("p");
  credit.className = "aq-detail";
  credit.textContent = api.BGM.credit || "";

  const actions = document.createElement("div");
  actions.className = "aq-pick-actions";
  const playBtn = document.createElement("button");
  playBtn.type = "button"; playBtn.textContent = "▶ 从头试听";
  const stopBtn = document.createElement("button");
  stopBtn.type = "button"; stopBtn.textContent = "■ 停止";
  actions.append(playBtn, stopBtn);

  const level = document.createElement("div");
  level.className = "aq-level";
  const levelLabel = document.createElement("small");
  levelLabel.textContent = "音乐音量";
  const volume = document.createElement("input");
  volume.type = "range"; volume.min = "0"; volume.max = "100"; volume.step = "5";
  volume.setAttribute("aria-label", "背景音乐音量");
  const percent = document.createElement("span");
  percent.className = "aq-percent";
  level.append(levelLabel, volume, percent);

  function syncBgm() {
    const state = api.getBgmState();
    toggle.checked = state.enabled;
    volume.value = String(Math.round(state.volume * 100));
    percent.textContent = Math.round(state.volume * 100) + "%";
    tag.textContent = !state.enabled ? "已关闭" : state.state !== "idle" ? "播放中" : "待机";
    tag.classList.toggle("is-muted", !state.enabled);
    card.classList.toggle("is-muted", !state.enabled);
  }

  toggle.addEventListener("change", () => {
    api.setBgmEnabled(toggle.checked);
    note(toggle.checked
      ? "背景音乐已开启；进游戏或点「从头试听」即开始播放。"
      : "背景音乐已关闭：只关闭音乐，七类音效不受影响。刷新后保留。");
    syncBgm();
  });
  playBtn.addEventListener("click", () => {
    if (!api.getBgmState().enabled) { note("背景音乐已关闭，先勾选「开启背景音乐」"); return; }
    api.startBgm();
    note("背景音乐：" + api.BGM.hint + "。");
    syncBgm();
  });
  stopBtn.addEventListener("click", () => {
    api.stopBgm(600);
    note("背景音乐已停止（600ms 淡出）。");
    syncBgm();
  });
  volume.addEventListener("input", () => {
    api.setBgmVolume(Number(volume.value) / 100);
    percent.textContent = volume.value + "%";
    syncBgm();
  });

  card.append(head, toggleRow, detail, credit, actions, level);
  root.appendChild(card);
  syncBgm();
}

document.getElementById("aq-open")?.addEventListener("click", () => document.body.classList.add("aq-open"));
document.getElementById("aq-close")?.addEventListener("click", () => document.body.classList.remove("aq-open"));

document.getElementById("aq-stop")?.addEventListener("click", () => {
  api.stopAll();
  api.stopBgm?.(400);
  note("已停止所有正在播放的声音（含试听与背景音乐）");
  renderLive();
});

document.getElementById("aq-download")?.addEventListener("click", () => {
  const json = JSON.stringify(api.exportConfig(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pinball-audio-qa-v2-1-selected.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  note("已导出四类事件的音效 ID、固定素材路径与「无音效」状态（selectedId=none 即关闭）。");
});

document.getElementById("aq-diagnostics")?.addEventListener("click", () => {
  const result = window.__pinballAudioQaFix?.exportDiagnostics?.();
  if (!result) { note("游戏诊断接口尚未加载"); return; }
  const blob = new Blob([result], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "pinball-wave10-diagnostic.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  note("游戏诊断已导出（含当前波数、升级阶段、最近120条事件、音效状态）。");
});

document.getElementById("aq-jump10")?.addEventListener("click", () => {
  const route = document.getElementById("aq-route")?.value || "gun";
  const ok = window.__pinballAudioQaFix?.startBoss10?.(route);
  note(ok ? "已进入第10关Boss，请观察Boss击败后的升级选卡与第11关衔接" : "第10关测试启动失败，请导出诊断");
});

document.getElementById("aq-continue")?.addEventListener("click", () => {
  const out = window.__pinballAudioQaFix?.continueUpgrade?.();
  note(out ? "已应用第一张有效升级卡，正在进入下一关" : "当前不是等待升级状态，请查看诊断信息。");
});

document.getElementById("aq-resume")?.addEventListener("click", () => {
  const out = window.__pinballAudioQaFix?.resumePaused?.();
  note(out ? "已恢复暂停的游戏" : "无法继续：请查看错误诊断或使用游戏重开功能");
});

const NAMES = { brick_hit: "砖甲受击", brick_break: "砖块击破", clear_upgrade: "清屏升级", fail: "触线失败", ui_start: "开始游戏", ui_click: "其他按钮", wall_bounce: "墙面反弹" };

function renderLive() {
  if (!live) return;
  const state = api.getState();
  const played = api.EVENT_IDS
    .map(id => NAMES[id] + " " + (state.plays[id] || 0) + (state.muted[id] ? "（已关）" : ""))
    .join(" · ");
  const mutedList = api.EVENT_IDS.filter(id => state.muted[id]).map(id => NAMES[id]);
  live.textContent =
    "试听/触发计数：" + played +
    "\n无音效已开启：" + (mutedList.length ? mutedList.join("、") : "无（七类全部发声）") +
    "\n素材已解码 " + state.loaded.length + "/" + state.variants + " · 加载错误 " + state.errors + " · 当前发声 " + state.voices +
    "\n音频上下文 " + (state.contextState || "?") + " · 因上下文未运行丢弃 " + (state.silentDrops || 0) + " 次";
}

let lastElapsed = null, lastTime = performance.now();

function update() {
  const game = window.__pinballAudioQaFix?.getStatus?.();
  const audio = api.getState();
  renderLive();
  if (!game) { if (status) status.textContent = "等待游戏初始化"; return; }
  const now = performance.now(), progress = game.elapsed !== lastElapsed;
  if (progress) { lastElapsed = game.elapsed; lastTime = now; }
  const stuck = game.phase === "playing" && !document.hidden && !progress && (now - lastTime > 4500);
  if (flow) {
    flow.textContent =
      game.phase === "choosing" ? "第" + game.wave + "波已清屏，正在等待选择强化 · 清屏升级音已播放一次，此处不重复播放。"
      : game.phase === "paused" ? "游戏处于暂停状态 · 可点击「恢复游戏」，若有异常请导出诊断。"
      : game.phase === "lost" ? "已失败（触线失败音播放一次）"
      : game.phase === "complete" ? "20波已完成"
      : game.bossVictoryActive ? "Boss终结爆炸演出中"
      : stuck ? "游戏时间超过4秒未推进：可能存在运行异常，请导出诊断"
      : "游戏进行中 · 第" + game.wave + " / 20波";
    flow.classList.toggle("warning", game.phase === "paused" || stuck || game.phase === "lost");
  }
  const cont = document.getElementById("aq-continue");
  const resume = document.getElementById("aq-resume");
  if (cont) cont.hidden = game.phase !== "choosing";
  if (resume) resume.hidden = game.phase !== "paused";
  if (status) status.textContent = game.lastError
    ? "上次脚本错误：" + game.lastError.message
    : "游戏阶段：" + game.phase + "；当前第" + game.wave + "波；素材解码 " + audio.loaded.length + "/" + audio.variants + "；音频错误 " + audio.errors;
  if (audio.lastError && audio.errors > 0) note("音频加载失败：" + audio.lastError);
}

renderLive();
update();
setInterval(update, 1000);
})();
