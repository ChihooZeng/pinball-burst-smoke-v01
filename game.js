"use strict";
(() => {
  const W = 360, H = 560, MAX_WAVES = 3;
  const INITIAL_INTERVAL = 1, RATE_VALUES = [1, 0.9, 0.82];
  const MAX_BALLS = 20, BALL_SPEED = 355, BALL_TTL = 6.8, MAX_CHARGE = 100;
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
  let phase, charge, rateLevel, ricochetLevel, shootClock, elapsed;
  let skillsUsed, ricochetTriggers, lastFrame, soundContext;
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
    ui.giant.textContent = charge >= MAX_CHARGE ? (giant ? "巨型球正在贯穿…" : "释放巨型贯穿球") : ("巨型球充能中 · " + Math.floor(charge) + "%");
    ui.build.textContent = "强化：射速 Lv." + rateLevel + " · 折射 Lv." + ricochetLevel;
  }
  function generateWave(n) {
    bricks = [];
    const rows = 2 + n;
    for (let r = 0; r < rows; r++) for (let c = 0; c < 5; c++) {
      // One instantly rewarding energy block in each wave.
      const special = r === 0 && c === (n % 2 === 1 ? 2 : 1);
      bricks.push({
        id: n * 100 + r * 5 + c, x: 23 + c * 64, y: 67 + r * 41,
        w: 57, h: 32, alive: true, special,
        color: special ? "#4ac99c" : palette[(r + n - 1) % palette.length]
      });
    }
    setState(n === 1 ? "炮台自动发射 · 拖动瞄准" : "第 " + n + " 波 · 寻找新的弹道");
  }
  function reset() {
    wave = 1; score = 0; phase = "playing"; charge = 0; rateLevel = 0; ricochetLevel = 0;
    shootClock = .76; elapsed = 0; skillsUsed = 0; ricochetTriggers = 0;
    aim = 0; activePointer = null; balls = []; particles = []; giant = null;
    ui.choice.classList.add("hidden"); ui.win.classList.add("hidden");
    generateWave(wave); updateUI();
  }
  function addCharge(n) {
    charge = clamp(charge + n, 0, MAX_CHARGE);
  }
  function burst(x, y, color, n = 9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, speed = 32 + Math.random() * 105;
      particles.push({x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .42, color});
    }
  }
  function hitBrick(b, source = "normal") {
    if (!b.alive) return;
    b.alive = false; score++;
    burst(b.x + b.w / 2, b.y + b.h / 2, b.color, source === "giant" ? 15 : 8);
    // Giant impacts (including energy bricks) never refill the giant itself.
    if (source !== "giant") addCharge((b.special ? 34 : 7));
    if (b.special && source !== "giant") { setState("ENERGY 特殊砖已击碎 · 巨型球充能！"); beep(660, .09); }
    else beep(source === "giant" ? 240 : 320 + Math.min(score * 8, 180), .035, .022);
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
    burst(center.x, center.y, "#a1edff", 14); beep(800, .075, .037);
    setState("折射溅射！利用侧墙提高破坏力");
  }
  function fire() {
    if (phase !== "playing" || balls.length >= MAX_BALLS) return;
    balls.push({
      x: shooter.x, y: shooter.y - 28, vx: Math.sin(aim) * BALL_SPEED,
      vy: -Math.cos(aim) * BALL_SPEED, r: 6.5, life: 0, trail: [],
      wallArmed: false, splashUsed: false
    });
    beep(235, .018, .007);
  }
  function fireGiant() {
    if (phase !== "playing" || charge < MAX_CHARGE || giant) return false;
    unlockSound();
    charge = 0; skillsUsed++;
    giant = {
      x: shooter.x, y: shooter.y - 27, vx: Math.sin(aim) * 800,
      vy: -Math.cos(aim) * 800, r: 17, life: 0
    };
    burst(shooter.x, shooter.y - 27, "#ffd482", 24);
    beep(175, .18, .05); setState("巨型贯穿弹珠！"); updateUI();
    return true;
  }
  function circleIntersectsRect(x, y, radius, b) {
    const px = clamp(x, b.x, b.x + b.w);
    const py = clamp(y, b.y, b.y + b.h);
    return (x - px) ** 2 + (y - py) ** 2 <= radius * radius;
  }
  function updateBall(b, dt) {
    const step = dt / 4;
    for (let i = 0; i < 4; i++) {
      const prevX = b.x, prevY = b.y;
      b.x += b.vx * step; b.y += b.vy * step;
      if (b.x < b.r) {
        b.x = b.r; b.vx = Math.abs(b.vx); b.wallArmed = true;
      }
      if (b.x > W - b.r) {
        b.x = W - b.r; b.vx = -Math.abs(b.vx); b.wallArmed = true;
      }
      if (b.y < b.r + 4) { b.y = b.r + 4; b.vy = Math.abs(b.vy); }
      for (const block of bricks) {
        if (!block.alive || !circleIntersectsRect(b.x, b.y, b.r, block)) continue;
        const side = prevX + b.r <= block.x || prevX - b.r >= block.x + block.w;
        if (side) { b.vx *= -1; b.x = prevX; }
        else { b.vy *= -1; b.y = prevY; }
        const center = {x: block.x + block.w/2, y: block.y + block.h/2};
        hitBrick(block);
        splashFrom(b, center);
        break;
      }
    }
    b.life += dt;
    b.trail.unshift({x:b.x, y:b.y});
    if (b.trail.length > 9) b.trail.pop();
    return b.y < H + 10 && b.life < BALL_TTL;
  }
  function updateGiant(dt) {
    if (!giant) return;
    // Substeps prevent tunneling through the thin brick rows.
    const subs = Math.max(4, Math.ceil(dt * 800 / 7));
    for (let i = 0; i < subs; i++) {
      giant.x += giant.vx * dt / subs;
      giant.y += giant.vy * dt / subs;
      for (const block of bricks) {
        if (block.alive && circleIntersectsRect(giant.x, giant.y, giant.r, block)) {
          hitBrick(block, "giant");
        }
      }
    }
    giant.life += dt;
    if (giant.x < -30 || giant.x > W + 30 || giant.y < -35 || giant.life > 1.25) giant = null;
  }
  function finishWave() {
    if (phase !== "playing") return;
    // Stop attacks during selection so old balls cannot clear the next wave.
    balls = []; giant = null; shootClock = 0;
    if (wave === MAX_WAVES) {
      phase = "won"; ui.win.classList.remove("hidden");
      ui.final.textContent = "击碎 " + score + " 块 · " + skillsUsed + " 次巨型球 · 折射触发 " + ricochetTriggers + " 次";
      setState("三波完成"); beep(710, .16, .045);
    } else {
      phase = "choosing"; ui.choice.classList.remove("hidden");
      ui.choiceWave.textContent = "WAVE " + wave + " CLEAR";
      ui.rateDetails.textContent = rateLevel === 0 ? "1.00 → 0.90 秒/颗" : "0.90 → 0.82 秒/颗";
      ui.bounceDetails.textContent = ricochetLevel === 0 ?
        "侧墙反弹后首次击砖，额外击碎邻近 1 块" :
        "折射半径更大，最多额外击碎 3 块";
      setState("波次完成 · 请选择强化");
    }
    updateUI();
  }
  function chooseUpgrade(kind) {
    if (phase !== "choosing") return false;
    if (kind === "rate") rateLevel = Math.min(2, rateLevel + 1);
    else if (kind === "bounce") ricochetLevel = Math.min(2, ricochetLevel + 1);
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
    updateGiant(dt);
    if (bricks.every(b => !b.alive)) finishWave();
    particles.forEach(p => {p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt;});
    particles = particles.filter(p => p.life > 0);
    updateUI();
  }
  function rounded(x,y,w,h,r) {ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function draw() {
    ctx.clearRect(0,0,W,H);
    const bg = ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,"#0c2039");bg.addColorStop(1,"#081526");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#ffffff08";ctx.lineWidth=1;
    for(let x=0;x<W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    for(const brick of bricks){
      if(!brick.alive) continue;
      ctx.shadowColor=brick.color;ctx.shadowBlur=7;ctx.fillStyle=brick.color;
      rounded(brick.x,brick.y,brick.w,brick.h,5);ctx.fill();ctx.shadowBlur=0;
      if(brick.special){
        ctx.fillStyle="#073e2b";ctx.font="bold 10px system-ui";ctx.textAlign="center";
        ctx.fillText("ENERGY",brick.x+brick.w/2,brick.y+21);
      }else{
        ctx.fillStyle="#ffffff3f";rounded(brick.x+4,brick.y+3,brick.w-8,4,2);ctx.fill();
      }
    }
    ctx.fillStyle="#93b6d23d";ctx.fillRect(0,H-78,W,1);
    if(phase==="playing"){
      ctx.save();ctx.setLineDash([6,8]);ctx.lineWidth=2;ctx.strokeStyle="#9eeaff88";
      ctx.beginPath();ctx.moveTo(shooter.x,shooter.y-17);
      ctx.lineTo(shooter.x+Math.sin(aim)*220,shooter.y-17-Math.cos(aim)*220);
      ctx.stroke();ctx.restore();
    }
    for(const b of balls){
      b.trail.forEach((p,i)=>{const t=1-i/b.trail.length;ctx.fillStyle="rgba(139,224,250,"+(.13*t)+")";
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,b.r*t*.7),0,Math.PI*2);ctx.fill();});
      ctx.shadowColor=b.wallArmed && ricochetLevel ? "#b3abff" : "#b9f2ff";
      ctx.shadowBlur=14;ctx.fillStyle=b.wallArmed && ricochetLevel ? "#e3d9ff" : "#edfaff";
      ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    if(giant){
      ctx.save();ctx.strokeStyle="#ffe1a36b";ctx.lineWidth=28;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(giant.x-giant.vx*.09,giant.y-giant.vy*.09);ctx.lineTo(giant.x,giant.y);ctx.stroke();
      ctx.shadowColor="#ffca62";ctx.shadowBlur=25;ctx.fillStyle="#ffd87c";
      ctx.beginPath();ctx.arc(giant.x,giant.y,giant.r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff1c7";ctx.beginPath();ctx.arc(giant.x-4,giant.y-5,6,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.42,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);}
    ctx.globalAlpha=1;
    ctx.save();ctx.translate(shooter.x,shooter.y);ctx.rotate(aim);
    ctx.shadowColor="#5be9fb";ctx.shadowBlur=16;ctx.fillStyle="#398ba4";
    rounded(-15,-10,30,30,9);ctx.fill();ctx.fillStyle="#b7edff";
    rounded(-5,-29,10,27,4);ctx.fill();ctx.restore();
    ctx.fillStyle="#a6c5d9";ctx.textAlign="center";ctx.font="12px system-ui";
    ctx.fillText(phase==="choosing"?"选择强化以继续":phase==="won"?"通关！":"持续发射 · 滑动瞄准 · 手动释放巨型球",W/2,H-10);
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
  $("pickRate").addEventListener("click",()=>{unlockSound();chooseUpgrade("rate");});
  $("pickBounce").addEventListener("click",()=>{unlockSound();chooseUpgrade("bounce");});
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
      charge,activeBalls:balls.length,giantActive:!!giant,skillsUsed,ricochetTriggers,elapsed};
  }
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
      reset
    };
  }
  reset();lastFrame=performance.now();requestAnimationFrame(frame);
})();
