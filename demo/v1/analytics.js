/* Analytics uses a fresh visit ID per document. Work is bounded and never awaited by the game. */
(() => {
  "use strict";
  const preferencesKey="pinball-v1-analytics", visitorKey="pinball-v1-visitor";
  const endpoint=window.PinballRuntime?.analytics ? "/api/events" : null;
  const limit=96;
  let consent=false, visitor=null, visit=null, run=null, pending=[], sending=false, timer=null;
  const uuid=()=>window.crypto?.randomUUID?.()??null;
  try {consent=localStorage.getItem(preferencesKey)==="yes";} catch {}

  function enabled(){return Boolean(endpoint&&consent);}
  function event(name, details={}){
    if(!enabled()||!visit||(!run&&name!=="game_visit"))return;
    const id=uuid();
    if(!id)return;
    if(pending.length>=limit){
      const sample=pending.findIndex(entry=>entry.name==="run_heartbeat");
      pending.splice(sample<0?0:sample,1);
    }
    pending.push({id,visitor,visit,run,name,lang:window.PinballI18n.language,...details});
    if(pending.length>=16)void flush();
    else schedule();
  }
  function schedule(){
    if(!timer) timer=setTimeout(()=>{timer=null;void flush();},3000);
  }
  async function flush(){
    if(!enabled()||sending||!pending.length)return;
    sending=true;
    const batch=pending.slice(0,24);
    try {
      const response=await fetch(endpoint,{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"omit",
        body:JSON.stringify(batch),keepalive:true
      });
      if(response.ok||[400,403,413].includes(response.status)){
        const ids=new Set(batch.map(entry=>entry.id));
        pending=pending.filter(entry=>!ids.has(entry.id));
      }
    } catch {
      // A brief outage keeps a bounded queue for retry while this page is open.
    } finally {
      sending=false;
      if(pending.length&&enabled())schedule();
    }
  }
  function openVisit(){
    if(!enabled()||visit)return;
    try {
      const saved=localStorage.getItem(visitorKey);
      visitor=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(saved)?saved:uuid();
      if(visitor)localStorage.setItem(visitorKey,visitor);
    } catch {visitor=uuid();}
    visit=uuid();
    if(visit&&visitor)event("game_visit");
  }
  function setConsent(value){
    consent=Boolean(value);
    try {localStorage.setItem(preferencesKey,consent?"yes":"no");} catch {}
    if(consent) openVisit();
    else {
      clearTimeout(timer);timer=null;pending=[];visitor=null;visit=null;run=null;
      try {localStorage.removeItem(visitorKey);} catch {}
    }
  }
  function start(details){
    if(!enabled())return;
    openVisit();
    run=uuid();
    if(run)event("game_start",details);
  }
  function close(details){
    if(details)event("session_exit",details);
    if(!enabled()||!pending.length)return;
    // The server deduplicates IDs also included in an in-flight fetch.
    const batch=pending.slice(-24);
    if(!navigator.sendBeacon?.(endpoint,new Blob([JSON.stringify(batch)],{type:"text/plain"})))void flush();
  }
  function wireConsent(){
    const toggles=[...document.querySelectorAll("[data-analytics-consent]")];
    for(const toggle of toggles){
      toggle.closest("[data-analytics-option]").hidden=!endpoint;
      toggle.checked=enabled();
      toggle.addEventListener("change",()=>{
        setConsent(toggle.checked);
        for(const control of toggles)control.checked=enabled();
      });
    }
    addEventListener("storage",event=>{
      if(event.key!==preferencesKey&&event.key!==null)return;
      setConsent(event.newValue==="yes");
      for(const control of toggles)control.checked=enabled();
    });
    openVisit();
  }
  window.PinballAnalytics=Object.freeze({event,start,close,wireConsent,available:!!endpoint});
})();
