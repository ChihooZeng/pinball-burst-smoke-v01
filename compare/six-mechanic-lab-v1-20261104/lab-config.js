/* 六机制实验 V1 · 全部可调参数集中在此；这些不是正式平衡数值。 */
(function (root) {
  "use strict";
  const CONFIG = {
    version: "six-mechanic-lab-v1-20261104",
    seed: 20261104,
    firstShotDelay: 0.18,
    baseInterval: 0.55,
    maxBalls: 48,
    maxBricks: 140,
    modes: {
      none: { label: "无技能对照", short: "BASE", parts: [] },
      S1: { label: "S1 砖块开花", short: "S1 开花", parts: ["S1"] },
      S2: { label: "S2 弹珠合体", short: "S2 合体", parts: ["S2"] },
      S3: { label: "S3 引雷针", short: "S3 引雷", parts: ["S3"] },
      S4: { label: "S4 过载短路", short: "S4 过载", parts: ["S4"] },
      S5: { label: "S5 双炮交火", short: "S5 双炮", parts: ["S5"] },
      S6: { label: "S6 弹幕倾泻", short: "S6 倾泻", parts: ["S6"] },
      C1: { label: "C1 雷花风暴 (S1+S3)", short: "C1 雷花", parts: ["S1", "S3"] },
      C2: { label: "C2 超载雷核 (S2+S4)", short: "C2 雷核", parts: ["S2", "S4"] },
      C3: { label: "C3 交错火线 (S5+S6)", short: "C3 火线", parts: ["S5", "S6"] }
    },
    scenarios: {
      dense: {
        label: "密集低HP",
        short: "密集",
        desc: "9×7 低 HP 砖阵，静态。验证成片破坏与触发频率。",
        fall: 0
      },
      sparse: {
        label: "稀疏高HP",
        short: "稀疏",
        desc: "三个高 HP 目标 + 少量低 HP 引导砖，静态。验证单体压制与技能弱势。",
        fall: 0
      },
      pressure: {
        label: "增援+下落",
        short: "压力",
        desc: "砖阵持续下落并补充增援。验证输出、瞄准与真实失败压力。",
        fall: 5.2,
        spawnEvery: 2.8,
        spawnRows: 2,
        spawnHpBase: 2,
        spawnHpStep: 1,
        startRows: 6
      }
    },
    bloom: {
      count: 2,
      life: 1.25,
      speedScale: 0.92,
      spread: 0.55,
      maxActive: 14,
      damage: 1
    },
    merge: {
      threshold: 8,
      life: 1.35,
      aimAssist: 0.20,
      pierce: 6,
      radiusScale: 1.9,
      shards: 3,
      shardLife: 0.85,
      shardSpread: 0.42
    },
    electrode: {
      max: 3,
      life: 3.0,
      microMax: 2,
      microLife: 2.2,
      pulseInterval: 0.36,
      connectRange: 210,
      hitRadius: 14,
      damage: 1,
      maxTargetsPerPulse: 3,
      brickCooldown: 0.55
    },
    overload: {
      threshold: 7,
      radius: 62,
      damage: 1,
      coreThreshold: 1,
      coreRadius: 58,
      coreDamage: 1,
      lockout: 0.08
    },
    dual: {
      angleOffset: 0.055,
      muzzleOffset: 11,
      intervalScale: 0.78
    },
    barrage: {
      threshold: 6,
      duration: 1.25,
      intervalScale: 0.32,
      cooldown: 3.0,
      crossAngle: 0.08
    }
  };
  root.PinballLabConfig = CONFIG;
  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
