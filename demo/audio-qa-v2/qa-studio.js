/* 20-wave in-game SFX re-selection desk + wave-10 diagnostics. */
(()=>{"use strict";
const api=window.PinballGameAudio,studio=window.PinballSoundChoice;
const root=document.getElementById("aq-rows"),status=document.getElementById("aq-state");
if(!api||!studio||!root){if(status)status.textContent="音效台初始化失败：缺失音频脚本";return;}
const modeA=document.getElementById("aq-legacy"),modeB=document.getElementById("aq-selected");
const message=document.getElementById("aq-action-status"),flow=document.getElementById("aq-flow"),live=document.getElementById("aq-live");
function note(str){if(message)message.textContent=str;}
function mode(on){
 api.setEnabled(on);
 modeA.classList.toggle("active",!on);
 modeB.classList.toggle("active",on);
 modeA.setAttribute("aria-pressed",String(!on));
 modeB.setAttribute("aria-pressed",String(on));
 note(on?"B 已选音效：随游戏事件触发":"A 原版合成音：用于对照；某些事件在原版没有声音");
}
modeA.addEventListener("click",()=>mode(false));
modeB.addEventListener("click",()=>mode(true));
mode(api.getState().enabled);
for(const cat of studio.categories){
 const options=studio.getChoices(cat.key);
 const block=document.createElement("section");block.className="aq-pick";
 const header=document.createElement("div");header.className="aq-pick-head";
 const title=document.createElement("strong");title.textContent=cat.label;
 const count=document.createElement("small");count.textContent=options.length+"个备选";
 header.append(title,count);
 const select=document.createElement("select");select.className="aq-select";select.setAttribute("aria-label",cat.label+" 音效选择");
 for(const option of options){
  const opt=document.createElement("option");opt.value=option.id;opt.textContent=(option.id==="bundled"?"★ ":"")+option.label;select.appendChild(opt);
 }
 select.value=studio.getSelection(cat.key);
 select.addEventListener("change",()=>{
  if(!studio.choose(cat.key,select.value)){note(cat.label+"：选择失败");return;}
  if(!api.getState().enabled)mode(true);
  const o=studio.getChoices(cat.key).find(x=>x.id===select.value);
  note(cat.label+"已切换："+(o?.label||select.value)+"，后续游戏事件实时生效。外链音频首次加载可能较慢。");
 });
 const actions=document.createElement("div");actions.className="aq-pick-actions";
 const one=document.createElement("button");one.type="button";one.textContent="▶ 单次试听";
 const repeat=document.createElement("button");repeat.type="button";repeat.textContent="↻ 连播3秒";
 async function play(repeats,button){
  if(!api.getState().enabled)mode(true);
  button.disabled=true;note(cat.label+"：正在载入 / 播放");
  try{await studio.preview(cat.key,repeats);note(cat.label+"：试听已触发，请在游戏中继续对比。");}
  catch(error){note(cat.label+"：音频加载失败："+(error.message||error)+"；可以切回★本地音效。");}
  finally{button.disabled=false;}
 }
 one.addEventListener("click",()=>play(false,one));
 repeat.addEventListener("click",()=>play(true,repeat));
 const local=document.createElement("label");local.className="aq-local";
 local.textContent="导入本地声音";
 const input=document.createElement("input");input.type="file";input.accept="audio/*";input.style.display="none";
 input.addEventListener("change",async()=>{
  const file=input.files?.[0];if(!file)return;
  if(!api.getState().enabled)mode(true);
  note("正在解码："+file.name);
  try{
   await studio.setUploaded(cat.key,file);
   let choice=select.querySelector('option[value="uploaded"]');
   if(!choice){choice=document.createElement("option");choice.value="uploaded";select.appendChild(choice);}
   choice.textContent="本地自选："+file.name;select.value="uploaded";
   note("已将本地文件接入"+cat.label+"。刷新后需重新上传原文件。");
  }catch(e){note("导入失败："+(e.message||e));}
  input.value="";
 });
 local.appendChild(input);
 const slider=document.createElement("input");slider.type="range";slider.min="0";slider.max="150";slider.step="5";
 slider.value=Math.round((api.getState().levels[cat.key]??1)*100);
 slider.setAttribute("aria-label",cat.label+"音量");
 const num=document.createElement("span");num.className="aq-percent";num.textContent=slider.value+"%";
 slider.addEventListener("input",()=>{api.setGroupVolume(cat.key,Number(slider.value)/100);num.textContent=slider.value+"%";});
 actions.append(one,repeat,local);
 const volume=document.createElement("div");volume.className="aq-level";
 const l=document.createElement("small");l.textContent="事件音量";volume.append(l,slider,num);
 block.append(header,select,actions,volume);root.appendChild(block);
}
document.getElementById("aq-open")?.addEventListener("click",()=>document.body.classList.add("aq-open"));
document.getElementById("aq-close")?.addEventListener("click",()=>document.body.classList.remove("aq-open"));
document.getElementById("aq-stop")?.addEventListener("click",()=>{studio.stopPreview();api.stop();note("已停止正在播放的声音");});
document.getElementById("aq-download")?.addEventListener("click",()=>{
 const json=JSON.stringify(studio.exportConfig(),null,2),blob=new Blob([json],{type:"application/json"}),url=URL.createObjectURL(blob);
 const link=document.createElement("a");link.href=url;link.download="pinball-audio-qa-v2-selected.json";document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);note("已导出所有音效选择及诊断信息；本地上传的声音文件本身不包含在JSON中。");
});
document.getElementById("aq-diagnostics")?.addEventListener("click",()=>{
 const result=window.__pinballAudioQaFix?.exportDiagnostics?.();
 if(!result){note("游戏诊断接口尚未加载");return;}
 const blob=new Blob([result],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="pinball-wave10-diagnostic.json";document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);note("游戏诊断已导出（含当前波数、升级阶段、最近120条事件）。");
});
document.getElementById("aq-jump10")?.addEventListener("click",()=>{
 const route=document.getElementById("aq-route")?.value||"gun";
 const ok=window.__pinballAudioQaFix?.startBoss10?.(route);
 note(ok?"已进入第10关Boss，请观察Boss击败后的升级选卡与第11关衔接":"第10关测试启动失败，请导出诊断");
});
document.getElementById("aq-continue")?.addEventListener("click",()=>{
 const out=window.__pinballAudioQaFix?.continueUpgrade?.();
 note(out?"已应用第一张有效升级卡，正在进入下一关":"当前不是等待升级状态，请查看诊断信息。");
});
document.getElementById("aq-resume")?.addEventListener("click",()=>{
 const out=window.__pinballAudioQaFix?.resumePaused?.();
 note(out?"已恢复暂停的游戏":"无法继续：请查看错误诊断或使用游戏重开功能");
});
let lastElapsed=null,lastTime=performance.now();
function update(){
 const game=window.__pinballAudioQaFix?.getStatus?.();
 const audio=api.getState(),change=studio.getState();
 if(!game){status.textContent="等待游戏初始化";return;}
 const now=performance.now(),progress=game.elapsed!==lastElapsed;
 if(progress){lastElapsed=game.elapsed;lastTime=now;}
 const stuck=game.phase==="playing"&&!document.hidden&&!progress&&(now-lastTime>4500);
 flow.textContent=game.phase==="choosing"?"第"+game.wave+"波已清屏，正在等待选择强化 · 点击游戏内任意技能卡继续。":
 game.phase==="paused"?"游戏处于暂停状态 · 可点击「恢复游戏」，若有异常请导出诊断。":
 game.phase==="lost"?"已失败，可以重新开始":
 game.phase==="complete"?"20波已完成":
 game.bossVictoryActive?"Boss终结爆炸演出中":
 stuck?"游戏时间超过4秒未推进：可能存在运行异常，请导出诊断":
 "游戏进行中 · 第"+game.wave+" / 20波";
 document.getElementById("aq-continue").hidden=game.phase!=="choosing";
 document.getElementById("aq-resume").hidden=game.phase!=="paused";
 flow.classList.toggle("warning",game.phase==="paused"||stuck);
 const count=Object.entries(audio.plays||{}).filter(([,n])=>n>0).map(([k,n])=>k+":"+n).slice(-9).join(" · ");
 const own=Object.entries(change.dynamicPlays||{}).map(([k,n])=>k+":"+n).join(" · ");
 live.textContent="阶段 "+game.phase+" · Boss HP "+(game.bossHp??"—")+" · 运行异常 "+game.frameErrors+"次\n"+
  "本地音效："+(count||"尚未触发")+"\n外部候选："+(own||"尚未触发")+
  "\n声音资源 "+audio.loaded.length+"/6 · 音频错误 "+audio.errors+" · 试听错误 "+change.warnings.length;
 if(change.warnings.length)note("候选音频失败："+change.warnings.at(-1).error+"，系统已回退内置声音。");
 status.textContent=game.lastError?"上次脚本错误："+game.lastError.message:"游戏阶段："+game.phase+"；当前第"+game.wave+"波";
}
update();setInterval(update,1000);
})();