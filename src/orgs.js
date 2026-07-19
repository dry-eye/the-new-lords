// New Lords — orgs.js — organization utility AI, slots, loyalty, succession, org-graph layout
// Auto-split from new-lords-prototype.html (#65). THREE is the global from the classic r128 script.

import { EKEYS, ENT, S, TIER, TIER_SCALE, chance, chr, ent, flag, logEvent, org, pick, rint, rnd, stl } from './state.js';
import { teleEvent } from './economy.js';
import { createEnterprise, makeChar, makeEdge, orgUtility, setLeader, spawnCaravan, spawnSquad } from './worldgen.js';

/* =====================================================================
   ORGANIZATIONS — utility AI, slots, loyalty, succession
   ===================================================================== */
let POWER=new Map(), POWER_TICK=-1;
function orgPower(o){
  if(POWER_TICK!==S.tick){ POWER=new Map(); POWER_TICK=S.tick; }
  const c=POWER.get(o.id);
  if(c!==undefined) return c;
  const v=computePower(o);
  POWER.set(o.id, v);
  return v;
}
function computePower(o){
  let p=o.treasury/100;
  p += S.settlements.filter(s=>s.ownerOrgId===o.id).reduce((a,s)=>a+s.pop/500,0);
  p += S.squads.filter(s=>{const so=org(s.orgId); return so && (so.id===o.id||so.parentId===o.id);})
        .reduce((a,s)=>a+s.strength/4,0);
  return p;
}
function orgManagement(o){
  const L=chr(o.leaderId), A=chr(o.posts.Advisor);
  return (L?L.skills.management:0) + (A? Math.round(A.skills.management*0.5):0);
}
function orgStep(){
  if(!flag('orgs')) return;   // Experience gate: orgs off ⇒ no org utility-AI / salaries / upkeep / succession / revolt
  const byFrom=new Map();
  for(const e of S.edges){
    if(!['control','influence','investment'].includes(e.kind)) continue;
    if(!byFrom.has(e.from)) byFrom.set(e.from,[]);
    byFrom.get(e.from).push(e);
  }
  const squadsByOrg=new Map();
  for(const sq of S.squads){
    if(!squadsByOrg.has(sq.orgId)) squadsByOrg.set(sq.orgId,[]);
    squadsByOrg.get(sq.orgId).push(sq);
  }
  for(const o of S.orgs){
    // salaries on control/influence/investment slots
    for(const e of (byFrom.get(o.id)||[])){
      const occ=org(e.to); if(!occ) continue;
      const pay=Math.min(e.salary, o.treasury);
      o.treasury-=pay; occ.treasury+=pay;
      if(pay<e.salary*0.6){
        occ.loyalty-=0.5;
        if(occ.loyalty<20 && occ.kind!=='squad' && chance(0.01)){
          S.edges=S.edges.filter(x=>x.id!==e.id);
          logEvent('Слот розірвано: <b>'+occ.name+'</b> покинув <b>'+o.name+'</b> — не платили.');
          teleEvent('SlotBroken',{edgeId:e.id, kind:e.kind, from:o.id, to:occ.id, cause:'unpaid'});
        }
      } else occ.loyalty=Math.min(100, occ.loyalty+0.15);
    }
    // squad upkeep
    const mySquads=squadsByOrg.get(o.id)||[];
    const upkeep=mySquads.reduce((a,s)=>a+s.strength*0.05,0);
    o.treasury-=upkeep;
    o.expenses=upkeep;
    if(o.treasury<0){
      o.treasury=0;
      for(const s of mySquads) if(chance(0.08) && s.strength>1) s.strength--;
    }

    // decision cooldown
    o.cooldown--;
    if(o.cooldown>0) continue;
    o.cooldown = Math.round(18/(0.5+orgUtility(o)));
    decide(o);
  }
  successionAndRevolt();
}

function decide(o){
  const u=orgUtility(o);
  const owned=S.settlements.filter(s=>s.ownerOrgId===o.id);
  const opts=[];

  if(o.kind==='political' || o.kind==='business'){
    // Found enterprise where the chain has a gap — economy-driven growth
    for(const st of owned){
      if(st.entIds.length >= TIER[st.tier].ents+4) continue;
      const missing = EKEYS.map(k=>{
        const def=ENT[k];
        if(def.zone && !def.zone.includes(st.zone)) return null;
        if(st.entIds.filter(id=>ent(id) && ent(id).kind===k).length >= 2) return null;
        const outRes=Object.keys(def.out)[0];
        const gap = 1 - st.stock[outRes]/Math.max(st.target[outRes],0.001);
        if(gap < 0.25) return null;                       // no real deficit → don't build
        // don't build a converter whose inputs the settlement can't get at all
        let feasible=1;
        for(const r in def.in){
          feasible=Math.min(feasible, Math.min(1, st.stock[r]/Math.max(def.in[r]*TIER_SCALE[st.tier]*3,0.001)));
        }
        if(feasible < 0.3) return null;   // no inputs reachable → building it would just stall
        return {k, score: gap*(0.4+0.6*feasible)};
      }).filter(Boolean).sort((a,b)=>b.score-a.score);
      if(missing.length && o.treasury>140){
        opts.push({a:'FoundEnterprise', s:0.9*u + missing[0].score*0.8, st, kind:missing[0].k});
      }
    }
    if(o.treasury>110 && S.squads.filter(s=>{const so=org(s.orgId);return so&&so.parentId===o.id;}).length<3 && owned.length){
      opts.push({a:'HireSquad', s:0.85*u, st:pick(owned)});
    }
    if(o.kind==='business' && !o.trade && o.treasury>500 && owned.length===0 &&
       S.orgs.filter(x=>x.trade).length < 9){
      opts.push({a:'FoundTradeHouse', s:0.7*u});
    }
    if(o.kind!=='squad' && o.parentId && o.treasury>orgPower(org(o.parentId))*35 && u>0.6){
      opts.push({a:'SeekIndependence', s:0.6*u});
    }
    if(o.treasury>320){
      const t=pick(S.orgs);
      if(t && t.id!==o.id && t.kind!=='squad') opts.push({a:'Invest', s:0.5*u, t});
    }
    if(o.treasury>260 && u>0.75){
      const t=pick(S.orgs.filter(x=>x.kind==='political' && x.id!==o.id));
      if(t) opts.push({a:'CovertInfluence', s:0.55*u, t});
    }
  }
  opts.push({a:'Idle', s:0.25 + rnd()*0.1});

  opts.sort((a,b)=>(b.s+rnd()*0.05)-(a.s+rnd()*0.05));
  const d=opts[0];
  o.lastDecision=d.a;
  switch(d.a){
    case 'FoundEnterprise': {
      o.treasury-=140;
      const st=d.st;
      // wood+steel actually consumed by construction — another sink
      st.stock.wood=Math.max(0,st.stock.wood-5); st.stock.steel=Math.max(0,st.stock.steel-3);
      createEnterprise(st, d.kind, null);
      logEvent('<span class="link" data-sel="org:'+o.id+'">'+o.name+'</span> збудував '+ENT[d.kind].label.toLowerCase()+
        ' у <span class="link" data-sel="settlement:'+st.id+'">'+st.name+'</span>.');
      break;
    }
    case 'HireSquad': {
      o.treasury-=110;
      spawnSquad(o, d.st, {garrison:false});
      break;
    }
    case 'FoundTradeHouse': {
      o.treasury-=420; o.trade=true; o.caravanCap=2;
      o.homeSettlementId=(owned[0]||pick(S.settlements)).id;
      spawnCaravan(o);
      logEvent('<span class="link" data-sel="org:'+o.id+'">'+o.name+'</span> став торговим домом.');
      teleEvent('BecameTradeHouse',{orgId:o.id, homeSettlementId:o.homeSettlementId});
      break;
    }
    case 'SeekIndependence': {
      const p=org(o.parentId);
      reparentOrg(o, null); o.factionId=o.id;          // guarded re-parent to independent (#71)
      if(!S.factions.find(f=>f.id===o.id)) S.factions.push({id:o.id, orgId:o.id, color:'#9AA7C0'});
      logEvent('⚑ <span class="link" data-sel="org:'+o.id+'">'+o.name+'</span> проголосив незалежність від <b>'+(p?p.name:'?')+'</b>.');
      // telemetry: political event — a secession attempt (this path always succeeds) + became independent
      teleEvent('SecessionAttempt',{orgId:o.id, fromOrgId:p?p.id:null, outcome:'success', trigger:'ambition'});
      teleEvent('BecameIndependent',{orgId:o.id, fromOrgId:p?p.id:null});
      break;
    }
    case 'Invest': {
      const sum=Math.min(200, o.treasury*0.4);
      o.treasury-=sum; d.t.treasury+=sum;
      makeEdge('investment', o.id, d.t.id, {salary:Math.round(sum/40), funding:Math.round(sum)});
      teleEvent('Investment',{fromOrgId:o.id, toOrgId:d.t.id, amount:Math.round(sum)});
      break;
    }
    case 'CovertInfluence': {
      o.treasury-=180;
      makeEdge('influence', o.id, d.t.id, {visibility:'covert', salary:rint(3,9)});
      break;
    }
  }
}

/* =====================================================================
   HIERARCHY RE-PARENT GUARD (#71)
   The org-parent hierarchy is a pure acyclic containment tree (DESIGN §22).
   Any op that reassigns an org's parentId — secession, throne-seizure/claimant,
   kind mutation, founding a subordinate — must route through reparentOrg so an
   org can never become its own ancestor; a cycle would otherwise recurse forever
   in the org-graph layout (radialTreePlace) and crash it.
   ===================================================================== */
// Would setting o.parentId=newParentId make o its own ancestor (i.e. close a cycle)?
// Walk up the target's ancestry via parentId; refuse if it reaches o. null never cycles.
function reparentWouldCycle(o, newParentId){
  if(newParentId==null) return false;                   // becoming independent can't cycle
  if(newParentId===o.id) return true;                   // an org cannot be its own parent
  let cur=org(newParentId), guard=0;
  while(cur && guard++<100000){
    if(cur.id===o.id) return true;                      // o sits above the target → would loop
    cur = cur.parentId!=null ? org(cur.parentId) : null;
  }
  return false;
}
// Re-parent o under newParentId (null = independent), keeping the mirrored hierarchy edge
// in sync. Refuses (returns false, mutates nothing) any change that would make the hierarchy
// cyclic. Callers keep their own faction/telemetry/log bookkeeping for the event they model.
function reparentOrg(o, newParentId){
  if(!o) return false;
  if(reparentWouldCycle(o, newParentId)) return false;
  o.parentId = newParentId;
  S.edges = S.edges.filter(e=>!(e.kind==='hierarchy' && e.to===o.id));
  if(newParentId!=null) makeEdge('hierarchy', newParentId, o.id);
  return true;
}

function successionAndRevolt(){
  for(const c of S.chars){
    if(!c.alive || !c.ledOrgId) continue;
    if(!chance(0.0012 + Math.max(0,c.age-55)*0.0004)) continue;
    const o=org(c.ledOrgId); if(!o) continue;
    c.alive=false; c.ledOrgId=null;
    const heir = chr(o.heirId) && chr(o.heirId).alive ? chr(o.heirId) :
      chr(o.members.map(chr).filter(x=>x&&x.alive&&x.id!==c.id).map(x=>x.id)[0]);
    // telemetry: political event — leader death (successorType recorded on the branches below)
    teleEvent('LeaderDeath',{charId:c.id, orgId:o.id, age:c.age});
    if(heir){
      setLeader(o, heir);
      o.heirId = o.members.filter(id=>id!==heir.id && chr(id) && chr(id).alive)[0] || null;
      logEvent('† <b>'+c.name+'</b> помер. <span class="link" data-sel="char:'+heir.id+'">'+heir.name+
        '</span> очолив <span class="link" data-sel="org:'+o.id+'">'+o.name+'</span>.');
      // rebellion roll for subordinates
      for(const sub of S.orgs.filter(x=>x.parentId===o.id)){
        const legit = (heir.skills.management+heir.skills.social)/24;
        const p = 0.10 + (100-sub.loyalty)/300 - legit*0.25;
        if(chance(Math.max(0,p))){
          reparentOrg(sub, null); sub.factionId=sub.id;   // guarded re-parent to independent (#71)
          if(!S.factions.find(f=>f.id===sub.id)) S.factions.push({id:sub.id, orgId:sub.id, color:'#9AA7C0'});
          logEvent('⚔ Криза спадкоємства: <b>'+sub.name+'</b> відколовся від <b>'+o.name+'</b>.');
          // telemetry: political event — succession crisis (successor type + legitimacy score)
          teleEvent('SuccessionCrisis',{orgId:sub.id, parentOrgId:o.id, successorType:'heir', legitimacy:legit});
        }
      }
    } else {
      // materialize a resident from the latent pool to take the seat
      const seat = stl(c.homeId) || S.settlements.find(x=>x.ownerOrgId===o.id) || pick(S.settlements);
      const fresh = makeChar(seat.id);
      setLeader(o, fresh);
      o.heirId=null;
      logEvent('† <b>'+c.name+'</b> помер. <span class="link" data-sel="char:'+fresh.id+'">'+fresh.name+
        '</span> зайняв місце в <b>'+o.name+'</b>.');
      // telemetry: no heir → a fresh resident is materialized to fill the seat
      teleEvent('SuccessionCrisis',{orgId:o.id, parentOrgId:o.parentId, successorType:'materialized', legitimacy:0});
    }
    if(S.playerCharId===c.id){
      logEvent('Твій персонаж помер. Ти спостерігаєш далі — обери іншого лідера в інспекторі.');
      S.playerCharId=null;
    }
  }
  // loyalty drift + secession
  for(const o of S.orgs){
    if(!o.parentId || o.kind==='squad') continue;
    const p=org(o.parentId); if(!p) continue;
    const gap=orgPower(o)-orgPower(p);
    o.loyalty += (p.taxRate>0.3?-0.15:0.05) + (gap>0? -0.12:0.04);
    o.loyalty=Math.max(0,Math.min(100,o.loyalty));
    if(o.loyalty<12 && chance(0.02)){
      const fromId=p.id;
      reparentOrg(o, null); o.factionId=o.id;          // guarded re-parent to independent (#71)
      if(!S.factions.find(f=>f.id===o.id)) S.factions.push({id:o.id, orgId:o.id, color:'#9AA7C0'});
      logEvent('⚑ <b>'+o.name+'</b> вийшов з-під <b>'+p.name+'</b> — лояльність вичерпана.');
      // telemetry: political event — secession driven by exhausted loyalty (always succeeds here)
      teleEvent('SecessionAttempt',{orgId:o.id, fromOrgId:fromId, outcome:'success', trigger:'loyalty'});
      teleEvent('BecameIndependent',{orgId:o.id, fromOrgId:fromId});
    }
  }
}

/* radial tree layout of one cluster: root at its centre, children fanned by subtree
   size so the hierarchy edges of a faction never cross each other. Fills `homes`.
   Cycle-safe (#71): the org-parent hierarchy is meant to be an acyclic containment tree
   (DESIGN §22), but a buggy re-parent can make an org transitively its own descendant.
   Both walks below break such a back-edge instead of recursing forever — `leaves` treats
   an in-progress id as a leaf, and `place` positions each id once. `leaves` is memoized
   (id→count), so subtree sizes are O(n) rather than the old exponential per-node recompute.
   For a well-formed acyclic tree these guards never fire, so the layout is unchanged. */
function radialTreePlace(root, memberSet, childrenOf, cx, cy, homes){
  const RING=44;
  const kids=id=>(childrenOf.get(id)||[]).filter(c=>memberSet.has(c));
  // leaf-count of a subtree; `inStack` cuts a cycle (a back-edge counts as one leaf),
  // `leafCache` memoizes so each subtree is summed once.
  const leafCache=new Map(), inStack=new Set();
  const leaves=id=>{
    const cached=leafCache.get(id); if(cached!==undefined) return cached;
    if(inStack.has(id)) return 1;                       // cycle back-edge → treat as a leaf
    inStack.add(id);
    const ch=kids(id);
    let s=0; if(!ch.length) s=1; else for(const c of ch) s+=leaves(c);
    inStack.delete(id);
    leafCache.set(id, s);
    return s;
  };
  // position each id exactly once; a child already placed is a cycle back-edge → skip it.
  const placed=new Set();
  const place=(id, depth, a0, a1)=>{
    if(placed.has(id)) return;
    placed.add(id);
    const ang=(a0+a1)/2, r=depth*RING;
    homes.set(id, {x:cx+Math.cos(ang)*r, y:cy+Math.sin(ang)*r, depth, ang});
    const ch=kids(id).filter(c=>!placed.has(c)); if(!ch.length) return;
    const tot=ch.reduce((s,c)=>s+leaves(c),0)||1;
    let a=a0;
    for(const c of ch){ const na=a+(a1-a0)*(leaves(c)/tot); place(c, depth+1, a, na); a=na; }
  };
  place(root, 0, -Math.PI, Math.PI);
}
/* layout: connected orgs form faction clusters on a ring, each drawn as a radial
   hierarchy tree (politics legible at a glance, DESIGN §83); zero-degree orgs get
   their own tidy grid zone, kept out of the connected web (DESIGN §90). Every node
   is anchored to a computed home, so the tree structure — not a tug-of-war of
   springs — sets the shape, and edges cross far less than the old central hairball. */

export {
  POWER, POWER_TICK, computePower, decide, orgManagement, orgPower, orgStep, radialTreePlace,
  reparentOrg, reparentWouldCycle, successionAndRevolt,
};
