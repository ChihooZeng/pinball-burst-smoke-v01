// V5 mobile viewport / touch / safe-area check.
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
const rect = `e=>{const b=e.getBoundingClientRect();return {y:+b.y.toFixed(1),h:+b.height.toFixed(1),bottom:+b.bottom.toFixed(1)}}`;
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable'); await send('Page.enable');
const sizes = [
  { name: 'iPhoneSE', w: 375, h: 667, dpr: 2 },
  { name: 'iPhone12', w: 390, h: 844, dpr: 3 },
  { name: 'iPhone14ProMax', w: 430, h: 932, dpr: 3 },
  { name: 'Android360', w: 360, h: 640, dpr: 3 },
  { name: 'Pixel412', w: 412, h: 915, dpr: 2.6 }
];
const results = { base: BASE, sizes: [], notch: null, errors: [] };
for (const s of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr, mobile: true });
  await send('Page.navigate', { url: `${BASE}?${CACHE}&test=1` }); await sleep(1000);
  const menu = await ev(`(()=>{const r=${rect};return {iw:innerWidth,ih:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,start:r(document.querySelector('#labStartBtn')),lastMode:r(document.querySelector('#lab-mode-S8')),lastField:r(document.querySelector('#lab-field-C')),modes:document.querySelectorAll('.lab-mode').length,fields:document.querySelectorAll('.lab-scenario').length,sel:document.querySelector('#labSelection').textContent}})()`);
  await ev(`document.querySelector('#lab-mode-S8').click();document.querySelector('#lab-field-C').click();document.querySelector('#labStartBtn').click()`); await sleep(2000);
  const play = await ev(`(()=>{const r=${rect};return {iw:innerWidth,ih:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,canvas:r(document.querySelector('#game')),hud:r(document.querySelector('#labHud')),status:r(document.querySelector('.combat-status')),phase:window.__pinballLabTest.stats().phase,balls:window.__pinballLabTest.stats().balls,peak:window.__pinballLabTest.stats().maxBalls,startHidden:document.querySelector('#startOverlay').classList.contains('hidden')}})()`);
  await ev(`window.dispatchEvent(new Event('resize'))`); await sleep(80);
  const resize = await ev(`({phase:window.__pinballLabTest.stats().phase,sw:document.documentElement.scrollWidth})`);
  const before = await ev('window.__pinballState().aim');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.w / 2, y: s.h * 0.7, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: s.w * 0.25, y: s.h * 0.7, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(100);
  const after = await ev('window.__pinballState().aim');
  await ev(`document.querySelector('#pause').click()`); await sleep(250);
  const pause = await ev(`(()=>{const r=${rect};const ov=document.querySelector('#pauseOverlay');return {hidden:ov.classList.contains('hidden'),overlay:r(ov),restart:r(document.querySelector('#labRestartBtn')),menu:r(document.querySelector('#labMenuBtn')),sub:document.querySelector('#pauseSubtitle').textContent}})()`);
  await ev(`document.querySelector('#resume').click()`);
  results.sizes.push({ size: s, menu, play, resize, touch: { before, after, changed: Math.abs(after - before) > 0.05 }, pause });
  if (s.name === 'Android360' || s.name === 'iPhone12') { const sh = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `mobile-${s.name}.png`), Buffer.from(sh.data, 'base64')); }
}
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: `${BASE}?${CACHE}&test=1` }); await sleep(900);
await ev(`(()=>{const st=document.createElement('style');st.textContent='.topbar{padding-top:47px!important}.lab-hud{top:97px!important}.ult-wrap{bottom:34px!important}.combat-status{bottom:34px!important}';document.head.appendChild(st);})()`);
await ev(`document.querySelector('#lab-mode-S8').click();document.querySelector('#labStartBtn').click()`); await sleep(1000);
results.notch = await ev(`(()=>{const r=${rect};const brick=window.__pinballLabTest.bricks()[0];const c=document.querySelector('#game').getBoundingClientRect();return {hud:r(document.querySelector('#labHud')),topbar:r(document.querySelector('.topbar')),brickLogicalY:brick.y,brickCssY:+(c.top+brick.y*(c.height/779)).toFixed(1),canvas:r(document.querySelector('#game')),status:r(document.querySelector('.combat-status')),sw:document.documentElement.scrollWidth,iw:innerWidth,phase:window.__pinballLabTest.stats().phase}})()`);
{ const sh = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, 'mobile-notch.png'), Buffer.from(sh.data, 'base64')); }
results.errors = errors;
fs.writeFileSync(path.join(OUT, 'mobile-check.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ sizes: results.sizes.map((x) => ({ name: x.size.name, sw: x.menu.sw, startBottom: x.menu.start.bottom, modes: x.menu.modes, phase: x.play.phase, resize: x.resize.phase, touch: x.touch.changed, pauseBottom: x.pause.restart.bottom, overlayBottom: x.pause.overlay.bottom })), notch: results.notch, errors: results.errors }, null, 2));
ws.close();
