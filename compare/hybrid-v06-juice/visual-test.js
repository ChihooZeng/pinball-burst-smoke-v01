"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const PinballJuice=require("./juice-fx.js");
function load(reduced=false){
 const els=new Map(),events=new Map();
 function el(id){
  if(!els.has(id))els.set(id,{textContent:"",style:{},disabled:false,
   classList:{add(){},remove(){},toggle(){}},addEventListener(type,cb){events.set(id+":"+type,cb);},
   setPointerCapture(){},getBoundingClientRect(){return {left:0,width:360};}});
  return els.get(id);
 }
 const ctx=new Proxy({},{
  get(o,k){if(k in o)return o[k];if(k==="createLinearGradient")return ()=>({addColorStop(){}});return ()=>{};},
  set(o,k,v){o[k]=v;return true;}});
 el("game").getContext=()=>ctx;
 let now=1000,callback=null;
 const window={
  __PINBALL_TEST__:true,PinballJuice,
  matchMedia(){return {matches:reduced};},
  addEventListener(type,cb){events.set("window:"+type,cb);}
 };
 vm.runInNewContext(fs.readFileSync("game.js","utf8"),{
  document:{hidden:false,querySelector(s){return el(s.slice(1));}},
  window,Math,console,performance:{now(){return now;}},
  requestAnimationFrame(cb){callback=cb;}
 },{filename:"game.js"});
 return {
  state:window.__pinballCompare,test:window.__pinballTest,events,el,
  changeMode(next){el("impactMode").value=next;events.get("impactMode:change")();},
  frame(frames=1){for(let i=0;i<frames;i++){now+=1000/60;assert.ok(callback);callback(now);}},
  click(id){events.get(id+":click")();},
  aim(x){const e={pointerId:1,clientX:x,preventDefault(){}};events.get("game:pointerdown")(e);events.get("game:pointerup")(e);}
 };
}
const g=load(),s=g.state,t=g.test;
assert.equal(s().remaining,35,"wave 1 is 7 x 5 = 35");
assert.equal(s().armored,5,"one armor per row");
assert.equal(s().armorHp,10,"all wave 1 armor is HP2");
assert.equal(s().interval,1,"rate unchanged");
assert.equal(s().phase,"playing");
assert.equal(s().visualImpact.mode,"balanced","new effect defaults to standard");
g.frame(115);assert.ok(s().activeBalls>=2,"auto-fire continues");
const count=s().activeBalls;g.aim(320);
assert.equal(s().activeBalls,count,"pointer-up is not fire");
assert.ok(s().aim>.7,"drag aims");
const armor=t.firstArmor();assert.ok(armor);
t.hitById(armor.id);
assert.equal(armor.hp,1,"armored brick loses 1 HP");
assert.equal(s().armorHp,9);
assert.ok(s().hitCount>=1,"hits counted");
assert.ok(s().fxRings>=1,"visual shock ring is produced");
assert.ok(s().fxText>=1,"visible decrement text produced");
assert.ok(armor.bonk>0,"surviving brick bounces briefly");
assert.ok(s().visualImpact.sparks>0,"local sparks on armor hit");
t.hitById(armor.id);
assert.equal(armor.alive,false,"second hit destroys armor");
assert.ok(s().combo>=1,"destroy increment combo");
assert.ok(s().fxParticles>0,"destruction particles present");
assert.ok(s().visualImpact.shards>0,"detached brick shards on destruction");
g.frame(100);
assert.ok(s().fxRings<=28 && s().fxText<=36 && s().fxParticles<=220,"visual effects remain capped during live hits");
t.chargeFully();assert.equal(g.el("giant").disabled,false,"giant is ready");
g.click("giant");assert.ok(s().giantActive,"manual giant released");
assert.equal(s().skillsUsed,1);
t.clearWave();assert.equal(s().phase,"choosing","wave complete pauses");
const paused=s().elapsed;g.frame(60);assert.equal(s().elapsed,paused,"selection pauses simulation");
g.click("pickRate");
assert.equal(s().remaining,42,"wave 2 is 7 x 6 = 42");
assert.equal(s().armored,6);
assert.equal(s().armorHp,18);
assert.equal(s().interval,.9,"moderate rate preserved");
t.clearWave();g.click("pickBounce");
assert.equal(s().remaining,49,"wave 3 is 7 x 7 = 49");
assert.equal(s().armored,7);
assert.equal(s().armorHp,28);
assert.equal(s().ricochetLevel,1);
t.clearWave();assert.equal(s().phase,"won","three waves remain");
g.click("again");
assert.equal(s().remaining,35);assert.equal(s().interval,1);assert.equal(s().score,0,"fresh run restores state");
const reduced=load(true);
assert.equal(reduced.state().visualImpact.mode,"off","reduced motion defaults to no extra motion");
assert.equal(reduced.el("impactMode").disabled,true);
reduced.test.hitById(reduced.test.firstArmor().id);
assert.equal(reduced.state().fxRings,0,"reduced-motion removes ring animation");
assert.equal(reduced.state().fxText,0,"reduced-motion removes pop animation");
// Additional FX can be switched off without changing brick geometry or HP.
g.changeMode("off");
assert.equal(s().visualImpact.mode,"off");
assert.equal(s().visualImpact.shards,0,"turning off clears queued shards");
t.hitById(t.firstArmor().id);
assert.equal(s().visualImpact.shards,0,"no newly emitted shards when off");
g.changeMode("bold");
assert.equal(s().visualImpact.mode,"bold");
const target=t.firstArmor();t.hitById(target.id);
assert.ok(s().visualImpact.sparks>0,"enhanced impacts generate sparks");
const beforeHit=s().hitCount;
g.frame(1);assert.ok(s().hitCount>=beforeHit,"FX switch does not reset physics");
// A real moving-target simulation: do not bypass physics for clearing waves.
const live=load();
let k=0;
for(let i=0;i<34000;i++){
 const st=live.state();
 if(st.phase==="choosing"){live.click(k++===0?"pickRate":"pickBounce");}
 if(st.phase==="won")break;
 if(i%50===0){
  const target=live.test.firstBrick();
  if(target){
    const angle=Math.atan2((target.x+target.w/2)-180, (560-37-28)-(target.y+target.h/2));
    live.aim(Math.min(360,Math.max(0,180+angle/1.08*180)));
  }
}
 live.frame();
}
console.log("LIVE SNAPSHOT",JSON.stringify(live.state()));
assert.ok(live.state().score>20,"live physics destroys many dense bricks");
assert.equal(live.state().phase,"won","no deadlock after density increase");
console.log("DENSE RUN",JSON.stringify({seconds:Math.round(live.state().elapsed),score:live.state().score,maxCombo:live.state().maxCombo,waves:live.state().wave}));
console.log("PASS 35/42/49, visual shards and sparks, standard/bold/off, reduced motion, aim, fire, upgrade, giant, win");

// Independent stress: never allow thousands of overlapping effects on long combo bursts.
const fx=PinballJuice.create({W:360,H:560});
fx.setMode("bold");
const block={x:90,y:100,w:38,h:27,color:"#7fe8c9"};
for(let i=0;i<800;i++){fx.onArmor(block);fx.onBreak(block,{combo:i+1,source:i%7===0?"giant":"normal"});}
let snap=fx.snapshot();
assert.ok(snap.shards<=120&&snap.sparks<=90&&snap.flashes<=24&&snap.waves<=5,"effect queues capped");
const moves=[];
const fakeCtx=new Proxy({},{get(o,key){if(key in o)return o[key];return (...args)=>moves.push({key,args});},set(o,k,v){o[k]=v;return true;}});
fx.applyCamera(fakeCtx);fx.draw(fakeCtx);
assert.ok(moves.length>0,"impact is drawable by Canvas API");
for(let i=0;i<90;i++)fx.update(1/60);
snap=fx.snapshot();
assert.equal(snap.shards,0,"shards expire");
assert.equal(snap.sparks,0,"sparks expire");
assert.equal(snap.flashes,0,"flashes expire");
fx.setMode("off");fx.onBreak(block,{combo:9});
assert.equal(fx.snapshot().shards,0,"off means no new shards");
console.log("PASS effect stress caps, expiry, canvas draw, on/off without gameplay changes");
