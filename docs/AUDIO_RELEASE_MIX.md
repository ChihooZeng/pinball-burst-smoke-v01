# V1.0 音效映射与试听

| 事件 | 默认声源 | 混音 |
|---|---|---|
| 砖块受击 | V5 木板闷响，原 Ogg 转单声道 PCM | 55ms 限流，最多四声部 |
| 砖块击碎 | 原干木裂 | 62ms，最多三声部 |
| 连击 | 短双音 | 每三次连续击碎可触发，至少间隔 600ms |
| 球撞墙 | 原轻木碰撞 | 轻量，频繁时让 BGM 浅压低 |
| 裂变 | 木质上扬散射 | 220ms，单声部 |
| 电弧 | 金属弹击 | 220ms，单声部 |
| 机枪开火 | Kenney switch28 转 PCM | 短促低增益，130ms 限流 |
| 超载 | Kenney 低频音转 PCM | 单次启动声，900ms 限流 |
| 核心击败 | Kenney crunch 转 PCM | 单声部，BGM 让位 |
| 清屏 | 原 CLEAR-R02 钢琴短句 | 每波一次 |
| 开始 / UI | 原 click1 / rollover2 | 首次触控解锁 |
| 失败 | 原 Power Down | 失败时 BGM 淡出 |
| 通关 | 四音上行和声 | 独立于清屏声，BGM 淡出 |
| BGM | Cut and Run · Kevin MacLeod | 本地流式 AAC，80 kb/s 编码，2.0MB；原始素材归档保留 |

受击保留原演奏内容。混音统一限幅、源归一化和事件限流，音量与静音对音效及音乐一起生效，且跨页面保存。启动仅预热已选声源，BGM 到首次交互时开始。媒体可用时进 Web Audio 统一增益节点，缺少该 API 时走元素音量与静音。素材失效时保持游戏可玩。

授权沿用 [音效定稿](AUDIO_SFX_LOCKED_20261111.md)。新增短音来自项目合成及既有 Kenney CC0 素材。BGM 用于游戏的版本有音量归一化、淡出裁剪和编码调整。[原曲及 CC BY 4.0](https://web.incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100851)

本机 Chromium 390×844 实际触摸开始，检查媒体时间推进、砖块击碎、机枪、超载、Boss 击败、清屏及静音前后，录下 Web Audio 总线。运行 `node tests/release/audio.mjs <录音路径> <URL>`。实机音质、系统静音、蓝牙和手机浏览器的前后台音频仍需人工试听。
