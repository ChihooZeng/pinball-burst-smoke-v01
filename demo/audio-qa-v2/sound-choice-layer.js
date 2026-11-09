/* Audio QA V2: choose sounds during real 20-wave play.
   The QA V1 bundled sounds remain immutable; this layer only changes event routing. */
(()=>{"use strict";
const api=window.PinballGameAudio;
if(!api)return;
const v4=window.PINBALL_SFX_V4,extra=window.PINBALL_AUDIO_EXTRA,more=window.PINBALL_SFX_V5_MORE;
if(!v4||!extra||!more)throw Error("Sound candidate catalogs missing");
const CATEGORIES=[
{key:"mg",label:"机枪射击",id:"mg"},
{key:"hit",label:"普通命中",id:"hit"},
{key:"break",label:"砖块击碎",id:"break"},
{key:"armor",label:"装甲命中",id:"armor"},
{key:"boom",label:"爆雷/连锁爆破",id:"boom"},
{key:"skill_select",label:"技能选择",id:"upgrade"},
{key:"clear",label:"清屏过关",id:"clear"},
{key:"fail",label:"触线失败",id:"fail"},
{key:"upgrade",label:"升级提示",id:"upgrade"}];
const baseline={mg:"V5 木质轻敲",hit:"V5 木板闷响",break:"V5 骰子掷落",armor:"普通命中变调",
 boom:"V5 硬脆爆裂",skill_select:"Mixkit 解锁提示",clear:"Mixkit 过关提示（已裁尾）",
 fail:"Mixkit 游戏结束",upgrade:"V5 短上扬音"};
const cooldown={mg:75,hit:92,break:72,armor:115,boom:205,skill_select:200,clear:850,fail:800,upgrade:350};
const dynamicLevel={mg:.24,hit:.30,break:.41,armor:.30,boom:.46,skill_select:.56,clear:.66,fail:.60,upgrade:.48};
const selected=new Map(),uploads=new Map(),catMap=new Map(),last=new Map(),stats=new Map();
const urlCache=new Map(),voices=[],warnings=[];
let ctx=null,bus=null,compressor=null,stopped=false,playingPreview=[];
const STORAGE="pinball-audio-qa-v2-selected-20261109";
for(const c of CATEGORIES){
 const origin=v4.groups.find(x=>x.id===c.id);
 const entries=[{id:"bundled",label:"本地当前已选 · "+baseline[c.key],url:null,sourcePack:"游戏内置"}];
 const added=new Set();
 for(const x of [...(origin?.candidates||[]),...(extra[c.id]||[]),...(more[c.id]||[])]){
  if(!x.url||added.has(x.url))continue;added.add(x.url);
  entries.push({id:x.id,label:x.label,sourcePack:x.sourcePack||"",url:x.url,seconds:Number(x.seconds||0),original:x.original||x.label});
 }
 catMap.set(c.key,entries);
 selected.set(c.key,"bundled");
}
try{
 const saved=JSON.parse(localStorage.getItem(STORAGE)||"null");
 if(saved?.selected)for(const [key,id] of Object.entries(saved.selected)){
  if(catMap.get(key)?.some(item=>item.id===id&&item.id!=="uploaded"))selected.set(key,id);
 }
}catch(e){}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({selected:Object.fromEntries(selected)}));}catch(e){}}
function activeChoice(key){return catMap.get(key)?.find(c=>c.id===selected.get(key));}
function volume(){return Math.max(0,Math.min(1,api.getState().master||0));}
function setup(){
 if(!ctx){
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
  ctx=new C();bus=ctx.createGain();bus.gain.value=volume()*.88;
  compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-15;compressor.knee.value=16;compressor.ratio.value=5;compressor.attack.value=.003;compressor.release.value=.15;
  bus.connect(compressor);compressor.connect(ctx.destination);
 }
 if(ctx.state==="suspended")ctx.resume().catch(()=>{});
 bus.gain.value=volume()*.88;
 return ctx;
}
async function getBuffer(item){
 if(!item?.url)throw Error("No audio URL");
 if(urlCache.has(item.url))return urlCache.get(item.url);
 const task=(async()=>{
  const a=setup();if(!a)throw Error("WebAudio not supported");
  const response=await fetch(item.url,{mode:"cors",cache:"force-cache"});
  if(!response.ok)throw Error("音频返回HTTP "+response.status);
  const buffer=await a.decodeAudioData((await response.arrayBuffer()).slice(0));
  let sum=0,n=0,peak=0;
  for(let c=0;c<buffer.numberOfChannels;c++){
   const data=buffer.getChannelData(c),stride=Math.max(1,Math.ceil(data.length/22000));
   for(let i=0;i<data.length;i+=stride){sum+=data[i]*data[i];peak=Math.max(peak,Math.abs(data[i]));n++;}
  }
  const rms=Math.sqrt(sum/Math.max(1,n));
  return {buffer,level:Math.min(2.2,Math.max(.3,Math.min(.13/Math.max(.008,rms),.78/Math.max(.01,peak))))};
 })();
 urlCache.set(item.url,task);
 task.catch(()=>urlCache.delete(item.url));
 if(urlCache.size>64){const first=urlCache.keys().next().value;if(first!==item.url)urlCache.delete(first);}
 return task;
}
function durationFor(key,buffer){
 const max={mg:.5,hit:.7,break:1.15,armor:.7,boom:1.6,skill_select:1.8,clear:3.2,fail:2.2,upgrade:2.6}[key]||1;
 return Math.min(buffer.duration,max);
}
function playBuffer(key,rec,scheduledAt=0,scale=1,preview=false){
 const a=setup();if(!a)return;
 const {buffer,level}=rec;
 const start=scheduledAt||a.currentTime+.012,duration=durationFor(key,buffer);
 const src=a.createBufferSource(),gain=a.createGain();
 const active=voices.filter(v=>v.key===key&&v.preview===preview);
 if(!preview&&active.length>=({mg:3,hit:4,break:4,armor:3,boom:3,clear:1,fail:1,upgrade:1,skill_select:2}[key]||2))return;
 if(!preview&&voices.length>=18){
  const replace=voices.find(v=>!v.preview&&["mg","hit","break"].includes(v.key));
  if(replace){try{replace.source.stop();}catch(e){}}else return;
 }
 src.buffer=buffer;const gainAmount=Math.max(.0001,Math.min(.70,(dynamicLevel[key]||.4)*level*scale));
 gain.gain.setValueAtTime(gainAmount,start);
 const release=Math.min(.05,duration*.15);
 gain.gain.setValueAtTime(gainAmount,Math.max(start,start+duration-release));
 gain.gain.linearRampToValueAtTime(.0001,start+duration);
 src.connect(gain);gain.connect(bus);src.start(start,0,duration);
 const record={source:src,gain,key,preview};
 voices.push(record);
 src.onended=()=>{
  const n=voices.indexOf(record);if(n>=0)voices.splice(n,1);
  try{src.disconnect();gain.disconnect();}catch(e){}
 };
 if(preview)playingPreview.push(record);
}
function stopPreview(){
 for(const x of playingPreview){try{x.source.stop();}catch(e){}}
 playingPreview=[];
}
const originalPlay=api.play.bind(api);
const originalGetState=api.getState.bind(api);
api.play=function(kind,master){
 const key=kind==="shock"?"boom":kind;
 if(!catMap.has(key)||!originalGetState().enabled)return originalPlay(kind,master);
 const item=activeChoice(key);
 if(!item||item.id==="bundled")return originalPlay(kind,master);
 stats.set(key,(stats.get(key)||0)+1);
 if(master<=0)return true;
 const time=performance.now(),before=last.get(key)??-99999;
 if(time-before<(cooldown[key]||100))return true;
 last.set(key,time);
 const wanted=item.id;
 getBuffer(item).then(rec=>{
  if(selected.get(key)!==wanted||!originalGetState().enabled)return;
  if(performance.now()-time>280)return; // no delayed impacts after downloads
  playBuffer(key,rec,0,1,false);
 }).catch(error=>{
  if(warnings.length<15)warnings.push({kind:key,candidate:item.label,error:String(error.message||error)});
  // Failed external candidates should not make the live game silent.
  if(selected.get(key)===wanted)originalPlay(kind,master);
 });
 return true;
};
async function preview(key,repeat=false){
 const item=activeChoice(key);
 if(!item)throw Error("未选音效");
 stopPreview();
 if(item.id==="bundled"){
  const interval={mg:130,hit:180,armor:220,break:310,boom:700,clear:2850,fail:1780,upgrade:1850,skill_select:1500}[key]||300;
  if(!repeat){originalPlay(key,volume());return;}
  originalPlay(key,volume());
  const count=Math.max(1,Math.floor(2880/interval));
  for(let i=1;i<=count;i++)setTimeout(()=>{if(activeChoice(key)?.id==="bundled")originalPlay(key,volume());},i*interval);
  return;
 }
 const record=await getBuffer(item);
 const a=setup();if(!a)throw Error("不支持 Web Audio");
 if(!repeat){playBuffer(key,record,0,1,true);return;}
 const step=Math.max(.16,Math.min(2.9,durationFor(key,record.buffer)+.1));
 const count=Math.max(1,Math.ceil(3/step));
 const start=a.currentTime+.03;
 for(let i=0;i<count;i++)playBuffer(key,record,start+i*step,Math.min(.85,1/Math.sqrt(Math.max(1,record.buffer.duration/step))),true);
 setTimeout(stopPreview,3200);
}
function choose(key,id){
 if(!catMap.get(key)?.some(c=>c.id===id))return false;
 selected.set(key,id);persist();
 const item=activeChoice(key);
 if(item?.url)getBuffer(item).catch(error=>{warnings.push({kind:key,error:String(error.message||error)});});
 return true;
}
function setUploaded(key,file){
 if(!catMap.has(key)||!file||!file.type.startsWith("audio/"))throw Error("请选择音频文件");
 const previous=uploads.get(key);if(previous)URL.revokeObjectURL(previous.url);
 const url=URL.createObjectURL(file);
 const item={id:"uploaded",label:"自选文件："+file.name,url,sourcePack:"本地临时上传",uploaded:true};
 const arr=catMap.get(key);const i=arr.findIndex(c=>c.id==="uploaded");if(i>=0)arr.splice(i,1);
 arr.push(item);uploads.set(key,item);selected.set(key,"uploaded");
 persist();return getBuffer(item);
}
function exportConfig(){return {
 version:"pinball-audio-qa-v2",exportedAt:new Date().toISOString(),
 items:CATEGORIES.map(c=>{
 const item=activeChoice(c.key);
 return {event:c.key,name:c.label,selectedId:selected.get(c.key),label:item?.label,url:item?.uploaded?null:item?.url,uploadedFilename:item?.uploaded?item.label:null,groupVolume:originalGetState().levels[c.key]||1};
 }),
 note:"'uploaded' is a local temporary audio file and is NOT included in this JSON. Upload audio files separately before formal release.",
 warnings:warnings.slice(-10),diagnostic:window.__pinballAudioQaFix?.getStatus?.()||null
};}
window.PinballSoundChoice={
 categories:CATEGORIES.map(x=>({...x})),getChoices:key=>(catMap.get(key)||[]).map(({id,label,url,seconds,sourcePack,uploaded})=>({id,label,url,seconds,sourcePack,uploaded})),
 getSelection:key=>selected.get(key),choose,preview,stopPreview,setUploaded,exportConfig,
 getState:()=>({selected:Object.fromEntries(selected),dynamicPlays:Object.fromEntries(stats),warnings:warnings.slice(-7)})
};
})();