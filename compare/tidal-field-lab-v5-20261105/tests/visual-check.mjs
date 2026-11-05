// V5 专项截图：A/B/C 三战场 + C 的补阵预警/生成瞬间。
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
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.text || 'exception'); };
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const stats = `window.__pinballLabTest.stats()`;
async function nav(mode, field, wait = 1000) {
  await send('Page.bringToFront').catch(() => {});
  await send('Page.navigate', { url: `${BASE}?${CACHE}&test=1&mode=${mode}&field=${field}` });
  await sleep(wait);
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); }
async function waitFor(fn, timeout = 15000, step = 40) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await ev(stats); if (fn(s)) return s; await sleep(step); }
  return null;
}

const out = { checks: [] };
for (const field of ['A','B','C']) {
  await nav('S8', field, 1200);
  await sleep(12000);
  const s = await ev(stats);
  await shot(`20-${field}-15s`);
  out.checks.push({ field, at: '15s', alive: s.alive, batches: s.stats.batchBatches, spawned: s.stats.batchSpawned, breaks: s.stats.breaks, gap: s.stats.breakGapMax });
}

// C 场：抓补阵预警（batchWarnings>0）与生成瞬间
await nav('S8','C',900);
const warn = await waitFor(s => s.batchWarnings > 0, 20000, 25);
if (warn) await shot('21-C-warning');
const spawn = await waitFor(s => s.stats.batchSpawned > 0, 20000, 25);
if (spawn) await shot('22-C-spawned');
out.checks.push({ field: 'C', warnCaptured: !!warn, spawnCaptured: !!spawn, warnings: warn?.batchWarnings ?? 0, spawned: spawn?.stats.batchSpawned ?? 0 });

out.errors = errors;
fs.writeFileSync(path.join(OUT, 'visual-check.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
