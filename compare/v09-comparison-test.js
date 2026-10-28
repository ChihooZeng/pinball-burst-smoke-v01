"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
function start(version,{reduced=false}={}){
  const dir="./"+version,events=new Map(),els=new Map();
  const PinballJuice=require(dir+"/juice-fx.js");
  function el(id){
    if(!els.has(id))els.set(id,{
      textContent:"",disabled:false,value:"",style:{},
      classList:{add(){},remove(){},toggle(){}},
      addEventListener(type,fn){events.set(id+":"+type,fn);},
      setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:360,height:560};}
    });
    return els.get(id);
  }
  const canvas=new Proxy({},{get(o,k){if(k in o)return o[k];
    if(k==="createLinearGradient")return ()=>({addColorStop(){}});
    return ()=>{};},set(o,k,v){o[k]=v;return true;}});
  el("game").getContext=()=>canvas;
  let now=1000,cb=null;
  const window={__PINBALL_TEST__:true,PinballJuice,
    matchMedia(){return {matches:reduced};},
    addEventListener(type,fn){events.set("window:"+type,fn);}};
  vm.runInNewContext(fs.readFileSync(dir+"/game.js","utf8"),{
    window,document:{hidden:false,querySelector(q){return el(q.slice(1));}},
    performance:{now(){return now;}},Math,console,
    requestAnimationFrame(fn){cb=fn;}
  },{filename:version+"/game.js"});
  return {
    state:window.__pinballCompare,test:window.__pinballTest,el,
    step(n=1){for(let i=0;i<n;i++){now+=1000/60;assert.ok(cb);cb(now);}},
    click(id){assert.ok(events.has(id+":click"),"click exists: "+id);events.get(id+":click")();},
    aim(x){const ev={pointerId:1,clientX:x,preventDefault(){}};
      events.get("game:pointerdown")(ev);events.get("game:pointerup")(ev);},
    mode(s){el("impactMode").value=s;events.get("impactMode:change")();}
  };
}
const dirs=["hybrid-v09a-longrun","hybrid-v09b-armor"];
const waveCounts=[72,81,90,99],armorCounts=[11,12,13,15];
for(const dir of dirs){
 const g=start(dir);const test=g.test,stat=g.state;
 assert.equal(stat().phase,"playing");
 assert.equal(stat().wave,1);
 assert.equal(stat().remaining,72);
 assert.equal(stat().armored,11,"armor density unchanged from v0.8");
 assert.equal(stat().armorHp,22);
 assert.equal(stat().visualImpact.mode,"bold");
 assert.equal(stat().shotSpeed,365);
 assert.equal(stat().interval,1);
 assert.equal(stat().brickWidth,29);
 assert.equal(stat().shotRadius,3.45);
 g.step(80);assert.ok(stat().shotsFired>=1,"auto fire");
 const before=stat().shotsFired;g.aim(300);
 assert.equal(stat().shotsFired,before,"aim doesn't fire extra");
 assert.ok(stat().aim>0);
 const first=test.firstArmor();
 assert.ok(first&&first.hp===2);
 test.hitById(first.id);assert.equal(first.hp,1);
 assert.equal(stat().score,0,"armor hit doesn't score");
 test.hitById(first.id);
 if(dir.includes("09a")){
   assert.equal(first.alive,false,"A removes armor when HP reaches zero");
   assert.equal(stat().score,1);
 }else{
   assert.equal(first.alive,true,"B cracks armor into a plain brick at zero");
   assert.equal(first.armored,false,"B removes armor flag");
   assert.equal(first.cracked,true,"B records visible armor break");
   assert.equal(first.hp,0);
   assert.equal(stat().cracked,1);
   assert.equal(stat().score,0,"B armor break is not an elimination");
   assert.equal(stat().remaining,72,"B armor break doesn't shrink board");
   test.hitById(first.id);
   assert.equal(first.alive,false,"B follows with one-hit break");
   assert.equal(stat().score,1);
 }
 test.clearWave();assert.equal(stat().phase,"choosing");
 const prev=stat().elapsed;g.step(55);assert.equal(stat().elapsed,prev,"upgrade pauses physics");
 g.click("pickSplit");assert.equal(stat().splitLevel,1);
 assert.equal(stat().remaining,81);
 assert.equal(stat().armored,12);
 assert.equal(stat().armorHp,36);
 g.step(260);assert.ok(stat().splitBursts>0,"extra split bullets fire");
 test.clearWave();g.click("pickChain");
 assert.equal(stat().remaining,90);
 assert.equal(stat().armored,13);
 assert.equal(stat().armorHp,52);
 assert.equal(stat().chainLevel,1);
 test.clearWave();g.click("pickBounce");
 assert.equal(stat().remaining,99);
 assert.equal(stat().armored,15);
 assert.equal(stat().armorHp,75);
 assert.equal(stat().ricochetLevel,1);
 test.clearWave();assert.equal(stat().phase,"won","four waves finish");
 g.click("again");
 assert.equal(stat().wave,1);assert.equal(stat().remaining,72);
 assert.equal(stat().splitLevel,0);
 assert.equal(stat().chainLevel,0);
 const html=fs.readFileSync(dir+"/index.html","utf8");
 assert.ok(html.includes("四波已清空")&&html.includes('id="pickSplit"'));
 const reduced=start(dir,{reduced:true});
 assert.equal(reduced.state().visualImpact.mode,"off");
 console.log("PASS progression",dir,JSON.stringify({counts:waveCounts,armor:armorCounts,step1Armor:2,step4Armor:5}));
}
// The B armoring must keep the projectile bouncing as long as a cracked block is alive,
// then let the very next hit pass through after it breaks.
const armor=start("hybrid-v09b-armor"),t=armor.test;
const piece=t.firstArmor();
t.keepOnlyBrick(piece.id);
t.hitById(piece.id);t.hitById(piece.id);
assert.equal(piece.cracked,true);assert.equal(piece.alive,true);
t.injectTestBall(piece.x+piece.w/2,piece.y+piece.h+4.5,0,-365);
armor.step(7);
assert.equal(piece.alive,false,"post-crack ball destroys the underlying brick");
const norm=t.physicsNormal({x:18,y:29,r:3.45},{x:0,y:0,w:30,h:22},18,30);
assert.ok(norm.ny>0,"real contact normal still exposed");
// Actual projectile physics: the last armor point cracks but the ball still bounces away.
const breakContact=start("hybrid-v09b-armor");
const shield=breakContact.test.firstArmor();
breakContact.test.keepOnlyBrick(shield.id);
breakContact.test.hitById(shield.id); // HP2 -> HP1
breakContact.test.injectTestBall(shield.x+shield.w/2,shield.y+shield.h+4.5,0,-365);
breakContact.step(3);
assert.equal(shield.cracked,true,"the real projectile removes the armor shell");
assert.equal(shield.alive,true,"the underlying plain block remains collidable");
assert.ok(breakContact.test.ballSnapshot()[0]?.vy>0,"the cracking hit reflects the ball downward");

// Giant retains its rare exciting ability to blast any armor outright.
const giantB=start("hybrid-v09b-armor");
const gArmor=giantB.test.firstArmor();
giantB.test.hitById(gArmor.id,"giant");
assert.equal(gArmor.alive,false,"giant remains exceptional and instantly breaks armor");

// Full progression with deterministic aiming (software simulation, not user timing).
function play(version,route=["split","chain","bounce"],limit=31000){
 const g=start(version);let choices=0;
 for(let i=0;i<limit;i++){
  const s=g.state();
  if(s.phase==="choosing"){
   assert.equal(g.test.chooseByKind(route[choices++]),true,"upgrade available");
  }
  if(s.phase==="won")break;
  if(i%45===0){
   const b=g.test.firstBrick();
   if(b){const a=Math.atan2(b.x+b.w/2-180,495-(b.y+b.h/2));
    g.aim(Math.min(360,Math.max(0,180+a/1.08*180)));}
  }
  g.step();
 }
 return {...g.state(),choices};
}
for(const version of dirs){
 const x=play(version);
 assert.equal(x.phase,"won","full game completes without softlock "+version);
 assert.equal(x.score,342,"every tile eventually eliminated");
 assert.equal(x.choices,3,"three upgrade decisions");
 assert.ok(x.splitBursts>0&&x.chainBursts>0,"new effects survive the extra wave");
 assert.ok(x.shotMaxContacts>3,"continuous hits survive");
 console.log("FULL RUN",version,JSON.stringify({seconds:+x.elapsed.toFixed(1),score:x.score,maxCombo:x.maxCombo,maxBallContacts:x.shotMaxContacts,split:x.splitBursts,chain:x.chainBursts}));
}
console.log("PASS: equal four-wave grids, isolated two-stage armor, three upgrades, 342 breaks and full-game simulations");
