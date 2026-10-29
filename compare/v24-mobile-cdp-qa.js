"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),http=require("node:http");
const {spawn}=require("node:child_process"),{pathToFileURL}=require("node:url");
const exe="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",PORT=19274;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pinball-v24-cdp-"));
const browser=spawn(exe,["--headless=new","--disable-extensions","--no-first-run","--disable-background-networking",
 `--remote-debugging-port=${PORT}`,`--user-data-dir=${dir}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function json(url){return new Promise((resolve,reject)=>http.get(url,r=>{let s="";r.on("data",x=>s+=x);r.on("end",()=>{try{resolve(JSON.parse(s))}catch(e){reject(e)}})}).on("error",reject))}
async function main(){
 let tab;for(let i=0;i<35;i++){try{tab=(await json("http://127.0.0.1:"+PORT+"/json")).find(t=>t.type==="page");if(tab)break}catch(_){}await wait(200)}
 if(!tab)throw Error("Edge CDP failed");
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
 let seq=0;const pending=new Map(),exceptions=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)}if(m.method==="Runtime.exceptionThrown")exceptions.push(m.params?.exceptionDetails?.text||"exception")};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
 const evaljs=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value};
 await send("Page.enable");await send("Runtime.enable");await send("Page.addScriptToEvaluateOnNewDocument",{source:"window.__PINBALL_TEST__=true"});
 const url=pathToFileURL(path.resolve("hybrid-v24-bridge-flow/index.html")).href;
 for(const [width,height,name] of [[390,844,"iphone390"],[375,667,"iphone375"],[320,568,"iphone320"]]){
  await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:true});await send("Page.navigate",{url});await wait(850);
  const m=JSON.parse(await evaljs(`JSON.stringify({viewport:[innerWidth,innerHeight],pageScrollWidth:document.documentElement.scrollWidth,pageScrollHeight:document.documentElement.scrollHeight,bodyScrollHeight:document.body.scrollHeight,canvas:(()=>{const r=document.querySelector('#game').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}})(),arena:(()=>{const r=document.querySelector('.arena').getBoundingClientRect();return {w:r.width,h:r.height}})(),ready:window.__pinballState?.().phase,buttonVisible:(()=>{const r=document.querySelector('#start').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})(),footerBottom:document.querySelector('.footer').getBoundingClientRect().bottom,soundBottom:document.querySelector('.sound-controls').getBoundingClientRect().bottom,top:document.querySelector('.topbar').getBoundingClientRect().top})`));
  const shot=await send("Page.captureScreenshot",{format:"jpeg",quality:78,captureBeyondViewport:false});
  const out=path.resolve(`v24-${name}.jpeg.b64`);fs.writeFileSync(out,shot.data);
  console.log("VIEWPORT",name,JSON.stringify(m),"SCREENSHOT",out,"bytes",shot.data.length);
  if(m.pageScrollWidth>width+1||m.pageScrollHeight>height+1||m.canvas.bottom>height||m.footerBottom>height+1||m.soundBottom>height+1||!m.buttonVisible)throw Error("Not single-screen:"+name);
  if(name==="iphone390"){
   await wait(2200);
   console.log("READY_FPS",await evaljs("window.__pinballState().fpsNow"));
   await evaljs("document.querySelector('#start').click();true");
   await wait(10500);
   const normalState=JSON.parse(await evaljs("JSON.stringify({phase:window.__pinballState().phase,time:window.__pinballState().elapsed,bursts:window.__pinballState().ambientSummonBursts,tiles:window.__pinballState().ambientSummonTiles,warning:window.__pinballState().ambientSummonWarningCount,overlap:window.__pinballState().overlapSummonCount,bricks:window.__pinballState().brickCount,overlapPairs:window.__pinballTest.overlapPairs()})"));
   console.log("NORMAL_SUMMON_RUNTIME",JSON.stringify(normalState));
   if(normalState.phase!=="playing"||normalState.bursts<1||normalState.tiles<1||normalState.overlapPairs!==0)throw Error("Normal survival mode did not materialize an ambient summon");
   const normalShot=await send("Page.captureScreenshot",{format:"jpeg",quality:82,captureBeyondViewport:false});
   fs.writeFileSync(path.resolve("v24-normal-summon.jpeg.b64"),normalShot.data);
   await send("Page.navigate",{url});await wait(850);
   const rect=JSON.parse(await evaljs("JSON.stringify((()=>{const r=document.querySelector('#bossDemo').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})())"));
   await send("Input.dispatchMouseEvent",{type:"mousePressed",x:rect.x,y:rect.y,button:"left",clickCount:1});
   await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:rect.x,y:rect.y,button:"left",clickCount:1});
   await wait(150);
   const warningCount=await evaljs("window.__pinballState().summonWarningCount");
   console.log("BOSS_TELEGRAPH",warningCount);
   if(warningCount<1)throw Error("Boss summon should show warning outlines before materializing");
   const telegraph=await send("Page.captureScreenshot",{format:"jpeg",quality:82,captureBeyondViewport:false});
   fs.writeFileSync(path.resolve("v24-boss-telegraph.jpeg.b64"),telegraph.data);
   await wait(1160);
   const materialized=await send("Page.captureScreenshot",{format:"jpeg",quality:82,captureBeyondViewport:false});
   fs.writeFileSync(path.resolve("v24-boss-materialized.jpeg.b64"),materialized.data);
   const x=JSON.parse(await evaljs(`JSON.stringify({phase:window.__pinballState().phase,boss:window.__pinballState().bossActive,hp:window.__pinballState().bossHp,audioRunning:window.__pinballTest.isSoundRunning(),startHidden:document.querySelector('#startOverlay').classList.contains('hidden')})`));
   console.log("BOSS_DEMO_GESTURE",JSON.stringify(x));
   await wait(3200);
   const perf=JSON.parse(await evaljs("JSON.stringify({fps:window.__pinballState().fpsNow,physicsHz:window.__pinballState().physicsHz,quality:window.__pinballState().renderQuality,gameTime:window.__pinballState().elapsed,bricks:window.__pinballState().brickCount})"));
   console.log("RUNTIME_PERF",JSON.stringify(perf));
   if(perf.physicsHz!==120)throw Error("Fixed physics not 120Hz");
   await evaljs("document.querySelector('#impactMode').value='off';document.querySelector('#impactMode').dispatchEvent(new Event('change',{bubbles:true}));true");
   await wait(1900);
   console.log("NO_FX_PERF",await evaljs("window.__pinballState().fpsNow"));
   if(x.phase!=="playing"||!x.boss||!x.startHidden||!x.audioRunning)throw Error("Boss demo or audio gesture failed");
   await wait(350);
   const bossShot=await send("Page.captureScreenshot",{format:"jpeg",quality:80,captureBeyondViewport:false});
   fs.writeFileSync(path.resolve("v24-boss-demo.jpeg.b64"),bossShot.data);
   await evaljs("document.querySelector('#reset').click();true");
   await wait(120);
   await evaljs("window.__pinballTest.removeNormalBricks();true");
   await wait(820);
   const preview=JSON.parse(await evaljs("JSON.stringify({preview:window.__pinballState().clearPreviewCount,physical:window.__pinballState().brickCount,clears:window.__pinballState().screenClears})"));
   console.log("CLEAR_PREVIEW_RUNTIME",JSON.stringify(preview));
   if(preview.preview<65||preview.physical!==0)throw Error("Clear preview should be visible without physical bricks");
   const warningShot=await send("Page.captureScreenshot",{format:"jpeg",quality:82,captureBeyondViewport:false});
   fs.writeFileSync(path.resolve("v24-clear-preview.jpeg.b64"),warningShot.data);
   await wait(1050);
   const clearState=JSON.parse(await evaljs("JSON.stringify({phase:window.__pinballState().phase,clears:window.__pinballState().screenClears,burst:window.__pinballState().clearBurstCount,tiles:window.__pinballState().clearBurstTiles,bricks:window.__pinballState().brickCount})"));
   console.log("CLEAR_BURST_RUNTIME",JSON.stringify(clearState));
   if(clearState.clears!==1||clearState.burst!==1||clearState.tiles!==78)throw Error("Clear burst did not spawn the expected dense mid-field mass");
   const clearShot=await send("Page.captureScreenshot",{format:"jpeg",quality:82,captureBeyondViewport:false});
   fs.writeFileSync(path.resolve("v24-clear-burst.jpeg.b64"),clearShot.data);
  }
 }
 console.log("RUNTIME_EXCEPTIONS",JSON.stringify(exceptions));if(exceptions.length)throw Error(exceptions.join("; "));
 ws.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>browser.kill());
