"use strict";
(() => {
  const W = 360, H = 560, MAX_WAVES = 4;
  const INITIAL_INTERVAL = 1, RATE_VALUES = [1, 0.9, 0.82];
  const MAX_BALLS = 24, BALL_SPEED = 365, BALL_TTL = 7.4, MAX_CHARGE = 100;
  const GIANT_SPEED = 610, GIANT_LIFETIME = 3.3, GIANT_MAX_BOUNCES = 12;
  const SHOT_RADIUS = 3.45, BRICK_COLUMNS = 9, BRICK_W = 29, BRICK_H = 22, BRICK_STEP_X = 38.5, BRICK_STEP_Y = 30;
  const FINAL_RUSH_THRESHOLD=8;
  // 30% -> 15% -> last eight bricks. These are experimental thresholds.
  const ELECTRIC_AWAKEN_RATIO=.30,ELECTRIC_BUILD_RATIO=.15;
  const ELECTRIC_TARGETS=[0,1,2,3],ELECTRIC_COOLDOWN=[Infinity,.44,.28,.16];
  const ELECTRIC_PULSE_EVERY=[Infinity,3,2,1];
  const canvas = document.querySelector("#game"), ctx = canvas.getContext("2d");
  const $ = id => document.querySelector("#" + id);
  const ui = {
    wave: $("wave"), score: $("score"), rate: $("rate"), balls: $("balls"),
    charge: $("chargeText"), fill: $("energyFill"), state: $("stateText"),
    giant: $("giant"), choice: $("choiceOverlay"), win: $("winOverlay"),
    choiceWave: $("choiceWave"), rateDetails: $("rateDetails"),
    bounceDetails: $("bounceDetails"), build: $("buildText"), final: $("finalStats")
  };
  const shooter = {x: W / 2, y: H - 37};
  const palette = ["#498cc2", "#518eae", "#8475c9", "#ba8e5a", "#637ab0"];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  let bricks, balls, particles, giant, aim, activePointer, wave, score;
  let phase, charge, rateLevel, ricochetLevel, splitLevel, chainLevel, shootClock, elapsed;
  let skillsUsed, ricochetTriggers, lastFrame, soundContext;
  let shotsFired, brickContacts, shotMaxContacts, splitBursts, chainBursts, giantRebounds, giantBrickRebounds, giantWallRebounds, giantTotalHits;
  let endgameActive=false,endgameStartedAt=null,endgameElapsed=0,endgameWaveStats=[];
  let lightningArcs=[],lightningTriggers=0,lightningDamage=0,lightningOriginCount=0;
  let electricStage=0,electricStageStarts=[null,null,null,null],electricHitsByStage=[0,0,0,0];
  let waveTotal=0,electricStats=[],electricContactCounter=0;
  // Visual feedback has its own capped state; core physics never stops for animation.
  const reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let impactRings=[], floatTexts=[], combo=0, maxCombo=0, lastBreak=-99, comboVisibility=0, shake=0, hitCount=0;
  const juice=window.PinballJuice.create({W,H,reducedMotion});
  const impactMode=$("impactMode");
  impactMode.value=reducedMotion?"off":"bold";
  if(reducedMotion)impactMode.disabled=true;
  juice.setMode(impactMode.value);
  impactMode.addEventListener("change",()=>{
    impactMode.value=juice.setMode(impactMode.value);
  });
  function unlockSound() {
    try {
      if (!soundContext) soundContext = new (window.AudioContext || window.webkitAudioContext)();
      if (soundContext.state === "suspended") soundContext.resume();
    } catch (_) {}
  }
  function beep(freq, seconds = .04, amp = .026) {
    if (!soundContext) return;
    try {
      const t = soundContext.currentTime, osc = soundContext.createOscillator(), vol = soundContext.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * .58), t + seconds);
      vol.gain.setValueAtTime(amp, t); vol.gain.exponentialRampToValueAtTime(.001, t + seconds);
      osc.connect(vol); vol.connect(soundContext.destination); osc.start(t); osc.stop(t + seconds);
    } catch (_) {}
  }
  function setState(label) { ui.state.textContent = label; }
  function updateUI() {
    ui.wave.textContent = wave + " / " + MAX_WAVES;
    ui.score.textContent = String(score);
    ui.rate.textContent = RATE_VALUES[rateLevel].toFixed(2) + "s";
    ui.balls.textContent = String(balls.length);
    ui.charge.textContent = Math.floor(charge) + "%";
    ui.fill.style.width = charge + "%";
    ui.giant.disabled = phase !== "playing" || charge < MAX_CHARGE || !!giant;
    ui.giant.textContent = charge >= MAX_CHARGE ? (giant ? "弹射中" : "巨型球\nREADY") : ("巨型球\n" + Math.floor(charge) + "%");
    ui.giant.classList.toggle("ready", phase === "playing" && charge >= MAX_CHARGE && !giant);
    ui.build.textContent = "强化：射速 " + rateLevel + " · 折射 " + ricochetLevel + " · 分裂 " + splitLevel + " · 连爆 " + chainLevel;
  }
  function generateWave(n) {
    bricks = [];
    endgameActive=false;endgameStartedAt=null;endgameElapsed=0;
    lightningArcs=[];electricStage=0;waveTotal=(7+n)*BRICK_COLUMNS;
    electricStageStarts=[null,null,null,null];electricHitsByStage=[0,0,0,0];electricContactCounter=0;
    const marker=$("finalRushLabel");
    marker.classList.remove("active");marker.classList.remove("stage-1");
    marker.classList.remove("stage-2");marker.classList.remove("stage-3");
    marker.textContent="";
    const rows = 7 + n, cols = BRICK_COLUMNS;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      // One instantly rewarding energy block in each wave.
      const special = r === 0 && c === 4;
      bricks.push({
        id: n * 1000 + r * cols + c, x: 12 + c * BRICK_STEP_X, y: 47 + r * BRICK_STEP_Y,
        w: BRICK_W, h: BRICK_H, alive: true, special,
        bonk: 0,
        // Keep roughly 15% number-armor while adding more one-hit targets.
        armored: !special && (c === ((r * 3 + 1) % cols) || (r % 3 === 1 && c === ((r * 3 + 4) % cols))),
        color: special ? "#4ac99c" : palette[(r + n - 1) % palette.length]
      });
      const b = bricks[bricks.length-1];
      b.hp = b.armored ? n + 1 : 1;
    }
    setState(n === 1 ? "炮台自动发射 · 拖动瞄准" : "第 " + n + " 波 · 寻找新的弹道");
  }
  function reset() {
    wave = 1; score = 0; phase = "playing"; charge = 0; rateLevel = 0; ricochetLevel = 0; splitLevel=0;chainLevel=0;
    shotsFired=0;brickContacts=0;shotMaxContacts=0;splitBursts=0;chainBursts=0;giantRebounds=0;giantBrickRebounds=0;giantWallRebounds=0;giantTotalHits=0;
    shootClock = .76; elapsed = 0; skillsUsed = 0; ricochetTriggers = 0;
    aim = 0; activePointer = null; balls = []; particles = []; giant = null;
    impactRings=[];floatTexts=[];combo=0;maxCombo=0;lastBreak=-99;comboVisibility=0;shake=0;hitCount=0;
    endgameWaveStats=[];electricStats=[];lightningArcs=[];lightningTriggers=0;lightningDamage=0;lightningOriginCount=0;
    // The FX engine is reusable; reset its transient queues without altering the chosen intensity.
    juice.setMode("off");juice.setMode(impactMode.value);
    ui.choice.classList.add("hidden"); ui.win.classList.add("hidden");
    generateWave(wave); updateUI();
  }
  function livingCount(){return bricks.reduce((n,b)=>n+(b.alive?1:0),0);}
  function stageForRemaining(remaining){
    if(remaining<=0)return electricStage;
    if(remaining<=FINAL_RUSH_THRESHOLD)return 3;
    if(remaining<=Math.ceil(waveTotal*ELECTRIC_BUILD_RATIO))return 2;
    if(remaining<=Math.ceil(waveTotal*ELECTRIC_AWAKEN_RATIO))return 1;
    return 0;
  }
  function updateElectricStage(){
    if(phase!=="playing")return;
    const remaining=livingCount(),next=stageForRemaining(remaining);
    if(next<=electricStage)return;
    // Record intermediate thresholds even if a lucky multi-break skips a stage.
    for(let s=electricStage+1;s<=next;s++)if(electricStageStarts[s]===null)electricStageStarts[s]=elapsed;
    electricStage=next;electricContactCounter=0;
    const marker=$("finalRushLabel");
    for(const st of ["stage-1","stage-2","stage-3"])marker.classList.remove(st);
    marker.classList.add("active");marker.classList.add("stage-"+next);
    const names=["","电流觉醒 · 三撞单链","高压蓄势 · 双撞双链","FINAL RUSH · 每撞三链"];
    marker.textContent=names[next];
    impactVisual(W/2,28,true);
    beep(next===3?750:next===2?630:540,.085,.022);
    setState(names[next]+" · 剩余 "+remaining+" 块");
  }
  function markFinalRush(){
    if(!endgameActive && phase==="playing" && livingCount()>0 && livingCount()<=FINAL_RUSH_THRESHOLD){
      endgameActive=true;endgameStartedAt=elapsed;
      // Entering the last eight must feel earned rather than introducing a new rule.
      updateElectricStage();
    }
  }

  // Test-only shortcut: preserve the ordinary game path, but let human testers
  // reach a representative late-game board without replaying four full waves.
  function previewFinale(targetCount=FINAL_RUSH_THRESHOLD){
    if(phase!=="playing")return false;
    const alive=bricks.filter(b=>b.alive);
    if(alive.length<=targetCount)return false;
    const armor=alive.filter(b=>b.armored),plain=alive.filter(b=>!b.armored);
    function spaced(list,n){
      const out=[];
      for(let i=0;i<Math.min(n,list.length);i++){
        const candidate=list[Math.min(list.length-1,Math.floor((i+.5)*list.length/n))];
        if(candidate&&!out.includes(candidate))out.push(candidate);
      }
      return out;
    }
    const armorCount=targetCount<=8?3:Math.min(armor.length,Math.max(3,Math.round(targetCount*.22)));
    const chosen=[...spaced(armor,armorCount),...spaced(plain,targetCount-armorCount)];
    for(const b of alive)if(!chosen.includes(b))b.alive=false;
    balls=[];giant=null;shootClock=.76;
    updateElectricStage();markFinalRush();
    setState("阶段试玩 · "+targetCount+" 块 · 先命中任意一块");
    updateUI();
    return true;
  }
  function addCharge(n) {
    charge = clamp(charge + n, 0, MAX_CHARGE);
  }
  function burst(x, y, color, n = 9) {
    for (let i = 0; i < (reducedMotion ? Math.ceil(n/3) : n); i++) {
      const a = Math.random() * Math.PI * 2, speed = 32 + Math.random() * 105;
      particles.push({x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .42, color});
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }
  function impactVisual(x,y,hard=false) {
    if (reducedMotion) return;
    impactRings.push({x,y,age:0,hard});
    if(impactRings.length>28)impactRings.shift();
  }
  function numberPop(x,y,text,color) {
    if (reducedMotion) return;
    floatTexts.push({x,y,text,color,age:0});
    if(floatTexts.length>36)floatTexts.shift();
  }
  function hitBrick(b, source = "normal", impact = null) {
    if (!b.alive) return false;
    hitCount++;
    // A regular shot or splash removes one point; giant projectile pierces armor.
    if (source !== "giant" && b.hp > 1) {
      b.hp -= 1;
      b.bonk=.12;
      impactVisual(b.x+b.w/2,b.y+b.h/2,false);
      numberPop(b.x+b.w/2,b.y-1,"−1","#ffdfb2");
      burst(b.x+b.w/2,b.y+b.h/2,"#ffd29d",3);
      beep(285+(b.hp*20),.033,.018);
      juice.onArmor(b,impact);
      return false;
    }
    // v0.9B two-stage armor: removing the last HP cracks the shell, not the
    // underlying one-hit brick. Reflect the incoming ball on this hit.
    if(source!=="giant" && b.armored && b.hp===1){
      b.hp=0;b.armored=false;b.cracked=true;b.bonk=.12;
      b.color="#76b8d2";
      impactVisual(b.x+b.w/2,b.y+b.h/2,true);
      numberPop(b.x+b.w/2,b.y-4,"破甲!","#ffe2ad");
      burst(b.x+b.w/2,b.y+b.h/2,"#ffd49b",12);
      juice.onArmor(b,impact);
      beep(525,.075,.037);
      setState("装甲破裂！下一击可以穿透");
      return false;
    }
    b.hp=0; b.alive=false;score++;
    const cx=b.x+b.w/2,cy=b.y+b.h/2;
    if(elapsed-lastBreak<=1.25)combo++;else combo=1;
    lastBreak=elapsed;maxCombo=Math.max(combo,maxCombo);
    comboVisibility=1;
    impactVisual(cx,cy,true);
    if(combo>=3 && combo%3===0)numberPop(cx,cy-12,combo+" 连碎!","#a5f8df");
    if(source==="giant")shake=Math.max(shake,.11);
    juice.onBreak(b,{combo,source,impact});
    burst(cx,cy,b.color,source==="giant"?19:12);
    // Giant impacts (including energy bricks) never refill the giant itself.
    if (source !== "giant") addCharge((b.special ? 34 : 7));
    if (b.special && source !== "giant") { setState("ENERGY 特殊砖已击碎 · 巨型球充能！"); beep(660, .09); }
    else beep(source === "giant" ? 240 : 320 + Math.min(combo * 42, 280), .035, .022 + Math.min(combo,6)*.001);
    if(chainLevel>0&&source==="normal"&&combo>=5&&combo%5===0&&phase==="playing"){
      chainBursts++;
      const adjacent=bricks.filter(t=>t.alive&&!t.armored&&Math.hypot(t.x+t.w/2-cx,t.y+t.h/2-cy)<65)
        .sort((a,b)=>Math.hypot(a.x+a.w/2-cx,a.y+a.h/2-cy)-Math.hypot(b.x+b.w/2-cx,b.y+b.h/2-cy));
      adjacent.slice(0,chainLevel===1?2:3).forEach(t=>hitBrick(t,"chain"));
      juice.onSplash({x:cx,y:cy});
      setState("连锁爆破 · 震碎周围砖块！");
    }
    return true;
  }
  function splashFrom(b, center) {
    if (ricochetLevel < 1 || b.splashUsed || !b.wallArmed) return;
    b.splashUsed = true; b.wallArmed = false; ricochetTriggers++;
    const radius = ricochetLevel === 1 ? 84 : 116;
    const maxNeighbors = ricochetLevel === 1 ? 1 : 3;
    const nearby = bricks.filter(other => other.alive && 
      Math.hypot(other.x + other.w/2 - center.x, other.y + other.h/2 - center.y) < radius
    ).sort((a,c) => 
      Math.hypot(a.x+a.w/2-center.x,a.y+a.h/2-center.y) -
      Math.hypot(c.x+c.w/2-center.x,c.y+c.h/2-center.y)
    );
    nearby.slice(0, maxNeighbors).forEach(target => hitBrick(target, "splash"));
    burst(center.x, center.y, "#a1edff", 14); impactVisual(center.x,center.y,true); beep(800, .075, .037);
    juice.onSplash(center);
    setState("折射溅射！利用侧墙提高破坏力");
  }
  function makeBall(angle, mini=false){
    return {x:shooter.x,y:shooter.y-28,
      vx:Math.sin(angle)*BALL_SPEED,vy:-Math.cos(angle)*BALL_SPEED,
      r:mini?SHOT_RADIUS*.83:SHOT_RADIUS,life:0,trail:[],
      wallArmed:false,splashUsed:false,contacts:0,mini};
  }
  function fire() {
    if (phase !== "playing" || balls.length >= MAX_BALLS) return;
    balls.push(makeBall(aim));
    shotsFired++;
    // Every third regular volley splits into two smaller satellite trajectories.
    if(splitLevel>0 && shotsFired%3===0){
      const offset=.17;
      for(const a of [-offset,offset]){
        if(balls.length<MAX_BALLS)balls.push(makeBall(clamp(aim+a,-1.08,1.08),true));
      }
      splitBursts++;
      setState("分裂齐射 · 三路夹击！");
    }
    beep(235, .018, .007);
  }
  function fireGiant() {
    if (phase !== "playing" || charge < MAX_CHARGE || giant) return false;
    unlockSound();
    charge=0;skillsUsed++;
    giant={x:shooter.x,y:shooter.y-27,
      vx:Math.sin(aim)*GIANT_SPEED,vy:-Math.cos(aim)*GIANT_SPEED,
      r:14,life:0,collisions:0,bounces:0,pierceLeft:2,lastBounceFx:-100,trail:[]};
    burst(shooter.x,shooter.y-27,"#ffd482",24);
    beep(175,.18,.05);setState("巨型弹球：贯穿 × 反弹！");updateUI();
    juice.onGiant(shooter.x,shooter.y-27);
    return true;
  }
  function circleIntersectsRect(x,y,radius,block){
    const px=clamp(x,block.x,block.x+block.w);
    const py=clamp(y,block.y,block.y+block.h);
    return (x-px)**2+(y-py)**2<=radius*radius;
  }
  // Circle-vs-rounded-rectangle contact normal, using prior position as fallback
  // for a ball that briefly steps inside a brick. The normal controls reflection.
  function contactNormal(ball,block,prevX,prevY){
    const px=clamp(ball.x,block.x,block.x+block.w);
    const py=clamp(ball.y,block.y,block.y+block.h);
    const dx=ball.x-px,dy=ball.y-py,d=Math.hypot(dx,dy);
    if(d>.0001)return {nx:dx/d,ny:dy/d,overlap:Math.max(0,ball.r-d)};
    if(prevY+ball.r<=block.y)return {nx:0,ny:-1,overlap:ball.r};
    if(prevY-ball.r>=block.y+block.h)return {nx:0,ny:1,overlap:ball.r};
    if(prevX+ball.r<=block.x)return {nx:-1,ny:0,overlap:ball.r};
    if(prevX-ball.r>=block.x+block.w)return {nx:1,ny:0,overlap:ball.r};
    const dl=ball.x-block.x,dr=block.x+block.w-ball.x;
    const dt=ball.y-block.y,db=block.y+block.h-ball.y;
    const nearest=Math.min(dl,dr,dt,db);
    return nearest===dl?{nx:-1,ny:0,overlap:ball.r+dl}:
      nearest===dr?{nx:1,ny:0,overlap:ball.r+dr}:
      nearest===dt?{nx:0,ny:-1,overlap:ball.r+dt}:{nx:0,ny:1,overlap:ball.r+db};
  }
  function reflect(ball,normal){
    const dot=ball.vx*normal.nx+ball.vy*normal.ny;
    // Only reverse motion if traveling into the surface, not while separating.
    if(dot<0){
      ball.vx-=2*dot*normal.nx;
      ball.vy-=2*dot*normal.ny;
    }
    ball.x+=normal.nx*(normal.overlap+.42);
    ball.y+=normal.ny*(normal.overlap+.42);
  }
  // Lightning is an additional one-point chain, not an automatic target-seeker.
  // Each real ball collision is an independent origin. Damage by lightning
  // never recursively triggers lightning, avoiding exponential clear-outs.
  function triggerLightning(origin,ball){
    updateElectricStage();
    if(electricStage===0||!origin||livingCount()===0)return false;
    if(ball && elapsed-(ball.lastLightningAt??-999)<ELECTRIC_COOLDOWN[electricStage])return false;
    const index=electricContactCounter++;
    // Stage 1 sparks on the 1st/4th/7th natural hit; stage 2 on 1st/3rd/5th.
    // The finale restores lightning on every eligible collision.
    if(index%ELECTRIC_PULSE_EVERY[electricStage]!==0)return false;
    if(ball)ball.lastLightningAt=elapsed;
    const survivors=bricks.filter(b=>b.alive&&b.id!==origin.id);
    if(!survivors.length){
      // Last armored brick: a successful physical hit makes a tiny return spark.
      // It can only chip one extra armor point, never auto-delete a plain brick.
      if(electricStage<3||!origin.alive||!origin.armored)return false;
      lightningTriggers++;lightningOriginCount++;electricHitsByStage[electricStage]++;
      const cx=origin.x+origin.w/2,cy=origin.y+origin.h/2;
      if(!reducedMotion){
        lightningArcs.push({points:[
          {x:cx-13,y:cy-8},{x:cx-4,y:cy+1},{x:cx+7,y:cy-6},
          {x:cx+11,y:cy+5},{x:cx-2,y:cy+9},{x:cx,y:cy}
        ],age:0,duration:.3});
        if(lightningArcs.length>42)lightningArcs.splice(0,lightningArcs.length-42);
      }
      hitBrick(origin,"lightning");
      lightningDamage++;
      setState("末块电流回响 · 装甲继续崩解！");
      return true;
    }
    lightningOriginCount++;lightningTriggers++;electricHitsByStage[electricStage]++;
    const seen=new Set([origin.id]);
    let previous={x:origin.x+origin.w/2,y:origin.y+origin.h/2};
    let hit=0;
    for(let i=0;i<ELECTRIC_TARGETS[electricStage];i++){
      // Electricity is built to chip numeric armor, not instantly erase the field.
      // If no numbered targets remain, only ONE ordinary tile may receive overflow
      // damage per real collision. Lightning hits never spawn additional chains.
      const armorTargets=bricks.filter(b=>b.alive&&b.armored&&!seen.has(b.id));
      // While charging, electric damage weakens armor only. The last eight
      // permit one ordinary clean-up hit if all numbered armor is gone.
      const options=armorTargets.length?armorTargets:
        (electricStage===3&&i===0)?bricks.filter(b=>b.alive&&!seen.has(b.id)):[];
      if(!options.length)break;
      options.sort((a,b)=>
        Math.hypot(a.x+a.w/2-previous.x,a.y+a.h/2-previous.y)-
        Math.hypot(b.x+b.w/2-previous.x,b.y+b.h/2-previous.y)
      );
      const target=options[0];seen.add(target.id);
      const tx=target.x+target.w/2,ty=target.y+target.h/2;
      if(!reducedMotion){
        const points=[{x:previous.x,y:previous.y}];
        for(let seg=1;seg<7;seg++){
          const t=seg/7,wiggle=Math.sin((elapsed*173+i*11+seg*9)*2.3)*5;
          const dx=tx-previous.x,dy=ty-previous.y,mag=Math.max(1,Math.hypot(dx,dy));
          points.push({x:previous.x+dx*t-dy/mag*wiggle,y:previous.y+dy*t+dx/mag*wiggle});
        }
        points.push({x:tx,y:ty});
        lightningArcs.push({points,age:0,duration:.3});
        if(lightningArcs.length>42)lightningArcs.splice(0,lightningArcs.length-42);
      }
      hitBrick(target,"lightning");
      lightningDamage++;hit++;
      previous={x:tx,y:ty};
    }
    if(hit){
      burst(origin.x+origin.w/2,origin.y+origin.h/2,"#9feeff",6);
      setState("闪电连锁 · 多球同时传递伤害！");
      beep(690,.07,.018);
    }
    return hit>0;
  }
  function updateBall(ball,dt){
    const speed=Math.hypot(ball.vx,ball.vy);
    const steps=Math.max(4,Math.ceil(speed*dt/3.1));
    const step=dt/steps;
    for(let i=0;i<steps;i++){
      const prevX=ball.x,prevY=ball.y;
      ball.x+=ball.vx*step;ball.y+=ball.vy*step;
      if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx);ball.wallArmed=true;}
      if(ball.x>W-ball.r){ball.x=W-ball.r;ball.vx=-Math.abs(ball.vx);ball.wallArmed=true;}
      if(ball.y<ball.r+4){ball.y=ball.r+4;ball.vy=Math.abs(ball.vy);}
      for(const block of bricks){
        if(!block.alive||!circleIntersectsRect(ball.x,ball.y,ball.r,block))continue;
        const normal=contactNormal(ball,block,prevX,prevY);
        const incoming={vx:ball.vx,vy:ball.vy};
        const destroyed=hitBrick(block,"normal",incoming);
        ball.contacts++;brickContacts++;
        shotMaxContacts=Math.max(shotMaxContacts,ball.contacts);
        const center={x:block.x+block.w/2,y:block.y+block.h/2};
        splashFrom(ball,center);
        markFinalRush();
        triggerLightning(block,ball);
        // A fragile brick that has just been destroyed no longer blocks the ball:
        // continue along the original trajectory. Armored surviving bricks reflect.
        if(!destroyed)reflect(ball,normal);
        break;
      }
    }
    ball.life+=dt;
    ball.trail.unshift({x:ball.x,y:ball.y});
    if(ball.trail.length>9)ball.trail.pop();
    return ball.y<H+10&&ball.life<BALL_TTL;
  }
  function recordGiantBounce(kind){
    giant.bounces++;giantRebounds++;
    if(kind==="brick")giantBrickRebounds++;else giantWallRebounds++;
    if(giant.life-giant.lastBounceFx>.075){
      giant.lastBounceFx=giant.life;
      juice.onSplash({x:giant.x,y:giant.y});
      burst(giant.x,giant.y,"#ffd387",7);
      beep(290,.035,.015);
    }
  }
  function updateGiant(dt){
    if(!giant)return;
    const speed=Math.hypot(giant.vx,giant.vy);
    const steps=Math.max(5,Math.ceil(speed*dt/3.8)),step=dt/steps;
    for(let i=0;i<steps;i++){
      const prevX=giant.x,prevY=giant.y;
      giant.x+=giant.vx*step;giant.y+=giant.vy*step;
      if(giant.x<giant.r){giant.x=giant.r;giant.vx=Math.abs(giant.vx);recordGiantBounce("wall");}
      if(giant.x>W-giant.r){giant.x=W-giant.r;giant.vx=-Math.abs(giant.vx);recordGiantBounce("wall");}
      if(giant.y<giant.r+4){giant.y=giant.r+4;giant.vy=Math.abs(giant.vy);recordGiantBounce("wall");}
      // A short-lived force-field floor keeps the ultimate circulating in the brick arena.
      if(giant.y>H-83-giant.r){giant.y=H-83-giant.r;giant.vy=-Math.abs(giant.vy);recordGiantBounce("wall");}
      for(const block of bricks){
        if(!block.alive||!circleIntersectsRect(giant.x,giant.y,giant.r,block))continue;
        const normal=contactNormal(giant,block,prevX,prevY);
        const impact={vx:giant.vx,vy:giant.vy};
        hitBrick(block,"giant",impact);
        markFinalRush();
        triggerLightning(block,giant);
        giant.collisions++;giantTotalHits++;
        // Heavy ball punches through two bricks before a physically directed ricochet.
        if(giant.pierceLeft>0){giant.pierceLeft--;}
        else {
          reflect(giant,normal);giant.pierceLeft=2;
          recordGiantBounce("brick");
        }
        break;
      }
      if(giant.bounces>=GIANT_MAX_BOUNCES)break;
    }
    giant.life+=dt;
    giant.trail.unshift({x:giant.x,y:giant.y});
    if(giant.trail.length>10)giant.trail.pop();
    if(giant.life>GIANT_LIFETIME||giant.bounces>=GIANT_MAX_BOUNCES)giant=null;
  }
  function finishWave() {
    if (phase !== "playing") return;
    if(endgameStartedAt!==null){endgameElapsed=elapsed-endgameStartedAt;
      endgameWaveStats.push({wave,seconds:+endgameElapsed.toFixed(2)});}
    electricStats.push({wave,thresholds:[Math.ceil(waveTotal*.30),Math.ceil(waveTotal*.15),8],
      entries:electricStageStarts.slice(1).map(t=>t===null?null:+t.toFixed(2)),
      hits:electricHitsByStage.slice(1)});
    $("finalRushLabel").classList.remove("active");
    // Stop attacks during selection so old balls cannot clear the next wave.
    balls = []; giant = null; shootClock = 0;
    if (wave === MAX_WAVES) {
      phase = "won"; ui.win.classList.remove("hidden");
      ui.final.textContent = "击碎 " + score + " 块 · 巨型球 " + skillsUsed + " 次 · 分裂 " + splitBursts + " 次 · 连爆 " + chainBursts + " 次";
      setState("四波完成"); beep(710, .16, .045);
    } else {
      phase = "choosing"; ui.choice.classList.remove("hidden");
      ui.choiceWave.textContent = "WAVE " + wave + " CLEAR";
      ui.rateDetails.textContent = rateLevel === 0 ? "1.00 → 0.90 秒/颗" : "0.90 → 0.82 秒/颗";
      ui.bounceDetails.textContent = ricochetLevel === 0 ?
        "侧墙反弹后首次击砖，额外影响邻近 1 块" :
        "折射半径更大，最多影响 3 块";
      $("splitDetails").textContent = splitLevel===0?"每第 3 次发射，追加两颗侧向小弹球":"已解锁：三路夹击";
      $("chainDetails").textContent = chainLevel===0?"每 5 连碎，震碎附近 2 块普通砖":"连爆范围扩大";
      $("pickSplit").disabled=splitLevel>=1;
      $("pickRate").disabled=rateLevel>=2;
      $("pickBounce").disabled=ricochetLevel>=2;
      $("pickChain").disabled=chainLevel>=2;
      setState("波次完成 · 请选择强化");
    }
    updateUI();
  }
  function chooseUpgrade(kind) {
    if (phase !== "choosing") return false;
    if (kind === "rate") rateLevel = Math.min(2, rateLevel + 1);
    else if (kind === "bounce") ricochetLevel = Math.min(2, ricochetLevel + 1);
    else if (kind === "split") splitLevel=Math.min(1,splitLevel+1);
    else if (kind === "chain") chainLevel=Math.min(2,chainLevel+1);
    else return false;
    wave++; shootClock = RATE_VALUES[rateLevel] - .3;
    balls = []; giant = null; phase = "playing";
    ui.choice.classList.add("hidden"); generateWave(wave);
    updateUI(); beep(590, .085, .033);
    return true;
  }
  function update(dt) {
    if (phase !== "playing") return;
    elapsed += dt; shootClock += dt;
    if (shootClock >= RATE_VALUES[rateLevel]) {
      shootClock -= RATE_VALUES[rateLevel];
      fire();
    }
    balls = balls.filter(b => updateBall(b, dt));
    lightningArcs.forEach(e=>e.age+=dt);lightningArcs=lightningArcs.filter(e=>e.age<e.duration);
    updateGiant(dt);
    if (bricks.every(b => !b.alive)) finishWave();
    particles.forEach(p => {p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt;});
    particles = particles.filter(p => p.life > 0);
    for (const b of bricks) if(b.alive&&b.bonk>0) b.bonk=Math.max(0,b.bonk-dt);
    impactRings.forEach(e=>e.age+=dt);impactRings=impactRings.filter(e=>e.age<(e.hard?.24:.15));
    floatTexts.forEach(e=>e.age+=dt);floatTexts=floatTexts.filter(e=>e.age<.56);
    comboVisibility=Math.max(0,comboVisibility-dt);
    shake=Math.max(0,shake-dt);
    juice.update(dt,bricks);
    updateUI();
  }
  function rounded(x,y,w,h,r) {ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function draw() {
    ctx.clearRect(0,0,W,H);
    ctx.save();
    // Existing v0.5 giant-only shake remains when additional effects are off.
    if(juice.mode==="off"&&shake>0&&!reducedMotion){
      const amp=2.1*Math.min(1,shake/.09);
      ctx.translate((Math.random()-.5)*amp*2,(Math.random()-.5)*amp*2);
    }
    juice.applyCamera(ctx);
    const bg = ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,"#0c2039");bg.addColorStop(1,"#081526");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#ffffff08";ctx.lineWidth=1;
    for(let x=0;x<W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    for(const brick of bricks){
      if(!brick.alive) continue;
      ctx.save();
      if(juice.mode!=="off")juice.applyBrickMotion(ctx,brick);
      else if(brick.bonk>0 && !reducedMotion){
        const intensity=Math.sin((brick.bonk/.12)*Math.PI)*.045;
        ctx.translate(brick.x+brick.w/2,brick.y+brick.h/2);
        ctx.scale(1+intensity,1-intensity);
        ctx.translate(-brick.x-brick.w/2,-brick.y-brick.h/2);
      }
      ctx.shadowColor=brick.color;ctx.shadowBlur=7;ctx.fillStyle=brick.color;
      rounded(brick.x,brick.y,brick.w,brick.h,4);ctx.fill();ctx.shadowBlur=0;
      if (brick.armored) {
        ctx.fillStyle=brick.bonk>0?"#f2b784":"#ca8753";
        rounded(brick.x,brick.y,brick.w,brick.h,4);ctx.fill();
        ctx.fillStyle="#fff7e9"; ctx.font="bold 12px system-ui"; ctx.textAlign="center";
        ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+16);
        if(brick.hp>1){
          ctx.strokeStyle="#824329";ctx.lineWidth=1.3;
          ctx.beginPath();ctx.moveTo(brick.x+6,brick.y+4);
          ctx.lineTo(brick.x+11,brick.y+9);ctx.lineTo(brick.x+8,brick.y+14);ctx.stroke();
        }
      } else if(brick.special){
        ctx.fillStyle="#073e2b";ctx.font="bold 6px system-ui";ctx.textAlign="center";
        ctx.fillText("ENERGY",brick.x+brick.w/2,brick.y+15);
      }else{
        ctx.fillStyle="#ffffff3f";rounded(brick.x+3,brick.y+3,brick.w-6,3,2);ctx.fill();
        if(brick.cracked){
          ctx.strokeStyle="#fff1bc";ctx.lineWidth=1.3;ctx.beginPath();
          ctx.moveTo(brick.x+7,brick.y+2);ctx.lineTo(brick.x+13,brick.y+10);
          ctx.lineTo(brick.x+9,brick.y+15);ctx.lineTo(brick.x+18,brick.y+21);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.fillStyle="#93b6d23d";ctx.fillRect(0,H-78,W,1);
    if(phase==="playing"){
      ctx.save();ctx.setLineDash([6,8]);ctx.lineWidth=2;ctx.strokeStyle="#9eeaff88";
      ctx.beginPath();ctx.moveTo(shooter.x,shooter.y-17);
      ctx.lineTo(shooter.x+Math.sin(aim)*220,shooter.y-17-Math.cos(aim)*220);
      ctx.stroke();ctx.restore();
    }
    for(const b of balls){
      b.trail.forEach((p,i)=>{const t=1-i/b.trail.length;ctx.fillStyle="rgba(139,224,250,"+(.18*t)+")";
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,b.r*t*.7),0,Math.PI*2);ctx.fill();});
      ctx.shadowColor=b.wallArmed && ricochetLevel ? "#b3abff" : "#b9f2ff";
      ctx.shadowBlur=10;ctx.fillStyle=b.wallArmed && ricochetLevel ? "#e3d9ff" : "#edfaff";
      ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    if(giant){
      ctx.save();ctx.strokeStyle="#ffe1a36b";ctx.lineWidth=23;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(giant.x-giant.vx*.09,giant.y-giant.vy*.09);ctx.lineTo(giant.x,giant.y);ctx.stroke();
      ctx.shadowColor="#ffca62";ctx.shadowBlur=25;ctx.fillStyle="#ffd87c";
      ctx.beginPath();ctx.arc(giant.x,giant.y,giant.r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff1c7";ctx.beginPath();ctx.arc(giant.x-4,giant.y-5,6,0,Math.PI*2);ctx.fill();
      // A ring and retained trajectory emphasize the ultimate's rebounds.
      ctx.shadowBlur=0;ctx.lineWidth=2;ctx.strokeStyle="#fff9d0";
      ctx.beginPath();ctx.arc(giant.x,giant.y,giant.r+3,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
    if(!reducedMotion){
      ctx.save();
      for(const arc of lightningArcs){
        const a=Math.max(0,1-arc.age/arc.duration);
        ctx.globalAlpha=a;
        ctx.strokeStyle="#53d8ff";ctx.lineWidth=4.2;ctx.shadowColor="#73bfff";ctx.shadowBlur=12;
        ctx.beginPath();arc.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
        ctx.shadowBlur=0;ctx.lineWidth=1.45;ctx.strokeStyle="#f5fcff";ctx.stroke();
      }
      ctx.restore();
    }
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.42,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);}
    ctx.globalAlpha=1;
    juice.draw(ctx);
    if(!reducedMotion){
      for(const e of impactRings){
        const duration=e.hard?.24:.15, t=clamp(e.age/duration,0,1);
        ctx.strokeStyle=e.hard?"rgba(182,241,255,"+(.65*(1-t))+")":"rgba(255,217,154,"+(.4*(1-t))+")";
        ctx.lineWidth=e.hard?2.4:1.5;
        ctx.beginPath();ctx.arc(e.x,e.y,5+(e.hard?27:15)*t,0,Math.PI*2);ctx.stroke();
      }
      for(const e of floatTexts){
        const t=clamp(e.age/.56,0,1);
        ctx.globalAlpha=1-t;ctx.fillStyle=e.color;ctx.textAlign="center";ctx.font="bold 13px system-ui";
        ctx.fillText(e.text,e.x,e.y-8-t*23);
      }
      ctx.globalAlpha=1;
    }
    if(combo>=2 && comboVisibility>0){
      ctx.globalAlpha=clamp(comboVisibility*2,0,1);
      ctx.fillStyle=combo>=5?"#ffcf8d":"#a6efd9";ctx.font="bold 17px system-ui";ctx.textAlign="center";
      ctx.fillText(combo+" COMBO",W/2,335);ctx.globalAlpha=1;
    }
    ctx.save();ctx.translate(shooter.x,shooter.y);ctx.rotate(aim);
    ctx.shadowColor="#5be9fb";ctx.shadowBlur=16;ctx.fillStyle="#398ba4";
    rounded(-15,-10,30,30,9);ctx.fill();ctx.fillStyle="#b7edff";
    rounded(-5,-29,10,27,4);ctx.fill();ctx.restore();
    ctx.fillStyle="#a6c5d9";ctx.textAlign="center";ctx.font="12px system-ui";
    ctx.fillText(phase==="choosing"?"选择强化以继续":phase==="won"?"通关！":"自动发射 · 滑动瞄准 · 连锁击碎",W/2,H-10);
    ctx.restore();
  }
  function setAim(e) {
    const box = canvas.getBoundingClientRect();
    const x = clamp((e.clientX-box.left)*W/box.width,0,W);
    aim = clamp((x-W/2)/(W/2)*1.08,-1.08,1.08);
  }
  canvas.addEventListener("pointerdown",e=>{
    if(phase!=="playing") return;
    e.preventDefault();unlockSound();activePointer=e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);setAim(e);
  });
  canvas.addEventListener("pointermove",e=>{
    if(phase!=="playing"||e.pointerId!==activePointer) return;
    e.preventDefault();setAim(e);
  });
  function stopAim(e){if(e.pointerId===activePointer) activePointer=null;}
  canvas.addEventListener("pointerup",stopAim);
  canvas.addEventListener("pointercancel",stopAim);
  ui.giant.addEventListener("click",fireGiant);
  $("previewFinale").addEventListener("click",()=>{
    unlockSound();
    const stage=$("previewStage").value;
    const count=stage==="awaken"?Math.ceil(waveTotal*.30):
      stage==="build"?Math.ceil(waveTotal*.15):FINAL_RUSH_THRESHOLD;
    previewFinale(count);
  });
  $("pickRate").addEventListener("click",()=>{unlockSound();chooseUpgrade("rate");});
  $("pickBounce").addEventListener("click",()=>{unlockSound();chooseUpgrade("bounce");});
  $("pickSplit").addEventListener("click",()=>{unlockSound();chooseUpgrade("split");});
  $("pickChain").addEventListener("click",()=>{unlockSound();chooseUpgrade("chain");});
  $("again").addEventListener("click",()=>{unlockSound();reset();});
  $("reset").addEventListener("click",()=>{unlockSound();reset();});
  window.addEventListener("keydown",e=>{
    if(e.code==="ArrowLeft"){aim=clamp(aim-.09,-1.08,1.08);e.preventDefault();}
    if(e.code==="ArrowRight"){aim=clamp(aim+.09,-1.08,1.08);e.preventDefault();}
    if(e.code==="Space"){fireGiant();e.preventDefault();}
  });
  function frame(now) {
    const dt = document.hidden ? 0 : clamp((now-lastFrame)/1000,0,.045);
    lastFrame=now;update(dt);draw();requestAnimationFrame(frame);
  }
  function snapshot() {
    return {phase,wave,score,aim,interval:RATE_VALUES[rateLevel],rateLevel,ricochetLevel,
      charge,activeBalls:balls.length,giantActive:!!giant,skillsUsed,ricochetTriggers,elapsed,
      splitLevel,chainLevel,shotsFired,brickContacts,shotMaxContacts,splitBursts,chainBursts,giantRebounds,
      giantBrickRebounds,giantWallRebounds,giantTotalHits,
      endgameActive,endgameRemaining:livingCount(),endgameStartedAt,endgameElapsed,endgameWaveStats:JSON.stringify(endgameWaveStats),finalRushThreshold:FINAL_RUSH_THRESHOLD,
      lightningTriggers,lightningDamage,lightningArcCount:lightningArcs.length,
      electricStage,electricMaxTargets:ELECTRIC_TARGETS[electricStage],electricPulseEvery:ELECTRIC_PULSE_EVERY[electricStage],electricContactCounter,
      electricHitsByStage:JSON.stringify(electricHitsByStage),
      electricStats:JSON.stringify(electricStats),
      waveTotal,electricAwakenAt:Math.ceil(waveTotal*.30),electricBuildAt:Math.ceil(waveTotal*.15),
      giantHits:giant?.collisions||0,giantBounces:giant?.bounces||0,
      combo,maxCombo,hitCount,shotRadius:SHOT_RADIUS,shotSpeed:BALL_SPEED,brickWidth:BRICK_W,brickHeight:BRICK_H,
      brickPitchX:BRICK_STEP_X,brickPitchY:BRICK_STEP_Y,
      fxRings:impactRings.length,fxText:floatTexts.length,fxParticles:particles.length,
      visualImpact:juice.snapshot()};
  }
  window.__pinballCompare = () => ({ ...snapshot(), remaining: bricks.filter(b => b.alive).length, armored: bricks.filter(b => b.alive && b.armored).length, cracked: bricks.filter(b => b.alive && b.cracked).length, armorHp: bricks.filter(b => b.alive && b.armored).reduce((n,b) => n + b.hp,0) });
  // In production only a read-only diagnostics snapshot is available.
  window.__pinballState = snapshot;
  // Isolated test interface: only enabled explicitly by the Node regression harness.
  if (window.__PINBALL_TEST__ === true) {
    window.__pinballTest = {
      clearWave(){
        bricks.forEach(b=>{b.alive=false;});finishWave();
      },
      chargeFully(){charge=100;updateUI();},
      injectRicochet(){
        const target=bricks.find(b=>b.alive&&!b.special);
        if(!target)return;
        const b={wallArmed:true,splashUsed:false};
        const p={x:target.x+target.w/2,y:target.y+target.h/2};
        hitBrick(target);splashFrom(b,p);updateUI();
      },
      firstBrick(){return bricks.find(b=>b.alive);},
      firstArmor(){return bricks.find(b=>b.alive && b.armored);},
      brickLayout(){return bricks.map(b=>({id:b.id,x:b.x,y:b.y,w:b.w,h:b.h,alive:b.alive}));},
      chooseByKind:chooseUpgrade,
      fireGiant,
      physicsNormal:contactNormal,
      physicsReflect:reflect,
      ballSnapshot(){return balls.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,contacts:b.contacts||0,homing:!!b.homing}));},
      leaveBricks(n){let kept=0;for(const b of bricks){if(!b.alive)continue;if(kept++>=n)b.alive=false;}return bricks.filter(b=>b.alive);},
      markFinalRush,updateElectricStage,previewElectricStage:previewFinale,
      previewFinale,
      triggerLightningById(id,ball=null){const b=bricks.find(x=>x.id===id);return b?triggerLightning(b,ball):false;},
      addTestBall(x,y,vx=0,vy=-BALL_SPEED){balls.push({x,y,vx,vy,r:SHOT_RADIUS,life:0,trail:[],wallArmed:false,splashUsed:false,contacts:0});},
      keepOnlyBrick(id){bricks.forEach(b=>{if(b.id!==id)b.alive=false;});},
      allBricks(){return bricks;},
      injectTestBall(x,y,vx=0,vy=-BALL_SPEED){
        balls=[];shootClock=-10000;
        balls.push({x,y,vx,vy,r:SHOT_RADIUS,life:0,trail:[],wallArmed:false,splashUsed:false});
      },
      hitById(id,source="normal"){const b=bricks.find(x=>x.id===id);if(b)hitBrick(b,source);updateUI();},
      reset
    };
  }
  reset();lastFrame=performance.now();requestAnimationFrame(frame);
})();
