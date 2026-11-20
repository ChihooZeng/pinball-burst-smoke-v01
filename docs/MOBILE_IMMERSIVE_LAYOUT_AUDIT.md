# 《弹珠超载》移动端全屏沉浸式战场审计

**结论：推荐方案 C，保留现有物理世界，统一移动端可玩区域的布局、绘制、输入和边界反馈。** 当前 V2.1 的内框与实际碰撞墙对齐。嵌入感来自页面背景、Canvas 舞台、HUD 和技能栏分别占据不同矩形。小屏再受固定逻辑比例限制，Canvas 比战斗槽窄。单独隐藏边框或把网格铺满会改善外观，但保留原地反弹的球仍可能看起来撞上了隐形墙。

## 1. 仓库、基线和审计范围

审计日期为 2026-11-20。源仓库远端为 `ChihooZeng/pinball-burst-smoke-v01`，当前工作树位于 `~/.codex/worktrees/pinball-v21-experience/霓虹弹珠`，分支 `codex/v2-1-experience-20261120`，HEAD 为 `f394fe9ab49347b67eb32e40976ce53653adda00`。开始时索引和工作区均干净。审计前后分支与 HEAD 相同，仓库内只新增此报告。

| 角色 | 线上 Pages 提交 | 源码与关系 |
| --- | --- | --- |
| 正式站 `pinball-burst-smoke-v01` | `c286c8edf7f7a811467ab113741814941ea07f80` | 正式 `main`，也是本工作树与正式站的共同祖先 |
| V1 正式发行候选 RC.2 `pinball-burst-v1-preview` | `949994dfe05a902dc94569918e9f737d8ddf9788` | `release.json` 指向 `4f2498ccbe432b84dbcbf4c18109f3056217e470`，独立发行候选 |
| V1 视觉预览 `pinball-neon-visual-preview` | `5ce61d27a05dc6c2c803146f494bf7bbd2843174` | 视觉源码 `063ddcf`、验收 `0fb86d0` |
| V2 视觉预览 `pinball-neon-v2-preview` | `70dcee8529ca906e3afb780edf0e1cf58aee9cfc` | 线上源码 `710014799d1d09aba888cfd368f8ca28fc29d22a`，本地验收基线 `9856139` |
| 本次审计的 V2.1 `pinball-neon-v21-preview` | `0b9a25874859452a98486abaf5372d8242e68d01` | 线上源码 `cda2e1dcf634c344e2d1e77d32a165ed4fd8a29e`，从 V2 基线 `9856139` 独立开发 |

GitHub Pages API 返回上述构建状态均为 `built`。V2.1 的线上源码与本地 HEAD 在 `demo/v1`、`server` 的 Git 差异为空。通过 HTTPS 下载复核的 `index.html`、`style.css`、`neon-tokens.css`、`game.js`、`juice-fx.js` 全部与本地文件逐字节一致。浏览器测试打开的是公开 V2.1。 [线上版本元数据](https://chihoozeng.github.io/pinball-neon-v21-preview/preview.json) · [RC.2 发行元数据](https://chihoozeng.github.io/pinball-burst-v1-preview/release.json)

## 2. 当前战斗页面结构

| 部位 | 当前实现 | 源码位置 |
| --- | --- | --- |
| 最外层 | `main.shell` 居中，宽取 `100%`、540px、`68dvh` 最小值。高为 `100dvh`，前置 `100vh` 回退。标题层 `.masthead` 是绝对定位 Flex | [index.html 15–19](../demo/v1/index.html#L15) · [style.css 18–46](../demo/v1/style.css#L18) |
| 战斗槽 | `.arena` 绝对定位、裁切溢出。内部 `.playfield` 是绝对定位 Grid，居中放置 `.battle-surface`。从 arena 内边缘顶部扣 76px，底部扣技能栏高度再加 16px | [index.html 32–38](../demo/v1/index.html#L32) · [style.css 18–30](../demo/v1/style.css#L18) · [style.css 57–78](../demo/v1/style.css#L57) |
| 中间矩形框 | `.battle-rim` 以 inset box-shadow 画四边，用 `--ceiling-inset` 对齐顶墙，且不接收指针。首页、升级、暂停、结算等弹层另有外框状态，由 `.arena:has(...)` 控制 | [index.html 35–36](../demo/v1/index.html#L35) · [style.css 65–84](../demo/v1/style.css#L65) |
| 深蓝网格 | `.battle-surface` 的 CSS 双线性渐变和底色，网格间距 22 CSS px。Canvas 每帧透明清除。页根和正常战斗的 arena 为纯色，技能栏有独立的深蓝底，弹层另画网格 | [neon-tokens.css 35–43](../demo/v1/neon-tokens.css#L35) · [style.css 1–9](../demo/v1/style.css#L1) · [style.css 71–76](../demo/v1/style.css#L71) · [style.css 257–270](../demo/v1/style.css#L257) · [game.js 1805–1807](../demo/v1/game.js#L1805) |
| 顶部 HUD | `.topbar` 绝对定位，四列 Grid（暂停、波次与进度、能量、设置），中间说明和进度另用 Grid。Boss 血条为 arena 内另一个绝对定位层 | [index.html 20–42](../demo/v1/index.html#L20) · [style.css 89–105](../demo/v1/style.css#L89) · [style.css 139–162](../demo/v1/style.css#L139) |
| 底部技能栏 | `.control-dock` 绝对定位贴 arena 内底，伪元素绘制独立边缘 SVG。技能槽居中 Flex，超载按钮独立靠左或靠右，底部状态用 Flex 换行 | [index.html 43–54](../demo/v1/index.html#L43) · [style.css 179–205](../demo/v1/style.css#L179) · [style.css 226–254](../demo/v1/style.css#L226) |
| 砖阵、警戒线与炮台 | `createWavePlan()` 给砖逻辑坐标，`brickAt()` 存数据。警戒线是 `draw()` 画出的 `y=H-105`。炮台锚点为 `(180,H-37)`，实际旋转枢轴再向上 8。A1-1 的炮管、主体、核心、灯圈 SVG 由 `drawTurret()` 在同一 Canvas 渲染 | [game.js 258–265](../demo/v1/game.js#L258) · [game.js 275–290](../demo/v1/game.js#L275) · [game.js 414](../demo/v1/game.js#L414) · [game.js 462](../demo/v1/game.js#L462) · [game.js 1815–1818](../demo/v1/game.js#L1815) · [game.js 2040–2064](../demo/v1/game.js#L2040) |

## 3. Canvas、DPR 与三个手机视口

HTML 的初值为 Canvas 360×560。实际逻辑宽 `W=360`。`resetWorldSize()` 在 `reset()` 中按槽的宽高比计算 `H=round(min(900,max(560,360×slotH/slotW)))`，同时设警戒线、Boss 召唤下限区的下边界和炮台锚点。`begin()` 使用已建立的场地。运行中 `window.resize` 或 `ResizeObserver` 触发 `resizeBattle()`，它适配原场地、解除活动指针并重置帧时钟，当前局的 H 和砖坐标不随之重建。 [game.js 22–24](../demo/v1/game.js#L22) · [game.js 239–265](../demo/v1/game.js#L239) · [game.js 596–632](../demo/v1/game.js#L596) · [game.js 2186–2190](../demo/v1/game.js#L2186)

令 `s=min(slotW/360,slotH/H)`。`fitCanvas()` 把父表面设为 `360s×Hs`，`#game` 的 CSS 宽高占父表面 100%。后备像素宽高分别由实际 Canvas CSS 矩形乘 `clamp(1,DPR,2)` 后取整。`draw()` 设置 `(backingW/360,backingH/H)` 的 Canvas 变换，浏览器再将后备像素映射回 CSS 矩形。两轴后备矩阵可能因整数取整有细小差异，最终在页面上的两个轴仍近似同一 CSS 比例。 [style.css 70–84](../demo/v1/style.css#L70) · [game.js 242–256](../demo/v1/game.js#L242) · [game.js 1805–1807](../demo/v1/game.js#L1805)

以下为 Chromium 公网实测，表内位置和外观尺寸为 CSS px，后备尺寸为设备像素。名义视口未施加刘海等非零安全区。表内炮台 Y 指逻辑锚点映射后的位置。

| 视口 / DPR | 标题 / HUD 高 | 战斗槽宽×高 | Canvas X、Y ｜ 宽×高 | 后备像素 | 逻辑场地 | 警戒线 Y / 炮台 Y | 底栏 Y / 高 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 360×640 / 2 | 36.47 / 54 | 336×428.53 | 42.25、114.47 ｜ 275.48×428.53 | 551×857 | 360×560 | 462.65 / 514.69 | 559.00 / 69.00 |
| 390×844 / 3 | 48.09 / 54 | 366×605.52 | 12.13、126.09 ｜ 365.73×605.52 | 731×1211 | 360×596 | 624.91 / 694.00 | 747.61 / 84.39 |
| 430×932 / 3 | 53.11 / 54 | 406×679.70 | 12.11、131.11 ｜ 405.78×679.70 | 812×1359 | 360×603 | 692.44 / 769.09 | 826.81 / 93.19 |

在同一局中模拟可视高度缩短 80px，三个 Canvas 宽分别变为 `224.34`、`325.00`、`365.52` CSS px，逻辑 H 仍为 `560/596/603`。360×640 初始就受最小逻辑高 560 限制，428.53px 槽高将缩放限制在约 0.765 倍。槽两边各留约 30.25px 无球区域，加上外壳和边框，Canvas 左边最终落在 42.25px。短屏问题和浏览器工具栏伸缩时的额外留白都由这一机制解释。

页面已有 `viewport-fit=cover`，通过 `env(safe-area-inset-*)` 留出边缘，`dvh` 影响外壳、标题与底栏。HUD 顶部位置继承含上安全区的 `--frame-top`，HUD 高又取 `max(6px, safe-area-inset-top)+48px`。战斗槽顶部仍固定扣 76px，另在 390×844 注入顶部 47px、底部 34px 安全区。HUD 外盒增至 95px，其范围 y=102.09–197.09 与场地顶部 y=173.09 有 24px 交叠。该读数是容器外盒，未经逐个控件测量，不能据此判定按钮遮挡。Canvas 宽由 365.73px 降至 343.61px，底栏止于 y=808.00。当前源码使用 `window.resize` 和槽尺寸观察器，未读取或监听 `visualViewport`。80px 变化为按浏览器尺寸模拟，微信内置浏览器的工具栏、安全区、横竖屏行为需在微信实机确认。 [index.html 5](../demo/v1/index.html#L5) · [style.css 18–37](../demo/v1/style.css#L18) · [style.css 89–99](../demo/v1/style.css#L89) · [动态视口单位规范](https://drafts.csswg.org/css-values-4/#viewport-relative-lengths) · [安全区规范](https://drafts.csswg.org/css-env-1/#safe-area-insets) · [VisualViewport 规范](https://drafts.csswg.org/cssom-view/#visualviewport)

## 4. 砖阵尺寸和下落

- 普通砖逻辑宽高为 **29×22**。`brickAt()` 默认填入这组值，`draw()` 把同一 `brick.x/y/w/h` 交给 `brickTile()`。主体以这个外接矩形作圆角绘制，外辉光向外延伸，出生和受击可临时缩放美术。碰撞使用轴对齐矩形，圆角处和光晕尽头会有预期的视感差异。特殊砖沿用原识别方式，精英砖、Boss 等带明确宽高覆盖。 [game.js 158](../demo/v1/game.js#L158) · [game.js 414–422](../demo/v1/game.js#L414) · [game.js 1641–1672](../demo/v1/game.js#L1641) · [game.js 1874–1895](../demo/v1/game.js#L1874)
- 当前 20 波的主生成器 `createWavePlan()` 使用横向节距 **38.5**、纵向节距 **31**，相邻砖净缝为 **9.5 / 9**。诊断快照的 `brickPitchY` 读取 `BRICK_STEP_Y=33`，该值来自旧 `addRow()` 路径。主玩法用 `WAVE_ROW_GAP=31`，Boss 增援和特殊布局有自身坐标。 [game.js 130](../demo/v1/game.js#L130) · [game.js 158](../demo/v1/game.js#L158) · [game.js 438–463](../demo/v1/game.js#L438) · [game.js 514–523](../demo/v1/game.js#L514) · [game.js 1513–1517](../demo/v1/game.js#L1513) · [game.js 2270–2271](../demo/v1/game.js#L2270)
- 共 **9 个逻辑列位**，横坐标为 `12+38.5×列索引`，全列外接范围 `x=[12,349]`，宽 **337**。首波 7 列 × 5 行，共 35 砖，外接 `x=[50.5,310.5]`、`y=[84,230]`，宽 **260**。九行普通波的开场底端为 `84+8×31+22=354`。三个手机尺寸逐波读取相同的 20 个开场阵型，三个视口均未发现开场矩形重叠。实测第 5、10 波外接底端为 292，第 20 波为 323。 [game.js 462–523](../demo/v1/game.js#L462)
- `generateSurvival(dt)` 在 120Hz 固定物理步内对存活砖执行 `brick.y+=speed*dt`。普通波按开场砖阵到警戒线的差值计入下落倍率，Boss 另外乘时间或阶段倍率。砖底达到 `H-105` 就失败。变更 H、砖阵 Y 或警戒线的相对位置会改变下落速度、警戒压力和 Boss 场地行为。 [game.js 550–584](../demo/v1/game.js#L550) · [game.js 1513–1537](../demo/v1/game.js#L1513) · [game.js 2212–2223](../demo/v1/game.js#L2212)

| 视口 | 逻辑到 CSS 比例 | 砖主体 CSS 宽×高 | 横缝 / 纵缝 CSS px | 首波 / 全列砖阵 CSS 宽 |
| --- | ---: | --- | --- | --- |
| 360×640 | 0.7652 | 22.19×16.84 | 7.27 / 6.89 | 198.96 / 257.88 |
| 390×844 | 1.0159 | 29.46×22.35 | 9.65 / 9.14 | 264.14 / 342.37 |
| 430×932 | 1.1272 | 32.69×24.80 | 10.71 / 10.14 | 293.06 / 379.86 |

三个视口都等比映射，无砖块拉伸或碰撞缝被单独压窄。小屏主要问题是整块场地随槽高缩小，砖主体、缝隙和数字一起缩小。普通球碰撞直径 5.4，因此理想横缝及纵缝分别仍有 4.1、3.6 逻辑单位的球心余量。超载巨球有独立半径和反弹规则，不应用普通球的通行标准。

## 5. 球、边界、警戒线与触摸

| 项目 | 代码行为与证据位置 |
| --- | --- |
| 球的半径 | 普通球碰撞半径 2.7，绘制半径 3.45。裂变子球两者均乘 0.83，钻头强化均乘 1.35，超载巨球物理半径 14。光晕、尾迹和巨球外圈属于显示。 [game.js 158](../demo/v1/game.js#L158) · [game.js 830–835](../demo/v1/game.js#L830) · [game.js 887–902](../demo/v1/game.js#L887) · [game.js 1931–1946](../demo/v1/game.js#L1931) |
| 砖碰撞 | `updateBall()` 按速度拆步，先做包围盒筛查，再用 `circleIntersectsRect()` 求圆心到矩形最近点。命中后通过 `contactNormal()` 和 `reflect()` 处理碰撞法线、反射、分离。召唤砖出生前 0.20 秒有既有的免碰撞窗。 [game.js 912–944](../demo/v1/game.js#L912) · [game.js 1082–1116](../demo/v1/game.js#L1082) |
| 墙与底边 | 左右碰撞平面 `x=0/360`，顶墙 `y=4`，球心需要保留自身半径。普通球没有底墙，越过 Canvas 底部后在 `y>=H+10` 清除，并受寿命条件约束。超载巨球在 `y=H-83` 有原有能量反弹面。霓虹矩形底边是显示边缘。普通球触墙时，显示球半径比物理半径大 0.75，辉光也会与边线相叠。 [game.js 1086–1121](../demo/v1/game.js#L1086) · [game.js 1135–1151](../demo/v1/game.js#L1135) |
| 警戒线与炮口 | `draw()` 与失败判定共用 `DANGER_Y`。炮口由 `makeBall()` 使用枢轴和 23.33 单位的管长，根据角度计算；瞄准虚线和炮管同枢轴。虚线是方向标记。 [game.js 830–834](../demo/v1/game.js#L830) · [game.js 1525–1537](../demo/v1/game.js#L1525) · [game.js 1815–1818](../demo/v1/game.js#L1815) · [game.js 1923–1928](../demo/v1/game.js#L1923) |
| 触摸 | `setAim()` 从 `clientX` 减去 Canvas 的实测左边再除以宽度，映射到世界 X，角度限制 ±1.08 弧度。Canvas 上开始拖动才捕获指针，外侧空白起触不更新瞄准。三个尺寸的真实 Chromium 触摸在 Canvas 75% 宽处均得 0.54 弧度，屏幕左边 x=3 均不改变 0 弧度的原瞄准。 [game.js 2124–2142](../demo/v1/game.js#L2124) |
| 可能出现的局部视差 | `draw()` 对游戏图层可施加镜头震动。`.battle-rim` 是静止的 DOM 层。圆角、辉光、球视觉半径和短时震动可影响贴边感知，三视口的静态屏幕坐标与世界坐标比对没有系统性偏移。 [game.js 1805–1818](../demo/v1/game.js#L1805) · [juice-fx.js 149](../demo/v1/juice-fx.js#L149) |

实机模拟使用线上构建的既有 QA 钩子，在独立标签页内分别推进三种尺寸的真实引擎。左右和顶墙反弹、普通球底部清除、横向 9.5 缝零接触穿越、2HP 砖命中后剩 1HP、越警戒线失败均通过。**V2.1 的真实情况是内框与物理对齐，整页的视觉空间明显大于内框场地。** 玩家容易把更宽的 HUD、底栏和外层留白视为一体。内框底边的四面围合也暗示了普通球会在此反弹，代码实际让它从底部退出。

## 6. 三套方案

| 方案 | 开发难度 | 涉及范围 | 物理风险 | 手机适配 | 维护成本 |
| --- | --- | --- | --- | --- | --- |
| A · 取消内框，保留现布局和逻辑坐标 | 低 | 移除内框，网格迁到页面；Canvas 仍在旧槽 | 低，回弹位置本身保持原样；隐藏后更容易被理解为隐形墙 | 小屏有效面积和缩高后的留白仍存在 | 短期低，后续仍需处理槽与页面两套边界 |
| B · 取消内框，重排 HUD、技能栏和显示映射 | 中 | 独立紧凑布局、公用 CSS 网格，重测槽与画布 | 低至中，若显示偏移和输入现场各自计算，后续容易分歧 | 短屏明显改善，部分容器变化仍要分别回归 | 中，数个定位入口和例外会逐步累积 |
| C · 取消内框，统一全屏响应式坐标 | 中至高 | 单一可玩矩形与坐标变换，背景、HUD、技能栏共享页面布局 | 保持每局世界几何时较低。动态改世界 W/H 或移动砖阵则为高风险 | 三种比例都可共享布局原则，便于覆盖动态视口和安全区 | 初期较高，之后绘制、输入、边界提示共用一处数据 |

## 7. 推荐设计与实施边界

采用 **C**。全屏背景覆盖可见页面，含安全区周围的网格视觉。安全区、触控按钮和技能栏优先固定为适合手指的 CSS 尺寸。战斗区用剩余空间求可玩矩形，任一时刻所有动态游戏图层都使用同一套原点和等比尺度。

1. 战斗态以一个页面布局容器安排顶部 HUD、可用战斗空间和底部技能栏。小屏先合并标题纵向占位、去掉重复顶部空档和底栏装饰占位，保持操作热区至少 44 CSS px；高屏将可用空间优先留给游戏。Boss 血条需有稳定位置，出现时保持这一局的物理场地。把样式限定在战斗态，现有弹层隔离、滚动和焦点仍由原容器负责。
2. 从标准化的可见布局盒测出单个可玩矩形，保存 `left/top/width/height/scale`。正向变换服务砖、球、炮口、警戒线、反馈与边界提示，逆向变换服务触摸。DPR 只决定后备像素。推荐用 CSS 和 `ResizeObserver` 作为主路径；在实机证明 `dvh` 或容器没有随可视区域更新的宿主中，再接入 `visualViewport.resize` 作兼容测量，避免重复扣除安全区。
3. 保留当前逻辑宽 360、每局确定后的 H、7/9 列布局、砖盒、净缝和原弹道算法。首个实现先维持同视口 V2.1 的逻辑 H 基线，把布局变动限制在显示变换。砖阵通过同一尺度居中，首波保持 7 列、稠密波保持 9 个列位。剩余空间不够时，整套世界统一缩小。以 360×640 为例，映射到 336 CSS px 宽至少需要 522.67 CSS px 高，页面还要容纳 HUD、技能栏、安全区；空间不足时保留必要留白。
4. 用页宽统一网格、轻量侧轨或边缘渐隐标示实际左右边界，必要时用已对齐的撞墙反馈补充。取消四边相接的矩形，普通球退出底边不画成反弹墙。若页面扩展到真实物理世界两侧，剩余宽度应有低对比的不可玩边缘提示，避免背景格让玩家误判范围。保留清透五色、A1-1 和灯圈位置关系。
5. 运行中改变可视高度时，更新同一映射和指针状态。保持炮口、警戒线和已有砖坐标。若后续要求进一步扩大逻辑宽或改变 H、下落路径和开场距离，需要单独确认，并重新验收 20 波、Boss 和三个 Build。仅改显示映射可以保持相同逻辑输入下的玩法、碰撞和音效。

| 文件 | 预计涉及的符号或范围 |
| --- | --- |
| `demo/v1/index.html` | 战斗态 `.shell/.arena/.playfield/.battle-surface/.battle-rim`、顶部 HUD 和技能栏容器、Canvas 与弹层相对次序。移除独立内框节点，保留既有按钮 ID 和无障碍关联 |
| `demo/v1/style.css` | 根网格、战斗态 `.shell/.arena/.topbar/.boss-hud/.playfield/.battle-surface/#game/.control-dock/.skill-slots`，短屏及安全区约束 |
| `demo/v1/neon-tokens.css` | 复用 `--screen-grid`、`--screen-fill` 和现有霓虹色；按需集中布局间距或侧墙提示参数 |
| `demo/v1/game.js` | `availableScale()`、`fitCanvas()`、`resetWorldSize()` 的显示职责、`resizeBattle()`、`setAim()`、`draw()` 的共同变换及 `drawBattleBounds()` 验证工具。需保护 `createWavePlan()`、`brickAt()`、`makeBall()`、`circleIntersectsRect()`、`reflect()`、`updateBall()`、`updateGiant()` 和 `generateSurvival()` |
| `demo/v1/juice-fx.js` | 复核 `applyCamera()` 与 `draw(ctx,fieldHeight)` 的遮罩、闪屏范围，只有全屏层级确有需要时调整 |
| `tests/experience/baseline.mjs`、`tests/experience/invariants.mjs`、`tests/release/ui.mjs` | 复用边界、源码不变量和 UI 测试。旧测试依赖 `.battle-rim` 的断言换成统一场地边界探针 |

## 8. 风险与回归清单

- 对 360×640、390×844、430×932 加桌面做布局与边界核对。覆盖 DPR 1/2/3、微信 iOS/Android、iOS Safari / Android Chrome、地址栏伸缩、横竖屏、刘海、Home 指示条和后台返回。检查 HUD 不挡砖和球，技能按钮、左右手模式、状态文字不越安全区。
- 验证同一逻辑点正向和逆向变换一致，左右和顶墙的页面映射误差小于 1 CSS px。覆盖触摸起点、跨边拖拽、`pointercancel`、暂停恢复、页面缩高、镜头震动和弹层后的指针复位。
- 固定种子比对 20 波初始砖阵、HP、砖尺寸、列距/行距、下落曲线与警戒时机。测水平、垂直缝通行、掠角、左右顶墙、普通球出底、超载反弹面和炮口位置。Boss 两波、召唤预警和阶段切换要经过真实渲染回归。
- 测裂变、电弧、机枪三流派完整 20 波、选卡、暂停、恢复、重开和结算。中文和英文分别验收。
- 对比 BGM、静音、音量、木质音效和已静音的四个事件。检查背景铺满后绘制成本、48 球密集画面、切换尺寸时的显存及帧耗时。CSS 网格设在静止页面背景，避免每帧重画整页背景。

## 9. 浏览器证据

未启用可变 QA 钩子的正常公开页用于截图和真实触摸。独立 QA 标签页用于碰撞和阵型读数。使用仓库现成 Chromium CDP 驱动，浏览器环境未提供专用 Browser 技能。名义视口、缩高与合成安全区的浏览器会话未记录运行异常或 HTTP 4xx/5xx。实体手机和微信内置浏览器本轮未测。

- [360×640 当前战斗](/tmp/marble-mobile-audit.GBWMFA/360x640-battle.png)
- [390×844 当前战斗](/tmp/marble-mobile-audit.GBWMFA/390x844-battle.png)
- [430×932 当前战斗](/tmp/marble-mobile-audit.GBWMFA/430x932-battle.png)
- [390×844 合成安全区](/tmp/marble-mobile-audit.GBWMFA/390x844-safe-area.png)
- [页面、DPR、触摸和缩高原始测量](/tmp/marble-mobile-audit.GBWMFA/measurements-final.json)
- [三个视口的 20 波阵型与碰撞探针](/tmp/marble-mobile-audit.GBWMFA/geometry.json)
