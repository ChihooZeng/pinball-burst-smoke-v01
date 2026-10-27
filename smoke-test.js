"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const listeners = new Map();
const elements = new Map();
function el(id) {
  if(!elements.has(id)) elements.set(id,{
    id, textContent:"", classList:{add(){},remove(){}}, addEventListener(event,fn){listeners.set(id+":"+event,fn);},
    getBoundingClientRect(){return {left:0,top:0,width:360,height:560}},
    setPointerCapture(){}
  });
  return elements.get(id);
}
const canvas=el("game");
const ctx=new Proxy({}, {get(o,k){
  if(k in o) return o[k];
  if(["createLinearGradient"].includes(k)) return () => ({addColorStop(){}});
  return () => {};
},set(o,k,v){o[k]=v;return true}});
canvas.getContext=()=>ctx;
const document={
  hidden:false,
  querySelector(selector){return el(selector.slice(1));}
};
let callback=null;
const globals={document,window:{addEventListener(){}},Math,performance:{now(){return 1000}},
  requestAnimationFrame(fn){callback=fn;},console};
vm.runInNewContext(fs.readFileSync("game.js","utf8"),globals,{filename:"game.js"});
let now=1000;
const read=()=>globals.window.__pinballSmoke();
function step(frames=1){
  for(let i=0;i<frames;i++){now+=1000/60;const fn=callback;assert.ok(fn,"frame loop registered");fn(now);}
}
assert.equal(read().interval,1,"initial rate is 1 ball/sec");
step(115);
assert.ok(read().activeBalls>=2,"multiple balls remain in the field during continuous auto-fire");
const before=read().activeBalls;
const down=listeners.get("game:pointerdown"), up=listeners.get("game:pointerup");
down({pointerId:1,clientX:350,clientY:350,preventDefault(){}});
assert.ok(read().aim>0.9,"horizontal touch changes turret direction");
up({pointerId:1});
assert.equal(read().activeBalls,before,"finger release does NOT spawn a ball");
listeners.get("mode:click")();
assert.equal(read().mode,"drop","button toggles drop feedback mode");
assert.equal(read().activeBalls,0,"switching modes starts a fair new run");
assert.equal(read().interval,1,"switching resets upgrades and fire interval");
step(115);
assert.ok(read().activeBalls>=2,"drop mode still auto fires without collecting old balls");
listeners.get("reset:click")();
assert.equal(read().mode,"drop","reset keeps selected test mode");
assert.equal(read().score,0,"reset clears score");
// Exercise actual collisions and both upgrade schemes through many frames.
const clickMode = listeners.get("mode:click");
clickMode(); // drop -> instant, also restart
let bestInstant = read();
for(let i=0;i<6000;i++){
  if(i%140===0){
    const x = [180,70,290,140,225][Math.floor(i/140)%5];
    down({pointerId:2,clientX:x,clientY:360,preventDefault(){}});
    up({pointerId:2});
  }
  step();
  const s=read();
  if(s.upgrades>bestInstant.upgrades)bestInstant=s;
  if(s.hasWon)break;
}
assert.ok(bestInstant.score>0,"live collision damages bricks");
assert.ok(bestInstant.upgrades>0,"special SPEED brick directly upgrades rate");
assert.ok(bestInstant.interval<1,"auto fire rate actually accelerates");
clickMode(); // instant -> drop, restarts
let seenDrop=false, bestDrop=read();
for(let i=0;i<6000;i++){
  if(i%140===0){
    const x = [180,70,290,140,225][Math.floor(i/140)%5];
    down({pointerId:2,clientX:x,clientY:360,preventDefault(){}});
    up({pointerId:2});
  }
  step();
  const s=read(); if(s.drops>0) seenDrop=true;
  if(s.upgrades>bestDrop.upgrades)bestDrop=s;
  if(s.hasWon)break;
}
assert.ok(seenDrop,"drop feedback visibly creates a falling pickup");
assert.ok(bestDrop.upgrades>0,"falling pickup is auto-collected and upgrades fire rate");
console.log("PASS auto-fire, concurrent balls, touch-only aiming, no release fire, mode toggle, reset, real collision, instant upgrade, falling auto-pickup");
