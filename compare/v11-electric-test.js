"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const OLD="hybrid-v10b-lightning",NEW="hybrid-v11b-progressive";
function load(dir,{reduced=false}={}){
 const events=new Map(),elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{
  textContent:"",value:"",disabled:false,style:{},
  classList:{add(s){this[s]=true},remove(s){this[s]=false},toggle(){}},
  addEventListener(k,fn){events.set(id+":"+k,fn)},
  setPointerCapture(){},
  getBoundingClientRect(){return {left:0,top:0,width:360,height:560}}
 });return elements.get(id);}
 const ctx=new Proxy({},{get(obj,k){if(k in obj)return obj[k];if(k==="createLinearGradient")return ()=>({addColorStop(){}});return ()=>{}},
 set(obj,k,v){obj[k]=v;return true}});
 el("game").getContext=()=>ctx;
 let now=1000,cb=null;
 const window={__PINBALL_TEST__:true,PinballJuice:require("./"+dir+"/juice-fx.js"),
  matchMedia(){return {matches:reduced}},addEventListener(kind,fn){events.set("window:"+kind,fn)}};
 vm.runInNewContext(fs.readFileSync("./"+dir+"/game.js","utf8"),{
  document:{hidden:false,querySelector(q){return el(q.slice(1))}},window,
  performance:{now(){return now}},requestAnimationFrame(fn){cb=fn},Math,console
 },{filename:dir+"/game.js"});
 return {test:window.__pinballTest,state:window.__pinballCompare,el,
  frame(n=1){for(let i=0;i<n;i++){now+=1000/60;assert.ok(cb);cb(now)}},
  click(id){assert.ok(events.has(id+":click"));events.get(id+":click")()},
  aim(x){const e={pointerId:1,clientX:x,preventDefault(){}};
   events.get("game:pointerdown")(e);events.get("game:pointerup")(e);}
 };
}
const g=load(NEW),s=g.state,t=g.test;
assert.equal(s().remaining,72);
assert.equal(s().electricStage,0);
assert.equal(s().electricAwakenAt,22);
assert.equal(s().electricBuildAt,11);
assert.equal(s().finalRushThreshold,8);
assert.equal(s().visualImpact.mode,"bold");
assert.equal(s().interval,1);
assert.equal(s().armored,11);
assert.equal(s().shotSpeed,365);
assert.equal(s().electricMaxTargets,0);
assert.equal(s().lightningTriggers,0);
t.hitById(t.firstArmor().id);
assert.equal(s().electricStage,0);
assert.equal(s().lightningTriggers,0,"electricity never begins while most of the wave remains");

// Stage 1 has a single armor-chipping bolt and requires physical contact.
const awake=load(NEW),a=awake.test,as=awake.state;
assert.equal(a.previewElectricStage(22),true);
assert.equal(as().remaining,22);
assert.equal(as().electricStage,1);
assert.equal(as().electricMaxTargets,1);
assert.equal(as().lightningTriggers,0,"no free damage from stage transition");
const armorTargets=a.allBricks().filter(x=>x.alive&&x.armored);
assert.ok(armorTargets.length>=3);
const origin=armorTargets[0];
a.injectTestBall(origin.x+origin.w/2,origin.y+origin.h+7,0,-365);
awake.frame(4);
assert.ok(as().lightningTriggers>0,"stage 1 first actual collision triggers a chain");
assert.equal(as().lightningDamage,1,"first stage only hits one extra target");
assert.equal(as().electricStage,1);
assert.equal(as().electricPulseEvery,3);
const stage1Count=as().lightningTriggers;
assert.equal(a.triggerLightningById(origin.id),false,"stage 1 does not spark on the second eligible hit");
assert.equal(a.triggerLightningById(origin.id),false,"stage 1 does not spark on the third eligible hit");
assert.equal(a.triggerLightningById(origin.id),true,"stage 1 sparks on the fourth eligible hit");
assert.equal(as().lightningTriggers,stage1Count+1);
assert.ok(as().endgameActive===false,"30% is not FINAL RUSH");

// Stage 2 reaches two armored targets.
const build=load(NEW),b=build.test,bs=build.state;
assert.equal(b.previewElectricStage(11),true);
assert.equal(bs().electricStage,2);
assert.equal(bs().electricMaxTargets,2);
assert.equal(bs().endgameActive,false);
const bArmor=b.allBricks().find(x=>x.alive&&x.armored);
b.injectTestBall(bArmor.x+bArmor.w/2,bArmor.y+bArmor.h+7,0,-365);
build.frame(4);
assert.equal(bs().lightningTriggers,1);
assert.equal(bs().lightningDamage,2,"second stage hits exactly two extra numeric targets");
assert.equal(bs().electricPulseEvery,2);
const beforeStage2=bs().lightningTriggers;
assert.equal(b.triggerLightningById(bArmor.id),false,"stage 2 skips the second eligible hit");
assert.equal(b.triggerLightningById(bArmor.id),true,"stage 2 returns on the third eligible hit");
assert.equal(bs().lightningTriggers,beforeStage2+1);
assert.ok(bs().remaining>=10,"additional normal physical ball contacts may remove a tile, electricity only chips armor");

// Stage 3 has three targets, simultaneous balls each trigger their own chain.
const finale=load(NEW),f=finale.test,finalState=finale.state;
assert.equal(f.previewElectricStage(8),true);
assert.equal(finalState().electricStage,3);
assert.equal(finalState().electricMaxTargets,3);
assert.equal(finalState().electricPulseEvery,1);
assert.equal(finalState().endgameActive,true);
assert.equal(finalState().lightningTriggers,0);
const named=f.allBricks().filter(x=>x.alive&&x.armored);
assert.equal(named.length,3);
f.injectTestBall(named[0].x+named[0].w/2,named[0].y+named[0].h+7,0,-365);
f.addTestBall(named[2].x+named[2].w/2,named[2].y+named[2].h+7,0,-365);
finale.frame(4);
assert.ok(finalState().lightningTriggers>=2,"two balls can launch independent chains");
assert.ok(finalState().lightningDamage<=finalState().lightningTriggers*3);
assert.ok(finalState().remaining>0,"even concurrent final sparks should not clear everything immediately");
const stage3Stats=JSON.parse(finalState().electricHitsByStage);
assert.ok(stage3Stats[3]>=2);

// Last armored tile still obeys the B-version bounded self-echo.
const last=load(NEW),lt=last.test,ls=last.state;
const armored=lt.firstArmor();lt.keepOnlyBrick(armored.id);lt.markFinalRush();
assert.equal(ls().electricStage,3);
lt.injectTestBall(armored.x+armored.w/2,armored.y+armored.h+4.5,0,-365);
last.frame(4);
assert.equal(armored.cracked,true);
assert.equal(armored.alive,true);
assert.ok(lt.ballSnapshot()[0].vy>0,"original collision reflection remains intact");
assert.equal(ls().lightningDamage,1);

// Full game comparison uses identical aiming and upgrade choices.
function play(dir,maxFrames=31000){
 const game=load(dir),route=["split","chain","bounce"];let choice=0;
 for(let i=0;i<maxFrames;i++){
  const state=game.state();
  if(state.phase==="choosing")assert.equal(game.test.chooseByKind(route[choice++]),true);
  if(state.phase==="won")break;
  if(i%42===0){
   const first=game.test.firstBrick();
   if(first){
    const ang=Math.atan2(first.x+first.w/2-180,495-(first.y+first.h/2));
    game.aim(Math.min(360,Math.max(0,180+ang/1.08*180)));
   }
  }
  game.frame();
 }
 const state=game.state();
 assert.equal(state.phase,"won",dir+" does not softlock");
 assert.equal(state.score,342,dir+" destroys every tile");
 assert.equal(choice,3,"three skills unlocked");
 const finals=JSON.parse(state.endgameWaveStats);
 assert.equal(finals.length,4);
 return {...state,finals};
}
const old=play(OLD),updated=play(NEW);
const stats=JSON.parse(updated.electricStats);
assert.equal(stats.length,4,"all four waves record stage activation and hit counts");
assert.ok(stats.every(x=>x.entries.length===3&&x.entries[0]!==null&&x.entries[1]!==null&&x.entries[2]!==null));
assert.ok(stats.every(x=>x.hits[0]>0&&x.hits[1]>0&&x.hits[2]>0),"every stage participates in all waves");
const total=(values)=>values.reduce((a,b)=>a+b.seconds,0);
console.log("BASELINE",JSON.stringify({time:+old.elapsed.toFixed(1),hits:old.lightningTriggers,damage:old.lightningDamage,
  finaleSeconds:+total(old.finals).toFixed(2),finals:old.finals}));
console.log("PROGRESSIVE",JSON.stringify({time:+updated.elapsed.toFixed(1),hits:updated.lightningTriggers,damage:updated.lightningDamage,
  finaleSeconds:+total(updated.finals).toFixed(2),finals:updated.finals,stages:stats}));
const reduced=load(NEW,{reduced:true});
assert.equal(reduced.state().visualImpact.mode,"off");
assert.equal(reduced.el("impactMode").disabled,true);
console.log("PASS stage0/1/2/3, controlled HP damage, no instant wipe, no free activation, simultaneous independent balls, original reflection, full 342 comparison, reduced motion");
