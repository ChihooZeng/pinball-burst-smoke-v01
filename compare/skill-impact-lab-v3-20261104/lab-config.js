/* 贯穿与横扫专项 V3 · 所有实验参数集中于此；不是正式平衡数值。 */
(function (root) {
  "use strict";
  const MODE = (label, short, parts, extra = {}) => ({ label, short, parts, giant: false, ...extra });
  const CONFIG = {
    version: "skill-impact-lab-v3-20261104",
    seed: 20261104,
    firstShotDelay: 0.12,
    baseInterval: 0.55,
    maxBalls: 48,
    maxBricks: 180,
    rowGap: 28,
    topColumnCount: 9,
    modes: {
      none: MODE("无技能对照", "无技能", []),
      S1: MODE("S1 砖块开花", "S1 开花", ["S1"], { giant: true }),
      C1: MODE("C1 雷花风暴", "C1 雷花", ["S1", "S3"], { giant: true }),
      M1: MODE("M1 极速直线机枪", "M1 直线", ["M1"]),
      M2: MODE("M2 极速扇形机枪", "M2 扇形", ["M2"]),
      "D1-L1": MODE("D1-L1 破阵钻头 · 基础贯穿", "D1-L1", ["D1"], { drillLevel: 1 }),
      "D1-L2": MODE("D1-L2 破阵钻头 · 旋转钻头", "D1-L2", ["D1"], { drillLevel: 2 }),
      "D1-L3": MODE("D1-L3 破阵钻头 · 宽体钻机", "D1-L3", ["D1"], { drillLevel: 3 }),
      "D2-L1": MODE("D2-L1 横扫刀弧 · 短距", "D2-L1", ["D2"], { slashLevel: 1 }),
      "D2-L2": MODE("D2-L2 横扫刀弧 · 交叉", "D2-L2", ["D2"], { slashLevel: 2 }),
      "D2-L3": MODE("D2-L3 横扫刀弧 · 千刃", "D2-L3", ["D2"], { slashLevel: 3 }),
      C4: MODE("C4 机枪 + 钻头", "C4 机枪钻头", ["M1", "D1"], { drillLevel: 1 }),
      C5: MODE("C5 扇形机枪 + 刀弧", "C5 扇形刀弧", ["M2", "D2"], { slashLevel: 1 }),
      C6: MODE("C6 开花 + 钻头", "C6 开花钻头", ["S1", "D1"], { drillLevel: 1 })
    },
    fields: {
      A: {
        label: "A 顶部下落", short: "A 顶部",
        desc: "仅顶部持续生成砖阵并下落；验证纯下落结构与下半屏有效碰撞。",
        initialRows: 12, topBudget: 126, topInterval: 3.2, fall: 5.4
      },
      B: {
        label: "B 顶部+中部增援", short: "B 增援",
        desc: "顶部下落 + 中部定时增援；每批 1 秒预警，增援总量有限。",
        initialRows: 9, topBudget: 108, topInterval: 3.4, fall: 5.2,
        mid: { budget: 24, interval: 3.2, batch: 3, warn: 1.0 }
      },
      C: {
        label: "C 顶部+中部召唤", short: "C 召唤",
        desc: "顶部下落 + 中部召唤核心；核心存活时召唤有限砖块，击破后停止。",
        initialRows: 9, topBudget: 108, topInterval: 3.4, fall: 5.2,
        summoner: { hp: 56, w: 46, h: 38, budget: 24, interval: 3.4, batch: 2, warn: 1.1, radius: 78 }
      }
    },
    bloom: { count: 2, life: 1.25, speedScale: 0.92, spread: 0.55, maxActive: 14, damage: 1 },
    electrode: { max: 3, life: 3.0, microMax: 2, microLife: 2.2, pulseInterval: 0.36, connectRange: 210, hitRadius: 14, damage: 1, maxTargetsPerPulse: 3, brickCooldown: 0.55 },
    m1: { interval: 0.08, ttl: 3.0, damage: 1 },
    m2: { interval: 0.15, ttl: 1.8, count: 3, spread: 0.12, damage: 1 },
    drill: {
      every: 8,
      maxActive: 5,
      levels: {
        1: { label: "基础贯穿", pierce: 4, speed: 560, ttl: 1.55, radiusScale: 1.8, damage: 1, every: 8 },
        2: { label: "旋转钻头", pierce: 5, speed: 620, ttl: 1.6, radiusScale: 2.3, damage: 2, every: 7 },
        3: { label: "宽体钻机", pierce: 7, speed: 680, ttl: 1.7, radiusScale: 3.0, damage: 2, every: 6 }
      },
      mini: { pierce: 2, ttl: 0.85, radiusScale: 1.35, damage: 1, every: 2, maxPerBloom: 1 }
    },
    mid: { minDangerGap: 120, warnAlpha: 0.9 },
    slash: {
      cooldown: 1.2,
      telegraph: 0.12,
      levels: {
        1: { label: "短距横扫", threshold: 8, cooldown: 1.2, range: 230, speed: 650, band: 16, damage: 1, arcs: 1, width: 12, stagger: 0 },
        2: { label: "交叉斩击", threshold: 7, cooldown: 1.0, range: 260, speed: 680, band: 18, damage: 1, arcs: 2, width: 14, stagger: 0 },
        3: { label: "千刃风暴", threshold: 6, cooldown: 0.9, range: 300, speed: 720, band: 20, damage: 1, arcs: 3, width: 15, stagger: 0.08 }
      }
    }
  };
  root.PinballLabConfig = CONFIG;
  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
