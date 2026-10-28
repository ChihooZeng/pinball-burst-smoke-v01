"use strict";
const vm=require("node:vm"),fs=require("node:fs"),assert=require("node:assert/strict");
const OLD="hybrid-v13-numberfield",NEW="hybrid-v14-tenwave";
function load(dir,{reduced=false}={}){
 const events=new Map(),elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{
  textContent:"",value:"",disabled:false,style:{},
  classList:{add(s){this[s]=true},remove(s){this[s]=false},toggle(key,value){this[key]=value===undefined?!this[key]:value;}},
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



const WAVE_ROWS=[8,9,10,11,9,10,11,10,11,11];
const WAVE_COUNTS=WAVE_ROWS.map(n=>n*9);
const TOTAL=WAVE_COUNTS.reduce((s,n)=>s+n,0);
assert.equal(TOTAL,900);
const fresh=load(NEW),freshState=fresh.state,ft=fresh.test;
assert.equal(freshState().wave,1);assert.equal(freshState().waveCount,10);
assert.equal(freshState().remaining,72);
assert.equal(freshState().visibleNumbers,72,"HP1 remains a real tile even though its numeral is hidden");
assert.equal(freshState().shotSpeed,365);
assert.equal(freshState().visualImpact.mode,"bold");
assert.equal(freshState().cannonClass,"storm");assert.equal(freshState().activeSkill,"giant");
const first=ft.hpDistribution();
assert.equal(first.length,72);
assert.ok(first.filter(b=>b.hp===1).length>=25,"fast-one-hit tiles still plentiful");
assert.ok(first.filter(b=>b.hp>1).length>=25,"rebound numeric tiles still plentiful");
assert.ok(Math.max(...first.map(b=>b.hp))<=6,"early HP not inflated");
assert.ok(first.every(b=>b.hp>=1),"no zero-start bricks");
assert.equal(ft.firstArmor().armored,true);
const a=ft.allBricks().find(b=>b.hp===1&&!b.special);
ft.hitById(a.id);assert.equal(a.alive,false,"HP1 is still one-hit-through");
const b=ft.allBricks().find(b=>b.hp>=4&&b.alive);
const startHp=b.hp;
for(let i=1;i<startHp;i++){ft.hitById(b.id);assert.equal(b.hp,startHp-i);assert.equal(b.alive,true);}
ft.hitById(b.id);assert.equal(b.cracked,true);
ft.hitById(b.id);assert.equal(b.alive,false);

const giantLight=load(NEW),tl=giantLight.test,sl=giantLight.state;
const tile=tl.allBricks().find(b=>b.hp>1&&!b.special);
tl.setBrickHp(tile.id,5);tl.keepOnlyBrick(tile.id);
tl.injectGiantAt(tile.x+tile.w/2,tile.y+tile.h+17,0,-610);
giantLight.frame(4);
assert.equal(tile.alive,false,"giant penetrates HP<=5");
assert.ok(sl().giantPiercings>=1);
assert.equal(sl().giantHeavyBounces,0,"low-HP giant doesn't brick-rebound");

const giantHeavy=load(NEW),th=giantHeavy.test,sh=giantHeavy.state;
const tough=th.allBricks().find(b=>b.hp>1&&!b.special);
th.setBrickHp(tough.id,9);th.keepOnlyBrick(tough.id);
th.injectGiantAt(tough.x+tough.w/2,tough.y+tough.h+17,0,-610);
giantHeavy.frame(4);
assert.equal(tough.alive,true,"HP>5 block remains after impact");
assert.ok(sh().giantHeavyBounces>=1,"HP>5 causes giant bounce");
assert.ok(sh().heavyHits>=1);
assert.ok(sh().giantBrickRebounds>=1);
assert.ok(sh().giantPiercings===0);
assert.ok(th.ballSnapshot().length===0);

const time=load(NEW),tt=time.test,ts=time.state;
tt.injectGiantAt(180,430,0,0);
assert.equal(ts().giantLifetime,5);
assert.equal(time.el("giantLife").classList.hidden,false,"live time HUD appears");
time.frame(180);
assert.ok(ts().giantRemaining>1.8 && ts().giantRemaining<2.1,"timebar counts down");
assert.equal(ts().giantActive,true,"still alive after 3 seconds");
assert.ok(parseFloat(time.el("giantTimeFill").style.width)<50);
time.frame(130);
assert.equal(ts().giantActive,false,"giant expires normally at 5 seconds");
assert.equal(time.el("giantLife").classList.hidden,true,"time HUD hides after expiry");
const reduce=load(NEW,{reduced:true});
assert.equal(reduce.state().visualImpact.mode,"off");

// 10 waves must stay within the existing arena; no overlap into the shooter.
const waves=load(NEW);
const upgradeRoute=["pierce","arc","split","chain","pierce","arc","rate","bounce","rate"];
for(let i=0;i<10;i++){
 const st=waves.state(),t=waves.test;
 assert.equal(st.wave,i+1);
 assert.equal(st.waveRows,WAVE_ROWS[i]);
 assert.equal(st.remaining,WAVE_COUNTS[i]);
 const layout=t.brickLayout();
 assert.ok(Math.max(...layout.map(b=>b.y+b.h))<420,"all bricks above shooter and giant timer");
 const values=t.hpDistribution();
 assert.ok(values.every(b=>b.initialHp<=13),"high wave HP remains bounded");
 assert.ok(values.some(b=>b.initialHp===1),"HP1 breaks remain at every wave");
 assert.ok(values.some(b=>b.initialHp>=3),"bounce anchors remain at every wave");
 if(i===9)break;
 t.clearWave();assert.equal(waves.state().phase,"choosing");
 assert.equal(t.chooseByKind(upgradeRoute[i]),true);
}
assert.equal(waves.state().pierceLevel,2);
assert.equal(waves.state().arcLevel,2);
assert.equal(waves.state().splitLevel,1);
assert.equal(waves.state().chainLevel,1);
assert.equal(waves.state().rateLevel,2);
assert.equal(waves.state().ricochetLevel,1);
waves.test.clearWave();assert.equal(waves.state().phase,"won","ten actual waves win");
waves.click("again");assert.equal(waves.state().wave,1);
assert.equal(waves.state().pierceLevel,0);
assert.equal(waves.state().arcLevel,0);

// Armored damage from empowered shot: 2 points in one collision but still cracks.
const shot=load(NEW),sp=shot.test,ss=shot.state;
sp.clearWave();sp.chooseByKind("pierce");
const armored=sp.firstArmor();assert.ok(armored.hp>=2);
const original=armored.hp;
sp.keepOnlyBrick(armored.id);
// Fire four volleys to get first power ball; deliberately keep first three balls elsewhere.
shot.frame(310);
assert.ok(ss().powerShots>=1,"fourth volley shoots a stronger armor breaker");
assert.ok(ss().shotsFired>=4);

// Stage finale softens lingering high HP rather than forcing lone grinds.
const finale=load(NEW),en=finale.test,st=finale.state;
const armor=en.firstArmor();en.setBrickHp(armor.id,13);
en.keepOnlyBrick(armor.id);en.markFinalRush();
assert.equal(armor.hp,3,"last-eight bonus softens still-large armor HP");
assert.ok(st().tailSoftens>=1);
const progress=load(NEW);
progress.test.chargeFully();
assert.equal(progress.test.activateEquippedSkill(),true,"skill slot still dispatches giant");

function play(dir,route=["pierce","arc","split","chain","pierce","arc","rate","bounce","rate"],limit=82000){
 const g=load(dir);let upgrades=0;
 for(let i=0;i<limit;i++){
  const st=g.state();
  if(st.phase==="choosing"){
   assert.ok(upgrades<9);
   assert.equal(g.test.chooseByKind(route[upgrades++]),true);
  }
  if(st.phase==="won")break;
  if(i%42===0){
   const target=g.test.firstBrick();
   if(target){const theta=Math.atan2(target.x+target.w/2-180,495-(target.y+target.h/2));
     g.aim(Math.max(0,Math.min(360,180+theta/1.08*180)));}
  }
  g.frame();
 }
 const state=g.state();
 assert.equal(state.phase,"won","ten waves must be fully completed (not forced clear)");
 assert.equal(state.score,TOTAL);
 assert.equal(upgrades,9);
 assert.equal(JSON.parse(state.electricStats).length,10);
 assert.equal(JSON.parse(state.endgameWaveStats).length,10);
 return state;
}
const full=play(NEW);
console.log("FULL TEN",JSON.stringify({seconds:+full.elapsed.toFixed(1),score:full.score,rounds:full.wave,
 maxCombo:full.maxCombo,lightning:full.lightningTriggers,armorCracks:full.armorCracks,
 powerShots:full.powerShots,tailSoftens:full.tailSoftens,
 newUpgrades:{pierce:full.pierceLevel,arc:full.arcLevel},
 finale:JSON.parse(full.endgameWaveStats)}));
const regular=play(NEW,["rate","bounce","split","chain","rate","bounce","chain","pierce","arc"]);
console.log("SECOND BUILD",JSON.stringify({seconds:+regular.elapsed.toFixed(1),score:regular.score,maxCombo:regular.maxCombo,lightning:regular.lightningTriggers}));
console.log("PASS: full independent HP, hidden 1, giant HP5 penetration/HP6+ bounce and 5s timer, 10 waves 900 tiles, 9 upgrades, both new skills, last-eight soften and two ten-wave runs");
