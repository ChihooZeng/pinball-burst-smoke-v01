/* 《弹珠超载》V6：针对已拒绝的过关/失败音效重新人工筛选。原生Audio避免跨域WebAudio依赖。 */
(function(){
"use strict";
const DATA=window.PINBALL_SFX_V6_FOCUS;
const root=document.getElementById("groups");
if(!DATA||!DATA.groups?.clear||!DATA.groups?.fail){root.textContent="音效数据加载失败";return;}
const KEY="pinball-overload-audio-v6-focus-20261106";
const IDS=["clear","fail"];
const initial=()=>({clear:{choice:null,favorites:[],notes:"",heard:[]},fail:{choice:null,favorites:[],notes:"",heard:[]}});
let state=initial();
function matches(kind,val){return DATA.groups[kind].candidates.some(i=>i.id===val);}
try{
 const saved=JSON.parse(localStorage.getItem(KEY)||"null");
 if(saved?.clear&&saved?.fail){
   IDS.forEach(id=>{
    const s=saved[id];
    if(s.choice===null||matches(id,s.choice))state[id].choice=s.choice;
    if(Array.isArray(s.favorites))state[id].favorites=[...new Set(s.favorites.filter(c=>matches(id,c)))];
    if(Array.isArray(s.heard))state[id].heard=[...new Set(s.heard.filter(c=>matches(id,c)))];
    if(typeof s.notes==="string")state[id].notes=s.notes.slice(0,5000);
   });
 }
}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){msg("本地保存失败，请导出文件");}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function msg(s){document.getElementById("status").textContent=s;}
let activeAudio=null,stopTimeout=null,activeButton=null,token=0;
function stop(){
token++;
if(stopTimeout!==null){clearTimeout(stopTimeout);stopTimeout=null;}
if(activeAudio){try{activeAudio.pause();activeAudio.removeAttribute("src");activeAudio.load();}catch(e){}activeAudio=null;}
if(activeButton){activeButton.textContent=activeButton.dataset.idle||"▶ 试听";activeButton.classList.remove("playing");activeButton=null;}
}
function play(kind,item,mode,button){
stop();
const req=token;
const a=new Audio();
a.preload="auto";a.src=item.url;a.volume=.7;a.loop=mode==="repeat";
a.onplaying=()=>{
 if(req!==token)return;
 if(!state[kind].heard.includes(item.id)){state[kind].heard.push(item.id);save();}
 button.textContent=mode==="repeat"?"循环试听中":"整段播放中";
};
a.onerror=()=>{if(req===token){msg("音源加载失败。请点击该声音的「原出处」试听。");stop();}};
a.onended=()=>{if(req===token&&mode==="full")stop();};
activeAudio=a;activeButton=button;button.dataset.idle=mode==="repeat"?"↻ 连续3秒":"▶ 整段";
button.textContent="加载中…";button.classList.add("playing");
const p=a.play();
if(p?.catch)p.catch(()=>{if(req!==token)return;msg("浏览器没有播放这条外部音频，请使用「原出处」链接试听。");stop();});
if(mode==="repeat"){
 stopTimeout=setTimeout(()=>{if(req===token)stop();},3100);
}
}
function summarize(){
 let done=0,favs=0;const list=document.getElementById("summary");
 list.replaceChildren();
 IDS.forEach(kind=>{
 const g=DATA.groups[kind],s=state[kind];if(s.choice)done++;favs+=s.favorites.length;
 const c=g.candidates.find(c=>c.id===s.choice);
 const li=document.createElement("li");
 li.innerHTML="<span>"+escapeHtml(kind==="clear"?"清屏过关":"触线失败")+"</span><span>"+escapeHtml(c?.label||"尚未确认")+(s.favorites.length?" · ★"+s.favorites.length:"")+"</span>";
 list.appendChild(li);
 });
 document.getElementById("done").textContent=done;
 document.getElementById("favnum").textContent=favs;
 document.getElementById("fill").style.width=(done/2*100)+"%";
}
function rerender(){stop();root.replaceChildren();IDS.forEach(renderGroup);summarize();}
function renderGroup(kind){
 const g=DATA.groups[kind],stateGroup=state[kind];
 const section=document.createElement("section");section.className="category";section.id="category-"+kind;
 const title=document.createElement("div");title.className="cat-head";
 title.innerHTML='<div><h2>'+(kind==="clear"?"01":"02")+' · '+escapeHtml(g.title)+'</h2><p>'+escapeHtml(g.guidance)+'</p></div><span class="cat-tag">全新10项 · 原出处CC0</span>';
 section.appendChild(title);
 const notice=document.createElement("div");notice.className="notice";
 notice.innerHTML=kind==="clear"?
 '<strong>旧选择未通过：</strong> Rise03虽然在V5里显示已选，但备注明确指出没有成功的喜悦感。这组不预选任何声音。':
 '<strong>旧选择未通过：</strong> V5里已试听的失败声音整体不满意。本组从不同作者的短Game Over和失误提示重新筛选。';
 section.appendChild(notice);
 const list=document.createElement("div");list.className="list";
 g.candidates.forEach((item,index)=>{
   const row=document.createElement("div");row.className="item"+(stateGroup.choice===item.id?" chosen":"");
   const radio=document.createElement("input");radio.type="radio";radio.name=kind;radio.id="pick-"+item.id;radio.value=item.id;radio.checked=stateGroup.choice===item.id;
   radio.setAttribute("aria-label","选择 "+item.label);
   radio.addEventListener("change",()=>{stateGroup.choice=item.id;save();renderSelection();summarize();msg("已选择："+item.label);});
   const label=document.createElement("label");label.className="content";label.htmlFor=radio.id;
   label.innerHTML='<div class="item-title">'+String(index+1).padStart(2,"0")+' · '+escapeHtml(item.label)+'</div>'+
   '<div class="item-detail">'+escapeHtml(item.note)+' · 作者 '+escapeHtml(item.author)+(stateGroup.heard.includes(item.id)?" · 已试听":"")+'</div>';
   const actions=document.createElement("div");actions.className="buttons";
   const playFull=document.createElement("button");playFull.className="preview";playFull.type="button";playFull.dataset.idle="▶ 整段";playFull.textContent=playFull.dataset.idle;
   playFull.addEventListener("click",()=>play(kind,item,"full",playFull));
   const playRepeat=document.createElement("button");playRepeat.className="preview";playRepeat.type="button";playRepeat.dataset.idle="↻ 连续3秒";playRepeat.textContent=playRepeat.dataset.idle;
   playRepeat.addEventListener("click",()=>play(kind,item,"repeat",playRepeat));
   const fav=document.createElement("button");fav.className="star"+(stateGroup.favorites.includes(item.id)?" on":"");fav.type="button";
   fav.setAttribute("aria-label","收藏 "+item.label);fav.setAttribute("aria-pressed",String(stateGroup.favorites.includes(item.id)));fav.textContent=stateGroup.favorites.includes(item.id)?"★":"☆";
   fav.addEventListener("click",()=>{
    if(stateGroup.favorites.includes(item.id))stateGroup.favorites=stateGroup.favorites.filter(x=>x!==item.id);
    else stateGroup.favorites.push(item.id);
    const on=stateGroup.favorites.includes(item.id);
    fav.classList.toggle("on",on);fav.setAttribute("aria-pressed",String(on));fav.textContent=on?"★":"☆";
    save();summarize();msg(on?"已收藏备用："+item.label:"已取消收藏："+item.label);
   });
   const a=document.createElement("a");a.className="source";a.href=item.sourcePage;a.target="_blank";a.rel="noopener noreferrer";a.textContent="原出处";
   actions.append(playFull,playRepeat,fav,a);
   row.append(radio,label,actions);list.appendChild(row);
 });
 section.appendChild(list);
 const notes=document.createElement("label");notes.className="notes";const text=document.createElement("textarea");
 text.value=stateGroup.notes;text.rows=2;text.placeholder="本组听感与备选意见（例如：第2个更有胜利喜悦，但希望尾音再清脆些）";
 text.addEventListener("input",()=>{stateGroup.notes=text.value;save();});
 notes.innerHTML="<span>试听备注与修改要求</span>";notes.appendChild(text);section.appendChild(notes);
 root.appendChild(section);
 function renderSelection(){list.querySelectorAll(".item").forEach(r=>{const input=r.querySelector('input[type="radio"]');r.classList.toggle("chosen",input.value===stateGroup.choice);input.checked=input.value===stateGroup.choice;});}
}
function exportPayload(){
 return {
 project:"弹珠超载",version:"V6-focused-clear-fail",exportedAt:new Date().toISOString(),
 carryForward:"V5 five previously retained candidate groups unchanged: mg,hit,break,boom,upgrade",
 selections:IDS.map(kind=>{
  const s=state[kind],g=DATA.groups[kind],choice=g.candidates.find(x=>x.id===s.choice)||null;
  return {id:kind,eventName:kind==="clear"?"清屏过关":"触线失败",status:choice?"selected_new":"pending",choiceId:s.choice,choiceLabel:choice?.label||null,
   fileUrl:choice?.url||null,originalSource:choice?.sourcePage||null,license:choice?.license||null,
   favorites:s.favorites.map(id=>g.candidates.find(x=>x.id===id)).filter(Boolean).map(x=>({id:x.id,label:x.label,fileUrl:x.url,source:x.sourcePage})),
   notes:s.notes,heardCount:s.heard.length};
 })
 };
}
function markdown(data){
 const safe=x=>String(x||"").replace(/\|/g,"/").replace(/[\r\n]+/g,"；");
 const rows=["# 《弹珠超载》音效V6专项重选","","> "+data.exportedAt+" · 仅清屏过关与触线失败；其余5组沿用V5","",
 "| 类别 | 首选 | 源文件 | 保留备用 | 状态 | 备注 |","|---|---|---|---|---|---|"];
 data.selections.forEach(s=>rows.push("| "+[safe(s.eventName),safe(s.choiceLabel||"待定"),safe(s.fileUrl),safe(s.favorites.map(x=>x.label).join("、")),safe(s.status),safe(s.notes)].join(" | ")+" |"));
 rows.push("","本轮仅人工试听选型，不表示音频已接入游戏。外部文件需在正式发行前下载到仓库，自行托管并复核CC0许可证。");
 return rows.join("\n");
}
function download(filename,txt,mime){
 const blob=new Blob([txt],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
document.getElementById("stop").addEventListener("click",stop);
document.getElementById("export-json").addEventListener("click",()=>{download("pinball-v6-clear-fail.json",JSON.stringify(exportPayload(),null,2),"application/json;charset=utf-8");msg("JSON已导出，含两类首选与收藏");});
document.getElementById("export-md").addEventListener("click",()=>{download("pinball-v6-clear-fail.md",markdown(exportPayload()),"text/markdown;charset=utf-8");msg("Markdown已导出");});
document.getElementById("copy").addEventListener("click",async()=>{
 const s=markdown(exportPayload());
 try{await navigator.clipboard.writeText(s);msg("已复制结果");}
 catch(e){download("pinball-v6-clear-fail.md",s,"text/markdown;charset=utf-8");msg("复制失败，改为下载文件");}
});
document.getElementById("reset").addEventListener("click",()=>{
 if(!confirm("清空本轮两类音效首选、收藏与备注？不会影响V5记录。"))return;
 state=initial();save();rerender();msg("V6两类已重置，V5未变");
});
window.addEventListener("pagehide",stop);
window.__pinballV6Review={getResults:exportPayload,candidateCounts:Object.fromEntries(IDS.map(id=>[id,DATA.groups[id].candidates.length]))};
rerender();
})();