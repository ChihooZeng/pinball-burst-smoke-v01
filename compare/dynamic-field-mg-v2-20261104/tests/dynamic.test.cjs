'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness.cjs');

const MODES = ['S1', 'C1', 'M1', 'M2'];
const FIELDS = ['A', 'B', 'C'];

function start(mode, field) {
  const h = createHarness();
  assert.equal(h.lab.start(mode, field), true, `${mode}/${field} start`);
  h.lab.setAim(0);
  return h;
}
function stats(h) { return h.lab.stats(); }

test('M1: 0.08s straight stream, real hits, 48-ball cap without stopping', () => {
  const h = start('M1', 'A');
  h.lab.setAim(0.1);
  h.frame(600); // 10s
  const s = stats(h);
  assert.ok(s.stats.mgShots >= 115, `M1 triggers ${s.stats.mgShots}`);
  assert.ok(s.stats.mgShots <= 135, `M1 triggers ${s.stats.mgShots}`);
  const rate = s.stats.mgShots / s.elapsed;
  assert.ok(rate > 11.5 && rate < 13.5, `M1 rate ${rate}`);
  assert.ok(s.stats.mgHits > 0, 'M1 must land real hits');
  assert.ok(s.maxBalls <= 48, `peak ${s.maxBalls}`);
  assert.equal(s.giantEnabled, false);
  assert.equal(s.giant, false);
});

test('M2: 0.15s three-ball fan, ~20 balls/s, independent real balls', () => {
  const h = start('M2', 'A');
  h.lab.setAim(0.1);
  h.frame(600);
  const s = stats(h);
  const volleyRate = s.stats.volleys / s.elapsed;
  const ballRate = s.stats.mgBalls / s.elapsed;
  assert.ok(s.stats.volleys >= 60 && s.stats.volleys <= 75, `volleys ${s.stats.volleys}`);
  assert.ok(volleyRate > 6.2 && volleyRate < 7.2, `volley rate ${volleyRate}`);
  assert.ok(ballRate > 18.5 && ballRate < 21.5, `ball rate ${ballRate}`);
  assert.ok(s.stats.mgHits > 0);
  assert.ok(s.maxBalls <= 48, `peak ${s.maxBalls}`);
  assert.equal(s.giantEnabled, false);
});

test('M1/M2 keep firing at the 48-ball cap by recycling oldest balls', () => {
  for (const mode of ['M1', 'M2']) {
    const h = start(mode, 'A');
    h.lab.setAim(0.1);
    h.lab.fillBalls(48);
    const before = stats(h).stats.mgShots;
    h.frame(180);
    const s = stats(h);
    assert.ok(s.stats.mgShots > before, `${mode} must keep firing at cap`);
    assert.ok(s.maxBalls <= 48, `${mode} peak ${s.maxBalls}`);
    assert.ok(s.stats.capRecycles > 0, `${mode} should recycle at cap`);
  }
});

test('real damage: one ordinary M1 projectile removes exactly 1 HP', () => {
  const h = createHarness();
  h.lab.start('M1', 'A');
  h.frame(24); // initial bricks have a 0.2s spawn-in window
  const target = h.lab.bricks()[0];
  h.lab.keepOnlyBrick(target.id);
  h.lab.setBrickHp(target.id, 10);
  h.lab.setShootClock(-1e9);
  h.lab.addBall(target.x + target.w / 2, target.y + target.h + 34, 0, -330, 'mg');
  h.frame(40);
  const after = h.lab.bricks().find((b) => b.id === target.id);
  assert.equal(after.hp, 9);
});

test('S1 retains bloom and no recursive bloom', () => {
  const h = start('S1', 'A');
  h.lab.setAim(0.1);
  h.frame(600);
  const s = stats(h);
  assert.ok(s.stats.bloomChildren > 0);
  assert.ok(s.stats.bloomRecursiveBlocked > 0);
  assert.ok(s.stats.maxBloomActive <= 14);
  assert.ok(s.maxBalls <= 48);
});

test('C1 retains micro electrodes and electric damage', () => {
  const h = start('C1', 'A');
  h.lab.setAim(0.1);
  h.frame(900);
  const s = stats(h);
  assert.ok(s.stats.bloomChildren > 0);
  assert.ok(s.stats.microPlaced > 0);
  assert.ok(s.stats.electricHits > 0);
  assert.ok(s.stats.maxMicros <= 2);
});

test('field A: top-only spawn, no mid warnings', () => {
  const h = start('M1', 'A');
  h.frame(600);
  const s = stats(h);
  assert.equal(s.field, 'A');
  assert.ok(s.stats.topSpawned > 0, 'top spawn must happen');
  assert.equal(s.stats.midSpawned, 0);
  assert.equal(s.stats.warningsShown, 0);
  assert.equal(s.warnings, 0);
});

test('field B: timed mid warning creates bricks away from danger line', () => {
  const h = start('M1', 'B');
  h.frame(1200);
  const s = stats(h);
  assert.ok(s.stats.warningsShown > 0, 'warnings must be visible');
  assert.ok(s.stats.midSpawned > 0, 'mid bricks must spawn');
  assert.ok(s.stats.spawnMinGap >= 120, `min danger gap ${s.stats.spawnMinGap}`);
  assert.ok(s.stats.warningMinGap >= 120, `warning gap ${s.stats.warningMinGap}`);
  assert.ok(s.stats.topSpawned >= 0);
  assert.equal(s.summoner, false);
});

test('field C: summoner core exists and its death stops summon budget', () => {
  const h = start('M2', 'C');
  h.lab.setAim(0.1);
  h.frame(1200);
  const s = stats(h);
  assert.ok(s.stats.warningsShown > 0);
  assert.ok(s.stats.midSpawned > 0);
  assert.ok(s.stats.spawnMinGap >= 120);
  assert.ok(s.stats.warningMinGap >= 120, `warning gap ${s.stats.warningMinGap}`);
  assert.ok(s.stats.summonerKilled > 0, 'summoner should be killed in this run');
  assert.equal(s.midRemaining, 0, 'death must close the remaining summon budget');
});

test('M1 clears all three fields with the deterministic aim bot', () => {
  for (const field of FIELDS) {
    const h = start('M1', field);
    let frames = 0;
    while (frames < 60 * 60) {
      h.frame(1); frames++;
      const s = h.lab.stats();
      if (s.phase !== 'playing') break;
      if (frames % 12 === 0) {
        const alive = h.lab.bricks().filter((b) => b.alive);
        if (alive.length) {
          const t = alive.reduce((a, b) => (b.y > a.y ? b : a));
          h.lab.setAim(Math.atan2(t.x + t.w / 2 - 180, 603 - (t.y + t.h / 2)));
        }
      }
    }
    const s = h.lab.stats();
    assert.equal(s.phase, 'complete', `${field} should clear, got ${s.phase}`);
    assert.ok(s.clearTime > 0 && s.clearTime < 60, `${field} clear ${s.clearTime}`);
  }
});

test('fixed aim 0 still produces danger-line failure pressure', () => {
  const h = start('S1', 'A');
  h.frame(60 * 30);
  const s = stats(h);
  assert.equal(s.phase, 'lost');
  assert.ok(s.failTime > 0 && s.failTime < 30, `fail ${s.failTime}`);
});

test('all 4 modes x 3 fields start and run without budget overflow', () => {
  for (const mode of MODES) {
    for (const field of FIELDS) {
      const h = start(mode, field);
      h.frame(240);
      const s = stats(h);
      assert.ok(['playing', 'lost', 'complete'].includes(s.phase), `${mode}/${field} ${s.phase}`);
      assert.ok(s.maxBalls <= 48, `${mode}/${field} peak ${s.maxBalls}`);
      assert.ok(s.topRemaining >= 0 && s.midRemaining >= 0);
    }
  }
});

test('pause/resume and restart/menu preserve the selected field', () => {
  const h = start('M2', 'B');
  h.frame(30);
  const before = stats(h).elapsed;
  h.click('pause');
  assert.equal(stats(h).phase, 'paused');
  h.frame(30);
  assert.equal(stats(h).elapsed, before);
  h.click('resume');
  assert.equal(stats(h).phase, 'playing');
  h.lab.restart();
  const s = stats(h);
  assert.equal(s.mode, 'M2');
  assert.equal(s.field, 'B');
  assert.equal(s.phase, 'playing');
  h.lab.menu();
  assert.equal(stats(h).active, false);
});

test('no hidden damage: all recorded direct hits are at most 1 point in M1/M2', () => {
  for (const mode of ['M1', 'M2']) {
    const h = start(mode, 'A');
    h.frame(300);
    const logs = stats(h).damageLog.filter((e) => e.source === 'mg');
    assert.ok(logs.length > 0);
    for (const e of logs) assert.ok(e.delta >= 0 && e.delta <= 1, `${mode} delta ${e.delta}`);
  }
});
