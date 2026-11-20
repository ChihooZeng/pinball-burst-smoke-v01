import fs from "node:fs";
import assert from "node:assert/strict";
import {launchChrome,newPage,sleep} from "./browser.mjs";

const arg=(k,d)=>{const i=process.argv.indexOf("--"+k);return i>0?process.argv[i+1]:d;};
const VW=+arg("vw",360), VH=+arg("vh",640), DPR=+arg("dpr",2);
const SEED=+arg("seed",20261118);
const LABEL=arg("label","run");
const FACTION=arg("faction","split");
const MAXMIN=+arg("minutes",30);
const TOUCH=arg("touch","0")==="1";
const SHOTS=arg("shots","1")==="1";
const PORT=+arg("port",9342), URL=arg("url","http://127.0.0.1:4178/demo/v1/");
const OUTDIR=arg("out",process.cwd());
fs.mkdirSync(OUTDIR,{recursive:true});

const chrome=await launchChrome(PORT);
const p=await newPage(PORT);
const errors=[],warns=[];
p.on(m=>{
  if(m.method==="Runtime.exceptionThrown")errors.push((m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text||"").split("\n").slice(0,3).join(" | "));
  if(m.method==="Log.entryAdded"){const e=m.params.entry;if(e.level==="error")errors.push("console.error: "+e.text);}
});

await p.send("Page.enable");await p.send("Runtime.enable");await p.send("Log.enable");await p.send("Performance.enable");
await p.send("Page.addScriptToEvaluateOnNewDocument",{source:
  `window.__PINBALL_TEST__=true;window.__PINBALL_SEED__=${SEED};`+
  `window.__frames={n:0,maxGap:0,last:performance.now(),long:0};`+
  `(function tick(){const now=performance.now();const g=now-window.__frames.last;`+
  `if(g>0){if(g>window.__frames.maxGap)window.__frames.maxGap=g;if(g>50)window.__frames.long++;window.__frames.n++;}`+
  `window.__frames.last=now;requestAnimationFrame(tick);})();`});
await p.viewport(VW,VH,DPR,TOUCH);
await p.goto(URL);
await sleep(600);

// Read-only coupling: keep a brick-layout reader, then drop the mutable QA hooks entirely.
await p.eval(`window.__ro={layout:__pinballTest.brickLayout};delete window.__pinballTest;typeof window.__pinballTest`);
const hooksGone=await p.eval(`typeof window.__pinballTest`);
console.log("qa hooks removed:",hooksGone);

const S=`(()=>{const s=__pinballState();return {phase:s.phase,bootFailed:window.PinballBoot?.failed===true,wave:s.wave,elapsed:+s.elapsed.toFixed(2),
 brick:s.brickCount,bossActive:s.bossActive,bossHp:s.bossHp,finaleStage:s.finaleStage,bossDefeats:s.bossDefeats,
 charge:Math.round(s.charge),balls:s.activeBalls,giant:s.giantActive,fps:s.fpsNow,q:s.renderQuality,
 physMean:+(s.physicsMeanMs||0).toFixed(3),physMax:+(s.maxPhysicsMs||0).toFixed(2),
 score:s.score,clears:s.screenClears,choice:s.choiceSet,aim:+s.aim.toFixed(3),level:s.level,
 skillsUsed:s.skillsUsed,giantHits:s.giantHits,bossSummon:s.bossSummonTotal,summonWarn:s.summonWarningCount,
 worldHeight:s.worldHeight,shooterY:s.shooterY,dangerY:s.dangerY,ranks:s.ranks,
 remainingHp:s.remainingHp,maxBallsEver:s.maxBallsAlive,label:document.getElementById('winLabel').textContent};})()`;
const LAYOUT=`(()=>{const c=document.querySelector('#game').getBoundingClientRect();const l=__ro.layout();
 return {rect:{l:c.left,t:c.top,w:c.width,h:c.height},bricks:l.filter(b=>b.alive).map(b=>({x:b.x,y:b.y,w:b.w,h:b.h}))};})()`;

async function clickAt(x,y){
  if(TOUCH){
    await p.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
    await p.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    return;
  }
  await p.send("Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",clickCount:1});
  await p.send("Input.dispatchMouseEvent",{type:"mouseReleased",x,y,button:"left",clickCount:1});
}
async function clickEl(sel){
  const r=await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,h:b.height};})()`);
  if(!r)return null;
  await clickAt(r.x,r.y);return r;
}

// ---- start the run through the real start button ----
const startBtn=await clickEl("#start");
console.log("start clicked",JSON.stringify(startBtn));
await sleep(400);

const POLICY=arg("policy","faction");
const PRIORITY=POLICY==="damage"
  ? [FACTION,"power","rate","speed","life",FACTION+"-a",FACTION+"-b","split","arc","gun","shock","drill","hunter","bank"]
  : [FACTION,FACTION+"-a",FACTION+"-b","power","rate","speed","life","split","arc","gun","shock","drill","hunter","bank"];
const log={label:LABEL,viewport:[VW,VH],dpr:DPR,seed:SEED,faction:FACTION,input:TOUCH?"touch":"pointer",started:new Date().toISOString(),
  qaHooksAfterSetup:hooksGone,picks:[],waves:[],samples:[],shots:[],errors,choiceSets:[]};
let lastWave=0,lastPhase="",waveStart=0,shotIdx=0,lastState=null;
const t0=Date.now();
let memPrev=null,memSeries=[];

function chooseIdx(set){
  const ids=String(set||"").split(",").filter(Boolean);
  for(const want of PRIORITY){const i=ids.indexOf(want);if(i>=0)return i;}
  return 0;
}
async function shot(tag){
  if(!SHOTS)return;
  const f=OUTDIR+`/${LABEL}-${String(shotIdx++).padStart(2,"0")}-${tag}.png`;
  await p.shot(f);log.shots.push(f.split("/").pop());
}

let stopReason=null;
while(Date.now()-t0<MAXMIN*60000){
  const s=await p.eval(S).catch(()=>null);
  if(!s){await sleep(300);continue;}
  lastState=s;
  // wave bookkeeping
  if(s.wave!==lastWave){
    if(lastWave)log.waves.push({wave:lastWave,seconds:+((Date.now()-waveStart)/1000).toFixed(1),phase:lastPhase});
    lastWave=s.wave;waveStart=Date.now();
    console.log(`wave ${s.wave} start (elapsed ${s.elapsed}s)`);
    if([1,5,10,20].includes(s.wave))await shot(`wave${s.wave}-start`);
  }
  if(s.phase==="choosing"&&lastPhase!=="choosing"){
    const idx=chooseIdx(s.choice);
    log.choiceSets.push({wave:s.wave,set:s.choice,pick:String(s.choice||"").split(",")[idx]});
    await sleep(240);
    const r=await clickEl(`#choice${idx}`);
    log.picks.push({wave:s.wave,pick:String(s.choice||"").split(",")[idx],clicked:!!r});
    console.log(`  choice w${s.wave}: [${s.choice}] -> ${String(s.choice||"").split(",")[idx]} (clicked ${!!r})`);
    await sleep(260);
    lastPhase=s.phase;
    continue;
  }
  if(s.bootFailed){stopReason="runtime_failure";break;}
  if(s.phase==="complete"||s.phase==="lost"){stopReason=s.phase;console.log("GAME END:",s.phase,"wave",s.wave);break;}
  if(s.phase==="playing"){
    const lay=await p.eval(LAYOUT).catch(()=>null);
    if(lay&&lay.bricks.length){
      const target=pickTarget(lay,s);
      if(target){
        const cx=lay.rect.l+target.x* (lay.rect.w/360);
        await clickAt(cx, lay.rect.t+lay.rect.h*0.55);
        if(Date.now()%4000<200)await sleep(1);
      }
    }
  }
  if(s.wave===10&&s.bossActive&&lastPhase==="playing"&&!log.boss10Shot){log.boss10Shot=true;await shot("boss10");}
  if(s.wave===20&&s.bossActive&&!log.boss20Shot){log.boss20Shot=true;await shot("boss20");}
  if(s.wave===20&&s.finaleStage&&s.finaleStage!==log.finaleSeen){log.finaleSeen=s.finaleStage;(log.finaleStages??=[]).push(s.finaleStage);await shot("finale-stage"+s.finaleStage);}
  lastPhase=s.phase;
  await sleep(140);
}

// final capture
if(SHOTS){
  await sleep(500);
  await shot("final-"+ (stopReason||"timeout"));
}
const finalState=await p.eval(S).catch(()=>null);
log.final=finalState;log.stopReason=stopReason;log.wallSeconds=+((Date.now()-t0)/1000).toFixed(1);
log.errors=errors;
fs.writeFileSync(`${OUTDIR}/play-${LABEL}.json`,JSON.stringify(log,null,1));
console.log("RESULT",JSON.stringify({label:LABEL,stopReason,wave:finalState?.wave,phase:finalState?.phase,
  score:finalState?.score,errors:errors.length,wall:log.wallSeconds,picks:log.picks.length,
  waveSummary:log.waves.slice(0,30)}).slice(0,1200));
await p.close();
chrome.kill();
assert.equal(hooksGone,"undefined");
assert.deepEqual(errors,[]);
assert.equal(stopReason,"complete","the route must complete all 20 waves");
assert.equal(finalState.clears,20);
assert.equal(log.picks[0]?.pick,FACTION,"the requested route must be deliberately chosen first");
assert.equal(finalState.ranks[FACTION],5,"the requested route must reach mastery");
assert.equal(finalState.bossDefeats,2);
assert.deepEqual(log.finaleStages,[1,2,3]);

function pickTarget(lay,st){
  const W=360,H=st.worldHeight||640;
  const sx=180, sy=(st.shooterY||H-37);
  const bins=new Map();
  for(const b of lay.bricks){
    const cx=b.x+b.w/2, cy=b.y+b.h/2;
    let a=Math.atan2(cx-sx,sy-cy);
    if(a<-1.08)a=-1.08; if(a>1.08)a=1.08;
    const key=Math.round(a/0.05);
    const depth=(b.y+b.h)/H;
    const urgency=1+3*Math.max(0,1-(st.dangerY-b.y-b.h)/38);
    const w=urgency*(0.5+1.6*depth)*(b.w>40?1.6:1);
    const cur=bins.get(key)||{w:0,sum:0,n:0};
    cur.w+=w;cur.sum+=a;cur.n++;
    bins.set(key,cur);
  }
  let best=null;
  for(const [k,v] of bins) if(!best||v.w>best.w) best={k,...v};
  if(!best)return null;
  return {angle:best.sum/best.n,x:180+(best.sum/best.n/1.08)*180};
}
