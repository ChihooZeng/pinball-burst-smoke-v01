'use strict';
const assert=require('node:assert/strict'),{load}=require('./v27-harness');
const start=(family='split',hz=60,seed=2701)=>{const g=load(hz,seed);g.click('start');assert.equal(g.state().phase,'seeding');assert.ok(g.test.selectSeed(family));return g;};
const g=start();assert.equal(g.state().coreFocus,null);assert.equal(g.state().seedAbility,'split');
function field(g,hp=100){return g.test.setTestField([{x:145,y:230,hp},{x:185,y:230,hp},{x:225,y:230,hp}]);}
for(const [rank,hits,count] of [[1,2,1],[2,2,2],[3,1,2]]){
 const s=start();s.test.configureBuild({split:rank});const ids=field(s);const ball=s.test.makeTestBall();
 for(let i=1;i<=hits;i++){s.test.directContact(ids[0],ball);assert.equal(s.state().splitChildren,i===hits?count:0);}
 for(let i=0;i<5;i++)s.test.directContact(ids[0],ball);
 assert.equal(s.state().splitChildren,count,'one split per parent');
 const child=s.test.makeTestBall(true);for(let i=0;i<6;i++)s.test.directContact(ids[0],child);assert.equal(s.state().splitChildren,count,'no descendants');
}
for(const branch of ['split-a','split-b']){const s=start();s.test.configureBuild({split:3},branch);const ids=field(s);s.test.directContact(ids[0],s.test.makeTestBall());assert.equal(s.state().splitChildren,branch==='split-a'?3:2);}
const arc=start('arc');const ids=field(arc);const ball=arc.test.makeTestBall();
arc.test.directContact(ids[0],ball);arc.test.directContact(ids[0],ball);assert.equal(arc.state().arcReleases,0);
arc.test.directContact(ids[0],ball);assert.equal(arc.state().arcReleases,1);
for(let i=0;i<9;i++)arc.test.directContact(ids[0],arc.test.makeTestBall());assert.equal(arc.state().arcReleases,1,'global cooldown');
const before=arc.state();arc.test.hitForTest(ids[1],'lightning',5);arc.test.hitForTest(ids[2],'shock',5);
assert.equal(arc.state().arcReleases,before.arcReleases);assert.equal(arc.state().splitChildren,0);assert.equal(arc.state().charge,0);
for(const branch of [null,'arc-a','arc-b']){const s=start('arc');s.test.configureBuild({arc:3},branch);const one=s.test.setTestField([{x:138,y:108,w:84,h:53,hp:100,isBoss:true}]);const b=s.test.makeTestBall();s.test.directContact(one[0],b);s.test.directContact(one[0],b);assert.equal(s.state().arcReleases,1);assert.ok(s.state().arcSingleDamage>=2);}
const net=start('arc');net.test.configureBuild({arc:3},'arc-a');const chain=net.test.setTestField([{x:5,y:200,hp:100},{x:100,y:200,hp:100},{x:200,y:200,hp:100},{x:300,y:200,hp:100}]);const n=net.test.makeTestBall();net.test.directContact(chain[0],n);net.test.directContact(chain[0],n);assert.equal(net.state().lightningDamage,9,'rank3 net deals experimental 3 damage to each of three different targets');
for(const branch of [null,'gun-a','gun-b']){const s=start('gun');s.test.configureBuild({gun:3,rate:5,life:3},branch);s.test.fillBallBudget();const count=s.state().shotsFired;s.test.fire();assert.equal(s.state().shotsFired,count+1);assert.equal(s.state().activeBalls,32);assert.equal(s.state().budgetReclaims,1);assert.ok(s.state().interval>=.12);s.frame(240);assert.ok(s.state().shotsFired>count+20);assert.ok(s.state().maxBallsAlive<=32);assert.equal(s.state().suppressedShots,0);}
const gun=start('gun');assert.equal(gun.state().interval,.35);gun.test.setTestField([{x:145,y:200,hp:10000}]);gun.frame(600);assert.ok(gun.state().shotsFired>=28&&gun.state().shotsFired<=30);
const fan=start('gun');fan.test.configureBuild({gun:3},'gun-b');fan.test.setTestField([{x:145,y:200,hp:10000}]);fan.frame(240);const angles=fan.test.exportData().events.filter(e=>e.type==='shot').map(e=>e.angle);assert.ok(Math.min(...angles)<-.2&&Math.max(...angles)>.2);assert.ok(Math.max(...angles)<=.28);
const clear=start();clear.test.spawnTestBall(0);clear.test.injectGiantAt(180,270);clear.test.clearWave();clear.frame(1);
assert.equal(clear.state().phase,'choosing');assert.equal(clear.state().waveUpgrades,1);assert.equal(clear.state().activeBalls,0);assert.equal(clear.state().giantActive,false);
const t=clear.state().elapsed;clear.frame(120);assert.equal(clear.state().elapsed,t);assert.ok(clear.test.chooseUpgrade(clear.state().choiceSet.split(',')[0]));clear.frame(100);assert.equal(clear.state().wave,2);
const boss=start('arc');boss.test.spawnWave(4);boss.test.setBossHp(1);const core=boss.test.allBricks().find(b=>b.isBoss);boss.test.hitById(core.id);boss.frame(1);assert.equal(boss.state().waveUpgrades,0);
const finish=start('gun');for(let w=1;w<=8;w++){finish.test.clearWave();finish.frame(1);assert.equal(finish.state().phase,'choosing');assert.ok(finish.test.chooseUpgrade(finish.state().choiceSet.split(',')[0]));if(w<8)finish.frame(100);}assert.equal(finish.state().phase,'complete');assert.equal(finish.state().screenClears,8);assert.equal(finish.state().wave,8);finish.frame(200);assert.equal(finish.state().wave,8);
const snaps=[];for(const hz of [30,60,120]){const s=start('gun',hz);s.frame(hz*10);const x=s.state();snaps.push([x.shotsFired,x.brickContacts,x.score,x.activeBalls,+x.elapsed.toFixed(6)]);}assert.deepEqual(snaps[0],snaps[1]);assert.deepEqual(snaps[1],snaps[2]);
console.log('PASS v27 combat: split counts, six branches, single-Boss arc, recursion guard, continuous gun budget, wave lifecycle, eight-wave stop and 30/60/120Hz');
const cadence=start('gun');cadence.test.clearWave();cadence.frame(1);cadence.test.chooseUpgrade(cadence.state().choiceSet.split(',')[0]);const shotStart=cadence.state().shotsFired;cadence.frame(96);assert.ok(cadence.state().shotsFired-shotStart<=1,'wave preview must not bank a burst of gun shots');

const production=load(60,2701,false);assert.equal(production.test,undefined);production.click('start');production.click('choice2');assert.equal(production.state().phase,'playing');
const hidden=start('gun');hidden.frame(60);const hiddenTime=hidden.state().elapsed;hidden.document.hidden=true;hidden.frame(300);assert.equal(hidden.state().elapsed,hiddenTime);hidden.document.hidden=false;hidden.frame(60);assert.ok(Math.abs(hidden.state().elapsed-hiddenTime-1)<.001);
console.log('PASS preview cadence, production API isolation and hidden-page pause');
