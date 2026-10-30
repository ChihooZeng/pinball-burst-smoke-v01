// Public deployment smoke: no test flag, forced clear, damage injection or reward mutation.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const url=process.env.M1_PUBLIC_URL||'https://chihoozeng.github.io/pinball-burst-smoke-v01/compare/hybrid-v1-m1/';
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',...(process.env.M1_PROXY?{proxy:{server:process.env.M1_PROXY}}:{})});
 try{
  const results=[];
  for(const [width,height] of [[390,844],[1440,900]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   page.on('requestfailed',r=>errors.push(r.url()+':'+r.failure().errorText));
   const response=await page.goto(url,{waitUntil:'networkidle'});
   assert.equal(response.status(),200);assert.match(await page.title(),/M1/);
   assert.equal(await page.evaluate(()=>typeof window.__pinballTest),'undefined');
   await page.locator('#start').click();await page.locator('#choice0').click();await page.waitForTimeout(1200);
   const playing=await page.evaluate(()=>window.__pinballState());assert.equal(playing.phase,'playing');
   await page.locator('#pause').click();const paused=await page.evaluate(()=>window.__pinballState());
   await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__pinballState().elapsed),paused.elapsed);
   assert.ok((await page.locator('#buildStats').textContent()).includes('撞击伤害 2'));
   await page.screenshot({path:`/tmp/pinball-m1-public-${width}.png`});
   await page.locator('#resume').click();assert.equal(await page.evaluate(()=>window.__pinballState().phase),'playing');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);
   results.push({viewport:[width,height],url:page.url(),status:response.status(),title:await page.title(),errors,checks:['production-test-mutator-absent','start-seed-play','pause-freezes-clock','build-panel','resume','no-horizontal-overflow'],wave:playing.wave});
   await context.close();
  }
  const evidence={checkedAt:new Date().toISOString(),results};
  fs.writeFileSync(process.argv[2]||'docs/m1-evidence/public.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
