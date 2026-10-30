'use strict';
const {load}=require('./v27-harness'),fs=require('node:fs'),assert=require('node:assert/strict');
function run(family,seed=2701,{hz=60,branch='a',weak=false,maxSeconds=700}={}){
 const g=load(hz,seed);g.click('start');g.test.selectSeed(family);let peak=0,frames=0,tailStart=null,bossTailSeconds=0;
 for(;frames<hz*maxSeconds;frames++){
  const q=g.state();if(['lost','complete'].includes(q.phase))break;
  if(q.phase==='choosing'){
   const pool=q.choiceSet.split(',');const priority=weak?['speed','life','rate','hunter',family]:[family+'-'+branch,family,'power','hunter','rate','drill','life','speed','shock'];
   const pick=priority.find(k=>pool.includes(k))||pool[0];g.test.chooseUpgrade(pick);continue;
  }
  if(frames%Math.max(1,Math.round(hz*.12))===0){
   const live=g.test.allBricks().filter(b=>b.alive);
   // Deterministic aim at the lowest threat; predicts falling movement during flight.
   live.sort((a,b)=>b.y+b.h-a.y-a.h||a.hp-b.hp);
   if(live.length){const b=live[0],dy=495-(b.y+b.h/2),theta=Math.atan2(b.x+b.w/2-180,Math.max(10,dy-6.8*dy/280));g.test.setAimAngle(theta);}
   if(live.length===1&&live[0].isBoss){if(tailStart===null)tailStart=q.elapsed;}else if(tailStart!==null){bossTailSeconds+=q.elapsed-tailStart;tailStart=null;}
  }
  if(q.charge>=100&&!q.giantActive)g.test.fireGiant();
  peak=Math.max(peak,q.activeBalls);g.frame(1);
 }
 const data=g.test.exportData(),q=data.state;
 if(tailStart!==null)bossTailSeconds+=q.elapsed-tailStart;
 return {family,seed,branch,weak,hz,phase:q.phase,wave:q.wave,clears:q.screenClears,seconds:+q.elapsed.toFixed(2),peak,shots:q.shotsFired,contacts:q.brickContacts,splitChildren:q.splitChildren,arcReleases:q.arcReleases,bossDefeats:q.bossDefeats,bossTailSeconds:+bossTailSeconds.toFixed(2),suppressedShots:q.suppressedShots,budgetReclaims:q.budgetReclaims,collisionChecks:q.collisionChecks,remainingHp:q.remainingHp,history:q.choiceHistory,waves:data.events.filter(e=>e.type==='wave_clear'),events:data.events};
}
if(require.main===module){
 const out=[];for(const family of ['split','arc','gun']){const r=run(family);out.push(r);console.log(JSON.stringify({...r,events:undefined}));}
 if(process.env.V27_OUTPUT)fs.writeFileSync(process.env.V27_OUTPUT,JSON.stringify(out,null,2));
 if(process.env.V27_REQUIRE_CLEAR)for(const r of out)assert.equal(r.phase,'complete',r.family+' must physically clear eight waves');
}
module.exports={run};
