// V4 Chrome CDP check: menu + 14 modes + FPS + console errors + per-mode evidence.
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
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.text || 'exception');
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value).join(' '));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
async function nav(url, wait = 900) {
  await send('Page.bringToFront').catch(() => {});
  await send('Page.navigate', { url });
  await sleep(Math.min(600, wait));
  await ev(`window.__pinballLabTest && window.__pinballLabTest.setAim(0.1)`).catch(() => {});
  await sleep(Math.max(0, wait - 600));
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); }

const result = { base: BASE, menu: null, runs: [], fps: null, errors: [] };

await nav(`${BASE}?${CACHE}&test=1`);
result.menu = await ev(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return {y:+b.y.toFixed(1),bottom:+b.bottom.toFixed(1)}};
  return {title:document.title,modes:document.querySelectorAll('.lab-mode').length,fields:document.querySelectorAll('.lab-scenario').length,
  sel:document.querySelector('#labSelection').textContent,start:r(document.querySelector('#labStartBtn')),
  giant:document.querySelector('#labGiantToggle').checked,sw:document.documentElement.scrollWidth,iw:innerWidth,
  names:[...document.querySelectorAll('.lab-mode b')].map(e=>e.textContent)}})()`);
await shot('01-v4-menu');

const MODES = ['none','S1','C1','M1','M2','S7-L1','S7-L2','S7-L3','S8-L1','S8-L2','S8-L3','C7','C8','C9'];
for (const mode of MODES) {
  await nav(`${BASE}?${CACHE}&test=1&mode=${mode}&field=C`, 2600);
  const sample = await ev(`(()=>{const s=window.__pinballLabTest.stats();const st=window.__pinballState();
    return {mode:s.mode,field:s.field,phase:s.phase,balls:s.balls,peak:s.maxBalls,fps:st.fpsNow,
      orbitAssigned:s.stats.orbitAssigned,orbitHits:s.stats.orbitHits,orbitDamage:s.stats.orbitDamage,orbitMaxRings:s.stats.orbitMaxRings,
      flywheel:s.stats.flywheelSpawns,flywheelHits:s.stats.flywheelHits,
      bombs:s.stats.bombsPlanted,detonated:s.stats.bombsDetonated,bombHits:s.stats.bombHits,bombDamage:s.stats.bombDamage,chainMax:s.stats.bombChainMax,chainDepth:s.stats.bombMaxDepth,
      mg:s.stats.mgShots,volleys:s.stats.volleys,bloom:s.stats.bloomChildren,giant:s.giantEnabled,orbitCarriers:s.orbitCarriers}})()`);
  result.runs.push(sample);
}

// 长序列 FPS 采样（仅 headless 参考，不代表真机）
await nav(`${BASE}?${CACHE}&test=1&mode=S7-L3&field=C`, 1200);
const fpsSamples = [];
for (let i = 0; i < 10; i++) { await sleep(1000); fpsSamples.push(await ev(`window.__pinballState().fpsNow`)); }
result.fps = { mode: 'S7-L3', samples: fpsSamples };

result.errors = errors;
fs.writeFileSync(path.join(OUT, 'browser-check.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ menu: result.menu, runs: result.runs, fps: result.fps, errors: result.errors }, null, 2));
ws.close();
