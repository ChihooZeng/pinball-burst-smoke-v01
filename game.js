"use strict";
(() => {
  const W = 360, H = 560, MAX_WAVES = 3;
  const INITIAL_INTERVAL = 1.0, MIN_INTERVAL = 0.36, RATE_STEP = 0.16;
  const MAX_ACTIVE_BALLS = 28, BALL_SPEED = 355, BALL_TTL = 7.0;
  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const ui = {
    score: document.querySelector("#score"),
    wave: document.querySelector("#wave"),
    rate: document.querySelector("#rate"),
    balls: document.querySelector("#balls"),
    state: document.querySelector("#stateText"),
    mode: document.querySelector("#mode"),
    overlay: document.querySelector("#overlay"),
    final: document.querySelector("#finalStats")
  };
  const shooter = {x: W / 2, y: H - 38};
  const palette = ["#448fca", "#3eaaa5", "#8b73cf", "#c48e59", "#597fa8"];
  let bricks, balls, drops, particles, aim, activePointer, wave, score;
  let gameWon, mode = "instant", interval, elapsed, shootClock, upgrades, lastFrame, audio;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const setState = s => { ui.state.textContent = s; };

  function beep(freq = 380, duration = 0.04, gainValue = .025) {
    try {
      // Mobile audio is often muted until the first user interaction.
      if (!audio) return;
      if (audio.state === "suspended") audio.resume();
      const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * .65), now + duration);
      gain.gain.setValueAtTime(gainValue, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(now + duration);
    } catch (_) {}
  }
  function enableSound() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch (_) {}
  }

  function spawnWave(number) {
    bricks = [];
    const rows = 2 + number, cols = 5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const special = (r === 0 && c === (number % 2 ? 2 : 1))
        || (r === rows - 1 && c === (number % 2 ? 0 : 4));
      bricks.push({
        x: 23 + c * 64, y: 62 + r * 41, w: 57, h: 32,
        alive: true, special, color: special ? "#47d89d" : palette[r % palette.length]
      });
    }
    ui.wave.textContent = String(number);
    setState(number === 1 ? "自动开火中 · 拖动调整方向" : "第 " + number + " 波 · 持续射击");
  }
  function reset() {
    balls = []; drops = []; particles = []; score = 0; aim = 0; activePointer = null;
    wave = 1; upgrades = 0; elapsed = 0; shootClock = INITIAL_INTERVAL - .25;
    interval = INITIAL_INTERVAL; gameWon = false;
    ui.score.textContent = "0"; ui.rate.textContent = interval.toFixed(2);
    ui.balls.textContent = "0"; ui.overlay.classList.add("hidden");
    ui.mode.textContent = mode === "instant" ? "升级方式：直接升级" : "升级方式：掉落拾取";
    spawnWave(1);
  }
  function setAimFromPointer(e) {
    const r = canvas.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) * W / r.width, 0, W);
    // Horizontal movement controls launch direction; vertical movement is ignored.
    aim = clamp((x - W / 2) / (W / 2) * 1.08, -1.08, 1.08);
  }
  function fire() {
    if (gameWon || balls.length >= MAX_ACTIVE_BALLS) return;
    balls.push({
      x: shooter.x, y: shooter.y - 25,
      vx: Math.sin(aim) * BALL_SPEED, vy: -Math.cos(aim) * BALL_SPEED,
      r: 6.5, life: 0, trail: []
    });
    beep(240, .02, .008);
  }
  function burst(x, y, color, count = 7) {
    for (let i = 0; i < count; i++) {
      const t = Math.random() * Math.PI * 2, speed = 35 + Math.random() * 105;
      particles.push({x, y, vx: Math.cos(t) * speed, vy: Math.sin(t) * speed,
        life: .36, color});
    }
  }
  function applyUpgrade() {
    upgrades++;
    const old = interval;
    interval = Math.max(MIN_INTERVAL, Number((interval - RATE_STEP).toFixed(2)));
    ui.rate.textContent = interval.toFixed(2);
    // Make the rate increase audible/visible without pausing combat.
    burst(shooter.x, shooter.y - 42, "#64f8cb", 22);
    if (interval < old) {
      shootClock = Math.min(shootClock, interval);
      setState("射速提升！" + interval.toFixed(2) + " 秒 / 颗");
      beep(820, .09, .045);
    } else {
      setState("已达到射速上限");
    }
  }
  function win() {
    gameWon = true;
    ui.final.textContent = "击碎 " + score + " 块 · 射速 " + interval.toFixed(2) + " 秒/颗";
    ui.overlay.classList.remove("hidden");
    setState("三波已完成，点击再玩一局");
    beep(740, .13, .04);
  }
  function breakBrick(brick) {
    brick.alive = false;
    score++;
    ui.score.textContent = String(score);
    burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, brick.special ? 15 : 6);
    beep(brick.special ? 600 : 350 + Math.min(score * 8, 200), .055, brick.special ? .038 : .024);
    if (brick.special) {
      if (mode === "instant") applyUpgrade();
      else drops.push({x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, vy: 320});
    }
    if (bricks.every(b => !b.alive)) {
      // Resolve on the next update so all active balls remain in the simulation.
      if (wave >= MAX_WAVES) win();
      else spawnWave(++wave);
    }
  }
  function simulateBall(b, dt) {
    const substeps = 4, step = dt / substeps;
    for (let k = 0; k < substeps; k++) {
      const prevX = b.x, prevY = b.y;
      b.x += b.vx * step; b.y += b.vy * step;
      if (b.x < b.r) {b.x = b.r; b.vx = Math.abs(b.vx);}
      if (b.x > W - b.r) {b.x = W - b.r; b.vx = -Math.abs(b.vx);}
      if (b.y < b.r + 4) {b.y = b.r + 4; b.vy = Math.abs(b.vy);}
      for (const brick of bricks) {
        if (!brick.alive) continue;
        const cx = clamp(b.x, brick.x, brick.x + brick.w);
        const cy = clamp(b.y, brick.y, brick.y + brick.h);
        const dx = b.x - cx, dy = b.y - cy;
        if (dx * dx + dy * dy > b.r * b.r) continue;
        const side = prevX + b.r <= brick.x || prevX - b.r >= brick.x + brick.w;
        if (side) {b.vx = -b.vx; b.x = prevX;}
        else {b.vy = -b.vy; b.y = prevY;}
        breakBrick(brick);
        // A single ball impacts at most one brick per substep.
        break;
      }
      if (gameWon) break;
    }
    b.life += dt;
    b.trail.unshift({x: b.x, y: b.y});
    if (b.trail.length > 8) b.trail.pop();
    return b.y < H + 12 && b.life < BALL_TTL;
  }
  function update(dt) {
    if (gameWon) return;
    elapsed += dt;
    shootClock += dt;
    // Independent of balls returning. This is the key gameplay change.
    if (shootClock >= interval) {
      shootClock -= interval;
      fire();
    }
    balls = balls.filter(b => simulateBall(b, dt));
    // Loot does not require movement or a second control.
    for (const drop of drops) {
      drop.y += drop.vy * dt;
      if (drop.y >= shooter.y - 35) {
        drop.collected = true;
        applyUpgrade();
      }
    }
    drops = drops.filter(d => !d.collected);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= .97; p.vy *= .97; p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
    ui.balls.textContent = String(balls.length);
  }
  function roundedRect(x, y, w, h, radius) {
    ctx.beginPath();ctx.roundRect(x, y, w, h, radius);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1c34"); bg.addColorStop(1, "#0b1323");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#ffffff08"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (const brick of bricks) {
      if (!brick.alive) continue;
      ctx.shadowColor = brick.color; ctx.shadowBlur = 7;
      ctx.fillStyle = brick.color; roundedRect(brick.x, brick.y, brick.w, brick.h, 6); ctx.fill();
      ctx.shadowBlur = 0;
      if (brick.special) {
        ctx.fillStyle = "#064832"; ctx.textAlign = "center";
        ctx.font = "bold 10px system-ui"; ctx.fillText("↑ SPEED", brick.x + brick.w/2, brick.y + 20);
      } else {
        ctx.fillStyle = "#ffffff44";
        roundedRect(brick.x + 4, brick.y + 4, brick.w - 8, 4, 2); ctx.fill();
      }
    }
    ctx.fillStyle = "#9bbad23d"; ctx.fillRect(0, H - 78, W, 1);
    for (const drop of drops) {
      ctx.shadowColor = "#6fffc6"; ctx.shadowBlur = 12;
      ctx.fillStyle = "#43d8a2"; roundedRect(drop.x - 19, drop.y - 10, 38, 20, 7); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#053e2c"; ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center"; ctx.fillText("SPEED", drop.x, drop.y + 3);
    }
    if (!gameWon) {
      ctx.save(); ctx.setLineDash([7, 8]); ctx.lineWidth = 2;
      ctx.strokeStyle = "#9eeaff88"; ctx.beginPath();
      ctx.moveTo(shooter.x, shooter.y - 17);
      ctx.lineTo(shooter.x + Math.sin(aim) * 215, shooter.y - 17 - Math.cos(aim) * 215);
      ctx.stroke(); ctx.restore();
    }
    for (const b of balls) {
      for (let i = b.trail.length - 1; i >= 0; i--) {
        const p = b.trail[i], alpha = (b.trail.length - i) / b.trail.length;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, b.r * alpha * .7), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(116,230,255," + (.14 * alpha) + ")"; ctx.fill();
      }
      ctx.shadowColor = "#b9f2ff"; ctx.shadowBlur = 14; ctx.fillStyle = "#edfdff";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / .36, 0, 1);
      ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(shooter.x, shooter.y); ctx.rotate(aim);
    ctx.shadowColor = "#62ebff"; ctx.shadowBlur = 17; ctx.fillStyle = "#398eab";
    roundedRect(-15, -10, 30, 29, 9); ctx.fill();
    ctx.fillStyle = "#b9efff"; roundedRect(-5, -28, 10, 26, 4); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#a4bdcf"; ctx.textAlign = "center"; ctx.font = "12px system-ui";
    ctx.fillText(gameWon ? "通关！" : "炮台自动发射中 · 左右滑动瞄准", W / 2, H - 10);
  }

  canvas.addEventListener("pointerdown", e => {
    if (gameWon) return;
    e.preventDefault(); enableSound(); activePointer = e.pointerId;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    setAimFromPointer(e);
  });
  canvas.addEventListener("pointermove", e => {
    if (gameWon || e.pointerId !== activePointer) return;
    e.preventDefault(); setAimFromPointer(e);
  });
  function endDrag(e) {
    if (e.pointerId === activePointer) {
      activePointer = null; // Release only stops aiming, never triggers a shot.
    }
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  document.querySelector("#reset").addEventListener("click", () => {enableSound();reset();});
  document.querySelector("#again").addEventListener("click", () => {enableSound();reset();});
  ui.mode.addEventListener("click", () => {
    enableSound();
    mode = mode === "instant" ? "drop" : "instant";
    reset(); // Both modes start at identical values for a fair feel comparison.
  });
  window.addEventListener("keydown", e => {
    if (e.code === "ArrowLeft") {aim = clamp(aim - .09, -1.08, 1.08); e.preventDefault();}
    if (e.code === "ArrowRight") {aim = clamp(aim + .09, -1.08, 1.08); e.preventDefault();}
  });
  function frame(now) {
    const dt = document.hidden ? 0 : clamp((now - lastFrame) / 1000, 0, .045);
    lastFrame = now;
    update(dt); draw(); requestAnimationFrame(frame);
  }
  // Read-only instrumentation used by regression tests.
  window.__pinballSmoke = () => ({
    wave, score, mode, aim, interval, activeBalls: balls.length,
    upgrades, hasWon: gameWon, elapsed, drops: drops.length
  });
  reset(); lastFrame = performance.now(); requestAnimationFrame(frame);
})();
