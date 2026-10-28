"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
function load(dir,{reduced=false}={}){
  const events=new Map(),elements=new Map();
  function el(id){
    if(!elements.has(id))elements.set(id,{textContent:"",style:{},disabled:false,value:"",classList:{
      add(v){this[v]=true;},remove(v){this[v]=false;},toggle(){}},
      addEventListener(type,fn){events.set(id+":"+type,fn);},
      setPointerCapture(){},getBoundingClientRect(){return {left:0,width:360,top:0,height:560};}
    });
    return elements.get(id);
  }
  const context=new Proxy({},{get(o,k){
    if(k in o)return o[k];
    if(k==="createLinearGradient")return ()=>({addColorStop(){}});
    return ()=>{};},set(o,k,v){o[k]=v;return true;}});
  el("game").getContext=()=>context;
  let now=1000,callback=null;
  const window={__PINBALL_TEST__:true,PinballJuice:require("./"+dir+"/juice-fx.js"),
   matchMedia(){return {matches:reduced};},addEventListener(type,fn){events.set("window:"+type,fn);}};
  vm.runInNewContext(fs.readFileSync("./"+dir+"/game.js","utf8"),{
   document:{hidden:false,querySelector(s){return el(s.slice(1));}},window,
   requestAnimationFrame(fn){callback=fn;},performance:{now(){return now;}},Math,console
  },{filename:dir+"/game.js"});
  return {test:window.__pinballTest,state:window.__pinballCompare,el,
   frame(n=1){for(let i=0;i<n;i++){now+=1000/60;assert.ok(callback);callback(now);}},
   aim(x){const e={pointerId:1,clientX:x,preventDefault(){}};events.get("game:pointerdown")(e);events.get("game:pointerup")(e);},
   click(id){events.get(id+":click")();}};
}
const A="hybrid-v10a-hunt",B="hybrid-v10b-lightning";
for(const dir of [A,B]){
 const g=load(dir),s=g.state,t=g.test;
 assert.equal(s().phase,"playing");
 assert.equal(s().remaining,72);
 assert.equal(s().finalRushThreshold,8);
 assert.equal(s().endgameActive,false);
 assert.equal(s().visualImpact.mode,"bold");
 assert.equal(s().shotSpeed,365);
 assert.equal(s().shotRadius,3.45);
 assert.equal(s().armored,11,"same B armor ratio");
 assert.equal(s().armorHp,22);
 assert.equal(s().interval,1);
 assert.equal(s().splitLevel,0);
 const h=t.firstArmor();t.hitById(h.id);t.hitById(h.id);
 assert.equal(h.alive,true);assert.equal(h.cracked,true,"two-stage armor preserved");
 t.hitById(h.id);assert.equal(h.alive,false);
 t.clearWave();assert.equal(s().phase,"choosing");
 g.click("pickSplit");
 assert.equal(s().remaining,81);assert.equal(s().endgameActive,false);
 assert.equal(s().splitLevel,1);
 t.clearWave();g.click("pickChain");
 assert.equal(s().remaining,90);
 t.clearWave();g.click("pickBounce");
 assert.equal(s().remaining,99);
 t.clearWave();assert.equal(s().phase,"won");
 g.click("again");assert.equal(s().remaining,72);assert.equal(s().splitLevel,0);
 const reduced=load(dir,{reduced:true});
 assert.equal(reduced.state().visualImpact.mode,"off");
 assert.equal(reduced.el("impactMode").disabled,true);
 const shortcut=load(dir);
 shortcut.click("previewFinale");
 assert.equal(shortcut.state().remaining,8,"human testers can jump to the last eight bricks");
 assert.equal(shortcut.state().armored,3,"shortcut preserves three numeric armor targets");
 assert.equal(shortcut.state().endgameActive,true);
 assert.equal(shortcut.state().phase,"playing");
 if(dir===A)assert.equal(shortcut.state().huntActive,false,"quick preview never auto fires the finale");
 else assert.equal(shortcut.state().lightningTriggers,0,"quick preview does not discharge lightning");
 console.log("PASS shared four-wave and two-stage baseline",dir);
}
const hunt=load(A),ht=hunt.test,hs=hunt.state;
const remainA=ht.leaveBricks(8);
assert.equal(remainA.length,8);
ht.markFinalRush();
assert.equal(hs().endgameActive,true);
assert.equal(hs().huntActive,false,"no auto finish until real projectile hit");
const first=remainA[0];
ht.injectTestBall(first.x+first.w/2,first.y+first.h+7,0,-365);
for(let i=0;i<600&&hs().phase==="playing";i++)hunt.frame();
assert.equal(hs().phase,"choosing","once started, homing ball clears the whole tail");
assert.ok(hs().huntHits>=5,"hunt performs multiple sequential true hits");
assert.equal(typeof hs().endgameWaveStats,"string","diagnostics are serialized");
assert.ok(JSON.parse(hs().endgameWaveStats)[0].seconds>0,"tail duration is measured");
console.log("HUNT tail",JSON.stringify({hits:hs().huntHits,endgameSeconds:hs().endgameElapsed,score:hs().score}));

const guard=load(A),gt=guard.test,gs=guard.state;
const nine=gt.leaveBricks(12);
assert.equal(nine.length,12);
gt.injectTestBall(nine[0].x+nine[0].w/2,nine[0].y+nine[0].h+7,0,-365);
guard.frame(3);
assert.equal(gs().endgameActive,false,"auto hunt does not start at more than eight survivors");
assert.equal(gs().huntActive,false);

const lightning=load(B),lt=lightning.test,ls=lightning.state;
const remainB=lt.leaveBricks(8);
lt.markFinalRush();
assert.equal(ls().endgameActive,true);
assert.equal(ls().lightningTriggers,0,"no free lightning until real hit");
const one=remainB[0],other=remainB[6];
lt.injectTestBall(one.x+one.w/2,one.y+one.h+7,0,-365);
lt.addTestBall(other.x+other.w/2,other.y+other.h+7,0,-365);
lightning.frame(3);
assert.ok(ls().lightningTriggers>=2,"two distinct balls independently trigger lightning");
assert.ok(ls().lightningDamage>=2,"chain distributes real brick damage");
assert.ok(ls().lightningArcCount>=2,"several independent bolts are rendered");
assert.ok(ls().lightningDamage<=ls().lightningTriggers*3,"each chain limits secondary hits");
assert.ok(ls().score<=4,"two near-simultaneous hits must not auto-wipe eight tiles");
console.log("LIGHTNING concurrent",JSON.stringify({triggers:ls().lightningTriggers,secondaryHits:ls().lightningDamage,arcs:ls().lightningArcCount,score:ls().score}));
lightning.frame(30);
assert.equal(ls().lightningArcCount,0,"bright lightning strokes expire");

const bounce=load(B),bt=bounce.test,bs=bounce.state;
const b=bt.firstArmor();
bt.keepOnlyBrick(b.id);bt.markFinalRush();
bt.injectTestBall(b.x+b.w/2,b.y+b.h+4.5,0,-365);
bounce.frame(4);
assert.equal(b.hp,0,"one physical hit plus one limited last-armor echo causes the shell to crack");
assert.equal(b.cracked,true,"last-block echo preserves two-stage armor before deletion");
assert.equal(b.alive,true,"extra lightning cannot instantly erase the last armor brick");
assert.ok(bt.ballSnapshot()[0].vy>0,"primary ball still follows the ordinary reflected trajectory");
assert.equal(bs().lightningTriggers,1,"last armored brick has one limited self-return lightning");
assert.equal(bs().lightningDamage,1);

function play(dir,route=["split","chain","bounce"],maxFrames=26000){
 const g=load(dir);let next=0;
 for(let i=0;i<maxFrames;i++){
  const s=g.state();
  if(s.phase==="choosing")assert.equal(g.test.chooseByKind(route[next++]),true);
  if(s.phase==="won")break;
  if(i%42===0){
   const brick=g.test.firstBrick();
   if(brick){
    const a=Math.atan2(brick.x+brick.w/2-180,495-(brick.y+brick.h/2));
    g.aim(Math.min(360,Math.max(0,180+a/1.08*180)));
   }
  }
  g.frame();
 }
 const state=g.state();
 assert.equal(state.phase,"won",dir+" completes four waves");
 assert.equal(state.score,342,dir+" clears all bricks");
 assert.equal(next,3,"three upgrade decisions");
 const finalTimes=JSON.parse(state.endgameWaveStats);
 assert.equal(finalTimes.length,4,"endgame elapsed per wave recorded");
 return {...state,finalTimes};
}
for(const dir of [A,B]){
 const g=play(dir);
 console.log("FULL",dir,JSON.stringify({seconds:+g.elapsed.toFixed(1),score:g.score,maxCombo:g.maxCombo,finalSeconds:g.finalTimes,huntHits:g.huntHits,lightningTriggers:g.lightningTriggers,lightningDamage:g.lightningDamage}));
}
console.log("PASS same threshold 8, no automatic activation, A true hit then full chase, B independent lightning from 2 simultaneous balls, real armor reflection, capped visual, 342 full game");
