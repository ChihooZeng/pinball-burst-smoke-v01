# 《弹珠超载》V1.0 发布前视觉精修

## 基线和交付

基线是已验收的 C 方案源码 `d1a208b5a362d2dd9b83d00801492c702dcbb6d0`，本轮独立分支为 `codex/v1-release-polish-20261120`。正式生产、C 方案与本次发布分别使用独立入口。本轮为人工验收候选。

[精修版试玩](https://chihoozeng.github.io/pinball-v1-release-polish-preview/demo/v1/) · [实机截图与紫砖对照](https://chihoozeng.github.io/pinball-v1-release-polish-preview/screens/) · [发布源码元数据](https://chihoozeng.github.io/pinball-v1-release-polish-preview/preview.json) · [C 方案回滚试玩](https://chihoozeng.github.io/pinball-neon-mobile-immersive-preview/demo/v1/)

## 四项调整

| 项目 | 实施 |
| --- | --- |
| A1-1 炮管 | 保持宽度，炮管外露长度从 13.85 增至 17.28 逻辑单位，约增加 24.8%。头部向外延长 7 个 SVG 单位，按原 0.49 比例绘制，尾端和枢轴固定。炮口距枢轴由 23.33 增至 26.76，弹球与超载巨球出生点沿原发射方向前移 3.43。保留枪口闪光，取消炮管的纯显示回缩，避免出球时炮口向内偏移。炮身、核心、底盘和灯圈资产逐字节一致 |
| 紫砖 | `--brick-purple` 从 `#D6A8FF` 调为 `#D69AFF`。独立紫色砖面在顶端使用 `#EDBDFF`、底端用 `#DDA5FF`，调整透明度。覆盖低波 1HP 阵列和两段数值砖。维持原五色映射、白色 HP 数字、Boss 紫和其余四档颜色 |
| 开始页 | 原 Logo 与弹球轨迹组成品牌区。20 波与简介放在主按钮之前，开始挑战为唯一高亮操作，操作说明和战绩采用次级入口。语言、隐私和连续五砖装饰汇入页脚，中文和英文各自适配 |
| 设置页 | 标题、当前波次和继续按钮组成固定头部。语言、操作、声音与反馈分组，44 CSS px 行高、统一的选项边框和对齐。音量读数与原试听按钮同区，版权降低视觉权重。内容区可滚动，重开单独固定在底部 |

C 方案的试听按钮原本播放砖块命中音，本轮把按钮标明为“试听音效”。BGM 仍由开局、暂停、继续和原静音逻辑管理。音效映射、音频资源及试听处理函数通过源码对照。

## Chromium 验收

- 360×640、390×844、430×932、1440×900 拍摄两种语言的首页、战斗与设置。对照图取自同一视口与同一砖阵的真实浏览器渲染。紫砖 9HP 和 30HP 的填色取样均提亮，白色数字可识别。青、蓝、蓝紫、粉色的同位置像素和砖盒完全一致。
- 四个视口验证 12 个实际输入角度，Canvas 中炮管原稿顶沿、球体出生点、枢轴、出球方向和速度通过。超载巨球也在原发射方向使用同一炮口。砖盒、加速度和反射保持 C 方案。
- 手机模拟实测触摸开始、打开设置、改语言、技能键换边、自动超载开关、音量滑块、试听、静音和恢复、特效、振动开关、操作说明、继续和重开。振动用浏览器 API 探针记录调用，实体设备振感未测。
- 对四个视口的 80 组开场砖阵、坐标、尺寸、HP、下落、警戒线和可独立注入的碰撞场景做逐项对照。C 方案的视口变化、安全区、DPR 1/2/3、触摸取消、横竖切换、捏合和边界提示回归通过。布局坐标映射函数逐字节一致。
- 39 场固定种子复验中，主动瞄准 9/9、固定角度 2/27、开局即锁角 0/3，与 C 汇总相同。炮口前移会影响个别球先接触哪块砖。三条流派以真实触摸输入各打完 20 波，触发终局三个阶段。
- 10 个 Node 单元测试、原始 smoke、22 张砖块截图与 40 个生成样本、后期波次压力、Boss、升级、暂停、重开、音频混音与 BGM、十次重开内存检测和绘制错误恢复通过。实体 iOS Safari、Android Chrome 和微信内置浏览器未覆盖。

## Git 差异和回滚

运行时代码涉及 `demo/v1/assets/neon/turret-a1-1/barrel.svg`、`game.js`、`index.html`、`style.css`、`neon-tokens.css` 和 `i18n.js` 的界面文案。对整个 `game.js` 比较允许的炮口和紫砖替换，额外校验原控制 ID、A1-1 其它 SVG、音效、构筑、语言逻辑、服务、隐私和广告。

```sh
node tests/experience/invariants.mjs HEAD --release-polish
node tests/experience/release-polish.mjs /tmp/marble-polish-screens http://127.0.0.1:4215/demo/v1/
node tests/experience/polish-render.mjs /tmp/marble-polish-render http://127.0.0.1:4212/demo/v1/ http://127.0.0.1:4215/demo/v1/
node tests/experience/court-parity.mjs /tmp/marble-polish-parity.json http://127.0.0.1:4212/demo/v1/ http://127.0.0.1:4215/demo/v1/ release-polish
git diff --binary d1a208b HEAD
```

回到上一候选时可直接打开 C 方案入口。如需并排复核源码，用 `git worktree add --detach /tmp/pinball-polish-rollback d1a208b` 单独检出 C 基线。
