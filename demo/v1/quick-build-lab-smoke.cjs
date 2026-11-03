"use strict";
/* Six-branch quick lab headless smoke. Run from repo root:
 * node demo/v1/quick-build-lab-smoke.cjs
 * Behavioral simulation only; not browser / real-phone FPS or human fun QA.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const listeners=new Map(),els=new Map();let now=1000,frame;
const canvas=new Proxy({createLinearGradient(){return{addColorStop(){}}}},
 {get(o,k){return k in o?o[k]:()=>{}},set(o,k,v){o[k]=v;return true}});
function el(id){
 if(!els.has(id))els.set(id,{
  id,value:"",textContent:"",style:{},disabled:false,hidden:false,
  classList:{add(){},remove(){},toggle(){}},
  parentElement:{classList:{add(){},remove(){},toggle(){}}},
  getContext(){return canvas},addEventListener(kind,fn){listeners.set(id+":"+kind,fn)},
  getBoundingClientRect(){return{left:0,top:0,width:360,height:60}},
  focus(){},setPointerCapture(){},querySelectorAll(){return[]}
 });
 return els.get(id);
}
const document={hidden:false,activeElement:null,querySelector:s=>el(s.slice(1)),
 getElementById:el,querySelectorAll(){return[]},addEventListener(){}};
const window={__PINBALL_TEST__:true,__PINBALL_SEED__:20261103,innerWidth:360,innerHeight:560,
 addEventListener(){},matchMedia(){return{matches:false}}};
const context=vm.createContext({window,document,Math,Date,console,
 navigator:{vibrate(){return false}},
 performance:{now(){return now}},
 requestAnimationFrame(fn){frame=fn},
 localStorage:{getItem(){return null},setItem(){}}
});
for(const n of ["builds.js","juice-fx.js","game.js"])
 vm.runInContext(fs.readFileSync(path.join(__dirname,n),"utf8"),context,{filename:n});
const t=window.__pinballTest,s=window.__pinballState;
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const routes=["split-a","split-b","arc-a","arc-b","gun-a","gun-b"];
const step=n=>{for(let i=0;i<n;i++){now+=1000/60;assert.equal(typeof frame,"function");frame(now)}};
const records=[];
for(const scene of ["crowd","boss"]){
 let hpBaseline=null;
 for(const route of routes){
  const id="quick-"+route;
  assert.ok(html.includes('id="'+id+'"'),"button missing "+id);
  const fn=listeners.get(id+":click");
  assert.equal(typeof fn,"function",id+" is unbound");
  el("labScene").value=scene;fn();
  const start=s(),hp=t.hpDistribution().map(b=>b.initialHp).join(",");
  const wave=scene==="crowd"?6:10,upgrades=wave-1;
  assert.equal(start.phase,"playing");assert.equal(start.wave,wave);
  assert.equal(start.level,wave);assert.equal(start.quickLabRoute,route);
  assert.equal(start.coreBranch,route);assert.equal(start.choiceHistory.length,upgrades);
  assert.equal(start.quickLabActive,true);
  assert.equal(start.charge,100,"giant must start ready in the lab");
  assert.equal(el("giant").disabled,false,"manual giant button must be enabled");
  if(hpBaseline!==null)assert.equal(hp,hpBaseline,"same field "+scene);
  hpBaseline=hp;
  step(scene==="crowd"?360:210);
  const after=s();
  assert.equal(after.giantActive,false,"do not auto-fire giant in quick lab");
  assert.equal(el("giant").disabled,false);
  assert.ok(after.shotsFired>0);
  assert.equal(t.fireGiant(),true,"manual giant must fire");
  assert.equal(s().giantActive,true,"giant should exist in the physical arena");
  assert.equal(s().charge,0,"giant must consume charge");
  if(scene==="crowd"){
   const expected={"split-a":"stormSweeps","split-b":"childLocks","arc-a":"relayForks",
    "arc-b":"focusBursts","gun-a":"needleShots","gun-b":"fanExtraShots"}[route];
   assert.ok(after[expected]>0,route+" did not trigger "+expected);
  }else assert.equal(start.bossHp,128,"boss initial HP");
  records.push({scene,route,wave:after.wave,hits:after.shotsFired,
   storms:after.stormSweeps,hunts:after.childLocks,relay:after.relayForks,
   focus:after.focusBursts,needle:after.needleShots,fan:after.fanExtraShots});
  assert.equal(t.returnToQuickMenu(),true);
  assert.equal(s().phase,"ready");
 }
}
assert.ok(html.includes('id="labScene"'));
for(const id of ["quickMenuPause","quickMenuEnd"])assert.ok(html.includes('id="'+id+'"'));
assert.ok(!html.includes("quick-laser"));
assert.ok(!Object.hasOwn(window.PinballBuilds.DEFS,"laser"));
assert.equal(t.begin(),true);t.clearWave();step(12);
assert.equal(s().choiceSet,"split,arc,gun","normal first upgrade unaffected");
const juice=window.PinballJuice.create({reducedMotion:false});
assert.equal(el("impactMode").value,"snap","new crisp attack is the default");
assert.equal(juice.setMode("snap"),"snap");
const heavy={x:120,y:130,w:34,h:28,hp:70,color:"#5377bb"};
juice.onArmor(heavy,{vx:15,vy:-350});
assert.ok(heavy.hitVisual,"every armor hit gets a response");
assert.equal(juice.snapshot().snapArmorHits,1);
assert.equal(typeof juice.drawBrickImpact,"function");
juice.update(.02,[heavy]);
const moved=heavy.hitVisual.age;
assert.ok(moved>0,"contact animation advances in physical time");
juice.onBreak(heavy,{combo:2,source:"normal",impact:{vx:0,vy:-330}});
assert.equal(juice.snapshot().snapBreaks,1);
assert.equal(juice.setMode("punchy"),"punchy");
assert.equal(juice.setMode("bold"),"bold");
assert.equal(juice.setMode("off"),"off");
assert.ok(html.includes('<option value="snap">'),"new impact preset visible");
assert.ok(html.includes('<option value="punchy">'),"prior preset retained for A/B");
console.log("PASS 12 six-branch scenes, giant ready+manual activation, new crunch hit FX, old presets, regular game");
