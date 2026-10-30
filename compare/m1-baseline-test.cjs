'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),os=require('node:os'),a=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pinball-b-'));
try{
 const ref=cp.execFileSync('git',['rev-parse','origin/codex/v027a-feel-lab'],{cwd:root,encoding:'utf8'}).trim();fs.mkdirSync(path.join(temp,'feel'));
 for(const file of ['builds.js','game.js','juice-fx.js'])fs.writeFileSync(path.join(temp,'feel',file),cp.execFileSync('git',['show',`${ref}:compare/hybrid-v27-feel-lab/${file}`],{cwd:root}));
 let harness=fs.readFileSync(path.join(__dirname,'v27-harness.js'),'utf8').replace('hybrid-v27-buildlab','feel').replace('location:{search:""}','location:{search:"?feel=tempo"}').replace('const document={hidden:false,','const document={getElementById:el,querySelectorAll:()=>[],hidden:false,').replace('Math,console},{filename','Math,console,URLSearchParams},{filename');fs.writeFileSync(path.join(temp,'harness.cjs'),harness);
 const B=require(path.join(temp,'harness.cjs')),M=require('./m1-harness'),rows=[];
 for(const family of ['split','arc','gun'])for(const trained of [false,true]){
  const results=[];for(const impl of [B,M]){const g=impl.load(120,2701);g.click('start');g.test.selectSeed(family);if(trained)g.test.configureBuild({[family]:3,rate:5,life:3,power:3},family+'-a');g.test.setTestField([{x:145,y:230,hp:100000},{x:185,y:230,hp:100000},{x:225,y:230,hp:100000}]);g.frame(1200);const q=g.state();results.push({shots:q.shotsFired,contacts:q.brickContacts,hp:q.remainingHp,children:q.splitChildren,arc:q.arcReleases,interval:q.interval,balls:q.activeBalls});}
  a.deepEqual(results[1],results[0],family+' B baseline must match in fixed ten-second no-Buff fixture');rows.push({family,trained,B:results[0],M1:results[1]});
 }
 const output={ref,scope:'10-second controlled high-HP physical fixture; no Buff, no bank, not a wave-completion test',rows};fs.writeFileSync(path.join(root,'docs/m1-evidence/baseline.json'),JSON.stringify(output,null,2));console.log('PASS B vs M1: three cores, base/max-trained, exact shots/contacts/HP/child/arc/interval equality');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
