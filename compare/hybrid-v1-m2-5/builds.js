/* M1: permanent build state and effective player-facing changes. No DOM dependency. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.PinballBuilds=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const CONFIG={maxBalls:32,maxWaves:20,productWaves:50,baseDamage:1,firstShot:.12,
  arcCooldown:.30,arcEvery:[0,2,1,1],arcTargets:[0,2,3,4],arcRange:[0,145,165,180],arcDamage:[0,2,4,6],focusDamage:6,bossArcDamage:4,
  splitEvery:[0,2,2,1],splitCount:[0,1,2,2],splitSpread:.45,stormSpread:.8,huntTurns:2,childTTL:4.1,
  gunInterval:[0,.35,.27,.20],gunTTL:4.1,lineInterval:.17,fanInterval:.18,fanAngle:.28,fanPeriod:1.8,gunMinInterval:.12,gunRateStep:.012,auxGunInterval:.70,auxGunMinInterval:.55,
  normalInterval:.86,normalMinInterval:.55,normalRateStep:.075,normalTTL:8.4,speed:330,speedStep:15,lifeStep:.7,gunLifeStep:.2,fallScale:.84,
  flags:{earlyBonus:false,bossBonus:false,rareEffects:false,ultimate:false,temporaryBuffs:true},rarityWeights:{common:1,rare:0,epic:0,legendary:0}};
 const DEFS={};
 function def(id,name,family,role,maxRank,extra={}){DEFS[id]={id,name,family,role,maxRank,rarity:'common',prerequisites:[],minClearedWave:0,excludedWith:[],...extra};}
 def('split','碎星裂变','split','core',3);def('arc','电弧印记','arc','core',3);def('gun','高速供弹','gun','core',3);
 for(const [id,name,cap] of [['rate','射速训练',5],['power','火力强化',3],['speed','弹速训练',3],['life','弹跳续航',3]])def(id,name,'base','base',cap);
 for(const [id,name] of [['hunter','追猎弯弹'],['drill','钻头穿阵'],['shock','震荡核心'],['bank','撞墙蓄势']])def(id,name,'auxiliary','auxiliary',2);
 for(const [f,names] of [['split',['星海风暴','猎星裂变']],['arc',['雷网蔓延','雷霆聚能']],['gun',['直线压制','扇形扫射']]])
  ['a','b'].forEach((side,i)=>def(f+'-'+side,names[i],f,'branch',2,{minClearedWave:4,prerequisites:[{id:f,rank:2}],excludedWith:[f+'-'+(side==='a'?'b':'a')]}));
 const BUFFS={power:{name:'急速',duration:15,description:'炮台射速 +10%'},speed:{name:'疾行',duration:30,description:'弹球速度 +15%'}};
 const copy=s=>JSON.parse(JSON.stringify(s));
 const has=id=>Object.hasOwn(DEFS,id);
 function createState(seed=2701){return {seed:seed>>>0,rng:seed>>>0,seedAbility:null,growthFocus:null,coreFocus:null,coreBranch:null,coreUltimate:null,ranks:{},routeWeights:{split:0,arc:0,gun:0},choiceHistory:[],temporaryBuffs:[],recovery:{power:0,speed:0,life:0}};}
 function random(s){s.rng=(s.rng+0x6D2B79F5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
 function preferred(s){return s.coreFocus||s.growthFocus||s.seedAbility;}
 function effectiveRank(s,id){return s.ranks[id]||0;}
 function tuning(s){const gun=effectiveRank(s,'gun'),isGun=gun>0&&preferred(s)==='gun',branch=s.coreBranch;
  let interval=isGun?(branch==='gun-a'?(CONFIG.lineInterval-(s.ranks['gun-a']>1?.02:0)):branch==='gun-b'?(CONFIG.fanInterval-(s.ranks['gun-b']>1?.02:0)):CONFIG.gunInterval[gun]):gun?CONFIG.auxGunInterval:CONFIG.normalInterval;
  interval=Math.max(isGun?CONFIG.gunMinInterval:gun?CONFIG.auxGunMinInterval:CONFIG.normalMinInterval,interval-(s.ranks.rate||0)*(gun?CONFIG.gunRateStep:CONFIG.normalRateStep));
  return {interval,isGun,ttl:(isGun?CONFIG.gunTTL:CONFIG.normalTTL)+(s.ranks.life||0)*(isGun?CONFIG.gunLifeStep:CONFIG.lifeStep),speed:CONFIG.speed+(s.ranks.speed||0)*CONFIG.speedStep,damage:CONFIG.baseDamage+(s.ranks.power||0),splitRank:effectiveRank(s,'split'),arcRank:effectiveRank(s,'arc')};
 }
 function effects(s){const t=tuning(s),r=s.ranks,b=s.coreBranch,split=t.splitRank,arc=t.arcRank;
  return {interval:t.interval,damage:t.damage,speed:t.speed,ttl:t.ttl,
   splitCount:split?(b==='split-a'?(s.ranks['split-a']>1?4:3):b==='split-b'?2:CONFIG.splitCount[split]):0,splitEvery:CONFIG.splitEvery[split],splitSpread:split?(b==='split-a'?CONFIG.stormSpread:CONFIG.splitSpread):0,childTurns:b==='split-b'?CONFIG.huntTurns+(s.ranks['split-b']>1?1:0):0,splitPursuit:Math.max(0,split-1),gunPressure:preferred(s)==='gun'?Math.max(0,(r.gun||0)-1):0,
   arcEvery:CONFIG.arcEvery[arc],arcTargets:arc?(b==='arc-b'?0:b==='arc-a'?(s.ranks['arc-a']>1?5:4):CONFIG.arcTargets[arc]):0,arcRange:arc&&b!=='arc-b'?CONFIG.arcRange[arc]:0,arcDamage:arc&&b!=='arc-b'?CONFIG.arcDamage[arc]:0,arcArmorBonus:arc&&b!=='arc-b'?arc+1:0,arcSolo:arc?(b==='arc-b'?CONFIG.focusDamage:CONFIG.bossArcDamage)+(b==='arc-a'?(s.ranks['arc-a']>1?5:4):CONFIG.arcTargets[arc])*arc+(b==='arc-b'&&s.ranks['arc-b']>1?3:0):0,arcNet:b==='arc-a',arcFocus:b==='arc-b',
   hunter:r.hunter||0,drillEvery:r.drill?(r.drill===1?4:3):0,drillPierces:r.drill?(r.drill===1?3:5):0,drillDamage:r.drill?r.drill+1:0,
   shockEvery:r.shock?(r.shock===1?4:3):0,shockTargets:r.shock?(r.shock===1?2:4):0,shockDamage:r.shock||0,shockRadius:r.shock?(r.shock===1?75:95):0,
   bankStep:r.bank||0,bankCap:(r.bank||0)*2,fan:b==='gun-b',line:b==='gun-a'};
 }
 function apply(s,id){const d=DEFS[id];s.ranks[id]=(s.ranks[id]||0)+1;
  if(d.role==='core'){s.routeWeights[id]++;if(s.ranks[id]===2&&!s.growthFocus)s.growthFocus=id;}
  if(d.role==='branch'){s.coreFocus=d.family;s.coreBranch=id;}
 }
 const labels={splitPursuit:'少目标子球追击次数',gunPressure:'连续命中破甲上限',damage:'撞击伤害',speed:'弹球速度',ttl:'弹球留场时间',splitCount:'每次裂变',splitEvery:'裂变所需撞击',splitSpread:'裂变散开范围',childTurns:'子球撞墙追猎',arcEvery:'放电所需命中',arcTargets:'电弧传播目标',arcRange:'电弧传播距离',arcDamage:'电弧伤害',arcArmorBonus:'电弧对Boss及护甲额外伤害',arcSolo:'单体放电伤害',hunter:'撞墙追猎次数',drillEvery:'穿透球发射间隔',drillPierces:'穿透次数',drillDamage:'穿透球额外伤害',shockEvery:'震荡所需击碎',shockTargets:'震荡目标',shockDamage:'震荡伤害',shockRadius:'震荡范围',bankStep:'每次侧墙蓄势',bankCap:'下次撞击蓄势上限'};
 const units={splitCount:'颗',splitEvery:'次',childTurns:'次',arcEvery:'次',arcTargets:'个',hunter:'次',drillEvery:'发',drillPierces:'次',shockEvery:'块',shockTargets:'个'};
 const fmt=n=>Number(n.toFixed(1)).toString();
 function changes(before,after){const ds=[];
  if(Math.abs(before.interval-after.interval)>1e-9){const value=(before.interval/after.interval-1)*100;ds.push({key:'rate',value,text:'炮台射速 '+(value>0?'+':'')+fmt(value)+'%'});}
  for(const k of Object.keys(labels))if(before[k]!==after[k]){
   let value=after[k]-before[k],text;
   if(['damage','speed','ttl','splitSpread','arcRange','shockRadius'].includes(k)&&before[k]>0){value=(after[k]/before[k]-1)*100;text=labels[k]+' '+(value>0?'+':'')+fmt(value)+'%';}
   else text=labels[k]+' '+(value>0?'+':'')+fmt(value)+(units[k]||'');
   ds.push({key:k,value,text});
  }
  for(const [k,text] of [['arcNet','获得跨目标跳传'],['arcFocus','改为命中目标集中放电'],['fan','获得扇面逐发扫射'],['line','获得直线集中压制']])if(after[k]&&!before[k])ds.push({key:k,value:1,text});
  return ds;
 }
 function abilityText(s,id){const e=effects(s);return id==='split'?`弹球每撞砖${e.splitEvery}次，分裂出${e.splitCount}颗小球`:id==='arc'?`每击中${e.arcEvery}次，闪电攻击附近${e.arcTargets}块砖，每块${e.arcDamage}伤害；Boss及护甲再+${e.arcArmorBonus}；击碎可续传`:'炮台快速连续发射弹球';}
 function deltasFor(s,id,t,before,after){const ds=changes(before,after);return DEFS[id].role==='core'&&!s.ranks[id]?[{key:'ability',value:1,text:'获得新能力：'+abilityText(t,id)},...ds.filter(d=>['rate','damage','speed','ttl'].includes(d.key))]:ds;}
 function preview(s,id){if(!has(id))return null;const t=copy(s),before=effects(s);apply(t,id);const after=effects(t);return {before,after,deltas:deltasFor(s,id,t,before,after)};}
 function eligible(s,wave){if(!s.seedAbility)return [];return Object.values(DEFS).filter(d=>{
  const n=s.ranks[d.id]||0;if(n>=d.maxRank||wave<d.minClearedWave||!d.prerequisites.every(p=>(s.ranks[p.id]||0)>=p.rank)||d.excludedWith.some(id=>s.ranks[id]))return false;
  if(d.role==='branch'&&(d.family!==s.growthFocus||(s.coreBranch&&s.coreBranch!==d.id)||(!s.coreBranch&&s.coreFocus)||(n>=1&&wave<11)))return false;
  if(d.role==='core'){
   if(!n&&['split','arc','gun'].filter(id=>s.ranks[id]).length>=2)return false;
   if(n&&s.growthFocus&&d.id!==s.growthFocus)return false;
  }
  return preview(s,d.id).deltas.length>0;
 }).map(d=>d.id);}
 function seed(s,id,wave=0){if(s.seedAbility||!has(id)||DEFS[id].role!=='core')return false;const before=effects(s),previous=copy(s);s.seedAbility=id;apply(s,id);const after=effects(s);s.choiceHistory.push({wave,id,kind:wave>0?'upgrade':'seed',before,after,deltas:deltasFor(previous,id,s,before,after)});return true;}
 function choose(s,id,wave){if(!s.seedAbility)return wave>=1&&['split','arc','gun'].includes(id)?seed(s,id,wave):false;if(!has(id)||!eligible(s,wave).includes(id))return false;const p=preview(s,id);apply(s,id);s.choiceHistory.push({wave,id,kind:'upgrade',...p});return true;}
 function offer(s,wave){if(!s.seedAbility)return ['split','arc','gun'];const pool=eligible(s,wave),out=[],add=id=>{if(pool.includes(id)&&!out.includes(id))out.push(id);},pick=list=>list.length?list[Math.floor(random(s)*list.length)]:null;
  const branches=pool.filter(id=>DEFS[id].role==='branch');if(branches.length)branches.forEach(add);else add(preferred(s));
  add(pick(pool.filter(id=>DEFS[id].role==='base')));
  if(out.length<3)add(pick(pool.filter(id=>['core','auxiliary'].includes(DEFS[id].role)&&!out.includes(id))));
  while(out.length<3){const left=pool.filter(id=>!out.includes(id));if(!left.length)break;add(pick(left));}return out;
 }
 function effectText(s,id){const e=effects(s),n=s.ranks[id]||0;
  if(id==='split')return `${e.splitEvery}次撞击生成${e.splitCount}颗子球；每父球一次，子球不再裂变；少目标时子球最多${e.splitPursuit}次精准追击`;
  if(id==='arc')return e.arcFocus?`命中目标集中放电${e.arcSolo}伤害`:`每${e.arcEvery}次命中，传播${e.arcTargets}目标×${e.arcDamage}伤害；对Boss/护甲额外+${e.arcArmorBonus}；击碎可续传，单次最多6目标`;
  if(id==='gun')return `真实逐发 ${fmt(1/e.interval)}发/秒；留场${fmt(e.ttl)}秒；同目标2秒内连续命中，每3击后破甲+1，最多+${e.gunPressure}`;
  if(id==='bank')return `侧墙反弹蓄势+${e.bankStep}，下次撞击最多+${e.bankCap}，命中消耗`;
  if(id==='hunter')return `每球${e.hunter}次侧墙后追猎`;
  if(id==='drill')return `每${e.drillEvery}发一颗穿透球，${e.drillPierces}次穿透、额外${e.drillDamage}伤害`;
  if(id==='shock')return `直接击碎${e.shockEvery}块（穿透球${n===1?3:2}块）震荡${e.shockTargets}目标×${e.shockDamage}伤害`;
  if(DEFS[id].role==='branch')return {'split-a':'扩大裂变散角；孤立Boss收窄','split-b':'子球撞墙额外2次有限转向','arc-a':'在不同目标间跳传','arc-b':'改为集中单体放电','gun-a':'集中直线逐发','gun-b':'扇面连续逐发'}[id];
  return {rate:`总射速${fmt(1/e.interval)}发/秒`,power:`总撞击伤害${e.damage}`,speed:`球速${e.speed}`,life:`留场${fmt(e.ttl)}秒`}[id]||'';
 }
 function card(s,id){
 const d=DEFS[id];if(!d)return {title:'暂无强化',description:''};
 if((s.ranks[id]||0)>=d.maxRank)return {title:d.name,description:'已满级'};
 if(!s.seedAbility){const t=copy(s);seed(t,id);return {title:d.name,description:'新能力：'+abilityText(t,id)};}
 const p=preview(s,id);if(!p)return {title:d.name,description:'已满级'};const a=p.before,z=p.after,delta=k=>z[k]-a[k],num=n=>fmt(n);
 if(d.role==='branch'&&s.ranks[id])return {title:d.name,description:{'split-a':'每次裂变额外 +1颗小球','split-b':'裂变小球撞墙追猎 +1次','arc-a':'电弧额外跳向 +1个目标','arc-b':'集中放电伤害 +3','gun-a':'直线射速 +13.3%','gun-b':'扇面射速 +12.5%'}[id]};
 if(d.role==='branch')return {title:d.name,description:{
  'split-a':'一次分裂3颗小球，散射更广（替换原效果）',
  'split-b':'小球撞墙后可额外追踪目标2次（替换原效果）',
  'arc-a':'闪电改为连续跳向附近目标（与另一分支二选一）',
  'arc-b':'闪电改为集中攻击命中目标（替换群攻）',
  'gun-a':'炮台改为高速直线连续射击（与另一分支二选一）',
  'gun-b':'炮台改为高速扇形连续扫射（与另一分支二选一）'
 }[id]};
 if(id==='power')return {title:d.name,description:'普通球每次撞砖伤害 +'+num(delta('damage'))};
 if(id==='rate')return {title:d.name,description:'炮台射速 +'+num((a.interval/z.interval-1)*100)+'%'};
 if(id==='speed')return {title:d.name,description:'弹球飞行速度 +'+num((z.speed/a.speed-1)*100)+'%'};
 if(id==='life')return {title:d.name,description:'弹球留场时间 +'+num(delta('ttl'))+'秒'};
 if(id==='split')return {title:d.name,description:delta('splitCount')>0?'每次分裂多 '+num(delta('splitCount'))+'颗小球':delta('splitEvery')<0?'升级后首次撞砖就能分裂':'小球追踪次数 +'+num(delta('splitPursuit'))};
 if(id==='arc')return {title:d.name,description:(delta('arcEvery')<0?'每次撞砖就放电；':'')+'闪电目标 +'+num(Math.max(0,delta('arcTargets')))+'；伤害 +'+num(Math.max(0,delta('arcDamage')))+'；对Boss/护甲 +'+num(Math.max(0,delta('arcArmorBonus')))};
 if(id==='gun')return {title:d.name,description:delta('gunPressure')>0?'连续命中同一目标，可多造成 '+num(delta('gunPressure'))+'点伤害':'炮台射速 +'+num((a.interval/z.interval-1)*100)+'%'};
 if(id==='hunter')return {title:d.name,description:'撞墙后追踪目标次数 +'+num(delta('hunter'))};
 if(id==='bank')return {title:d.name,description:'每次撞侧墙，下一击伤害额外 +'+num(delta('bankStep'))};
 if(id==='drill')return {title:d.name,description:'穿透球最多再穿过 '+num(delta('drillPierces'))+'块砖'};
 if(id==='shock')return {title:d.name,description:'打碎砖块时，震荡额外命中 '+num(delta('shockTargets'))+'个目标'};
 const chosen=p.deltas.find(x=>x.value>0)||p.deltas[0];
 return {title:d.name,description:chosen?chosen.text:'强化当前能力'};
}
 function grantBuff(s,id){if(!Object.hasOwn(BUFFS,id))return false;let b=s.temporaryBuffs.find(b=>b.id===id);if(!b){b={id,remaining:0};s.temporaryBuffs.push(b);}b.remaining=BUFFS[id].duration;return true;}
 function tickBuffs(s,dt){if(!(dt>0))return;for(const b of s.temporaryBuffs)b.remaining=Math.max(0,b.remaining-dt);s.temporaryBuffs=s.temporaryBuffs.filter(b=>b.remaining>1e-8);}
 function buffModifiers(s){return {damage:0,rate:s.temporaryBuffs.some(b=>b.id==='power')?1.10:1,speed:s.temporaryBuffs.some(b=>b.id==='speed')?1.15:1};}
 function summary(s){return {stats:tuning(s),effects:effects(s),focus:preferred(s),branch:s.coreBranch,skills:Object.keys(s.ranks).map(id=>({id,name:DEFS[id].name,rank:s.ranks[id],effect:effectText(s,id)})),history:copy(s.choiceHistory),buffs:s.temporaryBuffs.map(b=>({...b,...BUFFS[b.id]})),modifiers:buffModifiers(s)};}
 return {CONFIG,DEFS,BUFFS,createState,seed,random,eligible,offer,choose,effectiveRank,tuning,effects,preview,card,preferred,summary,grantBuff,tickBuffs,buffModifiers};
});
