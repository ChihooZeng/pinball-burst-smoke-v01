"use strict";
/*
 * Pinball vibration experiment: native Vibration API only.
 * No hidden switch, synthetic click, DOM wrapping, or blocking fallback on iOS.
 * All durations below are small, bounded test values, not hardware force/intensity.
 */
(function(root){
  const patterns = Object.freeze({
    armor:  {priority:1, pattern:10, cooldown:240},
    break:  {priority:2, pattern:18, cooldown:145},
    combo:  {priority:3, pattern:[20,25,25], cooldown:350},
    ultimate:{priority:4, pattern:[34,35,48], cooldown:420}
  });
  function create({vibrate=null,now=()=>Date.now(),visible=()=>true}={}){
    const supported=typeof vibrate==="function";
    let enabled=false, pending=null, lastAt=-Infinity, lastType=null;
    let sent=0,blocked=0,failed=0;
    function cancelPending(){pending=null;}
    function setEnabled(value){
      enabled=Boolean(value)&&supported;
      cancelPending();
      if(!enabled&&supported){try{vibrate(0);}catch(_){}}
      return enabled;
    }
    function request(type){
      if(!enabled||!supported||!visible())return false;
      const entry=patterns[type];if(!entry)return false;
      if(!pending||entry.priority>patterns[pending].priority)pending=type;
      return true;
    }
    function flush(){
      const name=pending;pending=null;
      if(!name||!enabled||!supported||!visible())return false;
      const event=patterns[name],ts=now();
      const rest=(lastType==="ultimate"?420:lastType==="combo"?250:0);
      if(name!=="ultimate"&&ts-lastAt<Math.max(event.cooldown,rest)){
        blocked++;return false;
      }
      // Prioritize manually triggered giant even if the recent hit just vibrated.
      if(name==="ultimate"&&ts-lastAt<100){blocked++;return false;}
      try{
        const ok=vibrate(event.pattern);
        if(ok===false){failed++;return false;}
        sent++;lastAt=ts;lastType=name;
        return true;
      }catch(_){failed++;return false;}
    }
    function test(){
      if(!enabled||!supported||!visible())return false;
      try{
        const ok=vibrate(22);
        if(ok===false){failed++;return false;}
        // Avoid starting a collision pulse immediately after the manual test.
        lastAt=now();lastType="break";sent++;
        return true;
      }catch(_){failed++;return false;}
    }
    function snapshot(){
      return {supported,enabled,pending,sent,blocked,failed,lastType};
    }
    return {supported,get enabled(){return enabled;},setEnabled,request,flush,test,cancelPending,snapshot};
  }
  root.PinballHaptics={create,patterns};
  if(typeof module!=="undefined"&&module.exports)module.exports={create,patterns};
})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:{});
