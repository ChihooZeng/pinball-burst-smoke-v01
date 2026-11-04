/* 动态砖阵 + 双机枪实验 V2 · 全部实验参数集中在此；不是正式平衡数值。 */
(function (root) {
  "use strict";
  const CONFIG = {
    version: "dynamic-field-mg-v2-20261104",
    seed: 20261104,
    firstShotDelay: 0.12,
    baseInterval: 0.55,
    maxBalls: 48,
    maxBricks: 180,
    rowGap: 28,
    topColumnCount: 9,
    modes: {
      S1: { label: "S1 砖块开花", short: "S1 开花", parts: ["S1"], giant: true,
        desc: "主炮击碎砖块喷出短寿命子球；子球不再开花。" },
      C1: { label: "C1 雷花风暴", short: "C1 雷花", parts: ["S1", "S3"], giant: true,
        desc: "S1+S3：开花子球首次命中布微电极，与普通电极连线放电。" },
      M1: { label: "M1 极速直线机枪", short: "M1 直线", parts: ["M1"], giant: false,
        desc: "0.08s/发持续直线弹流；真实弹球、真实伤害；为隔离射速关闭巨型球。" },
      M2: { label: "M2 极速扇形机枪", short: "M2 扇形", parts: ["M2"], giant: false,
        desc: "0.15s/轮、每轮左中右三球；三方向独立碰撞；为隔离射速关闭巨型球。" }
    },
    fields: {
      A: {
        label: "A 顶部下落",
        short: "A 顶部",
        desc: "仅顶部持续生成砖阵并下落；验证纯下落结构与下半屏有效碰撞。",
        initialRows: 12,
        topBudget: 126,
        topInterval: 3.2,
        fall: 5.4
      },
      B: {
        label: "B 顶部+中部增援",
        short: "B 增援",
        desc: "顶部下落 + 中部定时增援；每批有 1 秒预警，增援总量有限。",
        initialRows: 9,
        topBudget: 108,
        topInterval: 3.4,
        fall: 5.2,
        mid: { budget: 24, interval: 3.2, batch: 3, warn: 1.0 }
      },
      C: {
        label: "C 顶部+中部召唤",
        short: "C 召唤",
        desc: "顶部下落 + 中部召唤核心；核心存活时召唤有限砖块，击破后停止。",
        initialRows: 9,
        topBudget: 108,
        topInterval: 3.4,
        fall: 5.2,
        summoner: { hp: 56, w: 46, h: 38, budget: 24, interval: 3.4, batch: 2, warn: 1.1, radius: 78 }
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
    m1: {
      interval: 0.08,
      ttl: 3.0,
      damage: 1
    },
    m2: {
      interval: 0.15,
      ttl: 1.8,
      count: 3,
      spread: 0.12,
      damage: 1
    },
    mid: {
      minDangerGap: 120,
      warnAlpha: 0.9
    }
  };
  root.PinballLabConfig = CONFIG;
  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
