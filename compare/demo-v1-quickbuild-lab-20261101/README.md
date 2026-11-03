# 《弹珠超载》三流派一键速测（2026-11-03 验收）

试玩（静态直连）：https://githubraw.com/ChihooZeng/pinball-burst-smoke-v01/main/compare/demo-v1-quickbuild-lab-20261101/index.html

此 URL 已从历史四流派实验版更新为 **三大核心：裂变 / 电弧 / 机枪**。

- 一键直达第6波；3个Build使用同一砖阵，预配5次合法升级。
- 暂停与结算可返回速测菜单，正常从第1波开始仍可用。
- 速测仅验证流派：不触发巨型球；不计入正常完整通关。
- 激光因为只是普通弹球额外叠加持续伤害，既无独立操作机制，又没有实现专精分支，故从这一测试版完整删除。
- 原非正式激光实验依然保留在历史比较路径以便代码审计，不建议再作为试玩版本。
- 第10波与第20波Boss仍可通过原调试入口（需要 `?qa=1`）直达；非自然闯关。
- 实测范围：JS模拟DOM帧和选卡/跳关逻辑检查。手机浏览器实机帧率与完整20波平衡仍需单独验证。

开发分支：https://github.com/ChihooZeng/pinball-burst-smoke-v01/tree/codex/demo-v1-quickbuild-lab-20261101

变更分析：https://github.com/ChihooZeng/pinball-burst-smoke-v01/blob/codex/demo-v1-quickbuild-lab-20261101/docs/DEMO_V1_LASER_REMOVAL_20261103.md
