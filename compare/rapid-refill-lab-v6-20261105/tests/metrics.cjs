'use strict';
// V5 对照指标：同一初始盘面、同一瞄准角、同一时长，比较 A/B/C 的密度与破坏连续性。
const { createHarness } = require('./harness.cjs');

const MODES = process.argv[3] ? [process.argv[3]] : ['none','S1','M1','S8'];
const SECONDS = Number(process.argv[2] || 40);
const PHONE = { width: 390, height: 844 };

function measure(mode, field) {
  const h = createHarness(PHONE);
  if (!h.lab.start(mode, field)) return null;
  h.lab.setAim(0.1);
  let aliveSum = 0, lowSum = 0, samples = 0;
  for (let s = 0; s < SECONDS; s++) {
    // 模拟真人转火：每 0.25 秒瞄准"附近砖最多"的那一块（同时偏向更低的位置），
    // 避免固定瞄准把侧翼补阵误判成打不到，也避免只盯最低一块导致长空档。
    for (let f = 0; f < 60; f++) {
      if (f % 15 === 0) {
        const bs = h.lab.bricks().filter(b => b.alive);
        if (bs.length) {
          let best = bs[0], bestScore = -1;
          for (const b of bs) {
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            let n = 0;
            for (const o of bs) if (Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) < 70) n++;
            const score = n * 2 + cy / 100;
            if (score > bestScore) { bestScore = score; best = b; }
          }
          h.lab.setAim(Math.atan2(best.x + best.w / 2 - 180, -(best.y + best.h / 2 - (844 - 65))));
        }
      }
      h.frame(1);
    }
    const st = h.lab.stats();
    aliveSum += st.alive; lowSum += st.low; samples++;
  }
  const s = h.lab.stats();
  return {
    mode, field,
    phase: s.phase,
    aliveAvg: +(aliveSum / samples).toFixed(1),
    aliveMin: s.stats.liveMin,
    lowAvg: +(lowSum / samples).toFixed(1),
    breaks: s.stats.breaks,
    gap: s.stats.breakGapMax,
    batches: s.stats.batchBatches,
    spawned: s.stats.batchSpawned + s.stats.refillSpawned,
    delayed: s.stats.batchDelayed,
    times: s.stats.batchTimes || '-',
    req: s.stats.refillRequests,
    defer: s.stats.refillDeferred,
    hp: [s.stats.hpLow, s.stats.hpMid, s.stats.hpHigh],
    wait: s.stats.waitSeconds,
    clear: s.stats.clearTime ?? '-',
    peakBalls: s.maxBalls
  };
}

const rows = [];
for (const mode of MODES) for (const field of ['C','R1','R2']) rows.push(measure(mode, field));

const pad = (v, n) => String(v).padStart(n);
console.log(`${SECONDS}s 对照 · 390x844 · 自动转火 · C(V5批次) / R1(极速H1) / R2(极速H2)`);
console.log(['mode ','field','phase  ','aliveAvg','lowAvg','breaks','maxGap','batch','spawnR','req','defer','clear','peak','hpL/M/H'].join(' '));
for (const r of rows) {
  console.log([
    r.mode.padEnd(5), r.field.padEnd(5), r.phase.padEnd(7),
    pad(r.aliveAvg, 8), pad(r.lowAvg, 6),
    pad(r.breaks, 6), pad(r.gap, 6), pad(r.batches, 5), pad(r.spawned, 6),
    pad(r.req, 5), pad(r.defer, 5), pad(r.clear, 5), pad(r.peakBalls, 4),
    r.hp.join('/')
  ].join(' '));
}
