"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {create,patterns}=require("./haptics.js");
let clock=0,visible=true;
const calls=[];
const api=create({vibrate:p=>{calls.push(p);return true;},now:()=>clock,visible:()=>visible});
assert.ok(api.supported);
assert.equal(api.enabled,false,"opt-in default off");
api.request("break");api.flush();
assert.equal(calls.length,0,"disabled never vibrates");
api.setEnabled(true);
api.request("armor");api.request("break");api.request("combo");api.request("armor");api.flush();
assert.equal(calls.length,1,"same-frame hits merged to one");
assert.deepEqual(calls[0],patterns.combo.pattern,"highest-priority event kept");
clock+=100;api.request("armor");api.flush();
assert.equal(calls.length,1,"cooldown prevents buzz spam");
clock+=300;api.request("armor");api.flush();
assert.equal(calls.length,2,"armor tick allowed after cooldown");
assert.equal(calls[1],10);
clock+=110;api.request("ultimate");api.flush();
assert.equal(calls.length,3,"manual ultimate overrides near hit");
assert.deepEqual(calls[2],patterns.ultimate.pattern);
clock+=125;api.request("break");api.flush();
assert.equal(calls.length,3,"post-ultimate hits throttled");
clock+=500;api.test();
assert.equal(calls.length,4,"test button makes direct short pulse");
visible=false;clock+=600;api.request("break");api.flush();
assert.equal(calls.length,4,"hidden tab never vibrates");
visible=true;api.setEnabled(false);
assert.equal(calls.at(-1),0,"disabling cancels active pulses");
const missing=create({vibrate:null,now:()=>clock});
assert.equal(missing.supported,false);
assert.equal(missing.setEnabled(true),false);
assert.equal(missing.test(),false);
const error=create({vibrate:()=>{throw Error("no hardware");},now:()=>clock});
error.setEnabled(true);error.request("break");assert.equal(error.flush(),false);
assert.equal(error.snapshot().failed,1);

function newGame({supported=true}={}){
 const handlers=new Map(),elements=new Map(),vibrations=[];
 let time=1000,nextFrame=null;
 function el(id){
  if(!elements.has(id))elements.set(id,{
   textContent:"",style:{},checked:false,disabled:false,classList:{add(){},remove(){},toggle(){}},
   addEventListener(type,fn){handlers.set(id+":"+type,fn);},
   getBoundingClientRect(){return {left:0,top:0,width:360,height:560};},setPointerCapture(){}
  });return elements.get(id);
 }
 const cv=el("game");
 const ctx=new Proxy({},{get(o,k){
  if(k in o)return o[k];
  if(k==="createLinearGradient")return ()=>({addColorStop(){}});
  return ()=>{};
 },set(o,k,v){o[k]=v;return true}});
 cv.getContext=()=>ctx;
 const window={
  __PINBALL_TEST__:true,
  PinballHaptics:{create},
  matchMedia(){return {matches:false};},
  addEventListener(type,fn){handlers.set("window:"+type,fn);}
 };
 const navigator=supported?{vibrate:(pattern)=>{vibrations.push(pattern);return true;}}:{};
 vm.runInNewContext(fs.readFileSync("game.js","utf8"),{
  document:{hidden:false,querySelector(s){return el(s.slice(1));}},
  window,navigator,Math,console,
  performance:{now(){return time;}},
  requestAnimationFrame(fn){nextFrame=fn;}
 },{filename:"game.js"});
 return {
  el,handlers,vibrations,window,
  step(frames=1){for(let i=0;i<frames;i++){time+=1000/60;const cb=nextFrame;assert.ok(cb);cb(time);}},
  touch(x){const e={pointerId:1,clientX:x,clientY:300,preventDefault(){}};handlers.get("game:pointerdown")(e);handlers.get("game:pointerup")(e);},
  toggle(value){el("hapticToggle").checked=value;handlers.get("hapticToggle:change")();},
  click(id){handlers.get(id+":click")();}
 };
}
const g=newGame(),state=()=>g.window.__pinballCompare(),t=g.window.__pinballTest;
assert.equal(state().remaining,35,"same v0.5 7-col game");
assert.equal(state().haptics.enabled,false,"game haptics default off");
assert.equal(g.el("hapticToggle").disabled,false,"support detected only via API");
g.step(110);
assert.ok(state().activeBalls>=2,"auto fire unchanged");
const before=state().activeBalls;g.touch(325);
assert.equal(state().activeBalls,before,"release still does not fire");
assert.ok(state().aim>.8,"touch aim still works");
const first=t.firstArmor();
t.hitById(first.id);
assert.equal(g.vibrations.length,0,"no vibration before opt in");
g.toggle(true);assert.equal(state().haptics.enabled,true);
g.click("hapticTest");assert.equal(g.vibrations.length,1,"explicit test pulse vibrates");
g.step(30);
t.hitById(first.id);g.step(1);
assert.ok(g.vibrations.length>=2,"game damage causes a native vibration after opt in");
const count=g.vibrations.length;
for(let i=0;i<20;i++)t.hitById(t.firstArmor()?.id??-1);
g.step(1);
assert.ok(g.vibrations.length<=count+1,"many impacts in one frame never send multiple pulses");
g.toggle(false);
assert.equal(g.vibrations.at(-1),0,"turning off cancels vibration");
t.clearWave();assert.equal(state().phase,"choosing","upgrade choice continues working");
g.click("pickRate");assert.equal(state().interval,.9);
t.clearWave();g.click("pickBounce");assert.equal(state().ricochetLevel,1);
t.clearWave();assert.equal(state().phase,"won");
g.click("again");assert.equal(state().remaining,35);

const noapi=newGame({supported:false});
assert.equal(noapi.el("hapticToggle").disabled,true,"unsupported browser does not advertise working vibration");
assert.equal(noapi.el("hapticTest").disabled,true,"unsupported test button disabled");
noapi.toggle(true);assert.equal(noapi.window.__pinballCompare().haptics.enabled,false);
console.log("PASS opted-in vibration, event merging, type priority, cooldowns, unsupported browser guard, physical interaction and unchanged game flow");
