"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const OLD="hybrid-v12-storm",NEW="hybrid-v13-numberfield";
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


const a=load(NEW),s=a.state,t=a.test;
assert.equal(s().phase,"playing");
assert.equal(s().remaining,72);
assert.equal(s().visibleNumbers,72,"all bricks show their own number");
assert.equal(s().hpProfile,"mixed-per-brick");
assert.equal(s().cannonClass,"storm");
assert.equal(s().cannonPassive,"progressive-lightning");
assert.equal(s().activeSkill,"giant");
assert.equal(s().visualImpact.mode,"bold");
assert.equal(s().shotSpeed,365);
assert.equal(s().electricStage,0);
assert.equal(s().electricAwakenAt,22);
const first=t.hpDistribution();
assert.equal(first.length,72);
assert.ok(first.every(b=>b.initialHp>=1&&b.initialHp<=7));
assert.ok(new Set(first.map(b=>b.initialHp)).size>=6,"many distinct HP values on the same board");
assert.ok(first.filter(b=>b.initialHp===1).length>=14,"many natural one-hit instant breaks");
assert.ok(first.filter(b=>b.initialHp>1).length>=30,"many rebound blocks");
assert.ok(first.every(b=>b.hp===b.initialHp&&b.alive));
const fresh=load(NEW).test.hpDistribution();
assert.equal(JSON.stringify(first.map(b=>b.initialHp)),JSON.stringify(fresh.map(b=>b.initialHp)),"same layout deterministic across reloads");
const one=t.allBricks().find(b=>b.hp===1&&!b.special);
const score=s().score;
t.hitById(one.id);
assert.equal(one.alive,false,"HP1 breaks immediately");
assert.equal(s().score,score+1);
const hard=t.allBricks().find(b=>b.hp>=4&&b.alive);
const initial=hard.hp;
for(let i=1;i<initial;i++){
 t.hitById(hard.id);
 assert.equal(hard.hp,initial-i);
 assert.equal(hard.alive,true,"a numbered tile remains reboundable while HP remains");
 assert.equal(hard.armored,true);
}
t.hitById(hard.id);
assert.equal(hard.cracked,true,"zero HP first exposes the plain cracked block");
assert.equal(hard.alive,true,"cracked block remains for the next hit");
assert.equal(hard.hp,0);
t.hitById(hard.id);
assert.equal(hard.alive,false,"next hit breaks and can pass through");
assert.ok(s().armorCracks>=1);
t.chargeFully();
assert.equal(t.activateEquippedSkill(),true,"giant remains equipped");
const reduced=load(NEW,{reduced:true});
assert.equal(reduced.state().visualImpact.mode,"off");
assert.equal(reduced.el("impactMode").disabled,true);

const waveTotals=[72,81,90,99],limits=[7,9,10,12];
const waves=load(NEW);
for(let i=0;i<4;i++){
 const st=waves.state(),ts=waves.test;
 const tiles=ts.hpDistribution();
 assert.equal(st.wave,i+1);
 assert.equal(st.remaining,waveTotals[i]);
 assert.equal(st.visibleNumbers,waveTotals[i]);
 assert.ok(tiles.every(b=>b.initialHp<=limits[i]&&b.initialHp>=1));
 assert.ok(new Set(tiles.map(b=>b.initialHp)).size>=Math.min(limits[i],6));
 assert.ok(tiles.some(b=>b.initialHp===1));
 assert.ok(tiles.some(b=>b.initialHp>=limits[i]-1));
 if(i<3){ts.clearWave();assert.equal(waves.state().phase,"choosing");
  assert.equal(ts.chooseByKind(["split","chain","bounce"][i]),true);}
}
assert.equal(waves.state().phase,"playing");
waves.test.clearWave();
assert.equal(waves.state().phase,"won");
waves.click("again");
assert.equal(waves.state().wave,1);
assert.equal(JSON.stringify(waves.test.hpDistribution().map(b=>b.initialHp)),JSON.stringify(first.map(b=>b.initialHp)));

// Both real ball and electric damage must reduce the new individually numbered tiles.
const coll=load(NEW);
const target=coll.test.allBricks().find(b=>b.hp>=4);
const prevHp=target.hp;
coll.test.keepOnlyBrick(target.id);
coll.test.injectTestBall(target.x+target.w/2,target.y+target.h+4.5,0,-365);
coll.frame(3);
assert.equal(target.hp,prevHp-2,"last remaining numbered tile loses one physical HP plus one FINAL RUSH lightning echo");
assert.ok(coll.test.ballSnapshot()[0].vy>0,"surviving numbered brick still reflects by collision normal");
const shock=load(NEW);
const sh=shock.test,ss=shock.state;
assert.equal(sh.previewElectricStage(8),true);
assert.equal(ss().electricStage,3);
const origin=sh.allBricks().find(b=>b.alive&&b.hp>1);
assert.ok(origin);
const beforeHp=ss().remainingHp;
assert.equal(sh.triggerLightningById(origin.id),true);
assert.ok(ss().remainingHp<beforeHp,"lightning chips multiple independent numeric tiles");
assert.ok(ss().remaining>0);

function play(dir,limit=69000){
 const g=load(dir),route=["split","chain","bounce"];let upgrades=0;
 for(let i=0;i<limit;i++){
  const st=g.state();
  if(st.phase==="choosing")assert.equal(g.test.chooseByKind(route[upgrades++]),true);
  if(st.phase==="won")break;
  if(i%42===0){
   const first=g.test.firstBrick();
   if(first){
    const angle=Math.atan2(first.x+first.w/2-180,495-(first.y+first.h/2));
    g.aim(Math.min(360,Math.max(0,180+angle/1.08*180)));
   }
  }
  g.frame();
 }
 const st=g.state();
 assert.equal(st.phase,"won",dir+" full four-wave run");
 assert.equal(st.score,342);
 assert.equal(upgrades,3);
 const electric=JSON.parse(st.electricStats);
 assert.equal(electric.length,4);
 return {...st,electric};
}
const control=play(OLD);
const upgraded=play(NEW);
console.log("OLD",JSON.stringify({seconds:+control.elapsed.toFixed(1),maxCombo:control.maxCombo,lightningHits:control.lightningTriggers,armorHits:control.armorHits,finals:JSON.parse(control.endgameWaveStats)}));
console.log("NEW",JSON.stringify({seconds:+upgraded.elapsed.toFixed(1),maxCombo:upgraded.maxCombo,lightningHits:upgraded.lightningTriggers,armorHits:upgraded.armorHits,breaks:upgraded.armorCracks,finals:JSON.parse(upgraded.endgameWaveStats),stages:upgraded.electric.map(x=>x.hits)}));
assert.ok(upgraded.elapsed>control.elapsed,"new numeric field should lengthen play compared with minority armor");
console.log("PASS every tile independently numbered, low HP breaks at once, per-brick armor cracks, physical rebound, lightning, four waves and comparison");
