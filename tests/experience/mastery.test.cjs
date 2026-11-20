const {test}=require("node:test");
const assert=require("node:assert/strict");
const Build=require("../../demo/v1/builds.js");

for(const [route,branch] of [["split","split-a"],["arc","arc-a"],["gun","gun-a"]]){
  test(route+" develops through two gated upgrades with a working specialization",()=>{
    const state=Build.createState(20261118);
    for(const [wave,id] of [[1,route],[2,route],[3,route],[4,branch]])assert.ok(Build.choose(state,id,wave));
    const early=Build.effects(state);
    assert.ok(!Build.eligible(state,8).includes(route));
    assert.ok(Build.choose(state,route,9),"rank 4 available after wave 9");
    assert.ok(Build.choose(state,branch,11),"specialization still upgrades");
    assert.ok(!Build.eligible(state,13).includes(route));
    assert.ok(Build.choose(state,route,14),"rank 5 available for wave 15");
    assert.equal(Build.effectiveRank(state,route),5);
    const late=Build.effects(state);
    if(route==="split")assert.ok(late.splitCount>early.splitCount&&late.childTTL>early.childTTL);
    if(route==="arc")assert.ok(late.arcTargets>early.arcTargets&&late.arcRange>early.arcRange&&late.arcDamage>early.arcDamage);
    if(route==="gun")assert.ok(late.interval<early.interval&&late.gunPressure>early.gunPressure&&late.gunHitsPerBonus===2);
    assert.equal(Build.CONFIG.maxBalls,48);
  });
}

test("unpicked specializations do not crowd mastery out of the three cards",()=>{
  const state=Build.createState(781);
  for(let wave=1;wave<=3;wave++)assert.ok(Build.choose(state,"arc",wave));
  for(const wave of [9,14]){
    const choices=Build.offer(state,wave);
    assert.ok(choices.includes("arc"));
    assert.equal(new Set(choices).size,3);
    assert.ok(Build.choose(state,"arc",wave));
  }
});
