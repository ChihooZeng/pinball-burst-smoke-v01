// Chrome CDP check for V2 (4 modes x 3 fields). No npm dependencies.
// Usage: CDP_PORT=9335 BASE_URL=http://127.0.0.1:4185/ node tests/browser-check.mjs
import fs from 'node:fs';
import path from 'node:path';
const PORT = process.env.CDP_PORT || '9335';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4185/';
const CACHE = process.env.CACHE_BUST || 'v=2';
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
async function nav(url, wait = 1000) { await send('Page.navigate', { url }); await sleep(wait); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); }
const result = { base: BASE, menu: null, runs: [], errors: [] };
await nav(`${BASE}?${CACHE}&test=1`);
result.menu = await ev(`({title:document.title,modes:document.querySelectorAll('.lab-mode').length,fields:document.querySelectorAll('.lab-scenario').length,sw:document.documentElement.scrollWidth,iw:innerWidth,startBottom:document.querySelector('#labStartBtn').getBoundingClientRect().bottom})`);
await shot('01-v2-menu');
const runs = [];
for (const mode of ['S1', 'C1', 'M1', 'M2']) for (const field of ['A', 'B', 'C']) runs.push([mode, field]);
for (let i = 0; i < runs.length; i++) {
  const [mode, field] = runs[i];
  await nav(`${BASE}?${CACHE}&test=1&mode=${mode}&field=${field}`, 2600);
  result.runs.push(await ev(`(()=>{const s=window.__pinballLabTest.stats();const st=window.__pinballState();return {mode:s.mode,field:s.field,phase:s.phase,elapsed:s.elapsed,bricks:s.bricks,balls:s.balls,peak:s.maxBalls,top:s.topRemaining,mid:s.midRemaining,warnings:s.warnings,summoner:s.summoner,stats:s.stats,fireRate:s.fireRate,ballRate:s.ballRate,giant:s.giant,giantEnabled:s.giantEnabled,fps:st.fpsNow,quality:st.renderQuality}})()`));
  if (['M1-A', 'M2-B', 'S1-C', 'C1-B'].includes(mode + '-' + field)) await shot(`0${i + 2}-${mode}-${field}`);
}
// Dedicated warning / summoner evidence at the first mid batch.
await nav(`${BASE}?${CACHE}&test=1&mode=M2&field=B`, 3800);
result.warning = await ev(`(()=>{const s=window.__pinballLabTest.stats();return {warnings:s.warnings,mid:s.midRemaining,midSpawned:s.stats.midSpawned,warningsShown:s.stats.warningsShown,minGap:s.stats.spawnMinGap,warningMinGap:s.stats.warningMinGap}})()`);
await shot('13-mid-warning');
await nav(`${BASE}?${CACHE}&test=1&mode=M1&field=C`, 3500);
result.summoner = await ev(`(()=>{const s=window.__pinballLabTest.stats();return {summoner:s.summoner,summonerKilled:s.stats.summonerKilled,mid:s.midRemaining,warnings:s.warnings}})()`);
await shot('14-summoner');
result.errors = errors;
fs.writeFileSync(path.join(OUT, 'browser-check.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ menu: result.menu, runs: result.runs.map((r) => ({ mode: r.mode, field: r.field, phase: r.phase, peak: r.peak, fire: r.fireRate, ball: r.ballRate, warnings: r.warnings, summoner: r.summoner, fps: r.fps })), errors: result.errors }, null, 2));
ws.close();
