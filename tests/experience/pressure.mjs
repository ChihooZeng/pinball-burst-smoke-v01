import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [beforeFile,afterFile]=process.argv.slice(2);
const before=JSON.parse(await fs.readFile(beforeFile,"utf8"));
const after=JSON.parse(await fs.readFile(afterFile,"utf8"));
for(const [i,view] of after.results.entries()){
  const base=before.results[i];
  assert.equal(view.width,base.width);
  assert.deepEqual(view.pressure.map(({wave,bricks,hp})=>({wave,bricks,hp})),
    base.pressure.map(({wave,bricks,hp})=>({wave,bricks,hp})), "Original wave count and HP");
  const ordinary=view.pressure.filter(row=>row.wave!==10&&row.wave!==20);
  const deadlines=ordinary.map(row=>row.gap/row.speed);
  assert.ok(deadlines[0]>deadlines.at(-1)*1.8,"Late waves must be substantially tighter than wave 1");
  for(let i=1;i<deadlines.length;i++)assert.ok(deadlines[i]<deadlines[i-1],"Pressure must increase at wave "+ordinary[i].wave);
}
console.log("PASS identical HP/layout counts and a rising pressure profile at all four viewport sizes");
