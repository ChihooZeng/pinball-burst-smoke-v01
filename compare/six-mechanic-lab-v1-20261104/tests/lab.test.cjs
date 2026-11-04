'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness.cjs');

const MODES = ['none', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'C1', 'C2', 'C3'];
const SCENARIOS = ['dense', 'sparse', 'pressure'];

function run(mode, scenario, frames = 600, aim = -0.08) {
  const h = createHarness();
  assert.equal(h.lab.start(mode, scenario), true, `start ${mode}/${scenario}`);
  h.lab.setAim(aim);
  h.frame(frames);
  return h;
}

function stats(h) { return h.lab.stats(); }

test('baseline: real damage is exactly 1 per ordinary hit, no mechanic counters', () => {
  const h = run('none', 'dense', 600);
  const s = stats(h);
  assert.equal(s.active, true);
  assert.ok(s.stats.primaryHits > 0, 'baseline must land hits');
  assert.equal(s.stats.bloomChildren, 0);
  assert.equal(s.stats.mergeCharges, 0);
  assert.equal(s.stats.electrodePlaced, 0);
  assert.equal(s.stats.overloadPulses, 0);
  assert.equal(s.stats.dualShots, 0);
  assert.equal(s.stats.barrageWindows, 0);
  assert.ok(s.maxBalls <= 48, 'ball cap');
  const cannonLogs = s.damageLog.filter((e) => e.source === 'cannon');
  assert.ok(cannonLogs.length > 0);
  for (const e of cannonLogs) {
    assert.ok(e.delta >= 0 && e.delta <= 1, `ordinary hit delta must be <=1, got ${e.delta}`);
  }
});

test('damage probe: one ordinary projectile removes exactly 1 HP from a 10-HP brick', () => {
  const h = createHarness();
  h.lab.start('none', 'dense');
  const target = h.lab.bricks()[0];
  h.lab.keepOnlyBrick(target.id);
  h.lab.setBrickHp(target.id, 10);
  h.lab.setShootClock(-1e9);
  h.lab.addBall(target.x + target.w / 2, target.y + target.h + 34, 0, -330);
  h.frame(40);
  const after = h.lab.bricks().find((b) => b.id === target.id);
  assert.equal(after.hp, 9, 'exactly one point of real damage');
  const log = h.lab.stats().damageLog.filter((e) => e.source === 'cannon');
  assert.ok(log.length > 0);
  assert.equal(log.at(-1).delta, 1);
});

test('S1 bloom: finite children, no recursive bloom, cap respected', () => {
  const s = stats(run('S1', 'dense', 900));
  assert.ok(s.stats.bloomSpawns > 0);
  assert.ok(s.stats.bloomChildren > 0);
  assert.ok(s.stats.bloomRecursiveBlocked > 0, 'derived breaks were observed and did not bloom');
  assert.ok(s.stats.maxBloomActive <= 14, `bloom active budget, got ${s.stats.maxBloomActive}`);
  assert.ok(s.maxBalls <= 48);
  assert.equal(s.stats.mergeCharges, 0);
});

test('S2 merge: charge ball hits, pierces and scatters shards', () => {
  const s = stats(run('S2', 'dense', 1200, -0.08));
  assert.ok(s.stats.mergeCharges > 0, 'at least one charge ball');
  assert.ok(s.stats.mergeHits > 0, 'charge ball must land real hits');
  assert.ok(s.stats.mergeShards > 0, 'charge ball scatters shards');
  assert.ok(s.stats.chargeContacts > 0);
  assert.ok(s.maxBalls <= 48);
});

test('S3 lightning rods: finite electrodes and real line damage', () => {
  const s = stats(run('S3', 'dense', 1200));
  assert.ok(s.stats.electrodePlaced > 0);
  assert.ok(s.stats.electricPulses > 0);
  assert.ok(s.stats.electricHits > 0);
  assert.ok(s.stats.electricDamage > 0);
  assert.ok(s.stats.maxElectrodes <= 3, `electrode cap, got ${s.stats.maxElectrodes}`);
  assert.equal(s.stats.maxMicros, 0);
  assert.equal(s.stats.overloadPulses, 0);
});

test('S4 overload: local pulses damage targets once and do not recharge themselves', () => {
  const s = stats(run('S4', 'dense', 1200));
  assert.ok(s.stats.overloadPulses > 0);
  assert.ok(s.stats.overloadHits > 0);
  assert.ok(s.stats.overloadDamage > 0);
  assert.ok(s.stats.overloadPulses <= Math.ceil(s.stats.primaryHits / 7) + 1,
    `pulse count ${s.stats.overloadPulses} should follow primary hits ${s.stats.primaryHits}`);
  assert.equal(s.stats.electricHits, 0);
});

test('S5 dual cannon: both muzzles fire and cross the aim line', () => {
  const s = stats(run('S5', 'dense', 900));
  assert.ok(s.stats.dualShots > 0);
  assert.ok(s.stats.dualLeft > 0);
  assert.ok(s.stats.dualRight > 0);
  assert.ok(s.stats.primaryHits > 0);
  assert.ok(s.maxBalls <= 48);
});

test('S6 barrage: short burst window with cooldown, not permanent', () => {
  const s = stats(run('S6', 'dense', 1200));
  assert.ok(s.stats.barrageWindows > 0);
  assert.ok(s.stats.barrageShots > 0);
  assert.ok(s.stats.barrageWindows <= 4, `too many windows in 20s: ${s.stats.barrageWindows}`);
  assert.equal(s.stats.dualShots, 0);
});

test('C1 thunder-bloom: micro electrodes connect, no micro recursion', () => {
  const s = stats(run('C1', 'dense', 1200));
  assert.ok(s.stats.bloomChildren > 0);
  assert.ok(s.stats.microPlaced > 0);
  assert.ok(s.stats.maxMicros <= 2, `micro cap, got ${s.stats.maxMicros}`);
  assert.ok(s.stats.electricHits > 0);
  assert.ok(s.stats.microPlaced <= s.stats.bloomChildren, 'micros only from bloom child first hits');
});

test('C2 overload core: charge ball carries one core burst, not repeated', () => {
  const s = stats(run('C2', 'dense', 1200, -0.08));
  assert.ok(s.stats.mergeCharges > 0);
  assert.ok(s.stats.coreCharges > 0);
  assert.ok(s.stats.corePulses > 0);
  assert.ok(s.stats.coreHits > 0);
  assert.ok(s.stats.corePulses <= s.stats.coreCharges, 'one core burst per charge ball at most');
});

test('C3 crossfire: dual + barrage produce staggered cross shots', () => {
  const s = stats(run('C3', 'dense', 1200, -0.08));
  assert.ok(s.stats.dualShots > 0);
  assert.ok(s.stats.barrageWindows > 0);
  assert.ok(s.stats.crossShots > 0);
  assert.ok(s.stats.dualLeft > 0 && s.stats.dualRight > 0);
  assert.ok(s.maxBalls <= 48);
});

test('pause and resume preserve the run; pointer drag changes aim', () => {
  const h = createHarness();
  h.lab.start('none', 'dense');
  h.pointer(60);
  assert.ok(Math.abs(h.state().aim) > 0.1, 'pointer drag must move aim');
  h.frame(30);
  const before = h.lab.stats().elapsed;
  h.click('pause');
  assert.equal(h.lab.stats().phase, 'paused');
  assert.equal(h.el('pauseOverlay').classList.contains('hidden'), false);
  h.frame(30);
  assert.equal(h.lab.stats().elapsed, before, 'pause must stop simulation time');
  h.click('resume');
  assert.equal(h.lab.stats().phase, 'playing');
  h.frame(10);
  assert.ok(h.lab.stats().elapsed > before);
});

test('ball budget: filling 48 balls then triggering mechanics never exceeds 48', () => {
  const h = createHarness();
  h.lab.start('C1', 'dense');
  h.lab.setAim(-0.08);
  h.lab.fillBalls(48);
  assert.equal(h.lab.stats().balls, 48);
  h.frame(180);
  const s = stats(h);
  assert.ok(s.maxBalls <= 48, `peak ${s.maxBalls}`);
  assert.ok(s.balls <= 48, `current ${s.balls}`);
});

test('all 10 modes run in all 3 fixed scenarios without exceptions or budget overflow', () => {
  for (const mode of MODES) {
    for (const scenario of SCENARIOS) {
      const h = createHarness();
      assert.equal(h.lab.start(mode, scenario), true, `${mode}/${scenario}`);
      h.lab.setAim(-0.08);
      h.frame(240);
      const s = stats(h);
      assert.equal(s.active, true, `${mode}/${scenario} active`);
      assert.ok(['playing', 'lost', 'complete'].includes(s.phase), `${mode}/${scenario} phase ${s.phase}`);
      assert.ok(s.maxBalls <= 48, `${mode}/${scenario} peak ${s.maxBalls}`);
      assert.ok(s.stats.damageEvents >= 0);
    }
  }
});

test('scenario clear path and result overlay', () => {
  const h = createHarness();
  h.lab.start('C3', 'dense');
  h.lab.setAim(-0.08);
  h.frame(60);
  h.lab.clearBricks();
  h.frame(10);
  const s = stats(h);
  assert.equal(s.cleared, true);
  assert.equal(s.phase, 'complete');
  assert.equal(h.el('labResult').classList.contains('hidden'), false);
  assert.match(h.el('labResultTitle').textContent, /场景清空/);
});

test('pressure scenario can actually fail at the danger line', () => {
  const h = createHarness();
  h.lab.start('none', 'pressure');
  h.lab.setAim(0);
  let failed = false;
  for (let i = 0; i < 40; i++) {
    h.frame(300);
    if (stats(h).phase === 'lost') { failed = true; break; }
  }
  assert.equal(failed, true, 'pressure must be able to fail');
  assert.equal(h.el('labResult').classList.contains('hidden'), false);
});

test('restart and return-to-menu keep the lab isolated', () => {
  const h = createHarness();
  h.lab.start('S4', 'dense');
  h.frame(120);
  assert.equal(h.lab.restart(), true);
  let s = stats(h);
  assert.equal(s.mode, 'S4');
  assert.equal(s.scenario, 'dense');
  assert.equal(s.phase, 'playing');
  h.lab.menu();
  s = stats(h);
  assert.equal(s.active, false);
  assert.equal(h.el('startOverlay').classList.contains('hidden'), false);
});
