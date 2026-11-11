# 音效定稿 · 2026-11-11（audio-qa-v21u）

> 用户 11-11 验收：「先按这个版本来，音效已经确定好了」。
> 本文是定稿快照 + 发布前剩余事项。之后音效只做「补证 / 替换」，不再改听感。

## 一、定稿清单

| 事件 | 默认素材 | 文件 | 增益 | 时长 | 授权 |
|---|---|---|---|---|---|
| 砖甲受击 | V5 木板闷响 | `demo/audio-qa/audio/hit.ogg` | .55 | 0.33s | Kenney impact-sounds · CC0 |
| 砖块击破 | BREAK-M1 干木裂 | `audio/break-mid-wood.wav` | .30 | 0.11s | Kenney impact-sounds · CC0 |
| 清屏升级 | CLEAR-R02 钢琴短句 | `audio/clear-r02-piano-chime.wav` | .54 | 0.98s | ⚠️ 400 Sounds Pack · 待核实 |
| 触线失败 | FAIL-R01 power_down | `audio/fail-power-down.wav` | .56 | 0.52s | ⚠️ 400 Sounds Pack · 待核实 |
| 裂变 | SPLIT-A 木质上扬散射 | `audio/split-wood-flick.wav` | .26 | 0.13s | 本项目合成（无第三方） |
| 连锁闪电 | ARC-B2 铁皮弹击 | `audio/arc-b02-metal-snap.wav` | .27 | 0.11s | 本项目合成（无第三方） |
| 开始游戏 | click1 | `audio/ui-start-click1.wav` | .58 | 0.09s | Kenney UI · CC0（本地无包，待补截图） |
| 其他按钮 | rollover2 | `audio/ui-click-rollover2.wav` | .44 | 0.05s | Kenney UI · CC0（本地无包，待补截图） |
| 墙面反弹 | impactWood light 000 | `audio/wall-bounce-wood-light-000.wav` | .50 | 0.10s | Kenney impact-sounds · CC0 |
| BGM | Cut and Run | `audio/bgm-cut-and-run.m4a` | 0.8× | 206s | Kevin MacLeod · CC BY 4.0（需署名） |

保留的实机候选（不删、默认不启用）：
- 裂变：SPLIT-B 木质双击颗粒、SPLIT-C 低闷噗加尾
- 连锁闪电：ARC-B1/B3/B4/B5/B6
- 砖甲受击：V5 木质轻敲；触线失败：FAIL-R02 undesired

## 二、授权状态（发布前必须清账）

| 来源 | 证据 | 结论 |
|---|---|---|
| Kenney impact-sounds | zip 内 `License.txt` 写明 CC0；`hit.ogg`/`mg.ogg` 与包内原件 **md5 逐字节一致** | 可商用，无需署名 |
| Kenney UI（click1 / rollover2） | 本地已无原包 | CC0 通例，但需补下载页与条款截图存档 |
| 400 Sounds Pack | 包内**无 LICENSE / README / credits**；早前的授权核查结论为「待核实」 | ⚠️ 不能假设可商用 |
| 本项目合成（裂变 / 闪电默认项） | 生成脚本在本会话，纯合成 | 自有，无第三方 |
| Cut and Run | Incompetech CC BY 4.0 | 可用，必须在游戏内署名 |

**受影响的两条**：清屏升级（`grand_piano_chime_positive`）、触线失败（`power_down`）——都来自 400 包。

两条出路：
1. **补证**：找到 400 Sounds Pack 的下载页 / 订单，确认许可类型并截图存档；
2. **替换**：清屏改用 Mixkit（条款可查）或自研；失败音自研一版「下坠 + 闷响」。

## 三、接下来的顺序

1. **授权清账**（阻塞发布，见上）——只有 2 条要处理。
2. **合并回主线 `demo/v1`**：把 `sound-pack.js` + 素材 + 触发点搬过去。
   实测 diff 只有 110 行，其中 **1 行与音效无关**（第 10 关选卡标题文案），合并时剔除。
3. **玩家设置页**：音量滑杆 / 静音开关 + 「设置-说明」里的 CC BY 4.0 署名文本。
4. **兼容性验收**：iOS Safari 首次手势解锁、切后台、锁屏、蓝牙切换；低端机内存（BGM 走 `<audio>` 流式，不 decode 42MB）。
5. **推送与部署**：`origin/main` 落后 19 个提交，合并后统一推。

## 四、已知取舍

- 追击 / 钻头 / 超载三个技能音**仍静音**（11-10 判定暂不加，`LEGACY_SYNTH_CUES_ENABLED=false`）。
- 旧素材文件（`split-glass-pop`、`arc-laser-4`、两批候选）全部留在 `audio/` 里，不删。
- 音效引擎与调试台分离：玩家侧只读默认值，调试台只在 `?qa=1` 下加载。
