'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const file=__dirname+'/hybrid-v27-buildlab/builds.js';
assert.ok(fs.existsSync(file),'v27 must provide a separate data-driven skill model');
const B=require(file);
for(const family of ['split','arc','gun']){
 const s=B.createState(27);assert.equal(s.coreFocus,null);
 assert.ok(B.seed(s,family));assert.equal(s.ranks[family],1);assert.equal(s.coreFocus,null);
 assert.ok(!B.seed(s,'arc'),'seed is chosen once');
 assert.ok(!B.choose(s,family+'-a',0));
 assert.ok(B.choose(s,family,1));assert.ok(B.choose(s,family,2));assert.ok(!B.choose(s,family,3));
 assert.equal(B.eligible(s,3).filter(k=>B.DEFS[k].role==='branch').length,0);
 const cards=B.offer(s,4);assert.equal(new Set(cards).size,3);
 assert.ok(cards.includes(family+'-a')&&cards.includes(family+'-b'));
 assert.ok(B.choose(s,family+'-a',4));assert.equal(s.coreFocus,family);
 assert.ok(!B.eligible(s,5).includes(family+'-b'));
 const other=family==='arc'?'split':'arc';assert.ok(B.choose(s,other,5));
 assert.equal(B.effectiveRank(s,other),1);assert.ok(!B.choose(s,other,6));
}
const a=B.createState(123),b=B.createState(123);B.seed(a,'split');B.seed(b,'split');
for(let w=1;w<=8;w++){
 const x=B.offer(a,w),y=B.offer(b,w);assert.deepEqual(x,y);assert.equal(new Set(x).size,3);
 x.forEach(k=>assert.ok(B.eligible(a,w).includes(k)));
 assert.ok(B.choose(a,x[0],w));assert.ok(B.choose(b,y[0],w));
}
const cross=B.createState(3);B.seed(cross,'split');B.choose(cross,'arc',1);B.choose(cross,'arc',2);
assert.ok(B.offer(cross,4).includes('arc-a'));assert.ok(B.choose(cross,'arc-a',4));assert.equal(cross.seedAbility,'split');
const max=B.createState(9);B.seed(max,'gun');B.choose(max,'gun',1);B.choose(max,'gun-a',4);
for(const key of Object.keys(B.DEFS).filter(k=>B.DEFS[k].role!=="recovery"))while(B.choose(max,key,8)){}
const fallback=B.offer(max,8);assert.equal(fallback.length,3);assert.equal(new Set(fallback).size,3);
for(const id of fallback){assert.ok(B.choose(max,id,8));}
assert.ok(max.recovery.power>0&&max.recovery.speed>0&&max.recovery.life>0);
const invalid=JSON.stringify(max);assert.equal(B.choose(max,'__proto__',8),false);assert.equal(JSON.stringify(max),invalid);
console.log('PASS v27 data model: ranks, prerequisites, exclusivity, branch guarantee, cross-core, deterministic choices and real fallback');
const hybrid=B.createState(2701);B.seed(hybrid,'split');B.choose(hybrid,'gun',1);B.choose(hybrid,'split',2);B.choose(hybrid,'split-a',4);
let interval=B.tuning(hybrid).interval;
for(let i=0;i<5;i++){assert.ok(B.choose(hybrid,'rate',5+i));const next=B.tuning(hybrid).interval;assert.ok(next<interval,'every offered rate rank must improve auxiliary-gun fire interval');interval=next;}
