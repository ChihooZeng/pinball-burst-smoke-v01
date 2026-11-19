# 《弹珠超载》V1.0 本地发行与回滚

2026-11-19（Asia/Shanghai）。开发工作树为 `codex/pinball-v1-release`，恢复时的 HEAD 为 `5e7ebf4e0e9858ed345ca55b4a4e70b745f3e8fd`。出包从工作树读取，因此包含已保留的未提交发行改动。包内 `release.json` 记录这一来源，`SHA256SUMS` 标识具体发行内容。

## 发行入口

1. 在发行工作树运行 `python3 scripts/package-release.py <新的ZIP路径>`。将 ZIP 解包到新目录，运行 `shasum -a 256 -c SHA256SUMS`。
2. 在解包目录运行 `node server/start.mjs`，打开 `http://127.0.0.1:4181/`。地址跳转到 `/demo/v1/`；直接访问该入口也能启动。
3. 静态发布只需根 `index.html` 和 `demo/v1/`。根入口使用相对路径，在站点子目录下可用。静态统计关闭，Node 统计须单独配置。两种方式均默认禁用广告。
4. 验证隐私页、图标、脚本和样式。Node 的 `/favicon.ico` 返回图标，BGM 按 `audio/mp4` 提供并接受 Range。音效预加载最多并发三项，保留原有音量、素材及路由。
5. 按 `tests/release/package-smoke.mjs <根URL> <新证据目录>` 验证 Chromium 触摸开局、瞄准命中、暂停和继续、静音、归属署名、资源响应及播放状态。测试输出为文字、JSON 和截图。

## 回滚演练

1. 记录当前站点版本和配置，保留可独立服务的上一版本目录。若是 Node 统计站点，保持 `PINBALL_DB` 指向版本目录外的数据文件。
2. 在隔离站点，先指向新包并核对根入口及游戏路径，再把站点版本指回已验收目录或部署版本。新的生产变更需使用托管商的部署回退或通过新的 Git 提交恢复上一版本内容。
3. 重新检查两条入口、游戏脚本和音频脚本的哈希，再用浏览器开局、发球并完成首次碰撞，确认数据库和 WAL 未被版本切换改写。
4. 本次在同一个本机测试地址演练了目录切换。使用的上一版 `c286c8e` 与 GitHub Pages 上可见的根页、试玩页、游戏脚本和音频脚本哈希一致。该站点的正式试玩路径为 `/pinball-burst-smoke-v01/demo/v1/`。

正式上线还需确定生产配置和部署版本标识，以及通过 iOS Safari、Android Chrome 与真人试玩验收。

## RC.2 GitHub 公网预览

原仓库的 Pages 从 `main` 根目录自动发布。测试版使用独立公开仓库 `ChihooZeng/pinball-burst-v1-preview`，其 Pages 发布分支为 `codex/pinball-v1-preview-20261119`。预览仓库发布 ZIP 内的根入口与 `demo/v1/` 游戏资源。ZIP 直接读取已提交的 Git 树，在 `release.json` 记录源码提交。预览页的统计和广告默认关闭。

如需撤下本次首个预览，在独立预览仓库的 Settings → Pages 中取消发布。后续版本回滚时，在该预览分支用新提交恢复所选的已验收版本，等待 Pages 构建后复查 HTTPS、资源和实际开局。正式仓库的 Pages 使用原分支及原路径。
