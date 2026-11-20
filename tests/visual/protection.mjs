import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

const baseline = "0fb86d0e5e6a0bdd2b157fe21b6ec42c3b7817e6";
const commit = process.argv[2] || "HEAD";
const git = (...args) => execFileSync("git", args, {maxBuffer:32*1024*1024});
const contents = (revision,file) => git("show",revision+":"+file);
const text = (revision,file) => contents(revision,file).toString("utf8");
const digest = buffer => createHash("sha256").update(buffer).digest("hex");
const entry = "demo/v1/";
const changes = git("diff","--name-only",baseline,commit,"--",entry,"server","scripts","tests/release")
  .toString("utf8").trim().split("\n").filter(Boolean);
const visualFiles = [
  "index.html","style.css","neon-tokens.css","game.js","assets/neon/dock-edge.svg",
  "assets/neon/icons/pause.svg","assets/neon/turret-a1-1/ground.svg","assets/neon/turret-a1-1/barrel.svg"
].map(file=>entry+file);
assert.ok(changes.every(file=>visualFiles.includes(file)||[
  "tests/release/bricks.mjs","tests/release/stability.mjs","tests/release/audio.mjs"
].includes(file)),JSON.stringify(changes));

function cut(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start);
  return source.slice(0,a)+source.slice(b);
}
function normalize(source,visualV2){
  source=cut(source,visualV2?"  // Canvas follows":"  // Rendering colors share","  function earlyOneHpStyle(");
  source=cut(source,"  // All offsets are relative","  const palette =");
  source=cut(source,"  function withAlpha(","  function brickText(");
  source=cut(source,"  function draw()","  function renderBuildPanel(");
  if(!visualV2)return source;

  source=cut(source,"  const skillSlots=","  function updateUI()");
  source=cut(source,"  function showPausePanel(","  function pause(");
  const exactEdits = [
    ['    canvas.style.setProperty("--world-ratio",W/H);\n',""],
    ["    renderSkillRanks();\n",""],
    ['  function pause(reason="settings",compact=false){','  function pause(reason="settings"){'],
    ['    showPausePanel(compact||reason==="keyboard");\n',""],
    ['  $("pauseQuick").addEventListener("click",()=>pause("settings",true));\n'+
      '  $("pauseSettings").addEventListener("click",()=>{\n'+
      '    showPausePanel(false);\n'+
      '    $("resume").focus();\n'+
      '  });\n',""],
    ['button,input,select,a[href],[tabindex=\'0\'],summary")).filter(el=>!el.disabled&&el.getClientRects().length);',
      'button,input,select,[tabindex=\'0\'],summary")).filter(el=>!el.disabled);']
  ];
  for(const [visual,original] of exactEdits){
    assert.ok(source.includes(visual),visual);
    source=source.replace(visual,original);
  }
  return source;
}

const before=normalize(text(baseline,entry+"game.js"),false);
const after=normalize(text(commit,entry+"game.js"),true);
assert.equal(after,before,"Simulation, sound, vibration and gameplay source outside the visual layer");

const oldMarkup=text(baseline,entry+"index.html"),newMarkup=text(commit,entry+"index.html");
for(const pattern of [/\bid="[^"]+"/g,/\bdata-i18n(?:-label)?="[^"]+"/g,/\bdata-analytics[-a-z]+/g]){
  const tags=newMarkup.match(pattern);
  for(const tag of oldMarkup.match(pattern)){
    const i=tags.indexOf(tag);
    assert.ok(i>=0,tag);
    tags.splice(i,1);
  }
}
const files=git("ls-tree","-r","--name-only",baseline,"--",entry+"audio/","server","scripts").toString("utf8").trim().split("\n")
  .concat(["sound-pack.js","builds.js","juice-fx.js","boot.js","i18n.js","analytics.js","runtime.js",
    "ad-bridge.js","privacy.html","privacy.css","privacy.js"].map(name=>entry+name));
const hashes=Object.fromEntries(files.map(file=>{
  const baselineDigest=digest(contents(baseline,file)),candidateDigest=digest(contents(commit,file));
  assert.equal(candidateDigest,baselineDigest,file);
  return [file,candidateDigest];
}));
console.log(JSON.stringify({baseline,commit:git("rev-parse",commit).toString().trim(),changes,
  gameplaySHA256:digest(after),hashes},null,2));
