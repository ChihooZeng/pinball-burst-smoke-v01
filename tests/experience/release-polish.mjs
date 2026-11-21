import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {instrument} from "./browser.mjs";
import {sleep} from "../release/browser.mjs";

const [out,url,mode="assert"]=process.argv.slice(2);
await fs.mkdir(out,{recursive:true});
const {page,errors,close}=await instrument(Number(process.env.PINBALL_QA_PORT||9494));
const records=[];
const rect=(selector)=>page.eval(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);
const click=async selector=>{
  await page.eval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"nearest"})`);
  const {x,y,width,height}=await rect(selector);
  assert.ok(width&&height,selector);
  const point={x:x+width/2,y:y+height/2};
  await page.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
  await page.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await sleep(75);
};
const phase=()=>page.eval("__pinballState().phase");
const shot=(name)=>page.shot(path.join(out,name+".png"));
const setLocale=language=>page.eval(`(()=>{
  const selector=document.querySelector("#startOverlay [data-language]");
  selector.value=${JSON.stringify(language)};selector.dispatchEvent(new Event("change"));
})()`);

try{
 for(const [w,h] of [[360,640],[390,844],[430,932],[1440,900]]){
  for(const lang of ["zh-CN","en"]){
   const suffix=`${w}x${h}-${lang}`;
   await page.viewport(w,h,w===1440?1:2,w<1000);
   await page.goto(url);
   await setLocale(lang);
   await page.eval("advanceGame(2)");
   assert.equal(await page.eval("document.documentElement.lang"),lang);
   await shot("home-"+suffix);
   await click("#start");
   assert.equal(await phase(),"playing");
   await page.eval("advanceGame(28)");
   const battle=await page.eval(`(()=>{
     const q=__pinballTest, c=document.querySelector("#game"), field=q.fieldGeometry();
     return {field, world:[__pinballState().worldWidth,__pinballState().worldHeight],
       backing:[c.width,c.height],purple:getComputedStyle(document.documentElement).getPropertyValue("--brick-purple").trim(),
       muzzle:q.makeTestBall(),bricks:q.brickLayout()};
   })()`);
   if(mode==="assert"){
    assert.equal(battle.purple,"#D69AFF");
    assert.ok(Math.abs(battle.field.pivot.y-battle.muzzle.y-26.76)<1e-7);
    assert.equal(await page.eval("document.querySelector('#startOverlay [data-i18n=version]').textContent.includes('V2.1')"),false);
   }
   await shot("battle-"+suffix);
   await click("#pause");
   assert.equal(await phase(),"paused");
   const settings=await page.eval(`(()=>{
     const box=q=>document.querySelector(q).getBoundingClientRect().toJSON();
     const scroll=document.querySelector(".pause-scroll");
     return {panel:box("#pauseOverlay"),resume:box("#resume"),reset:box("#reset"),scroller:box(".pause-scroll"),
       preview:box("#soundTest"),language:box("#pauseOverlay [data-language]"),scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,
       width:document.documentElement.scrollWidth};
   })()`);
   await shot("settings-"+suffix);
   if(mode==="assert"){
    assert.equal(settings.width,w);
    for(const name of ["resume","reset","preview","language"])assert.ok(settings[name].height>=44,name);
    assert.ok(settings.resume.bottom<=settings.scroller.top);
    assert.ok(settings.reset.top>=settings.scroller.bottom&&settings.reset.bottom<=settings.panel.bottom);
   }
   records.push({viewport:[w,h],lang,battle,settings});
  }
 }
 if(mode==="assert"){
  await page.viewport(360,640,2,true);
  await page.eval("localStorage.clear()");
  await page.goto(url);
  await setLocale("zh-CN");
  await click("#startOverlay .home-shortcut summary");
  assert.equal(await page.eval("document.querySelector('#startOverlay .home-shortcut').open"),true);
  await click("#startOverlay .home-shortcut summary");
  await click("#start");
  await click("#pause");
  const change=async (selector,value)=>page.eval(`(()=>{
    const control=document.querySelector(${JSON.stringify(selector)});
    control.value=${JSON.stringify(value)};control.dispatchEvent(new Event("change",{bubbles:true}));
  })()`);
  await change("#pauseOverlay [data-language]","en");
  assert.equal(await page.eval("document.querySelector('#pauseTitle').textContent"),"Settings");
  await change("#skillSide","left");
  assert.equal(await page.eval("document.querySelector('.shell').classList.contains('skill-left')"),true);
  assert.equal(await page.eval("document.querySelector('#autoSkill').checked"),true);
  await click("#pauseOverlay label:has(#autoSkill)");
  assert.equal(await page.eval("localStorage.getItem('pinball-overload-auto-skill-v1')"),"no");
  const slider=await rect("#soundVolume");
  await page.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:slider.x+slider.width*.35,y:slider.y+slider.height/2}]});
  await page.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  const volume=await page.eval("Number(document.querySelector('#soundVolume').value)");
  assert.ok(volume>20&&volume<50);
  assert.equal(await page.eval("document.querySelector('#soundValue').textContent"),volume+"%");
  assert.equal(Number(await page.eval("localStorage.getItem('pinball-v1-volume')")),volume/100);
  await click("#pauseOverlay label:has(#mute)");
  assert.equal(await page.eval("localStorage.getItem('pinball-v1-muted')"),"yes");
  await click("#pauseOverlay label:has(#mute)");
  assert.equal(await page.eval("localStorage.getItem('pinball-v1-muted')"),"no");
  await click("#soundTest");
  await change("#impactMode","balanced");
  assert.equal(await page.eval("__pinballState().visualImpact.mode"),"balanced");
  await click("#pauseOverlay label:has(#impactHaptic)");
  const pulses=await page.eval(`(()=>{
    const q=__pinballTest,log=[];
    Object.defineProperty(navigator,"vibrate",{configurable:true,value:ms=>{log.push(ms);return true;}});
    q.setTestField([{x:14,y:110,hp:1}]);q.hitById(q.firstBrick().id,"normal");
    return log;
  })()`);
  assert.deepEqual(pulses,[]);
  await click("#pauseOverlay label:has(#impactHaptic)");
  const enabled=await page.eval(`(()=>{
    const q=__pinballTest,log=[];
    Object.defineProperty(navigator,"vibrate",{configurable:true,value:ms=>{log.push(ms);return true;}});
    q.setTestField([{x:14,y:110,hp:1}]);q.hitById(q.firstBrick().id,"normal");
    return log;
  })()`);
  assert.deepEqual(enabled,[16]);
  await click(".settings-help summary");
  assert.equal(await page.eval("document.querySelector('.settings-help details').open"),true);
  assert.match(await page.eval("document.querySelector('.settings-help a').getAttribute('href')"),/privacy/);
  await click("#resume");
  assert.equal(await phase(),"playing");
  await click("#pauseQuick");
  assert.equal(await phase(),"paused");
  assert.equal(await page.eval("document.querySelector('#reset').getClientRects().length"),0);
  await click("#pauseSettings");
  await click("#reset");
  assert.equal(await phase(),"playing");
  assert.equal(await page.eval("__pinballState().wave"),1);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,"screens.json"),JSON.stringify({records,errors},null,2)+"\n");
 console.log("PASS bilingual Chromium home, battle and settings screenshots across four viewports");
}finally{await close();}
