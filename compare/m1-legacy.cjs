'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tests=[];
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())scan(f);else if(/(?:test|smoke).*\.js$/.test(e.name)&&!e.name.startsWith('m1-'))tests.push(f);}}
scan(__dirname);tests.push(path.join(root,'smoke-test.js'));
const results=[];for(const file of tests){const cwd=path.dirname(file),r=cp.spawnSync(process.execPath,[path.basename(file)],{cwd,encoding:'utf8',timeout:120000});results.push({file:path.relative(root,file),cwd:path.relative(root,cwd),status:r.status,stdout:r.stdout,stderr:r.stderr});}
fs.writeFileSync(path.join(root,'docs/m1-evidence/legacy.json'),JSON.stringify(results,null,2));console.log(results.map(r=>`${r.status===0?'PASS':'FAIL'} ${r.file}`).join('\n'));if(results.some(r=>r.status!==0))process.exitCode=1;
