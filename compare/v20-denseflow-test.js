"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const DIR="hybrid-v20-denseflow";
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
for(const [hz,frames] of [[60,600],[120,1200]]){
 const test=load(hz);
 const initial=test.state();
 assert.equal(initial.brickCount,54,"opening density: six full 9-column rows");
 assert.equal(initial.interval,1.04,"slow starter fire interval");
 assert.equal(initial.shotSpeed,292,"slow starter ball speed");
 assert.equal(initial.physicsHz,120,"fixed 120Hz collision simulation");
 test.click("start");
 for(let f=0;f<frames;f++){if(test.state().phase==="choosing")test.test.chooseIndex(0);test.frame(1);}
 console.log("REFRESH_SIM_PASS",hz,JSON.stringify({seconds:+test.state().elapsed.toFixed(2),fpsEstimate:test.state().fpsNow,frame:frames,phase:test.state().phase}));
 assert.ok(test.state().elapsed>=9.9&&test.state().elapsed<=10.05,"game time must track wall time regardless of refresh rate");
}
const g=load(),t=g.test;
assert.equal(g.state().phase,"ready","game must wait for audio start gesture");
g.frame(180);assert.equal(g.state().elapsed,0,"no silent game running before gesture");
g.click("start");assert.equal(g.state().phase,"playing");assert.equal(g.audioCreates(),1);
assert.equal(t.isSoundRunning(),true,"audio context must be running after start");
console.log("AUDIO_START_PASS");
const before=g.state().brickCount;
g.frame(400);const after=g.state();
assert.ok(after.elapsed>6);
assert.ok(after.rowIndex>3,"streaming generates rows");
assert.ok(after.brickCount>before,"new bricks are available");
console.log("STREAM_PASS",after.elapsed.toFixed(1),after.brickCount);
t.addExperience(g.state().xpGoal-g.state().xp);g.frame(1);
assert.equal(g.state().phase,"choosing","xp grants triple upgrade and pauses");
assert.equal(g.state().level,2);
assert.equal(g.state().choiceSet.split(",").length,3);
const paused=g.state().elapsed;g.frame(90);
assert.equal(g.state().elapsed,paused,"descending clock paused during choice");
assert.equal(t.chooseIndex(1),true,"in-run scatter upgrade works");
assert.equal(g.state().volleyLevel,1);
console.log("UPGRADE_PAUSE_PASS");
const bossG=load(),bt=bossG.test;bossG.click("start");
assert.equal(bt.spawnBossNow(),true);
let core=bt.allBricks().find(b=>b.isBoss&&b.alive);
assert.ok(core);assert.equal(core.hp,75);
core.y=190;const summoned=bt.summonBossBricks();
assert.ok(summoned>0&&summoned<=4,"boss creates surrounding numeric bricks");
const supports=bt.allBricks().filter(b=>b.alive&&b.bossSupport);
assert.ok(supports.every(b=>!b.isBoss));
bt.setBossHp(1);bt.hitById(core.id);
assert.equal(bossG.state().bossDefeats,1);
assert.equal(bt.allBricks().filter(b=>b.alive&&b.bossSupport).length,0,"defeated boss bursts summoned tiles");
bossG.frame(1);assert.equal(bossG.state().phase,"choosing","boss kill grants upgrade choice");
console.log("BOSS_SUMMON_AND_REWARD_PASS",summoned);
const dangerG=load();dangerG.click("start");
dangerG.test.allBricks()[0].y=455;
dangerG.frame(2);assert.equal(dangerG.state().phase,"lost","touching line ends run");
console.log("DANGER_FAILURE_PASS");
const clearG=load();clearG.click("start");clearG.test.removeNormalBricks();
clearG.frame(1);
assert.equal(clearG.state().screenClears,1,"a real clear must be detected and rewarded");
assert.ok(clearG.state().xp>=3,"clear reward adds experience");
const clearXP=clearG.state().xp;clearG.frame(10);
assert.equal(clearG.state().screenClears,1,"clear cannot farm every frame");
assert.equal(clearG.state().xp,clearXP);
console.log("CLEAR_REWARD_PASS");
console.log("PASS v0.20: audio gesture, streaming, XP choice and pause, boss summons, boss reward and pressure failure");
const sim=load();sim.click("start");
let maxBoss=0,last=null,choices=0,firstChoice=null,firstClear=null,firstBoss=null;
for(let k=0;k<15000;k++){
 const state=sim.state();last=state;
 if(state.phase==="lost")break;
 if(state.phase==="choosing"){
  const pool=state.choiceSet.split(",");
  const priority=["split","arc","volley","shock","power","drill","hunter","rate","ricochet"];
  const desired=priority.find(x=>pool.includes(x));
  if(firstChoice===null)firstChoice=+state.elapsed.toFixed(1);
  sim.test.chooseUpgrade(desired);choices++;continue;
 }
 if(k%42===0){
  const live=sim.test.allBricks().filter(b=>b.alive);
  const target=live.sort((a,b)=>(b.y+b.h)-(a.y+a.h))[0];
  if(target){
   const theta=Math.atan2(target.x+target.w/2-180,495-(target.y+target.h/2));
   sim.aim(Math.max(0,Math.min(360,180+theta/1.08*180)));
  }
 }
 if(state.charge>=100&&!state.giantActive)sim.test.fireGiant();
 maxBoss=Math.max(maxBoss,state.bossActive?1:0);
 if(firstBoss===null&&state.bossActive)firstBoss=+state.elapsed.toFixed(1);
 if(firstClear===null&&state.screenClears>0)firstClear=+state.elapsed.toFixed(1);
 sim.frame(1);
}
console.log("LONG_RUN_PROBE",JSON.stringify({phase:last.phase,seconds:+last.elapsed.toFixed(1),kills:last.score,level:last.level,choices,bossSeen:maxBoss,bossDefeats:last.bossDefeats,screenClears:last.screenClears,alive:last.brickCount,firstChoice,firstClear,firstBoss}));
assert.ok(choices>=2,"playtest should encounter multiple upgrades");
assert.ok(last.elapsed>40,"survival should last beyond onboarding");

