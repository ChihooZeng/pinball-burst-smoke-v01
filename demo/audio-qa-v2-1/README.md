# 《弹珠超载》音效调试台 V2.1

独立验收路径：`/demo/audio-qa-v2-1/`（线上 `https://chihoozeng.github.io/pinball-burst-smoke-v01/demo/audio-qa-v2-1/`）。
V2（`/demo/audio-qa-v2/`）与正式游戏（`/demo/v1/`）**保留不动，本版不覆盖**。

## 这一版只做一件事：把 9 个音效分组收敛成 4 类实际结果

旧版是「按动作配声音」：机枪、普通命中、砖块击碎、装甲命中、爆雷、技能选择、清屏、失败、升级提示。
V2.1 改成「按砖块的结果配声音」，球打到砖块只有两种互斥结果，另加两个全局节点。

| 音效事件 | 素材 | 是否可选 |
|---|---|---|
| 砖甲受击（击中但砖块存活） | V5 木质轻敲 / V5 木板闷响 | 二选一，另加「无音效」 |
| 砖块击破（HP 归零、实际摧毁） | break-x11 · impactGlass heavy 000 | 固定，另加「无音效」 |
| 清屏升级（清屏与升级同一节点） | clear-x14 · Upper01 | 固定，另加「无音效」 |
| 触线失败 | fail-02 · 02 错误提示中音 | 固定，另加「无音效」 |

**击破不是第三种声音，而是同一次碰撞的第二种结果。** 代码上由 `hitBrick()` 的
`if(b.hp>0){...playSfx("armor");return false;}` 保证：砖块存活时提前返回，走不到击破分支；
被击穿时直接走到底部的 `playSfx("break")`。二者不可能在同一次碰撞里都触发。

## 删除的独立事件

机枪射击（每发开火）、砖块击碎作为独立分组、爆雷/连锁爆破（含 Boss 终结爆炸与撞墙反馈）、
独立技能选择、独立升级提示。以上都不再发声，也不再出现在调试台。

保留的是游戏原有的合成提示音（裂变、追击、钻头、电弧、超载、Boss 预警），它们不属于这次音效分组，
继续由 `game.js` 的 `beep()` 播放，不受本调试台四个开关影响。

## 素材全部自托管

```
demo/audio-qa/audio/mg.ogg                       V5 木质轻敲（原机枪组 bundled）
demo/audio-qa/audio/hit.ogg                      V5 木板闷响（原普通命中组 bundled）
demo/audio-qa-v2-1/audio/break-x11-...ogg        break-x11  impactGlass heavy 000
demo/audio-qa-v2-1/audio/clear-x14-Upper01.wav   clear-x14  Upper01
demo/audio-qa-v2-1/audio/fail-02-error_005.ogg   fail-02    error 005
```

原素材来自 `Mcamento8/open-game-sfx-index`（CC0-1.0）。V2 选择外部 URL 现取现播，
V2.1 把三个最终确定的文件下载进仓库，页面不再依赖 `raw.githubusercontent.com`，断网也能用，
也不再需要「加载失败回退」这条路径。

## 调试台保留的功能

- 实时试听：单次 / 连播 3 秒，试听不改变游戏内路由。
- 每类独立音量（0–150%）。
- 停止所有声音。
- A/B 对照：只给仍有候选的砖甲受击，A = 原版合成音（旧 beep），B = 已选素材。
- 无音效开关 + 下拉里的「无音效」选项，两者同步，刷新后保留。
- 音效配置 JSON 导出（`selectedId: "none"` 即该类关闭）。
- 游戏实时状态、Boss HP、帧异常、素材解码数、触发计数。
- 第10关直达 / 应用首张升级卡继续 / 恢复暂停 / 导出卡住诊断。

## 测试

```bash
node demo/audio-qa-v2-1/tests/audio-v21.test.cjs
```

36 条断言，覆盖事件表、路由、互斥、无音效、持久化、JSON 导出、静态边界。
真实浏览器验证另外执行（Chrome headless + CDP），结果见交付报告。

## 代码边界

新增 `demo/audio-qa-v2-1/`：`index.html`、`game.js`、`sound-pack.js`、`qa-studio.js`、`qa-studio.css`、
`audio/`、`tests/`。`game.js` 只改了音效触发点与 `playSfx` 的分流，玩法、技能、数值、关卡、
弹道、打击感未改。没有新增音效，没有改正式游戏。
