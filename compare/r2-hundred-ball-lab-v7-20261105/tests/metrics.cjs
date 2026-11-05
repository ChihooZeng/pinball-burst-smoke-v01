'use strict';
// V7 对照指标：A(48球) / B(100球) / C(100球×2留存)。
// 只记录真实物理球与真实伤害，不含任何推断增伤。
const { createHarness } = require('./harness.cjs');

const MODES = process.argv[3] ? [process.argv[3]] : ['none','S1','M1','S8'];
const SECONDS = Number(process.argv[2] || 30);
const PHONE = { width: 390, height: 844 };

function measure(mode, field) {
  const h = createHarness(PHONE);
  if (!h.lab.start(mode, field)) return null;
  h.lab.setAim(0.1);
  let ballSum = 0, aliveSum = 0, samples = 0, peak = 0;
  for (let s = 0; s < SECONDS; s++) {
    for (let f = 0; f < 60; f++) {
      // 每 0.25 秒瞄向砖最多的地方（模拟真人转火）
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
    ballSum += st.balls; aliveSum += st.alive; peak = Math.max(peak, st.balls); samples++;
  }
  const s = h.lab.stats();
  return {
    mode, field,
    phase: s.phase,
    cap: s.ballCap,
    ballAvg: +(ballSum / samples).toFixed(1),
    ballPeak: peak,
    aliveAvg: +(aliveSum / samples).toFixed(1),
    hitsPerSec: +(s.stats.damageEvents / Math.max(0.1, s.elapsed)).toFixed(2),
    breaksPerSec: +(s.stats.breaks / Math.max(0.1, s.elapsed)).toFixed(2),
    breaks: s.stats.breaks,
    gap: s.stats.breakGapMax,
    refill: s.stats.refillSpawned,
    budget: s.refillBudget,
    clear: s.stats.clearTime ?? '-'
  };
}

const rows = [];
for (const mode of MODES) for (const field of ['A','B','C']) rows.push(measure(mode, field));
const pad = (v, n) => String(v).padStart(n);
console.log(`${SECONDS}s 对照 · 390x844 · 自动转火 · A=48球 / B=100球 / C=100球×2留存`);
console.log(['mode ','field','phase  ','cap','ballAvg','ballPeak','aliveAvg','hit/s','brk/s','gap','refill','budget','clear'].join(' '));
for (const r of rows) {
  console.log([
    r.mode.padEnd(5), r.field.padEnd(5), r.phase.padEnd(7), pad(r.cap, 3),
    pad(r.ballAvg, 7), pad(r.ballPeak, 8), pad(r.aliveAvg, 8),
    pad(r.hitsPerSec, 5), pad(r.breaksPerSec, 5), pad(r.gap, 5),
    pad(r.refill, 6), pad(r.budget, 6), pad(r.clear, 5)
  ].join(' '));
}
