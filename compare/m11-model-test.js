'use strict';
const test=require('node:test'),a=require('node:assert/strict'),B=require('./hybrid-v1-m1-1/builds');
const seed=(id='split')=>{const s=B.createState(2701);B.seed(s,id);return s;};
test('B base yields real 1 damage at 330 speed and gun 4.1s life',()=>{a.equal(B.tuning(seed()).damage,1);a.equal(B.tuning(seed()).speed,330);a.equal(B.tuning(seed()).interval,.86);a.equal(B.tuning(seed('gun')).ttl,4.1);});
test('first R2 commits focus, preserves purchased other R1 and blocks third core',()=>{const s=seed();a.ok(B.choose(s,'arc',1));a.ok(!B.choose(s,'gun',2));a.ok(B.choose(s,'arc',2));a.equal(s.growthFocus,'arc');a.ok(!B.choose(s,'split',3));a.ok(B.choose(s,'arc-a',4));a.equal(B.effectiveRank(s,'split'),1);a.equal(B.effectiveRank(s,'arc'),2);});
test('displayed rate delta reflects cap and removes further zero-effect ranks',()=>{const s=seed();for(let w=1;w<=4;w++)B.choose(s,'rate',w);const p=B.preview(s,'rate');a.ok(Math.abs(p.before.interval-.56)<1e-8);a.equal(p.after.interval,.55);a.ok(p.deltas.some(d=>d.key==='rate'&&Math.abs(d.value-1.8181818181818077)<1e-8));a.ok(B.choose(s,'rate',5));a.ok(!B.eligible(s,6).includes('rate'));});
test('branch-covered core ranks are not sold as fake improvements',()=>{for(const f of ['gun','arc']){const s=seed(f);B.choose(s,f,1);B.choose(s,f+'-b',4);a.ok(B.eligible(s,5).includes(f),'new single-target rank remains useful after branch');}});
test('card has actual change, preview never mutates build or rng',()=>{const s=seed();const before=JSON.stringify(s),p=B.preview(s,'split');a.equal(p.after.splitCount,2);a.equal(p.before.splitCount,1);a.match(B.card(s,'split').description,/\+1颗/);a.equal(JSON.stringify(s),before);const g=seed('gun');a.doesNotMatch(B.card(g,'gun').description,/0\.27|冷却|px|秒/);});
test('history captures independent permanent before/after and all skill totals',()=>{const s=seed();B.choose(s,'power',1);a.equal(s.choiceHistory.at(-1).before.damage,1);a.equal(s.choiceHistory.at(-1).after.damage,2);a.equal(B.summary(s).history.length,2);a.equal(B.summary(s).stats.damage,2);});
test('Buffs refresh without stacking and expire at effective time only',()=>{const s=seed();B.grantBuff(s,'power');B.tickBuffs(s,14);a.equal(B.buffModifiers(s).damage,1);B.grantBuff(s,'power');a.equal(s.temporaryBuffs[0].remaining,15);B.grantBuff(s,'speed');a.equal(B.buffModifiers(s).speed,1.15);B.tickBuffs(s,15);a.equal(B.buffModifiers(s).damage,0);a.equal(s.temporaryBuffs.length,1);B.tickBuffs(s,15);a.equal(s.temporaryBuffs.length,0);});
test('bank exposes finite next-hit charges, permanent reward never temporary fallback',()=>{const s=seed();a.ok(B.choose(s,'bank',1));a.equal(B.effects(s).bankCap,2);a.ok(B.choose(s,'bank',2));a.equal(B.effects(s).bankCap,4);a.ok(!B.eligible(s,3).some(id=>id.startsWith('recover-')));});
test('reachable build states have three effective choices through all nine M1 rewards',()=>{
 let states=new Map(['split','arc','gun'].map(f=>{const s=seed(f);return [f,s]})),total=0;
 for(let w=1;w<=9;w++){
  const next=new Map();
  for(const s of states.values()){
   const pool=B.eligible(s,w),cards=B.offer(structuredClone(s),w);a.equal(new Set(cards).size,3);a.ok(cards.every(id=>pool.includes(id)));a.ok(!cards.some(id=>id.startsWith('recover-')));
   for(const id of pool){const p=B.preview(s,id);a.ok(p.deltas.length,id+' must change effective behavior');const t=structuredClone(s);a.ok(B.choose(t,id,w));a.ok(Object.entries(s.ranks).every(([k,n])=>B.effectiveRank(t,k)>=B.effectiveRank(s,k)),'no demotion');t.choiceHistory=[];const key=JSON.stringify([t.seedAbility,t.growthFocus,t.coreBranch,Object.keys(t.ranks).sort().map(k=>[k,t.ranks[k]])]);if(!next.has(key))next.set(key,t);}
   total++;
  }
  states=next;
 }
 console.log('reachable model states checked',total,'terminal states',states.size);
});

test('new core cards describe a gained behavior instead of invented penalty from zero',()=>{const s=seed();a.match(B.card(s,'arc').description,/获得新能力/);a.doesNotMatch(B.card(s,'arc').description,/所需命中 \+3/);a.doesNotMatch(B.card(B.createState(),'gun').description,/0\.35|4\.1秒/);});
