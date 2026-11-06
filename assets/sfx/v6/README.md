# 《弹珠超载》音效专项重选 V6 — 清屏成功 / 触线失败

## 背景

2026-11-06用户完成V5人工试听。原V5导出有6类`selected`、1类`pending`，但**文字反馈否定了清屏过关的全部旧素材**：明确需要“成功的喜悦”，而之前音乐“都是向下的”。因此V6按**五类继续保留、两类重选**处理，不使用导出技术状态混淆实际用户验收。

- 完整V5记录：`v5-review.json`、`docs/AUDIO_SFX_V5_USER_REVIEW_20261106.md`。
- V6线上试听：`assets/sfx/v6/index.html`。
- V6候选数据：`assets/sfx/v6/catalog.js`。

## 本轮范围

- **清屏过关**：10段新源音频；来自Win Jingle、Win Sound Effect、Victory Sting、Victory Fanfare、Well Done、Hyper-Ultra-Fanfare等在作品页明确写着Win/Victory/Success的素材，不再从V5同一类Kenney下降/提示短音里选。
- **触线失败**：10段新源音频；从Total Fail、Game Over、Lose Game Short Music Clip及几段不同配器的Game Over 短曲中选。
- 所有新候选都通过OpenGameArt作品源页核对真实文件href及页面写明的`CC0`标识；`sourcePage`在目录中逐条提供。**尚未逐段经过人耳试听，不是最终定稿。**
- 页面支持整段试听、连续3秒试听（短素材自动循环、长素材只试听前3秒）、收藏备用、首选单选、备注、本地持久化、JSON/Markdown导出。
- 两类均**默认待定**，不会自动延续过关旧选`Rise03.wav`或上次失败声。左侧保留V5的其他五类结论。
- **未修改**V5素材、正式游戏、R1实验场景和此前音效数据。

## 外部音频说明

音源采用`https://opengameart.org/sites/default/files/*`直接媒体链接，而非本仓库副本。目前仅供在线试听，播放失败可点击“原出处”到作者页面。和过去GitHub镜像素材不同，跨站网络及热链策略可能阻断自动播放；因此播放器使用浏览器原生`HTMLAudioElement`，不借助需要CORS的Web Audio解码。**外链试听不能视为正式游戏资源已归档或移动端兼容已验收。**

## 之后实施

1. 用户真人从每组10个新候选中选定/收藏，特别检查过关是否真的喜悦、失败是否有辨识度且不刺耳。
2. 如仍不满意，优先从已有候选总结喜好，建议专门原创作曲或混音，而非再堆同质素材。
3. 真正接线前，仅下载最终候选入仓并重新验证许可证、解码、分组音量和R1并发时的整体听感。
4. 过关音与升级音不得默认使用同一个`Rise03.wav`替代，因为用户已否决前者。
