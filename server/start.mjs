import {createServer} from "node:http";
import {timingSafeEqual} from "node:crypto";
import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const release=path.resolve(fileURLToPath(new URL("../demo/v1/",import.meta.url)));
const serverDir=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4181);
const host=process.env.PINBALL_HOST||"127.0.0.1";
const enabled=process.env.PINBALL_ANALYTICS==="1";
const token=process.env.PINBALL_DASHBOARD_TOKEN||"";
const operator=process.env.PINBALL_OPERATOR||"";
const contact=process.env.PINBALL_PRIVACY_CONTACT||"";
const privacyRegion=process.env.PINBALL_STORAGE_REGION||"";
const origin=new URL(process.env.PINBALL_ORIGIN||`http://127.0.0.1:${port}`).origin;
const marketHeader=(process.env.PINBALL_TRUSTED_COUNTRY_HEADER||"").toLowerCase();
if(enabled&&(token.length<24||!operator||!contact||!privacyRegion)){
  throw new Error("Analytics requires PINBALL_DASHBOARD_TOKEN (24+ characters), PINBALL_OPERATOR, PINBALL_PRIVACY_CONTACT and PINBALL_STORAGE_REGION");
}
const store=enabled?(await import("./storage.mjs")).openStore(process.env.PINBALL_DB||"pinball-events.sqlite"):null;
const mime={
  ".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
  ".png":"image/png",".svg":"image/svg+xml",".wav":"audio/wav",".ogg":"audio/ogg",".m4a":"audio/mp4"
};
const security={
  "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
  "Content-Security-Policy":"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};
function reply(response,status,body="",type="text/plain; charset=utf-8"){
  response.writeHead(status,{...security,"Content-Type":type,"Cache-Control":"no-store"});
  response.end(body);
}
function json(response,status,value){reply(response,status,JSON.stringify(value),"application/json; charset=utf-8");}
function authorized(request){
  const actual=Buffer.from(request.headers.authorization||"");
  const required=Buffer.from("Bearer "+token);
  return actual.length===required.length&&timingSafeEqual(actual,required);
}
function market(request){
  if(!marketHeader||!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(request.socket.remoteAddress))return "unknown";
  const country=request.headers[marketHeader];
  if(country==="CN")return "CN";
  return typeof country==="string"&&/^[A-Z]{2}$/.test(country)&&!["XX","ZZ"].includes(country)?"other":"unknown";
}
async function sendFile(request,response,file){
  const type=mime[path.extname(file)];
  if(!type)return reply(response,404);
  const info=await stat(file).catch(()=>null);
  if(!info?.isFile())return reply(response,404);
  let start=0,end=info.size-1,status=200;
  const headers={...security,"Content-Type":type,"Accept-Ranges":"bytes",
    "Cache-Control":path.extname(file)===".html"?"no-cache":"public, max-age=300"};
  if(request.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if(match&&(match[1]||match[2])){
      start=match[1]?Number(match[1]):Math.max(0,info.size-Number(match[2]));
      if(match[1]&&match[2])end=Math.min(end,Number(match[2]));
    }
    if(!match||!(match[1]||match[2])||!Number.isSafeInteger(start)||start<0||end<start||start>=info.size){
      response.writeHead(416,{...headers,"Content-Range":`bytes */${info.size}`});return response.end();
    }
    status=206;headers["Content-Range"]=`bytes ${start}-${end}/${info.size}`;
  }
  headers["Content-Length"]=end-start+1;
  response.writeHead(status,headers);
  if(request.method==="HEAD"||!info.size)return response.end();
  const stream=createReadStream(file,{start,end});
  stream.on("error",()=>response.destroy());
  response.once("close",()=>stream.destroy());
  stream.pipe(response);
}
let windowSince=0,windowRequests=0;
async function ingest(request,response){
  if(!store)return reply(response,404);
  if(request.headers.origin!==origin)return reply(response,403);
  const now=Date.now();
  if(now-windowSince>60000){windowSince=now;windowRequests=0;}
  if(++windowRequests>2400)return reply(response,429);
  const type=(request.headers["content-type"]||"").split(";")[0];
  if(!["application/json","text/plain"].includes(type))return reply(response,400);
  if(Number(request.headers["content-length"])>16384)return reply(response,413);
  const chunks=[];
  let size=0;
  for await (const chunk of request){
    size+=chunk.length;
    if(size>16384){reply(response,413);return;}
    chunks.push(chunk);
  }
  let body;
  try {body=JSON.parse(Buffer.concat(chunks).toString("utf8"));} catch {return reply(response,400);}
  const accepted=store.add(body,market(request),now);
  return reply(response,accepted==="capacity"?503:accepted?204:400);
}
const server=createServer({requestTimeout:12000,headersTimeout:8000},async(request,response)=>{
  try {
    const url=new URL(request.url,origin);
    const route=decodeURIComponent(url.pathname);
    if(route==="/api/events"&&request.method==="POST")return await ingest(request,response);
    if(!["GET","HEAD"].includes(request.method))return reply(response,405);
    if(route==="/favicon.ico")return await sendFile(request,response,path.join(release,"assets/icon-192.png"));
    if(route==="/healthz")return json(response,200,{ok:true,analytics:enabled});
    if(route==="/api/dashboard"){
      if(!store)return reply(response,404);
      if(!authorized(request))return reply(response,401);
      const days=[1,7,30,90].find(days=>String(days)===url.searchParams.get("days"))||30;
      return json(response,200,store.dashboard(days));
    }
    if(route==="/analytics/"||route==="/analytics/dashboard.js"){
      if(!store)return reply(response,404);
      return await sendFile(request,response,path.join(serverDir,route.endsWith(".js")?"dashboard.js":"dashboard.html"));
    }
    if(route==="/"||route==="/demo/v1"){
      response.writeHead(302,{...security,Location:"/demo/v1/"});return response.end();
    }
    if(route==="/demo/v1/runtime.js"){
      const config=enabled?{analytics:true,operator,contact,storageRegion:privacyRegion}:{analytics:false};
      return reply(response,200,`window.PinballRuntime=Object.freeze(${JSON.stringify(config)});\n`,mime[".js"]);
    }
    if(!route.startsWith("/demo/v1/"))return reply(response,404);
    const file=path.resolve(release,route.slice("/demo/v1/".length)||"index.html");
    if(!file.startsWith(release+path.sep))return reply(response,404);
    return await sendFile(request,response,file);
  } catch(error) {
    if(response.headersSent)return response.destroy();
    if(error instanceof URIError)return reply(response,400);
    console.error("Server request failed:",error.code||error.name);
    return reply(response,500);
  }
});
if(store)setInterval(()=>store.cleanup(),60*60*1000).unref();
server.listen(port,host,()=>console.log(`Marble Overload on http://${host}:${port}/demo/v1/`));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close(()=>{store?.close();process.exit(0);}));
