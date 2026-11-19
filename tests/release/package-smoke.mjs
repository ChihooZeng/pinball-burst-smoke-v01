import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {launchChrome,newPage,sleep} from "./browser.mjs";

const [root="http://127.0.0.1:4181/",out,port="9351"]=process.argv.slice(2);
const chrome=await launchChrome(Number(port));
const page=await newPage(Number(port));
const requests=new Map(),responses=[],errors=[],audioFetches=new Set();
let peakAudioFetches=0;
page.on(({method,params})=>{
  if(method==="Network.requestWillBeSent"){
    requests.set(params.requestId,params.request.url);
    if(params.type==="Fetch"&&new URL(params.request.url).pathname.endsWith(".wav")){
      audioFetches.add(params.requestId);
      peakAudioFetches=Math.max(peakAudioFetches,audioFetches.size);
    }
  }
  if(method==="Network.loadingFinished"||method==="Network.loadingFailed")audioFetches.delete(params.requestId);
  if(method==="Network.responseReceived"){
    const {status,url,mimeType}=params.response;
    responses.push({status,url,mimeType});
    if(status>=400)errors.push({status,url});
  }
  if(method==="Network.loadingFailed"&&!params.canceled){
    errors.push({url:requests.get(params.requestId),error:params.errorText});
  }
  if(method==="Runtime.exceptionThrown")errors.push(params.exceptionDetails.text);
  if(method==="Log.entryAdded"&&params.entry.level==="error")errors.push(params.entry.text);
});

async function until(expression){
  const deadline=Date.now()+12000;
  while(Date.now()<deadline){
    if(await page.eval(expression))return;
    await sleep(100);
  }
  assert.fail("Timed out: "+expression+" "+JSON.stringify(errors));
}

async function tap(selector,xFraction=.5,yFraction=.5){
  const point=await page.eval(`(()=>{
    const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return {x:box.left+box.width*${xFraction},y:box.top+box.height*${yFraction}};
  })()`);
  await page.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
  await sleep(80);
  await page.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
}

const mediaExpression=`(()=>{
  const media=document.querySelector("audio[data-bgm=loop]");
  if(!media)return null;
  const {currentTime,duration,readyState,paused,muted}=media;
  return {currentTime,duration,readyState,paused,muted,error:media.error?.code??null};
})()`;

try {
  for(const domain of ["Page","Runtime","Log","Network"])await page.send(domain+".enable");
  await page.viewport(390,844,2,true);
  await page.goto(root);
  await until("window.PinballBoot?.failed===false && document.querySelector('#start')?.disabled===false");
  assert.equal(await page.eval("location.href"),new URL("demo/v1/",root).href);
  const title=await page.eval("document.title");
  assert.match(title,/弹珠超载|Marble Overload/);
  assert.equal(await page.eval("typeof window.__pinballTest"),"undefined");
  assert.equal(await page.eval("document.querySelector('#errorOverlay').classList.contains('hidden')"),true);
  assert.equal(await page.eval("document.querySelector('[data-analytics-option]').hidden"),true);
  assert.equal(await page.eval("AdBridge.status"),"disabled");
  if(out)await page.shot(path.join(out,"package-home.png"));
  await until("PinballGameAudio.hasBuffer('ui_start')");
  await tap("#start");
  await until("__pinballState().phase==='playing'");
  await tap("#game",.74,.48);
  await until("__pinballState().aim > .2 && __pinballState().brickContacts>0");
  await until("document.querySelector('audio[data-bgm=loop]')?.currentTime>.15");
  await until("PinballGameAudio.EVENT_IDS.every(id=>PinballGameAudio.hasBuffer(id))");
  await until("(()=>{const {plays}=PinballGameAudio.getState();return plays.brick_hit>0||plays.brick_break>0;})()");
  const playing=await page.eval(mediaExpression);
  const sound=await page.eval("PinballGameAudio.getState()");
  assert.equal(playing.paused,false);
  assert.equal(playing.error,null);
  assert.ok(playing.readyState>=2&&playing.duration>200);
  assert.equal(sound.contextState,"running");
  assert.equal(sound.errors,0);
  const battle=await page.eval("(({wave,aim,shotsFired,brickContacts})=>({wave,aim,shotsFired,brickContacts}))(__pinballState())");
  if(out)await page.shot(path.join(out,"package-playing.png"));
  await tap("#pause");
  await until("__pinballState().phase==='paused'");
  assert.ok((await page.eval("PinballGameAudio.getState()")).plays.ui_click>0);
  assert.match(await page.eval("document.querySelector('.bgm-credit').textContent"),/Cut and Run.+CC BY 4\.0/);
  const paused=await page.eval(mediaExpression);
  assert.equal(paused.paused,true);
  await sleep(250);
  assert.equal((await page.eval(mediaExpression)).currentTime,paused.currentTime);
  await tap("#mute");
  assert.equal((await page.eval(mediaExpression)).muted,true);
  await tap("#resume");
  await until(`document.querySelector('audio[data-bgm=loop]').currentTime>${paused.currentTime+.1}`);
  const resumed=await page.eval(mediaExpression);
  assert.equal(resumed.paused,false);
  assert.equal(resumed.muted,true);
  assert.equal(await page.eval("PinballGameAudio.getBgmState().errors"),0);
  await page.goto(new URL("demo/v1/privacy.html",root).href);
  await until("!!document.querySelector('article:not([hidden]) h1')");
  assert.match(await page.eval("document.title"),/隐私|Privacy/);
  assert.ok(responses.some(({url,status})=>url.includes("bgm-cut-and-run-80k.m4a")&&[200,206].includes(status)));
  assert.equal([...requests.values()].some(url=>new URL(url).pathname==="/api/events"),false);
  assert.ok(peakAudioFetches>0&&peakAudioFetches<=3,`peak concurrent WAV requests: ${peakAudioFetches}`);
  assert.deepEqual(errors,[]);
  const result={root,title,battle,playing,paused,resumed,loadedSoundCount:sound.loaded.length,playedCues:sound.plays,peakAudioFetches,responses,errors};
  if(out)await writeFile(path.join(out,"package-smoke.json"),JSON.stringify(result,null,2),{flag:"wx"});
  console.log(JSON.stringify(result,null,2));
}finally{
  await page.close();
  chrome.kill();
}
