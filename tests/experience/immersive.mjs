import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {entry,instrument} from "./browser.mjs";
import {sleep} from "../release/browser.mjs";

const [out,base,candidate]=process.argv.slice(2);
await fs.mkdir(out,{recursive:true});
const {page,errors,close}=await instrument(9462);
const cases=[
  [360,640,1], [360,640,2], [390,844,3], [430,932,3], [1440,900,1],
  [390,844,3,{top:47,bottom:34,left:0,right:0}],
  [360,560,2], [390,764,3], [430,852,3], [844,390,2,{left:47,right:47,top:0,bottom:21}]
];
const view=`(()=>{
  const rect=q=>document.querySelector(q)?.getBoundingClientRect().toJSON();
  const c=document.querySelector("#game"),s=__pinballState();
  return {canvas:rect("#game"),hud:rect(".topbar"),dock:rect(".control-dock"),skills:rect(".skill-slots"),pause:rect("#pauseQuick"),settings:rect("#pause"),overloadMin:parseFloat(getComputedStyle(document.querySelector("#giant")).minHeight),slot:rect(".playfield"),geometry:__pinballTest.fieldGeometry?.(),world:[s.worldWidth,s.worldHeight],danger:s.dangerY,shooter:s.shooterY,backing:[c.width,c.height],hasRim:!!document.querySelector(".battle-rim"),background:getComputedStyle(document.documentElement).backgroundImage,scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]};
})()`;
const compare=(a,b,epsilon=.08)=>assert.ok(Math.abs(a-b)<epsilon,`${a} vs ${b}`);
const load=async (url,w,h,dpr,insets={top:0,right:0,bottom:0,left:0})=>{
  await page.viewport(w,h,dpr,w<1000);
  await page.send("Emulation.setSafeAreaInsetsOverride",{insets});
  await page.goto(entry(url,{qa:1}));
  assert.equal(await page.eval("__pinballTest.begin()"),true);
  await page.eval("advanceGame(45)");
  return await page.eval(view);
};
const maps=async ()=>{
  const geometry=await page.eval("__pinballTest.fieldGeometry()");
  const {left,top,width,height,scale,walls,danger,pivot}=geometry;
  const sample=await page.eval(view);
  assert.deepEqual(walls,{left:0,right:360,top:4});
  assert.equal(danger,sample.danger);
  assert.deepEqual(pivot,{x:180,y:sample.shooter-8});
  compare(left,sample.canvas.left);compare(top,sample.canvas.top);
  compare(width,sample.canvas.width);compare(height,sample.canvas.height);
  for(const [x,y] of [[0,0],[180,danger],[360,sample.world[1]]]){
    compare((left+x*scale-left)/scale,x);
    compare((top+y*scale-top)/scale,y);
  }
  compare(360*scale,width);
  compare(sample.world[1]*scale,height);
  return geometry;
};
const tap=async (type,x,y)=>{
  await page.send("Input.dispatchTouchEvent",{type,touchPoints:x===undefined?[]:[{x,y}]});
};
async function exerciseInput(w,h,dpr){
  const original=await maps();
  const x=original.left+270*original.scale,y=original.top+original.height*.52;
  await tap("touchStart",x,y);
  compare(await page.eval("__pinballState().aim"),.54,.008);
  compare(await page.eval("__pinballTest.fieldGeometry().angle"),.54,.008);
  await tap("touchMove",Math.max(1,original.left-6),y);
  compare(await page.eval("__pinballState().aim"),-1.08,.01);
  await tap("touchCancel");
  const canceled=await page.eval("__pinballState().aim");
  assert.ok(canceled<=-1.07);
  await tap("touchStart",x,y);
  await tap("touchEnd");
  compare(await page.eval("__pinballState().aim"),.54,.008);

  const world=`(()=>{
    const s=__pinballState(),q=__pinballTest;
    return {h:s.worldHeight,wave:s.wave,danger:s.dangerY,bricks:q.brickLayout(),balls:q.ballSnapshot()};
  })()`;
  const before=await page.eval(world);
  const layouts=[];
  for(const [width,height] of [[w,h-80],[h,w],[w,h]]){
    await page.viewport(width,height,dpr,true);
    await sleep(125);
    assert.deepEqual(await page.eval(world),before,"resize must preserve the active world and positions");
    layouts.push(await maps());
  }
  const resized=layouts.at(-1);
  await tap("touchStart",resized.left+90*resized.scale,resized.top+resized.height*.65);
  await tap("touchEnd");
  compare(await page.eval("__pinballState().aim"),-.54,.008);

  await page.send("Emulation.setPageScaleFactor",{pageScaleFactor:1.1});
  await sleep(125);
  compare(await page.eval("visualViewport.scale"),1.1,.001);
  const zoom=await maps();
  // CDP point coordinates are already CSS pixels of the main-frame viewport.
  await tap("touchStart",zoom.left+270*zoom.scale,zoom.top+zoom.height*.55);
  await tap("touchEnd");
  compare(await page.eval("__pinballState().aim"),.54,.012);
  await page.send("Emulation.setPageScaleFactor",{pageScaleFactor:1});
  return {canceled,resized:layouts,zoom};
}

const rails=async ()=>{
  const trace=await page.eval(`(()=>{
    const ctx=document.querySelector("#game").getContext("2d");
    const q=__pinballTest,h=__pinballState().worldHeight, captures=[];
    const begin=ctx.beginPath,move=ctx.moveTo,line=ctx.lineTo,stroke=ctx.stroke;
    let points=[];
    ctx.beginPath=function(){points=[];return begin.call(this);};
    ctx.moveTo=function(x,y){points.push([x,y]);return move.call(this,x,y);};
    ctx.lineTo=function(x,y){points.push([x,y]);return line.call(this,x,y);};
    ctx.stroke=function(){
      if(points.length===4&&points[0][0]===0&&points[0][1]===h&&points[1][1]===4){
        const m=this.getTransform();
        captures.push({points:points.slice(),matrix:[m.a,m.d,m.e,m.f]});
      }
      return stroke.call(this);
    };
    advanceGame(1);
    q.hitById(q.firstBrick().id,"giant");
    advanceGame(1);
    Object.assign(ctx,{beginPath:begin,moveTo:move,lineTo:line,stroke});
    return {h,captures};
  })()`);
  assert.equal(trace.captures.length,2);
  assert.deepEqual(trace.captures[0],trace.captures[1],"screen rails must not move under hit shake");
  assert.deepEqual(trace.captures[0].points,[[0,trace.h],[0,4],[360,4],[360,trace.h]]);
  assert.deepEqual(trace.captures[0].matrix.slice(2),[0,0]);
  return trace;
};

const results=[];
try{
 for(const [w,h,dpr,insets] of cases){
  const before=await load(base,w,h,dpr,insets);
  const after=await load(candidate,w,h,dpr,insets);
  assert.equal(after.hasRim,false,"the independent battle rim must be removed from the DOM");
  assert.match(after.background,/linear-gradient.*linear-gradient/,"the grid belongs to the page");
  assert.deepEqual(after.world,before.world,"layout must preserve baseline world sizing");
  assert.equal(after.danger,before.danger);
  assert.equal(after.shooter,before.shooter);
  assert.deepEqual(after.scroll,[w,h]);
  const {canvas}=after;
  assert.ok(canvas.top>=after.hud.bottom-.01&&canvas.bottom<=after.dock.top+.01);
  assert.ok(canvas.left>=(insets?.left||0)&&canvas.right<=w-(insets?.right||0));
  assert.ok(after.dock.bottom<=h-(insets?.bottom||0)+.01&&after.hud.top>=(insets?.top||0));
  for(const el of [after.pause,after.settings])assert.ok(el.width>=44&&el.height>=44);
  assert.ok(after.overloadMin>=44);
  compare(canvas.width/360,canvas.height/after.world[1],.0002);
  assert.deepEqual(after.backing,[Math.round(canvas.width*Math.min(dpr,2)),Math.round(canvas.height*Math.min(dpr,2))]);
  if(w===360&&h===640)assert.ok(canvas.width>=330,"short-screen court must recover most of its available width");
  await maps();
  if(w===1440){compare(canvas.width,before.canvas.width);compare(canvas.height,before.canvas.height);}
  results.push({viewport:[w,h],dpr,insets,before,after});
  if(insets?.top===47||[[360,640,2],[390,844,3],[430,932,3],[1440,900,1]].some(([ww,hh,dd])=>ww===w&&hh===h&&dd===dpr)){
    await page.shot(path.join(out,`battle-${w}x${h}${insets?.top===47?"-safe":""}.png`));
  }
  if(!insets&&w<1000&&dpr>1&&[[360,640],[390,844],[430,932]].some(([ww,hh])=>ww===w&&hh===h)){
    results.at(-1).input=await exerciseInput(w,h,dpr);
    results.at(-1).wallTrace=await rails();
  }
  if(!insets&&[640,844,932,900].includes(h)){
    await page.eval("__pinballTest.jumpToBoss10();advanceGame(5)");
    await sleep(125);
    const boss=await page.eval("document.querySelector('#bossHud').getBoundingClientRect().toJSON()");
    const bossView=await page.eval(view);
    assert.ok(boss.height>0&&boss.top>=bossView.hud.bottom&&boss.bottom<=bossView.canvas.top+.02);
    results.at(-1).boss={bounds:boss,canvas:bossView.canvas};
    if(w===1440)compare(bossView.canvas.width,after.canvas.width);
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,"layout.json"),JSON.stringify({results,errors},null,2)+"\n");
 console.log("PASS mobile and desktop layout, frozen world height, safe-area insets, DPR 1/2/3");
}finally{await close();}
