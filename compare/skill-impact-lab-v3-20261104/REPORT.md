# 贯穿与横扫专项实验 V3 · 交付简表

日期：2026-11-04
分支：`experiment/skill-impact-lab-v3-20261104`
工作树：`.worktrees/skill-impact-lab-20261104`
基线：V2 发布 `300d8c5` / `compare/dynamic-field-mg-v2-20261104/`
实验目录：`compare/skill-impact-lab-v3-20261104/`

## 1. 隔离

- 只新增 V3 目录；V1、V2、冻结基线、`demo/v1/` 未改。
- 未修改 A/B/C 的生成、下落、HP、召唤规则。
- 未推送远程、未合并 main、未发布 Pages。

## 2. 完成情况

| 项 | 状态 |
|---|---|
| D1-L1/L2/L3 破阵钻头 | PASS |
| D2-L1/L2/L3 横扫刀弧 | PASS |
| C4 机枪+钻头 | PASS |
| C5 扇形机枪+刀弧 | PASS |
| C6 开花+钻头 | PASS |
| 无技能对照 | PASS |
| 14 模式 × 3 战场可启动 | PASS |
| 默认 C 战场 | PASS |
| 巨型球默认关闭 + 开关 | PASS |
| 48 球上限 / 真实伤害 / 无递归 | PASS |

## 3. 测试结果

- `node --test tests/skill-impact.test.cjs`：**14/14 PASS**。
- D1：L1 最长贯穿 4 / 伤害1；L2 5 / 2；L3 7 / 2。
- D2：L1 1 弧；L2 2 弧；L3 3 弧；命中分别约 17/27/51（10s 样本）。
- C4：M1 约 12.5/s；C5：M2 约 6.66 轮/s、20 球/s；C6：子钻 28（10s 样本），无递归。
- Chrome headless：14/14 启动，0 JS error；手机模拟 5 尺寸无横向滚动、触摸/resize/暂停动作通过。
- **真机未测试**；headless 长序列部分样本 30FPS，不能代表手机。

## 4. 证据

`artifacts/`：
- `30-D1-L1/L2/L3.png`、`30b-D1-L3-active.png`
- `31b-D2-L1/L2/L3-arc.png`
- `32-C6.png`、`33-C4.png`
- `browser-check.json`、`mobile-check.json`
- `30-D1-L1/L2/L3.png`、`30b-D1-L3-active.png`、`31b-D2-L1/L2/L3-arc.png`、`32-C6.png`、`33-C4.png`

## 5. 已知问题

1. 无真机验证。
2. D2 刀弧速度快，D2-L3 三道弧可能偏密。
3. D1-L3 宽体可能偏强；C6 子钻视觉偏小。
4. 默认关闭巨型球，仅做兼容性开关。
5. 无 45 关、正式成长树、存档、Boss。
