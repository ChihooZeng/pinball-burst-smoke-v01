'use strict';
// Run the unchanged v26 CDP assertions with only host executable and output paths adapted.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const out=process.env.V27_QA_DIR||path.join(os.tmpdir(),'pinball-v27-qa');fs.mkdirSync(out,{recursive:true});
const chrome=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let source=fs.readFileSync(path.join(__dirname,'v26-mobile-cdp-qa.js'),'utf8');
source=source.replace('"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"',JSON.stringify(chrome)).replace('PORT=19296','PORT=19326');
source=source.replace('path.resolve(`v26-${name}.jpeg.b64`)','path.join('+JSON.stringify(out)+',`v26-${name}.jpeg.b64`)');
source=source.replace(/path.resolve\("(v26-[^"]+)"\)/g,(_,name)=>'path.join('+JSON.stringify(out)+','+JSON.stringify(name)+')');
const script=path.join(out,'v26-mobile-adapted.cjs');fs.writeFileSync(script,source);
const result=spawnSync(process.execPath,[script],{cwd:__dirname,stdio:'inherit'});process.exitCode=result.status??1;
