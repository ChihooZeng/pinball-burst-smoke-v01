"use strict";
(() => {
  const W = 360, H = 560, DANGER_Y = 482, FIRE_INTERVALS = [1, .90, .82];
  const BALL_SPEED = 370, MAX_BALLS = 20, BALL_TTL = 7.5, MAX_CHARGE = 100;
  const SPAWN_BASE = 7.5, SPAWN_MIN = 4.8;
  const canvas = document.querySelector("#game"), ctx = canvas.getContext("2d");
  const $ = name => document.querySelector("#" + name);
  const ui = {
    time: $("time"), score: $("score"), damage: $("damage"), rate: $("rate"),
    level: $("level"), xpText: $("xpText"), xpFill: $("xpFill"),
    ult: $("giant"), ultFill: $("ultFill"), ultPercent: $("ultPercent"),
    ultLabel: $("ultLabel"), status: $("status"), upgrade: $("upgradeOverlay"),
    upgradeSub: $("upgradeSub"), lost: $("loseOverlay"), final: $("finalStats"),
    options: [
      {button:$("optionA"),title:$("optionTitleA"),desc:$("optionDescA"),icon:$("optionIconA")},
      {button:$("optionB"),title:$("optionTitleB"),desc:$("optionDescB"),icon:$("optionIconB")}
    ]
  };
  const shooter = {x:W / 2,y:H - 36};
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const upgrades = [
    {id:"damage",title:"火力强化",icon:"✦",desc:()=>"每次普通命中伤害 +1"},
    {id:"rate",title:"快速装填",icon:"↗",desc:()=>rateLevel===0?"发射间隔 1.00 → 0.90 秒":"发射间隔 0.90 → 0.82 秒"},
    {id:"ricochet",title:"折射冲击",icon:"↝",desc:()=>ricochetLevel===0?"撞侧墙后首次命中，向邻近 1 块砖溅射":"溅射最多命中 2 块邻近砖"},
    {id:"giant",title:"巨型强化",icon:"◆",desc:()=>"+6 巨型球贯穿伤害"}
  ];
  let bricks,balls,particles,ultBall,activePointer,aim,time,score,xp,xpNeeded,level;
  let phase,damage,rateLevel,ricochetLevel,giantLevel,charge,shootClock,spawnClock,spawnId,options;
  let ultUsed,ricochetHits,lastFrame,audio,seed;
  function rng(){ seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
  function interval(){return FIRE_INTERVALS[rateLevel];}
  function formatTime(t){const n=Math.floor(t);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
  function soundReady(){
    try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();}catch(_){}
  }
  function ping(freq=350,dur=.045,vol=.02){
    if(!audio)return;
    try{
      const t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
      osc.type="sine";osc.frequency.setValueAtTime(freq,t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(90,freq*.61),t+dur);
      gain.gain.setValueAtTime(vol,t);gain.gain.exponentialRampToValueAtTime(.001,t+dur);
      osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+dur);
    }catch(_){}
  }
  function say(str){ui.status.textContent=str;}
  function syncHud(){
    ui.time.textContent=formatTime(time);ui.score.textContent=String(score);
    ui.damage.textContent=String(damage);ui.rate.textContent=interval().toFixed(2)+"s";
    ui.level.textContent=String(level);ui.xpText.textContent=xp+" / "+xpNeeded+" EXP";
    ui.xpFill.style.width=(clamp(xp/xpNeeded,0,1)*100)+"%";
    ui.ultFill.style.width=charge+"%";ui.ultPercent.textContent=Math.floor(charge)+"%";
    ui.ult.disabled=phase!=="playing"||charge<MAX_CHARGE||!!ultBall;
    ui.ultLabel.textContent=charge===MAX_CHARGE?"释放巨型球":"必杀技";
    ui.ult.classList.toggle("ready",!ui.ult.disabled);
  }
  function burst(x,y,color,count=8){
    for(let i=0;i<count;i++){
      const a=rng()*Math.PI*2,s=35+rng()*115;
      particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.33,color});
    }
    if(particles.length>220)particles.splice(0,particles.length-220);
  }
  function brickColor(hp,energy){
    if(energy)return "#45c69c";
    if(hp>=12)return "#e19b66";
    if(hp>=7)return "#ae7dca";
    if(hp>=4)return "#6799c8";
    return "#4a86af";
  }
  function makeRow(first=false){
    const stage=Math.floor(time/20)+Math.floor(Math.max(0,time-70)/18);
    const top=first?45:-42, row=[];
    // Each row leaves at least one gap; encourage players to consider aiming angle.
    const gap=Math.floor(rng()*5),extraGap=time<85&&rng()<.32?((gap+2)%5):-1;
    const specialCol=((gap+2)%5);
    for(let c=0;c<5;c++){
      if(c===gap||c===extraGap)continue;
      const variance=Math.floor(rng()*3);
      let hp=clamp(1+stage+variance,1,60);
      if(first)hp=Math.min(2,hp);
      const special=c===specialCol && rng()<.62;
      row.push({id:++spawnId,x:23+c*64,y:top,w:57,h:33,hp,maxHp:hp,
        energy:special,alive:true,flash:0});
    }
    if(!row.some(b=>b.energy)&&row.length && rng()<.45)row[0].energy=true;
    bricks.push(...row);
  }
  function reset(){
    seed=0x5b19f04;
    bricks=[];balls=[];particles=[];ultBall=null;activePointer=null;
    aim=0;time=0;score=0;xp=0;xpNeeded=9;level=1;
    phase="playing";damage=1;rateLevel=0;ricochetLevel=0;giantLevel=0;
    charge=0;shootClock=.7;spawnClock=0;spawnId=0;options=[];
    ultUsed=0;ricochetHits=0;
    ui.upgrade.classList.add("hidden");ui.lost.classList.add("hidden");
    makeRow(true);syncHud();say("自动射击中 · 拖动选择优先攻击目标");
  }
  function gainXp(amount){
    xp+=amount;
  }
  function addCharge(amount){
    charge=clamp(charge+amount,0,MAX_CHARGE);
    if(charge===MAX_CHARGE)say("巨型球已充满！点击战斗右下角按钮");
  }
  function impact(b,amount,source="normal"){
    if(!b.alive)return false;
    b.hp=Math.max(0,b.hp-amount);b.flash=.14;
    burst(b.x+b.w/2,b.y+b.h/2,brickColor(b.hp,b.energy),source==="giant"?9:3);
    if(source==="normal"){addCharge(4);ping(300+Math.min(180,score*6),.022,.014);}
    if(b.hp===0){
      b.alive=false;score++;
      burst(b.x+b.w/2,b.y+b.h/2,b.energy?"#55e4b5":"#82cce7",12);
      gainXp(b.energy?5:3);
      if(source==="normal")addCharge(8+(b.energy?21:0));
      if(b.energy){say("ENERGY 已击碎 · 必杀能量增加");ping(700,.08,.038);}
      else ping(420,.045,.024);
      return true;
    }
    return false;
  }
  function rectHit(x,y,r,b){
    const cx=clamp(x,b.x,b.x+b.w),cy=clamp(y,b.y,b.y+b.h);
    return (x-cx)*(x-cx)+(y-cy)*(y-cy)<=r*r;
  }
  function splash(ball,cx,cy){
    if(!ricochetLevel||!ball.wallReady||ball.splashUsed)return;
    ball.splashUsed=true;ball.wallReady=false;ricochetHits++;
    const targets=bricks.filter(b=>b.alive&&Math.hypot(b.x+b.w/2-cx,b.y+b.h/2-cy)<(ricochetLevel===1?81:115));
    targets.sort((a,b)=>Math.hypot(a.x+a.w/2-cx,a.y+a.h/2-cy)-Math.hypot(b.x+b.w/2-cx,b.y+b.h/2-cy));
    targets.slice(0,ricochetLevel).forEach(b=>impact(b,Math.max(1,Math.ceil(damage*.7)),"splash"));
    burst(cx,cy,"#b7edff",17);ping(870,.08,.03);say("折射溅射！");
  }
  function shoot(){
    if(phase!=="playing"||balls.length>=MAX_BALLS)return;
    balls.push({x:shooter.x,y:shooter.y-23,vx:Math.sin(aim)*BALL_SPEED,
      vy:-Math.cos(aim)*BALL_SPEED,r:6.5,age:0,trail:[],wallReady:false,splashUsed:false});
    ping(240,.012,.005);
  }
  function releaseGiant(){
    if(phase!=="playing"||charge<MAX_CHARGE||ultBall)return false;
    soundReady();charge=0;ultUsed++;
    ultBall={x:shooter.x,y:shooter.y-25,vx:Math.sin(aim)*860,
      vy:-Math.cos(aim)*860,r:17,age:0,seen:new Set()};
    burst(shooter.x,shooter.y-27,"#ffd47c",23);
    say("巨型贯穿！利用方向打穿危险砖块");ping(180,.19,.05);syncHud();return true;
  }
  function updateBall(b,dt){
    const small=dt/4;
    for(let k=0;k<4;k++){
      const oldX=b.x,oldY=b.y;
      b.x+=b.vx*small;b.y+=b.vy*small;
      if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);b.wallReady=true;}
      if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx);b.wallReady=true;}
      if(b.y<b.r+3){b.y=b.r+3;b.vy=Math.abs(b.vy);}
      for(const block of bricks){
        if(!block.alive||!rectHit(b.x,b.y,b.r,block))continue;
        const side=oldX+b.r<=block.x||oldX-b.r>=block.x+block.w;
        if(side){b.vx=-b.vx;b.x=oldX;}else{b.vy=-b.vy;b.y=oldY;}
        impact(block,damage);
        splash(b,block.x+block.w/2,block.y+block.h/2);
        break;
      }
    }
    b.age+=dt;b.trail.unshift({x:b.x,y:b.y});if(b.trail.length>8)b.trail.pop();
    return b.y<H+11&&b.age<BALL_TTL;
  }
  function updateUlt(dt){
    if(!ultBall)return;
    const s=ultBall,segments=Math.max(4,Math.ceil(dt*860/6));
    for(let i=0;i<segments;i++){
      s.x+=s.vx*dt/segments;s.y+=s.vy*dt/segments;
      for(const brick of bricks){
        if(brick.alive&&!s.seen.has(brick.id)&&rectHit(s.x,s.y,s.r,brick)){
          s.seen.add(brick.id);
          impact(brick,15+giantLevel*6,"giant");
        }
      }
    }
    s.age+=dt;
    if(s.x< -30||s.x>W+30||s.y< -35||s.age>1.45)ultBall=null;
  }
  function selectChoices(){
    const eligible=upgrades.filter(u=>
      (u.id!=="rate"||rateLevel<2)&&
      (u.id!=="ricochet"||ricochetLevel<2)&&
      (u.id!=="giant"||giantLevel<3)&&
      (u.id!=="damage"||damage<7)
    );
    // Shuffle seeded so tests and comparisons can reproduce a run.
    for(let i=eligible.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
    options=eligible.slice(0,2);
    // Keep at least two meaningful choices in extremely long runs.
    if(options.length<2) options.push({id:"focus",title:"能量补给",icon:"★",desc:()=>"+45 巨型球能量"});
    if(options.length<2) options.push({id:"salvo",title:"紧急齐射",icon:"↟",desc:()=>"立即发射 3 颗额外弹球"});
    ui.options.forEach((slots,i)=>{
      const u=options[i];
      slots.icon.textContent=u.icon;
      slots.title.textContent=u.title;
      slots.desc.textContent=u.desc();
    });
    ui.upgradeSub.textContent="等级 "+level+" · 战斗暂停，选择后立即继续";
    ui.upgrade.classList.remove("hidden");
    say("等级提升 · 请选择本局强化");
  }
  function maybeLevel(){
    if(phase!=="playing"||xp<xpNeeded)return;
    xp-=xpNeeded;level++;xpNeeded=9+(level-1)*6;phase="choosing";
    selectChoices();ping(760,.13,.04);
  }
  function choose(index){
    if(phase!=="choosing"||!options[index])return false;
    const which=options[index].id;
    if(which==="damage")damage=Math.min(7,damage+1);
    else if(which==="rate")rateLevel=Math.min(2,rateLevel+1);
    else if(which==="ricochet")ricochetLevel=Math.min(2,ricochetLevel+1);
    else if(which==="giant")giantLevel=Math.min(3,giantLevel+1);
    else if(which==="focus")addCharge(45);
    phase="playing";ui.upgrade.classList.add("hidden");
    if(which==="salvo") for(let i=0;i<3;i++)shoot();
    syncHud();
    say("已获得「"+options[index].title+"」");ping(560,.08,.025);
    return true;
  }
  function fail(){
    if(phase!=="playing")return;
    phase="lost";balls=[];ultBall=null;
    ui.final.textContent="生存 "+formatTime(time)+" · 击碎 "+score+" 块 · 达到 Lv."+level+" · 释放必杀 "+ultUsed+" 次";
    ui.lost.classList.remove("hidden");say("砖块触及底线，防线失守");
    ping(150,.25,.04);
  }
  function update(dt){
    if(phase!=="playing")return;
    time+=dt;
    spawnClock+=dt;
    const spawnPeriod=Math.max(SPAWN_MIN,SPAWN_BASE-time*.012);
    if(spawnClock>=spawnPeriod){spawnClock-=spawnPeriod;makeRow();}
    const fallSpeed=Math.min(16.5,8.7+time*.03);
    for(const b of bricks){if(b.alive){b.y+=fallSpeed*dt;b.flash=Math.max(0,b.flash-dt);}}
    if(bricks.some(b=>b.alive&&b.y+b.h>=DANGER_Y)){fail();syncHud();return;}
    shootClock+=dt;
    if(shootClock>=interval()){shootClock-=interval();shoot();}
    balls=balls.filter(b=>updateBall(b,dt));
    updateUlt(dt);
    bricks=bricks.filter(b=>b.alive);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
    maybeLevel();syncHud();
  }
  function round(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function draw(){
    ctx.clearRect(0,0,W,H);
    const grad=ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,"#0b213e");grad.addColorStop(1,"#0a1526");
    ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#ffffff09";ctx.lineWidth=1;
    for(let x=0;x<W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    const danger=bricks.some(b=>b.alive&&b.y+b.h>DANGER_Y-75);
    ctx.save();ctx.setLineDash([7,5]);ctx.strokeStyle=danger?"#ff6666":"#f37f775c";ctx.lineWidth=danger?3:2;
    ctx.beginPath();ctx.moveTo(0,DANGER_Y);ctx.lineTo(W,DANGER_Y);ctx.stroke();ctx.restore();
    ctx.textAlign="left";ctx.fillStyle=danger?"#ffaaaa":"#e78a8699";ctx.font="bold 10px system-ui";ctx.fillText("危险底线",10,DANGER_Y-8);
    for(const b of bricks){
      if(!b.alive)continue;
      ctx.shadowColor=b.energy?"#54e7b8":"#447eaf";
      ctx.shadowBlur=b.flash>0?14:5;ctx.fillStyle=b.flash>0?"#ecfcff":brickColor(b.hp,b.energy);
      round(b.x,b.y,b.w,b.h,6);ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle=b.energy?"#063c31":"#f3f8ff";ctx.font="bold 17px system-ui";ctx.textAlign="center";
      ctx.fillText(String(b.hp),b.x+b.w/2,b.y+23);
      if(b.energy){ctx.font="bold 7px system-ui";ctx.fillText("ENERGY",b.x+b.w/2,b.y+31);}
      else{ctx.fillStyle="#ffffff2b";round(b.x+4,b.y+3,b.w-8,3,1);ctx.fill();}
    }
    if(phase==="playing"){
      ctx.save();ctx.strokeStyle="#a6e9ff88";ctx.lineWidth=2;ctx.setLineDash([6,9]);
      ctx.beginPath();ctx.moveTo(shooter.x,shooter.y-17);
      ctx.lineTo(shooter.x+Math.sin(aim)*240,shooter.y-17-Math.cos(aim)*240);ctx.stroke();ctx.restore();
    }
    for(const b of balls){
      for(let i=b.trail.length-1;i>=0;i--){
        const t=(b.trail.length-i)/b.trail.length,p=b.trail[i];
        ctx.fillStyle="rgba(124,223,255,"+(.18*t)+")";
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,b.r*t*.7),0,Math.PI*2);ctx.fill();
      }
      ctx.shadowColor=b.wallReady&&ricochetLevel?"#c3a9ff":"#b5f1ff";ctx.shadowBlur=13;
      ctx.fillStyle=b.wallReady&&ricochetLevel?"#e1d2ff":"#edfdff";
      ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    if(ultBall){
      ctx.save();ctx.strokeStyle="#f8cb7477";ctx.lineCap="round";ctx.lineWidth=28;ctx.beginPath();
      ctx.moveTo(ultBall.x-ultBall.vx*.10,ultBall.y-ultBall.vy*.10);ctx.lineTo(ultBall.x,ultBall.y);ctx.stroke();
      ctx.shadowColor="#ffc763";ctx.shadowBlur=30;ctx.fillStyle="#ffe09e";
      ctx.beginPath();ctx.arc(ultBall.x,ultBall.y,ultBall.r,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(const p of particles){ctx.globalAlpha=clamp(p.life/.33,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);}
    ctx.globalAlpha=1;
    ctx.save();ctx.translate(shooter.x,shooter.y);ctx.rotate(aim);
    ctx.shadowColor="#60e6f3";ctx.shadowBlur=15;ctx.fillStyle="#3b93ac";
    round(-15,-11,30,32,9);ctx.fill();ctx.fillStyle="#c0effc";
    round(-5,-30,10,26,4);ctx.fill();ctx.restore();
    ctx.fillStyle="#bad2e0";ctx.textAlign="center";ctx.font="11px system-ui";
    ctx.fillText(phase==="playing"?"自动射击中 · 拖动瞄准":phase==="choosing"?"升级暂停": "本局结束",W/2,H-8);
  }
  function updateAim(event){
    const r=canvas.getBoundingClientRect();
    const x=clamp((event.clientX-r.left)*W/r.width,0,W);
    aim=clamp((x-W/2)/(W/2)*1.06,-1.06,1.06);
  }
  canvas.addEventListener("pointerdown",e=>{
    if(phase!=="playing")return;
    e.preventDefault();soundReady();activePointer=e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);updateAim(e);
  });
  canvas.addEventListener("pointermove",e=>{
    if(phase!=="playing"||activePointer!==e.pointerId)return;
    e.preventDefault();updateAim(e);
  });
  const release=e=>{if(activePointer===e.pointerId)activePointer=null;};
  canvas.addEventListener("pointerup",release);canvas.addEventListener("pointercancel",release);
  ui.ult.addEventListener("click",releaseGiant);
  ui.options.forEach((o,i)=>o.button.addEventListener("click",()=>{soundReady();choose(i);}));
  $("again").addEventListener("click",()=>{soundReady();reset();});
  $("restart").addEventListener("click",()=>{soundReady();reset();});
  window.addEventListener("keydown",e=>{
    if(e.code==="ArrowLeft"){aim=clamp(aim-.09,-1.06,1.06);e.preventDefault();}
    if(e.code==="ArrowRight"){aim=clamp(aim+.09,-1.06,1.06);e.preventDefault();}
    if(e.code==="Space"){releaseGiant();e.preventDefault();}
  });
  function frame(now){
    const dt=document.hidden?0:clamp((now-lastFrame)/1000,0,.045);
    lastFrame=now;update(dt);draw();requestAnimationFrame(frame);
  }
  function state(){return {phase,time,score,xp,xpNeeded,level,damage,rate:interval(),rateLevel,ricochetLevel,
    giantLevel,charge,ballCount:balls.length,bricks:bricks.length,ultActive:!!ultBall,ultUsed,ricochetHits,
    choices:options.map(x=>x.id),aim,spawnId};}
  window.__pinballState=state;
  if(window.__PINBALL_TEST__===true)window.__pinballTest={
    advance:dt=>update(dt),
    charge:()=>{charge=100;syncHud();},
    spawn:()=>makeRow(),
    threat:()=>{bricks.push({id:++spawnId,x:72,y:DANGER_Y-36,w:57,h:33,hp:5,maxHp:5,alive:true,energy:false,flash:0});},
    clear:()=>{bricks.forEach(b=>{b.alive=false;score++;gainXp(5);});bricks=[];maybeLevel();syncHud();},
    first:()=>bricks.find(b=>b.alive),
    setFirstHp:(n)=>{const b=bricks.find(b=>b.alive);if(b){b.hp=n;b.maxHp=n;}},
    hit:(hp=1)=>{const b=bricks.find(b=>b.alive);if(b)impact(b,hp);maybeLevel();syncHud();},
    triggerBounce:()=>{
      const a=bricks.find(b=>b.alive);if(!a)return;
      impact(a,damage);
      splash({wallReady:true,splashUsed:false},a.x+a.w/2,a.y+a.h/2);
      maybeLevel();syncHud();
    },
    chooseById:(id)=>choose(options.findIndex(x=>x.id===id)),
    setLevelUp:()=>{xp=xpNeeded;maybeLevel();syncHud();},
    state
  };
  reset();lastFrame=performance.now();requestAnimationFrame(frame);
})();
