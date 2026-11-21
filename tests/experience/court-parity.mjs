import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {entry,instrument} from "./browser.mjs";

const [out,base,candidate,mode]=process.argv.slice(2);
const {page,errors,close}=await instrument(9463);
const views=[[360,640],[390,844],[430,932],[1440,900]];
const captures=[];
const simulate=`(()=>{
  const q=__pinballTest;
  q.begin();
  const state=__pinballState();
  const initial=[state.worldWidth,state.worldHeight,state.dangerY,state.shooterY];
  const plan=()=>q.allBricks().map(({x,y,w,h,hp,special,isBoss,isElite,ringArmor})=>({x,y,w,h,hp,special,isBoss,isElite,ringArmor}));
  const waves=Array.from({length:20},(_,i)=>{
    q.reset();q.begin();q.spawnWave(i+1);
    const layout=plan(),state=__pinballState(),before=layout[0].y;
    q.generateSurvival(.05);
    return {layout,fall:(plan()[0].y-before)/.05,danger:state.dangerY,multiplier:state.waveFallMultiplier};
  });
  q.reset();q.begin();
  const h=initial[1], y=initial[2];
  const shot=(x,y,vx,vy,frames=1)=>{
    q.injectTestBall(x,y,vx,vy);advanceGame(frames);return q.ballSnapshot()[0]||null;
  };
  const r=state.shotCollisionRadius;
  q.setTestField([{x:130,y:120,hp:2},{x:168.5,y:120,hp:2},{x:130,y:151,hp:2}]);
  const left=shot(r+.1,410,-330,0),right=shot(360-r-.1,410,330,0),ceiling=shot(15,4+r+.1,0,-330),drain=shot(180,h+9,0,330);
  const column=shot(163.75,195,0,-330,19);
  q.setTestField([{x:130,y:120,hp:2},{x:130,y:151,hp:2}]);
  const row=shot(100,147.2,330,0,16);
  const hit=shot(144.5,181,0,-330,6);
  const hp=q.hpDistribution();
  const muzzle=q.makeTestBall();
  q.injectGiantAt(180,h-83-14-.1,0,330);
  q.updateGiant(1/120);
  const giant=__pinballState().giantRebounds;
  q.setTestField([{x:14,y:y-22.2,hp:2}]);
  const states=[];
  for(let i=0;i<16;i++){
    q.generateSurvival(1/120);
    states.push(__pinballState().phase);
    if(states.at(-1)==="lost")break;
  }
  q.jumpToBoss10();q.summonBossBricks();
  const warned=__pinballState().summonWarningCount;
  advanceGame(120);
  const boss10={warned,materialized:__pinballState().bossSummonTotal,bricks:plan()};
  q.jumpToFinalBoss();q.queueFinaleStage(2);advanceGame(120);
  const stage2=q.finaleDetails();
  q.queueFinaleStage(3);advanceGame(120);
  const stage3=q.finaleDetails();
  q.fillBallBudget();
  const dense=__pinballState().activeBalls;
  q.reset();advanceGame(8);q.begin();
  const haptics=[],option=document.querySelector("#impactHaptic");
  Object.defineProperty(navigator,"vibrate",{configurable:true,value:ms=>{haptics.push(ms);return true;}});
  function setHaptics(enabled){
    option.checked=enabled;option.dispatchEvent(new Event("change"));
  }
  q.setTestField([{x:14,y:100,hp:1}]);
  setHaptics(false);q.hitById(q.firstBrick().id,"normal");
  q.setTestField([{x:14,y:100,hp:1}]);
  setHaptics(true);q.hitById(q.firstBrick().id,"normal");
  setHaptics(false);
  return {haptics,initial,waves,left,right,ceiling,drain,column,row,hit,hp,muzzle,giant,states,boss10,stage2,stage3,dense};
})()`;
try{
  for(const [width,height] of views){
    await page.viewport(width,height,2,width<500);
    const playing=[];
    for(const url of [base,candidate]){
      await page.goto(entry(url,{qa:1,seed:20261118}));
      playing.push(await page.eval(simulate));
    }
    const [before,after]=playing;
    if(mode==="release-polish"){
      const restoredMuzzle={...before.muzzle,y:before.muzzle.y-(26.76-23.33)};
      assert.ok(Math.abs(after.muzzle.y-restoredMuzzle.y)<1e-9);
      assert.deepEqual(after.muzzle,{...restoredMuzzle,y:after.muzzle.y});
      for(const key of ["initial","waves","left","right","ceiling","drain","column","row","hit","hp","giant","states","haptics","dense"]){
        assert.deepEqual(after[key],before[key],key+" "+width+"x"+height);
      }
    }else{
      assert.deepEqual(after,before,"whole engine output must match V2.1 for "+width+"x"+height);
    }
    assert.ok(after.left.vx>0&&after.right.vx<0&&after.ceiling.vy>0);
    assert.equal(after.drain,null);
    assert.ok(after.column.contacts===0&&after.column.y<120);
    assert.ok(after.row.contacts===0&&after.row.x>159);
    assert.ok(after.hit.contacts>0&&after.hp[1].hp===1&&after.hit.vy>0);
    assert.equal(after.giant,1);
    assert.equal(after.states.at(-1),"lost");
    assert.ok(after.boss10.warned>0&&after.boss10.materialized>0);
    assert.equal(after.stage2.stage,2);
    assert.equal(after.stage3.stage,3);
    assert.equal(after.dense,48);
    assert.deepEqual(after.haptics,[16]);
    captures.push({viewport:[width,height],...after});
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(out,JSON.stringify({captures,errors},null,2)+"\n");
  console.log(`PASS ${mode==="release-polish"?"C geometry, frozen collisions and the approved muzzle difference":"exact V2.1 parity"} across 80 waves and four viewports`);
}finally{await close();}
