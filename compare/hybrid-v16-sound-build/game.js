"use strict";
(() => {
  const W = 360, H = 560, MAX_WAVES = 10;
  const WAVE_ROWS=[8,9,10,11,9,10,11,10,11,11];
  const FIRE_INTERVAL=.86, MAX_UPGRADE_LEVEL=2;
  const MAX_BALLS = 24, BALL_SPEED = 365, BALL_TTL = 7.4, MAX_CHARGE = 100;
  const GIANT_SPEED = 610, GIANT_LIFETIME = 5, GIANT_MAX_BOUNCES = 80;
  const GIANT_PIERCE_HP=5, GIANT_HEAVY_DAMAGE=3, GIANT_PIERCE_LIMIT=10;
  const BASE_ARMOR_DAMAGE=2, POWER_ARMOR_DAMAGE=3;
  const SHOT_RADIUS = 3.45, BRICK_COLUMNS = 9, BRICK_W = 29, BRICK_H = 22, BRICK_STEP_X = 38.5, BRICK_STEP_Y = 30;
  const FINAL_RUSH_THRESHOLD=8;
  // 30% -> 15% -> last eight bricks. These are experimental thresholds.
  const ELECTRIC_AWAKEN_RATIO=.30,ELECTRIC_BUILD_RATIO=.15;
  const ELECTRIC_TARGETS=[0,1,2,3],ELECTRIC_COOLDOWN=[Infinity,.44,.28,.16];
  const ELECTRIC_PULSE_EVERY=[Infinity,3,2,1];
  // One playable class/active skill now. This registry can later add distinct
  // playable classes/skills without giving every cannon the same passive.
  const CANNON_CLASSES=Object.freeze({
    free:Object.freeze({id:"free",label:"自由炮台",passive:"none"})
  });
  const ACTIVE_SKILLS=Object.freeze({
    giant:Object.freeze({id:"giant",label:"超载冲锋",kind:"giant",maxCharge:MAX_CHARGE})
  });
  // Deliberate HP curve: more armored impacts, no extra blockers or wave length.
  // The common brick grid and normal one-hit tiles remain unchanged.
  // Every brick has its own deterministic starting HP; repeats are intentional
  // so players can read damage tiers on a 29px tile. Ordinary (HP1) tiles still
  // break on the FIRST hit, preserving the original penetration payoff.
  const HP_PROFILES=[
    {cut:[.44,.77,.95],tiers:[[1,1],[2,3],[4,5],[6,6]]},
    {cut:[.42,.75,.94],tiers:[[1,1],[2,3],[4,5],[6,7]]},
    {cut:[.40,.73,.94],tiers:[[1,1],[2,3],[4,6],[7,8]]},
    {cut:[.38,.71,.93],tiers:[[1,1],[2,3],[4,6],[7,9]]},
    {cut:[.37,.71,.93],tiers:[[1,1],[2,4],[5,7],[8,9]]},
    {cut:[.36,.70,.92],tiers:[[1,1],[2,4],[5,7],[8,10]]},
    {cut:[.35,.70,.92],tiers:[[1,1],[2,4],[5,8],[9,10]]},
    {cut:[.34,.69,.92],tiers:[[1,1],[2,4],[5,8],[9,11]]},
    {cut:[.33,.68,.91],tiers:[[1,1],[2,4],[5,8],[9,12]]},
    {cut:[.32,.68,.91],tiers:[[1,1],[2,4],[5,8],[9,13]]}
  ];
  function hash01(n,r,c,salt=0){
    let h=(((n+17)*83492791)^((r+31)*73856093)^((c+61)*19349663)^(salt*374761393))>>>0;
    h=Math.imul(h^(h>>>16),0x7feb352d)>>>0;
    h=Math.imul(h^(h>>>15),0x846ca68b)>>>0;
    return ((h^(h>>>16))>>>0)/4294967296;
  }
  function brickHP(n,r,c,special){
    if(special)return 1;
    const profile=HP_PROFILES[n-1],roll=hash01(n,r,c);
    const tier=roll<profile.cut[0]?0:roll<profile.cut[1]?1:roll<profile.cut[2]?2:3;
    const [low,high]=profile.tiers[tier];
    return low+Math.floor(hash01(n,r,c,13)*(high-low+1));
  }
  function brickColor(hp,special){
    return special?"#4ac99c":hp===1?"#3789a8":hp<=3?"#5c9ab8":hp<=6?"#7c78b8":"#b67e54";
  }
  const canvas = document.querySelector("#game"), ctx = canvas.getContext("2d");
  const $ = id => document.querySelector("#" + id);
  const ui = {
    wave: $("wave"), score: $("score"), rate: $("rate"), balls: $("balls"),
    charge: $("chargeText"), fill: $("energyFill"), state: $("stateText"),
    giant: $("giant"), choice: $("choiceOverlay"), win: $("winOverlay"),
    choiceWave: $("choiceWave"), build: $("buildText"), final: $("finalStats")
  };
  const shooter = {x: W / 2, y: H - 37};
  const palette = ["#498cc2", "#518eae", "#8475c9", "#ba8e5a", "#637ab0"];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  let bricks, balls, particles, giant, aim, activePointer, wave, score;
  let phase, charge, hunterLevel, ricochetLevel, splitLevel, shockLevel, drillLevel, arcLevel, shootClock, elapsed;
  let skillsUsed, ricochetTriggers, lastFrame, soundContext, masterGain, soundLimiter, soundVolume=.78;
  let sfxLast=Object.create(null), bonusVolleyBalls=0, homingTurns=0, shockWaves=0, directBreaks=0;
  let shotsFired, brickContacts, shotMaxContacts, splitBursts, chainBursts, giantRebounds, giantBrickRebounds, giantWallRebounds, giantTotalHits;
  let endgameActive=false,endgameStartedAt=null,endgameElapsed=0,endgameWaveStats=[];
  let lightningArcs=[],lightningTriggers=0,lightningDamage=0,lightningOriginCount=0;
  let electricStage=0,electricStageStarts=[null,null,null,null],electricHitsByStage=[0,0,0,0];
  let waveTotal=0,electricStats=[],electricContactCounter=0;
  let selectedCannon=CANNON_CLASSES.free,selectedActive=ACTIVE_SKILLS.giant;
  let armorHits=0,armorBreaks=0,armorCracks=0,finalWaveDurations=[];
  let heavyHits=0,giantPiercings=0,giantHeavyBounces=0,powerShots=0,tailSoftens=0;
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
  // Web Audio mix: audible at ordinary device volume, but capped for dense chains.
  // First gesture resumes the audio context; setting volume never auto-plays sound.
  function unlockSound() {
    try {
      if(!soundContext){
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(!Audio)return;
        soundContext=new Audio();
        masterGain=soundContext.createGain();
        soundLimiter=soundContext.createDynamicsCompressor();
        soundLimiter.threshold.value=-18;
        soundLimiter.knee.value=18;
        soundLimiter.ratio.value=5;
        soundLimiter.attack.value=.003;
        soundLimiter.release.value=.18;
        masterGain.connect(soundLimiter);soundLimiter.connect(soundContext.destination);
        masterGain.gain.value=soundVolume*.82;
      }
      if(soundContext.state==="suspended")soundContext.resume();
    }catch(_){}
  }
  function beep(freq,seconds=.06,amp=.026,type="triangle"){
    if(!soundContext||!masterGain||soundVolume<=0)return;
    try{
      const t=soundContext.currentTime,o=soundContext.createOscillator(),g=soundContext.createGain();
      const duration=Math.max(.02,Math.min(seconds,.4));
      o.type=type;
      o.frequency.setValueAtTime(Math.max(60,freq),t);
      o.frequency.exponentialRampToValueAtTime(Math.max(65,freq*.56),t+duration);
      const level=Math.min(.23,Math.max(.018,amp*4.0));
      g.gain.setValueAtTime(.0001,t);
      g.gain.exponentialRampToValueAtTime(level,t+.006);
      g.gain.exponentialRampToValueAtTime(.0001,t+duration);
      o.connect(g);g.connect(masterGain);o.start(t);o.stop(t+duration+.008);
    }catch(_){}
  }
  function playSfx(kind){
    if(!soundContext||soundVolume<=0)return;
    const now=soundContext.currentTime;
    if(now-(sfxLast[kind]??-999)<(kind==="armor"?.065:kind==="break"?.042:.12))return;
    sfxLast[kind]=now;
    if(kind==="armor"){beep(300,.075,.035,"sawtooth");beep(530,.045,.022);}
    else if(kind==="break"){beep(370+Math.min(combo,10)*25,.14,.055,"triangle");beep(870,.055,.028,"square");}
    else if(kind==="shock"){beep(145,.21,.065,"sawtooth");beep(360,.11,.038);}
    else if(kind==="drill"){beep(480,.105,.043,"sawtooth");}
    else if(kind==="split"){beep(820,.12,.037);beep(1140,.07,.022);}
    else if(kind==="arc"){beep(960,.09,.032,"square");}
    else if(kind==="hunt"){beep(610,.09,.032);}
    else if(kind==="giant"){beep(125,.34,.085,"sawtooth");beep(265,.22,.07,"triangle");}
    else if(kind==="upgrade"){beep(540,.16,.06);beep(910,.2,.042);}
  }
  const volumeInput=$("soundVolume"), volumeText=$("soundValue");
  volumeInput.value="78";volumeText.textContent="78%";
  volumeInput.addEventListener("input",()=>{
    soundVolume=clamp(Number(volumeInput.value)/100,0,1);
    volumeText.textContent=Math.round(soundVolume*100)+"%";
    if(masterGain)masterGain.gain.setTargetAtTime(soundVolume*.82,soundContext.currentTime,.015);
  });
  $("soundTest").addEventListener("click",()=>{unlockSound();playSfx("giant");});

  function setState(label) { ui.state.textContent = label; }
  function updateUI(){
    ui.wave.textContent=wave+" / "+MAX_WAVES;
    ui.score.textContent=String(score);
    ui.rate.textContent=FIRE_INTERVAL.toFixed(2)+"s";
    ui.balls.textContent=String(balls.length);
    ui.charge.textContent=Math.floor(charge)+"%";
    ui.fill.style.width=charge+"%";
    ui.giant.disabled=phase!=="playing"||charge<MAX_CHARGE||!!giant;
    ui.giant.textContent=giant?(selectedActive.label+"\\n"+Math.max(0,GIANT_LIFETIME-giant.life).toFixed(1)+"s"):
      (charge>=MAX_CHARGE?selectedActive.label+"\\nREADY":selectedActive.label+"\\n"+Math.floor(charge)+"%");
    $("giantLife").classList.toggle("hidden",!giant);
    $("giantTimeFill").style.width=giant?Math.max(0,(GIANT_LIFETIME-giant.life)/GIANT_LIFETIME*100).toFixed(2)+"%":"0%";
    $("giantTimeText").textContent=giant?Math.max(0,GIANT_LIFETIME-giant.life).toFixed(1)+"s":"0.0s";
    $("loadoutLabel").textContent="自由炮台 · 发射由瞄准决定 · 普通球靠构筑变强";
    ui.giant.classList.toggle("ready",phase==="playing"&&charge>=MAX_CHARGE&&!giant);
    const synergies=[drillLevel&&shockLevel?"爆破钻头":null,splitLevel&&arcLevel?"电弧弹幕":null,
      ricochetLevel&&hunterLevel?"追猎回旋":null].filter(Boolean);
    ui.build.textContent="构筑：钻头 "+drillLevel+" · 裂变 "+splitLevel+" · 追猎 "+hunterLevel+
      " · 震荡 "+shockLevel+" · 蓄能 "+ricochetLevel+" · 电弧 "+arcLevel+
      (synergies.length?" | 联动："+synergies.join(" / "):" | 升级后可以形成联动");
  }
  function generateWave(n) {
    bricks = [];
    endgameActive=false;endgameStartedAt=null;endgameElapsed=0;
    lightningArcs=[];electricStage=0;waveTotal=WAVE_ROWS[n-1]*BRICK_COLUMNS;
    electricStageStarts=[null,null,null,null];electricHitsByStage=[0,0,0,0];electricContactCounter=0;
    const marker=$("finalRushLabel");
    marker.classList.remove("active");marker.classList.remove("stage-1");
    marker.classList.remove("stage-2");marker.classList.remove("stage-3");
    marker.textContent="";
    const rows = WAVE_ROWS[n-1], cols = BRICK_COLUMNS;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const special=r===0&&c===4;
      const hp=brickHP(n,r,c,special);
      bricks.push({
        id:n*1000+r*cols+c,x:12+c*BRICK_STEP_X,y:47+r*BRICK_STEP_Y,
        w:BRICK_W,h:BRICK_H,alive:true,special,bonk:0,
        hp,initialHp:hp,armored:hp>1,cracked:false,
        color:brickColor(hp,special)
      });
    }
    setState(n === 1 ? "炮台自动发射 · 拖动瞄准" : "第 " + n + " 波 · 寻找新的弹道");
  }
  function reset() {
    wave = 1; score = 0; phase = "playing"; charge = 0; hunterLevel = 0; ricochetLevel = 0; splitLevel=0;shockLevel=0;drillLevel=0;arcLevel=0;
    shotsFired=0;brickContacts=0;shotMaxContacts=0;splitBursts=0;chainBursts=0;bonusVolleyBalls=0;homingTurns=0;shockWaves=0;directBreaks=0;giantRebounds=0;giantBrickRebounds=0;giantWallRebounds=0;giantTotalHits=0;
    shootClock = .76; elapsed = 0; skillsUsed = 0; ricochetTriggers = 0;
    aim = 0; activePointer = null; balls = []; particles = []; giant = null;
    impactRings=[];floatTexts=[];combo=0;maxCombo=0;lastBreak=-99;comboVisibility=0;shake=0;hitCount=0;
    endgameWaveStats=[];electricStats=[];lightningArcs=[];lightningTriggers=0;lightningDamage=0;lightningOriginCount=0;
    armorHits=0;armorBreaks=0;armorCracks=0;finalWaveDurations=[];
    heavyHits=0;giantPiercings=0;giantHeavyBounces=0;powerShots=0;tailSoftens=0;
    selectedCannon=CANNON_CLASSES.free;selectedActive=ACTIVE_SKILLS.giant;
    // The FX engine is reusable; reset its transient queues without altering the chosen intensity.
    juice.setMode("off");juice.setMode(impactMode.value);
    ui.choice.classList.add("hidden"); ui.win.classList.add("hidden");
    generateWave(wave); updateUI();
  }
  function livingCount(){return bricks.reduce((n,b)=>n+(b.alive?1:0),0);}
  function stageForRemaining(remaining){
    if(remaining<=0)return electricStage;
    return remaining<=FINAL_RUSH_THRESHOLD?3:0;
  }
  function updateElectricStage(){
    if(phase!=="playing"||electricStage===3||livingCount()>FINAL_RUSH_THRESHOLD)return;
    electricStage=3;electricStageStarts[3]=elapsed;
    const marker=$("finalRushLabel");
    marker.classList.add("active");marker.classList.add("stage-3");
    marker.textContent="FINAL RUSH · 最后清场";
    playSfx("shock");
  }
  function markFinalRush(){
    if(!endgameActive&&phase==="playing"&&livingCount()>0&&livingCount()<=FINAL_RUSH_THRESHOLD){
      endgameActive=true;endgameStartedAt=elapsed;
      for(const b of bricks){
        if(!b.alive||!b.armored||b.hp<=3)continue;
        b.hp=3;tailSoftens++;b.bonk=.12;
        if(!reducedMotion)numberPop(b.x+b.w/2,b.y-5,"↓3","#afe8ff");
      }
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
  // Direct projectile hits drive the run. Secondary shock/arc hits never recurse.
  function hitBrick(b,source="normal",impact=null,points=1){
    if(!b.alive)return false;
    hitCount++;
    if(source!=="giant"&&b.armored){
      const damage=source==="giantHeavy"?GIANT_HEAVY_DAMAGE:
        (source==="normal"||source==="drill")?Math.max(BASE_ARMOR_DAMAGE,Math.min(7,points)):
        source==="shock"?Math.max(1,points):1;
      const taken=Math.min(b.hp,damage);
      b.hp-=taken;armorHits+=taken;
      b.bonk=.12;impactVisual(b.x+b.w/2,b.y+b.h/2,b.hp===0);
      numberPop(b.x+b.w/2,b.y-1,"−"+taken,"#ffdfb2");
      if(b.hp>0){
        if(b.hp<=2&&!b.cracked){b.cracked=true;armorCracks++;b.color="#71b9d2";}
        burst(b.x+b.w/2,b.y+b.h/2,"#ffd29d",4);
        juice.onArmor(b,impact);playSfx("armor");
        return false;
      }
      if(!b.cracked){armorCracks++;b.cracked=true;}
      b.armored=false;
    }
    if(b.cracked)armorBreaks++;
    b.hp=0;b.alive=false;score++;
    const cx=b.x+b.w/2,cy=b.y+b.h/2;
    combo=elapsed-lastBreak<=1.25?combo+1:1;
    lastBreak=elapsed;maxCombo=Math.max(combo,maxCombo);comboVisibility=1;
    impactVisual(cx,cy,true);
    if(combo>=3&&combo%3===0)numberPop(cx,cy-12,combo+" 连碎!","#a5f8df");
    if(source==="giant")shake=Math.max(shake,.11);
    juice.onBreak(b,{combo,source,impact});
    burst(cx,cy,b.color,source==="giant"?19:12);
    // Secondary explosions and lightning cannot snowball the active-skill meter.
    if(source==="normal"||source==="drill")addCharge(b.special?34:8);
    if(b.special&&(source==="normal"||source==="drill"))setState("能量砖！超载冲锋充能");
    playSfx("break");
    const isDirect=source==="normal"||source==="drill";
    if(isDirect)directBreaks++;
    const shockEvery=source==="drill"?(shockLevel===2?2:3):(shockLevel===2?3:4);
    if(isDirect&&shockLevel>0&&directBreaks%shockEvery===0){
      shockWaves++;chainBursts++;
      const radius=shockLevel===1?75:95, maxTargets=shockLevel===1?2:4;
      const targets=bricks.filter(t=>t.alive&&Math.hypot(t.x+t.w/2-cx,t.y+t.h/2-cy)<radius)
        .sort((a,b)=>Math.hypot(a.x+a.w/2-cx,a.y+a.h/2-cy)-Math.hypot(b.x+b.w/2-cx,b.y+b.h/2-cy));
      targets.slice(0,maxTargets).forEach(t=>hitBrick(t,"shock",null,shockLevel===2?2:1));
      burst(cx,cy,"#ff996b",23);juice.onSplash({x:cx,y:cy});playSfx("shock");
      setState("震荡核！破坏引发范围冲击");
    }
    return true;
  }
  function makeBall(angle,mini=false){
    return {x:shooter.x,y:shooter.y-28,vx:Math.sin(angle)*BALL_SPEED,
      vy:-Math.cos(angle)*BALL_SPEED,r:mini?SHOT_RADIUS*.83:SHOT_RADIUS,
      life:0,trail:[],contacts:0,mini,splitDone:false,drill:false,
      drillLeft:0,chargeStacks:0,huntsLeft:hunterLevel,
      lastHitId:null,lastHitLife:-99,lastArcAt:-99};
  }
  function splitAt(ball,x,y){
    if(splitLevel===0||ball.mini||ball.splitDone)return;
    ball.splitDone=true;
    const directions=splitLevel===1?[-.45,.45]:[-.7,-.32,.32,.7];
    const theta=Math.atan2(ball.vx,-ball.vy);
    let count=0;
    for(const delta of directions){
      if(balls.length>=MAX_BALLS)break;
      const child=makeBall(theta+delta,true);
      child.x=x;child.y=y;child.huntsLeft=hunterLevel;
      child.lastHitId=ball.lastHitId;child.lastHitLife=0;
      balls.push(child);count++;
    }
    if(count){splitBursts++;bonusVolleyBalls+=count;playSfx("split");setState("碎星裂变！一颗弹球散成弹幕");}
  }
  function retargetBall(ball){
    if(!hunterLevel||ball.huntsLeft<=0||!bricks.some(b=>b.alive))return false;
    const live=bricks.filter(b=>b.alive),armored=live.filter(b=>b.armored);
    const targets=armored.length?armored:live;
    targets.sort((a,b)=>Math.hypot(a.x+a.w/2-ball.x,a.y+a.h/2-ball.y)-
      Math.hypot(b.x+b.w/2-ball.x,b.y+b.h/2-ball.y));
    const t=targets[0],dx=t.x+t.w/2-ball.x,dy=t.y+t.h/2-ball.y,d=Math.hypot(dx,dy)||1;
    ball.vx=BALL_SPEED*dx/d;ball.vy=BALL_SPEED*dy/d;ball.huntsLeft--;
    homingTurns++;playSfx("hunt");
    return true;
  }
  function fire(){
    if(phase!=="playing"||balls.length>=MAX_BALLS)return;
    const volley=++shotsFired,shot=makeBall(aim);
    if(drillLevel>0&&volley%(drillLevel===1?4:3)===0){
      shot.drill=true;shot.drillLeft=drillLevel===1?3:5;shot.r=SHOT_RADIUS*1.35;
      powerShots++;playSfx("drill");
    }
    balls.push(shot);
    beep(245,.045,.011);
  }

  function fireGiant() {
    if (phase !== "playing" || charge < selectedActive.maxCharge || giant || selectedActive.kind!=="giant") return false;
    unlockSound();
    charge=0;skillsUsed++;
    giant={x:shooter.x,y:shooter.y-27,
      vx:Math.sin(aim)*GIANT_SPEED,vy:-Math.cos(aim)*GIANT_SPEED,
      r:14,life:0,collisions:0,bounces:0,pierceLeft:GIANT_PIERCE_LIMIT,lastBounceFx:-100,trail:[],lastHitId:null,lastHitLife:-99};
    burst(shooter.x,shooter.y-27,"#ffd482",24);
    playSfx("giant");setState("超载冲锋：限时冲破 10 块，结束后散出追击球！");updateUI();
    juice.onGiant(shooter.x,shooter.y-27);
    return true;
  }
  function activateEquippedSkill(){
    if(selectedActive.kind==="giant")return fireGiant();
    return false;
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
  // Electric arc is a selected upgrade, not a passive that waits for cleanup.
  function triggerLightning(origin,ball){
    if(!arcLevel||!origin||!ball||livingCount()===0)return false;
    const every=arcLevel===1?3:2;
    const threshold=(ball.mini&&splitLevel)?(arcLevel===1?2:1):every;
    if(ball.contacts%threshold!==0)return false;
    if(elapsed-(ball.lastArcAt??-999)<.16)return false;
    ball.lastArcAt=elapsed;
    const start={x:origin.x+origin.w/2,y:origin.y+origin.h/2};
    const targets=bricks.filter(b=>b.alive&&b.id!==origin.id&&
      Math.hypot(b.x+b.w/2-start.x,b.y+b.h/2-start.y)<(arcLevel===1?115:150))
      .sort((a,b)=>Math.hypot(a.x+a.w/2-start.x,a.y+a.h/2-start.y)-
        Math.hypot(b.x+b.w/2-start.x,b.y+b.h/2-start.y));
    const count=Math.min(targets.length,arcLevel+(ball.mini&&splitLevel?1:0),3);
    let from=start;
    for(const b of targets.slice(0,count)){
      const next={x:b.x+b.w/2,y:b.y+b.h/2};
      if(!reducedMotion){lightningArcs.push({points:[from,next],age:0,duration:.20});if(lightningArcs.length>30)lightningArcs.shift();}
      hitBrick(b,"lightning");lightningDamage++;from=next;
    }
    if(count){lightningTriggers++;playSfx("arc");setState("电弧印记！电流横穿邻近砖块");}
    return count>0;
  }
  function updateBall(ball,dt){
    const speed=Math.hypot(ball.vx,ball.vy);
    const steps=Math.max(4,Math.ceil(speed*dt/3.1)),step=dt/steps;
    for(let i=0;i<steps;i++){
      const prevX=ball.x,prevY=ball.y;
      ball.x+=ball.vx*step;ball.y+=ball.vy*step;
      let wall=false;
      if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx);wall=true;}
      if(ball.x>W-ball.r){ball.x=W-ball.r;ball.vx=-Math.abs(ball.vx);wall=true;}
      if(ball.y<ball.r+4){ball.y=ball.r+4;ball.vy=Math.abs(ball.vy);}
      if(wall){
        if(ricochetLevel){ball.chargeStacks=Math.min(ricochetLevel===1?2:4,ball.chargeStacks+ricochetLevel);ricochetTriggers++;}
        retargetBall(ball);
      }
      for(const block of bricks){
        if(!block.alive||!circleIntersectsRect(ball.x,ball.y,ball.r,block))continue;
        if(ball.lastHitId===block.id&&ball.life-(ball.lastHitLife??-99)<.09)continue;
        ball.lastHitId=block.id;ball.lastHitLife=ball.life;
        const normal=contactNormal(ball,block,prevX,prevY);
        const incoming={vx:ball.vx,vy:ball.vy};
        const dmg=BASE_ARMOR_DAMAGE+(ball.drill?drillLevel+1:0)+ball.chargeStacks;
        const destroyed=hitBrick(block,ball.drill?"drill":"normal",incoming,dmg);
        ball.contacts++;brickContacts++;shotMaxContacts=Math.max(shotMaxContacts,ball.contacts);
        if(ball.chargeStacks){
          numberPop(ball.x,ball.y-12,"蓄能 "+ball.chargeStacks,"#fff2af");
          playSfx("drill");ball.chargeStacks=0;
        }
        // Children are born near the impact, and may take part in lightning chains.
        splitAt(ball,ball.x,ball.y);
        triggerLightning(block,ball);
        markFinalRush();
        if(ball.drill&&ball.drillLeft>0){
          ball.drillLeft--;if(ball.drillLeft===0)ball.drill=false;
          // Drill passage is geometrically real, not an instant board-wide clear.
          if(!ball.drill&&!destroyed)reflect(ball,normal);
        }else if(!destroyed)reflect(ball,normal);
        break;
      }
    }
    ball.life+=dt;ball.trail.unshift({x:ball.x,y:ball.y});
    if(ball.trail.length>9)ball.trail.pop();
    return ball.y<H+10&&ball.life<(ball.mini?4.1:BALL_TTL);
  }
  function recordGiantBounce(kind){
    giant.bounces++;giantRebounds++;
    if(kind==="brick")giantBrickRebounds++;else giantWallRebounds++;
    if(giant.life-giant.lastBounceFx>.075){
      giant.lastBounceFx=giant.life;
      juice.onSplash({x:giant.x,y:giant.y});
      burst(giant.x,giant.y,"#ffd387",7);
      playSfx("armor");
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
        if(giant.lastHitId===block.id && giant.life-giant.lastHitLife<.10)continue;
        giant.lastHitId=block.id;giant.lastHitLife=giant.life;
        const normal=contactNormal(giant,block,prevX,prevY);
        const impact={vx:giant.vx,vy:giant.vy};
        // Giant rule: remaining HP <=5 (or already cracked) explodes and
        // pierces. Above 5 chips three points and bounces by real surface normal.
        const penetrates=block.hp<=GIANT_PIERCE_HP || block.cracked;
        if(penetrates){
          hitBrick(block,"giant",impact);
          giantPiercings++;giant.pierceLeft--;
        }else{
          hitBrick(block,"giantHeavy",impact);
          heavyHits++;giantHeavyBounces++;
          reflect(giant,normal);
          recordGiantBounce("brick");
        }
        markFinalRush();
        triggerLightning(block,giant);
        giant.collisions++;giantTotalHits++;
        break;
      }
      if(giant.bounces>=GIANT_MAX_BOUNCES||giant.pierceLeft<=0)break;
    }
    giant.life+=dt;
    giant.trail.unshift({x:giant.x,y:giant.y});
    if(giant.trail.length>10)giant.trail.pop();
    if(giant.life>GIANT_LIFETIME||giant.bounces>=GIANT_MAX_BOUNCES||giant.pierceLeft<=0){
      const cx=giant.x,cy=giant.y;
      for(const offset of [-.45,0,.45]){
        if(balls.length>=MAX_BALLS)break;
        const shard=makeBall(offset,true);shard.x=cx;shard.y=cy;shard.huntsLeft=hunterLevel;
        balls.push(shard);
      }
      burst(cx,cy,"#ffcd85",14);playSfx("split");giant=null;
    }
  }
  function refreshUpgradeCards(){
    const cards=[
      ["Hunter",hunterLevel,"墙壁反弹后自动追击高耐久砖","反弹时可追击 2 次"],
      ["Bounce",ricochetLevel,"撞侧墙给下一击蓄能增伤","单次蓄能提高至 4 层"],
      ["Split",splitLevel,"首次击砖分裂成 2 颗侧翼弹球","升级为 4 颗分裂球"],
      ["Chain",shockLevel,"每 3 次实弹击碎触发一次冲击波","震荡范围扩大并增强装甲伤害"],
      ["Pierce",drillLevel,"每 4 发放出钻头，连续穿过 3 块砖","每 3 发钻头穿过 5 块，破甲更强"],
      ["Arc",arcLevel,"每 3 次直接碰撞释放一道电弧","每 2 次碰撞放出 2 道电弧"]
    ];
    for(const [id,lv,first,second] of cards){
      $("pick"+id).disabled=lv>=MAX_UPGRADE_LEVEL;
      $(id.toLowerCase()+"Details").textContent=lv===0?first:lv===1?second:"已满级 · 已完成能力进化";
    }
  }
  function finishWave(){
    if(phase!=="playing")return;
    if(endgameStartedAt!==null)endgameWaveStats.push({wave,seconds:+(elapsed-endgameStartedAt).toFixed(2)});
    electricStats.push({wave,thresholds:[],entries:[],hits:[]});
    $("finalRushLabel").classList.remove("active");
    balls=[];giant=null;shootClock=0;
    if(wave===MAX_WAVES){
      phase="won";ui.win.classList.remove("hidden");
      ui.final.textContent="本局 "+Math.round(elapsed)+" 秒 · "+score+" 块 · 最高连击 "+maxCombo+" · 震荡 "+shockWaves+" 次";
      setState("十关完成！");playSfx("upgrade");
    }else{
      phase="choosing";ui.choice.classList.remove("hidden");ui.choiceWave.textContent="WAVE "+wave+" CLEAR";
      refreshUpgradeCards();setState("升级：请选择新的攻击能力");
    }
    updateUI();
  }
  function chooseUpgrade(kind){
    if(phase!=="choosing")return false;
    const names={hunter:"hunterLevel",ricochet:"ricochetLevel",split:"splitLevel",
      shock:"shockLevel",drill:"drillLevel",arc:"arcLevel"};
    if(!Object.hasOwn(names,kind))return false;
    if(kind==="hunter"&&hunterLevel<2)hunterLevel++;
    else if(kind==="ricochet"&&ricochetLevel<2)ricochetLevel++;
    else if(kind==="split"&&splitLevel<2)splitLevel++;
    else if(kind==="shock"&&shockLevel<2)shockLevel++;
    else if(kind==="drill"&&drillLevel<2)drillLevel++;
    else if(kind==="arc"&&arcLevel<2)arcLevel++;
    else return false;
    wave++;shootClock=FIRE_INTERVAL-.3;balls=[];giant=null;phase="playing";
    ui.choice.classList.add("hidden");generateWave(wave);updateUI();playSfx("upgrade");
    return true;
  }

  function update(dt) {
    if (phase !== "playing") return;
    elapsed += dt; shootClock += dt;
    if (shootClock >= FIRE_INTERVAL) {
      shootClock -= FIRE_INTERVAL;
      fire();
    }
    // Effects can spawn children. Iterate over a snapshot to avoid unbounded same-frame spawns.
    const currentBalls=balls.slice();
    const kept=currentBalls.filter(b=>updateBall(b,dt));
    const newborn=balls.filter(b=>!currentBalls.includes(b));
    balls=kept.concat(newborn).slice(0,MAX_BALLS);
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
      if(brick.cracked){
        ctx.fillStyle="#ffffff3f";rounded(brick.x+3,brick.y+3,brick.w-6,3,2);ctx.fill();
        ctx.strokeStyle="#fff1bc";ctx.lineWidth=1.3;ctx.beginPath();
        ctx.moveTo(brick.x+7,brick.y+2);ctx.lineTo(brick.x+13,brick.y+10);
        ctx.lineTo(brick.x+9,brick.y+15);ctx.lineTo(brick.x+18,brick.y+21);
        ctx.stroke();
        if(brick.hp>1){ctx.fillStyle="#ffffff";ctx.font="bold 13px system-ui";ctx.textAlign="center";ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+16);}
      }else{
        // Untouched numbered tiles show remaining HP; HP1 stays hidden.
        // Color communicates HP tier; numeral communicates exact remaining work.
        if(brick.armored){
          ctx.fillStyle="#ffffff1c";rounded(brick.x+1.5,brick.y+1.5,brick.w-3,4,2);ctx.fill();
        }
        ctx.fillStyle=brick.special?"#083e2b":"#ffffff";
        ctx.font="bold 13px system-ui";ctx.textAlign="center";
        if(brick.hp>1) ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+16);
        if(brick.hp===1 && !brick.special){ctx.fillStyle="#ffffff40";rounded(brick.x+4,brick.y+4,brick.w-8,2,1);ctx.fill();}
        if(brick.special){
          ctx.fillStyle="#0b4f35";ctx.font="bold 7px system-ui";
          ctx.fillText("★",brick.x+brick.w-6,brick.y+8);
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
      ctx.shadowColor=b.drill?"#ffb05d":b.chargeStacks?"#fced83":b.mini?"#c39fff":"#b9f2ff";
      ctx.shadowBlur=b.drill?18:11;ctx.fillStyle=b.drill?"#ffcc67":b.chargeStacks?"#fff5b0":b.mini?"#dbbaff":"#edfaff";
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
  ui.giant.addEventListener("click",activateEquippedSkill);
  if(window.location?.search?.includes("dev=1")) $("previewBox").classList.remove("hidden");
  $("previewFinale").addEventListener("click",()=>{
    unlockSound();
    const stage=$("previewStage").value;
    const count=stage==="awaken"?Math.ceil(waveTotal*.30):
      stage==="build"?Math.ceil(waveTotal*.15):FINAL_RUSH_THRESHOLD;
    previewFinale(count);
  });
  $("pickHunter").addEventListener("click",()=>{unlockSound();chooseUpgrade("hunter");});
  $("pickBounce").addEventListener("click",()=>{unlockSound();chooseUpgrade("ricochet");});
  $("pickSplit").addEventListener("click",()=>{unlockSound();chooseUpgrade("split");});
  $("pickChain").addEventListener("click",()=>{unlockSound();chooseUpgrade("shock");});
  $("pickPierce").addEventListener("click",()=>{unlockSound();chooseUpgrade("drill");});
  $("pickArc").addEventListener("click",()=>{unlockSound();chooseUpgrade("arc");});
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
    return {phase,wave,score,aim,interval:FIRE_INTERVAL,hunterLevel,ricochetLevel,
      charge,activeBalls:balls.length,giantActive:!!giant,skillsUsed,ricochetTriggers,elapsed,
      splitLevel,shockLevel,drillLevel,arcLevel,powerShots,shotsFired,brickContacts,shotMaxContacts,splitBursts,chainBursts,giantRebounds,
      giantBrickRebounds,giantWallRebounds,giantTotalHits,
      endgameActive,endgameRemaining:livingCount(),endgameStartedAt,endgameElapsed,endgameWaveStats:JSON.stringify(endgameWaveStats),finalRushThreshold:FINAL_RUSH_THRESHOLD,
      lightningTriggers,lightningDamage,lightningArcCount:lightningArcs.length,
      electricStage,electricMaxTargets:ELECTRIC_TARGETS[electricStage],electricPulseEvery:ELECTRIC_PULSE_EVERY[electricStage],electricContactCounter,
      electricHitsByStage:JSON.stringify(electricHitsByStage),
      electricStats:JSON.stringify(electricStats),
      cannonClass:selectedCannon.id,cannonPassive:selectedCannon.passive,
      activeSkill:selectedActive.id,hpProfile:"mixed-per-brick",
      armorHits,armorCracks,armorBreaks,heavyHits,giantPiercings,giantHeavyBounces,tailSoftens,
      giantRemaining:giant?Math.max(0,GIANT_LIFETIME-giant.life):0,giantLifetime:GIANT_LIFETIME,
      giantPiercesLeft:giant?.pierceLeft??0,stormBuild:!!(splitLevel&&arcLevel),blastBuild:!!(shockLevel&&drillLevel),
      bonusVolleyBalls,homingTurns,shockWaves,directBreaks,soundVolume,
      electricTargetsWithUpgrade:Math.min(5,ELECTRIC_TARGETS[electricStage]+arcLevel),
      remainingHp:bricks.filter(b=>b.alive).reduce((n,b)=>n+b.hp,0),
      visibleNumbers:bricks.filter(b=>b.alive&&!b.cracked).length,
      oneHitBricks:bricks.filter(b=>b.alive&&b.hp===1&&!b.armored).length,
      hpMax:Math.max(0,...bricks.filter(b=>b.alive).map(b=>b.hp)),
      waveTotal,waveRows:WAVE_ROWS[wave-1],waveCount:MAX_WAVES,
      electricAwakenAt:Math.ceil(waveTotal*.30),electricBuildAt:Math.ceil(waveTotal*.15),
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
      injectRicochet(){const testBall=makeBall(0);testBall.chargeStacks=2;const t=bricks.find(b=>b.alive&&b.armored);if(t)hitBrick(t,"normal",null,4);},
      firstBrick(){return bricks.find(b=>b.alive);},
      firstArmor(){return bricks.find(b=>b.alive && b.armored);},
      brickLayout(){return bricks.map(b=>({id:b.id,x:b.x,y:b.y,w:b.w,h:b.h,alive:b.alive}));},
      chooseByKind:chooseUpgrade,
      activateEquippedSkill,
      loadout(){return {cannon:selectedCannon.id,passive:selectedCannon.passive,active:selectedActive.id};},
      fireGiant,updateGiant,
      injectGiantAt(x,y,vx=0,vy=-GIANT_SPEED){giant={x,y,vx,vy,r:14,life:0,collisions:0,bounces:0,pierceLeft:GIANT_PIERCE_LIMIT,lastBounceFx:-100,trail:[],lastHitId:null,lastHitLife:-99};updateUI();},
      setGiantPiercesLeft(n){if(!giant)return false;giant.pierceLeft=n;return true;},
      setBrickHp(id,hp){const b=bricks.find(x=>x.id===id);if(!b)return false;b.hp=hp;b.initialHp=hp;b.armored=hp>1;b.cracked=false;return true;},
      leaveLastEight(){const alive=bricks.filter(b=>b.alive);for(const b of alive.slice(8))b.alive=false;markFinalRush();},
      physicsNormal:contactNormal,
      physicsReflect:reflect,
      ballSnapshot(){return balls.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,contacts:b.contacts||0,homing:!!b.homing}));},
      leaveBricks(n){let kept=0;for(const b of bricks){if(!b.alive)continue;if(kept++>=n)b.alive=false;}return bricks.filter(b=>b.alive);},
      markFinalRush,updateElectricStage,previewElectricStage:previewFinale,
      previewFinale,
      triggerLightningById(id,ball=null){const b=bricks.find(x=>x.id===id);return b?triggerLightning(b,ball):false;},
      addTestBall(x,y,vx=0,vy=-BALL_SPEED){const ball=makeBall(0);Object.assign(ball,{x,y,vx,vy});balls.push(ball);},
      keepOnlyBrick(id){bricks.forEach(b=>{if(b.id!==id)b.alive=false;});},
      allBricks(){return bricks;},
      hpDistribution(){return bricks.map(b=>({id:b.id,hp:b.hp,initialHp:b.initialHp,armored:b.armored,cracked:b.cracked,alive:b.alive}));},
      injectTestBall(x,y,vx=0,vy=-BALL_SPEED){balls=[];shootClock=-10000;const ball=makeBall(0);Object.assign(ball,{x,y,vx,vy});balls.push(ball);},
      spawnTestBall(angle=0){const b=makeBall(angle);balls.push(b);return b;},
      hitForTest(id,source="normal",points=2){const b=bricks.find(x=>x.id===id);return b?hitBrick(b,source,null,points):false;},
      playSfx,unlockSound,
      hitById(id,source="normal"){const b=bricks.find(x=>x.id===id);if(b)hitBrick(b,source);updateUI();},
      reset
    };
  }
  reset();lastFrame=performance.now();requestAnimationFrame(frame);
})();
