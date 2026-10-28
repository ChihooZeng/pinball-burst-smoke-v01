# v0.12 雷链炮台：数字装甲加长局

基于 v0.11B 渐进式闪电版：
- 基础炮台：雷链炮台（被动：渐进闪电），此版唯一可玩职业；未来扩展职业注册表。
- 主动技能槽：巨型球（唯一已实现的主动技能），将来可以替换，但现在没有其他技能可选。
- 数字装甲 HP 从 2/3/4/5 调到 **4/7/10/13**；普通砖仍然一击即碎。
- 数字装甲先扣血反弹、归零破甲、再下一击击碎，保持原有真实物理法线反弹。
- 数量、球速、四波、渐进闪电、三次成长机会保持不变。
- 胜利界面显示本局秒数、最高连击、击碎数，便于和朋友比较体验。

试玩：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v12-storm/
旧版：https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v11b-progressive/

逻辑验证：`cd compare && node v12-storm-test.js`。相同脚本旧 74.9s vs 新 166.5s，最后 8 砖阶段依次 5.05/2.13/6.50/7.92s。未代替真机试玩结论。