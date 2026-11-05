/* 连锁爆雷 × 星环绞杀 V4 · 所有实验参数集中于此；不是正式平衡数值。 */
(function (root) {
  "use strict";
  const MODE = (label, short, parts, extra = {}) => ({ label, short, parts, giant: false, ...extra });
  const CONFIG = {
    version: "chain-orbit-lab-v4-20261105",
    seed: 20261105,
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
      "S7-L1": MODE("S7-L1 高速星环", "S7-L1 星环", ["S7"], { orbitLevel: 1 }),
      "S7-L2": MODE("S7-L2 双环绞杀", "S7-L2 双环", ["S7"], { orbitLevel: 2 }),
      "S7-L3": MODE("S7-L3 飞轮风暴", "S7-L3 飞轮", ["S7"], { orbitLevel: 3 }),
      "S8-L1": MODE("S8-L1 爆裂标记", "S8-L1 标记", ["S8"], { bombLevel: 1 }),
      "S8-L2": MODE("S8-L2 爆雷接力", "S8-L2 接力", ["S8"], { bombLevel: 2 }),
      "S8-L3": MODE("S8-L3 爆雷风暴", "S8-L3 风暴", ["S8"], { bombLevel: 3 }),
      C7: MODE("C7 机枪 + 爆雷", "C7 机枪爆雷", ["M1", "S8"], { bombLevel: 2 }),
      C8: MODE("C8 扇形 + 星环", "C8 扇形星环", ["M2", "S7"], { orbitLevel: 1 }),
      C9: MODE("C9 开花 + 爆雷", "C9 开花爆雷", ["S1", "S8"], { bombLevel: 2 })
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
    // ---- S7 星环绞杀 -------------------------------------------------------
    // share：普通发射球携带星环的固定比例，按发射序号取模，结果可复现。
    // rings=2 为内外双环反向旋转；flywheel 仅三级存在，作为独立真实实体计入 48 球上限。
    orbit: {
      levels: {
        1: {
          label: "高速星环", rings: 1, hitRadius: 14.0, band: 2.6, hitInterval: 0.42,
          damage: 1, share: 0.5, mgShare: 0.34, spin: 7.2, tint: "#7cf3ff"
        },
        2: {
          label: "双环绞杀", rings: 2, hitRadius: 15.5, band: 2.8, hitInterval: 0.38,
          damage: 1, share: 0.55, mgShare: 0.5, spin: 8.4, tint: "#b8a4ff",
          innerScale: 0.58, counterSpin: true
        },
        3: {
          label: "飞轮风暴", rings: 2, hitRadius: 17.0, band: 3.0, hitInterval: 0.34,
          damage: 1, share: 0.6, mgShare: 0.5, spin: 9.2, tint: "#ffd27a",
          innerScale: 0.58, counterSpin: true,
          flywheel: {
            interval: 0.9, ttl: 0.95, speed: 430, hitRadius: 10.5, band: 2.4,
            hitInterval: 0.18, damage: 1, maxActive: 6, maxPerBall: 3, homeTime: 0.32
          }
        }
      }
    },
    // ---- S8 连锁爆雷 -------------------------------------------------------
    // 标记不叠加：同一砖块最多 1 个未爆标记。maxDepth / maxChain 是防无限连锁的硬闸门。
    bomb: {
      maxPerBrick: 1,
      levels: {
        1: { label: "爆裂标记", radius: 64, damage: 1, chainDelay: 0.05, maxDepth: 0, maxChain: 0, markTtl: 6.0, igniteSurvivors: false, igniteScale: 1.0, cluster: 0 },
        2: { label: "爆雷接力", radius: 84, damage: 1, chainDelay: 0.16, maxDepth: 2, maxChain: 8, markTtl: 7.0, igniteSurvivors: true, igniteScale: 1.35, cluster: 1 },
        3: { label: "爆雷风暴", radius: 120, damage: 1, chainDelay: 0.10, maxDepth: 3, maxChain: 18, markTtl: 8.0, igniteSurvivors: true, igniteScale: 1.7, cluster: 2 }
      }
    },
    mid: { minDangerGap: 120, warnAlpha: 0.9 },
    // ---- V3 遗产：钻头与刀弧保留原代码与参数，本轮不进默认菜单 -------------
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
