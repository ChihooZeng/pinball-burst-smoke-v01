import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const polish=process.argv.includes("--release-polish");
const exact=polish||process.argv.includes("--exact-v21");
const base=polish?"d1a208b5a362d2dd9b83d00801492c702dcbb6d0":exact?"f394fe9ab49347b67eb32e40976ce53653adda00":"9856139c72925ef9bfc51c051736780c141ae91e";
const candidate=process.argv[2]||"HEAD";
const git=(...args)=>execFileSync("git",args,{maxBuffer:32*1024*1024});
const file=(rev,path)=>rev==="worktree"?readFileSync(path):git("show",rev+":"+path);
const sha=data=>createHash("sha256").update(data).digest("hex");
const before=file(base,"demo/v1/game.js").toString(),after=file(candidate,"demo/v1/game.js").toString();
if(polish){
  const approved=[
    [",turretRecoil=0",""],["turretRecoil=0;",""],["turretRecoil=1;",""],
    ["turretRecoil=Math.max(0,turretRecoil-dt*5);",""],
    ["TUR_MUZZLE=23.33, TUR_RECOIL=2","TUR_MUZZLE=26.76"],
    ["h:78*barrelScale","h:85*barrelScale"],
    ["    if(turretRecoil>0)ctx.translate(0,turretRecoil*TUR_RECOIL);\n",""],
    ["rounded(-5,-TUR_MUZZLE,10,30,3)","rounded(-5,-TUR_MUZZLE,10,TUR_MUZZLE+6.67,3)"],
    ["  const numberedBlue=", '  function purplePaint(top,bottom){\n    return {edge:purple,ft:withAlpha("#edbdff",top),fb:withAlpha("#dda5ff",bottom)};\n  }\n  const numberedBlue='],
    ["brickPaint(purple,.88,.69)","purplePaint(.98,.92)"],
    ["brickPaint(purple,.83,.64)","purplePaint(.96,.89)"],
    [".map(color=>brickPaint(color));",".map(color=>color===purple?purplePaint(1,.96):brickPaint(color));"],
  ];
  assert.equal(after,approved.reduce((text,[old,value])=>text.replace(old,value),before),"only the approved muzzle and paint changes may touch game.js");
  const presentationCopy=/^    "(version|intro|settingsTitle|hand|soundVisual|previewSound)":.*\n/gm;
  const locales=rev=>file(rev,"demo/v1/i18n.js").toString().replace(presentationCopy,"");
  assert.equal(locales(candidate),locales(base),"locale logic and all other text");
  const tokens=rev=>file(rev,"demo/v1/neon-tokens.css").toString();
  assert.equal(tokens(candidate),tokens(base).replace("--brick-purple: #d6a8ff;","--brick-purple: #D69AFF;"));
  const ids=rev=>Array.from(file(rev,"demo/v1/index.html").toString().matchAll(/\bid="([^"]+)"/g),([,id])=>id).sort();
  assert.deepEqual(ids(candidate),ids(base),"all original controls and overlay IDs");
}
const sections=[
  ["brickAt","rectanglesOverlap"],["createWavePlan","normalDropSpeed"],
  ["hitBrick","makeBall"],["updateBall","updateGiant"],["updateGiant","skillLevel"],
  ["queueFinaleStage","updateFinaleStages"],["updateFinaleStages","summonBossBricks"],["defeatBoss","updateBossFinisher"]
];
if(exact)sections.push(
  ["normalDropSpeed","spawnWave"],["spawnWave","generateWave"],["generateSurvival","update"],
  ["makeBall","splitAt"],["circleIntersectsRect","contactNormal"],["contactNormal","reflect"],
  ["reflect","nearestArcTarget"],["cannonAngle","fire"],["tapHaptic","unlockSound"]
);
const normalize=source=>source.replace(/\bCEILING_Y\b/g,"4").replace("waveElapsed>cleanupGuideAfter","waveElapsed>12").split("  // Time for the starting bottom row")[0].trimEnd();
function section(source,from,to){
  const start=source.indexOf("  function "+from+"("),end=source.indexOf("  function "+to+"(",start+1);
  assert.ok(start>=0&&end>start,from);
  return exact?source.slice(start,end):normalize(source.slice(start,end));
}
const checks={};
for(const [from,to] of sections){
  const a=section(before,from,to),b=section(after,from,to);
  assert.equal(b,a,from);
  checks[from]=sha(b);
}
assert.match(after,/CEILING_Y=4/);
assert.ok(after.includes("TUR_MUZZLE="+(polish?"26.76":"23.33")));
for(const [name,literal] of Object.entries({BRICK_W:"29",BRICK_H:"22",BRICK_STEP_X:"38.5",WAVE_ROW_GAP:"31",SHOT_HIT_RADIUS:"2.7",MAX_WAVES:"CFG.maxWaves",TUR_PIVOT_LIFT:"8"})){
  for(const text of [before,after])assert.ok(text.includes(name+"="+literal)||text.includes(name+" = "+literal),name);
}
const start=source=>source.slice(source.indexOf("  const key = \"pinball-v1-language\";"));
assert.equal(start(file(base,"demo/v1/i18n.js").toString()),start(file(candidate,"demo/v1/i18n.js").toString()));
const immutable=git("ls-tree","-r","--name-only",base,"--","demo/v1/audio","demo/v1/assets/neon/turret-a1-1","server")
  .toString().trim().split("\n").concat(["demo/v1/analytics.js","demo/v1/privacy.html","demo/v1/runtime.js"]
    .concat(exact?["demo/v1/builds.js","demo/v1/i18n.js","demo/v1/sound-pack.js","demo/v1/juice-fx.js","demo/v1/ad-bridge.js"]:[]))
  .filter(path=>!polish||!["demo/v1/i18n.js","demo/v1/assets/neon/turret-a1-1/barrel.svg"].includes(path));
const hashes=Object.fromEntries(immutable.map(path=>{
  const token=sha(file(candidate,path));
  assert.equal(token,sha(file(base,path)),path);
  return [path,token];
}));
console.log(JSON.stringify({base,candidate:candidate==="worktree"?candidate:git("rev-parse",candidate).toString().trim(),checks,hashes},null,2));
