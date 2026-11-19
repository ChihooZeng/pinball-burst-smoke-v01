import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {launchChrome,newPage,sleep} from "./browser.mjs";

const [output,url="http://127.0.0.1:4180/demo/v1/"] = process.argv.slice(2);
const chrome=await launchChrome(9349);
const page=await newPage(9349);
const errors=[];
const samples=[];
page.on(event=>{
  if(event.method==="Runtime.exceptionThrown")errors.push(event.params.exceptionDetails.exception?.description);
  if(event.method==="Log.entryAdded"&&event.params.entry.level==="error")errors.push(event.params.entry.text);
});
async function until(expression,ms=5000){
  for(let start=Date.now();Date.now()-start<ms;){
    if(await page.eval(expression))return;
    await sleep(100);
  }
  assert.fail("Timed out: "+expression);
}
async function metrics(label,ms=3500){
  await page.eval(`(()=>{
    window.frameTimes=[];
    let last=performance.now();
    const tick=now=>{frameTimes.push(now-last);last=now;if(frameTimes.length<600)requestAnimationFrame(tick);};
    requestAnimationFrame(tick);
  })()`);
  const at=Date.now();
  await sleep(ms);
  const sample=await page.eval(`(()=>{
    const times=frameTimes.slice(1).sort((a,b)=>a-b), state=__pinballState();
    return {frames:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],
      max:times.at(-1),over50:times.filter(ms=>ms>50).length,renderQuality:state.renderQuality,
      balls:state.activeBalls,peakBalls:state.maxBallsAlive,bricks:state.brickCount,physicsMeanMs:state.physicsMeanMs};
  })()`);
  samples.push({label,...sample,wallMs:Date.now()-at});
  assert.ok(sample.p95<40,label+" frame interval");
  assert.ok(sample.peakBalls<=48&&sample.bricks<=168,label+" object caps");
}
async function heap(){
  await page.send("HeapProfiler.collectGarbage");
  const {metrics}=await page.send("Performance.getMetrics");
  return metrics.find(metric=>metric.name==="JSHeapUsedSize").value;
}
try{
  await page.send("Page.enable");await page.send("Runtime.enable");await page.send("Log.enable");
  await page.send("Performance.enable");await page.send("HeapProfiler.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.__PINBALL_TEST__=true;window.__PINBALL_SEED__=20261118;
    const draw=CanvasRenderingContext2D.prototype.roundRect;
    CanvasRenderingContext2D.prototype.roundRect=function(...args){
      if(window.failNextDraw){window.failNextDraw=false;throw Error("intentional canvas fault");}
      return draw.apply(this,args);
    };
  `});
  for(const [width,height] of [[360,640],[390,844],[1440,920]]){
    await page.viewport(width,height,2,width<500);
    await page.goto(url);
    await page.eval("__pinballTest.begin();__pinballTest.spawnWave(19);__pinballTest.fillBallBudget()");
    if(width<500){
      const expected=[2*width,2*height];
      assert.deepEqual(await page.eval("(()=>{const c=document.querySelector('#game');return [c.width,c.height]})()"),expected);
    }
    await metrics(`dense-${width}x${height}`);
  }
  await page.viewport(360,640,2,true);
  await page.goto(url);
  await page.eval("__pinballTest.jumpToBoss10();__pinballTest.fillBallBudget()");
  await metrics("boss10-360x640");
  await page.eval(`(()=>{
    const qa=__pinballTest;qa.jumpToBoss10();
    qa.setTestField([{x:138,y:142,w:84,h:53,hp:3,isBoss:true},{x:12,y:250,hp:6}]);
    qa.injectGiantAt(180,300,0,-610);
  })()`);
  await until("__pinballState().phase==='choosing'");
  assert.equal(await page.eval("__pinballState().bossDefeats"),1);
  assert.equal(await page.eval("__pinballState().giantActive"),false);
  await page.eval("document.querySelector('#choice0').click()");
  await until("__pinballState().wave===11");
  await page.eval(`Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))`);
  const paused=await page.eval("__pinballState()");
  await sleep(330);
  assert.equal(await page.eval("__pinballState().elapsed"),paused.elapsed);
  assert.equal(paused.phase,"paused");
  await page.eval(`delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));document.querySelector('#resume').click()`);
  await until("__pinballState().elapsed>"+(paused.elapsed+.1));
  await page.viewport(360,665,2,true);
  assert.equal(await page.eval("__pinballState().phase"),"playing");
  const before=await heap();
  for(let count=0;count<10;count++){
    await page.eval("document.querySelector('#reset').click()");
    await sleep(60);
    assert.equal(await page.eval("__pinballState().wave"),1);
    assert.equal(await page.eval("__pinballState().score"),0);
  }
  const after=await heap();
  assert.ok(after-before<2_000_000,"heap after ten restarts");
  assert.deepEqual(errors,[]);
  await page.eval("window.failNextDraw=true");
  await until("PinballBoot.failed");
  assert.equal(await page.eval("document.querySelector('#errorOverlay').classList.contains('hidden')"),false);
  await page.eval("document.querySelector('#recover').click()");
  await until("!PinballBoot.failed && __pinballState().phase==='ready'");
  await page.eval("document.querySelector('#start').click()");
  await until("__pinballState().elapsed>.2");
  console.log(JSON.stringify({samples,heap:{before,after},syntheticDrawRecovery:true,bossGiantRegression:true},null,2));
  if(output)await fs.writeFile(output,JSON.stringify({samples,heap:{before,after}},null,2));
}finally{
  await page.close();chrome.kill();
}
