"use strict";
(() => {
  const W = 360, H = 560, MAX_WAVES = 10;
  const DANGER_Y=H-105, BOSS_INTERVAL=110, SURGE_INTERVAL=75, FALL_BASE=5.0, MAX_BRICKS=168;
  const START_ROWS=6, SPAWN_INTERVAL=3.5, PHYSICS_DT=1/120, MAX_FRAME_STEPS=6;
  const AMBIENT_SUMMON_INTERVAL=8.4, SUMMON_SAFE_TOP=48, SUMMON_SAFE_BOTTOM=DANGER_Y-88;
  const UPPER_LIMIT=175, LOWER_START=275, BRIDGE_BOTTOM=335;
  const BRIDGE_WARNING=1.0, BOSS_WARNING=1.0, CLEAR_CELEBRATE=.60, CLEAR_WARNING=.90, CLEAR_GRACE=2.1;
  const WAVE_ROWS_COUNT=9, WAVE_START_Y=36, WAVE_ROW_GAP=28, WAVE_BOSS_EVERY=4;
  const BOSS_SUPPORT_LIMIT_TOTAL=12, BOSS_SUPPORT_INTERVAL=7.0;
  const WAVE_ROWS=[8,9,10,11,9,10,11,10,11,11];
  const FIRE_INTERVAL=1.14, MAX_UPGRADE_LEVEL=2;
  const MAX_BALLS = 32, BALL_SPEED = 280, BALL_TTL = 8.4, MAX_CHARGE = 100;
  const GIANT_SPEED = 610, GIANT_LIFETIME = 5, GIANT_MAX_BOUNCES = 80;
  const GIANT_PIERCE_HP=5, GIANT_HEAVY_DAMAGE=3, GIANT_PIERCE_LIMIT=10;
  const BASE_ARMOR_DAMAGE=1, POWER_ARMOR_DAMAGE=3;
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
  // Numeric HP ramps by survival time, while keeping many light bricks for break chains.
  // The last profile repeats with a late multiplier instead of sticking at ~36 HP.
  const HP_PROFILES=[
    {cut:[.54,.87,.97],tiers:[[1,1],[2,2],[3,3],[4,4]]},
    {cut:[.27,.64,.92],tiers:[[1,1],[3,5],[6,10],[11,14]]},
    {cut:[.26,.61,.91],tiers:[[1,1],[3,7],[8,14],[15,20]]},
    {cut:[.25,.60,.90],tiers:[[1,1],[4,8],[10,17],[18,24]]},
    {cut:[.25,.58,.90],tiers:[[1,1],[5,10],[12,21],[22,31]]},
    {cut:[.24,.57,.90],tiers:[[1,1],[6,12],[15,25],[26,38]]},
    {cut:[.24,.56,.89],tiers:[[1,1],[7,14],[18,31],[33,45]]},
    {cut:[.24,.56,.89],tiers:[[1,1],[8,17],[22,36],[39,54]]},
    {cut:[.23,.55,.89],tiers:[[1,1],[9,21],[25,43],[46,62]]},
    {cut:[.23,.55,.88],tiers:[[1,1],[11,24],[30,50],[53,72]]}
  ];
  const HP_COLOR_CYCLE=[
    "#257da9", // 1 - dark blue-cyan
    "#218fa7", // 2-3 teal
    "#428bbd", // 4-7 blue
    "#7972c5", // 8-15 violet
    "#bb77ad", // 16-31 magenta
    "#cc817b", // 32-63 coral
    "#b9985e", // 64-127 warm brass
    "#4c9e90"  // 128-255 jade, then loop
  ];
  function hash01(n,r,c,salt=0){
    let h=(((n+17)*83492791)^((r+31)*73856093)^((c+61)*19349663)^(salt*374761393))>>>0;
    h=Math.imul(h^(h>>>16),0x7feb352d)>>>0;
    h=Math.imul(h^(h>>>15),0x846ca68b)>>>0;
    return ((h^(h>>>16))>>>0)/4294967296;
  }
  function brickHP(n,r,c,special){
    if(special)return 1;
    const profile=HP_PROFILES[Math.min(9,n-1)],roll=hash01(n,r,c);
    const tier=roll<profile.cut[0]?0:roll<profile.cut[1]?1:roll<profile.cut[2]?2:3;
    const [low,high]=profile.tiers[tier];
    return low+Math.floor(hash01(n,r,c,13)*(high-low+1));
  }
  function brickColor(hp,special){
    if(special)return "#3eba94";
    // Readable fixed color cycle: distinct early tiers; later 12-HP bands
    // walk around the same eight colors rather than sticking at orange.
    const band=hp<=1?0:hp<=3?1:hp<=7?2:hp<=15?3:
      4+Math.floor((hp-16)/12);
    return HP_COLOR_CYCLE[band%HP_COLOR_CYCLE.length];
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
  let level=1,xp=0,xpGoal=34,choiceQueue=0,choiceSet=[],powerLevel=0,volleyLevel=0,rateLevel=0,speedLevel=0,lifeLevel=0;
  let serial=0,rowIndex=0,rowTimer=0,nearClearClock=0,replenishClock=0,screenClears=0,lastClearTime=-100,emptyLatch=false,clearFlash=0;
  let ambientSignals=[],ambientSummonClock=0,ambientSummonBursts=0,ambientSummonTiles=0,overlapSummonCount=0,clearBurstCount=0,clearBurstTiles=0;
  let bridgeTimer=0,lastBridgeTime=-100,bridgeBursts=0,bridgeTiles=0,upperOnlyBridgeCount=0,cleanupWindow=0,cleanupStarted=false,cleanupActivations=0,clearPreview=[],clearPreviewShown=false;
  let boss=null,bossDefeats=0,bossSupportXP=0,bossSummonClock=0,summonSignals=[],surgeUntil=0,alertUntil=0,choiceReason="upgrade";
  let waveElapsed=0,clearWindowActive=false,bossSummonTotal=0,waveTailSoftened=false,waveSpawnCount=0;
  let phase, charge, hunterLevel, ricochetLevel, splitLevel, shockLevel, drillLevel, arcLevel, shootClock, elapsed;
  let skillsUsed, ricochetTriggers, lastFrame, soundContext, masterGain, soundLimiter, soundVolume=.78;
  let accumulator=0,uiClock=0,metricsClock=0,frameSamples=0,fpsNow=0,slowFrames=0,renderQuality="full",drawMs=0;
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
      if(soundContext.state==="suspended"){
        const resume=soundContext.resume();
        if(resume&&typeof resume.then==="function")resume.then(()=>{if(soundContext.state==="running")playSfx("upgrade");}).catch(()=>{});
      }
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
    const clock=Math.floor(elapsed),mm=String(Math.floor(clock/60)).padStart(2,"0"),ss=String(clock%60).padStart(2,"0");
    ui.wave.textContent=mm+":"+ss;$("waveLabel").textContent="第"+wave+"波 · 生存";ui.score.textContent=String(score);
    ui.rate.textContent="LV."+level;ui.balls.textContent=String(livingCount());
    ui.charge.textContent=Math.floor(charge)+"%";ui.fill.style.width=charge+"%";
    $("xpLabel").textContent="LV."+level+" 经验 "+xp+" / "+xpGoal;
    $("xpFill").style.width=Math.min(100,xp/xpGoal*100)+"%";
    const ready=phase==="playing"&&charge>=MAX_CHARGE&&!giant;
    ui.giant.disabled=!ready;ui.giant.textContent=giant?"超载中 "+Math.ceil(GIANT_LIFETIME-giant.life)+"s":ready?"超载冲锋 READY":"超载冲锋 "+Math.floor(charge)+"%";
    $("giantLife").classList.toggle("hidden",!giant);
    $("giantTimeText").textContent=giant?Math.max(0,GIANT_LIFETIME-giant.life).toFixed(1)+"s":"0.0s";
    $("giantTimeFill").style.width=giant?Math.max(0,(GIANT_LIFETIME-giant.life)/GIANT_LIFETIME*100)+"%":"0%";
    $("loadoutLabel").textContent=volleyLevel?"散射 "+(volleyLevel+1)+"球":"基础炮台";
    const parts=[speedLevel?"球速+"+speedLevel:null,lifeLevel?"续航+"+lifeLevel:null,powerLevel?"火力+"+powerLevel:null,volleyLevel?"散射+"+volleyLevel:null,splitLevel?"裂变+"+splitLevel:null,arcLevel?"电弧+"+arcLevel:null,shockLevel?"震荡+"+shockLevel:null,drillLevel?"钻头+"+drillLevel:null,hunterLevel?"追猎+"+hunterLevel:null,ricochetLevel?"蓄能+"+ricochetLevel:null,rateLevel?"射速+"+rateLevel:null].filter(Boolean);
    ui.build.textContent=parts.length?parts.join(" · "):"基础弹球 · 击碎获得经验";
    $("bossHud").classList.toggle("hidden",!boss||!boss.alive);
    if(boss&&boss.alive){$("bossText").textContent=boss.hp+" / "+boss.initialHp;$("bossFill").style.width=Math.max(0,boss.hp/boss.initialHp*100)+"%";}
  }
  function brickAt(x,y,hp,extra={}){
    const special=!!extra.special;
    return {id:++serial,x,y,w:extra.w||BRICK_W,h:extra.h||BRICK_H,alive:true,
      hp,initialHp:hp,armored:hp>1,cracked:false,bonk:0,special,
      color:extra.color||brickColor(hp,special),...extra};
  }
  // Every brick spawn path checks both the physical field and pending summons.
  function rectanglesOverlap(a,b,gap=1){
    return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&
      a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
  }
  function isSlotFree(x,y,w=BRICK_W,h=BRICK_H,ignoreId=null){
    const rect={x,y,w,h};
    if(x<5||x+w>W-5||y<SUMMON_SAFE_TOP||y+h>SUMMON_SAFE_BOTTOM)return false;
    if(bricks.some(b=>b.alive&&b.id!==ignoreId&&rectanglesOverlap(rect,b)))return false;
    if(ambientSignals.some(b=>rectanglesOverlap(rect,b)))return false;
    if(boss&&boss.alive&&summonSignals.some(sig=>sig.targetId!==ignoreId&&
      rectanglesOverlap(rect,{x:boss.x+sig.dx,y:boss.y+sig.dy,w:BRICK_W,h:BRICK_H})))return false;
    return true;
  }
  function addRow(initial=false,extraDensity=0){
    // Keep a thick wall of targets without flooding the field faster than a
    // starter cannon can make progress. The ceiling grows with survival time.
    if(livingCount()>=(initial?MAX_BRICKS:Math.min(MAX_BRICKS,65+Math.floor(elapsed/55)*7)))return false;
    const alive=bricks.filter(b=>b.alive&&!b.bossSupport&&!b.isBoss);
    const top=alive.length?Math.min(...alive.map(b=>b.y)):0;
    // Spawn next to the highest LIVE row; never stack invisible rows far above the canvas.
    const y=initial?8+rowIndex*BRICK_STEP_Y:Math.max(12,Math.min(42,top-BRICK_STEP_Y));
    if(!initial&&alive.length&&top-BRICK_STEP_Y<12)return false;
    const tier=1+Math.min(9,Math.floor(elapsed/46));
    const n=initial?9:Math.min(9,7+Math.floor(elapsed/110)+extraDensity);
    const cols=Array.from({length:9},(_,i)=>i).sort((a,b)=>hash01(rowIndex,a,2)-hash01(rowIndex,b,2)).slice(0,n).sort((a,b)=>a-b);
    for(const col of cols){
      if(boss&&boss.alive&&col>=3&&col<=5&&y<boss.y+boss.h+35&&y+BRICK_H>boss.y-35)continue;
      const special=(rowIndex+col)%19===0;
      let hp=brickHP(tier,rowIndex%7,col,special);
      if(initial&&rowIndex>=4&&hp>1)hp=1;
      if(tier>=4&&hp>1)hp=Math.min(180,Math.round(hp*(1+Math.floor(elapsed/135)*.22)));
      const x=12+col*BRICK_STEP_X;
      if(!initial){
        const rect={x,y,w:BRICK_W,h:BRICK_H};
        if(bricks.some(b=>b.alive&&rectanglesOverlap(rect,b))||
           ambientSignals.some(b=>rectanglesOverlap(rect,b)))continue;
      }
      bricks.push(brickAt(x,y,hp,{special}));
    }
    rowIndex++;return true;
  }
  function createWavePlan(n){
    const result=[],tier=Math.min(10,1+Math.floor((n-1)/2));
    const bossWave=n%WAVE_BOSS_EVERY===0;
    for(let row=0;row<WAVE_ROWS_COUNT;row++){
      for(let col=0;col<BRICK_COLUMNS;col++){
        // A couple of clean ricochet channels amid a large wall of targets.
        if(row===WAVE_ROWS_COUNT-1&&(col===2||col===6))continue;
        if(row===WAVE_ROWS_COUNT-2&&col===4)continue;
        if(bossWave&&row>=2&&row<=4&&col>=3&&col<=5)continue;
        const x=12+col*BRICK_STEP_X,y=WAVE_START_Y+row*WAVE_ROW_GAP;
        const special=(n*13+row*5+col)%23===0;
        let hp=brickHP(tier,n*11+row,col,special);
        if(row>=WAVE_ROWS_COUNT-2){
          // Most lower tiles are easy breaks, but 25% act as durable bounce
          // anchors. They must never form a thick deadly wall.
          const f=hash01(n,row,col,91);
          hp=f<.53?1:f<.75?2:f<.91?3:Math.min(14,3+Math.floor(n/2));
        }else if(row>=5&&hp>1){
          hp=Math.max(2,Math.ceil(hp*.72));
        }
        if(tier>=4&&hp>1)hp=Math.min(160,Math.round(hp*(1+(n-1)*.075)));
        result.push({x,y,hp,special});
      }
    }
    return result;
  }
  function spawnWave(n,plan=null){
    wave=n;waveElapsed=0;waveTailSoftened=false;boss=null;
    summonSignals=[];ambientSignals=[];bossSummonClock=0;bossSummonTotal=0;bossSupportXP=0;
    const tiles=plan||createWavePlan(n);bricks=[];
    for(const tile of tiles)bricks.push(brickAt(tile.x,tile.y,tile.hp,
      {special:tile.special,summonAge:0,summonSource:"wave"}));
    if(n%WAVE_BOSS_EVERY===0)bossSpawn();
    clearPreview=[];clearPreviewShown=false;clearWindowActive=false;
    waveSpawnCount++;clearBurstCount=Math.max(0,n-1);clearBurstTiles=tiles.length;
    setState("第 "+wave+" 波 · "+(boss?"BOSS 核心":"整波破坏")+" · 清屏后进入下一波");
    updateUI();
    return tiles.length;
  }
  function generateWave(){
    bricks=[];serial=0;rowIndex=0;wave=1;
    spawnWave(1);
  }
  function reset(){
    wave=1;score=0;phase="ready";charge=0;elapsed=0;level=1;xp=0;xpGoal=34;
    waveElapsed=0;waveTailSoftened=false;waveSpawnCount=0;bossSummonTotal=0;clearWindowActive=false;
    choiceQueue=0;choiceSet=[];powerLevel=0;volleyLevel=0;rateLevel=0;speedLevel=0;lifeLevel=0;
    hunterLevel=0;ricochetLevel=0;splitLevel=0;shockLevel=0;drillLevel=0;arcLevel=0;
    screenClears=0;lastClearTime=-100;emptyLatch=false;clearFlash=0;rowTimer=0;nearClearClock=0;replenishClock=0;rowIndex=0;
    bridgeTimer=0;lastBridgeTime=-100;bridgeBursts=0;bridgeTiles=0;upperOnlyBridgeCount=0;cleanupWindow=0;cleanupStarted=false;cleanupActivations=0;clearPreview=[];clearPreviewShown=false;
    ambientSignals=[];ambientSummonClock=0;ambientSummonBursts=0;ambientSummonTiles=0;overlapSummonCount=0;clearBurstCount=0;clearBurstTiles=0;
    accumulator=0;uiClock=0;metricsClock=0;frameSamples=0;fpsNow=0;slowFrames=0;renderQuality="full";drawMs=0;
    boss=null;bossDefeats=0;bossSupportXP=0;bossSummonClock=0;summonSignals=[];ambientSignals=[];surgeUntil=0;alertUntil=0;
    shotsFired=0;brickContacts=0;shotMaxContacts=0;splitBursts=0;chainBursts=0;bonusVolleyBalls=0;homingTurns=0;shockWaves=0;directBreaks=0;giantRebounds=0;giantBrickRebounds=0;giantWallRebounds=0;giantTotalHits=0;
    shootClock=.8;skillsUsed=0;ricochetTriggers=0;aim=0;activePointer=null;balls=[];particles=[];giant=null;
    impactRings=[];floatTexts=[];combo=0;maxCombo=0;lastBreak=-99;comboVisibility=0;shake=0;hitCount=0;
    endgameWaveStats=[];electricStats=[];lightningArcs=[];lightningTriggers=0;lightningDamage=0;lightningOriginCount=0;
    armorHits=0;armorBreaks=0;armorCracks=0;finalWaveDurations=[];
    heavyHits=0;giantPiercings=0;giantHeavyBounces=0;powerShots=0;tailSoftens=0;
    selectedCannon=CANNON_CLASSES.free;selectedActive=ACTIVE_SKILLS.giant;
    juice.setMode("off");juice.setMode(impactMode.value);
    ui.choice.classList.add("hidden");ui.win.classList.add("hidden");$("startOverlay").classList.remove("hidden");
    $("finalRushLabel").classList.remove("active");
    generateWave();updateUI();
  }
  function begin(){
    if(phase!=="ready")return false;
    unlockSound();phase="playing";$("startOverlay").classList.add("hidden");
    setState("第 "+wave+" 波 · 战斗开始，清屏推进");playSfx("upgrade");updateUI();return true;
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
    return; // Never soften the last eight bricks in continuous survival.
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
    if(b.isBoss&&source==="giant")source="giantHeavy";
    hitCount++;
    if(source!=="giant"&&b.armored){
      const damage=source==="giantHeavy"?GIANT_HEAVY_DAMAGE:
        (source==="normal"||source==="drill")?Math.max(BASE_ARMOR_DAMAGE,Math.min(9,points)):
        source==="shock"?Math.max(1,points):1;
      const taken=Math.min(b.hp,damage);
      b.hp-=taken;armorHits+=taken;
      b.bonk=.12;impactVisual(b.x+b.w/2,b.y+b.h/2,b.hp===0);
      numberPop(b.x+b.w/2,b.y-1,"−"+taken,"#ffdfb2");
      if(b.hp>0){
        b.color=brickColor(b.hp,b.special);
        if(b.hp<=2&&!b.cracked){b.cracked=true;armorCracks++;}
        burst(b.x+b.w/2,b.y+b.h/2,"#ffd29d",4);
        juice.onArmor(b,impact);playSfx("armor");
        return false;
      }
      if(!b.cracked){armorCracks++;b.cracked=true;}
      b.armored=false;
    }
    if(b.cracked)armorBreaks++;
    b.hp=0;b.alive=false;score++;
    if(b.bossSupport){if(bossSupportXP<10){bossSupportXP++;addExperience(1);}}
    else if(!b.isBoss)addExperience(b.initialHp>=32?4:b.initialHp>=12?3:b.initialHp>=5?2:1);
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
    if(b.isBoss)defeatBoss();
    return true;
  }
  function makeBall(angle,mini=false){
    const speed=BALL_SPEED+speedLevel*18;
    return {x:shooter.x,y:shooter.y-28,vx:Math.sin(angle)*speed,
      vy:-Math.cos(angle)*speed,r:mini?SHOT_RADIUS*.83:SHOT_RADIUS,
      life:0,maxLife:BALL_TTL+lifeLevel*.9,trail:[],contacts:0,mini,splitDone:false,drill:false,
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
    const speed=Math.hypot(ball.vx,ball.vy);
    ball.vx=speed*dx/d;ball.vy=speed*dy/d;ball.huntsLeft--;
    homingTurns++;playSfx("hunt");
    return true;
  }
  function fire(){
    if(phase!=="playing"||balls.length>=MAX_BALLS)return;
    const volley=++shotsFired;
    const offsets=volleyLevel===0?[0]:volleyLevel===1?[-.17,.17]:[-.25,0,.25];
    for(let i=0;i<offsets.length;i++){
      if(balls.length>=MAX_BALLS)break;
      const shot=makeBall(aim+offsets[i]);
      if(drillLevel>0&&volley%(drillLevel===1?4:3)===0&&i===Math.floor(offsets.length/2)){
        shot.drill=true;shot.drillLeft=drillLevel===1?3:5;shot.r=SHOT_RADIUS*1.35;
        powerShots++;playSfx("drill");
      }
      balls.push(shot);
    }
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
    const steps=Math.max(1,Math.ceil(speed*dt/2.7)),step=dt/steps;
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
        if(!block.alive||(block.summonAge!==undefined&&block.summonAge<.20)||ball.x+ball.r<block.x||ball.x-ball.r>block.x+block.w||
          ball.y+ball.r<block.y||ball.y-ball.r>block.y+block.h||
          !circleIntersectsRect(ball.x,ball.y,ball.r,block))continue;
        if(ball.lastHitId===block.id&&ball.life-(ball.lastHitLife??-99)<.09)continue;
        ball.lastHitId=block.id;ball.lastHitLife=ball.life;
        const normal=contactNormal(ball,block,prevX,prevY);
        const incoming={vx:ball.vx,vy:ball.vy};
        const dmg=BASE_ARMOR_DAMAGE+powerLevel+(ball.drill?drillLevel+1:0)+ball.chargeStacks;
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
    return ball.y<H+10&&ball.life<(ball.mini?4.1:ball.maxLife);
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
    const steps=Math.max(1,Math.ceil(speed*dt/3.5)),step=dt/steps;
    for(let i=0;i<steps;i++){
      const prevX=giant.x,prevY=giant.y;
      giant.x+=giant.vx*step;giant.y+=giant.vy*step;
      if(giant.x<giant.r){giant.x=giant.r;giant.vx=Math.abs(giant.vx);recordGiantBounce("wall");}
      if(giant.x>W-giant.r){giant.x=W-giant.r;giant.vx=-Math.abs(giant.vx);recordGiantBounce("wall");}
      if(giant.y<giant.r+4){giant.y=giant.r+4;giant.vy=Math.abs(giant.vy);recordGiantBounce("wall");}
      // A short-lived force-field floor keeps the ultimate circulating in the brick arena.
      if(giant.y>H-83-giant.r){giant.y=H-83-giant.r;giant.vy=-Math.abs(giant.vy);recordGiantBounce("wall");}
      for(const block of bricks){
        if(!block.alive||(block.summonAge!==undefined&&block.summonAge<.20)||giant.x+giant.r<block.x||giant.x-giant.r>block.x+block.w||
          giant.y+giant.r<block.y||giant.y-giant.r>block.y+block.h||
          !circleIntersectsRect(giant.x,giant.y,giant.r,block))continue;
        if(giant.lastHitId===block.id && giant.life-giant.lastHitLife<.10)continue;
        giant.lastHitId=block.id;giant.lastHitLife=giant.life;
        const normal=contactNormal(giant,block,prevX,prevY);
        const impact={vx:giant.vx,vy:giant.vy};
        // Giant rule: remaining HP <=5 (or already cracked) explodes and
        // pierces. Above 5 chips three points and bounces by real surface normal.
        const penetrates=!block.isBoss&&(block.hp<=GIANT_PIERCE_HP || block.cracked);
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
  const SKILL_DATA={
    rate:["射速训练","发射间隔 -0.075 秒"],speed:["弹速训练","弹球速度 +18"],life:["弹跳续航","普通球留场时间 +0.9 秒"],
    power:["火力强化","普通球基础伤害 +1"],volley:["散射进化","双发 → 三发弹幕"],
    split:["碎星裂变","撞击分裂弹球"],arc:["电弧印记","碰撞触发连锁闪电"],
    drill:["钻头穿阵","周期性穿透多个目标"],shock:["震荡核心","击碎产生范围爆炸"],
    hunter:["追猎弯弹","墙壁反弹后追击目标"],ricochet:["蓄能弹跳","反弹积蓄下一次攻击伤害"]
  };
  const SKILL_CAP={rate:5,speed:4,life:4,power:3,volley:2,split:2,arc:2,drill:2,shock:2,hunter:2,ricochet:2};
  function skillLevel(kind){
    return kind==="rate"?rateLevel:kind==="speed"?speedLevel:kind==="life"?lifeLevel:
      kind==="power"?powerLevel:kind==="volley"?volleyLevel:kind==="split"?splitLevel:
      kind==="arc"?arcLevel:kind==="drill"?drillLevel:kind==="shock"?shockLevel:
      kind==="hunter"?hunterLevel:ricochetLevel;
  }
  function skillStage(){
    if(elapsed<34||level<=3)return 0;
    if(elapsed<85||level<=5)return 1;
    return 2;
  }
  function eligibleSkills(){
    const stage=skillStage(),basic=["rate","speed","life"],
      intermediate=["power","ricochet","hunter","drill"],
      advanced=["volley","split","shock","arc"];
    const names=[...basic,...(stage>=1?intermediate:[]),...(stage>=2?advanced:[])];
    return names.filter(kind=>skillLevel(kind)<SKILL_CAP[kind]);
  }
  function offerChoice(){
    if(phase!=="playing"||choiceQueue<=0)return false;
    const pool=eligibleSkills();
    if(!pool.length){choiceQueue=0;return false;}
    const priority=pool.map((kind,i)=>({kind,weight:hash01(level,i,choiceQueue)+
      ((kind==="arc"&&splitLevel)||(kind==="shock"&&drillLevel)?-.35:0)})).sort((a,b)=>a.weight-b.weight);
    const selected=level===2?["rate","speed","life"].filter(k=>pool.includes(k)):
      priority.slice(0,3).map(x=>x.kind);
    choiceSet=selected;
    while(choiceSet.length<3)choiceSet.push(choiceSet[(choiceSet.length-1)%Math.max(1,choiceSet.length)]);
    phase="choosing";choiceQueue--;
    $("choiceWave").textContent=choiceReason==="boss"?"BOSS DEFEATED · BONUS":
      (skillStage()===0?"基础训练 · ":"技能升级 · ")+"LV."+level;
    for(let i=0;i<3;i++){
      const skill=SKILL_DATA[choiceSet[i]],lv=skillLevel(choiceSet[i]);
      $("choiceTitle"+i).textContent=skill[0]+"  "+(lv+1);
      $("choiceDesc"+i).textContent=skill[1];
    }
    ui.choice.classList.remove("hidden");setState("升级暂停 · 三选一");updateUI();
    return true;
  }
  function chooseUpgrade(kind){
    if(phase!=="choosing"||!choiceSet.includes(kind))return false;
    if(kind==="rate")rateLevel++;else if(kind==="speed")speedLevel++;else if(kind==="life")lifeLevel++;
    else if(kind==="power")powerLevel++;else if(kind==="volley")volleyLevel++;
    else if(kind==="split")splitLevel++;else if(kind==="arc")arcLevel++;else if(kind==="drill")drillLevel++;
    else if(kind==="shock")shockLevel++;else if(kind==="hunter")hunterLevel++;else if(kind==="ricochet")ricochetLevel++;
    phase="playing";choiceSet=[];ui.choice.classList.add("hidden");playSfx("upgrade");
    if(choiceQueue>0)offerChoice();else{setState("升级完成 · 继续破坏");updateUI();}
    return true;
  }
  function addExperience(amount){
    if(amount<=0)return;
    xp+=amount;
    while(xp>=xpGoal){
      xp-=xpGoal;level++;xpGoal=Math.round(28+10*Math.pow(level-1,1.14));
      choiceQueue++;choiceReason="upgrade";
    }
  }
  function bossSpawn(){
    if(boss&&boss.alive)return false;
    const hp=75+wave*18+bossDefeats*15;
    boss=brickAt(138,108,hp,{w:84,h:53,isBoss:true,color:"#ab66f5"});
    bricks.push(boss);bossSummonClock=0;bossSummonTotal=0;bossSupportXP=0;summonSignals=[];
    alertUntil=elapsed+2.5;setState("第 "+wave+" 波 · BOSS 核心已降临！");
    if(phase==="playing")playSfx("giant");return true;
  }
  function summonBossBricks(){
    if(!boss||!boss.alive||bossSummonTotal>=BOSS_SUPPORT_LIMIT_TOTAL)return 0;
    const supports=bricks.filter(b=>b.alive&&b.bossSupport&&b.bossId===boss.id);
    const pending=summonSignals.filter(sig=>sig.bossId===boss.id);
    const summonCount=Math.min(4,2+Math.floor(level/5));
    const supportCap=Math.min(14,8+Math.floor(level/3)+bossDefeats);
    // Fill free grid columns on either side of the core, or recruit existing
    // ordinary tiles instead of stacking solids in the same collision space.
    const rows=[-60,-30,0,30,60,90],cols=[0,1,2,6,7,8];
    let queued=0;
    for(let j=0;j<rows.length*cols.length&&queued<summonCount&&
      supports.length+pending.length+queued<supportCap;j++){
      const index=(j+Math.floor(elapsed/5)*3)%(rows.length*cols.length);
      const col=cols[index%cols.length],ry=rows[Math.floor(index/cols.length)];
      const x=12+col*BRICK_STEP_X,y=boss.y+ry;
      if(y<SUMMON_SAFE_TOP||y+BRICK_H>SUMMON_SAFE_BOTTOM)continue;
      const existing=bricks.find(t=>t.alive&&!t.isBoss&&!t.bossSupport&&
        Math.abs(t.x-x)<BRICK_W/2&&Math.abs(t.y-y)<BRICK_H/2);
      if(existing){
        if(summonSignals.some(sig=>sig.targetId===existing.id))continue;
        summonSignals.push({bossId:boss.id,dx:existing.x-boss.x,dy:existing.y-boss.y,
          age:0,delay:BOSS_WARNING,targetId:existing.id,w:BRICK_W,h:BRICK_H,hp:existing.hp});
        queued++;
      }else if(isSlotFree(x,y)){
        summonSignals.push({bossId:boss.id,dx:x-boss.x,dy:y-boss.y,
          age:0,delay:BOSS_WARNING,targetId:null,w:BRICK_W,h:BRICK_H,
          hp:2+Math.floor(hash01(boss.id,Math.floor(elapsed/5),j)*7)});
        queued++;
      }
    }
    if(queued){bossSummonTotal+=queued;setState("Boss 召唤 · 有限辅助砖正在凝聚");}
    return queued;
  }
  function updateSummonSignals(dt){
    if(!boss||!boss.alive){summonSignals=[];return;}
    for(let i=summonSignals.length-1;i>=0;i--){
      const sig=summonSignals[i];
      if(sig.bossId!==boss.id){summonSignals.splice(i,1);continue;}
      sig.age+=dt;
      if(sig.age<sig.delay)continue;
      summonSignals.splice(i,1);
      const x=boss.x+sig.dx,y=boss.y+sig.dy;
      let tile=sig.targetId?bricks.find(b=>b.alive&&b.id===sig.targetId):null;
      if(tile){
        tile.bossSupport=true;tile.bossId=boss.id;tile.summonAge=0;tile.summonSource="boss";
      }else if(isSlotFree(x,y)){
        tile=brickAt(x,y,sig.hp,{bossSupport:true,bossId:boss.id,
          color:brickColor(sig.hp,false),summonAge:0,summonSource:"boss"});
        bricks.push(tile);
      }
      if(tile)burst(tile.x+tile.w/2,tile.y+tile.h/2,"#8cceff",5);
    }
  }
  function ambientHp(tier,r,c,special,source){
    if(special)return 1;
    const roll=hash01(tier,r,c,source==="clear"?47:source==="reinforce"?31:23);
    if(source==="clear"){
      if(roll<.36)return 1;
      if(roll<.60)return 2+Math.floor(hash01(tier,r,c,48)*2);
      if(roll<.80)return 4+Math.floor(hash01(tier,r,c,49)*4);
    }else if(roll<.18)return 1;
    else if(roll<.32)return 2+Math.floor(hash01(tier,r,c,50)*3);
    return brickHP(tier,r,c,special);
  }
  function summonAmbientBricks(count=5,source="ambient"){
    const liveCount=livingCount(),liveCap=Math.min(MAX_BRICKS,65+Math.floor(elapsed/55)*7);
    const budget=Math.min(count,Math.max(0,liveCap+4-liveCount-ambientSignals.length),
      Math.max(0,(source==="reinforce"?30:10)-ambientSignals.length));
    if(budget<=0)return 0;
    const anchors=bricks.filter(b=>b.alive&&!b.isBoss&&!b.bossSupport&&
      b.y>=SUMMON_SAFE_TOP&&b.y+b.h<=SUMMON_SAFE_BOTTOM);
    const tier=1+Math.min(9,Math.floor(elapsed/46));
    const offsets=[[0,-30],[0,30],[-1,0],[1,0],[-1,-30],[1,-30],
      [-1,30],[1,30],[0,-60],[0,60],[-2,0],[2,0],[-2,30],[2,30]];
    let queued=0;
    for(let i=0;i<budget;i++){
      const seed=ambientSummonBursts*97+i+1;
      const anchor=anchors.length?anchors[Math.floor(hash01(seed,rowIndex,serial+i,3)*anchors.length)]:null;
      let selected=null;
      if(anchor){
        const col=Math.round((anchor.x-12)/BRICK_STEP_X);
        for(let j=0;j<offsets.length;j++){
          const [dx,dy]=offsets[(j+i)%offsets.length],c=col+dx;
          if(c<0||c>=BRICK_COLUMNS)continue;
          const x=12+c*BRICK_STEP_X,y=anchor.y+dy;
          if(isSlotFree(x,y)){selected={x,y};break;}
        }
      }
      if(!selected){
        // Search multiple legal standard grid positions when the chosen
        // neighborhood is occupied, never placing a smaller overlapping tile.
        for(let j=0;j<90;j++){
          const col=(seed+j*3)%BRICK_COLUMNS,row=(Math.floor(seed/3)+j*7)%9;
          const x=12+col*BRICK_STEP_X,y=55+row*29;
          if(isSlotFree(x,y)){selected={x,y};break;}
        }
      }
      if(!selected)continue;
      const special=source!=="reinforce"&&(serial+i)%19===0;
      let hp=ambientHp(tier,rowIndex+i,serial+i,special,source);
      if(tier>=4&&hp>1)hp=Math.min(180,Math.round(hp*(1+Math.floor(elapsed/135)*.22)));
      ambientSignals.push({...selected,w:BRICK_W,h:BRICK_H,age:0,
        delay:source==="reinforce"?BRIDGE_WARNING:BRIDGE_WARNING,hp,special,source});
      queued++;
    }
    if(queued){
      ambientSummonBursts++;
      setState(source==="ambient"?"召唤砖潮 · 标准砖阵正在凝聚":"砖潮增援 · 战场重新填满");
    }
    return queued;
  }
  function updateAmbientSummons(dt,speed){
    for(let i=ambientSignals.length-1;i>=0;i--){
      const sig=ambientSignals[i];sig.age+=dt;sig.y+=speed*dt;
      if(sig.age<sig.delay)continue;
      ambientSignals.splice(i,1);
      if(!isSlotFree(sig.x,sig.y))continue;
      const tile=brickAt(sig.x,sig.y,sig.hp,
        {special:sig.special,color:brickColor(sig.hp,sig.special),
          summonAge:0,summonSource:sig.source});
      bricks.push(tile);ambientSummonTiles++;
      burst(tile.x+tile.w/2,tile.y+tile.h/2,"#70e7d2",5);
    }
  }
  function defeatBoss(){
    if(!boss)return;
    bossDefeats++;
    const x=boss.x+boss.w/2,y=boss.y+boss.h/2;
    for(const b of bricks)if(b.alive&&b.bossSupport&&b.bossId===boss.id){
      b.alive=false;score++;burst(b.x+b.w/2,b.y+b.h/2,"#8bd9ff",9);
    }
    burst(x,y,"#d3a2ff",50);juice.onSplash({x,y});shake=.18;
    boss=null;summonSignals=[];choiceQueue++;choiceReason="boss";alertUntil=elapsed+4;
    setState("BOSS 核心击破 · 额外升级！");playSfx("shock");
  }
  function zoneCounts(){
    let upper=0,middle=0,lower=0;
    for(const b of bricks)if(b.alive&&!b.isBoss){
      if(b.y<UPPER_LIMIT)upper++;
      else if(b.y<LOWER_START)middle++;
      else lower++;
    }
    return {upper,middle,lower,total:upper+middle+lower};
  }
  function bottomBridgeHp(upperOnly,tier,r,c){
    const f=hash01(tier,r,c,upperOnly?77:79);
    if(!upperOnly)return f<.64?1:f<.91?2:3;
    // Medium HP is RELATIVE to the current stage, not a permanent 3–6
    // once the player can destroy 100-HP blocks with chain attacks.
    const base=tier<=2?3:tier<=4?5:tier<=6?8:12;
    return base+Math.floor(f*(tier<=2?4:tier<=4?6:tier<=6?9:13));
  }
  function planClearBurst(){
    return createWavePlan(wave+1);
  }
  function queueBridge(nearClearRecovery=false){
    if(boss&&boss.alive)return 0;
    const z=zoneCounts(),tier=1+Math.min(9,Math.floor(elapsed/46));
    if(!nearClearRecovery&&(z.total<=6||elapsed<26||elapsed-lastBridgeTime<4.2))return 0;
    const upperOnly=z.upper>=7&&z.middle+z.lower<=3;
    const targets=[[1,309],[4,312],[7,309],[2,279],[6,281],[4,230],[0,247],[8,246],[3,333],[5,332]];
    const limit=nearClearRecovery?3:Math.min(8,Math.max(4,7-z.lower));
    const source=nearClearRecovery?"recovery":"bridge";
    let queued=0;
    for(let i=0;i<targets.length&&queued<limit;i++){
      const [col,y]=targets[(i+bridgeBursts)%targets.length],x=12+col*BRICK_STEP_X;
      if(!isSlotFree(x,y))continue;
      const hp=bottomBridgeHp(upperOnly,tier,bridgeBursts,i);
      ambientSignals.push({x,y,w:BRICK_W,h:BRICK_H,age:0,delay:BRIDGE_WARNING,
        hp,special:false,source});
      queued++;
    }
    if(queued){
      bridgeBursts++;bridgeTiles+=queued;lastBridgeTime=elapsed;
      if(upperOnly)upperOnlyBridgeCount++;
      setState(upperOnly?"连击承接 · 中耐久桥接砖凝聚":"连击承接 · 中下层反弹砖凝聚");
    }
    return queued;
  }
  function spawnClearBurst(){
    const next=wave+1;
    const count=spawnWave(next,clearPreview.length?clearPreview:null);
    return count;
  }
  function generateSurvival(dt){
    // Whole-wave contract: no ordinary rows, ambient summons, bridge spawns or
    // reinforcements. Only an alive Boss may summon a finite support set.
    if(!emptyLatch){
      waveElapsed+=dt;
      const speed=Math.min(6.1,FALL_BASE+Math.max(0,wave-1)*.07);
      for(const brick of bricks)if(brick.alive)brick.y+=speed*dt;
      const danger=bricks.find(b=>b.alive&&b.y+b.h>=DANGER_Y);
      if(danger){
        phase="lost";balls=[];giant=null;ui.win.classList.remove("hidden");
        const seconds=Math.floor(elapsed);
        ui.final.textContent="生存 "+Math.floor(seconds/60)+"分"+seconds%60+
          "秒 · 击碎 "+score+" 块 · 到达第 "+wave+" 波 · LV."+level+
          " · 清屏 "+screenClears+" 次 · Boss "+bossDefeats+" 个";
        setState("砖阵触线 · 第 "+wave+" 波失败");
        playSfx("shock");updateUI();return;
      }
      if(boss&&boss.alive){
        bossSummonClock+=dt;
        if(bossSummonClock>=BOSS_SUPPORT_INTERVAL){
          bossSummonClock=0;
          if(bossSummonTotal<BOSS_SUPPORT_LIMIT_TOTAL)summonBossBricks();
        }
        updateSummonSignals(dt);
      }
      // Final few tiles are still physically broken by the player's shots.
      // Gentle softening avoids long, dead-air single-target cleanup.
      const live=bricks.filter(b=>b.alive);
      if(live.length<=3&&live.length>0&&!boss&&waveElapsed>12&&!waveTailSoftened){
        waveTailSoftened=true;
        for(const b of live)if(b.hp>3){
          b.hp=3;b.color=brickColor(b.hp,b.special);b.cracked=true;tailSoftens++;
          numberPop(b.x+b.w/2,b.y-5,"↓3","#c1f2ff");
        }
      }
      if(!live.length&&!boss){
        emptyLatch=true;clearWindowActive=true;
        screenClears++;clearFlash=1;
        replenishClock=CLEAR_CELEBRATE+CLEAR_WARNING;
        clearPreview=[];clearPreviewShown=false;ambientSignals=[];summonSignals=[];
        alertUntil=elapsed+replenishClock;
        setState("PERFECT CLEAR · 第 "+wave+" 波完成！");
        if(elapsed-lastClearTime>=32){
          lastClearTime=elapsed;addExperience(Math.max(3,Math.floor(xpGoal*.25)));
        }
        playSfx("upgrade");
      }
    }else{
      replenishClock-=dt;
      if(replenishClock<=CLEAR_WARNING&&!clearPreviewShown){
        clearPreview=planClearBurst();clearPreviewShown=true;
        setState("第 "+(wave+1)+" 波 · 大规模砖阵预警");
      }
      if(replenishClock<=0){
        spawnClearBurst();
        emptyLatch=false;clearWindowActive=false;rowTimer=0;
      }
    }
    for(const b of bricks)if(b.alive&&b.summonAge!==undefined)
      b.summonAge=Math.min(.7,b.summonAge+dt);
    if(clearFlash>0)clearFlash=Math.max(0,clearFlash-dt);
  }
  function update(dt){
    if(phase!=="playing")return;
    elapsed+=dt;shootClock+=dt;
    generateSurvival(dt);
    if(phase!=="playing")return;
    const fireInterval=Math.max(.69,FIRE_INTERVAL-rateLevel*.075);
    if(shootClock>=fireInterval){shootClock-=fireInterval;fire();}
    const currentBalls=balls.slice(),kept=currentBalls.filter(b=>updateBall(b,dt));
    const newborn=balls.filter(b=>!currentBalls.includes(b));balls=kept.concat(newborn).slice(0,MAX_BALLS);
    lightningArcs.forEach(e=>e.age+=dt);lightningArcs=lightningArcs.filter(e=>e.age<e.duration);
    updateGiant(dt);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt;});
    particles=particles.filter(p=>p.life>0);
    for(const b of bricks)if(b.alive&&b.bonk>0)b.bonk=Math.max(0,b.bonk-dt);
    impactRings.forEach(e=>e.age+=dt);impactRings=impactRings.filter(e=>e.age<(e.hard?.24:.15));
    floatTexts.forEach(e=>e.age+=dt);floatTexts=floatTexts.filter(e=>e.age<.56);
    comboVisibility=Math.max(0,comboVisibility-dt);shake=Math.max(0,shake-dt);
    juice.update(dt,bricks);
    // Dead bricks must not accumulate and inflate every projectile collision scan.
    if(Math.floor((elapsed-dt)*2)!==Math.floor(elapsed*2))
      bricks=bricks.filter(b=>b.alive);
    if(choiceQueue>0)offerChoice();
    const message=$("finalRushLabel");
    if(elapsed<alertUntil){message.classList.add("active");message.textContent=emptyLatch?"PERFECT CLEAR · 第 "+wave+" 波清屏":boss&&boss.alive?"BOSS · 第 "+wave+" 波":"WAVE "+wave;}
    else message.classList.remove("active");
    uiClock+=dt;
    if(uiClock>=.10){uiClock=0;updateUI();}
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
    ctx.save();
    ctx.setLineDash([8,5]);ctx.strokeStyle="#ff667c";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,DANGER_Y);ctx.lineTo(W,DANGER_Y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle="#ffb3bd";ctx.font="bold 10px system-ui";ctx.textAlign="left";ctx.fillText("DANGER LINE",7,DANGER_Y-8);
    if(clearFlash>0){ctx.fillStyle="rgba(80,246,216,"+(clearFlash*.12)+")";ctx.fillRect(0,0,W,H);}
    ctx.restore();
    // Lightweight telegraph: a flickering outline appears before a Boss brick
    // becomes solid; it never collides during the warning phase.
    if(summonSignals.length&&boss&&boss.alive){
      ctx.save();
      for(const sig of summonSignals){
        const x=boss.x+sig.dx,y=boss.y+sig.dy;
        const t=sig.age/sig.delay,pulse=.5+.5*Math.sin(t*9.42);
        ctx.globalAlpha=reducedMotion?.5:.27+.53*pulse;
        ctx.lineWidth=1.6;ctx.strokeStyle="#8fe9ff";ctx.shadowColor="#7dcfff";
        ctx.shadowBlur=renderQuality==="full"?12:2;
        ctx.setLineDash([3,4]);rounded(x,y,sig.w||BRICK_W,sig.h||BRICK_H,4);ctx.stroke();
        ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x+4,y+(sig.h||BRICK_H)/2);ctx.lineTo(x+(sig.w||BRICK_W)-4,y+(sig.h||BRICK_H)/2);ctx.stroke();
      }
      ctx.restore();
    }
    if(clearPreviewShown&&clearPreview.length){
      ctx.save();
      const t=clamp((CLEAR_WARNING-Math.max(0,replenishClock))/CLEAR_WARNING,0,1);
      ctx.lineWidth=1.5;ctx.strokeStyle="#b4f7e8";
      ctx.globalAlpha=reducedMotion?.55:.25+.50*(.5+.5*Math.sin(t*16));
      ctx.shadowColor="#66d9d3";ctx.shadowBlur=renderQuality==="full"?4:0;
      ctx.setLineDash([4,3]);
      for(const tile of clearPreview){rounded(tile.x,tile.y,BRICK_W,BRICK_H,4);ctx.stroke();}
      ctx.setLineDash([]);ctx.restore();
    }
    if(ambientSignals.length){
      ctx.save();
      for(const sig of ambientSignals){
        const pulse=.5+.5*Math.sin(sig.age*13),alpha=reducedMotion?.42:.18+.34*pulse;
        ctx.globalAlpha=alpha;ctx.lineWidth=1.35;
        ctx.strokeStyle=sig.source==="reinforce"?"#b9ffe4":"#83f1dc";
        ctx.shadowColor="#70e7d2";ctx.shadowBlur=renderQuality==="full"?7:1;
        ctx.setLineDash([3,4]);
        rounded(sig.x,sig.y,sig.w,sig.h,4);ctx.stroke();ctx.setLineDash([]);
      }
      ctx.restore();
    }
    for(const brick of bricks){
      if(!brick.alive) continue;
      ctx.save();
      if(brick.isBoss){
        ctx.shadowColor="#bd76ff";ctx.shadowBlur=25;ctx.fillStyle="#613d92";
        rounded(brick.x,brick.y,brick.w,brick.h,12);ctx.fill();
        ctx.lineWidth=3;ctx.strokeStyle="#d89cff";ctx.stroke();ctx.shadowBlur=0;
        ctx.fillStyle="#f6e8ff";ctx.font="900 17px system-ui";ctx.textAlign="center";
        ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+brick.h/2+6);
        ctx.restore();continue;
      }
      if(brick.summonAge!==undefined&&brick.summonAge<.38&&!reducedMotion){
        const t=Math.max(0,brick.summonAge/.38),scale=.5+.5*(1-Math.pow(1-t,3));
        ctx.globalAlpha=.35+.65*t;ctx.translate(brick.x+brick.w/2,brick.y+brick.h/2);
        ctx.scale(scale,scale);ctx.translate(-brick.x-brick.w/2,-brick.y-brick.h/2);
      }
      if(juice.mode!=="off")juice.applyBrickMotion(ctx,brick);
      else if(brick.bonk>0 && !reducedMotion){
        const intensity=Math.sin((brick.bonk/.12)*Math.PI)*.045;
        ctx.translate(brick.x+brick.w/2,brick.y+brick.h/2);
        ctx.scale(1+intensity,1-intensity);
        ctx.translate(-brick.x-brick.w/2,-brick.y-brick.h/2);
      }
      ctx.shadowColor=brick.color;ctx.shadowBlur=renderQuality==="full"?7:2;ctx.fillStyle=brick.color;
      rounded(brick.x,brick.y,brick.w,brick.h,4);ctx.fill();ctx.shadowBlur=0;
      // Readability: big double-digit armor stands out without cluttering HP1 tiles.
      if(brick.hp>=15&&!brick.special){
        ctx.strokeStyle=brick.hp>=25?"#ffe7a4":"#ffc99d";ctx.lineWidth=1.35;
        rounded(brick.x+.7,brick.y+.7,brick.w-1.4,brick.h-1.4,4);ctx.stroke();
      }
      if(brick.cracked){
        ctx.fillStyle="#ffffff3f";rounded(brick.x+3,brick.y+3,brick.w-6,3,2);ctx.fill();
        ctx.strokeStyle="#fff1bc";ctx.lineWidth=1.3;ctx.beginPath();
        ctx.moveTo(brick.x+7,brick.y+2);ctx.lineTo(brick.x+13,brick.y+10);
        ctx.lineTo(brick.x+9,brick.y+15);ctx.lineTo(brick.x+18,brick.y+21);
        ctx.stroke();
        if(brick.hp>1){ctx.fillStyle="#ffffff";ctx.font="bold 13px system-ui";ctx.textAlign="center";ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+Math.min(16,brick.h-4));}
      }else{
        // Untouched numbered tiles show remaining HP; HP1 stays hidden.
        // Color communicates HP tier; numeral communicates exact remaining work.
        if(brick.armored){
          ctx.fillStyle="#ffffff1c";rounded(brick.x+1.5,brick.y+1.5,brick.w-3,4,2);ctx.fill();
        }
        ctx.fillStyle=brick.special?"#083e2b":"#ffffff";
        ctx.font="bold 13px system-ui";ctx.textAlign="center";
        if(brick.hp>1) ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+Math.min(16,brick.h-4));
        if(brick.hp===1 && !brick.special){ctx.fillStyle="#ffffff40";rounded(brick.x+4,brick.y+4,brick.w-8,2,1);ctx.fill();}
        if(brick.special){
          ctx.fillStyle="#0b4f35";ctx.font="bold 7px system-ui";
          ctx.fillText("★",brick.x+brick.w-6,brick.y+8);
        }
      }
      if(!brick.bossSupport&&brick.summonSource&&brick.summonAge!==undefined&&brick.summonAge<.7&&!reducedMotion){
        const t=brick.summonAge/.7;
        ctx.save();ctx.globalAlpha=Math.max(0,.48*(1-t));
        ctx.strokeStyle=brick.summonSource==="clear"?"#b6f7ff":"#70e7d2";
        ctx.lineWidth=1.5;
        rounded(brick.x-5*t,brick.y-5*t,brick.w+10*t,brick.h+10*t,4+4*t);ctx.stroke();ctx.restore();
      }
      if(brick.bossSupport){
        ctx.strokeStyle="#8bdcff";ctx.lineWidth=1.3;
        rounded(brick.x-.8,brick.y-.8,brick.w+1.6,brick.h+1.6,5);ctx.stroke();
        if(brick.summonAge!==undefined&&brick.summonAge<.7&&!reducedMotion){
          const t=brick.summonAge/.7;
          ctx.globalAlpha=Math.max(0,.85*(1-t));ctx.strokeStyle="#b2f8ff";ctx.lineWidth=2.4;
          rounded(brick.x-8*t,brick.y-8*t,brick.w+16*t,brick.h+16*t,5+6*t);ctx.stroke();
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
    ctx.fillText(phase==="choosing"?"选择强化以继续":phase==="lost"?"挑战结束":"滑动瞄准 · 击碎升级 · 避免触线",W/2,H-10);
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
  $("start").addEventListener("click",begin);
  $("bossDemo").addEventListener("click",()=>{
    if(!begin())return;
    spawnWave(WAVE_BOSS_EVERY);
    boss.hp=48;boss.initialHp=48;
    splitLevel=1;arcLevel=1;volleyLevel=1;shockLevel=1;level=6;xpGoal=66;
    summonBossBricks();
    setState("Boss 试玩 · 已配置分裂+电弧+散射 Build");updateUI();
  });
  for(let i=0;i<3;i++)$("choice"+i).addEventListener("click",()=>{unlockSound();chooseUpgrade(choiceSet[i]);});
  $("again").addEventListener("click",()=>{unlockSound();reset();begin();});
  $("reset").addEventListener("click",()=>{unlockSound();reset();begin();});
  window.addEventListener("keydown",e=>{
    if(e.code==="ArrowLeft"){aim=clamp(aim-.09,-1.08,1.08);e.preventDefault();}
    if(e.code==="ArrowRight"){aim=clamp(aim+.09,-1.08,1.08);e.preventDefault();}
    if(e.code==="Space"){fireGiant();e.preventDefault();}
  });
  function frame(now) {
    const delta=document.hidden?0:clamp((now-lastFrame)/1000,0,.06);
    lastFrame=now;
    // 120Hz fixed physics; rAF draws on each display refresh (60/90/120Hz if supported).
    accumulator=Math.min(.06,accumulator+delta);
    let steps=0;
    while(accumulator>=PHYSICS_DT-1e-8&&steps<MAX_FRAME_STEPS){
      update(PHYSICS_DT);accumulator-=PHYSICS_DT;steps++;
    }
    if(steps>=MAX_FRAME_STEPS&&accumulator>=PHYSICS_DT)accumulator=0;
    if(delta>0){
      metricsClock+=delta;frameSamples++;
      if(metricsClock>=1){
        fpsNow=Math.round(frameSamples/metricsClock);
        renderQuality=fpsNow<48?"lite":"full";
        $("fpsStat").textContent="FPS "+fpsNow;
        metricsClock=0;frameSamples=0;
      }
    }
    draw();requestAnimationFrame(frame);
  }
  function snapshot() {
    return {phase,wave,score,aim,interval:Math.max(.69,FIRE_INTERVAL-rateLevel*.075),fpsNow,renderQuality,physicsHz:120,level,xp,xpGoal,choiceQueue,choiceSet:choiceSet.join(","),powerLevel,volleyLevel,rateLevel,speedLevel,lifeLevel,rowIndex,screenClears,waveElapsed,waveSpawnCount,bossSummonTotal,clearWindowActive,nearClearClock,replenishClock,cleanupWindow,cleanupStarted,cleanupActivations,bridgeTimer,bridgeBursts,bridgeTiles,upperOnlyBridgeCount,zoneCounts:zoneCounts(),clearPreviewCount:clearPreview.length,clearPreviewShown,summonWarningCount:summonSignals.length,ambientSummonClock,ambientSummonBursts,ambientSummonTiles,ambientSummonWarningCount:ambientSignals.length,overlapSummonCount,clearBurstCount,clearBurstTiles,bossActive:!!(boss&&boss.alive),bossHp:boss?.hp||0,bossDefeats,brickCount:livingCount(),surgeActive:elapsed<surgeUntil,hunterLevel,ricochetLevel,
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
        bricks.forEach(b=>{b.alive=false;});updateUI();
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
      setBrickHp(id,hp){const b=bricks.find(x=>x.id===id);if(!b)return false;b.hp=hp;b.initialHp=hp;b.armored=hp>1;b.cracked=false;b.color=brickColor(hp,b.special);return true;},
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
      reset,begin,addRow,bossSpawn,summonBossBricks,generateSurvival,addExperience,offerChoice,chooseUpgrade,
      createWavePlan,spawnWave,planClearBurst,
      spawnClearBurst,
      colorForHp:hp=>brickColor(hp,false),skillStage,
      chooseIndex(index){return chooseUpgrade(choiceSet[index]);},
      forceSurvivalTime(t){elapsed=t;},
      overlapPairs(){const alive=bricks.filter(b=>b.alive);let pairs=0;
        for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++)
          if(rectanglesOverlap(alive[i],alive[j],0))pairs++;
        return pairs;
      },
      setLevelForTest(n){level=Math.max(1,n);},
      spawnBossNow(){return bossSpawn();},
      removeNormalBricks(){for(const b of bricks)if(b.alive&&!b.isBoss&&!b.bossSupport)b.alive=false;},
      leaveBricks(n){let kept=0;for(const b of bricks)if(b.alive&&!b.isBoss&&!b.bossSupport){if(kept++>=n)b.alive=false;}},
      setBossHp(hp){if(boss&&boss.alive){boss.hp=hp;boss.initialHp=hp;}},
      isSoundRunning(){return soundContext?.state==="running";}
    };
  }
  reset();lastFrame=performance.now();requestAnimationFrame(frame);
})();
