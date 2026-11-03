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
  if(hpBaseline!==null)assert.equal(hp,hpBaseline,"same field "+scene);
  hpBaseline=hp;
  step(scene==="crowd"?360:210);
  const after=s();
  assert.equal(after.giantActive,false);
  assert.equal(el("giant").disabled,true);
  assert.ok(after.shotsFired>0);
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
console.log("PASS six distinct branch mechanics, two same-field test scenes, return menu, regular game; "+records.length+" branches/scenes");
