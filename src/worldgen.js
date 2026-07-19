// New Lords — worldgen.js — terrain, sea, biomes, settlements, roads, entity factories, world generation
// Auto-split from new-lords-prototype.html (#65). THREE is the global from the classic r128 script.

import { EKEYS, ENT, NAME_A, NAME_B, ORG_A, PER_A, PER_B, RES, RKEYS, S, SKILLS, TIER, TIER_SCALE, TRAITS, TRAIT_UTIL, chance, chr, logEvent, org, pick, renderLog, reseedRNG, rint, rnd, stl, uid } from './state.js';
import { TELE, TELE_SLOT_KINDS, precomputePaths, recomputeTargets, teleEvent, teleOrgCreated, teleReset, teleTick } from './economy.js';
import { buildScene } from './render.js';
import { buildStartScreen } from './ui.js';

/* =====================================================================
   WORLDGEN
   ===================================================================== */
function v3(x,y,z){return new THREE.Vector3(x,y,z);}
function randDir(){
  const u=rnd()*2-1, th=rnd()*Math.PI*2, s=Math.sqrt(1-u*u);
  return v3(s*Math.cos(th), u, s*Math.sin(th));
}
function fibDir(i,n){
  const y=1-(i/(n-1))*2, r=Math.sqrt(1-y*y), th=Math.PI*(3-Math.sqrt(5))*i;
  return v3(Math.cos(th)*r, y, Math.sin(th)*r);
}
/* ---------- noise: value-noise fBm with domain warp (deterministic) ---------- */
let NSEED=1;
function hash3(i,j,k){
  let n = (i*374761393 + j*668265263 + k*1274126177 + NSEED*2654435761) | 0;
  n = Math.imul(n ^ (n>>>13), 1274126177);
  return ((n ^ (n>>>16)) >>> 0) / 4294967296;
}
const fade=t=>t*t*(3-2*t);
function vnoise(x,y,z){
  const xi=Math.floor(x), yi=Math.floor(y), zi=Math.floor(z);
  const xf=x-xi, yf=y-yi, zf=z-zi;
  const u=fade(xf), v=fade(yf), w=fade(zf);
  const c000=hash3(xi,yi,zi),     c100=hash3(xi+1,yi,zi);
  const c010=hash3(xi,yi+1,zi),   c110=hash3(xi+1,yi+1,zi);
  const c001=hash3(xi,yi,zi+1),   c101=hash3(xi+1,yi,zi+1);
  const c011=hash3(xi,yi+1,zi+1), c111=hash3(xi+1,yi+1,zi+1);
  const x00=c000+(c100-c000)*u, x10=c010+(c110-c010)*u;
  const x01=c001+(c101-c001)*u, x11=c011+(c111-c011)*u;
  const y0=x00+(x10-x00)*v, y1=x01+(x11-x01)*v;
  return (y0+(y1-y0)*w)*2-1;                     // −1..1
}
function fbm(x,y,z,oct,lac,gain){
  let a=1, f=1, sum=0, norm=0;
  for(let i=0;i<oct;i++){
    sum += a*vnoise(x*f+i*17.3, y*f-i*29.1, z*f+i*41.7);
    norm += a; a*=gain; f*=lac;
  }
  return sum/norm;
}
function ridge(x,y,z,oct){
  let a=0.6, f=1, sum=0;
  for(let i=0;i<oct;i++){
    const n=1-Math.abs(vnoise(x*f+i*7.7, y*f+i*13.3, z*f-i*5.1));
    sum += a*n*n; a*=0.5; f*=2.05;
  }
  return sum;
}
let SEA=0.10, WARP={x:0,y:0,z:0};

/* Elevation: a warped continental field + ridged mountain belts.
   Coastlines come out fractal (bays, peninsulas, islands), not circular. */
function elevation(p){
  const wx=fbm(p.x*1.7+WARP.x, p.y*1.7+WARP.y, p.z*1.7+WARP.z, 3, 2.0, 0.5);
  const wy=fbm(p.x*1.7+WARP.y, p.y*1.7+WARP.z, p.z*1.7+WARP.x, 3, 2.0, 0.5);
  const q=0.42;
  const x=p.x*1.25+wx*q, y=p.y*1.25+wy*q, z=p.z*1.25+(wx-wy)*q*0.5;
  let base=fbm(x,y,z,6,2.1,0.52);            // −1..1 continental field
  base = base*0.85 + 0.14*fbm(x*3.1,y*3.1,z*3.1,3,2.2,0.5);
  const land = base - SEA;
  if(land<=0) return land*0.85;              // ocean depth
  const belt = Math.max(0, ridge(x*2.3, y*2.3, z*2.3, 4) - 0.42);
  const mtn = belt * smooth01(land, 0.02, 0.30) * 1.35;
  return land*0.9 + mtn;
}
function smooth01(v,a,b){const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);}
const isLand = p => elevation(p) > 0;

/* Climate: temperature (latitude − altitude) × moisture (its own fBm).
   Biomes fall out of the climate field, so borders are organic, never Voronoi walls. */
function moistureAt(p){
  return (fbm(p.x*2.4+11.3, p.y*2.4-7.9, p.z*2.4+3.1, 4, 2.1, 0.55)*0.5+0.5);
}
function tempAt(p, e){
  const lat=Math.abs(p.y);
  return Math.max(0, Math.min(1, 1.06 - lat*1.28 - Math.max(0,e)*0.85 +
    fbm(p.x*1.6-21.7, p.y*1.6+5.5, p.z*1.6-9.9, 2, 2.0, 0.5)*0.10));
}
function zoneAt(p){
  const e=elevation(p);
  if(e>0.34) return 'mountain';
  const t=tempAt(p,e), m=moistureAt(p);
  if(t<0.13) return 'tundra';               // cold polar caps only
  if(t>0.52 && m>0.60) return 'jungle';     // hot & wet — dense forest
  if(t>0.52 && m<0.40) return 'desert';
  if(m>0.48 && t>0.20) return 'forest';
  return 'plain';
}

/* Continuous terrain colour — every pixel blends, nothing tiles or steps. */
function terrainColor(p, e, out){
  if(e<=0){
    const d=Math.min(1, -e*3.0);
    const shelf=1-d;
    out[0]=0.045+0.075*shelf*shelf;
    out[1]=0.105+0.155*shelf;
    out[2]=0.215+0.185*shelf;
    return;
  }
  const t=tempAt(p,e), m=moistureAt(p);
  // base palettes
  const sand=[0.72,0.63,0.42], steppe=[0.55,0.52,0.31], grass=[0.36,0.47,0.26],
        forest=[0.18,0.32,0.20], taiga=[0.24,0.33,0.28], tundra=[0.55,0.56,0.51],
        rock=[0.40,0.39,0.38], snow=[0.93,0.94,0.96];
  let c=[0,0,0];
  const dry = smooth01(0.46-m, 0, 0.22);          // 1 = arid
  const warm= smooth01(t, 0.18, 0.62);
  const wet = smooth01(m, 0.42, 0.72);
  for(let i=0;i<3;i++){
    const arid = sand[i]*dry + steppe[i]*(1-dry);
    const humid= forest[i]*wet + grass[i]*(1-wet);
    const warmC= arid*dry + humid*(1-dry);
    const coldC= tundra[i]*(1-warm) + taiga[i]*warm;
    c[i] = warmC*warm + coldC*(1-warm);
  }
  // rock on steep/high ground, snow on peaks and cold poles
  const rocky=smooth01(e, 0.26, 0.44);
  const snowy=Math.max(smooth01(e,0.46,0.66), smooth01(0.16-t,0,0.14));
  const beach=smooth01(0.020-e, 0, 0.020);
  for(let i=0;i<3;i++){
    c[i]=c[i]*(1-rocky)+rock[i]*rocky;
    c[i]=c[i]*(1-snowy)+snow[i]*snowy;
    c[i]=c[i]*(1-beach)+[0.76,0.70,0.52][i]*beach;
  }
  out[0]=Math.max(0,Math.min(1,c[0]));
  out[1]=Math.max(0,Math.min(1,c[1]));
  out[2]=Math.max(0,Math.min(1,c[2]));
}

/* Technical / holographic terrain — the sci-fi theme renders the planet as a
   topographic scan rather than a naturalistic map: a dark teal body carrying cyan
   elevation contour lines, glowing coastlines and bathymetric depth rings. It is
   structurally different from terrainColor (it bakes contour banding, not biome
   colour), so a theme switch genuinely re-renders the planet instead of merely
   re-tinting it — the "deeper, per-theme textures" decision in Visual themes,
   DESIGN.md. Reads the same elevation field, so continents line up across themes. */
function terrainColorTech(p, e, out){
  const fr=v=>v-Math.floor(v);
  const C0=0.19, C1=0.85, C2=0.86;                     // cyan contour ink
  if(e<=0){
    const depth=-e;                                    // 0..~0.4
    const b=fr(depth*24.0), ld=Math.min(b,1-b);        // 0 on a bathymetric ring
    const line=smooth01(0.09-ld,0,0.09);
    const shelf=smooth01(0.05-depth,0,0.05);           // faint glow on the shallow shelf
    out[0]=0.012 + C0*(line*0.45+shelf*0.16);
    out[1]=0.045 + C1*(line*0.55+shelf*0.22);
    out[2]=0.085 + C2*(line*0.55+shelf*0.22);
    return;
  }
  const lift=smooth01(e,0,0.5);
  const f=fr(e*32.0), ld=Math.min(f,1-f);              // 0 on a topographic contour
  const line=smooth01(0.07-ld,0,0.07);
  const coast=smooth01(0.016-e,0,0.016);               // bright shoreline
  const peak=smooth01(e,0.33,0.5);                     // hot ridgelines
  out[0]=Math.min(1, 0.02+0.06*lift + C0*(line*0.5 +coast*0.7) + peak*0.5);
  out[1]=Math.min(1, 0.11+0.16*lift + C1*(line*0.65+coast*0.9) + peak*0.6);
  out[2]=Math.min(1, 0.14+0.20*lift + C2*(line*0.65+coast*0.9) + peak*0.6);
}

/* Sea level is solved for, not guessed — every world gets real continents. */
function calibrateSea(targetLand){
  const probes=[];
  for(let i=0;i<1500;i++) probes.push(fibDir(i,1500));
  let lo=-0.5, hi=0.6;
  for(let it=0; it<22; it++){
    const mid=(lo+hi)/2; SEA=mid;
    let land=0;
    for(const d of probes) if(elevation(d)>0) land++;
    const frac=land/probes.length;
    if(frac>targetLand) lo=mid; else hi=mid;
  }
  SEA=(lo+hi)/2;
}

function genNames(n, a, b){
  const out=new Set();
  while(out.size<n) out.add(pick(a)+pick(b).toLowerCase());
  return [...out];
}
function personName(){ return pick(PER_A)+' '+pick(PER_B); }

function makeChar(homeId, opts={}){
  const c={
    id:uid(), name:personName(), age:rint(22,64),
    traits:[], skills:{}, homeId, orgId:null, ledOrgId:null, post:null, netId:null, alive:true,
  };
  const pool=[...TRAITS];
  const n=rint(2,3);
  for(let i=0;i<n;i++) c.traits.push(pool.splice(Math.floor(rnd()*pool.length),1)[0]);
  for(const s of SKILLS) c.skills[s]=rint(1,10);
  if(c.traits.includes('Ambitious')) c.skills.management=Math.min(12,c.skills.management+2);
  S.chars.push(c);
  return c;
}
function orgUtility(o){
  const L=chr(o.leaderId);
  let u=0.35;
  if(L) for(const t of L.traits) u += (TRAIT_UTIL[t]||0);
  if(o.leadershipType==='mercenary') u+=0.15;
  if(o.leadershipType==='entrepreneur') u+=0.10;
  if(o.leadershipType==='anarchic') u-=0.20;
  return Math.max(0.02, Math.min(1.2, u));
}
function makeOrg(kind, name, opts={}){
  const o={
    id:uid(), kind, name,
    leadershipType: opts.leadershipType || (kind==='political'?'monarch':kind==='business'?'entrepreneur':'mercenary'),
    parentId: opts.parentId ?? null,
    leaderId: null, members:[], heirId:null,
    treasury: opts.treasury ?? rint(60,240),
    taxRate: 0.15, loyalty: 78, cooldown: rint(2,14),
    perks: [], posts:{Leader:null,Advisor:null,Bodyguard:null,Negotiator:null},
    factionId: opts.factionId ?? null,
    trade: !!opts.trade, caravanCap: opts.trade? 1 : 0,
    lastDecision:'—', income:0, expenses:0, profit:0,
  };
  S.orgs.push(o);
  teleOrgCreated(o, opts.cause);          // telemetry: org lifecycle (cause defaults to run phase)
  return o;
}
function makeEdge(kind, from, to, extra={}){
  const e=Object.assign({id:uid(), kind, from, to, visibility:'public', salary:0}, extra);
  S.edges.push(e);
  // telemetry: graph events — a control/influence/investment slot, or an alliance, was created
  if(TELE_SLOT_KINDS.includes(kind)) teleEvent('SlotCreated',{edgeId:e.id, kind, from, to, visibility:e.visibility, salary:e.salary});
  else if(kind==='alliance') teleEvent('AllianceFormed',{edgeId:e.id, from, to});
  return e;
}
function setLeader(o, c){
  o.leaderId=c.id; o.posts.Leader=c.id;
  c.ledOrgId=o.id; c.orgId=o.id;
  if(!o.members.includes(c.id)) o.members.push(c.id);
}

function generate(seed){
  reseedRNG(seed);
  teleReset(seed);                        // telemetry: clear buffers, stamp run metadata, enter worldgen phase
  Object.assign(S,{seed, tick:0, settlements:[],orgs:[],chars:[],squads:[],caravans:[],ents:[],edges:[],
    roads:[],adj:[],factions:[],events:[],playerCharId:null,selection:null,nextId:1});

  /* --- continental field: warped fBm, sea level solved for ~32% land --- */
  NSEED = (seed*2654435761) >>> 0;
  WARP = {x:rnd()*40-20, y:rnd()*40-20, z:rnd()*40-20};
  calibrateSea(0.32);

  /* --- settlement sites: rejection-sampled on land --- */
  const cand=[];
  for(let i=0;i<1400;i++){const d=fibDir(i,1400); if(isLand(d)) cand.push(d);}
  for(let i=cand.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[cand[i],cand[j]]=[cand[j],cand[i]];}
  const sites=[];
  const MIN_D=0.985; // cos of min separation — bigger = closer allowed
  for(const d of cand){
    if(sites.length>=26) break;
    if(sites.every(s=>s.dir.dot(d) < 0.965)) sites.push({dir:d});
  }
  const names=genNames(sites.length, NAME_A, NAME_B);

  sites.forEach((s,i)=>{
    const tier = i<1?'megalopolis' : i<4?'city' : i<13?'village':'camp';
    const z=zoneAt(s.dir);
    const st={
      id:uid(), name:names[i], dir:s.dir, tier, zone:z,
      pop: Math.round(TIER[tier].pop*(0.75+rnd()*0.5)),
      ownerOrgId:null, entIds:[], stock:{}, target:{}, price:{}, net:{}, gross:{},
      loyalty:80, area: 0.6+rnd()*1.4, contest:0,
    };
    for(const r of RKEYS){ st.stock[r]=0; st.target[r]=1; st.price[r]=RES[r].base; st.net[r]=0; st.gross[r]=[0,0]; }
    S.settlements.push(st);
  });

  /* --- road graph ---
     Trunk "3 nearest" links are built ONLY between non-camp settlements, so no
     road ever runs transitively through a camp. Each camp is a leaf spoke: one
     link to its nearest non-camp settlement. A connectivity pass then guarantees
     the non-camp trunk is a single component — otherwise caravans between
     isolated clusters would silently never route (bestTrade skips a null path). */
  S.adj = S.settlements.map(()=>[]);
  const link=(i,j)=>{ if(i===j||S.adj[i].includes(j)) return; S.adj[i].push(j); S.adj[j].push(i); S.roads.push([i,j]); };
  const trunk=S.settlements.map((_,i)=>i).filter(i=>S.settlements[i].tier!=='camp');
  const trunkSet=new Set(trunk);

  /* trunk magistrals: each non-camp links to its 3 nearest non-camps */
  for(const i of trunk){
    const order=trunk.filter(j=>j!==i)
      .map(j=>({j,d:S.settlements[i].dir.dot(S.settlements[j].dir)}))
      .sort((x,y)=>y.d-x.d).slice(0,3);
    for(const o of order) link(i,o.j);
  }

  /* connectivity guard: merge trunk components (runs before camp spokes) */
  const trunkComponents=()=>{
    const seen=new Set(), groups=[];
    for(const s of trunk){
      if(seen.has(s)) continue;
      const g=[], q=[s]; seen.add(s);
      while(q.length){ const c=q.shift(); g.push(c);
        for(const nb of S.adj[c]) if(trunkSet.has(nb)&&!seen.has(nb)){ seen.add(nb); q.push(nb); } }
      groups.push(g);
    }
    return groups;
  };
  for(let groups=trunkComponents(); groups.length>1; groups=trunkComponents()){
    let best=null;
    for(const a of groups[0]) for(let gi=1;gi<groups.length;gi++) for(const b of groups[gi]){
      const d=S.settlements[a].dir.dot(S.settlements[b].dir);
      if(!best||d>best.d) best={a,b,d};
    }
    link(best.a,best.b);
  }

  /* camp spokes: each camp attaches by exactly one link to its nearest non-camp */
  S.settlements.forEach((s,i)=>{
    if(s.tier!=='camp') return;
    let best=null;
    for(const j of trunk){
      const d=s.dir.dot(S.settlements[j].dir);
      if(!best||d>best.d) best={j,d};
    }
    if(best) link(i,best.j);
  });

  /* --- factions: each is an independent political org (a realm) --- */
  const capitals=[0,1,2,3].filter(i=>i<S.settlements.length);
  capitals.forEach((ci,fi)=>{
    const cap=S.settlements[ci];
    const realm=makeOrg('political', pick(ORG_A)+' '+cap.name, {
      leadershipType: fi===0?'monarch': pick(['monarch','council','entrepreneur','mercenary']),
      treasury: rint(500,900),
    });
    realm.factionId=realm.id;
    S.factions.push({id:realm.id, orgId:realm.id, color:['#C4574F','#4E9BB5','#C89B3C','#8B5FB5'][fi]});
  });

  /* assign each settlement to nearest capital's realm (some stay free cities) */
  S.settlements.forEach((st,i)=>{
    if(capitals.includes(i)){
      const realm=S.orgs[capitals.indexOf(i)];
      st.ownerOrgId=realm.id;
      makeEdge('ownership', realm.id, 'S'+st.id);
      return;
    }
    if(chance(0.16)){ // free city — its own independent political org
      const fc=makeOrg('political','Рада '+st.name,{leadershipType:'council',treasury:rint(120,300)});
      fc.factionId=fc.id;
      S.factions.push({id:fc.id, orgId:fc.id, color:'#6E7C99'});
      st.ownerOrgId=fc.id;
      makeEdge('ownership', fc.id, 'S'+st.id);
      return;
    }
    // subordinate political org under nearest realm
    let best=null,bd=-2;
    for(const ci of capitals){const d=st.dir.dot(S.settlements[ci].dir); if(d>bd){bd=d;best=ci;}}
    const realm=S.orgs[capitals.indexOf(best)];
    const sub=makeOrg('political','Намісництво '+st.name,{
      parentId:realm.id, factionId:realm.factionId, treasury:rint(60,180),
      leadershipType: pick(['monarch','council','economic'])});
    st.ownerOrgId=sub.id;
    makeEdge('hierarchy', realm.id, sub.id, {visibility: chance(0.10)?'covert':'public'});
    makeEdge('ownership', sub.id, 'S'+st.id);
  });

  /* --- residents & leaders --- */
  S.settlements.forEach(st=>{
    const owner=org(st.ownerOrgId);
    const n = st.tier==='camp'?2 : st.tier==='village'?3 : 5;
    const residents=[];
    for(let i=0;i<n;i++) residents.push(makeChar(st.id));
    if(owner && !owner.leaderId) setLeader(owner, residents[0]);
    residents.forEach(c=>{ if(!c.orgId && owner){c.orgId=owner.id; owner.members.push(c.id);} });
    // posts
    if(owner && residents[1]){ owner.posts.Advisor=residents[1].id; residents[1].post='Advisor'; }
    if(owner && residents[2]){ owner.posts.Bodyguard=residents[2].id; residents[2].post='Bodyguard'; }
  });
  // realms need a leader too (their capital gave them one) + heirs
  S.orgs.forEach(o=>{
    if(!o.leaderId){
      const home = S.settlements.find(s=>s.ownerOrgId===o.id) || pick(S.settlements);
      setLeader(o, makeChar(home.id));
    }
    const pool=o.members.filter(id=>id!==o.leaderId);
    o.heirId = pool.length? pick(pool) : null;
  });

  /* --- enterprises: one business org per enterprise --- */
  S.settlements.forEach(st=>{
    const count=TIER[st.tier].ents;
    const outdoor=EKEYS.filter(k=>ENT[k].zone && ENT[k].zone.includes(st.zone));
    const indoor=EKEYS.filter(k=>!ENT[k].zone);
    const plan=[];
    // food first — a settlement that can't farm (mountain) must import it: that's the trade engine
    plan.push(st.zone==='mountain' ? 'mine' : 'farm');
    for(let i=1;i<count;i++){
      plan.push(chance(0.5) && outdoor.length ? pick(outdoor) : pick(indoor));
    }
    plan.forEach(kind=>createEnterprise(st, kind, null));
  });

  /* --- trade houses: business orgs that run caravans --- */
  const hubs = S.settlements.filter(s=>s.tier==='city'||s.tier==='megalopolis');
  hubs.forEach(st=>{
    const owner=org(st.ownerOrgId);
    const th=makeOrg('business','Торговий дім '+st.name,{
      parentId: chance(0.6)? owner.id : null,
      factionId: owner?owner.factionId:null,
      leadershipType:'entrepreneur', trade:true, treasury:rint(260,520)});
    th.homeSettlementId=st.id;
    th.caravanCap = 2;
    setLeader(th, makeChar(st.id));
    if(th.parentId) makeEdge('hierarchy', th.parentId, th.id);
    for(let i=0;i<2;i++) spawnCaravan(th);
  });

  /* --- garrison squads (control slots) & bandits --- */
  S.settlements.forEach(st=>{
    if(st.tier==='camp' && !chance(0.4)) return;
    const owner=org(st.ownerOrgId);
    spawnSquad(owner, st, {garrison:true});
  });
  for(let i=0;i<4;i++){
    const st=pick(S.settlements);
    const b=makeOrg('squad','Банда '+pick(PER_B),{leadershipType:'warlord',treasury:rint(20,70)});
    b.factionId=b.id; b.bandit=true;
    S.factions.push({id:b.id, orgId:b.id, color:'#7A4A3F'});
    setLeader(b, makeChar(st.id));
    const sq=spawnSquad(b, st, {garrison:false});
    sq.strength=rint(8,16);
  }

  /* --- a few non-hierarchy graph edges, as the design calls for --- */
  const pols=S.orgs.filter(o=>o.kind==='political');
  for(let i=0;i<6;i++){
    const a=pick(pols), b=pick(pols);
    if(a===b) continue;
    const roll=rnd();
    if(roll<0.35) makeEdge('influence', a.id, b.id, {visibility: chance(0.5)?'covert':'public', salary:rint(2,8)});
    else if(roll<0.6) makeEdge('investment', a.id, b.id, {salary:rint(4,12), funding:rint(80,300)});
    else if(a.parentId===null && b.parentId===null) makeEdge('alliance', a.id, b.id);
  }

  /* --- seed stock so the economy doesn't start in famine --- */
  S.settlements.forEach(st=>{
    recomputeTargets(st);
    for(const r of RKEYS) st.stock[r]=st.target[r]*(0.6+rnd()*0.9);
  });

  precomputePaths();
  buildScene();
  buildStartScreen();
  renderLog();
  logEvent('Світ згенеровано. Seed <b>'+seed+'</b> · '+S.settlements.length+' поселень · '+S.orgs.length+' організацій.');
  TELE.phase='runtime';                   // telemetry: worldgen done — subsequent creations are runtime
  teleTick();                             // baseline snapshot at tick 0 (also seeds war/peace pairs)
}

function createEnterprise(st, kind, ownerOrgId){
  const e={id:uid(), kind, settlementId:st.id, ownerOrgId:null,
    staffed:true, rate:(0.85+rnd()*0.35)*TIER_SCALE[st.tier], stalled:false, out:0};
  // enterprises live inside a business org (property has exactly one owner)
  let owner = ownerOrgId? org(ownerOrgId) : null;
  if(!owner && chance(0.55)){
    // an existing local business often just adds a branch — keeps the org count sane
    const local = S.orgs.filter(o=>o.kind==='business' && !o.trade &&
      S.ents.some(x=>x.ownerOrgId===o.id && x.settlementId===st.id));
    if(local.length) owner = pick(local);
  }
  if(!owner){
    const parent = org(st.ownerOrgId);
    owner = makeOrg('business', ENT[kind].label+' «'+st.name+'»', {
      parentId: chance(0.7)? (parent?parent.id:null) : null,
      factionId: parent? parent.factionId : null,
      leadershipType:'economic', treasury:rint(40,120), cause:'enterprise-founding'});
    setLeader(owner, makeChar(st.id));
    if(owner.parentId) makeEdge('hierarchy', owner.parentId, owner.id);
  }
  e.ownerOrgId=owner.id;
  makeEdge('ownership', owner.id, 'E'+e.id);
  S.ents.push(e);
  st.entIds.push(e.id);
  teleEvent('EnterpriseFounded',{entId:e.id, kind, settlementId:st.id, ownerOrgId:owner.id,
    cause: TELE.phase==='worldgen'?'worldgen':'org-decision'});
  return e;
}

/* Fields, mines and lumber camps sit out in their own land — a ring well clear of the
   settlement's own footprint, on terrain that actually suits them, never on top of a
   neighbour's site. */
function placeOutdoorEnterprise(st, e){
  const idx=st.entIds.indexOf(e.id);
  const up=st.dir.clone();
  const tan=new THREE.Vector3(0,1,0).cross(up).normalize();
  const bit=up.clone().cross(tan).normalize();
  const wantZone=ENT[e.kind].zone;
  const tierR={camp:0.030, village:0.042, city:0.058, megalopolis:0.075}[st.tier];
  let best=null, bestScore=-1e9;
  for(let k=0;k<24;k++){
    const ang=(idx*2.399 + k*0.62);
    const rad=tierR*(1 + (k%3)*0.28);
    const d=up.clone()
      .add(tan.clone().multiplyScalar(Math.cos(ang)*rad))
      .add(bit.clone().multiplyScalar(Math.sin(ang)*rad)).normalize();
    if(!isLand(d)) continue;
    let score = rad*8;                                     // farther out is better
    if(wantZone && wantZone.includes(zoneAt(d))) score += 6;
    for(const other of S.settlements){                     // stay out of other towns
      if(other===st) continue;
      const gap=1-other.dir.dot(d);
      if(gap < 0.0016) score -= 20;
    }
    for(const oe of S.ents){                               // and off each other
      if(oe===e || !oe._dir) continue;
      if(1-oe._dir.dot(d) < 0.00035) score -= 8;
    }
    if(score>bestScore){bestScore=score; best=d;}
  }
  return best || st.dir.clone();
}

function spawnSquad(ownerOrg, st, opts={}){
  const so = ownerOrg.kind==='squad' ? ownerOrg :
    makeOrg('squad','Загін '+st.name+' '+rint(1,99),{
      parentId:ownerOrg.id, factionId:ownerOrg.factionId, leadershipType:'mercenary', treasury:rint(10,60), cause:'squad-pairing'});
  if(so!==ownerOrg){
    makeEdge('hierarchy', ownerOrg.id, so.id);
    makeEdge('control', ownerOrg.id, so.id, {salary:rint(1,3)});
    setLeader(so, makeChar(st.id));
  }
  const sq={
    id:uid(), orgId:so.id, factionId:so.factionId,
    dir:st.dir.clone(), target:null, path:null,
    strength: opts.garrison? rint(6,14): rint(6,12),
    mode:'auto', order: opts.garrison?'garrison':'idle',
    garrisonId: opts.garrison? st.id : null,
    homeId: st.id, pinned:false, cooldown:rint(1,8),
    queue:[],                         // manual order queue (Shift+RMB appends here, #24)
  };
  S.squads.push(sq);
  so.squadId=sq.id;
  teleEvent('SquadRecruited',{squadId:sq.id, orgId:so.id, garrison:!!opts.garrison, strength:sq.strength});
  TELE.counters.squadRecruited++;
  return sq;
}
function spawnCaravan(tradeOrg){
  const home = stl(tradeOrg.homeSettlementId) || pick(S.settlements);
  const c={id:uid(), orgId:tradeOrg.id, dir:home.dir.clone(),
    atIdx: S.settlements.indexOf(home), path:null, step:0, prog:0,
    cargo:null, qty:0, capacity:55, phase:'idle', buyPrice:0, dest:null, trips:0, profit:0};
  S.caravans.push(c);
  return c;
}


export {
  NSEED, SEA, WARP, calibrateSea, createEnterprise, elevation, fade, fbm, fibDir, genNames, generate, hash3,
  isLand, makeChar, makeEdge, makeOrg, moistureAt, orgUtility, personName, placeOutdoorEnterprise, randDir, ridge, setLeader, smooth01,
  spawnCaravan, spawnSquad, tempAt, terrainColor, terrainColorTech, v3, vnoise, zoneAt,
};
