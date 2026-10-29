"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const DIR="hybrid-v26-wave-level";
function load(hz=60){
 const events=new Map(),els=new Map();
 function el(id){if(!els.has(id))els.set(id,{textContent:"",value:"",disabled:false,style:{},
  classList:{add(s){this[s]=true},remove(s){this[s]=false},toggle(s,v){this[s]=v===undefined?!this[s]:v;},contains(s){return !!this[s]}},
  addEventListener(k,fn){events.set(id+":"+k,fn)},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:360,height:560}}});
 return els.get(id);}
 const ctx=new Proxy({},{get(t,k){if(k in t)return t[k];if(k==="createLinearGradient")return ()=>({addColorStop(){}});return ()=>{};},set(t,k,v){t[k]=v;return true;}});
 el("game").getContext=()=>ctx;
 const param=()=>({value:0,setValueAtTime(v){this.value=v},exponentialRampToValueAtTime(v){this.value=v},setTargetAtTime(v){this.value=v}});
 let audioCreates=0,now=1000,cb;
 class MockAudio{constructor(){audioCreates++;this.state="suspended";this.currentTime=2;this.destination={};}
  createGain(){return {gain:param(),connect(){}};}
  createDynamicsCompressor(){return {threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){}};}
  createOscillator(){return {frequency:param(),connect(){},start(){},stop(){}};}
  resume(){this.state="running";return Promise.resolve();}
 }
 const window={__PINBALL_TEST__:true,location:{search:""},AudioContext:MockAudio,
  PinballJuice:require("./"+DIR+"/juice-fx.js"),matchMedia(){return {matches:false}},
  addEventListener(k,f){events.set("window:"+k,f);}};
 const document={hidden:false,querySelector(q){return el(q.slice(1));}};
 vm.runInNewContext(fs.readFileSync("./"+DIR+"/game.js","utf8"),{window,document,
  performance:{now(){return now}},requestAnimationFrame(f){cb=f},Math,console},{filename:DIR+"/game.js"});
 return {test:window.__pinballTest,state:window.__pinballState,el,audioCreates:()=>audioCreates,
  frame(n=1){for(let i=0;i<n;i++){now+=1000/hz;assert.ok(cb);cb(now);}},
  click(id){const fn=events.get(id+":click");assert.ok(fn,"missing handler "+id);fn();},
  aim(x){const e={pointerId:1,clientX:x,preventDefault(){}};events.get("game:pointerdown")(e);events.get("game:pointerup")(e);}
 };
}


function choose(g){if(g.state().phase!=="choosing")return false;const pool=g.state().choiceSet.split(",");const priority=["rate","speed","life","power","ricochet","hunter","drill","split","volley","arc","shock"];return g.test.chooseUpgrade(priority.find(x=>pool.includes(x))||pool[0]);}
function advance(g,n){for(let i=0;i<n;i++){if(g.state().phase==="choosing")choose(g);g.frame(1);}}
function alive(g){return g.test.allBricks().filter(b=>b.alive);}
const start=load();
assert.equal(start.state().wave,1);assert.equal(start.state().level,1);
assert.equal(start.state().waveStartingTargets,78);
assert.equal(start.state().waveUpgrades,0);
assert.equal(start.state().brickCount,78);
start.click("start");advance(start,560);
assert.equal(start.state().level,1,"No mid-wave upgrades");
assert.equal(start.state().wave,1);
assert.equal(start.state().ambientSummonBursts,0);
assert.equal(start.state().bridgeBursts,0);
start.test.addExperience(999999);
assert.equal(start.state().level,1,"XP cannot trigger an upgrade");
console.log("ONE_WAVE_ONE_LEVEL_RULE_PASS",JSON.stringify({wave:start.state().wave,level:start.state().level,time:start.state().elapsed}));
const g=load();g.click("start");
g.test.spawnTestBall(0);
g.test.injectGiantAt(180,270);
assert.ok(g.state().activeBalls>0&&g.state().giantActive,"test should start with carried projectiles");
g.test.removeNormalBricks();g.frame(1);
assert.equal(g.state().screenClears,1);
assert.equal(g.state().level,2);
assert.equal(g.state().waveUpgrades,1);
assert.equal(g.state().phase,"choosing","wave clear must grant a single choice");
assert.equal(g.state().activeBalls,0,"all balls removed on wave clear");
assert.equal(g.state().giantActive,false,"active giant removed on wave clear");
assert.equal(g.state().choiceSet.split(",").length,3);
const paused=g.state().elapsed;g.frame(120);
assert.equal(g.state().elapsed,paused,"upgrade choice pauses physics");
assert.equal(g.state().wave,1,"next wave must wait for choice");
assert.equal(choose(g),true);
g.frame(10);assert.equal(g.state().activeBalls,0,"do not fire during empty clear celebration");
assert.equal(g.state().wave,1);
advance(g,200);
assert.equal(g.state().wave,2,"only selection+telegraph starts next wave");
assert.equal(g.state().level,2,"new wave should not grant a second upgrade");
assert.equal(g.state().waveSpawnCount,2);
assert.equal(g.state().waveUpgrades,1);
assert.ok(g.state().brickCount>60);
assert.equal(g.test.overlapPairs(),0);
console.log("CLEAR_UPGRADE_AND_BALL_RESET_PASS",JSON.stringify({wave:g.state().wave,level:g.state().level,balls:g.state().activeBalls}));
const boss=load();boss.click("start");boss.test.spawnWave(4);
const core=alive(boss).find(b=>b.isBoss);
assert.ok(core);
boss.test.setBossHp(1);boss.test.hitById(core.id);
assert.equal(boss.state().bossDefeats,1);
boss.frame(2);
assert.equal(boss.state().level,1,"Boss defeat does not grant independent upgrade");
assert.equal(boss.state().phase,"playing");
assert.equal(boss.state().choiceSet,"","no Boss choice");
boss.test.removeNormalBricks();boss.frame(2);
assert.equal(boss.state().level,2);
assert.equal(boss.state().waveUpgrades,1);
assert.equal(boss.state().phase,"choosing");
console.log("BOSS_ONLY_WAVE_END_UPGRADE_PASS");
const danger=load();danger.click("start");danger.test.allBricks()[0].y=455;danger.frame(2);assert.equal(danger.state().phase,"lost");
console.log("DANGER_LINE_PASS");
for(const [hz,n] of [[60,600],[120,1200]]){
 const sim=load(hz);sim.click("start");advance(sim,n);
 assert.ok(sim.state().elapsed>=9.9&&sim.state().elapsed<=10.05);
 assert.equal(sim.state().level,1);
}
console.log("60_120HZ_PASS");
function runBuild(priority,limit=18000){
 const sim=load();sim.click("start");let firstClear=null,choices=0,peakBalls=0,lastWave=1;const waveTimes=[{wave:1,time:0}];
 for(let k=0;k<limit;k++){
  const q=sim.state();
  if(q.wave!==lastWave){lastWave=q.wave;waveTimes.push({wave:q.wave,time:+q.elapsed.toFixed(1)});}
  if(q.phase==="lost")break;
  if(q.phase==="choosing"){
   const pool=q.choiceSet.split(",");
   sim.test.chooseUpgrade(priority.find(x=>pool.includes(x))||pool[0]);choices++;continue;
  }
  if(k%42===0){
   const live=alive(sim).sort((a,b)=>b.y-a.y);
   if(live.length){const target=live[0],theta=Math.atan2(target.x+target.w/2-180,495-(target.y+target.h/2));sim.aim(Math.max(0,Math.min(360,180+theta/1.08*180)));}
  }
  if(q.charge>=100&&!q.giantActive)sim.test.fireGiant();
  peakBalls=Math.max(peakBalls,q.activeBalls);
  if(firstClear===null&&q.screenClears>0)firstClear=+q.elapsed.toFixed(1);
  sim.frame(1);
 }
 const state=sim.state();
 return {phase:state.phase,time:+state.elapsed.toFixed(1),wave:state.wave,level:state.level,waveUpgrades:state.waveUpgrades,clears:state.screenClears,choices,score:state.score,bossDefeats:state.bossDefeats,peakBalls,firstClear,waveTimes,bossHp:state.bossHp,activeBricks:alive(sim).length,remainingHp:alive(sim).reduce((n,b)=>n+b.hp,0)};
}
const weak=runBuild(["rate","speed","life","power","hunter","drill","ricochet","split","volley","arc","shock"]);
const burst=runBuild(["rate","power","drill","split","arc","shock","volley","life","speed","ricochet","hunter"]);
console.log("WEAK_BUILD_PROBE",JSON.stringify(weak));
console.log("BURST_BUILD_PROBE",JSON.stringify(burst));
assert.ok(weak.time>30,"weak build should survive initial onboarding");
assert.ok(burst.time>30);
assert.equal(weak.level,weak.clears+1);
assert.equal(burst.level,burst.clears+1);
assert.ok(weak.choices<=weak.clears&&weak.clears-weak.choices<=1);
assert.ok(burst.choices<=burst.clears&&burst.clears-burst.choices<=1);
console.log("PASS v0.26: one level per completed wave, no mid-wave upgrades, no carried balls, moderate fall pressure");
