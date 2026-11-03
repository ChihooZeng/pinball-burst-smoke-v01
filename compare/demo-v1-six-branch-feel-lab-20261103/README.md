# 《弹珠超载》六分支速测版 · 自动技能 / 三球扇射 / 独立反弹（2026-11-03）

试玩：https://githubraw.com/ChihooZeng/pinball-burst-smoke-v01/main/compare/demo-v1-six-branch-feel-lab-20261103/index.html

## 当前规则
- **操作只控制方向**：普通弹球持续自动发射；巨型球能量满100%自动释放，右下角显示自动充能及生效时间，不需要点击，也没有手动模式。
- **机枪A直线穿阵**：发射间隔比之前更短；保留每6发一颗真实穿阵弹。
- **机枪B扇形散射**：一次发射三颗真实弹球（左/中/右，角度±0.32弧度），每颗独立碰撞砖块、侧墙并反弹，而不是原来一次一颗在各个角度轮流发射。
- 三核心×两分支依然可一键直达；第6波密集砖阵与第10波Boss两模式保留；其余伤害、HP、Boss机制和最近的“脆击重做”保持。
- 速测起始巨型球100%能量，下一个物理帧自动释放；后续破坏再充能自动释放。
- 试玩只读此目录中的JS/HTML/CSS，正式Demo和旧B版未改动。

## 测试
模拟DOM/Canvas和120Hz物理帧验证：六分支×两种场景均满能自动发动巨型球；扇形一次三颗物理球，并分别发生砖块与墙反弹；物理球数上限48未超限；第1波正常升级三选一仍正常。
还没有完成移动Safari/安卓实机效果及FPS测试。

来源分支：https://github.com/ChihooZeng/pinball-burst-smoke-v01/tree/codex/demo-v1-auto-giant-fan3-20261103

对齐文档：https://github.com/ChihooZeng/pinball-burst-smoke-v01/blob/codex/demo-v1-auto-giant-fan3-20261103/docs/DEMO_V1_AUTO_GIANT_FAN3_ALIGNMENT_20261103.md

说明：“不能进行弹射”此轮按之前确定的“散射球本应能独立反弹”当作旧版本缺陷修复；若你这次是要取消散射球的反弹，需另行明确。
