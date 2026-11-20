import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

const baseline = "4f2498ccbe432b84dbcbf4c18109f3056217e470";
const commit = process.argv[2] || "HEAD";
const git = (...args) => execFileSync("git", args, {maxBuffer:32*1024*1024});
const snapshot = (revision,file) => git("show",revision+":"+file);
const digest = input => createHash("sha256").update(input).digest("hex");
const text = (revision,file) => snapshot(revision,file).toString("utf8");
const entry = "demo/v1/";
const changed = git("diff","--name-only",baseline,commit,"--",entry,"server","scripts","tests/release","release.json","SHA256SUMS")
  .toString("utf8").trim().split("\n");
assert.ok(changed.every(file=>[
  entry+"index.html",entry+"style.css",entry+"game.js"
].includes(file)||file.startsWith(entry+"assets/neon/")), JSON.stringify(changed));

const endpoints = [
  [["  function showCards("],"  const bestRunKey"],
  [["  function renderResult("],"  function finishPrototype("],
  [["  // Fixed HP bands","  // Rendering colors share"],"  function earlyOneHpStyle("],
  [["  /* V3.1 炮台","  const TUR_PIVOT_LIFT="],"  const palette ="],
  [["  /* —— 砖块绘制基础件","  function withAlpha("],"  function brickText("],
  [["  function draw()"],"  function renderBuildPanel("]
];

function gameplay(source) {
  const turretConstants = source.match(/const TUR_PIVOT_LIFT=[^;]+;/)?.[0];
  assert.ok(turretConstants);
  for (const [startOptions,end] of endpoints) {
    const start = startOptions.map(option=>source.indexOf(option)).find(offset=>offset>=0);
    const next = source.indexOf(end,start);
    assert.ok(start>=0&&next>start,end);
    source=source.slice(0,start)+source.slice(next);
  }
  return turretConstants+"\n"+source;
}
const baselineGameplay = gameplay(text(baseline,entry+"game.js"));
const candidateGameplay = gameplay(text(commit,entry+"game.js"));
assert.equal(candidateGameplay,baselineGameplay);

const before = text(baseline,entry+"index.html");
const after = text(commit,entry+"index.html");
for (const pattern of [/\bid="[^"]+"/g,/\bdata-i18n(?:-label)?="[^"]+"/g,/\bdata-analytics[-a-z]+/g]) {
  assert.deepEqual(after.match(pattern).sort(),before.match(pattern).sort());
}
const protectedFiles = git("ls-tree","-r","--name-only",baseline,"--",entry+"audio/")
  .toString("utf8").trim().split("\n").concat(
    ["sound-pack.js","builds.js","juice-fx.js","boot.js","i18n.js","analytics.js","runtime.js",
      "ad-bridge.js","privacy.html","privacy.css","privacy.js"].map(name=>entry+name)
  );
const hashes = Object.fromEntries(protectedFiles.map(file=>{
  const a=digest(snapshot(baseline,file)),b=digest(snapshot(commit,file));
  assert.equal(a,b,file);
  return [file,b];
}));
console.log(JSON.stringify({baseline,commit:git("rev-parse",commit).toString().trim(),changed,
  gameplaySHA256:digest(candidateGameplay),hashes},null,2));
