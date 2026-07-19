// New Lords — economy.js — production, trade, caravans, balance telemetry
// Auto-split from new-lords-prototype.html (#65). THREE is the global from the classic r128 script.

import { ENT, FOOD_PER_1K, LEADERSHIP, RES, RKEYS, S, SKILLS, SQUAD_FOOD, SQUAD_WEAPONS, STEP, TIER, TIER_SCALE, TOOL_WEAR, TRAITS, chance, chr, ent, logEvent, org } from './state.js';
import { spawnCaravan } from './worldgen.js';
import { orgPower } from './orgs.js';
import { hostile, slerp } from './squads.js';

/* =====================================================================
   BALANCE TELEMETRY — metrics collection
   Source of truth: DESIGN.md → "Balance telemetry — metrics collection".

   Two channels captured at once:
     • periodic SNAPSHOTS on a slow cadence — "how did this quantity move"
       (world + per-faction aggregates, per-settlement series, per-org
        aggregates for all + full series for a bounded watched set);
     • an append-only EVENT JOURNAL, tick-stamped — "when & from what cause
       did a step-change happen".
   (v2) CARAVAN / TRADE layer: each snapshot carries a world.trade block —
   fleet state (idle vs hauling, mean load factor), trade-house counts, and a
   per-resource deficit-coverage landscape that separates three failure modes
   the raw "deficit" number conflates:
     • PRODUCTION gap   — productionShortUnits (deficit beyond ALL surplus);
     • LOGISTICS gap    — servableUnits (deficit existing surplus could cover)
                          vs deliveredSinceSnap (what caravans actually moved);
     • AFFORDABILITY gap— brokeDefCities (deficit cities whose owner can't pay).
   The journal gains a TradeExecuted row per completed haul (src→dst, qty,
   margin, profit, deliveredFrac<1 ⇒ buyer ran short) and a CaravanNoDeal row
   when a caravan can find no profitable deal from its node.
   world.trade.reach answers SPATIAL coverage — how many settlements caravans
   ever touch (coveredEver / deliveredEver / neverTouched), how concentrated
   the fleet sits now (presenceHHI → effectiveNodes), and per-trade-house
   reach; per-settlement rows carry caravansNow / caravanVisits / lastCaravanTick.
   Both are sampled at a fixed point in the tick order (end of tick()),
   driven only by the seeded sim RNG and by reading existing state — the
   sim never reads telemetry back — so a replay from the same seed yields
   byte-identical telemetry. No wall-clock / Math.random enters the payload.

   SCOPE: this instruments what the prototype actually simulates today. The
   DESIGN lists more than the sim currently has state for (13 resources vs 6
   here; coups; bank loans/defaults; nationalization; settlement abandon /
   repopulate; domination win; dynamic alliance-break; covert-edge exposure;
   agent networks; first-class construction orders). Those are marked
   "EXTENSION POINT" below — the collector shape is ready for them, they
   just have no backing state to read yet.
   ===================================================================== */
const TELE_BUILD_ID = 'nl-proto-telemetry-v2';   // fixed id (NOT a timestamp) → determinism  (v2: caravan / trade instrumentation)
const TELE_SLOT_KINDS = ['control','influence','investment'];

const TELE = {
  cfg: {
    enabled: true,
    // ≈ the ~1s economy-recompute cadence is the natural default (DESIGN); tunable.
    // Lower = denser series & larger export; this is the primary retention lever.
    snapshotEveryTicks: 5,
    watchedCap: 50,          // full per-org series kept only for this many independent orgs (+player's)
    revoltThreshold: 12,     // subordinate loyalty below this = revolt risk (see successionAndRevolt)
    // EXTENSION POINT (retention): optional down-sampling of the oldest per-entity
    // rows on very large / long runs. null = keep every row (no thinning).
    thinPerEntityKeepEvery: null,
    autoDumpAtTick: null,    // set a tick to auto-download a JSON dump at run end; null = off
  },
  snapshots: [],
  journal: [],
  meta: null,
  counters: null,            // lifetime org created/destroyed by kind & cause, + capture/squad tallies
  phase: 'runtime',          // 'worldgen' during generate(); default OrgCreated/EnterpriseFounded cause
  _prevPop: {},              // settlement id -> pop at previous snapshot (growth/decline rate)
  _sidePair: {},             // "a:b" -> 'war'|'peace'|'neutral' (war/peace transition detection)
  _sidePairSeeded: false,
  _deadOrgs: {},             // org id -> true once OrgDestroyed emitted (no double-report)
  _imports: {},              // (v2) settlement id -> {resource: units delivered by caravans since last snapshot}
  _deficitStreak: {},        // (v2) settlement id -> consecutive snapshots spent in deficit (chronic-underserved)
  _cvVisits: {},             // (v2 coverage) settlement id -> # snapshots it hosted >=1 caravan (cumulative reach)
  _cvLastVisit: {},          // (v2 coverage) settlement id -> last tick a caravan was present
  _cvDeliveredEver: {},      // (v2 coverage) settlement id -> cumulative units ever delivered to it
  _houseReach: {},           // (v2 coverage) trade-house id -> {destination settlement id: true} (distinct reach)
};

function teleFreshCounters(){
  return {
    orgCreated:   {total:0, byKind:{}, byCause:{}},
    orgDestroyed: {total:0, byKind:{}, byCause:{}},
    settlementCaptured:0, squadRecruited:0, squadDisbanded:0,
    // caravan trade ledger (v2): lifetime tallies of completed hauls
    tradesExecuted:0, tradeVolume:0, tradeProfit:0, tradeDeliveredShort:0,
  };
}
function teleBump(obj, key){ obj[key]=(obj[key]||0)+1; }
function teleCloneCounters(){   // per-snapshot value of the lifetime tallies (a real time-series, not a live ref)
  const c=TELE.counters;
  return {
    orgCreated:{total:c.orgCreated.total, byKind:Object.assign({},c.orgCreated.byKind), byCause:Object.assign({},c.orgCreated.byCause)},
    orgDestroyed:{total:c.orgDestroyed.total, byKind:Object.assign({},c.orgDestroyed.byKind), byCause:Object.assign({},c.orgDestroyed.byCause)},
    settlementCaptured:c.settlementCaptured, squadRecruited:c.squadRecruited, squadDisbanded:c.squadDisbanded,
    tradesExecuted:c.tradesExecuted, tradeVolume:c.tradeVolume, tradeProfit:c.tradeProfit, tradeDeliveredShort:c.tradeDeliveredShort,
  };
}

/* distribution summary (spread, not just mean) for a numeric array */
function teleDist(arr){
  const n=arr.length;
  if(!n) return {n:0,min:0,max:0,mean:0,std:0,p25:0,p50:0,p75:0};
  const a=arr.slice().sort((x,y)=>x-y);
  let sum=0; for(const v of a) sum+=v;
  const mean=sum/n;
  let vs=0; for(const v of a) vs+=(v-mean)*(v-mean);
  const q=p=>{ const i=(n-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return a[lo]+(a[hi]-a[lo])*(i-lo); };
  return {n, min:a[0], max:a[n-1], mean, std:Math.sqrt(vs/n), p25:q(0.25), p50:q(0.5), p75:q(0.75)};
}
/* power decomposed into its three DESIGN components (mirrors computePower) */
function telePowerParts(o){
  const wealth=o.treasury/100;
  let territory=0; for(const s of S.settlements) if(s.ownerOrgId===o.id) territory+=s.pop/500;
  let military=0; for(const s of S.squads){ const so=org(s.orgId); if(so&&(so.id===o.id||so.parentId===o.id)) military+=s.strength/4; }
  return {total:wealth+territory+military, wealth, territory, military};
}
function teleHousing(st){ return TIER[st.tier].pop*1.5; }   // derived: growth cap = housing capacity

/* ---------- run metadata (seed + worldgen params + balance-constant snapshot) ---------- */
function teleReset(seed){
  TELE.snapshots.length=0;
  TELE.journal.length=0;
  TELE.counters=teleFreshCounters();
  TELE._prevPop={}; TELE._sidePair={}; TELE._sidePairSeeded=false; TELE._deadOrgs={};
  TELE._imports={}; TELE._deficitStreak={};
  TELE._cvVisits={}; TELE._cvLastVisit={}; TELE._cvDeliveredEver={}; TELE._houseReach={};
  TELE.phase='worldgen';
  TELE.meta={
    schema:'new-lords-telemetry/v2',
    buildId:TELE_BUILD_ID,
    seed:seed>>>0,
    // worldgen params — kept in sync with generate() by hand (no param registry in the prototype yet)
    worldgen:{ landFraction:0.32, settlementTarget:26, minSeparationDot:0.965, capitals:4 },
    // snapshot of every balance constant then in effect. EXTENSION POINT: the DESIGN's formal
    // tunable-parameter registry ("Tuning tools") isn't built yet — when it lands, dump it here.
    balanceConstants:{
      STEP, TOOL_WEAR, FOOD_PER_1K, SQUAD_FOOD, SQUAD_WEAPONS,
      TIER_SCALE:Object.assign({},TIER_SCALE),
      resourceBase:Object.fromEntries(RKEYS.map(r=>[r,RES[r].base])),
      tierPop:Object.fromEntries(Object.keys(TIER).map(t=>[t,TIER[t].pop])),
      snapshotEveryTicks:TELE.cfg.snapshotEveryTicks, watchedCap:TELE.cfg.watchedCap,
      revoltThreshold:TELE.cfg.revoltThreshold,
    },
  };
}

/* ---------- event journal ---------- */
function teleEvent(type, data){
  if(!TELE.cfg.enabled) return null;
  const ev=Object.assign({tick:S.tick, type}, data);
  TELE.journal.push(ev);
  return ev;
}
function teleOrgCreated(o, cause){
  if(!TELE.cfg.enabled) return;
  cause=cause||TELE.phase;
  const c=TELE.counters.orgCreated;
  c.total++; teleBump(c.byKind,o.kind); teleBump(c.byCause,cause);
  teleEvent('OrgCreated',{orgId:o.id, kind:o.kind, leadershipType:o.leadershipType, cause, name:o.name});
}
function teleOrgDestroyed(o, cause, disposition){
  if(!TELE.cfg.enabled || TELE._deadOrgs[o.id]) return;
  TELE._deadOrgs[o.id]=true;
  const c=TELE.counters.orgDestroyed;
  c.total++; teleBump(c.byKind,o.kind); teleBump(c.byCause,cause);
  teleEvent('OrgDestroyed',{orgId:o.id, kind:o.kind, cause, name:o.name, disposition:disposition||null});
}

/* ---------- war / peace transition detection (side is DERIVED from faction pairs + alliances) ---------- */
function teleBelligerentFactions(){
  const owns={}, hasSq={};
  for(const st of S.settlements){ const o=org(st.ownerOrgId); if(o) owns[o.factionId||o.id]=true; }
  for(const sq of S.squads){ const o=org(sq.orgId); if(o) hasSq[o.factionId||o.id]=true; }
  const out=[];
  for(const f of S.factions) if(org(f.id) && (owns[f.id]||hasSq[f.id])) out.push(f.id);
  return out;
}
function teleDetectSidePairs(){
  const facs=teleBelligerentFactions();
  const cur={};
  for(let i=0;i<facs.length;i++) for(let j=i+1;j<facs.length;j++){
    const a=facs[i], b=facs[j], key=a<b? a+':'+b : b+':'+a;
    const allied=S.edges.some(e=>e.kind==='alliance' && ((e.from===a&&e.to===b)||(e.from===b&&e.to===a)));
    cur[key]= allied? 'peace' : (hostile(a,b)? 'war':'neutral');
  }
  if(TELE._sidePairSeeded){   // first snapshot only seeds the baseline (no flood of worldgen wars)
    for(const key in cur){
      const prev=TELE._sidePair[key];
      if(prev===cur[key]) continue;
      const parts=key.split(':'); const a=+parts[0], b=+parts[1];
      if(cur[key]==='war'   && prev!=='war')   teleEvent('WarDeclared',{factionA:a, factionB:b, prev:prev||'none'});
      else if(cur[key]==='peace' && prev!=='peace') teleEvent('PeaceMade',{factionA:a, factionB:b, prev:prev||'none'});
      // EXTENSION POINT: pairs that DISAPPEAR here = a faction was eliminated/absorbed; the
      // prototype has no explicit "faction eliminated" event, so that transition is not journaled.
    }
  }
  TELE._sidePair=cur; TELE._sidePairSeeded=true;
}

/* ---------- periodic snapshot ---------- */
function teleSnapshot(){
  if(!TELE.cfg.enabled) return;
  const tick=S.tick;

  /* ---- world + per-faction economy aggregates ---- */
  const facMap={};
  const facRec=fid=>{
    if(fid==null) return null;
    if(!facMap[fid]){
      const fo=org(fid), fdef=S.factions.find(f=>f.id===fid);
      facMap[fid]={ factionId:fid, name:fo?fo.name:('faction '+fid), color:fdef?fdef.color:null,
        treasury:0, popByTier:{camp:0,village:0,city:0,megalopolis:0}, territory:0,
        settlements:{total:0, byTier:{camp:0,village:0,city:0,megalopolis:0}, owned:0, unowned:0, abandoned:0},
        housing:{total:0, shortfall:0}, enterprises:{running:0, idle:0},
        squads:{garrison:0, mobile:0, upkeep:0}, orgs:{total:0, independent:0, subordinate:0} };
    }
    return facMap[fid];
  };

  const world={
    economy:{
      treasury:0,
      populationByTier:{camp:0,village:0,city:0,megalopolis:0},
      resources:{}, settlements:{total:S.settlements.length,
        byTier:{camp:0,village:0,city:0,megalopolis:0}, owned:0, unowned:0, abandoned:0},
      housing:{total:0, shortfall:0}, enterprises:{running:0, idle:0},
      // EXTENSION POINT: no first-class construction-order system (FoundEnterprise spends
      // instantly), so active/stalled construction is always 0/0 here.
      construction:{active:0, stalled:0},
      squads:{garrison:0, mobile:0, upkeep:0}, territory:0,
    },
    orgs:{}, population:{},
  };
  const priceSamples={}; for(const r of RKEYS){ world.economy.resources[r]={stock:0, net:0, priceMean:0, priceStd:0}; priceSamples[r]=[]; }

  // (v2 coverage) where caravans sit RIGHT NOW, by settlement id — drives per-settlement counts + presence HHI
  const cvCountById={}; let cvTotalNow=0;
  for(const cv of S.caravans){ const cst=S.settlements[cv.atIdx]; if(cst){ cvCountById[cst.id]=(cvCountById[cst.id]||0)+1; cvTotalNow++; } }

  const settlementRows=[];
  for(const st of S.settlements){
    const owner=org(st.ownerOrgId);
    const fid=owner? (owner.factionId||owner.id) : null;
    const fr=facRec(fid);
    const house=teleHousing(st), shortfall=Math.max(0, st.pop-house);
    // EXTENSION POINT: no abandon/repopulate system — pop floors at 20, so "abandoned" is derived false.
    const abandoned=false;
    // enterprises by state at this settlement
    let running=0, idle=0;
    for(const id of st.entIds){ const e=ent(id); if(!e) continue; if(e.staffed && !e.stalled) running++; else idle++; }
    // income breakdown (mirrors economyStep territory/tax)
    const incBase=(st.pop/1000)*2.2*st.area;
    const incTax = owner? incBase*(0.4+owner.taxRate*2) : 0;

    world.economy.populationByTier[st.tier]+=st.pop;
    world.economy.settlements.byTier[st.tier]++;
    if(owner) world.economy.settlements.owned++; else world.economy.settlements.unowned++;
    if(abandoned) world.economy.settlements.abandoned++;
    world.economy.housing.total+=house; world.economy.housing.shortfall+=shortfall;
    world.economy.enterprises.running+=running; world.economy.enterprises.idle+=idle;
    world.economy.territory+=st.area;
    const resRow={};
    for(const r of RKEYS){
      const stock=st.stock[r]||0, net=st.net[r]||0, price=st.price[r]||0;
      world.economy.resources[r].stock+=stock; world.economy.resources[r].net+=net;
      priceSamples[r].push(price);
      resRow[r]={stock, net, price};
    }
    if(fr){
      // faction treasury is summed from org treasuries in the org loop below
      fr.popByTier[st.tier]+=st.pop; fr.territory+=st.area;
      fr.settlements.total++; fr.settlements.byTier[st.tier]++; fr.settlements.owned++;
      if(abandoned) fr.settlements.abandoned++;
      fr.housing.total+=house; fr.housing.shortfall+=shortfall;
      fr.enterprises.running+=running; fr.enterprises.idle+=idle;
    }
    // (v2) caravan coverage per settlement: units imported since last snapshot, current deficit, chronic-deficit streak
    let impSum=0; const impRec=TELE._imports[st.id];
    if(impRec) for(const r of RKEYS) impSum+=impRec[r]||0;
    let defUnits=0; for(const r of RKEYS){ const dd=(st.target[r]||1)*0.95-(st.stock[r]||0); if(dd>0) defUnits+=dd; }
    TELE._deficitStreak[st.id]= defUnits>=2 ? (TELE._deficitStreak[st.id]||0)+1 : 0;
    // (v2 coverage) this settlement's caravan reach: current count + cumulative visit tally + last-seen tick
    const cvNow=cvCountById[st.id]||0;
    if(cvNow>0){ TELE._cvVisits[st.id]=(TELE._cvVisits[st.id]||0)+1; TELE._cvLastVisit[st.id]=tick; }
    settlementRows.push({
      tick, id:st.id, name:st.name, tier:st.tier, ownerOrgId:st.ownerOrgId, faction:fid,
      area:st.area, pop:st.pop, popRate: st.pop-(TELE._prevPop[st.id]!=null?TELE._prevPop[st.id]:st.pop),
      housing:house, shortfall, resources:resRow,
      income:{ base:incBase, territoryTax:incTax, taxRate: owner?owner.taxRate:0 },
      enterprises:{running, idle}, abandoned, contested: st.contest>0,
      imported:+impSum.toFixed(2), deficitUnits:+defUnits.toFixed(1), deficitStreak:TELE._deficitStreak[st.id],
      caravansNow:cvNow, caravanVisits:TELE._cvVisits[st.id]||0, lastCaravanTick:(TELE._cvLastVisit[st.id]!=null?TELE._cvLastVisit[st.id]:null),
    });
    TELE._prevPop[st.id]=st.pop;
  }
  for(const r of RKEYS){ const d=teleDist(priceSamples[r]); world.economy.resources[r].priceMean=d.mean; world.economy.resources[r].priceStd=d.std; }

  /* ---- world squad split + upkeep ---- */
  for(const sq of S.squads){
    const up=sq.strength*0.05;
    world.economy.squads.upkeep+=up;
    if(sq.garrisonId){ world.economy.squads.garrison++; } else { world.economy.squads.mobile++; }
    const so=org(sq.orgId); const fid=so? (so.factionId||so.id) : null; const fr=facRec(fid);
    if(fr){ if(sq.garrisonId) fr.squads.garrison++; else fr.squads.mobile++; fr.squads.upkeep+=up; }
  }

  /* ---- org aggregates (ALL orgs) + per-faction org counts + treasury ---- */
  const kindSeed={political:0,business:0,squad:0,network:0};
  const ltSeed={}; for(const lt of LEADERSHIP) ltSeed[lt]=0;
  const oByKind=Object.assign({},kindSeed), oByLT=Object.assign({},ltSeed);
  const treasuries=[], powers=[], subLoyalties=[];
  let independent=0, subordinate=0, belowRevolt=0, perkHolders=0, perksTotal=0, postsFilled=0, postsTotal=0;
  for(const o of S.orgs){
    world.economy.treasury+=o.treasury;
    teleBump(oByKind,o.kind); teleBump(oByLT,o.leadershipType);
    treasuries.push(o.treasury); powers.push(orgPower(o));
    if(o.parentId==null) independent++; else { subordinate++; subLoyalties.push(o.loyalty); if(o.loyalty<TELE.cfg.revoltThreshold) belowRevolt++; }
    if(o.perks.length){ perkHolders++; perksTotal+=o.perks.length; }
    for(const k in o.posts){ postsTotal++; if(o.posts[k]) postsFilled++; }
    const fid=o.factionId||o.id, fr=facRec(fid);
    if(fr){ fr.treasury+=o.treasury; fr.orgs.total++; if(o.parentId==null) fr.orgs.independent++; else fr.orgs.subordinate++; }
  }
  // slot / edge inventory
  const slotByKind={}, allianceCount={f:0};
  let covert=0, pub=0;
  for(const e of S.edges){
    teleBump(slotByKind, e.kind);
    if(TELE_SLOT_KINDS.includes(e.kind)){ if(e.visibility==='covert') covert++; else pub++; }
    if(e.kind==='alliance') allianceCount.f++;
  }
  // side-pair counts (war / peace / neutral) among belligerent factions
  let warPairs=0, peacePairs=0, neutralPairs=0;
  for(const k in TELE._sidePair){ const v=TELE._sidePair[k]; if(v==='war')warPairs++; else if(v==='peace')peacePairs++; else neutralPairs++; }
  world.orgs={
    total:S.orgs.length, independent, subordinate,
    byKind:oByKind, byLeadershipType:oByLT,
    wealth:teleDist(treasuries), power:teleDist(powers),
    subordinateLoyalty:teleDist(subLoyalties), belowRevoltThreshold:belowRevolt,
    slots:{ byKind:slotByKind, covert, public:pub, alliances:allianceCount.f },
    perks:{ holders:perkHolders, total:perksTotal },
    posts:{ filled:postsFilled, total:postsTotal, rate: postsTotal? postsFilled/postsTotal : 0 },
    sidePairs:{ war:warPairs, peace:peacePairs, neutral:neutralPairs },
  };

  /* ---- population aggregates + leader trait/skill distributions ---- */
  let materialized=0, latent=0;
  const traitCounts={}, skillSums={}; for(const s of SKILLS) skillSums[s]=0; let leaderCount=0;
  for(const t of TRAITS) traitCounts[t]=0;
  for(const c of S.chars){ if(!c.alive) continue; materialized++;
    if(c.ledOrgId){ leaderCount++; for(const t of c.traits) teleBump(traitCounts,t); for(const s of SKILLS) skillSums[s]+=(c.skills[s]||0); }
  }
  for(const st of S.settlements) latent+=st.pop;   // demographic reservoir (latent pool)
  const skillMeans={}; for(const s of SKILLS) skillMeans[s]= leaderCount? skillSums[s]/leaderCount : 0;
  world.population={ materializedChars:materialized, latentPool:latent,
    leaders:{ count:leaderCount, traitCounts, skillMeans } };

  /* ---- per-org: full series for the WATCHED SET (independent orgs + player's org, bounded) ---- */
  const indep=S.orgs.filter(o=>o.parentId==null).slice().sort((a,b)=>orgPower(b)-orgPower(a));
  const watchedList=indep.slice(0, TELE.cfg.watchedCap);
  const pOrg = S.playerCharId!=null ? org((chr(S.playerCharId)||{}).ledOrgId) : null;
  if(pOrg && !watchedList.includes(pOrg)) watchedList.push(pOrg);
  const watchedRows=watchedList.map(o=>{
    const pw=telePowerParts(o);
    const childrenByKind=Object.assign({},kindSeed); let children=0;
    for(const x of S.orgs) if(x.parentId===o.id){ children++; teleBump(childrenByKind,x.kind); }
    let held=0, occupied=0, agentCovert=0, agentPublic=0, alliances=0;
    for(const e of S.edges){
      if(e.from===o.id && TELE_SLOT_KINDS.includes(e.kind)){ held++; if(org(e.to)) occupied++;
        if(e.kind!=='control'){ if(e.visibility==='covert') agentCovert++; else agentPublic++; } }
      if(e.kind==='alliance' && (e.from===o.id||e.to===o.id)) alliances++;
    }
    let owned=0; for(const s of S.settlements) if(s.ownerOrgId===o.id) owned++;
    let postsF=0; for(const k in o.posts) if(o.posts[k]) postsF++;
    return {
      tick, id:o.id, name:o.name, kind:o.kind, leadershipType:o.leadershipType, independent:o.parentId==null,
      treasury:o.treasury,
      income:{ blended:o.income||0, expenses:o.expenses||0, profit:o.profit||0, trade:!!o.trade },
      memberCount:o.members.length, power:pw,
      children, childrenByKind,
      slots:{ held, occupied }, alliances, agentEdges:{ covert:agentCovert, public:agentPublic },
      perks:o.perks.length, posts:{ filled:postsF, total:Object.keys(o.posts).length },
      loyalty:o.loyalty, ownedProperty:owned, lastDecision:o.lastDecision,
    };
  });

  /* ---- (v2) caravan / trade fleet + per-resource deficit-coverage landscape ----
     Separates the three failure modes the raw "deficit" number conflates:
       • unservableUnits — deficit in a good with NO surplus anywhere → a PRODUCTION gap, not a caravan one;
       • servableUnits   — deficit where surplus exists elsewhere → a LOGISTICS gap (reach / throughput);
       • brokeDefCities  — deficit cities whose owner can't afford imports → an AFFORDABILITY gap.
     deliveredSinceSnap is the caravan through-flow per resource in the window since the last snapshot. */
  {
    let cvIdle=0, cvHaul=0, loadN=0, loadSum=0;
    for(const cv of S.caravans){ if(cv.phase==='hauling'){ cvHaul++; if(cv.capacity){ loadSum+=(cv.qty||0)/cv.capacity; loadN++; } } else cvIdle++; }
    const houses=S.orgs.filter(o=>o.trade);
    const coverage={};
    for(const r of RKEYS){
      let defC=0, defU=0, surC=0, surU=0, broke=0; const defIdx=[], surIdx=[];
      S.settlements.forEach((st,i)=>{
        const tgt=st.target[r]||1, s=st.stock[r]||0, d=tgt*0.95-s, su=s-tgt*0.95;
        if(d>=2){ defC++; defU+=d; defIdx.push(i);
          const ow=org(st.ownerOrgId); if(ow && ow.treasury < Math.min(55,d)*priceOf(st,r)) broke++; }
        if(su>=2){ surC++; surU+=su; surIdx.push(i); }
      });
      let hopsN=0, hopsSum=0, unreach=0;
      if(surIdx.length) for(const di of defIdx){ let best=null;
        for(const si of surIdx){ const p=pathBetween(di,si); const h=p?p.length-1:null; if(h!=null && (best==null||h<best)) best=h; }
        if(best==null) unreach++; else { hopsN++; hopsSum+=best; } }
      let deliv=0; for(const sid in TELE._imports) deliv+=TELE._imports[sid][r]||0;
      coverage[r]={ defCities:defC, defUnits:+defU.toFixed(1), surCities:surC, surUnits:+surU.toFixed(1),
        movable:surC>0,
        servableUnits:+Math.min(defU,surU).toFixed(1),           // deficit that existing surplus COULD cover — logistics-addressable
        productionShortUnits:+Math.max(0,defU-surU).toFixed(1),  // deficit beyond all surplus → a PRODUCTION gap, not a caravan one
        brokeDefCities:broke, medHopsToSurplus: hopsN?+(hopsSum/hopsN).toFixed(2):null, unreachableDefCities:unreach,
        deliveredSinceSnap:+deliv.toFixed(1) };
    }
    // (v2 coverage) spatial reach across the whole run + how concentrated the fleet sits right now.
    // Answers "how much of the world do caravans actually touch, and do they cluster in one region?"
    let coveredEver=0, deliveredEver=0, neverTouched=0;
    for(const st of S.settlements){
      const visited=(TELE._cvVisits[st.id]||0)>0, gotGoods=(TELE._cvDeliveredEver[st.id]||0)>0;
      if(visited) coveredEver++; if(gotGoods) deliveredEver++;
      if(!visited && !gotGoods) neverTouched++;
    }
    let presenceHHI=0; if(cvTotalNow>0) for(const id in cvCountById){ const f=cvCountById[id]/cvTotalNow; presenceHHI+=f*f; }
    const reachSizes=houses.map(h=>Object.keys(TELE._houseReach[h.id]||{}).length);
    world.trade={ caravans:S.caravans.length, idle:cvIdle, hauling:cvHaul,
      meanLoadFactor: loadN?+(loadSum/loadN).toFixed(3):0,
      houses:houses.length, houseCapTotal:houses.reduce((a,h)=>a+(h.caravanCap||0),0),
      tradesLifetime:TELE.counters.tradesExecuted, volumeLifetime:+TELE.counters.tradeVolume.toFixed(1),
      profitLifetime:+TELE.counters.tradeProfit.toFixed(1), deliveredShortLifetime:TELE.counters.tradeDeliveredShort,
      reach:{ settlements:S.settlements.length, coveredEver, deliveredEver, neverTouched,
        placedNow:Object.keys(cvCountById).length, presenceHHI:+presenceHHI.toFixed(3),
        effectiveNodes: presenceHHI>0?+(1/presenceHHI).toFixed(1):0, houseReach:teleDist(reachSizes) },
      coverage };
  }

  const factionsOut=Object.keys(facMap).map(Number).sort((a,b)=>a-b).map(k=>facMap[k]);

  TELE.snapshots.push({
    tick, world, factions:factionsOut, settlements:settlementRows,
    orgs:{
      // aggregates answer "how many orgs" and "how many created/destroyed by kind & cause"
      aggregate:world.orgs,
      lifetime:teleCloneCounters(),   // cumulative created/destroyed (by kind & cause) as of this tick
      watched:watchedRows,
    },
  });
  TELE._imports={};   // (v2) reset per-window import accumulator after both settlement rows and coverage have read it

  // EXTENSION POINT (retention): if thinPerEntityKeepEvery is set, down-sample the oldest
  // per-entity rows of already-stored snapshots here. Left as a no-op (keep everything) by default.
}

/* called at the end of every tick() — fixed point in tick order */
function teleTick(){
  if(!TELE.cfg.enabled) return;
  const N=Math.max(1, TELE.cfg.snapshotEveryTicks|0);
  if(S.tick % N !== 0) return;
  teleDetectSidePairs();
  teleSnapshot();
  if(TELE.cfg.autoDumpAtTick!=null && S.tick===TELE.cfg.autoDumpAtTick) teleExport({download:true});
}

/* ---------- export: JSON (snapshots + journal + metadata) + optional flat CSV ---------- */
function teleExport(opts={}){
  const payload={ meta:TELE.meta, config:Object.assign({},TELE.cfg),
    counters:TELE.counters, snapshots:TELE.snapshots, journal:TELE.journal };
  if(opts.download){
    const blob=new Blob([JSON.stringify(payload)], {type:'application/json'});
    teleDownload(blob, 'telemetry-seed'+(TELE.meta?TELE.meta.seed:'x')+'.json');
  }
  return payload;
}
function teleCSV(){
  const esc=v=>{ v=(v==null?'':String(v)); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; };
  // per-settlement flat table
  const sCols=['tick','id','name','tier','ownerOrgId','faction','area','pop','popRate','housing','shortfall'];
  for(const r of RKEYS){ sCols.push(r+'_stock', r+'_net', r+'_price'); }
  sCols.push('income_base','income_territoryTax','entRunning','entIdle','abandoned','contested');
  const sRows=[sCols.join(',')];
  for(const snap of TELE.snapshots) for(const row of snap.settlements){
    const line=[row.tick,row.id,row.name,row.tier,row.ownerOrgId,row.faction,row.area,row.pop,row.popRate,row.housing,row.shortfall];
    for(const r of RKEYS){ const rr=row.resources[r]; line.push(rr.stock, rr.net, rr.price); }
    line.push(row.income.base, row.income.territoryTax, row.enterprises.running, row.enterprises.idle, row.abandoned, row.contested);
    sRows.push(line.map(esc).join(','));
  }
  // per-watched-org flat table
  const oCols=['tick','id','name','kind','leadershipType','independent','treasury','income_blended','expenses','profit',
    'memberCount','power_total','power_wealth','power_territory','power_military','children','slots_held','slots_occupied',
    'alliances','agentCovert','agentPublic','perks','postsFilled','loyalty','ownedProperty','lastDecision'];
  const oRows=[oCols.join(',')];
  for(const snap of TELE.snapshots) for(const row of snap.orgs.watched){
    oRows.push([row.tick,row.id,row.name,row.kind,row.leadershipType,row.independent,row.treasury,row.income.blended,
      row.income.expenses,row.income.profit,row.memberCount,row.power.total,row.power.wealth,row.power.territory,
      row.power.military,row.children,row.slots.held,row.slots.occupied,row.alliances,row.agentEdges.covert,
      row.agentEdges.public,row.perks,row.posts.filled,row.loyalty,row.ownedProperty,row.lastDecision].map(esc).join(','));
  }
  return { settlements:sRows.join('\n'), orgs:oRows.join('\n') };
}
function teleDownload(blob, name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a);
  a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
function teleExportCSV(){
  const csv=teleCSV();
  teleDownload(new Blob([csv.settlements],{type:'text/csv'}), 'telemetry-settlements.csv');
  teleDownload(new Blob([csv.orgs],{type:'text/csv'}), 'telemetry-orgs.csv');
}
// console handles + live inspection (telemetry is inspectable live as well as exportable)
window.TELE=TELE;
window.S=S;                         // world state, for live console inspection
window.exportTelemetry=teleExport;
window.exportTelemetryCSV=teleExportCSV;

/* =====================================================================
   ECONOMY — closed loops: everything produced is consumed
   ===================================================================== */
function recomputeTargets(st){
  // demand: population eats; enterprises need inputs + tools; squads need food/weapons
  const d={food:0,wood:0,ore:0,steel:0,tools:0,weapons:0};
  d.food += st.pop/1000*FOOD_PER_1K;
  for(const id of st.entIds){
    const e=ent(id); if(!e) continue;
    const def=ENT[e.kind];
    for(const r in def.in) d[r]+=def.in[r]*e.rate;
    d.tools+=TOOL_WEAR*e.rate;
  }
  const garrisons=S.squads.filter(s=>s.homeId===st.id);
  d.food += garrisons.length*SQUAD_FOOD;
  d.weapons += garrisons.length*SQUAD_WEAPONS;
  // construction reserve keeps wood & steel wanted even without a forge
  d.wood += 0.4; d.steel += 0.2;
  for(const r of RKEYS) st.target[r]=Math.max(1.5, d[r]*8); // ~8 steps of buffer
  st.demand=d;
}
function priceOf(st,r){
  const t=st.target[r]||1, s=st.stock[r]||0;
  const scarcity=Math.max(0.3, Math.min(3.2, (2*t - s)/t));
  return RES[r].base*scarcity;
}

function economyStep(){
  for(const st of S.settlements){
    recomputeTargets(st);
    for(const r of RKEYS){ st.net[r]=0; st.gross[r]=[0,0]; }

    // --- production ---
    for(const id of st.entIds){
      const e=ent(id); if(!e) continue;
      const def=ENT[e.kind];
      let can=e.staffed?1:0;
      // real inputs gate output hard — no ore, no steel
      for(const r in def.in){
        const need=def.in[r]*e.rate;
        can=Math.min(can, need>0 ? st.stock[r]/Math.max(need,1e-6) : 1);
      }
      can=Math.max(0, Math.min(1, can));
      // tools are a soft efficiency multiplier: no tools = slow, not dead
      const toolsNeed=TOOL_WEAR*e.rate;
      const toolsHave=Math.min(1, st.stock.tools/Math.max(toolsNeed,1e-6));
      can *= (0.55 + 0.45*toolsHave);
      e.stalled = can < 0.35;
      for(const r in def.in){
        const used=def.in[r]*e.rate*can;
        st.stock[r]-=used; st.net[r]-=used; st.gross[r][1]+=used;
      }
      const toolsUsed=Math.min(st.stock.tools, toolsNeed*Math.max(can,0.35));
      st.stock.tools-=toolsUsed; st.net.tools-=toolsUsed; st.gross.tools[1]+=toolsUsed;
      for(const r in def.out){
        const made=def.out[r]*e.rate*can;
        st.stock[r]+=made; st.net[r]+=made; st.gross[r][0]+=made;
        e.out=made;
      }
      // enterprise revenue: most to its business org, a tax cut to the settlement's owner
      const eo=org(e.ownerOrgId), so=org(st.ownerOrgId);
      if(eo){
        const rev=Object.keys(def.out).reduce((a,r)=>a+def.out[r]*e.rate*can*priceOf(st,r)*0.30,0);
        const tax=so? rev*Math.min(0.5, so.taxRate+0.15) : 0;
        eo.treasury+=rev-tax; eo.income=rev-tax;
        if(so){ so.treasury+=tax; so.income=(so.income||0)*0.85+tax*0.15; }
      }
    }

    // --- population consumption ---
    const eat=st.pop/1000*FOOD_PER_1K;
    const got=Math.min(eat, st.stock.food);
    st.stock.food-=got; st.net.food-=got; st.gross.food[1]+=eat;
    if(got < eat*0.92){
      st.pop=Math.max(20, Math.round(st.pop*0.997)); st.starving=true;
    } else {
      st.starving=false;
      const cap=TIER[st.tier].pop*1.5;
      if(st.pop<cap && st.stock.food>st.target.food*0.5) st.pop=Math.round(st.pop*1.0018+0.4);
    }

    // --- squads consume from their home settlement ---
    for(const sq of S.squads){
      if(sq.homeId!==st.id) continue;
      const f=Math.min(SQUAD_FOOD, st.stock.food);
      st.stock.food-=f; st.net.food-=f; st.gross.food[1]+=SQUAD_FOOD;
      const w=Math.min(SQUAD_WEAPONS, st.stock.weapons);
      st.stock.weapons-=w; st.net.weapons-=w; st.gross.weapons[1]+=SQUAD_WEAPONS;
      if(f<SQUAD_FOOD*0.8 || w<SQUAD_WEAPONS*0.5){
        sq.supplied=false;
        if(chance(0.05) && sq.strength>1){ sq.strength-=1; }
      } else { sq.supplied=true;
        if(chance(0.03) && sq.strength<18) sq.strength+=1; }
    }

    // clamp + prices
    for(const r of RKEYS){
      const cap=st.target[r]*4;
      if(st.stock[r]>cap) st.stock[r]=cap;          // overflow is wasted, producers don't stall
      if(st.stock[r]<0) st.stock[r]=0;
      st.price[r]=priceOf(st,r);
    }

    // --- territory & tax income to the owner ---
    const owner=org(st.ownerOrgId);
    if(owner){
      const base = (st.pop/1000)*2.2*st.area;
      const tax = base*(0.4+owner.taxRate*2);
      owner.treasury += tax;
      owner.income = (owner.income||0)*0.7 + tax*0.3;
      st.loyalty += (owner.taxRate>0.28? -0.25 : 0.12) + (st.starving? -0.4:0.05);
      st.loyalty = Math.max(0, Math.min(100, st.loyalty));
    }
  }
}

/* =====================================================================
   CARAVANS — trade houses close deficits, profit, and scale up
   ===================================================================== */
const PATHS=new Map();
function pathKey(a,b){return a*1000+b;}
function precomputePaths(){
  PATHS.clear();
  for(let a=0;a<S.settlements.length;a++)
    for(let b=0;b<S.settlements.length;b++)
      PATHS.set(pathKey(a,b), bfsPath(a,b));
}
function pathBetween(a,b){
  const c=PATHS.get(pathKey(a,b));
  return c!==undefined ? c : bfsPath(a,b);
}
function bfsPath(a,b){
  if(a===b) return [a];
  const prev=new Array(S.settlements.length).fill(-1);
  const q=[a]; prev[a]=a;
  while(q.length){
    const cur=q.shift();
    if(cur===b) break;
    for(const nb of S.adj[cur]) if(prev[nb]===-1){prev[nb]=cur; q.push(nb);}
  }
  if(prev[b]===-1) return null;
  const out=[]; let c=b;
  while(c!==a){out.unshift(c); c=prev[c];}
  out.unshift(a);
  return out;
}
function bestTrade(cv, house){
  const here=S.settlements[cv.atIdx];
  let best=null;
  for(const r of RKEYS){
    const surplus = here.stock[r] - here.target[r]*0.95;
    if(surplus < 2) continue;
    const buy = priceOf(here,r);
    for(let j=0;j<S.settlements.length;j++){
      const dst=S.settlements[j];
      if(dst===here) continue;
      const deficit = dst.target[r]*0.95 - dst.stock[r];
      if(deficit < 2) continue;
      const dstOwner=org(dst.ownerOrgId);
      if(!dstOwner) continue;
      const sell=priceOf(dst,r);
      const margin=sell-buy;
      if(margin<=0.3) continue;
      const p=pathBetween(cv.atIdx,j);
      if(!p) continue;
      const dist=p.length-1;
      const qty=Math.min(cv.capacity, surplus, deficit, Math.floor(house.treasury/Math.max(buy,0.5)));
      if(qty<2) continue;
      const score = margin*qty - dist*1.2;
      if(score>2 && (!best || score>best.score)) best={score, r, j, path:p, qty, buy, sell, deficit};
    }
  }
  return best;
}
function caravanStep(){
  for(const cv of S.caravans){
    const house=org(cv.orgId);
    if(!house){cv.dead=true;continue;}
    if(cv.phase==='idle'){
      const deal=bestTrade(cv, house);
      if(!deal){
        cv.phase='idle';
        // (v2) edge-triggered: journal the first tick a caravan finds NO profitable deal from its node ("stuck")
        if(TELE.cfg.enabled && !cv.stuck){ cv.stuck=true; teleEvent('CaravanNoDeal',{caravanId:cv.id, atSettlement:S.settlements[cv.atIdx].id}); }
        continue;
      }
      const here=S.settlements[cv.atIdx];
      const cost=deal.qty*deal.buy;
      if(house.treasury<cost) continue;
      house.treasury-=cost;
      here.stock[deal.r]-=deal.qty;
      const srcOwner=org(here.ownerOrgId); if(srcOwner) srcOwner.treasury+=cost;
      cv.cargo=deal.r; cv.qty=deal.qty; cv.buyPrice=deal.buy;
      cv.srcIdx=cv.atIdx; cv.dealHops=deal.path.length-1; cv.stuck=false;   // (v2) trade-ledger provenance
      cv.path=deal.path; cv.step=0; cv.prog=0; cv.phase='hauling'; cv.dest=deal.j;
      continue;
    }
    if(cv.phase==='hauling' || cv.phase==='returning'){
      if(!cv.path || cv.path.length<2){ arrive(cv, house); continue; }
      cv.prog += 0.22;
      if(cv.prog>=1){
        cv.prog=0; cv.step++;
        cv.atIdx=cv.path[Math.min(cv.step, cv.path.length-1)];
        if(cv.step>=cv.path.length-1){ arrive(cv, house); continue; }
      }
      const a=S.settlements[cv.path[cv.step]].dir;
      const b=S.settlements[cv.path[Math.min(cv.step+1,cv.path.length-1)]].dir;
      cv.dir = slerp(a,b,cv.prog);
    }
  }
  S.caravans=S.caravans.filter(c=>!c.dead);

  // trade houses grow: buy more caravans when rich
  for(const h of S.orgs){
    if(!h.trade) continue;
    const owned=S.caravans.filter(c=>c.orgId===h.id).length;
    const cap = Math.min(6, h.caravanCap);
    if(owned<cap && h.treasury>340){
      h.treasury-=200; spawnCaravan(h);
      logEvent('<b>'+h.name+'</b> спорядив новий караван.');
    }
    if(owned>=cap && cap<6 && h.treasury>1100){
      h.treasury-=700; h.caravanCap+=1; h.perks.push('Логістичний хаб');
      logEvent('<b>'+h.name+'</b> розширився: логістичний хаб (+караванна місткість).');
    }
  }
}
function arrive(cv, house){
  const dst=S.settlements[cv.atIdx];
  if(cv.phase==='hauling' && cv.cargo){
    const sell=priceOf(dst,cv.cargo);
    const dstOwner=org(dst.ownerOrgId);
    const pay=cv.qty*sell;
    const afford = dstOwner? Math.min(pay, dstOwner.treasury) : 0;
    const delivered = pay>0 ? cv.qty*(afford/pay) : 0;
    dst.stock[cv.cargo]+=delivered;
    if(dstOwner) dstOwner.treasury-=afford;
    house.treasury+=afford;
    const profit=afford - cv.qty*cv.buyPrice;
    cv.profit+=profit; cv.trips++;
    house.profit=(house.profit||0)*0.8+profit*0.2;
    if(delivered>1 && chance(0.35))
      logEvent('Караван <b>'+house.name+'</b>: '+Math.round(delivered)+' '+RES[cv.cargo].label.toLowerCase()+
        ' → <span class="link" data-sel="settlement:'+dst.id+'">'+dst.name+'</span> ('+(profit>=0?'+':'')+Math.round(profit)+'💰)');
    // (v2) trade ledger: one journal row per completed haul — the raw material for a math model of caravan behavior
    if(TELE.cfg.enabled){
      const deliveredFrac = pay>0 ? afford/pay : 0;   // <1 ⇒ buyer ran out of money (affordability loss)
      const srcId = (cv.srcIdx!=null && S.settlements[cv.srcIdx]) ? S.settlements[cv.srcIdx].id : null;
      teleEvent('TradeExecuted',{houseId:house.id, resource:cv.cargo, qtyBought:cv.qty, delivered:+delivered.toFixed(2),
        src:srcId, dst:dst.id, buyPrice:+cv.buyPrice.toFixed(2), sellPrice:+sell.toFixed(2),
        margin:+(sell-cv.buyPrice).toFixed(2), distHops:(cv.dealHops!=null?cv.dealHops:null),
        profit:+profit.toFixed(2), deliveredFrac:+deliveredFrac.toFixed(3)});
      if(!TELE._imports[dst.id]) TELE._imports[dst.id]={};
      TELE._imports[dst.id][cv.cargo]=(TELE._imports[dst.id][cv.cargo]||0)+delivered;
      const tc=TELE.counters; tc.tradesExecuted++; tc.tradeVolume+=delivered; tc.tradeProfit+=profit; if(deliveredFrac<0.999) tc.tradeDeliveredShort++;
      // (v2 coverage) cumulative "who did caravans ever reach"
      TELE._cvDeliveredEver[dst.id]=(TELE._cvDeliveredEver[dst.id]||0)+delivered;
      if(!TELE._houseReach[house.id]) TELE._houseReach[house.id]={};
      TELE._houseReach[house.id][dst.id]=true;
    }
    cv.cargo=null; cv.qty=0;
  }
  cv.phase='idle'; cv.path=null; cv.step=0; cv.prog=0; cv.dir=dst.dir.clone();
}


export {
  PATHS, TELE, TELE_BUILD_ID, TELE_SLOT_KINDS, arrive, bestTrade, bfsPath, caravanStep, economyStep, pathBetween, pathKey, precomputePaths,
  priceOf, recomputeTargets, teleBelligerentFactions, teleBump, teleCSV, teleCloneCounters, teleDetectSidePairs, teleDist, teleDownload, teleEvent, teleExport, teleExportCSV,
  teleFreshCounters, teleHousing, teleOrgCreated, teleOrgDestroyed, telePowerParts, teleReset, teleSnapshot, teleTick,
};
