const fs=require('node:fs'),{load}=require('./m11-harness'),{run}=require('./m11-replay');
const dir=process.env.M11_DIR||'hybrid-v1-m1-1',B=require('./'+dir+'/builds');const out={dir,scenarios:[],runs:[]};
for(const family of ['split','arc','gun'])for(const count of [1,3,5])for(const rank of [1,3]){
 const g=load();g.click('start');g.test.selectSeed(family);g.test.configureBuild({[family]:rank,power:rank===3?1:0});
 const items=Array.from({length:count},(_,i)=>({x:20+i*65,y:100+(i%2)*35,hp:count===1?52:[15,19,30,15,19][i],isBoss:count===1}));
 g.test.setTestField(items);let frames=0;for(;frames<7200&&g.state().phase==='playing';frames++){if(frames%7===0){const b=g.test.allBricks().filter(b=>b.alive).sort((a,b)=>b.y-a.y)[0];if(b)g.test.setAimAngle(Math.atan2(b.x+b.w/2-180,495-b.y-b.h/2));}g.frame();}
 const q=g.state();out.scenarios.push({family,count,rank,seconds:+q.elapsed.toFixed(3),cleared:q.brickCount===0,remainingHp:q.remainingHp,contacts:q.brickContacts,shots:q.shotsFired,skillsUsed:q.skillsUsed,precisionTurns:q.precisionTurns,focusDamage:q.focusDamage,gunBonusDamage:q.gunBonusDamage,peak:q.maxBallsAlive});
}
for(const scale of dir==='hybrid-v1-m1-1'?[.80,.84,.86]:[.80])for(const family of ['split','arc','gun']){B.CONFIG.fallScale=scale;const q=run(family,2701);delete q.events;out.runs.push({...q,scale});console.log(dir,scale,family,q.phase,q.wave,q.seconds);}
B.CONFIG.fallScale=.84;
if(dir==='hybrid-v1-m1-1')for(const options of [{weak:true},{mixed:true},{noActive:true}])for(const family of ['split','arc','gun']){const q=run(family,2702,options);delete q.events;out.runs.push({...q,scale:.84,options});console.log(options,family,q.phase,q.wave,q.seconds);}
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,2));
