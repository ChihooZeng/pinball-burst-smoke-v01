import assert from "node:assert/strict";
import {launchChrome,newPage,sleep} from "./browser.mjs";

const url = process.argv[2] || "http://127.0.0.1:4178/demo/v1/";
const chrome = await launchChrome(9346);
const page = await newPage(9346);
try {
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument",{
    source:"window.__PINBALL_TEST__=true; window.__PINBALL_SEED__=20261118;"
  });
  await page.viewport(360,640,1,true);
  await page.goto(url);

  const fixture = await page.eval(`(()=>{
    const qa=__pinballTest;
    qa.begin();
    qa.configureBuild({arc:1});
    const [origin, first, removed, replacement]=qa.setTestField([
      {x:65,y:120,hp:20},{x:103,y:120,hp:20},{x:141,y:120,hp:1},{x:178,y:120,hp:20}
    ]);
    const ball=qa.makeTestBall();
    qa.triggerLightningById(origin,ball);
    qa.triggerLightningById(origin,ball);
    qa.hitForTest(removed,"lightning",1);
    return {origin,first,replacement};
  })()`);
  await sleep(500);
  const arc = await page.eval(`(()=>{
    const qa=__pinballTest;
    return {hp:qa.hpDistribution(),events:qa.exportData().events,charge:__pinballState().charge};
  })()`);
  assert.equal(arc.hp.find(b=>b.id===fixture.replacement).hp<20,true,
    "a live replacement must inherit a cancelled hop");
  assert.equal(arc.events.filter(e=>e.type==="arc_hop").length,2);
  assert.equal(arc.hp.find(b=>b.id===fixture.first).hp,16,
    "arc armor bonus must apply to a normal armored brick");

  await page.eval(`(()=>{
    const qa=__pinballTest;qa.reset();qa.begin();qa.configureBuild({arc:3},"arc-b");
    const [origin]=qa.setTestField([{x:65,y:120,hp:80},{x:103,y:120,hp:20}]);
    qa.triggerLightningById(origin,qa.makeTestBall());
  })()`);
  await sleep(140);
  const focus = await page.eval("(()=>({state:__pinballState(),hops:__pinballTest.exportData().events.filter(e=>e.type==='arc_hop')}))()");
  assert.equal(focus.hops.length,1);
  assert.equal(focus.hops[0].damage,focus.state.buildSummary.effects.arcSolo+focus.state.buildSummary.effects.arcArmorBonus);
  assert.ok(focus.state.charge>=5,"main Arc route must convert effective hits to overload charge");
  const gun = await page.eval(`(()=>{
    const qa=__pinballTest;qa.reset();qa.begin();qa.configureBuild({gun:3},"gun-b");
    const [left,right]=qa.setTestField([{x:65,y:120,hp:100},{x:103,y:120,hp:100}]);
    for(let hit=0;hit<4;hit++){
      qa.directContact(left,qa.makeTestBall());qa.directContact(right,qa.makeTestBall());
    }
    return qa.exportData().events.filter(event=>event.type==="direct_hit").map(event=>event.gunPressure);
  })()`);
  assert.deepEqual(gun,[0,0,0,0,0,0,1,1],"gun pressure builds separately for each target");

  const getFloor=`(()=>{
    const state=__pinballState(), bricks=__pinballTest.brickLayout().filter(brick=>brick.alive);
    return {elapsed:state.elapsed,gap:state.dangerY-Math.max(...bricks.map(brick=>brick.y+brick.h))};
  })()`;
  await page.eval("__pinballTest.reset();__pinballTest.begin();__pinballTest.spawnWave(19)");
  const start=await page.eval(getFloor);
  await sleep(500);
  const next=await page.eval(getFloor);
  assert.ok(next.gap<start.gap);
  assert.ok(start.gap*(next.elapsed-start.elapsed)/(start.gap-next.gap)>=25.5);
  console.log("PASS per-target gun pressure and wave 19 response window");
  console.log("PASS Arc retargeting, ordinary armor, overload synergy and Focus damage");
} finally {
  await page.close();
  chrome.kill();
}
