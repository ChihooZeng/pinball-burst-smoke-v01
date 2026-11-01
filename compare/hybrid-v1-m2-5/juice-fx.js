"use strict";
/**
 * Visual game feel only. No physical vibration, no gameplay clock manipulation.
 * Designed for Safari Canvas 2D and a deterministic, bounded particle budget.
 */
(function(root){
  function create({W=360,H=560,reducedMotion=false}={}){
    let mode="balanced",shards=[],sparks=[],flashes=[],waveBursts=[],ghosts=[];
    let shakeAge=1,shakeDuration=.1,shakeStrength=0;
    let lastShakeAt=-100,lastGiantAt=-100,clock=0,shakeEvents=0,breakEvents=0;
    const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
    function intensity(){return mode==="bold"?2.05:mode==="balanced"?1.5:0;}
    function setMode(next){
      mode=reducedMotion?"off":(["off","balanced","bold"].includes(next)?next:"balanced");
      if(mode==="off"){shards=[];sparks=[];flashes=[];waveBursts=[];ghosts=[];shakeStrength=0;shakeAge=1;}
      return mode;
    }
    if(reducedMotion)mode="off";
    function random(min,max){return min+Math.random()*(max-min);}
    function addShake(level){
      if(!intensity()||clock-lastShakeAt<.11)return;
      lastShakeAt=clock;shakeAge=0;
      shakeDuration=level>=3?.14:.095;
      // Preserve hierarchy: light break < combo < giant. Maximum canvas displacement < 5px.
      shakeStrength=clamp((level>=3?2.25:level===2?1.35:.82)*intensity(),0,4.7);
      shakeEvents++;
    }
    function addSpark(x,y,angle,color,count){
      if(!intensity())return;
      const n=Math.ceil(count*intensity());
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
    function onArmor(brick,impact=null){
      if(!intensity())return;
      const x=brick.x+brick.w/2,y=brick.y+brick.h/2;
      const v=impact||{vx:0,vy:-1};
      const norm=Math.max(1,Math.hypot(v.vx,v.vy));
      // Visual-only response: impulse and damped return. Never move the collider.
      brick.hitVisual={age:0,duration:.18,dirX:v.vx/norm,dirY:v.vy/norm};
      addSpark(x,y,-Math.PI/2,"#ffdfa7",3);
      flash(x,y,"#ffe0a5","armor");
    }
    function applyBrickMotion(ctx,brick){
      if(!intensity()||!brick.hitVisual)return;
      const m=brick.hitVisual,t=clamp(m.age/m.duration,0,1);
      const damp=Math.pow(1-t,1.8);
      const wave=Math.sin(t*Math.PI*3.3);
      const strength=Math.min(1.6*intensity(),3.25);
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
      const count=Math.ceil((important?9:5)*Math.min(1.55,intensity()));
      for(let i=0;i<count;i++){
        const angle=Math.PI*2*i/count+random(-.22,.22),speed=random(55,155)*(important?1.22:1);
        shards.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
          rot:random(-1,1),vr:random(-12,12),age:0,duration:random(.23,.39),
          w:random(3,6),h:random(3,7),color:brick.color});
      }
      if(shards.length>120)shards.splice(0,shards.length-120);
      flash(x,y,source==="giant"?"#ffe5a2":important?"#adf5e4":"#cdefff",important?(source==="giant"?"giant":"combo"):"break");
      addSpark(x,y,-Math.PI/2,important?"#ffe5af":"#c9f7ff",important?5:2);
      if(source==="giant"){
        if(clock-lastGiantAt>.095){lastGiantAt=clock;addShake(3);}
      }else if(source==="normal"||source==="splash"){
        // Normal bricks get a tiny camera nudge; combo breaks are more pronounced.
        addShake(important?2:1);
      }
    }
    function onSplash(center){
      if(!intensity())return;
      flash(center.x,center.y,"#b3c6ff","combo");
      addSpark(center.x,center.y,0,"#cbd7ff",3);
    }
    function onGiant(x,y){
      if(!intensity())return;
      addShake(3);
      flash(x,y,"#ffda90","giant");
      waveBursts.push({x,y,age:0,duration:.25});
      if(waveBursts.length>5)waveBursts.shift();
    }
    function update(dt,bricks=null){
      if(!intensity())return;
      clock+=dt;shakeAge=Math.min(1,shakeAge+dt);
      for(const p of shards){
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=170*dt;p.rot+=p.vr*dt;
        p.age+=dt;
      }
      for(const p of sparks){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
      for(const p of flashes)p.age+=dt;
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
      for(const g of ghosts){
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
    function snapshot(){return {mode,shards:shards.length,sparks:sparks.length,flashes:flashes.length,
      waves:waveBursts.length,ghosts:ghosts.length,shakeEvents,breakEvents,shakeStrength,
      max:{shards:120,sparks:90,flashes:24,waves:5,ghosts:32}};}
    return {setMode,get mode(){return mode;},onArmor,applyBrickMotion,onBreak,onSplash,onGiant,update,applyCamera,draw,snapshot};
  }
  root.PinballJuice={create};
  if(typeof module!=="undefined"&&module.exports)module.exports={create};
})(typeof window!=="undefined"?window:globalThis);
