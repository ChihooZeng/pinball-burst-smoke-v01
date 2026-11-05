"use strict";
/**
 * Standalone impact-feedback experiment. No gameplay clock manipulation.
 * Designed for Safari Canvas 2D and a deterministic, bounded particle budget.
 */
(function(root){
  function create({W=360,H=560,reducedMotion=false}={}){
    let mode="balanced",quality="full",shards=[],sparks=[],flashes=[],waveBursts=[],ghosts=[],pulses=[];
    let hitPulseAt=-100,screenFlash=0;
    let shakeAge=1,shakeDuration=.1,shakeStrength=0;
    let lastShakeAt=-100,lastGiantAt=-100,clock=0,shakeEvents=0,breakEvents=0;
    const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
    function intensity(){return mode==="bold"?2.35:mode==="balanced"?1.5:0;}
    function setQuality(next){quality=next==="lite"?"lite":"full";}
    function setMode(next){
      mode=reducedMotion?"off":(["off","balanced","bold"].includes(next)?next:"balanced");
      if(mode==="off"){shards=[];sparks=[];flashes=[];waveBursts=[];ghosts=[];pulses=[];screenFlash=0;shakeStrength=0;shakeAge=1;}
      return mode;
    }
    if(reducedMotion)mode="off";
    function random(min,max){return min+Math.random()*(max-min);}
    function addShake(level){
      if(!intensity()||clock-lastShakeAt<.085)return;
      lastShakeAt=clock;shakeAge=0;
      shakeDuration=level>=3?.17:level===2?.13:.105;
      // Preserve hierarchy: light break < combo < giant. Maximum canvas displacement < 5px.
      shakeStrength=clamp((level>=3?2.85:level===2?1.95:1.15)*intensity(),0,7.5);
      shakeEvents++;
    }
    function addSpark(x,y,angle,color,count){
      if(!intensity())return;
      const n=Math.ceil(count*intensity()*(quality==="lite"?.42:1));
      for(let i=0;i<n;i++){
        const a=angle+random(-.9,.9);
        const v=random(50,165);
        sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:random(.1,.19),
          maxLife:.19,color});
      }
      if(sparks.length>90)sparks.splice(0,sparks.length-90);
    }
    function flash(x,y,color,kind){
      if(!intensity())return;
      const duration=kind==="giant"?.24:kind==="combo"?.17:.14;
      flashes.push({x,y,color,age:0,duration,kind});
      if(flashes.length>24)flashes.splice(0,flashes.length-24);
    }
    function pulse(x,y,color,heavy=false){
      if(!intensity()||clock-hitPulseAt<.028)return;
      hitPulseAt=clock;
      pulses.push({x,y,color,age:0,duration:heavy?.23:.14,heavy});
      if(pulses.length>40)pulses.splice(0,pulses.length-40);
      if(heavy)screenFlash=Math.max(screenFlash,.06);
    }
    function onArmor(brick,impact=null){
      if(!intensity())return;
      const x=brick.x+brick.w/2,y=brick.y+brick.h/2;
      const v=impact||{vx:0,vy:-1};
      const norm=Math.max(1,Math.hypot(v.vx,v.vy));
      // Visual-only response: impulse and damped return. Never move the collider.
      brick.hitVisual={age:0,duration:.18,dirX:v.vx/norm,dirY:v.vy/norm};
      addSpark(x,y,-Math.PI/2,"#ffdfa7",6);
      flash(x,y,"#fff1c7","armor");
      pulse(x,y,"#e7fbff");
      addShake(1);
    }
    function applyBrickMotion(ctx,brick){
      if(!intensity()||!brick.hitVisual)return;
      const m=brick.hitVisual,t=clamp(m.age/m.duration,0,1);
      const damp=Math.pow(1-t,1.8);
      const wave=Math.sin(t*Math.PI*3.3);
      const strength=Math.min(1.85*intensity(),4.1);
      const dx=(m.dirX*.68+wave*.55)*damp*strength;
      const dy=(Math.max(-.45,Math.min(.45,m.dirY))*.45+wave*.18)*damp*strength;
      const tilt=Math.sin(t*Math.PI*3)*damp*.027*intensity();
      const squash=Math.sin(t*Math.PI)*damp*.063*intensity();
      const x=brick.x+brick.w/2,y=brick.y+brick.h/2;
      ctx.translate(x+dx,y+dy);ctx.rotate(tilt);
      ctx.scale(1+squash,1-squash*.65);ctx.translate(-x,-y);
    }
    function onBreak(brick,{combo=1,source="normal",impact=null}={}){
      if(!intensity())return;
      breakEvents++;
      const x=brick.x+brick.w/2,y=brick.y+brick.h/2;
      // For one-hit bricks, briefly retain a translucent compressed silhouette.
      // HP/scoring still change immediately; this is not a physics delay.
      if(source==="normal"||source==="splash"){
        const v=impact||{vx:0,vy:-1},norm=Math.max(1,Math.hypot(v.vx,v.vy));
        ghosts.push({x:brick.x,y:brick.y,w:brick.w,h:brick.h,color:brick.color,
          vx:v.vx/norm,vy:v.vy/norm,age:0,duration:.105});
        if(ghosts.length>32)ghosts.splice(0,ghosts.length-32);
      }
      const important=source==="giant"||combo>=3&&combo%3===0;
      const count=Math.ceil((important?9:5)*Math.min(1.55,intensity())*(quality==="lite"?.6:1));
      for(let i=0;i<count;i++){
        const angle=Math.PI*2*i/count+random(-.22,.22),speed=random(55,155)*(important?1.22:1);
        shards.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
          rot:random(-1,1),vr:random(-12,12),age:0,duration:random(.23,.39),
          w:random(3,6),h:random(3,7),color:brick.color});
      }
      if(shards.length>120)shards.splice(0,shards.length-120);
      flash(x,y,source==="giant"?"#ffe5a2":important?"#adf5e4":"#e1fbff",important?(source==="giant"?"giant":"combo"):"break");
      pulse(x,y,important?"#ffdda5":"#aafaff",important);
      addSpark(x,y,-Math.PI/2,important?"#ffe5af":"#c9f7ff",important?5:2);
      if(source==="giant"){
        if(clock-lastGiantAt>.095){lastGiantAt=clock;addShake(3);}
      }else if(source==="normal"||source==="splash"){
        // Normal bricks get a tiny camera nudge; combo breaks are more pronounced.
        addShake(important?3:2);
      }
    }
    function onSplash(center){
      if(!intensity())return;
      flash(center.x,center.y,"#b3c6ff","combo");
      pulse(center.x,center.y,"#d8caff",true);
      addSpark(center.x,center.y,0,"#cbd7ff",3);
    }
    function onGiant(x,y){
      if(!intensity())return;
      addShake(3);
      flash(x,y,"#ffda90","giant");
      waveBursts.push({x,y,age:0,duration:.25});
      pulse(x,y,"#ffe4af",true);
      if(waveBursts.length>5)waveBursts.shift();
    }
    function update(dt,bricks=null){
      if(!intensity())return;
      clock+=dt;shakeAge=Math.min(1,shakeAge+dt);
      screenFlash=Math.max(0,screenFlash-dt);
      for(const p of shards){
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=170*dt;p.rot+=p.vr*dt;
        p.age+=dt;
      }
      for(const p of sparks){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
      for(const p of flashes)p.age+=dt;
      for(const p of pulses)p.age+=dt;
      for(const p of waveBursts)p.age+=dt;
      for(const p of ghosts)p.age+=dt;
      if(bricks)for(const b of bricks)if(b.hitVisual){
        b.hitVisual.age+=dt;
        if(b.hitVisual.age>=b.hitVisual.duration)b.hitVisual=null;
      }
      ghosts=ghosts.filter(p=>p.age<p.duration);
      shards=shards.filter(p=>p.age<p.duration);
      sparks=sparks.filter(p=>p.life>0);
      flashes=flashes.filter(p=>p.age<p.duration);
      pulses=pulses.filter(p=>p.age<p.duration);
      waveBursts=waveBursts.filter(p=>p.age<p.duration);
    }
    function applyCamera(ctx){
      if(!intensity()||shakeAge>=shakeDuration)return;
      const p=1-shakeAge/shakeDuration;
      const decay=p*p;
      const x=Math.sin(shakeAge*162)*shakeStrength*decay;
      const y=Math.cos(shakeAge*141)*shakeStrength*decay*.62;
      ctx.translate(x,y);
    }
    function draw(ctx){
      if(!intensity())return;
      ctx.save();
      for(const g of ghosts){if(quality==="lite")continue;
        const t=clamp(g.age/g.duration,0,1),decay=1-t;
        ctx.save();ctx.translate(g.x+g.w/2,g.y+g.h/2);
        ctx.translate(g.vx*t*2.2,g.vy*t*2.2);
        ctx.scale(1+decay*.06,1-decay*.07);
        ctx.globalAlpha=.31*decay;
        ctx.fillStyle=g.color;ctx.fillRect(-g.w/2,-g.h/2,g.w,g.h);
        ctx.globalAlpha=.18*decay;
        ctx.fillStyle="#f2ffff";ctx.fillRect(-g.w/2,-g.h/2,g.w,g.h);
        ctx.restore();
      }
      for(const e of flashes){
        const t=clamp(e.age/e.duration,0,1),radius=(e.kind==="giant"?33:e.kind==="combo"?25:17)*(1+t*.9);
        ctx.globalAlpha=(e.kind==="armor"?.09:.15)*(1-t)*intensity();
        ctx.fillStyle=e.color;
        ctx.beginPath();ctx.arc(e.x,e.y,radius,0,Math.PI*2);ctx.fill();
      }
      // Bright local contact rings communicate each hit even on HP-heavy armor.
      for(const e of pulses){
        const t=clamp(e.age/e.duration,0,1),fade=Math.pow(1-t,1.5);
        ctx.save();ctx.globalAlpha=fade*(e.heavy?.9:.7);
        ctx.strokeStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=quality==="lite"?0:7*fade;
        ctx.lineWidth=(e.heavy?3.8:2.4)*fade+.5;
        ctx.beginPath();ctx.arc(e.x,e.y,(e.heavy?10:5)+t*(e.heavy?33:18),0,Math.PI*2);ctx.stroke();
        ctx.globalAlpha=fade*.75;ctx.fillStyle="#ffffff";
        ctx.beginPath();ctx.arc(e.x,e.y,(e.heavy?5:3)*(1-t*.75),0,Math.PI*2);ctx.fill();
        ctx.restore();
      }
      if(screenFlash>0){
        ctx.globalAlpha=Math.min(.075,screenFlash*.8);
        ctx.fillStyle="#f0ffff";ctx.fillRect(0,0,W,H);
      }
      for(const e of shards){
        const t=e.age/e.duration;
        ctx.globalAlpha=clamp(1-t*t,0,1);
        ctx.fillStyle=e.color;ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.rot);
        ctx.fillRect(-e.w/2,-e.h/2,e.w,e.h);ctx.restore();
      }
      for(const e of sparks){
        ctx.globalAlpha=clamp(e.life/e.maxLife,0,1)*.9;
        ctx.strokeStyle=e.color;ctx.lineWidth=1.8;
        ctx.beginPath();ctx.moveTo(e.x,e.y);
        ctx.lineTo(e.x-e.vx*.04,e.y-e.vy*.04);ctx.stroke();
      }
      for(const e of waveBursts){
        const t=e.age/e.duration;
        ctx.globalAlpha=(1-t)*.6;
        ctx.strokeStyle="#ffe7b4";ctx.lineWidth=3.1*(1-t)+.6;
        ctx.beginPath();ctx.arc(e.x,e.y,12+t*70,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }
    // V4 引擎会调用这一层（snap 模式的砖面白闪）；M2.5 重击档没有这一层，
    // 这里保留空实现只为接口兼容，不改变 M2.5 的任何反馈参数。
    function drawBrickImpact(){}
    function snapshot(){return {mode,shards:shards.length,sparks:sparks.length,flashes:flashes.length,
      waves:waveBursts.length,ghosts:ghosts.length,pulses:pulses.length,quality,shakeEvents,breakEvents,shakeStrength,
      max:{shards:120,sparks:90,flashes:24,waves:5,ghosts:32,pulses:40}};}
    return {setMode,setQuality,get mode(){return mode;},onArmor,applyBrickMotion,drawBrickImpact,onBreak,onSplash,onGiant,update,applyCamera,draw,snapshot};
  }
  root.PinballJuice={create};
  if(typeof module!=="undefined"&&module.exports)module.exports={create};
})(typeof window!=="undefined"?window:globalThis);
