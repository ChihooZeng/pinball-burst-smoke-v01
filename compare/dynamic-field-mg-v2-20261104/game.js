"use strict";
(() => {
  const Build=window.PinballBuilds, CFG=Build.CONFIG;
  const LAB=window.PinballLabConfig;
  const W = 360, MAX_WAVES = CFG.maxWaves;
  let H = 560, DANGER_Y=455, WAVE_START_Y=84;
  let pausedFrom=null, focusBeforePause=null, battleTime=0, waveMetrics=null, waveReports=[], bankDamage=0;
  let gunTarget=null,gunStreak=0,gunLast=-99;
  let focusTargetId=null,focusStacks=0,focusLastAt=-99;
  let stormSweeps=0,childLocks=0,relayForks=0,focusBursts=0,needleShots=0,needlePasses=0,fanExtraShots=0;
  let precisionTurns=0,focusDamage=0,gunBonusDamage=0,weakpointDamage=0,weakpointCharge=0,damageDealt=0,shotsWithContact=0;
  let waveFallMultiplier=1;
  // Isolated comparison mode: skip the initial five clear rewards with a
  // legitimate five-choice build; do not save a result as a normal full run.
  let quickLabActive=false,quickLabRoute=null;
  let waveStartGap=Infinity,closestDangerGap=Infinity,nearDangerSeconds=0,pressureWarningStage=0,currentStatus="";
  const FIRST_SKILL_KEY='pinball-overload-first-skill-v1',SIDE_KEY='pinball-overload-skill-side-v1';
  let firstSkillUsed=false,skillSide='right';
  try{firstSkillUsed=localStorage.getItem(FIRST_SKILL_KEY)==='done';skillSide=localStorage.getItem(SIDE_KEY)==='left'?'left':'right';}catch(e){}
  function store(key,value){try{localStorage.setItem(key,value);}catch(e){}}
  function applySkillSide(){document.querySelector('.shell').classList.toggle('skill-left',skillSide==='left');}
  function markSkillUsed(){if(firstSkillUsed)return;firstSkillUsed=true;store(FIRST_SKILL_KEY,'done');document.getElementById('skillGuide').classList.add('hidden');}
  let build,events=[],counters,arcCharge=0,lastArcRelease=-99,fanClock=0,gunFlash=0,lastShotAngle=0;
  let collisionChecks=0,physicsCostMs=0,physicsSteps=0,maxPhysicsMs=0;
  const initialSeed=Number.isFinite(window.__PINBALL_SEED__)?window.__PINBALL_SEED__>>>0:null;
  function record(type,data={}){events.push({type,time:+elapsed.toFixed(4),wave,...data});if(events.length>6000)events.shift();}
  function syncBuild(){
    splitLevel=Build.effectiveRank(build,"split");arcLevel=Build.effectiveRank(build,"arc");
    rateLevel=build.ranks.rate||0;powerLevel=build.ranks.power||0;speedLevel=build.ranks.speed||0;lifeLevel=build.ranks.life||0;
    ricochetLevel=build.ranks.bank||0;hunterLevel=build.ranks.hunter||0;drillLevel=build.ranks.drill||0;shockLevel=build.ranks.shock||0;
  }
  function selectSeed(id){
    if(phase!=="seeding"||!Build.seed(build,id))return false;
    syncBuild();phase="playing";choiceSet=[];ui.choice.classList.add("hidden");shootClock=Build.tuning(build).interval-CFG.firstShot;
    record("seed",{id});setState("第1波 · "+Build.DEFS[id].name);updateUI();return true;
  }
  function showCards(seed=false){
    $("choiceTitle").textContent=!build.seedAbility?"选一个新技能":"选择一次强化";
    $("choiceWave").textContent=!build.seedAbility?"第1波完成 · 第一次升级":"WAVE "+wave+" CLEAR · LV."+level;
    for(let i=0;i<3;i++){
      const visible=i<choiceSet.length;const button=$("choice"+i);
      button.classList.toggle("hidden",!visible);
      if(!visible)continue;
      const card=Build.card(build,choiceSet[i]);
      $("choiceTitle"+i).textContent=card.title;$("choiceDesc"+i).textContent=card.description;
    }
    ui.choice.classList.remove("hidden");
  }
  function finishPrototype(){phase="complete";balls=[];giant=null;ui.win.classList.remove("hidden");$("winTitle").textContent="20波试玩 · 挑战完成";ui.final.textContent="构筑："+Build.DEFS[build.coreBranch||build.seedAbility].name+" · 用时 "+Math.round(elapsed)+" 秒 · 击碎 "+score+" 块。请反馈手感，后续内容等待验收。";record("complete");setState("Demo V1.0 · 20关挑战完成");updateUI();}

  const BOSS_INTERVAL=110, SURGE_INTERVAL=75, FALL_BASE=6.8, MAX_BRICKS=168;
  const START_ROWS=6, SPAWN_INTERVAL=3.5, PHYSICS_DT=1/120, MAX_FRAME_STEPS=6;
  const AMBIENT_SUMMON_INTERVAL=8.4, SUMMON_SAFE_TOP=48;
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
    if(n>10)return lateStageHp(n,r,c);
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
  canvas.width=W;canvas.height=H;
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
  let waveElapsed=0,clearWindowActive=false,bossSummonTotal=0,waveTailSoftened=false,waveSpawnCount=0,waveStartingTargets=0,waveUpgrades=0;
  let finaleStage=0,finaleWaveSpawns=[0,0,0,0],finaleDamageCheckpoints=[];
  let phase, charge, hunterLevel, ricochetLevel, splitLevel, shockLevel, drillLevel, arcLevel, shootClock, elapsed;
  let skillsUsed, ricochetTriggers, lastFrame, soundContext, masterGain, soundLimiter, soundVolume=.78;
  let accumulator=0,uiClock=0,metricsClock=0,frameSamples=0,fpsNow=0,slowFrames=0,renderQuality="full",drawMs=0;
  let sfxLast=Object.create(null), bonusVolleyBalls=0, homingTurns=0, shockWaves=0, directBreaks=0;
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
  let impactRings=[], floatTexts=[], combo=0, maxCombo=0, lastBreak=-99, comboVisibility=0, shake=0, hitCount=0;
  let impactHaptics=true,lastHapticAt=-10000;
  // ===== 动态砖阵 + 双机枪实验 V2 状态 =====
  let labActive=false,labMode="S1",labField="A",labCleared=false,labFailed=false,labGiantEnabled=true;
  let labPickMode="S1",labPickField="A";
  let labSide=0,labMerge=0,labOverload=0,labBarrage=0,labBarrageUntil=0,labBarrageCooldown=0,labOverloadLock=0;
  let labElectrodes=[],labMicros=[],labPulses=[],labElectrodeClock=0,labElectricCooldown=Object.create(null);
  let labTopRemaining=0,labMidRemaining=0,labTopClock=0,labMidClock=0,labSummonClock=0;
  let labWarnings=[],labSummonerId=null,labSummonerKills=0,labMidBatches=0;
  let labStartAt=0,labClearAt=null,labFailAt=null,labTotalExpected=0,labSpawnMinGap=Infinity;
  let labStartTargets=0,labLastFireSide=0,labMuzzleFlash=0;
  let labDamageLog=[],labStats=null;
  function labBlankStats(){return {bloomSpawns:0,bloomChildren:0,bloomRecursiveBlocked:0,mergeCharges:0,mergeHits:0,mergeShards:0,electrodePlaced:0,electricPulses:0,electricHits:0,electricDamage:0,overloadPulses:0,overloadHits:0,overloadDamage:0,coreCharges:0,corePulses:0,coreHits:0,coreDamage:0,dualShots:0,dualLeft:0,dualRight:0,barrageWindows:0,barrageShots:0,crossShots:0,microPlaced:0,maxBalls:0,maxBloomActive:0,maxElectrodes:0,maxMicros:0,primaryHits:0,derivedHits:0,areaHits:0,damageEvents:0,triggersBlocked:0,chargeContacts:0,topSpawned:0,midSpawned:0,warningsShown:0,summonerKilled:0,mgShots:0,mgBalls:0,volleys:0,capRecycles:0,mgHits:0,clearTime:null,failTime:null,topTotal:0,midTotal:0,spawnMinGap:null,warningMinGap:null};}
  labStats=labBlankStats();

  const juice=window.PinballJuice.create({W,H,reducedMotion});
  const impactMode=$("impactMode");
  impactMode.value=reducedMotion?"off":"snap";
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
    if(kind==="hit"||reducedMotion||!impactHaptics||!navigator.vibrate)return false;
    if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return false;
    const t=performance.now();
    if(t-lastHapticAt<180)return false;
    lastHapticAt=t;
    try{return !!navigator.vibrate(kind==="heavy"?20:12);}catch(_){return false;}
  }
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
  // Short attack transient: a crisp tick plus a mid-low body. Reuse one
  // 22ms noise buffer instead of allocating fresh samples for every hit.
  let impactNoiseBuffer=null;
  function impactTransient(){
    if(!soundContext||impactMode.value!=="snap"||!soundContext.createBuffer)return;
    try{
      if(!impactNoiseBuffer){
        const count=Math.max(96,Math.round(soundContext.sampleRate*.022));
        impactNoiseBuffer=soundContext.createBuffer(1,count,soundContext.sampleRate);
        const data=impactNoiseBuffer.getChannelData(0);
        let seed=18691;
        for(let i=0;i<count;i++){
          seed=(Math.imul(seed,1664525)+1013904223)>>>0;
          data[i]=(seed/2147483648-1)*Math.pow(1-i/count,2);
        }
      }
      const t=soundContext.currentTime,src=soundContext.createBufferSource(),gain=soundContext.createGain();
      src.buffer=impactNoiseBuffer;
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.linearRampToValueAtTime(.055,t+.002);
      gain.gain.exponentialRampToValueAtTime(.0001,t+.024);
      src.connect(gain);gain.connect(masterGain);src.start(t);src.stop(t+.025);
    }catch(_){}
  }
  function playSfx(kind){
    if(!soundContext||soundVolume<=0)return;
    const now=soundContext.currentTime;
    if(now-(sfxLast[kind]??-999)<(kind==="armor"?.095:kind==="break"?.075:.12))return;
    if(kind==="armor"&&now-(sfxLast.break??-999)<.075)return;
    sfxLast[kind]=now;
    if(kind==="armor"){if(impactMode.value==="snap"){impactTransient();beep(390,.04,.027,"triangle");beep(190,.053,.019,"sine");}else{beep(740,.048,.027,"triangle");if(impactMode.value==="punchy")beep(260,.036,.014,"sine");}}
    else if(kind==="break"){beep(580+Math.min(combo,10)*22,.065,.031,"triangle");beep(1160,.028,.018,"sine");if(impactMode.value==="snap"){impactTransient();beep(260,.052,.026,"triangle");}else if(impactMode.value==="punchy")beep(240,.045,.018,"triangle");if(combo>=5&&combo%5===0)beep(370,.085,.025,"triangle");}
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

  function setState(label) { currentStatus=label; ui.state.textContent=label; }
  function dangerGap(){
    let gap=Infinity;
    for(const brick of bricks||[])if(brick.alive)gap=Math.min(gap,DANGER_Y-brick.y-brick.h);
    return gap;
  }
  function updateUI(){
    const clock=Math.floor(elapsed),mm=String(Math.floor(clock/60)).padStart(2,"0"),ss=String(clock%60).padStart(2,"0");
    ui.wave.textContent=mm+":"+ss;$("waveLabel").textContent="第"+wave+" / "+MAX_WAVES+"波"+(quickLabActive?" · "+Build.DEFS[quickLabRoute].name+"速测":"");ui.score.textContent=String(score);
    ui.rate.textContent="LV."+level;ui.balls.textContent=String(livingCount());
    ui.charge.textContent=Math.floor(charge)+"%";ui.fill.style.width=charge+"%";
    const cleared=Math.max(0,waveStartingTargets-livingCount());
    $("xpLabel").textContent=bossVictory?"第"+wave+"波 · BOSS击破 · 连环终结":boss&&boss.alive?"第"+wave+"波 · 击败Boss即可胜利":("第"+wave+"波 · 已清理 "+cleared+"/"+waveStartingTargets+" · 清屏升级");
    $("xpFill").style.width=(waveStartingTargets?Math.min(100,cleared/waveStartingTargets*100):0)+"%";
    $("pause").disabled=false;
    $("buffStatus").textContent=build.temporaryBuffs.map(b=>Build.BUFFS[b.id].name+" "+Math.ceil(b.remaining)+"s").join(" · ");
    const ready=phase==="playing"&&!emptyLatch&&(!!build.seedAbility||(labActive&&labGiantEnabled))&&charge>=MAX_CHARGE&&!giant;
    ui.giant.parentElement.classList.toggle("hidden",!build.seedAbility&&!(labActive&&labGiantEnabled));
    ui.giant.disabled=true;ui.giant.textContent=giant?"巨型球 · "+Math.ceil(GIANT_LIFETIME-giant.life)+"s":ready?"巨型球 · 自动释放": "巨型球 · 自动 "+Math.floor(charge)+"%";
    const showGuide=false;$("skillGuide").classList.toggle("hidden",!showGuide);ui.giant.classList.toggle("guide-pulse",showGuide);
    $("giantLife").classList.toggle("hidden",!giant);
    $("giantTimeText").textContent=giant?Math.max(0,GIANT_LIFETIME-giant.life).toFixed(1)+"s":"0.0s";
    $("giantTimeFill").style.width=giant?Math.max(0,(GIANT_LIFETIME-giant.life)/GIANT_LIFETIME*100)+"%":"0%";
    $("loadoutLabel").textContent=build.coreBranch?Build.DEFS[build.coreBranch].name:build.seedAbility?"尚未定主核心":"普通炮台";
    const parts=[speedLevel?"球速+"+speedLevel:null,lifeLevel?"续航+"+lifeLevel:null,powerLevel?"火力+"+powerLevel:null,volleyLevel?"散射+"+volleyLevel:null,splitLevel?"裂变+"+splitLevel:null,arcLevel?"电弧+"+arcLevel:null,shockLevel?"震荡+"+shockLevel:null,drillLevel?"钻头+"+drillLevel:null,hunterLevel?"追猎+"+hunterLevel:null,ricochetLevel?"蓄能+"+ricochetLevel:null,rateLevel?"射速+"+rateLevel:null].filter(Boolean);
    ui.build.textContent=parts.length?parts.join(" · ")+(build.ranks.gun?" · 供弹R"+build.ranks.gun:""):build.ranks.gun?"高速供弹 R"+build.ranks.gun:"清屏成长 · 20波候选";
    $("bossHud").classList.toggle("hidden",!boss||!boss.alive);
    if(boss&&boss.alive){const guarded=boss.isFinalBoss&&boss.hp<=finaleHpFloor();$("bossText").textContent=(isFinaleWave(wave)?"终局 "+finaleStage+"/3"+(guarded?" · 阶段护盾":"")+" · ":"")+boss.hp+" / "+boss.initialHp;$("bossFill").style.width=Math.max(0,boss.hp/boss.initialHp*100)+"%";}
    // Functional survival warning only: no extra particles, camera shake, or damage changes.
    const gap=dangerGap();
    const dangerVisible=phase==="playing"&&!emptyLatch&&!bossVictory&&gap<=60;
    ui.state.textContent=dangerVisible?(gap<=24?"警戒线危险 · 砖块即将触线":"注意！砖块正在逼近警戒线"):currentStatus;
    if(labActive)labUpdateUI();
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
    if(labActive&&labWarnings.some(w=>rectanglesOverlap(rect,w)))return false;
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
  function spawnWave(n,plan=null){
    wave=n;waveElapsed=0;waveTailSoftened=false;boss=null;bossVictory=null;lightningChains=[];lightningArcs=[];
    waveMetrics={breaks:0,lastBreak:0,longestNoBreak:0,tailSeconds:0,bossSoloSeconds:0,shots:shotsFired||0,children:counters.splitChildren,reclaims:counters.budgetReclaims,suppressed:counters.suppressedShots,suppressedChildren:counters.suppressedChildren};
    summonSignals=[];ambientSignals=[];bossSummonClock=0;bossSummonTotal=0;bossSupportXP=0;
    finaleStage=isFinaleWave(n)?1:0;finaleWaveSpawns=[0,0,0,0];finaleDamageCheckpoints=[];
    const tiles=plan||createWavePlan(n);bricks=[];
    for(const tile of tiles)bricks.push(brickAt(tile.x,tile.y,tile.hp,
      {...tile,special:tile.special,summonAge:0,summonSource:"wave"}));
    if(isBossWave(n))bossSpawn();
    // Compensate for added 5px vertical pitch so the same phone does not
    // suddenly lose ~40px of its original warning time.
    const bottom=Math.max(...bricks.map(b=>b.y+b.h));
    const gap=Math.max(0,DANGER_Y-bottom);
    const extraHeight=(n===1?4:n===5?6:n===10||n===20?7:8)*(WAVE_ROW_GAP-28);
    const virtualOldGap=gap+extraHeight;
    const oldReferenceGap=455-(84+8*28+BRICK_H);
    const oldHeightFactor=Math.max(1,Math.min(3.2,1+Math.max(0,virtualOldGap/oldReferenceGap-1)*.70));
    waveFallMultiplier=n===1?1:oldHeightFactor*Math.max(.58,gap/Math.max(1,virtualOldGap));
    record("wave_pressure",{wave:n,fallMultiplier:+waveFallMultiplier.toFixed(3),gap:+gap.toFixed(1)});
    waveStartingTargets=livingCount();
    waveStartGap=dangerGap();closestDangerGap=waveStartGap;
    nearDangerSeconds=0;pressureWarningStage=0;
    clearPreview=[];clearPreviewShown=false;clearWindowActive=false;
    waveSpawnCount++;clearBurstCount=Math.max(0,n-1);clearBurstTiles=tiles.length;
    setState(isFinaleWave(wave)?"最终关 · 888HP三阶段Boss · 击败即可胜利":"第 "+wave+" 波 · "+(boss?"击败BOSS即胜":"整波破坏")+" · 清屏后进入下一波");
    updateUI();
    return tiles.length;
  }
  function generateWave(){
    bricks=[];serial=0;rowIndex=0;wave=1;
    spawnWave(1);
  }
  // =====================================================================
  // 动态砖阵 + 双机枪实验 V2（仅实验页；不改变冻结版 / 正式 demo/v1 / V1 实验）
  // 所有触发、预算与数值来自 lab-config.js，便于下一轮调整。
  // =====================================================================
  function labModeDef(){return LAB&&LAB.modes?LAB.modes[labMode]:null;}
  function labHas(part){const def=labModeDef();return !!(labActive&&def&&def.parts.includes(part));}
  function labBarrageActive(){return labActive&&elapsed<labBarrageUntil;}
  function labAddLog(source,before,after,extra){labDamageLog.push({source,before,after,delta:Math.max(0,before-after),t:+elapsed.toFixed(3),...extra});if(labDamageLog.length>400)labDamageLog.shift();}
  function labElectrodePos(e){const b=bricks.find(b=>b.id===e.brickId&&b.alive);return b?{x:b.x+b.w/2,y:b.y+b.h/2}:{x:e.x,y:e.y};}
  function labDistanceToSegment(px,py,x1,y1,x2,y2){
    const dx=x2-x1,dy=y2-y1,len=dx*dx+dy*dy;
    let t=len?((px-x1)*dx+(py-y1)*dy)/len:0;t=clamp(t,0,1);
    return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
  }
  function labPruneElectrodes(){
    const keep=e=>{
      if(elapsed>=e.until)return false;
      if(e.anchored){return bricks.some(b=>b.id===e.brickId&&b.alive);}
      return true;
    };
    labElectrodes=labElectrodes.filter(keep);labMicros=labMicros.filter(keep);
  }
  function labPlaceElectrode(block,micro=false,destroyed=false){
    if(!block)return false;
    const list=micro?labMicros:labElectrodes;
    const max=micro?LAB.electrode.microMax:LAB.electrode.max;
    const life=micro?LAB.electrode.microLife:LAB.electrode.life;
    const x=block.x+block.w/2,y=block.y+block.h/2;
    const existing=list.find(e=>e.brickId===block.id);
    const until=elapsed+(destroyed?Math.min(life,.9):life);
    if(existing){existing.until=until;existing.anchored=!destroyed;existing.x=x;existing.y=y;return true;}
    list.push({brickId:block.id,x,y,until,anchored:!destroyed,micro});
    while(list.length>max)list.shift();
    labStats.electrodePlaced++;if(micro)labStats.microPlaced++;
    labStats.maxElectrodes=Math.max(labStats.maxElectrodes,labElectrodes.length);
    labStats.maxMicros=Math.max(labStats.maxMicros,labMicros.length);
    return true;
  }
  function labTriggerPulse(x,y,radius,damage,kind){
    const targets=[];
    for(const b of bricks)if(b.alive&&Math.hypot(b.x+b.w/2-x,b.y+b.h/2-y)<=radius)targets.push(b);
    targets.sort((a,b)=>Math.hypot(a.x+a.w/2-x,a.y+a.h/2-y)-Math.hypot(b.x+b.w/2-x,b.y+b.h/2-y));
    for(const b of targets){
      const before=b.hp;
      hitBrick(b,"labArea",null,damage);
      const taken=Math.max(0,before-b.hp);
      labAddLog(kind==="core"?"core":"overload",before,b.hp);
      labStats.areaHits++;labStats.damageEvents++;
      if(kind==="core"){labStats.coreHits++;labStats.coreDamage+=taken;}
      else{labStats.overloadHits++;labStats.overloadDamage+=taken;}
    }
    labPulses.push({x,y,radius,age:0,duration:.34,kind});
    burst(x,y,kind==="core"?"#ffd58a":"#9fe6ff",kind==="core"?18:12);
    playSfx("shock");
    record("lab_pulse",{kind,targets:targets.length,radius});
    return targets.length;
  }
  function labElectricPulse(){
    const all=labElectrodes.concat(labMicros);
    if(all.length<2)return 0;
    let hits=0;const used=new Set();
    for(let i=0;i<all.length&&hits<LAB.electrode.maxTargetsPerPulse;i++){
      for(let j=i+1;j<all.length&&hits<LAB.electrode.maxTargetsPerPulse;j++){
        const a=labElectrodePos(all[i]),b=labElectrodePos(all[j]);
        if(Math.hypot(a.x-b.x,a.y-b.y)>LAB.electrode.connectRange)continue;
        labPulses.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,age:0,duration:.20,kind:"electric"});
        for(const brick of bricks){
          if(hits>=LAB.electrode.maxTargetsPerPulse)break;
          if(!brick.alive||used.has(brick.id))continue;
          const cx=brick.x+brick.w/2,cy=brick.y+brick.h/2;
          if(labDistanceToSegment(cx,cy,a.x,a.y,b.x,b.y)>LAB.electrode.hitRadius)continue;
          const last=labElectricCooldown[brick.id]??-99;
          if(elapsed-last<LAB.electrode.brickCooldown)continue;
          labElectricCooldown[brick.id]=elapsed;used.add(brick.id);
          const before=brick.hp;
          hitBrick(brick,"labElectric",null,LAB.electrode.damage);
          const taken=Math.max(0,before-brick.hp);
          labAddLog("electric",before,brick.hp);
          labStats.electricHits++;labStats.electricDamage+=taken;labStats.damageEvents++;
          hits++;
        }
      }
    }
    if(hits)labStats.electricPulses++;
    return hits;
  }
  function labSpawnBloom(block,ball){
    if(!labHas("S1"))return 0;
    const active=balls.filter(b=>b.labSource==="bloom").length;
    if(active>=LAB.bloom.maxActive){labStats.triggersBlocked++;return 0;}
    const base=Math.atan2(ball.vy,ball.vx);
    const speed=Math.hypot(ball.vx,ball.vy)*LAB.bloom.speedScale||CFG.speed;
    let made=0;
    for(let i=0;i<LAB.bloom.count;i++){
      if(balls.length>=MAX_BALLS||active+made>=LAB.bloom.maxActive){labStats.triggersBlocked++;break;}
      const angle=base+(LAB.bloom.count<=1?0:((i/(LAB.bloom.count-1))*2-1)*LAB.bloom.spread);
      const child=makeBall(angle,true);
      child.x=block.x+block.w/2;child.y=block.y+block.h/2;
      child.vx=Math.cos(angle)*speed;child.vy=Math.sin(angle)*speed;
      child.maxLife=LAB.bloom.life;child.life=0;child.labSource="bloom";child.damage=LAB.bloom.damage;
      child.huntsLeft=0;child.pursuitLeft=0;child.guideAt=Infinity;child.microApplied=false;
      balls.push(child);made++;
    }
    if(made){labStats.bloomSpawns++;labStats.bloomChildren+=made;}
    labStats.maxBloomActive=Math.max(labStats.maxBloomActive,balls.filter(b=>b.labSource==="bloom").length);
    labStats.maxBalls=Math.max(labStats.maxBalls,balls.length);
    return made;
  }
  function labSpawnMergeShards(ball){
    if(ball.mergeBurst)return 0;
    ball.mergeBurst=true;
    const base=Math.atan2(ball.vy,ball.vx);
    const speed=Math.hypot(ball.vx,ball.vy)||CFG.speed;
    let made=0;
    for(let i=0;i<LAB.merge.shards;i++){
      if(balls.length>=MAX_BALLS){labStats.triggersBlocked++;break;}
      const angle=base+(LAB.merge.shards<=1?0:((i/(LAB.merge.shards-1))*2-1)*LAB.merge.shardSpread);
      const child=makeBall(angle,true);
      child.x=ball.x;child.y=ball.y;
      child.vx=Math.cos(angle)*speed;child.vy=Math.sin(angle)*speed;
      child.maxLife=LAB.merge.shardLife;child.life=0;child.labSource="mergeShard";child.damage=1;
      child.huntsLeft=0;child.pursuitLeft=0;child.guideAt=Infinity;
      balls.push(child);made++;
    }
    labStats.mergeShards+=made;labStats.maxBalls=Math.max(labStats.maxBalls,balls.length);
    return made;
  }
  function labOnDirectHit(block,ball,destroyed,incoming,hpBefore,damage){
    if(!labActive)return;
    const source=ball.labCharge?"merge":(ball.labSource||"cannon");
    labStats.damageEvents++;
    labAddLog(source,hpBefore,block.hp);
    if(source==="cannon"){
      labStats.primaryHits++;
      if(labHas("S2"))labMerge=Math.min(LAB.merge.threshold,labMerge+1);
      if(labHas("S4")&&elapsed>=labOverloadLock){
        labOverload=Math.min(LAB.overload.threshold,labOverload+1);
        if(labOverload>=LAB.overload.threshold){
          labOverload=0;labOverloadLock=elapsed+LAB.overload.lockout;
          labStats.overloadPulses++;
          labTriggerPulse(block.x+block.w/2,block.y+block.h/2,LAB.overload.radius,LAB.overload.damage,"overload");
        }
      }
      if(labHas("S6")&&!labBarrageActive()&&elapsed>=labBarrageCooldown){
        labBarrage=Math.min(LAB.barrage.threshold,labBarrage+1);
        if(labBarrage>=LAB.barrage.threshold){
          labBarrage=0;labBarrageUntil=elapsed+LAB.barrage.duration;
          labBarrageCooldown=labBarrageUntil+LAB.barrage.cooldown;
          labStats.barrageWindows++;record("lab_barrage_start",{t:+elapsed.toFixed(2)});
        }
      }
      if(labHas("S3"))labPlaceElectrode(block,false,destroyed);
      if(labHas("S1")&&destroyed)labSpawnBloom(block,ball);
    }else if(source==="bloom"){
      labStats.derivedHits++;
      if(labHas("S1"))labStats.bloomRecursiveBlocked++;
      if(labHas("S3")&&!ball.microApplied){
        ball.microApplied=true;
        labPlaceElectrode(block,true,destroyed);
      }
    }else if(source==="merge"){
      labStats.mergeHits++;
      if(ball.labCore&&!ball.coreUsed){
        ball.coreUsed=true;
        labStats.corePulses++;
        labTriggerPulse(block.x+block.w/2,block.y+block.h/2,LAB.overload.coreRadius,LAB.overload.coreDamage,"core");
      }
    }else if(source==="mergeShard"){
      labStats.derivedHits++;
    }else if(source==="mg"){
      labStats.mgHits++;
    }
  }
  function labAimAssist(angle,maxDelta){
    const ox=shooter.x,oy=shooter.y-28;
    let best=null,bestScore=Infinity;
    for(const b of bricks){
      if(!b.alive)continue;
      const cx=b.x+b.w/2,cy=b.y+b.h/2;
      const a=Math.atan2(cx-ox,-(cy-oy));
      const diff=Math.atan2(Math.sin(a-angle),Math.cos(a-angle));
      if(Math.abs(diff)>maxDelta)continue;
      const d=Math.hypot(cx-ox,cy-oy),score=d+Math.abs(diff)*260;
      if(score<bestScore){bestScore=score;best=a;}
    }
    return best===null?angle:best;
  }
  function labFieldDef(){return LAB&&LAB.fields?LAB.fields[labField]:null;}
  function labFireInterval(){
    if(labHas("M1"))return LAB.m1.interval;
    if(labHas("M2"))return LAB.m2.interval;
    return Math.max(.075,LAB.baseInterval||Build.tuning(build).interval);
  }
  function labMakeRoomForMg(){
    if(balls.length<MAX_BALLS)return true;
    const candidates=balls.filter(b=>b.labSource==="mg");
    const pool=candidates.length?candidates:balls;
    const oldest=pool.reduce((a,b)=>b.life>a.life?b:a);
    balls.splice(balls.indexOf(oldest),1);
    labStats.capRecycles++;
    return true;
  }
  function labMgFire(){
    if(phase!=="playing")return false;
    if(!labMakeRoomForMg())return false;
    if(labHas("M1")){
      const shot=makeBall(aim);
      shot.labSource="mg";shot.maxLife=LAB.m1.ttl;shot.life=0;shot.damage=LAB.m1.damage;
      balls.push(shot);shotsFired++;labStats.mgShots++;labStats.mgBalls++;
    }else{
      let made=0;
      for(const offset of [-LAB.m2.spread,0,LAB.m2.spread]){
        if(!labMakeRoomForMg())break;
        const shot=makeBall(aim+offset);
        shot.labSource="mg";shot.maxLife=LAB.m2.ttl;shot.life=0;shot.damage=LAB.m2.damage;
        balls.push(shot);made++;
      }
      shotsFired++;labStats.mgShots++;labStats.volleys++;labStats.mgBalls+=made;
    }
    lastShotAngle=aim;gunFlash=.05;labMuzzleFlash=.06;labLastFireSide=0;
    labStats.maxBalls=Math.max(labStats.maxBalls,balls.length);
    record("lab_mg_fire",{mode:labMode,balls:balls.length});
    beep(245,.035,.009);
    return true;
  }
  function labFire(){
    if(phase!=="playing"||emptyLatch)return false;
    if(labHas("M1")||labHas("M2"))return labMgFire();
    const makeRoom=()=>{
      if(balls.length<MAX_BALLS)return true;
      const candidates=balls.filter(b=>b.labSource==="bloom"||b.mini);
      if(!candidates.length){labStats.triggersBlocked++;return false;}
      const oldest=candidates.reduce((a,b)=>b.life>a.life?b:a);
      balls.splice(balls.indexOf(oldest),1);
      labStats.triggersBlocked++;
      return true;
    };
    if(!makeRoom())return false;
    const shot=makeBall(aim);
    shot.labSource="cannon";
    balls.push(shot);shotsFired++;labStats.mgShots?0:0;
    labStats.maxBalls=Math.max(labStats.maxBalls,balls.length);
    record("lab_shot",{mode:labMode,angle:+aim.toFixed(3)});
    beep(245,.045,.011);
    return true;
  }
  function labFieldTopY(){return WAVE_START_Y+10;}
  function labInitialRows(f){
    const top=labFieldTopY();
    return Math.max(4,Math.min(f.initialRows,Math.floor((DANGER_Y-100-top)/LAB.rowGap)));
  }
  function labTopHp(row,col){
    const v=(row*13+col*7)%11;
    return v===0?4:v<3?3:v<6?2:1;
  }
  function labSpawnField(kind){
    bricks=[];serial=0;rowIndex=0;wave=1;score=0;balls=[];giant=null;particles=[];impactRings=[];floatTexts=[];
    combo=0;maxCombo=0;lastBreak=-99;comboVisibility=0;shake=0;hitCount=0;lightningArcs=[];lightningChains=[];
    summonSignals=[];ambientSignals=[];boss=null;bossVictory=null;emptyLatch=false;choiceQueue=0;choiceSet=[];
    screenClears=0;level=1;waveElapsed=0;charge=0;
    labMerge=0;labOverload=0;labBarrage=0;labBarrageUntil=0;labBarrageCooldown=0;labOverloadLock=0;
    labElectrodes=[];labMicros=[];labPulses=[];labElectrodeClock=0;labElectricCooldown=Object.create(null);
    labWarnings=[];labSummonerId=null;labMidBatches=0;labSummonClock=0;labTopClock=0;labMidClock=0;
    labTopRemaining=0;labMidRemaining=0;labStartAt=elapsed;labClearAt=null;labFailAt=null;labSpawnMinGap=Infinity;
    labLastFireSide=0;labMuzzleFlash=0;
    const f=LAB.fields[kind];if(!f)return false;
    labField=kind;
    const top=labFieldTopY(),rows=labInitialRows(f);
    let initial=0;
    for(let row=0;row<rows;row++)for(let col=0;col<LAB.topColumnCount;col++){
      const x=12+col*BRICK_STEP_X,y=top+row*LAB.rowGap;
      if(y+BRICK_H>DANGER_Y-95)continue;
      bricks.push(brickAt(x,y,labTopHp(row,col),{special:false,lab:true,summonAge:0,summonSource:"initial"}));
      initial++;
    }
    if(f.summoner){
      const sm=f.summoner;
      const sy=Math.min(DANGER_Y-120-sm.h,top+Math.max(150,Math.round((DANGER_Y-top)*.40)));
      const sx=Math.round(W/2-sm.w/2);
      const b=brickAt(sx,sy,sm.hp,{w:sm.w,h:sm.h,special:false,lab:true,isSummoner:true,color:"#b477ff"});
      bricks.push(b);labSummonerId=b.id;
    }
    labTopRemaining=Math.max(0,f.topBudget-initial);
    labMidRemaining=f.mid?f.mid.budget:f.summoner?f.summoner.budget:0;
    labTotalExpected=initial+labTopRemaining+labMidRemaining+(labSummonerId?1:0);
    labStartTargets=livingCount();labStats.topTotal=labTopRemaining;labStats.midTotal=labMidRemaining;
    waveStartingTargets=labTotalExpected;waveStartGap=dangerGap();closestDangerGap=waveStartGap;nearDangerSeconds=0;pressureWarningStage=0;
    labStats.maxBalls=Math.max(labStats.maxBalls,balls.length);
    return true;
  }
  function labAddTopRow(){
    if(labTopRemaining<=0)return 0;
    const y=Math.max(SUMMON_SAFE_TOP,WAVE_START_Y-30);
    let made=0;
    for(let col=0;col<LAB.topColumnCount;col++){
      if(labTopRemaining<=0)break;
      const x=12+col*BRICK_STEP_X;
      if(!isSlotFree(x,y))continue;
      bricks.push(brickAt(x,y,labTopHp(0,col+labMidBatches),{special:false,lab:true,summonAge:0,summonSource:"top"}));
      labTopRemaining--;labStats.topSpawned++;made++;
    }
    if(made)record("lab_top_spawn",{count:made,remaining:labTopRemaining});
    return made;
  }
  function labQueueWarning(x,y,hp,source,summonerId=null){
    if(!isSlotFree(x,y))return false;
    const warn=source==="summon"?LAB.fields.C.summoner.warn:LAB.fields.B.mid.warn;
    labWarnings.push({x,y,w:BRICK_W,h:BRICK_H,hp,source,summonerId,until:elapsed+warn,age:0});
    labStats.warningsShown++;
    const wgap=DANGER_Y-(y+BRICK_H);
    labStats.warningMinGap=labStats.warningMinGap===null?+wgap.toFixed(1):Math.min(labStats.warningMinGap,+wgap.toFixed(1));
    return true;
  }
  function labQueueMidBatch(){
    const f=LAB.fields.B.mid;if(!f||labMidRemaining<=0)return 0;
    const top=WAVE_START_Y+Math.max(160,Math.round((DANGER_Y-WAVE_START_Y)*.34));
    const bottom=DANGER_Y-LAB.mid.minDangerGap-BRICK_H;
    if(bottom<=top)return 0;
    let made=0;
    for(let i=0;i<f.batch&&labMidRemaining>0;i++){
      for(let attempt=0;attempt<36;attempt++){
        const col=(labMidBatches*5+i*3+attempt*7)%LAB.topColumnCount;
        const x=12+col*BRICK_STEP_X;
        const span=Math.max(1,Math.floor((bottom-top)/LAB.rowGap));
        const y=top+((labMidBatches*2+i*3+attempt)%span)*LAB.rowGap;
        if(labQueueWarning(x,y,labTopHp(labMidBatches+i,attempt+col),"reinforce")){
          made++;labMidRemaining--;break;
        }
      }
    }
    if(made){labMidBatches++;record("lab_mid_warning",{count:made,remaining:labMidRemaining});}
    return made;
  }
  function labQueueSummonBatch(){
    const sm=LAB.fields.C.summoner;if(!sm||labMidRemaining<=0||!labSummonerId)return 0;
    const s=bricks.find(b=>b.id===labSummonerId&&b.alive);
    if(!s)return 0;
    let made=0;
    for(let i=0;i<sm.batch&&labMidRemaining>0;i++){
      for(let attempt=0;attempt<18;attempt++){
        const a=(labMidBatches*1.7+i*2.3+attempt*.71),r=sm.radius*(.55+.45*((attempt%3)/2));
        const x=clamp(Math.round(s.x+s.w/2+Math.cos(a)*r-BRICK_W/2),8,W-BRICK_W-8);
        const y=clamp(Math.round(s.y+s.h/2+Math.sin(a)*r-BRICK_H/2),WAVE_START_Y+120,DANGER_Y-LAB.mid.minDangerGap-BRICK_H);
        if(labQueueWarning(x,y,labTopHp(labMidBatches+i,attempt),"summon",s.id)){
          made++;labMidRemaining--;break;
        }
      }
    }
    if(made){labMidBatches++;record("lab_summon_warning",{count:made,remaining:labMidRemaining});}
    return made;
  }
  function labSpawnWarningBrick(w){
    if(!isSlotFree(w.x,w.y))return false;
    const b=brickAt(w.x,w.y,w.hp,{special:false,lab:true,summonAge:0,summonSource:w.source});
    bricks.push(b);labStats.midSpawned++;
    const gap=DANGER_Y-(w.y+b.h);
    labSpawnMinGap=Math.min(labSpawnMinGap,gap);labStats.spawnMinGap=+labSpawnMinGap.toFixed(1);
    burst(b.x+b.w/2,b.y+b.h/2,w.source==="summon"?"#c79bff":"#8bd9ff",5);
    return true;
  }
  function labUpdateWarnings(dt){
    for(let i=labWarnings.length-1;i>=0;i--){
      const w=labWarnings[i];w.age+=dt;
      if(elapsed<w.until)continue;
      labWarnings.splice(i,1);
      labSpawnWarningBrick(w);
    }
  }
  function labMechanicText(mode){
    return {
      S1:"主炮击碎砖块时喷出短寿命子球；子球不再开花。",
      C1:"S1+S3：开花子球首次真实命中可布置有限微电极，与普通电极连线放电；微电极不再开花。",
      M1:"0.08 秒/发持续自动直线射击；真实弹球碰撞与 1 点伤害；为隔离射速验证关闭巨型球。",
      M2:"0.15 秒/轮，每轮左中右三球；三方向独立碰撞与 1 点伤害；为隔离射速验证关闭巨型球。"
    }[mode]||"";
  }
  function labResetState(){
    labActive=false;labMode="S1";labField="A";labCleared=false;labFailed=false;labGiantEnabled=true;
    labPickMode="S1";labPickField="A";
    labSide=0;labMerge=0;labOverload=0;labBarrage=0;labBarrageUntil=0;labBarrageCooldown=0;labOverloadLock=0;
    labElectrodes=[];labMicros=[];labPulses=[];labElectrodeClock=0;labElectricCooldown=Object.create(null);
    labTopRemaining=0;labMidRemaining=0;labTopClock=0;labMidClock=0;labSummonClock=0;labWarnings=[];labSummonerId=null;labMidBatches=0;
    labStartAt=0;labClearAt=null;labFailAt=null;labTotalExpected=0;labSpawnMinGap=Infinity;labStartTargets=0;labLastFireSide=0;labMuzzleFlash=0;
    labDamageLog=[];labStats=labBlankStats();
    $("labResult")?.classList.add("hidden");
  }
  function labStart(mode,field){
    if(!LAB||!LAB.modes[mode]||!LAB.fields[field])return false;
    reset();
    labActive=true;labMode=mode;labField=field;labCleared=false;labFailed=false;
    labGiantEnabled=LAB.modes[mode].giant!==false;
    labPickMode=mode;labPickField=field;
    labStats=labBlankStats();labDamageLog=[];
    build=Build.createState(LAB.seed);syncBuild();
    $("startOverlay").classList.add("hidden");ui.choice.classList.add("hidden");ui.win.classList.add("hidden");
    $("labResult")?.classList.add("hidden");$("pauseOverlay").classList.add("hidden");
    unlockSound();labSpawnField(field);
    phase="playing";shootClock=Math.min(labFireInterval(),LAB.firstShotDelay);
    record("lab_start",{mode,field,version:LAB.version,giant:labGiantEnabled});
    setState("实验 · "+LAB.modes[mode].label+" · "+LAB.fields[field].label);
    updateUI();return true;
  }
  function labRestart(){
    if(!labMode||!labField)return labStart("S1","A");
    return labStart(labMode,labField);
  }
  function labReturnToMenu(){labActive=false;reset();labRefreshPicker();$("labResult")?.classList.add("hidden");return true;}
  function labClear(){
    if(labCleared||labFailed)return false;
    labCleared=true;phase="complete";balls=[];giant=null;labClearAt=elapsed;labStats.clearTime=+elapsed.toFixed(2);
    record("lab_clear",{mode:labMode,field:labField,seconds:labStats.clearTime,breaks:score,maxBalls:labStats.maxBalls,mgBalls:labStats.mgBalls});
    labShowResult("场景清空","所有顶部/中部砖块与召唤核心已被真实命中清除。");
    return true;
  }
  function labFail(reason){
    if(labCleared||labFailed)return false;
    labFailed=true;phase="lost";balls=[];giant=null;labFailAt=elapsed;labStats.failTime=+elapsed.toFixed(2);
    record("lab_fail",{mode:labMode,field:labField,reason,seconds:labStats.failTime,breaks:score,maxBalls:labStats.maxBalls});
    labShowResult("警戒线失守",reason);
    return true;
  }
  function labShowResult(title,reason){
    const result=$("labResult");if(!result)return;
    $("labResultTitle").textContent=title;
    $("labResultReason").textContent=reason;
    const s=labStats,rate=elapsed>0?(s.mgShots/elapsed):0;
    $("labResultStats").textContent=
      (LAB.modes[labMode]?.label||labMode)+" · "+(LAB.fields[labField]?.label||labField)+"\n"+
      "时间 "+elapsed.toFixed(1)+"s · 击碎 "+score+" · 峰值球 "+s.maxBalls+"/"+MAX_BALLS+" · FPS "+fpsNow+"\n"+
      "机枪触发 "+s.mgShots+" · 机枪弹 "+s.mgBalls+" · 实测触发率 "+rate.toFixed(2)+"/s · 回收 "+s.capRecycles+"\n"+
      "顶部生成 "+s.topSpawned+" · 中部生成 "+s.midSpawned+" · 预警 "+s.warningsShown+" · 召唤核心击破 "+s.summonerKilled+"\n"+
      "开花 "+s.bloomChildren+" · 电极 "+s.electrodePlaced+" · 电流 "+s.electricHits+" · 最小危险线间距 "+s.spawnMinGap;
    result.classList.remove("hidden");
  }
  function labUpdate(dt){
    if(!labActive||phase!=="playing")return;
    labMuzzleFlash=Math.max(0,labMuzzleFlash-dt);
    labPruneElectrodes();
    labElectrodeClock+=dt;
    let guard=0;
    while(labElectrodeClock>=LAB.electrode.pulseInterval&&guard++<4){
      labElectrodeClock-=LAB.electrode.pulseInterval;labElectricPulse();
    }
    for(const p of labPulses)p.age+=dt;
    labPulses=labPulses.filter(p=>p.age<p.duration);
    if(labSummonerId&&!bricks.some(b=>b.id===labSummonerId&&b.alive)){
      labSummonerId=null;labStats.summonerKilled++;labMidRemaining=0;record("lab_summoner_killed",{t:+elapsed.toFixed(2)});
    }
    labStats.maxBalls=Math.max(labStats.maxBalls,balls.length);
    if(balls.length>MAX_BALLS)balls=balls.slice(0,MAX_BALLS);
  }
  function labGenerate(dt){
    if(phase!=="playing"||labCleared||labFailed)return;
    waveElapsed+=dt;
    const f=labFieldDef();if(!f)return;
    const speed=f.fall*(1+Math.min(.35,elapsed/180));
    for(const b of bricks)if(b.alive)b.y+=speed*dt;
    labTopClock+=dt;
    let topGuard=0;
    while(labTopClock>=f.topInterval&&topGuard++<3){
      labTopClock-=f.topInterval;labAddTopRow();
    }
    if(f.mid){
      labMidClock+=dt;
      let guard=0;
      while(labMidClock>=f.mid.interval&&guard++<2){labMidClock-=f.mid.interval;labQueueMidBatch();}
    }
    if(f.summoner&&labSummonerId){
      labSummonClock+=dt;
      let guard=0;
      while(labSummonClock>=f.summoner.interval&&guard++<2){labSummonClock-=f.summoner.interval;labQueueSummonBatch();}
    }
    labUpdateWarnings(dt);
    for(const b of bricks)if(b.alive&&b.summonAge!==undefined)b.summonAge=Math.min(.7,b.summonAge+dt);
    const danger=bricks.find(b=>b.alive&&b.y+b.h>=DANGER_Y);
    if(danger){labFail("砖块触及警戒线");return;}
    if(livingCount()===0&&labTopRemaining<=0&&labMidRemaining<=0&&labWarnings.length===0)labClear();
  }
  function labUpdateUI(){
    if(!labActive||!LAB)return;
    const mode=LAB.modes[labMode],field=LAB.fields[labField];
    const modeLabel=mode?mode.label:labMode,fieldLabel=field?field.label:labField;
    $("waveLabel").textContent="动态砖阵 · "+(mode?mode.short:labMode);
    $("xpLabel").textContent=fieldLabel+" · "+(labCleared?"已清空":labFailed?"已失败":"剩余 "+livingCount())+" · 顶部 "+labTopRemaining+" · 中部 "+labMidRemaining;
    const done=Math.max(0,labTotalExpected-(livingCount()+labTopRemaining+labMidRemaining+labWarnings.length));
    $("xpFill").style.width=Math.min(100,labTotalExpected?done/labTotalExpected*100:0)+"%";
    $("loadoutLabel").textContent=mode?mode.short:"实验";
    $("buildText").textContent="顶部 "+labTopRemaining+" · 中部 "+labMidRemaining+" · 预警 "+labWarnings.length+" · 机枪 "+(labStats.mgShots/ Math.max(.1,elapsed)).toFixed(1)+"/s";
    $("buffStatus").textContent="顶部生成 "+labStats.topSpawned+" · 中部生成 "+labStats.midSpawned+" · 预警 "+labStats.warningsShown+" · 闸门回收 "+labStats.capRecycles;
    $("labHudMode").textContent=mode?mode.short:labMode;
    $("labHudField").textContent=field?field.short:labField;
    $("labHudBalls").textContent=balls.length+"/"+MAX_BALLS;
    $("labHudFps").textContent="FPS "+fpsNow;
    let meter="伤害 1 · 真实HP";
    if(labHas("M1"))meter="直线 "+(1/LAB.m1.interval).toFixed(1)+"/s · 球 "+balls.length;
    else if(labHas("M2"))meter="扇形 "+(1/LAB.m2.interval).toFixed(1)+"轮/s · "+Math.round(LAB.m2.count/LAB.m2.interval)+"球/s";
    else if(labHas("C1"))meter="电极 "+(labElectrodes.length+labMicros.length)+" · 电流 "+labStats.electricHits;
    else if(labHas("S1"))meter="开花 "+labStats.bloomChildren;
    $("labHudMeter").textContent=meter;
    $("pauseSubtitle").textContent="动态砖阵实验 · "+modeLabel+" · "+fieldLabel+" · "+LAB.version;
    const panel=$("labPauseStats");
    if(panel)panel.textContent=
      "阶段 "+(labCleared?"清空":labFailed?"失败":phase)+" · 用时 "+elapsed.toFixed(1)+"s · 球 "+balls.length+" · 峰值 "+labStats.maxBalls+" · 砖 "+livingCount()+"\n"+
      "机枪触发 "+labStats.mgShots+" · 机枪弹 "+labStats.mgBalls+" · 实测 "+(labStats.mgShots/Math.max(.1,elapsed)).toFixed(2)+"/s · 回收 "+labStats.capRecycles+"\n"+
      "顶部剩余 "+labTopRemaining+" · 中部剩余 "+labMidRemaining+" · 预警 "+labWarnings.length+" · 中部生成 "+labStats.midSpawned+" · 最小危险线间距 "+labStats.spawnMinGap+"\n"+
      "真实伤害事件 "+labStats.damageEvents+"（主炮 "+labStats.primaryHits+" / 机枪命中 "+labStats.mgHits+" / 派生 "+labStats.derivedHits+" / 电流 "+labStats.electricHits+"）";
  }
  function labDraw(ctx){
    if(!labActive)return;
    // 中部预警：虚线框 + 进度条，绝不直接出现在危险线附近。
    for(const w of labWarnings){
      const total=w.source==="summon"?LAB.fields.C.summoner.warn:LAB.fields.B.mid.warn;
      const t=clamp(1-(w.until-elapsed)/total,0,1);
      ctx.save();ctx.globalAlpha=.42+.36*t;ctx.lineWidth=1.8;
      ctx.strokeStyle=w.source==="summon"?"#d7a5ff":"#7fe1ff";ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=qualityLite()?2:10;
      ctx.setLineDash([4,3]);rounded(w.x,w.y,w.w,w.h,4);ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=.75;ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(w.x,w.y+w.h-3,w.w*t,3);
      ctx.restore();
    }
    const all=labElectrodes.concat(labMicros);
    ctx.save();
    for(const e of all){
      const p=labElectrodePos(e),micro=e.micro;
      ctx.globalAlpha=micro?.78:.92;ctx.strokeStyle=micro?"#ffd27a":"#6fe7ff";
      ctx.shadowColor=micro?"#ffb84d":"#5adfff";ctx.shadowBlur=qualityLite()?2:8;
      ctx.lineWidth=micro?1.4:2;
      ctx.beginPath();ctx.arc(p.x,p.y,micro?3.4:4.8,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.28;ctx.fillStyle=micro?"#ffd27a":"#6fe7ff";
      ctx.beginPath();ctx.arc(p.x,p.y,micro?6:8,0,Math.PI*2);ctx.fill();
    }
    ctx.shadowBlur=0;ctx.lineWidth=1.2;ctx.setLineDash([5,4]);ctx.lineDashOffset=-elapsed*42;
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
      const a=labElectrodePos(all[i]),b=labElectrodePos(all[j]);
      if(Math.hypot(a.x-b.x,a.y-b.y)>LAB.electrode.connectRange)continue;
      ctx.globalAlpha=.34+.18*Math.sin(elapsed*9+i+j);ctx.strokeStyle=all[i].micro||all[j].micro?"#ffd27a":"#73e7ff";
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.restore();
    for(const p of labPulses){
      const t=clamp(p.age/p.duration,0,1);
      ctx.save();ctx.globalAlpha=(1-t)*.8;
      if(p.kind==="electric"){
        ctx.strokeStyle="#d9fbff";ctx.lineWidth=2.4*(1-t)+.4;
        ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo(p.x2,p.y2);ctx.stroke();
      }else{
        ctx.strokeStyle=p.kind==="core"?"#ffd58a":"#9fe6ff";ctx.lineWidth=3.2*(1-t)+.6;
        ctx.beginPath();ctx.arc(p.x,p.y,p.radius*(.35+.65*t),0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }
    if(labSummonerId){
      const s=bricks.find(b=>b.id===labSummonerId&&b.alive);
      if(s){ctx.save();ctx.globalAlpha=.35+.2*Math.sin(elapsed*6);ctx.strokeStyle="#d7a5ff";ctx.lineWidth=2;ctx.shadowColor="#b477ff";ctx.shadowBlur=14;ctx.beginPath();ctx.arc(s.x+s.w/2,s.y+s.h/2,28+4*Math.sin(elapsed*6),0,Math.PI*2);ctx.stroke();ctx.restore();}
    }
  }
  function qualityLite(){return renderQuality==="lite";}
  function labSnapshot(){
    return {version:LAB?LAB.version:null,active:labActive,mode:labMode,modeLabel:LAB&&LAB.modes[labMode]?LAB.modes[labMode].label:labMode,
      field:labField,fieldLabel:LAB&&LAB.fields[labField]?LAB.fields[labField].label:labField,
      phase,wave,elapsed:+elapsed.toFixed(3),bricks:livingCount(),balls:balls.length,maxBalls:labStats.maxBalls,
      charge:+charge.toFixed(1),giant:!!giant,giantEnabled:labGiantEnabled,
      topRemaining:labTopRemaining,midRemaining:labMidRemaining,warnings:labWarnings.length,summoner:!!labSummonerId,
      cleared:labCleared,failed:labFailed,clearTime:labStats.clearTime,failTime:labStats.failTime,
      stats:{...labStats},damageLog:labDamageLog.slice(-30),
      startTargets:labStartTargets,totalExpected:labTotalExpected,
      fireRate:elapsed>0?+(labStats.mgShots/elapsed).toFixed(2):0,
      ballRate:elapsed>0?+(labStats.mgBalls/elapsed).toFixed(2):0};
  }
  function reset(){
    H=Math.round(Math.max(560,Math.min(900,360*(window.innerHeight||560)/(window.innerWidth||360))));
    DANGER_Y=H-105;SUMMON_SAFE_BOTTOM=DANGER_Y-88;canvas.height=H;shooter.y=H-37;
    const topbarRect=document.querySelector(".topbar").getBoundingClientRect();
    let safeStartY=window.innerWidth?Math.max(84,Math.ceil((topbarRect.height+28)*W/window.innerWidth)):84;
    // 实验室 HUD 固定在安全区下方；砖阵起点要避开 HUD，避免刘海屏遮挡。
    const hudRect=$("labHud")?$("labHud").getBoundingClientRect():null;
    const arenaRect=canvas.getBoundingClientRect();
    if(hudRect&&arenaRect.width>0&&arenaRect.height>0){
      const scale=Math.min(arenaRect.width/W,arenaRect.height/H)||1;
      safeStartY=Math.max(safeStartY,Math.ceil((hudRect.top+hudRect.height-arenaRect.top)/scale)+14);
    }
    WAVE_START_Y=safeStartY;
    pausedFrom=null;battleTime=0;waveReports=[];bankDamage=0;lockBackground(false);$("pauseOverlay").classList.add("hidden");
    quickLabActive=false;quickLabRoute=null;gunTarget=null;gunStreak=0;gunLast=-99;focusTargetId=null;focusStacks=0;focusLastAt=-99;
    stormSweeps=0;childLocks=0;relayForks=0;focusBursts=0;needleShots=0;needlePasses=0;fanExtraShots=0;precisionTurns=focusDamage=gunBonusDamage=weakpointDamage=weakpointCharge=damageDealt=shotsWithContact=0;build=Build.createState(initialSeed===null?Math.floor(Math.random()*4294967296):initialSeed);events=[];arcCharge=0;lastArcRelease=-99;fanClock=0;gunFlash=0;
    counters={splitChildren:0,arcReleases:0,arcSingleDamage:0,budgetReclaims:0,suppressedShots:0,suppressedChildren:0,maxBallsAlive:0,wallBounces:0,fanWallBounces:0,fanBrickRebounds:0,shotsByBuild:{base:0,split:0,arc:0,gun:0}};
    collisionChecks=0;physicsCostMs=0;physicsSteps=0;maxPhysicsMs=0;
    wave=1;score=0;phase="ready";charge=0;elapsed=0;level=1;xp=0;xpGoal=34;
    $("winTitle").textContent="砖阵触及警戒线";
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
    labResetState();
    generateWave();updateUI();
    if(!labActive){
      $("waveLabel").textContent="动态砖阵实验";$("xpLabel").textContent="选择模式与战场开始";
      $("pauseSubtitle").textContent="动态砖阵实验 · 选择模式 / 战场";
      const labStatsPanel=$("labPauseStats");
      if(labStatsPanel)labStatsPanel.textContent="尚未开始实验。选择 4 种模式之一 + 3 种战场后开始；所有实验数值见 lab-config.js。";
    }
  }
  function begin(){
    if(phase!=="ready")return false;
    unlockSound();phase="playing";$("startOverlay").classList.add("hidden");choiceSet=[];
    shootClock=Build.tuning(build).interval-CFG.firstShot;
    record("intro_start");setState("第1波 · 滑动瞄准，普通炮台开始破坏");updateUI();return true;
  }

  // One-click SIX-branch comparison: wave 6 crowd vs wave 10 boss board.
  // Upgrade counts are equal within each scenario; giant auto-casts at full charge.
  function quickStart(route){
    const families=["split","arc","gun"];
    const family=route.split("-")[0];
    if(!families.includes(family)||!["a","b"].includes(route.split("-")[1])||!Build.DEFS[route])return false;
    const kits={
      "split-a":["split","split","power","split-a","rate"],
      "split-b":["split","split","power","split-b","rate"],
      "arc-a":["arc","arc","power","arc-a","rate"],
      "arc-b":["arc","arc","power","arc-b","rate"],
      "gun-a":["gun","gun","power","gun-a","rate"],
      "gun-b":["gun","gun","power","gun-b","rate"]
    };
    const bossScene=$("labScene").value==="boss";
    const targetWave=bossScene?10:6;
    reset();
    // Deterministic upgrade selection. Every branch uses the same wave layout.
    build=Build.createState(20261101);
    const picks=kits[route].concat(bossScene?[family,"speed","power","life"]:[]);
    for(let i=0;i<picks.length;i++){
      if(!Build.choose(build,picks[i],i+1))throw Error("Quick lab illegal upgrade at wave "+(i+1)+": "+picks[i]);
    }
    syncBuild();screenClears=targetWave-1;level=targetWave;waveUpgrades=targetWave-1;
    choiceQueue=0;choiceSet=[];balls=[];giant=null;charge=100;
    quickLabActive=true;quickLabRoute=route;phase="playing";
    $("startOverlay").classList.add("hidden");ui.choice.classList.add("hidden");ui.win.classList.add("hidden");
    unlockSound();spawnWave(targetWave);shootClock=Build.tuning(build).interval-CFG.firstShot;
    record("quick_lab_start",{route,targetWave,simulatedUpgrades:picks,excludedFromNormalRecords:true});
    setState("第"+targetWave+"波 · "+Build.DEFS[route].name+"速测 · 巨型球满能自动释放");
    updateUI();return true;
  }
  function returnToQuickMenu(){reset();return true;}

  // Test-only entry on the isolated experiment page. Simulates nine legitimate
  // wave-end choices so Boss 10 is judged using a viable, readable build.
  function jumpToBoss10(){
    reset();
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
    record("debug_jump",{targetWave:10,route,simulatedUpgrades:picks});
    setState("第10关 · BOSS弹射阵型 · 调试直达（已配成长Build）");
    updateUI();return true;
  }

  function jumpToFinalBoss(){
    reset();
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
    setState("第20关 · 888HP最终Boss · 三阶段砖阵（调试直达）");
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
        (source==="normal"||source==="drill"||source==="cannon"||source==="mg"||source==="merge"||source==="labArea"||source==="labElectric")?Math.max(BASE_ARMOR_DAMAGE,points):
        (source==="shock"||source==="lightning")?Math.max(1,points):1;
      const guard=b.isFinalBoss?finaleHpFloor():0;
      const taken=Math.min(Math.max(0,b.hp-guard),damage);
      b.hp-=taken;armorHits+=taken;damageDealt+=taken;
      if(guard>0&&taken===0){setState("终局护盾 · 下一阶段砖阵即将入场");record("finale_guard",{stage:finaleStage,hp:b.hp});}
      b.bonk=.12;impactVisual(b.x+b.w/2,b.y+b.h/2,b.hp===0);
      numberPop(b.x+b.w/2,b.y-1,taken?"−"+taken:"阶段护盾",taken?"#ffdfb2":"#ffe0ab");
      if(b.hp>0){
        if(!b.isFinalBoss)b.color=brickColor(b.hp,b.special);
        if(b.hp<=2&&!b.cracked){b.cracked=true;armorCracks++;}
        burst(b.x+b.w/2,b.y+b.h/2,"#cdefff",2);
        juice.onArmor(b,impact);playSfx("armor");
        return false;
      }
      if(!b.cracked){armorCracks++;b.cracked=true;}
      b.armored=false;
    }
    if(b.cracked)armorBreaks++;
    damageDealt+=b.hp;b.hp=0;b.alive=false;score++;
    if(waveMetrics){waveMetrics.breaks++;waveMetrics.longestNoBreak=Math.max(waveMetrics.longestNoBreak,waveElapsed-waveMetrics.lastBreak);waveMetrics.lastBreak=waveElapsed;}
    if(b.special){Build.grantBuff(build,b.buffId);record("buff",{id:b.buffId,remaining:Build.BUFFS[b.buffId].duration});}
    if(b.bossSupport){if(bossSupportXP<10){bossSupportXP++;addExperience(1);}}
    else if(!b.isBoss)addExperience(b.initialHp>=32?4:b.initialHp>=12?3:b.initialHp>=5?2:1);
    const cx=b.x+b.w/2,cy=b.y+b.h/2;
    combo=elapsed-lastBreak<=1.25?combo+1:1;
    lastBreak=elapsed;maxCombo=Math.max(combo,maxCombo);comboVisibility=1;
    impactVisual(cx,cy,true);
    if(combo>=5&&combo%5===0)numberPop(cx,cy-12,combo+" 连碎!","#a5f8df");
    if(source==="giant")shake=Math.max(shake,.11);
    juice.onBreak(b,{combo,source,impact});
    if(source==="giant"||source==="giantHeavy")tapHaptic("heavy");
    else if(combo>=5&&combo%5===0)tapHaptic("break");
    burst(cx,cy,b.color,source==="giant"||source==="giantHeavy"?17:7);
    // Secondary explosions and lightning cannot snowball the active-skill meter.
    if(source==="normal"||source==="drill"||source==="cannon")addCharge(b.special?34:8);
    if(b.special&&(source==="normal"||source==="drill"||source==="cannon"))setState("能量砖！超载冲锋充能");
    playSfx("break");
    const isDirect=source==="normal"||source==="drill"||source==="cannon";
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
    const t=Build.tuning(build),buffSpeed=Build.buffModifiers(build).speed,speed=t.speed*buffSpeed;
    return {x:shooter.x,y:shooter.y-28,vx:Math.sin(angle)*speed,vy:-Math.cos(angle)*speed,r:mini?SHOT_HIT_RADIUS*.83:SHOT_HIT_RADIUS,visualR:mini?SHOT_RADIUS*.83:SHOT_RADIUS,
      life:0,maxLife:mini?Math.min(CFG.childTTL,t.ttl):t.ttl,trail:[],contacts:0,mini,splitDone:false,drill:false,
      drillLeft:0,chargeStacks:0,huntsLeft:hunterLevel,damage:t.damage,
      buffSpeed,lastHitId:null,lastHitLife:-99,lastArcAt:-99,labSource:mini?"derived":"cannon"};
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
      child.x=x;child.y=y;child.pursuitLeft=Math.max(0,splitLevel-1);child.guideAt=elapsed+.16;child.huntsLeft=hunterLevel+(branch==="split-b"?Build.effects(build).childTurns:0);child.huntChild=branch==="split-b";child.stormSweep=branch==="split-a";child.stormUsed=false;
      child.lastHitId=ball.lastHitId;child.lastHitLife=0;balls.push(child);made++;
    }
    if(made){splitBursts++;bonusVolleyBalls+=made;counters.splitChildren+=made;record("split",{count:made});playSfx("split");setState("场内裂变 · +"+made+"颗真实弹球");}
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
    homingTurns++;if(ball.huntChild)childLocks++;playSfx("hunt");
    return true;
  }
  function fire(){
    if(phase!=="playing"||emptyLatch)return false;
    if(labActive)return labFire();
    const t=Build.tuning(build),branch=build.coreBranch;
    const makeRoom=()=>{
      if(balls.length<MAX_BALLS)return true;
      if(!t.isGun){counters.suppressedShots++;return false;}
      let candidates=balls.filter(b=>b.mini);
      if(!candidates.length)candidates=balls;
      const oldest=candidates.reduce((a,b)=>b.life>a.life?b:a);
      balls.splice(balls.indexOf(oldest),1);
      counters.budgetReclaims++;
      record("budget_reclaim",{mini:oldest.mini});
      return true;
    };
    if(!makeRoom())return false;
    const shotNumber=++shotsFired;
    // Gun B is a real three-ball fan VOLLEY. All three follow exactly the
    // normal ball physics, including independent wall and brick rebounds.
    // No mini children, ray effects or virtual damage.
    const shot=makeBall(aim);
    if(branch==="gun-b")shot.fanProjectile=true;
    if(branch==="gun-a"){
      const angle=aim+(shotNumber%2?1:-1)*.012;
      const speed=Math.hypot(shot.vx,shot.vy);
      shot.vx=Math.sin(angle)*speed;shot.vy=-Math.cos(angle)*speed;
      if(shotNumber%(build.ranks["gun-a"]>1?5:6)===0){
        shot.needle=true;shot.needleLeft=3;needleShots++;
      }
    }
    if(drillLevel>0&&shotNumber%(drillLevel===1?4:3)===0){
      shot.drill=true;shot.drillLeft=drillLevel===1?3:5;
      shot.r=SHOT_HIT_RADIUS*1.35;shot.visualR=SHOT_RADIUS*1.35;
      powerShots++;playSfx("drill");
    }
    balls.push(shot);lastShotAngle=aim;
    if(branch==="gun-b"){
      const spread=CFG.fanAngle;
      for(const offset of [-spread,spread]){
        if(!makeRoom())break;
        const side=makeBall(aim+offset);
        side.fanProjectile=true;
        balls.push(side);
        fanExtraShots++;
      }
      record("fan_volley",{shots:3,angles:[+(aim-spread).toFixed(3),+aim.toFixed(3),+(aim+spread).toFixed(3)]});
    }
    gunFlash=.07;counters.shotsByBuild[Build.preferred(build)||"base"]++;
    counters.maxBallsAlive=Math.max(counters.maxBallsAlive,balls.length);
    record("shot",{angle:+aim.toFixed(5),ttl:shot.maxLife,interval:t.interval,projectiles:branch==="gun-b"?3:1});
    beep(245,.045,.011);
    return true;
  }
  function fireGiant() {
    if (phase !== "playing" || (!build.seedAbility && !(labActive&&labGiantEnabled)) || emptyLatch || charge < selectedActive.maxCharge || giant || selectedActive.kind!=="giant") return false;
    unlockSound();
    charge=0;skillsUsed++;markSkillUsed();
    giant={x:shooter.x,y:shooter.y-27,
      vx:Math.sin(aim)*GIANT_SPEED,vy:-Math.cos(aim)*GIANT_SPEED,
      r:14,life:0,collisions:0,bounces:0,pierceLeft:GIANT_PIERCE_LIMIT,lastBounceFx:-100,trail:[],lastHitId:null,lastHitLife:-99};
    burst(shooter.x,shooter.y-27,"#ffd482",24);
    playSfx("giant");setState("超载冲锋：限时冲破 10 块，结束后散出追击球！");updateUI();
    juice.onGiant(shooter.x,shooter.y-27);tapHaptic("heavy");
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
  function triggerLightning(origin,ball){
    if(!arcLevel||!origin||!ball||ball.mini||ball.contacts===undefined||bossVictory)return false;
    const branch=build.coreBranch,effect=Build.effects(build);
    if(branch==="arc-b"){
      // Capacitor: three DIRECT parent-ball hits charge one bolt. The bolt
      // prioritizes a nearby high-HP brick/Boss, not a chain of weak targets.
      focusTargetId=origin.id;focusLastAt=elapsed;
      focusStacks=Math.min(3,focusStacks+1);
      if(focusStacks<3||elapsed-lastArcRelease<CFG.arcCooldown){
        setState("蓄能雷击 · 电荷 "+focusStacks+"/3");
        return false;
      }
      focusStacks=0;focusBursts++;
    }else{
      arcCharge++;
      if(arcCharge<CFG.arcEvery[arcLevel]||elapsed-lastArcRelease<CFG.arcCooldown)return false;
    }
    const start={x:origin.x+origin.w/2,y:origin.y+origin.h/2};
    const limit=branch==="arc-a"?effect.arcTargets:CFG.arcTargets[arcLevel];
    const chosen=[],used=new Set([origin.id]);
    let from=start;
    const initialHops=branch==="arc-a"?Math.max(1,limit-2):limit;
    if(branch!=="arc-b")for(let i=0;i<initialHops;i++){
      const anchor=branch==="arc-a"?from:start;
      const candidates=bricks.filter(b=>b.alive&&!used.has(b.id)&&
        Math.hypot(b.x+b.w/2-anchor.x,b.y+b.h/2-anchor.y)<=CFG.arcRange[arcLevel]);
      candidates.sort((a,b)=>Math.hypot(a.x+a.w/2-anchor.x,a.y+a.h/2-anchor.y)-
        Math.hypot(b.x+b.w/2-anchor.x,b.y+b.h/2-anchor.y));
      if(!candidates.length)break;
      const target=candidates[0];chosen.push(target);used.add(target.id);
      from={x:target.x+target.w/2,y:target.y+target.h/2};
    }
    let single=false;
    if(branch==="arc-b"){
      const nearby=bricks.filter(b=>b.alive&&Math.hypot(b.x+b.w/2-start.x,b.y+b.h/2-start.y)<=360);
      nearby.sort((a,b)=>(Number(b.isBoss)-Number(a.isBoss))||(b.hp-a.hp));
      if(nearby.length){chosen.push(nearby[0]);single=true;}
    }
    if(!chosen.length){
      if(!origin.alive)return false;
      chosen.push(origin);single=true;
    }
    const missing=branch==="arc-b"?CFG.arcTargets[arcLevel]:Math.max(0,limit-chosen.filter(b=>b!==origin).length);
    if(branch!=="arc-b"&&origin.alive&&missing>0&&!chosen.includes(origin))chosen.push(origin);
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
    if(branch==="arc-b")record("focus_discharge",{target:chosen[0].id});
    setState(branch==="arc-b"?"蓄能雷击 · 三次命中锁定强敌":"分叉雷网 · 逐个跳电");
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
        const id=chain.targets[chain.index++],brick=bricks.find(b=>b.alive&&b.id===id);
        chain.nextAt+=ARC_HOP_INTERVAL;
        if(!brick)continue;
        const next={x:brick.x+brick.w/2,y:brick.y+brick.h/2};
        const effect=Build.effects(build);
        const armorBonus=(brick.isBoss||brick.ringArmor||brick.isElite||brick.bossSupport)?effect.arcArmorBonus:0;
        const isOrigin=id===chain.originId;
        const damage=(isOrigin?(chain.branch==="arc-b"?
          CFG.focusDamage*3+(build.ranks["arc-b"]>1?5:0):
          CFG.bossArcDamage+chain.missing*arcLevel):CFG.arcDamage[arcLevel])+armorBonus;
        const before=brick.hp;
        if(!reducedMotion){
          lightningArcs.push({points:[{...chain.from},next],age:0,duration:.28});
          if(lightningArcs.length>42)lightningArcs.shift();
        }
        hitBrick(brick,"lightning",null,damage);
        const taken=Math.max(0,before-brick.hp);
        lightningDamage+=taken;
        if(isOrigin){counters.arcSingleDamage+=taken;focusDamage+=taken;}
        chain.from=next;chain.hops++;
        record("arc_hop",{target:id,order:chain.hops,damage:taken,killed:!brick.alive});
        playSfx("arc");
        if(bossVictory)return; // Boss kill locks victory immediately
        if(chain.branch!=="arc-b"&&!brick.alive&&chain.targets.length<chain.maxTargets){
          const candidates=bricks.filter(b=>b.alive&&!chain.used.has(b.id)&&
            Math.hypot(b.x+b.w/2-next.x,b.y+b.h/2-next.y)<=CFG.arcRange[arcLevel]);
          candidates.sort((a,b)=>Math.hypot(a.x+a.w/2-next.x,a.y+a.h/2-next.y)-
            Math.hypot(b.x+b.w/2-next.x,b.y+b.h/2-next.y));
          const forks=chain.branch==="arc-a"?(build.ranks["arc-a"]>1?2:1):1;
          for(const extra of candidates.slice(0,Math.min(forks,chain.maxTargets-chain.targets.length))){
            chain.used.add(extra.id);chain.targets.push(extra.id);
            chain.extraHops++;if(chain.branch==="arc-a")relayForks++;
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
    if(labActive&&ball.labCharge)labStats.chargeContacts++;
    const bonus=0; // Timed special-brick buffs cannot raise direct hit damage.
    let pressure=0;
    const gunRank=Build.effectiveRank(build,"gun");
    if(!ball.mini&&gunRank>1&&Build.preferred(build)==="gun"){
      gunStreak=gunTarget===block.id&&elapsed-gunLast<=2?gunStreak+1:1;gunTarget=block.id;gunLast=elapsed;
      pressure=Math.min(gunRank-1,Math.floor((gunStreak-1)/3));
    }
    const weak=block.isBoss&&livingCount()===1&&waveElapsed%6>=4;
    if(weak){addCharge(4);weakpointCharge+=4;} // Boss weakpoint grants extra charge, not +1 hidden damage.
    gunBonusDamage+=Math.min(pressure,Math.max(0,block.hp-1));
    const damage=pressure+(ball.damage||Build.tuning(build).damage)+bonus+(ball.drill?drillLevel+1:0)+(ball.needle?1:0)+ball.chargeStacks;
    bankDamage+=Math.min(ball.chargeStacks,Math.max(0,block.hp-(damage-ball.chargeStacks)));
    const hpBefore=block.hp;
    const hitSource=labActive?(ball.labCharge?"merge":(ball.labSource||"cannon")):(ball.drill?"drill":"normal");
    const destroyed=hitBrick(block,hitSource,incoming,damage);
    record("direct_hit",{target:block.id,before:hpBefore,after:block.hp,base:ball.damage||Build.tuning(build).damage,gunPressure:pressure,drill:ball.drill?drillLevel+1:0,wallCharge:ball.chargeStacks,bossWeakpointEnergy:weak?4:0});
    ball.contacts++;brickContacts++;shotMaxContacts=Math.max(shotMaxContacts,ball.contacts);
    ball.chargeStacks=0;splitAt(ball,ball.x,ball.y);triggerLightning(block,ball);
    if(labActive)labOnDirectHit(block,ball,destroyed,incoming,hpBefore,damage);
    return destroyed;
  }
  function updateBall(ball,dt){
    // Hunter children steer soon after creation rather than needing a wall hit.
    if(ball.huntChild&&ball.huntsLeft>0&&elapsed>=(ball.guideAt??0)&&livingCount()>5){
      retargetBall(ball);ball.guideAt=elapsed+.70;
    }
    const sparse=livingCount()>0&&livingCount()<=5;
    const pursuing=ball.mini&&ball.pursuitLeft>0;
    if(!labActive&&sparse&&(pursuing||waveElapsed>12)&&elapsed>=(ball.guideAt??0)){
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
      let wall=false;
      if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx);wall=true;}
      if(ball.x>W-ball.r){ball.x=W-ball.r;ball.vx=-Math.abs(ball.vx);wall=true;}
      if(ball.y<ball.r+4){ball.y=ball.r+4;ball.vy=Math.abs(ball.vy);}
      if(wall){
        counters.wallBounces++;if(ball.fanProjectile)counters.fanWallBounces++;
        if(ricochetLevel){ball.chargeStacks=Math.min(ricochetLevel===1?2:4,ball.chargeStacks+ricochetLevel);ricochetTriggers++;}
        retargetBall(ball);
      }
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
        // Storm sweeps to the next brick across a row, no additional children.
        if(ball.stormSweep&&!ball.stormUsed){
          ball.stormUsed=true;
          const nearby=bricks.filter(b=>b.alive&&b.id!==block.id&&
            Math.abs(b.x-block.x)>BRICK_W*.5&&
            Math.abs(b.y-block.y)<BRICK_STEP_Y*2&&
            Math.hypot(b.x-ball.x,b.y-ball.y)<180);
          nearby.sort((a,b)=>Math.abs(a.y-block.y)-Math.abs(b.y-block.y));
          if(nearby.length){
            const next=nearby[0],vx=next.x+next.w/2-ball.x,vy=next.y+next.h/2-ball.y;
            const mag=Math.hypot(vx,vy)||1,vel=Math.hypot(ball.vx,ball.vy);
            ball.stormNext={vx:vel*vx/mag,vy:vel*vy/mag};stormSweeps++;
            record("storm_sweep",{from:block.id,to:next.id});
          }
        }
        markFinalRush();
        if(ball.needle&&ball.needleLeft>0){
          ball.needleLeft--;
          if(ball.needleLeft>0)needlePasses++;
          else{ball.needle=false;if(!destroyed)reflect(ball,normal);}
        }else if(ball.drill&&ball.drillLeft>0){
          ball.drillLeft--;if(ball.drillLeft===0)ball.drill=false;
          if(!ball.drill&&!destroyed)reflect(ball,normal);
        }else if(ball.labCharge){
          ball.mergeLeft-=1;
          if(ball.mergeLeft<=0)ball.life=ball.maxLife;
        }else if(!destroyed){
          const vx=ball.vx,vy=ball.vy;
          reflect(ball,normal);
          if(ball.fanProjectile&&(Math.abs(ball.vx-vx)+Math.abs(ball.vy-vy))>.01)counters.fanBrickRebounds++;
        }
        if(ball.stormNext){
          ball.vx=ball.stormNext.vx;ball.vy=ball.stormNext.vy;
          ball.stormNext=null;
        }
        break;
      }
    }
    ball.life+=dt;ball.trail.unshift({x:ball.x,y:ball.y});
    if(ball.trail.length>9)ball.trail.pop();
    if(labActive&&ball.labCharge&&(ball.mergeLeft<=0||ball.life>=ball.maxLife)){
      ball.labCharge=false;
      labSpawnMergeShards(ball);
      return false;
    }
    return ball.y<H+10&&ball.life<ball.maxLife;
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
    choiceSet=Build.offer(build,screenClears);
    if(choiceSet.length!==3)throw Error("Upgrade pool must provide three distinct effective cards");
    phase="choosing";choiceQueue--;showCards();record("offer",{cards:choiceSet.slice()});setState("清屏升级 · 选择期间暂停");updateUI();return true;
  }
  function chooseUpgrade(id){
    if(phase==="seeding")return selectSeed(id);
    if(phase!=="choosing"||!choiceSet.includes(id)||!Build.choose(build,id,screenClears))return false;
    syncBuild();record("choice",{id});phase="playing";choiceSet=[];ui.choice.classList.add("hidden");playSfx("upgrade");
    if(build.choiceHistory.length===1&&build.seedAbility){record("first_upgrade",{id});setState("新技能已获得 · 充满能量后可以释放超载");}
    if(screenClears>=MAX_WAVES){finishPrototype();return true;}
    if(choiceQueue>0)offerChoice();else{setState("强化完成 · 下一波验证构筑");updateUI();}return true;
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
    alertUntil=elapsed+2.5;setState("第 "+wave+" 波 · BOSS 核心已降临！");
    if(phase==="playing")playSfx("giant");return true;
  }

  // Final encounter only: finite, telegraphed Boss-driven reinforcements.
  // Ordinary waves remain whole-wave-clear with no mid-wave replenishment.
  function queueFinaleStage(stage){
    if(!isFinaleWave(wave)||!boss||!boss.alive||stage<=finaleStage||stage>3)return 0;
    const previous=finaleStage;
    finaleStage=stage;
    const picks=[],cols=stage===2?[0,8,1,7,2,6]:[2,6,1,7,0,8];
    const offsets=stage===2?[-88,-60,-30,14,43,72,101]:[-92,-66,-38,6,38,69,98];
    let count=0;
    for(const dy of offsets)for(const col of cols){
      if(count>=18)break;
      // Entry corridor is kept open below the Boss.
      if(dy>=14&&col>=3&&col<=5)continue;
      const x=12+col*BRICK_STEP_X,y=boss.y+dy;
      if(y<SUMMON_SAFE_TOP||y+BRICK_H>DANGER_Y-85)continue;
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
      const rows=[SUMMON_SAFE_TOP+8,SUMMON_SAFE_TOP+36,SUMMON_SAFE_TOP+64,boss.y-125,boss.y-98];
      const fallbackCols=stage===2?[0,2,4,6,8,1,7,3,5]:[1,3,5,7,0,8,2,6,4];
      for(const y of rows)for(const col of fallbackCols){
        if(count>=16)break;
        const x=12+col*BRICK_STEP_X;
        if(y+BRICK_H>Math.min(SUMMON_SAFE_BOTTOM,DANGER_Y-85))continue;
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
    setState("终局第 "+stage+"/3 阶段 · 新砖阵预警 "+count+" 块");
    playSfx("shock");
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
    for(let y=SUMMON_SAFE_TOP+3;y+BRICK_H<SUMMON_SAFE_BOTTOM;y+=WAVE_ROW_GAP)rows.push(y);
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
      setState("Boss 第"+ordinal+"波增援 · "+queued+"块真实数字砖预警");
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
    burst(x,y,"#ffe7ae",reducedMotion?9:38);juice.onSplash({x,y});tapHaptic("heavy");
    record("boss_finisher_start",{wave:finishedWave,targets:pending.length});
    playSfx("shock");setState("BOSS击破！核心向外连环爆炸");
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
      if(v.index%8===0)playSfx("shock");
    }
    if(v.t<BOSS_FINISH_DURATION)return true;
    const exploded=v.index;
    for(const brick of bricks)if(brick.alive&&!brick.isBoss)brick.alive=false;
    record("boss_finisher_complete",{wave:v.wave,visualExplosions:exploded,
      awardedNormalBreaks:0,seconds:+v.t.toFixed(2)});
    bossVictory=null;
    setState("BOSS胜利！终结爆炸完成");
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
    if(labActive){labGenerate(dt);return;}
    if(updateBossFinisher(dt))return;
    // Whole-wave contract: no ordinary rows, ambient summons, bridge spawns or
    // reinforcements. Only an alive Boss may summon a finite support set.
    if(!emptyLatch){
      waveElapsed+=dt;
      const liveBefore=livingCount();if(liveBefore>0){waveMetrics.longestNoBreak=Math.max(waveMetrics.longestNoBreak,waveElapsed-waveMetrics.lastBreak);if(liveBefore<=5)waveMetrics.tailSeconds+=dt;if(liveBefore===1&&boss)waveMetrics.bossSoloSeconds+=dt;}
      const latePressure=wave>=11&&wave<=19?1+(wave-10)*.022:1;
      const finalePressure=isFinaleWave(wave)?.34+.11*(finaleStage-1):1;
      // Boss10 gains speed as battle lasts; move the initial lowest guides
      // one row up so the faster visual descent does not cause instant losses.
      const bossPressure=wave===10?Math.min(1.49,1.22+Math.max(0,waveElapsed-8)*.014):isFinaleWave(wave)?.9:1;
      const speed=Math.min(8.4,FALL_BASE+Math.max(0,wave-1)*.09)*bossPressure*CFG.fallScale*waveFallMultiplier*latePressure*finalePressure;
      for(const brick of bricks)if(brick.alive)brick.y+=speed*dt;
      const gapNow=dangerGap();
      closestDangerGap=Math.min(closestDangerGap,gapNow);
      if(gapNow<=60)nearDangerSeconds+=dt;
      const dangerStage=gapNow<=24?2:gapNow<=60?1:0;
      if(dangerStage>pressureWarningStage){
        pressureWarningStage=dangerStage;
        record("danger_warning",{stage:dangerStage,gap:+gapNow.toFixed(1),waveSeconds:+waveElapsed.toFixed(2)});
      }
      const danger=bricks.find(b=>b.alive&&b.y+b.h>=DANGER_Y);
      if(danger){
        const dangerSource=danger.isBoss?"BOSS":danger.summonSource==="boss"?"Boss召唤砖":danger.summonSource==="finale"?"终局增援砖":"初始砖";
        record("touchline",{wave,source:dangerSource,brickId:danger.id,hp:danger.hp,elapsed:+waveElapsed.toFixed(2),bossHp:boss?.hp??null,bossSupportBorn:bossSummonTotal,startGap:+waveStartGap.toFixed(1),nearDangerSeconds:+nearDangerSeconds.toFixed(2)});
        phase="lost";balls=[];giant=null;ui.win.classList.remove("hidden");
        const seconds=Math.floor(elapsed);
        ui.final.textContent="生存 "+Math.floor(seconds/60)+"分"+seconds%60+
          "秒 · 击碎 "+score+" 块 · 到达第 "+wave+" 波 · LV."+level+
          " · 清屏 "+screenClears+" 次 · Boss "+bossDefeats+" 个 · 触线："+dangerSource+"("+danger.hp+"HP)";
        setState("砖阵触线 · 第 "+wave+" 波失败");
        playSfx("shock");updateUI();return;
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
        waveReports.push({wave,duration:+waveElapsed.toFixed(3),breaks:waveMetrics.breaks,breaksPerSecond:waveMetrics.breaks/Math.max(.01,waveElapsed),longestNoBreak:waveMetrics.longestNoBreak,tailSeconds:waveMetrics.tailSeconds,bossSoloSeconds:waveMetrics.bossSoloSeconds,shots:shotsFired-waveMetrics.shots,children:counters.splitChildren-waveMetrics.children,reclaims:counters.budgetReclaims-waveMetrics.reclaims,suppressedShots:counters.suppressedShots-waveMetrics.suppressed,suppressedChildren:counters.suppressedChildren-waveMetrics.suppressedChildren,startGap:+waveStartGap.toFixed(1),closestGap:+closestDangerGap.toFixed(1),nearDangerSeconds:+nearDangerSeconds.toFixed(2)});
        if(screenClears>=MAX_WAVES){finishPrototype();return;}
        build.recovery={power:0,speed:0,life:0};arcCharge=0;lastArcRelease=-99;
        level++;waveUpgrades++;choiceQueue++;choiceReason="wave";
        replenishClock=CLEAR_CELEBRATE+CLEAR_WARNING;
        clearPreview=[];clearPreviewShown=false;ambientSignals=[];summonSignals=[];
        alertUntil=elapsed+replenishClock;
        setState("PERFECT CLEAR · 第 "+wave+" 波完成，升级 LV."+level);
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
    const stepStart=performance.now();
    elapsed+=dt;if(!emptyLatch){shootClock+=dt;battleTime+=dt;Build.tickBuffs(build,dt);}
    if(labActive)labUpdate(dt);
    generateSurvival(dt);
    if(phase!=="playing")return;
    if(!emptyLatch&&!bossVictory){
      fanClock+=dt;gunFlash=Math.max(0,gunFlash-dt);
      if((build.seedAbility||(labActive&&labGiantEnabled))&&charge>=MAX_CHARGE&&!giant)activateEquippedSkill();
      const fireInterval=labActive?labFireInterval():Build.tuning(build).interval/Build.buffModifiers(build).rate;
      if(shootClock>=fireInterval){shootClock-=fireInterval;fire();}
      const currentBalls=balls.slice(),kept=currentBalls.filter(b=>updateBall(b,dt));
      const newborn=balls.filter(b=>!currentBalls.includes(b));balls=kept.concat(newborn).slice(0,MAX_BALLS);
      updateLightningChains();
      lightningArcs.forEach(e=>e.age+=dt);lightningArcs=lightningArcs.filter(e=>e.age<e.duration);
      updateGiant(dt);
    }
    if(bossVictory){lightningArcs=[];lightningChains=[];}
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt;});
    particles=particles.filter(p=>p.life>0);
    for(const b of bricks)if(b.alive&&b.bonk>0)b.bonk=Math.max(0,b.bonk-dt);
    impactRings.forEach(e=>e.age+=dt);impactRings=impactRings.filter(e=>e.age<(e.hard?.19:.10));
    floatTexts.forEach(e=>e.age+=dt);floatTexts=floatTexts.filter(e=>e.age<.56);
    comboVisibility=Math.max(0,comboVisibility-dt);shake=Math.max(0,shake-dt);
    juice.update(dt,bricks);
    // Dead bricks must not accumulate and inflate every projectile collision scan.
    if(Math.floor((elapsed-dt)*2)!==Math.floor(elapsed*2))
      bricks=bricks.filter(b=>b.alive);
    if(choiceQueue>0)offerChoice();
    const message=$("finalRushLabel");
    if(elapsed<alertUntil){message.classList.add("active");message.textContent=emptyLatch?"PERFECT CLEAR · 第 "+wave+" 波清屏":boss&&boss.alive?"BOSS · 第 "+wave+" 波":"WAVE "+wave;}
    else if(boss&&boss.alive&&livingCount()===1&&waveElapsed%6>=4){message.classList.add("active");message.textContent="核心弱点 · 命中额外充能 +4";}
    else if(livingCount()>0&&livingCount()<=5&&waveElapsed>12){message.classList.add("active");message.textContent="残局追击 · 精准弹道";}
    else message.classList.remove("active");
    uiClock+=dt;
    if(uiClock>=.10){uiClock=0;updateUI();}
    counters.maxBallsAlive=Math.max(counters.maxBallsAlive,balls.length);
    const cost=performance.now()-stepStart;physicsCostMs+=cost;physicsSteps++;maxPhysicsMs=Math.max(maxPhysicsMs,cost);
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
        ctx.lineWidth=1.6;ctx.strokeStyle=sig.finale?"#ffd18e":"#8fe9ff";ctx.shadowColor=sig.finale?"#ffc86a":"#7dcfff";
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
      // Boss/elite drawing used to bypass normal brick recoil altogether.
      if((brick.isElite||brick.isBoss)&&juice.mode!=="off")juice.applyBrickMotion(ctx,brick);
      if(brick.isSummoner){
        ctx.shadowColor="#bd76ff";ctx.shadowBlur=22;ctx.fillStyle="#4b2a68";
        rounded(brick.x,brick.y,brick.w,brick.h,10);ctx.fill();
        ctx.lineWidth=3;ctx.strokeStyle="#e0b8ff";ctx.stroke();ctx.shadowBlur=0;
        ctx.fillStyle="#fbe9ff";ctx.textAlign="center";ctx.font="900 17px system-ui";
        ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+brick.h/2+3);
        ctx.font="bold 8px system-ui";ctx.fillStyle="#e6c8ff";ctx.fillText("召唤核心",brick.x+brick.w/2,brick.y+12);
        juice.drawBrickImpact(ctx,brick);ctx.restore();continue;
      }
      if(brick.isElite){
        ctx.shadowColor="#ffb34d";ctx.shadowBlur=20;ctx.fillStyle="#694126";
        rounded(brick.x,brick.y,brick.w,brick.h,10);ctx.fill();ctx.lineWidth=3;ctx.strokeStyle="#ffd18d";ctx.stroke();ctx.shadowBlur=0;
        ctx.fillStyle="#fff2d7";ctx.textAlign="center";ctx.font="900 19px system-ui";
        ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+brick.h/2+6);juice.drawBrickImpact(ctx,brick);ctx.restore();continue;
      }
      if(brick.isBoss){
        ctx.shadowColor=brick.isFinalBoss?"#ff9c73":"#bd76ff";ctx.shadowBlur=brick.isFinalBoss?31:25;ctx.fillStyle=brick.isFinalBoss?"#7c335a":"#613d92";
        rounded(brick.x,brick.y,brick.w,brick.h,12);ctx.fill();
        ctx.lineWidth=3;ctx.strokeStyle=brick.isFinalBoss?"#ffd6aa":"#d89cff";ctx.stroke();ctx.shadowBlur=0;
        ctx.fillStyle="#fff3df";ctx.font=brick.isFinalBoss?"900 23px system-ui":"900 17px system-ui";ctx.textAlign="center";
        ctx.fillText(String(brick.hp),brick.x+brick.w/2,brick.y+brick.h/2+6);
        if(brick.isFinalBoss){ctx.font="bold 9px system-ui";ctx.fillStyle="#ffe5c5";ctx.fillText("FINAL BOSS · "+finaleStage+"/3",brick.x+brick.w/2,brick.y+17);}
        juice.drawBrickImpact(ctx,brick);ctx.restore();continue;
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
      juice.drawBrickImpact(ctx,brick);
      ctx.restore();
    }
    if(labActive)labDraw(ctx);
    ctx.fillStyle="#93b6d23d";ctx.fillRect(0,H-78,W,1);
    if(phase==="playing"){
      ctx.save();ctx.setLineDash([6,8]);ctx.lineWidth=2;ctx.strokeStyle="#9eeaff88";
      ctx.beginPath();ctx.moveTo(shooter.x,shooter.y-17);
      ctx.lineTo(shooter.x+Math.sin(aim)*220,shooter.y-17-Math.cos(aim)*220);
      ctx.stroke();ctx.restore();
    }
    for(const b of balls){
      b.trail.forEach((p,i)=>{const t=1-i/b.trail.length;ctx.fillStyle="rgba(139,224,250,"+(.18*t)+")";
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,(b.visualR||b.r)*t*.7),0,Math.PI*2);ctx.fill();});
      ctx.shadowColor=b.needle?"#c8f2aa":b.drill?"#ffb05d":b.chargeStacks?"#fced83":b.mini?"#c39fff":"#b9f2ff";
      ctx.shadowBlur=b.drill?18:11;ctx.fillStyle=b.needle?"#d2ffa4":b.drill?"#ffcc67":b.chargeStacks?"#fff5b0":b.mini?"#dbbaff":"#edfaff";
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
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.42,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);}
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
      ctx.fillText("BOSS 击破！",W/2,Math.min(H-150,220));ctx.restore();
    }
    if(!reducedMotion){
      for(const e of impactRings){
        const duration=e.hard?.19:.10, t=clamp(e.age/duration,0,1);
        ctx.strokeStyle=e.hard?"rgba(182,241,255,"+(.65*(1-t))+")":"rgba(255,217,154,"+(.4*(1-t))+")";
        ctx.lineWidth=e.hard?2.0:1.1;
        ctx.beginPath();ctx.arc(e.x,e.y,4+(e.hard?20:9)*t,0,Math.PI*2);ctx.stroke();
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
    ctx.save();ctx.translate(shooter.x,shooter.y);
    if(labActive&&labHas("S5")){
      ctx.rotate(aim);
      for(const side of [-1,1]){
        const firing=(side===1)===(labLastFireSide===1);
        ctx.save();ctx.translate(side*LAB.dual.muzzleOffset,0);
        if(labMuzzleFlash>0&&firing){
          ctx.fillStyle="#ffda84";ctx.beginPath();ctx.arc(0,-32,3+labMuzzleFlash*46,0,Math.PI*2);ctx.fill();
        }
        ctx.shadowColor="#5be9fb";ctx.shadowBlur=12;ctx.fillStyle="#398ba4";
        rounded(-8,-10,16,30,7);ctx.fill();ctx.fillStyle="#b7edff";
        rounded(-3,-29,6,27,3);ctx.fill();ctx.restore();
      }
    }else{
      ctx.rotate(build.coreBranch==="gun-b"?aim+Math.sin(fanClock*Math.PI*2/CFG.fanPeriod)*CFG.fanAngle:aim);
      if(gunFlash>0){ctx.fillStyle=Build.tuning(build).isGun?"#ffda84":"#9ce9ff";ctx.beginPath();ctx.arc(0,-32,3+gunFlash*50,0,Math.PI*2);ctx.fill();}
      ctx.shadowColor="#5be9fb";ctx.shadowBlur=16;ctx.fillStyle="#398ba4";
      rounded(-15,-10,30,30,9);ctx.fill();ctx.fillStyle="#b7edff";
      rounded(-5,-29,10,27,4);ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle="#a6c5d9";ctx.textAlign="center";ctx.font="12px system-ui";
    
    ctx.restore();
  }
  function renderBuildPanel(){
    if(!labActive){
      $("pauseSubtitle").textContent="动态砖阵实验 · 选择模式 / 战场";
      const panel=$("labPauseStats");
      if(panel)panel.textContent="尚未开始实验。选择 4 种模式之一 + 3 种战场后开始；所有实验数值见 lab-config.js。";
      $("buildStats").textContent="实验模式：普通球真实伤害 1；不进入正式成长树。";
      $("buildSkills").textContent="当前模式与战场见上方；开始后显示实际发射率、峰值球数与生成/预警计数。";
      $("buildBuffs").textContent="—";
      $("lastUpgrade").textContent="实验页不产生永久升级。";
      $("buildHistory").textContent="—";
      return;
    }
    $("pauseSubtitle").textContent="动态砖阵实验 · "+(labModeDef()?labModeDef().label:labMode)+" · "+(LAB.fields[labField]?LAB.fields[labField].label:labField);
    const interval=labFireInterval();
    $("buildStats").textContent="普通球真实伤害 1   当前射速 "+(1/interval).toFixed(2)+"发/秒\n球速 "+Build.tuning(build).speed+"   场上 "+balls.length+" / "+MAX_BALLS+"球   峰值 "+labStats.maxBalls;
    $("buildSkills").textContent=labModeDef()?labModeDef().label+"\n"+labMechanicText(labMode):"";
    $("buildBuffs").textContent="顶部剩余 "+labTopRemaining+" · 中部剩余 "+labMidRemaining+" · 预警 "+labWarnings.length+" · 机枪触发 "+labStats.mgShots+" · 机枪弹 "+labStats.mgBalls+" · 回收 "+labStats.capRecycles;
    $("lastUpgrade").textContent="实验页不产生永久升级；重开当前战场会清空所有计数。";
    $("buildHistory").textContent="战场 "+(LAB.fields[labField]?LAB.fields[labField].label:labField)+" · 参数版本 "+LAB.version+" · 巨型球 "+(labGiantEnabled?"开":"关");
  }
  function lockBackground(locked){
    for(const element of document.querySelectorAll?.(".topbar,.hud,.footer,.combat-status,#game,#choiceOverlay,#startOverlay,#winOverlay,.ult-wrap")||[])element.inert=locked;
  }
  function pause(){
    if(!["ready","seeding","playing","choosing","lost","complete"].includes(phase))return false;
    pausedFrom=phase;phase="paused";activePointer=null;accumulator=0;
    focusBeforePause=document.activeElement;lockBackground(true);renderBuildPanel();$("pauseOverlay").classList.remove("hidden");$("resume").focus?.();updateUI();return true;
  }
  function resume(){
    if(phase!=="paused")return false;phase=pausedFrom;pausedFrom=null;accumulator=0;lastFrame=performance.now();
    $("pauseOverlay").classList.add("hidden");lockBackground(false);focusBeforePause?.focus?.();updateUI();return true;
  }
  $("pause").addEventListener("click",()=>phase==="paused"?resume():pause());
  $("resume").addEventListener("click",resume);
  $("exportRun").addEventListener("click",()=>{
    const data=JSON.stringify({version:"DemoV1-20261101",state:snapshot(),events,config:CFG},null,2);
    const url=URL.createObjectURL(new Blob([data],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="pinball-demo-v1-"+build.seed+".json";link.click();URL.revokeObjectURL(url);
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
  // Giant is passive: the indicator shows energy but does not require a tap.
  $("skillSide").value=skillSide;applySkillSide();
  $("skillSide").addEventListener("change",e=>{skillSide=e.target.value==="left"?"left":"right";store(SIDE_KEY,skillSide);applySkillSide();});
  // No manual/automatic toggle: the accepted Demo rule is always auto-cast.
  $("start")?.addEventListener("click",begin);
  for(const route of ["split-a","split-b","arc-a","arc-b","gun-a","gun-b"]){
    $("quick-"+route)?.addEventListener("click",()=>quickStart(route));
  }
  $("quickMenuPause")?.addEventListener("click",()=>{if(labActive)labReturnToMenu();else returnToQuickMenu();});
  $("quickMenuEnd")?.addEventListener("click",()=>{if(labActive)labReturnToMenu();else returnToQuickMenu();});
  $("jumpBoss")?.addEventListener("click",jumpToBoss10);
  $("jumpFinalBoss")?.addEventListener("click",jumpToFinalBoss);
  for(let i=0;i<3;i++)$("choice"+i).addEventListener("click",()=>{unlockSound();chooseUpgrade(choiceSet[i]);});
  $("again")?.addEventListener("click",()=>{unlockSound();if(labActive)labRestart();else{reset();begin();}});
  $("reset")?.addEventListener("click",()=>{unlockSound();if(labActive)labRestart();else{reset();begin();}});
  // 动态砖阵实验页：4 种模式 + 3 种战场一键选择。
  function labRefreshPicker(){
    for(const id of Object.keys(LAB.modes)){
      const b=$("lab-mode-"+id);if(!b)continue;
      b.classList.toggle("selected",id===labPickMode);
      b.setAttribute("aria-pressed",id===labPickMode?"true":"false");
    }
    for(const id of Object.keys(LAB.fields)){
      const b=$("lab-field-"+id);if(!b)continue;
      b.classList.toggle("selected",id===labPickField);
      b.setAttribute("aria-pressed",id===labPickField?"true":"false");
    }
    const current=$("labSelection");
    if(current)current.textContent=(LAB.modes[labPickMode]?.label||labPickMode)+" · "+(LAB.fields[labPickField]?.label||labPickField);
    const desc=$("labFieldDesc");
    if(desc)desc.textContent=LAB.fields[labPickField]?.desc||"";
  }
  for(const id of Object.keys(LAB.modes)){
    $("lab-mode-"+id)?.addEventListener("click",()=>{labPickMode=id;labRefreshPicker();unlockSound();});
  }
  for(const id of Object.keys(LAB.fields)){
    $("lab-field-"+id)?.addEventListener("click",()=>{labPickField=id;labRefreshPicker();unlockSound();});
  }
  $("labStartBtn")?.addEventListener("click",()=>{unlockSound();labStart(labPickMode,labPickField);});
  $("labRestartBtn")?.addEventListener("click",()=>{unlockSound();labRestart();});
  $("labMenuBtn")?.addEventListener("click",()=>{labReturnToMenu();});
  $("labResultRestart")?.addEventListener("click",()=>{unlockSound();labRestart();});
  $("labResultMenu")?.addEventListener("click",()=>{labReturnToMenu();});
  labRefreshPicker();
  document.addEventListener?.("visibilitychange",()=>{if(document.hidden)pause();accumulator=0;lastFrame=performance.now();});
  window.addEventListener("resize",()=>{accumulator=0;lastFrame=performance.now();});
  window.addEventListener("pagehide",()=>{pause();accumulator=0;lastFrame=performance.now();});
  window.addEventListener("keydown",e=>{
    if(phase==="paused"&&e.code==="Tab"){
      const focusable=Array.from($("pauseOverlay").querySelectorAll("button,input,select,[tabindex='0'],summary")).filter(el=>!el.disabled);
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}
      else if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}
      return;
    }
    if(e.code==="KeyP"||e.code==="Escape"){if(phase==="paused")resume();else pause();e.preventDefault();return;}
    if(phase!=="playing"||emptyLatch)return;
    if(e.code==="ArrowLeft"){aim=clamp(aim-.09,-1.08,1.08);e.preventDefault();}
    if(e.code==="ArrowRight"){aim=clamp(aim+.09,-1.08,1.08);e.preventDefault();}
    if(e.code==="Space"){fireGiant();e.preventDefault();}
  });
  function frame(now) {
    if(document.hidden&&["playing","choosing"].includes(phase))pause();
    const delta=document.hidden||phase==="paused"?0:clamp((now-lastFrame)/1000,0,.06);
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
        juice.setQuality(renderQuality);
        $("fpsStat").textContent="FPS "+fpsNow;
        metricsClock=0;frameSamples=0;
      }
    }
    draw();requestAnimationFrame(frame);
  }
  function snapshot() {
    return {quickLabActive,quickLabRoute,stormSweeps,childLocks,relayForks,focusBursts,focusStacks,needleShots,needlePasses,fanExtraShots,damageDealt,shotsWithContact,currentWaveMetrics:waveMetrics?{...waveMetrics,longestNoBreak:Math.max(waveMetrics.longestNoBreak,waveElapsed-waveMetrics.lastBreak)}:null,precisionTurns,focusDamage,gunBonusDamage,weakpointDamage,weakpointCharge,waveFallMultiplier,dangerGap:Number.isFinite(dangerGap())?+dangerGap().toFixed(1):null,waveStartGap:Number.isFinite(waveStartGap)?+waveStartGap.toFixed(1):null,nearDangerSeconds:+nearDangerSeconds.toFixed(2),pressureWarningStage,worldWidth:W,worldHeight:H,dangerY:DANGER_Y,shooterY:shooter.y,growthFocus:build.growthFocus,pausedFrom,battleTime,bankDamage,temporaryBuffs:build.temporaryBuffs.map(b=>({...b})),buildSummary:Build.summary(build),waveReports:waveReports.map(r=>({...r})),seed:build.seed,seedAbility:build.seedAbility,coreFocus:build.coreFocus,coreBranch:build.coreBranch,ranks:{...build.ranks},routeWeights:{...build.routeWeights},
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
      bonusVolleyBalls,homingTurns,shockWaves,directBreaks,soundVolume,impactHaptics,
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
      selectSeed,quickStart,returnToQuickMenu,fire,makeTestBall:makeBallTest,ballDetails(){return balls.map(b=>({...b}));},
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
      isSoundRunning(){return soundContext?.state==="running";}
    };
  }
  if (window.__PINBALL_TEST__ === true) {
    window.__pinballLabTest = {
      start:labStart,restart:labRestart,menu:labReturnToMenu,
      stats:labSnapshot,config:()=>LAB,
      setAim(v){aim=clamp(v,-1.08,1.08);},
      bricks(){return bricks.map(b=>({id:b.id,x:b.x,y:b.y,w:b.w,h:b.h,hp:b.hp,alive:b.alive,armored:b.armored}));},
      balls(){return balls.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,r:b.r,life:b.life,maxLife:b.maxLife,source:b.labSource||null,charge:!!b.labCharge}));},
      setBrickHp(id,hp){const b=bricks.find(x=>x.id===id);if(!b)return false;b.hp=hp;b.initialHp=hp;b.armored=hp>1;b.cracked=false;b.color=brickColor(hp,b.special);return true;},
      hit(id,source="normal",points=1){const b=bricks.find(x=>x.id===id);return b?hitBrick(b,source,null,points):false;},
      forceBreak(id){const b=bricks.find(x=>x.id===id);if(!b)return false;const before=b.hp;b.hp=0;b.alive=false;score++;return before;},
      addBall(x,y,vx,vy,source="cannon"){const a=Math.atan2(vx,-vy);const ball=makeBall(a);Object.assign(ball,{x,y,vx,vy,labSource:source});balls.push(ball);return balls.length;},
      setCharge(v){charge=clamp(v,0,MAX_CHARGE);},
      setShootClock(v){shootClock=v;},
      keepOnlyBrick(id){bricks.forEach(b=>{if(b.id!==id)b.alive=false;});},
      setElapsed(t){elapsed=t;},
      fillBalls(n){balls=Array.from({length:Math.min(n,MAX_BALLS)},(_,i)=>{const b=makeBall(0,i%2===0);b.life=i*.01;b.labSource=i%2?"bloom":"cannon";return b;});},
      clearBricks(){bricks.forEach(b=>b.alive=false);}
    };
  }
  function makeBallTest(mini=false){return makeBall(0,mini);}
  reset();lastFrame=performance.now();requestAnimationFrame(frame);
  // QA / screenshot entry: ?mode=S1&scenario=dense 自动进入实验；不改变正常菜单入口。
  try{
    const params=new URLSearchParams(location.search),mode=params.get("mode"),scenario=params.get("scenario");
    const field=params.get("field")||params.get("scenario");
    if(mode&&LAB.modes[mode])labStart(mode,LAB.fields[field]?field:"A");
  }catch(_){}
})();
