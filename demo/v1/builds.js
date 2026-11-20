/* M1: permanent build state and effective player-facing changes. No DOM dependency. */
(function(root,factory){
 const commonJS=typeof module==='object';
 const api=factory(commonJS?require('./i18n.js'):root.PinballI18n);
 if(commonJS)module.exports=api;else root.PinballBuilds=api;
})(typeof window==='object'?window:globalThis,(locale)=>{
 'use strict';
 const {t}=locale;
 const CONFIG={maxBalls:48,maxWaves:20,productWaves:50,baseDamage:1,firstShot:.12,
  arcCooldown:.30,arcEvery:[0,2,1,1,1,1],arcTargets:[0,2,3,4,5,6],arcRange:[0,145,165,180,196,214],arcDamage:[0,2,4,6,7,9],focusDamage:6,bossArcDamage:4,
  splitEvery:[0,2,2,1,1,1],splitCount:[0,2,3,3,4,5],splitSpread:.45,stormSpread:.8,huntTurns:2,childTTL:4.1,
  gunInterval:[0,.35,.27,.20,.18,.16],gunPressureHits:[0,3,3,3,3,2],gunTTL:4.1,lineInterval:.17,fanInterval:.18,fanAngle:.28,fanPeriod:1.8,gunMinInterval:.12,gunRateStep:.012,auxGunInterval:.70,auxGunMinInterval:.55,
  normalInterval:.86,normalMinInterval:.55,normalRateStep:.075,normalTTL:8.4,speed:330,speedStep:15,lifeStep:.7,gunLifeStep:.2,fallScale:.84,
  flags:{earlyBonus:false,bossBonus:false,rareEffects:false,ultimate:false,temporaryBuffs:true},rarityWeights:{common:1,rare:0,epic:0,legendary:0}};
 const DEFS={};
 function def(id,family,role,maxRank,extra={}){
  DEFS[id]={id,get name(){return t('skill.'+id);},family,role,maxRank,rarity:'common',prerequisites:[],minClearedWave:0,excludedWith:[],...extra};
 }
 const masteryWave=[9,14];
 for(const id of ['split','arc','gun'])def(id,id,'core',5);
 for(const [id,cap] of [['rate',5],['power',3],['speed',3],['life',3]])def(id,'base','base',cap);
 for(const id of ['hunter','drill','shock','bank'])def(id,'auxiliary','auxiliary',2);
 for(const family of ['split','arc','gun']){
  for(const [side,other] of [['a','b'],['b','a']])def(family+'-'+side,family,'branch',2,
   {minClearedWave:4,prerequisites:[{id:family,rank:2}],excludedWith:[family+'-'+other]});
 }
 function buff(id,duration){return {get name(){return t('buff.'+id);},duration,get description(){return t('buff.'+id+'.desc');}};}
 const BUFFS={power:buff('power',15),speed:buff('speed',30)};
 const copy=s=>JSON.parse(JSON.stringify(s));
 const has=id=>Object.hasOwn(DEFS,id);
 function createState(seed=2701){return {seed:seed>>>0,rng:seed>>>0,seedAbility:null,growthFocus:null,coreFocus:null,coreBranch:null,coreUltimate:null,ranks:{},routeWeights:{split:0,arc:0,gun:0},choiceHistory:[],temporaryBuffs:[],recovery:{power:0,speed:0,life:0}};}
 function random(s){s.rng=(s.rng+0x6D2B79F5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
 function preferred(s){return s.coreFocus||s.growthFocus||s.seedAbility;}
 function effectiveRank(s,id){return s.ranks[id]||0;}
 const mastery=rank=>Math.max(0,rank-3);
 function tuning(s){const gun=effectiveRank(s,'gun'),isGun=gun>0&&preferred(s)==='gun',branch=s.coreBranch;
  let interval=isGun?(branch==='gun-a'?(CONFIG.lineInterval-(s.ranks['gun-a']>1?.02:0)):branch==='gun-b'?(CONFIG.fanInterval-(s.ranks['gun-b']>1?.02:0)):CONFIG.gunInterval[gun]):gun?CONFIG.auxGunInterval:CONFIG.normalInterval;
  const gunMastery=isGun?mastery(gun):0;
  if(isGun&&branch)interval-=gunMastery*.008;
  interval=Math.max(isGun?CONFIG.gunMinInterval-gunMastery*.006:gun?CONFIG.auxGunMinInterval:CONFIG.normalMinInterval,interval-(s.ranks.rate||0)*(gun?CONFIG.gunRateStep:CONFIG.normalRateStep));
  return {interval,isGun,ttl:(isGun?CONFIG.gunTTL+gunMastery*.2:CONFIG.normalTTL)+(s.ranks.life||0)*(isGun?CONFIG.gunLifeStep:CONFIG.lifeStep),speed:CONFIG.speed+(s.ranks.speed||0)*CONFIG.speedStep,damage:CONFIG.baseDamage+(s.ranks.power||0),splitRank:effectiveRank(s,'split'),arcRank:effectiveRank(s,'arc'),
    childTTL:CONFIG.childTTL+mastery(effectiveRank(s,'split'))*.3,gunHitsPerBonus:gun?CONFIG.gunPressureHits[gun]:3};
 }
 function effects(s){const t=tuning(s),r=s.ranks,b=s.coreBranch,split=t.splitRank,arc=t.arcRank;
  return {interval:t.interval,damage:t.damage,speed:t.speed,ttl:t.ttl,
   splitCount:split?(b==='split-a'?(s.ranks['split-a']>1?5:4)+mastery(split):b==='split-b'?3+mastery(split):CONFIG.splitCount[split]):0,
   childTTL:split?t.childTTL:0,splitEvery:CONFIG.splitEvery[split],splitSpread:split?(b==='split-a'?CONFIG.stormSpread:CONFIG.splitSpread):0,childTurns:b==='split-b'?CONFIG.huntTurns+(s.ranks['split-b']>1?1:0):0,splitPursuit:Math.max(0,split-1),gunPressure:preferred(s)==='gun'?Math.max(0,(r.gun||0)-1):0,gunHitsPerBonus:t.gunHitsPerBonus,
   arcEvery:CONFIG.arcEvery[arc],arcTargets:arc?(b==='arc-b'?0:b==='arc-a'?(s.ranks['arc-a']>1?5:4)+mastery(arc):CONFIG.arcTargets[arc]):0,arcRange:arc&&b!=='arc-b'?CONFIG.arcRange[arc]:0,arcDamage:arc&&b!=='arc-b'?CONFIG.arcDamage[arc]:0,arcArmorBonus:arc?arc+1:0,arcSolo:arc?(b==='arc-b'?CONFIG.focusDamage:CONFIG.bossArcDamage)+(b==='arc-a'?(s.ranks['arc-a']>1?5:4)+mastery(arc):CONFIG.arcTargets[arc])*arc+(b==='arc-b'&&s.ranks['arc-b']>1?3:0):0,arcNet:b==='arc-a',arcFocus:b==='arc-b',
   hunter:r.hunter||0,drillEvery:r.drill?(r.drill===1?4:3):0,drillPierces:r.drill?(r.drill===1?3:5):0,drillDamage:r.drill?r.drill+1:0,
   shockEvery:r.shock?(r.shock===1?4:3):0,shockTargets:r.shock?(r.shock===1?2:4):0,shockDamage:r.shock||0,shockRadius:r.shock?(r.shock===1?75:95):0,
   bankStep:r.bank||0,bankCap:(r.bank||0)*2,fan:b==='gun-b',line:b==='gun-a'};
 }
 function apply(s,id){const d=DEFS[id];s.ranks[id]=(s.ranks[id]||0)+1;
  if(d.role==='core'){s.routeWeights[id]++;if(s.ranks[id]===2&&!s.growthFocus)s.growthFocus=id;}
  if(d.role==='branch'){s.coreFocus=d.family;s.coreBranch=id;}
 }
 const labeledEffects=['damage','speed','ttl','splitCount','splitEvery','splitSpread','splitPursuit','childTurns','childTTL',
  'gunPressure','gunHitsPerBonus','arcEvery','arcTargets','arcRange','arcDamage','arcArmorBonus','arcSolo','hunter','drillEvery',
  'drillPierces','drillDamage','shockEvery','shockTargets','shockDamage','shockRadius','bankStep','bankCap'];
 const percentEffects=new Set(['damage','speed','ttl','splitSpread','arcRange','shockRadius']);
 const fmt=n=>Number(n.toFixed(1)).toString();
 const signed=n=>(n>0?'+':'')+fmt(n);
 function changes(before,after){
  const deltas=[];
  if(Math.abs(before.interval-after.interval)>1e-9){
   const value=(before.interval/after.interval-1)*100;
   deltas.push({key:'rate',value,text:t('delta.rate')+' '+signed(value)+'%'});
  }
  for(const key of labeledEffects){
   if(!Number.isFinite(after[key])||!Number.isFinite(before[key])||before[key]===after[key])continue;
   const percent=percentEffects.has(key)&&before[key]>0;
   const value=percent?(after[key]/before[key]-1)*100:after[key]-before[key];
   deltas.push({key,value,text:t('delta.'+key)+' '+signed(value)+(percent?'%':'')});
  }
  for(const [key,id] of [['arcNet','arc-a'],['arcFocus','arc-b'],['fan','gun-b'],['line','gun-a']]){
   if(after[key]&&!before[key])deltas.push({key,value:1,text:t('branch.'+id)});
  }
  return deltas;
 }
 function abilityText(e,id){
  if(id==='split')return t('ability.split',{every:e.splitEvery,count:e.splitCount,turns:e.splitPursuit});
  if(id==='arc')return e.arcFocus?t('ability.arcFocus',{damage:e.arcSolo,armor:e.arcArmorBonus}):
   t('ability.arc',{every:e.arcEvery,count:e.arcTargets,damage:e.arcDamage,armor:e.arcArmorBonus});
  if(id==='gun')return t('ability.gun',{rate:fmt(1/e.interval),ttl:fmt(e.ttl),bonus:e.gunPressure,streak:e.gunHitsPerBonus});
  if(id==='bank')return t('ability.bank',{step:e.bankStep,cap:e.bankCap});
  if(id==='hunter')return t('ability.hunter',{count:e.hunter});
  if(id==='drill')return t('ability.drill',{every:e.drillEvery,pierces:e.drillPierces,damage:e.drillDamage});
  if(id==='shock')return t('ability.shock',{every:e.shockEvery,count:e.shockTargets,damage:e.shockDamage});
  if(DEFS[id].role==='branch')return t('branch.'+id);
  const values={rate:fmt(1/e.interval),power:e.damage,speed:e.speed,life:fmt(e.ttl)};
  return t('ability.'+id,{value:values[id]});
 }
 function describeDeltas({id,before,after,deltas}){
  const changesForLocale=changes(before,after);
  if(deltas.some(delta=>delta.key==='ability')){
   return [{key:'ability',value:1,text:abilityText(after,id)},
    ...changesForLocale.filter(delta=>['rate','damage','speed','ttl'].includes(delta.key))];
  }
  return changesForLocale;
 }
 function deltasFor(s,id,before,after){
  const deltas=DEFS[id].role==='core'&&!s.ranks[id]?[{key:'ability'}]:[];
  return describeDeltas({id,before,after,deltas});
 }
 function preview(s,id){if(!has(id))return null;const t=copy(s),before=effects(s);apply(t,id);const after=effects(t);return {before,after,deltas:deltasFor(s,id,before,after)};}
 function eligible(s,wave){if(!s.seedAbility)return [];return Object.values(DEFS).filter(d=>{
  const n=s.ranks[d.id]||0;if(n>=d.maxRank||wave<d.minClearedWave||!d.prerequisites.every(p=>(s.ranks[p.id]||0)>=p.rank)||d.excludedWith.some(id=>s.ranks[id]))return false;
  if(d.role==='branch'&&(d.family!==s.growthFocus||(s.coreBranch&&s.coreBranch!==d.id)||(!s.coreBranch&&s.coreFocus)||(n>=1&&wave<11)))return false;
  if(d.role==='core'){
   if(!n&&['split','arc','gun'].filter(id=>s.ranks[id]).length>=2)return false;
   if(n&&s.growthFocus&&d.id!==s.growthFocus)return false;
   if(n>=3&&(d.id!==preferred(s)||wave<masteryWave[n-3]))return false;
  }
  return preview(s,d.id).deltas.length>0;
 }).map(d=>d.id);}
 function seed(s,id,wave=0){if(s.seedAbility||!has(id)||DEFS[id].role!=='core')return false;const before=effects(s),previous=copy(s);s.seedAbility=id;apply(s,id);const after=effects(s);s.choiceHistory.push({wave,id,kind:wave>0?'upgrade':'seed',before,after,deltas:deltasFor(previous,id,before,after)});return true;}
 function choose(s,id,wave){if(!s.seedAbility)return wave>=1&&['split','arc','gun'].includes(id)?seed(s,id,wave):false;if(!has(id)||!eligible(s,wave).includes(id))return false;const p=preview(s,id);apply(s,id);s.choiceHistory.push({wave,id,kind:'upgrade',...p});return true;}
 function offer(s,wave){if(!s.seedAbility)return ['split','arc','gun'];const pool=eligible(s,wave),out=[],add=id=>{if(pool.includes(id)&&!out.includes(id))out.push(id);},pick=list=>list.length?list[Math.floor(random(s)*list.length)]:null;
  const core=preferred(s),branches=pool.filter(id=>DEFS[id].role==='branch');
  // Once mastery unlocks, both pending specializations must not crowd it out.
  if((s.ranks[core]||0)>=3||!branches.length)add(core);
  branches.forEach(add);
  if(out.length<3)add(pick(pool.filter(id=>DEFS[id].role==='base')));
  if(out.length<3)add(pick(pool.filter(id=>['core','auxiliary'].includes(DEFS[id].role)&&!out.includes(id))));
  while(out.length<3){const left=pool.filter(id=>!out.includes(id));if(!left.length)break;add(pick(left));}return out;
 }
 function card(s,id){
  const definition=DEFS[id];
  if(!definition)return {title:t('unavailable'),description:''};
  const title=definition.name,rank=s.ranks[id]||0;
  if(rank>=definition.maxRank)return {title,description:t('maxRank')};
  const {after,deltas}=preview(s,id);
  if(!rank&&['core','branch','auxiliary'].includes(definition.role)){
   const description=abilityText(after,id);
   return {title,description:id==='arc'||id==='arc-b'?description+' '+t('arcEnergy'):description};
  }
  const description=deltas.slice(0,3).map(delta=>delta.text).join(' · ');
  return {title,description:description||t('upgradeGeneric')};
 }
 function grantBuff(s,id){if(!Object.hasOwn(BUFFS,id))return false;let b=s.temporaryBuffs.find(b=>b.id===id);if(!b){b={id,remaining:0};s.temporaryBuffs.push(b);}b.remaining=BUFFS[id].duration;return true;}
 function tickBuffs(s,dt){if(!(dt>0))return;for(const b of s.temporaryBuffs)b.remaining=Math.max(0,b.remaining-dt);s.temporaryBuffs=s.temporaryBuffs.filter(b=>b.remaining>1e-8);}
 function buffModifiers(s){return {damage:0,rate:s.temporaryBuffs.some(b=>b.id==='power')?1.10:1,speed:s.temporaryBuffs.some(b=>b.id==='speed')?1.15:1};}
 function summary(s){return {stats:tuning(s),effects:effects(s),focus:preferred(s),branch:s.coreBranch,skills:Object.keys(s.ranks).map(id=>({id,name:DEFS[id].name,rank:s.ranks[id],effect:abilityText(effects(s),id)})),history:copy(s.choiceHistory),buffs:s.temporaryBuffs.map(b=>({...b,...BUFFS[b.id]})),modifiers:buffModifiers(s)};}
 return {CONFIG,DEFS,BUFFS,createState,seed,random,eligible,offer,choose,effectiveRank,tuning,effects,preview,card,describeDeltas,preferred,summary,grantBuff,tickBuffs,buffModifiers};
});
