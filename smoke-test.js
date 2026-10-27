"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const listeners = new Map(), elements = new Map();
function makeElement(id) {
  if(!elements.has(id)) elements.set(id,{
    id,textContent:"",disabled:false,style:{},
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(event,fn){listeners.set(id+":"+event,fn);},
    getBoundingClientRect(){return {left:0,top:0,width:360,height:560};},
    setPointerCapture(){}
  });
  return elements.get(id);
}
const canvas=makeElement("game");
const context=new Proxy({},{
  get(o,key){if(key in o)return o[key];if(key==="createLinearGradient")return ()=>({addColorStop(){}});
    return ()=>{};},
  set(o,k,v){o[k]=v;return true;}
});
canvas.getContext=()=>context;
const document={hidden:false,querySelector(s){return makeElement(s.slice(1));}};
const window={__PINBALL_TEST__:true,addEventListener(event,fn){listeners.set("window:"+event,fn);}};
let callback,now=1000;
vm.runInNewContext(fs.readFileSync("game.js","utf8"),{
  document,window,Math,console,
  performance:{now(){return now;}},
  requestAnimationFrame(fn){callback=fn;}
},{filename:"game.js"});
const t=window.__pinballTest,state=window.__pinballState;
function step(frames=1){for(let i=0;i<frames;i++){now+=1000/60;const fn=callback;assert.ok(fn);fn(now);}}
const finger={pointerId:1,clientX:340,clientY:300,preventDefault(){}};
assert.equal(state().phase,"playing");
assert.equal(state().rate,1);
assert.ok(state().bricks>=2,"a real first row of numbered bricks");
step(109);
assert.ok(state().ballCount>=1,"auto-fire produces projectiles");
const before=state().ballCount;
listeners.get("game:pointerdown")(finger);
listeners.get("game:pointerup")(finger);
assert.equal(state().ballCount,before,"release must not trigger a shot");
assert.ok(state().aim>0.7,"pointer controls aim direction");
t.setFirstHp(5);
const beforeDamage=t.first().hp;
t.hit(1);
assert.equal(t.first().hp,beforeDamage-1,"one hit deducts exactly one HP from numeric brick");
t.hit(10);
assert.ok(state().score>0,"destroyed numeric brick increments score");
assert.ok(state().xp>0,"destroyed bricks accumulate XP");
const shotCharge=state().charge;
assert.ok(shotCharge>0,"effective normal hits charge the active skill");
t.charge();
assert.equal(makeElement("giant").disabled,false,"in-arena giant button is active when charged");
listeners.get("giant:click")();
assert.equal(state().ultUsed,1,"player can activate giant with visible button");
assert.equal(state().charge,0,"giant consumes energy");
assert.ok(state().ultActive,"giant projectile exists");
step(96);
assert.equal(state().ultActive,false,"giant has a finite lifetime");
t.setLevelUp();
assert.equal(state().phase,"choosing","XP triggers a choice and pauses the round");
assert.equal(makeElement("giant").disabled,true,"ultimate blocked while selecting upgrade");
const pausedTime=state().time;
step(110);
assert.equal(state().time,pausedTime,"falling bricks and spawn timers pause during upgrade choice");
assert.equal(state().choices.length,2,"two meaningful upgrade options");
const pick=state().choices[0],old={...state()};
assert.ok(t.chooseById(pick),"choice accepted");
assert.equal(state().phase,"playing","choice resumes play");
assert.ok(state().level>1,"player level increased");
if(pick==="damage")assert.equal(state().damage,old.damage+1);
if(pick==="rate")assert.ok(state().rate<old.rate,"fire rate improves modestly");
if(pick==="ricochet")assert.equal(state().ricochetLevel,old.ricochetLevel+1);
if(pick==="giant")assert.equal(state().giantLevel,old.giantLevel+1);
t.threat();
t.advance(1);
assert.equal(state().phase,"lost","a numbered brick reaching the danger line ends run");
const deadTime=state().time;
step(120);
assert.equal(state().time,deadTime,"no simulation runs after death");
listeners.get("again:click")();
assert.equal(state().phase,"playing","replay starts immediately");
assert.equal(state().damage,1,"new run resets damage");
assert.equal(state().rate,1,"new run resets rate");
assert.equal(state().level,1,"new run resets level");
assert.equal(state().charge,0,"new run resets energy");
const html=fs.readFileSync("index.html","utf8");
assert.ok(html.includes('class="ult-wrap"')&&html.includes('id="giant"'),"ultimate is visibly overlaid inside arena");
assert.ok(html.includes('id="upgradeOverlay"')&&html.includes('id="loseOverlay"'),"choice and death overlays exist");
// Simulate a normal no-cheat run to catch progression deadlocks and fatal-state stalls.
let sawLevel=false, sawDestruction=false, sawDeath=false, skillReady=false, finalState;
for(let i=0;i<50000;i++){
  const s=state();
  if(s.phase==="choosing"){
    sawLevel=true;
    assert.ok(s.choices.length===2,"real run offers two upgrades");
    assert.ok(t.chooseById(s.choices[0]),"real run can resume");
  }
  if(s.phase==="lost"){sawDeath=true;finalState=s;break;}
  if(i%100===0){
    const x=[180,80,300,145,210,28][Math.floor(i/100)%6];
    const finger={pointerId:9,clientX:x,clientY:300,preventDefault(){}};
    listeners.get("game:pointerdown")(finger);
    listeners.get("game:pointerup")(finger);
  }
  step();
  if(state().score>0) sawDestruction=true;
  if(state().charge===100)skillReady=true;
}
assert.ok(sawDestruction,"real simulation destroys numbered bricks");
assert.ok(sawLevel,"real simulation can earn and choose at least one level");
assert.ok(sawDeath,"scripted active-play test eventually loses");
assert.ok((finalState??state()).time>20,"survival has meaningful playable length");
console.log("ACTIVE RUN",JSON.stringify({seconds:Math.round(finalState.time),score:finalState.score,level:finalState.level,skillReady}));
listeners.get("restart:click")();
let passive;
for(let i=0;i<50000;i++){
  if(state().phase==="choosing"){
    const s=state();
    t.chooseById(s.choices[0]);
  }
  if(state().phase==="lost"){passive=state();break;}
  step();
}
assert.ok(passive,"fixed upward aim eventually loses");
assert.ok(passive.time<finalState.time,"actively changing angles beats fixed aim with this test strategy");
console.log("PASSIVE RUN",JSON.stringify({seconds:Math.round(passive.time),score:passive.score,level:passive.level}));
listeners.get("restart:click")();
assert.ok(state().onScreenBricks>=6,"initial board has two visible rows");
let maxEmptySeconds=0,emptySeconds=0,emptyStreak=0,playSeconds=0;
for(let i=0;i<9000;i++){
  const s=state();
  if(s.phase==="choosing"){assert.ok(t.chooseById(s.choices[0]));}
  if(s.phase==="lost")break;
  if(i%100===0){
    const x=[180,80,300,145,210,28][Math.floor(i/100)%6];
    const finger={pointerId:7,clientX:x,clientY:300,preventDefault(){}};
    listeners.get("game:pointerdown")(finger);listeners.get("game:pointerup")(finger);
  }
  step();
  const nowState=state();
  if(nowState.phase==="playing"){
    playSeconds+=1/60;
    if(nowState.onScreenBricks===0){emptyStreak+=1/60;emptySeconds+=1/60;}
    else emptyStreak=0;
    maxEmptySeconds=Math.max(maxEmptySeconds,emptyStreak);
  }
}
console.log("TARGET AVAILABILITY",JSON.stringify({playSeconds:Math.round(playSeconds),emptySeconds:+emptySeconds.toFixed(2),maxEmptySeconds:+maxEmptySeconds.toFixed(2)}));
assert.ok(maxEmptySeconds<1.5,"no extended empty-board waiting during live play");
console.log("PASS survival numeric HP, continuous auto-fire, aim-only touch, XP + 2 choice pause, giant, bottom-line loss, restart, target refill");
