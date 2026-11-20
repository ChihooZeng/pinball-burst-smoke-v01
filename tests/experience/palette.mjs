import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {entry,instrument} from "./browser.mjs";

const [output,url="http://127.0.0.1:4201/demo/v1/"]=process.argv.slice(2);
await fs.mkdir(output,{recursive:true});
const {page,errors,close}=await instrument(9403);
const candidates=[["baseline",null],["lavender","#D6A8FF"],["orchid","#D99CFC"],["lilac","#CDAAFA"]];
try{
  await page.viewport(390,844,2,true);
  await page.send("Page.addScriptToEvaluateOnNewDocument",{source:`
    const shade=new URLSearchParams(location.search).get("shade");
    if(shade){
      const get=window.getComputedStyle.bind(window);
      window.getComputedStyle=(element,pseudo)=>{
        const rules=get(element,pseudo);
        if(element===document.documentElement){
          const original=rules.getPropertyValue.bind(rules);
          Object.defineProperty(rules,"getPropertyValue",{value:name=>name==="--brick-purple"||name==="--purple"?shade:original(name)});
        }
        return rules;
      };
    }
  `});
  const samples=[];
  for(const [label,shade] of candidates){
    await page.goto(entry(url,shade?{shade}:{}));
    await page.eval("__pinballTest.begin();advanceGame(37)");
    await page.shot(path.join(output,`palette-${label}-wave1.png`));
    const values=await page.eval(`["--cyan","--blue","--periwinkle","--purple","--pink"].map(
      key=>getComputedStyle(document.documentElement).getPropertyValue(key).trim())`);
    await page.eval("__pinballTest.spawnWave(8);advanceGame(30)");
    await page.shot(path.join(output,`palette-${label}-wave8.png`));
    samples.push({label,shade,values});
  }
  assert.ok(samples.every(sample=>[0,1,2,4].every(i=>sample.values[i]===samples[0].values[i])));
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"samples.json"),JSON.stringify({samples,errors},null,2)+"\n");
}finally{await close();}
