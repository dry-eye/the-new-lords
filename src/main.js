// New Lords — main.js — bootstrap + wiring: tick orchestration, main loop, window test surface
// Auto-split from new-lords-prototype.html (#65). Entry module; THREE is the global r128.

import { EXPERIENCES, FLAGS, S, STEP, applyExperience, flag } from './state.js';
import { caravanStep, economyStep, teleTick } from './economy.js';
import { generate } from './worldgen.js';
import { orgStep } from './orgs.js';
import { squadStep } from './squads.js';
import { setFrameDt } from './citygen.js';
import { animateMarkers, camera, renderGlobeCache, renderer, scene, updateMarkers } from './render.js';
import { drawGraph, gNodes, gSize, graphOpen, renderEcon, renderInspector, stepCamera, stepFly, updateCamera, updateHUD } from './ui.js';
import * as _state from './state.js';
import * as _economy from './economy.js';
import * as _worldgen from './worldgen.js';
import * as _orgs from './orgs.js';
import * as _squads from './squads.js';
import * as _citygen from './citygen.js';
import * as _render from './render.js';
import * as _ui from './ui.js';

/* =====================================================================
   TICK
   ===================================================================== */
function tick(){
  S.tick++;
  for(const sq of S.squads) sq.prevDir = (sq.rdir||sq.dir).clone();
  for(const cv of S.caravans) cv.prevDir = (cv.rdir||cv.dir).clone();
  economyStep();
  caravanStep();
  orgStep();
  squadStep();
  teleTick();                 // telemetry: sample at a fixed point in tick order (post-sim, pre-render)
  updateMarkers();
  updateHUD();
  if(S.selection) renderInspector();
  renderEcon();
  if(graphOpen) drawGraph();
}

/* =====================================================================
   MAIN LOOP
   ===================================================================== */
let acc=0, last=performance.now(), tickAlpha=0;
function frame(now){
  const dt=Math.min(100, now-last); last=now; setFrameDt(dt);
  if(!S.paused){
    acc+=dt*S.speed;
    let guard=0;
    while(acc>=STEP && guard++<8){ acc-=STEP; tick(); }
    tickAlpha=Math.min(1, acc/STEP);
  }
  stepCamera();
  updateCamera();
  stepFly();
  animateMarkers();
  renderGlobeCache();
  renderer.render(scene,camera);
  if(graphOpen) drawGraph();
  requestAnimationFrame(frame);
}
addEventListener('resize',()=>{
  renderer.setSize(innerWidth,innerHeight);
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  if(graphOpen){ gSize(); gNodes.clear(); drawGraph(); }
});
renderer.setSize(innerWidth,innerHeight);
document.getElementById('loading').style.display='flex';
requestAnimationFrame(()=>setTimeout(()=>{
  generate(1874);
  renderInspector(); renderEcon(); updateHUD();
  document.getElementById('loading').style.display='none';
  requestAnimationFrame(frame);
}, 30));

// ---- window test/debug surface ----
// The original inline script ran in global scope, so every top-level function was a
// window property and page-eval harnesses call them by bare name (generate(seed),
// buildCity, stepWalkers, generatePCGTown, S, TELE, ...). Module scope is not global,
// so re-expose every module's exports on window to preserve that surface exactly.
Object.assign(window, _state, _economy, _worldgen, _orgs, _squads, _citygen, _render, _ui);
Object.assign(window, { tick, frame });
// Experience framework surface — explicit so page-eval verification and future tasks can reach it
// (also covered by the _state spread above; kept explicit to document the public API).
Object.assign(window, { applyExperience, flag, FLAGS, EXPERIENCES });

export {
  acc, frame, last, tick, tickAlpha,
};
