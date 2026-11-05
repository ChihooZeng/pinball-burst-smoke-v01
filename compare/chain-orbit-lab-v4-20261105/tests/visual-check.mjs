// V4 专项截图：星环 / 双环 / 飞轮 / 植雷 / 引爆 / 接力 / 组合模式。
import fs from 'node:fs';
import path from 'node:path';
const PORT = process.env.CDP_PORT || '9336';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4186/';
const CACHE = process.env.CACHE_BUST || 'v=4a';
const OUT = path.join(process.cwd(), 'artifacts');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?` + encodeURIComponent('about:blank'), { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const errors = [];
ws.addEventListener('message', (m) => { try { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails?.text || 'exception'); } catch (_) {} });
async function nav(mode, wait = 1400) {
  await send('Page.bringToFront').catch(() => {});
  await send('Page.navigate', { url: `${BASE}?${CACHE}&test=1&mode=${mode}&field=C` });
  await sleep(Math.min(700, wait));
  // 固定 0.1rad 轻微右倾：这是"真人瞄着砖阵打"的代表性采样角，
  // 避免 aim=0 时球只直上直下、命中集中到极少数砖块。必须在计时前设置。
  await ev(`window.__pinballLabTest && window.__pinballLabTest.setAim(0.1)`).catch(() => {});
  await sleep(Math.max(0, wait - 700));
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); }
const statsExpr = `window.__pinballLabTest.stats()`;
async function waitFor(fn, timeout = 12000, step = 40) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const s = await ev(statsExpr);
    if (fn(s)) return s;
    await sleep(step);
  }
  return null;
}

const out = { checks: [] };

// ---- S7：星环形态 ----
for (const mode of ['S7-L1', 'S7-L2', 'S7-L3']) {
  await nav(mode, 1200);
  const s = await waitFor((x) => x.orbitCarriers >= 2 && x.stats.orbitHits > 0, 9000, 40);
  await shot(`30-${mode}`);
  out.checks.push({ mode, captured: !!s, carriers: s?.orbitCarriers ?? 0, rings: s?.stats.orbitMaxRings ?? 0, hits: s?.stats.orbitHits ?? 0, damage: s?.stats.orbitDamage ?? 0 });
}

// ---- S7-L3：离体飞轮 ----
{
  await nav('S7-L3', 1200);
  const started = Date.now(); let captured = false;
  while (Date.now() - started < 14000) {
    const balls = await ev(`window.__pinballLabTest.balls()`);
    if (balls.some((b) => b.source === 'flywheel')) { await shot('30b-S7-L3-flywheel'); captured = true; break; }
    await sleep(30);
  }
  const s = await ev(statsExpr);
  out.checks.push({ mode: 'S7-L3-flywheel', captured, spawns: s.stats.flywheelSpawns, hits: s.stats.flywheelHits, peak: s.maxBalls });
}

// ---- S8：植雷（未爆）与引爆（已爆）与接力 ----
for (const mode of ['S8-L1', 'S8-L2', 'S8-L3']) {
  await nav(mode, 1000);
  // 等同时存在 2 个以上标记再拍，否则单标记会在快门延迟内被击碎
  const marked = await waitFor((x) => x.marks >= 2 && x.bombFx === 0, 12000, 25);
  if (marked) await shot(`31a-${mode}-mark`);
  const blast = await waitFor((x) => x.bombFx > 0, 12000, 20);
  await shot(`31b-${mode}-blast`);
  // 接力瞬间：等第 3 次及以后的爆炸，而不是第一发
  const chain = await waitFor((x) => x.stats.bombsDetonated >= 3 && x.bombFx > 0, 20000, 25);
  if (mode !== 'S8-L1') await shot(`31c-${mode}-chain`);
  out.checks.push({ mode, markCaptured: !!marked, blastCaptured: !!blast, chainCaptured: !!chain, planted: chain?.stats.bombsPlanted ?? blast?.stats.bombsPlanted ?? 0, detonated: chain?.stats.bombsDetonated ?? blast?.stats.bombsDetonated ?? 0, chain: chain?.stats.bombChainMax ?? 0, depth: chain?.stats.bombMaxDepth ?? 0 });
}

// ---- 组合模式（跑够 8 秒再拍，避免抓到空场） ----
for (const [mode, name] of [['C7', '32-C7'], ['C8', '33-C8'], ['C9', '34-C9']]) {
  await nav(mode, 8000);
  await shot(name);
  const s = await ev(statsExpr);
  out.checks.push({ mode, orbit: s.stats.orbitHits, bombs: s.stats.bombsPlanted, detonated: s.stats.bombsDetonated, chain: s.stats.bombChainMax, mg: s.stats.mgShots, bloom: s.stats.bloomChildren });
}

out.errors = errors;
fs.writeFileSync(path.join(OUT, 'visual-check.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
