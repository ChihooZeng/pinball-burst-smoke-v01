// V5 Chrome CDP check: 4 skills x 3 fields, M2.5 heavy feedback, screenshots, FPS, errors.
import fs from 'node:fs';
import path from 'node:path';
const PORT = process.env.CDP_PORT || '9337';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4187/';
const CACHE = process.env.CACHE_BUST || 'v=5a';
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
async function nav(mode, field, wait = 1200) {
  await send('Page.bringToFront').catch(() => {});
  await send('Page.navigate', { url: `${BASE}?${CACHE}&test=1&mode=${mode}&field=${field}` });
  await sleep(Math.min(600, wait));
  await sleep(Math.max(0, wait - 600));
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); }

const result = { base: BASE, menu: null, runs: [], feedback: null, fps: null, errors: [] };

await nav('none', 'B', 900);
result.menu = await ev(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return {y:+b.y.toFixed(1),bottom:+b.bottom.toFixed(1)}};
  return {title:document.title,modes:document.querySelectorAll('.lab-mode').length,fields:document.querySelectorAll('.lab-scenario').length,
  sel:document.querySelector('#labSelection').textContent,start:r(document.querySelector('#labStartBtn')),
  giant:document.querySelector('#labGiantToggle').checked,sw:document.documentElement.scrollWidth,iw:innerWidth,
  names:[...document.querySelectorAll('.lab-mode b')].map(e=>e.textContent),
  fields2:[...document.querySelectorAll('.lab-scenario b')].map(e=>e.textContent),
  impact:document.querySelector('#impactMode').value}})()`);
await shot('01-v5-menu');

for (const mode of ['none','S1','M1','S8']) for (const field of ['A','B','C']) {
  await nav(mode, field, 8600);
  const s = await ev(`(()=>{const s=window.__pinballLabTest.stats();const st=window.__pinballState();
    return {mode:s.mode,field:s.field,phase:s.phase,alive:s.alive,low:s.low,peak:s.maxBalls,fps:st.fpsNow,
      batches:s.stats.batchBatches,spawned:s.stats.batchSpawned,delayed:s.stats.batchDelayed,
      breaks:s.stats.breaks,gap:s.stats.breakGapMax,wait:s.stats.waitSeconds,clear:s.stats.clearTime,
      times:s.stats.batchTimes,feedback:st.visualImpact.mode}})()`);
  result.runs.push(s);
  if (mode === 'S8' || field === 'A') await shot(`10-${mode}-${field}`);
}

// M2.5 反馈档位确认：默认 bold、实际强度 2.35、震动上限 7.5
result.feedback = await ev(`(()=>{const st=window.__pinballState();return {mode:st.visualImpact.mode,quality:st.visualImpact.quality,shake:st.visualImpact.shakeStrength,max:st.visualImpact.max}})()`);

// 长序列 FPS（headless 参考）
await nav('S8','C',1000);
const fpsSamples = [];
for (let i = 0; i < 10; i++) { await sleep(1000); fpsSamples.push(await ev(`window.__pinballState().fpsNow`)); }
result.fps = { mode: 'S8/C', samples: fpsSamples };

result.errors = errors;
fs.writeFileSync(path.join(OUT, 'browser-check.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ menu: result.menu, feedback: result.feedback, runs: result.runs, fps: result.fps, errors: result.errors }, null, 2));
ws.close();
