# 开发状态
更新：2026-10-30 21:32 Asia/Shanghai（M1独立候选上线核验）

## 当前节点
- 开发分支：`codex/v1-m1-overload`；M1实现提交：`a355b3c21164edef1a614fec17ee6c6fa3bcb2f5`。后续交接/线上证据提交不改变该版本游戏文件；最新文档HEAD以远端该分支为准。
- 发布提交：`main@d6767b7cb33b83b440dd15870fbb2a870e0b9826`，相对`be604b4`只新增`compare/hybrid-v1-m1/`六个文件。未合并开发历史，未切换默认入口，所有旧试玩文件无差异。
- 线上候选：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v1-m1/
- B对照：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v27-feel-lab/?feel=tempo
- 线上确认：HTTP 200；六文件SHA-256逐项与已测试源码相同；生产页面390×844、1440×900实际开始/选核/暂停/继续通过，无控制台/请求错误，测试修改接口未开放。证据见`docs/m1-evidence/public.json`和`deployment.json`。

| 状态 | 本次结果 |
|---|---|
| 规划 | 50波经济、三核心成长路径、24条跨6款游戏研究、M1–M4边界已归档；高级机制仍是实验设计 |
| 编码 | M1独立1–10波、B底盘、真实增量卡、完整暂停Build、临时Buff、记录导出、撞墙蓄势候选已实现 |
| 自动验证 | 模型10项、战斗9项、旧回归27脚本、B物理对照通过；全枚举158565状态；四视口UI通过 |
| 真人验收 | 未通过/尚未进行；用户此前对B的肯定不能转记为M1通过 |
| 发布 | 独立候选已上线；正式默认入口未变；完整50波公测版尚未完成 |

真实回放：6纯分支、3实际混合、6补充seed、3蓄势路线均完成10波；弱电弧seed2701第7波失败。弱裂变/机枪完成。孤立Boss、尾砖、32球预算、30/60/120Hz与15/30秒Buff均有专项证据。独立审查两项P2（后台停帧漏暂停、键盘穿透到重开）已复现并修复。

已知问题：电弧单体/弱路线仍慢；撞墙蓄势有真实伤害但尚未证明选取价值；首次R2锁培养方向需真人判断；失败波未归档完整waveMetrics，仅终态waveElapsed。真实iOS/Android音频、发热和长局性能未验证。

尚未实现：11–50波、普通进化/协同/高级与稀有、20/35/50生产卡池可持续性、完整长局和跨刷新存档。下一步为真人M1手感Gate；不依赖手感的M2模型研究可继续，不能提前宣称体验通过或默认发布。

工作区：独立worktree保留在`/Users/chihoozeng/.codex/worktrees/v1-m1-overload/霓虹弹珠`。原目录仍为`feat/pinball-burst-launch@5ec9b73`且干净；没有修改。CLI缺推送凭据，已通过连接的GitHub工具提交并用现有系统代理fetch核对；这不是CLI push成功。

## 初次审计记录（保留历史，以下不是最新状态）
2026-10-30（审计节点）

- 原始工作区：/Users/chihoozeng/Documents/PROJECT MAC/霓虹弹珠；feat/pinball-burst-launch@5ec9b73，干净。旧45关实现不符合最新目标，不作新产品来源。
- 独立工作区：/Users/chihoozeng/.codex/worktrees/v1-m1-overload/霓虹弹珠；codex/v1-m1-overload。
- 开发基准：origin/codex/v027a-buildlab@d4dd0ae；与本地90a2476内容相同但历史不同，采用远端基准。
- origin/main在审计时为be604b4；网络直连超时，通过系统已配置127.0.0.1:7897代理完成fetch。
- 已实现基线：8波、3核心R1–3、6分支、4基础+3辅助、120Hz物理、Boss有限召唤。
- 本次已验证：v27-build-model-test和v27-buildlab-test均PASS，含跨帧确定性、清屏和球数预算。
- 正在开发：M1独立10波、B底盘、有效卡面、暂停Build、记录与临时Buff计时。
- 尚未实现：11–50波、正常终极、高阶/稀有/融合、跨会话存档、真机长局。
- 真人结果：用户认为B明显爽于v27a；M1尚未试玩，不能标记验收通过。
- 正式发布：未切默认。线上候选待编码/测试/选择性发布。

规划完成、编码完成、自动测试通过、真人通过、默认发布五个状态必须分别记录。后续节点在本文件追加。
