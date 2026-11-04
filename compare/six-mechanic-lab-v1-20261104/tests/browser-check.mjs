// Headless Chrome CDP check for the isolated lab. No npm dependencies.
// Usage: CDP_PORT=9333 BASE_URL=http://127.0.0.1:4184/ node tests/browser-check.mjs
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.CDP_PORT || '9333';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4184/';
const CACHE = process.env.CACHE_BUST || 'v=3';
const OUT = path.join(process.cwd(), 'artifacts');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createTarget(url) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?` + encodeURIComponent(url), { method: 'PUT' });
  if (!res.ok) throw new Error('CDP target failed: ' + res.status);
  return res.json();
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push({ type: 'exception', text: msg.params.exceptionDetails?.text || 'exception' });
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        this.errors.push({ type: 'log', text: msg.params.entry.text });
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push({ type: 'console', text: msg.params.args.map((a) => a.value ?? a.description).join(' ') });
      }
    };
  }
  async ready() { if (this.ws.readyState === 1) return; await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify({text:r.exceptionDetails.text,desc:r.exceptionDetails.exception?.description,stack:r.exceptionDetails.stackTrace}));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

const target = await createTarget('about:blank');
const cdp = new CDP(target.webSocketDebuggerUrl);
await cdp.ready();
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Page.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

async function nav(url, settle = 1200) {
  await cdp.send('Page.navigate', { url });
  await sleep(settle);
}
async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}

const results = { base: BASE, viewport: null, menu: null, runs: [], errors: [] };
await nav(`${BASE}?${CACHE}`);
results.viewport = await cdp.eval('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})');
results.menu = await cdp.eval(`({title:document.title, pauseHidden:document.querySelector('#pauseOverlay').classList.contains('hidden'), modes:document.querySelectorAll('.lab-mode').length, startHidden:document.querySelector('#startOverlay').classList.contains('hidden')})`);
await shot('01-lab-menu');

const runs = [
  ['none', 'dense', 6000],
  ['S1', 'dense', 7000],
  ['S3', 'dense', 3500],
  ['S2', 'dense', 8000],
  ['C2', 'dense', 8000],
  ['C1', 'dense', 6000],
  ['C3', 'dense', 7000],
  ['none', 'pressure', 5000]
];
for (let i = 0; i < runs.length; i++) {
  const [mode, scenario, wait] = runs[i];
  await nav(`${BASE}?${CACHE}&test=1&mode=${mode}&scenario=${scenario}`, wait);
  const s = await cdp.eval(`(()=>{const s=window.__pinballLabTest.stats();const st=window.__pinballState();return {mode:s.mode,scenario:s.scenario,phase:s.phase,elapsed:s.elapsed,bricks:s.bricks,balls:s.balls,maxBalls:s.maxBalls,stats:s.stats,fps:st.fpsNow,quality:st.renderQuality,canvas:{w:document.querySelector('#game').width,h:document.querySelector('#game').height,cssW:document.querySelector('#game').clientWidth,cssH:document.querySelector('#game').clientHeight},hud:document.querySelector('#labHud').innerText}})()`);
  results.runs.push(s);
  await shot(`0${i + 2}-${mode}-${scenario}`);
}
results.errors = cdp.errors.filter((e) => !/navigator\.vibrate/.test(e.text));
results.vibrateWarnings = cdp.errors.length - results.errors.length;
fs.writeFileSync(path.join(OUT, 'browser-check.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
cdp.close();
