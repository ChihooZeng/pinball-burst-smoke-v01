/* 《弹珠超载》音效调试台 V2.1 —— 四类实际音效事件
   - 砖甲受击（砖块存活）：V5 木质轻敲 / V5 木板闷响，二选一，同一时刻只播当前选中项。
   - 砖块击破：固定 break-x11 · impactGlass heavy 000。
   - 清屏升级：固定 clear-x14 · Upper01（清屏与升级合并，只播一次）。
   - 触线失败：固定 fail-02 · 02 错误提示中音。
   每类都可单独设为「无音效」；设为无音效时完全静音，绝不回退旧合成音。
   全部素材自托管（demo/audio-qa/audio 与 demo/audio-qa-v2-1/audio），不依赖外部 CDN。 */
(() => {
"use strict";

const REVISION = "audio-qa-v21-20261109";
const STORAGE = "pinball-audio-qa-v21-20261109";

/* 事件表：唯一事实来源。调试台、JSON 导出、游戏路由都读这一份。 */
const EVENTS = Object.freeze({
  brick_hit: {
    id: "brick_hit",
    name: "砖甲受击",
    hint: "球击中砖块但砖块仍存活",
    variants: Object.freeze([
      Object.freeze({
        id: "v5-wood-light",
        label: "V5 木质轻敲",
        detail: "原机枪射击组 bundled · impactWood light 000",
        url: "../audio-qa/audio/mg.ogg",
        gain: .26
      }),
      Object.freeze({
        id: "v5-wood-thud",
        label: "V5 木板闷响",
        detail: "原普通命中组 bundled · impactWood medium 001",
        url: "../audio-qa/audio/hit.ogg",
        gain: .40
      })
    ]),
    maxDuration: .5,
    cooldown: 55,
    maxVoices: 4,
    priority: 2
  },
  brick_break: {
    id: "brick_break",
    name: "砖块击破",
    hint: "砖块 HP 归零、实际被摧毁",
    variants: Object.freeze([
      Object.freeze({
        id: "break-x11",
        label: "break-x11 · impactGlass heavy 000",
        detail: "impact-sounds / CC0-1.0",
        url: "audio/break-x11-impactGlass_heavy_000.ogg",
        gain: .48
      })
    ]),
    maxDuration: .5,
    cooldown: 46,
    maxVoices: 2,
    priority: 3
  },
  clear_upgrade: {
    id: "clear_upgrade",
    name: "清屏升级",
    hint: "清屏过关与升级选择同一节点，只播一次",
    variants: Object.freeze([
      Object.freeze({
        id: "clear-x14",
        label: "clear-x14 · Upper01",
        detail: "oga-levelup-powerup / CC0-1.0",
        url: "audio/clear-x14-Upper01.wav",
        gain: .46
      })
    ]),
    maxDuration: 3.44,
    cooldown: 1500,
    maxVoices: 1,
    priority: 5
  },
  fail: {
    id: "fail",
    name: "触线失败",
    hint: "砖阵触及警戒线",
    variants: Object.freeze([
      Object.freeze({
        id: "fail-02",
        label: "fail-02 · 02 错误提示中音",
        detail: "interface-sounds / CC0-1.0",
        url: "audio/fail-02-error_005.ogg",
        gain: .52
      })
    ]),
    maxDuration: 1.2,
    cooldown: 1100,
    maxVoices: 1,
    priority: 5
  }
});

const EVENT_IDS = Object.keys(EVENTS);
/* 旧事件名 -> V2.1 事件。砖甲受击由普通命中与装甲命中合并而来。 */
const ALIAS = Object.freeze({
  hit: "brick_hit",
  armor: "brick_hit",
  break: "brick_break",
  clear: "clear_upgrade"
});
const NONE_ID = "none";

let enabled = true, volume = .78, muted = Object.create(null);
const chosen = Object.create(null), volumes = Object.create(null);
for (const id of EVENT_IDS) {
  muted[id] = false;
  volumes[id] = 1;
  chosen[id] = EVENTS[id].variants[0].id;
}

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, Number(value) || 0)); }

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
  if (saved && typeof saved === "object") {
    if (typeof saved.enabled === "boolean") enabled = saved.enabled;
    if (saved.muted) for (const id of EVENT_IDS) if (typeof saved.muted[id] === "boolean") muted[id] = saved.muted[id];
    if (saved.selected) for (const id of EVENT_IDS) {
      const want = saved.selected[id];
      if (want === NONE_ID) { muted[id] = true; continue; }
      if (EVENTS[id].variants.some(v => v.id === want)) chosen[id] = want;
    }
    if (saved.volumes) for (const id of EVENT_IDS) {
      const v = Number(saved.volumes[id]);
      if (Number.isFinite(v)) volumes[id] = clamp(v, 0, 1.5);
    }
  }
} catch (e) {}

function persist() {
  try {
    const selected = {};
    for (const id of EVENT_IDS) selected[id] = muted[id] ? NONE_ID : chosen[id];
    localStorage.setItem(STORAGE, JSON.stringify({ enabled, selected, muted, volumes }));
  } catch (e) {}
}

let ctx = null, bus = null, limiter = null;
const buffers = new Map(), loading = new Map();
const voices = [], last = Object.create(null);
const plays = Object.create(null), suppressed = Object.create(null), drops = Object.create(null);
let errors = 0, lastError = null;

function setup() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
      bus = ctx.createGain();
      bus.gain.value = volume * .86;
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 18;
      limiter.ratio.value = 4.5;
      limiter.attack.value = .002;
      limiter.release.value = .13;
      bus.connect(limiter); limiter.connect(ctx.destination);
    } catch (e) { errors++; lastError = String(e && e.message || e); return null; }
  }
  if (ctx.state === "suspended") { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
  return ctx;
}

function bufferKey(eventId, variantId) { return eventId + ":" + variantId; }

/* 解码一次并计算响度补偿，保证四条声音在手机外放上量级接近。 */
function load(eventId, variantId) {
  const event = EVENTS[eventId];
  const variant = event && event.variants.find(v => v.id === variantId);
  if (!variant) return Promise.reject(new Error("Unknown variant " + eventId + "/" + variantId));
  const key = bufferKey(eventId, variantId);
  if (buffers.has(key)) return Promise.resolve(buffers.get(key));
  if (loading.has(key)) return loading.get(key);
  const job = (async () => {
    const audio = setup();
    if (!audio) throw new Error("Web Audio unsupported");
    const response = await fetch(variant.url, { cache: "force-cache" });
    if (!response.ok) throw new Error("音频返回 HTTP " + response.status + "：" + variant.url);
    const buffer = await audio.decodeAudioData((await response.arrayBuffer()).slice(0));
    let sum = 0, n = 0, peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      const stride = Math.max(1, Math.ceil(data.length / 24000));
      for (let i = 0; i < data.length; i += stride) {
        const v = data[i];
        sum += v * v; n++;
        const abs = Math.abs(v); if (abs > peak) peak = abs;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, n));
    const level = clamp(Math.min(.13 / Math.max(.008, rms), .80 / Math.max(.01, peak)), .35, 2.2);
    const record = { buffer, level, url: variant.url };
    buffers.set(key, record);
    return record;
  })();
  loading.set(key, job);
  job.catch(e => {
    errors++;
    lastError = String(e && e.message || e);
    loading.delete(key);
    console.warn("[Audio QA V2.1] 素材加载失败", key, lastError);
  });
  return job;
}

function loadAll() {
  for (const id of EVENT_IDS) for (const v of EVENTS[id].variants) load(id, v.id).catch(() => {});
}

function currentVariant(eventId) {
  const event = EVENTS[eventId];
  if (!event) return null;
  return event.variants.find(v => v.id === chosen[eventId]) || event.variants[0];
}

function cut(voice) {
  try { voice.source.stop(); } catch (e) {}
  const i = voices.indexOf(voice);
  if (i >= 0) voices.splice(i, 1);
}

function stop(eventId = null, includePreview = true) {
  for (const v of [...voices]) {
    if (eventId && v.event !== eventId) continue;
    if (!includePreview && v.preview) continue;
    try { v.source.stop(); } catch (e) {}
  }
}

function setVolume(value) {
  const next = clamp(value, 0, 1);
  if (Math.abs(next - volume) < .0005) return;
  volume = next;
  if (bus && ctx) bus.gain.setTargetAtTime(volume * .86, ctx.currentTime, .02);
  else if (bus) bus.gain.value = volume * .86;
}

function setGroupVolume(eventId, value) {
  if (!(eventId in EVENTS)) return false;
  volumes[eventId] = clamp(value, 0, 1.5);
  persist();
  return true;
}

function setMuted(eventId, on) {
  if (!(eventId in EVENTS)) return false;
  muted[eventId] = !!on;
  if (muted[eventId]) stop(eventId);
  persist();
  return true;
}

function setVariant(eventId, variantId) {
  const event = EVENTS[eventId];
  if (!event) return false;
  if (variantId !== NONE_ID && !event.variants.some(v => v.id === variantId)) return false;
  muted[eventId] = variantId === NONE_ID;
  if (!muted[eventId]) chosen[eventId] = variantId;
  persist();
  if (!muted[eventId]) load(eventId, variantId).catch(() => {});
  return true;
}

function setEnabled(on) {
  enabled = !!on;
  persist();
  if (!enabled) stop();
}

/* 播放一次事件。返回 true 表示该事件已被本层接管（含「无音效」静音），
   false 表示这是合成音事件，交回 game.js 的旧 beep 分支。 */
function play(kind, master) {
  const eventId = ALIAS[kind] || kind;
  const event = EVENTS[eventId];
  if (!event) return false;
  if (typeof master === "number") setVolume(master);
  if (!enabled) return true;
  if (muted[eventId]) { suppressed[eventId] = (suppressed[eventId] || 0) + 1; return true; }
  if (volume <= 0 || volumes[eventId] <= 0) { suppressed[eventId] = (suppressed[eventId] || 0) + 1; return true; }
  const variant = currentVariant(eventId);
  if (!variant) return true;
  const now = performance.now();
  if (now - (last[eventId] ?? -1e9) < event.cooldown) { drops[eventId] = (drops[eventId] || 0) + 1; return true; }
  last[eventId] = now;
  const context = setup();
  if (!context) return true;
  const record = buffers.get(bufferKey(eventId, variant.id));
  if (!record) { load(eventId, variant.id).catch(() => {}); return true; }
  if (document.hidden || context.state !== "running") return true;
  emit(context, event, variant, record, context.currentTime + .006, volumes[eventId], false);
  plays[eventId] = (plays[eventId] || 0) + 1;
  return true;
}

function emit(context, event, variant, record, at, groupGain, preview) {
  const duration = Math.min(event.maxDuration, record.buffer.duration);
  if (!(duration > .01)) return null;
  const live = voices.filter(v => v.event === event.id && v.preview === preview);
  if (!preview && live.length >= event.maxVoices) cut(live[0]);
  if (!preview && voices.filter(v => !v.preview).length >= 14) {
    const victim = voices.filter(v => !v.preview).sort((a, b) => (a.priority - b.priority) || (a.at - b.at))[0];
    if (victim) cut(victim); else return null;
  }
  const source = context.createBufferSource(), gain = context.createGain();
  source.buffer = record.buffer;
  const peak = Math.max(.0008, Math.min(.72, (variant.gain || .4) * record.level * groupGain));
  const release = Math.min(.045, duration * .22);
  gain.gain.setValueAtTime(.00001, at);
  gain.gain.linearRampToValueAtTime(peak, at + .004);
  gain.gain.setValueAtTime(peak, Math.max(at + .004, at + duration - release));
  gain.gain.linearRampToValueAtTime(.00001, at + duration);
  source.connect(gain); gain.connect(bus);
  const voice = { source, gain, event: event.id, priority: event.priority, preview, at: performance.now() };
  voices.push(voice);
  source.onended = () => {
    const i = voices.indexOf(voice);
    if (i >= 0) voices.splice(i, 1);
    try { source.disconnect(); gain.disconnect(); } catch (e) {}
  };
  source.start(at, 0, duration);
  return voice;
}

/* 旧合成音 A/B（仅砖甲受击有对照组）：复刻 game.js 原装甲提示音。 */
function tone(context, freq, seconds, amp, type, at) {
  const osc = context.createOscillator(), gain = context.createGain();
  const duration = Math.max(.02, Math.min(seconds, .4));
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(60, freq), at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(65, freq * .56), at + duration);
  const level = Math.min(.23, Math.max(.018, amp * 4.0));
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + .006);
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  osc.connect(gain); gain.connect(bus);
  osc.start(at); osc.stop(at + duration + .008);
}

function previewLegacy() {
  const context = setup();
  if (!context || !enabled) return false;
  if (context.state !== "running") return false;
  const at = context.currentTime + .01;
  try {
    tone(context, 235, .08, .046, "sawtooth", at);
    tone(context, 680, .035, .022, "triangle", at);
    return true;
  } catch (e) { errors++; lastError = String(e && e.message || e); return false; }
}

let previewTimers = [];

function clearPreviewTimers() {
  for (const t of previewTimers) clearTimeout(t);
  previewTimers = [];
}

/* 试听：单次或连播约 3 秒。试听不改变游戏内的实际路由。 */
function preview(eventId, loop = false) {
  const event = EVENTS[eventId];
  if (!event) throw new Error("未知事件：" + eventId);
  if (!enabled) throw new Error("音效总开关已关闭");
  if (muted[eventId]) throw new Error("该类已设为「无音效」，先选择音效再试听");
  const variant = currentVariant(eventId);
  const context = setup();
  if (!context) throw new Error("浏览器不支持 Web Audio");
  const record = buffers.get(bufferKey(eventId, variant.id));
  clearPreviewTimers();
  stop(eventId);
  if (!record) return load(eventId, variant.id).then(() => preview(eventId, loop));
  const fire = () => {
    const c = setup();
    if (!c || c.state !== "running") return;
    emit(c, event, variant, record, c.currentTime + .01, volumes[eventId], true);
  };
  fire();
  if (!loop) return Promise.resolve(true);
  const span = Math.min(event.maxDuration, record.buffer.duration);
  const step = Math.max(.2, Math.min(2.9, span + .12));
  const count = Math.max(1, Math.ceil(3 / step));
  for (let i = 1; i < count; i++) previewTimers.push(setTimeout(fire, Math.round(i * step * 1000)));
  previewTimers.push(setTimeout(() => stop(eventId), 3400));
  return Promise.resolve(true);
}

function stopAll() {
  clearPreviewTimers();
  stop();
}

function prime() {
  if (!setup()) return;
  loadAll();
}

function getState() {
  return {
    revision: REVISION,
    enabled,
    master: volume,
    muted: { ...muted },
    selected: { ...chosen },
    volumes: { ...volumes },
    plays: { ...plays },
    suppressed: { ...suppressed },
    drops: { ...drops },
    errors,
    lastError,
    loaded: [...buffers.keys()],
    voices: voices.length,
    events: EVENT_IDS.length,
    variants: EVENT_IDS.reduce((n, id) => n + EVENTS[id].variants.length, 0)
  };
}

function exportConfig() {
  const status = (typeof window !== "undefined" && window.__pinballAudioQaFix && window.__pinballAudioQaFix.getStatus)
    ? window.__pinballAudioQaFix.getStatus() : null;
  return {
    version: "pinball-audio-qa-v2.1",
    revision: REVISION,
    exportedAt: new Date().toISOString(),
    items: EVENT_IDS.map(id => {
      const event = EVENTS[id], variant = currentVariant(id), isMuted = !!muted[id];
      return {
        event: id,
        name: event.name,
        selectedId: isMuted ? NONE_ID : variant.id,
        label: isMuted ? "无音效" : variant.label,
        muted: isMuted,
        file: isMuted ? null : variant.url,
        candidateIds: event.variants.map(v => v.id),
        groupVolume: volumes[id],
        plays: plays[id] || 0,
        suppressed: suppressed[id] || 0
      };
    }),
    note: "四类实际音效事件；brick_hit 有两个候选，其余三类为固定素材。selectedId 为 none 表示该类已关闭。",
    diagnostic: status
  };
}

function describe() {
  return EVENT_IDS.map(id => {
    const event = EVENTS[id];
    return {
      id, name: event.name, hint: event.hint,
      fixed: event.variants.length === 1,
      variants: event.variants.map(v => ({ id: v.id, label: v.label, detail: v.detail }))
    };
  });
}

document.addEventListener("pointerdown", prime, { once: true, capture: true, passive: true });
document.addEventListener("visibilitychange", () => { if (document.hidden) stopAll(); });

window.PinballGameAudio = {
  revision: REVISION,
  EVENTS, EVENT_IDS, NONE_ID,
  play, prime, stop, stopAll,
  setVolume, setGroupVolume, setMuted, setVariant, setEnabled,
  preview, previewLegacy, clearPreviewTimers,
  describe, getState, exportConfig,
  hasBuffer: (eventId) => !!buffers.get(bufferKey(eventId, chosen[eventId]))
};
})();
