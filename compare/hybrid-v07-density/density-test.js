"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const PinballJuice=require("./juice-fx.js");
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
  __PINBALL_TEST__:true,PinballJuice,
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
  changeMode(next){el("impactMode").value=next;events.get("impactMode:change")();},
  frame(frames=1){for(let i=0;i<frames;i++){now+=1000/60;assert.ok(callback);callback(now);}},
  click(id){events.get(id+":click")();},
  aim(x){const e={pointerId:1,clientX:x,preventDefault(){}};events.get("game:pointerdown")(e);events.get("game:pointerup")(e);}
 };
}
const g=load(),s=g.state,t=g.test;
assert.equal(s().remaining,54,"wave 1 is 9 x 6 = 54");
assert.equal(s().armored,8,"8 armored bricks in wave 1");
assert.equal(s().armorHp,16,"all wave 1 armor HP2");
assert.equal(s().interval,1,"rate unchanged");
assert.equal(s().phase,"playing");
assert.equal(s().visualImpact.mode,"balanced","new effect defaults to standard");
g.frame(115);assert.ok(s().activeBalls>=1,"auto-fire continues (faster balls may leave the screen sooner)");
const count=s().activeBalls;g.aim(320);
assert.equal(s().activeBalls,count,"pointer-up is not fire");
assert.ok(s().aim>.7,"drag aims");
const armor=t.firstArmor();assert.ok(armor);
t.hitById(armor.id);
assert.equal(armor.hp,1,"armored brick loses 1 HP");
assert.equal(s().armorHp,15);
assert.ok(s().hitCount>=1,"hits counted");
assert.ok(s().fxRings>=1,"visual shock ring is produced");
assert.ok(s().fxText>=1,"visible decrement text produced");
assert.ok(armor.bonk>0,"surviving brick bounces briefly");
assert.ok(s().visualImpact.sparks>0,"local sparks on armor hit");
assert.ok(armor.hitVisual&&armor.hitVisual.age===0,"armor impact receives visual-only wobble state");
t.hitById(armor.id);
assert.equal(armor.alive,false,"second hit destroys armor");
assert.ok(s().combo>=1,"destroy increment combo");
assert.ok(s().fxParticles>0,"destruction particles present");
assert.ok(s().visualImpact.shards>0,"detached brick shards on destruction");
assert.ok(s().visualImpact.ghosts>0,"normal projectile break keeps short-lived hit silhouette");
assert.ok(s().visualImpact.shakeEvents>=1,"ordinary break causes capped micro-shake");
g.frame(100);
assert.ok(s().fxRings<=28 && s().fxText<=36 && s().fxParticles<=220,"visual effects remain capped during live hits");
assert.equal(s().visualImpact.ghosts,0,"ghosts self-expire quickly");
t.chargeFully();assert.equal(g.el("giant").disabled,false,"giant is ready");
g.click("giant");assert.ok(s().giantActive,"manual giant released");
assert.equal(s().skillsUsed,1);
t.clearWave();assert.equal(s().phase,"choosing","wave complete pauses");
const paused=s().elapsed;g.frame(60);assert.equal(s().elapsed,paused,"selection pauses simulation");
g.click("pickRate");
assert.equal(s().remaining,63,"wave 2 is 9 x 7 = 63");
assert.equal(s().armored,9);
assert.equal(s().armorHp,27);
assert.equal(s().interval,.9,"moderate rate preserved");
t.clearWave();g.click("pickBounce");
assert.equal(s().remaining,72,"wave 3 is 9 x 8 = 72");
assert.equal(s().armored,11);
assert.equal(s().armorHp,44);
assert.equal(s().ricochetLevel,1);
t.clearWave();assert.equal(s().phase,"won","three waves remain");
g.click("again");
assert.equal(s().remaining,54);assert.equal(s().interval,1);assert.equal(s().score,0,"fresh run restores state");
const reduced=load(true);
assert.equal(reduced.state().visualImpact.mode,"off","reduced motion defaults to no extra motion");
assert.equal(reduced.el("impactMode").disabled,true);
reduced.test.hitById(reduced.test.firstArmor().id);
assert.equal(reduced.state().fxRings,0,"reduced-motion removes ring animation");
assert.equal(reduced.state().fxText,0,"reduced-motion removes pop animation");
// Additional FX can be switched off without changing brick geometry or HP.
g.changeMode("off");
assert.equal(s().visualImpact.mode,"off");
assert.equal(s().visualImpact.shards,0,"turning off clears queued shards");
assert.equal(s().visualImpact.ghosts,0,"turning off clears collision afterimages");
t.hitById(t.firstArmor().id);
assert.equal(s().visualImpact.shards,0,"no newly emitted shards when off");
g.changeMode("bold");
assert.equal(s().visualImpact.mode,"bold");
const target=t.firstArmor();t.hitById(target.id);
assert.ok(s().visualImpact.sparks>0,"enhanced impacts generate sparks");
const beforeHit=s().hitCount;
g.frame(1);assert.ok(s().hitCount>=beforeHit,"FX switch does not reset physics");
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
assert.ok(live.state().score>60,"live physics destroys many dense bricks");
assert.equal(live.state().phase,"won","no deadlock after density increase");
console.log("DENSE RUN",JSON.stringify({seconds:Math.round(live.state().elapsed),score:live.state().score,maxCombo:live.state().maxCombo,waves:live.state().wave}));
console.log("PASS 54/63/72, smaller radius + faster balls, more armor, old upgrades intact");

// Independent stress: never allow thousands of overlapping effects on long combo bursts.
const fx=PinballJuice.create({W:360,H:560});
fx.setMode("bold");
const block={x:90,y:100,w:38,h:27,color:"#7fe8c9"};
for(let i=0;i<800;i++){fx.onArmor(block);fx.onBreak(block,{combo:i+1,source:i%7===0?"giant":"normal"});}
let snap=fx.snapshot();
assert.ok(snap.shards<=120&&snap.sparks<=90&&snap.flashes<=24&&snap.waves<=5&&snap.ghosts<=32,"effect queues capped");
assert.ok(snap.shakeStrength<=4.7,"camera movement stays bounded");
const moves=[];
const fakeCtx=new Proxy({},{get(o,key){if(key in o)return o[key];return (...args)=>moves.push({key,args});},set(o,k,v){o[k]=v;return true;}});
fx.applyCamera(fakeCtx);fx.draw(fakeCtx);
assert.ok(moves.length>0,"impact is drawable by Canvas API");
for(let i=0;i<90;i++)fx.update(1/60);
snap=fx.snapshot();
assert.equal(snap.shards,0,"shards expire");
assert.equal(snap.sparks,0,"sparks expire");
assert.equal(snap.flashes,0,"flashes expire");
assert.equal(snap.ghosts,0,"visual hit afterimages expire");
fx.setMode("off");fx.onBreak(block,{combo:9});
assert.equal(fx.snapshot().shards,0,"off means no new shards");
console.log("PASS effect stress caps, expiry, canvas draw, on/off without gameplay changes");

const specimen={x:15,y:22,w:38,h:27,color:"#bd8955",hp:2};
const position=[specimen.x,specimen.y];
const armorFx=PinballJuice.create({W:360,H:560});
armorFx.onArmor(specimen,{vx:4,vy:-5});
assert.ok(specimen.hitVisual,"armor hit records damped recoil");
const transformCalls=[];
const tCtx=new Proxy({},{get(o,k){if(k in o)return o[k];return (...args)=>transformCalls.push({name:k,args});},set(o,k,v){o[k]=v;return true;}});
armorFx.applyBrickMotion(tCtx,specimen);
assert.ok(transformCalls.some(x=>x.name==="translate")&&transformCalls.some(x=>x.name==="scale"),"armor wobble is drawn as local transform");
assert.deepEqual([specimen.x,specimen.y],position,"visual motion does not move collision rectangle");
for(let i=0;i<15;i++)armorFx.update(1/60,[specimen]);
assert.equal(specimen.hitVisual,null,"armor wobble is finite");
const normalFx=PinballJuice.create({W:360,H:560});
normalFx.onBreak({...specimen},{combo:1,source:"normal",impact:{vx:8,vy:-8}});
assert.ok(normalFx.snapshot().ghosts===1,"ordinary break creates one small temporary afterimage");
assert.ok(normalFx.snapshot().shakeEvents===1,"ordinary break creates a micro camera shake");
assert.ok(normalFx.snapshot().shakeStrength<=1.3,"ordinary break camera shake stays gentle");
const shakeBefore=normalFx.snapshot().shakeEvents;
for(let i=0;i<100;i++)normalFx.onBreak({...specimen},{combo:1,source:"normal"});
assert.equal(normalFx.snapshot().shakeEvents,shakeBefore,"simultaneous hits never compound camera shake");
normalFx.update(.2);
assert.equal(normalFx.snapshot().ghosts,0,"ordinary afterimage expires");
console.log("PASS regular brick local hit-afterimage + micro camera shake, armored rebound, physics coordinates stable, limits and expiry");

// Key requirement: the center path between two bricks must truly fit the bullet.
const passage=load();
const layout=passage.test.brickLayout();
const top=layout.filter(b=>b.y===layout[0].y).sort((a,b)=>a.x-b.x);
assert.equal(top.length,9,"nine bricks form the first row");
const gap=top[1].x-(top[0].x+top[0].w);
const r=passage.state().shotRadius;
assert.ok(gap>2*r+2,"horizontal gap safely exceeds projectile diameter");
assert.ok(30-22>2*r,"vertical brick gap also exceeds projectile diameter");
assert.equal(passage.state().shotSpeed,405,"shot speed moderately increased");
assert.equal(passage.state().brickWidth,29);
const corridor=(top[0].x+top[0].w+top[1].x)/2;
passage.test.injectTestBall(corridor,400,0,-405);
for(let i=0;i<68;i++)passage.frame();
assert.equal(passage.state().score,0,"a ball passing a corridor hits no bricks");
assert.equal(passage.state().remaining,54,"corridor path crosses intact dense brick rows");
const standardFx=PinballJuice.create(), strongFx=PinballJuice.create();
standardFx.setMode("balanced");
strongFx.setMode("bold");
const inertBrick={x:80,y:80,w:29,h:22,color:"#67b2ee"};
standardFx.onBreak(inertBrick,{combo:1});
strongFx.onBreak(inertBrick,{combo:1});
assert.ok(standardFx.snapshot().shakeStrength>=1.2,"new default strength equals old enhanced mode");
assert.ok(strongFx.snapshot().shakeStrength>standardFx.snapshot().shakeStrength,"extra-strong setting is measurably stronger");
assert.ok(strongFx.snapshot().shakeStrength<=4.7,"camera impulse remains capped");
console.log("PASS real collision corridor, gap="+gap.toFixed(1)+" bullet diameter="+(2*r).toFixed(1));
console.log("PASS visual default matches previous enhanced, with stronger optional mode");
