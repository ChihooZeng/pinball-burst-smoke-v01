'use strict';
// Deterministic bot: aims at the lowest live brick, then records clear/fail.
// It never clears bricks or changes damage directly.
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./harness.cjs');
const MODES = ['S1', 'C1', 'M1', 'M2'];
const FIELDS = ['A', 'B', 'C'];
const MAX_SECONDS = 75;
const results = [];
for (const mode of MODES) {
  for (const field of FIELDS) {
    const h = createHarness();
    const started = h.lab.start(mode, field);
    if (!started) throw new Error('start failed ' + mode + '/' + field);
    let frames = 0;
    const maxFrames = Math.round(MAX_SECONDS * 60);
    while (frames < maxFrames) {
      h.frame(1);
      frames++;
      const s = h.lab.stats();
      if (s.phase !== 'playing') break;
      if (frames % 12 === 0) {
        const alive = h.lab.bricks().filter((b) => b.alive);
        if (alive.length) {
          const target = alive.reduce((a, b) => (b.y > a.y ? b : a));
          const cx = target.x + target.w / 2;
          const cy = target.y + target.h / 2;
          h.lab.setAim(Math.atan2(cx - 180, 603 - cy));
        }
      }
    }
    const s = h.lab.stats();
    // Same field/mode, fixed aim 0: records whether the field alone creates failure pressure.
    const h2 = createHarness();
    h2.lab.start(mode, field);
    h2.lab.setAim(0);
    const passiveMax = 60 * 60;
    let passiveFrames = 0;
    while (passiveFrames < passiveMax) {
      h2.frame(1);
      passiveFrames++;
      if (h2.lab.stats().phase !== 'playing') break;
    }
    const p = h2.lab.stats();
    results.push({
      mode, field,
      phase: s.phase,
      elapsed: s.elapsed,
      bricksLeft: s.bricks,
      peakBalls: s.maxBalls,
      clearTime: s.clearTime,
      failTime: s.failTime,
      fireRate: s.fireRate,
      ballRate: s.ballRate,
      mgShots: s.stats.mgShots,
      mgBalls: s.stats.mgBalls,
      capRecycles: s.stats.capRecycles,
      topSpawned: s.stats.topSpawned,
      midSpawned: s.stats.midSpawned,
      warnings: s.stats.warningsShown,
      minDangerGap: s.stats.spawnMinGap,
      summonerKilled: s.stats.summonerKilled,
      breaks: s.stats.damageEvents,
      passive: { phase: p.phase, elapsed: p.elapsed, failTime: p.failTime, clearTime: p.clearTime, peakBalls: p.maxBalls, bricksLeft: p.bricks }
    });
    console.log(mode, field, s.phase, 't=' + s.elapsed.toFixed(1), 'peak=' + s.maxBalls, 'clear=' + s.clearTime, 'fail=' + s.failTime, 'fire=' + s.fireRate, 'ball=' + s.ballRate, '| passive', p.phase, p.failTime);
  }
}
const out = path.join(__dirname, '..', 'artifacts', 'dynamic-results.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), maxSeconds: MAX_SECONDS, results }, null, 2));
console.log('wrote', out);
