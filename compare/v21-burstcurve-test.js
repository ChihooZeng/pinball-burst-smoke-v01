"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const DIR="hybrid-v21-burstcurve";
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
 assert.equal(initial.interval,1.14,"slow starter fire interval");
 assert.equal(initial.shotSpeed,280,"slow starter ball speed");
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
for(let j=0;j<400;j++){if(g.state().phase==="choosing")t.chooseIndex(0);g.frame(1);}
const after=g.state();
assert.ok(after.elapsed>6);
assert.ok(after.rowIndex>=6,"opening row count retained");
assert.ok(after.brickCount>0,"survival still has bricks to shoot");
console.log("STREAM_PASS",after.elapsed.toFixed(1),after.brickCount);
const priorLevel=g.state().level;
t.addExperience(g.state().xpGoal-g.state().xp);g.frame(1);
assert.equal(g.state().phase,"choosing","xp grants triple upgrade and pauses");
assert.equal(g.state().level,priorLevel+1);
assert.equal(g.state().choiceSet.split(",").length,3);
const paused=g.state().elapsed;g.frame(90);
assert.equal(g.state().elapsed,paused,"descending clock paused during choice");
assert.equal(t.chooseIndex(1),true,"in-run scatter upgrade works");
assert.ok(g.state().rateLevel+g.state().speedLevel+g.state().lifeLevel>=1);
console.log("UPGRADE_PAUSE_PASS");
const bossG=load(),bt=bossG.test;bossG.click("start");
assert.equal(bt.spawnBossNow(),true);
let core=bt.allBricks().find(b=>b.isBoss&&b.alive);
assert.ok(core);assert.equal(core.hp,75);
core.y=190;const summoned=bt.summonBossBricks();
assert.ok(bossG.state().summonWarningCount>0,"Boss support shows warning before being solid");
bossG.frame(40);
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
console.log("PASS v0.21: audio gesture, streaming, XP choice and pause, boss summons, boss reward and pressure failure");
const sim=load();sim.click("start");
let maxBoss=0,last=null,choices=0,firstChoice=null,firstClear=null,firstBoss=null;
for(let k=0;k<15000;k++){
 const state=sim.state();last=state;
 if(state.phase==="lost")break;
 if(state.phase==="choosing"){
  const pool=state.choiceSet.split(",");
  const priority=["rate","speed","life","power","ricochet","hunter","drill","split","volley","arc","shock"];
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


const spectrum=load();
const hpBands=[1,2,4,8,16,28,40,52,64,76,88,100];
const colorBands=hpBands.map(x=>spectrum.test.colorForHp(x));
assert.equal(new Set(colorBands.slice(0,8)).size,8,"palette uses eight coherent bands");
assert.equal(colorBands[0],colorBands[8],"palette returns to the first color at HP 64");
assert.notEqual(colorBands[4],colorBands[6],"large HP numbers are not one flat orange");
console.log("CYCLIC_PALETTE_PASS",JSON.stringify(hpBands.map((hp,i)=>({hp,color:colorBands[i]}))));
const reflow=load();reflow.click("start");reflow.test.removeNormalBricks();
reflow.frame(1);assert.equal(reflow.state().screenClears,1);
reflow.frame(40);assert.ok(reflow.state().brickCount>=30,"full clear quickly replenishes a hittable multirow field");
assert.ok(reflow.test.allBricks().filter(b=>b.alive).some(b=>b.y>=25),"refill must spawn visibly inside the viewport");
console.log("CLEAR_REFILL_PASS",reflow.state().brickCount);
function probeBurst(priority,maxFrames=18000){
 const game=load();game.click("start");let firstAdvanced=null,maxBalls=0,maxHp=0;
 let firstLoss=null,firstBoss=null,bossClears=0,choices=0,clears=0;
 for(let i=0;i<maxFrames;i++){
  const state=game.state();
  if(state.phase==="lost"){firstLoss=+state.elapsed.toFixed(1);break;}
  if(state.phase==="choosing"){
   const pick=priority.find(x=>state.choiceSet.split(",").includes(x));
   if(["volley","split","arc","shock"].includes(pick)&&firstAdvanced===null)firstAdvanced=+state.elapsed.toFixed(1);
   game.test.chooseUpgrade(pick);choices++;continue;
  }
  if(i%42===0){
   const target=game.test.allBricks().filter(b=>b.alive).sort((a,b)=>b.y-a.y)[0];
   if(target){const theta=Math.atan2(target.x+target.w/2-180,495-(target.y+target.h/2));
    game.aim(Math.max(0,Math.min(360,180+theta/1.08*180)));}
  }
  if(state.charge>=100&&!state.giantActive)game.test.fireGiant();
  maxBalls=Math.max(maxBalls,state.activeBalls);maxHp=Math.max(maxHp,state.hpMax);
  if(firstBoss===null&&state.bossActive)firstBoss=+state.elapsed.toFixed(1);
  game.frame(1);
 }
 const st=game.state();
 return {seconds:+st.elapsed.toFixed(1),phase:st.phase,kills:st.score,level:st.level,choices,firstAdvanced,maxBalls,maxHp,
 bossDefeats:st.bossDefeats,clears:st.screenClears,remaining:st.brickCount,firstBoss,firstLoss};
}
const burst=probeBurst(["split","volley","arc","shock","drill","power","rate","life","speed","hunter","ricochet"]);
console.log("BURST_BUILD_PROBE",JSON.stringify(burst));
assert.ok(burst.firstAdvanced===null||burst.firstAdvanced>=80,"advanced skills cannot arrive in initial onboarding");
assert.ok(burst.maxHp>=10,"numeric HP must ramp during play");
console.log("PASS v0.21: palette cycling, visible fast refill, early limited upgrades, advanced-build survival probe");
