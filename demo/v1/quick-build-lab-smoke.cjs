"use strict";
/* Six-branch regression: giant auto-casts and gun-B fires 3 PHYSICAL
 * independently rebounding balls. Run from repo root:
 *   node demo/v1/quick-build-lab-smoke.cjs
 * Headless logic checks, NOT browser FPS or human feel validation.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const listeners=new Map(),nodes=new Map();let now=1000,frame;
const paint=new Proxy({createLinearGradient(){return{addColorStop(){}}}},
 {get(o,k){return k in o?o[k]:()=>{}},set(o,k,v){o[k]=v;return true}});
function node(id){
 if(!nodes.has(id))nodes.set(id,{
  id,value:"",textContent:"",style:{},disabled:false,hidden:false,
  classList:{add(){},remove(){},toggle(){}},
  parentElement:{classList:{add(){},remove(){},toggle(){}}},
  addEventListener(k,f){listeners.set(id+":"+k,f)},getContext(){return paint},
  getBoundingClientRect(){return{left:0,top:0,width:360,height:60}},
  querySelectorAll(){return[]},focus(){},setPointerCapture(){}
 });
 return nodes.get(id);
}
const document={hidden:false,activeElement:null,querySelector:s=>node(s.slice(1)),
 getElementById:node,querySelectorAll(){return[]},addEventListener(){}};
const window={__PINBALL_TEST__:true,__PINBALL_SEED__:20261103,
 innerWidth:360,innerHeight:560,addEventListener(){},matchMedia(){return{matches:false}}};
const context=vm.createContext({window,document,console,Math,Date,
 navigator:{vibrate(){return false}},
 performance:{now(){return now}},
 requestAnimationFrame(fn){frame=fn},
 localStorage:{getItem(){return null},setItem(){}}
});
for(const name of ["builds.js","juice-fx.js","game.js"]){
 vm.runInContext(fs.readFileSync(path.join(__dirname,name),"utf8"),context,{filename:name});
}
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const t=window.__pinballTest,s=window.__pinballState,B=window.PinballBuilds;
const step=n=>{for(let i=0;i<n;i++){now+=1000/60;assert.equal(typeof frame,"function");frame(now)}};
const routes=["split-a","split-b","arc-a","arc-b","gun-a","gun-b"];
assert.ok(!html.includes('id="autoSkill"'),"auto-skill cannot be manually disabled");
assert.ok(!listeners.has("giant:click"),"manual giant activation must be removed");
assert.ok(html.includes("每轮三球扇形反弹"),"fan description must match actual physics");
assert.equal(B.CONFIG.lineInterval,.125);
assert.equal(B.CONFIG.fanInterval,.24);
for(const scene of ["crowd","boss"]){
 let base=null;
 for(const route of routes){
  assert.ok(html.includes('id="quick-'+route+'"'));
  const launch=listeners.get("quick-"+route+":click");
  assert.equal(typeof launch,"function");
  node("labScene").value=scene;launch();
  const before=s(),hp=t.hpDistribution().map(b=>b.initialHp).join(",");
  assert.equal(before.wave,scene==="crowd"?6:10);
  assert.equal(before.coreBranch,route);
  assert.equal(before.charge,100);
  assert.equal(node("giant").disabled,true);
  if(base!==null)assert.equal(hp,base,"all builds same HP layout");
  base=hp;
  step(1);const after=s();
  assert.ok(after.giantActive,"charged giant must auto-cast on first tick");
  assert.equal(after.skillsUsed,1);
  assert.equal(after.charge,0);
  step(70);assert.ok(s().shotsFired>0,"regular shots must remain automatic");
  assert.equal(t.returnToQuickMenu(),true);
  assert.equal(s().phase,"ready");
 }
}
node("labScene").value="crowd";listeners.get("quick-gun-b:click")();
t.setAimAngle(0);
assert.equal(t.fire(),true);
const shots=t.ballDetails();
assert.equal(shots.length,3,"fan fires three balls in same volley");
assert.ok(shots.every(b=>!b.mini&&b.fanProjectile&&b.maxLife>3));
assert.ok(shots[0].vx===0&&shots[1].vx<0&&shots[2].vx>0);
step(190);
assert.ok(s().fanBrickRebounds>0,"fan projectiles must bounce off surviving HP bricks");
assert.ok(s().fanWallBounces>0,"fan projectiles must bounce off walls");
assert.ok(s().activeBalls<=B.CONFIG.maxBalls,"fan bullets cannot exceed physical cap");
t.returnToQuickMenu();
assert.equal(t.begin(),true);t.clearWave();step(12);
assert.equal(s().choiceSet,"split,arc,gun","normal three-core first upgrade");
const juice=window.PinballJuice.create({reducedMotion:false});
for(const mode of ["snap","punchy","bold","off"])assert.equal(juice.setMode(mode),mode);
console.log("PASS 12 branch/scenes auto giant, fan3 wall/brick bounces, bounded balls, stronger gun, normal loop and impact");
