"use strict";
// Node-only simulation test: no browser performance or human-balance assertions.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const nodes=new Map(),events=new Map();
const canvasCtx=new Proxy({createLinearGradient(){return {addColorStop(){}}}},{
  get(o,k){return k in o?o[k]:()=>{}},set(o,k,v){o[k]=v;return true}
});
function node(id){
 if(!nodes.has(id))nodes.set(id,{
  id,value:"",textContent:"",style:{},disabled:false,
  classList:{add(){},remove(){},toggle(){}},
  parentElement:{classList:{add(){},remove(){},toggle(){}}},
  addEventListener(event,fn){events.set(id+":"+event,fn)},
  getContext(){return canvasCtx},getBoundingClientRect(){return {left:0,top:0,width:360,height:60}},
  focus(){},setPointerCapture(){},querySelectorAll(){return []}
 });return nodes.get(id);
}
const document={hidden:false,activeElement:null,querySelector:s=>node(s.slice(1)),
 getElementById:node,querySelectorAll(){return []},addEventListener(){}};
const window={__PINBALL_TEST__:true,__PINBALL_SEED__:20261101,
 innerWidth:360,innerHeight:560,addEventListener(){},matchMedia(){return {matches:false}}};
let now=1000,callback;
const ctx=vm.createContext({
 window,document,navigator:{vibrate(){return false}},
 performance:{now(){return now}},requestAnimationFrame(fn){callback=fn},
 localStorage:{getItem(){return null},setItem(){}},console,Math,Date
});
for(const name of ["builds.js","juice-fx.js","game.js"])
 vm.runInContext(fs.readFileSync(path.join(__dirname,name),"utf8"),ctx,{filename:name});
const B=window.PinballBuilds,t=window.__pinballTest,s=window.__pinballState;
function step(count){for(let i=0;i<count;i++){now+=1000/60;callback(now)}}
const fresh=B.createState();
assert.deepEqual(Array.from(B.offer(fresh,1)),["split","arc","gun","laser"]);
assert.ok(B.choose(fresh,"laser",1),"laser is a valid fourth seed");
assert.equal(B.offer(fresh,2).length,3,"normal upgrades remain three choices");
assert.ok(B.choose(fresh,"laser",2),"laser can rank up");
assert.equal(B.effects(fresh).laserPierce,2);
assert.ok(B.eligible(fresh,3).includes("gun"),"mixed laser+gun remains eligible");
assert.ok(B.choose(fresh,"gun",3),"laser and gun can coexist");
assert.ok(!B.eligible(fresh,4).includes("arc"),"third core not allowed");
assert.equal(s().phase,"ready");
assert.equal(t.begin(),true);
t.clearWave();step(8);
assert.equal(s().phase,"choosing");
assert.equal(s().choiceSet,"split,arc,gun,laser");
assert.equal(t.chooseIndex(3),true);
assert.equal(s().seedAbility,"laser");
step(125);
assert.equal(s().wave,2);
t.setTestField([{x:165,y:300,hp:25}]);
t.setAimAngle(0);step(50);
assert.ok(s().laserHits>0&&t.firstBrick().hp<25,"laser deals damage");
assert.ok(s().laserSegmentCount>0,"beam segment visible");
t.configureBuild({laser:2});
t.setTestField([{x:165,y:300,hp:25},{x:165,y:380,hp:25}]);
step(35);
assert.ok(t.hpDistribution().every(b=>b.hp<25),"laser rank 2 pierces two bricks");
t.configureBuild({laser:1});
t.setTestField([{x:90,y:337,hp:25}]);
t.setAimAngle(-1.08);step(65);
assert.ok(t.firstBrick().hp<25,"single wall bounce reaches off-axis brick");
assert.ok(s().laserHits>0,"laser hits tracked");
console.log("PASS four cores; post-seed three-choice; mixed builds; continuous damage; piercing; wall reflection; diagnostics");
