"use strict";
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path"),assert=require("node:assert/strict");
function launch(version){
 const listeners=new Map(),elements=new Map();
 function el(id){
  if(!elements.has(id))elements.set(id,{textContent:"",disabled:false,style:{},
   classList:{add(){},remove(){},toggle(){}},
   addEventListener(event,cb){listeners.set(id+":"+event,cb);},
   getBoundingClientRect(){return {left:0,top:0,width:360,height:560};},
   setPointerCapture(){}});
  return elements.get(id);
 }
 const context=new Proxy({},{
  get(o,k){if(k in o)return o[k];if(k==="createLinearGradient")return ()=>({addColorStop(){}});return ()=>{};},
  set(o,k,v){o[k]=v;return true;}
 });
 el("game").getContext=()=>context;
 const document={hidden:false,querySelector(s){return el(s.slice(1));}};
 const window={__PINBALL_TEST__:true,addEventListener(event,cb){listeners.set("window:"+event,cb);}};
 let cb=null,now=1000;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,version,"game.js"),"utf8"),{
  document,window,Math,console,performance:{now(){return now;}},requestAnimationFrame(fn){cb=fn;}
 },{filename:version+"/game.js"});
 return {
  version,state:()=>window.__pinballCompare(),test:window.__pinballTest,el,
  click(id){assert.ok(listeners.has(id+":click"),"click event exists "+id);listeners.get(id+":click")();},
  aim(x){const e={pointerId:1,clientX:x,clientY:260,preventDefault(){}};listeners.get("game:pointerdown")(e);listeners.get("game:pointerup")(e);},
  frame(n=1){for(let i=0;i<n;i++){now+=1000/60;assert.ok(cb);cb(now);}}
 };
}
const a=launch("traditional"),b=launch("hybrid");
for(const s of [a,b]){
 assert.equal(s.state().phase,"playing");
 assert.equal(s.state().remaining,15,"15 bricks initially");
 assert.equal(s.state().interval,1,"shared fire rate");
 s.frame(115);assert.ok(s.state().activeBalls>=2,"auto-shot creates concurrent balls");
 const num=s.state().activeBalls;s.aim(350);
 assert.equal(s.state().activeBalls,num,"pointer release does not fire");
 assert.ok(s.state().aim>0.8,"aim changes independently");
 s.test.chargeFully();assert.equal(s.el("giant").disabled,false,"visible giant skill enabled when full");
 s.click("giant");assert.equal(s.state().skillsUsed,1);
 s.test.clearWave();assert.equal(s.state().phase,"choosing","same wave choices");
 s.click("pickRate");assert.equal(s.state().interval,.9);
 s.test.clearWave();s.click("pickBounce");assert.equal(s.state().ricochetLevel,1);
 s.test.clearWave();assert.equal(s.state().phase,"won","three waves complete");
 s.click("again");assert.equal(s.state().phase,"playing");
 assert.equal(s.state().wave,1);assert.equal(s.state().interval,1);
 const html=fs.readFileSync(path.join(__dirname,s.version,"index.html"),"utf8");
 assert.ok(html.indexOf('id="giant"')<html.indexOf('id="choiceOverlay"'),"giant always visible inside arena");
}
assert.equal(a.state().armored,0,"A all bricks one-hit");
assert.equal(b.state().armored,2,"B initially only two armored bricks");
const armor=b.test.firstArmor();assert.ok(armor);
assert.equal(armor.hp,2,"first-wave armor HP=2");
const previous=b.state().score;
b.test.hitById(armor.id);
assert.equal(armor.hp,1,"armor first hit loses exactly one HP");
assert.equal(b.state().score,previous,"hit without destruction does not score");
b.test.hitById(armor.id);
assert.equal(armor.alive,false,"armor second hit is destroyed");
assert.equal(b.state().score,previous+1,"score only on destruction");
b.test.clearWave();b.click("pickRate");
assert.equal(b.test.firstArmor().hp,3,"wave two armor HP=3");
b.test.clearWave();b.click("pickBounce");
assert.equal(b.test.firstArmor().hp,4,"wave three armor HP=4");

function activeRun(version,maxFrames=26000){
 const s=launch(version);
 let upgradeCount=0;
 for(let i=0;i<maxFrames;i++){
  if(s.state().phase==="choosing"){upgradeCount++;s.click(upgradeCount===1?"pickRate":"pickBounce");}
  if(s.state().phase==="won")break;
  if(i%100===0)s.aim([180,70,300,150,220,30][Math.floor(i/100)%6]);
  s.frame();
 }
 return {...s.state(),upgradeCount};
}
const outcomeA=activeRun("traditional"),outcomeB=activeRun("hybrid");
assert.ok(outcomeA.score>0&&outcomeB.score>0,"real shots destroy bricks in both versions");
console.log("A",JSON.stringify({score:outcomeA.score,phase:outcomeA.phase,seconds:Math.round(outcomeA.elapsed),wave:outcomeA.wave}));
console.log("B",JSON.stringify({score:outcomeB.score,phase:outcomeB.phase,seconds:Math.round(outcomeB.elapsed),wave:outcomeB.wave}));
console.log("PASS: baseline one-hit; hybrid 2/3/4 HP; identical controls, fire interval and upgrade choices; normal ball, giant charge, pause, win, replay, and active simulation");
