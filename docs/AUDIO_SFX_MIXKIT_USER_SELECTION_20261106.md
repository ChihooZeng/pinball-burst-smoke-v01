# 《弹珠超载》Mixkit 三项音效选定 · 2026-11-06

来自用户亲自试听 Mixkit 后上传的三张截图。**本记录视为人工选定，不再自动换音效；仅归档选型，尚未接入正式游戏。**

| 游戏事件 | 已选原名 | Mixkit展示时长 | 素材页面 |
|---|---|---|---|
| 技能选择（新独立事件） | **Unlock game notification** | 0:01 | [Mixkit Game SFX](https://mixkit.co/free-sound-effects/game/) |
| 清屏过关 | **Casino bling achievement** | 0:04 | [Mixkit Casino SFX](https://mixkit.co/free-sound-effects/casino/) |
| 触线失败 | **Arcade retro game over** | 0:01 | [Mixkit Game Over SFX](https://mixkit.co/free-sound-effects/game-over/) |

### 事件映射与不修改项

- **skill_select**：在玩家点击确认某个技能时播放，不等于波末“升级／解锁”奖励声，后者的 V5 `upgrade-03` 仍保留。
- **clear**：使用用户选中的完整 `Casino bling achievement`，不要未经用户试听就自动替换成其他素材。该音效展示约4秒；由于游戏波次连续，实际接入后应确认长尾是否被下一波覆盖，是否需要在混音器中提前淡出（先不改原素材）。
- **fail**：仅真正触线失败时播放一次，不因砖块下落的单帧边界重复触发。
- V5保留的**机枪`mg-01`、普通命中`hit-02`、击碎`break-x18`、爆雷`boom-03`**不变；升级`upgrade-03`亦保留。
- V6、V7、V8 的过关/失败实验选型仍在历史目录，**被此次用户直接选音取代**；不要把那些实验页中的自动测试选择当成最终用户意向。

### 素材来源与许可

以上3个标题、分类和0:01/0:04/0:01显示时长已在 Mixkit 页面核对。官网 [Mixkit Sound Effects Free License](https://mixkit.co/license/modal/sfxFree/) 允许将音效整合进商业游戏，但**不允许将音效作为独立商品、原素材或源文件包再分发**。因此本次提交仅保存**音效标题、源页和用户选择**，**没有把从Mixkit抓取的原音文件直接提交到公开GitHub仓库**。

- 将来接入游戏时从官方页面下载素材，核验授权内容、实际文件时长及音量，作为游戏产品组成部分使用；不要制作公开的Mixkit素材下载索引。
- 这三张截图是所选音效的标识，不是实际音频文件。本记录没有声称截图里包含下载后的音频字节。
- 本次仅归档选型，不修改正式Demo、玩法、任何音频播放器或此前素材。
