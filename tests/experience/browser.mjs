import {launchChrome,newPage} from "../release/browser.mjs";

export const viewports=[[360,640],[390,844],[412,915],[1440,900]];

export async function instrument(port,paint=true){
  const chrome=await launchChrome(port), page=await newPage(port);
  const errors=[];
  page.on(({method,params})=>{
    if(method==="Runtime.exceptionThrown")errors.push(params.exceptionDetails.exception?.description||params.exceptionDetails.text);
    if(method==="Network.responseReceived"&&params.response.status>=400)errors.push(params.response.status+" "+params.response.url);
    if(method==="Log.entryAdded"&&params.entry.level==="error")errors.push(params.entry.text);
    if(method==="Network.loadingFailed"&&!params.canceled)errors.push(params.errorText);
  });
  for(const name of ["Page","Runtime","Log","Network"])await page.send(name+".enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument",{source:`
    const flags=new URLSearchParams(location.search);
    window.__PINBALL_TEST__=true;
    window.__PINBALL_SEED__=Number(flags.get("seed")||20261118);
    let rng=window.__PINBALL_SEED__,time=0,id=0;
    Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
    const frames=new Map();
    Object.defineProperty(performance,"now",{value:()=>time});
    window.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};
    window.cancelAnimationFrame=handle=>frames.delete(handle);
    window.advanceGame=(count,step=1000/60)=>{
      for(let i=0;i<count;i++){
        time+=step;
        const pending=[...frames.values()];
        frames.clear();
        for(const draw of pending)draw(time);
      }
      if(window.PinballBoot?.failed)throw Error("Game boot or frame failed");
    };
    ${paint?"":`
      const gradient={addColorStop(){}};
      const noOp=()=>{};
      const dummy=new Proxy({
        createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
        measureText:text=>({width:String(text).length*7}),getTransform:()=>new DOMMatrix(),
        isPointInPath:()=>false
      },{get:(obj,key)=>key in obj?obj[key]:noOp});
      HTMLCanvasElement.prototype.getContext=function(type){if(type==="2d")return dummy;return null;};
    `}
  `});
  return {page,errors,async close(){await page.close();chrome.kill();}};
}
export function entry(url,params={}){
  const addr=new URL(url);
  for(const [key,value] of Object.entries(params))addr.searchParams.set(key,value);
  return addr.href;
}
