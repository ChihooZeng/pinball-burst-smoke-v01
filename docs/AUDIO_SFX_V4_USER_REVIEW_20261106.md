# 《弹珠超载》V4 音效人工选型结果 — 2026-11-06

> 用户网页导出时间：`2026-11-06T04:32:31.386Z`
>
> 状态：**仅封存试听结果与素材，不表示已接入正式游戏、不表示10项全部最终定稿。**

## 原始导出（保留用户备注和原始链接）

| 游戏事件 | 选择 | 音频来源 | 状态 | 备注 |
|---|---|---|---|---|
| 机枪射击 | 01 木质轻敲 | https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/impact-sounds/impactWood_light_000.ogg | selected_new | 1.2.3.都可以，先进行保留 |
| 普通命中（砖未碎） | 02 木板闷响 | https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/impact-sounds/impactWood_medium_001.ogg | selected_new | |
| 砖块击碎 | 待定 | | needs_new_asset | |
| 装甲砖命中 | 待定 | | needs_new_asset | |
| 砖块开花 | 05 弹润破裂 | https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-rpg-pack/RPG Sound Pack/NPC/slime/slime1.wav | selected_new | |
| 植雷 | 02 轻落点 | https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/interface-sounds/drop_002.ogg | selected_new | |
| 爆雷引爆 | 03 硬脆爆裂 | https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/impact-sounds/impactGlass_heavy_002.ogg | selected_new | |
| 清屏过关 | 10 上升完成 | https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-levelup-powerup/Rise03.wav | selected_new | |
| 触线失败 | 待定 | | needs_new_asset | |
| 升级 / 解锁 | 03 短上扬音 | https://raw.githubusercontent.com/Mcamento8/open-game-sfx-index/main/audio/oga-levelup-powerup/Rise03.wav | selected_new | |

用户原始备注：V3已选音频为原有工作树文件，V4新候选为CC0外部试听来源；接入正式游戏前须将获选音频自托管、核对文件许可与设备兼容。

## 结果与解释

- **7 组选中新的声音，3 组仍待重选**：`砖块击碎`、`装甲砖命中`、`触线失败`。这3组不能使用其他文件自动填充。
- **机枪保留3个备选，不是只保留第1个**：`mg-01` 木质轻敲（页面首选）、`mg-02` 薄铁轻碰、`mg-03` 短促硬击。都来自V4实际 `catalog.js`，不是`impactWood_light_001/002`。
- **清屏与升级使用相同音频**：两个事件均选中 `Rise03.wav`。先原样保留；游戏内验证时建议至少确认一次是否需要区分“奖励”和“章节结束”。未经用户同意不更换。
- **这次只做音效资源封存**。不接线、不修 `unlockSound()` 首次触发升级音的旧bug、不修改R1和正式Demo。
- 已选和备用音频已复制到本仓库 `assets/sfx/selected-v4/`，无需继续依赖外链保留这些文件。对应选择关系在 `assets/sfx/selected-v4/choices.json`。
- 音源来自开源镜像 `Mcamento8/open-game-sfx-index` 的标注CC0素材；其中Kenney是游戏音效包，OpenGameArt的 `RPG Sound Pack` 为artisticdude、`Level Up / Power Up / Coin` 为wobbleboxx。后续发行前独立复核原站授权与真机播放。
- 本次迁移通过Git对象SHA一致性核验：源镜像文件与存档文件**字节一致**，没有变调、压缩或重新编码。

## 下一阶段

1. 对尚未通过的击碎、装甲、失败这**3组**集中重选；已经认可的7组暂时不要重新开启百音频测试。
2. 在R1真实高频破坏场景里对“单听已选音”的机枪、命中、植雷、爆雷做A/B混音验证，并加入并发节流，防止合起来发闷。
3. 音频接线阶段再修首次音频解锁误播升级音的P0错误，保留M2.5音效回退。
4. 清屏与升级的 `Rise03.wav` 相同，不影响当前封存，但需在正式游戏中额外验收它们是否能清晰表达不同结果。

关联：`assets/sfx/v4/selector.html`、`docs/AUDIO_SFX_V2_USER_REVIEW_20261105.md`。
