'use strict';
// V7 行为测试：真实球数上限、留存倍率、真实伤害不变、A/B/C 三场对照。
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

test('A=48 / B=100 / C=100：上限是真实物理球上限', () => {
  const cap = (f) => { const h = createHarness(PHONE); h.lab.start('none', f); return h.lab.stats().ballCap; };
  assert.equal(cap('A'), 48);
  assert.equal(cap('B'), 100);
  assert.equal(cap('C'), 100);
});

test('上限真的能拦住球：填满请求会被截到 48 / 100', () => {
  for (const [f, n] of [['A',48],['B',100],['C',100]]) {
    const h = createHarness(PHONE);
    h.lab.start('none', f);
    h.lab.fillBalls(999);
    assert.equal(h.lab.balls().length, n, `${f} filled`);
  }
});

test('A/B 在现有射速下完全一致：48 上限根本没被摸到', () => {
  const a = S(run('M1','A',20));
  const b = S(run('M1','B',20));
  assert.ok(a.maxBalls <= 48, `A peak ${a.maxBalls}`);
  assert.equal(a.maxBalls, b.maxBalls, `A ${a.maxBalls} vs B ${b.maxBalls}`);
  assert.equal(a.stats.breaks, b.stats.breaks, 'same seed, same result');
  assert.ok(a.maxBalls < 48, `A peak ${a.maxBalls} never reached the cap`);
});

test('C 的真实球数明显高于 A，并越过 48', () => {
  const a = S(run('M1','A',20));
  const c = S(run('M1','C',20));
  assert.ok(c.maxBalls > 48, `C peak ${c.maxBalls}`);
  assert.ok(c.maxBalls > a.maxBalls * 1.25, `C ${c.maxBalls} vs A ${a.maxBalls}`);
  assert.ok(c.maxBalls <= 100, `C peak ${c.maxBalls}`);
});

test('C 的弹球留存约为 A 的两倍（maxLife 直接翻倍）', () => {
  const life = (f) => {
    const h = createHarness(PHONE);
    h.lab.start('M1', f);
    h.frame(2);
    const b = h.lab.balls()[0];
    return b ? b.maxLife : 0;
  };
  const a = life('A'), c = life('C');
  assert.ok(a > 0 && c > 0, `A ${a} C ${c}`);
  assert.ok(Math.abs(c / a - 2) < 0.05, `ratio ${(c / a).toFixed(2)}`);
});

test('三场使用同一初始盘面与 HP 分布', () => {
  const key = (f) => {
    const h = createHarness(PHONE);
    h.lab.start('none', f);
    return h.lab.bricks().map(b => `${b.x},${b.y},${b.hp}`).sort().join('|');
  };
  assert.equal(key('A'), key('B'));
  assert.equal(key('A'), key('C'));
});

test('没有隐藏增伤：普通球伤害仍是 1', () => {
  for (const f of ['A','B','C']) {
    const h = run('none', f, 12);
    const s = S(h);
    for (const e of s.damageLog) {
      assert.ok(e.delta >= 0 && e.delta <= 1, `${f} ${e.source} ${e.delta}`);
    }
  }
});

test('补砖预算仍是 180，三场一致', () => {
  for (const f of ['A','B','C']) {
    const h = createHarness(PHONE);
    h.lab.start('M1', f);
    assert.equal(h.lab.stats().refillBudget, 180, `${f} budget`);
  }
});

test('高 HP 分布仍是 35/45/20，三场一致', () => {
  for (const f of ['A','B','C']) {
    const h = createHarness(PHONE);
    h.lab.start('none', f);
    const bs = h.lab.bricks();
    const t = bs.length;
    const low = bs.filter(b => b.hp <= 3).length / t;
    const high = bs.filter(b => b.hp > 16).length / t;
    assert.ok(Math.abs(low - 0.35) < 0.12, `${f} low ${low.toFixed(2)}`);
    assert.ok(Math.abs(high - 0.20) < 0.12, `${f} high ${high.toFixed(2)}`);
  }
});

test('开花子球也受同一上限约束，不会绕过 100', () => {
  const h = createHarness(PHONE);
  h.lab.start('S1','B'); h.lab.setAim(0.1);
  h.frame(60 * 12);
  assert.ok(h.lab.balls().length <= 100, `balls ${h.lab.balls().length}`);
  assert.ok(S(h).maxBalls <= 100, `peak ${S(h).maxBalls}`);
});

test('清屏与触线判定仍然有效', () => {
  const h = createHarness(PHONE);
  h.lab.start('S8','C'); h.lab.setAim(0.1);
  h.frame(60 * 4);
  h.lab.clearBricks();
  h.frame(3);
  assert.equal(S(h).phase, 'playing', '预算未尽时继续补砖');
  assert.ok(S(h).stats.refillSpawned > 0);
});

test('all 4 skills x 3 fields start and keep their own cap', () => {
  for (const mode of ['none','S1','M1','S8']) for (const field of ['A','B','C']) {
    const h = createHarness(PHONE);
    assert.equal(h.lab.start(mode, field), true, `${mode}/${field}`);
    h.lab.setAim(0.1);
    h.frame(180);
    const s = S(h);
    const cap = field === 'A' ? 48 : 100;
    assert.ok(['playing','lost','complete'].includes(s.phase), `${mode}/${field} ${s.phase}`);
    assert.ok(s.maxBalls <= cap, `${mode}/${field} peak ${s.maxBalls} > ${cap}`);
  }
});

test('技能参数未被改动：M1 射速、S1 子球、S8 爆雷', () => {
  const m1 = S(run('M1','A',12));
  const rate = m1.stats.mgShots / m1.elapsed;
  assert.ok(rate > 11.5 && rate < 13.5, `M1 rate ${rate}`);
  assert.ok(S(run('S1','A',14)).stats.bloomChildren > 0);
  const s8 = S(run('S8','A',14));
  assert.ok(s8.stats.bombsPlanted > 0 && s8.stats.bombsDetonated > 0);
});

test('pause / restart keeps mode and field', () => {
  const h = createHarness(PHONE);
  h.lab.start('S8','C');
  h.frame(40);
  h.click('pause');
  assert.equal(S(h).phase, 'paused');
  h.click('resume');
  assert.equal(S(h).phase, 'playing');
  h.lab.restart();
  assert.equal(S(h).mode, 'S8');
  assert.equal(S(h).field, 'C');
  assert.equal(S(h).ballCap, 100);
  h.lab.menu();
  assert.equal(S(h).active, false);
});

test('60 秒长跑不崩溃，球数始终不超各场上限', () => {
  for (const f of ['B','C']) {
    const h = createHarness(PHONE);
    h.lab.start('M1', f); h.lab.setAim(0.1);
    h.frame(60 * 60);
    const s = S(h);
    assert.ok(['playing','lost','complete'].includes(s.phase), `${f} ${s.phase}`);
    assert.ok(s.maxBalls <= 100, `${f} peak ${s.maxBalls}`);
  }
});
