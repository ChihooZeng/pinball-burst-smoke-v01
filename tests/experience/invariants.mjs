import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

const base="9856139c72925ef9bfc51c051736780c141ae91e";
const candidate=process.argv[2]||"HEAD";
const git=(...args)=>execFileSync("git",args,{maxBuffer:32*1024*1024});
const file=(rev,path)=>git("show",rev+":"+path);
const sha=data=>createHash("sha256").update(data).digest("hex");
const before=file(base,"demo/v1/game.js").toString(),after=file(candidate,"demo/v1/game.js").toString();
const sections=[
  ["brickAt","rectanglesOverlap"],["createWavePlan","normalDropSpeed"],
  ["hitBrick","makeBall"],["updateBall","updateGiant"],["updateGiant","skillLevel"],
  ["queueFinaleStage","updateFinaleStages"],["updateFinaleStages","summonBossBricks"],["defeatBoss","updateBossFinisher"]
];
const normalize=source=>source.replace(/\bCEILING_Y\b/g,"4").replace("waveElapsed>cleanupGuideAfter","waveElapsed>12").split("  // Time for the starting bottom row")[0].trimEnd();
function section(source,from,to){
  const start=source.indexOf("  function "+from+"("),end=source.indexOf("  function "+to+"(",start+1);
  assert.ok(start>=0&&end>start,from);
  return normalize(source.slice(start,end));
}
const checks={};
for(const [from,to] of sections){
  const a=section(before,from,to),b=section(after,from,to);
  assert.equal(b,a,from);
  checks[from]=sha(b);
}
assert.match(after,/CEILING_Y=4/);
for(const [name,literal] of Object.entries({BRICK_W:"29",BRICK_H:"22",BRICK_STEP_X:"38.5",WAVE_ROW_GAP:"31",SHOT_HIT_RADIUS:"2.7",MAX_WAVES:"CFG.maxWaves",TUR_MUZZLE:"23.33",TUR_PIVOT_LIFT:"8"})){
  for(const text of [before,after])assert.ok(text.includes(name+"="+literal)||text.includes(name+" = "+literal),name);
}
const start=source=>source.slice(source.indexOf("  const key = \"pinball-v1-language\";"));
assert.equal(start(file(base,"demo/v1/i18n.js").toString()),start(file(candidate,"demo/v1/i18n.js").toString()));
const immutable=git("ls-tree","-r","--name-only",base,"--","demo/v1/audio","demo/v1/assets/neon/turret-a1-1","server")
  .toString().trim().split("\n").concat(["demo/v1/analytics.js","demo/v1/privacy.html","demo/v1/runtime.js"]);
const hashes=Object.fromEntries(immutable.map(path=>{
  const token=sha(file(candidate,path));
  assert.equal(token,sha(file(base,path)),path);
  return [path,token];
}));
console.log(JSON.stringify({base,candidate:git("rev-parse",candidate).toString().trim(),checks,hashes},null,2));
