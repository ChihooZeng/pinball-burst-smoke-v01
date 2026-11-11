# 上线交接 · 音效版（2026-11-11）

> 给执行方（GPT / 其他代理）的自包含说明。目标是**把已经定稿并合并进主线的音效版推到 GitHub Pages 线上**。
> 你不需要理解游戏设计，只需按顺序执行、逐步核对预期输出。任何一步与预期不符就停下并报告。

## 0. 一句话任务

把分支 `experiment/audio-qa-v2-1-20261109` 快进合并进 `main` 并推送（该分支包含音效合并提交 `9054a2e`），
让线上 `https://chihoozeng.github.io/pinball-burst-smoke-v01/` 能访问到 `demo/v1/`（带音效的正式主线）。

## 1. 事实清单

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/ChihooZeng/pinball-burst-smoke-v01` |
| 本地工作树（要操作的那个） | `/Users/chihoozeng/Documents/PROJECT MAC/霓虹弹珠/.worktrees/audio-qa-v2-1-20261109` |
| 分支 | `experiment/audio-qa-v2-1-20261109` |
| 分支 HEAD | 以 `git rev-parse --short HEAD` 为准；其中必须包含 `9054a2e`（音效合并提交） |
| 线上基线 | `origin/main` = `84b1a05`（回滚点） |
| 领先提交 | 以 `git status -sb` 显示的 `ahead N` 为准（N ≥ 24），**0 落后，可快进合并** |
| 改动规模 | 65 files, +5937 / -27 |
| 线上站点 | GitHub Pages，根目录仍是旧版 `弹球暴走 v0.4.1` |
| 新游戏位置 | 仓库内 `demo/v1/`（不是站点根） |
| CI / Actions | 无。Pages 靠推送 `main` 自动构建 |

注意：主仓库的默认工作树当前停在 `feat/pinball-burst-launch`，**不要在它上面合并**。
要么在下面第 3 步的路径里操作，要么先 `git worktree list` 找到本分支所在工作树。

## 2. 约束（不可违反）

1. **不要 force push**，本次是快进合并，不需要强推。
2. **不要改任何源文件**。若测试失败，停下来报告，不要"顺手修一下"。
3. **不要提交 `.ai-bridge/`**（未跟踪的临时目录）。
4. **不要动站点根目录的 `index.html` / `game.js`**（那是旧的 v0.4.1 试玩页，本次不上线也不删除）。
5. 本次不涉及任何玩法、数值、关卡改动（已在代码层剔除，并有测试守卫）。

## 3. 步骤 A：推送前预检（必须先跑）

```sh
cd "/Users/chihoozeng/Documents/PROJECT MAC/霓虹弹珠/.worktrees/audio-qa-v2-1-20261109"

git status --short          # 期望：只有一行 "?? .ai-bridge/"，无其他改动
git rev-parse --short HEAD  # 记下这个值，后面 push 前要核对一致
git log --oneline | grep 9054a2e    # 期望：有输出（音效合并那次提交必须在历史里）

node --check demo/v1/game.js            # 期望：无输出（语法 OK）
node --check demo/v1/sound-pack.js      # 期望：无输出

node demo/audio-qa-v2-1/tests/audio-v21.test.cjs | tail -3   # 期望：通过 66 / 66，全部通过
```

## 4. 步骤 B：合并并推送

```sh
cd "/Users/chihoozeng/Documents/PROJECT MAC/霓虹弹珠/.worktrees/audio-qa-v2-1-20261109"

git fetch origin
git log --oneline -1 origin/main        # 期望：84b1a05 ...
git merge-base --is-ancestor origin/main HEAD && echo "可快进合并"

# 若本地已有 main，跳到 switch；否则创建跟踪分支
git switch main 2>/dev/null || git switch -c main --track origin/main

git merge --ff-only experiment/audio-qa-v2-1-20261109
git log --oneline -1                    # 期望：与预检时记下的 HEAD 完全一致
git push origin main
```

**推送前必须确认 Pages 源分支**：GitHub → 仓库 Settings → Pages → Source。
- 若为 `main` / `main (root)`：上面的 push 即为发布，进入步骤 C 验收。
- 若为 `gh-pages` 或其他分支：**停下报告**，不要自己改 Pages 配置。

## 5. 步骤 C：线上验收

GitHub Pages 构建有 1–2 分钟延迟，先等 90 秒再验。

```sh
BASE="https://chihoozeng.github.io/pinball-burst-smoke-v01"

curl -s -o /dev/null -w "页面 %{http_code}\n"      "$BASE/demo/v1/"
curl -s -o /dev/null -w "引擎 %{http_code}\n"      "$BASE/demo/v1/sound-pack.js?v=demo2"
curl -s -o /dev/null -w "BGM %{http_code} %{size_download}\n" "$BASE/demo/v1/audio/bgm-cut-and-run.m4a"
curl -s "$BASE/demo/v1/sound-pack.js?v=demo2" | grep -c "audio-qa-v21u-20261111"
```

预期：

| 检查 | 期望 |
|---|---|
| 页面 | `200` |
| 引擎 | `200` |
| BGM | `200 4200857` |
| 版本号命中次数 | `1` 或以上 |

再人工确认一次（浏览器打开 `$BASE/demo/v1/`）：
1. 点「开始20关挑战」——应先听到 UI 点击音，紧接着 BGM 起，约 2 秒内出现第一次击破声。
2. 点右上角 ⚙ → 往下看「声音与画面」——应有一行 `音乐：Cut and Run — Kevin MacLeod（incompetech.com）· CC BY 4.0`。
3. 拖动音量滑杆——音量应跟着变。

## 6. 回滚

线上出问题就把 `main` 退回推送前的基线（`84b1a05`）：

```sh
git push --force-with-lease origin 84b1a05:main
```

这是本次唯一允许的强推，且只在回滚时使用。回滚后等 1–2 分钟 Pages 重新构建。

## 7. 已知情况（不是问题，不用处理）

- **BGM 有 4.2MB**：不在首屏加载，点「开始」后才播；首屏只预解码 3 条系统音。
- **站点根目录仍是旧版**：本次新游戏在 `/demo/v1/` 子路径。是否把根目录换成新游戏是另一个决定，本次不做。
- **资源带 `?v=demo2`**：用来绕开浏览器缓存，属正常现象。
- **`.m4a` 的 MIME** 由 Pages 自动给出 `audio/mp4`，Safari / Chrome 均可播。
- **未加 `.nojekyll`**：本次没有以下划线开头的文件，Jekyll 不会吞掉任何资源。

## 8. 变更内容（供核对，不需要逐条读）

- `demo/v1/sound-pack.js` 新增：音效引擎（9 类事件 + BGM，自托管素材）
- `demo/v1/audio/` 新增 19 个素材，4.4MB
- `demo/v1/game.js`：接音效触发点，关闭旧合成提示音（`LEGACY_SYNTH_CUES_ENABLED=false`）
- `demo/v1/index.html`：加载引擎 + CC BY 4.0 署名；资源版本 `demo1 → demo2`
- `demo/v1/style.css`：署名行样式
- `demo/audio-qa-v2-1/**`：音效调试台（仅供后续调音，不影响线上玩法）
- `docs/AUDIO_SFX_LOCKED_20261111.md`：音效定稿与授权记录

授权状态：Kenney（CC0）、400 Sounds Pack / Chequered Ink（免费商用免署名）、自研合成、BGM `Cut and Run`（CC BY 4.0，已在游戏内署名）。
