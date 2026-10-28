"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const PinballJuice=require("./juice-fx.js");
function load({reduced=false}={}){
 const els=new Map(),events=new Map();
 function el(id){
  if(!els.has(id))els.set(id,{textContent:"",value:"",disabled:false,style:{},
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(type,fn){events.set(id+":"+type,fn);},
    setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:360,height:560};}});
  return els.get(id);
 }
 const ctx=new Proxy({},{get(o,k){if(k in o)return o[k];
    if(k==="createLinearGradient")return ()=>({addColorStop(){}});
    return ()=>{};},set(o,k,v){o[k]=v;return true;}});
 el("game").getContext=()=>ctx;
 let now=1000,callback=null;
 const window={__PINBALL_TEST__:true,PinballJuice,
   matchMedia(){return {matches:reduced};},
   addEventListener(type,fn){events.set("window:"+type,fn);}};
 vm.runInNewContext(fs.readFileSync("game.js","utf8"),{
   document:{hidden:false,querySelector(s){return el(s.slice(1));}},
   window,Math,console,performance:{now(){return now;}},
   requestAnimationFrame(fn){callback=fn;}
 },{filename:"game.js"});
 return {
  el,events,state:()=>window.__pinballCompare(),test:window.__pinballTest,
  frame(n=1){for(let i=0;i<n;i++){now+=1000/60;const cb=callback;assert.ok(cb);cb(now);}},
  click(id){assert.ok(events.has(id+":click"),"handler "+id);events.get(id+":click")();},
  aim(x){const e={pointerId:7,clientX:x,preventDefault(){}};
    events.get("game:pointerdown")(e);events.get("game:pointerup")(e);},
  changeMode(mode){el("impactMode").value=mode;events.get("impactMode:change")();}
 };
}
const a=load();const t=a.test,s=a.state;
assert.equal(s().visualImpact.mode,"bold","last version's strongest effects are default");
assert.equal(a.el("impactMode").value,"bold");
assert.equal(s().shotSpeed,365,"slower and readable balls");
assert.equal(s().shotRadius,3.45,"thin ball kept");
assert.equal(s().remaining,54);
assert.equal(s().armored,8);
assert.equal(s().interval,1);
assert.equal(s().splitLevel,0);assert.equal(s().chainLevel,0);
a.frame(110);
assert.ok(s().shotsFired>=2,"auto fires without input");
const count=s().shotsFired;a.aim(335);
assert.equal(s().shotsFired,count,"drag releases no extra shot");
assert.ok(s().aim>.85);
a.changeMode("balanced");
assert.equal(s().visualImpact.mode,"balanced");
a.changeMode("bold");

const collision=load();
const remainingBefore=collision.state().remaining;
const row=collision.test.allBricks().filter(b=>b.x===12&&b.alive).sort((x,y)=>y.y-x.y);
assert.equal(row.length,6);
collision.test.injectTestBall(row[0].x+row[0].w/2,400,0,-365);
collision.frame(45);
assert.ok(collision.state().score>=2,"destroyed ordinary bricks let ball move through multiple rows");
assert.ok(collision.state().brickContacts>=2,"one bullet creates multiple actual contacts");
assert.equal(collision.state().shotsFired,0,"test does not autospawn regular shots");
assert.ok(collision.state().remaining<remainingBefore);

const armorTest=load();
const target=armorTest.test.firstArmor();
armorTest.test.keepOnlyBrick(target.id);
armorTest.test.injectTestBall(target.x+target.w/2,target.y+target.h+4.5,0,-365);
armorTest.frame(4);
assert.equal(target.hp,1,"armor loses exactly one HP");
assert.ok(armorTest.state().brickContacts>=1);
const normal=armorTest.test.physicsNormal({x:12,y:35,r:3.45}, {x:0,y:0,w:24,h:22},12,38);
assert.ok(normal.ny>0,"normal points outward from bottom surface");
const ball={x:12,y:25,r:3.45,vx:0,vy:-365};
armorTest.test.physicsReflect(ball,{nx:0,ny:1,overlap:1});
assert.ok(ball.vy>0,"elastic hit on bottom of brick returns ball downward");
const corner={x:26,y:24,r:3.45};
const cNorm=armorTest.test.physicsNormal(corner,{x:0,y:0,w:24,h:22},27,25);
assert.ok(cNorm.nx>0 && cNorm.ny>0,"corner hit has diagonal surface normal");
const diagonal={x:26,y:24,r:3.45,vx:-200,vy:-200};
armorTest.test.physicsReflect(diagonal,cNorm);
assert.ok(diagonal.vx>0 || diagonal.vy>0,"diagonal hit reflects by contact normal");

const giant=load();
giant.test.chargeFully();assert.equal(giant.el("giant").disabled,false);
giant.click("giant");assert.equal(giant.state().skillsUsed,1);
giant.frame(230);
assert.ok(giant.state().giantRebounds>=1,"giant ball ricochets instead of vanishing after one pass");
assert.ok(giant.state().giantBrickRebounds>=1,"giant truly rebounds on bricks, not just arena walls");
assert.ok(giant.state().giantWallRebounds>=1,"giant also rebounds on arena boundaries");
assert.ok(giant.state().giantTotalHits>=3,"giant pierces two blocks before contact reflection");
assert.ok(giant.state().score>=2,"giant destroys bricks before rebounding");
assert.equal(giant.state().giantActive,false,"giant has bounded lifetime");

const split=load();
split.test.clearWave();assert.equal(split.state().phase,"choosing");
split.click("pickSplit");
assert.equal(split.state().phase,"playing");
assert.equal(split.state().splitLevel,1);
split.frame(250);
assert.ok(split.state().splitBursts>=1,"every third volley spawns side balls");
assert.ok(split.state().shotsFired>=3,"split does not replace ordinary shots");
assert.ok(split.state().activeBalls<=24,"ball pool is bounded");
split.test.clearWave();assert.equal(split.state().phase,"choosing");
assert.equal(split.el("pickSplit").disabled,true,"already unlocked split cannot waste a choice");
split.click("pickChain");
assert.equal(split.state().chainLevel,1);
assert.equal(split.state().phase,"playing");
const candidates=split.test.allBricks().filter(b=>b.alive&&!b.armored);
for(let i=0;i<5;i++)split.test.hitById(candidates[i].id);
assert.ok(split.state().chainBursts>=1,"fifth consecutive destroyed brick triggers chain blast");
assert.equal(split.state().interval,1,"speed upgrade is still optional");
split.test.clearWave();assert.equal(split.state().phase,"won");
split.click("again");assert.equal(split.state().splitLevel,0);assert.equal(split.state().chainLevel,0);
assert.equal(split.state().shotsFired,0,"restart fully resets the build");

const reduced=load({reduced:true});
assert.equal(reduced.state().visualImpact.mode,"off");
assert.equal(reduced.el("impactMode").disabled,true);

// Deterministic aim-following full game, original rate/ricochet upgrades.
function liveRun(route=["rate","bounce"]){
 const g=load(),s=g.state;
 let selected=0;
 for(let i=0;i<31000;i++){
  const st=s();
  if(st.phase==="choosing"){g.test.chooseByKind(route[selected++]);}
  if(st.phase==="won")break;
  if(i%45===0){
   const goal=g.test.firstBrick();
   if(goal){
    const ang=Math.atan2(goal.x+goal.w/2-180,495-(goal.y+goal.h/2));
    g.aim(Math.min(360,Math.max(0,180+ang/1.08*180)));
   }
  }
  g.frame();
 }
 return {...s(),levelChoices:selected};
}
const baseline=liveRun();
console.log("RUN basic",JSON.stringify({phase:baseline.phase,score:baseline.score,seconds:+baseline.elapsed.toFixed(1),
  shots:baseline.shotsFired,contacts:baseline.brickContacts,maxContactsPerBall:baseline.shotMaxContacts,
  giantRebounds:baseline.giantRebounds,maxCombo:baseline.maxCombo}));
assert.equal(baseline.phase,"won","normal progression never deadlocks");
assert.equal(baseline.score,189,"all three waves still contain 189 bricks");
assert.ok(baseline.shotMaxContacts>=3,"balls can make multi-brick shots");
const special=liveRun(["split","chain"]);
console.log("RUN upgraded",JSON.stringify({phase:special.phase,score:special.score,seconds:+special.elapsed.toFixed(1),
  shots:special.shotsFired,contacts:special.brickContacts,splitBursts:special.splitBursts,
  chainBursts:special.chainBursts,maxCombo:special.maxCombo}));
assert.equal(special.phase,"won","new upgrades can beat all three waves");
assert.ok(special.splitBursts>0&&special.chainBursts>0,"both new skills run in a real full game");
console.log("PASS default bold, slower shots, contact-normal armor bounce, fragile penetration, giant rebounds, split and chain upgrades, replay, reduced motion, multi-hit full runs");
