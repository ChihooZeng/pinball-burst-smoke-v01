/* ============================================================================
   特殊砖美术预览 V1.0 · 弹珠超载
   参数与 demo/v1/game.js 的 BRICK_ART 同源（提交 89c9074）。
   本文件只做预览渲染，不接入游戏、不改任何玩法数值。
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- 1. 视觉规范（与正式游戏一致） ---------- */
  const BW = 29, BH = 22, RADIUS = 4;

  const RAMP = [
    { max: 1, edge: "#3DE8D2", ft: "#04928A", fb: "#025558" },
    { max: 3, edge: "#57F2E2", ft: "#038F83", fb: "#035557" },
    { max: 5, edge: "#4FD6FA", ft: "#0273A9", fb: "#033E65" },
    { max: 10, edge: "#3FDBFF", ft: "#036CBC", fb: "#023E74" },
    { max: 20, edge: "#8CB8FF", ft: "#0D4CDA", fb: "#072B81" },
    { max: 40, edge: "#C08FFF", ft: "#5C23CF", fb: "#341981" },
    { max: 80, edge: "#F79BFA", ft: "#AA2190", fb: "#63175E" },
    { max: 1e9, edge: "#FFB6F2", ft: "#B02481", fb: "#6E1C59" }
  ];

  const SPECIAL = {
    normal: { edge: "#3DE8D2", ft: "#04928A", fb: "#025558", border: 1.3, blur: 8 },
    energy: { edge: "#4BEB9B", ft: "#0FA765", fb: "#0B5638", border: 1.3, blur: 8 },
    elite: { edge: "#C39BFF", ft: "#6B2FD0", fb: "#44218A", border: 1.6, blur: 10 },
    summon: { edge: "#4FC6FF", ft: "#0A78B8", fb: "#075A85", border: 1.3, blur: 8 }
  };

  // 图标占位：7×7 逻辑单位，与数字之间 2 单位
  const ICON = 7, ICON_GAP = 2;

  // 砖阵布局（与 demo/v1/game.js L74 一致）
  const LAYOUT = { cols: 9, stepX: 38.5, stepY: 31, startY: 84 };

  function styleOf(kind, hp) {
    if (kind === "energy" || kind === "elite" || kind === "summon") return SPECIAL[kind];
    for (let i = 0; i < RAMP.length; i++) if (hp <= RAMP[i].max) return RAMP[i];
    return RAMP[RAMP.length - 1];
  }

  /* ---------- 2. 基础绘制件 ---------- */
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else {
      const k = Math.min(r, w / 2, h / 2);
      c.moveTo(x + k, y);
      c.arcTo(x + w, y, x + w, y + h, k);
      c.arcTo(x + w, y + h, x, y + h, k);
      c.arcTo(x, y + h, x, y, k);
      c.arcTo(x, y, x + w, y, k);
      c.closePath();
    }
  }

  // 砖块本体：渐变填充 + 外发光 + 顶部高光 + 霓虹描边
  function drawTile(c, x, y, s, st, opts) {
    opts = opts || {};
    const w = BW * s, h = BH * s, r = RADIUS * s;

    c.save();
    c.shadowColor = st.edge;
    c.shadowBlur = (st.blur || 8) * s * (opts.glowScale || 1);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, st.ft);
    g.addColorStop(1, st.fb);
    c.fillStyle = g;
    rr(c, x, y, w, h, r);
    c.fill();
    c.restore();

    // 内发光（精英砖专用，轻微呼吸）
    if (opts.innerGlow > 0) {
      c.save();
      const ig = c.createRadialGradient(x + w / 2, y + h * 0.46, 0, x + w / 2, y + h * 0.46, w * 0.62);
      ig.addColorStop(0, hexA(st.edge, 0.20 * opts.innerGlow));
      ig.addColorStop(1, "rgba(0,0,0,0)");
      c.globalCompositeOperation = "lighter";
      c.fillStyle = ig;
      rr(c, x + s, y + s, w - 2 * s, h - 2 * s, Math.max(1, r - s));
      c.fill();
      c.restore();
    }

    // 顶部内侧高光
    c.save();
    c.globalAlpha = 0.13;
    c.fillStyle = "#ffffff";
    rr(c, x + 1.6 * s, y + 1.4 * s, w - 3.2 * s, Math.min(5.5 * s, h * 0.28), Math.max(1, r - s));
    c.fill();
    c.restore();

    // 霓虹描边
    c.save();
    c.strokeStyle = st.edge;
    c.lineWidth = (st.border || 1.3) * s;
    rr(c, x + 0.65 * s, y + 0.65 * s, w - 1.3 * s, h - 1.3 * s, r);
    c.stroke();
    c.restore();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ---------- 3. 图标（归一化 -1..1，按半径 scale） ---------- */
  // 闪电：三段折线，笔画实心，重心居中
  function iconEnergy(c, cx, cy, rad, s, alpha) {
    c.save();
    c.translate(cx, cy);
    c.scale(rad, rad);
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.fillStyle = "#EAFFF6";
    c.beginPath();
    c.moveTo(0.42, -1);
    c.lineTo(-0.78, -0.06);
    c.lineTo(-0.12, -0.06);
    c.lineTo(-0.44, 1);
    c.lineTo(0.78, 0.02);
    c.lineTo(0.12, 0.02);
    c.closePath();
    c.fill();
    c.restore();
  }

  // 菱形：实心 + 中心镂空小菱形，比纯实心更"标识"
  function iconElite(c, cx, cy, rad, s, alpha) {
    c.save();
    c.translate(cx, cy);
    c.scale(rad, rad);
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.fillStyle = "#F4EBFF";
    c.beginPath();
    c.moveTo(0, -1);
    c.lineTo(0.8, 0);
    c.lineTo(0, 1);
    c.lineTo(-0.8, 0);
    c.closePath();
    c.fill();
    // 镂空
    c.globalCompositeOperation = "destination-out";
    c.beginPath();
    c.moveTo(0, -0.44);
    c.lineTo(0.34, 0);
    c.lineTo(0, 0.44);
    c.lineTo(-0.34, 0);
    c.closePath();
    c.fill();
    c.restore();
  }

  // 双层圆环：外环粗、内环细，代表召唤/空间能量
  function iconSummon(c, cx, cy, rad, s, alpha, pulse) {
    c.save();
    c.translate(cx, cy);
    c.scale(rad, rad);
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.strokeStyle = "#E8FBFF";
    c.globalAlpha *= 1;
    const k = pulse == null ? 1 : pulse;
    c.lineWidth = 0.26 / Math.max(0.6, k);
    c.beginPath();
    c.arc(0, 0, 0.92 * k, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 0.19 / Math.max(0.6, k);
    c.beginPath();
    c.arc(0, 0, 0.46, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  function drawIcon(c, kind, cx, cy, rad, s, t) {
    if (kind === "energy") {
      const a = 0.78 + 0.22 * Math.sin(t * 2.6); // 呼吸 2.4s
      iconEnergy(c, cx, cy, rad, s, a);
    } else if (kind === "elite") {
      iconElite(c, cx, cy, rad, s, 1);
    } else if (kind === "summon") {
      const p = 0.9 + 0.12 * Math.sin(t * 3.14); // 环脉冲 2.0s
      iconSummon(c, cx, cy, rad, s, 1, p);
    }
  }

  /* ---------- 4. 砖块 + 图标 + 数字（整体居中） ---------- */
  function drawBrick(c, x, y, s, kind, hp, t) {
    const st = styleOf(kind, hp);
    const innerGlow = kind === "elite" ? 0.72 + 0.28 * Math.sin(t * 2.1) : 0;
    drawTile(c, x, y, s, st, { innerGlow: innerGlow });

    const w = BW * s, h = BH * s;
    const showNum = kind !== "energy";
    const numTxt = showNum ? String(hp) : "";

    c.save();
    c.font = "900 " + (11.5 * s) + "px system-ui,-apple-system,sans-serif";
    c.textAlign = "left";
    c.textBaseline = "middle";
    const numW = showNum ? c.measureText(numTxt).width : 0;

    let iconU = ICON, numSize = 11.5;
    // 3 位数等极端情况：缩图标与字号，保证不贴边、不压数字（不放大砖块）
    if (showNum && ICON * s + ICON_GAP * s + numW > w - 4 * s) {
      iconU = 6; numSize = 10;
      c.font = "900 " + (numSize * s) + "px system-ui,-apple-system,sans-serif";
    }
    const numW2 = showNum ? c.measureText(numTxt).width : 0;
    const total = showNum ? iconU * s + ICON_GAP * s + numW2 : iconU * s;
    let cx = x + (w - total) / 2;
    const cy = y + h / 2;

    drawIcon(c, kind, cx + (iconU * s) / 2, cy, (iconU * s) / 2 * 0.92, s, t);

    if (showNum) {
      c.shadowColor = "rgba(0,7,16,.42)";
      c.shadowBlur = 2 * s;
      c.shadowOffsetY = 0.6 * s;
      c.fillStyle = "#ffffff";
      c.fillText(numTxt, cx + iconU * s + ICON_GAP * s, y + h / 2 + 0.4 * s);
    }
    c.restore();
  }

  /* ---------- 5. 画布工具 ---------- */
  function setupCanvas(el, cssW, cssH, dpr) {
    dpr = dpr || Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(cssW * dpr);
    el.height = Math.round(cssH * dpr);
    el.style.height = cssH + "px";
    el.style.width = cssW + "px";
    const c = el.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cssW, cssH);
    return c;
  }

  // 战斗区背景：深蓝网格，和游戏内一致的气氛
  function drawFieldBg(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#08182a");
    g.addColorStop(1, "#050f1c");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.save();
    c.strokeStyle = "rgba(90,180,210,.055)";
    c.lineWidth = 1;
    for (let x = 0; x < w; x += 26) {
      c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke();
    }
    for (let y = 0; y < h; y += 26) {
      c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); c.stroke();
    }
    c.restore();
  }

  function label(c, text, x, y, color, size, align) {
    c.save();
    c.font = "800 " + (size || 10) + "px system-ui,sans-serif";
    c.textAlign = align || "center";
    c.textBaseline = "middle";
    c.fillStyle = color || "#7fa4bb";
    c.fillText(text, x, y);
    c.restore();
  }

  /* ---------- 6. 区块 1：横向对照 ---------- */
  const CELLS = [
    { kind: "normal", hp: 1, name: "普通砖 · HP1" },
    { kind: "normal", hp: 16, name: "普通砖 · HP16" },
    { kind: "energy", hp: 1, name: "能量砖 · 闪电" },
    { kind: "elite", hp: 32, name: "精英砖 · 菱形" },
    { kind: "summon", hp: 14, name: "召唤砖 · 双环" }
  ];

  let cvCompare, cvDetail, cvField, cvPhone;
  let animOn = true;
  const start = performance.now();

  function now() { return animOn ? (performance.now() - start) / 1000 : 0; }

  function renderCompare() {
    const el = cvCompare;
    const cssW = el.parentElement.clientWidth - 28;
    const cellW = cssW / CELLS.length;
    const sBig = Math.max(1.5, Math.min(4, (cellW - 26) / BW));
    const row1Y = 8;
    const row2Y = row1Y + BH * sBig + 24;
    const cssH = row2Y + BH + 26;
    const c = setupCanvas(el, cssW, cssH);
    const t = now();

    CELLS.forEach((cell, i) => {
      const cx = i * cellW + cellW / 2;
      // 上行：放大细节
      drawBrick(c, cx - (BW * sBig) / 2, row1Y, sBig, cell.kind, cell.hp, t);
      // 下行：1× 实际尺寸
      drawBrick(c, cx - BW / 2, row2Y, 1, cell.kind, cell.hp, t);
      label(c, cell.name, cx, row2Y + BH + 11, "#9fc3d8", 9.5);
    });


  }

  /* ---------- 7. 区块 2：图标细节 6× ---------- */
  function renderDetail() {
    const el = cvDetail;
    const cssW = el.parentElement.clientWidth - 28;
    const cellW = cssW / 3;
    const s = Math.max(3, Math.min(6, (cellW - 16) / BW));
    const cssH = BH * s + 46;
    const c = setupCanvas(el, cssW, cssH);
    const t = now();
    const items = [
      { kind: "energy", hp: 1, name: "能量砖" },
      { kind: "elite", hp: 32, name: "精英砖" },
      { kind: "summon", hp: 14, name: "召唤砖" }
    ];
    items.forEach((it, i) => {
      const cx = i * cellW + cellW / 2;
      const bx = cx - (BW * s) / 2;
      drawBrick(c, bx, 8, s, it.kind, it.hp, t);
      label(c, it.name, cx, 8 + BH * s + 15, "#9fc3d8", 11);
    });
  }

  /* ---------- 8. 区块 3：实际尺寸混排 ---------- */
  function renderField() {
    const el = cvField;
    const { cols, stepX, stepY } = LAYOUT;
    const rows = 5;
    const pad = 12;
    const gridW = (cols - 1) * stepX + BW;
    const cssW = Math.round(gridW + pad * 2);
    const cssH = rows * stepY + pad * 2 - (stepY - BH);
    const c = setupCanvas(el, cssW, cssH);
    drawFieldBg(c, cssW, cssH);

    // 稀疏布局：特殊砖分散在各处，模拟真实波次里的混排
    const layout = [
      ["n", "n", "n", "e", "n", "n", "n", "n", "n"],
      ["n", "x", "n", "n", "n", "s", "n", "n", "n"],
      ["n", "n", "n", "n", "n", "n", "n", "n", "n"],
      ["n", "n", "s", "n", "n", "n", "x", "n", "n"],
      ["n", "n", "n", "n", "e", "n", "n", "n", "n"]
    ];
    const t = now();
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const kind = layout[r][col];
        const k = kind === "x" ? "elite" : kind === "s" ? "summon" : kind === "e" ? "energy" : "normal";
        const hp = kind === "x" ? 32
          : kind === "s" ? ((r + col) % 2 ? 14 : 22)
          : kind === "e" ? 1
          : [1, 2, 4, 8, 16][(col + r * 2) % 5];
        drawBrick(c, pad + col * stepX, pad + r * stepY, 1, k, hp, t);
      }
    }
  }

  /* ---------- 9. 区块 4：手机 390×844 ---------- */
  function drawTurret(c, cx, baseY) {
    // 极简炮塔剪影，只为交代构图，不参与评审
    c.save();
    // 底座
    c.globalAlpha = 0.5;
    c.fillStyle = "#0a2437";
    c.beginPath();
    c.ellipse(cx, baseY + 3, 30, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.92;
    c.fillStyle = "#0d2a3f";
    rr(c, cx - 15, baseY - 22, 30, 22, 6);
    c.fill();
    c.strokeStyle = "#1e5f79";
    c.lineWidth = 1;
    rr(c, cx - 15, baseY - 22, 30, 22, 6);
    c.stroke();
    c.fillStyle = "#0f3247";
    rr(c, cx - 4, baseY - 40, 8, 20, 3);
    c.fill();
    c.strokeStyle = "#2d7f96";
    rr(c, cx - 4, baseY - 40, 8, 20, 3);
    c.stroke();
    c.fillStyle = "#4fe3f2";
    c.globalAlpha = 0.9;
    c.beginPath();
    c.arc(cx, baseY - 11, 4.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function renderPhone() {
    const el = cvPhone;
    const W = 390, H = 844;
    const c = setupCanvas(el, W, H);
    drawFieldBg(c, W, H);

    const t = now();
    const { cols, stepX, stepY } = LAYOUT;
    const startY = 206; // 波次中段：整片砖阵已下压，画面更接近实战
    const ox = (W - ((cols - 1) * stepX + BW)) / 2;
    const rows = [
      ["n","n","n","n","n","n","n","n","n"],
      ["n","n","e","n","n","n","n","n","n"],
      ["n","n","n","n","x","n","n","n","n"],
      ["n","n","n","n","n","n","s","n","n"],
      ["n","n","n","n","n","n","n","n","n"],
      ["n","s","n","n","n","n","n","n","n"],
      ["n","n","n","e","n","n","n","n","n"],
      ["n","n","n","n","n","x","n","n","n"],
      ["n","n","n","n","n","n","n","n","n"]
    ];
    for (let r = 0; r < rows.length; r++) {
      for (let col = 0; col < cols; col++) {
        const kind = rows[r][col];
        const k = kind === "x" ? "elite" : kind === "s" ? "summon" : kind === "e" ? "energy" : "normal";
        const hp = kind === "x" ? 32
          : kind === "s" ? (r % 2 ? 14 : 22)
          : kind === "e" ? 1
          : [1, 2, 2, 4, 4, 8, 16][(col + r) % 7];
        drawBrick(c, ox + col * stepX, startY + r * stepY, 1, k, hp, t);
      }
    }

    // 危险线（游戏内 = H-105）
    const dangerY = H - 105;
    c.save();
    c.strokeStyle = "rgba(255,120,120,.45)";
    c.lineWidth = 1;
    c.setLineDash([5, 5]);
    c.beginPath();
    c.moveTo(14, dangerY);
    c.lineTo(W - 14, dangerY);
    c.stroke();
    c.restore();

    // 炮塔剪影（游戏内 shooter.y = H-37）
    drawTurret(c, W / 2, H - 30);

    c.save();
    c.font = "800 9.5px system-ui,sans-serif";
    c.fillStyle = "rgba(120,170,195,.6)";
    c.textAlign = "left";
    c.fillText("WAVE 5 · 9 列", 14, 52);
    c.textAlign = "right";
    c.fillText("SCORE 1280", W - 14, 52);
    c.restore();
  }

  /* ---------- 10. 主循环 ---------- */
  function frame() {
    renderCompare();
    renderDetail();
    renderField();
    renderPhone();
    if (animOn) requestAnimationFrame(frame);
  }

  function boot() {
    cvCompare = document.getElementById("cvCompare");
    cvDetail = document.getElementById("cvDetail");
    cvField = document.getElementById("cvField");
    cvPhone = document.getElementById("cvPhone");

    const toggle = document.getElementById("animToggle");
    toggle.addEventListener("change", () => {
      animOn = toggle.checked;
      if (animOn) requestAnimationFrame(frame);
      else frameOnce();
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (!animOn) frameOnce(); }, 120);
    });

    // 交给浏览器首帧后再画，避免容器宽度为 0
    requestAnimationFrame(() => { frameOnce(); if (animOn) requestAnimationFrame(frame); });
  }

  // 静态绘制一帧（关闭动效后仍可正确显示）
  function frameOnce() {
    renderCompare();
    renderDetail();
    renderField();
    renderPhone();
  }

  // 供截图脚本使用：冻结动画到指定相位
  window.__specialPreview = {
    state: () => ({ animOn }),
    freeze: () => { animOn = false; document.getElementById("animToggle").checked = false; },
    render: () => frameOnce()
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
