// New Lords — state.js — shared state (S), RNG, entity constants, logging
// Auto-split from new-lords-prototype.html (#65). THREE is the global from the classic r128 script.

/* =====================================================================
   NEW LORDS — systemic prototype
   Vertical slice of DESIGN.md: spherical world, organizations as the
   spine, a closed-loop economy where every resource is consumed, caravans
   run by trade houses that close deficits and scale, minimal combat,
   and a selection-driven inspector.
   ===================================================================== */

/* ---------- deterministic RNG ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
let RNG=mulberry32(1874);
const rnd=()=>RNG();
const rint=(a,b)=>a+Math.floor(RNG()*(b-a+1));
const pick=arr=>arr[Math.floor(RNG()*arr.length)];
const chance=p=>RNG()<p;

/* ---------- content tables ---------- */
const RES = {
  food:    {label:'Їжа',    base:4,  color:'#7FB77E'},
  wood:    {label:'Дерево', base:3,  color:'#9C7A4E'},
  ore:     {label:'Руда',   base:5,  color:'#8894AC'},
  steel:   {label:'Сталь',  base:11, color:'#B9C4D6'},
  tools:   {label:'Інстр.', base:16, color:'#C89B3C'},
  weapons: {label:'Зброя',  base:24, color:'#C4574F'},
};
const RKEYS = Object.keys(RES);

/* Every enterprise: consumes something, produces something, and burns
   tools. Every output is consumed somewhere. Nothing is a dead end. */
const ENT = {
  farm:        {label:'Ферма',        zone:['plain','forest','desert'], inside:false, out:{food:4.0}, in:{}},
  lumber:      {label:'Лісопилка',    zone:['forest','plain'], inside:false, out:{wood:4.5},   in:{}},
  mine:        {label:'Шахта',        zone:['mountain','desert'], inside:false, out:{ore:3.5},  in:{}},
  forge:       {label:'Кузня',        zone:null,               inside:true,  out:{steel:1.5},  in:{ore:1.8, wood:0.7}},
  workshop:    {label:'Майстерня',    zone:null,               inside:true,  out:{tools:1.3},  in:{steel:0.9, wood:0.4}},
  armory:      {label:'Збройня',      zone:null,               inside:true,  out:{weapons:1.0},in:{steel:1.4}},
};
const EKEYS = Object.keys(ENT);
const TOOL_WEAR = 0.06;      // every enterprise burns tools (scaled by size)
const FOOD_PER_1K = 1.0;     // population eats
const SQUAD_FOOD = 0.22;     // squads eat
const SQUAD_WEAPONS = 0.02;  // squads break weapons
/* An enterprise's size follows its settlement's tier — a "farm" in a
   megalopolis is an agricultural sector, not one field. */
const TIER_SCALE = {camp:0.7, village:1.5, city:2.6, megalopolis:4.5};

const TRAITS = ['Just','Generous','Brave','Patient','Content','Cruel','Greedy','Wrathful','Cunning','Ambitious'];
const TRAIT_UTIL = {Ambitious:+0.35, Content:+0.15, Greedy:-0.15, Cruel:+0.10, Cunning:+0.10, Patient:-0.10, Brave:+0.05};
const SKILLS = ['melee','shooting','management','social'];
const SKILL_LABEL = {melee:'Ближній бій', shooting:'Стрільба', management:'Управління', social:'Соціалізація'};
const LEADERSHIP = ['monarch','council','entrepreneur','mercenary','economic','anarchic','warlord'];
const LT_LABEL = {monarch:'Монарх',council:'Міська рада',entrepreneur:'Підприємець',mercenary:'Найманець',
  economic:'Економічний',anarchic:'Анархічний',warlord:'Воєначальник'};
const KIND_LABEL = {political:'political',business:'business',squad:'squad',network:'network'};
const TIER = {
  camp:       {label:'Табір',       pop:70,    ents:1, r:0.0035},
  village:    {label:'Село',        pop:520,   ents:2, r:0.0045},
  city:       {label:'Місто',       pop:3200,  ents:4, r:0.006},
  megalopolis:{label:'Мегаполіс',   pop:14000, ents:6, r:0.008},
};
const ZONE = {
  plain:   {label:'Рівнина', c:[0.36,0.44,0.28]},
  forest:  {label:'Ліс',     c:[0.20,0.33,0.22]},
  mountain:{label:'Гори',    c:[0.42,0.41,0.40]},
  desert:  {label:'Пустеля', c:[0.55,0.48,0.32]},
  tundra:  {label:'Тундра',  c:[0.55,0.56,0.51]},
  jungle:  {label:'Джунглі', c:[0.14,0.30,0.17]},
};
const NAME_A=['Кор','Бран','Вел','Ост','Дран','Мар','Сол','Тир','Гар','Він','Лід','Рав','Ясн','Чорн','Свят','Кам'];
const NAME_B=['бург','град','піль','мор','дол','гай','стан','вежа','брід','ліс','кряж','поле','хутір','рів'];
const PER_A=['Іван','Мирон','Богдан','Олена','Ярина','Остап','Лада','Тарас','Ганна','Влад','Зоя','Северин','Рута','Гордій','Мирослава','Лев'];
const PER_B=['Крижаний','Тихий','Рудий','Довгий','Мовчазний','Гострий','Скупий','Сивий','Хитрий','Залізний','Чорний','Пильний'];
const ORG_A=['Дім','Гільдія','Ліга','Орден','Клан','Двір','Синдикат','Компанія'];

/* ---------- world state ---------- */
const S = {
  seed:1874, tick:0, paused:false, speed:1,
  settlements:[], orgs:[], chars:[], squads:[], caravans:[], ents:[], edges:[],
  roads:[], adj:[], factions:[], events:[],
  playerCharId:null, selection:null,
  nextId:1,
};
const uid = ()=>S.nextId++;
const byId = (arr,id)=>arr.find(o=>o.id===id);
const org = id=>byId(S.orgs,id);
const chr = id=>byId(S.chars,id);
const stl = id=>byId(S.settlements,id);
const sqd = id=>byId(S.squads,id);
const ent = id=>byId(S.ents,id);

function logEvent(html){
  S.events.unshift({t:S.tick,html});
  if(S.events.length>90) S.events.pop();
  renderLog();
}

function renderLog(){
  document.getElementById('log').innerHTML =
    S.events.map(e=>'<div><span class="t">'+String(e.t).padStart(4,'0')+'</span>'+e.html+'</div>').join('');
}
const STEP=420;                       // one simulation step, in ms of game time

// --- cross-module setters (owning module mutates its own binding) ---
export function reseedRNG(seed){ RNG=mulberry32(seed>>>0); }

export {
  EKEYS, ENT, FOOD_PER_1K, KIND_LABEL, LEADERSHIP, LT_LABEL, NAME_A, NAME_B, ORG_A, PER_A, PER_B, RES,
  RKEYS, RNG, S, SKILLS, SKILL_LABEL, SQUAD_FOOD, SQUAD_WEAPONS, STEP, TIER, TIER_SCALE, TOOL_WEAR, TRAITS,
  TRAIT_UTIL, ZONE, byId, chance, chr, ent, logEvent, mulberry32, org, pick, renderLog, rint,
  rnd, sqd, stl, uid,
};
