"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const OLD="hybrid-v13-numberfield",NEW="hybrid-v16-sound-build";
function load(dir,{reduced=false}={}){
 const events=new Map(),elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{
  textContent:"",value:"",disabled:false,style:{},
  classList:{add(s){this[s]=true},remove(s){this[s]=false},toggle(key,value){this[key]=value===undefined?!this[key]:value;}},
  addEventListener(k,fn){events.set(id+":"+k,fn)},
  setPointerCapture(){},
  getBoundingClientRect(){return {left:0,top:0,width:360,height:560}}
 });return elements.get(id);}
 const ctx=new Proxy({},{get(obj,k){if(k in obj)return obj[k];if(k==="createLinearGradient")return ()=>({addColorStop(){}});return ()=>{}},
 set(obj,k,v){obj[k]=v;return true}});
 el("game").getContext=()=>ctx;
 let now=1000,cb=null;
 const audioCalls={oscillators:0};
 const param=()=>({value:0,setValueAtTime(v){this.value=v},exponentialRampToValueAtTime(v){this.value=v},setTargetAtTime(v){this.value=v}});
 class MockAudio{
  constructor(){this.currentTime=1;this.state="running";this.destination={};}
  createGain(){const g={gain:param(),connect(){}};if(!audioCalls.master)audioCalls.master=g;return g;}
  createDynamicsCompressor(){return {threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){}};}
  createOscillator(){audioCalls.oscillators++;return {frequency:param(),connect(){},start(){},stop(){}};}
  resume(){this.state="running";}
 }
 const window={__PINBALL_TEST__:true,AudioContext:MockAudio,PinballJuice:require("./"+dir+"/juice-fx.js"),
  matchMedia(){return {matches:reduced}},addEventListener(kind,fn){events.set("window:"+kind,fn)}};
 vm.runInNewContext(fs.readFileSync("./"+dir+"/game.js","utf8"),{
  document:{hidden:false,querySelector(q){return el(q.slice(1))}},window,
  performance:{now(){return now}},requestAnimationFrame(fn){cb=fn},Math,console
 },{filename:dir+"/game.js"});
 return {test:window.__pinballTest,state:window.__pinballCompare,el,audioCalls,
  frame(n=1){for(let i=0;i<n;i++){now+=1000/60;assert.ok(cb);cb(now)}},
  click(id){assert.ok(events.has(id+":click"));events.get(id+":click")()},
  input(id,value){el(id).value=String(value);assert.ok(events.has(id+":input"));events.get(id+":input")()},
  aim(x){const e={pointerId:1,clientX:x,preventDefault(){}};
   events.get("game:pointerdown")(e);events.get("game:pointerup")(e);}
 };
}




const WAVE_ROWS=[8,9,10,11,9,10,11,10,11,11];
const TOTAL=WAVE_ROWS.reduce((n,x)=>n+x*9,0);
const first=load(NEW),f=first.test;
assert.equal(first.state().wave,1);
assert.equal(first.state().waveCount,10);
assert.equal(first.state().remaining,72);
assert.equal(first.state().soundVolume,.78);
assert.equal(first.state().interval,.86);
const tile=f.allBricks().find(b=>b.hp>=5);
const hp=tile.hp;
for(let i=0;i<Math.ceil(hp/2);i++)f.hitById(tile.id);
assert.equal(tile.alive,false,"default physical ball breaks armor without another cleanup hit");
assert.ok(first.state().armorHits>=hp);

// Audio can initialize through a user gesture; the slider must control real gain.
const audio=load(NEW);
audio.click("soundTest");
assert.ok(audio.audioCalls.oscillators>=2,"sound audition creates layered synth voices");
assert.ok(audio.test.unlockSound,"gesture unlock path exposed to test");
assert.equal(audio.state().soundVolume,.78);
assert.ok(audio.el("soundValue").textContent.includes("78%"));
assert.equal(audio.audioCalls.master.gain.value,.78*.82);
const earlier=audio.audioCalls.oscillators;
audio.input("soundVolume",0);audio.click("soundTest");
assert.equal(audio.state().soundVolume,0);
assert.equal(audio.audioCalls.oscillators,earlier,"muted mix must stay silent");
audio.input("soundVolume",100);audio.test.playSfx("upgrade");
assert.equal(audio.state().soundVolume,1);
assert.ok(audio.audioCalls.oscillators>earlier,"unmuted audition must render sound");

function unlock(kind){
 const g=load(NEW),t=g.test;
 t.clearWave();assert.equal(t.chooseByKind(kind),true);
 return g;
}
const drill=unlock("drill");
drill.frame(400);
assert.ok(drill.state().powerShots>0,"drill skill must physically spawn drill balls");
const split=unlock("split");
const brick=split.test.allBricks().find(b=>b.hp===1&&!b.special);
split.test.keepOnlyBrick(brick.id);
split.test.injectTestBall(brick.x+brick.w/2,brick.y+brick.h+16,0,-365);
split.frame(8);
assert.ok(split.state().splitBursts>=1,"split produces satellite balls on first hit");
assert.ok(split.state().bonusVolleyBalls>=2);
const hunter=unlock("hunter");
hunter.test.injectTestBall(4,410,-365,-20);
hunter.frame(5);
assert.ok(hunter.state().homingTurns>=1,"wall bounce dynamically retargets active ball");
const bounce=unlock("ricochet");
bounce.test.injectTestBall(4,420,-365,-20);
bounce.frame(5);
assert.ok(bounce.state().ricochetTriggers>=1,"wall bounce builds next-impact charge");
const shock=unlock("shock");
shock.test.allBricks().filter(b=>b.hp===1&&!b.special).slice(0,4)
 .forEach(b=>shock.test.hitById(b.id,"normal"));
assert.ok(shock.state().shockWaves>=1,"every third direct destruction emits a shockwave");
const arc=unlock("arc");
const origin=arc.test.allBricks().find(b=>b.armored);
assert.equal(arc.test.triggerLightningById(origin.id,{contacts:3,lastArcAt:-999,mini:false}),true,"electric arc must work without old threshold passive");
assert.ok(arc.state().lightningTriggers>=1);
assert.equal(arc.state().cannonPassive,"none","old passive lightning is removed");

const combo=load(NEW);
const route=["split","arc","shock","drill","hunter","ricochet","split","arc","shock"];
for(const name of route){combo.test.clearWave();assert.equal(combo.test.chooseByKind(name),true);}
assert.equal(combo.state().stormBuild,true,"split + arc fusion");
assert.equal(combo.state().blastBuild,true,"drill + shock fusion");
assert.equal(combo.state().wave,10);

const giant=load(NEW);
const t=giant.test;
const weak=t.allBricks().find(b=>b.hp===1&&!b.special);
t.keepOnlyBrick(weak.id);
t.injectGiantAt(weak.x+weak.w/2,weak.y+weak.h+17,0,-610);
t.setGiantPiercesLeft(1);
giant.frame(5);
assert.equal(weak.alive,false);
assert.equal(giant.state().giantActive,false,"giant no longer remains dominant after budget is spent");

function play(route,limit=120000){
 const g=load(NEW);let up=0;
 for(let i=0;i<limit;i++){
  const st=g.state();
  if(st.phase==="choosing"){
   assert.ok(up<route.length);
   assert.equal(g.test.chooseByKind(route[up++]),true);
  }
  if(st.phase==="won")break;
  if(i%42===0){
   const target=g.test.firstBrick();
   if(target){
    const theta=Math.atan2(target.x+target.w/2-180,495-(target.y+target.h/2));
    g.aim(Math.max(0,Math.min(360,180+theta/1.08*180)));
   }
  }
  g.frame();
 }
 const state=g.state();
 assert.equal(state.phase,"won","complete 10 waves using actual simulated projectiles");
 assert.equal(state.score,TOTAL);
 assert.equal(up,9);
 return state;
}
const a=play(["split","arc","shock","drill","split","arc","hunter","ricochet","shock"]);
const b=play(["drill","shock","hunter","split","drill","ricochet","arc","shock","hunter"]);
console.log("V16 RUNS",JSON.stringify([
 {seconds:+a.elapsed.toFixed(1),score:a.score,combo:a.maxCombo,split:a.splitBursts,shock:a.shockWaves,arc:a.lightningTriggers},
 {seconds:+b.elapsed.toFixed(1),score:b.score,combo:b.maxCombo,split:b.splitBursts,shock:b.shockWaves,arc:b.lightningTriggers}
]));
console.log("PASS v0.16: six rewritten skills, layered sound audition, no old passive, giant cap, real ten-wave completion in two builds");
