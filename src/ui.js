// New Lords — ui.js — panels, tooltips, HUD, menus, inspector, org-graph view, input handlers
// Auto-split from new-lords-prototype.html (#65). THREE is the global from the classic r128 script.

import { EKEYS, ENT, KIND_LABEL, LEADERSHIP, LT_LABEL, RES, RKEYS, S, SKILLS, SKILL_LABEL, TIER, TOOL_WEAR, ZONE, byId, chr, ent, logEvent, org, pick, rint, rnd, sqd, stl } from './state.js';
import { teleEvent, teleExport } from './economy.js';
import { createEnterprise, generate, makeChar, makeEdge, orgUtility, setLeader, spawnCaravan, spawnSquad } from './worldgen.js';
import { orgManagement, orgPower, radialTreePlace } from './orgs.js';
import { capture, hostile } from './squads.js';
import { MARK_R, _camNrm, camDist, camera, cityCache, cityLive, factionColor, hover, invalidatePawns, picks, root, selectionDir, setCamDist, setHover, sun, updateMarkers } from './render.js';

const canvas=document.getElementById('scene');  // own DOM ref (see #65 split notes)

/* =====================================================================
   CAMERA — trackball: the planet turns freely, no poles, no limits.
   Tilt (#28): only while zoomed in close (camAlt ≤ TILT_ALT_MAX) can the view
   pitch off the default top-down toward the horizon and yaw (orbit) around the
   focused near-surface point. Pitch 0 = straight down — byte-identical to the
   old fixed camera; pitch is clamped short of the horizon (never up into the
   sky). Driven by an Alt + middle-button drag (below); the moment the camera
   climbs past TILT_ALT_MAX the view snaps firmly back to a strict top-down.
   ===================================================================== */
let camPitch=0, camYaw=0;                  // radians — off-top-down tilt (#28)
const PITCH_MAX=70*Math.PI/180;            // clamp: toward the horizon, never past it
const TILT_ALT_MAX=0.2;                     // tilt only at very low altitude — street level, well below city geometry (camAlt 0.45); above it the view snaps to strict top-down
const TILT_PITCH_PER_PX=0.006, TILT_YAW_PER_PX=0.006;
function updateCamera(){
  // Orbit the camera on a sphere of radius camAlt about the near-surface focus point
  // F=(0,0,1): pitch tilts it down toward the horizon, yaw spins that oblique view
  // around F. At pitch=0 this is exactly the old (0,0,camDist)→origin straight-down view.
  const alt=Math.max(0, camDist-1);
  const sp=Math.sin(camPitch), cp=Math.cos(camPitch);
  const sy=Math.sin(camYaw),   cy=Math.cos(camYaw);
  // The pitch swing must lie ALONG the screen-vertical (camera up), not across it — else a
  // vertical drag orbits sideways (swapped axes). With up=(-sy,cy,0), that in-plane offset
  // is (sp*sy, -sp*cy): at yaw=0 the camera swings back along -Y as pitch grows, so dragging
  // up tilts the view toward the horizon (horizon rises from the top edge), not sideways.
  camera.position.set(alt*sp*sy, -alt*sp*cy, 1+alt*cp);
  camera.up.set(-sy, cy, 0);               // yaw-locked up → stable orbit, level horizon
  camera.lookAt(0,0,1);
  _camNrm.copy(camera.position).normalize();
  sun.position.set(0.5,0.6,1.2);
}
let drag=null;
const tmpQ=new THREE.Quaternion(), tmpV=new THREE.Vector3();
/* Altitude, not distance, is what the controls should scale with: at street level
   one pixel of drag must sweep a few metres, not a few kilometres. */
let camAlt=2.2, camAltTarget=2.2;
const ALT_MIN=0.012, ALT_MAX=6.0;
const spin={axis:new THREE.Vector3(0,1,0), vel:0};

function dragScale(){
  // world height visible at the surface, per screen pixel → radians of arc per pixel
  const visible = 2*(camDist-1)*Math.tan(camera.fov*Math.PI/360);
  return Math.max(2.0e-5, Math.min(0.004, visible/innerHeight * 1.05));
}
canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch') return;             // touch handled by touch* listeners below
  // With the options window up, a press on the globe just closes it (#24): a left-click
  // outside picks nothing, a right-click only closes — neither issues an order.
  if(optMenuOpen){ if(e.button===2) e.preventDefault(); closeOptMenu(); return; }
  // RMB with a controllable actor selected (squad / org / led-org character) is a game
  // control, not a camera drag: start the hold-to-open timer and DON'T set `drag`, so the
  // globe never rotates under it. (#24 squad → #52 every controllable actor)
  if(e.button===2 && selectedControllable()){
    e.preventDefault();
    rmb={sx:e.clientX, sy:e.clientY, x:e.clientX, y:e.clientY, moved:0,
         shift:e.shiftKey, target:nearest(e.clientX,e.clientY), opened:false, timer:null};
    rmb.timer=setTimeout(openOptMenu, HOLD_RMB_MS);
    spin.vel=0;
    try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
    return;
  }
  if(e.button===1) e.preventDefault();            // middle: suppress autoscroll (a drag rotates the globe / Alt-drag tilts; a stationary press pins on release)
  drag={x:e.clientX, y:e.clientY, moved:0, button:e.button};
  spin.vel=0;
  canvas.setPointerCapture(e.pointerId);
});
addEventListener('pointermove',e=>{
  if(e.pointerType==='touch') return;             // touch handled by touch* listeners below
  if(rmb){                                        // RMB order gesture in progress (#24)
    rmb.moved+=Math.abs(e.clientX-rmb.x)+Math.abs(e.clientY-rmb.y);
    rmb.x=e.clientX; rmb.y=e.clientY;
    // moving before the menu opens means it's a drag, not a hold — cancel the timer so
    // the gesture stays a plain MOVE (to wherever it's released).
    if(rmb.moved>6 && !rmb.opened && rmb.timer){ clearTimeout(rmb.timer); rmb.timer=null; }
    return;
  }
  if(!drag){ hoverAt(e.clientX,e.clientY); return; }
  const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
  drag.x=e.clientX; drag.y=e.clientY;
  drag.moved+=Math.abs(dx)+Math.abs(dy);
  if(drag.button===2) return;                     // right-drag without a squad selected no longer
                                                  // rotates the globe (that was a temporary
                                                  // fallback) — the right button is squad orders (#24)
  if(drag.button===1 && e.altKey && camAlt<=TILT_ALT_MAX){   // Alt + MIDDLE = TILT (#28), close-up only
    // vertical drag → pitch, horizontal drag → yaw (orbit). Drag up tilts toward the horizon
    // (0° … ~70°, clamped short of it); yaw stays inverted, so drag right orbits the other way.
    camPitch=Math.max(0, Math.min(PITCH_MAX, camPitch - dy*TILT_PITCH_PER_PX));
    camYaw  -= dx*TILT_YAW_PER_PX;
    if(camYaw>Math.PI) camYaw-=2*Math.PI; else if(camYaw<-Math.PI) camYaw+=2*Math.PI;
    spin.vel=0; flyQ=null;
    return;
  }
  // LEFT-drag, or a plain (no-Alt / zoomed-out) MIDDLE-drag → rotate the trackball globe.
  // A stationary middle press stays under the moved<6 threshold → still pins on release.
  const len=Math.hypot(dx,dy);
  if(len<0.01) return;
  const k=dragScale();
  // trackball axis in the camera's SCREEN frame — dy about camera-right, dx about camera-up
  // (both horizontal thanks to the yaw-locked up), NOT fixed world XY, so the drag stays
  // aligned with the cursor even when the view is tilted (camPitch/camYaw ≠ 0).
  const _cp=Math.cos(camPitch), _sy=Math.sin(camYaw), _cy=Math.cos(camYaw);
  tmpV.set(dy*_cy*_cp - dx*_sy, dy*_sy*_cp + dx*_cy, 0).normalize();
  const ang=len*k;
  tmpQ.setFromAxisAngle(tmpV, ang);
  root.quaternion.premultiply(tmpQ).normalize();
  spin.axis.copy(tmpV); spin.vel = ang*0.55;      // carry a little momentum
  flyQ=null;
});
addEventListener('pointerup',e=>{
  if(e.pointerType==='touch') return;             // touch handled by touch* listeners below
  if(rmb){                                        // resolve the RMB order gesture (#24)
    if(rmb.timer){ clearTimeout(rmb.timer); rmb.timer=null; }
    const sq=selectedPlayerSquad();
    if(rmb.opened){
      // menu already open: with quick-cast ON, releasing over an enabled row applies it;
      // otherwise the release does nothing and the menu waits for a left-click.
      if(quickCastOrders){
        const el=document.elementFromPoint(e.clientX,e.clientY);
        const row=el&&el.closest? el.closest('#optMenu .omRow') : null;
        if(row && !row.classList.contains('disabled')){ runOpt(row.dataset.optkey); closeOptMenu(); }
      }
    } else if(sq){
      // released before the hold threshold → a plain MOVE, or QUEUE when Shift was held.
      const t=nearest(e.clientX,e.clientY);
      const dir=t? t.dir : screenToDir(e.clientX,e.clientY);
      if(dir){ if(rmb.shift) queueMove(sq,dir,pickLabel(t)); else issueMove(sq,dir,pickLabel(t)); }
    }
    try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
    rmb=null;
    return;
  }
  if(drag && drag.moved<6){
    if(drag.button===1){                          // middle-click on an entity → pin its tooltip (desktop)
      const p=nearest(e.clientX,e.clientY);
      if(p) showPin(tipHTML(p), e.clientX, e.clientY);
    } else { spin.vel=0; pickAt(e.clientX,e.clientY); }   // left-click → select (unchanged)
  }
  drag=null;
});
addEventListener('pointercancel',e=>{                // don't leave a half-finished RMB gesture (#24)
  if(rmb){ if(rmb.timer) clearTimeout(rmb.timer); rmb=null; }
});
/* zoom is geometric in altitude, so the last metre takes as many notches as the first
   thousand — and it eases in instead of snapping */
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const step = e.ctrlKey? 0.06 : 0.14;            // ctrl+wheel = fine zoom
  const f = e.deltaY>0 ? (1+step) : 1/(1+step);
  camAltTarget = Math.max(ALT_MIN, Math.min(ALT_MAX, camAltTarget*f));
},{passive:false});

/* the right button is a game control (squad RMB, #24), so keep the browser's
   native context menu from intercepting it over the canvas */
canvas.addEventListener('contextmenu',e=>e.preventDefault());

/* =====================================================================
   MANUAL SQUAD CONTROL — RMB orders + hold→options window (#24)
   Source of truth: DESIGN.md → "Squad context menu and order options" and
   "Context-sensitive option menu — one mechanism for every controllable actor".

     • plain RMB              → MOVE to the point or object under the cursor
     • Shift+RMB              → QUEUE (append to the squad's order queue)
     • hold RMB (~280ms)      → OPTIONS window on the target
                                 left-click picks · right-click / outside closes
                                 a quick RMB released before the threshold stays MOVE
     • quick-cast toggle      → release exactly over an option applies it (default off)

   The options window is deliberately generic: its rows are a pure function of
   (selected actor, target under cursor), gated by centrally-defined enable
   logic. Only the SQUAD actor is wired today; org/character actors slot into the
   same widget later at the EXTENSION POINT in optionsFor().
   ===================================================================== */
// Hold-to-open threshold for the RMB options window. DESIGN says ~250–300ms; the
// touch long-press (LONG_PRESS_MS = 500, for tooltip-pin / squad re-auto) is a
// deliberately slower, separate gesture and is left untouched.
const HOLD_RMB_MS = 280;
let rmb=null;                     // active right-button gesture, or null
let optMenuOpen=false;            // is the options window showing?
let quickCastOrders=false;        // "quick-cast" toggle (default off)
let curOpts=[];                   // options currently rendered (for click/quick-cast dispatch)
const optMenuEl=document.getElementById('optMenu');

// The selected actor is a controllable SQUAD only if it's YOUR OWN squad.
function selectedPlayerSquad(){
  const s=S.selection;
  if(!s || s.type!=='squad') return null;
  const sq=sqd(s.id); if(!sq) return null;
  const o=org(sq.orgId);
  return (o && isPlayerOrg(o)) ? sq : null;
}
// Is the current selection a controllable actor that CAN own an options window? — a
// player squad, a player-controlled org, or (Player Mode) a character leading such an
// org. Mirrors optionsFor's branching; the RMB gesture only arms for these. (#52)
function selectedControllable(){
  const s=S.selection; if(!s) return false;
  if(s.type==='squad') return !!selectedPlayerSquad();
  if(s.type==='org'){ const o=org(s.id); return !!(o && isPlayerOrg(o)); }
  if(s.type==='char'){ const c=chr(s.id); const led=c&&c.alive?org(c.ledOrgId):null; return !!(led && isPlayerOrg(led)); }
  return false;
}

// Screen pixel → a direction on the planet's surface (unit sphere), in the planet's
// own frame — the inverse of screenPos(). Used to MOVE to empty ground. null off-limb.
const _rc=new THREE.Raycaster();
const _sph=new THREE.Sphere(new THREE.Vector3(0,0,0),1);
const _hitV=new THREE.Vector3();
const _invQ=new THREE.Quaternion();
function screenToDir(cx,cy){
  _rc.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -((cy/innerHeight)*2-1)), camera);
  const hit=_rc.ray.intersectSphere(_sph, _hitV);
  if(!hit) return null;
  _invQ.copy(root.quaternion).invert();
  return hit.clone().applyQuaternion(_invQ).normalize();
}

// --- target introspection (a "pick" from nearest(), or null for open ground) ---
function pickLabel(t){
  if(!t) return null;
  if(t.type==='settlement') return stl(t.id)?.name || null;
  if(t.type==='squad')      return 'загін #'+t.id;
  if(t.type==='caravan')    return 'караван #'+t.id;
  if(t.type==='enterprise'){ const e=ent(t.id); return e? ENT[e.kind].label : null; }
  if(t.type==='char')       return chr(t.id)?.name || null;
  if(t.type==='resident')   return 'мешканець';   // #50: an unidentified head
  return null;
}
function targetFaction(t){
  if(!t) return null;
  if(t.type==='squad')      return sqd(t.id)?.factionId ?? null;
  if(t.type==='settlement'){ const o=org(stl(t.id)?.ownerOrgId); return o? o.factionId : null; }
  if(t.type==='caravan'){    const o=org(byId(S.caravans,t.id)?.orgId); return o? o.factionId : null; }
  if(t.type==='enterprise'){ const o=org(ent(t.id)?.ownerOrgId); return o? o.factionId : null; }
  if(t.type==='char'){       const c=chr(t.id); const o=org(c?.ledOrgId||c?.orgId); return o? o.factionId : null; }
  return null;
}

// --- order execution (a single "go to a point" engine underlies move / attack /
//     garrison — DESIGN: "Move and Attack are the model dual-mode abilities") ---
function applyOrder(sq, ord){
  sq.mode='manual';
  sq.target = ord.target ? ord.target.clone() : null;
  sq.order  = ord.order;
  sq.targetName = ord.targetName || null;
  sq.garrisonId = ord.order==='garrison' ? ord.garrisonId : null;
}
function issueMove(sq, dir, name){
  if(!dir) return;
  sq.mode='manual'; sq.queue=[]; sq.target=dir.clone(); sq.order='move';
  sq.targetName=name||null; sq.garrisonId=null;
  logEvent('Наказ: загін #'+sq.id+' → рух'+(name?' до <b>'+name+'</b>':' до точки')+'.');
  renderInspector();
}
function queueMove(sq, dir, name){
  if(!dir) return;
  if(!sq.queue) sq.queue=[];
  const ord={order:'move', target:dir.clone(), targetName:name||null};
  // Nothing active → the appended order just becomes the current one. Otherwise it
  // waits behind the active order and runs when that one completes (moveToward).
  if(!sq.target && (sq.order==='idle'||sq.order==='hold')){
    applyOrder(sq, ord);
    logEvent('Наказ: загін #'+sq.id+' → рух'+(name?' до <b>'+name+'</b>':' до точки')+'.');
  } else {
    sq.queue.push(ord);
    logEvent('Черга: загін #'+sq.id+' +рух'+(name?' до <b>'+name+'</b>':'')+' ('+sq.queue.length+' у черзі).');
  }
  renderInspector();
}
function issueAttack(sq, target){
  if(!target || !target.dir) return;
  sq.mode='manual'; sq.queue=[]; sq.target=target.dir.clone(); sq.order='attack';
  sq.targetName=pickLabel(target); sq.garrisonId=null;
  logEvent('Наказ: загін #'+sq.id+' → <b>атака</b> '+pickLabel(target)+'.');
  renderInspector();
}
function issueGarrison(sq, st){
  if(!st) return;
  sq.mode='manual'; sq.queue=[]; sq.target=st.dir.clone(); sq.order='garrison';
  sq.garrisonId=st.id; sq.targetName=st.name;
  logEvent('Наказ: загін #'+sq.id+' → <b>гарнізон</b> '+st.name+'.');
  renderInspector();
}
function standDown(sq){
  sq.garrisonId=null; sq.order='idle'; sq.target=null; sq.queue=[];
  logEvent('Загін #'+sq.id+' знято з гарнізону.');
  renderInspector();
}

// --- the option list: a pure function of (selected actor, target) ---
// Each row is {key,label,enabled,why,run}; the widget just renders whatever this
// returns. Enable/disable lives here, centrally — not in the widget.
function squadOptions(sq, target, pointDir){
  const tn=pickLabel(target);
  const tDir = target ? target.dir : pointDir;
  const opts=[];
  // MOVE — to the object or the open point under the cursor. Always available.
  opts.push({key:'move', label:'Рух'+(tn?' → '+tn:''), enabled:!!tDir,
    run:()=>issueMove(sq, tDir, tn)});
  // ATTACK — needs a hostile-faction target.
  const tf = target ? targetFaction(target) : null;
  const canAttack = tf!=null && hostile(sq.factionId, tf);
  opts.push({key:'attack', label:'Атака'+(tn?' → '+tn:''), enabled:!!canAttack,
    why:'потрібна ворожа ціль', run:()=>issueAttack(sq, target)});
  // GARRISON — needs one of YOUR OWN settlements; toggles to stand-down if already
  // garrisoning that very settlement.
  const st  = target && target.type==='settlement' ? stl(target.id) : null;
  const own = st && org(st.ownerOrgId) && isPlayerOrg(org(st.ownerOrgId));
  const here= st && sq.garrisonId===st.id;
  opts.push({key:'garrison',
    label: here ? 'Зняти гарнізон' : ('Гарнізон'+(st?' → '+st.name:'')),
    enabled: !!own, why:'потрібне твоє поселення',
    run: ()=> here ? standDown(sq) : issueGarrison(sq, st)});
  return opts;
}
/* --- ORGANIZATION actor: target-driven actions (DESIGN: "Context-sensitive option
   menu — one mechanism for every controllable actor" → the Organization bullet). These
   introduce NO new actions — each is a second path to something the org already does
   (slots/alliances/agent edges from the graph model, posts, the reassignment right).
   Self-directed decisions (BecomePolitical / ChangeLeadershipType / Expand / TakePerk /
   founding a subordinate) have no cursor target and deliberately stay OUT of this menu —
   they remain in the inspector's Decisions/Perks tabs. --- */

// The organization associated with whatever is under the cursor — a settlement's owner,
// a squad/enterprise/caravan's org, a character's led-or-member org — or null on open ground.
function targetOrg(t){
  if(!t) return null;
  if(t.type==='settlement') return org(stl(t.id)?.ownerOrgId) || null;
  if(t.type==='squad')      return org(sqd(t.id)?.orgId) || null;
  if(t.type==='caravan')    return org(byId(S.caravans,t.id)?.orgId) || null;
  if(t.type==='enterprise') return org(ent(t.id)?.ownerOrgId) || null;
  if(t.type==='char'){ const c=chr(t.id); return c? (org(c.ledOrgId)||org(c.orgId)||null) : null; }
  return null;
}
// first slot-relationship edge from a→b of one of the given kinds (or null)
function slotEdge(fromId, toId, kinds){
  return S.edges.find(e=>e.from===fromId && e.to===toId && kinds.includes(e.kind)) || null;
}
function allianceEdge(aId, bId){
  return S.edges.find(e=>e.kind==='alliance' &&
    ((e.from===aId&&e.to===bId)||(e.from===bId&&e.to===aId))) || null;
}
// Capacity gates. The prototype stores no capacity fields (DESIGN's capacity table isn't
// implemented here), so these are computed from what it DOES have — kind + derived
// management — keeping the gate central and honest, if coarse.
function controlSlotCap(o){ return 2 + Math.floor(orgManagement(o)/5) + (o.kind==='squad'?2:0); }
function allianceCap(o){ return 3; }
function heldSlots(o, kind){ return S.edges.filter(e=>e.from===o.id && e.kind===kind).length; }
function heldAlliances(o){ return S.edges.filter(e=>e.kind==='alliance' && (e.from===o.id||e.to===o.id)).length; }
// A controlled org's leader/posts can be reassigned only for these kinds (never network /
// secret_police) — DESIGN: "Who can reassign a controlled org's leader or posts."
const REASSIGNABLE_KINDS = ['squad','business','political','military','intelligence'];

// --- executors: mutate state exactly like decide()'s slot/alliance paths + the inspector ---
function makeSlot(o, t, kind, salary, covert){
  o.treasury -= (kind==='control'?180:120);
  makeEdge(kind, o.id, t.id, {salary, visibility: covert?'covert':'public'});
  logEvent('<span class="link" data-sel="org:'+o.id+'">'+o.name+'</span> відкрив '+
    (kind==='control'?'слот контролю':'слот впливу')+(covert?' (covert)':'')+
    ' над <span class="link" data-sel="org:'+t.id+'">'+t.name+'</span>.');
  renderInspector();
}
function breakSlot(o, e){
  S.edges=S.edges.filter(x=>x.id!==e.id);
  teleEvent('SlotBroken',{edgeId:e.id, kind:e.kind, from:e.from, to:e.to, cause:'player'});
  logEvent('<b>'+o.name+'</b> розірвав слот <b>'+e.kind+'</b>.'); renderInspector();
}
function proposeAlliance(o, t){
  makeEdge('alliance', o.id, t.id);
  logEvent('⚑ <span class="link" data-sel="org:'+o.id+'">'+o.name+'</span> уклав союз з <span class="link" data-sel="org:'+t.id+'">'+t.name+'</span>.');
  renderInspector();
}
function breakAlliance(o, e){
  S.edges=S.edges.filter(x=>x.id!==e.id);
  logEvent('<b>'+o.name+'</b> розірвав союз.'); renderInspector();
}
function intelReport(o, t){
  const links=S.edges.filter(x=>x.from===t.id||x.to===t.id).length;
  logEvent('🔍 Розвідка про <b>'+t.name+'</b>: скарбниця ~'+num(t.treasury)+'💰, зв\'язків '+links+
    ', лідер '+(chr(t.leaderId)?chr(t.leaderId).name:'—')+'.');
}
function sabotage(o, t){
  o.treasury-=150;
  const hit=Math.min(t.treasury, Math.round(40+rnd()*80));
  t.treasury-=hit; t.loyalty=Math.max(0,t.loyalty-6);
  teleEvent('Sabotage',{fromOrgId:o.id, toOrgId:t.id, damage:hit});
  logEvent('💥 <b>'+o.name+'</b> оплатив саботаж проти <b>'+t.name+'</b> (−'+hit+'💰).');
  renderInspector();
}
function reassignLeader(o, t){
  // promote t's heir or next living member — a leader change with the usual consequences
  const cand = (chr(t.heirId)&&chr(t.heirId).alive? chr(t.heirId) : null) ||
    t.members.map(chr).find(c=>c&&c.alive&&c.id!==t.leaderId);
  if(!cand){ logEvent('Немає кандидата на лідера у <b>'+t.name+'</b>.'); return; }
  const old=chr(t.leaderId); if(old && old.ledOrgId===t.id) old.ledOrgId=null;
  setLeader(t, cand);
  t.loyalty=Math.max(0, t.loyalty-8);                 // loyalty shock, per succession consequences
  teleEvent('LeaderReassigned',{orgId:t.id, byOrgId:o.id, charId:cand.id});
  logEvent('<b>'+o.name+'</b> перепризначив лідера <b>'+t.name+'</b> → <span class="link" data-sel="char:'+cand.id+'">'+cand.name+'</span>.');
  renderInspector();
}
function assignPost(o, c){
  const empty=['Advisor','Negotiator','Bodyguard'].find(p=>!o.posts[p]);
  if(!empty) return;
  o.posts[empty]=c.id; c.post=empty;
  logEvent('<b>'+c.name+'</b> призначений на посаду '+empty+' у <b>'+o.name+'</b>.'); renderInspector();
}
function removePost(o, c){
  for(const p in o.posts) if(o.posts[p]===c.id && p!=='Leader') o.posts[p]=null;
  if(c.post && c.post!=='Leader') c.post=null;
  logEvent('<b>'+c.name+'</b> знятий з посади у <b>'+o.name+'</b>.'); renderInspector();
}

// The org's applicable target-driven actions — a pure function of (o, target). Enable/
// disable lives here, centrally; the widget just renders the list.
function orgOptions(o, target){
  const opts=[];
  const t=targetOrg(target);                          // the OTHER org under the cursor (may be self / null)
  const tChar = target && target.type==='char' ? chr(target.id) : null;
  const other = t && t.id!==o.id ? t : null;          // a genuinely different org

  // --- POST — natural target: a character; enabled only for o's OWN member ---
  if(tChar){
    const own = o.members.includes(tChar.id) || tChar.orgId===o.id;
    const heldPost = own ? Object.keys(o.posts).find(p=>o.posts[p]===tChar.id && p!=='Leader') : null;
    if(heldPost){
      opts.push({key:'post', label:'Зняти з посади ('+heldPost+')', enabled:true,
        run:()=>removePost(o, tChar)});
    } else {
      const emptyPost=['Advisor','Negotiator','Bodyguard'].find(p=>!o.posts[p]);
      opts.push({key:'post', label:'Призначити на посаду', enabled: !!(own && emptyPost),
        why: own? 'немає вільної посади' : 'потрібен свій учасник', run:()=>assignPost(o, tChar)});
    }
  }

  // --- everything else has an ORGANIZATION as its natural target ---
  if(other){
    const tn=other.name;
    // SLOT — create/break a control or influence slot (target: another org)
    const slot = slotEdge(o.id, other.id, ['control','influence','investment']);
    if(slot){
      opts.push({key:'breakslot', label:'Розірвати слот → '+tn, enabled:true, run:()=>breakSlot(o, slot)});
    } else {
      opts.push({key:'control', label:'Слот контролю → '+tn,
        enabled: o.treasury>=180 && heldSlots(o,'control')<controlSlotCap(o),
        why:'потрібні кошти / ємність', run:()=>makeSlot(o, other, 'control', rint(4,10), false)});
      opts.push({key:'influence', label:'Слот впливу → '+tn,
        enabled: o.treasury>=120 && heldSlots(o,'influence')<controlSlotCap(o)+2,
        why:'потрібні кошти', run:()=>makeSlot(o, other, 'influence', rint(3,9), true)});
    }
    // ALLIANCE — propose/break, only between INDEPENDENT orgs (target: another independent org)
    const ally = allianceEdge(o.id, other.id);
    if(ally){
      opts.push({key:'breakally', label:'Розірвати союз → '+tn, enabled:true, run:()=>breakAlliance(o, ally)});
    } else {
      const canAlly = o.parentId==null && other.parentId==null && heldAlliances(o)<allianceCap(o);
      opts.push({key:'ally', label:'Запропонувати союз → '+tn, enabled:canAlly,
        why: (o.parentId!=null||other.parentId!=null)?'лише між незалежними':'межа союзів',
        run:()=>proposeAlliance(o, other)});
    }
    // INTEL / SABOTAGE — only THROUGH an existing covert agent edge o→other
    const agent = S.edges.find(e=>e.from===o.id && e.to===other.id && e.visibility==='covert'
      && ['control','influence'].includes(e.kind));
    if(agent){
      opts.push({key:'intel', label:'Розвідка → '+tn, enabled:true, run:()=>intelReport(o, other)});
      opts.push({key:'sabotage', label:'Саботаж → '+tn, enabled:o.treasury>=150,
        why:'потрібні кошти', run:()=>sabotage(o, other)});
    }
    // REASSIGN — a controlled org's leader/posts: via a control slot OR direct parenthood,
    // and only for reassignable kinds (DESIGN: never a network / secret_police target).
    const controls = other.parentId===o.id || !!slotEdge(o.id, other.id, ['control']);
    if(controls){
      opts.push({key:'reassign', label:'Перепризначити лідера → '+tn,
        enabled: REASSIGNABLE_KINDS.includes(other.kind),
        why:'вид організації не дозволяє', run:()=>reassignLeader(o, other)});
    }
  }
  return opts;
}
// Shared spec builder so a played character reaches its led org's menu transitively.
function orgSpec(o, target){
  const t=targetOrg(target);
  return { title:'Організація · '+o.name, targetLabel: pickLabel(target) || (t? t.name : 'ціль'),
           opts: orgOptions(o, target) };
}

// CENTRAL RESOLVER — (selected actor, target under cursor) → applicable actions. Branches
// by S.selection.type; every branch reuses the SAME widget + enable/disable discipline.
function optionsFor(sel, target, pointDir){
  if(!sel) return null;
  if(sel.type==='squad'){
    const sq=sqd(sel.id);
    if(!sq || !(org(sq.orgId) && isPlayerOrg(org(sq.orgId)))) return null;
    return { title:'Загін #'+sq.id, targetLabel: pickLabel(target)||'точка',
             opts: squadOptions(sq, target, pointDir) };
  }
  if(sel.type==='org'){
    const o=org(sel.id);
    if(!o || !isPlayerOrg(o)) return null;             // only an org YOU control
    return orgSpec(o, target);
  }
  if(sel.type==='char'){
    // Player Mode: a character has no own target-driven action — the menu is the menu of
    // the org it LEADS, reached transitively (DESIGN: "an org is reached transitively
    // through the character's leadership"). Self-directed char/org decisions stay off it.
    const c=chr(sel.id);
    const led = c && c.alive ? org(c.ledOrgId) : null;
    if(!led || !isPlayerOrg(led)) return null;
    return orgSpec(led, target);
  }
  return null;
}

// --- the widget ---
function runOpt(key){
  const o=curOpts.find(x=>x.key===key);
  if(o && o.enabled) o.run();
}
function renderOptMenu(spec, cx, cy){
  curOpts=spec.opts;
  const rows=spec.opts.map(o=>
    '<div class="omRow'+(o.enabled?'':' disabled')+'" data-optkey="'+o.key+'">'+
      '<span>'+o.label+'</span>'+
      (o.enabled? '' : '<span class="omWhy">'+(o.why||'')+'</span>')+
    '</div>').join('');
  optMenuEl.innerHTML=
    '<div class="omHead">'+spec.title+
      (spec.targetLabel? '<span class="omTarget"> · '+spec.targetLabel+'</span>' : '')+'</div>'+
    rows+
    '<div class="omFoot'+(quickCastOrders?' on':'')+'" data-qc="1" title="Застосувати дію відпусканням ПКМ над нею">'+
      '<span class="omQC"></span>Швидкий каст</div>';
  optMenuEl.style.display='block';
  const w=optMenuEl.offsetWidth, h=optMenuEl.offsetHeight;   // clamp inside the viewport
  let x=cx+2, y=cy+2;
  if(x+w>innerWidth-6)  x=Math.max(6, cx-w-2);
  if(y+h>innerHeight-6) y=Math.max(6, innerHeight-h-6);
  optMenuEl.style.left=x+'px'; optMenuEl.style.top=y+'px';
}
function openOptMenu(){
  if(!rmb) return;
  rmb.timer=null;
  const spec=optionsFor(S.selection, rmb.target, rmb.target? null : screenToDir(rmb.x, rmb.y));
  if(!spec || !spec.opts.length) return;   // no applicable action (e.g. an org actor over open ground)
  renderOptMenu(spec, rmb.x, rmb.y);
  rmb.opened=true; optMenuOpen=true;
  if(navigator.vibrate) navigator.vibrate(10);
}
function closeOptMenu(){ optMenuEl.style.display='none'; optMenuOpen=false; }

// Left-click a row → pick it (and close). The quick-cast footer toggles in place.
optMenuEl.addEventListener('click', e=>{
  const qc=e.target.closest('[data-qc]');
  if(qc){ quickCastOrders=!quickCastOrders; qc.classList.toggle('on', quickCastOrders); return; }
  const row=e.target.closest('[data-optkey]');
  if(!row || row.classList.contains('disabled')) return;
  runOpt(row.dataset.optkey);
  closeOptMenu();
});
// A right-click on the menu itself only closes it — no order, no browser menu.
optMenuEl.addEventListener('contextmenu', e=>{ e.preventDefault(); closeOptMenu(); });

/* =====================================================================
   TOUCH — one finger rotates/pans the globe; a second finger switches into
   pinch-zoom-and-pan around the midpoint; a ~500ms long-press with a squad
   selected re-autos it (the touch equivalent of the otherwise mouse-only
   re-auto action). All native scroll/zoom is preventDefault'd so gestures
   drive the game view directly. Runs alongside the mouse/wheel handlers
   above, which ignore pointerType 'touch' — so desktop is unaffected.
   ===================================================================== */
const LONG_PRESS_MS = 500;                          // mirrors the hold-to-act timing
let touchG=null;                                    // active gesture state
let lpTimer=null, lpFired=false;                    // long-press timer + fired flag
const clearLP=()=>{ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } };
const tDist=(a,b)=>Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
const tMidX=(a,b)=>(a.clientX+b.clientX)/2;
const tMidY=(a,b)=>(a.clientY+b.clientY)/2;

/* rotate the globe by a screen-space drag delta — the same trackball math the
   mouse drag uses, so touch and mouse feel identical */
function touchRotate(dx,dy){
  const len=Math.hypot(dx,dy);
  if(len<0.01) return;
  const k=dragScale();
  // trackball axis in the camera's SCREEN frame — dy about camera-right, dx about camera-up
  // (both horizontal thanks to the yaw-locked up), NOT fixed world XY, so the drag stays
  // aligned with the cursor even when the view is tilted (camPitch/camYaw ≠ 0).
  const _cp=Math.cos(camPitch), _sy=Math.sin(camYaw), _cy=Math.cos(camYaw);
  tmpV.set(dy*_cy*_cp - dx*_sy, dy*_sy*_cp + dx*_cy, 0).normalize();
  const ang=len*k;
  tmpQ.setFromAxisAngle(tmpV, ang);
  root.quaternion.premultiply(tmpQ).normalize();
  spin.axis.copy(tmpV); spin.vel=ang*0.55;          // carry momentum, like the mouse
  flyQ=null;
}

canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  spin.vel=0;
  const ts=e.touches;
  if(ts.length===1){
    const t=ts[0];
    touchG={mode:'rotate', x:t.clientX, y:t.clientY, sx:t.clientX, sy:t.clientY, moved:0, t0:performance.now()};
    lpFired=false; clearLP();
    // Two long-press meanings on the game view, disambiguated BY TARGET (not timing),
    // exactly as DESIGN.md → "Touch equivalent for hover-triggered tooltips" prescribes:
    const hit = nearest(t.clientX, t.clientY);       // is an entity under the finger?
    if(hit){
      // (a) long-press on an entity → pin its tooltip (touch equivalent of hover+middle-click)
      lpTimer=setTimeout(()=>{
        lpFired=true; lpTimer=null;
        showPin(tipHTML(hit), t.clientX, t.clientY);
        if(navigator.vibrate) navigator.vibrate(18);
      }, LONG_PRESS_MS);
    } else if(S.selection && S.selection.type==='squad'){
      // (b) long-press on the empty view with a squad selected → re-auto it (from #10)
      const sel=sqd(S.selection.id);
      if(sel && sel.mode!=='auto'){
        lpTimer=setTimeout(()=>{
          lpFired=true; lpTimer=null;
          const sq=S.selection && S.selection.type==='squad' ? sqd(S.selection.id) : null;
          if(sq){ sq.mode='auto'; sq.target=null; sq.order='idle'; renderInspector(); }
          if(navigator.vibrate) navigator.vibrate(18);
        }, LONG_PRESS_MS);
      }
    }
  } else if(ts.length>=2){
    clearLP();                                       // second finger cancels a pending long-press
    const a=ts[0], b=ts[1];
    touchG={mode:'pinch', dist:tDist(a,b), mx:tMidX(a,b), my:tMidY(a,b)};
  }
},{passive:false});

canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(!touchG) return;
  const ts=e.touches;
  if(touchG.mode==='rotate' && ts.length===1){
    const t=ts[0];
    const dx=t.clientX-touchG.x, dy=t.clientY-touchG.y;
    touchG.x=t.clientX; touchG.y=t.clientY;
    touchG.moved+=Math.abs(dx)+Math.abs(dy);
    if(touchG.moved>10) clearLP();                   // a real drag isn't a long-press
    touchRotate(dx,dy);
  } else if(touchG.mode==='pinch' && ts.length>=2){
    const a=ts[0], b=ts[1];
    const dist=tDist(a,b), mx=tMidX(a,b), my=tMidY(a,b);
    if(touchG.dist>0){                               // spread → zoom in, pinch → zoom out
      camAltTarget=Math.max(ALT_MIN, Math.min(ALT_MAX, camAltTarget*(touchG.dist/dist)));
    }
    touchRotate(mx-touchG.mx, my-touchG.my);         // pan around the moving midpoint
    touchG.dist=dist; touchG.mx=mx; touchG.my=my;
  }
},{passive:false});

canvas.addEventListener('touchend',e=>{
  e.preventDefault();
  // a short, still, single-finger touch that didn't long-press is a tap → select
  if(touchG && touchG.mode==='rotate' && touchG.moved<10 && !lpFired
     && performance.now()-touchG.t0 < LONG_PRESS_MS){
    spin.vel=0; pickAt(touchG.sx, touchG.sy);
  }
  clearLP();
  if(e.touches.length===1){                          // lifted one of two → resume single-finger rotate
    const t=e.touches[0];
    touchG={mode:'rotate', x:t.clientX, y:t.clientY, sx:t.clientX, sy:t.clientY, moved:999, t0:performance.now()};
  } else if(e.touches.length===0){
    touchG=null; lpFired=false;
  }
},{passive:false});

canvas.addEventListener('touchcancel',()=>{ clearLP(); touchG=null; lpFired=false; },{passive:false});

function stepCamera(){
  camAlt += (camAltTarget-camAlt)*0.16;
  setCamDist(1 + camAlt);
  // Auto-flatten (#28): tilt is a close-up-only affordance. The moment the camera climbs
  // past TILT_ALT_MAX, snap firmly back toward a strict top-down — an oblique angle reads
  // poorly against the globe's curvature, and tilt is only offered near the ground.
  if(camAlt>TILT_ALT_MAX && (camPitch!==0 || camYaw!==0)){
    const e=0.5;                                  // firm, decisive levelling — settles in a few frames
    camPitch+=(0-camPitch)*e; camYaw+=(0-camYaw)*e;
    if(Math.abs(camPitch)<1e-3) camPitch=0;
    if(Math.abs(camYaw)<1e-3) camYaw=0;
  }
  if(!drag && spin.vel>1e-6){                     // inertia, damped
    tmpQ.setFromAxisAngle(spin.axis, spin.vel);
    root.quaternion.premultiply(tmpQ).normalize();
    spin.vel *= 0.90;
    if(spin.vel<2e-6) spin.vel=0;
  }
}
/* keyboard: fine control where the mouse is too coarse */
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
  const k=dragScale()*22;
  const nudge=(ax,ay,a)=>{ tmpV.set(ax,ay,0).normalize(); tmpQ.setFromAxisAngle(tmpV,a);
    root.quaternion.premultiply(tmpQ).normalize(); flyQ=null; };
  if(e.key==='ArrowLeft')  nudge(0,-1,k);
  if(e.key==='ArrowRight') nudge(0, 1,k);
  if(e.key==='ArrowUp')    nudge(-1,0,k);
  if(e.key==='ArrowDown')  nudge( 1,0,k);
  if(e.key==='+'||e.key==='=') camAltTarget=Math.max(ALT_MIN,camAltTarget/1.18);
  if(e.key==='-'||e.key==='_') camAltTarget=Math.min(ALT_MAX,camAltTarget*1.18);
  if(e.key===' '){ e.preventDefault(); document.getElementById('btnPause').click(); }
});

/* ---- screen-space picking & hover ---- */
const projV=new THREE.Vector3();
function screenPos(dir, r){
  // r = the shell radius to project at. Icon markers are drawn on the MARK_R shell (the
  // default), so their pick sits exactly under the drawn icon. #50: cat heads are drawn on
  // the city surface, NOT the icon shell — so a walker pick must project at the
  // head's OWN radius (p.r), or an off-centre head shows a growing pick↔head parallax gap
  // (two points on one ray at different radii project apart under perspective). p.dir stays
  // the unit head direction (moveToward reuses it as a squad target), only the radius varies.
  projV.copy(dir).multiplyScalar(r||MARK_R).applyQuaternion(root.quaternion);
  // limb test against the actual camera axis (not just +z) so it stays correct when tilted
  const behind = projV.dot(_camNrm) < 1/camDist - 0.02;
  projV.project(camera);
  return {x:(projV.x*0.5+0.5)*innerWidth, y:(-projV.y*0.5+0.5)*innerHeight, behind};
}
/* point-in-polygon against a footprint ring projected to the screen: the whole
   territory is the settlement's hit target, not just the tiny icon disk. Bail to
   the icon radius if any vertex crosses the limb (polygon can't be trusted then). */
function pointInRing(cx,cy,ring){
  const pts=[];
  for(const d of ring){ const s=screenPos(d); if(s.behind) return false; pts.push(s); }
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=pts[i].x, yi=pts[i].y, xj=pts[j].x, yj=pts[j].y;
    if(((yi>cy)!==(yj>cy)) && (cx < (xj-xi)*(cy-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function nearest(cx,cy){
  let best=null,bd=1e9;
  const order={char:0, resident:0, caravan:1, squad:2, enterprise:3, settlement:4};   // #50: an anonymous head ranks with an identified one
  for(const p of picks){
    const s=screenPos(p.dir, p.r);   // #50: walker picks carry the head's own shell radius (p.r); others default to MARK_R
    if(s.behind) continue;
    const rpx=p.px*innerHeight*0.62;
    const d=Math.hypot(s.x-cx, s.y-cy);
    let inside = d<=rpx;
    if(!inside && p.ring) inside = pointInRing(cx,cy,p.ring);   // enlarged: full footprint
    if(!inside) continue;
    const score=d - (4-(order[p.type]||0))*2;
    if(score<bd){bd=score;best=p;}
  }
  return best;
}
function pickAt(cx,cy){
  const p=nearest(cx,cy);
  if(p && p.type==='resident'){ materializeResident(p); return; }
  if(p) select(p.type,p.id);
  else { S.selection=null; renderInspector(); renderEcon(); updateMarkers(); }
}
/* #50: an anonymous density head (#16) backs no sim entity. Selecting it MATERIALISES a
   real character out of the settlement's latent demographic pool (makeChar → draw-from-
   pool; DESIGN §236 «Identified vs anonymous»), binds the head to it, and opens its
   window. The head keeps that binding for the rest of the tile's life, so re-clicking the
   same cat re-opens the same, now-identified, character instead of drawing a fresh one. */
function materializeResident(p){
  const w=p.walker;
  if(w.id==null) w.id = makeChar(p.settlementId).id;   // draw-from-pool, then bind the head
  select('char', w.id);
}
const tip=document.getElementById('tip');
function hoverAt(cx,cy){
  const p=nearest(cx,cy);
  const same = (!p&&!hover) || (p&&hover&&p.type===hover.type&&p.id===hover.id);
  setHover(p);
  canvas.style.cursor = p? 'pointer':'default';
  if(!p){ tip.style.display='none'; return; }
  tip.style.display='block';
  tip.style.left=(cx+14)+'px';
  tip.style.top=(cy+14)+'px';
  tip.innerHTML=tipHTML(p);
  if(!same) updateMarkers();
}
function tipHTML(p){
  if(p.type==='settlement'){
    const st=stl(p.id), o=org(st.ownerOrgId);
    const worst=RKEYS.map(r=>({r,v:st.stock[r]/Math.max(st.target[r],0.01)})).sort((a,b)=>a.v-b.v)[0];
    return '<b>'+st.name+'</b><span class="tk">'+TIER[st.tier].label+' · '+num(st.pop)+' осіб</span>'+
      '<span class="tk">'+(o?o.name:'нічий')+'</span>'+
      '<span class="tk">дефіцит: '+RES[worst.r].label.toLowerCase()+' '+Math.round(worst.v*100)+'%</span>';
  }
  if(p.type==='enterprise'){
    const e=ent(p.id), st=stl(e.settlementId);
    return '<b>'+ENT[e.kind].label+'</b><span class="tk">'+st.name+'</span>'+
      '<span class="tk">'+(e.stalled?'простоює':'працює')+'</span>';
  }
  if(p.type==='squad'){
    const sq=sqd(p.id), o=org(sq.orgId);
    return '<b>Загін #'+sq.id+'</b><span class="tk">'+(o?o.name:'—')+'</span>'+
      '<span class="tk">сила '+sq.strength+' · '+sq.order+'</span>';
  }
  if(p.type==='caravan'){
    const cv=byId(S.caravans,p.id), o=org(cv.orgId);
    return '<b>Караван</b><span class="tk">'+(o?o.name:'—')+'</span>'+
      '<span class="tk">'+(cv.cargo? RES[cv.cargo].label+' ×'+Math.round(cv.qty):'порожній')+'</span>';
  }
  if(p.type==='char'){
    const c=chr(p.id);
    return '<b>'+c.name+'</b><span class="tk">'+(c.ledOrgId? 'лідер · '+org(c.ledOrgId).name : 'мешканець')+'</span>';
  }
  if(p.type==='resident'){   // #50: an as-yet-anonymous head — click to identify it
    const st=stl(p.settlementId);
    return '<b>Мешканець</b><span class="tk">'+(st?st.name:'')+'</span><span class="tk">натисни, щоб пізнати</span>';
  }
  return '';
}
function select(type,id){
  S.selection={type,id:+id};
  renderInspector(); updateMarkers(); renderEcon();
  if(graphOpen) drawGraph();
}
/* fly = rotate the planet so the target faces the camera */
let flyQ=null, flyT=0;
function flyTo(dir){
  const target=new THREE.Quaternion().setFromUnitVectors(dir.clone().normalize(), new THREE.Vector3(0,0,1));
  flyQ=target; flyT=0;
  if(camAltTarget>2.6) camAltTarget=2.0;
}
function stepFly(){
  if(!flyQ) return;
  spin.vel=0;
  flyT=Math.min(1, flyT+0.09);
  root.quaternion.slerp(flyQ, 0.18);
  if(flyT>=1) flyQ=null;
}

/* Debug / test drive surface — mirrors the existing window.S / window.TELE console
   hooks. Aims the camera at a settlement through the REAL select→flyTo→zoom path (so
   the hot-region trigger fires exactly as it does for a user), and reads hot state. */
window.__dbg = {
  focusSettlement:(id, alt=0.06)=>{ const st=stl(id); if(!st) return false;
    select('settlement', id); flyTo(st.dir); camAltTarget=alt; return true; },
  // snap (no slerp/ease) the planet so direction d faces the camera focus, and optionally
  // snap the zoom — a deterministic, drift-free centring for tests (kills spin + any fly).
  snapDir:(d, alt)=>{ root.quaternion.setFromUnitVectors(new THREE.Vector3(d.x,d.y,d.z).normalize(), new THREE.Vector3(0,0,1));
    spin.vel=0; flyQ=null; if(alt!=null){ camAlt=camAltTarget=alt; } return true; },
  zoom:(alt)=>{ camAltTarget=alt; },
  camDist:()=>camDist,
  hotIds:()=>[...cityLive],
  settlements:()=>S.settlements.map(s=>({id:s.id, tier:s.tier, name:s.name})),
  // read-only orientation probes for headless verification: how centred a settlement is
  // under the current planet spin (its dir·camera axis; 1 = dead-centre facing the camera),
  // and whether a fly-to slerp is currently in flight.
  faceZ:(id)=>{ const st=stl(id); return st? st.dir.clone().applyQuaternion(root.quaternion).z : null; },
  flying:()=>!!flyQ,
  // #50 test seam: the live walking heads of a hot city, each with the screen point
  // where nearest() registers its pick (screenPos(dir)) AND the head's real drawn screen
  // point (its mesh world position projected) — so a test can click the VISIBLE head and
  // confirm the pick lands on it. id is the bound character (null = still anonymous).
  walkers:(id)=>{ const c=cityCache.get(id); if(!c) return null;
    const v=new THREE.Vector3();
    return c.walkers.map((w,k)=>{
      const pk=screenPos(w.dir, w.r);   // #50: the pick projects at the head's own shell (p.r) → sits on the head
      v.setFromMatrixPosition(w.mesh.matrixWorld).project(camera);
      return { k, id:w.id, dir:{x:w.dir.x, y:w.dir.y, z:w.dir.z}, pick:{x:pk.x, y:pk.y, behind:pk.behind},
               head:{x:(v.x*0.5+0.5)*innerWidth, y:(-v.y*0.5+0.5)*innerHeight} }; }); },
};

/* =====================================================================
   PINNABLE TOOLTIPS — one system shared by entity- and term-tooltips.
   Desktop: hover peeks, middle-click pins. Touch: long-press pins, short
   tap passes through to the element's own action; a pinned tooltip is
   dismissed by its ✕ or by tapping/clicking anywhere outside the stack.
   (DESIGN.md → "Pinnable, nested tooltips" + "Touch equivalent…".)
   ===================================================================== */
// Small glossary of mechanics terms that appear in the UI (player-facing).
const TERMS={
  tier:{label:'Тір (рівень)', def:'Рівень поселення за розміром і населенням: від хутора до столиці. Задає рівень деталізації (LOD) та економічну вагу.'},
  squad:{label:'Загін', def:'Мобільний військовий підрозділ організації. Має силу й наказ, керується AI або вручну, потребує <span class="link termlink" data-term="supply">постачання</span>.'},
  enterprise:{label:'Підприємство', def:'Виробнича одиниця в поселенні: споживає вхідні ресурси й виробляє вихідні. Без входів — простоює.'},
  caravan:{label:'Караван', def:'Транспорт торгового дому: везе ресурс звідти, де надлишок, туди, де дефіцит, і приносить прибуток.'},
  treasury:{label:'Скарбниця', def:'Запас грошей організації. Наповнюється доходом (податок, торгівля), витрачається на утримання й будівництво.'},
  leadership:{label:'Тип правління', def:'Правило, за яким організація обирає й передає лідера (спадкове, виборне тощо). Впливає на спадкоємця та кризи влади.'},
  subordinate:{label:'Підпорядкована організація', def:'Організація нижче за іншу в дереві влади. Має <span class="link termlink" data-term="loyalty">лояльність</span> до батька; її падіння веде до відколу.'},
  supply:{label:'Постачання', def:'Ресурси й гроші, щоб утримувати <span class="link termlink" data-term="squad">загін</span> у полі. Розрив постачання послаблює загін.'},
  loyalty:{label:'Лояльність', def:'Наскільки <span class="link termlink" data-term="subordinate">підпорядкована</span> організація чи населення лишаються вірними. Нижче порогу — бунт або відкол.'}
};
// term-link renderer, used inside inspector panels
const T=(key,label)=>'<span class="link termlink" data-term="'+key+'">'+(label||(TERMS[key]?TERMS[key].label:key))+'</span>';
function termHTML(key){
  const t=TERMS[key]; if(!t) return '';
  return '<b>'+t.label+'</b><span class="tk">термін механіки</span>'+
    '<div style="margin-top:4px;color:var(--dim);line-height:1.5">'+t.def+'</div>';
}

const pinTip=document.getElementById('pinTip');
const termTip=document.getElementById('termTip');
let pinnedShown=false, hadTouch=false;
const CAN_HOVER = matchMedia('(hover:hover)').matches;   // desktop peek only where a pointer can hover

function placeTip(el, cx, cy){                            // show + clamp inside the viewport
  el.style.display='block';
  const w=el.offsetWidth, h=el.offsetHeight;
  let x=cx+14, y=cy+14;
  if(x+w>innerWidth-6)  x=Math.max(6, Math.min(cx-w-14, innerWidth-w-6));
  if(y+h>innerHeight-6) y=Math.max(6, innerHeight-h-6);
  el.style.left=x+'px'; el.style.top=y+'px';
}
function showPin(html, cx, cy){                           // pin a tooltip (entity or term)
  pinTip.innerHTML='<span class="pinClose" data-pinclose="1" title="Закрити">✕</span>'+html;
  placeTip(pinTip, cx, cy);
  pinnedShown=true;
}
function hidePin(){ pinTip.style.display='none'; pinnedShown=false; }
function maybeDismissPin(target){                         // click/tap outside the pin closes it
  if(pinnedShown && !(target && target.closest && target.closest('#pinTip'))) hidePin();
}

// interactions INSIDE a pinned tooltip: ✕ closes; a term link drills (nested, replace);
// an entity link selects+teleports and closes — mirroring desktop click-to-open-nested.
pinTip.addEventListener('click', e=>{
  if(e.target.closest('[data-pinclose]')){ hidePin(); return; }
  const tl=e.target.closest('[data-term]');
  if(tl && TERMS[tl.dataset.term]){ const r=pinTip.getBoundingClientRect(); showPin(termHTML(tl.dataset.term), r.left+12, r.top+10); return; }
  const el=e.target.closest('[data-sel]');
  if(el){ const [t,id]=el.dataset.sel.split(':'); select(t,+id); const d=selectionDir(); if(d) flyTo(d); hidePin(); }
});

// desktop: hover a term link → peek (mouse-only; touch uses long-press instead)
document.addEventListener('mouseover', e=>{
  if(!CAN_HOVER || hadTouch) return;
  const tl=e.target.closest && e.target.closest('[data-term]');
  if(tl && TERMS[tl.dataset.term]){ termTip.innerHTML=termHTML(tl.dataset.term); placeTip(termTip, e.clientX, e.clientY); }
});
document.addEventListener('mousemove', e=>{
  if(termTip.style.display!=='block') return;
  const tl=e.target.closest && e.target.closest('[data-term]');
  if(tl) placeTip(termTip, e.clientX, e.clientY); else termTip.style.display='none';
});
// desktop: middle-click a term link → pin it (matches entity middle-click-to-pin)
document.addEventListener('auxclick', e=>{
  if(e.button!==1) return;
  const tl=e.target.closest && e.target.closest('[data-term]');
  if(tl && TERMS[tl.dataset.term]){ e.preventDefault(); showPin(termHTML(tl.dataset.term), e.clientX, e.clientY); }
});

// touch: long-press a term link → pin it; a short tap passes through (a term link has
// no click action of its own, so passthrough is a no-op — the link keeps its meaning).
let termLPtimer=null;
document.addEventListener('touchstart', e=>{
  hadTouch=true;
  const tl=e.target.closest && e.target.closest('[data-term]');
  if(!tl || !TERMS[tl.dataset.term]) return;
  const t=e.touches[0], sx=t.clientX, sy=t.clientY, key=tl.dataset.term;
  if(termLPtimer) clearTimeout(termLPtimer);
  termLPtimer=setTimeout(()=>{
    termLPtimer=null;
    showPin(termHTML(key), sx, sy);
    if(navigator.vibrate) navigator.vibrate(18);
  }, LONG_PRESS_MS);
}, {passive:true});
const cancelTermLP=()=>{ if(termLPtimer){ clearTimeout(termLPtimer); termLPtimer=null; } };
document.addEventListener('touchmove', cancelTermLP, {passive:true});
document.addEventListener('touchend', cancelTermLP, {passive:true});
document.addEventListener('touchcancel', cancelTermLP, {passive:true});

// tap / click anywhere outside a pinned tooltip dismisses it (capture, so it runs
// before the game-view handlers that may open a fresh pin on the same gesture).
document.addEventListener('pointerdown', e=>{ if(e.pointerType!=='touch') maybeDismissPin(e.target); }, true);
document.addEventListener('touchstart', e=>{ maybeDismissPin(e.target); }, {capture:true, passive:true});

/* =====================================================================
   INSPECTOR — content is a pure function of the selected object type
   ===================================================================== */
const insp=document.getElementById('inspector');
const L=(type,id,label)=>'<span class="link" data-sel="'+type+':'+id+'">'+label+'</span>';
const num=n=>Math.round(n).toLocaleString('uk-UA');
const f1=n=>(Math.round(n*10)/10).toFixed(1);

function isPlayerOrg(o){
  if(!S.playerCharId) return false;
  const pc=chr(S.playerCharId);
  if(!pc) return false;
  if(pc.ledOrgId===o.id) return true;
  // orgs in the avatar's subtree are controlled too
  let cur=o, guard=0;
  while(cur && cur.parentId && guard++<20){
    if(cur.parentId===pc.ledOrgId) return true;
    cur=org(cur.parentId);
  }
  return false;
}
function renderInspector(){
  const s=S.selection;
  if(!s){
    const pc = S.playerCharId? chr(S.playerCharId) : null;
    let h='<div class="ihead"><div><div class="ikind">Інспектор</div><div class="iname">Нічого не вибрано</div></div></div>';
    if(pc && pc.alive){
      const led=org(pc.ledOrgId);
      h+='<div class="isec"><h4>Твій персонаж</h4>'+
        '<div class="avatarcard" data-sel="char:'+pc.id+'" title="Перейти до свого персонажа">'+
          '<div class="av-dot"></div>'+
          '<div><div class="av-name">'+pc.name+'</div>'+
          '<div class="av-sub">'+(led? led.name : 'без організації')+'</div></div>'+
        '</div></div>';
    }
    h+='<div class="isec empty">Клікни поселення, загін, караван, підприємство або людину. Кожне ім\'я в панелі — посилання.</div>';
    h+='<div class="isec"><h4>Терміни</h4><div class="stat" style="margin-bottom:4px">Наведи (миша) або довгий тап (тач), щоб закріпити пояснення.</div>'+
      T('tier')+' · '+T('squad')+' · '+T('enterprise')+' · '+T('caravan')+' · '+T('treasury')+' · '+T('supply')+'</div>';
    insp.innerHTML=h;
    return; }
  const fn={settlement:inspSettlement, org:inspOrg, char:inspChar, squad:inspSquad,
    enterprise:inspEnterprise, caravan:inspCaravan}[s.type];
  insp.innerHTML = fn? fn(s.id) : '';
}
function head(kind,name,sub){
  // #47 — the header name teleports to the current selection, reusing the shared [data-sel]
  // link machinery (L + the inspector click handler + selectionDir/flyTo): a city flies to
  // itself, a character to their home settlement. Only linkify when the selection resolves to
  // a location; otherwise the name stays plain text so a click has nothing to (fail to) fly to.
  const s=S.selection;
  const nameHTML=(s && selectionDir())? L(s.type,s.id,name) : name;
  return '<div class="ihead"><div><div class="ikind">'+kind+'</div><div class="iname">'+nameHTML+'</div></div>'+
    '<div class="stat">'+(sub||'')+'</div></div>';
}
function row(k,v){return '<div class="row"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>';}

function inspSettlement(id){
  const st=stl(id); if(!st) return '';
  const o=org(st.ownerOrgId);
  const parent=o&&o.parentId? org(o.parentId):null;
  let h=head('Поселення · '+T('tier',TIER[st.tier].label), st.name, ZONE[st.zone].label);
  h+='<div class="isec">'+
    row('Власник', o? L('org',o.id,o.name) : '<span class="empty">нічий</span>')+
    (parent? row('Підпорядкований', L('org',parent.id,parent.name)) : '')+
    row('Населення', num(st.pop)+(st.starving?' <span class="neg">· голод</span>':''))+
    row('Територія', f1(st.area)+' зон')+
    row(T('loyalty','Лояльність'), f1(st.loyalty)+'<div class="bar"><i style="width:'+st.loyalty+'%"></i></div>')+
    '</div>';
  h+='<div class="isec"><h4>Ринок — запас / потреба · ціна</h4><table class="tbl">';
  for(const r of RKEYS){
    const net=st.net[r], g=st.gross[r];
    h+='<tr><td>'+RES[r].label+'</td>'+
      '<td class="n">'+f1(st.stock[r])+'/'+f1(st.target[r])+'</td>'+
      '<td class="n '+(net>=0?'pos':'neg')+'">'+(net>=0?'+':'')+f1(net)+'</td>'+
      '<td class="n" style="color:var(--dim)">'+f1(st.price[r])+'💰</td></tr>';
  }
  h+='</table><div class="stat" style="margin-top:5px">брутто: виробництво / споживання враховано в чистій зміні</div></div>';
  h+='<div class="isec"><h4>Підприємства ('+st.entIds.length+')</h4>';
  if(!st.entIds.length) h+='<div class="empty">жодного</div>';
  for(const eid of st.entIds){
    const e=ent(eid); if(!e) continue;
    h+='<div class="row"><span>'+L('enterprise',e.id, ENT[e.kind].label)+'</span>'+
      '<span class="v '+(e.stalled?'neg':'pos')+'">'+(e.stalled?'простоює':'працює')+'</span></div>';
  }
  h+='</div>';
  const gar=S.squads.filter(x=>x.dir.dot(st.dir)>0.9997);
  h+='<div class="isec"><h4>Загони тут ('+gar.length+')</h4>';
  if(!gar.length) h+='<div class="empty">немає</div>';
  for(const sq of gar) h+=row(L('squad',sq.id,'Загін #'+sq.id), 'сила '+sq.strength);
  h+='</div>';
  return h;
}
function inspOrg(id){
  const o=org(id); if(!o) return '';
  const ctrl=isPlayerOrg(o);
  const leader=chr(o.leaderId), heir=chr(o.heirId);
  let h=head('Організація · '+KIND_LABEL[o.kind], o.name, ctrl?'під твоїм контролем':'');
  // ancestor breadcrumb
  const chain=[]; let cur=o, g=0;
  while(cur.parentId && g++<12){ cur=org(cur.parentId); if(!cur) break; chain.unshift(cur); }
  if(chain.length) h+='<div class="breadcrumb">'+chain.map(a=>L('org',a.id,a.name)).join(' › ')+' › <b>'+o.name+'</b></div>';
  h+='<div class="isec">'+
    row('Лідер', leader? L('char',leader.id,leader.name) : '<span class="empty">вакансія</span>')+
    row('Спадкоємець', heir? L('char',heir.id,heir.name) : '<span class="empty">не призначено</span>')+
    row(T('leadership','Тип правління'), LT_LABEL[o.leadershipType])+
    row('Учасників', o.members.filter(m=>chr(m)&&chr(m).alive).length)+
    row(T('treasury','Скарбниця'), num(o.treasury)+'💰')+
    row('Дохід / витрати', '<span class="pos">+'+f1(o.income||0)+'</span> / <span class="neg">−'+f1(o.expenses||0)+'</span>')+
    row('Управління (derived)', orgManagement(o))+
    row('Амбіція (utility)', f1(orgUtility(o))+'<div class="bar"><i style="width:'+(orgUtility(o)/1.2*100)+'%"></i></div>')+
    row('Лояльність', f1(o.loyalty))+
    row('Останнє рішення', '<span class="chip">'+o.lastDecision+'</span>')+
    '</div>';
  if(ctrl){
    h+='<div class="isec"><h4>Політика (редаговано)</h4>'+
      '<div class="row"><span class="k">Податок</span><span class="v">'+
      '<input id="taxIn" type="range" min="0" max="0.5" step="0.01" value="'+o.taxRate+'" style="width:110px;vertical-align:middle"> '+
      Math.round(o.taxRate*100)+'%</span></div>'+
      '<div class="row"><span class="k">Тип правління</span><span class="v"><select id="ltIn">'+
      LEADERSHIP.map(l=>'<option value="'+l+'"'+(l===o.leadershipType?' selected':'')+'>'+LT_LABEL[l]+'</option>').join('')+
      '</select></span></div>'+
      '<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">'+
      '<button id="actEnt">Збудувати підприємство (140💰)</button>'+
      '<button id="actSq">Найняти загін (110💰)</button>'+
      (o.trade?'':'<button id="actTrade">Створити торговий дім (420💰)</button>')+
      '</div></div>';
  } else {
    h+='<div class="isec"><h4>Політика</h4>'+
      row('Податок', Math.round(o.taxRate*100)+'%')+
      '<div class="stat" style="margin-top:4px">Панель у режимі читання — ти не контролюєш цю організацію.</div></div>';
  }
  if(o.trade){
    const cvs=S.caravans.filter(c=>c.orgId===o.id);
    h+='<div class="isec"><h4>Каравани ('+cvs.length+'/'+o.caravanCap+')</h4>';
    for(const c of cvs) h+=row(L('caravan',c.id,'Караван #'+c.id),
      c.cargo? RES[c.cargo].label+' ×'+Math.round(c.qty) : '<span class="empty">шукає угоду</span>');
    h+=row('Середній прибуток','<span class="'+((o.profit||0)>=0?'pos':'neg')+'">'+f1(o.profit||0)+'💰/крок</span>');
    h+='</div>';
  }
  const props=S.settlements.filter(x=>x.ownerOrgId===o.id);
  const eprops=S.ents.filter(e=>e.ownerOrgId===o.id);
  h+='<div class="isec"><h4>Власність</h4>';
  if(!props.length && !eprops.length) h+='<div class="empty">немає</div>';
  for(const p of props) h+=row(L('settlement',p.id,p.name), TIER[p.tier].label);
  for(const e of eprops) h+=row(L('enterprise',e.id, ENT[e.kind].label), stl(e.settlementId).name);
  h+='</div>';

  const out=S.edges.filter(e=>e.from===o.id && e.kind!=='ownership' && e.kind!=='hierarchy');
  const inn=S.edges.filter(e=>e.to===o.id && e.kind!=='ownership' && e.kind!=='hierarchy');
  h+='<div class="isec"><h4>Слоти цієї організації в інших</h4>';
  if(!out.length) h+='<div class="empty">жодного</div>';
  for(const e of out){
    const t=org(e.to); if(!t) continue;
    h+=row(L('org',t.id,t.name), '<span class="chip">'+e.kind+(e.visibility==='covert'?' · covert':'')+'</span>'+
      (e.salary?' '+e.salary+'💰':''));
  }
  h+='</div><div class="isec"><h4>Хто має слоти тут</h4>';
  const visible=inn.filter(e=>e.visibility!=='covert' || ctrl);
  if(!visible.length) h+='<div class="empty">жодного відомого</div>';
  for(const e of visible){
    const t=org(e.from); if(!t) continue;
    h+=row(L('org',t.id,t.name), '<span class="chip" style="'+(e.visibility==='covert'?'color:var(--covert);border-color:var(--covert)':'')+'">'+
      e.kind+(e.visibility==='covert'?' · covert':'')+'</span>');
  }
  h+='</div>';
  const subs=S.orgs.filter(x=>x.parentId===o.id);
  h+='<div class="isec"><h4>Підлеглі організації ('+subs.length+')</h4>';
  if(!subs.length) h+='<div class="empty">немає</div>';
  for(const sb of subs) h+=row(L('org',sb.id,sb.name),'<span class="chip">'+sb.kind+'</span> лояльність '+Math.round(sb.loyalty));
  h+='</div>';
  return h;
}
function inspChar(id){
  const c=chr(id); if(!c) return '';
  const o=org(c.orgId), led=org(c.ledOrgId);
  const home=stl(c.homeId);
  let h=head('Персонаж'+(c.id===S.playerCharId?' · твій аватар':''), c.name, c.alive?(c.age+' р.'):'† помер');
  h+='<div class="isec">'+
    row('Резиденція', home? L('settlement',home.id,home.name):'—')+
    row('Організація', o? L('org',o.id,o.name):'<span class="empty">без організації</span>')+
    row('Веде', led? L('org',led.id,led.name):'—')+
    row('Посада', c.post || (led?'Leader':'—'))+
    '</div>';
  h+='<div class="isec"><h4>Риси</h4>'+c.traits.map(t=>'<span class="chip">'+t+'</span>').join('')+'</div>';
  h+='<div class="isec"><h4>Навички</h4>';
  for(const s of SKILLS)
    h+='<div class="row"><span class="k">'+SKILL_LABEL[s]+'</span><span class="v">'+c.skills[s]+
      '<div class="bar" style="width:70px;display:inline-block;margin-left:6px"><i style="width:'+(c.skills[s]*8)+'%"></i></div></span></div>';
  h+='</div>';
  if(c.alive && c.ledOrgId && c.id!==S.playerCharId)
    h+='<div class="isec"><button id="beChar">Грати за цього персонажа</button></div>';
  return h;
}
function inspSquad(id){
  const sq=sqd(id); if(!sq) return '';
  const o=org(sq.orgId);
  const ctrl=o&&isPlayerOrg(o);
  const leader=o? chr(o.leaderId):null;
  let h=head('Загін', 'Загін #'+sq.id, 'сила '+sq.strength);
  h+='<div class="isec">'+
    row('Організація', o? L('org',o.id,o.name):'—')+
    row('Лідер', leader? L('char',leader.id,leader.name):'—')+
    row('Наказ', '<span class="chip">'+sq.order+(sq.targetName?' → '+sq.targetName:'')+'</span>'+
      (sq.queue&&sq.queue.length? ' <span class="chip">+'+sq.queue.length+' у черзі</span>':''))+
    row(T('supply','Постачання'), sq.supplied===false?'<span class="neg">розрив</span>':'<span class="pos">є</span>')+
    row('База', stl(sq.homeId)? L('settlement',sq.homeId, stl(sq.homeId).name):'—')+
    row('Керування', '<span class="chip">'+(sq.mode==='auto'?'AI (auto)':'ручне')+'</span>')+
    '</div>';
  if(ctrl){
    h+='<div class="isec"><h4>Втручання</h4>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap">'+
      '<button id="sqAuto" '+(sq.mode==='auto'?'disabled':'')+'>Повернути на авто</button>'+
      '<button id="sqHold">Стояти</button>'+
      '</div><div class="stat" style="margin-top:6px">Обери поселення в списку нижче, щоб відправити загін.</div>'+
      '<div style="max-height:120px;overflow:auto;margin-top:5px">'+
      S.settlements.map(st=>'<div class="row"><span class="link" data-order="'+sq.id+':'+st.id+'">→ '+st.name+'</span>'+
        '<span class="v stat">'+TIER[st.tier].label+'</span></div>').join('')+
      '</div></div>';
  }
  return h;
}
function inspEnterprise(id){
  const e=ent(id); if(!e) return '';
  const def=ENT[e.kind], st=stl(e.settlementId), o=org(e.ownerOrgId);
  let h=head('Підприємство', def.label+' · '+st.name, e.stalled?'простоює':'працює');
  h+='<div class="isec">'+
    row('Власник', o? L('org',o.id,o.name):'—')+
    row('Поселення', L('settlement',st.id,st.name))+
    row('Зона', ZONE[st.zone].label)+
    row('Темп', f1(e.rate)+'×')+
    '</div>';
  h+='<div class="isec"><h4>Ланцюг</h4><table class="tbl">';
  const ins=Object.keys(def.in);
  if(!ins.length) h+='<tr><td class="empty">без входів (первинний ресурс)</td></tr>';
  for(const r of ins) h+='<tr><td class="neg">− '+RES[r].label+'</td><td class="n">'+f1(def.in[r]*e.rate)+'</td>'+
    '<td class="n stat">запас '+f1(st.stock[r])+'</td></tr>';
  h+='<tr><td class="neg">− Інструменти</td><td class="n">'+f1(TOOL_WEAR)+'</td><td class="n stat">знос</td></tr>';
  for(const r in def.out) h+='<tr><td class="pos">+ '+RES[r].label+'</td><td class="n">'+f1(def.out[r]*e.rate)+'</td><td></td></tr>';
  h+='</table></div>';
  return h;
}
function inspCaravan(id){
  const cv=byId(S.caravans,id); if(!cv) return '';
  const o=org(cv.orgId);
  const from=S.settlements[cv.atIdx], to=cv.dest!=null? S.settlements[cv.dest]:null;
  let h=head('Караван','Караван #'+cv.id, cv.phase);
  h+='<div class="isec">'+
    row('Торговий дім', o? L('org',o.id,o.name):'—')+
    row('Вантаж', cv.cargo? RES[cv.cargo].label+' ×'+Math.round(cv.qty) : '<span class="empty">порожній</span>')+
    row('Маршрут', (from?from.name:'?')+(to? ' → '+L('settlement',to.id,to.name):''))+
    row('Місткість', cv.capacity)+
    row('Рейсів', cv.trips)+
    row('Сумарний прибуток','<span class="'+(cv.profit>=0?'pos':'neg')+'">'+(cv.profit>=0?'+':'')+num(cv.profit)+'💰</span>')+
    '</div>';
  h+='<div class="isec stat">Караван сам шукає найбільшу маржу: купує там, де надлишок, везе туди, де дефіцит. Прибуток осідає в торговому домі — і той купує ще каравани.</div>';
  return h;
}

/* --- inspector interactions --- */
insp.addEventListener('click',e=>{
  const link=e.target.closest('[data-sel]');
  if(link){
    const [t,id]=link.dataset.sel.split(':');
    select(t,+id);
    const d=selectionDir(); if(d) flyTo(d);
    return;
  }
  const ord=e.target.closest('[data-order]');
  if(ord){
    const [sid,stid]=ord.dataset.order.split(':').map(Number);
    const sq=sqd(sid), st=stl(stid);
    if(sq&&st){ sq.mode='manual'; sq.target=st.dir.clone(); sq.order='move'; sq.targetName=st.name;
      logEvent('Наказ: загін #'+sq.id+' → <b>'+st.name+'</b>.'); renderInspector(); }
    return;
  }
  if(e.target.id==='sqAuto'){ const sq=sqd(S.selection.id); sq.mode='auto'; sq.target=null; sq.order='idle'; renderInspector(); }
  if(e.target.id==='sqHold'){ const sq=sqd(S.selection.id); sq.mode='manual'; sq.target=null; sq.order='hold'; renderInspector(); }
  if(e.target.id==='beChar'){ setAvatar(S.selection.id); }
  if(e.target.id==='actEnt'){
    const o=org(S.selection.id);
    const owned=S.settlements.filter(s=>s.ownerOrgId===o.id);
    if(o.treasury>=140 && owned.length){
      const st=owned[0];
      const opts=EKEYS.filter(k=>!ENT[k].zone || ENT[k].zone.includes(st.zone));
      o.treasury-=140; createEnterprise(st, pick(opts), null);
      logEvent('Ти збудував підприємство у <b>'+st.name+'</b>.'); renderInspector();
    }
  }
  if(e.target.id==='actSq'){
    const o=org(S.selection.id);
    const owned=S.settlements.filter(s=>s.ownerOrgId===o.id);
    if(o.treasury>=110 && owned.length){ o.treasury-=110; spawnSquad(o, owned[0], {}); renderInspector(); }
  }
  if(e.target.id==='actTrade'){
    const o=org(S.selection.id);
    if(o.treasury>=420){ o.treasury-=420; o.trade=true; o.caravanCap=2;
      const owned=S.settlements.filter(s=>s.ownerOrgId===o.id);
      o.homeSettlementId=(owned[0]||pick(S.settlements)).id;
      spawnCaravan(o); logEvent('Ти заснував торговий дім.'); renderInspector(); }
  }
});
insp.addEventListener('input',e=>{
  if(e.target.id==='taxIn'){ org(S.selection.id).taxRate=parseFloat(e.target.value); renderInspector(); }
  if(e.target.id==='ltIn'){ org(S.selection.id).leadershipType=e.target.value; renderInspector(); }
});
document.getElementById('log').addEventListener('click',e=>{
  const link=e.target.closest('[data-sel]');
  if(link){ const [t,id]=link.dataset.sel.split(':'); select(t,+id);
    const d=selectionDir(); if(d) flyTo(d); }
});

function setAvatar(charId){
  // unpin old
  for(const sq of S.squads) if(sq.pinned){ sq.pinned=false; sq.mode='auto'; }
  S.playerCharId=charId;
  const c=chr(charId);
  const o=org(c.ledOrgId);
  if(o){
    for(const sq of S.squads){
      const so=org(sq.orgId);
      if(so && (so.id===o.id || so.parentId===o.id)){ sq.pinned=true; sq.mode='manual'; }
    }
    logEvent('Ти граєш за <b>'+c.name+'</b>, лідера <span class="link" data-sel="org:'+o.id+'">'+o.name+'</span>. Його загони під ручним контролем.');
    select('org', o.id);
  }
  invalidatePawns();
  document.getElementById('start').style.display='none';
  rebuildViewpointOptions();
}

/* =====================================================================
   ECONOMY PANEL (world or selected settlement)
   ===================================================================== */
function renderEcon(){
  const body=document.getElementById('econBody');
  const title=document.getElementById('econTitle');
  const sub=document.getElementById('econSub');
  let st=null;
  if(S.selection && S.selection.type==='settlement') st=stl(S.selection.id);
  if(S.selection && S.selection.type==='enterprise') st=stl(ent(S.selection.id)?.settlementId);
  let h='';
  if(st){
    title.textContent=st.name;
    sub.textContent=TIER[st.tier].label;
    for(const r of RKEYS){
      const ratio=Math.max(0,Math.min(1.4, st.stock[r]/Math.max(st.target[r],0.001)));
      const col = ratio<0.5? '#C4574F' : ratio<0.95? '#C89B3C' : '#5FB58A';
      h+='<div class="rline"><span class="rname">'+RES[r].label+'</span>'+
        '<span class="rbar"><i style="width:'+Math.min(100,ratio/1.4*100)+'%;background:'+col+'"></i></span>'+
        '<span class="rnum '+(st.net[r]>=0?'pos':'neg')+'">'+(st.net[r]>=0?'+':'')+f1(st.net[r])+'</span></div>';
    }
    h+='<div class="stat" style="margin-top:6px">червоне = дефіцит → сюди підуть каравани</div>';
  } else {
    title.textContent='світ';
    sub.textContent='дефіцити';
    for(const r of RKEYS){
      let stock=0,target=0,def=0;
      for(const s of S.settlements){ stock+=s.stock[r]; target+=s.target[r];
        if(s.stock[r]<s.target[r]*0.6) def++; }
      const ratio=Math.max(0,Math.min(1.4, stock/Math.max(target,0.001)));
      const col = ratio<0.5? '#C4574F' : ratio<0.95? '#C89B3C' : '#5FB58A';
      h+='<div class="rline"><span class="rname">'+RES[r].label+'</span>'+
        '<span class="rbar"><i style="width:'+Math.min(100,ratio/1.4*100)+'%;background:'+col+'"></i></span>'+
        '<span class="rnum">'+def+'✕</span></div>';
    }
    h+='<div class="stat" style="margin-top:6px">✕ — скільки поселень у дефіциті цього ресурсу</div>';
  }
  body.innerHTML=h;
}

/* =====================================================================
   ORG GRAPH VIEW
   ===================================================================== */
let graphOpen=false;
const gWrap=document.getElementById('graph');
const gCanvas=document.getElementById('graphCanvas');
const gctx=gCanvas.getContext('2d');
const gTip=document.getElementById('gTip');
let gNodes=new Map(), gShowProp=true, gFocus=false, gBigOnly=true, gViewpoint='spectator', gHideKinds=new Set();
let gCam={x:0,y:0,z:1}, gDrag=null, gHover=null, gW=0, gH=0, gLastOrgCount=-99;

/* which orgs are worth drawing: a 400-node hairball helps nobody */
function orgVisible(o){
  if(gHideKinds.has(o.kind)) return false;               // view-only filter by org kind
  if(!gBigOnly) return true;
  if(o.parentId===null) return true;                    // independent
  if(o.kind==='political' || o.trade) return true;      // realms & trade houses
  if(S.settlements.some(s=>s.ownerOrgId===o.id)) return true;
  if(S.selection && S.selection.type==='org' && S.selection.id===o.id) return true;
  return S.edges.some(e=>e.kind!=='ownership' && e.kind!=='hierarchy' &&
    (e.from===o.id||e.to===o.id));                      // in a slot relationship
}
function gSize(){
  const r=gWrap.getBoundingClientRect();
  gW=Math.max(300, Math.round(r.width));
  gH=Math.max(200, Math.round(r.height));
  const dpr=Math.min(devicePixelRatio,2);
  gCanvas.width=gW*dpr; gCanvas.height=gH*dpr;
  gctx.setTransform(dpr,0,0,dpr,0,0);
}
function graphEdges(){
  const out=[];
  for(const e of S.edges){
    if(e.kind==='ownership'){
      if(!gShowProp) continue;
      if(!gNodes.has('O'+e.from) || !gNodes.has(String(e.to))) continue;
      out.push({a:'O'+e.from, b:String(e.to), kind:'ownership', e});
    } else {
      if(!gNodes.has('O'+e.from) || !gNodes.has('O'+e.to)) continue;
      out.push({a:'O'+e.from, b:'O'+e.to, kind:e.kind, e});
    }
  }
  return out;
}
/* a node's cluster id: its faction (realm/free-city/bandit), else its own id */
function graphClusterId(o){ return o.factionId!=null ? o.factionId : o.id; }
/* order faction clusters around the ring by political proximity (DESIGN §83):
   a greedy walk over inter-cluster edge weights lands related factions adjacent,
   so the few cross-faction chords cross the empty centre — not each other. */
function orderClusters(facList, cw){
  if(facList.length<=2) return facList.slice();
  const w=(a,b)=> cw.get(a<b?a+'|'+b:b+'|'+a)||0;
  let start=facList[0], bestDeg=-1;
  for(const f of facList){ let d=0; for(const g of facList) if(g!==f) d+=w(f,g); if(d>bestDeg){bestDeg=d; start=f;} }
  const remaining=new Set(facList); remaining.delete(start);
  const seq=[start];
  while(remaining.size){
    const last=seq[seq.length-1]; let nxt=null, best=-1;
    for(const f of remaining){ const ww=w(last,f); if(ww>best){best=ww; nxt=f;} }
    seq.push(nxt); remaining.delete(nxt);
  }
  return seq;
}
function layoutGraph(){
  gNodes.clear();
  const orgs=S.orgs.filter(orgVisible);
  const visIds=new Set(orgs.map(o=>o.id));
  const cx=gW/2, cy=gH/2;

  /* degree = org-to-org edges among visible orgs (hierarchy + slots; ownership excluded).
     zero-degree orgs (most bandits, lone businesses) are the sparse periphery. */
  const deg=new Map();
  for(const e of S.edges){
    if(e.kind==='ownership') continue;
    if(!visIds.has(e.from)||!visIds.has(e.to)) continue;
    deg.set(e.from,(deg.get(e.from)||0)+1);
    deg.set(e.to,(deg.get(e.to)||0)+1);
  }
  const connected=orgs.filter(o=>(deg.get(o.id)||0)>0);
  const isolated =orgs.filter(o=>(deg.get(o.id)||0)===0);
  const connSet=new Set(connected.map(o=>o.id));

  /* faction clusters + their ring order */
  const facList=[...new Set(connected.map(graphClusterId))];
  const facOf=new Map(connected.map(o=>[o.id, graphClusterId(o)]));
  const cw=new Map();
  for(const e of S.edges){
    if(e.kind==='ownership'||e.kind==='hierarchy') continue;
    const fa=facOf.get(e.from), fb=facOf.get(e.to);
    if(fa==null||fb==null||fa===fb) continue;
    const key=fa<fb?fa+'|'+fb:fb+'|'+fa;
    cw.set(key,(cw.get(key)||0)+1);
  }
  const order=orderClusters(facList, cw);
  const n=order.length;
  const ccx=cx, ccy=cy - gH*0.075;                      // connected ring centre, nudged up
  const Rx=Math.min(gW*0.33, 540), Ry=Math.min(gH*0.25, 240);   // wide ellipse uses the landscape
  const centers=new Map();
  order.forEach((f,i)=>{
    const a=-Math.PI/2 + i/Math.max(1,n)*Math.PI*2;     // first cluster at the top
    centers.set(f, n<=1? {x:ccx,y:ccy} : {x:ccx+Math.cos(a)*Rx, y:ccy+Math.sin(a)*Ry});
  });

  /* in-cluster hierarchy tree (parent→children), same faction only */
  const childrenOf=new Map();
  const hasParent=new Set();
  for(const e of S.edges){
    if(e.kind!=='hierarchy') continue;
    if(!connSet.has(e.from)||!connSet.has(e.to)) continue;
    if(facOf.get(e.from)!==facOf.get(e.to)) continue;
    if(!childrenOf.has(e.from)) childrenOf.set(e.from,[]);
    childrenOf.get(e.from).push(e.to);
    hasParent.add(e.to);
  }

  /* per cluster: pick a root, attach parentless members to it, lay out radially */
  const homes=new Map();
  for(const f of order){
    const members=connected.filter(o=>graphClusterId(o)===f).map(o=>o.id);
    const c=centers.get(f)||{x:ccx,y:ccy};
    let root=members[0], bs=-1;
    for(const id of members){ const o=org(id);
      const s=(o.kind==='political'&&o.parentId==null?1000:0)+(deg.get(id)||0);
      if(s>bs){bs=s; root=id;} }
    for(const id of members){          // members with no in-cluster parent hang off the root
      if(id===root||hasParent.has(id)) continue;
      if(!childrenOf.has(root)) childrenOf.set(root,[]);
      if(!childrenOf.get(root).includes(id)) childrenOf.get(root).push(id);
    }
    radialTreePlace(root, new Set(members), childrenOf, c.x, c.y, homes);
  }

  /* seed connected org nodes at their tree homes (any member the tree walk missed —
     rare in odd live-play states — is nudged off the cluster centre so it can't stack) */
  let miss=0;
  for(const o of connected){
    let h=homes.get(o.id);
    if(!h){ const c=centers.get(graphClusterId(o))||{x:ccx,y:ccy}; const a=(miss++)*2.399;
      h={x:c.x+Math.cos(a)*22, y:c.y+Math.sin(a)*22, depth:1}; }
    gNodes.set('O'+o.id,{key:'O'+o.id,type:'org',o,
      x:h.x, y:h.y, vx:0, vy:0, fac:graphClusterId(o),
      hx:h.x, hy:h.y, pin:h.depth===0?0.05:0.03, iso:false});
  }

  /* isolated zone: a tidy grid, clearly below/apart from the connected ring (DESIGN §90) */
  isolated.sort((a,b)=> (a.kind<b.kind?-1:a.kind>b.kind?1:0) || (a.name<b.name?-1:1));
  const colStep=76, rowStep=42;
  const maxCols=Math.max(1, Math.floor(Math.min(gW*0.62, 900)/colStep));
  const cols=Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(isolated.length*1.9))));
  const zoneY0=(n<=1? ccy : ccy+Ry) + 120;              // just below the ring
  const wide=Math.min(cols, isolated.length);
  isolated.forEach((o,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const hx=cx + (col-(wide-1)/2)*colStep, hy=zoneY0 + row*rowStep;
    gNodes.set('O'+o.id,{key:'O'+o.id,type:'org',o,
      x:hx, y:hy, vx:0, vy:0, fac:'iso'+o.id, hx, hy, pin:0.06, iso:true});
  });

  /* property nodes: fanned OUTWARD from the owner (away from cluster centre) so the
     ownership edges are short and radial instead of tangling across the diagram. */
  if(gShowProp){
    const propIdx=new Map();
    const placeProp=(key, node, ownerId)=>{
      const on=gNodes.get('O'+ownerId);
      if(!on){ gNodes.set(key, Object.assign(node,{x:cx,y:cy,vx:0,vy:0,fac:null,hx:cx,hy:cy,pin:0.004,iso:false})); return; }
      const list=propIdx.get(ownerId)||(propIdx.set(ownerId,[]).get(ownerId));
      const idx=list.length; list.push(key);
      // outward direction: from cluster centre through the owner (down, for isolated/root)
      let base;
      if(on.iso){ base=Math.PI/2; }
      else { const c=centers.get(on.fac)||{x:ccx,y:ccy};
        const dx=on.hx-c.x, dy=on.hy-c.y;
        base=(Math.abs(dx)+Math.abs(dy)<1)? Math.PI/2 : Math.atan2(dy,dx); }
      const off=[0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5];    // alternating fan around the outward ray
      const ang=base+(off[idx]!=null?off[idx]:0);
      const rad=(on.iso?18:26)+Math.floor(idx/2)*8;
      const hx=on.hx+Math.cos(ang)*rad, hy=on.hy+Math.sin(ang)*rad;
      gNodes.set(key, Object.assign(node,{x:hx+(Math.random()-0.5)*6, y:hy+(Math.random()-0.5)*6,
        vx:0, vy:0, fac:on.fac, hx, hy, pin:0.02, iso:on.iso}));
    };
    for(const st of S.settlements) placeProp('S'+st.id, {key:'S'+st.id,type:'settlement',s:st}, st.ownerOrgId);
    for(const e of S.ents){ if(gNodes.has('O'+e.ownerOrgId)) placeProp('E'+e.id, {key:'E'+e.id,type:'enterprise',e}, e.ownerOrgId); }
  }
  for(let i=0;i<240;i++) relax();
}
function relax(){
  const arr=[...gNodes.values()];
  const edges=graphEdges();
  // repulsion on a spatial grid — cheap even with hundreds of nodes
  const CELL=64, grid=new Map();
  for(const n of arr){
    const k=(Math.floor(n.x/CELL))+','+(Math.floor(n.y/CELL));
    if(!grid.has(k)) grid.set(k,[]);
    grid.get(k).push(n);
  }
  for(const n of arr){
    const gx=Math.floor(n.x/CELL), gy=Math.floor(n.y/CELL);
    for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++){
      const cell=grid.get((gx+i)+','+(gy+j));
      if(!cell) continue;
      for(const m of cell){
        if(m===n) continue;
        let dx=m.x-n.x, dy=m.y-n.y;
        let d2=dx*dx+dy*dy;
        if(d2>CELL*CELL*4 || d2<0.01){ if(d2<0.01){n.vx+=Math.random()-0.5;n.vy+=Math.random()-0.5;} continue; }
        const d=Math.sqrt(d2), f=780/d2;
        n.vx-=dx/d*f; n.vy-=dy/d*f;
      }
    }
  }
  for(const e of edges){
    const a=gNodes.get(e.a), b=gNodes.get(e.b);
    if(!a||!b) continue;
    const dx=b.x-a.x, dy=b.y-a.y;
    const d=Math.max(1,Math.hypot(dx,dy));
    // homes carry the structure, so springs are gentle: ownership snugs property to its
    // owner; intra-cluster springs firm up the tree; cross-cluster edges stay long & weak
    // so a chord never drags two faction blobs into each other.
    const sameFac = a.fac!=null && a.fac===b.fac;
    let rest, k;
    if(e.kind==='ownership'){ rest=22; k=0.02; }
    else if(e.kind==='hierarchy'){ rest=44; k=0.012; }
    else if(sameFac){ rest=90; k=0.012; }
    else { rest=230; k=0.003; }
    const f=(d-rest)*k;
    a.vx+=dx/d*f; a.vy+=dy/d*f; b.vx-=dx/d*f; b.vy-=dy/d*f;
  }
  for(const n of arr){
    // home anchor (cluster centre for connected, grid slot for isolated) replaces the
    // old global gravity — it is what keeps factions in distinct regions of the canvas.
    n.vx += (n.hx-n.x)*(n.pin||0.004);
    n.vy += (n.hy-n.y)*(n.pin||0.004);
    n.x += Math.max(-8,Math.min(8,n.vx));
    n.y += Math.max(-8,Math.min(8,n.vy));
    n.vx*=0.62; n.vy*=0.62;
  }
}
function edgeVisible(e){
  if(e.visibility!=='covert') return true;
  if(gViewpoint==='spectator') return true;
  return e.from===+gViewpoint;
}
function reachable(startKey){
  const seen=new Set([startKey]); const q=[startKey];
  const edges=graphEdges();
  while(q.length){
    const cur=q.shift();
    for(const e of edges){
      if(e.kind==='ownership') continue;
      if(e.a===cur && !seen.has(e.b)){seen.add(e.b); q.push(e.b);}
      if(e.b===cur && !seen.has(e.a)){seen.add(e.a); q.push(e.a);}
    }
  }
  for(const e of edges) if(e.kind==='ownership' && seen.has(e.a)) seen.add(e.b);
  return seen;
}
const EDGE_STYLE={
  hierarchy:{c:'#4C5975', w:1,   dash:[]},
  control:  {c:'#C89B3C', w:1.8, dash:[]},
  influence:{c:'#5FB58A', w:1.5, dash:[6,4]},
  investment:{c:'#57A9C4',w:1.5, dash:[6,4]},
  alliance: {c:'#6E9BD8', w:3,   dash:[]},
  ownership:{c:'#39465F', w:1,   dash:[2,3]},
};
function nodeRadius(n){
  if(n.type==='org') return 4+Math.min(9, orgPower(n.o)/2.6);
  if(n.type==='settlement') return 3.6;
  return 2.6;
}
function nodeColor(n){
  if(n.type==='org'){
    if(n.o.trade) return '#E8C87A';
    if(n.o.kind==='squad') return '#C4574F';
    if(n.o.kind==='business') return '#7FA98F';
    return factionColor(n.o.factionId);
  }
  if(n.type==='settlement') return '#6E7C99';
  return '#4C5975';
}
function toScreen(n){ return {x:(n.x-gW/2)*gCam.z+gW/2+gCam.x, y:(n.y-gH/2)*gCam.z+gH/2+gCam.y}; }
function drawGraph(){
  if(!graphOpen) return;
  if(!gW || gCanvas.width===0) gSize();
  const orgCount=S.orgs.filter(orgVisible).length;
  if(!gNodes.size || Math.abs(orgCount - gLastOrgCount) > 4){ gLastOrgCount=orgCount; layoutGraph(); }
  relax(); relax();
  gctx.clearRect(0,0,gW,gH);

  let focusSet=null;
  if(gFocus && S.selection && S.selection.type==='org') focusSet=reachable('O'+S.selection.id);

  let drawnEdges=0;
  for(const ge of graphEdges()){
    const e=ge.e;
    if(e.kind!=='ownership' && !edgeVisible(e)) continue;
    const A=gNodes.get(ge.a), B=gNodes.get(ge.b);
    if(!A||!B) continue;
    if(focusSet && (!focusSet.has(ge.a)||!focusSet.has(ge.b))) continue;
    const a=toScreen(A), b=toScreen(B);
    const st=EDGE_STYLE[ge.kind]||EDGE_STYLE.hierarchy;
    gctx.save();
    gctx.strokeStyle = e.visibility==='covert' ? '#8B5FB5' : st.c;
    gctx.lineWidth = st.w*Math.max(0.6,gCam.z);
    gctx.setLineDash(e.visibility==='covert' ? [2,4] : st.dash.map(d=>d*gCam.z));
    gctx.globalAlpha = ge.kind==='ownership'? 0.45 : 0.8;
    gctx.beginPath(); gctx.moveTo(a.x,a.y); gctx.lineTo(b.x,b.y); gctx.stroke();
    if(ge.kind==='alliance'){
      const nx=-(b.y-a.y), ny=(b.x-a.x), l=Math.hypot(nx,ny)||1;
      gctx.lineWidth=1; gctx.globalAlpha=0.55;
      gctx.beginPath();
      gctx.moveTo(a.x+nx/l*3.5, a.y+ny/l*3.5); gctx.lineTo(b.x+nx/l*3.5, b.y+ny/l*3.5);
      gctx.stroke();
    }
    gctx.restore();
    drawnEdges++;
  }
  gctx.font='11px "IBM Plex Mono", monospace';
  let drawnNodes=0;
  for(const n of gNodes.values()){
    if(focusSet && !focusSet.has(n.key)) continue;
    const p=toScreen(n);
    if(p.x<-40||p.x>gW+40||p.y<-30||p.y>gH+30) continue;
    const r=nodeRadius(n)*Math.max(0.7,gCam.z);
    const sel = S.selection && (
      (n.type==='org' && S.selection.type==='org' && S.selection.id===n.o.id) ||
      (n.type==='settlement' && S.selection.type==='settlement' && S.selection.id===n.s.id) ||
      (n.type==='enterprise' && S.selection.type==='enterprise' && S.selection.id===n.e.id));
    const hov = gHover===n;
    gctx.beginPath(); gctx.arc(p.x,p.y,r,0,7);
    gctx.fillStyle=nodeColor(n); gctx.globalAlpha = hov?1:0.92; gctx.fill(); gctx.globalAlpha=1;
    if(n.type==='org' && n.o.kind==='political' && !n.o.parentId){   // independent realm: ringed
      gctx.strokeStyle='#EFE6D2'; gctx.lineWidth=1.2;
      gctx.beginPath(); gctx.arc(p.x,p.y,r+2.5,0,7); gctx.stroke();
    }
    if(sel){ gctx.strokeStyle='#EFE6D2'; gctx.lineWidth=2;
      gctx.beginPath(); gctx.arc(p.x,p.y,r+6,0,7); gctx.stroke(); }
    const label = n.type==='org'? n.o.name : n.type==='settlement'? n.s.name : '';
    const worth = n.type==='org' && (orgPower(n.o)>3 || !n.o.parentId || n.o.trade);
    if(label && (hov||sel||worth||gCam.z>1.5)){
      gctx.fillStyle = hov||sel? '#EFE6D2' : n.type==='org'? '#A9B5CC' : '#6B7897';
      gctx.fillText(label.slice(0,26), p.x+r+5, p.y+4);
    }
    drawnNodes++;
  }
  document.getElementById('gCount').innerHTML=
    '<b style="color:var(--text)">'+drawnNodes+'</b> вузлів · <b style="color:var(--text)">'+drawnEdges+'</b> зв\'язків'+
    '<br><span style="color:#4C5975">колесо — зум · тягни — панорама</span>';
}
/* --- graph interaction --- */
function gPick(cx,cy){
  let best=null,bd=1e9;
  for(const n of gNodes.values()){
    const p=toScreen(n);
    const d=Math.hypot(p.x-cx,p.y-cy);
    const r=nodeRadius(n)*Math.max(0.7,gCam.z)+7;
    if(d<r && d<bd){bd=d;best=n;}
  }
  return best;
}
gCanvas.addEventListener('pointerdown',e=>{
  const r=gCanvas.getBoundingClientRect();
  gDrag={x:e.clientX, y:e.clientY, moved:0, cx:e.clientX-r.left, cy:e.clientY-r.top};
});
gCanvas.addEventListener('pointermove',e=>{
  const r=gCanvas.getBoundingClientRect();
  const cx=e.clientX-r.left, cy=e.clientY-r.top;
  if(gDrag){
    gDrag.moved+=Math.abs(e.clientX-gDrag.x)+Math.abs(e.clientY-gDrag.y);
    gCam.x+=e.clientX-gDrag.x; gCam.y+=e.clientY-gDrag.y;
    gDrag.x=e.clientX; gDrag.y=e.clientY;
    gTip.style.display='none';
    return;
  }
  const n=gPick(cx,cy);
  gHover=n;
  if(!n){ gTip.style.display='none'; return; }
  gTip.style.display='block';
  gTip.style.left=(cx+14)+'px';
  gTip.style.top=(cy+14)+'px';
  if(n.type==='org'){
    const o=n.o;
    const slots=S.edges.filter(x=>x.kind!=='ownership'&&x.kind!=='hierarchy'&&(x.from===o.id||x.to===o.id)).length;
    gTip.innerHTML='<b>'+o.name+'</b><span class="tk">'+o.kind+' · '+LT_LABEL[o.leadershipType]+'</span>'+
      '<span class="tk">скарбниця '+num(o.treasury)+'💰 · сила '+f1(orgPower(o))+'</span>'+
      '<span class="tk">слотів: '+slots+(o.parentId?' · підлеглий':' · незалежний')+'</span>';
  } else if(n.type==='settlement'){
    gTip.innerHTML='<b>'+n.s.name+'</b><span class="tk">'+TIER[n.s.tier].label+' · '+num(n.s.pop)+' осіб</span>';
  } else {
    gTip.innerHTML='<b>'+ENT[n.e.kind].label+'</b><span class="tk">'+stl(n.e.settlementId).name+'</span>';
  }
});
addEventListener('pointerup',()=>{ gDrag=null; });
gCanvas.addEventListener('click',e=>{
  if(gDrag && gDrag.moved>5) return;
  const r=gCanvas.getBoundingClientRect();
  const n=gPick(e.clientX-r.left, e.clientY-r.top);
  if(!n) return;
  if(n.type==='org') select('org', n.o.id);
  else if(n.type==='settlement') select('settlement', n.s.id);
  else select('enterprise', n.e.id);
});
gCanvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const k=e.deltaY<0? 1.12 : 1/1.12;
  gCam.z=Math.max(0.35, Math.min(4, gCam.z*k));
},{passive:false});

function rebuildViewpointOptions(){
  const sel=document.getElementById('gView');
  const cur=sel.value;
  sel.innerHTML='<option value="spectator">Spectator (всевидець)</option>'+
    S.orgs.filter(o=>o.kind==='political' && !o.parentId)
      .map(o=>'<option value="'+o.id+'">'+o.name+'</option>').join('');
  sel.value = [...sel.options].some(o=>o.value===cur)? cur : 'spectator';
  gViewpoint=sel.value;
}

/* view-only filter: one toggle per org kind actually present, canonical order.
   Hiding a kind drops its org nodes (and, via graphEdges, their edges) from the
   drawn graph only — it never touches simulation state. */
const GRAPH_KINDS=['political','business','squad','military','intelligence','network','secret_police','religious'];
function rebuildKindFilter(){
  const box=document.getElementById('gKinds');
  const present=[...new Set(S.orgs.map(o=>o.kind))].sort((a,b)=>{
    const ia=GRAPH_KINDS.indexOf(a), ib=GRAPH_KINDS.indexOf(b);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
  box.innerHTML=present.map(k=>
    '<button class="gKind'+(gHideKinds.has(k)?'':' on')+'" data-kind="'+k+'">'+(KIND_LABEL[k]||k)+'</button>'
  ).join('');
}

/* =====================================================================
   HUD wiring
   ===================================================================== */
function updateHUD(){
  document.getElementById('stYear').textContent = 1+Math.floor(S.tick/40);
  document.getElementById('stOrgs').textContent = S.orgs.length;
  document.getElementById('stSquads').textContent = S.squads.length;
  document.getElementById('stCaravans').textContent = S.caravans.length;
  document.getElementById('stPop').textContent = num(S.settlements.reduce((a,s)=>a+s.pop,0));
}
document.getElementById('btnPause').onclick=e=>{
  S.paused=!S.paused; e.target.textContent=S.paused?'▶':'▮▮';
};
for(const [id,v] of [['spd1',1],['spd3',3],['spd8',8]]){
  document.getElementById(id).onclick=()=>{
    S.speed=v;
    document.querySelectorAll('.spd').forEach(b=>b.classList.remove('on'));
    document.getElementById(id).classList.add('on');
  };
}
function regenerate(seed){
  const ld=document.getElementById('loading');
  ld.style.display='flex';
  setTimeout(()=>{
    generate(seed);
    renderInspector(); renderEcon(); updateHUD();
    ld.style.display='none';
  }, 40);
}
document.getElementById('btnRegen').onclick=()=>{
  regenerate(parseInt(document.getElementById('seedInput').value)||1);
};
document.getElementById('btnTele').onclick=()=>{
  // export JSON (snapshots + event journal + run metadata); console: exportTelemetryCSV() for flat CSV
  const p=teleExport({download:true});
  logEvent('Телеметрію експортовано: <b>'+p.snapshots.length+'</b> знімків, <b>'+p.journal.length+'</b> подій.');
};
document.getElementById('btnGraph').onclick=()=>{
  graphOpen=!graphOpen;
  document.getElementById('graph').style.display=graphOpen?'block':'none';
  document.getElementById('btnGraph').classList.toggle('on',graphOpen);
  if(graphOpen){
    gSize(); gNodes.clear(); gCam={x:0,y:0,z:1};
    rebuildViewpointOptions(); rebuildKindFilter(); drawGraph();
  } else { gTip.style.display='none'; }
};
document.getElementById('gClose').onclick=()=>document.getElementById('btnGraph').click();
document.getElementById('gProp').onclick=e=>{ gShowProp=!gShowProp; e.target.classList.toggle('on',gShowProp); gNodes.clear(); drawGraph(); };
document.getElementById('gBig').onclick=e=>{ gBigOnly=!gBigOnly; e.target.classList.toggle('on',gBigOnly); gNodes.clear(); drawGraph(); };
document.getElementById('gFocus').onclick=e=>{ gFocus=!gFocus; e.target.classList.toggle('on',gFocus); drawGraph(); };
document.getElementById('gView').onchange=e=>{ gViewpoint=e.target.value; drawGraph(); };
document.getElementById('gKinds').addEventListener('click',e=>{
  const b=e.target.closest('button[data-kind]'); if(!b) return;
  const k=b.dataset.kind;
  if(gHideKinds.has(k)) gHideKinds.delete(k); else gHideKinds.add(k);   // view-only, no sim state
  b.classList.toggle('on', !gHideKinds.has(k));
  gNodes.clear(); drawGraph();
});

function buildStartScreen(){
  const card=document.getElementById('startCard');
  const leaders=S.chars.filter(c=>c.ledOrgId && c.alive)
    .map(c=>({c,o:org(c.ledOrgId)}))
    .filter(x=>x.o && (x.o.kind==='political'||x.o.trade))
    .sort((a,b)=>orgPower(b.o)-orgPower(a.o)).slice(0,10);
  card.innerHTML='<h1>NEW <span>LORDS</span></h1>'+
    '<p>Прототип систем: планета, організації, замкнена економіка, каравани. '+
    'Обери персонажа — ти гратимеш за нього, і його організація стане редагованою. '+
    'Решта світу живе своїм життям; ти спостерігаєш і втручаєшся.</p>'+
    leaders.map(x=>'<div class="leader" data-char="'+x.c.id+'">'+
      '<div><div class="lname">'+x.c.name+'</div>'+
      '<div class="lorg">'+x.o.name+' · '+LT_LABEL[x.o.leadershipType]+' · '+
      x.c.traits.join(', ')+'</div></div>'+
      '<div class="stat">сила '+f1(orgPower(x.o))+'</div></div>').join('')+
    '<div style="margin-top:12px;display:flex;gap:8px">'+
    '<button id="obsOnly">Лише спостерігати</button></div>';
  card.querySelectorAll('[data-char]').forEach(el=>{
    el.onclick=()=>setAvatar(+el.dataset.char);
  });
  document.getElementById('obsOnly').onclick=()=>{
    document.getElementById('start').style.display='none';
    rebuildViewpointOptions();
  };
  document.getElementById('start').style.display='flex';
}


export {
  ALT_MAX, ALT_MIN, CAN_HOVER, EDGE_STYLE, GRAPH_KINDS, HOLD_RMB_MS, L, LONG_PRESS_MS, PITCH_MAX, REASSIGNABLE_KINDS, T, TERMS,
  TILT_ALT_MAX, TILT_PITCH_PER_PX, TILT_YAW_PER_PX, _hitV, _invQ, _rc, _sph, allianceCap, allianceEdge, applyOrder, assignPost, breakAlliance,
  breakSlot, buildStartScreen, camAlt, camAltTarget, camPitch, camYaw, cancelTermLP, clearLP, closeOptMenu, controlSlotCap, curOpts, drag,
  dragScale, drawGraph, edgeVisible, f1, flyQ, flyT, flyTo, gBigOnly, gCam, gCanvas, gDrag, gFocus,
  gH, gHideKinds, gHover, gLastOrgCount, gNodes, gPick, gShowProp, gSize, gTip, gViewpoint, gW, gWrap,
  gctx, graphClusterId, graphEdges, graphOpen, hadTouch, head, heldAlliances, heldSlots, hidePin, hoverAt, insp, inspCaravan,
  inspChar, inspEnterprise, inspOrg, inspSettlement, inspSquad, intelReport, isPlayerOrg, issueAttack, issueGarrison, issueMove, layoutGraph, lpFired,
  lpTimer, makeSlot, materializeResident, maybeDismissPin, nearest, nodeColor, nodeRadius, num, openOptMenu, optMenuEl, optMenuOpen, optionsFor,
  orderClusters, orgOptions, orgSpec, orgVisible, pickAt, pickLabel, pinTip, pinnedShown, placeTip, pointInRing, projV, proposeAlliance,
  queueMove, quickCastOrders, reachable, reassignLeader, rebuildKindFilter, rebuildViewpointOptions, regenerate, relax, removePost, renderEcon, renderInspector, renderOptMenu,
  rmb, row, runOpt, sabotage, screenPos, screenToDir, select, selectedControllable, selectedPlayerSquad, setAvatar, showPin, slotEdge,
  spin, squadOptions, standDown, stepCamera, stepFly, tDist, tMidX, tMidY, targetFaction, targetOrg, termHTML, termLPtimer,
  termTip, tip, tipHTML, tmpQ, tmpV, toScreen, touchG, touchRotate, updateCamera, updateHUD,
};
