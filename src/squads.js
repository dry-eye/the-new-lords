// New Lords — squads.js — combat, movement, capture
// Auto-split from new-lords-prototype.html (#65). THREE is the global from the classic r128 script.

import { S, chance, logEvent, org, rint, stl } from './state.js';
import { TELE, teleEvent, teleOrgDestroyed } from './economy.js';
import { makeChar, makeEdge, makeOrg, setLeader } from './worldgen.js';
import { applyOrder } from './ui.js';

// A squad is "at" a settlement when within its capture zone — a fixed radius around the
// site (DESIGN §633, default 20 units). On the unit sphere that is dir·dir > this cos.
// Shared so the settlement squad-tray (#68, render.js) groups on exactly the same test
// the capture/defence logic uses here — presence and capture never disagree.
const CAPTURE_COS = 0.9997;

/* =====================================================================
   SQUADS — movement, minimal combat, capture
   ===================================================================== */
function slerp(a,b,t){
  const d=Math.max(-1,Math.min(1,a.dot(b)));
  const th=Math.acos(d);
  if(th<1e-4) return a.clone();
  const s=Math.sin(th);
  return a.clone().multiplyScalar(Math.sin((1-t)*th)/s)
    .add(b.clone().multiplyScalar(Math.sin(t*th)/s)).normalize();
}
function hostile(fa,fb){
  if(fa===fb) return false;
  const a=org(fa), b=org(fb);
  if(!a||!b) return true;
  const allied=S.edges.some(e=>e.kind==='alliance' &&
    ((e.from===fa&&e.to===fb)||(e.from===fb&&e.to===fa)));
  return !allied;
}
function squadStep(){
  // combat: minimal deterministic resolver (Scale A)
  for(let i=0;i<S.squads.length;i++){
    for(let j=i+1;j<S.squads.length;j++){
      const a=S.squads[i], b=S.squads[j];
      if(!hostile(a.factionId,b.factionId)) continue;
      if(a.dir.dot(b.dir) < 0.9993) continue;
      const ka=a.strength*(a.supplied===false?0.7:1)*(a.garrisonId?1.4:1);
      const kb=b.strength*(b.supplied===false?0.7:1)*(b.garrisonId?1.4:1);
      const loss=Math.max(1, Math.round(Math.min(ka,kb)*0.5));
      a.strength-=Math.round(loss*(kb/(ka+kb))*1.6);
      b.strength-=Math.round(loss*(ka/(ka+kb))*1.6);
      if(a.strength<=0) killSquad(a,b);
      if(b.strength<=0) killSquad(b,a);
    }
  }
  S.squads=S.squads.filter(s=>s.strength>0);

  for(const sq of S.squads){
    const so=org(sq.orgId); if(!so) continue;
    if(sq.mode==='manual' && sq.order!=='move') { /* manual squads wait for orders */ }
    // capture progress
    const here=S.settlements.find(s=>s.dir.dot(sq.dir)>CAPTURE_COS);
    if(here && hostile(sq.factionId, org(here.ownerOrgId)?.factionId)){
      const defenders=S.squads.filter(s=>s!==sq && s.dir.dot(here.dir)>CAPTURE_COS &&
        !hostile(s.factionId, org(here.ownerOrgId)?.factionId));
      if(!defenders.length){
        here.contest++;
        if(here.contest>4){ capture(here, sq); here.contest=0; }
      }
    } else if(here) here.contest=0;

    if(sq.mode==='manual' && sq.target){ moveToward(sq); continue; }
    if(sq.mode==='manual') continue;

    sq.cooldown--;
    if(sq.target){ moveToward(sq); continue; }
    if(sq.cooldown>0) continue;
    sq.cooldown=rint(14,30);

    // utility: capture nearest hostile settlement if strong enough, else garrison home
    const cands=S.settlements.map(st=>{
      const own=org(st.ownerOrgId);
      if(!own || !hostile(sq.factionId, own.factionId)) return null;
      const def=S.squads.filter(s=>s.dir.dot(st.dir)>CAPTURE_COS && !hostile(s.factionId, own.factionId))
        .reduce((a,s)=>a+s.strength,0);
      if(def >= sq.strength) return null;   // veto: never attack when weaker
      const d=1-sq.dir.dot(st.dir);
      return {st, s: (1/(1+d*40)) * (1+st.pop/4000)};
    }).filter(Boolean).sort((a,b)=>b.s-a.s);

    if(cands.length && chance(0.55)){
      sq.target=cands[0].st.dir.clone(); sq.order='capture'; sq.garrisonId=null;
      sq.targetName=cands[0].st.name;
    } else {
      const home=stl(sq.homeId);
      if(home && sq.dir.dot(home.dir)<CAPTURE_COS){ sq.target=home.dir.clone(); sq.order='return'; }
      else { sq.order='garrison'; sq.garrisonId=sq.homeId; }
    }
  }
}
function moveToward(sq){
  const d=sq.dir.dot(sq.target);
  if(d>0.99995){ sq.dir=sq.target.clone(); sq.target=null;
    // Arrived. Advance a queued manual order if one is waiting (Shift+RMB queue, #24).
    if(sq.queue && sq.queue.length){ applyOrder(sq, sq.queue.shift()); return; }
    // A garrison order holds the role on arrival (keeps the defence bonus); anything
    // but an in-progress capture falls back to idle.
    if(sq.order!=='capture' && sq.order!=='garrison') sq.order='idle';
    return; }
  const speed=0.048;
  sq.dir=slerp(sq.dir, sq.target, Math.min(1, speed/Math.max(0.02, Math.acos(Math.min(1,d)))));
}
function killSquad(dead, winner){
  const o=org(dead.orgId);
  logEvent('⚔ Загін <b>'+(o?o.name:'?')+'</b> знищено.');
  dead.strength=0;
  teleEvent('SquadDisbanded',{squadId:dead.id, orgId:dead.orgId,
    byOrgId: winner?winner.orgId:null, cause:'combat'});
  TELE.counters.squadDisbanded++;
  // A squad-kind org whose only squad is destroyed and which owns no property is now defunct →
  // record its destruction with the disposition of what it held. (Only squad orgs are removed this
  // way; a realm losing one of several squads is untouched.)
  if(o && o.kind==='squad'){
    const otherSquads=S.squads.some(s=>s!==dead && s.orgId===o.id && s.strength>0);
    const ownsProp=S.settlements.some(s=>s.ownerOrgId===o.id);
    if(!otherSquads && !ownsProp) teleOrgDestroyed(o, 'military-defeat', {treasury:o.treasury, property:0});
  }
}
function capture(st, sq){
  const so=org(sq.orgId);
  const conquerorFaction=sq.factionId;
  const realm=org(conquerorFaction) || so;
  const old=org(st.ownerOrgId);
  // REPLACE: install a fresh political org subordinate to the conqueror. Founding a brand-new
  // subordinate is cycle-safe by construction (a new org has no descendants, so it can't be its
  // own ancestor); a future method that re-parents an EXISTING org must route via reparentOrg (#71).
  const gov=makeOrg('political','Намісництво '+st.name,{
    parentId:realm.id, factionId:realm.factionId||realm.id,
    treasury:40, leadershipType: realm.leadershipType==='mercenary'?'warlord':'monarch', cause:'settlement-capture'});
  makeEdge('hierarchy', realm.id, gov.id);
  S.edges=S.edges.filter(e=>!(e.kind==='ownership'&&e.to==='S'+st.id));
  makeEdge('ownership', gov.id, 'S'+st.id);
  const resident=S.chars.find(c=>c.homeId===st.id && c.alive && !c.ledOrgId) || makeChar(st.id);
  setLeader(gov, resident);
  st.ownerOrgId=gov.id; st.loyalty=45;
  sq.homeId=st.id; sq.garrisonId=st.id; sq.order='garrison'; sq.target=null;
  logEvent('⚑ <span class="link" data-sel="settlement:'+st.id+'">'+st.name+'</span> захоплено — '+
    '<b>'+(old?old.name:'вільне місто')+'</b> → <span class="link" data-sel="org:'+realm.id+'">'+realm.name+'</span>.');
  // telemetry: economic event — a settlement captured, with method (this path installs a fresh
  // subordinate governor: "replace"; direct/puppet/mutate are EXTENSION POINTS — not modelled yet).
  teleEvent('SettlementCaptured',{settlementId:st.id, fromOrgId: old?old.id:null,
    byOrgId:realm.id, toFactionId: realm.factionId||realm.id, governorOrgId:gov.id, method:'replace'});
  TELE.counters.settlementCaptured++;
}


export {
  CAPTURE_COS, capture, hostile, killSquad, moveToward, slerp, squadStep,
};
