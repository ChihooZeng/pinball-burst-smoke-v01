# 六机制实验 V1 · 交付与验收简表

日期：2026-11-04
分支：`experiment/six-mechanic-lab-20261104`
工作树：`.worktrees/six-mechanic-lab-20261104`（主工作区 `feat/pinball-burst-launch` 未动）
基线：`96f5d84` / `compare/core-foundation-baseline-20261103/`
实验目录：`compare/six-mechanic-lab-v1-20261104/`

## 1. 隔离与未改证据

- 冻结目录 5 个文件未改：`index.html`、`game.js`、`builds.js`、`juice-fx.js`、`style.css`。
- `demo/v1/` 未改；旧 `feat/pinball-burst-launch` 工作区未改；未推送、未合并、未发布。
- 所有新增/修改只发生在 `compare/six-mechanic-lab-v1-20261104/`。
- 实验目录的 `builds.js`、`juice-fx.js` 与冻结版字节一致；`index.html`、`game.js`、`style.css` 为实验页副本。

## 2. 入口

```sh
cd compare/six-mechanic-lab-v1-20261104
python3 -m http.server 4184
# http://127.0.0.1:4184/
```

菜单：10 个机制按钮 + 3 个场景按钮；开始/重开/返回菜单/暂停统计。
直达：`?mode=S1&scenario=dense`；调试接口：再加 `test=1`。

## 3. 6 + 3 验收

| 项 | 状态 | 自动证据（摘要） |
|---|---|---|
| 无技能对照 | PASS | 仅基础炮台/巨型球；真实命中每次 1 点；10s 31 砖 |
| S1 砖块开花 | PASS | 24 子球 / 67 次派生击碎被阻断递归；峰值 18 球 |
| S2 弹珠合体 | PASS | 4 次合体 / 13 次冲锋命中 / 9 颗分解球 |
| S3 引雷针 | PASS | 28 次布电极 / 13 次脉冲 / 20 点电流；电极 ≤3 |
| S4 过载短路 | PASS | 4 次冲击 / 18 点范围伤害；冲击不充能 |
| S5 双炮交火 | PASS | 23 次左右交替射击；两炮口均实际开火 |
| S6 弹幕倾泻 | PASS | 2 个窗口 / 15 发爆发；窗口受冷却限制 |
| C1 雷花风暴 | PASS | 18 子球 / 12 微电极 / 9 点电流；微电极 ≤2 |
| C2 超载雷核 | PASS | 3 次合体 / 8 次冲锋命中 / 3 个雷核 / 12 点伤害；每冲锋球最多一次 |
| C3 交错火线 | PASS | 30 次双炮 / 10 次交叉 / 1 个倾泻窗口 |
| 3 固定场景 | PASS | 10×3=30 组 240 帧冒烟无异常、无超 48 球 |
| 压力失败 | PASS | 无技能 pressure 约 50.8s 触线失败并显示结果 |
| 清屏 | PASS | 测试清空后进入 `complete`，结果层显示 |
| 48 球硬上限 | PASS | 先填满 48 球再触发 C1，峰值仍 ≤48 |
| 真实伤害 1 | PASS | 10 HP 砖被 1 颗普通弹命中后恰好 9 HP |
| 无无限递归 | PASS | 开花子球不再开花；电流不生成微电极；面积不充能 |

## 4. 与冻结版默认值的差异

- 普通球伤害 1、48 球上限、巨型球 5s/10 贯穿/610 速度：未改。
- **基础射速 0.86s → 0.55s**：实验页显式覆盖，用于让 10 秒样本看到机制；不是正式平衡值。
- 关卡：20 波/精英/Boss → 3 个固定场景；实验页不进入正式升级树/Build。
- 其余物理、碰撞、警戒线、暂停、打击反馈、低帧率降级复用冻结版。
- 手机兼容小改：`WAVE_START_Y` 按顶部 HUD 实际底边避让；`resize` 不再暂停游戏；短屏暂停面板压缩；HTML 资源和缓存版本升到 `six-mechanic-lab-3`。

## 5. 手机适配验证

- 5 个视口：375×667、390×844、430×932、360×640、412×915；均无横向滚动，开始/暂停/重开/返回菜单在屏内，触摸拖动会改变瞄准。
- 地址栏式 `resize` 不再触发暂停；短屏暂停面板按钮已压缩到可视区。
- 刘海模拟（top 47 / bottom 34）：HUD 底边 114、第一排砖 y≈160；砖阵起点动态避让 HUD。
- 证据：`artifacts/mobile-check.json`、`mobile-Android360.png`、`mobile-iPhone12.png`、`mobile-notch.png`。
- **真机未验收**：iOS Safari 地址栏、灵动岛/刘海实际 inset、Android 手势、真机 FPS/音频/振动。

## 6. 测试与浏览器证据

- `node --test tests/lab.test.cjs`：**17/17 PASS**。
- `node tests/browser-check.mjs`（本机 Chrome headless，390×844，DPR2）：
  - 8 个样本，**0 JavaScript 异常 / console error**；
  - 无 `navigator.vibrate` 警告（无用户手势时已跳过振动）；
  - 所有样本 **FPS 60 / quality full**；峰值球数 ≤19；
  - 截图与 JSON：`artifacts/01-lab-menu.png` … `artifacts/09-none-pressure.png`、`artifacts/browser-check.json`。

## 5. 变更文件

新增：

- `index.html`（实验页）
- `lab-config.js`（参数）
- `game.js`（冻结版副本 + 实验室钩子）
- `README.md`、`REPORT.md`
- `tests/harness.cjs`、`tests/lab.test.cjs`、`tests/browser-check.mjs`
- `artifacts/*`

复制未改：

- `builds.js`、`juice-fx.js`
- `style.css` 在冻结版基础上追加实验页样式

## 7. 明确未验收 / 下一轮

- 真人手感、首次可感知时间、行为辨识度、爽点/压力：**未验收**。
- iPhone/Android 真机 60/120FPS、音频、振动：**未验收**。
- S3/C1 电流视觉偏弱；S2/C2 冲锋球出生校正可能被感知为自动瞄准；S5 是否“像双炮”需真人判断。
- 实验基础射速 0.55s 是显式覆盖，不是正式平衡值。
- 没有 Boss、正式成长树、存档、商业化；本轮不做。

建议下一轮优先真人试玩 `S1 / S3 / C1`（物理扩散→电流路线）与 `S2 / S4 / C2`（蓄势→穿透→爆发）两组，再决定是否调整电极寿命、冲锋球校正和 C1 线路上限。
