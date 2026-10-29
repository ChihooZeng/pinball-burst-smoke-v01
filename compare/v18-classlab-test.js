"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const DIR="hybrid-v18-classlab";
function load(){
 const events=new Map(),elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{
  textContent:"",value:"",disabled:false,style:{},
  classList:{add(s){this[s]=true},remove(s){this[s]=false},toggle(key,value){this[key]=value===undefined?!this[key]:value;}},
  addEventListener(k,fn){events.set(id+":"+k,fn)},
  setPointerCapture(){},
  getBoundingClientRect(){return {left:0,top:0,width:360,height:560}}
 });return elements.get(id);}
 const ctx=new Proxy({},{get(obj,k){if(k in obj)return obj[k];if(k==="createLinearGradient")return ()=>({addColorStop(){}});return ()=>{};},set(obj,k,v){obj[k]=v;return true;}});
 el("game").getContext=()=>ctx;
 let now=1000,cb=null;
 const param=()=>({value:0,setValueAtTime(v){this.value=v},exponentialRampToValueAtTime(v){this.value=v},setTargetAtTime(v){this.value=v}});
 class MockAudio{
  constructor(){this.currentTime=1;this.state="running";this.destination={};}
  createGain(){return {gain:param(),connect(){}};}
  createDynamicsCompressor(){return {threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){}};}
  createOscillator(){return {frequency:param(),connect(){},start(){},stop(){}};}
  resume(){this.state="running";}
 }
 const window={__PINBALL_TEST__:true,AudioContext:MockAudio,PinballJuice:require("./"+DIR+"/juice-fx.js"),
  location:{search:""},matchMedia(){return {matches:false}},addEventListener(kind,fn){events.set("window:"+kind,fn)}};
 const document={hidden:false,body:{classList:{add(){}}},querySelector(q){return el(q.slice(1))}};
 vm.runInNewContext(fs.readFileSync("./"+DIR+"/game.js","utf8"),{
  document,window,performance:{now(){return now}},requestAnimationFrame(fn){cb=fn},Math,console
 },{filename:DIR+"/game.js"});
 return {test:window.__pinballTest,state:window.__pinballState,el,
  frame(n=1){for(let i=0;i<n;i++){now+=1000/60;assert.ok(cb);cb(now)}},
  aim(x){const e={pointerId:1,clientX:x,preventDefault(){}};events.get("game:pointerdown")(e);events.get("game:pointerup")(e);}
 };
}
const profiles={
 balanced:{balls:1,damage:2,speed:365,radius:3.45},
 scatter:{balls:3,damage:1,speed:365,radius:2.8},
 heavy:{balls:1,damage:4,speed:295,radius:5.2}
};
for(const [id,want] of Object.entries(profiles)){
 const g=load();g.test.selectCannon(id);g.test.fire();
 const b=g.test.ballSnapshot();
 assert.equal(b.length,want.balls,id+" projectile count");
 assert.ok(b.every(x=>x.damage===want.damage),id+" base damage");
 assert.ok(b.every(x=>x.speed===want.speed),id+" projectile speed");
 assert.ok(Math.abs(b[0].r-want.radius)<.01,id+" projectile radius");
 if(id==="scatter")assert.ok(b[0].vx<0&&Math.abs(b[1].vx)<.01&&b[2].vx>0,"scatter fan directions");
 console.log("BASE_WEAPON_PASS",id,JSON.stringify(b.map(x=>({vx:+x.vx.toFixed(1),damage:x.damage,speed:x.speed,r:+x.r.toFixed(2)}))));
}
{
 const g=load();g.test.selectCannon("laser");
 for(const b of g.test.allBricks())if(Math.abs(b.x+b.w/2-180)<15&&!b.special)g.test.setBrickHp(b.id,10);
 g.test.fire();
 const st=g.state(),column=g.test.allBricks().filter(b=>Math.abs(b.x+b.w/2-180)<15&&!b.special);
 assert.equal(g.test.ballSnapshot().length,0,"laser must not spawn physical balls");
 assert.equal(st.laserPulses,1);
 assert.ok(st.laserHits>=1&&st.laserHits<=4,"laser is capped to four beam targets");
 assert.equal(st.laserHeat,20);
 assert.ok(column.some(b=>b.hp===8),"laser applies two damage to high-HP tiles along the beam");
 const hot=load();hot.test.selectCannon("laser");
 for(let i=0;i<5;i++)hot.test.fire();
 assert.equal(hot.state().laserHeat,100);
 assert.equal(hot.state().laserOverheated,true,"laser locks after reaching max heat");
 const lockedShots=hot.state().laserPulses;hot.test.fire();assert.equal(hot.state().laserPulses,lockedShots,"overheated laser cannot fire");
 hot.frame(180);assert.equal(hot.state().laserOverheated,false,"laser recovers after cooling");
 console.log("BASE_WEAPON_PASS laser",JSON.stringify({pulses:st.laserPulses,hits:st.laserHits,heat:st.laserHeat,overheatAndRecovery:true}));
}
for(const [id,damage] of [["balanced",2],["scatter",1],["heavy",4]]){
 const g=load();g.test.selectCannon(id);const target=g.test.allBricks().find(b=>b.hp>1&&!b.special);
 g.test.setBrickHp(target.id,12);g.test.hitForTest(target.id,"normal",damage);
 assert.equal(target.hp,12-damage,id+" applies its intended armor damage");
 console.log("ARMOR_DAMAGE_PASS",id,damage);
}
function run(id,scenario,maxFrames=6000,laserPolicy="best"){
 const g=load();g.test.selectCannon(id);g.test.startScenario(scenario);
 let frames=0;
 for(;frames<maxFrames;frames++){
  const s=g.state();if(s.phase!=="playing")break;
  if(frames%24===0){
   const live=g.test.allBricks().filter(b=>b.alive);
   if(live.length){
    if(id==="laser"&&laserPolicy==="best"){
     // Laser is a line weapon: select the angle intersecting the most useful live bricks.
     g.test.bestLaserAngle();
    }else{
     const b=live[0],theta=Math.atan2(b.x+b.w/2-180,495-(b.y+b.h/2));
     g.aim(Math.max(0,Math.min(360,180+theta/1.08*180)));
    }
   }
  }
  g.frame();
 }
 const s=g.state();
 return {class:id,scenario,phase:s.phase,seconds:+s.elapsed.toFixed(1),score:s.score,remaining:g.test.allBricks().filter(b=>b.alive).length,
  pressureSteps:s.pressureSteps,laserHits:s.laserHits,laserPulses:s.laserPulses,heat:s.laserHeat,frames};
}
const results=[];
for(const scenario of ["standard","pressure","armor"]){
 for(const id of ["balanced","scatter","heavy","laser"])results.push(run(id,scenario));
}
const laserFirstTarget=run("laser","pressure",6000,"first");
console.log("PRESSURE_RESULTS",JSON.stringify(results));
console.log("LASER_AIM_POLICY_COMPARISON",JSON.stringify({bestLine:results.find(x=>x.class==="laser"&&x.scenario==="pressure"),firstTarget:laserFirstTarget}));
for(const scenario of ["standard","pressure","armor"]){
 const rows=results.filter(x=>x.scenario===scenario);
 assert.equal(rows.length,4);
 assert.ok(rows.every(x=>x.phase==="won"||x.phase==="lost"),"each run must end in clear or pressure failure");
}
assert.ok(results.filter(x=>x.scenario==="standard").every(x=>x.phase==="won"),"all classes should clear the baseline board");
assert.ok(results.some(x=>x.phase==="lost")||results.every(x=>x.phase==="won"),"each stress run must either clear or reach the pressure failure state");
const fail=load();fail.test.selectCannon("balanced");fail.test.setPressureOffset(145);fail.frame(310);
assert.equal(fail.state().phase,"lost","brick crossing danger line must end the run");
console.log("PASS v0.18: four weapon base stats, ray laser, pressure failure, three-scenario comparisons");
