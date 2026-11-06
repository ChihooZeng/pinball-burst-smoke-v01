# 《弹珠超载》20波真实音效验收 · Audio QA (2026-11-06)

试玩地址（GitHub Pages正式部署后）：`/demo/audio-qa/`。

## 目标与隔离

- **音效接线成功后先在独立20波游戏中验收**，不直接覆盖正式`/demo/v1/`。
- 复制正式20波游戏的`game.js`、`index.html`，资源`../v1/builds.js`、`../v1/juice-fx.js`、`../v1/style.css`继续复用。**任何伤害、弹球数量、移动、砖块、波数、Build和Boss胜利逻辑均未调整。**
- 验收时可使用本页侧边调试栏听不同事件、调整每组音量、切A原版/B已选音效。既有20波试玩原版一直可用。
- 不依赖Mixkit直链：官方CDN访问受限（浏览器实际访问返回AccessDenied），所有音频已作为该试玩游戏的内置资源托管。

## 玩家已选音效及事件

| 游戏事件 | 文件/来源 | 游戏中的触发 |
|---|---|---|
| 技能选择 | Mixkit `Unlock game notification` | 首次选Build、以及之后点击确认三选一卡片 |
| 过关清屏 | Mixkit `Casino bling achievement` | 每次普通清屏与20波最终胜利；4秒原音裁至2.60秒，尾部150ms淡出 |
| 触线失败 | Mixkit `Arcade retro game over` | 真正的触线失败（事件发生一次） |
| 机枪射击 | V5 `mg-01` Kenney `impactWood_light_000.ogg` | 仅机枪流派的真实发射事件，非机枪保留原版轻发射声 |
| 普通命中 | V5 `hit-02` Kenney `impactWood_medium_001.ogg` | 实际命中、未击碎且非装甲的砖块 |
| 砖块击碎 | V5 `break-x18` CC0 `dice-throw-1.ogg` | 真正碎砖事件；来自Casino Audio，已自托管 |
| 爆雷/冲击 | V5 `boom-03` Kenney `impactGlass_heavy_002.ogg` | 原试玩内震荡/爆炸（`shock`）事件，包含Boss破坏连环反馈；不虚构不存在的植雷玩法 |
| 升级/解锁 | V5 `upgrade-03` OGA `Rise03.wav` | 升级三选一界面出现时，区别于技能卡片点击确认声 |
| 装甲命中 | 复用普通命中并降低音高 | 不另设素材和选型类别 |

三段Mixkit原素材来自玩家自行上传：
- `mixkit-unlock-game-notification-253.wav`
- `mixkit-casino-bling-achievement-2067.wav`
- `mixkit-arcade-retro-game-over-213.wav`

游戏音效压成一个高质量MP3合并资源`audio/mixkit-game-sfx-sprite.mp3`（约112kbps，44100Hz），保留原始截取顺序和起止秒数。在线音效以AudioBufferSourceNode精确取样，避免外网加载；压缩版属于QA/网页游戏资源，原始WAV与单独裁剪WAV仍在对话附件里。

## 关键技术处理

- 修复音频解锁时误播“升级”声音。
- 分离`skill_select`与`upgrade`，避免混用。
- 高密度命中/击碎/连发使用分组节流（75–205ms）与最大16个总声部，结果反馈优先级最高。
- WebAudio一次解码，按需加载、RMS/峰值简单归一、DynamicsCompressor防峰值叠加。过关和失败切换时停止低优先级撞击声，技能卡片确认可结束过关尾声。
- 兼容原音量滑杆，调试栏可切A（原合成音）／B（已选实录），各组可单独调音。
- 不播放不存在的“装甲单独音”“开花单独音”“植雷单独音”。
- 游戏首页`?qa=1`可使用既有测试入口验证Boss 10/20；请勿把QA入口视为玩家正常获胜。

## 已做自动检查与待人工验收

- `game.js` 与新增`sound-pack.js`、`qa-panel.js`经过JS语法检查。
- Git差异限定在 `demo/audio-qa/` 目录，不会修改 `demo/v1/`、正式游戏Build数值或旧素材。
- Mixkit音频合并资源Git对象按字节SHA校验；Kenney与OGA源均以之前保留的真实Git blob直接复用；新碎砖音效和上游二进制blob SHA一致。
- **仍须线上浏览器测试、手机设备验收及20波/10波Boss/20波Boss真实试听。不能把语法检查当作完工。**

## 授权及后续发布

Mixkit Sound Effects Free License允许声音整合进商业电子游戏，但禁止将音频作为独立音效包出售/分发；这里仅作为玩家提供的游戏内媒体资源使用，不提供通用素材下载。Kenney及OpenGameArt需按原始资源单独核实CC0和来源记录。提交的是游戏组成部分，不是独立音效库。

**本轮正式Demo路径`demo/v1/`未改；验收通过后再决定是否合并到正式发行版本。**

## 浏览器手动核对

从 [20波音效验收版](https://chihoozeng.github.io/pinball-burst-smoke-v01/demo/audio-qa/) 打开页面。建议先使用电脑Chrome或Edge：

1. 在右侧控制台点击「技能选择」试听，确认Mixkit声源可以播放，没有404。
2. 选择机枪Build，确认高频发射声是木质轻敲，命中和击碎声音分别触发。
3. 清屏后应该听到裁剪后的Casino bling；升级卡片出现时是Rise03；确认技能卡片时是Unlock notification。
4. 使用带`?qa=1`的测试入口分别直达Boss10/20，检查爆炸与清屏不叠成巨响。
5. 故意触线失败，检查只播放一次Arcade retro game over。
6. A/B切换到原版合成音，确认对照功能存在；再切回B测试各组音量。
7. 浏览器控制台/右侧面板若显示音频加载错误，记录具体事件名和设备，不要标记为通过。

目前仅提交完整音频和代码，**不能用仓库提交成功替代真实浏览器与真机验收**。
