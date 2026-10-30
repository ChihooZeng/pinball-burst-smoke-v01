'use strict';
// Browser plugin not available in this session. Existing dependency-free CDP
// workflow runs Chrome on macOS; CHROME_BIN can select another local Chromium.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const exe=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port=19327,out=process.env.V27_QA_DIR||path.join(os.tmpdir(),'pinball-v27-qa');fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pinball-v27-browser-'));
const browser=spawn(exe,['--headless=new','--disable-extensions','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
browser.on('error',e=>{console.error(e);process.exitCode=1;});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const json=url=>new Promise((resolve,reject)=>http.get(url,r=>{let data='';r.on('data',x=>data+=x);r.on('end',()=>{try{resolve(JSON.parse(data));}catch(e){reject(e);}});}).on('error',reject));
async function main(){
 let tab;for(let i=0;i<40;i++){try{tab=(await json(`http://127.0.0.1:${port}/json`)).find(t=>t.type==='page');if(tab)break;}catch{}await wait(150);}assert.ok(tab,'Chrome starts');
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
 let seq=0;const pending=new Map(),errors=[],results=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 const click=async selector=>{const r=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));};
 const geometry=async()=>evaluate(`(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,arena:box('.arena'),footer:box('.footer'),cards:[0,1,2].map(i=>box('#choice'+i)),cardOverflow:[0,1,2].map(i=>{const e=document.querySelector('#choice'+i);return e.scrollWidth>e.clientWidth+1;}),overlayScroll:document.querySelector('#choiceOverlay').scrollHeight>document.querySelector('#choiceOverlay').clientHeight+1};})()`);
 await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__PINBALL_TEST__=true;window.__PINBALL_SEED__=2701;'});
 const url=(process.env.V27_BASE_URL||'http://127.0.0.1:8767')+'/compare/hybrid-v27-buildlab/';
 for(const [width,height,family] of [[390,844,'split'],[375,667,'arc'],[320,568,'gun'],[1440,900,'gun']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await send('Page.navigate',{url});await wait(300);
  assert.match(await evaluate('document.title'),/v0.27a/);assert.equal(await evaluate('window.__pinballState().phase'),'ready');
  await shot(`v27-${width}-welcome`);await click('#start');assert.equal(await evaluate('window.__pinballState().phase'),'seeding');
  const entry=await geometry();assert.ok(!entry.overlayScroll,'seed options fit arena');
  await shot(`v27-${width}-seed`);await click('#choice'+['split','arc','gun'].indexOf(family));
  assert.equal(await evaluate('window.__pinballState().phase'),'playing');
  assert.equal(await evaluate('window.__pinballTest.isSoundRunning()'),true,'real gesture unlocks sound');
  for(let i=0;i<60;i++){const q=await evaluate('window.__pinballState()');if(q.elapsed>=3.5&&(family==='split'?q.splitChildren>0:family==='arc'?q.arcReleases>0:q.brickContacts>0))break;await wait(200);}
  await shot(`v27-${width}-playing`);
  const play=await evaluate('window.__pinballState()');assert.ok(play.shotsFired>0&&play.brickContacts>0);
  if(family==='split')assert.ok(play.splitChildren>0,'visible first-wave fission without giant');
  if(family==='arc')assert.ok(play.arcReleases>0,'visible first-wave arc without giant');
  assert.equal(play.skillsUsed,0);
  // Move through the real clear/choice transition four times to inspect branches.
  await evaluate(`window.__pinballTest.configureBuild({${family}:2});true`);
  for(let w=1;w<=4;w++){
   await evaluate('window.__pinballTest.clearWave();true');await wait(60);assert.equal(await evaluate('window.__pinballState().phase'),'choosing');
   if(w<4){await click('#choice0');await wait(1650);}
  }
  const before=await evaluate('window.__pinballState()');await wait(120);assert.equal(await evaluate('window.__pinballState().elapsed'),before.elapsed);
  assert.ok(before.choiceSet.includes(family+'-a')&&before.choiceSet.includes(family+'-b'));
  const layout=await geometry();assert.ok(layout.scrollWidth<=width+1&&layout.scrollHeight<=height+1);
  assert.ok(layout.footer.bottom<=height+1&&!layout.overlayScroll&&!layout.cardOverflow.some(Boolean));
  assert.ok(layout.cards.every(r=>r.x>=layout.arena.x&&r.right<=layout.arena.right&&r.bottom<=layout.arena.bottom));
  await shot(`v27-${width}-branches`);await click('#choice1');assert.equal(await evaluate('window.__pinballState().coreBranch'),family+'-b');
  await wait(1800);const canvas=await evaluate(`(()=>{const r=document.querySelector('#game').getBoundingClientRect();return {x:r.x+r.width*.72,y:r.y+r.height*.6};})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[canvas]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(await evaluate('window.__pinballState().aim')>.2);
  await click('#reset');assert.equal(await evaluate('window.__pinballState().phase'),'seeding');assert.equal(await evaluate('window.__pinballState().coreBranch'),null);
  results.push({width,height,family,layout,playing:{shots:play.shotsFired,contacts:play.brickContacts,splitChildren:play.splitChildren,arcReleases:play.arcReleases,fps:play.fpsNow,physicsMeanMs:play.physicsMeanMs,maxPhysicsMs:play.maxPhysicsMs}});console.log('PASS mobile',width,height,family);
 }
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(out,'v27-mobile-results.json'),JSON.stringify({url,results,errors},null,2));ws.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>browser.kill());
