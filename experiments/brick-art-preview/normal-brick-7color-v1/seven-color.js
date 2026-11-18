/* ============================================================================
   普通砖七色霓虹系统预览 V1.0 · 弹珠超载
   - 七级耐久映射：确定性查表，无 % 循环、无回环
   - 特殊砖沿用 V1.0 参数（未做任何改动）
   - 仅预览，不接入正式游戏
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- 1. 尺寸与布局（与 demo/v1/game.js 一致） ---------- */
  const BW = 29, BH = 22, RADIUS = 4;
  const LAYOUT = { cols: 9, stepX: 38.5, stepY: 31, startY: 84 };

  /* ---------- 2. 七色等级 ----------
     main = 指定的主填充色；edge = 描边/光晕
     ft / fb = 由 main 按 HSV 明度派生（×0.60 / ×0.36），保证白字对比度 ≥4.5:1 */
  const SEVEN = [
    { lv: 1, max: 2,    hp: "1–2",   main: "#27DDB7", edge: "#4BE9B9", ft: "#17856E", fb: "#0E5042" },
    { lv: 2, max: 4,    hp: "3–4",   main: "#20C9B6", edge: "#3FDBD6", ft: "#13796D", fb: "#0C4842" },
    { lv: 3, max: 8,    hp: "5–8",   main: "#20C4E8", edge: "#3FDBFF", ft: "#13768B", fb: "#0C4754" },
    { lv: 4, max: 16,   hp: "9–16",  main: "#278FEF", edge: "#5AA1FF", ft: "#17568F", fb: "#0E3356" },
    { lv: 5, max: 32,   hp: "17–32", main: "#5669ED", edge: "#7B7EFF", ft: "#343F8E", fb: "#1F2655" },
    { lv: 6, max: 64,   hp: "33–64", main: "#A052EA", edge: "#C088FF", ft: "#60318C", fb: "#3A1E54" },
    { lv: 7, max: 1e9,  hp: "65+",   main: "#E34BC5", edge: "#FF78E6", ft: "#882D76", fb: "#521B47" }
  ];

  // 现网 8 级（附录对照用）
  const OLD8 = [
    { max: 1, edge: "#3DE8D2", ft: "#04928A", fb: "#025558" },
    { max: 3, edge: "#57F2E2", ft: "#038F83", fb: "#035557" },
    { max: 5, edge: "#4FD6FA", ft: "#0273A9", fb: "#033E65" },
    { max: 10, edge: "#3FDBFF", ft: "#036CBC", fb: "#023E74" },
    { max: 20, edge: "#8CB8FF", ft: "#0D4CDA", fb: "#072B81" },
    { max: 40, edge: "#C08FFF", ft: "#5C23CF", fb: "#341981" },
    { max: 80, edge: "#F79BFA", ft: "#AA2190", fb: "#63175E" },
    { max: 1e9, edge: "#FFB6F2", ft: "#B02481", fb: "#6E1C59" }
  ];

  // 特殊砖（V1.0，未改动）
  const SPECIAL = {
    energy: { edge: "#4BEB9B", ft: "#0FA765", fb: "#0B5638", border: 1.3, blur: 8 },
    elite: { edge: "#C39BFF", ft: "#6B2FD0", fb: "#44218A", border: 1.6, blur: 10 },
    summon: { edge: "#4FC6FF", ft: "#0A78B8", fb: "#075A85", border: 1.3, blur: 8 }
  };

  const NORMAL_BORDER = 1.3, NORMAL_BLUR = 8;
  const ICON = 7, ICON_GAP = 2;

  function sevenOf(hp) {
    for (let i = 0; i < SEVEN.length; i++) if (hp <= SEVEN[i].max) return SEVEN[i];
    return SEVEN[SEVEN.length - 1];
  }
  function oldOf(hp) {
    for (let i = 0; i < OLD8.length; i++) if (hp <= OLD8[i].max) return OLD8[i];
    return OLD8[OLD8.length - 1];
  }

  /* ---------- 3. 基础绘制件 ---------- */
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

  function drawTile(c, x, y, s, st, opts) {
    opts = opts || {};
    const w = BW * s, h = BH * s, r = RADIUS * s;
    const bw = (st.border || NORMAL_BORDER) * s;
    const blur = (st.blur || NORMAL_BLUR) * s * (opts.glowScale || 1);

    c.save();
    c.shadowColor = st.edge;
    c.shadowBlur = blur;
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, st.ft);
    g.addColorStop(1, st.fb);
    c.fillStyle = g;
    rr(c, x, y, w, h, r);
    c.fill();
    c.restore();

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
    c.lineWidth = bw;
    rr(c, x + 0.65 * s, y + 0.65 * s, w - 1.3 * s, h - 1.3 * s, r);
    c.stroke();
    c.restore();
  }

  /* ---------- 4. 图标（V1.0 原样） ---------- */
  function iconEnergy(c, cx, cy, rad, alpha) {
    c.save();
    c.translate(cx, cy);
    c.scale(rad, rad);
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.fillStyle = "#EAFFF6";
    c.beginPath();
    c.moveTo(0.42, -1); c.lineTo(-0.78, -0.06); c.lineTo(-0.12, -0.06);
    c.lineTo(-0.44, 1); c.lineTo(0.78, 0.02); c.lineTo(0.12, 0.02);
    c.closePath(); c.fill();
    c.restore();
  }
  function iconElite(c, cx, cy, rad) {
    c.save();
    c.translate(cx, cy);
    c.scale(rad, rad);
    c.fillStyle = "#F4EBFF";
    c.beginPath();
    c.moveTo(0, -1); c.lineTo(0.8, 0); c.lineTo(0, 1); c.lineTo(-0.8, 0);
    c.closePath(); c.fill();
    c.globalCompositeOperation = "destination-out";
    c.beginPath();
    c.moveTo(0, -0.44); c.lineTo(0.34, 0); c.lineTo(0, 0.44); c.lineTo(-0.34, 0);
    c.closePath(); c.fill();
    c.restore();
  }
  function iconSummon(c, cx, cy, rad, pulse) {
    c.save();
    c.translate(cx, cy);
    c.scale(rad, rad);
    c.strokeStyle = "#E8FBFF";
    const k = pulse == null ? 1 : pulse;
    c.lineWidth = 0.26 / Math.max(0.6, k);
    c.beginPath(); c.arc(0, 0, 0.92 * k, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 0.19 / Math.max(0.6, k);
    c.beginPath(); c.arc(0, 0, 0.46, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  function drawIcon(c, kind, cx, cy, rad, t) {
    if (kind === "energy") {
      iconEnergy(c, cx, cy, rad, 0.78 + 0.22 * Math.sin(t * 2.6));
    } else if (kind === "elite") {
      iconElite(c, cx, cy, rad);
    } else {
      iconSummon(c, cx, cy, rad, 0.9 + 0.12 * Math.sin(t * 3.14));
    }
  }

  /* ---------- 5. 砖块 ---------- */
  // style: 'normal' | 'energy' | 'elite' | 'summon'；old=true 时用现网 8 级
  function drawBrick(c, x, y, s, style, hp, t, useOld) {
    let st;
    if (style === "normal") st = useOld ? oldOf(hp) : sevenOf(hp);
    else st = SPECIAL[style];

    drawTile(c, x, y, s, st);

    const w = BW * s, h = BH * s;
    const hasIcon = style !== "normal";
    const numTxt = style === "energy" ? "" : String(hp);

    c.save();
    c.font = "900 " + (11.5 * s) + "px system-ui,-apple-system,sans-serif";
    c.textAlign = "left";
    c.textBaseline = "middle";

    let iconU = ICON, numSize = 11.5;
    let numW = numTxt ? c.measureText(numTxt).width : 0;
    if (hasIcon && numTxt && iconU * s + ICON_GAP * s + numW > w - 4 * s) {
      iconU = 6; numSize = 10;
      c.font = "900 " + (numSize * s) + "px system-ui,-apple-system,sans-serif";
      numW = c.measureText(numTxt).width;
    }

    const total = hasIcon ? (numTxt ? iconU * s + ICON_GAP * s + numW : iconU * s) : numW;
    const cx = x + (w - total) / 2;
    const cy = y + h / 2;

    if (hasIcon) drawIcon(c, style, cx + (iconU * s) / 2, cy, (iconU * s) / 2 * 0.92, t);

    if (numTxt) {
      c.shadowColor = "rgba(0,7,16,.42)";
      c.shadowBlur = 2 * s;
      c.shadowOffsetY = 0.6 * s;
      c.fillStyle = "#ffffff";
      const tx = hasIcon ? cx + iconU * s + ICON_GAP * s : cx;
      c.fillText(numTxt, tx, y + h / 2 + 0.4 * s);
    }
    c.restore();
  }

  /* ---------- 6. 画布工具 ---------- */
  function setupCanvas(el, cssW, cssH, dpr) {
    dpr = dpr || Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(cssW * dpr);
    el.height = Math.round(cssH * dpr);
    el.style.width = cssW + "px";
    el.style.height = cssH + "px";
    const c = el.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cssW, cssH);
    return c;
  }

  function drawFieldBg(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#08182a");
    g.addColorStop(1, "#050f1c");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.save();
    c.strokeStyle = "rgba(90,180,210,.055)";
    c.lineWidth = 1;
    for (let x = 0; x < w; x += 26) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke(); }
    for (let y = 0; y < h; y += 26) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); c.stroke(); }
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

  function drawTurret(c, cx, baseY) {
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = "#0a2437";
    c.beginPath(); c.ellipse(cx, baseY + 3, 28, 6.5, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.92;
    c.fillStyle = "#0d2a3f";
    rr(c, cx - 14, baseY - 20, 28, 20, 6); c.fill();
    c.strokeStyle = "#1e5f79"; c.lineWidth = 1;
    rr(c, cx - 14, baseY - 20, 28, 20, 6); c.stroke();
    c.fillStyle = "#0f3247";
    rr(c, cx - 3.6, baseY - 36, 7.2, 18, 3); c.fill();
    c.strokeStyle = "#2d7f96";
    rr(c, cx - 3.6, baseY - 36, 7.2, 18, 3); c.stroke();
    c.globalAlpha = 0.9;
    c.fillStyle = "#4fe3f2";
    c.beginPath(); c.arc(cx, baseY - 10, 4.2, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /* ---------- 7. 画布引用与状态 ---------- */
  const EL = {};
  let animOn = true;
  const t0 = performance.now();
  const now = () => animOn ? (performance.now() - t0) / 1000 : 0;

  /* ---------- A. 七色横向对照 ---------- */
  const TIER_HPS = [1, 2, 4, 8, 16, 32, 64, 128];
  function renderTiers() {
    const el = EL.tiers;
    const cssW = el.parentElement.clientWidth - 28;
    const cellW = cssW / TIER_HPS.length;
    const sBig = Math.max(1.4, Math.min(3.4, (cellW - 20) / BW));
    const row1Y = 8;
    const row2Y = row1Y + BH * sBig + 24;
    const cssH = row2Y + BH + 30;
    const c = setupCanvas(el, cssW, cssH);
    const t = now();

    TIER_HPS.forEach((hp, i) => {
      const cx = i * cellW + cellW / 2;
      drawBrick(c, cx - (BW * sBig) / 2, row1Y, sBig, "normal", hp, t);
      drawBrick(c, cx - BW / 2, row2Y, 1, "normal", hp, t);
      label(c, String(hp), cx, row2Y + BH + 10, "#9fc3d8", 9.5);
      label(c, "Lv" + sevenOf(hp).lv, cx, row2Y + BH + 22, "#436b81", 8.5);
    });
  }

  /* ---------- B/C. 砖阵 ---------- */
  function gridWidth() {
    return (LAYOUT.cols - 1) * LAYOUT.stepX + BW;
  }

  function renderField() {
    const el = EL.field;
    const pad = 12;
    const rows = 6;
    const cssW = Math.round(gridWidth() + pad * 2);
    const cssH = Math.round((rows - 1) * LAYOUT.stepY + BH + pad * 2);
    const c = setupCanvas(el, cssW, cssH);
    drawFieldBg(c, cssW, cssH);
    const t = now();

    // 固定 HP 表：逐行递进，验证相邻级是否可分
    const hps = [
      [1, 2, 1, 2, 1, 2, 1, 2, 1],
      [3, 4, 3, 4, 3, 4, 3, 4, 3],
      [5, 8, 5, 8, 6, 7, 5, 8, 5],
      [9, 16, 12, 16, 9, 14, 16, 10, 9],
      [17, 32, 24, 32, 17, 28, 32, 20, 17],
      [33, 64, 48, 64, 33, 56, 64, 40, 33]
    ];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < LAYOUT.cols; col++) {
        drawBrick(c, pad + col * LAYOUT.stepX, pad + r * LAYOUT.stepY, 1, "normal", hps[r][col], t);
      }
    }
  }

  function renderMix() {
    const el = EL.mix;
    const pad = 12;
    const rows = 6;
    const cssW = Math.round(gridWidth() + pad * 2);
    const cssH = Math.round((rows - 1) * LAYOUT.stepY + BH + pad * 2);
    const c = setupCanvas(el, cssW, cssH);
    drawFieldBg(c, cssW, cssH);
    const t = now();

    // n=普通 e=能量 x=精英 s=召唤
    const map = [
      ["n", "n", "n", "n", "n", "n", "n", "n", "n"],
      ["n", "e", "n", "n", "x", "n", "n", "s", "n"],
      ["n", "n", "n", "n", "n", "n", "n", "n", "n"],
      ["n", "n", "x", "n", "n", "n", "e", "n", "n"],
      ["n", "s", "n", "n", "n", "n", "n", "n", "n"],
      ["n", "n", "n", "e", "n", "n", "n", "x", "n"]
    ];
    const hp = [
      [1, 2, 3, 5, 8, 12, 17, 24, 33],
      [2, 0, 4, 6, 0, 16, 20, 0, 48],
      [1, 3, 6, 9, 14, 22, 32, 40, 64],
      [2, 8, 0, 12, 18, 28, 0, 52, 17],
      [4, 0, 7, 11, 20, 33, 44, 60, 24],
      [5, 10, 15, 0, 26, 36, 50, 0, 32]
    ];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < LAYOUT.cols; col++) {
        const k = map[r][col];
        const style = k === "e" ? "energy" : k === "x" ? "elite" : k === "s" ? "summon" : "normal";
        const v = k === "e" ? 1 : k === "x" ? 32 : k === "s" ? 14 : hp[r][col];
        drawBrick(c, pad + col * LAYOUT.stepX, pad + r * LAYOUT.stepY, 1, style, v, t);
      }
    }
  }

  /* ---------- D. 撞色检查 ---------- */
  const CLASH = [
    { a: { style: "normal", hp: 1 }, b: { style: "energy", hp: 1 }, note: "普通 Lv1 青绿 ↔ 能量砖绿" },
    { a: { style: "normal", hp: 16 }, b: { style: "elite", hp: 32 }, note: "普通 Lv4 蓝 ↔ 精英砖紫" },
    { a: { style: "normal", hp: 8 }, b: { style: "summon", hp: 14 }, note: "普通 Lv3 青蓝 ↔ 召唤砖青蓝" }
  ];
  function renderClash() {
    const el = EL.clash;
    const cssW = el.parentElement.clientWidth - 28;
    const cellW = cssW / CLASH.length;
    const s = Math.max(2, Math.min(3.2, (cellW - 88) / (BW * 2 + 10)));
    const cssH = BH * s + 44;
    const c = setupCanvas(el, cssW, cssH);
    const t = now();

    CLASH.forEach((pair, i) => {
      const cx = i * cellW + cellW / 2;
      const pairW = BW * s * 2 + 10 * s;
      const startX = cx - pairW / 2;
      drawBrick(c, startX, 6, s, pair.a.style, pair.a.hp, t);
      drawBrick(c, startX + BW * s + 10 * s, 6, s, pair.b.style, pair.b.hp, t);
      label(c, pair.note, cx, 6 + BH * s + 15, "#7fa4bb", 9);
    });
  }

  /* ---------- E. 手机 ---------- */
  function renderPhone(el, W, H) {
    const c = setupCanvas(el, W, H);
    drawFieldBg(c, W, H);
    const t = now();
    const { cols, stepX, stepY } = LAYOUT;
    const startY = 206; // 波次中段
    const ox = (W - ((cols - 1) * stepX + BW)) / 2;

    const map = [
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
    // 0 = 该格被特殊砖覆盖，不会作为普通砖绘制
    const hps = [
      [1, 2, 3, 4, 5, 8, 9, 16, 17],
      [2, 3, 0, 6, 10, 14, 20, 24, 32],
      [1, 4, 5, 8, 0, 16, 26, 33, 40],
      [2, 3, 6, 9, 13, 18, 0, 36, 48],
      [1, 5, 7, 11, 15, 22, 30, 44, 64],
      [4, 0, 8, 10, 17, 25, 34, 50, 65],
      [2, 3, 5, 0, 14, 21, 32, 40, 17],
      [1, 4, 7, 9, 16, 0, 28, 48, 26],
      [2, 5, 8, 12, 18, 28, 36, 56, 33]
    ];

    for (let r = 0; r < map.length; r++) {
      for (let col = 0; col < cols; col++) {
        const k = map[r][col];
        const style = k === "e" ? "energy" : k === "x" ? "elite" : k === "s" ? "summon" : "normal";
        const v = k === "e" ? 1 : k === "x" ? 32 : k === "s" ? 14 : hps[r][col];
        drawBrick(c, ox + col * stepX, startY + r * stepY, 1, style, v, t);
      }
    }

    const dangerY = H - 105;
    c.save();
    c.strokeStyle = "rgba(255,120,120,.45)";
    c.lineWidth = 1;
    c.setLineDash([5, 5]);
    c.beginPath(); c.moveTo(12, dangerY); c.lineTo(W - 12, dangerY); c.stroke();
    c.restore();

    drawTurret(c, W / 2, H - 30);

    c.save();
    c.font = "800 9px system-ui,sans-serif";
    c.fillStyle = "rgba(120,170,195,.6)";
    c.textAlign = "left";
    c.fillText(W + "×" + H, 12, 40);
    c.restore();
  }

  /* ---------- G. 旧 vs 新 ---------- */
  function renderOldNew() {
    const el = EL.oldNew;
    const cssW = el.parentElement.clientWidth - 28;
    const HPS = [1, 3, 5, 10, 20, 40, 80, 128];
    const cellW = cssW / HPS.length;
    const s = Math.max(1.4, Math.min(2.6, (cellW - 18) / BW));
    const row1Y = 6;
    const row2Y = row1Y + BH * s + 20;
    const cssH = row2Y + BH * s + 30;
    const c = setupCanvas(el, cssW, cssH);
    const t = now();

    HPS.forEach((hp, i) => {
      const cx = i * cellW + cellW / 2;
      drawBrick(c, cx - (BW * s) / 2, row1Y, s, "normal", hp, t, true);
      drawBrick(c, cx - (BW * s) / 2, row2Y, s, "normal", hp, t, false);
      label(c, String(hp), cx, row2Y + BH * s + 11, "#6d93a9", 9);
    });

  }

  /* ---------- H. 参数表 ---------- */
  function buildSpec() {
    const rows = SEVEN.map(s => {
      const cr = contrast("#ffffff", s.ft);
      return `<tr>
        <td><i class="sw" style="background:${s.main};box-shadow:0 0 0 1px ${s.edge}"></i><b>Lv${s.lv}</b></td>
        <td>${s.hp}</td>
        <td><code>${s.main}</code></td>
        <td><code>${s.edge}</code></td>
        <td><code>${s.ft}</code></td>
        <td><code>${s.fb}</code></td>
        <td>${cr.toFixed(2)}:1</td>
      </tr>`;
    }).join("");
    document.getElementById("specBody").innerHTML = rows;
  }

  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function contrast(a, b) {
    const l1 = lum(a), l2 = lum(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  /* ---------- 主循环 ---------- */
  function frame() {
    renderTiers();
    renderField();
    renderMix();
    renderClash();
    renderPhone(EL.p360, 360, 640);
    renderPhone(EL.p390, 390, 844);
    renderOldNew();
  }

  function boot() {
    EL.tiers = document.getElementById("cvTiers");
    EL.field = document.getElementById("cvField");
    EL.mix = document.getElementById("cvMix");
    EL.clash = document.getElementById("cvClash");
    EL.p360 = document.getElementById("cvPhone360");
    EL.p390 = document.getElementById("cvPhone390");
    EL.oldNew = document.getElementById("cvOldNew");

    buildSpec();

    const toggle = document.getElementById("animToggle");
    toggle.addEventListener("change", () => {
      animOn = toggle.checked;
      if (animOn) requestAnimationFrame(frame);
      else frame();
    });

    requestAnimationFrame(() => { frame(); if (animOn) requestAnimationFrame(frame); });
  }

  window.__sevenPreview = {
    freeze: () => {
      animOn = false;
      document.getElementById("animToggle").checked = false;
      frame();
    },
    frame,
    seven: SEVEN
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
