"use strict";
(() => {
  const W = 360, H = 560;
  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.querySelector("#score");
  const stateEl = document.querySelector("#stateText");
  const overlay = document.querySelector("#overlay");
  const shooter = {x:W/2,y:H-37};
  const brickColors = ["#4a9fe3","#56c4b0","#987fdd"];
  let bricks, ball, particles, destroyed, aim, aiming, activePointer, gameWon, shotTime, lastFrame, audio;
  function sound(frequency=380,duration=.045) {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if(audio.state==="suspended") audio.resume();
      const osc=audio.createOscillator(),gain=audio.createGain();
      osc.type="sine";osc.frequency.setValueAtTime(frequency,audio.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80,frequency*.6),audio.currentTime+duration);
      gain.gain.setValueAtTime(.045,audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
      osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);
    }catch(_){}
  }
  function setState(s){stateEl.textContent=s;}
  function reset(){
    bricks=[];
    for(let r=0;r<3;r++)for(let c=0;c<5;c++)bricks.push({
      x:23+c*64,y:78+r*43,w:57,h:32,alive:true,color:brickColors[r]
    });
    ball=null;particles=[];destroyed=0;aim=0;aiming=false;activePointer=null;gameWon=false;shotTime=0;
    scoreEl.textContent="0";overlay.classList.add("hidden");
    setState("拖动瞄准，松开发射");
  }
  function getPos(e){
    const r=canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};
  }
  function pointAim(p){
    // Clamp to upward shots; 0 means vertical, positive is right.
    const dx=p.x-shooter.x, dy=Math.min(-35,p.y-shooter.y);
    aim=Math.max(-1.25,Math.min(1.25,Math.atan2(dx,-dy)));
  }
  function fire(){
    if(gameWon||ball)return;
    const speed=350;
    ball={x:shooter.x,y:shooter.y-17,vx:Math.sin(aim)*speed,vy:-Math.cos(aim)*speed,r:7,trail:[],life:0};
    shotTime=performance.now();
    setState("弹球反弹中…");sound(460,.06);
  }
  function impact(x,y,color,n=8){
    for(let i=0;i<n;i++){const t=Math.random()*Math.PI*2,s=42+Math.random()*105;particles.push({x,y,vx:Math.cos(t)*s,vy:Math.sin(t)*s,life:.36,color});}
  }
  function finish(){
    gameWon=true;ball=null;overlay.classList.remove("hidden");setState("全部击碎！");
    sound(660,.13);
  }
  function update(dt){
    if(ball&&!gameWon){
      const steps=4,step=dt/steps;
      for(let i=0;i<steps&&ball;i++){
        const b=ball,oldX=b.x,oldY=b.y;
        b.x+=b.vx*step;b.y+=b.vy*step;b.life+=step;
        if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);sound(220,.025);}
        if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx);sound(220,.025);}
        if(b.y<b.r+4){b.y=b.r+4;b.vy=Math.abs(b.vy);sound(230,.025);}
        for(const brick of bricks){
          if(!brick.alive)continue;
          const closestX=Math.max(brick.x,Math.min(b.x,brick.x+brick.w));
          const closestY=Math.max(brick.y,Math.min(b.y,brick.y+brick.h));
          const dx=b.x-closestX,dy=b.y-closestY;
          if(dx*dx+dy*dy>b.r*b.r)continue;
          brick.alive=false;destroyed++;scoreEl.textContent=String(destroyed);
          const side=(oldX+b.r<=brick.x||oldX-b.r>=brick.x+brick.w);
          if(side){b.vx*=-1;b.x=oldX;}else{b.vy*=-1;b.y=oldY;}
          impact(brick.x+brick.w/2,brick.y+brick.h/2,brick.color);
          sound(330+destroyed*26,.06);
          if(destroyed===bricks.length){finish();break;}
          break;
        }
        if(!ball)break;
        if(b.y>H+12||b.life>11){
          ball=null;setState("调整角度，再次发射");break;
        }
      }
      if(ball){
        ball.trail.unshift({x:ball.x,y:ball.y});
        if(ball.trail.length>12)ball.trail.pop();
      }
    }
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt;});
    particles=particles.filter(p=>p.life>0);
  }
  function rect(x,y,w,h,r){
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  }
  function draw(t){
    ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,"#0b1c34");bg.addColorStop(1,"#0b1323");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#ffffff08";ctx.lineWidth=1;
    for(let x=0;x<=W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<=H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    for(const brick of bricks){
      if(!brick.alive)continue;
      ctx.shadowColor=brick.color;ctx.shadowBlur=8;ctx.fillStyle=brick.color;
      rect(brick.x,brick.y,brick.w,brick.h,6);ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle="#ffffff44";rect(brick.x+4,brick.y+4,brick.w-8,4,2);ctx.fill();
    }
    ctx.fillStyle="#a9bfd540";ctx.fillRect(0,H-78,W,1);
    if(!ball&&!gameWon){
      const vx=Math.sin(aim),vy=-Math.cos(aim);
      ctx.save();ctx.setLineDash([7,9]);ctx.lineWidth=2;ctx.strokeStyle="#9eeaffaa";
      ctx.beginPath();ctx.moveTo(shooter.x,shooter.y-15);
      ctx.lineTo(shooter.x+vx*285,shooter.y-15+vy*285);ctx.stroke();ctx.restore();
    }
    ctx.save();ctx.translate(shooter.x,shooter.y);ctx.rotate(aim);
    ctx.shadowColor="#62ebff";ctx.shadowBlur=17;ctx.fillStyle="#3b9eaf";
    rect(-16,-13,32,31,10);ctx.fill();
    ctx.fillStyle="#b9efff";rect(-5,-26,10,25,4);ctx.fill();ctx.restore();
    if(ball){
      for(let i=ball.trail.length-1;i>=0;i--){
        const p=ball.trail[i],alpha=(ball.trail.length-i)/ball.trail.length;
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.5,ball.r*alpha*.75),0,Math.PI*2);
        ctx.fillStyle="rgba(106,229,255,"+(.13*alpha)+")";ctx.fill();
      }
      ctx.shadowColor="#a3f4ff";ctx.shadowBlur=20;ctx.fillStyle="#e5fdff";
      ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    for(const p of particles){ctx.globalAlpha=Math.max(0,Math.min(1,p.life/.36));ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);}
    ctx.globalAlpha=1;
    ctx.fillStyle="#9dbbd0";ctx.font="12px system-ui";
    ctx.textAlign="center";ctx.fillText(ball?"等待弹珠返回底部":gameWon?"全部击碎！":"拖动瞄准 · 松开发射",W/2,H-10);
  }
  canvas.addEventListener("pointerdown",e=>{
    if(gameWon)return;
    e.preventDefault();activePointer=e.pointerId;aiming=true;
    if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);
    pointAim(getPos(e));setState(ball?"弹球反弹中…":"松开发射");
  });
  canvas.addEventListener("pointermove",e=>{
    if(!aiming||e.pointerId!==activePointer)return;
    e.preventDefault();pointAim(getPos(e));
  });
  canvas.addEventListener("pointerup",e=>{
    if(!aiming||e.pointerId!==activePointer)return;
    e.preventDefault();pointAim(getPos(e));aiming=false;activePointer=null;fire();
  });
  canvas.addEventListener("pointercancel",()=>{aiming=false;activePointer=null;});
  document.querySelector("#fire").addEventListener("click",fire);
  document.querySelector("#reset").addEventListener("click",reset);
  document.querySelector("#again").addEventListener("click",reset);
  window.addEventListener("keydown",e=>{
    if(e.code==="ArrowLeft"){aim=Math.max(-1.25,aim-.09);e.preventDefault();}
    if(e.code==="ArrowRight"){aim=Math.min(1.25,aim+.09);e.preventDefault();}
    if(e.code==="Space"){fire();e.preventDefault();}
  });
  function frame(now){
    const dt=Math.min(.04,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    update(dt);draw(now);requestAnimationFrame(frame);
  }
  reset();lastFrame=performance.now();requestAnimationFrame(frame);
})();