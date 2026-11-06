/* 极速持续补砖 V6 · 所有实验参数集中于此；激进参数，不是正式平衡。 */
(function (root) {
  "use strict";
  const MODE = (label, short, parts, extra = {}) => ({ label, short, parts, giant: false, ...extra });
  const CONFIG = {
    version: "audio-in-game-lab-v1-20261106",
    seed: 20261105,
    firstShotDelay: 0.12,
    baseInterval: 0.55,
    maxBalls: 48,
    maxBricks: 220,
    rowGap: 28,
    topColumnCount: 9,
    modes: {
      none: MODE("无技能对照", "无技能", []),
      S1: MODE("S1 砖块开花", "S1 开花", ["S1"], { giant: true }),
      M1: MODE("M1 极速直线机枪", "M1 直线", ["M1"]),
      M2: MODE("M2 扇形机枪（音效调试）", "M2 扇形", ["M2"]),
      C1: MODE("C1 开花+爆雷（音效调试）", "C1 联动", ["S1","S8"], {bombLevel:2}),
      S8: MODE("S8 连锁爆雷", "S8 爆雷", ["S8"], { bombLevel: 2 })
    },
    // C：V5 的破坏驱动批次补阵，作为对照
    // R1：极速补砖 × 原始 HP
    // R2：极速补砖 × 高 HP（默认）
    fields: {
      C: {
        label: "C V5 批次补阵", short: "C 批次",
        desc: "V5 参考：击碎 10 块且存活 ≤62 时补 24 块，共 3 批 72 块。",
        initialRows: 8, topBudget: 0, topInterval: 999, fall: 4.4,
        batch: {
          count: 3, size: 24, clusters: 2, first: 5, interval: 9,
          warn: 0.6, maxAlive: 90, hpMax: 4, minSlots: 10, delay: 1.2,
          minDangerGap: 120, bandTop: 0.22, bandBottom: 0.58,
          trigger: { liveMax: 62, brokenMin: 10, minGap: 2.5 }
        }
      },
      R1: {
        label: "V6 极速 × H1", short: "R1 极速H1",
        desc: "击碎即补：每碎 1 块补 2–3 块，无批次冷却，预算 180；砖块 HP 沿用 V5。",
        initialRows: 8, topBudget: 0, topInterval: 999, fall: 4.4,
        rapid: true, hpScheme: "H1",
        refill: {
          budget: 180, maxAlive: 90, warn: 0.24, minDangerGap: 120,
          perBreakMin: 2, perBreakMax: 3, maxPerCycle: 6, retry: 0.18,
          clusterSize: 3, bandTop: 0.20, bandBottom: 0.62, mergeWindow: 0.06
        }
      },
      R2: {
        label: "V6 极速 × H2", short: "R2 极速H2",
        desc: "同 R1，但初始与补入砖块为高 HP：35% 低（1–3）、45% 中（8–16）、20% 高（20–40）。",
        initialRows: 8, topBudget: 0, topInterval: 999, fall: 4.4,
        rapid: true, hpScheme: "H2",
        refill: {
          budget: 180, maxAlive: 90, warn: 0.24, minDangerGap: 120,
          perBreakMin: 2, perBreakMax: 3, maxPerCycle: 6, retry: 0.18,
          clusterSize: 3, bandTop: 0.20, bandBottom: 0.62, mergeWindow: 0.06
        }
      }
    },
    // H2 高 HP 分布：35% / 45% / 20%，由固定序列保证可复现
    hpSchemes: {
      H1: null,
      H2: { low: 0.35, mid: 0.45, high: 0.20 }
    },
    bloom: { count: 2, life: 1.25, speedScale: 0.92, spread: 0.55, maxActive: 14, damage: 1 },
    electrode: { max: 3, life: 3.0, microMax: 2, microLife: 2.2, pulseInterval: 0.36, connectRange: 210, hitRadius: 14, damage: 1, maxTargetsPerPulse: 3, brickCooldown: 0.55 },
    m1: { interval: 0.08, ttl: 3.0, damage: 1 },
    m2: { interval: 0.15, ttl: 1.8, count: 3, spread: 0.12, damage: 1 },
    orbit: {
      levels: {
        1: { label: "高速星环", rings: 1, hitRadius: 14.0, band: 2.6, hitInterval: 0.42, damage: 1, share: 0.5, mgShare: 0.34, spin: 7.2, tint: "#7cf3ff" },
        2: { label: "双环绞杀", rings: 2, hitRadius: 15.5, band: 2.8, hitInterval: 0.38, damage: 1, share: 0.55, mgShare: 0.5, spin: 8.4, tint: "#b8a4ff", innerScale: 0.58, counterSpin: true },
        3: { label: "飞轮风暴", rings: 2, hitRadius: 17.0, band: 3.0, hitInterval: 0.34, damage: 1, share: 0.6, mgShare: 0.5, spin: 9.2, tint: "#ffd27a", innerScale: 0.58, counterSpin: true, flywheel: { interval: 0.9, ttl: 0.95, speed: 430, hitRadius: 10.5, band: 2.4, hitInterval: 0.18, damage: 1, maxActive: 6, maxPerBall: 3, homeTime: 0.32 } }
      }
    },
    bomb: {
      maxPerBrick: 1,
      levels: {
        1: { label: "爆裂标记", radius: 64, damage: 1, chainDelay: 0.05, maxDepth: 0, maxChain: 0, markTtl: 6.0, igniteSurvivors: false, igniteScale: 1.0, cluster: 0 },
        2: { label: "爆雷接力", radius: 84, damage: 1, chainDelay: 0.16, maxDepth: 2, maxChain: 8, markTtl: 7.0, igniteSurvivors: true, igniteScale: 1.35, cluster: 1 },
        3: { label: "爆雷风暴", radius: 120, damage: 1, chainDelay: 0.10, maxDepth: 3, maxChain: 18, markTtl: 8.0, igniteSurvivors: true, igniteScale: 1.7, cluster: 2 }
      }
    },
    mid: { minDangerGap: 120, warnAlpha: 0.9 },
    drill: {
      every: 8, maxActive: 5,
      levels: {
        1: { label: "基础贯穿", pierce: 4, speed: 560, ttl: 1.55, radiusScale: 1.8, damage: 1, every: 8 },
        2: { label: "旋转钻头", pierce: 5, speed: 620, ttl: 1.6, radiusScale: 2.3, damage: 2, every: 7 },
        3: { label: "宽体钻机", pierce: 7, speed: 680, ttl: 1.7, radiusScale: 3.0, damage: 2, every: 6 }
      },
      mini: { pierce: 2, ttl: 0.85, radiusScale: 1.35, damage: 1, every: 2, maxPerBloom: 1 }
    },
    slash: {
      cooldown: 1.2, telegraph: 0.12,
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
