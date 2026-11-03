"use strict";
/* Compare-lab headless logic smoke, not actual mobile/browser performance QA.
 * Run from repository root: node demo/v1/quick-build-lab-smoke.cjs
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const listeners=new Map(),nodes=new Map();let now=1000,frame;
const graphic=new Proxy({createLinearGradient(){return {addColorStop(){}};}},{get(o,k){return k in o?o[k]:()=>{};},set(o,k,v){o[k]=v;return true;}});
function element(id){
 if(!nodes.has(id))nodes.set(id,{
  id,value:"",textContent:"",style:{},disabled:false,hidden:false,
  parentElement:{classList:{add(){},remove(){},toggle(){}}},
  classList:{add(){},remove(){},toggle(){}},
  addEventListener(k,cb){listeners.set(id+":"+k,cb);},
  getContext(){return graphic;},
  getBoundingClientRect(){return{left:0,top:0,width:360,height:60};},
  focus(){},querySelectorAll(){return[];},setPointerCapture(){}
 });
 return nodes.get(id);
}
const document={
 hidden:false,activeElement:null,
 querySelector:s=>element(s.slice(1)),getElementById:element,
 querySelectorAll(){return[];},addEventListener(){}
};
const window={__PINBALL_TEST__:true,__PINBALL_SEED__:20261101,innerWidth:360,innerHeight:560,
 addEventListener(){},matchMedia(){return{matches:false};}};
const sandbox=vm.createContext({window,document,console,Math,Date,
 navigator:{vibrate(){return false;}},
 performance:{now(){return now;}},
 requestAnimationFrame(cb){frame=cb;},
 localStorage:{getItem(){return null;},setItem(){}}});
for(const name of ["builds.js","juice-fx.js","game.js"]){
 vm.runInContext(fs.readFileSync(path.join(__dirname,name),"utf8"),sandbox,{filename:name});
}
const t=window.__pinballTest,s=window.__pinballState;
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const advance=(n)=>{for(let i=0;i<n;i++){now+=1000/60;assert.equal(typeof frame,"function");frame(now);}};
let baselineHp=null;
for(const route of ["split","arc","gun"]){
 const id="quick-"+route;
 assert.ok(html.includes('id="'+id+'"'));
 const launch=listeners.get(id+":click");
 assert.equal(typeof launch,"function",id+" is bound");
 launch();
 const info=s();
 assert.equal(info.phase,"playing");
 assert.equal(info.wave,6);
 assert.equal(info.level,6);
 assert.equal(info.screenClears,5);
 assert.equal(info.seedAbility,route);
 assert.equal(info.quickLabRoute,route);
 assert.equal(info.quickLabActive,true);
 assert.equal(info.choiceHistory.length,5);
 assert.equal(info.brickCount,78);
 const hp=t.hpDistribution().map(b=>b.initialHp).join(",");
 if(baselineHp!==null)assert.equal(hp,baselineHp,"all routes use identical wave 6 HP");
 baselineHp=hp;
 advance(120);
 assert.equal(s().giantActive,false,"no ultimate in isolated route comparison");
 assert.equal(element("giant").disabled,true);
 assert.ok(s().shotsFired>0,"physical balls still fire");
 assert.equal(t.returnToQuickMenu(),true);
 assert.equal(s().phase,"ready");
 assert.equal(s().quickLabActive,false);
}
for(const id of ["quickMenuPause","quickMenuEnd"])assert.ok(html.includes('id="'+id+'"'));
assert.equal(t.begin(),true,"normal full run still available");
assert.equal(s().wave,1);
assert.equal(s().quickLabActive,false);
advance(12);
assert.deepEqual(Array.from(window.PinballBuilds.offer(window.PinballBuilds.createState(),1)),["split","arc","gun"]);
assert.ok(!html.includes("quick-laser"),"laser button must be removed");
assert.ok(!Object.hasOwn(window.PinballBuilds.DEFS,"laser"),"laser skill must be removed");
console.log("PASS three one-tap midgame Builds; identical wave6; 5 legal upgrades; ultimate isolated; menu reset; normal game");
