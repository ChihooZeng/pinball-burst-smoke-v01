/* 弹珠超载 V7：0.33–0.70秒实物采样短反馈；独立选型，不修改游戏。 */
(()=>{"use strict";
const D=window.PINBALL_SFX_V7,HOST=document.getElementById("groups");
const IDS=["clear","fail"],KEY="pinball-overload-sfx-v7-short-microstingers";
if(!D||!D.sources||!D.groups?.clear||!D.groups?.fail){HOST.textContent="V7采样目录加载失败";return;}
const initial=()=>({volume:68,groups:{clear:{choice:null,favorites:[],notes:""},fail:{choice:null,favorites:[],notes:""}}});
let state=initial();
try{
 const stored=JSON.parse(localStorage.getItem(KEY)||"null");
 if(stored?.groups){IDS.forEach(id=>{
  const old=stored.groups[id],newS=state.groups[id];if(!old)return;
  const allowed=D.groups[id].variants.map(v=>v.id);
  if(old.choice===null||allowed.includes(old.choice))newS.choice=old.choice;
  if(Array.isArray(old.favorites))newS.favorites=[...new Set(old.favorites.filter(v=>allowed.includes(v)))];
  if(typeof old.notes==="string")newS.notes=old.notes.slice(0,5000);
 });
 if(Number.isFinite(stored.volume))state.volume=Math.min(100,Math.max(0,stored.volume));
 }
}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){status("浏览器本地存储不可用，请导出JSON");}}
function status(t){document.getElementById("status").textContent=t;}
function safe(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
let ctx=null,mix=null,cache=new Map(),active=[],token=0,stopTimer=null,currentButton=null;
function ensureAudio(){
 if(!ctx){
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)throw Error("当前浏览器不支持Web Audio");
  ctx=new AudioContext();
  mix=createBus(ctx,state.volume);
 }
 if(ctx.state==="suspended")ctx.resume().catch(()=>{});
 return ctx;
}
function createBus(audioContext,vol){
 const master=audioContext.createGain(),comp=audioContext.createDynamicsCompressor();
 master.gain.value=(vol/100)*.80;
 comp.threshold.value=-15;comp.knee.value=17;comp.ratio.value=5;comp.attack.value=.003;comp.release.value=.13;
 master.connect(comp);comp.connect(audioContext.destination);
 return master;
}
async function loadSample(sourceKey){
 const source=D.sources[sourceKey],url=source?.local||source?.url;
 if(!source||!url)throw Error("未找到采样："+sourceKey);
 if(!cache.has(url)){
  const task=(async()=>{
   const audio=ensureAudio(),response=await fetch(url,{mode:"cors",cache:"force-cache"});
   if(!response.ok)throw Error("HTTP "+response.status+"："+source.original);
   const buffer=await audio.decodeAudioData((await response.arrayBuffer()).slice(0));
   let sum=0,peak=0,n=0;
   for(let channel=0;channel<buffer.numberOfChannels;channel++){
    const samples=buffer.getChannelData(channel),stride=Math.max(1,Math.ceil(samples.length/20000));
    for(let i=0;i<samples.length;i+=stride){const v=samples[i];sum+=v*v;peak=Math.max(peak,Math.abs(v));n++;}
   }
   const rms=Math.sqrt(sum/Math.max(1,n));
   const adjustment=Math.min(2.5,Math.max(.28,.13/Math.max(.007,rms)),.75/Math.max(.01,peak));
   return {buffer,adjustment};
  })();
  cache.set(url,task);task.catch(()=>cache.delete(url));
 }
 return cache.get(url);
}
async function material(variant){
 const keys=[...new Set(variant.hits.map(h=>h.src))];
 const records=await Promise.all(keys.map(async k=>[k,await loadSample(k)]));
 return Object.fromEntries(records);
}
function scheduleVariant(audioContext,bus,variant,samples,start,capture){
 const created=[];
 for(const h of variant.hits){
  const rec=samples[h.src],buffer=rec.buffer;
  const at=start+h.at;
  const playable=Math.max(.012,Math.min(buffer.duration/h.rate,variant.duration-h.at));
  const src=audioContext.createBufferSource(),gain=audioContext.createGain();
  src.buffer=buffer;src.playbackRate.value=h.rate;
  const amp=Math.min(.65,Math.max(.025,h.level*rec.adjustment*.34));
  const attack=Math.min(.004,playable/6),hold=Math.max(at+attack,at+playable-.027);
  gain.gain.setValueAtTime(.0001,at);
  gain.gain.linearRampToValueAtTime(amp,at+attack);
  gain.gain.setValueAtTime(amp,hold);
  gain.gain.linearRampToValueAtTime(.0001,at+playable);
  src.connect(gain);gain.connect(bus);
  src.start(at);src.stop(at+playable);
  if(capture){capture.push(src);src.onended=()=>{const index=capture.indexOf(src);if(index>=0)capture.splice(index,1);};}
  created.push(src);
 }
 return created;
}
function stop(){
 token++;
 if(stopTimer!==null){clearTimeout(stopTimer);stopTimer=null;}
 for(const node of active){try{node.stop();}catch(e){}}
 active=[];
 if(currentButton){currentButton.classList.remove("playing");currentButton.textContent=currentButton.dataset.idleLabel||"▶ 单次";currentButton=null;}
}
async function audition(kind,variant,repeating,button){
 stop();const issued=token;
 currentButton=button;button.classList.add("playing");button.textContent="正在加载…";
 try{
  const ac=ensureAudio(),records=await material(variant);
  if(issued!==token)return;
  const begin=ac.currentTime+.05;
  const reps=repeating?4:1,interval=.80;
  for(let i=0;i<reps;i++)scheduleVariant(ac,mix,variant,records,begin+i*interval,active);
  button.textContent=repeating?"连播中…":"正在播放";
  stopTimer=setTimeout(()=>{if(issued===token)stop();},(repeating?3.25:variant.duration+.2)*1000);
  status((repeating?"4次连续对照：":"单次短音：")+variant.label+"（"+variant.duration.toFixed(2)+"秒）");
 }catch(e){
  if(issued!==token)return;
  stop();status("播放失败："+e.message+"。请检查网络或浏览器是否允许Web Audio。");
 }
}
function selection(kind,id){
 state.groups[kind].choice=id;save();
 const el=document.getElementById("choices-"+kind);
 el?.querySelectorAll(".item").forEach(row=>{
  const radio=row.querySelector('input[type="radio"]');
  radio.checked=radio.value===id;row.classList.toggle("selected",radio.value===id);
 });
 renderSummary();
 status("首选已设定："+D.groups[kind].variants.find(x=>x.id===id)?.label);
}
function toggleFavorite(kind,id,button){
 const list=state.groups[kind].favorites;
 if(list.includes(id))state.groups[kind].favorites=list.filter(v=>v!==id);
 else list.push(id);
 const on=state.groups[kind].favorites.includes(id);
 button.textContent=on?"★":"☆";button.classList.toggle("on",on);button.setAttribute("aria-pressed",String(on));
 save();renderSummary();
}
function renderSummary(){
 const ul=document.getElementById("summary");ul.replaceChildren();let total=0,marks=0;
 for(const kind of IDS){
  const g=D.groups[kind],s=state.groups[kind],choice=g.variants.find(v=>v.id===s.choice);
  if(choice)total++;marks+=s.favorites.length;
  const item=document.createElement("li");
  item.innerHTML="<span>"+safe(kind==="clear"?"清屏过关":"触线失败")+"</span><span>"+safe(choice?.label||"待确认")+(s.favorites.length?" · ★"+s.favorites.length:"")+"</span>";
  ul.appendChild(item);
 }
 document.getElementById("done").textContent=total;
 document.getElementById("favorites").textContent=marks;
 document.getElementById("meter-fill").style.width=(total/2*100)+"%";
}
function render(){
 HOST.replaceChildren();
 for(const kind of IDS){
  const group=D.groups[kind],section=document.createElement("section");section.className="category";section.id="g-"+kind;
  const top=document.createElement("div");top.className="category-head";
  top.innerHTML='<div><h2>'+safe(kind==="clear"?"01 · 清屏过关":"02 · 触线失败")+'</h2><p>'+safe(group.summary)+'</p></div><span class="range">'+(kind==="clear"?"0.52–0.70秒":"0.33–0.55秒")+'</span>';
  section.appendChild(top);
  const warning=document.createElement("div");warning.className="warning";
  warning.textContent=kind==="clear"?"V6反馈：之前的成功音乐太长，节奏衔接不上；这组全做短促上扬结尾。":"V6反馈：失败音乐太长且风格不匹配；这组全部是短促、轻柔的结束音。";
  section.appendChild(warning);
  const opts=document.createElement("div");opts.className="options";opts.id="choices-"+kind;
  for(const variant of group.variants){
   const row=document.createElement("div");row.className="item"+(state.groups[kind].choice===variant.id?" selected":"");
   const header=document.createElement("div");header.className="item-head";
   const radio=document.createElement("input");radio.type="radio";radio.name="select-"+kind;radio.id="radio-"+variant.id;radio.value=variant.id;radio.checked=state.groups[kind].choice===variant.id;radio.setAttribute("aria-label","选择"+variant.label);
   radio.addEventListener("change",()=>selection(kind,variant.id));
   const label=document.createElement("label");label.htmlFor=radio.id;label.className="item-title";label.textContent=variant.id.toUpperCase()+" · "+variant.label;
   header.append(radio,label);row.appendChild(header);
   const sub=document.createElement("div");sub.className="item-sub";sub.textContent=variant.texture+" · "+variant.duration.toFixed(2)+"秒 · "+variant.hits.length+"段短采样";row.appendChild(sub);
   const actions=document.createElement("div");actions.className="item-actions";
   const play=document.createElement("button");play.type="button";play.className="play";play.dataset.idleLabel="▶ 单次";play.textContent=play.dataset.idleLabel;
   play.addEventListener("click",()=>audition(kind,variant,false,play));
   const loop=document.createElement("button");loop.type="button";loop.className="play";loop.dataset.idleLabel="↻ 连播3秒";loop.textContent=loop.dataset.idleLabel;
   loop.addEventListener("click",()=>audition(kind,variant,true,loop));
   const fav=document.createElement("button");fav.type="button";fav.className="star"+(state.groups[kind].favorites.includes(variant.id)?" on":"");fav.setAttribute("aria-label","保留"+variant.label);
   fav.setAttribute("aria-pressed",String(state.groups[kind].favorites.includes(variant.id)));fav.textContent=state.groups[kind].favorites.includes(variant.id)?"★":"☆";
   fav.addEventListener("click",()=>toggleFavorite(kind,variant.id,fav));
   actions.append(play,loop,fav);row.appendChild(actions);opts.appendChild(row);
  }
  section.appendChild(opts);
  const area=document.createElement("label");area.className="note";area.textContent="这一组的试听意见";
  const input=document.createElement("textarea");input.placeholder="例如：偏喜欢C03的上扬感，但希望最后一下更有完成感…";input.value=state.groups[kind].notes;
  input.addEventListener("input",()=>{state.groups[kind].notes=input.value;save();});area.appendChild(input);
  section.appendChild(area);HOST.appendChild(section);
 }
 renderSummary();
}
function results(){
 return {project:"弹珠超载",version:"V7-extremely-short-sfx",date:new Date().toISOString(),
 context:"V6 clear and fail rejected due to long duration and incompatible style; five other V5 categories preserved.",
 options:IDS.map(kind=>{
  const g=D.groups[kind],s=state.groups[kind],choice=g.variants.find(v=>v.id===s.choice)||null;
  return {kind,eventName:g.name,status:choice?"selected":"pending",
   choiceId:choice?.id||null,choiceLabel:choice?.label||null,duration:choice?.duration||null,recipe:choice||null,
   favorites:s.favorites.map(id=>g.variants.find(v=>v.id===id)).filter(Boolean),notes:s.notes};
 }),sources:D.sources,notes:"Audio preview consists of Web Audio sample-layer recipes. Neither game code nor previous V5/V6 user selections have been changed."};
}
function md(){const r=results(),f=x=>String(x??"").replace(/\|/g,"/").replace(/[\r\n]+/g,"；");
 const out=["# 《弹珠超载》V7极短音效选型","","> "+r.date+" · 其他五类沿用V5","",
 "| 事件 | 首选 | 时长 | 收藏备用 | 状态 | 备注 |","|---|---|---|---|---|---|"];
 for(const o of r.options)out.push("| "+[f(o.eventName),f(o.choiceLabel||"待定"),o.duration?o.duration.toFixed(2)+"秒":"",f(o.favorites.map(v=>v.label).join("，")),f(o.status),f(o.notes)].join(" | ")+" |");
 out.push("","技术备注：V7为Kenney等CC0实物短采样的分层组合配方，正式游戏接入前应将选中配方导出WAV、自托管并做实际游戏混音验收。");
 return out.join("\n");
}
function download(name,data,type){
 const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);
}
function wavBytes(buffer){
 const channel=buffer.getChannelData(0),length=channel.length;
 const arr=new ArrayBuffer(44+length*2),d=new DataView(arr);
 function string(at,val){for(let i=0;i<val.length;i++)d.setUint8(at+i,val.charCodeAt(i));}
 string(0,"RIFF");d.setUint32(4,36+length*2,true);string(8,"WAVE");string(12,"fmt ");
 d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);
 d.setUint32(24,buffer.sampleRate,true);d.setUint32(28,buffer.sampleRate*2,true);
 d.setUint16(32,2,true);d.setUint16(34,16,true);string(36,"data");d.setUint32(40,length*2,true);
 for(let i=0;i<length;i++){const v=Math.max(-1,Math.min(1,channel[i]));d.setInt16(44+i*2,Math.round(v<0?v*32768:v*32767),true);}
 return arr;
}
async function saveWav(kind,variant){
 const a=ensureAudio();
 if(!window.OfflineAudioContext)throw Error("浏览器不支持离线渲染WAV");
 const samples=await material(variant),rate=44100,seconds=variant.duration+.015;
 const offline=new OfflineAudioContext(1,Math.ceil(seconds*rate),rate);
 const bus=createBus(offline,state.volume);
 scheduleVariant(offline,bus,variant,samples,.005,null);
 const buffer=await offline.startRendering();
 download("pinball-V7-"+kind+"-"+variant.id+"-"+Math.round(variant.duration*1000)+"ms.wav",wavBytes(buffer),"audio/wav");
}
document.getElementById("stop").addEventListener("click",stop);
document.getElementById("volume").value=state.volume;
document.getElementById("vol-val").textContent=state.volume+"%";
document.getElementById("volume").addEventListener("input",e=>{
 state.volume=Number(e.target.value);save();if(mix)mix.gain.value=(state.volume/100)*.8;
 document.getElementById("vol-val").textContent=state.volume+"%";
});
document.getElementById("export-json").addEventListener("click",()=>{download("pinball-V7-short-SFX.json",JSON.stringify(results(),null,2),"application/json;charset=utf-8");status("JSON已导出");});
document.getElementById("export-md").addEventListener("click",()=>{download("pinball-V7-short-SFX.md",md(),"text/markdown;charset=utf-8");status("Markdown已导出");});
document.getElementById("copy").addEventListener("click",async()=>{
 try{await navigator.clipboard.writeText(md());status("已复制反馈");}catch(e){download("pinball-V7-short-SFX.md",md(),"text/markdown;charset=utf-8");status("已改为下载文件");}
});
document.getElementById("export-wav").addEventListener("click",async()=>{
 const selected=IDS.map(id=>[id,D.groups[id].variants.find(v=>v.id===state.groups[id].choice)]).filter(x=>x[1]);
 if(!selected.length){status("先选择一组音效，才能导出对应WAV");return;}
 status("正在从原始音频采样生成选中WAV…");
 try{for(const [kind,variant]of selected)await saveWav(kind,variant);status("已尝试导出"+selected.length+"个WAV文件；浏览器可能要求允许多个下载");}
 catch(e){status("WAV渲染未成功："+e.message);}
});
document.getElementById("reset").addEventListener("click",()=>{
 if(!confirm("确定清空V7两组选择及收藏？不会删除V5/V6历史记录。"))return;
 state=initial();save();render();status("V7已清空，旧记录保留");
});
window.__pinballV7Review={getResults:results,groups:IDS.map(id=>({id,count:D.groups[id].variants.length,durations:D.groups[id].variants.map(v=>v.duration)}))};
window.addEventListener("pagehide",stop);
render();
})();