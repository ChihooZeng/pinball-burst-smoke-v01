"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
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
  __PINBALL_TEST__:true,
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
t.hitById(armor.id);
assert.equal(armor.alive,false,"second hit destroys armor");
assert.ok(s().combo>=1,"destroy increment combo");
assert.ok(s().fxParticles>0,"destruction particles present");
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
reduced.test.hitById(reduced.test.firstArmor().id);
assert.equal(reduced.state().fxRings,0,"reduced-motion removes ring animation");
assert.equal(reduced.state().fxText,0,"reduced-motion removes pop animation");
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
console.log("PASS dense waves 35/42/49, armor HP2/3/4, hit FX+caps, reduced motion, aim, auto fire, rate, giant, upgrade, no deadlock");
