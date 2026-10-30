# 弹珠超载 M1 · B底盘10波候选
完整产品目标为50波；本候选只覆盖1–10波，清10直接结算，不代表公测成品或真人验收通过。

## 试玩
`python3 -m http.server 8771`，打开 http://localhost:8771/compare/hybrid-v1-m1/ 。
触控拖动瞄准；自动发射；超载按钮/空格释放巨型球；Ⅱ或P/Esc暂停。暂停可查看真实总属性、等级/效果、最近成长、完整历史、Buff剩余时间，并下载本局JSON（仅本机内存，无上传）。刷新/重开会开始新局，M1没有跨会话存档。

开局三核心，首次升至R2确定培养方向，另一核心保留R1，最多两个核心。清4波后选择主分支。三选一只显示本次真实变化，满级/被覆盖/无效强化过滤。清1–9波各一次永久奖励。第4/8波Boss仍须完全清场。

B参数完整沿用：365球速、0.86普通间隔、0.55强化下限、2伤害、机枪4.1秒留场、首局约0.12秒首发。保留32球、80%下降、原裂变/电弧和HP曲线。新增最多两级“撞墙蓄势”，侧墙反弹提升下一次真实撞击伤害，命中消耗，不新增球。特殊砖可触发15秒+1直接伤害或30秒+15%球速，同类刷新不叠加、按有效战斗时间、跨波保留；不产生永久奖励。

## 自动复现（仓库根目录）
```
node --test compare/m1-model-test.js
node --test compare/m1-combat-test.js
node compare/m1-baseline-test.cjs
M1_OUTPUT=docs/m1-evidence/replay.json M1_REQUIRE_CLEAR=1 node compare/m1-replay.js
M1_OUTPUT=docs/m1-evidence/scenarios.json node compare/m1-scenarios.js
node compare/m1-legacy.cjs
```
模型全枚举约1–2分钟。baseline脚本需要已有`origin/codex/v027a-feel-lab`，只读取该Git对象到系统临时目录，验证三核心B/M1相同10秒物理场景，不修改旧文件。
回放自动瞄准、满能量使用巨型球，从实际三选一选卡；不注入伤害/改HP/跳波。combat中的清场/满球/定制场景仅是明确夹具，不能算真人或通关证据。

## 已知限制
弱电弧路线seed2701在第7波失败；电弧单体及整体耗时仍较长。32球饱和会回收机枪旧球并限制裂变，须看实际产出记录；不能仅用卡面推断收益。Mac Chrome模拟尺寸不代表iOS/Android真机音频、发热或长局性能。失败波当前只在终态保存waveElapsed，完整逐波指标仅记录已清波。11–50波、进化/稀有、存档都尚未实现。

对照：[Feel Lab B](../hybrid-v27-feel-lab/?feel=tempo) · [v0.17](../hybrid-v17-sustain/) · [v0.27a](../hybrid-v27-buildlab/)
