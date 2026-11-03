# 《弹珠超载》六分支试玩 — 脆击重做版（2026-11-03）

试玩：https://githubraw.com/ChihooZeng/pinball-burst-smoke-v01/main/compare/demo-v1-six-branch-feel-lab-20261103/index.html

## 本次变动
- 重做 120ms 压缩与弹回；高耐久砖每次受击都在砖体上留下短促高对比撞击面。
- Boss与精英砖也接入相同受击位移（此前绘制时跳过）。
- 音效增加短脆噪声击打和中低频重心，不堆长尾低音；分支、HP、物理轨迹不变。
- 暂停→特效强度：`脆击重做（默认）` / `上一版强化击中` / `B版轻快` / `更轻` / `关闭`。
- 六分支、一键进入第6波密集砖阵或第10波Boss、开场满能量手动巨型球均保留。
- 原正式Demo与旧B版、玩法参数均未改动。

## 验收边界
逻辑模拟：6流派×2场景启动、巨型球释放、装甲命中形变、受击白光和新音效模式初始化测试通过。
尚未经真人或真机Safari主观手感/FPS验证。此版依旧是独立实验，不代表正式平衡。

修订依据和交接文档：https://github.com/ChihooZeng/pinball-burst-smoke-v01/blob/codex/demo-v1-six-branch-impact-rework-20261103/docs/DEMO_V1_IMPACT_REWORK_SNAP_20261103.md

源码：https://github.com/ChihooZeng/pinball-burst-smoke-v01/tree/codex/demo-v1-six-branch-impact-rework-20261103
