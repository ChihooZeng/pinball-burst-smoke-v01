# RC.2 视觉候选基线

2026-11-20，Asia/Shanghai。源码工作树 `codex/pinball-v1-release` 干净，HEAD 为 `4f2498ccbe432b84dbcbf4c18109f3056217e470`。GitHub Pages 最新成功部署为 `949994dfe05a902dc94569918e9f737d8ddf9788`，它的 `release.json` 指向该源码提交。`git diff --name-status 4f2498c 949994d -- demo/v1` 只有发行包排除的 `demo/v1/README.md`。因此以完整源码为基线，独立分支为 `codex/v1-visual-fidelity-a1-1-20261120`。

- 交付包的 `MANIFEST.sha256` 全部验证通过，包内任务文件与外置同名附件逐字节一致。
- 基线 ZIP 由未改动的 `scripts/package-release.py` 从 Git 提交导出。SHA-256 为 `37895bb17852cf2ce5119d6c2975e6240b96e84c6dfd810518f440b2bd711a47`，51 个文件有包内校验和。基线 ZIP 可以用相同命令复现。
- 任务合同中的五个源码 blob 一致。音频目录树为 `f006f87297db671414625195ce5ec11c9b6671cc`。本轮签出时基线发行单测 5/5。
- 生产托管仓库 `ChihooZeng/pinball-burst-smoke-v01` 与 RC.2 托管仓库 `ChihooZeng/pinball-burst-v1-preview` 都是只读参照。浏览器候选另用独立仓库。
