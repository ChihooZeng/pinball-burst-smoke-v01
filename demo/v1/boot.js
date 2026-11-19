/* Startup and runtime failure surface, kept independent of the game engine. */
(() => {
  "use strict";
  const loading=document.querySelector("#loading");
  const errorOverlay=document.querySelector("#errorOverlay");
  const start=document.querySelector("#start");
  let ready=false, failed=false, restart=null;
  const timer=setTimeout(()=>report("startup_timeout"),12000);
  const translate=()=>window.PinballI18n?.apply(document);

  function report(error){
    if(failed)return;
    failed=true;clearTimeout(timer);
    loading.hidden=true;start.disabled=true;
    translate();
    errorOverlay.hidden=false;errorOverlay.classList.remove("hidden");
    document.querySelector("#recover").hidden=!restart;
    document.querySelector("#reload").focus();
    console.error("[Marble Overload]",error);
  }
  function markReady(recover){
    ready=true;restart=recover;
    clearTimeout(timer);
    if(!failed){loading.hidden=true;start.disabled=false;}
  }
  document.querySelector("#reload").addEventListener("click",()=>location.reload());
  document.querySelector("#recover").addEventListener("click",()=>{
    if(!restart)return;
    try {
      restart();
      failed=false;start.disabled=false;errorOverlay.classList.add("hidden");
      document.querySelector("#start").focus();
    } catch {location.reload();}
  });
  window.addEventListener("error",event=>{
    if(event.target===window)report(event.error||"runtime_error");
    else if(!ready&&["SCRIPT","LINK"].includes(event.target?.tagName)&&!event.target.dataset.optional)report("core_resource_unavailable");
  },true);
  window.addEventListener("unhandledrejection",event=>{
    event.preventDefault();
    report(event.reason||"unhandled_rejection");
  });
  window.PinballBoot=Object.freeze({markReady,report,get failed(){return failed;}});
})();
