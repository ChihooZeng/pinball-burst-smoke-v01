# 弹球暴走 v0.5H — 手机触觉反馈独立试验

试玩：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v05-haptics/
对照无振动版：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v05/

## 边界
在 v0.5 复制版本内，仅新增 `haptics.js` 及页面触觉开关。**不改**砖块、射速、装甲 HP、升级、巨型球伤害、声音、动画或游戏时长。页面默认关闭震动，用户点开开关后才启用，支持随时关闭和主动“测试轻震”。

## 平台能力与限制（2026-10-28 核对）
- 标准 Web Vibration API：`navigator.vibrate()`，部分 Android 手机/浏览器支持；需要用户与页面交互，且浏览器暴露 API 不等于硬件一定振动。
- iPhone Safari 没有可靠的标准逐次碰撞振动接口；当前 `iOS 26.5+` 的 WebKit switch 程序触发技巧存在兼容变化。
- 曾调查 `ios-vibrator-pro-max`，其方法覆盖原页面点击/拖动并受「点击后约 1 秒有效」限制；由于自动击砖持续发生、以及我们的单指瞄准操作，当前不集成此非标准方案。也不启用其可能阻塞主线程的选项。
- 未来若需要 iPhone 上的可靠碰撞触觉，应走原生 iOS 容器与 Core Haptics/UIFeedbackGenerator 或由 Apple 提供稳定网页支持。

## 振动分级（测试参数，单位：ms）
| 事件 | 振动模式 | 规则 |
|---|---|---|
| 装甲砖受击但未破 | 10 | 约 240ms 节流 |
| 普通球打碎砖块 | 18 | 约 145ms 节流 |
| 连击达到 3 的倍数时击碎 | [20,25,25] | 约 350ms 节流，强于普通破砖 |
| 手动释放巨型球 | [34,35,48] | 约 420ms 节流，最高优先级 |
| 手动“测试轻震” | 22 | 只在用户点击测试按钮时触发 |

- 仅使用原生 `navigator.vibrate`；不增加依赖和隐藏 DOM 点击。
- 同帧请求合并，按 巨型球 > 连击 > 破砖 > 装甲受击 优先级只派发一个。
- 不为开火、撞墙、粒子、浮字或巨型球贯穿每一块砖单独振动，防止密集持续震动。
- 页面不可见时不振动。关闭时调用 `vibrate(0)` 停止；API 失败或抛错时静默降级，游戏继续运行。
- 开关默认关闭，不存储用户偏好，方便 A/B 体验比较。未检测到 API 会禁用开关与测试按钮。

## 已运行检查
- `node --check game.js`
- `node --check haptics.js`
- `node haptics-test.js`
- Microsoft Edge (390×844) 本地页面截图 PASS（只能检测页面布局，不提供马达物理反馈）
- 单元测试包含模拟振动器的事件合并、节流、优先级、开关、不可见页面以及 iOS/API 不支持的降级，另测试了游戏基本碰撞/升级流程。
- 尚缺实际 Android 手机马达手感测试；不能用模拟 API 成功等同真实振动。

参考：
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
- https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
- https://github.com/lochie/web-haptics/issues/41
- https://github.com/samdenty/ios-vibrator-pro-max
