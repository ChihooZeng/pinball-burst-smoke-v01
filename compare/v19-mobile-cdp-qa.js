"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),http=require("node:http");
const {spawn}=require("node:child_process"),{pathToFileURL}=require("node:url");
const exe="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",PORT=19241;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pinball-v19-cdp-"));
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
 const url=pathToFileURL(path.resolve("hybrid-v19-survival-boss/index.html")).href;
 for(const [width,height,name] of [[390,844,"iphone390"],[375,667,"iphone375"],[320,568,"iphone320"]]){
  await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:true});await send("Page.navigate",{url});await wait(850);
  const m=JSON.parse(await evaljs(`JSON.stringify({viewport:[innerWidth,innerHeight],pageScrollWidth:document.documentElement.scrollWidth,pageScrollHeight:document.documentElement.scrollHeight,bodyScrollHeight:document.body.scrollHeight,canvas:(()=>{const r=document.querySelector('#game').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}})(),arena:(()=>{const r=document.querySelector('.arena').getBoundingClientRect();return {w:r.width,h:r.height}})(),ready:window.__pinballState?.().phase,buttonVisible:(()=>{const r=document.querySelector('#start').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})(),footerBottom:document.querySelector('.footer').getBoundingClientRect().bottom,soundBottom:document.querySelector('.sound-controls').getBoundingClientRect().bottom,top:document.querySelector('.topbar').getBoundingClientRect().top})`));
  const shot=await send("Page.captureScreenshot",{format:"jpeg",quality:78,captureBeyondViewport:false});
  const out=path.resolve(`v19-${name}.jpeg.b64`);fs.writeFileSync(out,shot.data);
  console.log("VIEWPORT",name,JSON.stringify(m),"SCREENSHOT",out,"bytes",shot.data.length);
  if(m.pageScrollWidth>width+1||m.pageScrollHeight>height+1||m.canvas.bottom>height||m.footerBottom>height+1||m.soundBottom>height+1||!m.buttonVisible)throw Error("Not single-screen:"+name);
  if(name==="iphone390"){
   const rect=JSON.parse(await evaljs("JSON.stringify((()=>{const r=document.querySelector('#bossDemo').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})())"));
   await send("Input.dispatchMouseEvent",{type:"mousePressed",x:rect.x,y:rect.y,button:"left",clickCount:1});
   await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:rect.x,y:rect.y,button:"left",clickCount:1});
   await wait(450);
   const x=JSON.parse(await evaljs(`JSON.stringify({phase:window.__pinballState().phase,boss:window.__pinballState().bossActive,hp:window.__pinballState().bossHp,audioRunning:window.__pinballTest.isSoundRunning(),startHidden:document.querySelector('#startOverlay').classList.contains('hidden')})`));
   console.log("BOSS_DEMO_GESTURE",JSON.stringify(x));
   if(x.phase!=="playing"||!x.boss||!x.startHidden||!x.audioRunning)throw Error("Boss demo or audio gesture failed");
   await wait(350);
   const bossShot=await send("Page.captureScreenshot",{format:"jpeg",quality:80,captureBeyondViewport:false});
   fs.writeFileSync(path.resolve("v19-boss-demo.jpeg.b64"),bossShot.data);
  }
 }
 console.log("RUNTIME_EXCEPTIONS",JSON.stringify(exceptions));if(exceptions.length)throw Error(exceptions.join("; "));
 ws.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>browser.kill());
