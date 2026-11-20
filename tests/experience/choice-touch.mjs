import assert from "node:assert/strict";
import {instrument} from "./browser.mjs";

const [url="http://127.0.0.1:4202/demo/v1/"]=process.argv.slice(2);
const {page,errors,close}=await instrument(9427);
try{
  await page.viewport(360,640,2,true);
  await page.goto(url);
  const p=await page.eval(`(()=>{
    const q=__pinballTest;q.begin();q.clearWave();advanceGame(2);
    const box=document.querySelector("#choice1").getBoundingClientRect();
    return {x:box.x+box.width/2,y:box.y+box.height/2};
  })()`);
  assert.equal(await page.eval("__pinballState().phase"),"choosing");
  const tap=async()=>{
    await page.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[p]});
    await page.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  };
  await tap();
  assert.equal(await page.eval("__pinballState().phase"),"choosing","A tap at the transition must not select a build");
  await page.eval("advanceGame(18)");
  await tap();
  const state=await page.eval("__pinballState()");
  assert.equal(state.phase,"playing");
  assert.equal(state.seedAbility,"arc");
  assert.deepEqual(errors,[]);
  console.log("PASS protected touch transition and subsequent deliberate upgrade");
}finally{await close();}
