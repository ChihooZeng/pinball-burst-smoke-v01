"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const DIR="hybrid-v25-wave-rush";
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

function resolveChoices(g){while(g.state().phase==="choosing"){const options=g.state().choiceSet.split(",");const priority=["rate","speed","life","power","ricochet","hunter","drill","split","volley","arc","shock"];g.test.chooseUpgrade(priority.find(x=>options.includes(x))||options[0]);}}
function step(g,n){for(let i=0;i<n;i++){resolveChoices(g);g.frame(1);}}
function waveStats(g){const live=g.test.allBricks().filter(b=>b.alive);return {wave:g.state().wave,live:live.length,minY:Math.min(...live.map(b=>b.y)),maxBottom:Math.max(...live.map(b=>b.y+b.h)),boss:live.some(b=>b.isBoss)};}
const entry=load();const init=waveStats(entry);
assert.equal(init.wave,1);assert.equal(init.live,78);
assert.ok(init.maxBottom<=295&&455-init.maxBottom>=160,"initial wave must start far above danger line");
assert.equal(entry.test.overlapPairs(),0);
assert.equal(entry.state().waveSpawnCount,1);
console.log("WAVE_SETUP_PASS",JSON.stringify(init));
entry.click("start");
step(entry,540);assert.equal(entry.state().wave,1);
assert.equal(entry.state().waveSpawnCount,1);
assert.equal(entry.state().ambientSummonBursts,0);
assert.equal(entry.state().bridgeBursts,0);
assert.ok(entry.state().brickCount<=78);
console.log("NO_MIDWAVE_SPAWNS_PASS",entry.state().elapsed.toFixed(1));
const clear=load();clear.click("start");
clear.test.removeNormalBricks();step(clear,2);
assert.equal(clear.state().screenClears,1);assert.equal(clear.state().wave,1);
step(clear,30);assert.equal(clear.state().brickCount,0);assert.equal(clear.state().clearPreviewCount,0);
step(clear,45);assert.ok(clear.state().clearPreviewCount>=69);assert.equal(clear.state().brickCount,0);
step(clear,95);assert.equal(clear.state().wave,2);assert.equal(clear.state().waveSpawnCount,2);
assert.ok(clear.state().brickCount>=70&&clear.state().brickCount<=78,"new wave is dense, some bricks may already be broken");
assert.equal(clear.state().clearBurstTiles,78);
assert.equal(clear.test.overlapPairs(),0);
console.log("CLEAR_NEXT_WAVE_PASS",JSON.stringify(waveStats(clear)));
const bossTest=load();bossTest.click("start");bossTest.test.spawnWave(4);
assert.equal(bossTest.state().wave,4);assert.equal(bossTest.state().bossActive,true);
assert.equal(bossTest.test.overlapPairs(),0);
const b=bossTest.test.allBricks().find(b=>b.isBoss&&b.alive);assert.ok(b&&b.hp>=75);
const queued=bossTest.test.summonBossBricks();assert.ok(queued>=0&&queued<=4);
let total=bossTest.state().bossSummonTotal;
for(let j=0;j<18;j++){bossTest.test.summonBossBricks();total=bossTest.state().bossSummonTotal;}
assert.ok(total<=12,"Boss has finite support budget");
bossTest.test.setBossHp(1);bossTest.test.hitById(b.id);
assert.equal(bossTest.state().bossDefeats,1);
assert.equal(bossTest.state().bossActive,false);
assert.equal(bossTest.test.overlapPairs(),0);
console.log("BOSS_WAVE_PASS",JSON.stringify({supportBudget:total,defeats:bossTest.state().bossDefeats}));
const loss=load();loss.click("start");loss.test.allBricks()[0].y=455;step(loss,2);assert.equal(loss.state().phase,"lost");
console.log("DANGER_LINE_PASS");
const refresh=[];
for(const [hz,frames] of [[60,600],[120,1200]]){const game=load(hz);game.click("start");step(game,frames);const elapsed=game.state().elapsed;assert.ok(elapsed>=9.9&&elapsed<=10.05);refresh.push({hz,elapsed:+elapsed.toFixed(2)});}
console.log("REFRESH_RATE_PASS",JSON.stringify(refresh));
function simulate(priority,frames=18000){
 const g=load();g.click("start");let maxWave=1,choices=0;
 for(let k=0;k<frames;k++){
  const state=g.state();
  if(state.phase==="lost")break;
  if(state.phase==="choosing"){const pool=state.choiceSet.split(",");g.test.chooseUpgrade(priority.find(x=>pool.includes(x))||pool[0]);choices++;continue;}
  if(k%42===0){
   const live=g.test.allBricks().filter(b=>b.alive).sort((a,b)=>b.y-a.y);
   if(live.length){const target=live[0],theta=Math.atan2(target.x+target.w/2-180,495-(target.y+target.h/2));g.aim(Math.max(0,Math.min(360,180+theta/1.08*180)));}
  }
  if(state.charge>=100&&!state.giantActive)g.test.fireGiant();
  g.frame(1);maxWave=Math.max(maxWave,g.state().wave);
 }
 const st=g.state();return {phase:st.phase,seconds:+st.elapsed.toFixed(1),wave:st.wave,clear:st.screenClears,kills:st.score,level:st.level,boss:st.bossDefeats,choices,live:st.brickCount,maxWave,ambient:st.ambientSummonBursts,bridge:st.bridgeBursts};
}
const basic=simulate(["rate","speed","life","power","drill","hunter","ricochet","split","volley","arc","shock"]);
const strong=simulate(["rate","power","drill","split","arc","shock","volley","life","speed","ricochet","hunter"]);
console.log("LONG_RUN_BASIC",JSON.stringify(basic));
console.log("LONG_RUN_BURST",JSON.stringify(strong));
assert.equal(basic.ambient,0);assert.equal(strong.bridge,0);
assert.ok(basic.seconds>=20,"early wave cannot be instant death");
assert.ok(strong.seconds>=20,"burst wave cannot be instant death");
console.log("PASS v0.25 full-wave lifecycle");
