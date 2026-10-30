/* v0.27a experimental configuration and deterministic choice model. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.PinballBuilds=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const CONFIG={maxBalls:32,maxWaves:8,arcCooldown:.45,arcEvery:[0,3,2,2],arcTargets:[0,1,2,3],arcRange:[0,110,110,140],arcDamage:[0,1,2,3],focusDamage:3,bossArcDamage:2,
  splitEvery:[0,2,2,1],splitCount:[0,1,2,2],splitSpread:.45,stormSpread:.8,huntTurns:2,childTTL:4.1,
  gunInterval:[0,.35,.27,.20],gunTTL:2.4,lineInterval:.17,fanInterval:.18,fanAngle:.28,fanPeriod:1.8,gunMinInterval:.12,gunRateStep:.012,auxGunInterval:.70,auxGunMinInterval:.55,
  normalInterval:1.14,normalMinInterval:.69,normalRateStep:.075,normalTTL:8.4,speed:280,speedStep:15,lifeStep:.7,gunLifeStep:.2,
  fallScale:.8,flags:{earlyBonus:false,bossBonus:false,rareEffects:false,ultimate:false,temporaryBuffs:false},rarityWeights:{common:1,rare:0,epic:0,legendary:0}};
 const DEFS={};
 function def(id,name,family,role,maxRank,description,extra={}){DEFS[id]={id,name,family,role,maxRank,description,rarity:'common',prerequisites:[],minClearedWave:0,excludedWith:[],triggerEvent:role==='core'?'direct_hit':'upgrade',effectParams:{},cooldown:0,perWaveLimit:null,ballBudget:32,bossFallback:null,upgradeCost:1,testCounters:[],...extra};}
 def('split','碎星裂变','split','core',3,['2次撞击生1颗小球','2次撞击生2颗小球','首次撞击生2颗小球'],{effectParams:{every:CONFIG.splitEvery,count:CONFIG.splitCount},testCounters:['splitChildren']});
 def('arc','电弧印记','arc','core',3,['3次直接命中，1目标×1伤害','2次直接命中，2目标×2伤害','2次直接命中，140px内3目标×3伤害'],{cooldown:.45,bossFallback:'single_discharge',effectParams:{every:CONFIG.arcEvery,targets:CONFIG.arcTargets},testCounters:['arcReleases']});
 def('gun','高速供弹','gun','core',3,['每0.35秒射1球，留场2.4秒','每0.27秒连续射击','每0.20秒连续射击'],{triggerEvent:'fire',effectParams:{interval:CONFIG.gunInterval,ttl:CONFIG.gunTTL},testCounters:['shots']});
 for(const [id,name,cap,desc] of [['rate','射速训练',5,'普通 -0.075s；机枪 -0.012s'],['power','火力强化',3,'直接撞击伤害 +1'],['speed','弹速训练',3,'弹球速度 +15px/s'],['life','弹跳续航',3,'普通 +0.7s；机枪 +0.2s']])def(id,name,'base','base',cap,desc);
 for(const [id,name,desc] of [['hunter','追猎弯弹','撞墙后有限次向目标转弯'],['drill','钻头穿阵','每4/3发产生穿透球，穿透3/5次'],['shock','震荡核心','累计直接击碎引发有限范围震荡']])def(id,name,'auxiliary','auxiliary',2,desc);
 for(const [family,names,descs] of [
  ['split',['星海风暴','猎星裂变'],['每次最多3子球；孤立Boss收窄散角','每次2子球；撞墙后额外2次轻追猎']],
  ['arc',['雷网蔓延','雷霆聚能'],['跨距传播到最多3个不同目标','电荷集中于撞击目标，单次放电3伤害']],
  ['gun',['直线压制','扇形扫射'],['0.17秒逐发，沿瞄准方向轻微抖动','0.18秒逐发，±0.28弧度往返扫射']]]){
  ['a','b'].forEach((side,i)=>def(family+'-'+side,names[i],family,'branch',1,descs[i],{prerequisites:[{id:family,rank:2}],minClearedWave:4,excludedWith:[family+'-'+(side==='a'?'b':'a')]}));
 }
 for(const [id,name,desc] of [['power','临场火力','下一波直接伤害 +1'],['speed','临场加速','下一波球速 +15px/s'],['life','临场续航','下一波留场 +0.2s']])def('recover-'+id,name,'base','recovery',Infinity,desc);
 function createState(seed=2701){return {seed:seed>>>0,rng:seed>>>0,seedAbility:null,coreFocus:null,coreBranch:null,coreUltimate:null,ranks:{},routeWeights:{split:0,arc:0,gun:0},branchOffers:{split:0,arc:0,gun:0},choiceHistory:[],auxiliarySkills:{},rareModules:[],equippedArtifacts:[],temporaryBuffs:[],pendingRewards:[],selectedActive:'giant',recovery:{power:0,speed:0,life:0},eventCounters:{},buildTags:[]};}
 function random(s){s.rng=(s.rng+0x6D2B79F5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
 const has=id=>Object.hasOwn(DEFS,id);
 function seed(s,id){if(s.seedAbility||!has(id)||DEFS[id].role!=='core')return false;s.seedAbility=id;s.ranks[id]=1;s.routeWeights[id]=1;s.choiceHistory.push({wave:0,id,kind:'seed'});return true;}
 function regularEligible(s,wave){return Object.values(DEFS).filter(d=>d.role!=='recovery'&&
   (s.ranks[d.id]||0)<d.maxRank&&wave>=d.minClearedWave&&d.prerequisites.every(p=>(s.ranks[p.id]||0)>=p.rank)&&
   !d.excludedWith.some(id=>s.ranks[id])&&
   (d.role!=='branch'||!s.coreFocus)&&
   (d.role!=='core'||!s.coreFocus||d.family===s.coreFocus||!s.ranks[d.id])).map(d=>d.id);}
 function eligible(s,wave){if(!s.seedAbility)return [];const ids=regularEligible(s,wave);return ids.length<3?[...ids,'recover-power','recover-speed','recover-life']:ids;}
 function preferred(s){return s.coreFocus||Object.keys(s.routeWeights).sort((a,b)=>s.routeWeights[b]-s.routeWeights[a]||Number(b===s.seedAbility)-Number(a===s.seedAbility))[0];}
 function offer(s,wave){
  const pool=eligible(s,wave),out=[],add=id=>{if(id&&pool.includes(id)&&!out.includes(id))out.push(id);};
  const branches=pool.filter(id=>DEFS[id].role==='branch');
  if(branches.length){const families=[...new Set(branches.map(id=>DEFS[id].family))].sort((a,b)=>s.branchOffers[a]-s.branchOffers[b]||s.routeWeights[b]-s.routeWeights[a]);const family=families[0];add(family+'-a');add(family+'-b');s.branchOffers[family]++;}
  else add(preferred(s));
  const pick=list=>list.length?list[Math.floor(random(s)*list.length)]:null;
  add(pick(pool.filter(id=>DEFS[id].role==='base')));
  // Exploration remains available even if the seed is already fully upgraded.
  const explore=pool.filter(id=>['core','auxiliary'].includes(DEFS[id].role)&&!out.includes(id));
  if(out.length<3)add(pick(explore));
  while(out.length<3){const left=pool.filter(id=>!out.includes(id));if(!left.length)break;add(pick(left));}
  return out;
 }
 function choose(s,id,wave){if(!has(id)||!eligible(s,wave).includes(id))return false;const d=DEFS[id];
  if(d.role==='recovery')s.recovery[id.slice(8)]++;
  else{s.ranks[id]=(s.ranks[id]||0)+1;if(d.role==='core')s.routeWeights[id]++;if(d.role==='auxiliary')s.auxiliarySkills[id]=s.ranks[id];if(d.role==='branch'){s.coreFocus=d.family;s.coreBranch=id;s.buildTags=[d.family,id];}}
  s.choiceHistory.push({wave,id,kind:'upgrade'});return true;
 }
 function effectiveRank(s,id){const rank=s.ranks[id]||0;return s.coreFocus&&s.coreFocus!==id?Math.min(1,rank):rank;}
 function tuning(s){const gun=effectiveRank(s,'gun'),primary=preferred(s),isGun=gun>0&&(primary==='gun'||s.coreFocus==='gun');
  const branch=s.coreBranch;let interval=isGun?(branch==='gun-a'?CONFIG.lineInterval:branch==='gun-b'?CONFIG.fanInterval:CONFIG.gunInterval[gun]):gun?CONFIG.auxGunInterval:CONFIG.normalInterval;
  interval=Math.max(isGun?CONFIG.gunMinInterval:gun?CONFIG.auxGunMinInterval:CONFIG.normalMinInterval,interval-(s.ranks.rate||0)*(gun?CONFIG.gunRateStep:CONFIG.normalRateStep));
  return {interval,isGun,ttl:(isGun?CONFIG.gunTTL:CONFIG.normalTTL)+(s.ranks.life||0)*(isGun?CONFIG.gunLifeStep:CONFIG.lifeStep)+s.recovery.life*.2,
   speed:CONFIG.speed+((s.ranks.speed||0)+s.recovery.speed)*CONFIG.speedStep,damage:1+(s.ranks.power||0)+s.recovery.power,splitRank:effectiveRank(s,'split'),arcRank:effectiveRank(s,'arc')};
 }
 function card(s,id){const d=DEFS[id],rank=s.ranks[id]||0;const role=d.role==='branch'?'主核心分支 · 两支互斥':d.role==='core'?(s.coreFocus===d.family?'主核心':s.coreFocus?'弱辅助':'构筑方向'):d.role==='base'?'通用底盘':d.role==='recovery'?'下一波增幅':'通用辅助';
  const desc=Array.isArray(d.description)?d.description[rank]:d.description;
  return {title:d.name+(d.role==='branch'?'':d.role==='recovery'?'':` R${rank} → ${rank+1}`),description:role+' · '+desc};}
 return {CONFIG,DEFS,createState,seed,random,eligible,offer,choose,effectiveRank,tuning,card,preferred};
});
