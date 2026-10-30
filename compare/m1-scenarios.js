'use strict';
const {load}=require('./m1-harness'),{run}=require('./m1-replay'),{CONFIG}=require('./hybrid-v1-m1/builds'),assert=require('node:assert/strict'),fs=require('node:fs'),{performance}=require('node:perf_hooks');
const results=[];
for(const family of ['split','arc','gun']){
 const weak=run(family,2701,{weak:true});results.push({...weak,events:undefined});
 for(const scenario of ['soloBoss','tail']){
  const g=load();g.click('start');g.test.selectSeed(family);g.test.configureBuild({[family]:3,power:2,hunter:1},family+'-a');
  const items=scenario==='soloBoss'?[{x:138,y:108,w:84,h:53,hp:52,isBoss:true}]:[{x:30,y:110,hp:8},{x:160,y:140,hp:8},{x:280,y:110,hp:8}];
  g.test.setTestField(items);
  for(let f=0;f<3600&&g.state().phase==='playing';f++){
   if(f%7===0){const b=g.test.allBricks().filter(b=>b.alive).sort((a,b)=>b.y-a.y)[0];if(b)g.test.setAimAngle(Math.atan2(b.x+b.w/2-180,495-b.y-b.h/2));}g.frame(1);
  }
  const q=g.state();assert.equal(q.brickCount,0,family+' '+scenario+' must clear through real physics');assert.equal(q.skillsUsed,0);
  results.push({family,scenario,seconds:+q.elapsed.toFixed(3),shots:q.shotsFired,contacts:q.brickContacts,arcReleases:q.arcReleases,splitChildren:q.splitChildren});
 }
}
const pressure=CONFIG.fallScale;CONFIG.fallScale=0;
try{
 const g=load();g.click('start');g.test.selectSeed('gun');g.test.configureBuild({gun:3,rate:5,life:3,split:3,arc:3,shock:2,drill:2,hunter:2},'gun-b');
 g.test.setTestField(Array.from({length:72},(_,i)=>({x:8+(i%9)*38,y:40+Math.floor(i/9)*28,hp:10000})));
 const t=performance.now();for(let f=0;f<3600;f++){if(f%60===0)g.test.fillBallBudget();g.frame(1);}const q=g.state();
 assert.ok(q.shotsFired>=490);assert.equal(q.suppressedShots,0);assert.ok(q.maxBallsAlive<=32);assert.ok(q.budgetReclaims>0);assert.equal(q.phase,'playing');
 results.push({scenario:'forced-budget-60s',seconds:q.elapsed,hostSimulationMs:+(performance.now()-t).toFixed(1),peak:q.maxBallsAlive,shots:q.shotsFired,reclaims:q.budgetReclaims,suppressedShots:q.suppressedShots,collisionChecks:q.collisionChecks,arcReleases:q.arcReleases,splitChildren:q.splitChildren,fixtureAuxiliaryRanks:{split:q.splitLevel,arc:q.arcLevel}});
}finally{CONFIG.fallScale=pressure;}
console.log(JSON.stringify(results,null,2));if(process.env.M1_OUTPUT)fs.writeFileSync(process.env.M1_OUTPUT,JSON.stringify(results,null,2));
