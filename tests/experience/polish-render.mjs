import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {instrument} from "./browser.mjs";

const [out,base,candidate]=process.argv.slice(2);
await fs.mkdir(out,{recursive:true});
const {page,errors,close}=await instrument(9496);
const captures=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} vs ${b}`);
const swatches=`(()=>{
 const q=__pinballTest;
 q.begin();q.spawnWave(8);
 q.setTestField([1,2,5,9,16,30].map((hp,i)=>({x:42+i*47,y:156,hp})));
 advanceGame(36);
 const canvas=document.querySelector("#game"),ctx=canvas.getContext("2d"),field=q.fieldGeometry(),details=q.allBricks();
 const samples=details.map(b=>{
  const x=Math.round((b.x+5)*field.scale*canvas.width/field.width);
  const y=Math.round((b.y+17)*field.scale*canvas.height/field.height);
  const level=Math.round((b.x+14)*field.scale*canvas.width/field.width);
  const chip=Array.from(ctx.getImageData(x,y,1,1).data);
  const digits=ctx.getImageData(level-7,y-16,15,14).data;
  const pixels=Array.from({length:digits.length/4},(_,i)=>Array.from(digits.slice(i*4,i*4+4)));
  return {hp:b.hp,color:b.color,face:chip,hasWhite:pixels.some(([r,g,b,a])=>r>240&&g>240&&b>240&&a>200),rect:[b.x,b.y,b.w,b.h]};
 });
 return {samples,field};
})()`;
const trace=`(viewBoxHeight=>{
 const q=__pinballTest,canvas=document.querySelector("#game"),ctx=canvas.getContext("2d");
 const original=ctx.drawImage;
 let sprite;
 ctx.drawImage=function(image,x,y,width,height,...rest){
  if(image.src?.endsWith("/turret-a1-1/barrel.svg")){
    const m=this.getTransform(),unscaled=q.fieldGeometry();
    const point=m.transformPoint({x:x+width/2,y:y+1.8*height/viewBoxHeight});
    const pivot=m.transformPoint({x:0,y:0});
    sprite={x:point.x/(canvas.width*unscaled.scale/unscaled.width),y:point.y/(canvas.height*unscaled.scale/unscaled.height),
      pivot:{x:pivot.x/(canvas.width*unscaled.scale/unscaled.width),y:pivot.y/(canvas.height*unscaled.scale/unscaled.height)},
      width,height};
  }
  return original.call(this,image,x,y,width,height,...rest);
 };
 try{
  const launched=q.fire(), ball=q.ballDetails().at(-1);
  advanceGame(1,.001);
  return {launched,ball,sprite,field:q.fieldGeometry()};
 }finally{ctx.drawImage=original;}
})`;
try{
 for(const [w,h] of [[360,640],[390,844],[430,932],[1440,900]]){
  const dpr=w===1440?1:2;
  await page.viewport(w,h,dpr,w<1000);
  const comparison=[];
  for(const [name,url] of [["before",base],["after",candidate]]){
   await page.goto(url);
   const palette=await page.eval(swatches);
   if(w===390)await page.shot(path.join(out,`palette-${name}.png`));
   comparison.push(palette);
  }
  const [before,after]=comparison;
  assert.deepEqual(before.samples.map(s=>s.rect),after.samples.map(s=>s.rect));
  for(const index of [0,1,2,4])assert.deepEqual(before.samples[index],after.samples[index]);
  const faceValue=([r,g,b,a])=>(r*.2126+g*.7152+b*.0722)*a/255;
  for(const index of [3,5]){
   assert.equal(after.samples[index].color.toLowerCase(),"#d69aff");
   assert.ok(after.samples[index].face[3]>before.samples[index].face[3]);
   assert.ok(faceValue(after.samples[index].face)>faceValue(before.samples[index].face)+5);
   assert.equal(after.samples[index].hasWhite,true,"white digits stay readable on purple");
  }
  await page.goto(candidate);
  await page.eval("__pinballTest.begin();advanceGame(24)");
  const aiming=[];
  for(const fraction of [.24,.5,.76]){
   const f=await page.eval("__pinballTest.fieldGeometry()");
   const point={x:f.left+f.width*fraction,y:f.top+f.height*.6};
   if(w===1440){
     await page.send("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});
     await page.send("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});
   }else{
     await page.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
     await page.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
   }
   const a=await page.eval(`${trace}(85)`);
   assert.equal(a.launched,true);
   near(a.sprite.x,a.ball.x);near(a.sprite.y,a.ball.y);
   near(a.sprite.pivot.x,a.field.pivot.x);near(a.sprite.pivot.y,a.field.pivot.y);
   near(a.sprite.width,44*.49);near(a.sprite.height,85*.49);
   near(Math.hypot(a.ball.vx,a.ball.vy),330);
   near(Math.atan2(a.ball.vx,-a.ball.vy),a.field.angle);
   aiming.push(a);
  }
  await page.eval("advanceGame(3)");
  await page.shot(path.join(out,`aim-${w}x${h}.png`));
  const overload=await page.eval(`(()=>{
    const q=__pinballTest,ctx=document.querySelector("#game").getContext("2d");
    q.jumpToBoss10();q.setAimAngle(.42);q.chargeFully();
    const fired=q.fireGiant(),centers=[],arc=ctx.arc;
    ctx.arc=function(x,y,r,...params){
      if(r===14)centers.push({x,y});
      return arc.call(this,x,y,r,...params);
    };
    try{advanceGame(1,.001);}finally{ctx.arc=arc;}
    return {fired,centers,field:q.fieldGeometry()};
  })()`);
  assert.equal(overload.fired,true);
  const {pivot,angle}=overload.field;
  assert.ok(overload.centers.some(({x,y})=>Math.abs(x-pivot.x-Math.sin(angle)*26.76)<.001&&
    Math.abs(y-pivot.y+Math.cos(angle)*26.76)<.001),"Overload must also begin at the fixed muzzle");
  captures.push({viewport:[w,h],before,after,aiming,overload});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,"render.json"),JSON.stringify({captures,errors},null,2)+"\n");
 console.log("PASS unchanged four swatches and brick boxes, two brighter purple HP bands, and exact sprite/launch alignment");
}finally{await close();}
