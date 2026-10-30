# M1 自动验收与真人Gate报告
2026-10-30；候选不是完整50波公测成品。基准d4dd0ae，独立目录compare/hybrid-v1-m1。

## 审计与执行事实
读取用户指定的6份GitHub文档、Feel Lab README与源码、当前旧launch及v27开发版本。原工作区feat/pinball-burst-launch@5ec9b73干净、未改；独立worktree/分支codex/v1-m1-overload基于远端v27。原本git直连超时；使用系统现有代理fetch成功。CLI缺少GitHub推送凭据，改用已连接的GitHub工具原子提交树、校验分支HEAD，不伪造push成功。

新增PRODUCT_TRUTH、DECISION_LEDGER、DEVELOPMENT_STATUS、NEXT_SESSION_HANDOFF、AGENTS入口；已在开发分支持久化。50波经济和三核心成长路径是设计；研究库覆盖6款游戏24条有来源模式，标记去重和投产边界。

## 自动结果
| 项目 | 结果 | 证据 |
|---|---|---|
| 模型 | 10测试PASS；158565可达状态、133218第9次后状态；三卡有效、主副核不降级、硬上限/覆盖过滤 | compare/m1-model-test.js |
| 战斗/生命周期 | 9测试PASS；首发、10清屏9奖励、暂停/选卡恢复、15/30秒Buff、在飞球效果、侧墙蓄势、30/60/120Hz | compare/m1-combat-test.js |
| B准确对照 | 3核心×基础/强化，固定10秒高HP物理场景：发射/命中/剩余HP/子球/电弧/间隔完全相同 | m1-evidence/baseline.json |
| 历史回归 | 27脚本全部PASS；首次错误cwd造成22脚本失败，修正runner工作目录后重跑；未修改旧游戏 | m1-evidence/legacy.json |
| 真实回放 | 6主分支、3混合、6补充seed、3蓄势路线均10波完成 | replay/mixed/additional.json |
| 弱路线 | 裂变/机枪完成；电弧seed2701第7波失败，明确保留 | scenarios.json |
| 满球压力 | 60秒夹具，峰值32，501次发射/回收，抑制主发射0；该夹具关闭下降且主动填满球池 | scenarios.json |
| UI | Chrome/Mac 320×568、375×667、390×844、1440×900；页面/非空/无遮罩/控制台与请求错误0，开始→选核→暂停→继续→选卡→触控瞄准 | browser.json |
| 独立审查 | 无P1，两项P2已复现并修复：后台无rAF漏暂停；Shift+Tab背景reset丢局 | 下方审查记录 |

Browser插件未列出；使用捆绑Playwright与本机Chrome。截图位于/tmp/pinball-m1-*-*.png，浏览器测试脚本已保存在compare/m1-browser-qa.cjs。CPU/短时FPS只描述Mac模拟，不是手机性能验收。

## 真实物理结果
seed2701、自动瞄准最低威胁砖、能量满释放巨型球，选普通卡池实际提供的卡；不跳波、不减HP、不注伤。总秒数包含过场，逐波duration为有效战斗时间。
| 路线 | 秒 | 峰值球 | 子球 | 放电 | 发射抑制 | 子球抑制 |
|---|---:|---:|---:|---:|---:|---:|
|split-a|101.62|21|219|0|0|0|
|split-b|112.47|15|190|0|0|0|
|arc-a|161.38|10|0|169|0|0|
|arc-b|187.52|10|0|166|0|0|
|gun-a|91.81|22|0|0|0|0|
|gun-b|96.73|25|0|0|0|0|

三条混合均实际获得了副核：裂变+电弧109.18秒，电弧+裂变120.65秒，机枪+裂变77.97秒。早期脚本只在首张菜单尝试副核，导致重复纯路线；已修正为持续从实际菜单寻找副核，并断言history确实获得另一个核心。错误标记的三条重复样本已从主回放报告删除。

孤立52HP Boss（无主动）：裂变2.575秒、电弧9.492秒、机枪2.85秒；3块8HP尾砖：4.617/5.733/3.475秒。这是专门场景，不代表所有配装。

新增蓄势路线实际追加伤害171/83/181，证明机制确实触发；总时长110.12/192.39/97.08秒，相比其他优先选择不更快，尚未证明更值得选。保留为候选实验，真人Gate后决定是否淘汰，不能称平衡已完成。

## 对照发现、修复和取舍
- Feel Lab文档只列五项，源码还将普通强化下限设为0.55；已恢复，并以失败→通过测试验证最后一级实际+1.8%射速，未回退至旧0.69。
- 新能力从0起步不再显示“所需命中+3”等误导文案；显示获得能力。后续普通升级仍按真实before/after计算。
- 首次R2明确培养方向，另一个核心R1保留；此为Astra实验，限制晚期改路线，需真人评价。
- 保持B首局0.12秒首发；波间不囤发，下一波首球按当前间隔。未额外改快。
- 暂停键盘问题：独立Chrome复现Shift+Tab→reset→Enter导致seed清空；修复inert背景和Tab环绕，正反Tab/Enter继续均通过。
- 隐藏停帧问题：停rAF30秒再回来会补50ms；改visibilitychange/pagehide立即暂停、清时钟。无后台frame回归通过。
- 次要延期：失败波尚不保存完整waveMetrics；终态有waveElapsed，但最长无破坏/尾砖等完整记录仅在清屏时归档。
- 没有提高32球预算，没有复制C/D强连锁，没有普通波补砖、额外Boss永久奖励、默认入口变更或永久特殊砖资源。

## 真人Gate：尚未通过
请在同一手机先玩Feel Lab B，再玩M1三条开局，优先反馈：
1. 前两波射击和破碎是否仍有B的爽感，是否有新等待？
2. 卡片是否能立即看懂收益，首次R2确定方向是否容易误选？
3. 暂停后能否看懂完整Build和最近成长，继续/后台返回是否可靠？
4. 电弧的Boss/残砖是否仍拖沓；裂变/电弧/机枪是否玩法不同？
5. 蓄势是否有可感知价值；Buff是否清楚；手机是否掉帧、发热、无声？
记录机型、浏览器、路线、到达波次、最明显问题。可下载本局JSON辅助定位，无需上传隐私数据。

M2/M3尚未实现：11–50波、正常进化、融合、高阶/稀有、20/35/50生产卡池持续性、完整50波模拟。M4的跨刷新存档、真机音频/热量/长局也未验证。自动测试通过只意味着独立M1可送验。

## 线上发布核验（2026-10-30 21:32 Asia/Shanghai）
- 实现提交：`codex/v1-m1-overload@a355b3c21164edef1a614fec17ee6c6fa3bcb2f5`，tree `381f365593ab39f05d3bd5898a1e25f969c01f60`。本地测试提交d19f610与此远端提交树完全一致；提交身份因连接工具发布而不同。
- 发布提交：`main@d6767b7cb33b83b440dd15870fbb2a870e0b9826`；通过expected_sha校验从be604b4前进，仅新增新目录六文件。默认/历史路径差异为0，未合并整个开发分支。
- [M1独立试玩](https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v1-m1/)返回HTTP 200。线上README/builds/game/index/juice-fx/style六文件SHA-256均等于已测试文件。
- 生产页面未设测试标志：390×844、1440×900真实开始→选核→运行→暂停→继续通过；暂停时钟冻结、Build显示正确、无横向溢出、无页面/请求/控制台错误，`__pinballTest`未开放。该公开检查不强制清波、不注伤，不能代替已分开记录的物理回放或真人测试。
- 证据：`m1-evidence/public.json`、`deployment.json`；复现脚本`compare/m1-public-qa.cjs`。公开页面截图`/tmp/pinball-m1-public-390.png`和`/tmp/pinball-m1-public-1440.png`仅本机临时可用，关键证据已入Git。

本机复现线上检查：
```sh
NODE_PATH=/Users/chihoozeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules M1_PROXY=http://127.0.0.1:7897 node compare/m1-public-qa.cjs
```
`M1_PROXY`只在本机网络需要时设置。连接GitHub提交后经fetch确认远端提交/树一致，开发工作区保留用于下一里程碑。此次按用户既有授权发布独立版本；未触发默认切换批准流程。
