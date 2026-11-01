"use strict";
/* Usage: node demo/v1/pacing-pressure-smoke.cjs
 * A deterministic headless logic smoke, NOT a browser/FPS/audio or human-balance test.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
let now=1000,frame=null;
const elements=new Map();
const context2d=new Proxy({createLinearGradient(){return {addColorStop(){}};}},{
  get(o,k){return k in o?o[k]:()=>{};},
  set(o,k,v){o[k]=v;return true;}
});
function getElement(id){
  if(!elements.has(id))elements.set(id,{
    id,value:"",textContent:"",style:{},disabled:false,checked:false,
    parentElement:{classList:{add(){},remove(){},toggle(){}}},
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(){},focus(){},setPointerCapture(){},querySelectorAll(){return [];},
    getContext(){return context2d;},
    getBoundingClientRect(){return {left:0,top:0,width:360,height:60};}
  });
  return elements.get(id);
}
const document={
  hidden:false,activeElement:null,
  querySelector:s=>getElement(s.slice(1)),getElementById:getElement,
  querySelectorAll(){return [];},addEventListener(){}
};
const window={
  __PINBALL_TEST__:true,__PINBALL_SEED__:20261101,
  innerWidth:360,innerHeight:560,
  addEventListener(){},matchMedia(){return {matches:false};}
};
const sandbox=vm.createContext({
  window,document,navigator:{vibrate(){return false;}},
  performance:{now(){return now;}},
  requestAnimationFrame(fn){frame=fn;return 1;},
  localStorage:{getItem(){return null;},setItem(){}},
  console,Math,Date
});
for(const file of ["builds.js","juice-fx.js","game.js"]){
  vm.runInContext(fs.readFileSync(path.join(__dirname,file),"utf8"),sandbox,{filename:file});
}
const test=window.__pinballTest,state=window.__pinballState;
const step=(count=1)=>{for(let n=0;n<count;n++){now+=1000/60;assert.equal(typeof frame,"function");frame(now);}};
assert.equal(state().phase,"ready");
assert.equal(state().wave,1);
assert.equal(state().visualImpact.mode,"bold");
assert.equal(state().brickCount,35);
assert.ok(state().waveStartGap>100);
assert.equal(test.begin(),true);
step(8);
const initialGap=state().waveStartGap,brick=test.firstBrick();
brick.y=state().dangerY-brick.h-54;
step(9);
assert.equal(state().pressureWarningStage,1);
assert.match(getElement("stateText").textContent,/逼近警戒线/);
brick.y=state().dangerY-brick.h-20;
step(9);
assert.equal(state().pressureWarningStage,2);
assert.match(getElement("stateText").textContent,/即将触线/);
brick.y=state().dangerY-brick.h+.4;
step(3);
assert.equal(state().phase,"lost");
const failureEvents=test.exportData().events;
assert.ok(failureEvents.some(e=>e.type==="danger_warning"&&e.stage===1));
assert.ok(failureEvents.some(e=>e.type==="danger_warning"&&e.stage===2));
const touchline=failureEvents.find(e=>e.type==="touchline");
assert.ok(touchline&&touchline.nearDangerSeconds>0);
assert.equal(touchline.startGap,initialGap);
for(const core of ["split","arc","gun"]){
  test.reset();test.begin();step(2);
  assert.equal(state().pressureWarningStage,0);
  assert.equal(state().nearDangerSeconds,0);
  test.clearWave();step(4);
  assert.equal(state().phase,"choosing");
  const report=state().waveReports[0];
  assert.ok(report&&Number.isFinite(report.startGap)&&Number.isFinite(report.closestGap));
  assert.equal(typeof report.nearDangerSeconds,"number");
  const index=state().choiceSet.split(",").indexOf(core);
  assert.ok(index>=0,"core in first wave choices: "+core);
  assert.equal(test.chooseIndex(index),true);
  assert.equal(state().seedAbility,core);
  assert.equal(state().phase,"playing");
}
console.log("PASS B-baseline, early warning, touchline, pressure export, reset, wave-clear and three cores");
if(process.argv.includes("--long")){
  test.reset();test.begin();
  const results=[];let lastWave=1;
  for(let f=0;f<5400;f++){
    const s=state();
    if(s.phase==="lost"||s.phase==="complete")break;
    if(s.phase==="choosing"){
      const offers=s.choiceSet.split(",");
      assert.equal(test.chooseIndex(Math.max(0,offers.indexOf("arc"))),true);
      continue;
    }
    if(f%20===0){
      const live=test.allBricks().filter(b=>b.alive);
      if(live.length){
        const bottom=Math.max(...live.map(b=>b.y));
        const target=live.filter(b=>b.y>=bottom-36)
          .sort((a,b)=>Math.abs(a.x+a.w/2-180)-Math.abs(b.x+b.w/2-180))[0];
        test.setAimAngle(Math.atan2(target.x+target.w/2-180,s.shooterY-(target.y+target.h/2)));
      }
    }
    step();
    if(state().wave!==lastWave){lastWave=state().wave;results.push({wave:lastWave,seconds:Math.round(state().elapsed)});}
  }
  console.log("HEURISTIC RUN (not human QA)",JSON.stringify({
    phase:state().phase,wave:state().wave,seconds:+state().elapsed.toFixed(1),
    clears:state().screenClears,score:state().score,results
  }));
}