## 最新追加交接（2026-10-30，用户实机反馈，最高优先级）
- 用户已正式认可 **M1火力调弱版** 作为后续开发底盘：`codex/v1-m1-soft-balance` 中 `compare/hybrid-v1-m1-soft-balance/`，基础伤害1、球速330。旧M1伤害2、B球速365只作历史对照。
- 用户截图：iPhone内置浏览器第7波已清73/78，但高数字孤砖HP15/19等残留，网状群伤强、单体伤害差，游戏像磨血坐牢；Boss尤其明显。
- UI：以游戏为主，取消可见内框与外部冗余区，铺满移动端可用空间，设置/音量/画质/暂停/Build集中在右上角菜单；保留波次、清屏、Boss、危险线、主动技能等必要画内HUD，保障安全区/浏览器栏且不拉伸物理画面。
- 下降：略微加快；现`fallScale=.8`，`.86`是待验证提案，不是锁定数值。必须与单体/尾砖修复联合验收，否则弱电弧路线可能更早死亡。
- 已核对代码：普通残局软化仅在`live.length<=3 && waveElapsed>12 && !boss`条件生效；截图残5砖不满足；Boss被排除。应研究主流派单体进化和有限精准追击，不能假清屏/中途永久奖励。
- 下一步先独立M1.1验证，再M2。保持50波总目标、真清屏、波间三选一、特殊砖临时Buff、历史入口不覆盖。开发工作需要重新检查实际Git/工作树。


## 2026-10-30 追加：M1调弱实验（比此前交接更新）
用户指出M1炮台火力过强、数字3砖可能一次被打碎、球速过快。原M1基础伤害2，强击Buff+1或火力/撞墙蓄势/电弧可能造成即刻破碎。新增独立 `codex/v1-m1-soft-balance` 分支和 `compare/hybrid-v1-m1-soft-balance/` 试验（baseDamage1、speed330，发射间隔保持B版），单独选择性发布到Pages main；不是原M1的修改或正式产品数值。静态JS/模型检查PASS，真人与三流派10波物理回放尚未做，尤其要注意原M1弱电弧第7波失败。当前由用户对照试验后再决定是否采用。
试玩：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v1-m1-soft-balance/
原M1：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v1-m1/

# 下一会话交接
## M1.1 最新交接（2026-10-30，优先于下方M1记录）
当前分支`codex/v1-m1-1-refinement`，路径仍为`/Users/chihoozeng/.codex/worktrees/v1-m1-overload/霓虹弹珠`，基准2f128b0调弱版。先核对Git状态/HEAD，再读PRODUCT_TRUTH、DECISION_LEDGER、DEVELOPMENT_STATUS、M1_1_TEST_REPORT、最新反馈规格及候选README。不要恢复伤害2/速度365。

本轮实现：≤5目标有限弹球导向、三核心单体等级收益、孤Boss弱点、去隐藏HP软化、沉浸视口、右上设置、动态等比相机，下降.84候选。27新测试、27历史回归、主/混合/无主动/移动逻辑场地回放、六视口与模拟安全区已验证。独立审查两个P2已修复。详细失败见报告：弱电弧从旧W7提前到W5触线，弱裂变W7触线，部分五砖R1仍慢；不能宣称M1.1真人或平衡通过。

下一步：同机对照调弱版和M1.1，收集核心/波次、残局和Boss体感、布局、音效与发热；优先弱电弧/低攻成长容错，再推进M2。保留50波连续Build、真实清屏、特殊砖限时职责，保护所有旧试玩。新版链接`https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v1-m1-1/`；实际发布提交与线上核验见开发状态最新附录。

更新：2026-10-30 21:32 Asia/Shanghai，M1独立试玩上线；真人手感Gate待反馈。

当前目标：取得M1具体真人反馈，处理电弧/成长理解等问题，再推进M2。完整产品始终50波，当前10波是里程碑切片。Gate0的永久记忆、50波设计、24条研究及M1实施/内部审查已经完成。

最新规则：50波持续Build，最多49次用于末波前的常规奖励+开局能力；B完整实际底盘（含源码0.55射速强化下限）；特殊砖仅临时/即时；选卡增量/暂停总量；旧入口不可覆盖。旧PROJECT_MEMORY中“暂不开发”、15波旧launch都已被本次授权/规则取代。首次R2固定培养方向、一个R1副核与撞墙蓄势仍是Astra待验证实验。

工作区/分支：`/Users/chihoozeng/.codex/worktrees/v1-m1-overload/霓虹弹珠`，`codex/v1-m1-overload`，基准d4dd0ae，代码提交`a355b3c21164edef1a614fec17ee6c6fa3bcb2f5`。交接/证据随后提交在同分支，下一会话先fetch并核对HEAD和未提交内容。原目录`feat/pinball-burst-launch@5ec9b73`仍干净、未改。

发布：`main@d6767b7cb33b83b440dd15870fbb2a870e0b9826`只新增M1目录六文件。已核对线上六文件哈希和生产Chrome运行；默认及历史入口未改。

- M1：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v1-m1/
- B：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v27-feel-lab/?feel=tempo

已验证：19项模型/战斗、27历史脚本、B三核心物理一致、6分支/3混合/6补充seed/3蓄势、弱路线、孤立Boss/尾砖、32球压力、四视口UI。模型全枚举158565状态。两项P2暂停缺陷已修复。详细数据与失败结果见M1_TEST_REPORT及m1-evidence，不能仅引用成功通关。

未解决：弱电弧seed2701输在W7，孤立Boss耗时9.492秒；蓄势价值不明；R2方向限制待体验；失败波全指标归档延期。M1无跨刷新续玩。11–50波、生产进化/融合/稀有、20/35/50可持续性全部未实现/未测试，69等级槽只是设计容量。

下一步具体行动：
1. 先读PRODUCT_TRUTH、DECISION_LEDGER、DEVELOPMENT_STATUS、本交接、M1_TEST_REPORT、V1_GROWTH_SPEC、V1_SKILL_RESEARCH_LIBRARY；检查实际Git。不要重新执行已完成的M1。
2. 请用户同一手机对照B与M1，记录机型/浏览器/核心/波次，评价前两波爽感、卡片理解、暂停、Boss/尾砖、音频/掉帧；必要时利用本局JSON。反馈未到，不记为体验通过。
3. 可独立进行M2的可达卡池模型和电弧单体方案研究；完整20波生产改动依据具体规格和手感证据推进。优先处理真实问题，再扩内容。
4. M2仍必须保留Build和实际清屏；验证普通进化不依赖稀有、19次经济、弱路线补救；M3继续验证34/49次与50波。不得用设计预算代替运行证据。

复现入口：candidate README、compare/m1-model-test.js（约1–2分钟）、m1-combat-test.js、m1-baseline-test.cjs、m1-replay.js、m1-scenarios.js、m1-legacy.cjs、m1-browser-qa.cjs和m1-public-qa.cjs。浏览器脚本需要本机Chrome及Playwright；捆绑依赖位置见测试报告。线上测试不打开任何测试修改接口。

阻塞：iPhone/Android真人手感、热量、音频不能靠Mac自动化判定；M1送验前可继续独立研究。不得为了通过模拟改旧版本、重置Build、缩成15波或偷偷加Boss奖励。
