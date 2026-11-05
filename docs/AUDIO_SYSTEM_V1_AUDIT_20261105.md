# 《弹珠超载》音效系统 V1 · 现状审计与实施准备

日期：2026-11-05
类型：只读审计 + 实施清单。**未修改任何游戏代码，未发布。**

审计对象：

| 对象 | 路径 | 说明 |
|---|---|---|
| 正式 Demo | `demo/v1/game.js`（109K） | 音频实现集中在 192–253 行 |
| M2.5 强打击版 | `compare/m25-impact-lab/game.js`、`juice-fx.js` | 线上历史版本 |
| 现行实验版 | `compare/r2-hundred-ball-lab-v7-20261105/game.js` | 已包含 S1/M1/S8、补砖、爆雷等新事件 |

---

## 0. 结论摘要

1. **正式 Demo 只有 9 类合成音**，且 `playSfx` 与 M2.5 版本**逐字相同**（已 diff 验证）。也就是说"当前音效"本身就是 M2.5 方案。
2. **`m25-impact-lab/juice-fx.js` 里没有任何音频代码**（`Audio|sound|beep` 匹配数为 0）。M2.5 的"强力打击音"在 `game.js` 的 `playSfx` 里，不在 juice 里。原始需求里"读 juice-fx 找打击音"这个前提需要修正。
3. **实验版新增的机制大量静音**：星环切削完全无声、植雷无声、开花生成无声、补砖预警无声、失败无声；爆雷只是复用 `shock`。
4. **有一个 P0 级体验 bug**：`unlockSound()` 在首次解锁成功后主动播放 `playSfx("upgrade")`，玩家第一次点屏幕会听到"升级"音。
5. **建议继续用现有 Web Audio**，只增加"采样层 + 声部池"，不引入 Howler.js；除非后续需要音频精灵或跨端统一。

---

## 1. 现状：音频链路与策略

### 1.1 信号链

```
OscillatorNode → GainNode(包络) → masterGain(音量×0.82)
   → DynamicsCompressor(threshold -18dB, knee 18, ratio 5, attack 3ms, release 180ms)
   → destination
```

- 单一总线，无 UI/战斗/环境分组。
- 压缩器挂在总线上，密集命中时整体"抽气"，这是当前"糊"的物理原因之一。

### 1.2 合成器参数（`beep`）

| 项 | 值 |
|---|---|
| 波形 | triangle / sawtooth / square / sine |
| 频率 | 起始值 clamp ≥60Hz，指数下滑到起始的 56% |
| 时长 | clamp 0.02–0.4s |
| 峰值 | `amp × 4`，clamp 0.018–0.23 |
| 包络 | 6ms 起音，指数衰减到 0.0001 |

所有音效都是"一个或两个振荡器 + 指数下滑"，没有采样、没有滤波、没有混响/延迟。

### 1.3 节流（`sfxLast`）

| 类别 | 最小间隔 |
|---|---|
| `armor` | 65ms |
| `break` | 42ms |
| 其他 | 120ms |

节流是"每类一个时间戳"，不是声部池，也没有全局并发上限。

### 1.4 解锁与音量

- 首次用户手势创建 `AudioContext`；若 `suspended` 则 `resume()`。
- **resume 成功后主动 `playSfx("upgrade")`**（P0，见 §4）。
- 音量 0–100 映射到 `soundVolume`，默认 78%，`masterGain = volume × 0.82`。
- **音量不持久化**（`localStorage` 只存了技能侧与引导状态）。
- **没有静音开关**，只能把滑块拖到 0。
- 页面隐藏时 `pause()` 游戏，但**不 suspend 音频上下文**。

---

## 2. 音效盘点（现有 9 类）

| kind | 触发事件 | 合成配方 | 节流 | 评价 |
|---|---|---|---|---|
| `armor` | 命中但未击碎（高 HP / 装甲） | 235Hz 锯齿 + 680Hz 三角 | 65ms | 有厚度，但和 `break` 区分度一般 |
| `break` | 砖块击碎 | 225Hz 锯齿 + (440+连击×32)Hz 三角 + 980Hz 方波 | 42ms | 连击会升调，是现有最好的设计 |
| `shock` | 范围冲击 / 爆雷 / 落点 | 145Hz 锯齿 + 360Hz 三角 | 120ms | 被复用太多，语义已模糊 |
| `drill` | 钻头发射 | 480Hz 锯齿 | 120ms | 可用 |
| `split` | 裂变 / 开花 | 820Hz + 1140Hz | 120ms | 偏"电子提示音"，不像生物/爆裂 |
| `arc` | 电弧 | 960Hz 方波 | 120ms | 尖锐，密集时刺耳 |
| `hunt` | 追踪转向 | 610Hz | 120ms | 可用 |
| `giant` | 巨型球 / 技能释放 | 125Hz 锯齿 + 265Hz 三角 | 120ms | 有重量，但被 `soundTest` 复用 |
| `upgrade` | 升级 / **首次解锁** | 540Hz + 910Hz | 120ms | 被解锁逻辑滥用（P0） |

---

## 3. 覆盖缺口（实验版新增事件）

| 事件 | 现状 | 缺口 |
|---|---|---|
| M1 极速机枪连射 | 直接 `beep(245,.035,.009)`，绕过 `playSfx` 节流，12.5 发/秒 | **P0**：无节流、无随机化，密集时变成嗡嗡声 |
| M2 扇形齐射 | 同上 | **P1** |
| S1 开花生成（子球喷出） | 无声 | **P1**：玩家看不到/听不到"开花"的因果 |
| S7 星环接触切削 | **完全无声** | **P0**：核心机制没有任何听觉反馈 |
| S8 植雷 | 无声 | **P0**：没有"植雷"的因果提示 |
| S8 爆炸 / 接力 | 复用 `shock`，链式不升调 | **P1**：接力没有层次 |
| 补砖预警 / 补入 | 无声 | **P2**：密集补砖时缺少"新目标出现"的提示 |
| 触线失败 | 无声（只有面板） | **P1**：失败无听觉反馈 |
| 清屏过关 | 无声 | **P1** |
| Boss 出场 / 阶段转换 | 复用 `shock` | **P2** |
| UI 点击 / 切页 / 选择 | 无声 | **P2** |

---

## 4. 问题清单

### P0（必须修）

1. **首次点击播放"升级"音**
   证据：`demo/v1/game.js:212`，`resume.then(()=>{if(state==="running")playSfx("upgrade");})`。
   影响：玩家第一次触摸屏幕就听到升级音，语义错误，也掩盖了真正的解锁验证。
   建议：改为极短、极轻的 `sfx_unlock`（10ms 点击），或静默解锁。

2. **机枪连射绕过节流**
   证据：`labMgFire` 内 `beep(245,.035,.009)`，每秒 12.5 次。
   影响：与压缩器叠加后整体音量被压，听感变"嗡嗡"；也没有任何随机化，机械感强。
   建议：专用 `sfx_mg_shot` 采样 + 声部池 + 每 3 发轮换音高（±2%）。

3. **星环 / 植雷无音**
   影响：这两个是 V4–V7 的核心技能，玩家"看不到因果"，与视觉投入不匹配。
   建议：星环给持续循环层（低速切割），植雷给一次性"贴附"音。

### P1（本轮应做）

4. 压缩器挂在总线上，所有声音一起抽气 → 改为分组压缩（战斗 / UI）。
5. 音量不持久化、无静音键 → 存 `localStorage`，加一键静音。
6. 页面隐藏不 suspend 音频 → `visibilitychange` 时 `ctx.suspend()`，恢复时 `resume()`。
7. 缺失败/清屏/Boss 阶段音。

### P2（可延后）

8. 无立体声/声像，左右侧爆雷听感一样。
9. 无混响，所有声音"贴脸"。
10. `shock` 语义过载（爆雷、落点、Boss、召唤共用）。

---

## 5. Web Audio 还是 Howler.js

| 维度 | 现有 Web Audio | Howler.js（MIT，v2.2.4，2023-09） |
|---|---|---|
| 迁移成本 | 0 | 需重接事件、重做节流与音量 |
| 音效精灵 | 无 | 支持（`sprite`） |
| 声部池 | 需自写 | 内置 `pool`（默认 5） |
| 移动端解锁 | 已实现（有 P0 bug） | 内置 `autoUnlock` |
| 分组/空间 | 需自写 | 支持 group / 3D |
| 包体 | 0 | ~7KB gzip |
| 与现有代码耦合 | 直接 | 需适配层 |

**结论：继续用现有 Web Audio。**
理由：现有实现已经覆盖"合成 + 压缩 + 解锁"三件事，缺的是**采样播放**和**分组**，这两件事在 Web Audio 里各约 60 行即可补齐；引入 Howler 会重写节流、音量、暂停三条链路，收益不足以抵消风险。

**唯一值得回头用 Howler 的场景**：后续要做 30+ 音效的音频精灵、或需要跨端统一的 3D 声像。到那时再评估，不在本轮。

---

## 6. 素材来源（已核实）

> 以下链接与许可证均于 2026-11-05 实际访问确认；未逐条核对包内单个文件名，标为「待核实」。

| 来源 | 链接 | 许可证 | 规模 | 用途 |
|---|---|---|---|---|
| Kenney · Impact Sounds | https://kenney.nl/assets/impact-sounds | **CC0 1.0** | 130 个文件，2019 | 命中、击碎、碎屑主体 |
| Kenney · Sci-fi Sounds | https://kenney.nl/assets/sci-fi-sounds | **CC0 1.0** | 70 个文件，2020 | 爆雷、星环、能量类 |
| Kenney · UI Audio | https://kenney.nl/assets/ui-audio | **CC0 1.0** | 50 个文件，2012 | 点击、升级、结算 |
| jsfxr（在线生成器） | https://sfxr.me/ | 工具站；代码库为 **Unlicense** | 11 个预设 | 8-bit 短音、UI、机枪 |
| jsfxr 代码库 | https://github.com/chr15m/jsfxr | **Unlicense** | Eric Fredricksen 移植，Chris McCormick 维护 | 可离线生成 WAV |

jsfxr 可用预设：`pickupCoin`、`laserShoot`、`explosion`、`powerUp`、`hitHurt`、`jump`、`blipSelect`、`synth`、`tone`、`click`、`random`。
浏览器内引用方式（官方 README 给出）：`https://sfxr.me/riffwave.js` + `https://sfxr.me/sfxr.js`。

待核实项：

- Kenney 各包内**具体文件名与单文件时长**（需下载 ZIP 后逐一核对）。
- Kenney 是否提供 OGG 与 WAV 双格式（页面只标注文件数，未列格式）。
- jsfxr 生成音频的商用归属：Unlicense 覆盖代码，生成的音频本身按 Unlicense 可自由使用；若用于正式发行建议再做一次法务确认（待核实）。

---

## 7. 音效实施清单

命名约定：`sfx_<事件>_<变体>.ogg`，统一放 `assets/sfx/`，采样率 44.1kHz，单声道，峰值 ≤ -3dBFS。

| # | 文件名 | 游戏事件 | 建议风格 | 来源 | 优先级 |
|---|---|---|---|---|---|
| 1 | `sfx_hit_light_01..03.ogg` | 普通球命中未碎 | 短促、干脆、带一点金属 | Kenney Impact Sounds | P0 |
| 2 | `sfx_hit_heavy_01..02.ogg` | 高 HP 砖受击（8+） | 低沉、闷、有厚度 | Kenney Impact Sounds | P0 |
| 3 | `sfx_break_light_01..03.ogg` | 低 HP 击碎 | 碎裂、轻、带高频尾巴 | Kenney Impact Sounds | P0 |
| 4 | `sfx_break_heavy_01..02.ogg` | 高 HP 击碎 | 厚重破碎 + 低频下坠 | Kenney Impact Sounds | P0 |
| 5 | `sfx_mg_shot_01..03.ogg` | M1/M2 连射 | 极短、干、无尾音 | jsfxr `laserShoot` 改造 | P0 |
| 6 | `sfx_orbit_loop.ogg` | 星环持续切削 | 循环切割、低音量 | jsfxr `synth` + 滤波 | P0 |
| 7 | `sfx_bomb_plant_01..02.ogg` | 植雷 | 短"贴附"声、上滑 | jsfxr `blipSelect` 改造 | P0 |
| 8 | `sfx_bomb_blast_01..03.ogg` | 爆雷引爆 | 爆裂 + 冲击 | Kenney Sci-fi Sounds | P0 |
| 9 | `sfx_bomb_chain_01..03.ogg` | 接力第 2/3/4 段 | 同源升调、逐段更紧 | jsfxr `explosion` 变调 | P1 |
| 10 | `sfx_bloom_spawn.ogg` | 开花喷子球 | 轻快上扬 | jsfxr `powerUp` 变体 | P1 |
| 11 | `sfx_shock_impact.ogg` | 范围冲击（替代 `shock`） | 低频冲击 + 短尾 | Kenney Sci-fi Sounds | P1 |
| 12 | `sfx_warning_tick.ogg` | 补砖预警 | 极短滴答 | Kenney UI Audio | P2 |
| 13 | `sfx_spawn_in.ogg` | 补砖落地 | 轻"落位" | Kenney Impact Sounds | P2 |
| 14 | `sfx_fail.ogg` | 触线失败 | 下坠 + 闷响 | jsfxr `explosion` 低通 | P1 |
| 15 | `sfx_clear.ogg` | 清屏过关 | 上扬三音 | jsfxr `powerUp` | P1 |
| 16 | `sfx_ui_click.ogg` | 按钮/选项 | 干净点击 | Kenney UI Audio | P2 |
| 17 | `sfx_upgrade.ogg` | 升级选择 | 明亮上行 | jsfxr `powerUp` | P1 |
| 18 | `sfx_boss_phase.ogg` | Boss 阶段转换 | 低频警报 | Kenney Sci-fi Sounds | P2 |
| 19 | `sfx_unlock.ogg` | 首次解锁（替代升级音） | 10ms 极轻点击 | Kenney UI Audio | P0 |

说明：第 1–8 条是本轮真正要落地的"因果层"；9–19 是补全。

---

## 8. A/B 音效对照设计

**前提：不改 R1 玩法、砖块 HP、技能强度。只换音频层。**

| 组 | 内容 |
|---|---|
| A | 现状：M2.5 合成音（9 类，节流与压缩器不变） |
| B | 新分层：`transient（采样）+ body（合成）+ tail（采样/混响）`，分组压缩，声部池 24 |

切换方式（三选一，建议第 1 种）：

1. URL 参数 `?audio=a|b`，默认 `a`，方便同机对比与自动截图。
2. 设置面板加"音效方案"下拉。
3. 本地开关（`localStorage`），适合长时间试玩。

对照时必须固定：同一模式（建议 S8 + R1 战场）、同一种子、同一时长（60 秒）、同一音量（78%）。

记录指标：

- 主观：5 分制（打击感 / 辨识度 / 疲劳度 / 整体偏好）。
- 客观：峰值 dBFS、削波次数、并发声部峰值、是否掉帧（FPS 采样）。
- 采集方式：在 `masterGain` 后挂 `AnalyserNode`，脚本每 100ms 采样一次。

---

## 9. 下一步开发计划

| 阶段 | 内容 | 产出 | 验收 |
|---|---|---|---|
| S1 | 素材落地：下载 Kenney 三包，挑选并重命名，登记许可证 | `assets/sfx/` + `CREDITS.md` | 每个文件可追溯到包与许可证 |
| S2 | 音频层重构：分组总线、声部池、采样缓存、静音/持久化 | `audio.js`（新文件） | 现有 9 类音效行为不变 |
| S3 | 事件接线：按清单 1–19 逐条接 | 事件表 | 每个事件有唯一音，无复用冲突 |
| S4 | A/B 开关 + 采集脚本 | `?audio=` + 指标脚本 | 同机可切换，指标可导出 |
| S5 | 手机验收：iOS Safari 解锁、后台恢复、静音键、音量记忆 | 验收记录 | 5 尺寸 + 真机（若有） |

---

## 10. 未核实与风险

1. **素材包内文件名未核对**：清单里的文件名是我们自己的命名，不是 Kenney 包内原名。
2. **Kenney 音频格式未确认**：页面未列格式，需下载后确认是否有 OGG；若无则需转码。
3. **iOS 低电量模式**会阻止自动播放，需要在真机验证解锁流程。
4. **包体**：19 个音效若全用 OGG，预计 +300–600KB；需确认可接受。
5. **本轮未改任何代码**，以上均为实施建议；A/B 方案的默认值仍为 A（现状），不影响正式 Demo。
