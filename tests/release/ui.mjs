import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {launchChrome,newPage,sleep} from "./browser.mjs";

const [out,url="http://127.0.0.1:4178/demo/v1/"] = process.argv.slice(2);
if(out) await fs.mkdir(out,{recursive:true});
const chrome=await launchChrome(9347);
const page=await newPage(9347);
const errors=[];
page.on(event=>{
  if(event.method==="Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.exception?.description);
  if(event.method==="Log.entryAdded"&&event.params.entry.level==="error") errors.push(event.params.entry.text);
});
const shot=tag=>out?page.shot(path.join(out,`ui-${tag}.png`)):undefined;
try {
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.__PINBALL_TEST__=true;
    window.__PINBALL_SEED__=20261118;
    Object.defineProperty(navigator,"language",{value:"en-US"});
  `});
  for(const [width,height] of [[360,640],[390,844],[1440,920]]){
    await page.viewport(width,height,2,width<500);
    await page.goto(url);
    assert.equal(await page.eval("document.documentElement.lang"),"en");
    assert.equal(await page.eval("document.title"),"Marble Overload");
    assert.equal(await page.eval("document.documentElement.scrollWidth"),width);
    assert.equal(await page.eval("document.querySelector('#start').disabled"),false);
    assert.equal(await page.eval("document.querySelector('#qaBossPreview').hidden"),true);
    await shot(`home-${width}-en`);
  }
  await page.viewport(360,640,2,true);
  await page.goto(url);
  await page.eval("document.querySelector('#start').click()");
  await page.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:275,y:400}]});
  await page.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  assert.ok(await page.eval("__pinballState().aim > .4"));
  await page.eval("__pinballTest.clearWave()");
  await sleep(1800);
  assert.equal(await page.eval("__pinballState().phase"),"choosing");
  assert.equal(await page.eval("document.querySelector('#choiceTitle1').textContent"),"Arc Mark");
  await shot("upgrade-360-en");
  await page.eval("document.querySelector('#choice1').click()");
  await page.eval("document.querySelector('#pause').click()");
  assert.match(await page.eval("document.querySelector('#buildSkills').textContent"),/Arc Mark.*R1/s);
  assert.equal(await page.eval("document.querySelector('#diagnostics').hidden"),true);
  await shot("settings-360-en");
  await page.eval(`(()=>{
    const picker=document.querySelector("#pauseOverlay [data-language]");
    picker.value="zh-CN";picker.dispatchEvent(new Event("change"));
  })()`);
  assert.match(await page.eval("document.querySelector('#buildSkills').textContent"),/电弧印记.*R1/s);
  assert.match(await page.eval("document.querySelector('#lastUpgrade').textContent"),/次撞砖/);
  await shot("settings-360-zh");
  await page.goto(url);
  assert.equal(await page.eval("document.documentElement.lang"),"zh-CN");
  assert.equal(await page.eval("document.title"),"弹珠超载");
  await shot("home-360-zh");
  await page.eval("__pinballTest.jumpToFinalBoss()");
  assert.equal(await page.eval("document.querySelector('#bossName').textContent"),"终局核心");
  await shot("boss20-360-zh");
  assert.deepEqual(errors,[]);
  console.log("PASS English default, 3 viewports, real touch aim, upgrade, live language change, persistence and boss localization");
} finally {
  await page.close();
  chrome.kill();
}
