import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {launchChrome,newPage,sleep} from "./browser.mjs";

const [output,url="http://127.0.0.1:4180/demo/v1/"] = process.argv.slice(2);
const chrome=await launchChrome(9348);
const page=await newPage(9348);
const errors=[];
const retired=["arc","combo","gun_fire","boss_defeated"];
const requests=[];
page.on(event=>{
  if(event.method==="Network.requestWillBeSent")requests.push(event.params.request.url);
});
page.on(event=>{
  if(event.method==="Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.exception?.description);
  if(event.method==="Log.entryAdded"&&event.params.entry.level==="error") errors.push(event.params.entry.text);
});
try {
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.send("Network.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.__PINBALL_TEST__=true;
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination,...rest){
      if(destination instanceof AudioDestinationNode&&!window.pinballMix){
        window.pinballMix=this.context.createMediaStreamDestination();
        connect.call(this,pinballMix);
      }
      return connect.call(this,destination,...rest);
    };
  `});
  await page.viewport(390,844,2,true);
  await page.goto(url);
  assert.equal(await page.eval("PinballGameAudio.getBgmState().state"),"idle");
  await sleep(1150);
  await page.eval(`(()=>{
    window.recording=new MediaRecorder(pinballMix.stream);
    window.chunks=[];
    recording.ondataavailable=event=>chunks.push(event.data);
    recording.start();
  })()`);
  const start=await page.eval(`(()=>{const b=document.querySelector('#start').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  await page.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[start]});
  await page.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await sleep(2200);
  const mix=await page.eval("(()=>({s:PinballGameAudio.getState(),b:PinballGameAudio.getBgmState()}))()");
  assert.equal(mix.s.contextState,"running");
  assert.equal(mix.b.elements.loop.paused,false);
  assert.ok(mix.b.elements.loop.currentTime>.1);
  assert.equal(mix.s.selected.brick_hit,"v5-wood-thud");
  assert.ok(mix.s.plays.ui_start>0);
  assert.ok(mix.s.plays.brick_break>0);
  await page.eval(`(()=>{
    const qa=__pinballTest;document.querySelector("#bossRoute").value="gun";qa.jumpToBoss10();
    qa.configureBuild({gun:3},"gun-b");qa.fire();qa.chargeFully();return qa.fireGiant();
  })()`);
  await sleep(400);
  await page.eval(`(()=>{
    const qa=__pinballTest;
    qa.jumpToBoss10();
    qa.setTestField([{x:138,y:142,w:84,h:53,hp:3,isBoss:true},{x:12,y:250,hp:6}]);
    qa.injectGiantAt(180,300,0,-610);
  })()`);
  for(let i=0;i<20;i++){
    if(await page.eval("!!PinballGameAudio.getState().plays.clear_upgrade"))break;
    await sleep(250);
  }
  const state=await page.eval("PinballGameAudio.getState()");
  for(const id of ["giant","clear_upgrade"])assert.ok(state.plays[id]>0,JSON.stringify({id,plays:state.plays,loaded:state.loaded,errors, snapshot:await page.eval("(()=>{const {phase,elapsed,bossDefeats,screenClears,brickCount}=__pinballState();return {phase,elapsed,bossDefeats,screenClears,brickCount,events:__pinballTest.exportData().events.slice(-8)};})()")}));
  await page.eval("document.querySelector('#pause').click()");
  const paused=await page.eval("PinballGameAudio.getBgmState().elements.loop");
  assert.equal(paused.paused,true);
  const events=await page.eval("PinballGameAudio.EVENT_IDS");
  assert.equal(events.length,10);
  const silence=await page.eval(`(() => {
    const engine=PinballGameAudio;
    return ${JSON.stringify(retired)}.map(id=>{
      const handled=engine.play(id);
      return {id,handled,played:engine.getState().plays[id]||0,loaded:engine.hasBuffer(id)};
    });
  })()`);
  for(const result of silence)assert.deepEqual(result,{id:result.id,handled:true,played:0,loaded:false});
  for(let i=0;i<40;i++){
    if(await page.eval("PinballGameAudio.EVENT_IDS.every(id=>PinballGameAudio.hasBuffer(id))"))break;
    await sleep(100);
  }
  assert.equal(await page.eval("PinballGameAudio.EVENT_IDS.every(id=>PinballGameAudio.hasBuffer(id))"),true);
  const cooldown=await page.eval("Math.max(...Object.values(PinballGameAudio.EVENTS).map(event=>event.cooldown))");
  await sleep(cooldown+50);
  const cueDeltas=await page.eval(`(() => {
    const audio=PinballGameAudio,before=audio.getState().plays;
    for(const id of audio.EVENT_IDS) __pinballTest.playSfx(id);
    const after=audio.getState().plays;
    return Object.fromEntries(audio.EVENT_IDS.map(id=>[id,(after[id]||0)-(before[id]||0)]));
  })()`);
  assert.deepEqual(cueDeltas,Object.fromEntries(events.map(id=>[id,1])));
  await page.eval(`(() => {
    const slider=document.querySelector("#soundVolume");
    slider.value=51;
    slider.dispatchEvent(new Event("input",{bubbles:true}));
  })()`);
  assert.equal(await page.eval("PinballGameAudio.getState().master"),.51);
  const before=await page.eval("PinballGameAudio.getState().plays.brick_hit");
  await page.eval("document.querySelector('#mute').click();__pinballTest.playSfx('hit')");
  const muted=await page.eval("PinballGameAudio.getState()");
  assert.equal(muted.masterMuted,true);
  assert.equal(muted.plays.brick_hit||0,before);
  assert.equal((await page.eval("PinballGameAudio.getBgmState()")).elements.loop.muted,true);
  const captured=await page.eval(`new Promise(resolve=>{
    recording.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:recording.mimeType}));};
    recording.stop();
  })`);
  if(output) await fs.writeFile(output,Buffer.from(captured,"base64"));
  assert.ok(Buffer.from(captured,"base64").length>2048);
  await page.goto(url);
  assert.equal(await page.eval("document.querySelector('#mute').checked"),true);
  assert.deepEqual(errors,[]);
  assert.equal(await page.eval("Number(document.querySelector('#soundVolume').value)"),51);
  assert.ok(!requests.some(url=>/arc-b0[1-6]|combo-chime|cannon-feed|core-break/.test(url)));
  console.log(JSON.stringify({cueDeltas,silence,errors}));
  console.log("PASS real first-touch playback, all mapped SFX, BGM pause, volume, mute, persistence and capture");
} finally {
  await page.close();
  chrome.kill();
}
