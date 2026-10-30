const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),out=[];
 for(const [w,h] of [[320,568],[375,667],[390,844],[1440,900]]){
  const context=await browser.newContext({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<500});
  await context.addInitScript(()=>{window.__PINBALL_TEST__=true;window.__PINBALL_SEED__=2701;});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('requestfailed',r=>errors.push(r.url()+':'+r.failure().errorText));
  await p.goto('http://127.0.0.1:8771/compare/hybrid-v1-m1/');assert.match(await p.title(),/M1/);assert.ok(await p.locator('#startTitle').isVisible());
  await p.locator('#start').click();await p.locator('#choice'+(w===320?2:w===375?1:0)).click();await p.waitForTimeout(800);
  assert.equal(await p.evaluate(()=>window.__pinballState().phase),'playing');
  await p.locator('#pause').click();const t=await p.evaluate(()=>window.__pinballState().elapsed);await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>window.__pinballState().elapsed),t);
  await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'exportRun');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'resume');assert.equal(await p.evaluate(()=>document.querySelector('.topbar').inert),true);
  assert.ok((await p.locator('#buildStats').textContent()).includes('撞击伤害 2'));await p.locator('summary').click();
  await p.screenshot({path:`/tmp/pinball-m1-${w}-pause.png`});
  await p.locator('#resume').click();await p.evaluate(()=>window.__pinballTest.clearWave());await p.waitForFunction(()=>window.__pinballState().phase==='choosing');
  await p.screenshot({path:`/tmp/pinball-m1-${w}-choice.png`});
  const choiceCards=await p.locator('.upgrade-card').allTextContents();assert.ok(choiceCards.every(s=>!s.includes('0.012')));
  await p.locator('#pause').click();await p.locator('#resume').click();assert.equal(await p.evaluate(()=>window.__pinballState().phase),'choosing');await p.locator('#choice0').click();await p.waitForTimeout(1700);
  const box=await p.locator('canvas').boundingBox();await p.dispatchEvent('canvas','pointerdown',{pointerId:1,clientX:box.x+box.width*.7,clientY:box.y+box.height*.8,pointerType:'touch'});await p.dispatchEvent('canvas','pointerup',{pointerId:1});
  assert.ok(await p.evaluate(()=>window.__pinballState().aim)>.3);
  await p.screenshot({path:`/tmp/pinball-m1-${w}-playing.png`});
  const q=await p.evaluate(()=>({state:window.__pinballState(),scrollX:document.documentElement.scrollWidth>innerWidth,scrollY:document.documentElement.scrollHeight>innerHeight}));assert.equal(q.scrollX,false);assert.equal(q.scrollY,false);assert.deepEqual(errors,[]);
  out.push({viewport:[w,h],title:await p.title(),url:p.url(),errors,checks:['identity','nonblank','no-error-overlay','console','screenshot','seed-play-pause-resume-reward-touch','pause-focus-wrap-and-inert'],fps:q.state.fpsNow,physicsMeanMs:q.state.physicsMeanMs,physicsMaxMs:q.state.maxPhysicsMs,scrollX:q.scrollX,scrollY:q.scrollY});await context.close();
 }
 await browser.close();fs.writeFileSync(process.argv[2]||'docs/m1-evidence/browser.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
