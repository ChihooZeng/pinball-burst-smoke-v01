import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {entry,instrument} from "./browser.mjs";

const [output,url="http://127.0.0.1:4201/demo/v1/",mode="observe"]=process.argv.slice(2);
const {page,errors,close}=await instrument(Number(process.env.PINBALL_QA_PORT||9401),false);
const routes=["split","arc","gun"];
const seeds=[20261118,2701,781];
const angles=[-.53,.43,.71];
const cases=routes.flatMap(faction=>seeds.flatMap(seed=>[
  {faction,seed,style:"active"},
  ...angles.map(angle=>({faction,seed,style:"fixed",angle}))
])).concat(seeds.map((seed,index)=>({faction:null,seed,style:"from-start",angle:[0,.43,-.53][index]})));
const reports=[];
try{
  await page.viewport(360,640,2,true);
  for(const scenario of cases.filter(run=>!process.env.PINBALL_BALANCE_SCOPE||run.style===process.env.PINBALL_BALANCE_SCOPE)){
    await page.goto(entry(url,{seed:scenario.seed}));
    const run=await page.eval(`(()=>{
      const {faction,style,angle}= ${JSON.stringify(scenario)};
      const qa=__pinballTest;
      const priority=faction==="arc"?[faction,"power","rate","speed","life",faction+"-a",faction+"-b"]:
        [faction,faction+"-a",faction+"-b","power","rate","speed","life"];
      const byWave=new Map(), picks=[],bossTimes=[];
      let beforeWave=0,beforeBosses=0,aimChanges=0,previousAim=null;
      qa.begin();
      if(style==="from-start")qa.setAimAngle(angle);
      function aimAt(bricks,state){
        const bins=new Map();
        for(const b of bricks){
          const angle=Math.max(-1.08,Math.min(1.08,Math.atan2(b.x+b.w/2-180,state.shooterY-b.y-b.h/2)));
          const gap=state.dangerY-b.y-b.h;
          const urgency=1+3*Math.max(0,1-gap/38);
          const key=Math.round(angle/.05),weight=urgency*(.5+1.6*(b.y+b.h)/state.worldHeight)*(b.w>40?1.6:1);
          const bin=bins.get(key)||{weight:0,sum:0};
          bin.weight+=weight;bin.sum+=angle*weight;bins.set(key,bin);
        }
        let best=null;
        for(const bin of bins.values())if(!best||bin.weight>best.weight)best=bin;
        if(best){
          const aim=best.sum/best.weight;
          qa.setAimAngle(aim);
          if(previousAim===null||Math.abs(previousAim-aim)>.003)aimChanges++;
          previousAim=aim;
        }
      }
      let state=__pinballState();
      for(let iteration=0;iteration<9000;iteration++){
        state=__pinballState();
        if(state.phase==="complete"||state.phase==="lost")break;
        const {wave}=state,bricks=qa.allBricks().filter(b=>b.alive);
        if(wave!==beforeWave){
          beforeWave=wave;
          byWave.set(wave,{wave,start:state.elapsed,elapsed:0,remaining:bricks.length,nearDanger:0,closest:null,inDanger:false});
          if(style==="fixed"&&wave===2)qa.setAimAngle(angle);
        }
        const record=byWave.get(wave);
        record.elapsed=state.elapsed-record.start;record.remaining=bricks.length;
        if(bricks.length){
          const gap=state.dangerY-Math.max(...bricks.map(b=>b.y+b.h));
          record.closest=record.closest===null?gap:Math.min(record.closest,gap);
          const near=gap<=32;
          if(near&&!record.inDanger)record.nearDanger++;
          record.inDanger=near;
        }
        if(state.bossDefeats>beforeBosses){
          bossTimes.push({wave,elapsed:state.waveElapsed});
          beforeBosses=state.bossDefeats;
        }
        if(state.phase==="choosing"){
          const choices=state.choiceSet.split(",");
          const id=priority.find(id=>choices.includes(id))||choices[0];
          if(!qa.chooseByKind(id))throw Error("Invalid upgrade "+id);
          picks.push({wave,id});
        }else if(state.phase==="playing"&&(style==="active"||(style==="fixed"&&wave===1)))aimAt(bricks,state);
        advanceGame(9);
      }
      if(state.phase==="lost"&&byWave.has(state.wave)){
        const record=byWave.get(state.wave);record.remaining=state.brickCount;record.elapsed=state.elapsed-record.start;
      }
      return {phase:state.phase,wave:state.wave,elapsed:state.elapsed,remaining:state.brickCount,cleared:state.screenClears,
        bosses:state.bossDefeats,finale:[...new Set([...(state.wave===20?[1]:[]),...qa.exportData().events.filter(e=>e.type==="finale_stage").map(e=>e.to)])],
        aimChanges,peak:state.maxBallsAlive,picks,bossTimes,stats:state.waveReports,
        waves:[...byWave.values()].map(({inDanger,...record})=>record),
        progression:state.choiceHistory.map(({wave,id,after})=>({wave,id,split:after.splitCount,arc:after.arcTargets,
          arcDamage:after.arcDamage,arcSolo:after.arcSolo,shotInterval:after.interval,pressure:after.gunPressure}))};
    })()`);
    reports.push({...scenario,...run});
    console.log(scenario.style,scenario.faction||"start",scenario.seed,run.phase,run.wave,run.cleared,Math.round(run.elapsed));
  }
  await fs.writeFile(output,JSON.stringify({url,reports,errors},null,2)+"\n");
  assert.deepEqual(errors,[]);
  assert.ok(reports.every(run=>["complete","lost"].includes(run.phase)&&run.peak<=48));
  if(mode==="assert"){
    for(const faction of routes){
      const active=reports.filter(run=>run.faction===faction&&run.style==="active");
      assert.ok(active.every(run=>run.phase==="complete"&&run.cleared===20&&run.bosses===2&&run.picks.length===19&&run.finale.join(",")==="1,2,3"),
        "Active route must complete: "+faction);
      const fixed=reports.filter(run=>run.faction===faction&&run.style==="fixed");
      assert.ok(fixed.every(run=>run.picks[0]?.id===faction),"Each held-aim trial installs its actual route");
      assert.ok(fixed.filter(run=>run.phase==="complete").length<=fixed.length/3,
        "Held-aim completion must remain exceptional: "+faction);
      for(const angle of angles){
        assert.ok(fixed.some(run=>run.angle===angle&&run.phase==="lost"),"No fixed lane clears across all seeds");
      }
    }
    assert.ok(reports.filter(run=>run.style==="from-start").every(run=>run.phase==="lost"));
  }
}finally{await close();}
