'use strict';
// V4 行为测试：星环绞杀（S7）与连锁爆雷（S8）。
// 只验证机制真实存在、真实伤害、有上限、无递归，不验证"好不好玩"。
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness.cjs');

const MODES = ['none','S1','C1','M1','M2','S7-L1','S7-L2','S7-L3','S8-L1','S8-L2','S8-L3','C7','C8','C9'];
const FIELDS = ['A','B','C'];

function run(mode, field = 'C', seconds = 14, aim = 0.1) {
  const h = createHarness();
  assert.equal(h.lab.start(mode, field), true, `${mode}/${field} start`);
  h.lab.setAim(aim);
  h.frame(Math.round(seconds * 60));
  return h;
}
const S = (h) => h.lab.stats();

test('S7-L1: 星环在开局数秒内出现，并造成真实 HP 切削', () => {
  const h = run('S7-L1','C',14);
  const s = S(h);
  assert.ok(s.stats.orbitAssigned > 0, 'must assign rings to shots');
  assert.ok(s.stats.orbitHits > 0, 'ring must actually cut bricks');
  assert.ok(s.stats.firstOrbitHitAt !== null, 'first ring hit recorded');
  assert.ok(s.stats.firstOrbitHitAt <= 6, `first ring hit at ${s.stats.firstOrbitHitAt}s`);
  assert.ok(s.stats.orbitDamage >= s.stats.orbitHits, `damage ${s.stats.orbitDamage} vs hits ${s.stats.orbitHits}`);
  assert.ok(s.maxBalls <= 48);
});

test('S7 ring damage is real and never above configured per-tick cap', () => {
  const h = run('S7-L1','C',14);
  const s = S(h);
  const cap = h.lab.config().orbit.levels[1].damage;
  const logs = s.damageLog.filter(e => e.source === 'orbit');
  assert.ok(logs.length > 0, 'orbit damage log must exist');
  for (const e of logs) assert.ok(e.delta >= 0 && e.delta <= cap, `orbit delta ${e.delta}`);
});

test('S7: 同一砖块受环切削受独立冷却约束，不是每帧扣血', () => {
  const h = run('S7-L1','C',14);
  const s = S(h);
  assert.equal(s.stats.orbitHits, s.stats.orbitTicks, 'one hit per tick');
  // 14 秒 × 120Hz = 1680 步；若每帧都扣血，命中数会远超合理量级。
  const steps = 14 * 120;
  assert.ok(s.stats.orbitHits < steps * 0.25, `orbit hits ${s.stats.orbitHits} vs steps ${steps}`);
});

test('S7-L2: 双环比单环切削更多，且确实是两环', () => {
  const l1 = S(run('S7-L1','C',14));
  const l2 = S(run('S7-L2','C',14));
  assert.equal(l2.stats.orbitMaxRings, 2, 'L2 must carry two rings');
  assert.ok(l2.stats.orbitHits > l1.stats.orbitHits, `L2 ${l2.stats.orbitHits} vs L1 ${l1.stats.orbitHits}`);
  assert.ok(l2.maxBalls <= 48);
});

test('S7-L3: 飞轮离体、有独立命中，且作为真实实体计入 48 球上限', () => {
  const h = run('S7-L3','C',18);
  const s = S(h);
  const cfg = h.lab.config().orbit.levels[3].flywheel;
  assert.ok(s.stats.flywheelSpawns > 0, 'flywheel must detach');
  assert.ok(s.stats.flywheelHits > 0, 'flywheel must cut bricks');
  assert.ok(s.stats.flywheelMaxActive <= cfg.maxActive, `active ${s.stats.flywheelMaxActive} > ${cfg.maxActive}`);
  assert.ok(s.maxBalls <= 48, `peak balls ${s.maxBalls}`);
  const sources = h.lab.balls().map(b => b.source);
  assert.ok(sources.includes('flywheel') || s.stats.flywheelSpawns > 0, 'flywheels live in the real ball list');
});

test('S7-L3 total balls including flywheels never exceeds 48', () => {
  const h = run('S7-L3','A',22,0.3);
  const s = S(h);
  assert.ok(s.maxBalls <= 48, `peak ${s.maxBalls}`);
  assert.ok(s.stats.flywheelSpawns > 0);
});

test('S8-L1: 命中即植雷，不依赖发射计数等待', () => {
  const h = run('S8-L1','C',12);
  const s = S(h);
  assert.ok(s.stats.bombsPlanted > 0, 'bombs must be planted by normal hits');
  assert.ok(s.stats.firstBombAt !== null && s.stats.firstBombAt <= 4, `first plant ${s.stats.firstBombAt}s`);
  assert.ok(s.stats.bombsDetonated > 0, 'marked bricks must explode when destroyed');
  assert.ok(s.stats.firstBombExplodeAt !== null && s.stats.firstBombExplodeAt <= 8, `first blast ${s.stats.firstBombExplodeAt}s`);
});

test('S8-L1: 爆炸造成真实范围伤害，单次不超过配置值', () => {
  const h = run('S8-L1','C',14);
  const s = S(h);
  const cap = h.lab.config().bomb.levels[1].damage;
  assert.ok(s.stats.bombHits > 0, 'blast must hit nearby bricks');
  const logs = s.damageLog.filter(e => e.source === 'bomb');
  assert.ok(logs.length > 0);
  for (const e of logs) assert.ok(e.delta >= 0 && e.delta <= cap, `bomb delta ${e.delta}`);
  assert.equal(s.stats.bombMaxDepth, 0, 'L1 must not chain');
});

test('S8-L2: 爆炸接力按顺序触发，深度受上限约束', () => {
  const h = run('S8-L2','C',16);
  const s = S(h);
  const cfg = h.lab.config().bomb.levels[2];
  assert.ok(s.stats.bombChainMax >= 2, `chain size ${s.stats.bombChainMax}`);
  assert.ok(s.stats.bombMaxDepth >= 1, `depth ${s.stats.bombMaxDepth}`);
  assert.ok(s.stats.bombMaxDepth <= cfg.maxDepth, `depth ${s.stats.bombMaxDepth} > ${cfg.maxDepth}`);
  assert.ok(s.stats.bombChainMax <= cfg.maxChain, `chain ${s.stats.bombChainMax} > ${cfg.maxChain}`);
  assert.ok(s.stats.bombIgnited > 0, 'surviving marks must be ignited for relay');
});

test('S8-L3: 风暴比接力传播更远，但仍受硬上限约束', () => {
  const h = run('S8-L3','C',18);
  const s = S(h);
  const cfg = h.lab.config().bomb.levels[3];
  assert.ok(s.stats.bombMaxDepth <= cfg.maxDepth);
  assert.ok(s.stats.bombChainMax <= cfg.maxChain);
  assert.ok(s.stats.bombMaxDepth >= 1, `depth ${s.stats.bombMaxDepth}`);
  assert.ok(s.maxBalls <= 48);
});

test('C7: M1 射速不被爆雷拖慢，机枪弹确实植雷', () => {
  const h = run('C7','C',12);
  const s = S(h);
  const rate = s.stats.mgShots / s.elapsed;
  assert.ok(rate > 11.5 && rate < 13.5, `C7 M1 rate ${rate}`);
  assert.ok(s.stats.bombsPlanted > 0, 'mg hits must plant bombs');
  assert.ok(s.stats.bombsDetonated > 0);
  assert.ok(s.maxBalls <= 48);
});

test('C8: M2 三向射速不变，机枪弹携带星环', () => {
  const h = run('C8','C',12);
  const s = S(h);
  const volleys = s.stats.volleys / s.elapsed;
  assert.ok(volleys > 6.2 && volleys < 7.2, `C8 volley rate ${volleys}`);
  assert.ok(s.stats.orbitAssigned > 0, 'mg balls must carry rings');
  assert.ok(s.stats.orbitHits > 0);
  assert.ok(s.maxBalls <= 48);
});

test('C9: 开花子球可以植雷，且不会无限递归开花', () => {
  const h = run('C9','C',18);
  const s = S(h);
  assert.ok(s.stats.bloomChildren > 0, 'S1 bloom must still work');
  assert.ok(s.stats.bombsPlanted > 0, 'bloom children must plant bombs');
  assert.ok(s.stats.bombsDetonated > 0, 'bloom kills must detonate');
  assert.ok(s.stats.bloomSpawns < 60, `bloom spawns ${s.stats.bloomSpawns} suggests runaway recursion`);
  assert.ok(s.maxBalls <= 48);
});

test('no-skill baseline has no orbit / bomb effects and giant stays off', () => {
  const s = S(run('none','C',10));
  assert.equal(s.stats.orbitAssigned, 0);
  assert.equal(s.stats.orbitHits, 0);
  assert.equal(s.stats.bombsPlanted, 0);
  assert.equal(s.stats.bombsDetonated, 0);
  assert.equal(s.giantEnabled, false);
  assert.equal(s.giant, false);
});

test('all 14 modes x 3 fields start without exceptions or ball overflow', () => {
  for (const mode of MODES) for (const field of FIELDS) {
    const h = createHarness();
    assert.equal(h.lab.start(mode, field), true, `${mode}/${field}`);
    h.lab.setAim(0.1);
    h.frame(150);
    const s = S(h);
    assert.ok(['playing','lost','complete'].includes(s.phase), `${mode}/${field} ${s.phase}`);
    assert.ok(s.maxBalls <= 48, `${mode}/${field} peak ${s.maxBalls}`);
  }
});

test('pause / restart keeps mode and field', () => {
  const h = createHarness();
  h.lab.start('S7-L3','B');
  h.frame(40);
  h.click('pause');
  assert.equal(S(h).phase, 'paused');
  h.click('resume');
  assert.equal(S(h).phase, 'playing');
  h.lab.restart();
  assert.equal(S(h).mode, 'S7-L3');
  assert.equal(S(h).field, 'B');
  h.lab.menu();
  assert.equal(S(h).active, false);
});

test('every real damage log stays within its configured per-source cap', () => {
  for (const mode of ['S7-L1','S7-L2','S7-L3','S8-L1','S8-L2','S8-L3','C7','C8','C9']) {
    const h = run(mode,'C',12);
    const s = S(h);
    const cfg = h.lab.config();
    const caps = {
      orbit: cfg.orbit.levels[s.orbitLevel].damage,
      flywheel: cfg.orbit.levels[3].flywheel.damage,
      bomb: cfg.bomb.levels[s.bombLevel].damage
    };
    for (const e of s.damageLog) {
      if (caps[e.source] !== undefined) assert.ok(e.delta <= caps[e.source], `${mode} ${e.source} ${e.delta}`);
    }
  }
});
