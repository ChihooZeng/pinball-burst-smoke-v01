"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const handlers = new Map(), elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const styles = {};
    const obj = {id, textContent:"", disabled:false, style:styles,
      classList:{add(){},remove(){}},
      addEventListener(event,cb){handlers.set(id+":"+event,cb);},
      getBoundingClientRect(){return {left:0,top:0,width:360,height:560};},
      setPointerCapture(){}
    };
    elements.set(id,obj);
  }
  return elements.get(id);
}
const canvas=element("game");
const context=new Proxy({},{
  get(obj,key) {
    if(key in obj) return obj[key];
    if(key === "createLinearGradient") return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set(obj,key,value){obj[key]=value;return true;}
});
canvas.getContext=()=>context;
const document={hidden:false,querySelector(s){return element(s.slice(1));}};
let nextFrame=null,now=1000;
const window={
  __PINBALL_TEST__:true,
  addEventListener(event,fn){handlers.set("window:"+event,fn);}
};
vm.runInNewContext(fs.readFileSync("game.js","utf8"),{
  document,window,Math,console,
  performance:{now(){return now;}},
  requestAnimationFrame(fn){nextFrame=fn;}
}, {filename:"game.js"});
const state=()=>window.__pinballState();
const t=window.__pinballTest;
function frame(n=1) {
  for(let i=0;i<n;i++){now+=1000/60;const fn=nextFrame;assert.ok(fn);fn(now);}
}
function touch(x){
  const data={pointerId:1,clientX:x,clientY:200,preventDefault(){}};
  handlers.get("game:pointerdown")(data);
  handlers.get("game:pointerup")(data);
}
assert.equal(state().interval,1,"base rate");
frame(110);
assert.ok(state().activeBalls>=2,"turret fires independently of old ball returns");
const before=state().activeBalls;touch(320);
assert.ok(state().aim>.7,"touch sets independent angle");
assert.equal(state().activeBalls,before,"pointer release does not fire an extra ball");
t.chargeFully();
assert.equal(state().charge,100,"charge meter reaches ready");
assert.equal(element("giant").disabled,false,"charged giant button enabled");
handlers.get("giant:click")();
assert.equal(state().charge,0,"giant consumes all energy");
assert.equal(state().skillsUsed,1,"giant is manually activated");
assert.equal(state().giantActive,true,"giant projectile enters the scene");
frame(85);
assert.equal(state().giantActive,false,"giant is finite, not a permanent source of auto-damage");
t.clearWave();
assert.equal(state().phase,"choosing","first wave pauses for upgrade choice");
assert.equal(state().wave,1,"wave does not advance until chosen");
const pausedBalls=state().activeBalls;
frame(150);
assert.equal(state().activeBalls,pausedBalls,"no auto shots fire while choosing");
const giantButton=element("giant");
assert.equal(giantButton.disabled,true,"giant cannot be activated during selection");
handlers.get("pickRate:click")();
assert.equal(state().phase,"playing","choice resumes combat");
assert.equal(state().wave,2,"choice advances exactly one wave");
assert.equal(state().interval,.9,"first rate upgrade is modest");
frame(115);assert.ok(state().activeBalls>0,"shots resume in wave 2");
t.clearWave();
handlers.get("pickRate:click")();
assert.equal(state().interval,.82,"second rate upgrade reaches configured cap");
assert.equal(state().wave,3);
t.clearWave();
assert.equal(state().phase,"won","third wave ends game");
frame(150);assert.equal(state().phase,"won","win state persists without auto-firing");
handlers.get("again:click")();
assert.equal(state().phase,"playing","restart returns to active combat");
assert.equal(state().wave,1);
assert.equal(state().interval,1,"restart resets fire rate");
assert.equal(state().charge,0,"restart resets giant charge");
t.clearWave();
handlers.get("pickBounce:click")();
assert.equal(state().ricochetLevel,1,"bounce upgrade active");
const previous = state().score, count = state().ricochetTriggers;
t.injectRicochet();
assert.equal(state().ricochetTriggers,count+1,"side-wall rebound triggers splash");
assert.ok(state().score >= previous+2,"splash breaks extra nearby brick");
t.clearWave();
handlers.get("pickBounce:click")();
assert.equal(state().ricochetLevel,2,"second bounce upgrade increases effectiveness");
t.reset();
assert.equal(state().ricochetLevel,0,"reset removes build");
assert.equal(state().skillsUsed,0,"reset removes manual skill use");
console.log("PASS auto-fire, aim-only touch, giant charging and manual release, bounded giant lifetime, paused upgrade choices, rate caps, ricochet splash, victory and replay");
