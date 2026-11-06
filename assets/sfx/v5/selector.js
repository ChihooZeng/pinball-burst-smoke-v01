/* 弹珠超载 V5: standalone manual audio chooser. Seven SFX categories, 30 real audio samples each.
   No game logic. Per-category choices and shortlist are local-only and exportable. */
(() => {
"use strict";
const v4=window.PINBALL_SFX_V4;
const ex=window.PINBALL_AUDIO_EXTRA;
const more=window.PINBALL_SFX_V5_MORE;
const ORDER=["mg","hit","break","boom","clear","fail","upgrade"];
const DESCRIPTION={
mg:"短促、干脆、稳定的射击节奏；重点比较连续高频播放时是否刺耳或形成噪声。",
hit:"“咚咚咚”的实体打点，要有重量但不能闷到手机听不见。",
break:"重点重选：像真实玻璃、木板或石块碎裂，不要电子合成感。",
boom:"清脆有爆发但不能厚重轰炸；重点确认爆雷接力时仍然舒服。",
clear:"需要完整的胜利结束感，不只是短提示音，建议以完整旋律结尾。",
fail:"明确表达失败；不要与普通砖块撞击、爆雷混淆。",
upgrade:"明确的成长奖励，与清屏过关的声纹和节奏应有所区分。"
};
const FEEDBACK={
mg:"V4：01木质轻敲是首选，01/02/03都可以，先保留。这里已经默认收藏这3项。",
hit:"V4：已选02木板闷响。继续找带“咚咚”质感、柔和而有力度的声音。",
break:"V4仍未选定；此前反馈“偏电子化”。这里仅保留物理撞击/破裂方向供挑选。",
boom:"V4：已选03硬脆爆裂，原先厚重低频效果被否定；请多用连续播放比较。",
clear:"V4：已选10上升完成，但它与升级使用了同一段Rise03；最终需要辨别两种结果。",
fail:"V4仍未选定。重点寻找和“死亡惩罚”不一样、轻而明确的结束反馈。",
upgrade:"V4：已选03短上扬音（Rise03），与过关相同；最好找到专属的升级短句。"
};
const SEED={
 mg:{choice:"mg-01",saved:["mg-01","mg-02","mg-03"],notes:"01、02、03 都可以，先保留。"},
 hit:{choice:"hit-02",saved:["hit-02"],notes:""},
 break:{choice:null,saved:[],notes:""},
 boom:{choice:"boom-03",saved:["boom-03"],notes:""},
 clear:{choice:"clear-10",saved:["clear-10"],notes:""},
 fail:{choice:null,saved:[],notes:""},
 upgrade:{choice:"upgrade-03",saved:["upgrade-03"],notes:""}
};
const SELFHOST={
"mg-01":"../selected-v4/impact-sounds/impactWood_light_000.ogg",
"mg-02":"../selected-v4/impact-sounds/impactTin_medium_002.ogg",
"mg-03":"../selected-v4/impact-sounds/impactGeneric_light_000.ogg",
"hit-02":"../selected-v4/impact-sounds/impactWood_medium_001.ogg",
"boom-03":"../selected-v4/impact-sounds/impactGlass_heavy_002.ogg",
"clear-10":"../selected-v4/oga-levelup-powerup/Rise03.wav",
"upgrade-03":"../selected-v4/oga-levelup-powerup/Rise03.wav"
};
const NAV=document.getElementById("nav"),ROWS=document.getElementById("rows");
function tell(str){document.getElementById("status").textContent=str;}
if(!v4||!ex||!more){document.getElementById("category-name").textContent="目录加载失败";tell("请检查三个素材目录JS是否存在");return;}
const GROUPS=ORDER.map(id=>{
const g=v4.groups.find(g=>g.id===id);if(!g)throw Error("缺失："+id);
const a=g.candidates.map((i,k)=>({...i,id:i.id,position:k+1,origin:"原选10"}));
const b=(ex[id]||[]).map((i,k)=>({...i,position:k+11,origin:"扩展11–20"}));
const c=(more[id]||[]).map((i,k)=>({...i,position:k+21,origin:"新增21–30"}));
const samples=a.concat(b,c);
if(samples.length!==30||new Set(samples.map(x=>x.url)).size!==30||new Set(samples.map(x=>x.id)).size!==30)
 throw Error("音效目录不是30个不重复的候选："+id);
return {id,name:g.name,description:DESCRIPTION[id],feedback:FEEDBACK[id],samples};
});
const GROUPBY=Object.fromEntries(GROUPS.map(g=>[g.id,g]));
const KEY="pinball-overload-audio-selector-v5";
const initial=()=>({version:"v5",events:Object.fromEntries(GROUPS.map(g=>[g.id,{choice:SEED[g.id].choice,saved:[...SEED[g.id].saved],notes:SEED[g.id].notes,heard:[]}]))});
let state=initial();
try{
const saved=JSON.parse(localStorage.getItem(KEY)||"null");
if(saved?.events){
 GROUPS.forEach(g=>{
 const a=saved.events[g.id];if(!a)return;
 const allowed=new Set(g.samples.map(s=>s.id));
 const dest=state.events[g.id];
 if(a.choice===null||allowed.has(a.choice))dest.choice=a.choice;
 if(Array.isArray(a.saved))dest.saved=[...new Set(a.saved.filter(id=>allowed.has(id)))];
 if(typeof a.notes==="string")dest.notes=a.notes.slice(0,5000);
 if(Array.isArray(a.heard))dest.heard=[...new Set(a.heard.filter(id=>allowed.has(id)))];
 });
}
}catch(_){}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){tell("保存到浏览器失败，请导出JSON");}}
let current="break",filter="all",volume=.68;
function xss(s){return String(s).replace(/[&<>"']/g,k=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[k]));}
function choiceLabel(g){
 const id=state.events[g.id].choice;
 return id ? (g.samples.find(x=>x.id===id)?.label||id) : "待确认";
}
function renderNav(){
 NAV.querySelectorAll(".event-nav").forEach(e=>e.remove());
 GROUPS.forEach((g,i)=>{
  const b=document.createElement("button");b.type="button";b.className="event-nav"+(current===g.id?" active":"");
  b.setAttribute("aria-current",current===g.id?"true":"false");
  b.innerHTML='<span class="nav-number">'+String(i+1).padStart(2,"0")+'</span><span class="nav-title">'+xss(g.name)+'</span><span class="nav-status">'+(state.events[g.id].choice?"已选":"待定")+'</span>';
  b.addEventListener("click",()=>{current=g.id;filter="all";render();});
  NAV.appendChild(b);
 });
}
function renderSummary(){
 let decided=0,totalSaved=0;
 const sum=document.getElementById("summary");sum.replaceChildren();
 GROUPS.forEach(g=>{
 const s=state.events[g.id],li=document.createElement("li");
 if(s.choice)decided++;totalSaved+=s.saved.length;
 li.innerHTML='<span>'+xss(g.name)+'</span><span>'+xss(choiceLabel(g))+(s.saved.length?" · ☆"+s.saved.length:"")+'</span>';
 sum.appendChild(li);
 });
 document.getElementById("done").textContent=decided;
 document.getElementById("kept").textContent=totalSaved;
 document.getElementById("fill").style.width=(decided/GROUPS.length*100).toFixed(1)+"%";
}
function displayItems(g){
 const s=state.events[g.id];
 if(filter==="old")return g.samples.filter(x=>x.position<=10);
 if(filter==="new")return g.samples.filter(x=>x.position>10);
 if(filter==="saved")return g.samples.filter(x=>s.saved.includes(x.id));
 return g.samples;
}
function choose(g,id){
 const st=state.events[g.id];st.choice=id;persist();
 renderNav();renderSummary();renderRows();
 tell("已设为首选："+g.name+" → "+(g.samples.find(x=>x.id===id)?.label||"待定"));
}
function saveFav(g,id){
 const st=state.events[g.id],s=new Set(st.saved);
 if(s.has(id))s.delete(id);else s.add(id);
 st.saved=[...s];persist();renderSummary();renderRows();
 tell((s.has(id)?"已保留备用：":"已取消保留：")+(g.samples.find(x=>x.id===id)?.label||id));
}
function markHeard(g,id){
 const heard=state.events[g.id].heard;
 if(!heard.includes(id))heard.push(id);
 persist();renderCount(g);
}
function renderCount(g){
 document.getElementById("group-count").textContent="30个备选 · 已听"+state.events[g.id].heard.length+"/30";
}
function renderRows(){
 const g=GROUPBY[current],st=state.events[g.id];ROWS.replaceChildren();
 const candidates=displayItems(g);
 if(!candidates.length){const empty=document.createElement("div");empty.className="no-results";empty.textContent="这组还没有收藏的音效。可以切回「全部30」继续挑选。";ROWS.appendChild(empty);return;}
 let previous="";
 candidates.forEach(item=>{
  if(item.origin!==previous){
   const head=document.createElement("div");head.className="group-head";
   head.textContent=item.origin+(item.origin==="原选10"?" · V4试听源":item.origin==="扩展11–20"?" · 旧实验室素材":" · V5新扩展");
   ROWS.appendChild(head);previous=item.origin;
  }
  const row=document.createElement("div");row.className="option"+(st.choice===item.id?" selected":"");
  const radio=document.createElement("input");radio.type="radio";radio.name="v5-"+g.id;radio.id="choose-"+item.id;radio.checked=st.choice===item.id;radio.setAttribute("aria-label","选用 "+item.label);
  radio.addEventListener("change",()=>choose(g,item.id));
  row.appendChild(radio);
  const label=document.createElement("label");label.className="opt-label";label.htmlFor=radio.id;
  const clean=item.label.replace(/^\s*\d{1,2}(?:\s*·\s*|\s+)/,"");
  label.innerHTML='<div class="opt-title"><span style="color:#77aebd">#'+String(item.position).padStart(2,"0")+'</span> · '+xss(clean)+(SELFHOST[item.id]?'<span class="opt-chip">★ 本地归档</span>':'')+'</div>'+
  '<div class="opt-meta">'+xss(item.original||clean)+' · '+(Number(item.seconds||item.duration||0)).toFixed(2)+'秒 · '+xss(item.sourcePack||"来源待核对")+
  (st.heard.includes(item.id)?" · 已试听":"")+'</div>';
  row.appendChild(label);
  const acts=document.createElement("div");acts.className="audio-actions";
  const single=document.createElement("button");single.type="button";single.className="play";single.dataset.normalLabel="▶ 单次";single.textContent=single.dataset.normalLabel;
  single.setAttribute("aria-label","单次试听 "+clean);single.addEventListener("click",()=>preview(g,item,false,single));
  const repeat=document.createElement("button");repeat.type="button";repeat.className="play";repeat.dataset.normalLabel="↻ 连续3秒";repeat.textContent=repeat.dataset.normalLabel;
  repeat.setAttribute("aria-label","连续3秒试听 "+clean);repeat.addEventListener("click",()=>preview(g,item,true,repeat));
  const fav=document.createElement("button");fav.type="button";fav.className="favorite"+(st.saved.includes(item.id)?" on":"");
  fav.textContent=st.saved.includes(item.id)?"★":"☆";fav.title="收藏为备用，可同时收藏多条";fav.setAttribute("aria-pressed",String(st.saved.includes(item.id)));
  fav.setAttribute("aria-label",(st.saved.includes(item.id)?"取消保留 ":"保留 ")+clean);
  fav.addEventListener("click",()=>saveFav(g,item.id));
  acts.append(single,repeat,fav);row.appendChild(acts);ROWS.appendChild(row);
 });
}
function render(){
 renderNav();const g=GROUPBY[current];
 document.getElementById("category-name").textContent=g.name;
 document.getElementById("category-hint").textContent=g.description;
 document.getElementById("review-note").textContent=g.feedback;
 document.getElementById("notes").value=state.events[current].notes;
 document.querySelectorAll("#filter button").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter));
 renderCount(g);renderRows();renderSummary();
}
const ctxBox={audio:null,master:null,comp:null,cache:new Map(),active:[],token:0,timeouts:[]};
function getAudio(){
 if(!ctxBox.audio){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)throw Error("浏览器不支持Web Audio");
  const a=new AC(),g=a.createGain(),c=a.createDynamicsCompressor();
  c.threshold.value=-16;c.knee.value=16;c.ratio.value=5;c.attack.value=.002;c.release.value=.17;
  g.gain.value=volume*.82;g.connect(c);c.connect(a.destination);
  ctxBox.audio=a;ctxBox.master=g;ctxBox.comp=c;
 }
 if(ctxBox.audio.state==="suspended")ctxBox.audio.resume().catch(()=>{});
 return ctxBox.audio;
}
function asset(item){return SELFHOST[item.id]||item.url;}
async function decode(item){
 const url=asset(item);
 if(!ctxBox.cache.has(url)){
  const promise=(async()=>{
   const a=getAudio(),res=await fetch(url,{mode:"cors",cache:"force-cache"});
   if(!res.ok)throw Error("HTTP "+res.status);
   const buffer=await a.decodeAudioData(await res.arrayBuffer());
   let sum=0,peak=0,n=0;
   for(let ch=0;ch<buffer.numberOfChannels;ch++){
     const pcm=buffer.getChannelData(ch),stride=Math.max(1,Math.ceil(pcm.length/28000));
     for(let i=0;i<pcm.length;i+=stride){const x=pcm[i];sum+=x*x;peak=Math.max(peak,Math.abs(x));n++;}
   }
   const rms=Math.sqrt(sum/Math.max(n,1));
   const adjustment=Math.max(.12,Math.min(2.2,.12/Math.max(.004,rms),.8/Math.max(.002,peak)));
   return {buffer,adjustment};
  })();
  ctxBox.cache.set(url,promise);
  promise.catch(()=>ctxBox.cache.delete(url));
  while(ctxBox.cache.size>40)ctxBox.cache.delete(ctxBox.cache.keys().next().value);
 }
 return ctxBox.cache.get(url);
}
function stop(){
 ctxBox.token++;
 ctxBox.active.forEach(x=>{try{x.stop?x.stop():x.pause();}catch(e){}});
 ctxBox.active=[];
 ctxBox.timeouts.forEach(clearTimeout);ctxBox.timeouts=[];
 document.querySelectorAll(".play.playing").forEach(b=>{b.classList.remove("playing");b.textContent=b.dataset.normalLabel||"▶ 单次";});
}
function pulse(buffer,at,gainValue,endAt){
 const a=getAudio(),src=a.createBufferSource(),gain=a.createGain();src.buffer=buffer;
 gain.gain.setValueAtTime(gainValue,at);src.connect(gain);gain.connect(ctxBox.master);
 src.start(at);
 if(endAt&&at+buffer.duration>endAt){
  const t=Math.max(at+.03,endAt);
  gain.gain.setValueAtTime(gainValue,Math.max(at,t-.04));
  gain.gain.linearRampToValueAtTime(.0001,t);src.stop(t);
 }
 ctxBox.active.push(src);
 src.onended=()=>{const i=ctxBox.active.indexOf(src);if(i>=0)ctxBox.active.splice(i,1);src.disconnect();gain.disconnect();};
}
function schedule(delay,fn){const t=setTimeout(fn,delay);ctxBox.timeouts.push(t);}
function intervals(id,duration){
 const steps={mg:.08,hit:.16,break:.27,boom:.5};
 if(id in steps)return steps[id];
 return Math.max(({clear:1.3,fail:.9,upgrade:.85})[id]||.4,duration+.13);
}
function fallback(item,repeat,g,token){
 const sec=Number(item.seconds||item.duration||.3);
 const step=intervals(g.id,sec),count=repeat?Math.max(1,Math.floor(2.97/step)+1):1;
 for(let i=0;i<count;i++)schedule(i*step*1000,()=>{
  if(token!==ctxBox.token)return;
  const audio=new Audio(asset(item));
  audio.volume=Math.min(.6,volume*.42/Math.sqrt(Math.max(1,Math.ceil(sec/step))));
  ctxBox.active.push(audio);
  audio.play().catch(()=>tell("外链音频播放失败："+item.original));
 });
 if(repeat)schedule(3100,()=>{if(token===ctxBox.token)stop();});
}
async function preview(g,item,repeat,btn){
 stop();const token=ctxBox.token;btn.classList.add("playing");btn.textContent="载入中…";
 try{
 const a=getAudio(),decoded=await decode(item);
 if(token!==ctxBox.token)return;
 markHeard(g,item.id);btn.textContent=repeat?"正在连续播放":"正在播放";
 const step=intervals(g.id,decoded.buffer.duration);
 const count=repeat?Math.max(1,Math.min(40,Math.floor(2.98/step)+1)):1;
 const overlap=Math.max(1,Math.ceil(decoded.buffer.duration/step));
 const boost=Math.min(.7,decoded.adjustment*(repeat?Math.min(.8,1/Math.sqrt(overlap)):1));
 const start=a.currentTime+.03,endAt=repeat?start+3:null;
 for(let i=0;i<count;i++)pulse(decoded.buffer,start+i*step,boost,endAt);
 const time=repeat?3100:Math.min(5200,decoded.buffer.duration*1000+130);
 schedule(time,()=>{if(token===ctxBox.token){btn.classList.remove("playing");btn.textContent=btn.dataset.normalLabel; if(repeat)stop();}});
 tell((repeat?"连续3秒：":"单次试听：")+g.name+" · "+item.original);
 }catch(e){
 if(token!==ctxBox.token)return;
 markHeard(g,item.id);btn.textContent="尝试备用播放";
 tell("Web Audio加载失败，尝试普通播放（音量无法严格对齐）");
 fallback(item,repeat,g,token);
 schedule(repeat?3200:1900,()=>{if(token===ctxBox.token){btn.textContent=btn.dataset.normalLabel;btn.classList.remove("playing");}});
 }
}
document.getElementById("stop").addEventListener("click",stop);
const volumeInput=document.getElementById("volume");
volumeInput.addEventListener("input",()=>{
 volume=Number(volumeInput.value)/100;
 document.getElementById("volume-value").textContent=volumeInput.value+"%";
 if(ctxBox.master)ctxBox.master.gain.value=volume*.82;
});
document.getElementById("filter").addEventListener("click",e=>{
 const b=e.target.closest("button[data-filter]");
 if(!b)return;filter=b.dataset.filter;render();
});
document.getElementById("notes").addEventListener("input",e=>{
 state.events[current].notes=e.target.value;persist();
});
function selectionPayload(){
 return {project:"弹珠超载",version:"V5-standalone-seven-audio-classes",exportedAt:new Date().toISOString(),audioTypes:7,candidatesPerType:30,
 events:GROUPS.map(g=>{
  const s=state.events[g.id],chosen=g.samples.find(x=>x.id===s.choice)||null;
  return {id:g.id,name:g.name,status:chosen?"selected":"pending",choiceId:chosen?.id||null,choiceLabel:chosen?.label||null,
  audioFile:chosen?asset(chosen):null,originUrl:chosen?.url||null,kept:s.saved.map(id=>{const item=g.samples.find(x=>x.id===id);return item?{id,label:item.label,audioFile:asset(item),originUrl:item.url}:null}).filter(Boolean),
  notes:s.notes,heardCount:s.heard.length};
 })};
}
function toMd(p){
 const safe=x=>String(x??"").replace(/\|/g,"/").replace(/[\r\n]+/g,"；");
 const lines=["# 《弹珠超载》音效独立选型 V5","","> 导出："+p.exportedAt+" · 7类×30候选 · 仅人工选型，未接入正式游戏","",
 "| 音效事件 | 首选 | 首选文件 | 保留备用 | 状态 | 备注 |","|---|---|---|---|---|---|"];
 p.events.forEach(e=>lines.push("| "+[safe(e.name),safe(e.choiceLabel||"待定"),safe(e.audioFile),safe(e.kept.map(k=>k.label+" ("+k.id+")").join("，")),safe(e.status),safe(e.notes)].join(" | ")+" |"));
 lines.push("","## 接入限制","",
 "- 尚未确认的音效不得自动填补；原V4对照需保留。",
 "- 任何外链源音频在正式游戏发布前都需保存到本仓库并复核许可证。",
 "- V5不再单设装甲砖命中、砖块开花、植雷声音；这些原V4已选文件仍保留在旧归档。",
 "- 清屏和升级若仍选择同一文件，正式上线前应验证两种反馈是否需要听感区别。");
 return lines.join("\n");
}
function download(name,content,mime){
 const url=URL.createObjectURL(new Blob([content],{type:mime}));
 const link=document.createElement("a");link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
 schedule(1200,()=>URL.revokeObjectURL(url));
}
document.getElementById("export-json").addEventListener("click",()=>{download("pinball-audio-v5-selected.json",JSON.stringify(selectionPayload(),null,2),"application/json;charset=utf-8");tell("V5 JSON 已导出");});
document.getElementById("export-md").addEventListener("click",()=>{download("pinball-audio-v5-selected.md",toMd(selectionPayload()),"text/markdown;charset=utf-8");tell("V5 Markdown 已导出");});
document.getElementById("copy").addEventListener("click",async()=>{
 const md=toMd(selectionPayload());
 try{await navigator.clipboard.writeText(md);tell("已复制，可直接贴给我审核");}
 catch(e){download("pinball-audio-v5-selected.md",md,"text/markdown;charset=utf-8");tell("复制不可用，已下载文件");}
});
document.getElementById("reset").addEventListener("click",()=>{
 if(!confirm("确认恢复到V4保存的人工选型？V5新增选择、收藏和备注会被覆盖。"))return;
 state=initial();persist();render();tell("已恢复V4人工选择");
});
document.getElementById("import-json").addEventListener("change",async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  const parsed=JSON.parse(await file.text()),records=parsed.events||parsed.decisions||parsed.selection||parsed.groups;
  if(!Array.isArray(records))throw Error("没有可识别的音效事件数组");
  let changed=0;
  records.forEach(record=>{
   const id=record.id||record.eventId||record.event;
   const g=GROUPBY[id];if(!g)return;
   const local=state.events[id],allowed=new Set(g.samples.map(x=>x.id));
   const val=record.choiceId||record.selectedId||record.choice||null;
   if(val&&allowed.has(val)){local.choice=val;changed++;}
   else if(record.status==="needs_new_asset"||record.status==="pending")local.choice=null;
   if(Array.isArray(record.kept))local.saved=[...new Set(record.kept.map(x=>typeof x==="string"?x:x.id).filter(id=>allowed.has(id)))];
   if(typeof record.notes==="string")local.notes=record.notes.slice(0,5000);
  });
  persist();render();tell("已导入："+changed+"组有效首选，其余保持当前选择");
 }catch(err){tell("导入失败："+err.message);}
 e.target.value="";
});
window.addEventListener("pagehide",stop);
window.__pinballV5Review={getSummary:()=>selectionPayload(),groups:GROUPS.map(g=>({id:g.id,count:g.samples.length})),getSelected:()=>current};
render();
})();