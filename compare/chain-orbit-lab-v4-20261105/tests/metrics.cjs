'use strict';
// 爽感验收指标：首次触发时间 / 10 秒有效攻击次数 / 30 秒技能活跃占比。
// 这些是"机制是否真的在场上持续工作"的客观口径，不能代替真人试玩。
const { createHarness } = require('./harness.cjs');

const MODES = ['none','S1','C1','M1','M2','S7-L1','S7-L2','S7-L3','S8-L1','S8-L2','S8-L3','C7','C8','C9'];

function measure(mode, seconds, aim = 0.1) {
  const h = createHarness();
  if (!h.lab.start(mode, 'C')) return null;
  h.lab.setAim(aim);
  const snapshots = [];
  const total = Math.round(seconds * 60);
  for (let i = 0; i < total; i++) {
    h.frame(1);
    if ((i + 1) % 600 === 0) {
      const s = h.lab.stats();
      snapshots.push({ t: (i + 1) / 60, hits: s.stats.orbitHits + s.stats.flywheelHits + s.stats.bombHits + s.stats.primaryHits + s.stats.mgHits + s.stats.derivedHits });
    }
  }
  const s = h.lab.stats();
  const at10 = snapshots.find(x => x.t === 10) || snapshots[snapshots.length - 1];
  const skillHits = s.stats.orbitHits + s.stats.flywheelHits + s.stats.bombHits;
  return {
    mode,
    firstTrigger: s.stats.firstOrbitHitAt ?? s.stats.firstBombExplodeAt,
    hits10s: at10 ? at10.hits : 0,
    skillHits,
    activeRatio: +(Math.max(s.stats.orbitActiveSeconds, s.stats.bombActiveSeconds) / Math.max(0.1, s.elapsed)).toFixed(2),
    peakBalls: s.maxBalls,
    bricks: s.bricks,
    cleared: s.cleared
  };
}

const seconds = Number(process.argv[2] || 30);
const rows = MODES.map(m => measure(m, seconds)).filter(Boolean);
const pad = (v, n) => String(v).padStart(n);
console.log(`mode      firstTrig  hits@10s  skillHits  active%  peakBalls  bricks  cleared  (${seconds}s)`);
for (const r of rows) {
  console.log([
    r.mode.padEnd(9),
    pad(r.firstTrigger ?? '-', 9),
    pad(r.hits10s, 9),
    pad(r.skillHits, 10),
    pad((r.activeRatio * 100).toFixed(0) + '%', 8),
    pad(r.peakBalls, 10),
    pad(r.bricks, 7),
    pad(r.cleared ? 'yes' : 'no', 8)
  ].join(' '));
}
