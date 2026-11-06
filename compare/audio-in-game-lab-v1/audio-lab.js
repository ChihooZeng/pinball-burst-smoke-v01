/* 《弹珠超载》真实游戏音效实验室。只用于独立compare版本。
   10种事件 × 20个CC0候选；真实事件实时选型、技能重开R1、A/B、声音组音量/静音、JSON导出。 */
(function(){
"use strict";
const V4=window.PINBALL_SFX_V4,EX=window.PINBALL_AUDIO_EXTRA;
if(!V4||!EX||V4.groups.length!==10){document.getElementById("al-status").textContent="加载音效目录失败";return;}
const GROUPS=V4.groups.map(g=>({...g,all:g.candidates.concat(EX[g.id]||[])}));
if(GROUPS.some(g=>g.all.length!==20||new Set(g.all.map(x=>x.url)).size!==20))throw Error("Each sound group must have 20 unique audio files");
const MAP=new Map(GROUPS.map(g=>[g.id,g]));
const KEY="pinball-real-game-audio-lab-v1",PREFS={
mg:"mg-01",hit:"hit-02",break:"original",armor:"original",bloom:"bloom-05",
plant:"plant-02",boom:"boom-03",clear:"clear-10",fail:"original",upgrade:"upgrade-03"};
const LEVELS={mg:.34,hit:.45,break:.6,armor:.45,bloom:.55,plant:.22,boom:.46,clear:.8,fail:.66,upgrade:.65};
const SELFHOST={
"mg-01":"../../assets/sfx/selected-v4/impact-sounds/impactWood_light_000.ogg",
"mg-02":"../../assets/sfx/selected-v4/impact-sounds/impactTin_medium_002.ogg",
"mg-03":"../../assets/sfx/selected-v4/impact-sounds/impactGeneric_light_000.ogg",
"hit-02":"../../assets/sfx/selected-v4/impact-sounds/impactWood_medium_001.ogg",
"bloom-05":"../../assets/sfx/selected-v4/oga-rpg-pack/RPG Sound Pack/NPC/slime/slime1.wav",
"plant-02":"../../assets/sfx/selected-v4/interface-sounds/drop_002.ogg",
"boom-03":"../../assets/sfx/selected-v4/impact-sounds/impactGlass_heavy_002.ogg",
"clear-10":"../../assets/sfx/selected-v4/oga-levelup-powerup/Rise03.wav",
"upgrade-03":"../../assets/sfx/selected-v4/oga-levelup-powerup/Rise03.wav"
};
const defaults=()=>({mode:"B",master:.7,field:"R1",skill:"none",groups:Object.fromEntries(GROUPS.map(g=>[g.id,{chosen:PREFS[g.id],volume:LEVELS[g.id],muted:false}]))});
let config=defaults();
try{const old=JSON.parse(localStorage.getItem(KEY)||"null");if(old&&old.groups){
 if(old.mode==="A"||old.mode==="B")config.mode=old.mode;
 if(Number.isFinite(old.master))config.master=Math.min(1,Math.max(0,old.master));
 if(["C","R1","R2"].includes(old.field))config.field=old.field;
 if(["none","S1","M1","M2","S8","C1"].includes(old.skill))config.skill=old.skill;
 GROUPS.forEach(g=>{const v=old.groups[g.id];if(!v)return;const c=config.groups[g.id];
 if(v.chosen==="original"||g.all.some(x=>x.id===v.chosen))c.chosen=v.chosen;
 if(Number.isFinite(v.volume))c.volume=Math.min(1.2,Math.max(0,+v.volume));
 if(typeof v.muted==="boolean")c.muted=v.muted;});
}}catch(_){}
function store(){try{localStorage.setItem(KEY,JSON.stringify(config));}catch(_){status("本地存储不可用，请导出配置");}}
function status(t){const el=document.getElementById("al-status");if(el)el.textContent=t;}
let audioCtx=null,mix=null,limiter=null,cache=new Map(),voices=[],lastPlay={},counts={},currentSkill=null,previewTokens=0;
function context(){
 if(!audioCtx){const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;
 audioCtx=new A();mix=audioCtx.createGain();limiter=audioCtx.createDynamicsCompressor();
 limiter.threshold.value=-12;limiter.knee.value=18;limiter.ratio.value=5;
 limiter.attack.value=.003;limiter.release.value=.16;
 mix.connect(limiter);limiter.connect(audioCtx.destination);mix.gain.value=config.master*.86;}
 if(audioCtx.state!=="running")audioCtx.resume().catch(()=>{});
 return audioCtx;
}
function audioFile(item){return SELFHOST[item.id]||item.url;}
function getChoice(id){const g=MAP.get(id);if(!g)return null;return g.all.find(c=>c.id===config.groups[id].chosen)||null;}
function bufferFor(item){
 const c=context();if(!c)return Promise.reject(new Error("浏览器不支持Web Audio"));
 const url=audioFile(item);
 if(cache.has(url))return cache.get(url);
 const promise=fetch(url,{mode:"cors"}).then(r=>{if(!r.ok)throw Error("音效HTTP "+r.status);return r.arrayBuffer();}).then(bytes=>c.decodeAudioData(bytes.slice(0))).then(buffer=>{
 let sum=0,n=0,peak=0;
 for(let c=0;c<buffer.numberOfChannels;c++){
 const arr=buffer.getChannelData(c),stride=Math.max(1,Math.floor(arr.length/22000));
 for(let i=0;i<arr.length;i+=stride){const v=arr[i];sum+=v*v;peak=Math.max(peak,Math.abs(v));n++;}
 }
 const rms=Math.sqrt(sum/Math.max(n,1));
 const level=Math.min(2.2,Math.max(.2,Math.min(.12/Math.max(rms,.004),.82/Math.max(peak,.004))));
 return {buffer,url,level};
 });
 cache.set(url,promise);promise.catch(()=>cache.delete(url));
 if(cache.size>45){const first=cache.keys().next().value;if(first!==url)cache.delete(first);}
 return promise;
}
function warm(id){const item=getChoice(id);if(item)bufferFor(item).catch(()=>{status(id+" 音效加载失败，可能是网络阻断，请换候选");});}
function warmSelected(){GROUPS.forEach(g=>warm(g.id));}
function playBuffer(buffer,category,at,volumeFactor,hardEnd,playbackRate){
 if(!audioCtx||voices.length>=18)return;
 const src=audioCtx.createBufferSource(),g=audioCtx.createGain();
 src.buffer=buffer;src.playbackRate.value=playbackRate||1;
 const groupLevel=config.groups[category]?.volume??.6;
 const factor=Math.max(0,Math.min(.75,groupLevel*.56*volumeFactor));
 g.gain.setValueAtTime(factor,at);
 src.connect(g);g.connect(mix);
 src.start(at);
 if(hardEnd&&at+buffer.duration/(playbackRate||1)>hardEnd){
  const end=Math.max(at+.025,hardEnd);
  g.gain.setValueAtTime(factor,Math.max(at,end-.045));
  g.gain.linearRampToValueAtTime(.0001,end);
  src.stop(end);
 }
 voices.push(src);
 src.onended=()=>{const i=voices.indexOf(src);if(i>=0)voices.splice(i,1);try{src.disconnect();g.disconnect();}catch(_){}};
}
function own(id){return config.mode==="B"&&!!config.groups[id]&&(config.groups[id].muted||config.groups[id].chosen!=="original");}
function emit(id,{force=false}={}){
 if(!MAP.has(id))return false;
 if(!force){counts[id]=(counts[id]||0)+1;if((counts[id]&3)===0||counts[id]===1)refreshCount(id);}
 if(!force&&config.mode!=="B")return false;
 const setting=config.groups[id];
 if(!setting||setting.muted||setting.chosen==="original"||config.master<=0)return !!setting?.muted;
 const item=getChoice(id);if(!item)return false;
 const now=performance.now(),delays={mg:65,hit:45,break:40,armor:80,bloom:125,plant:110,boom:120,clear:500,fail:500,upgrade:300};
 if(!force&&now-(lastPlay[id]||-9999)<delays[id])return true;
 lastPlay[id]=now;
 const issuedAt=now;
 const c=context();if(!c)return false;
 const url=audioFile(item);
 const alreadyCached=cache.has(url);
 bufferFor(item).then(({buffer,level})=>{
  // Drop delayed live events: downloading an asset must not play an old shot seconds later.
  if(!force&&performance.now()-issuedAt>240)return;
  if(!force&&(config.mode!=="B"||config.groups[id].chosen!==item.id||config.groups[id].muted))return;
  if(c.state!=="running")return;
  const n=["mg","hit","break","armor","plant","bloom","boom"].includes(id);
  const rate=n?(0.97+Math.random()*.06):1;
  playBuffer(buffer,id,c.currentTime+.012,(force?1:.8)*level,null,rate);
 }).catch(()=>{
   if(force)fallbackPreview(item);
   else if(!alreadyCached)status("无法加载 "+id+"，请检查网络或换已归档音效");
 });
 return true;
}
function fallbackPreview(item){try{const a=new Audio(audioFile(item));a.volume=Math.min(.5,config.master*.4);a.play().catch(()=>status("该素材不可播放："+item.original));}catch(e){status(String(e));}}
const legacyMap={armor:"armor",break:"break",upgrade:"upgrade"};
const API={
 active:true,
 get groupCount(){return GROUPS.length;},
 owns:own,
 routeLegacy(kind){
  const id=legacyMap[kind];if(!id||!own(id))return false;
  emit(id);return true;
 },
 emit,
 onRecord(type,data){
  const mapping={lab_mg_fire:"mg",lab_bomb_explode:"boom",lab_clear:"clear",lab_fail:"fail"};
  const category=mapping[type];
  if(category)emit(category);
  if(type==="lab_start"){currentSkill=data?.mode||"none";config.skill=currentSkill;config.field=data?.field||config.field;store();refreshSkill();}
 },
 setSelected(id,choice){if(!MAP.has(id))return false;if(choice!=="original"&&!MAP.get(id).all.some(x=>x.id===choice))return false;config.groups[id].chosen=choice;store();renderCurrent(id);warm(id);return true;},
 getState:()=>JSON.parse(JSON.stringify(config)),
 allCandidates:()=>GROUPS.map(g=>({id:g.id,count:g.all.length}))
};
window.PinballAudioLab=API;
// Only one decoding context, resumed from user gesture for iOS Safari policy.
document.addEventListener("pointerdown",()=>{context();},{capture:true,passive:true});
function esc(s){return String(s).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[t]));}
function refreshCount(id){const n=document.querySelector('[data-count="'+id+'"]');if(n)n.textContent=String(counts[id]||0)+"次";}
function renderCurrent(id){
 const g=MAP.get(id),select=document.querySelector('[data-select="'+id+'"]');
 if(!g||!select)return;
 select.value=config.groups[id].chosen;
 const info=document.querySelector('[data-info="'+id+'"]'),item=getChoice(id);
 if(info)info.textContent=item?("当前："+item.original+" · "+item.sourcePack+" · "+item.seconds.toFixed(2)+"s"+(SELFHOST[item.id]?" · 已归档本地素材":" · 外部CC0试听")):"当前：原版合成/该事件原本无声";
 const mute=document.querySelector('[data-mute="'+id+'"]');if(mute)mute.checked=config.groups[id].muted;
 const level=document.querySelector('[data-level="'+id+'"]');if(level)level.value=Math.round(config.groups[id].volume*100);
 const value=document.querySelector('[data-level-val="'+id+'"]');if(value)value.textContent=Math.round(config.groups[id].volume*100)+"%";
 const title=document.querySelector('[data-choice-name="'+id+'"]');if(title)title.textContent=config.groups[id].muted?"已静音":item?item.label:"原声/无声";
}
function preview(id,repeat,button){
 const item=getChoice(id);if(!item){status("请先为"+MAP.get(id).name+"选择一个新音效");return;}
 const token=++previewTokens;button.classList.add("pressed");button.textContent="载入中…";
 const c=context();if(!c){status("当前浏览器不支持音效");return;}
 bufferFor(item).then(({buffer,level})=>{
  if(token!==previewTokens)return;
  button.textContent=repeat?"连续播放中":"播放中";
  const step=({mg:.08,hit:.16,break:.24,armor:.28,bloom:.33,plant:.32,boom:.47})[id]||Math.max(.7,buffer.duration+.14);
  const count=repeat?Math.max(1,Math.min(38,Math.floor(2.85/step)+1)):1;
  const at=c.currentTime+.025;
  const overlaps=Math.max(1,Math.ceil(buffer.duration/step));
  const amp=repeat?Math.min(.85,1/Math.sqrt(overlaps)):1;
  for(let i=0;i<count;i++)playBuffer(buffer,id,at+i*step,amp*level,repeat?at+3:null,1);
  setTimeout(()=>{if(token===previewTokens){button.textContent=repeat?"↻ 连续3秒":"▶ 单次";button.classList.remove("pressed");}},repeat?3150:buffer.duration*1000+150);
 }).catch(()=>{button.classList.remove("pressed");button.textContent=repeat?"↻ 连续3秒":"▶ 单次";status("采样解码失败，已尝试普通播放");fallbackPreview(item);});
}
function renderGroups(){
 const root=document.getElementById("al-events");root.replaceChildren();
 for(const g of GROUPS){
  const id=g.id,detail=document.createElement("details");detail.className="al-event-group";
  if(["break","armor","boom"].includes(id))detail.open=true;
  detail.innerHTML='<summary><span>'+esc(g.name)+'</span><small data-choice-name="'+id+'"></small><b class="al-counter" data-count="'+id+'">0次</b></summary>';
  const content=document.createElement("div");content.className="al-inside";
  const select=document.createElement("select");select.setAttribute("data-select",id);select.setAttribute("aria-label",g.name+"声音候选");
  const original=document.createElement("option");original.value="original";original.textContent="A · 原始M2.5/该事件原本静音";select.appendChild(original);
  g.all.forEach((item,index)=>{
    const opt=document.createElement("option");opt.value=item.id;opt.textContent=String(index+1).padStart(2,"0")+" · "+item.label+(SELFHOST[item.id]?" ★":"");select.appendChild(opt);
  });
  select.addEventListener("change",()=>API.setSelected(id,select.value));content.appendChild(select);
  const buttons=document.createElement("div");buttons.className="al-test";
  const play=document.createElement("button");play.textContent="▶ 单次";play.addEventListener("click",()=>preview(id,false,play));
  const repeat=document.createElement("button");repeat.textContent="↻ 连续3秒";repeat.addEventListener("click",()=>preview(id,true,repeat));
  buttons.appendChild(play);buttons.appendChild(repeat);content.appendChild(buttons);
  const volrow=document.createElement("label");volrow.textContent="音量";
  const vol=document.createElement("input");vol.type="range";vol.min="0";vol.max="120";vol.step="5";vol.setAttribute("data-level",id);
  const value=document.createElement("span");value.setAttribute("data-level-val",id);
  vol.addEventListener("input",()=>{config.groups[id].volume=Number(vol.value)/100;value.textContent=vol.value+"%";store();});
  volrow.appendChild(vol);volrow.appendChild(value);content.appendChild(volrow);
  const muted=document.createElement("label");muted.style.marginTop="7px";
  const check=document.createElement("input");check.type="checkbox";check.setAttribute("data-mute",id);check.addEventListener("change",()=>{config.groups[id].muted=check.checked;store();renderCurrent(id);});
  muted.appendChild(check);muted.appendChild(document.createTextNode(" 单独静音此类事件"));content.appendChild(muted);
  const info=document.createElement("small");info.className="al-info";info.setAttribute("data-info",id);content.appendChild(info);
  detail.appendChild(content);root.appendChild(detail);renderCurrent(id);
 }
}
function refreshSkill(){
 document.querySelectorAll("#al-skills button").forEach(b=>{b.classList.toggle("selected",b.dataset.mode===config.skill);});
 document.getElementById("al-field").value=config.field;
 const el=document.getElementById("al-active");el.textContent="当前技能："+config.skill+" · 战场："+config.field+" · 音效 "+config.mode;
}
function renderSkills(){
 const modes=[["none","无技能"],["S1","S1 开花"],["M1","M1 机枪"],["M2","M2 扇形"],["S8","S8 爆雷"],["C1","C1 联动"]];
 const el=document.getElementById("al-skills");
 modes.forEach(([id,label])=>{
  const b=document.createElement("button");b.dataset.mode=id;b.textContent=label;
  b.addEventListener("click",()=>{
    const game=window.__pinballAudioGame;
    if(!game){status("游戏尚未加载，请检查源码");return;}
    if(!game.modes().includes(id)){status("该版本未包含技能："+id);return;}
    if(game.start(id,config.field)){config.skill=id;store();refreshSkill();warmSelected();status("已重开 R1 技能对照："+label);}
  });el.appendChild(b);
 });
 document.getElementById("al-field").addEventListener("change",e=>{config.field=e.target.value;store();refreshSkill();if(window.__pinballAudioGame?.isLabActive())window.__pinballAudioGame.start(config.skill,config.field);});
 refreshSkill();
}
function renderMode(){
 document.getElementById("al-original").classList.toggle("active",config.mode==="A");
 document.getElementById("al-custom").classList.toggle("active",config.mode==="B");
 refreshSkill();
}
document.getElementById("al-original").addEventListener("click",()=>{config.mode="A";store();renderMode();status("已切至原版合成音效 A");});
document.getElementById("al-custom").addEventListener("click",()=>{config.mode="B";store();renderMode();warmSelected();status("已切至自定义音效 B（实际游戏事件直接采用当前选项）");});
const master=document.getElementById("al-master");master.value=Math.round(config.master*100);document.getElementById("al-master-value").textContent=master.value+"%";
master.addEventListener("input",()=>{config.master=Number(master.value)/100;document.getElementById("al-master-value").textContent=master.value+"%";if(mix)mix.gain.value=config.master*.86;const gameVolume=document.getElementById("soundVolume");if(gameVolume){gameVolume.value=master.value;gameVolume.dispatchEvent(new Event("input",{bubbles:true}));}store();});
function exportSelection(){
 const exported={project:"弹珠超载",lab:"Audio-in-game R1 / skill + SFX",createdAt:new Date().toISOString(),mode:config.mode,master:config.master,skill:config.skill,field:config.field,groups:GROUPS.map(g=>({event:g.id,name:g.name,candidateCount:g.all.length,selectedId:config.groups[g.id].chosen,volume:config.groups[g.id].volume,muted:config.groups[g.id].muted,selectedFile:getChoice(g.id)?audioFile(getChoice(g.id)):"original/no-sound",sourceUrl:getChoice(g.id)?.url||null}))};
 const data=JSON.stringify(exported,null,2);
 const blob=new Blob([data],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="pinball-in-game-audio-lab-selection.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 status("导出了10组选择，包含每种技能和音效配置");
}
document.getElementById("al-export").addEventListener("click",exportSelection);
document.getElementById("al-reset").addEventListener("click",()=>{if(!confirm("恢复用户V4选出的7组音效，取消本页新调整？"))return;const old=defaults();config.groups=old.groups;config.mode=old.mode;store();renderGroups();renderMode();warmSelected();status("已恢复V4选择基线");});
document.getElementById("al-open").addEventListener("click",()=>{document.body.classList.add("al-show");warmSelected();});
document.getElementById("al-close").addEventListener("click",()=>document.body.classList.remove("al-show"));
renderGroups();renderSkills();renderMode();
const dataFromUI=Object.fromEntries(GROUPS.map(g=>[g.id,g.all.length]));
window.__pinballAudioLabInspect={groups:dataFromUI,selection:()=>JSON.parse(JSON.stringify(config)),lastPlay,counts,help:"AudioLab event audio is fetched on demand. Original game code is not overwritten."};
window.addEventListener("pagehide",()=>{voices.forEach(s=>{try{s.stop()}catch(_){}});voices=[];});
})();