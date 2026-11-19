import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {launchChrome,newPage,sleep} from "./browser.mjs";

const [tokenPath,output,base="http://127.0.0.1:4182"]=process.argv.slice(2);
assert.ok(tokenPath,"Pass the path to the QA dashboard token file");
const token=(await fs.readFile(tokenPath,"utf8")).trim();
const headers={Authorization:"Bearer "+token};
const query=async()=>await(await fetch(base+"/api/dashboard",{headers})).json();
const before=await query();
const count=(report,name)=>report.events.find(entry=>entry.name===name)?.count||0;
const chrome=await launchChrome(9350);
const page=await newPage(9350);
const errors=[];
page.on(event=>{
  if(event.method==="Runtime.exceptionThrown")errors.push(event.params.exceptionDetails.exception?.description);
  if(event.method==="Log.entryAdded"&&event.params.entry.level==="error")errors.push({text:event.params.entry.text,url:event.params.entry.url});
});
async function until(expression,ms=8000){
  for(let start=Date.now();Date.now()-start<ms;){
    if(await page.eval(expression))return;
    await sleep(100);
  }
  assert.fail("Timed out: "+expression);
}
const click=id=>page.eval(`document.getElementById(${JSON.stringify(id)}).click()`);
try{
  assert.equal((await fetch(base+"/api/dashboard")).status,401);
  await page.send("Page.enable");await page.send("Runtime.enable");await page.send("Log.enable");
  await page.send("Network.enable");
  await page.send("Network.setExtraHTTPHeaders",{headers:{"x-pinball-fixture-country":"CN"}});
  await page.send("Page.addScriptToEvaluateOnNewDocument",{source:"window.__PINBALL_TEST__=true;window.__PINBALL_SEED__=20261118;"});
  await page.viewport(390,844,2,true);
  await page.goto(base+"/demo/v1/");
  assert.equal(await page.eval("document.querySelector('[data-analytics-consent]').checked"),false);
  await click("start");
  await sleep(3400);
  assert.equal((await query()).overview.starts,before.overview.starts);
  await page.goto(base+"/demo/v1/");
  await page.eval("document.querySelector('[data-analytics-consent]').click()");
  await click("start");
  await page.eval("__pinballTest.clearWave()");
  await until("__pinballState().phase==='choosing'");
  await click("choice1");
  await until("__pinballState().wave===2");
  await click("pause");await click("resume");
  await page.eval("__pinballTest.spawnWave(10)");
  await page.eval(`(()=>{
    const qa=__pinballTest;
    qa.setTestField([{x:138,y:142,w:84,h:53,hp:3,isBoss:true}]);
    qa.injectGiantAt(180,300,0,-610);
  })()`);
  await until("__pinballState().bossDefeats===1");
  await until("__pinballState().phase==='choosing'");
  await click("pause");await click("reset");
  await page.eval(`__pinballTest.setTestField([{x:12,y:__pinballState().dangerY-10,hp:7}])`);
  await until("__pinballState().phase==='lost'");
  const result=await page.eval("document.querySelector('#winTitle').textContent");
  assert.match(result,/danger line|警戒线/);
  await sleep(3600);
  const after=await query();
  for(const name of ["game_visit","game_start","tutorial_complete","wave_start","wave_clear","upgrade_selected","faction_selected",
    "boss_start","boss_defeated","game_over","game_restart","pause","resume"])assert.ok(count(after,name)>count(before,name),name);
  assert.equal(after.overview.starts-before.overview.starts,2);
  assert.equal(after.overview.failed-before.overview.failed,1);
  assert.ok(after.markets.find(row=>row.market==="CN").starts>=2);
  assert.ok(after.factions.find(row=>row.faction==="arc").starts>=1);
  await click("pause");
  await page.eval("document.querySelector('#pauseOverlay [data-analytics-consent]').click()");
  await click("reset");
  await sleep(3500);
  assert.equal((await query()).overview.starts,after.overview.starts);
  assert.equal(await page.eval("localStorage.getItem('pinball-v1-visitor')"),null);
  await page.goto(base+"/demo/v1/privacy.html");
  assert.ok((await page.eval("document.querySelector('article:not([hidden]) [data-value=operator]').textContent")).length);
  await page.goto(base+"/analytics/");
  await page.eval(`document.querySelector("#token").value=${JSON.stringify(token)};
    document.querySelector("#access").requestSubmit();`);
  await until("document.querySelector('#results').querySelectorAll('table').length>=7");
  await page.eval("document.querySelector('#token').value=''");
  assert.deepEqual(errors,[]);
  if(output)await fs.writeFile(output,JSON.stringify({deltaStarts:2,deltaFailures:1,dashboard:after},null,2));
  console.log("PASS browser consent, persisted run lifecycle, pause and resume, withdrawal, private dashboard and operator notice");
}finally{
  await page.close();chrome.kill();
}
