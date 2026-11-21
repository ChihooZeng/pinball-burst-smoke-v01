import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {entry,instrument,viewports} from "./browser.mjs";

const [output,url="http://127.0.0.1:4194/demo/v1/",mode="observe"]=process.argv.slice(2);
await fs.mkdir(output,{recursive:true});
const {page,errors,close}=await instrument(9400);
const results=[];
try{
  for(const [width,height] of viewports){
    await page.viewport(width,height,2,width<500);
    await page.goto(entry(url,mode==="assert"?{qa:1,bounds:1}:{}));
    const capture=await page.eval(`(()=>{
      const q=__pinballTest;
      q.begin();
      advanceGame(45);
      const rect=selector=>document.querySelector(selector)?.getBoundingClientRect().toJSON();
      const c=document.querySelector("#game"),state=__pinballState();
      return {arena:rect(".arena"),slot:rect(".playfield"),field:q.fieldGeometry?.(),canvas:rect("#game"),
        backing:[c.width,c.height],world:[state.worldWidth,state.worldHeight],danger:state.dangerY,
        shooter:state.shooterY,dpr:devicePixelRatio,palette:["--cyan","--blue","--periwinkle","--purple","--pink"].map(
          name=>{const css=getComputedStyle(document.documentElement);return (css.getPropertyValue(name==="--purple"?"--brick-purple":name)||css.getPropertyValue(name)).trim();})};
    })()`);
    await page.shot(path.join(output,`battle-${width}x${height}.png`));
    const pressure=await page.eval(`Array.from({length:20},(_,i)=>{
      const q=__pinballTest;q.reset();q.begin();q.spawnWave(i+1);
      const state=__pinballState(),layout=q.brickLayout(),id=layout[0].id;
      const gap=state.dangerY-Math.max(...layout.map(b=>b.y+b.h));
      advanceGame(3);
      const y=q.brickLayout().find(b=>b.id===id).y;
      return {wave:i+1,gap,speed:(y-layout[0].y)/.05,multiplier:state.waveFallMultiplier,
        bricks:layout.length,hp:q.hpDistribution().reduce((sum,b)=>sum+b.hp,0)};
    })`);
    if(mode==="assert"){
      assert.ok(capture.field,"The shared display transform must be present");
      for(const [fieldKey,domKey] of [["left","left"],["top","top"],["width","width"],["height","height"]]){
        assert.ok(Math.abs(capture.field[fieldKey]-capture.canvas[domKey])<.05,fieldKey);
      }
      assert.deepEqual(capture.field.walls,{left:0,right:360,top:4});
      assert.ok(Math.abs(capture.field.walls.right*capture.field.scale-capture.canvas.width)<.05,"real right wall");
      assert.ok(Math.abs(capture.field.walls.top*capture.field.scale-4*capture.canvas.height/capture.world[1])<.05,"actual upper wall");
      const [w,h]=capture.world;
      assert.equal(w,360);
      assert.ok(Math.abs(capture.canvas.width/w-capture.canvas.height/h)<.0002);
      assert.deepEqual(capture.backing,[Math.round(capture.canvas.width*2),Math.round(capture.canvas.height*2)]);
    }
    let runtimeChecks=null;
    if(mode==="assert"){
      await page.eval("__pinballTest.reset();__pinballTest.begin()");
      const box=capture.canvas, y=box.y+box.height*.6;
      await page.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box.x+box.width*.35,y}]});
      await page.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:box.x+box.width*.75,y}]});
      const aim=await page.eval("__pinballState().aim");
      await page.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      assert.ok(Math.abs(aim-.54)<.01,"real pointer and visible field agree");
      runtimeChecks=await page.eval(`(()=>{
        const q=__pinballTest,s=__pinballState(),r=s.shotCollisionRadius;
        const step=(x,y,vx,vy,frames)=>{
          q.injectTestBall(x,y,vx,vy);advanceGame(frames);return q.ballSnapshot()[0];
        };
        const left=step(r+.1,420,-330,0,1),right=step(360-r-.1,420,330,0,1),top=step(15,4+r+.1,0,-330,1);
        q.setTestField([{x:130,y:120,hp:2},{x:168.5,y:120,hp:2}]);
        const gap=step(163.75,154,0,-330,12);
        const hit=step(144.5,154,0,-330,7);
        const shot=q.makeTestBall();
        return {left,right,top,gap,hit,r,hp:q.hpDistribution()[0].hp,
          muzzle:{x:shot.x,y:shot.y},expected:{x:180,y:s.shooterY-8-26.76}};
      })()`);
      assert.ok(runtimeChecks.left.vx>0&&runtimeChecks.right.vx<0&&runtimeChecks.top.vy>0);
      assert.ok(runtimeChecks.left.x>=runtimeChecks.r&&runtimeChecks.right.x<=360-runtimeChecks.r&&runtimeChecks.top.y>=4+runtimeChecks.r);
      assert.ok(runtimeChecks.gap.y<120&&runtimeChecks.gap.vy<0&&runtimeChecks.gap.contacts===0);
      assert.ok(runtimeChecks.hit.vy>0&&runtimeChecks.hp===1);
      assert.deepEqual(runtimeChecks.muzzle,runtimeChecks.expected);
      await page.eval("__pinballTest.setTestField([{x:14,y:__pinballState().dangerY-10,hp:1}]);advanceGame(2)");
      assert.equal(await page.eval("__pinballState().phase"),"lost");
      await page.viewport(width,height-38,3,width<500);
      const resized=await page.eval(`new Promise(resolve=>setTimeout(()=>{
        const c=document.querySelector("#game"),b=c.getBoundingClientRect(),field=__pinballTest.fieldGeometry();
        resolve({view:[b.x,b.width,b.height],mapped:[field.left,field.width],px:[c.width,c.height],world:__pinballState().worldHeight,dpr:devicePixelRatio});
      },100))`);
      assert.deepEqual(resized.view.slice(0,2),resized.mapped);
      assert.deepEqual(resized.px,resized.view.slice(1).map(axis=>Math.round(axis*2)));
      assert.equal(resized.world,capture.world[1]);
      runtimeChecks.resized=resized;
    }
    results.push({width,height,...capture,pressure,runtimeChecks});
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"baseline.json"),JSON.stringify({url,results,errors},null,2)+"\n");
  console.log(results.map(r=>({viewport:[r.width,r.height],outer:r.arena.width,active:r.canvas.width,world:r.world})));
}finally{await close();}
