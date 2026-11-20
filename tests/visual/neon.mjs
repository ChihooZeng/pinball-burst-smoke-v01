import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {launchChrome, newPage} from "../release/browser.mjs";

const [output, candidate = "http://127.0.0.1:4178/demo/v1/", baseline = "http://127.0.0.1:4179/demo/v1/"] = process.argv.slice(2);
assert.ok(output, "Usage: node tests/visual/neon.mjs OUTPUT [CANDIDATE_URL] [BASELINE_URL]");
await fs.mkdir(output, {recursive:true});
const seed = 20261118;
const chrome = await launchChrome(9364);
const page = await newPage(9364);
const failures = [];
const screenshots = [];
const measurements = [];
const comparisons = [];
const gunBranches = [];
let viewport, dpr, language, source;
const candidateCommit = process.env.PINBALL_VISUAL_SHA || execFileSync("git", ["log", "-1", "--format=%H", "--", "demo/v1"], {encoding:"utf8"}).trim();

page.on(({method, params}) => {
  if (method === "Runtime.exceptionThrown") failures.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text);
  if (method === "Log.entryAdded" && params.entry.level === "error") failures.push(params.entry.text);
  if (method === "Network.responseReceived" && params.response.status >= 400) failures.push(params.response.status + " " + params.response.url);
  if (method === "Network.loadingFailed" && !params.canceled) failures.push(params.errorText);
});

async function open(url, width, height, density, lang) {
  viewport = [width, height];
  dpr = density;
  language = lang;
  source = url === baseline ? "RC.2" : "candidate";
  await page.viewport(width, height, density, true);
  await page.goto(url);
  await page.eval(`(() => {
    const select = document.querySelector("#startOverlay [data-language]");
    select.value = ${JSON.stringify(lang)};
    select.dispatchEvent(new Event("change"));
  })()`);
  assert.equal(await page.eval("document.documentElement.lang"), lang);
  assert.equal(await page.eval("document.querySelector('#start').disabled"), false);
}

async function tap(selector) {
  const {x,y,hit} = await page.eval(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    element.scrollIntoView({block:"nearest"});
    const r = element.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return {x,y,hit:element.contains(document.elementFromPoint(x,y))};
  })()`);
  assert.ok(hit, `${selector} must receive real touch input`);
  await touch(x,y);
}

async function touch(x,y) {
  await page.send("Input.dispatchTouchEvent", {type:"touchStart",touchPoints:[{x,y}]});
  await page.send("Input.dispatchTouchEvent", {type:"touchEnd",touchPoints:[]});
}

const tick = (frames, milliseconds = 1000/60) => page.eval(`window.__visualStep(${frames},${milliseconds})`);
const state = () => page.eval("__pinballState()");
const start = async () => { await tap("#start"); assert.equal((await state()).phase,"playing"); };
const clear = async () => {
  await page.eval("__pinballTest.clearWave()");
  await tick(140);
  assert.equal((await state()).phase,"choosing");
};
const choose = async id => {
  const before = await state();
  const offer = before.choiceSet.split(",");
  assert.ok(offer.includes(id));
  await tap("#choice" + offer.indexOf(id));
  await tick(100);
  const after = await state();
  assert.equal(after.phase,"playing");
  assert.equal(after.wave,before.wave+1);
};

async function shot(name, scenario = "normal") {
  const {wave, phase, elapsed} = await state();
  const observed = await page.eval(`({
    frame:window.__visualFrame,
    viewport:[innerWidth,innerHeight],
    canvas:[document.querySelector("#game").width,document.querySelector("#game").height]
  })`);
  assert.deepEqual(observed.viewport, viewport);
  const file = name + ".png";
  await page.shot(path.join(output,file));
  screenshots.push({file, source, branch:source === "candidate" ? "codex/v1-visual-fidelity-a1-1-20261120" : "codex/pinball-v1-release", commit:source === "candidate" ? candidateCommit : "4f2498ccbe432b84dbcbf4c18109f3056217e470",
    viewport, dpr, language, seed, wave, phase, elapsed, scenario, ...observed});
}

async function measure(overlay, selectors) {
  const boxes = await page.eval(`(() => {
    const view = document.querySelector(${JSON.stringify(overlay)});
    const rect = el => {
      const r = el.getBoundingClientRect();
      return {x:r.x,y:r.y,w:r.width,h:r.height,scrollW:el.scrollWidth,clientW:el.clientWidth};
    };
    return Object.fromEntries([[view.id,rect(view)],...Array.from(
      view.querySelectorAll(${JSON.stringify(selectors)}),el=>[el.id||el.className,rect(el)])]);
  })()`);
  for (const [name,box] of Object.entries(boxes)) {
    assert.ok(box.x >= 0 && box.x + box.w <= viewport[0]+1, `${name} fits the viewport`);
    assert.ok(box.scrollW <= box.clientW+1, `${name} fits its container`);
  }
  measurements.push({viewport,language,boxes});
}

async function geometry(url, width, height, density) {
  await open(url,width,height,density,"zh-CN");
  const fixture = await page.eval(`(() => {
    const qa=__pinballTest,s=__pinballState(),canvas=document.querySelector("#game");
    const box=canvas.getBoundingClientRect();
    const pixelWidth=Math.round(Math.min(box.width,box.height*360/s.worldHeight)*devicePixelRatio);
    return {world:[s.worldWidth,s.worldHeight,s.dangerY,s.shooterY],
      dimensions:[s.brickWidth,s.brickHeight,s.brickPitchX,s.shotRadius,s.shotCollisionRadius,s.shotSpeed],
      canvas:[canvas.width,canvas.height],expected:[pixelWidth,Math.round(s.worldHeight*pixelWidth/360)],
      plans:Array.from({length:20},(_,i)=>qa.createWavePlan(i+1)),
      opening:qa.brickLayout(),hp:qa.hpDistribution()};
  })()`);
  assert.deepEqual(fixture.canvas,fixture.expected);
  assert.deepEqual(fixture.dimensions.slice(0,5),[29,22,38.5,3.45,2.7]);
  assert.equal(fixture.opening.filter(b=>b.alive).length,35);
  await start();
  const trace = [];
  for (const angle of [0,.22,-.51,.72,-.34,.18]) {
    await page.eval(`__pinballTest.setAimAngle(${angle})`);
    await tick(36);
    trace.push(await page.eval(`(() => {
      const qa=__pinballTest,s=__pinballState();
      return {ball:qa.ballSnapshot(),bricks:qa.brickLayout(),hp:qa.hpDistribution(),
        count:[s.hitCount,s.brickContacts,s.wallBounces,s.shotsFired,s.score,s.charge]};
    })()`));
  }
  const lanes = await page.eval(`(() => {
    const qa=__pinballTest;
    qa.setTestField([{x:130,y:120,hp:2},{x:168.5,y:120,hp:2}]);
    qa.injectTestBall(163.75,154,0,-330);
    window.__visualStep(12,1000/60);
    const gap=qa.ballSnapshot()[0];
    const before=qa.hpDistribution();
    qa.injectTestBall(144.5,154,0,-330);
    window.__visualStep(7,1000/60);
    return {gap,before,hit:qa.ballSnapshot()[0],after:qa.hpDistribution()};
  })()`);
  assert.ok(lanes.gap.y < 120 && lanes.gap.vy < 0 && lanes.gap.contacts === 0, "Ball passes through the 9.5 unit lane");
  assert.ok(lanes.hit.vy > 0 && lanes.after[0].hp < lanes.before[0].hp, "A direct hit both reflects and damages");
  return {fixture,trace,lanes};
}

try {
  for (const domain of ["Page","Runtime","Log","Network"]) await page.send(domain+".enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", {source:`
    window.__PINBALL_TEST__=true;
    window.__PINBALL_SEED__=${seed};
    let rng=${seed};
    Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    let time=0, id=0;
    const callbacks=new Map();
    Object.defineProperty(performance,"now",{value:()=>time});
    window.requestAnimationFrame=callback=>{callbacks.set(++id,callback);return id;};
    window.cancelAnimationFrame=handle=>callbacks.delete(handle);
    window.__visualFrame=0;
    window.__visualStep=(frames,step)=>{
      for(let i=0;i<frames;i++){
        time+=step;
        const current=[...callbacks.values()];
        callbacks.clear();
        for(const draw of current)draw(time);
        window.__visualFrame++;
      }
    };
    const drawImage=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,x,y,w,h){
      if(image.src?.endsWith("/turret-a1-1/barrel.svg")){
        const pose=this.getTransform();
        const tip=pose.transformPoint({x:x+w/2,y:y+h*1.8/78});
        const scale=this.canvas.width/360;
        window.__barrelTip={x:tip.x/scale,y:tip.y/scale,angle:Math.atan2(pose.b,pose.a)};
      }
      return drawImage.apply(this,arguments);
    };
  `});

  for (const [width,height,density] of [[360,640,1],[360,640,2],[390,844,1],[390,844,2]]) {
    const before = await geometry(baseline,width,height,density);
    const after = await geometry(candidate,width,height,density);
    assert.deepEqual(after,before,`RC.2 layout, HP and ball paths at ${width}×${height} DPR ${density}`);
    comparisons.push({width,height,density,plans:after.fixture.plans.length,states:after.trace.length,
      geometry:after.fixture.dimensions,openingTiles:after.fixture.opening.length,lanes:after.lanes});
  }

  for (const [width,height] of [[360,640],[390,844]]) {
    for (const lang of ["zh-CN","en"]) {
      const suffix = width + "x" + height + "-" + (lang === "en" ? "en" : "zh");
      await open(candidate,width,height,2,lang);
      await measure("#startOverlay","#startTitle,#start,.start-options");
      await shot("home-"+suffix);
      await start();
      await touch(width*.72,height*.55);
      assert.ok((await state()).aim > .4);
      await touch(width*.5,height*.55);
      await tick(64);
      assert.equal((await state()).brickCount,35);
      await shot("battle-"+suffix);
      await clear();
      await measure("#choiceOverlay","#choiceTitle,.upgrade-card");
      await shot("upgrade-"+suffix,"QA triggers clear; the original Build.offer renders the cards");
      await choose("arc");
      if (lang === "zh-CN") {
        await tap("#pause");
        assert.equal((await state()).phase,"paused");
        await shot("settings-"+suffix);
        await tap("#resume");
        for (const wave of [3,10,20]) {
          await page.eval(`__pinballTest.spawnWave(${wave});`);
          if (wave === 10) {
            await page.eval("__pinballTest.summonBossBricks()");
            await tick(19);
            await shot("boss-telegraph-"+suffix,"Existing QA triggers the actual Boss warning and spawn");
          }
          await tick(wave === 10 ? 72 : 24);
          await shot(`wave-${wave}-`+suffix,"Existing QA entry places the actual wave");
        }
      }
    }
  }

  await open(candidate,390,844,2,"zh-CN");
  await start();
  const anchor = [];
  for (const angle of [0,-.65,.65,-1.08,1.08]) {
    const point = await page.eval(`(() => {
      const qa=__pinballTest;
      qa.setAimAngle(${angle});
      window.__visualStep(1,0);
      const shot=qa.makeTestBall();
      const s=__pinballState();
      return {tip:window.__barrelTip,pivot:[180,s.shooterY-8],
        shot:[180+Math.sin(${angle})*23.33,s.shooterY-8-Math.cos(${angle})*23.33],
        actualStraightSpawn:[shot.x,shot.y]};
    })()`);
    assert.ok(Math.abs(point.tip.angle-angle)<1e-7);
    point.error=Math.hypot(point.tip.x-point.shot[0],point.tip.y-point.shot[1]);
    assert.ok(point.error<.001, "Canvas transform precision: "+JSON.stringify(point));
    if (angle === 0) assert.ok(Math.hypot(point.tip.x-point.actualStraightSpawn[0],point.tip.y-point.actualStraightSpawn[1])<.001);
    anchor.push(point);
    if (angle === -.65 || angle === .65) await shot(`turret-aim-${angle < 0 ? "left":"right"}`,"Existing QA sets aim before drawing");
  }

  for (const route of ["split","arc","gun"]) {
    await open(candidate,390,844,2,"en");
    await start();
    await clear();
    await choose(route);
    await clear();
    await shot("upgrade-build-"+route,"Second true offer after choosing "+route);
  }
  for (const branch of ["gun-a","gun-b"]) {
    await open(candidate,360,640,2,"zh-CN");
    await start();
    await clear();
    await choose("gun");
    await page.eval(`__pinballTest.configureBuild({gun:3},${JSON.stringify(branch)})`);
    await tick(300);
    const active = await state();
    assert.equal(active.coreBranch,branch);
    assert.ok(active.shotsByBuild.gun > 1);
    assert.ok(active.activeBalls > 0 && active.maxBallsAlive <= 48);
    gunBranches.push({branch,gunShots:active.shotsByBuild.gun,peak:active.maxBallsAlive});
    await shot("battle-"+branch,"Existing QA sets the specialization; automatic fire and collision run for five seconds");
  }

  await tap("#pause");
  await page.eval(`(() => {
    const side=document.querySelector("#skillSide");
    side.value="left";
    side.dispatchEvent(new Event("change"));
  })()`);
  await tap("#autoSkill");
  await tap("#resume");
  await page.eval("__pinballTest.chargeFully()");
  assert.ok(await page.eval("document.querySelector('#giant').getBoundingClientRect().left<24"));
  await tap("#giant");
  assert.equal((await state()).giantActive,true);
  await shot("manual-giant-left","Actual left-side button triggers manual overload with QA-charged energy");

  await open(candidate,390,844,2,"zh-CN");
  await start();
  await page.eval("__pinballTest.setTestField([{x:12,y:__pinballState().dangerY-10,hp:7}])");
  await tick(4);
  assert.equal((await state()).phase,"lost");
  await shot("loss-390x844-zh","Existing QA places a brick beyond the danger line");
  await tap("#home");
  assert.equal((await state()).phase,"ready");

  await open(baseline,390,844,2,"zh-CN");
  await start();
  await tick(64);
  await shot("baseline-battle-390x844-zh");

  assert.deepEqual(failures,[]);
  await fs.writeFile(path.join(output,"evidence.json"),
    JSON.stringify({seed,candidateCommit,screenshots,measurements,comparisons,anchor,gunBranches,failures},null,2)+"\n");
  console.log(`PASS ${comparisons.length*20} plan comparisons, ${screenshots.length} Chromium captures, ${anchor.length} muzzle poses, 0 browser errors`);
} finally {
  await page.close();
  chrome.kill();
}
