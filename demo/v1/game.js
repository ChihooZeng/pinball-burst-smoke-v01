/* PINBALL_AUDIO_QA_V2_1_20261109: 四类音效事件（砖甲受击 / 砖块击破 / 清屏升级 / 触线失败），
   保留 20 波实战与第10关诊断。玩法、技能、数值、关卡、弹道、打击感均未改动。 */
"use strict";
(() => {
  const Build=window.PinballBuilds, CFG=Build.CONFIG;
  const locale=window.PinballI18n, {t:translate}=locale;
  const boot=window.PinballBoot,analytics=window.PinballAnalytics;
  const analyticsEvents={
    wave_start:"wave_start",wave_clear:"wave_clear",choice:"upgrade_selected",
    seed:"faction_selected",boss_start:"boss_start",boss_defeated:"boss_defeated",
    touchline:"game_over",complete:"game_complete",restart:"game_restart",
    paused:"pause",resumed:"resume",heartbeat:"run_heartbeat"
  };
  const analyticsState=()=>({wave,seconds:Math.floor(battleTime),faction:build.seedAbility});
  const qaMode=new URLSearchParams(location.search).get("qa")==="1";
  const version="1.0.0-rc.2";
  document.querySelector("#qaBossPreview").hidden=!qaMode;
  document.querySelector("#diagnostics").hidden=!qaMode;
  let lastMessage=null, failure=null, practiceRun=false, nextHeartbeat=15;
  const durationText=seconds=>translate("time",{min:Math.floor(seconds/60),sec:Math.floor(seconds%60)});
  const bossName=()=>translate(wave===MAX_WAVES?"finalBossName":"bossName");
  const W = 360, MAX_WAVES = CFG.maxWaves;
  let H = 560, DANGER_Y=455, WAVE_START_Y=84;
  let pausedFrom=null, focusBeforePause=null, battleTime=0, waveMetrics=null, waveReports=[], bankDamage=0;
  let precisionTurns=0,focusDamage=0,gunBonusDamage=0,weakpointDamage=0,weakpointCharge=0,damageDealt=0,shotsWithContact=0;
  let waveFallMultiplier=1;
  const FIRST_SKILL_KEY='pinball-overload-first-skill-v1',SIDE_KEY='pinball-overload-skill-side-v1',AUTO_KEY='pinball-overload-auto-skill-v1';
  let firstSkillUsed=false,skillSide='right',autoSkill=true;
  try{firstSkillUsed=localStorage.getItem(FIRST_SKILL_KEY)==='done';skillSide=localStorage.getItem(SIDE_KEY)==='left'?'left':'right';autoSkill=localStorage.getItem(AUTO_KEY)!=='no';}catch(e){}
  function store(key,value){try{localStorage.setItem(key,value);}catch(e){}}
  function applySkillSide(){document.querySelector('.shell').classList.toggle('skill-left',skillSide==='left');}
  function markSkillUsed(){if(firstSkillUsed)return;firstSkillUsed=true;store(FIRST_SKILL_KEY,'done');document.getElementById('skillGuide').classList.add('hidden');}
  let build,events=[],counters,arcCharge=0,lastArcRelease=-99,fanClock=0,gunFlash=0,turretRecoil=0,brickClock=0,lastShotAngle=0;
  let collisionChecks=0,physicsCostMs=0,physicsSteps=0,maxPhysicsMs=0;
  const initialSeed=Number.isFinite(window.__PINBALL_SEED__)?window.__PINBALL_SEED__>>>0:null;
  function record(type,data={}){
    events.push({type,time:+elapsed.toFixed(4),wave,...data});
    if(events.length>6000)events.shift();
    if(!analytics||practiceRun)return;
    if(type==="intro_start")analytics.start(analyticsState());
    if(type==="first_upgrade"){
      analytics.event("tutorial_complete",analyticsState());
      analytics.event("faction_selected",analyticsState());
    }
    if(analyticsEvents[type])analytics.event(analyticsEvents[type],{
      ...analyticsState(),upgrade:type==="choice"?data.id:null,reason:data.reason??data.source??null
    });
  }
  function syncBuild(){
    splitLevel=Build.effectiveRank(build,"split");arcLevel=Build.effectiveRank(build,"arc");
    rateLevel=build.ranks.rate||0;powerLevel=build.ranks.power||0;speedLevel=build.ranks.speed||0;lifeLevel=build.ranks.life||0;
    ricochetLevel=build.ranks.bank||0;hunterLevel=build.ranks.hunter||0;drillLevel=build.ranks.drill||0;shockLevel=build.ranks.shock||0;
  }
  function selectSeed(id){
    if(phase!=="seeding"||!Build.seed(build,id))return false;
    syncBuild();phase="playing";choiceSet=[];ui.choice.classList.add("hidden");shootClock=Build.tuning(build).interval-CFG.firstShot;
    record("seed",{id});setState("firstPower");updateUI();return true;
  }
  function showCards(seed=false){
    $("choiceTitle").textContent=translate(!build.seedAbility?"selectSpecialty":"selectUpgrade");
    $("choiceWave").textContent=!build.seedAbility?translate("firstUpgrade"):translate("upgradeHeader",{wave,level});
    for(let i=0;i<3;i++){
      const id=choiceSet[i],card=Build.card(build,id);
      $("choice"+i).dataset.family=Build.DEFS[id]?.family||"";
      $("choiceTitle"+i).textContent=card.title;
      $("choiceDesc"+i).textContent=card.description;
    }
    ui.choice.classList.remove("hidden");
  }
  const bestRunKey="pinball-v1-best-runs";
  const factions=["split","arc","gun"];
  function readBestRuns(){
    try {return JSON.parse(localStorage.getItem(bestRunKey))||{};} catch {return {};}
  }
  function saveBestRun(){
    const id=build.growthFocus||build.seedAbility;
    if(practiceRun||!factions.includes(id))return;
    const records=readBestRuns();
    const entry={cleared:screenClears,wave,seconds:Math.floor(elapsed)};
    const previous=records[id];
    if(!previous||entry.cleared>previous.cleared||
      (entry.cleared===MAX_WAVES&&entry.seconds<previous.seconds)){
      store(bestRunKey,JSON.stringify({...records,[id]:entry}));
    }
  }
  function renderBestRuns(){
    const records=readBestRuns(), list=$("bestRuns");
    list.replaceChildren();
    for(const id of factions){
      const record=records[id];
      if(!Number.isInteger(record?.wave)||!Number.isFinite(record.seconds))continue;
      const item=document.createElement("li");
      item.textContent=Build.DEFS[id].name+" · "+translate(record.cleared===MAX_WAVES?"recordWin":"recordEntry",
        {wave:record.wave,time:durationText(record.seconds)});
      list.append(item);
    }
    $("runRecords").hidden=!list.childElementCount;
  }
  function renderResult(){
    const outcome=phase==="paused"?pausedFrom:phase;
    if(outcome!=="lost"&&outcome!=="complete")return;
    const won=outcome==="complete";
    $("winLabel").textContent=translate(won?"wonLabel":"lostLabel");
    $("winLabel").dataset.outcome=outcome;
    $("winTitle").textContent=translate(won?"winTitle":"lossTitle");
    const time=durationText(elapsed);
    const name=Build.DEFS[build.coreBranch||build.seedAbility]?.name||translate("cannon");
    ui.final.textContent=won?translate("result",{build:name,time,score}):
      translate("lossStats",{wave,time,score,cause:translate(failure?.key||"regularBrick"),hp:failure?.hp??0});
  }
  function finishPrototype(){
    if(phase==="complete")return;
    playSfx("victory");sound?.stopBgm(1200);phase="complete";balls=[];giant=null;
    ui.win.classList.remove("hidden");renderResult();
    record("complete");saveBestRun();setState("winTitle");updateUI();
  }

  const BOSS_INTERVAL=110, SURGE_INTERVAL=75, FALL_BASE=6.8, MAX_BRICKS=168;
  const START_ROWS=6, SPAWN_INTERVAL=3.5, PHYSICS_DT=1/120, MAX_FRAME_STEPS=6;
  const AMBIENT_SUMMON_INTERVAL=8.4, SUMMON_SAFE_TOP=48;
  // Boss waves: `.boss-hud` (54-78px) and the `#finalRushLabel` prompt ("BOSS · 第 N 波",
  // 82-96px) own the top of the arena. 104 keeps >=8px clear of both at 360-390 wide
  // (1 game unit is 1 CSS px at 360). Ordinary field spawns keep the 48 floor.
  const BOSS_HUD_SAFE_TOP=104;
  let SUMMON_SAFE_BOTTOM=DANGER_Y-88;
  const UPPER_LIMIT=175, LOWER_START=275, BRIDGE_BOTTOM=335;
  const BRIDGE_WARNING=1.0, BOSS_WARNING=1.0, CLEAR_CELEBRATE=.60, CLEAR_WARNING=.90, CLEAR_GRACE=2.1;
  const WAVE_ROWS_COUNT=9, WAVE_ROW_GAP=31, WAVE_BOSS_EVERY=10;
  const BOSS_SUPPORT_LIMIT_TOTAL=70, BOSS_SUPPORT_INTERVAL=3.8;
  const WAVE_ROWS=[8,9,10,11,9,10,11,10,11,11,9,10,11,10,11,11,10,11,10,11];
  const isBossWave=n=>n===10||n===20,isEliteWave=n=>n===5,isFinaleWave=n=>n===20;
  const featuredRect=()=>({x:138,y:WAVE_START_Y+58,w:84,h:53});
  const finalBossRect=()=>({x:122,y:WAVE_START_Y+64,w:116,h:74});
  const FINALE_HP=888,FINALE_WARNING=1.35;
  function lateStageHp(n,row,col,anchor=false){
    const t=Math.max(0,Math.min(8,n-11)),v=hash01(n,row,col,205);
    if(anchor)return 31+Math.round(t*4)+Math.floor(hash01(n,row,col,206)*(15+t*2));
    if(v<.34)return 3+Math.floor(t*.45)+Math.floor(hash01(n,row,col,207)*(5+Math.floor(t*.3)));
    if(v<.72)return 13+Math.floor(t*1.8)+Math.floor(hash01(n,row,col,208)*(11+t));
    return 29+Math.floor(t*3)+Math.floor(hash01(n,row,col,209)*(15+t*2));
  }
  function latePatternHasBrick(n,row,col){
    // Dense but navigable. Distinct corridors are left intact, not solid 9x9 slabs.
    const type=(n-11)%5;
    if(type===0)return !(row>=6&&col>=3&&col<=5&&!(row===8&&col===3));
    if(type===1)return !(row>=2&&row<=6&&col===4 || row>=4&&row<=5&&col===3);
    if(type===2)return !(row>=2&&row<=7&&col===(row+1)%7+1);
    if(type===3)return !(row>=5&&row<=6&&(col===2||col===6));
    return !(row>=3&&row<=6&&(col===3||col===5));
  }
  const FIRE_INTERVAL=1.14, MAX_UPGRADE_LEVEL=2;
  const MAX_BALLS = CFG.maxBalls, BALL_SPEED = CFG.speed, BALL_TTL = CFG.normalTTL, MAX_CHARGE = 100;
  const GIANT_SPEED = 610, GIANT_LIFETIME = 5, GIANT_MAX_BOUNCES = 80;
  const GIANT_PIERCE_HP=5, GIANT_HEAVY_DAMAGE=3, GIANT_PIERCE_LIMIT=10;
  const BASE_ARMOR_DAMAGE=1, POWER_ARMOR_DAMAGE=3;
  const SHOT_RADIUS = 3.45, SHOT_HIT_RADIUS = 2.7, BRICK_COLUMNS = 9, BRICK_W = 29, BRICK_H = 22, BRICK_STEP_X = 38.5, BRICK_STEP_Y = 33;
  const FINAL_RUSH_THRESHOLD=8;
  // 30% -> 15% -> last eight bricks. These are experimental thresholds.
  const ELECTRIC_AWAKEN_RATIO=.30,ELECTRIC_BUILD_RATIO=.15;
  const ELECTRIC_TARGETS=[0,1,2,3],ELECTRIC_COOLDOWN=[Infinity,.44,.28,.16];
  const ELECTRIC_PULSE_EVERY=[Infinity,3,2,1];
  // One playable class/active skill now. This registry can later add distinct
  // playable classes/skills without giving every cannon the same passive.
  const CANNON_CLASSES=Object.freeze({
    free:Object.freeze({id:"free",get label(){return translate("cannon");},passive:"none"})
  });
  const ACTIVE_SKILLS=Object.freeze({
    giant:Object.freeze({id:"giant",get label(){return translate("overload");},kind:"giant",maxCharge:MAX_CHARGE})
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
  // Canvas follows the same palette and edge weight as the DOM.
  const visualTokens=getComputedStyle(document.documentElement);
  const readToken=name=>visualTokens.getPropertyValue(name).trim();
  const [cyan,blue,periwinkle,purple,pink]=["--cyan","--blue","--periwinkle","--purple","--pink"].map(readToken);
  const dangerInk=readToken("--danger");
  function brickPaint(edge,top=.98,bottom=.82){
    return {edge,ft:withAlpha(edge,top),fb:withAlpha(edge,bottom)};
  }
  const numberedBlue={edge:blue,ft:"#43a9f6",fb:"#257cd6"};
  const BRICK_ART={
    ramp:[
      {max:1,        ...brickPaint(cyan)},
      {max:2,        ...numberedBlue},
      {max:6,        ...brickPaint(periwinkle,.90,.71)},
      {max:12,       ...brickPaint(purple,.88,.69)},
      {max:24,       ...brickPaint(pink,.86,.68)},
      {max:48,       ...brickPaint(purple,.83,.64)},
      {max:Infinity, ...brickPaint(pink,.82,.63)}
    ],
    special:brickPaint(cyan,.81,.59),
    elite:{...brickPaint(blue,.86,.66),border:1.6},
    summon:brickPaint(periwinkle,.81,.60),
    boss:{edge:purple,glow:periwinkle,base:"#171f55"},
    finalBoss:{edge:pink,glow:pink,base:"#251b52"},
    radius:Number(readToken("--brick-radius")),
    glow:Number(readToken("--brick-glow"))
  };
  const EARLY_ONE_HP_ART=[periwinkle,pink,cyan,purple,blue].map(color=>brickPaint(color));
  function earlyOneHpStyle(brick){
    if(wave>4||brick.hp!==1||brick.special||brick.isElite||brick.bossSupport||brick.isBoss)return null;
    const column=Math.round((brick.x-12)/BRICK_STEP_X);
    return EARLY_ONE_HP_ART[(brick.id+column+wave-1)%EARLY_ONE_HP_ART.length];
  }
  function brickStyle(hp,special){
    if(special)return BRICK_ART.special;
    for(let i=0;i<BRICK_ART.ramp.length;i++)if(hp<=BRICK_ART.ramp[i].max)return BRICK_ART.ramp[i];
    return BRICK_ART.ramp[BRICK_ART.ramp.length-1];
  }
  function hash01(n,r,c,salt=0){
    let h=(((n+17)*83492791)^((r+31)*73856093)^((c+61)*19349663)^(salt*374761393))>>>0;
    h=Math.imul(h^(h>>>16),0x7feb352d)>>>0;
    h=Math.imul(h^(h>>>15),0x846ca68b)>>>0;
    return ((h^(h>>>16))>>>0)/4294967296;
  }
  function brickHP(n,r,c,special){
    if(special)return 1;
    if(n>10)return lateStageHp(n,r,c);
    const profile=HP_PROFILES[Math.min(9,n-1)],roll=hash01(n,r,c);
    const tier=roll<profile.cut[0]?0:roll<profile.cut[1]?1:roll<profile.cut[2]?2:3;
    const [low,high]=profile.tiers[tier];
    return low+Math.floor(hash01(n,r,c,13)*(high-low+1));
  }
  function brickColor(hp,special){return brickStyle(hp,special).edge;}
  const canvas = document.querySelector("#game"), ctx = canvas.getContext("2d");
  /* 后备像素 = CSS 实际显示宽 × 有效 DPR（上限 2），逻辑坐标仍是 360×H。
     之前用 W×dpr 充当后备宽，CSS 把 360 宽拉到 390/430 时整块画面还要再放大 8%~19%，细节被二次插值。
     这里每次都从 getBoundingClientRect() 重新换算，resize 多次也不会累积放大。 */
  const RENDER_DPR_MAX=2;
  let renderScale=1;
  function fitCanvas(){
    canvas.style.setProperty("--world-ratio",W/H);
    const box=canvas.getBoundingClientRect();
    const cssW=box.width>0&&box.height>0?Math.min(box.width,box.height*W/H):W;
    const dpr=Math.max(1,Math.min(window.devicePixelRatio||1,RENDER_DPR_MAX));
    const bw=Math.max(1,Math.round(cssW*dpr));
    renderScale=bw/W;
    const bh=Math.max(1,Math.round(H*renderScale));
    if(canvas.width!==bw)canvas.width=bw;
    if(canvas.height!==bh)canvas.height=bh;
  }
  fitCanvas();
  const $ = id => document.querySelector("#" + id);
  const ui = {
    wave: $("wave"), score: $("score"), rate: $("rate"), balls: $("balls"),
    charge: $("chargeText"), fill: $("energyFill"), state: $("stateText"),
    giant: $("giant"), choice: $("choiceOverlay"), win: $("winOverlay"),
    choiceWave: $("choiceWave"), build: $("buildText"), final: $("finalStats")
  };
  const shooter = {x: W / 2, y: H - 37};

  const TUR_PIVOT_LIFT=8, TUR_MUZZLE=23.33, TUR_RECOIL=2;
  // All offsets are relative to the existing physical pivot. The barrel's
  // outer stroke starts at SVG y=1.8 and lands exactly at the resting muzzle.
  const barrelScale=.49;
  const turretParts={
    ground:{x:-59,y:19,w:118,h:31},
    barrel:{x:-22*barrelScale,y:-TUR_MUZZLE-1.8*barrelScale,w:44*barrelScale,h:78*barrelScale},
    body:{x:-28,y:-12,w:56,h:56},
    core:{x:-28,y:-12,w:56,h:56}
  };
  for(const [name,part] of Object.entries(turretParts)){
    const img=new Image();
    img.onload=()=>{part.img=img;};
    img.src="./assets/neon/turret-a1-1/"+name+".svg";
  }
  const palette = ["#498cc2", "#518eae", "#8475c9", "#ba8e5a", "#637ab0"];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  let bricks, balls, particles, giant, aim, activePointer, wave, score;
  let level=1,xp=0,xpGoal=34,choiceQueue=0,choiceSet=[],powerLevel=0,volleyLevel=0,rateLevel=0,speedLevel=0,lifeLevel=0;
  let serial=0,rowIndex=0,rowTimer=0,nearClearClock=0,replenishClock=0,screenClears=0,lastClearTime=-100,emptyLatch=false,clearFlash=0;
  let ambientSignals=[],ambientSummonClock=0,ambientSummonBursts=0,ambientSummonTiles=0,overlapSummonCount=0,clearBurstCount=0,clearBurstTiles=0;
  let bridgeTimer=0,lastBridgeTime=-100,bridgeBursts=0,bridgeTiles=0,upperOnlyBridgeCount=0,cleanupWindow=0,cleanupStarted=false,cleanupActivations=0,clearPreview=[],clearPreviewShown=false;
  let boss=null,bossDefeats=0,bossSupportXP=0,bossSummonClock=0,summonSignals=[],surgeUntil=0,alertUntil=0,choiceReason="upgrade";
  let waveElapsed=0,clearWindowActive=false,bossSummonTotal=0,waveTailSoftened=false,waveSpawnCount=0,waveStartingTargets=0,waveUpgrades=0;
  let finaleStage=0,finaleWaveSpawns=[0,0,0,0],finaleDamageCheckpoints=[];
  let phase, charge, hunterLevel, ricochetLevel, splitLevel, shockLevel, drillLevel, arcLevel, shootClock, elapsed;
  let skillsUsed, ricochetTriggers, lastFrame;
  let soundVolume=.78, soundMuted=false;
  let accumulator=0,uiClock=0,metricsClock=0,frameSamples=0,fpsNow=0,slowFrames=0,renderQuality="full",drawMs=0;
  let bonusVolleyBalls=0, homingTurns=0, shockWaves=0, directBreaks=0;
  let shotsFired, brickContacts, shotMaxContacts, splitBursts, chainBursts, giantRebounds, giantBrickRebounds, giantWallRebounds, giantTotalHits;
  let endgameActive=false,endgameStartedAt=null,endgameElapsed=0,endgameWaveStats=[];
  let lightningArcs=[],lightningChains=[],lightningTriggers=0,lightningDamage=0,lightningOriginCount=0;
  // Boss victory is locked immediately when HP reaches zero; radial cleanup
  // runs as a visual-only sequence, never as extra combat damage or score.
  let bossVictory=null;
  const BOSS_FINISH_DURATION=1.70,ARC_HOP_INTERVAL=.082,ARC_CHAIN_CAP=7;
  let electricStage=0,electricStageStarts=[null,null,null,null],electricHitsByStage=[0,0,0,0];
  let waveTotal=0,electricStats=[],electricContactCounter=0;
  let selectedCannon=CANNON_CLASSES.free,selectedActive=ACTIVE_SKILLS.giant;
  let armorHits=0,armorBreaks=0,armorCracks=0,finalWaveDurations=[];
  let heavyHits=0,giantPiercings=0,giantHeavyBounces=0,powerShots=0,tailSoftens=0;
  // Visual feedback has its own capped state; core physics never stops for animation.
  const reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let impactRings=[], floatTexts=[], breakFlashes=[], combo=0, maxCombo=0, lastBreak=-99, comboVisibility=0, shake=0, hitCount=0;
  let impactHaptics=true,lastHapticAt=-10000;
  const juice=window.PinballJuice.create({W,H,reducedMotion});
  const impactMode=$("impactMode");
  impactMode.value=reducedMotion?"off":"bold";
  if(reducedMotion)impactMode.disabled=true;
  juice.setMode(impactMode.value);
  impactMode.addEventListener("change",()=>{
    impactMode.value=juice.setMode(impactMode.value);
  });
  const hapticInput=$("impactHaptic");
  if(hapticInput){
    hapticInput.checked=impactHaptics;
    hapticInput.addEventListener("change",()=>{impactHaptics=!!hapticInput.checked;});
  }
  function tapHaptic(kind="hit"){
    if(reducedMotion||!impactHaptics||!navigator.vibrate)return false;
    const t=performance.now();
    if(t-lastHapticAt<(kind==="hit"?125:90))return false;
    lastHapticAt=t;
    try{return !!navigator.vibrate(kind==="heavy"?24:kind==="break"?16:8);}catch(_){return false;}
  }
  const sound=window.PinballGameAudio;
  const volumeKey="pinball-v1-volume",muteKey="pinball-v1-muted";
  try {
    const saved=localStorage.getItem(volumeKey);
    if(saved!==null)soundVolume=clamp(Number(saved),0,1);
    soundMuted=localStorage.getItem(muteKey)==="yes";
  } catch {}
  function unlockSound(){sound?.prime();}
  function playSfx(kind){sound?.play(kind);}
  const volumeInput=$("soundVolume"),volumeText=$("soundValue"),muteInput=$("mute");
  function updateMix(){
    const percent=Math.round(soundVolume*100);
    volumeInput.value=String(percent);volumeText.textContent=percent+"%";
    muteInput.checked=soundMuted;
    sound?.setVolume(soundVolume);sound?.setMasterMuted(soundMuted);
  }
  volumeInput.addEventListener("input",()=>{
    soundVolume=clamp(Number(volumeInput.value)/100,0,1);
    store(volumeKey,String(soundVolume));updateMix();
  });
  muteInput.addEventListener("change",()=>{
    soundMuted=muteInput.checked;store(muteKey,soundMuted?"yes":"no");updateMix();
  });
  $("soundTest").addEventListener("click",()=>{unlockSound();playSfx("brick_hit");});
  updateMix();

  function setState(id, values={}){
    lastMessage={id,values};ui.state.textContent=translate(id,values);
  }
  const skillSlots=Array.from(document.querySelectorAll(".skill-slots [data-skill]"),slot=>({
    slot,id:slot.dataset.skill,label:slot.querySelector(".skill-rank")
  }));
  function renderSkillRanks(){
    for(const {slot,id,label} of skillSlots){
      const rank=Build.effectiveRank(build,id);
      const text=rank?"Lv."+rank:"—";
      if(label.textContent===text)continue;
      label.textContent=text;
      slot.dataset.acquired=String(rank>0);
    }
  }
  function updateUI(){
    const clock=Math.floor(elapsed),mm=String(Math.floor(clock/60)).padStart(2,"0"),ss=String(clock%60).padStart(2,"0");
    ui.wave.textContent=mm+":"+ss;$("waveLabel").textContent=translate("waveCount",{wave,max:MAX_WAVES});ui.score.textContent=String(score);
    ui.rate.textContent="LV."+level;ui.balls.textContent=String(livingCount());
    ui.charge.textContent=Math.floor(charge)+"%";ui.fill.style.width=charge+"%";
    const cleared=Math.max(0,waveStartingTargets-livingCount());
    $("xpLabel").textContent=translate(bossVictory?"waveBossVictory":boss?.alive?"waveBossObjective":"waveProgress",{wave,clear:cleared,total:waveStartingTargets});
    $("xpFill").style.width=(waveStartingTargets?Math.min(100,cleared/waveStartingTargets*100):0)+"%";
    $("pause").disabled=false;
    $("buffStatus").textContent=build.temporaryBuffs.map(b=>Build.BUFFS[b.id].name+" "+Math.ceil(b.remaining)+"s").join(" · ");
    const ready=phase==="playing"&&!emptyLatch&&!!build.seedAbility&&charge>=MAX_CHARGE&&!giant;
    ui.giant.parentElement.classList.toggle("hidden",!build.seedAbility);
    ui.giant.disabled=!ready||autoSkill;ui.giant.textContent=translate(giant?"overloadActive":autoSkill?"overloadAuto":ready?"overloadReady":"overloadCharge",{sec:giant?Math.ceil(GIANT_LIFETIME-giant.life):0,charge:Math.floor(charge)});
    const showGuide=ready&&!firstSkillUsed&&!autoSkill;$("skillGuide").classList.toggle("hidden",!showGuide);ui.giant.classList.toggle("guide-pulse",showGuide);
    $("giantLife").classList.toggle("hidden",!giant);
    $("giantTimeText").textContent=giant?Math.max(0,GIANT_LIFETIME-giant.life).toFixed(1)+"s":"0.0s";
    $("giantTimeFill").style.width=giant?Math.max(0,(GIANT_LIFETIME-giant.life)/GIANT_LIFETIME*100)+"%":"0%";
    $("loadoutLabel").textContent=Build.DEFS[build.coreBranch||build.seedAbility]?.name||translate("cannon");
    ui.build.textContent=Object.keys(build.ranks).map(id=>Build.DEFS[id].name+" R"+build.ranks[id]).join(" · ");
    renderSkillRanks();
    $("bossHud").classList.toggle("hidden",!boss||!boss.alive);
    if(boss&&boss.alive){
      const guarded=boss.isFinalBoss&&boss.hp<=finaleHpFloor();
      $("bossName").textContent=bossName();
      const stage=isFinaleWave(wave)?translate("stage",{stage:finaleStage})+(guarded?" · "+translate("shield"):"")+" · ":"";
      $("bossText").textContent=stage+boss.hp+" / "+boss.initialHp;
      $("bossFill").style.width=Math.max(0,boss.hp/boss.initialHp*100)+"%";
    }
  }
  function brickAt(x,y,hp,extra={}){
    const special=!!extra.special;
    return {id:++serial,x,y,w:extra.w||BRICK_W,h:extra.h||BRICK_H,alive:true,
      hp,initialHp:hp,armored:hp>1,cracked:false,bonk:0,special,
      buffId:serial%2?"power":"speed",color:extra.color||brickColor(hp,special),...extra};
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
    if(n===1){const intro=[];for(let row=0;row<5;row++)for(let col=1;col<=7;col++){const hp=row<2&&col%3===0?2:1;intro.push({x:12+col*BRICK_STEP_X,y:WAVE_START_Y+row*WAVE_ROW_GAP,hp,special:false});}return intro;}

    // A single elite core in wave 5, with lower bricks for controlled ricochets.
    if(isEliteWave(n)){
      const plan=[],r=featuredRect();
      for(let row=0;row<7;row++)for(let col=0;col<BRICK_COLUMNS;col++){
        if(row>=4&&col>=3&&col<=5)continue; // Open a central entrance.
        const x=12+col*BRICK_STEP_X,y=WAVE_START_Y+row*WAVE_ROW_GAP;
        if(rectanglesOverlap({x,y,w:BRICK_W,h:BRICK_H},r,6))continue;
        const anchor=(col===2||col===6)&&row<=4;
        const hp=anchor?12+Math.floor(hash01(n,row,col,102)*9):row>=4?2+Math.floor(hash01(n,row,col,103)*3):3+Math.floor(hash01(n,row,col,104)*6);
        plan.push({x,y,hp,special:false});
      }
      plan.push({...r,hp:32,isElite:true,color:"#ffbd65"});
      return plan;
    }
    // Boss 10: actual high-HP armor ring; 3 center columns below Boss stay open.
    if(n===10){
      const plan=[],r=featuredRect();
      for(let row=0;row<8;row++)for(let col=0;col<BRICK_COLUMNS;col++){
        const top=row===0&&col>=2&&col<=6;
        const corner=row===1&&(col===1||col===2||col===6||col===7);
        const sides=row>=2&&row<=4&&(col===1||col===2||col===6||col===7);
        const lowerRim=row===5&&(col===1||col===2||col===6||col===7);
        const guide=row===6&&(col===0||col===1||col===2||col===6||col===7||col===8);
        if(!top&&!corner&&!sides&&!lowerRim&&!guide)continue;
        if(row>=5&&col>=3&&col<=5)continue;
        const x=12+col*BRICK_STEP_X,y=WAVE_START_Y+row*WAVE_ROW_GAP;
        if(rectanglesOverlap({x,y,w:BRICK_W,h:BRICK_H},r,7))continue;
        const armor=top||corner||sides||lowerRim;
        const hp=armor?26+Math.floor(hash01(n,row,col,141)*20):4+Math.floor(hash01(n,row,col,142)*6);
        plan.push({x,y,hp,special:false,ringArmor:armor});
      }
      return plan;
    }
    if(isFinaleWave(n)){
      const result=[],r=finalBossRect();
      for(let row=0;row<8;row++)for(let col=0;col<BRICK_COLUMNS;col++){
        const x=12+col*BRICK_STEP_X,y=WAVE_START_Y+row*WAVE_ROW_GAP;
        const top=row<=1&&col>=1&&col<=7;
        const wall=row>=2&&row<=5&&(col===1||col===2||col===6||col===7);
        const guide=row>=5&&(col===0||col===8);
        if(!top&&!wall&&!guide)continue;
        if(row>=4&&col>=3&&col<=5)continue;
        if(rectanglesOverlap({x,y,w:BRICK_W,h:BRICK_H},r,6))continue;
        const hp=top?43+Math.floor(hash01(n,row,col,301)*24):
          wall?32+Math.floor(hash01(n,row,col,302)*20):7+Math.floor(hash01(n,row,col,303)*7);
        result.push({x,y,hp,special:false,finaleArmor:top||wall});
      }
      return result;
    }
    const result=[],tier=Math.min(10,1+Math.floor((n-1)/2));
    const bossWave=isBossWave(n);
    for(let row=0;row<WAVE_ROWS_COUNT;row++){
      for(let col=0;col<BRICK_COLUMNS;col++){
        // A couple of clean ricochet channels amid a large wall of targets.
        if(n<=10&&row===WAVE_ROWS_COUNT-1&&(col===2||col===6))continue;
        if(n<=10&&row===WAVE_ROWS_COUNT-2&&col===4)continue;
        if(n>10&&!latePatternHasBrick(n,row,col))continue;
        const x=12+col*BRICK_STEP_X,y=WAVE_START_Y+row*WAVE_ROW_GAP;
        if(bossWave&&rectanglesOverlap({x,y,w:BRICK_W,h:BRICK_H},{x:138,y:108,w:84,h:53},5))continue;
        const special=(n*13+row*5+col)%23===0;
        let hp=brickHP(n>10?n:tier,n*11+row,col,special);
        if(n<=10&&row>=WAVE_ROWS_COUNT-2){
          // Most lower tiles are easy breaks, but 25% act as durable bounce
          // anchors. They must never form a thick deadly wall.
          const f=hash01(n,row,col,91);
          hp=f<.53?1:f<.75?2:f<.91?3:Math.min(14,3+Math.floor(n/2));
        }else if(n<=10&&row>=5&&hp>1){
          hp=Math.max(2,Math.ceil(hp*.72));
        }
        if(n>=3&&n<=6&&hp>1)hp=Math.max(2,Math.ceil(hp*.85));
        if(n<=10&&tier>=4&&hp>1)hp=Math.min(160,Math.round(hp*(1+(n-1)*.075)));
        if(n>10&&!special){
          const anchor=(col===1||col===7)&&row%3===1;
          const nearAnchor=(col===2||col===6)&&row%3!==2;
          hp=anchor?lateStageHp(n,row,col,true):nearAnchor?
            3+Math.floor((n-11)/3)+Math.floor(hash01(n,row,col,145)*5):
            lateStageHp(n,row,col);
          hp=Math.max(2,hp);
        }
        result.push({x,y,hp,special});
      }
    }
    return result;
  }
  function normalDropSpeed(n){
    const latePressure=n>=11&&n<=19?1+(n-10)*.022:1;
    return Math.min(8.4,FALL_BASE+Math.max(0,n-1)*.09)*CFG.fallScale*latePressure;
  }
  function spawnWave(n,plan=null){
    wave=n;waveElapsed=0;waveTailSoftened=false;boss=null;bossVictory=null;lightningChains=[];lightningArcs=[];
    waveMetrics={breaks:0,lastBreak:0,longestNoBreak:0,tailSeconds:0,bossSoloSeconds:0,shots:shotsFired||0,children:counters.splitChildren,reclaims:counters.budgetReclaims,suppressed:counters.suppressedShots,suppressedChildren:counters.suppressedChildren};
    summonSignals=[];ambientSignals=[];bossSummonClock=0;bossSummonTotal=0;bossSupportXP=0;
    finaleStage=isFinaleWave(n)?1:0;finaleWaveSpawns=[0,0,0,0];finaleDamageCheckpoints=[];
    const tiles=plan||createWavePlan(n);bricks=[];
    for(const tile of tiles)bricks.push(brickAt(tile.x,tile.y,tile.hp,
      {...tile,special:tile.special,summonAge:0,summonSource:"wave"}));
    if(isBossWave(n))bossSpawn();
    if(n>1){record("wave_start");if(isBossWave(n))record("boss_start");}
    // Compensate for added 5px vertical pitch so the same phone does not
    // suddenly lose ~40px of its original warning time.
    const bottom=Math.max(...bricks.map(b=>b.y+b.h));
    const gap=Math.max(0,DANGER_Y-bottom);
    const extraHeight=(n===1?4:n===5?6:n===10||n===20?7:8)*(WAVE_ROW_GAP-28);
    const virtualOldGap=gap+extraHeight;
    const oldReferenceGap=455-(84+8*28+BRICK_H);
    const oldHeightFactor=Math.max(1,Math.min(3.2,1+Math.max(0,virtualOldGap/oldReferenceGap-1)*.70));
    waveFallMultiplier=n===1?1:oldHeightFactor*Math.max(.58,gap/Math.max(1,virtualOldGap));
    // Give the last dense formations enough response time on short screens.
    // The actual HP, positions, and Boss pressure stay intact.
    const responseTime=n===18?22:n===19?26:0;
    if(responseTime>0&&gap>0)waveFallMultiplier=Math.min(waveFallMultiplier,gap/(normalDropSpeed(n)*responseTime));
    record("wave_pressure",{wave:n,fallMultiplier:+waveFallMultiplier.toFixed(3),gap:+gap.toFixed(1)});
    waveStartingTargets=livingCount();
    clearPreview=[];clearPreviewShown=false;clearWindowActive=false;
    waveSpawnCount++;clearBurstCount=Math.max(0,n-1);clearBurstTiles=tiles.length;
    setState(isFinaleWave(wave)?"startFinal":boss?"startBoss":"startWave");
    updateUI();
    return tiles.length;
  }
  function generateWave(){
    bricks=[];serial=0;rowIndex=0;wave=1;
    spawnWave(1);
  }
  function reset(){
    sound?.stopBgm(0);
    H=Math.round(Math.max(560,Math.min(900,360*(window.innerHeight||560)/(window.innerWidth||360))));
    DANGER_Y=H-105;SUMMON_SAFE_BOTTOM=DANGER_Y-88;fitCanvas();shooter.y=H-37;
    WAVE_START_Y=window.innerWidth?Math.max(84,Math.ceil((document.querySelector(".topbar").getBoundingClientRect().height+28)*W/window.innerWidth)):84;
    pausedFrom=null;battleTime=0;waveReports=[];bankDamage=0;lockBackground(false);$("pauseOverlay").classList.add("hidden");
    window.PinballGameAudio?.stopBgm?.(0);
    precisionTurns=focusDamage=gunBonusDamage=weakpointDamage=weakpointCharge=damageDealt=shotsWithContact=0;build=Build.createState(initialSeed===null?Math.floor(Math.random()*4294967296):initialSeed);events=[];arcCharge=0;lastArcRelease=-99;fanClock=0;gunFlash=0;turretRecoil=0;brickClock=0;
    counters={splitChildren:0,arcReleases:0,arcSingleDamage:0,budgetReclaims:0,suppressedShots:0,suppressedChildren:0,maxBallsAlive:0,wallBounces:0,shotsByBuild:{base:0,split:0,arc:0,gun:0}};
    collisionChecks=0;physicsCostMs=0;physicsSteps=0;maxPhysicsMs=0;
    wave=1;score=0;phase="ready";charge=0;elapsed=0;level=1;xp=0;xpGoal=34;
    failure=null;practiceRun=false;lastMessage=null;nextHeartbeat=15;
    waveElapsed=0;waveTailSoftened=false;waveSpawnCount=0;bossSummonTotal=0;clearWindowActive=false;waveStartingTargets=0;waveUpgrades=0;
    choiceQueue=0;choiceSet=[];powerLevel=0;volleyLevel=0;rateLevel=0;speedLevel=0;lifeLevel=0;
    hunterLevel=0;ricochetLevel=0;splitLevel=0;shockLevel=0;drillLevel=0;arcLevel=0;
    screenClears=0;lastClearTime=-100;emptyLatch=false;clearFlash=0;rowTimer=0;nearClearClock=0;replenishClock=0;rowIndex=0;
    bridgeTimer=0;lastBridgeTime=-100;bridgeBursts=0;bridgeTiles=0;upperOnlyBridgeCount=0;cleanupWindow=0;cleanupStarted=false;cleanupActivations=0;clearPreview=[];clearPreviewShown=false;
    ambientSignals=[];ambientSummonClock=0;ambientSummonBursts=0;ambientSummonTiles=0;overlapSummonCount=0;clearBurstCount=0;clearBurstTiles=0;
    accumulator=0;uiClock=0;metricsClock=0;frameSamples=0;fpsNow=0;slowFrames=0;renderQuality="full";drawMs=0;
    boss=null;bossVictory=null;lightningChains=[];bossDefeats=0;bossSupportXP=0;bossSummonClock=0;summonSignals=[];ambientSignals=[];surgeUntil=0;alertUntil=0;
    finaleStage=0;finaleWaveSpawns=[0,0,0,0];finaleDamageCheckpoints=[];
    shotsFired=0;brickContacts=0;shotMaxContacts=0;splitBursts=0;chainBursts=0;bonusVolleyBalls=0;homingTurns=0;shockWaves=0;directBreaks=0;giantRebounds=0;giantBrickRebounds=0;giantWallRebounds=0;giantTotalHits=0;
    shootClock=.8;skillsUsed=0;ricochetTriggers=0;aim=0;activePointer=null;balls=[];particles=[];giant=null;
    impactRings=[];floatTexts=[];combo=0;maxCombo=0;lastBreak=-99;comboVisibility=0;shake=0;hitCount=0;
    endgameWaveStats=[];electricStats=[];lightningArcs=[];lightningTriggers=0;lightningDamage=0;lightningOriginCount=0;
    armorHits=0;armorBreaks=0;armorCracks=0;finalWaveDurations=[];
    heavyHits=0;giantPiercings=0;giantHeavyBounces=0;powerShots=0;tailSoftens=0;
    selectedCannon=CANNON_CLASSES.free;selectedActive=ACTIVE_SKILLS.giant;
    juice.setMode("off");juice.setMode(impactMode.value);juice.setQuality("full");
    ui.choice.classList.add("hidden");ui.win.classList.add("hidden");$("startOverlay").classList.remove("hidden");
    $("finalRushLabel").classList.remove("active");
    generateWave();renderBestRuns();updateUI();
  }
  function begin(){
    if(phase!=="ready")return false;
    unlockSound();phase="playing";$("startOverlay").classList.add("hidden");choiceSet=[];
    window.PinballGameAudio?.startBgm?.();
    shootClock=Build.tuning(build).interval-CFG.firstShot;
    record("intro_start");record("wave_start");setState("introAim");updateUI();return true;
  }

  // Test-only entry on the isolated experiment page. Simulates nine legitimate
  // wave-end choices so Boss 10 is judged using a viable, readable build.
  function jumpToBoss10(){
    if(!qaMode&&window.__PINBALL_TEST__!==true)return;
    reset();practiceRun=true;
    const route=$("bossRoute").value;
    const loadouts={
      split:["split","split","power","split-a","split","rate","speed","power","life"],
      arc:["arc","arc","power","arc-a","arc","rate","speed","power","life"],
      gun:["gun","gun","power","gun-a","gun","rate","speed","power","life"]
    };
    const picks=loadouts[route]||loadouts.split;
    for(let i=0;i<picks.length;i++){
      if(!Build.choose(build,picks[i],i+1))throw Error("Boss preview build prerequisite failed at wave "+(i+1));
    }
    syncBuild();screenClears=9;level=10;waveUpgrades=9;charge=100;
    balls=[];giant=null;emptyLatch=false;choiceSet=[];choiceQueue=0;
    phase="playing";$("startOverlay").classList.add("hidden");ui.choice.classList.add("hidden");
    unlockSound();spawnWave(10);shootClock=Build.tuning(build).interval-CFG.firstShot;
    window.PinballGameAudio?.startBgm?.();
    record("debug_jump",{targetWave:10,route,simulatedUpgrades:picks});
    setState("qaBoss");
    updateUI();return true;
  }

  function jumpToFinalBoss(){
    if(!qaMode&&window.__PINBALL_TEST__!==true)return;
    reset();practiceRun=true;
    const route=$("bossRoute").value;
    const priorities=[route,route+"-a","power","rate","speed","life","shock","drill","hunter","bank","split","arc","gun"];
    const picks=[];
    for(let w=1;w<=19;w++){
      const offer=Build.offer(build,w);
      const id=w===1?route:offer.slice().sort((a,b)=>{
        const aRank=priorities.indexOf(a),bRank=priorities.indexOf(b);
        return (aRank<0?100:aRank)-(bRank<0?100:bRank);
      })[0];
      if(!id||!Build.choose(build,id,w))throw Error("Final Boss preview lacks a valid upgrade at wave "+w);
      picks.push(id);
    }
    syncBuild();screenClears=19;level=20;waveUpgrades=19;charge=100;
    balls=[];giant=null;emptyLatch=false;choiceSet=[];choiceQueue=0;
    phase="playing";$("startOverlay").classList.add("hidden");ui.choice.classList.add("hidden");
    unlockSound();spawnWave(20);shootClock=Build.tuning(build).interval-CFG.firstShot;
    record("debug_jump",{targetWave:20,route,simulatedUpgrades:picks,excludedFromNormalRecords:true});
    setState("qaFinal");
    updateUI();return true;
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
    marker.textContent=translate("lastTargets");
    // V2.1: 爆雷/连锁爆破不再独立发声。
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
    setState("qaField",{count:targetCount});
    updateUI();
    return true;
  }
  function addCharge(n) {
    charge = clamp(charge + n, 0, MAX_CHARGE);
  }
  function burst(x, y, color, n = 9, shard = false) {
    for (let i = 0; i < (reducedMotion ? Math.ceil(n/3) : n); i++) {
      const a = Math.random() * Math.PI * 2, speed = 32 + Math.random() * 105;
      particles.push({x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .42, color,
        rot: Math.random() * 6.283, spin: (Math.random() - .5) * 16, shard});
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }
  function flashBurst(x,y,color){
    if(reducedMotion)return;
    breakFlashes.push({x,y,age:0,color});
    if(breakFlashes.length>16)breakFlashes.shift();
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
  // Visible, fixed HP gates ensure all three advertised final-Boss waves can occur.
  // They never add damage; extra real projectile hits cannot skip a stage.
  function finaleHpFloor(){
    if(!boss||!boss.alive||!isFinaleWave(wave))return 0;
    if(finaleStage===1)return Math.floor(FINALE_HP*.70);
    if(finaleStage===2)return Math.floor(FINALE_HP*.35);
    return summonSignals.some(sig=>sig.finale)?1:0;
  }
  // Direct projectile hits drive the run. Secondary shock/arc hits never recurse.
  function hitBrick(b,source="normal",impact=null,points=1){
    if(!b.alive)return false;
    if(b.isBoss&&source==="giant")source="giantHeavy";
    hitCount++;
    if(source!=="giant"&&b.armored){
      const damage=source==="giantHeavy"?GIANT_HEAVY_DAMAGE:
        (source==="normal"||source==="drill")?Math.max(BASE_ARMOR_DAMAGE,points):
        (source==="shock"||source==="lightning")?Math.max(1,points):1;
      const guard=b.isFinalBoss?finaleHpFloor():0;
      const taken=Math.min(Math.max(0,b.hp-guard),damage);
      b.hp-=taken;armorHits+=taken;damageDealt+=taken;
      if(guard>0&&taken===0){setState("guard");record("finale_guard",{stage:finaleStage,hp:b.hp});}
      b.bonk=.12;impactVisual(b.x+b.w/2,b.y+b.h/2,b.hp===0);
      numberPop(b.x+b.w/2,b.y-1,taken?"−"+taken:translate("shield"),taken?"#ffdfb2":"#ffe0ab");
      if(b.hp>0){
        if(!b.isFinalBoss)b.color=brickColor(b.hp,b.special);
        if(b.hp<=2&&!b.cracked){b.cracked=true;armorCracks++;}
        burst(b.x+b.w/2,b.y+b.h/2,"#ffd29d",4);
        juice.onArmor(b,impact);tapHaptic("hit");playSfx("armor");
        return false;
      }
      if(!b.cracked){armorCracks++;b.cracked=true;}
      b.armored=false;
    }
    if(b.cracked)armorBreaks++;
    const breakColor=earlyOneHpStyle(b)?.edge||b.color;
    damageDealt+=b.hp;b.hp=0;b.alive=false;score++;
    if(waveMetrics){waveMetrics.breaks++;waveMetrics.longestNoBreak=Math.max(waveMetrics.longestNoBreak,waveElapsed-waveMetrics.lastBreak);waveMetrics.lastBreak=waveElapsed;}
    if(b.special){Build.grantBuff(build,b.buffId);record("buff",{id:b.buffId,remaining:Build.BUFFS[b.buffId].duration});}
    if(b.bossSupport){if(bossSupportXP<10){bossSupportXP++;addExperience(1);}}
    else if(!b.isBoss)addExperience(b.initialHp>=32?4:b.initialHp>=12?3:b.initialHp>=5?2:1);
    const cx=b.x+b.w/2,cy=b.y+b.h/2;
    combo=elapsed-lastBreak<=1.25?combo+1:1;
    lastBreak=elapsed;maxCombo=Math.max(combo,maxCombo);comboVisibility=1;
    impactVisual(cx,cy,true);
    if(combo>=3&&combo%3===0){
      numberPop(cx,cy-12,translate("breakCombo",{count:combo}),"#a5f8df");
      playSfx("combo");
    }
    if(source==="giant")shake=Math.max(shake,.11);
    juice.onBreak(b,{combo,source,impact});tapHaptic(source==="giant"?"heavy":"break");
    flashBurst(cx,cy,breakColor);
    burst(cx,cy,breakColor,source==="giant"?19:12,true);
    // Secondary explosions and lightning cannot snowball the active-skill meter.
    if(source==="normal"||source==="drill")addCharge(b.special?34:8);
    if(b.special&&(source==="normal"||source==="drill"))setState("energyHit");
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
      burst(cx,cy,"#ff996b",23);juice.onSplash({x:cx,y:cy}); // V2.1: 连锁爆破本身静音，被击破的砖各自播砖块击破音。
      setState("shockHit");
    }
    if(b.isBoss)defeatBoss();
    return true;
  }
  function makeBall(angle,mini=false){
    const t=Build.tuning(build),buffSpeed=Build.buffModifiers(build).speed,speed=t.speed*buffSpeed;
    return {x:shooter.x+Math.sin(angle)*TUR_MUZZLE,y:shooter.y-TUR_PIVOT_LIFT-Math.cos(angle)*TUR_MUZZLE,vx:Math.sin(angle)*speed,vy:-Math.cos(angle)*speed,r:mini?SHOT_HIT_RADIUS*.83:SHOT_HIT_RADIUS,visualR:mini?SHOT_RADIUS*.83:SHOT_RADIUS,
      life:0,maxLife:mini?Math.min(CFG.childTTL,t.ttl):t.ttl,trail:[],contacts:0,mini,splitDone:false,drill:false,
      drillLeft:0,chargeStacks:0,huntsLeft:hunterLevel,damage:t.damage,
      buffSpeed,lastHitId:null,lastHitLife:-99,lastArcAt:-99};
  }
  function splitAt(ball,x,y){
    if(!splitLevel||ball.mini||ball.splitDone||ball.contacts<CFG.splitEvery[splitLevel])return;
    ball.splitDone=true;
    const branch=build.coreBranch,count=Build.effects(build).splitCount;
    const solo=boss&&boss.alive&&livingCount()===1;
    const spread=solo?.15:branch==="split-a"?CFG.stormSpread:CFG.splitSpread;
    const theta=Math.atan2(ball.vx,-ball.vy);let made=0;
    for(let i=0;i<count;i++){
      if(balls.length>=MAX_BALLS){counters.suppressedChildren+=count-i;break;}
      const delta=count===1?.22:((i/(count-1))*2-1)*spread,child=makeBall(theta+delta,true);
      child.x=x;child.y=y;child.pursuitLeft=Math.max(0,splitLevel-1);child.guideAt=elapsed+.16;child.huntsLeft=hunterLevel+(branch==="split-b"?Build.effects(build).childTurns:0);child.huntChild=branch==="split-b";
      child.lastHitId=ball.lastHitId;child.lastHitLife=0;balls.push(child);made++;
    }
    if(made){splitBursts++;bonusVolleyBalls+=made;counters.splitChildren+=made;record("split",{count:made});playSfx("split");setState("splitHit",{count:made});}
    counters.maxBallsAlive=Math.max(counters.maxBallsAlive,balls.length);
  }
  function retargetBall(ball){
    if(ball.huntsLeft<=0||!bricks.some(b=>b.alive))return false;
    const live=bricks.filter(b=>b.alive),armored=live.filter(b=>b.armored);
    const targets=armored.length?armored:live;
    targets.sort((a,b)=>Math.hypot(a.x+a.w/2-ball.x,a.y+a.h/2-ball.y)-
      Math.hypot(b.x+b.w/2-ball.x,b.y+b.h/2-ball.y));
    const t=targets[0],dx=t.x+t.w/2-ball.x,dy=t.y+t.h/2-ball.y,d=Math.hypot(dx,dy)||1;
    const speed=Math.hypot(ball.vx,ball.vy);
    if(ball.huntChild){
      const current=Math.atan2(ball.vy,ball.vx),desired=Math.atan2(dy,dx);
      const diff=Math.atan2(Math.sin(desired-current),Math.cos(desired-current));
      const next=current+clamp(diff,-.65,.65);ball.vx=Math.cos(next)*speed;ball.vy=Math.sin(next)*speed;
    }else{ball.vx=speed*dx/d;ball.vy=speed*dy/d;}ball.huntsLeft--;
    homingTurns++;
    return true;
  }
  /* 炮管当前实际角度：炮管绘制、机枪扇形射击、巨型球三者共用同一来源，
     避免视觉层与发射层各自重算扇形相位导致方向不一致。 */
  function cannonAngle(){
    return build.coreBranch==="gun-b"?aim+Math.sin(fanClock*Math.PI*2/CFG.fanPeriod)*CFG.fanAngle:aim;
  }
  function fire(){
    if(phase!=="playing"||emptyLatch)return false;
    const t=Build.tuning(build);
    if(balls.length>=MAX_BALLS){
      if(!t.isGun){counters.suppressedShots++;return false;}
      let candidates=balls.filter(b=>b.mini);if(!candidates.length)candidates=balls;
      const oldest=candidates.reduce((a,b)=>b.life>a.life?b:a);balls.splice(balls.indexOf(oldest),1);
      counters.budgetReclaims++;record("budget_reclaim",{mini:oldest.mini});setState("gunRecycle");
    }
    const shotNumber=++shotsFired;let offset=0;
    if(build.coreBranch==="gun-a")offset=(shotNumber%2?1:-1)*.012;
    if(build.coreBranch==="gun-b")offset=cannonAngle()-aim;
    lastShotAngle=aim+offset;const shot=makeBall(lastShotAngle);
    if(drillLevel>0&&shotNumber%(drillLevel===1?4:3)===0){shot.drill=true;shot.drillLeft=drillLevel===1?3:5;shot.r=SHOT_HIT_RADIUS*1.35;shot.visualR=SHOT_RADIUS*1.35;powerShots++;}
    if(t.isGun)playSfx("gun_fire");
    balls.push(shot);gunFlash=.07;turretRecoil=1;counters.shotsByBuild[Build.preferred(build)||'base']++;
    counters.maxBallsAlive=Math.max(counters.maxBallsAlive,balls.length);
    record("shot",{angle:+(aim+offset).toFixed(5),ttl:shot.maxLife,interval:t.interval});
    return true;
  }
  function fireGiant() {
    if (phase !== "playing" || !build.seedAbility || emptyLatch || charge < selectedActive.maxCharge || giant || selectedActive.kind!=="giant") return false;
    unlockSound();
    charge=0;skillsUsed++;markSkillUsed();
    // 出生点与运动方向锁定同一帧的炮管角度，避免两个函数读到不同相位
    const shotAng=cannonAngle();
    giant={x:shooter.x+Math.sin(shotAng)*TUR_MUZZLE,y:shooter.y-TUR_PIVOT_LIFT-Math.cos(shotAng)*TUR_MUZZLE,
      vx:Math.sin(shotAng)*GIANT_SPEED,vy:-Math.cos(shotAng)*GIANT_SPEED,
      r:14,life:0,collisions:0,bounces:0,pierceLeft:GIANT_PIERCE_LIMIT,lastBounceFx:-100,trail:[],lastHitId:null,lastHitLife:-99};
    burst(giant.x,giant.y,"#ffd482",24);
    playSfx("giant");setState("overloadHit");updateUI();
    juice.onGiant(giant.x,giant.y);tapHaptic("heavy");
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
  // Lightning now travels and damages targets ONE AT A TIME, not all at once.
  // Arc's finite queue is independent from physical collisions, so visual
  // steps cannot recursively spawn lightning or freeze the simulation.
  function nearestArcTarget(anchor, used){
    let best=null, nearest=CFG.arcRange[arcLevel]**2;
    for(const brick of bricks){
      if(!brick.alive||used.has(brick.id))continue;
      const distance=(brick.x+brick.w/2-anchor.x)**2+(brick.y+brick.h/2-anchor.y)**2;
      if(distance<nearest){best=brick;nearest=distance;}
    }
    return best;
  }
  function triggerLightning(origin,ball){
    if(!arcLevel||!origin||!ball||ball.mini||ball.contacts===undefined||bossVictory)return false;
    arcCharge++;
    if(arcCharge<CFG.arcEvery[arcLevel]||elapsed-lastArcRelease<CFG.arcCooldown)return false;
    const start={x:origin.x+origin.w/2,y:origin.y+origin.h/2};
    const branch=build.coreBranch,effect=Build.effects(build);
    const limit=branch==="arc-a"?effect.arcTargets:CFG.arcTargets[arcLevel];
    const chosen=[],used=new Set([origin.id]);
    let from=start;
    if(branch!=="arc-b")for(let i=0;i<limit;i++){
      const anchor=branch==="arc-a"?from:start;
      const target=nearestArcTarget(anchor,used);
      if(!target)break;
      chosen.push(target);used.add(target.id);
      from={x:target.x+target.w/2,y:target.y+target.h/2};
    }
    let single=false;
    if(!chosen.length){
      if(!origin.alive)return false;
      chosen.push(origin);single=true;
    }
    const missing=branch==="arc-b"?CFG.arcTargets[arcLevel]:Math.max(0,limit-chosen.filter(b=>b!==origin).length);
    if(origin.alive&&missing>0&&!chosen.includes(origin))chosen.push(origin);
    // Never leave the actual hit Boss / armored anchor out of the electrical network.
    if(branch!=="arc-b"&&origin.alive&&(origin.isBoss||origin.ringArmor||origin.isElite||origin.bossSupport)){
      if(!chosen.includes(origin)){chosen.unshift(origin);if(chosen.length>limit)chosen.pop();}
    }
    const maxTargets=branch==="arc-b"?1:Math.min(6,limit+Math.min(2,arcLevel)+(branch==="arc-a"?1:0));
    if(lightningChains.length>=ARC_CHAIN_CAP)lightningChains.shift();
    lightningChains.push({
      originId:origin.id,branch,used:new Set(chosen.map(b=>b.id).concat(origin.id)),
      targets:chosen.map(b=>b.id),index:0,maxTargets,from:start,single,missing,
      nextAt:elapsed+.025,hops:0,extraHops:0
    });
    arcCharge=0;lastArcRelease=elapsed;counters.arcReleases++;lightningTriggers++;
    record("arc",{targets:chosen.map(b=>b.id),single,queued:true,cap:maxTargets});
    setState(branch==="arc-b"?"arcFocus":"arcChain");
    return true;
  }
  function updateLightningChains(){
    if(bossVictory||phase!=="playing"){lightningChains=[];return;}
    if(!lightningChains.length)return;
    const active=[];
    // Process no more than two steps per chain per simulation tick, to avoid
    // a large dt making all targets disappear in one visual frame.
    for(const chain of lightningChains.slice()){
      let processed=0;
      while(chain.index<chain.targets.length&&chain.hops<chain.maxTargets&&
            elapsed>=chain.nextAt&&processed++<2){
        let id=chain.targets[chain.index++];
        let brick=bricks.find(b=>b.alive&&b.id===id);
        chain.nextAt+=ARC_HOP_INTERVAL;
        if(!brick&&chain.branch!=="arc-b"){
          brick=nearestArcTarget(chain.from,chain.used);
          if(brick){id=brick.id;chain.used.add(id);}
        }
        if(!brick)continue;
        const next={x:brick.x+brick.w/2,y:brick.y+brick.h/2};
        const effect=Build.effects(build);
        const armorBonus=brick.armored||brick.isBoss?effect.arcArmorBonus:0;
        const isOrigin=id===chain.originId;
        const damage=(isOrigin?(chain.branch==="arc-b"?effect.arcSolo:
          CFG.bossArcDamage+chain.missing*arcLevel):CFG.arcDamage[arcLevel])+armorBonus;
        const before=brick.hp;
        if(!reducedMotion){
          lightningArcs.push({points:[{...chain.from},next],age:0,duration:.28});
          if(lightningArcs.length>42)lightningArcs.shift();
        }
        hitBrick(brick,"lightning",null,damage);
        const taken=Math.max(0,before-brick.hp);
        lightningDamage+=taken;
        if(taken>0&&Build.preferred(build)==="arc"&&!bossVictory){
          addCharge(chain.branch==="arc-b"?5:2);
        }
        if(isOrigin){counters.arcSingleDamage+=taken;focusDamage+=taken;}
        chain.from=next;chain.hops++;
        record("arc_hop",{target:id,order:chain.hops,damage:taken,killed:!brick.alive});
        playSfx("arc");
        if(bossVictory)return; // Boss kill locks victory immediately
        if(chain.branch!=="arc-b"&&!brick.alive&&chain.targets.length<chain.maxTargets){
          const extra=nearestArcTarget(next,chain.used);
          if(extra){
            chain.used.add(extra.id);chain.targets.push(extra.id);
            chain.extraHops++;
          }
        }
      }
      if(chain.index<chain.targets.length&&chain.hops<chain.maxTargets)active.push(chain);
      else record("arc_chain_end",{hops:chain.hops,extraHops:chain.extraHops});
    }
    lightningChains=active;
  }
  function directContact(block,ball,incoming=null){
    if(!block.alive)return false;
    if(!ball.mini&&!ball.contacted){ball.contacted=true;shotsWithContact++;}
    const bonus=0; // Timed special-brick buffs cannot raise direct hit damage.
    let pressure=0;
    const gunRank=Build.effectiveRank(build,"gun");
    if(!ball.mini&&gunRank>1&&Build.preferred(build)==="gun"){
      block.gunStreak=elapsed-(block.gunLast??-Infinity)<=2?block.gunStreak+1:1;
      block.gunLast=elapsed;
      pressure=Math.min(gunRank-1,Math.floor((block.gunStreak-1)/3));
    }
    const weak=block.isBoss&&livingCount()===1&&waveElapsed%6>=4;
    if(weak){addCharge(4);weakpointCharge+=4;} // Boss weakpoint grants extra charge, not +1 hidden damage.
    gunBonusDamage+=Math.min(pressure,Math.max(0,block.hp-1));
    const damage=pressure+(ball.damage||Build.tuning(build).damage)+bonus+(ball.drill?drillLevel+1:0)+ball.chargeStacks;
    bankDamage+=Math.min(ball.chargeStacks,Math.max(0,block.hp-(damage-ball.chargeStacks)));
    const hpBefore=block.hp;
    const destroyed=hitBrick(block,ball.drill?"drill":"normal",incoming,damage);
    if(!destroyed&&!block.armored)playSfx("hit");
    record("direct_hit",{target:block.id,before:hpBefore,after:block.hp,base:ball.damage||Build.tuning(build).damage,gunPressure:pressure,drill:ball.drill?drillLevel+1:0,wallCharge:ball.chargeStacks,bossWeakpointEnergy:weak?4:0});
    ball.contacts++;brickContacts++;shotMaxContacts=Math.max(shotMaxContacts,ball.contacts);
    ball.chargeStacks=0;splitAt(ball,ball.x,ball.y);triggerLightning(block,ball);return destroyed;
  }
  function updateBall(ball,dt){
    const sparse=livingCount()>0&&livingCount()<=5;
    const pursuing=ball.mini&&ball.pursuitLeft>0;
    if(sparse&&(pursuing||waveElapsed>12)&&elapsed>=(ball.guideAt??0)){
      const target=bricks.filter(b=>b.alive).sort((a,b)=>Math.hypot(a.x+a.w/2-ball.x,a.y+a.h/2-ball.y)-Math.hypot(b.x+b.w/2-ball.x,b.y+b.h/2-ball.y))[0];
      const dx=target.x+target.w/2-ball.x,dy=target.y+target.h/2-ball.y,d=Math.hypot(dx,dy),v=Math.hypot(ball.vx,ball.vy);
      if(d>target.w*.7){ball.vx=v*dx/d;ball.vy=v*dy/d;precisionTurns++;if(pursuing)ball.pursuitLeft--;}
      ball.guideAt=elapsed+(pursuing?.35:1.2);
    }
    const modifier=Build.buffModifiers(build).speed,ratio=modifier/(ball.buffSpeed||1);
    ball.vx*=ratio;ball.vy*=ratio;ball.buffSpeed=modifier;
    const speed=Math.hypot(ball.vx,ball.vy);
    const steps=Math.max(1,Math.ceil(speed*dt/2.7)),step=dt/steps;
    for(let i=0;i<steps;i++){
      const prevX=ball.x,prevY=ball.y;
      ball.x+=ball.vx*step;ball.y+=ball.vy*step;
      let wall=false,bounced=false;
      if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx);wall=true;bounced=true;}
      if(ball.x>W-ball.r){ball.x=W-ball.r;ball.vx=-Math.abs(ball.vx);wall=true;bounced=true;}
      if(ball.y<ball.r+4){ball.y=ball.r+4;ball.vy=Math.abs(ball.vy);bounced=true;}
      if(wall){
        counters.wallBounces++;
        if(ricochetLevel){ball.chargeStacks=Math.min(ricochetLevel===1?2:4,ball.chargeStacks+ricochetLevel);ricochetTriggers++;}
        retargetBall(ball);
      }
      // V2.1c: 墙面反弹独立发声（只加声音，不改 wall 标记，避免影响弹射与充能逻辑）。
      if(bounced)playSfx("wall_bounce");
      for(const block of bricks){
        collisionChecks++;
        if(!block.alive||(block.summonAge!==undefined&&block.summonAge<.20)||ball.x+ball.r<block.x||ball.x-ball.r>block.x+block.w||
          ball.y+ball.r<block.y||ball.y-ball.r>block.y+block.h||
          !circleIntersectsRect(ball.x,ball.y,ball.r,block))continue;
        if(ball.lastHitId===block.id&&ball.life-(ball.lastHitLife??-99)<.09)continue;
        ball.lastHitId=block.id;ball.lastHitLife=ball.life;
        const normal=contactNormal(ball,block,prevX,prevY);
        const incoming={vx:ball.vx,vy:ball.vy};
        const destroyed=directContact(block,ball,incoming);
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
    return ball.y<H+10&&ball.life<ball.maxLife;
  }
  function recordGiantBounce(kind){
    giant.bounces++;giantRebounds++;
    if(kind==="brick")giantBrickRebounds++;else giantWallRebounds++;
    if(giant.life-giant.lastBounceFx>.075){
      giant.lastBounceFx=giant.life;
      juice.onSplash({x:giant.x,y:giant.y});
      burst(giant.x,giant.y,"#ffd387",7);
      // V2.1: 超载冲锋的碰撞反馈交给 hitBrick 的砖甲受击/砖块击破，这里不再叠加，
      // 避免同一次碰撞播两次、也避免撞墙被当成砖甲受击。
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
        collisionChecks++;
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
        if(penetrates)hitBrick(block,"giant",impact);
        else{hitBrick(block,"giantHeavy",impact);heavyHits++;giantHeavyBounces++;}
        // A killing blow on the Boss clears `giant` inside hitBrick→defeatBoss
        // (the ultimate is destroyed with the victory finisher). Either branch can
        // reach it, directly or through hitBrick's shock-wave follow-up, so the
        // update ends here: never reflect a null, never read giant after this point.
        if(!giant)return;
        if(penetrates){giantPiercings++;giant.pierceLeft--;}
        else{reflect(giant,normal);recordGiantBounce("brick");}
        markFinalRush();
        // Giant is an active effect, not a primary-ball charge source.
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
  function skillLevel(id){return build.ranks[id]||0;}
  function skillStage(){return screenClears<4?0:1;}
  function eligibleSkills(){return Build.eligible(build,screenClears);}
  function offerChoice(){
    if(phase!=="playing"||choiceQueue<=0)return false;
    choiceSet=Build.offer(build,screenClears);if(choiceSet.length!==3)throw Error("Upgrade pool must provide three distinct effective cards");
    phase="choosing";choiceQueue--;showCards();record("offer",{cards:choiceSet.slice()});setState("clearChoice");updateUI();return true;
  }
  function chooseUpgrade(id){
    if(phase==="seeding")return selectSeed(id);
    if(phase!=="choosing"||!choiceSet.includes(id)||!Build.choose(build,id,screenClears))return false;
    syncBuild();record("choice",{id});phase="playing";choiceSet=[];ui.choice.classList.add("hidden"); // V2.1: 选卡确认不再另播技能选择音，清屏升级音已在清屏时播过一次。
    if(build.choiceHistory.length===1&&build.seedAbility){record("first_upgrade",{id});setState("firstPower");}
    if(screenClears>=MAX_WAVES){finishPrototype();return true;}
    if(choiceQueue>0)offerChoice();else{setState("upgradeDone");updateUI();}return true;
  }
  function addExperience(amount){
    // Bricks may still award score/energy, but never trigger an upgrade.
    // Exactly one level and one choice are earned when a whole wave is clear.
    return false;
  }
  function bossSpawn(){
    if(boss&&boss.alive)return false;
    // Wave-clear upgrading supplies fewer skills than the old XP model.
    const hp=isFinaleWave(wave)?FINALE_HP:isBossWave(wave)?128:52+Math.floor(Math.max(0,wave-4)/4)*24+bossDefeats*6;
    const r=isFinaleWave(wave)?finalBossRect():featuredRect();boss=brickAt(r.x,r.y,hp,{w:r.w,h:r.h,isBoss:true,color:isFinaleWave(wave)?"#cf668f":"#ab66f5",isFinalBoss:isFinaleWave(wave)});
    bricks.push(boss);bossSummonClock=0;bossSummonTotal=0;bossSupportXP=0;summonSignals=[];
    alertUntil=elapsed+2.5;setState("bossAppears",{wave,boss:bossName()});
    return true;
  }

  // Final encounter only: finite, telegraphed Boss-driven reinforcements.
  // Ordinary waves remain whole-wave-clear with no mid-wave replenishment.
  function queueFinaleStage(stage){
    if(!isFinaleWave(wave)||!boss||!boss.alive||stage<=finaleStage||stage>3)return 0;
    const previous=finaleStage;
    finaleStage=stage;
    const picks=[],cols=stage===2?[0,8,1,7,2,6]:[2,6,1,7,0,8];
    const offsets=stage===2?[-88,-60,-30,14,43,72,101]:[-92,-66,-38,6,38,69,98];
    // The formation is translated below the Boss HUD instead of dropping its
    // upper rows: same row count, same per-row HP, same cadence.
    const shift=Math.max(0,BOSS_HUD_SAFE_TOP-(boss.y+Math.min(...offsets)));
    let count=0;
    for(const dy of offsets)for(const col of cols){
      if(count>=18)break;
      // Entry corridor is kept open below the Boss.
      if(dy>=14&&col>=3&&col<=5)continue;
      const x=12+col*BRICK_STEP_X,y=boss.y+dy+shift;
      if(y<BOSS_HUD_SAFE_TOP||y+BRICK_H>DANGER_Y-85)continue;
      if(!isSlotFree(x,y))continue;
      const high=(col===1||col===7)&&(dy<45);
      const hp=high?(stage===2?26:35)+Math.floor(hash01(wave,stage,col,Math.floor(dy)+410)*(stage===2?18:23)):
        (stage===2?8:10)+Math.floor(hash01(wave,stage,col,Math.floor(dy)+411)*(stage===2?16:19));
      const sig={bossId:boss.id,dx:x-boss.x,dy:y-boss.y,age:0,delay:FINALE_WARNING,
        targetId:null,w:BRICK_W,h:BRICK_H,hp,finale:true,finaleStage:stage};
      summonSignals.push(sig);count++;picks.push({col,dy,hp});
    }
    // A full armored field can block the side-flank slots. Keep a small
    // reserve of safe *upper* positions so stage 3 still creates real targets.
    if(count<13){
      const rows=[BOSS_HUD_SAFE_TOP+8,BOSS_HUD_SAFE_TOP+36,BOSS_HUD_SAFE_TOP+64,
        BOSS_HUD_SAFE_TOP+92,BOSS_HUD_SAFE_TOP+120];
      const fallbackCols=stage===2?[0,2,4,6,8,1,7,3,5]:[1,3,5,7,0,8,2,6,4];
      for(const y of rows)for(const col of fallbackCols){
        if(count>=16)break;
        const x=12+col*BRICK_STEP_X;
        if(y<BOSS_HUD_SAFE_TOP||y+BRICK_H>Math.min(SUMMON_SAFE_BOTTOM,DANGER_Y-85))continue;
        if(!isSlotFree(x,y))continue;
        const hp=(stage===2?13:19)+Math.floor(hash01(wave,stage,col,Math.floor(y)+522)*19);
        summonSignals.push({bossId:boss.id,dx:x-boss.x,dy:y-boss.y,
          age:0,delay:FINALE_WARNING,targetId:null,w:BRICK_W,h:BRICK_H,
          hp,finale:true,finaleStage:stage});
        picks.push({col,dy:y-boss.y,hp});count++;
      }
    }
    finaleWaveSpawns[stage]=count;
    finaleDamageCheckpoints.push({stage,hp:boss.hp,elapsed:waveElapsed,count});
    record("finale_stage",{from:previous,to:stage,bossHp:boss.hp,queued:count});
    alertUntil=elapsed+3.2;
    setState("newStage",{stage,count});
    // V2.1: 终局阶段警报不再占独立音效位。
    return count;
  }
  function updateFinaleStages(){
    if(!isFinaleWave(wave)||!boss||!boss.alive||summonSignals.some(sig=>sig.finale))return;
    if(finaleStage===1&&(boss.hp<=FINALE_HP*.70||waveElapsed>=24))queueFinaleStage(2);
    else if(finaleStage===2&&(boss.hp<=FINALE_HP*.35||waveElapsed>=46))queueFinaleStage(3);
  }
  // Boss 10 has finite, *real* reinforcement bricks. No converted old bricks:
  // the player must see physical new targets instead of a support marker.
  // Boss10: multi-row assault waves of NEW physical HP bricks, not converted labels.
  // Ordinary stages still get no replacement spawns; Boss20 uses its own finite phases.
  function summonBossBricks(){
    if(!boss||!boss.alive||isFinaleWave(wave)||bossSummonTotal>=BOSS_SUPPORT_LIMIT_TOTAL)return 0;
    const existing=bricks.filter(b=>b.alive&&b.bossSupport&&b.bossId===boss.id);
    const pending=summonSignals.filter(sig=>sig.bossId===boss.id);
    const perWave=14,aliveCap=48;
    const budget=Math.min(perWave,BOSS_SUPPORT_LIMIT_TOTAL-bossSummonTotal,
      aliveCap-existing.length-pending.length,MAX_BRICKS-livingCount()-pending.length);
    if(budget<=0)return 0;
    // Choose rows across the *whole field*, not only the highest empty row.
    // Side wings remain available below the Boss, center is reserved for entry.
    const rows=[];
    for(let y=BOSS_HUD_SAFE_TOP+3;y+BRICK_H<SUMMON_SAFE_BOTTOM;y+=WAVE_ROW_GAP)rows.push(y);
    const banks=[[],[],[]];
    for(let ri=0;ri<rows.length;ri++)for(let col=0;col<BRICK_COLUMNS;col++){
      const y=rows[ri],x=12+col*BRICK_STEP_X;
      if(y>=boss.y-12&&col>=3&&col<=5)continue; // preserve bottom firing lane
      if(y>boss.y+boss.h+105&&col>=2&&col<=6)continue; // never spawn a bottom gate
      // Fresh reinforcements need meaningful travel time before the danger line;
      // the entire formation still descends at full Boss speed.
      if(y+BRICK_H>DANGER_Y-134)continue;
      if(!isSlotFree(x,y))continue;
      const band=y<boss.y-20?0:y<boss.y+boss.h+32?1:2;
      banks[band].push({x,y,col,band,score:hash01(boss.id,Math.floor(waveElapsed/BOSS_SUPPORT_INTERVAL),ri*11+col)});
    }
    for(const bank of banks)bank.sort((a,b)=>a.score-b.score);
    const taken=[0,0,0];let queued=0;
    // Round robin spreads formations among available upper/middle/lower rows.
    for(let turn=0;turn<BRICK_COLUMNS*20&&queued<budget;turn++){
      const preferred=(turn+Math.floor(bossSummonTotal/perWave))%3;
      const band=[preferred,(preferred+1)%3,(preferred+2)%3].find(i=>taken[i]<banks[i].length);
      if(band===undefined)break;
      const slot=banks[band][taken[band]++];
      if(!isSlotFree(slot.x,slot.y))continue;
      const heavy=(slot.col===1||slot.col===7)&&(queued%4===0);
      const hp=heavy?22+Math.floor(hash01(boss.id,bossSummonTotal+queued,slot.col,24)*17):
        7+Math.floor(hash01(boss.id,bossSummonTotal+queued,slot.col,19)*15);
      summonSignals.push({bossId:boss.id,dx:slot.x-boss.x,dy:slot.y-boss.y,
        age:0,delay:BOSS_WARNING,targetId:null,w:BRICK_W,h:BRICK_H,hp});
      queued++;
    }
    if(queued){
      const ordinal=1+Math.floor(bossSummonTotal/perWave);
      bossSummonTotal+=queued;
      record("boss_summon",{wave,batch:queued,total:bossSummonTotal,assault:ordinal,
        pendingPhysicalBricks:pending.length+queued});
      setState("summon",{ordinal,count:queued});
    }
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
        tile.bossSupport=true;tile.bossId=boss.id;tile.summonAge=0;tile.summonSource=sig.finale?"finale":"boss";
      }else if(isSlotFree(x,y)){
        tile=brickAt(x,y,sig.hp,{bossSupport:true,bossId:boss.id,
          color:brickColor(sig.hp,false),summonAge:0,summonSource:sig.finale?"finale":"boss"});
        bricks.push(tile);
      }
      if(tile){if(sig.finale)waveStartingTargets++;burst(tile.x+tile.w/2,tile.y+tile.h/2,sig.finale?"#ffd389":"#8cceff",sig.finale?9:5);}
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
      setState("ambient");
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
  // Boss 10 and final Boss 20 share one victory contract: defeat the
  // core, then play a radial chain-reaction *without* further danger checks.
  function defeatBoss(){
    if(!boss||bossVictory)return;
    const x=boss.x+boss.w/2,y=boss.y+boss.h/2,finishedWave=wave;
    const remaining=bricks.filter(b=>b.alive&&!b.isBoss);
    const farthest=Math.max(1,...remaining.map(b=>Math.hypot(b.x+b.w/2-x,b.y+b.h/2-y)));
    const pending=remaining.map(b=>({
      id:b.id,distance:Math.hypot(b.x+b.w/2-x,b.y+b.h/2-y),
      at:.20+Math.hypot(b.x+b.w/2-x,b.y+b.h/2-y)/farthest*1.12
    })).sort((a,b)=>a.at-b.at);
    bossDefeats++;
    record("boss_defeated",{wave:finishedWave,remainingPhysicalBricks:remaining.length,
      avoidedAutoClear:true,rule:"boss_hp_zero"});
    boss=null;bossSummonClock=0;summonSignals=[];ambientSignals=[];
    balls=[];giant=null;shootClock=0;lightningChains=[];lightningArcs=[];activePointer=null;
    bossVictory={x,y,t:0,wave:finishedWave,pending,index:0,farthest};
    alertUntil=elapsed+BOSS_FINISH_DURATION;shake=.18;
    burst(x,y,"#ffe7ae",reducedMotion?9:38);juice.onSplash({x,y});
    record("boss_finisher_start",{wave:finishedWave,targets:pending.length});
    playSfx("boss_defeated");
    setState("bossBreak");
    updateUI();
  }
  function updateBossFinisher(dt){
    if(!bossVictory)return false;
    const v=bossVictory;v.t+=dt;
    while(v.index<v.pending.length&&v.pending[v.index].at<=v.t){
      const target=v.pending[v.index++],brick=bricks.find(b=>b.id===target.id&&b.alive);
      if(!brick)continue;
      brick.alive=false; // victory FX is NOT a physical hit and does not add score/XP
      const x=brick.x+brick.w/2,y=brick.y+brick.h/2;
      burst(x,y,v.index%2?"#ffd99c":"#88e9ff",reducedMotion?3:8);
      if(!reducedMotion)impactVisual(x,y,true);
    }
    if(v.t<BOSS_FINISH_DURATION)return true;
    const exploded=v.index;
    for(const brick of bricks)if(brick.alive&&!brick.isBoss)brick.alive=false;
    record("boss_finisher_complete",{wave:v.wave,visualExplosions:exploded,
      awardedNormalBreaks:0,seconds:+v.t.toFixed(2)});
    bossVictory=null;
    setState("bossBreak");
    return false; // let ordinary wave-clear reward/ending execute THIS frame
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
      setState("bridge");
    }
    return queued;
  }
  function spawnClearBurst(){
    const next=wave+1;
    const count=spawnWave(next,clearPreview.length?clearPreview:null);
    return count;
  }
  function generateSurvival(dt){
    if(updateBossFinisher(dt))return;
    // Whole-wave contract: no ordinary rows, ambient summons, bridge spawns or
    // reinforcements. Only an alive Boss may summon a finite support set.
    if(!emptyLatch){
      waveElapsed+=dt;
      const liveBefore=livingCount();if(liveBefore>0){waveMetrics.longestNoBreak=Math.max(waveMetrics.longestNoBreak,waveElapsed-waveMetrics.lastBreak);if(liveBefore<=5)waveMetrics.tailSeconds+=dt;if(liveBefore===1&&boss)waveMetrics.bossSoloSeconds+=dt;}
      const finalePressure=isFinaleWave(wave)?.34+.11*(finaleStage-1):1;
      // Boss10 gains speed as battle lasts; move the initial lowest guides
      // one row up so the faster visual descent does not cause instant losses.
      const bossPressure=wave===10?Math.min(1.49,1.22+Math.max(0,waveElapsed-8)*.014):isFinaleWave(wave)?.9:1;
      const speed=normalDropSpeed(wave)*bossPressure*waveFallMultiplier*finalePressure;
      for(const brick of bricks)if(brick.alive)brick.y+=speed*dt;
      const danger=bricks.find(b=>b.alive&&b.y+b.h>=DANGER_Y);
      if(danger){
        const dangerSource=danger.isBoss?"boss":danger.summonSource==="boss"?"boss_support":
          danger.summonSource==="finale"?"final_support":"regular";
        const cause=dangerSource==="boss"?(danger.isFinalBoss?"finalBossName":"bossName"):
          dangerSource==="boss_support"?"bossSupport":dangerSource==="final_support"?"finalSupport":"regularBrick";
        failure={key:cause,hp:danger.hp};
        record("touchline",{wave,source:dangerSource,brickId:danger.id,hp:danger.hp,elapsed:+waveElapsed.toFixed(2),bossHp:boss?.hp??null,bossSupportBorn:bossSummonTotal});
        phase="lost";balls=[];giant=null;ui.win.classList.remove("hidden");
        renderResult();saveBestRun();
        setState("lostWave",{wave});
        playSfx("fail");window.PinballGameAudio?.stopBgm?.(1500);updateUI();return;
      }
      if(boss&&boss.alive){
        if(isFinaleWave(wave))updateFinaleStages();
        bossSummonClock+=dt;
        if(bossSummonClock>=BOSS_SUPPORT_INTERVAL){
          bossSummonClock=0;
          if(!isFinaleWave(wave)&&bossSummonTotal<BOSS_SUPPORT_LIMIT_TOTAL)summonBossBricks();
        }
        updateSummonSignals(dt);
      }
      // Guidance changes trajectories only; HP is never silently reduced.
      const live=bricks.filter(b=>b.alive);
      if(!live.length&&!boss&&!summonSignals.some(sig=>sig.finale)){
        // No projectiles or active giant may carry over into the next wave.
        // Pause combat at this boundary; only the wave-clear reward grants XP level.
        balls=[];giant=null;shootClock=0;
        lightningArcs=[];combo=0;comboVisibility=0;
        emptyLatch=true;clearWindowActive=true;
        screenClears++;clearFlash=1;record("wave_clear",{duration:+waveElapsed.toFixed(3),build:build.coreBranch||build.seedAbility});
        waveReports.push({wave,duration:+waveElapsed.toFixed(3),breaks:waveMetrics.breaks,breaksPerSecond:waveMetrics.breaks/Math.max(.01,waveElapsed),longestNoBreak:waveMetrics.longestNoBreak,tailSeconds:waveMetrics.tailSeconds,bossSoloSeconds:waveMetrics.bossSoloSeconds,shots:shotsFired-waveMetrics.shots,children:counters.splitChildren-waveMetrics.children,reclaims:counters.budgetReclaims-waveMetrics.reclaims,suppressedShots:counters.suppressedShots-waveMetrics.suppressed,suppressedChildren:counters.suppressedChildren-waveMetrics.suppressedChildren});
        if(screenClears>=MAX_WAVES){finishPrototype();return;}
        build.recovery={power:0,speed:0,life:0};arcCharge=0;lastArcRelease=-99;
        level++;waveUpgrades++;choiceQueue++;choiceReason="wave";
        replenishClock=CLEAR_CELEBRATE+CLEAR_WARNING;
        clearPreview=[];clearPreviewShown=false;ambientSignals=[];summonSignals=[];
        alertUntil=elapsed+replenishClock;
        setState("perfect",{wave});
        playSfx("clear");
      }
    }else{
      replenishClock-=dt;
      if(replenishClock<=CLEAR_WARNING&&!clearPreviewShown){
        clearPreview=planClearBurst();clearPreviewShown=true;
        setState("upcoming",{wave:wave+1});
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
    const stepStart=performance.now();
    elapsed+=dt;if(!emptyLatch){shootClock+=dt;battleTime+=dt;Build.tickBuffs(build,dt);}
    if(analytics?.available&&battleTime>=nextHeartbeat){nextHeartbeat+=15;record("heartbeat");}
    generateSurvival(dt);
    if(phase!=="playing")return;
    if(!emptyLatch&&!bossVictory){
      fanClock+=dt;gunFlash=Math.max(0,gunFlash-dt);turretRecoil=Math.max(0,turretRecoil-dt*5);brickClock+=dt;
      if(autoSkill&&build.seedAbility&&charge>=MAX_CHARGE&&!giant)activateEquippedSkill();
      const fireInterval=Build.tuning(build).interval/Build.buffModifiers(build).rate;
      if(shootClock>=fireInterval){shootClock-=fireInterval;fire();}
      const currentBalls=balls.slice(),kept=currentBalls.filter(b=>updateBall(b,dt));
      const newborn=balls.filter(b=>!currentBalls.includes(b));balls=kept.concat(newborn).slice(0,MAX_BALLS);
      updateLightningChains();
      lightningArcs.forEach(e=>e.age+=dt);lightningArcs=lightningArcs.filter(e=>e.age<e.duration);
      updateGiant(dt);
    }
    if(bossVictory){lightningArcs=[];lightningChains=[];}
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt;p.rot=(p.rot||0)+(p.spin||0)*dt;});
    breakFlashes.forEach(f=>f.age+=dt);breakFlashes=breakFlashes.filter(f=>f.age<.2);
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
    if(elapsed<alertUntil){message.classList.add("active");message.textContent=translate(emptyLatch?"perfect":boss?.alive?"bossWaveLabel":"waveOnly",{wave,boss:bossName()});}
    else if(boss&&boss.alive&&livingCount()===1&&waveElapsed%6>=4){message.classList.add("active");message.textContent=translate("weak");}
    else if(livingCount()>0&&livingCount()<=5&&waveElapsed>12){message.classList.add("active");message.textContent=translate("tail");}
    else message.classList.remove("active");
    uiClock+=dt;
    if(uiClock>=.10){uiClock=0;updateUI();}
    counters.maxBallsAlive=Math.max(counters.maxBallsAlive,balls.length);
    const cost=performance.now()-stepStart;physicsCostMs+=cost;physicsSteps++;maxPhysicsMs=Math.max(maxPhysicsMs,cost);
  }
  function rounded(x,y,w,h,r){
    ctx.beginPath();
    if(ctx.roundRect){ctx.roundRect(x,y,w,h,r);return;}
    const corner=Math.min(r,w/2,h/2);
    ctx.moveTo(x+corner,y);
    ctx.arcTo(x+w,y,x+w,y+h,corner);
    ctx.arcTo(x+w,y+h,x,y+h,corner);
    ctx.arcTo(x,y+h,x,y,corner);
    ctx.arcTo(x,y,x+w,y,corner);
    ctx.closePath();
  }

  function withAlpha(hex,a){
    const n=parseInt(hex.slice(1),16);
    return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";
  }
  // Bake each resting halo once. Geometry, HP labels and hit effects stay live.
  const brickHalos=new Map();
  function brickHalo(color){
    if(brickHalos.has(color))return brickHalos.get(color);
    const image=document.createElement("canvas");
    const pad=BRICK_ART.glow, density=3;
    image.width=(BRICK_W+pad*2)*density;
    image.height=(BRICK_H+pad*2)*density;
    const art=image.getContext("2d");
    art.scale(density,density);
    art.shadowBlur=pad*density;
    art.shadowColor=withAlpha(color,.78);
    art.fillStyle=withAlpha(color,.44);
    art.beginPath();
    if(art.roundRect)art.roundRect(pad,pad,BRICK_W,BRICK_H,BRICK_ART.radius);
    else art.rect(pad,pad,BRICK_W,BRICK_H);
    art.fill();
    brickHalos.set(color,image);
    return image;
  }
  function brickTile(x,y,w,h,r,style,glow){
    if(glow){
      const pad=BRICK_ART.glow;
      ctx.drawImage(brickHalo(style.edge),x-pad,y-pad,w+pad*2,h+pad*2);
    }
    const g=ctx.createLinearGradient(0,y,0,y+h);
    g.addColorStop(0,style.ft);g.addColorStop(1,style.fb);
    ctx.fillStyle=g;
    rounded(x,y,w,h,r);ctx.fill();
    const bw=style.border||1.3;
    ctx.strokeStyle=style.edge;ctx.lineWidth=bw;
    rounded(x+bw*.5,y+bw*.5,w-bw,h-bw,r);ctx.stroke();
    ctx.strokeStyle="#ffffff66";ctx.lineWidth=.65;
    ctx.stroke();
  }
  function brickText(x,y,w,h,text,ink,size){
    // 参考图的数字是纯白 + 极轻投影，没有黑描边。
    // 旧实现 1.9px 描边在 11.5px 字号上等于给笔画套了近 4 设备像素黑框，三位数会糊成一团。
    ctx.save();
    ctx.font="900 "+size+"px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.shadowColor="rgba(0,7,16,.42)";ctx.shadowBlur=2;ctx.shadowOffsetY=.6;
    ctx.fillStyle=ink;ctx.fillText(text,x+w/2,y+h/2+.4);
    ctx.restore();
  }
  // 裂纹只出现在四角，绝不越过中心数字区
  function brickCracks(b){
    const x=b.x,y=b.y,w=b.w,h=b.h;
    ctx.save();ctx.globalAlpha=.9;ctx.strokeStyle="#ffe6fb";ctx.lineWidth=1.05;ctx.lineJoin="round";
    ctx.beginPath();
    ctx.moveTo(x+1,y+5);ctx.lineTo(x+4.6,y+4);ctx.lineTo(x+3.4,y+9);ctx.lineTo(x+7.6,y+8);
    ctx.moveTo(x+w-1,y+h-5);ctx.lineTo(x+w-5,y+h-4);ctx.lineTo(x+w-4,y+h-9);
    if(h>=20){ctx.moveTo(x+w-1,y+4);ctx.lineTo(x+w-4,y+6);}
    ctx.stroke();ctx.restore();
  }
  function brickFlash(b){
    if(!(b.bonk>0))return;
    ctx.save();ctx.globalAlpha=Math.min(1,b.bonk/.12)*.5;ctx.fillStyle="#ffffff";
    rounded(b.x,b.y,b.w,b.h,BRICK_ART.radius);ctx.fill();ctx.restore();
  }
  /* 三种特殊砖图标（V1.0）：7×7 逻辑单位，与数字整体居中。
     rad = 图标半径；alpha/pulse 用于呼吸与环脉冲。
     菱形用描边而非 destination-out 镂空——后者会挖穿游戏画布下层。 */
  function brickIcon(cx,cy,rad,kind,alpha,pulse){
    ctx.save();ctx.translate(cx,cy);ctx.scale(rad,rad);
    ctx.globalAlpha=alpha==null?1:alpha;
    ctx.fillStyle="#F2FFFB";ctx.strokeStyle="#E8FBFF";ctx.lineJoin="round";ctx.lineCap="round";
    if(kind==="energy"){
      ctx.beginPath();
      ctx.moveTo(.42,-1);ctx.lineTo(-.78,-.06);ctx.lineTo(-.12,-.06);
      ctx.lineTo(-.44,1);ctx.lineTo(.78,.02);ctx.lineTo(.12,.02);
      ctx.closePath();ctx.fill();
    }else if(kind==="elite"){
      // 空心菱形：三角形描边宽度在归一化坐标里 0.30
      ctx.lineWidth=.30;
      ctx.beginPath();
      ctx.moveTo(0,-1);ctx.lineTo(.8,0);ctx.lineTo(0,1);ctx.lineTo(-.8,0);
      ctx.closePath();ctx.stroke();
    }else{
      const k=pulse==null?1:pulse;
      ctx.lineWidth=.26/Math.max(.6,k);
      ctx.beginPath();ctx.arc(0,0,.92*k,0,Math.PI*2);ctx.stroke();
      ctx.lineWidth=.19/Math.max(.6,k);
      ctx.beginPath();ctx.arc(0,0,.46,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }

  /* 图标 + 数字作为一个整体水平居中；超宽时降级图标 6 / 字号 10 */
  function brickFace(brick,kind,animT){
    const w=brick.w,h=brick.h;
    const numTxt=kind==="energy"||(!kind&&brick.hp===1)?"":String(brick.hp);
    let iconU=7,gap=2,size=11.5;
    ctx.font="900 "+size+"px system-ui";
    let numW=numTxt?ctx.measureText(numTxt).width:0;
    if(kind&&numTxt&&iconU+gap+numW>w-4){
      iconU=6;size=10;
      ctx.font="900 "+size+"px system-ui";
      numW=ctx.measureText(numTxt).width;
    }
    const total=kind?(numTxt?iconU+gap+numW:iconU):numW;
    const bx=brick.x+(w-total)/2;
    const cy=brick.y+h/2;
    if(kind){
      // animT 为数字时才动；lite / reducedMotion 传 null，停在区间中点
      const live=typeof animT==="number";
      const alpha=kind==="energy"?(live?.89+.11*Math.sin(animT*2.618):.89):1;   // 2.4s → 0.78–1.00
      const pulse=kind==="summon"?(live?.96+.06*Math.sin(animT*3.1416):.96):1;  // 2.0s → 0.90–1.02
      brickIcon(bx+iconU/2,cy,(iconU/2)*.92,kind,alpha,pulse);
    }
    if(numTxt){
      ctx.save();
      ctx.font="900 "+size+"px system-ui";
      ctx.textAlign="left";ctx.textBaseline="middle";
      ctx.shadowColor="rgba(0,7,16,.42)";ctx.shadowBlur=2;ctx.shadowOffsetY=.6;
      ctx.fillStyle="#ffffff";
      ctx.fillText(numTxt,kind?bx+iconU+gap:bx,brick.y+h/2+.4);
      ctx.restore();
    }
  }
  /* Boss：紫色/粉紫霓虹框 + 内核光；最终 Boss 三阶段用装甲状态表达 */
  function drawBossTile(b){
    const st=b.isFinalBoss?BRICK_ART.finalBoss:BRICK_ART.boss;
    const stage=b.isFinalBoss?finaleStage:1;
    const r=b.isFinalBoss?11:10;
    const cx=b.x+b.w/2,cy=b.y+b.h/2;
    ctx.save();
    ctx.shadowColor=st.glow;ctx.shadowBlur=renderQuality==="full"?(b.isFinalBoss?22:18):4;
    ctx.fillStyle=st.base;rounded(b.x,b.y,b.w,b.h,r);ctx.fill();
    ctx.restore();
    // 内核光：阶段三最强
    const coreA=b.isFinalBoss?(stage>=3?.62:stage===2?.34:.2):.28;
    const g=ctx.createRadialGradient(cx,cy,1,cx,cy,b.w*.52);
    g.addColorStop(0,withAlpha(st.edge,coreA));
    g.addColorStop(.55,withAlpha(st.edge,coreA*.3));
    g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.save();ctx.fillStyle=g;rounded(b.x+2,b.y+2,b.w-4,b.h-4,r-2);ctx.fill();ctx.restore();
    // 外圈光晕：让 Boss 从密集砖阵里跳出来
    ctx.save();
    ctx.globalAlpha=.32;ctx.strokeStyle=st.edge;ctx.lineWidth=2.4;
    rounded(b.x-2.5,b.y-2.5,b.w+5,b.h+5,r+2);ctx.stroke();
    ctx.restore();
    // 装甲框：阶段二破损（断线），阶段三更亮并加内白线
    ctx.save();
    ctx.strokeStyle=st.edge;
    ctx.lineWidth=stage>=3?2.6:(b.isFinalBoss?2.4:2.2);
    if(stage===2)ctx.setLineDash([10,5]);
    rounded(b.x+1,b.y+1,b.w-2,b.h-2,r);ctx.stroke();
    ctx.setLineDash([]);
    if(stage>=3){
      ctx.globalAlpha=.55;ctx.strokeStyle="#ffffff";ctx.lineWidth=1;
      rounded(b.x+3.2,b.y+3.2,b.w-6.4,b.h-6.4,r-2);ctx.stroke();
    }
    ctx.restore();
    if(stage>=2){
      ctx.save();ctx.globalAlpha=.75;ctx.strokeStyle=st.edge;ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(b.x+3,b.y+b.h*.28);ctx.lineTo(b.x+11,b.y+b.h*.36);ctx.lineTo(b.x+8,b.y+b.h*.5);
      ctx.moveTo(b.x+b.w-3,b.y+b.h*.72);ctx.lineTo(b.x+b.w-12,b.y+b.h*.64);
      ctx.stroke();ctx.restore();
    }
    if(b.isFinalBoss){
      ctx.save();ctx.font="bold 8px system-ui";ctx.textAlign="center";ctx.fillStyle="#ffd9f2";
      ctx.globalAlpha=.95;ctx.fillText(translate("finalStage",{stage}),cx,b.y+13.5);ctx.restore();
    }
    brickText(b.x,b.y+(b.isFinalBoss?6:2),b.w,b.h-(b.isFinalBoss?8:4),String(b.hp),"#fff6ff",b.isFinalBoss?21:17);
  }
  function draw() {
    ctx.setTransform(renderScale,0,0,renderScale,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.save();
    // Existing v0.5 giant-only shake remains when additional effects are off.
    if(juice.mode==="off"&&shake>0&&!reducedMotion){
      const amp=2.1*Math.min(1,shake/.09);
      ctx.translate((Math.random()-.5)*amp*2,(Math.random()-.5)*amp*2);
    }
    juice.applyCamera(ctx);
    ctx.save();
    ctx.setLineDash([8,5]);ctx.strokeStyle=dangerInk;ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(0,DANGER_Y);ctx.lineTo(W,DANGER_Y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=dangerInk;ctx.font="bold 11px system-ui";ctx.textAlign="left";ctx.fillText(translate("danger"),10,DANGER_Y-8);
    if(clearFlash>0){ctx.fillStyle="rgba(80,246,216,"+(clearFlash*.12)+")";ctx.fillRect(0,0,W,H);}
    ctx.restore();
    // Lightweight telegraph: a flickering outline appears before a Boss brick
    // becomes solid; it never collides during the warning phase.
    if(summonSignals.length&&boss&&boss.alive){
      ctx.save();
      for(const sig of summonSignals){
        const w=sig.w||BRICK_W,h=sig.h||BRICK_H;
        const x=boss.x+sig.dx,y=boss.y+sig.dy;
        const t=clamp(sig.age/sig.delay,0,1);
        const col=sig.finale?"#FFC46A":"#7FE7FF";
        // 1 半透明砖块投影：随进度渐显
        ctx.globalAlpha=.10+.30*t;
        ctx.fillStyle=col;rounded(x,y,w,h,4);ctx.fill();
        // 2 能量聚集：内框由大向小收拢
        const k=1-.34*t;
        ctx.globalAlpha=.22+.42*t;
        ctx.strokeStyle=col;ctx.lineWidth=1+.9*t;
        rounded(x+w*(1-k)/2,y+h*(1-k)/2,w*k,h*k,3);ctx.stroke();
        // 3 轮廓：前 60% 虚线，之后转实线并加亮
        ctx.globalAlpha=t<.6?.55+.3*t:.92;
        ctx.lineWidth=t<.6?1.4:1.8;
        if(t<.6)ctx.setLineDash([3,4]);else ctx.setLineDash([]);
        rounded(x,y,w,h,4);ctx.stroke();ctx.setLineDash([]);
        // 4 生成前的中心脉冲
        if(t>.55){
          const q=(t-.55)/.45;
          ctx.globalAlpha=.5*(1-q);ctx.strokeStyle="#ffffff";ctx.lineWidth=1.1;
          rounded(x+w*q*.5,y+h*q*.5,w*(1-q),h*(1-q),3);ctx.stroke();
        }
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
      // 召唤入场缩放
      if(brick.summonAge!==undefined&&brick.summonAge<.38&&!reducedMotion){
        const t=Math.max(0,brick.summonAge/.38),scale=.5+.5*(1-Math.pow(1-t,3));
        ctx.globalAlpha=.35+.65*t;ctx.translate(brick.x+brick.w/2,brick.y+brick.h/2);
        ctx.scale(scale,scale);ctx.translate(-brick.x-brick.w/2,-brick.y-brick.h/2);
      }
      // 受击形变
      if(juice.mode!=="off")juice.applyBrickMotion(ctx,brick);
      else if(brick.bonk>0 && !reducedMotion){
        const intensity=Math.sin((brick.bonk/.12)*Math.PI)*.045;
        ctx.translate(brick.x+brick.w/2,brick.y+brick.h/2);
        ctx.scale(1+intensity,1-intensity);
        ctx.translate(-brick.x-brick.w/2,-brick.y-brick.h/2);
      }
      if(brick.isBoss){drawBossTile(brick);ctx.restore();continue;}
      // 特殊砖使用独立配色和图标。
      const style=brick.special?BRICK_ART.special:
        (brick.isElite?BRICK_ART.elite:(brick.bossSupport?BRICK_ART.summon:earlyOneHpStyle(brick)||brickStyle(brick.hp,false)));
      brickTile(brick.x,brick.y,brick.w,brick.h,brick.isElite?5:BRICK_ART.radius,style,renderQuality==="full");
      if(brick.cracked)brickCracks(brick);
      brickFlash(brick);
      // 精英砖内发光：3s 周期，只叠加径向光，不改外形
      if(brick.isElite&&renderQuality==="full"&&!reducedMotion){
        const ig=.72+.28*Math.sin(brickClock*2.094);
        const cx=brick.x+brick.w/2,cy=brick.y+brick.h/2;
        ctx.save();
        const rg=ctx.createRadialGradient(cx,cy,0,cx,cy,brick.w*.62);
        rg.addColorStop(0,withAlpha(style.edge,.20*ig));
        rg.addColorStop(1,"rgba(0,0,0,0)");
        ctx.globalCompositeOperation="lighter";
        ctx.fillStyle=rg;
        rounded(brick.x+1,brick.y+1,brick.w-2,brick.h-2,Math.max(1,BRICK_ART.radius-1));ctx.fill();
        ctx.restore();
      }
      brickFace(brick,
        brick.special?"energy":(brick.isElite?"elite":(brick.bossSupport?"summon":null)),
        (renderQuality==="full"&&!reducedMotion)?brickClock:null);
      // 召唤落地余波（保留原有 0.7s 扩散环）
      if(!brick.bossSupport&&brick.summonSource&&brick.summonAge!==undefined&&brick.summonAge<.7&&!reducedMotion){
        const t=brick.summonAge/.7;
        ctx.save();ctx.globalAlpha=Math.max(0,.45*(1-t));
        ctx.strokeStyle=brick.summonSource==="clear"?"#b6f7ff":"#70e7d2";ctx.lineWidth=1.4;
        rounded(brick.x-5*t,brick.y-5*t,brick.w+10*t,brick.h+10*t,4+4*t);ctx.stroke();ctx.restore();
      }
      ctx.restore();
    }
    const cannonAim=cannonAngle();
    if(phase==="playing"){
      const guideLength=Math.max(218,H*.51);
      ctx.save();ctx.translate(shooter.x,shooter.y-TUR_PIVOT_LIFT);ctx.rotate(cannonAim);
      ctx.setLineDash([8,6]);ctx.lineWidth=1.75;ctx.strokeStyle=withAlpha(cyan,.94);
      ctx.beginPath();ctx.moveTo(0,-TUR_MUZZLE-2);ctx.lineTo(0,-guideLength);ctx.stroke();
      ctx.restore();
    }
    for(const b of balls){
      b.trail.forEach((p,i)=>{const t=1-i/b.trail.length;ctx.fillStyle="rgba(139,224,250,"+(.18*t)+")";
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,(b.visualR||b.r)*t*.7),0,Math.PI*2);ctx.fill();});
      ctx.shadowColor=b.drill?"#ffb05d":b.chargeStacks?"#fced83":b.mini?"#c39fff":"#b9f2ff";
      ctx.shadowBlur=b.drill?18:11;ctx.fillStyle=b.drill?"#ffcc67":b.chargeStacks?"#fff5b0":b.mini?"#dbbaff":"#edfaff";
      ctx.beginPath();ctx.arc(b.x,b.y,b.visualR||b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
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
    for(const f of breakFlashes){
      const t=clamp(f.age/.18,0,1),r=9+27*t;
      const fg=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,r);
      fg.addColorStop(0,"rgba(255,255,255,"+(.68*(1-t)).toFixed(3)+")");
      fg.addColorStop(.45,withAlpha(f.color||"#ffffff",.3*(1-t)));
      fg.addColorStop(1,"rgba(255,255,255,0)");
      ctx.fillStyle=fg;ctx.beginPath();ctx.arc(f.x,f.y,r,0,Math.PI*2);ctx.fill();
    }
    for(const p of particles){
      ctx.globalAlpha=clamp(p.life/.42,0,1);ctx.fillStyle=p.color;
      if(p.shard){
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot||0);
        ctx.fillRect(-2.1,-1.5,4.2,3);ctx.restore();
      }else ctx.fillRect(p.x-2,p.y-2,4,4);
    }
    ctx.globalAlpha=1;
    juice.draw(ctx);
    // Boss shockwave expands with the real victory timer. No combat collision.
    if(bossVictory){
      const v=bossVictory,t=clamp(v.t/BOSS_FINISH_DURATION,0,1);
      ctx.save();
      ctx.globalAlpha=reducedMotion?.28:.70*(1-t);
      ctx.strokeStyle="#ffd9a5";ctx.lineWidth=5*(1-t)+1;ctx.shadowColor="#ffd7a4";ctx.shadowBlur=24;
      ctx.beginPath();ctx.arc(v.x,v.y,10+t*(v.farthest+30),0,Math.PI*2);ctx.stroke();
      ctx.shadowBlur=0;ctx.globalAlpha=Math.min(1,.9*(1-t)+.25);
      ctx.font="900 19px system-ui";ctx.textAlign="center";ctx.fillStyle="#fff3dc";
      ctx.fillText(translate("bossBreak"),W/2,Math.min(H-150,220));ctx.restore();
    }
    if(!reducedMotion){
      for(const e of impactRings){
        const duration=e.hard?.24:.15, t=clamp(e.age/duration,0,1);
        ctx.strokeStyle=e.hard?"rgba(182,241,255,"+(.65*(1-t))+")":"rgba(255,217,154,"+(.4*(1-t))+")";
        ctx.lineWidth=e.hard?2.4:1.5;
        ctx.beginPath();ctx.arc(e.x,e.y,5+(e.hard?27:15)*t,0,Math.PI*2);ctx.stroke();
      }
      ctx.save();
      for(const e of floatTexts){
        const t=clamp(e.age/.56,0,1);
        ctx.globalAlpha=1-t;ctx.textAlign="center";ctx.font="900 10.5px system-ui";
        ctx.shadowColor="rgba(0,7,16,.5)";ctx.shadowBlur=2;ctx.shadowOffsetY=.5;
        ctx.fillStyle=e.color;ctx.fillText(e.text,e.x,e.y-8-t*23);
      }
      ctx.restore();
    }
    if(combo>=2 && comboVisibility>0){
      const ct=clamp(comboVisibility,0,1);
      const grow=1+Math.min(.34,combo*.028);
      ctx.save();
      ctx.globalAlpha=clamp(ct*1.5,0,1);
      ctx.translate(10,H-72);ctx.scale(grow,grow);
      ctx.textAlign="left";ctx.textBaseline="alphabetic";
      ctx.font="900 18px system-ui";
      ctx.shadowColor="#ffb347";ctx.shadowBlur=renderQuality==="full"?10:0;
      ctx.fillStyle=combo>=5?"#ffd08a":"#a6efd9";
      ctx.fillText(translate("combo",{count:combo}),0,0);
      ctx.restore();
      ctx.globalAlpha=1;
    }
    drawTurret(cannonAim);
    ctx.restore();
  }
  function drawTurret(angle){
    const {ground,barrel,body,core}=turretParts;
    ctx.save();
    ctx.translate(shooter.x,shooter.y-TUR_PIVOT_LIFT);
    if(ground.img)ctx.drawImage(ground.img,ground.x,ground.y,ground.w,ground.h);
    ctx.save();
    ctx.rotate(angle);
    if(turretRecoil>0)ctx.translate(0,turretRecoil*TUR_RECOIL);
    if(barrel.img)ctx.drawImage(barrel.img,barrel.x,barrel.y,barrel.w,barrel.h);
    else{
      ctx.fillStyle=cyan;
      rounded(-5,-TUR_MUZZLE,10,30,3);ctx.fill();
    }
    if(gunFlash>0){ctx.fillStyle=Build.tuning(build).isGun?"#ffda84":"#9ce9ff";ctx.beginPath();ctx.arc(0,-TUR_MUZZLE-3,2+gunFlash*34,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    if(body.img)ctx.drawImage(body.img,body.x,body.y,body.w,body.h);
    else{
      ctx.fillStyle="#165494";ctx.strokeStyle="#d1f9ff";ctx.lineWidth=1.6;
      rounded(-24.6,-8.6,49.2,49.2,12);ctx.fill();ctx.stroke();
    }
    if(core.img)ctx.drawImage(core.img,core.x,core.y,core.w,core.h);
    else{
      ctx.fillStyle=cyan;ctx.beginPath();ctx.arc(0,16,13.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#cbfcff";ctx.beginPath();ctx.arc(0,16,8.4,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function renderBuildPanel(){
    const q=Build.summary(build),stats=q.stats,mods=q.modifiers;
    $("pauseSubtitle").textContent=[translate("waveCount",{wave,max:MAX_WAVES}),Build.DEFS[q.focus]?.name,Build.DEFS[q.branch]?.name].filter(Boolean).join(" · ");
    $("buildStats").textContent=translate("buildStats",{damage:stats.damage,rate:(mods.rate/stats.interval).toFixed(2),
      speed:(stats.speed*mods.speed).toFixed(0),ttl:stats.ttl.toFixed(1),balls:balls.length,max:MAX_BALLS});
    $("buildSkills").textContent=q.skills.map(skill=>skill.name+" · R"+skill.rank+"\n"+skill.effect).join("\n\n");
    const last=q.history.at(-1),deltas=entry=>Build.describeDeltas(entry).map(delta=>delta.text).join(" · ");
    $("lastUpgrade").textContent=last?Build.DEFS[last.id].name+"\n"+deltas(last)+"\n"+
      translate("upgradeStats",{before:last.before.damage,after:last.after.damage,rateBefore:(1/last.before.interval).toFixed(2),
        rateAfter:(1/last.after.interval).toFixed(2)}):translate("noUpgrade");
    $("buildHistory").textContent=q.history.map(entry=>translate(entry.wave?"perfect":"seed",{wave:entry.wave})+
      " · "+Build.DEFS[entry.id].name+"\n"+deltas(entry)).join("\n\n");
    $("buildBuffs").textContent=q.buffs.length?q.buffs.map(buff=>translate("buffTime",{name:buff.name,sec:buff.remaining.toFixed(1),description:buff.description})).join("\n"):translate("noBuffs");
    $("resume").textContent=translate(pausedFrom==="ready"||pausedFrom==="lost"||pausedFrom==="complete"?"resume":"continue");
  }
  function applyLanguage(){
    locale.apply(document);
    if(lastMessage)setState(lastMessage.id,lastMessage.values);
    if(phase==="choosing"||pausedFrom==="choosing")showCards();
    if(phase==="paused")renderBuildPanel();
    renderResult();renderBestRuns();updateUI();
  }
  for(const selector of document.querySelectorAll("[data-language]")){
    selector.addEventListener("change",()=>{if(locale.set(selector.value))applyLanguage();});
  }
  function lockBackground(locked){
    for(const element of document.querySelectorAll?.(".topbar,.hud,.footer,.combat-status,#game,#choiceOverlay,#startOverlay,#winOverlay,.ult-wrap")||[])element.inert=locked;
  }
  function showPausePanel(compact){
    const panel=$("pauseOverlay");
    panel.dataset.view=compact?"compact":"settings";
    panel.setAttribute("aria-labelledby",compact?"quickPauseTitle":"pauseTitle");
  }
  function pause(reason="settings",compact=false){
    if(!["ready","seeding","playing","choosing","lost","complete"].includes(phase))return false;
    showPausePanel(compact||reason==="keyboard");
    pausedFrom=phase;phase="paused";activePointer=null;accumulator=0;
    if(pausedFrom==="playing"||pausedFrom==="choosing")record("paused",{reason});
    focusBeforePause=document.activeElement;lockBackground(true);renderBuildPanel();$("pauseOverlay").classList.remove("hidden");$("resume").focus?.();window.PinballGameAudio?.pauseBgm?.();updateUI();return true;
  }
  function resume(){
    if(phase!=="paused")return false;phase=pausedFrom;pausedFrom=null;accumulator=0;lastFrame=performance.now();
    $("pauseOverlay").classList.add("hidden");lockBackground(false);focusBeforePause?.focus?.();
    if(phase==="playing"||phase==="choosing"){sound?.resumeBgm();record("resumed");}
    updateUI();return true;
  }
  $("pause").addEventListener("click",()=>phase==="paused"?resume():pause());
  $("pauseQuick").addEventListener("click",()=>pause("settings",true));
  $("pauseSettings").addEventListener("click",()=>{
    showPausePanel(false);
    $("resume").focus();
  });
  $("resume").addEventListener("click",resume);
  $("exportRun").addEventListener("click",()=>{
    const data=JSON.stringify({version,state:snapshot(),events,config:CFG},null,2);
    const url=URL.createObjectURL(new Blob([data],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="marble-overload-v1-"+build.seed+".json";link.click();URL.revokeObjectURL(url);
  });
  function setAim(e) {
    const box = canvas.getBoundingClientRect();
    const scale=Math.min(box.width/W,box.height/H),offset=(box.width-W*scale)/2;
    const x = clamp((e.clientX-box.left-offset)/scale,0,W);
    aim = clamp((x-W/2)/(W/2)*1.08,-1.08,1.08);
  }
  canvas.addEventListener("pointerdown",e=>{
    if(phase!=="playing"||emptyLatch) return;
    e.preventDefault();unlockSound();activePointer=e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);setAim(e);
  });
  canvas.addEventListener("pointermove",e=>{
    if(phase!=="playing"||emptyLatch||e.pointerId!==activePointer) return;
    e.preventDefault();setAim(e);
  });
  function stopAim(e){if(e.pointerId===activePointer) activePointer=null;}
  canvas.addEventListener("pointerup",stopAim);
  canvas.addEventListener("pointercancel",stopAim);
  ui.giant.addEventListener("click",e=>{e.stopPropagation();activateEquippedSkill();});
  $("skillSide").value=skillSide;$("autoSkill").checked=autoSkill;applySkillSide();
  $("skillSide").addEventListener("change",e=>{skillSide=e.target.value==="left"?"left":"right";store(SIDE_KEY,skillSide);applySkillSide();});
  $("autoSkill").addEventListener("change",e=>{autoSkill=!!e.target.checked;store(AUTO_KEY,autoSkill?"yes":"no");});
  $("start").addEventListener("click",begin);
  /* V2.1c: 菜单按钮音。开始/再来一次/重开走 click1，其余按钮统一 rollover2。
     只挂在游戏内的 button 上，调试台面板（#audioQaPanel）的按钮不出声，以免污染试听。 */
  document.addEventListener("click",e=>{
    const btn=e.target instanceof Element?e.target.closest("button"):null;
    if(!btn||btn.closest("#audioQaPanel"))return;
    unlockSound();
    const main=btn.id==="start"||btn.id==="again"||btn.id==="reset";
    playSfx(main?"ui_start":"ui_click");
  },true);
  $("jumpBoss").addEventListener("click",jumpToBoss10);
  $("jumpFinalBoss").addEventListener("click",jumpToFinalBoss);
  for(let i=0;i<3;i++)$("choice"+i).addEventListener("click",()=>{unlockSound();chooseUpgrade(choiceSet[i]);});
  $("home").addEventListener("click",reset);
  function restartRun(){
    unlockSound();record("restart",{reason:"restart"});reset();begin();
  }
  $("again").addEventListener("click",restartRun);
  $("reset").addEventListener("click",restartRun);
  function resetFrameClock(){accumulator=0;lastFrame=performance.now();}
  function suspendBattle(){
    if(["playing","choosing","seeding"].includes(phase))pause("background");
    resetFrameClock();
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){suspendBattle();analytics?.close();}
    else resetFrameClock();
  });
  window.addEventListener("resize",()=>{fitCanvas();activePointer=null;resetFrameClock();});
  window.addEventListener("pagehide",()=>{
    const active=phase==="paused"?pausedFrom:phase;
    const exit=!practiceRun&&["playing","choosing"].includes(active)?{...analyticsState(),reason:"exit"}:null;
    suspendBattle();analytics?.close(exit);
  });
  window.addEventListener("keydown",e=>{
    if(phase==="paused"&&e.code==="Tab"){
      const focusable=Array.from($("pauseOverlay").querySelectorAll("button,input,select,a[href],[tabindex='0'],summary")).filter(el=>!el.disabled&&el.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}
      else if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}
      return;
    }
    if(e.code==="KeyP"||e.code==="Escape"){if(phase==="paused")resume();else pause("keyboard");e.preventDefault();return;}
    if(phase!=="playing"||emptyLatch)return;
    if(e.code==="ArrowLeft"){aim=clamp(aim-.09,-1.08,1.08);e.preventDefault();}
    if(e.code==="ArrowRight"){aim=clamp(aim+.09,-1.08,1.08);e.preventDefault();}
    if(e.code==="Space"){fireGiant();e.preventDefault();}
  });
  let frameRequest=0;
  function scheduleFrame(){if(!frameRequest)frameRequest=requestAnimationFrame(frame);}
  function tickFrame(now) {
    if(document.hidden)return;
    const uncapped=Math.max(0,(now-lastFrame)/1000);
    const delta=phase==="paused"?0:clamp(uncapped,0,.06);
    lastFrame=now;
    // 120Hz fixed physics; rAF draws on each display refresh (60/90/120Hz if supported).
    accumulator=Math.min(.06,accumulator+delta);
    let steps=0;
    while(accumulator>=PHYSICS_DT-1e-8&&steps<MAX_FRAME_STEPS){
      update(PHYSICS_DT);accumulator-=PHYSICS_DT;steps++;
    }
    if(steps>=MAX_FRAME_STEPS&&accumulator>=PHYSICS_DT)accumulator=0;
    if(delta>0){
      metricsClock+=uncapped;frameSamples++;
      if(metricsClock>=1){
        fpsNow=Math.round(frameSamples/metricsClock);
        if(fpsNow<48)renderQuality="lite";
        else if(fpsNow>=55)renderQuality="full";
        juice.setQuality(renderQuality);
        $("fpsStat").textContent="FPS "+fpsNow;
        metricsClock=0;frameSamples=0;
      }
    }
    draw();
  }
  function frame(now){
    frameRequest=0;
    if(boot.failed){sound?.stopBgm(0);return;}
    try {tickFrame(now);}
    catch(error){sound?.stopBgm(0);boot.report(error);return;}
    scheduleFrame();
  }
  function snapshot() {
    return {damageDealt,shotsWithContact,currentWaveMetrics:waveMetrics?{...waveMetrics,longestNoBreak:Math.max(waveMetrics.longestNoBreak,waveElapsed-waveMetrics.lastBreak)}:null,precisionTurns,focusDamage,gunBonusDamage,weakpointDamage,weakpointCharge,waveFallMultiplier,worldWidth:W,worldHeight:H,dangerY:DANGER_Y,shooterY:shooter.y,growthFocus:build.growthFocus,pausedFrom,battleTime,bankDamage,temporaryBuffs:build.temporaryBuffs.map(b=>({...b})),buildSummary:Build.summary(build),waveReports:waveReports.map(r=>({...r})),seed:build.seed,seedAbility:build.seedAbility,coreFocus:build.coreFocus,coreBranch:build.coreBranch,ranks:{...build.ranks},routeWeights:{...build.routeWeights},
      choiceHistory:build.choiceHistory.map(c=>({...c})),...counters,shotsByBuild:{...counters.shotsByBuild},collisionChecks,physicsMeanMs:physicsSteps?physicsCostMs/physicsSteps:0,maxPhysicsMs,
      phase,wave,score,aim,interval:Build.tuning(build).interval,fpsNow,renderQuality,physicsHz:120,level,xp,xpGoal,choiceQueue,choiceSet:choiceSet.join(","),powerLevel,volleyLevel,rateLevel,speedLevel,lifeLevel,rowIndex,screenClears,waveElapsed,waveSpawnCount,waveStartingTargets,waveUpgrades,bossSummonTotal,finaleStage,finaleWaveSpawns:[...finaleWaveSpawns],finaleDamageCheckpoints:[...finaleDamageCheckpoints],clearWindowActive,nearClearClock,replenishClock,cleanupWindow,cleanupStarted,cleanupActivations,bridgeTimer,bridgeBursts,bridgeTiles,upperOnlyBridgeCount,zoneCounts:zoneCounts(),clearPreviewCount:clearPreview.length,clearPreviewShown,summonWarningCount:summonSignals.length,ambientSummonClock,ambientSummonBursts,ambientSummonTiles,ambientSummonWarningCount:ambientSignals.length,overlapSummonCount,clearBurstCount,clearBurstTiles,bossActive:!!(boss&&boss.alive),bossHp:boss?.hp||0,bossDefeats,brickCount:livingCount(),surgeActive:elapsed<surgeUntil,hunterLevel,ricochetLevel,
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
      bonusVolleyBalls,homingTurns,shockWaves,directBreaks,soundVolume,soundMuted,impactHaptics,
      electricTargetsWithUpgrade:Math.min(5,ELECTRIC_TARGETS[electricStage]+arcLevel),
      remainingHp:bricks.filter(b=>b.alive).reduce((n,b)=>n+b.hp,0),
      visibleNumbers:bricks.filter(b=>b.alive&&!b.cracked).length,
      oneHitBricks:bricks.filter(b=>b.alive&&b.hp===1&&!b.armored).length,
      hpMax:Math.max(0,...bricks.filter(b=>b.alive).map(b=>b.hp)),
      waveTotal,waveRows:WAVE_ROWS[wave-1],waveCount:MAX_WAVES,
      electricAwakenAt:Math.ceil(waveTotal*.30),electricBuildAt:Math.ceil(waveTotal*.15),
      giantHits:giant?.collisions||0,giantBounces:giant?.bounces||0,
      combo,maxCombo,hitCount,shotRadius:SHOT_RADIUS,shotCollisionRadius:SHOT_HIT_RADIUS,shotSpeed:BALL_SPEED,brickWidth:BRICK_W,brickHeight:BRICK_H,
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
      selectSeed,fire,makeTestBall:makeBallTest,ballDetails(){return balls.map(b=>({...b}));},
      configureBuild(ranks,branch=null){for(const [id,rank] of Object.entries(ranks))build.ranks[id]=rank;if(branch){build.coreBranch=branch;build.coreFocus=Build.DEFS[branch].family;build.ranks[branch]=1;}syncBuild();updateUI();},
      setTestField(items){bricks=items.map(b=>brickAt(b.x,b.y,b.hp,b));boss=bricks.find(b=>b.isBoss)||null;balls=[];return bricks.map(b=>b.id);},
      directContact(id,ball){const b=bricks.find(b=>b.id===id);return b?directContact(b,ball):false;},
      fillBallBudget(){balls=Array.from({length:MAX_BALLS},(_,i)=>{const b=makeBall(0,i%2===0);b.life=i*.01;return b;});},
      exportData(){return JSON.parse(JSON.stringify({state:snapshot(),events,config:CFG}));},
      setAimAngle(value){aim=clamp(value,-1.08,1.08);},

      clearWave(){
        bricks.forEach(b=>{b.alive=false;});boss=null;updateUI();
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
      reset,begin,jumpToBoss10,jumpToFinalBoss,addRow,bossSpawn,summonBossBricks,generateSurvival,addExperience,offerChoice,chooseUpgrade,
      createWavePlan,spawnWave,planClearBurst,
      spawnClearBurst,
      queueFinaleStage,updateFinaleStages,finaleHpFloor,
      finaleDetails(){return {stage:finaleStage,spawns:[...finaleWaveSpawns],checkpoints:[...finaleDamageCheckpoints],pending:summonSignals.filter(x=>x.finale).length};},
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
      isSoundRunning(){return sound?.getState().contextState==="running";}
    };
  }
  function makeBallTest(mini=false){return makeBall(0,mini);}
  reset();applyLanguage();analytics?.wireConsent();resetFrameClock();scheduleFrame();
  boot.markReady(()=>{
    canvas.width=canvas.width; // Clears the Canvas save stack after an interrupted draw.
    reset();applyLanguage();resetFrameClock();scheduleFrame();
  });
})();
