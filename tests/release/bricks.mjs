import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {launchChrome,newPage,sleep} from "./browser.mjs";

const [output, mode="after", url="http://127.0.0.1:4178/demo/v1/"] = process.argv.slice(2);
if (!output) throw new Error("Provide an output directory for the screenshots and JSON");
await fs.mkdir(output, {recursive:true});
const chrome = await launchChrome(9341);
const page = await newPage(9341);
const errors = [];
const results = [];
page.on(event => {
  if(event.method==="Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.text);
  if(event.method==="Log.entryAdded" && event.params.entry.level==="error") errors.push(event.params.entry.text);
});
try {
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.send("Page.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", {source:`
    window.__PINBALL_SEED__ = 20261118;
    window.__PINBALL_TEST__ = true;
    window.canvasLabels = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text,x,y,...args){
      if (window.captureLabels) canvasLabels.push({text:String(text),x,y});
      return fillText.call(this,text,x,y,...args);
    };
  `});
  for (const [width,height] of [[360,640],[390,844]]) {
    await page.viewport(width,height,1,true);
    await page.goto(url);
    assert.equal(await page.eval("document.documentElement.scrollWidth"),width);
    const waveData = await page.eval(`Array.from({length:20},(_,i)=>{
      const wave=i+1, qa=__pinballTest, plan=qa.createWavePlan(wave);
      const hp={}, colors={}, special={energy:0,elite:0};
      for(const brick of plan){
        if(brick.special){special.energy++;continue;}
        if(brick.isElite){special.elite++;continue;}
        hp[brick.hp]=(hp[brick.hp]||0)+1;
        const color=qa.colorForHp(brick.hp);
        colors[color]=(colors[color]||0)+1;
      }
      return {wave,hp,colors,special,total:plan.length};
    })`);
    results.push({width,height,waves:waveData});
    for (const wave of [1,2,3,4,5,8,10,12,16,19,20]) {
      await page.eval(`(()=>{
        const qa=__pinballTest;
        qa.reset();qa.begin();qa.spawnWave(${wave});
        if(${wave}===10)qa.summonBossBricks();
      })()`);
      await sleep(wave===10?1500:430);
      await page.eval(`(()=>{document.querySelector('#pause').click();
        document.querySelector('#pauseOverlay').classList.add('hidden');
        canvasLabels.length=0;window.captureLabels=true;})()`);
      await sleep(78);
      await page.eval("window.captureLabels=false");
      if(wave===1 && mode==="after") {
        assert.equal(await page.eval("canvasLabels.some(label=>label.text==='1')"),false,"ordinary 1HP must render without a number");
        assert.equal(await page.eval("canvasLabels.some(label=>label.text==='2')"),true,"ordinary 2HP must retain its number");
      }
      await page.shot(path.join(output,`bricks-${mode}-${width}x${height}-w${wave}.png`));
    }
  }
  await fs.writeFile(path.join(output,`bricks-${mode}.json`),JSON.stringify({results,errors},null,2));
  assert.deepEqual(errors,[]);
  if(mode==="after") {
    const [one,two] = results[0].waves;
    assert.equal(Object.keys(one.colors).length,2,"1HP and 2HP must have different color identities");
    assert.ok(Object.keys(two.colors).length>=3,"wave 2 should add a third color identity");
  }
  console.log(`Chromium: ${results.length} viewports, 22 screenshots, 40 generator samples, ${errors.length} browser errors`);
} finally {
  await page.close();
  chrome.kill();
}
