/* 《弹珠超载》20-wave Audio QA. Real user-approved 8 sound families.
   In-game bundled asset paths; never loads Mixkit directly from a blocked external CDN.
   Original demo scripts are left untouched. */
(() => {
"use strict";
const SOUND_REV="qa-20261106-a";
const SPRITE="./audio/mixkit-game-sfx-sprite.mp3";
const DEFINITIONS=Object.freeze({
  skill_select:{key:"mixkit",start:0,duration:1.397392,volume:.58,cooldown:180,limit:2,priority:4},
  clear:{key:"mixkit",start:1.597392,duration:2.6,volume:.72,cooldown:800,limit:1,priority:5},
  fail:{key:"mixkit",start:4.397392,duration:1.666667,volume:.68,cooldown:1100,limit:1,priority:5},
  mg:{key:"mg",url:"./audio/mg.ogg",volume:.24,cooldown:75,limit:3,priority:1},
  hit:{key:"hit",url:"./audio/hit.ogg",volume:.32,cooldown:92,limit:4,priority:1},
  armor:{key:"hit",url:"./audio/hit.ogg",rate:.84,volume:.34,cooldown:115,limit:2,priority:2},
  break:{key:"break",url:"./audio/break.ogg",volume:.48,cooldown:70,limit:5,priority:2},
  boom:{key:"boom",url:"./audio/boom.ogg",rate:.96,volume:.52,cooldown:205,limit:3,priority:3},
  shock:{key:"boom",url:"./audio/boom.ogg",rate:.96,volume:.46,cooldown:205,limit:3,priority:3},
  upgrade:{key:"upgrade",url:"./audio/upgrade.wav",volume:.44,cooldown:350,limit:1,priority:3}
});
const STORAGE="pinball-overload-audio-qa-20261106";
const aliases={shock:"boom",armor:"hit"};
let enabled=true,volume=.78;
const levels=Object.fromEntries(Object.keys(DEFINITIONS).map(n=>[n,1]));
try{const old=JSON.parse(localStorage.getItem(STORAGE)||"null");if(old){
 if(typeof old.enabled==="boolean")enabled=old.enabled;
 if(old.levels)for(const n in levels){if(Number.isFinite(old.levels[n]))levels[n]=Math.max(0,Math.min(1.5,old.levels[n]));}
}}catch(e){}
let ctx=null,bus=null,compressor=null;
const buffers=new Map(),instances=[],last=Object.create(null),stats=Object.create(null);
let errors=0;
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({enabled,levels}));}catch(e){}}
function setup(){
 if(!ctx){
  const C=window.AudioContext||window.webkitAudioContext;
  if(!C)return null;
  ctx=new C();
  bus=ctx.createGain();bus.gain.value=volume*.86;
  compressor=ctx.createDynamicsCompressor();
  compressor.threshold.value=-14;compressor.knee.value=18;compressor.ratio.value=4.5;
  compressor.attack.value=.002;compressor.release.value=.13;
  bus.connect(compressor);compressor.connect(ctx.destination);
 }
 if(ctx.state==="suspended")ctx.resume().catch(()=>{errors++});
 return ctx;
}
function keyFor(n){return DEFINITIONS[n]?.key;}
function configForKey(key){return Object.values(DEFINITIONS).find(c=>c.key===key);}
async function load(key){
 if(buffers.has(key))return buffers.get(key);
 const job=(async()=>{
  const context=setup();if(!context)throw new Error("Web Audio unsupported");
  const url=key==="mixkit"?SPRITE:configForKey(key)?.url;
  if(!url)throw new Error("Unknown audio: "+key);
  const r=await fetch(url,{cache:"force-cache"});
  if(!r.ok)throw new Error("Audio HTTP "+r.status+": "+url);
  const a=await r.arrayBuffer();
  const buffer=await context.decodeAudioData(a.slice(0));
  return buffer;
 })();
 buffers.set(key,job);
 job.catch(e=>{buffers.delete(key);errors++;console.warn("[Audio QA] load failed",key,e.message);});
 return job;
}
function rmsGain(buffer,partStart,partDuration){
 const rate=buffer.sampleRate,start=Math.floor(partStart*rate),end=Math.min(buffer.length,Math.floor((partStart+partDuration)*rate));
 if(end<=start)return 1;
 let sum=0,n=0,peak=0;
 for(let c=0;c<buffer.numberOfChannels;c++){
  const arr=buffer.getChannelData(c),step=Math.max(1,Math.floor((end-start)/15000));
  for(let i=start;i<end;i+=step){const v=arr[i];sum+=v*v;n++;peak=Math.max(peak,Math.abs(v));}
 }
 const rms=Math.sqrt(sum/Math.max(n,1));
 return Math.min(1.8,Math.max(.35,Math.min(.13/Math.max(rms,.005),.82/Math.max(peak,.005))));
}
const gains=new Map();
function clearVoices(priority=0){
 for(const v of [...instances])if(v.priority<=priority){
  try{v.source.stop();}catch(e){}
 }
}
function stop(kind=null){
 for(const v of [...instances])if(!kind||v.kind===kind){
  try{v.source.stop();}catch(e){}
 }
}
function setVolume(val){
 volume=Math.max(0,Math.min(1,Number(val)||0));
 if(bus&&ctx?.state==="running")bus.gain.setTargetAtTime(volume*.86,ctx.currentTime,.02);
 else if(bus)bus.gain.value=volume*.86;
}
function play(kind,master=volume){
 const d=DEFINITIONS[kind];if(!d||!enabled)return false;
 setVolume(master);
 stats[kind]=(stats[kind]||0)+1;
 if(volume<=0||levels[kind]<=0)return true;
 const now=performance.now();
 if(now-(last[kind]??-10000)<d.cooldown)return true;
 last[kind]=now;
 if(kind==="clear"||kind==="fail")clearVoices(4);
 if(kind==="skill_select")stop("clear");
 const triggered=now;
 const context=setup();if(!context)return false;
 load(d.key).then(buffer=>{
  // Never fire stale impact audio once its matching brick/wave is gone.
  if(!enabled||volume<=0||document.hidden||performance.now()-triggered>(d.priority>=4?850:270))return;
  const start=d.start||0,duration=Math.min(d.duration||buffer.duration,buffer.duration-start);
  if(duration<=.01)return;
  const active=instances.filter(v=>v.kind===kind);
  if(active.length>=d.limit){if(d.priority<4)return;try{active[0].source.stop();}catch(e){}}
  if(instances.length>=16){
    const steal=instances.filter(v=>v.priority<d.priority).sort((a,b)=>a.at-b.at)[0];
    if(steal){try{steal.source.stop()}catch(e){}}else return;
  }
  const source=context.createBufferSource(),gain=context.createGain();
  source.buffer=buffer;source.playbackRate.value=d.rate||1;
  const levelKey=d.key+":"+start+":"+duration;
  if(!gains.has(levelKey))gains.set(levelKey,rmsGain(buffer,start,duration));
  const peak=Math.max(.002,Math.min(.66,(d.volume||.4)*levels[kind]*gains.get(levelKey)));
  const t=context.currentTime+.008;
  const actual=duration/(d.rate||1),release=Math.min(.045,actual*.12);
  gain.gain.setValueAtTime(.00001,t);
  gain.gain.linearRampToValueAtTime(peak,t+.006);
  gain.gain.setValueAtTime(peak,Math.max(t+.006,t+actual-release));
  gain.gain.linearRampToValueAtTime(.00001,t+actual);
  source.connect(gain);gain.connect(bus);
  const voice={source,gain,kind,priority:d.priority,at:performance.now()};
  instances.push(voice);
  source.onended=()=>{
   const i=instances.indexOf(voice);if(i>=0)instances.splice(i,1);
   try{source.disconnect();gain.disconnect();}catch(e){}
  };
  source.start(t,start,duration);
 }).catch(e=>{errors++;console.warn("[Audio QA] playback error",kind,e.message);});
 return true;
}
function prime(){
 if(!setup())return;
 const keys=["mixkit","mg","hit","break","boom","upgrade"];
 for(const k of keys)load(k).catch(()=>{});
}
function enabledToggle(on){enabled=!!on;persist();if(!enabled)stop();}
function setGroupVolume(kind,val){
 if(!(kind in levels))return;
 levels[kind]=Math.max(0,Math.min(1.5,Number(val)||0));persist();
}
function getState(){return {revision:SOUND_REV,enabled,master:volume,levels:{...levels},plays:{...stats},errors,loaded:[...buffers.keys()],activeVoices:instances.length};}
document.addEventListener("pointerdown",prime,{once:true,capture:true,passive:true});
document.addEventListener("visibilitychange",()=>{if(document.hidden)stop()});
window.PinballGameAudio={play,prime,stop,setVolume,setEnabled:enabledToggle,setGroupVolume,getState,DEFINITIONS};
})();