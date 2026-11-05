'use strict';
// V5 行为测试：A 零星 / B 定时 / C 破坏驱动。
// 只验证"补阵是否真的发生、是否按规则发生、是否会破坏清屏与碰撞"。
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness.cjs');

const MODES = ['none','S1','M1','S8'];
const FIELDS = ['A','B','C'];
const PHONE = { width: 390, height: 844 };

function run(mode, field, seconds = 30, aim = 0.1) {
  const h = createHarness(PHONE);
  assert.equal(h.lab.start(mode, field), true, `${mode}/${field} start`);
  h.lab.setAim(aim);
  h.frame(Math.round(seconds * 60));
  return h;
}
const S = (h) => h.lab.stats();

test('A: 保持历史零星补砖，没有成片补阵', () => {
  const s = S(run('M1','A',25));
  assert.equal(s.stats.batchBatches, 0, 'A must not use batches');
  assert.equal(s.stats.batchSpawned, 0);
  assert.ok(s.stats.topSpawned >= 0);
  assert.ok(s.maxBalls <= 48);
});

test('B: 30 秒内完成 3 批、总量不超 72 块', () => {
  const s = S(run('S1','B',30));
  assert.equal(s.stats.batchBatches, 3, `batches ${s.stats.batchBatches}`);
  assert.ok(s.stats.batchSpawned > 0 && s.stats.batchSpawned <= 72, `spawned ${s.stats.batchSpawned}`);
  assert.ok(s.stats.batchFirstAt !== null && s.stats.batchFirstAt <= 7, `first ${s.stats.batchFirstAt}`);
  const times = String(s.stats.batchTimes).split('/').filter(Boolean).map(Number);
  assert.equal(times.length, 3, `times ${s.stats.batchTimes}`);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i-1] >= 8, `interval ${times}`);
});

test('B/C 使用完全相同的初始盘面与 HP 分布', () => {
  const b = createHarness(PHONE), c = createHarness(PHONE);
  b.lab.start('none','B'); c.lab.start('none','C');
  const key = (h) => h.lab.bricks().map(x => `${x.x},${x.y},${x.hp}`).sort().join('|');
  assert.equal(key(b), key(c), 'initial layout must match');
  assert.equal(S(b).stats.batchBudget, S(c).stats.batchBudget);
});

test('C: 补阵由破坏进度触发，且首批明显早于 B 的固定节奏之外', () => {
  const s = S(run('S8','C',30));
  assert.ok(s.stats.batchBatches >= 2, `batches ${s.stats.batchBatches}`);
  assert.ok(s.stats.batchFirstAt !== null && s.stats.batchFirstAt < 10, `first ${s.stats.batchFirstAt}`);
  assert.ok(s.stats.batchSpawned <= 72);
  const cfg = createHarness(PHONE).lab.config().fields.C.batch.trigger;
  assert.ok(cfg.minGap >= 2.5);
});

test('C: 最短间隔不小于配置值', () => {
  const h = createHarness(PHONE);
  h.lab.start('S8','C'); h.lab.setAim(0.1);
  const times = [];
  for (let i = 0; i < 60; i++) {
    h.frame(60);
    const t = String(h.lab.stats().stats.batchTimes).split('/').filter(Boolean).map(Number);
    if (t.length > times.length) times.push(...t.slice(times.length));
  }
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] - times[i-1] >= 2.5 - 0.05, `gap ${times[i] - times[i-1]}`);
  }
});

test('补阵砖块不与现有砖块重叠', () => {
  const h = run('M1','B',28);
  const bs = h.lab.bricks().filter(x => x.alive);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    assert.equal(overlap, false, `overlap ${a.id} / ${b.id}`);
  }
});

test('B/C 补阵位置距危险线至少 120px', () => {
  for (const f of ['B','C']) {
    const s = S(run('S1', f, 26));
    assert.ok(s.stats.spawnMinGap === null || s.stats.spawnMinGap >= 120, `${f} gap ${s.stats.spawnMinGap}`);
    assert.equal(s.stats.unfairCross, 0, `${f} unfair crossing`);
  }
});

test('清屏立即过关，未用预算与预警一并取消', () => {
  const h = createHarness(PHONE);
  h.lab.start('M1','B'); h.lab.setAim(0.1);
  h.frame(60 * 8);                       // 至少已排入第一批预警
  h.lab.clearBricks();                   // 真实砖块全部清空
  h.frame(3);
  const s = S(h);
  assert.equal(s.phase, 'complete', `phase ${s.phase}`);
  assert.equal(s.batchWarnings, 0, 'warnings must be cancelled');
  assert.ok(s.stats.batchCancelled > 0, `cancelled ${s.stats.batchCancelled}`);
});

test('空间不足时补阵会推迟而不是硬塞', () => {
  const h = createHarness(PHONE);
  h.lab.config().fields.B.batch.maxAlive = 40;   // 人为压缩可用空间
  h.lab.start('M1','B'); h.lab.setAim(0.1);
  h.frame(60 * 12);
  const s = S(h);
  assert.ok(s.stats.batchDelayed > 0, 'must delay when crowded');
  assert.ok(s.stats.batchSpawned <= 24, `spawned ${s.stats.batchSpawned}`);
});

test('三种战场都能正常清空并结束（不再等刷新）', () => {
  for (const f of ['A','B','C']) {
    const h = createHarness(PHONE);
    h.lab.start('S8', f); h.lab.setAim(0.1);
    h.frame(60 * 6);
    h.lab.clearBricks();
    h.frame(3);
    assert.equal(S(h).phase, 'complete', `${f} did not clear immediately`);
  }
});

test('all 4 skills x 3 fields start and stay within ball cap', () => {
  for (const mode of MODES) for (const field of FIELDS) {
    const h = createHarness(PHONE);
    assert.equal(h.lab.start(mode, field), true, `${mode}/${field}`);
    h.lab.setAim(0.1);
    h.frame(180);
    const s = S(h);
    assert.ok(['playing','lost','complete'].includes(s.phase), `${mode}/${field} ${s.phase}`);
    assert.ok(s.maxBalls <= 48, `${mode}/${field} peak ${s.maxBalls}`);
  }
});

test('技能参数未被战场改动：S1 子球、M1 射速、S8 爆雷仍在', () => {
  const s1 = S(run('S1','C',14));
  assert.ok(s1.stats.bloomChildren > 0, 'S1 bloom must still work');
  const m1 = S(run('M1','C',12));
  const rate = m1.stats.mgShots / m1.elapsed;
  assert.ok(rate > 11.5 && rate < 13.5, `M1 rate ${rate}`);
  const s8 = S(run('S8','C',14));
  assert.ok(s8.stats.bombsPlanted > 0 && s8.stats.bombsDetonated > 0, 'S8 must still plant and detonate');
});

test('pause / restart keeps mode and field', () => {
  const h = createHarness(PHONE);
  h.lab.start('S8','B');
  h.frame(40);
  h.click('pause');
  assert.equal(S(h).phase, 'paused');
  h.click('resume');
  assert.equal(S(h).phase, 'playing');
  h.lab.restart();
  assert.equal(S(h).mode, 'S8');
  assert.equal(S(h).field, 'B');
  h.lab.menu();
  assert.equal(S(h).active, false);
});

test('60 秒长跑不崩溃，补阵总量始终受预算约束', () => {
  for (const f of ['B','C']) {
    const h = createHarness(PHONE);
    h.lab.start('S8', f); h.lab.setAim(0.1);
    h.frame(60 * 60);
    const s = S(h);
    assert.ok(['playing','lost','complete'].includes(s.phase), `${f} ${s.phase}`);
    assert.ok(s.stats.batchSpawned <= 72, `${f} spawned ${s.stats.batchSpawned}`);
    assert.ok(s.stats.batchBatches <= 3, `${f} batches ${s.stats.batchBatches}`);
    assert.ok(s.maxBalls <= 48, `${f} peak ${s.maxBalls}`);
  }
});
