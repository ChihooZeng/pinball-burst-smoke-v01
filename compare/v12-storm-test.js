"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const OLD="hybrid-v11b-progressive",NEW="hybrid-v12-storm";
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

const hpCurve=[4,7,10,13],armorCount=[11,12,13,15],waveTotal=[72,81,90,99];
const g=load(NEW);const s=g.state,t=g.test;
assert.equal(s().cannonClass,"storm","storm cannon is the playable base class");
assert.equal(s().cannonPassive,"progressive-lightning","electric passive belongs to this cannon");
assert.equal(s().activeSkill,"giant","the active slot currently equips giant ball");
assert.equal(s().armorHpCurve,hpCurve.join(","));
assert.equal(g.el("loadoutLabel").textContent.includes("雷链炮台"),true);
assert.equal(s().remaining,72);
assert.equal(s().armored,11);
assert.equal(s().armorHp,44);
assert.equal(s().visualImpact.mode,"bold");
assert.equal(s().shotSpeed,365);
assert.equal(s().shotRadius,3.45);
assert.equal(s().electricStage,0);
assert.equal(s().electricAwakenAt,22);
assert.equal(s().electricBuildAt,11);
const armored=t.firstArmor();
const startingHP=armored.hp;
assert.equal(startingHP,4,"first wave armor 4HP");
for(let i=1;i<startingHP;i++){
 t.hitById(armored.id);
 assert.equal(armored.hp,startingHP-i);
 assert.equal(armored.alive,true,"tank never disappears early");
}
assert.equal(s().armorCracks,0);
t.hitById(armored.id);
assert.equal(armored.cracked,true,"HP zero first cracks into plain tile");
assert.equal(armored.alive,true);
assert.equal(s().armorCracks,1);
t.hitById(armored.id);
assert.equal(armored.alive,false);
assert.equal(s().armorBreaks,1);
assert.equal(s().score,1);
assert.equal(s().armorHits,4);
t.chargeFully();
assert.equal(t.loadout().active,"giant");
assert.equal(t.activateEquippedSkill(),true,"active skill slot dispatches giant ball");
assert.equal(s().skillsUsed,1);
assert.equal(s().giantActive,true);
const zero=load(NEW,{reduced:true});
assert.equal(zero.state().visualImpact.mode,"off");
assert.equal(zero.el("impactMode").disabled,true);
// Full progression preserves counts and new HP in every wave.
const waveCheck=load(NEW);
for(let wave=1;wave<=4;wave++){
 const state=waveCheck.state(),w=waveCheck.test;
 assert.equal(state.remaining,waveTotal[wave-1]);
 assert.equal(state.armored,armorCount[wave-1]);
 assert.equal(state.armorHp,armorCount[wave-1]*hpCurve[wave-1]);
 assert.equal(w.firstArmor().hp,hpCurve[wave-1]);
 if(wave<4){w.clearWave();assert.equal(waveCheck.state().phase,"choosing");assert.equal(w.chooseByKind(["split","chain","bounce"][wave-1]),true);}
}
assert.equal(waveCheck.state().splitLevel,1);
assert.equal(waveCheck.state().chainLevel,1);
assert.equal(waveCheck.state().ricochetLevel,1);

// Same automated aiming/upgrades, no active giant button: isolate armor HP.
function run(dir,route=["split","chain","bounce"],maxFrames=46000){
 const game=load(dir),choices=[];
 for(let i=0;i<maxFrames;i++){
  const st=game.state();
  if(st.phase==="choosing"){const name=route[choices.length];choices.push(name);assert.equal(game.test.chooseByKind(name),true);}
  if(st.phase==="won")break;
  if(i%42===0){
   const goal=game.test.firstBrick();
   if(goal){const angle=Math.atan2(goal.x+goal.w/2-180,495-(goal.y+goal.h/2));
    game.aim(Math.min(360,Math.max(0,180+angle/1.08*180)));
   }
  }
  game.frame();
 }
 const st=game.state();
 assert.equal(st.phase,"won","four waves must finish: "+dir);
 assert.equal(st.score,342);
 assert.equal(choices.length,3);
 const stages=JSON.parse(st.electricStats);
 assert.equal(stages.length,4);
 assert.ok(stages.every(row=>row.entries.every(value=>value!==null)),dir+" uses each electric stage");
 return {...st,stages};
}
const old=run(OLD),updated=run(NEW);
console.log("OLD",JSON.stringify({time:+old.elapsed.toFixed(1),damage:old.lightningDamage,lightning:old.lightningTriggers,maxCombo:old.maxCombo,armorHits:old.armorHits,stages:old.stages.map(s=>s.hits)}));
console.log("V12",JSON.stringify({time:+updated.elapsed.toFixed(1),damage:updated.lightningDamage,lightning:updated.lightningTriggers,maxCombo:updated.maxCombo,armorHits:updated.armorHits,cracks:updated.armorCracks,finale:JSON.parse(updated.endgameWaveStats),stages:updated.stages.map(s=>s.hits)}));
assert.ok(updated.armorHits>60,"significantly more armor impacts give a longer build");
assert.ok(updated.elapsed>old.elapsed,"increased armored HP must lengthen, not shorten, run");
console.log("PASS storm cannon loadout + giant active slot, HP [4,7,10,13], two-stage armor, four waves, passive lightning and longer simulated run");
