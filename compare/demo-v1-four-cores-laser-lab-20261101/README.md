# 《弹珠超载》四大流派原型：激光核心（2026-11-01）

试玩：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/demo-v1-four-cores-laser-lab-20261101/

- 源码开发分支：`codex/demo-v1-laser-core-lab-20261101`
- 官方主线（仍维持旧版）：https://chihoozeng.github.io/pinball-burst-smoke-v01/demo/v1/
- 原 B 版：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/m25-light-impact-ab/
- 在独立候选上延续 B 版轻快打击感和触线危险提示。
- 第1波清屏后四选一：裂变、电弧、机枪、激光。后续每波仍三选一，允许最多两种核心能力组合。
- 激光暂定基础机制：持续光束沿瞄准线切割，最多1次墙面反射；升级后可按一条光路依次伤害更多砖块；保持原先的普通弹球和超载技能。激光的计时伤害与等级参数**只是原型，不代表最终平衡**。
- 激光两个专属分支、四大流派融合与核心升级重构尚未设计/实现。
- 当前是独立实验版本；严禁据此声称手机FPS、Boss10/20或20波自然通关已通过。
- 回归测试：`node demo/v1/laser-core-smoke.cjs`（仓库分支）。
