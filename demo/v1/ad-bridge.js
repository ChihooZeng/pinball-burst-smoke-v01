/* Optional adapter contract. The release does not load or configure an adapter. */
((root) => {
  "use strict";
  const formats=new Set(["banner","interstitial","rewarded"]);
  function create({adapter=null,timeoutMs=8000,minIntervalMs=180000,now=Date.now}={}){
    let showing=false;
    const last=new Map(), errors=new Set();
    const result=(format,status)=>Object.freeze({format,status});
    function onError(listener){
      if(typeof listener!=="function")return ()=>{};
      errors.add(listener);
      return ()=>errors.delete(listener);
    }
    function report(format,status){
      const message=result(format,status);
      for(const listener of errors){
        try {listener(message);} catch {}
      }
      return message;
    }
    async function show(format,{placement,onReward}={}){
      if(!formats.has(format))return result(format,"unsupported");
      if(!adapter)return result(format,"disabled");
      if(showing)return result(format,"busy");
      if(format==="interstitial"&&now()-(last.get(format)??-Infinity)<minIntervalMs)return result(format,"frequency_limited");
      showing=true;
      let timer,shown;
      const abort=new AbortController();
      try {
        const outcome=await Promise.race([
          Promise.resolve().then(()=>adapter.show(format,{placement,signal:abort.signal})),
          new Promise(resolve=>{timer=setTimeout(()=>resolve("timeout"),timeoutMs);})
        ]);
        if(outcome==="timeout"){
          abort.abort();return report(format,"timeout");
        }
        if(outcome?.status==="skipped")return result(format,"skipped");
        if(outcome?.status!=="shown"&&outcome?.status!=="rewarded")return report(format,"unavailable");
        shown=result(format,"shown");
        last.set(format,now());
        if(format==="rewarded"&&outcome.status==="rewarded"){
          shown=result(format,"rewarded");
          try {onReward?.();} catch {report(format,"reward_callback_error");}
        }
        return shown;
      } catch {
        return report(format,"error");
      } finally {
        clearTimeout(timer);showing=false;
      }
    }
    return Object.freeze({
      get status(){return adapter?"enabled":"disabled";},
      isReady(format){
        if(!adapter||showing||!formats.has(format))return false;
        try {return adapter.isReady?.(format)===true;} catch {return false;}
      },
      showBanner:options=>show("banner",options),
      showInterstitial:options=>show("interstitial",options),
      showRewarded:options=>show("rewarded",options),
      onError
    });
  }
  if(typeof module==="object")module.exports={create};
  else {root.PinballAdBridge=Object.freeze({create});root.AdBridge=create();}
})(typeof window==="object"?window:globalThis);
