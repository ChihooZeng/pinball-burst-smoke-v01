# 《弹珠超载》Mixkit音效实物处理交接 · 2026-11-06

## 已处理（输入来自用户上传的原始WAV）

| 游戏事件 | 原始文件 | 原始时长 | 本轮导出 |
|---|---|---|---|
| 技能选择 | mixkit-unlock-game-notification-253.wav | 1.397s | skill_select.wav，保持原声 |
| 清屏过关 | mixkit-casino-bling-achievement-2067.wav | 4.000s | clear.wav，裁剪到**2.600s**，末尾150ms淡出 |
| 触线失败 | mixkit-arcade-retro-game-over-213.wav | 1.667s | fail.wav，保持原声 |

原过关录音2.5s之后低于约-73 dBFS（100ms RMS窗口），后段为极微弱衰减和静音。保留到2.6s以避免突然中断有效收尾。

已在ChatGPT交付：`pinball-casino-bling-trimmed-2.6s.wav`及`pinball_sfx_integration_20261106.zip`（包含上述3个游戏专用WAV、sound-pack.js、install_demo_sfx.py、README.md）。这些文件是**本次会话的交付件，不在本GitHub公开仓库**。安装脚本会校验`demo/v1/game.js`当前精确代码位置之后才写入，不能用在旧版45波`launch/`路径。

## 集成目标及验收

1. 玩家确认技能卡片时：`skill_select`（Mixkit Unlock）。
2. 每波真正清屏、Boss第20波最终完成：`clear`（裁剪2.6s后的Casino）。
3. 真正触线失败且状态锁定：`fail`（Mixkit Arcade Game Over）。
4. 修复原`unlockSound()`在手机首次触摸时误播`upgrade`的问题。
5. 保留旧合成`armor`、`drill`、`split`、`arc`、`giant`等声音直至真实战场验收；不修改物理、伤害、关卡。
6. 对电脑Chrome/Edge、Android浏览器和iOS Safari进行A/B听测、音量及快速清屏压声评估；新声效依赖用户手势启动。
7. 不能引用`assets.mixkit.co/sfx/download/`及`/preview/`当作线上实时音频源：2026-11-06独立浏览器访问三段URL均返回AccessDenied。**必须用游戏内可用的自托管二进制资源**。

## 发布状态

**正式`demo/v1/`尚未被此三段二进制音效替换，未发布新的线上Demo。**
由于本会话上传文件的二进制不能直接由现有GitHub文本文件连接器交给仓库，已在会话中制作完成带安装器的私有ZIP；接下来需要把该包安装到**正式20波Demo的开发工作树**，再验收发布。不要把“存档已完成”误写成“正式游戏已接入”。

## 其他5类既定选型（不重选）

- `mg-01` 机枪短木质敲击：还需接线并对12.5发/秒设置节流和声部池。
- `hit-02` 普通命中木板闷响：待接线。
- `break-x18` 骰子投掷1：需先把外部选中源入游戏、核对CC0。
- `boom-03` 硬脆爆裂：待与实际爆雷/爆炸触发区分。
- `upgrade-03` 升级短上扬音：需与新`skill_select`区分播放逻辑。

装甲命中可复用普通命中；砖块开花可复用击碎；植雷暂不单设。先完成8类音效整合和混音，不扩充成20类。

## 授权注意

Mixkit官方Sound Effects Free License允许整合到商业游戏，但禁止将素材作为独立stock资产或源文件包再分发。不要把未经整合的3个原始WAV作为独立可下载素材库公开发布。官方：<https://mixkit.co/license/modal/sfxFree/>。
