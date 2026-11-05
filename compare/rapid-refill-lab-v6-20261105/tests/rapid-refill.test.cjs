'use strict';
// V6 行为测试：击碎即补、预算封顶、高 HP 分布、清屏与碰撞安全。
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness.cjs');

const PHONE = { width: 390, height: 844 };
function run(mode, field, seconds = 25, aim = 0.1) {
  const h = createHarness(PHONE);
  assert.equal(h.lab.start(mode, field), true, `${mode}/${field} start`);
  h.lab.setAim(aim);
  h.frame(Math.round(seconds * 60));
  return h;
}
const S = (h) => h.lab.stats();

test('R1: 击碎后立即补砖，不等批次冷却', () => {
  const h = createHarness(PHONE);
  h.lab.start('M1','R1'); h.lab.setAim(0.1);
  h.frame(60 * 6);
  const before = h.lab.stats();
  assert.ok(before.stats.refillRequests > 0, 'breaks must request refill');
  assert.ok(before.stats.refillSpawned > 0, 'refill must actually spawn');
  assert.ok(before.stats.refillSpawned >= before.stats.refillRequests * 1.2,
    `spawned ${before.stats.refillSpawned} vs requests ${before.stats.refillRequests}`);
});

test('R1: 每碎 1 块约补 2–3 块（预算未耗尽前）', () => {
  const h = createHarness(PHONE);
  h.lab.start('M1','R1'); h.lab.setAim(0.1);
  h.frame(60 * 8);
  const s = h.lab.stats();
  const issued = s.stats.refillPlaced + s.refillDebt;
  const ratio = issued / Math.max(1, s.stats.refillRequests);
  assert.ok(ratio >= 1.6 && ratio <= 3.6, `issued ${issued} / requests ${s.stats.refillRequests} = ${ratio.toFixed(2)}`);
});

test('R1: 补砖预算 180 是硬上限，债务不会超发', () => {
  const s = S(run('S8','R1',40));
  const total = s.stats.refillSpawned + s.refillDebt;
  assert.ok(s.stats.refillPlaced <= 180, `placed ${s.stats.refillPlaced}`);
  assert.ok(total <= 181, `spawned+debt ${total}`);
  assert.ok(s.refillBudget >= 0, `budget ${s.refillBudget}`);
});

test('R1/R2: 存活砖块不超过 90', () => {
  for (const f of ['R1','R2']) {
    const s = S(run('S8', f, 30));
    assert.ok(s.stats.liveMax <= 90, `${f} peak ${s.stats.liveMax}`);
  }
});

test('R2: 高 HP 分布接近 35% / 45% / 20%', () => {
  const h = createHarness(PHONE);
  h.lab.start('none','R2');
  const bs = h.lab.bricks();
  const total = bs.length;
  const low = bs.filter(b => b.hp <= 3).length;
  const mid = bs.filter(b => b.hp > 3 && b.hp <= 16).length;
  const high = bs.filter(b => b.hp > 16).length;
  assert.ok(total >= 60, `initial ${total}`);
  assert.ok(Math.abs(low / total - 0.35) < 0.12, `low ${low}/${total}`);
  assert.ok(Math.abs(mid / total - 0.45) < 0.12, `mid ${mid}/${total}`);
  assert.ok(Math.abs(high / total - 0.20) < 0.12, `high ${high}/${total}`);
  assert.ok(Math.max(...bs.map(b => b.hp)) >= 20, 'must include 20+ HP bricks');
});

test('R2: 高 HP 明显拖慢破碎节奏（这是预期结果，不加伤害掩盖）', () => {
  // R1 会先烧完预算，用"击碎总数"比不公平；改比"打到 30 次击碎要多久"。
  const timeTo = (field, target = 30) => {
    const h = createHarness(PHONE);
    h.lab.start('M1', field); h.lab.setAim(0.1);
    for (let i = 0; i < 60 * 40; i++) {
      h.frame(1);
      if (h.lab.stats().stats.breaks >= target) return (i + 1) / 60;
    }
    return Infinity;
  };
  const r1 = timeTo('R1'), r2 = timeTo('R2');
  assert.ok(Number.isFinite(r1) && Number.isFinite(r2), `r1 ${r1} r2 ${r2}`);
  assert.ok(r2 > r1 * 1.5, `R2 ${r2.toFixed(1)}s vs R1 ${r1.toFixed(1)}s`);
});

test('补砖不重叠、不越过 120px 安全距离', () => {
  const h = run('S1','R1',30);
  const bs = h.lab.bricks().filter(b => b.alive);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    assert.equal(overlap, false, `overlap ${a.id}/${b.id}`);
  }
  const s = S(h);
  assert.ok(s.stats.refillMinGap === null || s.stats.refillMinGap >= 120, `gap ${s.stats.refillMinGap}`);
  assert.equal(s.stats.unfairCross, 0);
});

test('预算耗尽后清空真实砖块即可过关', () => {
  const h = createHarness(PHONE);
  h.lab.start('S8','R1'); h.lab.setAim(0.1);
  let s = h.lab.stats();
  for (let i = 0; i < 60 && s.refillBudget > 0; i++) { h.frame(60); s = h.lab.stats(); }
  assert.equal(s.refillBudget, 0, 'budget must be spent');
  h.lab.clearBricks();
  h.frame(3);
  assert.equal(S(h).phase, 'complete', `phase ${S(h).phase}`);
});

test('预算未耗尽时清空不会误判过关（会继续补）', () => {
  const h = createHarness(PHONE);
  h.lab.start('M1','R1'); h.lab.setAim(0.1);
  h.frame(60 * 3);
  h.lab.clearBricks();
  h.frame(30);
  const s = S(h);
  assert.equal(s.phase, 'playing', 'must keep refilling instead of clearing');
  assert.ok(s.stats.refillSpawned > 0, 'refill must fill the empty field');
});

test('C 场仍是 V5 批次补阵，没有极速补砖', () => {
  const s = S(run('S1','C',30));
  assert.equal(s.stats.refillRequests, 0, 'C must not use rapid refill');
  assert.ok(s.stats.batchBatches > 0, 'C must still batch');
});

test('all 4 skills x 3 fields start and keep ball cap', () => {
  for (const mode of ['none','S1','M1','S8']) for (const field of ['C','R1','R2']) {
    const h = createHarness(PHONE);
    assert.equal(h.lab.start(mode, field), true, `${mode}/${field}`);
    h.lab.setAim(0.1);
    h.frame(180);
    const s = S(h);
    assert.ok(['playing','lost','complete'].includes(s.phase), `${mode}/${field} ${s.phase}`);
    assert.ok(s.maxBalls <= 48, `${mode}/${field} peak ${s.maxBalls}`);
  }
});

test('技能参数未被改动：S1 子球、M1 射速、S8 爆雷仍在', () => {
  const s1 = S(run('S1','C',14));
  assert.ok(s1.stats.bloomChildren > 0);
  const m1 = S(run('M1','C',12));
  const rate = m1.stats.mgShots / m1.elapsed;
  assert.ok(rate > 11.5 && rate < 13.5, `M1 rate ${rate}`);
  const s8 = S(run('S8','C',14));
  assert.ok(s8.stats.bombsPlanted > 0 && s8.stats.bombsDetonated > 0);
});

test('pause / restart keeps mode and field', () => {
  const h = createHarness(PHONE);
  h.lab.start('S8','R2');
  h.frame(40);
  h.click('pause');
  assert.equal(S(h).phase, 'paused');
  h.click('resume');
  assert.equal(S(h).phase, 'playing');
  h.lab.restart();
  assert.equal(S(h).mode, 'S8');
  assert.equal(S(h).field, 'R2');
  h.lab.menu();
  assert.equal(S(h).active, false);
});

test('60 秒长跑不崩溃，补砖总量不超预算', () => {
  for (const f of ['R1','R2']) {
    const h = createHarness(PHONE);
    h.lab.start('S8', f); h.lab.setAim(0.1);
    h.frame(60 * 60);
    const s = S(h);
    assert.ok(['playing','lost','complete'].includes(s.phase), `${f} ${s.phase}`);
    assert.ok(s.stats.refillPlaced <= 180, `${f} placed ${s.stats.refillPlaced}`);
    assert.ok(s.maxBalls <= 48, `${f} peak ${s.maxBalls}`);
  }
});
