/* QA-only sound control panel; never changes the original 20-wave game rules. */
(()=>{
"use strict";
const api=window.PinballGameAudio,root=document.getElementById("aq-rows");
if(!api||!root)return;
const names=[
["mg","机枪连射","V5 木质轻敲 01"],
["hit","普通命中","V5 木板闷响 02"],
["break","砖块击碎","V5 dice throw 1"],
["armor","装甲命中","普通命中变调复用"],
["boom","爆雷/连环冲击","V5 硬脆爆裂 03"],
["skill_select","技能选择","Mixkit Unlock game notification"],
["clear","清屏过关","Mixkit Casino bling，已裁尾音"],
["fail","触线失败","Mixkit Arcade retro game over"],
["upgrade","升级提示","V5 短上扬 Rise03"]
];
let enabled=api.getState().enabled;
const modeA=document.getElementById("aq-legacy"),modeB=document.getElementById("aq-selected");
function updateMode(){modeA.classList.toggle("active",!enabled);modeB.classList.toggle("active",enabled);modeA.setAttribute("aria-pressed",String(!enabled));modeB.setAttribute("aria-pressed",String(enabled));}
function setMode(v){enabled=v;api.setEnabled(v);updateMode();document.getElementById("aq-state").textContent=enabled?"自选音效 B：真实游戏事件已接入":"合成原音 A：仅用于对照，未配置的事件可能无声";}
modeA.addEventListener("click",()=>setMode(false));
modeB.addEventListener("click",()=>setMode(true));
updateMode();
for(const [kind,name,note] of names){
 const div=document.createElement("div");div.className="aq-row";
 const col=document.createElement("div");
 const label=document.createElement("label");label.textContent=name;
 const small=document.createElement("small");small.textContent=note;
 const volume=document.createElement("input");volume.type="range";volume.min=0;volume.max=150;volume.step=5;volume.value=Math.round((api.getState().levels[kind]??1)*100);
 volume.setAttribute("aria-label",name+"音量百分比");volume.addEventListener("input",()=>api.setGroupVolume(kind,Number(volume.value)/100));
 col.append(label,small,volume);
 const button=document.createElement("button");button.type="button";button.textContent="▶";button.title="试听 "+name;button.setAttribute("aria-label","试听 "+name);
 button.addEventListener("click",()=>{
  if(!enabled)setMode(true);
  api.prime();
  const control=document.getElementById("soundVolume");
  const percent=control?Number(control.value)/100:.78;
  api.play(kind,percent);
 });
 div.append(col,button);root.appendChild(div);
}
document.getElementById("aq-open")?.addEventListener("click",()=>document.body.classList.add("aq-open"));
document.getElementById("aq-close")?.addEventListener("click",()=>document.body.classList.remove("aq-open"));
const state=document.getElementById("aq-state");
setInterval(()=>{
 const s=api.getState();
 const kinds=["mg","hit","break","boom","skill_select","clear","fail","upgrade"];
 const plays=kinds.map(k=>(s.plays[k]||0)?k+":"+(s.plays[k]):"").filter(Boolean);
 const value="已播放 "+(plays.join(" · ")||"尚无真实事件")+"\n并发声部 "+s.activeVoices+" · 加载 "+s.loaded.length+"/6 · 错误 "+s.errors;
 if(state.textContent!==value)state.textContent=value;
},850);
})();