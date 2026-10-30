# 弹珠超载 M1.1 · 聚焦破坏候选
试玩：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v1-m1-1/
基准：codex/v1-m1-soft-balance@2f128b0。基础伤害1、球速330、原发射节奏、32球、120Hz保留。完整产品50波；本候选前10波、9次波末强化，真人待验。

## 本轮变化（实验数值）
- 删除≤3砖直接降为3HP的隐藏削血。≤5砖、波内12秒后，每球至多每1.2秒一次精准导向；必须真实撞击。
- 裂变R2/R3子球在少目标时获得1/2次额外追击，子球不递归。
- 电弧缺失传播位转为命中目标集中伤害，每空位追加当前R级伤害；孤立放电基础2（聚能分支3）+有效传播位×R；雷网使用其实际3传播位。
- 主机枪R2/R3：同目标2秒内连续直接命中，每3击后破甲+1，最多+1/+2；换目标断链，子球不叠。
- Boss孤立时每6秒末2秒弱点窗口，直接撞击+1，画内提示；召唤仍有限。
- 移动端满可用视口、无内框，HUD悬浮，右上角设置内集中音量/特效/Build/历史/重开/导出；超载保留。安全区与100dvh、等比Canvas相机；运行中resize自动暂停并保留物理世界，重开按新视口重建高度560–900。宽屏居中等比退化。
- fallScale=.84，相对.80增加5%；.80/.84/.86有分离实验，具体值尚待真人确认。

## 复现
仓库根目录运行：
```sh
node --test compare/m11-test.js compare/m11-combat-test.js compare/m11-model-test.js
node compare/m11-experiments.cjs /tmp/m11-results.json
M11_DIR=hybrid-v1-m1-soft-balance node compare/m11-experiments.cjs /tmp/m11-before.json
python3 -m http.server 8772 --bind 127.0.0.1
```
浏览器脚本compare/m11-browser.cjs依赖Playwright与本机Chrome，默认8772；M11_URL可覆盖线上地址。所有真实回放不注伤、不减HP、不跳波；单元中的定制场地/clearWave/满球为明确夹具。

已知边界：弱配装可能在中期触线，电弧无主动路线仍较慢；部分五砖场景比带隐藏削血的旧版更慢，见M1_1_TEST_REPORT。自动模拟不代表真人手感/真实iPhone声音、热量通过。11–50波/跨刷新存档未实现。
