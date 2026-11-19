import {spawn} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const sleep = ms => new Promise(r=>setTimeout(r,ms));

export async function launchChrome(port=9333, dir=fs.mkdtempSync(path.join(os.tmpdir(), "pinball-chrome-"))){
  const proc = spawn(CHROME,[
    "--headless=new","--remote-debugging-port="+port,"--user-data-dir="+dir,
    "--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
    "--hide-scrollbars","--mute-audio","--no-first-run","--no-default-browser-check",
    "--disable-background-timer-throttling","--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding","--disable-features=CalculateNativeWinOcclusion",
    "--force-color-profile=srgb","about:blank"
  ],{stdio:"ignore"});
  proc.once("close",()=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:3}));
  for(let i=0;i<80;i++){
    try{const r=await fetch("http://127.0.0.1:"+port+"/json/version");if(r.ok)return proc;}catch(e){}
    await sleep(150);
  }
  proc.kill();
  throw new Error("Chrome did not start");
}

export async function newPage(port=9333, url="about:blank"){
  const r = await fetch("http://127.0.0.1:"+port+"/json/new?about:blank",{method:"PUT"});
  const target = await r.json();
  return connect(target.webSocketDebuggerUrl, port);
}

function connect(wsUrl, port){
  return new Promise((resolve,reject)=>{
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const listeners = [];
    ws.onopen = () => {
      const api = {
        send(method,params={}){const mid=++id;ws.send(JSON.stringify({id:mid,method,params}));return new Promise((res,rej)=>pending.set(mid,{res,rej}));},
        on(fn){listeners.push(fn);},
        async eval(expr,{awaitPromise=true,returnByValue=true}={}){
          const r = await api.send("Runtime.evaluate",{expression:expr,awaitPromise,returnByValue,userGesture:true});
          if(r.exceptionDetails) throw new Error("eval failed: "+JSON.stringify(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
          return r.result?.value;
        },
        async viewport(w,h,dpr=2,mobile=true){
          await api.send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:dpr,mobile});
          await api.send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5});
        },
        async goto(target){
          const loaded = new Promise(res=>listeners.push(m=>{if(m.method==="Page.loadEventFired")res();}));
          await api.send("Page.navigate",{url:target});
          await Promise.race([loaded,sleep(15000)]);
          await sleep(600);
        },
        async shot(file,clip){
          const params = {format:"png",captureBeyondViewport:false};
          if(clip) params.clip = {...clip,scale:1};
          const r = await api.send("Page.captureScreenshot",params);
          fs.writeFileSync(file,Buffer.from(r.data,"base64"));
          return file;
        },
        async close(){try{ws.close();}catch(e){}},
        ws
      };
      ws.onmessage = ev => {
        const msg = JSON.parse(ev.data);
        if(msg.id&&pending.has(msg.id)){const {res,rej}=pending.get(msg.id);pending.delete(msg.id);
          if(msg.error)rej(new Error(msg.method+" "+msg.error.message));else res(msg.result);return;}
        for(const fn of listeners)fn(msg);
      };
      resolve(api);
    };
    ws.onerror = e => reject(new Error("ws error "+String(e?.message||e)));
  });
}
