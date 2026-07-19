// New Lords — render.js — THREE.js setup, shaders, camera object, themes, markers, LOD, pawns, selection frame
// Auto-split from new-lords-prototype.html (#65). THREE is the global from the classic r128 script.

import { ENT, RES, S, byId, chr, ent, org, sqd, stl } from './state.js';
import { NSEED, SEA, WARP, elevation, moistureAt, placeOutdoorEnterprise, tempAt, terrainColor, terrainColorTech } from './worldgen.js';
import { slerp } from './squads.js';
import { buildCity, cityRng, frameDtMs, stepWalkers } from './citygen.js';
import { tickAlpha } from './main.js';

let cityCache=new Map(), cityLive=new Set();  // city render cache (#65: split from frameDtMs decl)

/* =====================================================================
   THREE.JS SCENE — icon-based map, trackball planet, smooth markers
   ===================================================================== */
const canvas=document.getElementById('scene');
const renderer=new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x070A11);
const camera=new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.005, 100);
let camDist=3.2;   // derived from camAlt each frame
const root=new THREE.Group(); scene.add(root);   // the planet spins, the camera doesn't
scene.add(new THREE.AmbientLight(0x8CA4CC, 0.62));
const sun=new THREE.DirectionalLight(0xFFF3DA, 0.95); sun.position.set(0.4,0.5,1); scene.add(sun);

let planet, roadLines, roadMat, markerGroup, atmoMesh, vGlobe=null;
let globeScene=null, globeRT=null, bgMesh=null, globeDirty=true, _gKey='';
let selFrame=null, bracketTex=null;   // #49 — one shared corner-bracket selection frame

/* ---------- icon atlas: every object type gets a drawn glyph ---------- */
const ICONS={};
const ICON_URL={};
function iconTexture(draw, size=96){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=c.getContext('2d');
  x.lineCap='round'; x.lineJoin='round';
  // A2 "printed" style: fill light-grey so the faction sprite-tint reads as a muted
  // colour, then a thin dark contour on top — cartographic, not a heavy solid block.
  x.strokeStyle='#D8D8D8'; x.fillStyle='#D8D8D8';
  x.translate(size/2,size/2);
  draw(x, size/2);
  const t=new THREE.CanvasTexture(c);
  t.minFilter=THREE.LinearFilter;
  t._url=c.toDataURL();
  return t;
}
function outline(x,fn,w){          // thin dark contour (A2 printed look), not a wide halo
  x.save(); x.strokeStyle='rgba(14,18,26,.92)'; x.lineWidth=(w?Math.min(w,5):5); fn(x); x.restore();
}
function buildIcons(){
  // ---- settlements, by tier: silhouette says how big the place is ----
  ICONS.megalopolis=iconTexture((x,r)=>{
    const towers=[[-26,-6,14,40],[-8,-26,16,60],[10,-14,14,48],[26,-2,12,36]];
    const path=x=>{x.beginPath();for(const[t,ty,w,h]of towers)x.rect(t-w/2,ty,w,h);x.closePath();};
    outline(x,xx=>{path(xx);xx.stroke();},10);
    path(x); x.fill();
    x.fillStyle='#0A0E17';
    for(const[t,ty,w,h]of towers){for(let i=0;i<3;i++)x.fillRect(t-3,ty+7+i*11,6,5);}
  });
  ICONS.city=iconTexture((x,r)=>{
    const path=x=>{x.beginPath();
      x.moveTo(-28,34); x.lineTo(-28,-8); x.lineTo(-20,-8); x.lineTo(-20,-18);
      x.lineTo(-10,-18); x.lineTo(-10,-8); x.lineTo(0,-8); x.lineTo(0,-24);
      x.lineTo(12,-24); x.lineTo(12,-8); x.lineTo(22,-8); x.lineTo(22,-16);
      x.lineTo(30,-16); x.lineTo(30,34); x.closePath();};
    outline(x,xx=>{path(xx);xx.stroke();},10);
    path(x); x.fill();
    x.fillStyle='#0A0E17';
    x.fillRect(-22,4,7,7); x.fillRect(-6,4,7,7); x.fillRect(12,4,7,7); x.fillRect(-6,18,7,10);
  });
  ICONS.village=iconTexture((x,r)=>{
    const path=x=>{x.beginPath();
      x.moveTo(-30,4); x.lineTo(-14,-16); x.lineTo(2,4); x.lineTo(2,26); x.lineTo(-30,26); x.closePath();
      x.moveTo(4,10); x.lineTo(18,-6); x.lineTo(32,10); x.lineTo(32,26); x.lineTo(4,26); x.closePath();};
    outline(x,xx=>{path(xx);xx.stroke();},9);
    path(x); x.fill();
    x.fillStyle='#0A0E17'; x.fillRect(-19,10,8,10); x.fillRect(14,14,8,8);
  });
  ICONS.camp=iconTexture((x,r)=>{
    const path=x=>{x.beginPath(); x.moveTo(0,-24); x.lineTo(26,24); x.lineTo(-26,24); x.closePath();};
    outline(x,xx=>{path(xx);xx.stroke();},9);
    path(x); x.fill();
    x.fillStyle='#0A0E17'; x.beginPath(); x.moveTo(0,-4); x.lineTo(9,24); x.lineTo(-9,24); x.closePath(); x.fill();
  });
  // ---- enterprises: the tool of the trade ----
  ICONS.farm=iconTexture((x)=>{
    const path=x=>{x.beginPath();
      x.moveTo(0,26); x.lineTo(0,-10);
      for(let i=0;i<3;i++){const y=-10+i*11; x.moveTo(0,y); x.lineTo(-15,y-9); x.moveTo(0,y); x.lineTo(15,y-9);} };
    x.lineWidth=7; outline(x,xx=>{xx.lineWidth=13;path(xx);xx.stroke();});
    path(x); x.stroke();
  });
  ICONS.lumber=iconTexture((x)=>{
    const tree=x=>{x.beginPath(); x.moveTo(0,-26); x.lineTo(17,-2); x.lineTo(-17,-2); x.closePath();
      x.moveTo(0,-12); x.lineTo(21,16); x.lineTo(-21,16); x.closePath();};
    outline(x,xx=>{tree(xx);xx.stroke();},9);
    tree(x); x.fill();
    x.fillRect(-4,14,8,14);
  });
  ICONS.mine=iconTexture((x)=>{
    const pick=x=>{x.beginPath(); x.moveTo(-24,-14); x.quadraticCurveTo(0,-30,24,-14);
      x.moveTo(0,-22); x.lineTo(0,26);};
    x.lineWidth=8; outline(x,xx=>{xx.lineWidth=14;pick(xx);xx.stroke();});
    pick(x); x.stroke();
  });
  ICONS.forge=iconTexture((x)=>{
    const anvil=x=>{x.beginPath();
      x.moveTo(-26,-10); x.lineTo(22,-10); x.lineTo(26,0); x.lineTo(6,2);
      x.lineTo(4,14); x.lineTo(16,26); x.lineTo(-16,26); x.lineTo(-6,14); x.lineTo(-8,2);
      x.lineTo(-26,0); x.closePath();};
    outline(x,xx=>{anvil(xx);xx.stroke();},9);
    anvil(x); x.fill();
  });
  ICONS.workshop=iconTexture((x)=>{
    const gear=x=>{x.beginPath();
      for(let i=0;i<8;i++){const a=i/8*Math.PI*2, b=a+Math.PI/16;
        x.lineTo(Math.cos(a)*28, Math.sin(a)*28); x.lineTo(Math.cos(b)*28, Math.sin(b)*28);
        const c=b+Math.PI/16; x.lineTo(Math.cos(c)*19, Math.sin(c)*19);
        const d=c+Math.PI/16; x.lineTo(Math.cos(d)*19, Math.sin(d)*19);}
      x.closePath();};
    outline(x,xx=>{gear(xx);xx.stroke();},9);
    gear(x); x.fill();
    x.globalCompositeOperation='destination-out';
    x.beginPath(); x.arc(0,0,9,0,7); x.fill();
  });
  ICONS.armory=iconTexture((x)=>{
    const sword=x=>{x.beginPath();
      x.moveTo(0,-28); x.lineTo(7,-12); x.lineTo(7,10); x.lineTo(-7,10); x.lineTo(-7,-12); x.closePath();
      x.moveTo(-18,12); x.lineTo(18,12); x.lineTo(18,18); x.lineTo(-18,18); x.closePath();
      x.moveTo(-4,18); x.lineTo(4,18); x.lineTo(4,28); x.lineTo(-4,28); x.closePath();};
    outline(x,xx=>{sword(xx);xx.stroke();},9);
    sword(x); x.fill();
  });
  // ---- units ----
  ICONS.squad=iconTexture((x)=>{
    const shield=x=>{x.beginPath(); x.moveTo(0,-28); x.lineTo(24,-18); x.lineTo(24,4);
      x.quadraticCurveTo(24,22,0,30); x.quadraticCurveTo(-24,22,-24,4); x.lineTo(-24,-18); x.closePath();};
    outline(x,xx=>{shield(xx);xx.stroke();},9);
    shield(x); x.fill();
    x.fillStyle='#0A0E17';
    x.beginPath(); x.moveTo(0,-14); x.lineTo(13,10); x.lineTo(0,3); x.lineTo(-13,10); x.closePath(); x.fill();
  });
  ICONS.caravan=iconTexture((x)=>{
    const cart=x=>{x.beginPath(); x.rect(-24,-16,44,20);
      x.moveTo(-10,14); x.arc(-14,14,9,0,7); x.moveTo(20,14); x.arc(16,14,9,0,7);};
    outline(x,xx=>{cart(xx);xx.stroke();},9);
    x.beginPath(); x.rect(-24,-16,44,20); x.fill();
    x.beginPath(); x.arc(-14,14,9,0,7); x.fill();
    x.beginPath(); x.arc(16,14,9,0,7); x.fill();
    x.fillStyle='#0A0E17';
    x.beginPath(); x.arc(-14,14,3.5,0,7); x.fill();
    x.beginPath(); x.arc(16,14,3.5,0,7); x.fill();
  });
  ICONS.person=iconTexture((x)=>{
    const p=x=>{x.beginPath(); x.arc(0,-14,10,0,7); x.closePath();
      x.moveTo(-14,28); x.quadraticCurveTo(0,-4,14,28); x.closePath();};
    outline(x,xx=>{p(xx);xx.stroke();},9);
    p(x); x.fill();
  });
}
buildIcons();

/* ===== Visual themes — one switch restyles UI + icons + planet together (DESIGN.md) ===== */
const THEMES = {
  map: {   // light cartographic — the vector topo globe in parchment
    label:'Мапа',
    ui:{ '--ink':'#0A0D14','--panel':'#131824','--panel-2':'#0D1220','--rule':'#2A3346',
         '--text':'#D2D8E4','--dim':'#828EA4','--brass':'#C89B3C','--brass-dim':'#8A6C2C',
         '--good':'#5FB58A','--bad':'#C4574F','--covert':'#8B5FB5',
         '--serif':"'Spectral',Iowan Old Style,Palatino,serif" },
    bg:0x0B0F17, atmo:0x2E4258, road:0x5A4A30, iconAccent:0x3A2E1C,
    globePal:0, holo:0, tint:[0.20,0.33,0.52],     // dark ink road/icons read on the light globe
    lbl:{ big:'#2A2214', small:'#514732' },
    legendFilter:'invert(20%) sepia(30%) saturate(500%) hue-rotate(5deg)',
  },
  night: {  // dark monochrome — the same globe as a glowing night chart
    label:'Ніч',
    ui:{ '--ink':'#06080E','--panel':'#0C121C','--panel-2':'#080D16','--rule':'#1E2A3A',
         '--text':'#C2D0E2','--dim':'#6E7E95','--brass':'#93AAC4','--brass-dim':'#5E7085',
         '--good':'#5FB58A','--bad':'#C4574F','--covert':'#8B5FB5',
         '--serif':"'Spectral',Iowan Old Style,Palatino,serif" },
    bg:0x05070C, atmo:0x2A4460, road:0x93A6BE, iconAccent:0xB6C6DC,
    globePal:1, holo:0, tint:[0.40,0.60,0.80],      // light road/icons read on the dark globe
    lbl:{ big:'#D3E1F2', small:'#93A4BC' },
    legendFilter:'invert(82%) sepia(10%) saturate(400%) hue-rotate(180deg)',
  },
};
let THEME_NAME = 'map';
try { const s=localStorage.getItem('nl_theme'); if(s && THEMES[s]) THEME_NAME=s; } catch(e){}
let THEME = THEMES[THEME_NAME];

function applyTheme(name){
  if(!THEMES[name]) name='map';
  THEME_NAME=name; THEME=THEMES[name];
  const rs=document.documentElement.style;
  for(const k in THEME.ui) rs.setProperty(k, THEME.ui[k]);
  if(scene && scene.background) scene.background.set(THEME.bg);
  if(planet && planet.material && planet.material.uniforms.uHolo){
    planet.material.uniforms.uHolo.value = THEME.holo;
    planet.material.uniforms.uTint.value.setRGB(THEME.tint[0],THEME.tint[1],THEME.tint[2]);
    // swap in this theme's baked terrain texture — the planet is re-rendered
    // (technical scan vs relief map), not just re-tinted (Visual themes, DESIGN.md)
    if(planet._terrainTex) planet.material.uniforms.map.value = planet._terrainTex[name] || planet._terrainTex.antique;
  }
  if(vGlobe && vGlobe.material.uniforms.uPal){ vGlobe.material.uniforms.uPal.value = THEME.globePal||0; globeDirty=true; }
  if(atmoMesh) atmoMesh.material.color.set(THEME.atmo);
  if(roadMat) roadMat.uniforms.tint.value.set(THEME.road);
  if(selFrame) selFrame.material.color.set(THEME.iconAccent);   // #49 — selection frame tracks the theme accent
  for(const st of (S.settlements||[])){
    if(st._label && st._label.material) st._label.material.color.set(THEME.lbl[st._label._big?'big':'small']);
  }
  if(typeof buildIconLegend==='function') buildIconLegend();   // legend glyph tint follows the theme
  if(S.settlements.length) updateMarkers();
  const b=document.getElementById('btnTheme'); if(b) b.textContent='Тема: '+THEME.label;
  try{ localStorage.setItem('nl_theme', name); }catch(e){}
}
function toggleTheme(){ applyTheme(THEME_NAME==='map'?'night':'map'); }
document.getElementById('btnTheme').onclick=toggleTheme;
addEventListener('keydown',e=>{
  const tag=(e.target&&e.target.tagName)||'';
  if((e.key==='y'||e.key==='Y') && tag!=='INPUT' && tag!=='TEXTAREA') toggleTheme();
});
applyTheme(THEME_NAME);

/* on-map key: what each icon means */
function buildIconLegend(){
  const rows=[
    ['megalopolis','Мегаполіс'],['city','Місто'],['village','Село'],['camp','Табір'],
    ['squad','Загін'],['caravan','Караван'],
    ['farm','Ферма'],['lumber','Лісопилка'],['mine','Шахта'],
    ['forge','Кузня'],['workshop','Майстерня'],['armory','Збройня'],
    ['person','Мешканець'],
  ];
  document.getElementById('keymap').innerHTML =
    '<div style="color:var(--brass);letter-spacing:.14em;font-size:9px;margin-bottom:5px">ЛЕГЕНДА</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">'+
    rows.map(([k,l])=>'<div><img src="'+ICONS[k]._url+'" width="13" height="13" '+
      'style="vertical-align:-2px;margin-right:5px;filter:'+THEME.legendFilter+'">'+l+'</div>').join('')+
    '</div><div style="margin-top:5px;color:#4C5975">колір іконки = фракція-власник<br>'+
    'на близькому зумі місто виростає: вулиці, будинки, мешканці</div>';
}
buildIconLegend();

function labelTexture(text, big){
  const pad=10, fs=big?30:24;
  const c=document.createElement('canvas');
  const x0=c.getContext('2d');
  x0.font=(big?'600 ':'400 ')+fs+'px IBM Plex Mono, monospace';
  const w=Math.ceil(x0.measureText(text).width)+pad*2;
  c.width=w; c.height=fs+pad*2;
  const x=c.getContext('2d');
  x.font=(big?'600 ':'400 ')+fs+'px IBM Plex Mono, monospace';
  x.textBaseline='middle';
  x.lineWidth=6; x.strokeStyle='rgba(6,9,15,.92)';
  x.strokeText(text, pad, c.height/2);
  x.fillStyle='#FFFFFF';                 // baked white; per-theme colour is applied as the sprite tint
  x.fillText(text, pad, c.height/2);
  const t=new THREE.CanvasTexture(c);
  t.minFilter=THREE.LinearFilter;
  return {tex:t, aspect:c.width/c.height};
}

/* markers are screen-space sprites: always the same readable size */
function makeSprite(tex, size, color){
  const m=new THREE.Sprite(new THREE.SpriteMaterial({
    map:tex, color:color||0xffffff, sizeAttenuation:false,
    depthTest:false, depthWrite:false, transparent:true}));
  m.scale.set(size,size,1);
  m.renderOrder=10;
  return m;
}
/* #49 — universal selection frame: four corner brackets, drawn once in white on a
   transparent field (reusing iconTexture, which centres the context and gives a dark
   halo helper) so a single sprite can be recoloured per-theme via material.color and
   scaled to hug whichever marker is selected. Selection = this frame, never icon scale. */
function makeBracketTexture(){
  return iconTexture((x,r)=>{
    const e=r*0.82, a=r*0.42, lw=Math.max(3, r*0.11);
    const seg=xx=>{ xx.beginPath();
      xx.moveTo(-e+a,-e); xx.lineTo(-e,-e); xx.lineTo(-e,-e+a);   // top-left corner
      xx.moveTo( e-a,-e); xx.lineTo( e,-e); xx.lineTo( e,-e+a);   // top-right corner
      xx.moveTo( e-a, e); xx.lineTo( e, e); xx.lineTo( e, e-a);   // bottom-right corner
      xx.moveTo(-e+a, e); xx.lineTo(-e, e); xx.lineTo(-e, e-a); };  // bottom-left corner
    outline(x, xx=>{ seg(xx); xx.stroke(); }, lw+6);               // dark halo so brackets read over terrain
    x.lineWidth=lw; seg(x); x.stroke();
  }, 128);
}

/* ---------- settlement territory footprint ---------------------------------
   An organic outline drawn on the sphere around each settlement: a circle
   perturbed by a few low harmonics, seeded from the settlement (cityRng) so the
   shape is irregular-but-smooth and fully deterministic — worldgen stays
   reproducible / region-local. Bigger tiers get a wider outline, and the whole
   enclosed area becomes the settlement's click / hover target (see pointInRing). */
const FOOT_R = {camp:0.030, village:0.042, city:0.058, megalopolis:0.075};
// Every screen-space marker, pawn, footprint ring and road used to hug a fixed 1.03–1.045
// shell — so on a zoomed or limb-on view they visibly floated off the globe. They now all sit
// on ONE low shell just above the surface. Picking (screenPos's default r) reads this SAME
// value, so a hit target stays locked under its drawn icon at every zoom. Cat-head walkers are
// the exception: they ride the real city surface at their own radius (handled in stepWalkers).
const MARK_R = 1.005;
let footMats=[];
function footprintRing(st){
  const rr=cityRng(st);
  const base=FOOT_R[st.tier]||0.042;
  const harm=[];                                   // low freqs → gentle lobes, not spikes
  for(let h=0;h<3;h++) harm.push({f:2+h, ph:rr()*Math.PI*2, a:(0.13/(h+1))*(0.5+rr()*0.8)});
  const up=st.dir.clone();
  const ref=Math.abs(up.y)>0.9? new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
  const tan=ref.clone().cross(up).normalize();
  const bit=up.clone().cross(tan).normalize();
  const N=44, ring=[];
  for(let k=0;k<N;k++){
    const th=k/N*Math.PI*2;
    let r=1; for(const w of harm) r+=w.a*Math.sin(w.f*th+w.ph);
    const rad=base*Math.max(0.55,r);
    ring.push(up.clone()
      .add(tan.clone().multiplyScalar(Math.cos(th)*rad))
      .add(bit.clone().multiplyScalar(Math.sin(th)*rad)).normalize());
  }
  return ring;
}
/* same on-sphere-line trick the roads use: discard the far hemisphere in-shader
   (plain depth can't be trusted for a line hugging the surface at grazing angles). */
function makeFootprintMat(){
  const m=new THREE.ShaderMaterial({
    uniforms:{ horizon:{value:0.3}, camNrm:{value:new THREE.Vector3(0,0,1)}, tint:{value:new THREE.Color(0x8894AC)}, alpha:{value:0.4} },
    transparent:true, depthWrite:false, depthTest:false,
    vertexShader:`
      varying vec3 vW;
      void main(){
        vW = normalize((modelMatrix * vec4(position,1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader:`
      uniform float horizon; uniform vec3 camNrm; uniform vec3 tint; uniform float alpha;
      varying vec3 vW;
      void main(){
        float d = dot(vW, camNrm);              // limb along the (possibly tilted) camera axis
        if(d < horizon) discard;
        float fade = smoothstep(horizon, horizon+0.12, d);
        gl_FragColor = vec4(tint, alpha*fade);
      }`,
  });
  footMats.push(m);
  return m;
}

/* ---------- pick registry: screen-space picking, exact and cheap ---------- */
let picks=[];   // {type,id,dir,px,ring} — px is the icon radius, ring the footprint

/* =====================================================================
   VECTOR GLOBE — analytic ray-cast planet (replaces texture-on-mesh).
   Everything is computed per-pixel in a GLSL3 fragment shader, so the
   coastline is a math curve (crisp/vector at any zoom) and the ocean is
   flat — no texel steps, no mesh facets. The elevation/climate field is
   an exact GLSL port of the JS functions, so shader land matches the JS
   world (settlements sit on real coastlines). Full-screen triangle in
   clip space; the JS world rotation is fed in as uInvRot so continents
   spin with the existing camera controls. =========================== */
const VGLOBE_VS = `in vec3 position; out vec2 vNdc;
void main(){ vNdc=position.xy; gl_Position=vec4(position.xy, 1.0, 1.0); }`;
const VGLOBE_FS = `precision highp float; precision highp int;
uniform mat4 uInvVP; uniform vec3 uCamPos; uniform mat3 uInvRot;
uniform float uSEA; uniform vec3 uWARP; uniform int uNSEED; uniform int uForestStyle; uniform int uPal;
in vec2 vNdc; out vec4 outColor;
uint hash3u(int i,int j,int k){
  uint n=uint(i)*374761393u+uint(j)*668265263u+uint(k)*1274126177u+uint(uNSEED)*2654435761u;
  n=(n^(n>>13u))*1274126177u; return (n^(n>>16u)); }
float h3(int i,int j,int k){ return float(hash3u(i,j,k))/4294967296.0; }
float fade(float t){ return t*t*(3.0-2.0*t); }
float vnoise(vec3 p){
  int xi=int(floor(p.x)),yi=int(floor(p.y)),zi=int(floor(p.z));
  float xf=p.x-float(xi),yf=p.y-float(yi),zf=p.z-float(zi);
  float u=fade(xf),v=fade(yf),w=fade(zf);
  float c000=h3(xi,yi,zi),c100=h3(xi+1,yi,zi),c010=h3(xi,yi+1,zi),c110=h3(xi+1,yi+1,zi);
  float c001=h3(xi,yi,zi+1),c101=h3(xi+1,yi,zi+1),c011=h3(xi,yi+1,zi+1),c111=h3(xi+1,yi+1,zi+1);
  float x00=c000+(c100-c000)*u,x10=c010+(c110-c010)*u,x01=c001+(c101-c001)*u,x11=c011+(c111-c011)*u;
  float y0=x00+(x10-x00)*v,y1=x01+(x11-x01)*v; return (y0+(y1-y0)*w)*2.0-1.0; }
float fbm(vec3 p,int oct,float lac,float gain){
  float a=1.0,f=1.0,s=0.0,nm=0.0;
  for(int i=0;i<8;i++){ if(i>=oct)break;
    s+=a*vnoise(vec3(p.x*f+float(i)*17.3,p.y*f-float(i)*29.1,p.z*f+float(i)*41.7)); nm+=a; a*=gain; f*=lac; }
  return s/nm; }
float ridge(vec3 p,int oct){
  float a=0.6,f=1.0,s=0.0;
  for(int i=0;i<8;i++){ if(i>=oct)break;
    float n=1.0-abs(vnoise(vec3(p.x*f+float(i)*7.7,p.y*f+float(i)*13.3,p.z*f-float(i)*5.1))); s+=a*n*n; a*=0.5; f*=2.05; }
  return s; }
float sm01(float v,float a,float b){ float t=clamp((v-a)/(b-a),0.0,1.0); return t*t*(3.0-2.0*t); }
float elevation(vec3 p){
  vec3 W=uWARP;
  float wx=fbm(vec3(p.x*1.7+W.x,p.y*1.7+W.y,p.z*1.7+W.z),3,2.0,0.5);
  float wy=fbm(vec3(p.x*1.7+W.y,p.y*1.7+W.z,p.z*1.7+W.x),3,2.0,0.5);
  float q=0.42; vec3 c=vec3(p.x*1.25+wx*q,p.y*1.25+wy*q,p.z*1.25+(wx-wy)*q*0.5);
  float base=fbm(c,6,2.1,0.52); base=base*0.85+0.14*fbm(c*3.1,3,2.2,0.5);
  float land=base-uSEA; if(land<=0.0) return land*0.85;
  float belt=max(0.0,ridge(c*2.3,4)-0.42); float mtn=belt*sm01(land,0.02,0.30)*1.35;
  return land*0.9+mtn; }
float moistureAt(vec3 p){ return fbm(vec3(p.x*2.4+11.3,p.y*2.4-7.9,p.z*2.4+3.1),4,2.1,0.55)*0.5+0.5; }
float tempAt(vec3 p,float e){ float lat=abs(p.y);
  return clamp(1.06-lat*1.28-max(0.0,e)*0.85+fbm(vec3(p.x*1.6-21.7,p.y*1.6+5.5,p.z*1.6-9.9),2,2.0,0.5)*0.10,0.0,1.0); }
int zoneId(vec3 p,float e){ if(e<=0.0)return 0; if(e>0.34)return 3;
  float t=tempAt(p,e),m=moistureAt(p);
  if(t<0.13) return 5;                // tundra
  if(t>0.52&&m>0.60) return 6;        // jungle (dense forest)
  if(t>0.52&&m<0.40) return 4;        // desert
  if(m>0.48&&t>0.20) return 2;        // forest
  return 1; }                         // plain
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float sdSeg(vec2 p,vec2 a,vec2 b){ vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
float forestInk(vec2 f,vec2 cell,int style){
  if(style==3) return 0.0;                                                                        // tint only — no glyphs
  if(hash21(cell)>0.72) return 0.0;
  float cx=0.5+(hash21(cell+3.1)-0.5)*0.42, cy=0.5+(hash21(cell+1.9)-0.5)*0.30;
  vec2 c=vec2(cx,cy); float dd=length(f-c);
  if(style==0){ float r=0.18+0.05*hash21(cell+7.7); return smoothstep(0.045,0.0,abs(dd-r)); }     // crown ring (circle)
  if(style==1){ return smoothstep(0.10,0.045,dd); }                                               // small filled dot (stipple)
  float r=0.19; return smoothstep(0.05,0.0,abs(dd-r))*smoothstep(-0.03,0.04,f.y-c.y);             // deciduous arc (upper ∩)
}
float desertDot(vec2 uv){ vec2 dom=vec2(uv.x*2.0,uv.y)*120.0; vec2 cell=floor(dom),f=fract(dom)-0.5;
  if(hash21(cell+1.7)>0.72)return 0.0; vec2 j=(vec2(hash21(cell+2.3),hash21(cell+5.9))-0.5)*0.5;
  return smoothstep(0.17,0.08,length(f-j)); }
float plainFurrow(vec2 uv){ float dr=fbm(vec3(uv*7.0,3.0),3,2.0,0.5);
  float y=uv.y*150.0+sin(uv.x*70.0)*0.6+dr*2.6; float fr=fract(y),ld=min(fr,1.0-fr); return smoothstep(0.12,0.0,ld)*0.7; }
void main(){
  vec4 far=uInvVP*vec4(vNdc,1.0,1.0); far/=far.w;
  vec3 rd=normalize(far.xyz-uCamPos), ro=uCamPos;
  float b=dot(ro,rd), c=dot(ro,ro)-1.0, disc=b*b-c;
  if(disc<0.0) discard;
  float t=-b-sqrt(disc); if(t<0.0) discard;
  vec3 wHit=ro+rd*t; vec3 d=normalize(uInvRot*wHit);
  float e=elevation(d);
  float aa=max(fwidth(e),1e-4);
  float land=smoothstep(-aa,aa,e), coast=smoothstep(2.5*aa,0.0,abs(e));
  vec3 ocean, landC, lineC; float tintScale;
  if(uPal==1){ ocean=vec3(0.055,0.085,0.125); landC=vec3(0.20,0.23,0.27); lineC=vec3(0.60,0.68,0.78); tintScale=0.5; } // dark monochrome
  else { ocean=vec3(0.55,0.62,0.66); landC=vec3(0.86,0.81,0.66); lineC=vec3(0.24,0.19,0.13); tintScale=1.0; }         // light parchment
  float bk=e*26.0; float bm=min(fract(bk),1.0-fract(bk)); float bw=fwidth(bk);
  float bathy=smoothstep(bw*1.3,0.0,bm)*step(e,0.0);
  float hk=e*20.0; float hm=min(fract(hk),1.0-fract(hk)); float hw=fwidth(hk);
  float isoh=smoothstep(hw*1.3,0.0,hm)*step(0.0,e);
  int z=zoneId(d,e);
  vec2 suv=vec2(atan(d.z,d.x)/6.2831853+0.5, asin(clamp(d.y,-1.0,1.0))/3.14159265+0.5);
  vec2 dom=vec2(suv.x*2.0,suv.y)*82.0; vec2 cell=floor(dom),fcell=fract(dom);
  vec3 shift=vec3(0.0);                                        // biome tint as offset from landC (works in both palettes)
  if(z==2) shift=vec3(-0.16,-0.02,-0.22);                     // forest — greener
  else if(z==6) shift=vec3(-0.42,-0.20,-0.40);               // jungle — deep green
  else if(z==5) shift=vec3(0.02,0.06,0.14);                  // tundra — cool light
  else if(z==4) shift=vec3(0.10,0.01,-0.16);                 // desert — warm
  else if(z==3) shift=vec3(-0.05,-0.04,-0.03);               // mountain — slightly darker
  vec3 tint=clamp(landC+shift*tintScale, 0.0, 1.0);
  float motif=0.0;
  if(uForestStyle<=2){                                        // legacy glyph experiments
    if(z==2) motif=forestInk(fcell,cell,uForestStyle);
    else if(z==4) motif=desertDot(suv);
    else if(z==1) motif=plainFurrow(suv);
  }
  // zone-as-shape borders (derivative of the zone mask → ~1px line, zoom-independent)
  float zborder=0.0;
  if(uForestStyle==4){ float fm=(z==2)?1.0:0.0; zborder=clamp(fwidth(fm)*1.3,0.0,1.0); }      // forest zone only
  else if(uForestStyle==5){ zborder=clamp(fwidth(float(z))*1.3,0.0,1.0); }                    // every biome zone
  vec3 col=mix(ocean,tint,land);
  col=mix(col,mix(ocean,lineC,0.5),bathy*0.30*(1.0-land));    // fainter isobaths
  col=mix(col,lineC,isoh*0.26*land);                          // fainter land contours
  vec3 motifCol=(z==2)?vec3(0.16,0.30,0.15):lineC;
  col=mix(col,motifCol,motif*0.62*land);                      // softer, less attention-grabbing motifs
  col=mix(col,lineC,zborder*0.6*land);                        // zone boundary ink
  col=mix(col,lineC,coast);
  outColor=vec4(col,1.0); }`;
/* Planet cache — the heavy globe shader renders to an offscreen target ONLY when
   the camera or world rotation actually change; every frame just blits that cached
   texture (a couple of instructions). A static view costs ~nothing, so the planet
   can no longer pin/overheat the GPU. vGlobe & cache globals are hoisted above so
   applyTheme() can touch them before buildScene runs. */
function _tri(){ const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0],3)); return g; }
function buildVectorGlobe(){
  if(vGlobe){ globeScene.remove(vGlobe); vGlobe.geometry.dispose(); vGlobe.material.dispose(); vGlobe=null; }
  const mat=new THREE.RawShaderMaterial({
    glslVersion:THREE.GLSL3, depthTest:false, depthWrite:false,
    uniforms:{ uInvVP:{value:new THREE.Matrix4()}, uCamPos:{value:new THREE.Vector3()},
      uInvRot:{value:new THREE.Matrix3()}, uSEA:{value:SEA},
      uWARP:{value:new THREE.Vector3(WARP.x,WARP.y,WARP.z)}, uNSEED:{value:NSEED}, uForestStyle:{value:3}, uPal:{value:(THEME.globePal||0)} },
    vertexShader:VGLOBE_VS, fragmentShader:VGLOBE_FS });
  vGlobe=new THREE.Mesh(_tri(),mat); vGlobe.frustumCulled=false;
  if(!globeScene) globeScene=new THREE.Scene();
  globeScene.add(vGlobe);
  if(!globeRT) globeRT=new THREE.WebGLRenderTarget(2,2,{minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, depthBuffer:false});
  if(!bgMesh){
    const bmat=new THREE.RawShaderMaterial({ glslVersion:THREE.GLSL3, depthTest:false, depthWrite:false,
      uniforms:{ tex:{value:globeRT.texture}, res:{value:new THREE.Vector2(2,2)} },
      vertexShader:'in vec3 position; void main(){ gl_Position=vec4(position.xy,1.0,1.0); }',
      fragmentShader:'precision highp float; uniform sampler2D tex; uniform vec2 res; out vec4 o; void main(){ o=texture(tex, gl_FragCoord.xy/res); }' });
    bgMesh=new THREE.Mesh(_tri(),bmat); bgMesh.frustumCulled=false; bgMesh.renderOrder=-10; scene.add(bgMesh);
  }
  bgMesh.material.uniforms.tex.value=globeRT.texture;
  globeDirty=true;
}
function updateGlobeUniforms(){
  if(!vGlobe) return;
  camera.updateMatrixWorld(); root.updateMatrixWorld();
  const u=vGlobe.material.uniforms;
  const vp=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  u.uInvVP.value.copy(vp).invert();
  u.uCamPos.value.copy(camera.position);
  u.uInvRot.value.setFromMatrix4(root.matrixWorld).transpose();
  u.uSEA.value=SEA; u.uWARP.value.set(WARP.x,WARP.y,WARP.z); u.uNSEED.value=NSEED;
}
function renderGlobeCache(){
  if(!vGlobe||!globeRT) return;
  const sz=renderer.getDrawingBufferSize(new THREE.Vector2());
  if(globeRT.width!==sz.x || globeRT.height!==sz.y){ globeRT.setSize(sz.x,sz.y); bgMesh.material.uniforms.res.value.set(sz.x,sz.y); globeDirty=true; }
  camera.updateMatrixWorld(); root.updateMatrixWorld();
  const k=camera.matrixWorldInverse.elements.join(',')+'|'+root.matrixWorld.elements.slice(0,11).join(',')+'|'+vGlobe.material.uniforms.uPal.value;
  if(k!==_gKey){ _gKey=k; globeDirty=true; }
  if(!globeDirty) return;                                  // static view → reuse the cached texture, zero shader work
  updateGlobeUniforms();
  const prev=renderer.getRenderTarget();
  renderer.setRenderTarget(globeRT);
  renderer.render(globeScene, camera);
  renderer.setRenderTarget(prev);
  globeDirty=false;
}

function buildScene(){
  root.clear(); picks=[]; footMats=[]; pawnBuiltFor=null; pawnSprites=[]; pawnPositions=[];
  cityCache=new Map(); cityLive=new Set(); squadPawnCache=new Map();

  /* --- planet: relief mesh + baked climate texture + per-pixel shader --- */
  /* Planet texture — baked once per world, once per theme. The elevation field is
     evaluated a single time per texel and handed to each theme's colouring, so the
     antique relief map and the sci-fi technical scan come out of one shared pass
     (the packed height in alpha is identical, so the shader's bump/coast logic works
     for both). The active theme's texture is bound now; switching swaps to the other
     without a rebake (see applyTheme / Visual themes, DESIGN.md). */
  const TEX_W=1536, TEX_H=768;
  const mkCanvas=()=>{ const c=document.createElement('canvas'); c.width=TEX_W; c.height=TEX_H; return c; };
  const imgA=mkCanvas(), imgB=mkCanvas(), imgZ=mkCanvas();
  const ctxA=imgA.getContext('2d'), ctxB=imgB.getContext('2d'), ctxZ=imgZ.getContext('2d');
  const dA=ctxA.createImageData(TEX_W,TEX_H), dB=ctxB.createImageData(TEX_W,TEX_H), dZ=ctxZ.createImageData(TEX_W,TEX_H);
  const pxA=dA.data, pxB=dB.data, pxZ=dZ.data;
  const pv=new THREE.Vector3(), rgb=[0,0,0], rgbT=[0,0,0];
  for(let y=0;y<TEX_H;y++){
    const lat=(y+0.5)/TEX_H*Math.PI - Math.PI/2;      // −π/2..π/2
    const cy=Math.cos(lat), sy=Math.sin(lat);
    for(let x=0;x<TEX_W;x++){
      const lon=(x+0.5)/TEX_W*Math.PI*2 - Math.PI;
      pv.set(cy*Math.cos(lon), sy, cy*Math.sin(lon));
      const e=elevation(pv);                          // once — shared by both themes
      terrainColor(pv, e, rgb);
      terrainColorTech(pv, e, rgbT);
      const i=(y*TEX_W+x)*4;
      const hgt=Math.max(0, Math.min(255, (e+0.45)/1.15*255));  // packed height, for bump
      pxA[i]=rgb[0]*255;  pxA[i+1]=rgb[1]*255;  pxA[i+2]=rgb[2]*255;  pxA[i+3]=hgt;
      pxB[i]=rgbT[0]*255; pxB[i+1]=rgbT[1]*255; pxB[i+2]=rgbT[2]*255; pxB[i+3]=hgt;
      // biome id for the antique stylized line-work shader (0 ocean,1 plain,2 forest,3 mountain,4 desert)
      let zid=0;
      if(e>0){
        if(e>0.34) zid=3;
        else { const tt=tempAt(pv,e), mm=moistureAt(pv);
          zid = (tt>0.52&&mm<0.40)?4 : (mm>0.48&&tt>0.20)?2 : 1; }
      }
      pxZ[i]=zid; pxZ[i+1]=0; pxZ[i+2]=0; pxZ[i+3]=255;
    }
  }
  ctxA.putImageData(dA,0,0); ctxB.putImageData(dB,0,0); ctxZ.putImageData(dZ,0,0);
  const mkTex=cv=>{ const t=new THREE.CanvasTexture(cv);
    t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.ClampToEdgeWrapping;
    t.minFilter=THREE.LinearFilter; t.magFilter=THREE.LinearFilter; t.generateMipmaps=false; return t; };
  const mkTexN=cv=>{ const t=new THREE.CanvasTexture(cv);
    t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.ClampToEdgeWrapping;
    t.minFilter=THREE.NearestFilter; t.magFilter=THREE.NearestFilter; t.generateMipmaps=false; return t; };
  const terrainTexAll={ antique:mkTex(imgA), holo:mkTex(imgB) };
  const zoneTex=mkTexN(imgZ);
  const terrainTex=terrainTexAll[THEME_NAME]||terrainTexAll.antique;

  const geo=new THREE.IcosahedronGeometry(1, 72);
  const gpos=geo.attributes.position;
  const gp=new THREE.Vector3();
  for(let i=0;i<gpos.count;i++){
    gp.set(gpos.getX(i),gpos.getY(i),gpos.getZ(i)).normalize();
    const e=elevation(gp);
    const h=1 + Math.max(0,e)*0.028 + Math.min(0,e)*0.004;
    gpos.setXYZ(i, gp.x*h, gp.y*h, gp.z*h);
  }
  geo.computeVertexNormals();

  const planetMat=new THREE.ShaderMaterial({
    uniforms:{
      map:{value:terrainTex},
      zoneMap:{value:zoneTex},
      uMute:{value:0.0},                                // 0 natural relief .. 1 monochrome staff-map
      texel:{value:new THREE.Vector2(1/TEX_W, 1/TEX_H)},
      lightDir:{value:new THREE.Vector3(0.45,0.55,1.0).normalize()},
      uHolo:{value: THEME.holo},
      uTint:{value: new THREE.Color(THEME.tint[0],THEME.tint[1],THEME.tint[2])},
    },
    vertexShader:`
      varying vec3 vObj;
      varying vec3 vWN;
      void main(){
        vObj = normalize(position);
        vWN  = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader:`
      precision highp float;
      uniform sampler2D map;
      uniform sampler2D zoneMap;
      uniform float uMute;
      uniform vec2 texel;
      uniform vec3 lightDir;
      uniform float uHolo;
      uniform vec3 uTint;
      varying vec3 vObj;
      varying vec3 vWN;

      float hash(vec3 p){
        p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
        p *= 17.0;
        return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
      }
      float vnoise(vec3 x){
        vec3 i=floor(x), f=fract(x);
        f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                       mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                       mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbm3(vec3 p){
        float s=0.0, a=0.5;
        for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.07; a*=0.5; }
        return s;
      }
      vec2 sphUV(vec3 n){
        return vec2(atan(n.z,n.x)/6.2831853+0.5, asin(clamp(n.y,-1.0,1.0))/3.14159265+0.5);
      }
      // ---- antique stylized biome line-work (Theme A): fine cartographic ink motifs ----
      float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
      float forestInk(vec2 f, vec2 cell){                 // thin fir-tree glyphs, dense enough to read as forest
        if(hash21(cell)>0.80) return 0.0;
        float cx=0.5+(hash21(cell+3.1)-0.5)*0.4, cy=0.66;
        float hgt=0.42+0.12*hash21(cell+7.7), w=0.05;
        float d=sdSeg(f, vec2(cx,cy), vec2(cx, cy-hgt*0.35));
        for(int k=0;k<3;k++){
          float t=float(k);
          float yy=cy-hgt*(0.30+0.22*t), ww=0.17-0.035*t;
          d=min(d, sdSeg(f, vec2(cx-ww,yy), vec2(cx, yy-0.11)));
          d=min(d, sdSeg(f, vec2(cx+ww,yy), vec2(cx, yy-0.11)));
        }
        return smoothstep(w, w*0.35, d);
      }
      float mountInk(float e){                            // elevation isolines
        float fr=fract(e*30.0), ld=min(fr,1.0-fr);
        return smoothstep(0.09,0.0, ld);
      }
      float plainInk(vec2 uv){                            // fine furrow lines, drifting so they don't read as a mechanical grid
        float drift=fbm3(vec3(uv*7.0, 3.0));              // low-freq waver by region
        float y=uv.y*150.0 + sin(uv.x*70.0)*0.6 + drift*2.6;
        float fr=fract(y), ld=min(fr,1.0-fr);
        return smoothstep(0.12,0.0, ld)*0.7;
      }
      float desertInk(vec2 uv){                           // fine dotting
        vec2 dom=vec2(uv.x*2.0, uv.y)*120.0;
        vec2 cell=floor(dom), f=fract(dom)-0.5;
        if(hash21(cell+1.7)>0.72) return 0.0;
        vec2 j=(vec2(hash21(cell+2.3),hash21(cell+5.9))-0.5)*0.5;
        return smoothstep(0.17,0.08, length(f-j));
      }
      void main(){
        vec3 n = normalize(vObj);
        vec2 uv = sphUV(n);
        vec4 t = texture2D(map, uv);
        float h = t.a;
        float sea = smoothstep(0.383, 0.397, h);      // (e>0) in packed space

        // --- micro relief: high-frequency detail the texture can't hold ---
        vec3 q = n*140.0;
        float micro = fbm3(q)-0.5;
        float grain = (fbm3(n*520.0)-0.5);
        vec3 col = t.rgb;
        col *= 1.0 + (micro*0.20 + grain*0.10) * sea;          // land mottling
        col += vec3(0.02,0.03,0.05) * (1.0-sea) * (fbm3(n*90.0)-0.5); // ocean texture

        // --- normal: baked height gradient + procedural micro bump ---
        float hl=texture2D(map, uv-vec2(texel.x,0.0)).a;
        float hr=texture2D(map, uv+vec2(texel.x,0.0)).a;
        float hd=texture2D(map, uv-vec2(0.0,texel.y)).a;
        float hu=texture2D(map, uv+vec2(0.0,texel.y)).a;
        // Perturbed normal in WORLD space, built from the world normal vWN, so the
        // fragment stage never references modelMatrix (GLSL injects that only into
        // vertex shaders — doing so here failed to compile and left the planet unlit).
        vec3 Nw = normalize(vWN);
        vec3 tang = normalize(cross(vec3(0.0,1.0,0.0), Nw)+vec3(1e-5));
        vec3 bit  = normalize(cross(Nw, tang));
        float gx=(hr-hl)*22.0 + (fbm3(q+vec3(3.1,0,0))-fbm3(q-vec3(3.1,0,0)))*0.9;
        float gy=(hu-hd)*22.0 + (fbm3(q+vec3(0,3.1,0))-fbm3(q-vec3(0,3.1,0)))*0.9;
        vec3 N = normalize(Nw - (tang*gx + bit*gy)*sea*0.9);

        vec3 Lw = normalize(lightDir);
        float lam = max(dot(N, Lw), 0.0);
        float amb = 0.34 + 0.10*max(dot(vWN, Lw),0.0);
        vec3 lit = col * (amb + 0.86*lam);

        // specular sheen on water only
        vec3 V = vec3(0.0,0.0,1.0);
        vec3 H = normalize(Lw+V);
        float spec = pow(max(dot(N,H),0.0), 48.0) * (1.0-sea) * 0.35;
        lit += vec3(0.55,0.68,0.85)*spec;

        // atmospheric rim (antique: cool blue halo)
        float rim = pow(1.0 - max(dot(normalize(vWN), V),0.0), 3.0);
        lit += vec3(0.20,0.33,0.52)*rim*0.35;

        // antique stylized biome line-work (Theme A): muted relief + fine brass ink motifs
        if(uHolo < 0.5){
          float zid = texture2D(zoneMap, uv).r * 255.0;
          float eR  = h*1.15 - 0.45;
          vec2 dom  = vec2(uv.x*2.0, uv.y)*82.0;          // fir-glyph grid
          vec2 cell = floor(dom), f = fract(dom);
          float ink = 0.0;
          if(zid>1.5 && zid<2.5)       ink = forestInk(f, cell);
          else if(zid>2.5 && zid<3.5)  ink = mountInk(eR);
          else if(zid>0.5 && zid<1.5)  ink = plainInk(uv);
          else if(zid>3.5)             ink = desertInk(uv);
          // mute the naturalistic base toward a warm parchment tone (staff-map look)
          float baseL = dot(lit, vec3(0.299,0.587,0.114));
          vec3 parch = vec3(baseL) * vec3(1.15,1.04,0.80);
          if(zid>0.5) lit = mix(lit, parch, uMute);       // land only; keep the ocean as-is
          vec3 inkCol = vec3(0.90,0.72,0.34);             // brass ink
          if(zid>3.5) inkCol = vec3(0.40,0.28,0.16);      // dark ink reads on pale desert sand
          lit = mix(lit, inkCol, clamp(ink,0.0,1.0)*0.85);
        }

        // theme treatment B: holographic readout. Keep the technical texture's cyan
        // contour scan, light it gently so the whole disc self-glows, then overlay a
        // lat/long grid and a bright cyan limb — a distinct render, not a re-tint.
        if(uHolo > 0.5){
          float shade = 0.5 + 0.7*lam;
          vec3 holo = col*shade + col*0.28;                 // emissive lift keeps contours legible
          vec2 gr = abs(fract(uv*vec2(64.0,32.0)) - 0.5);
          float grid = smoothstep(0.47, 0.5, max(gr.x, gr.y));
          holo += uTint * grid * 0.22;
          float rim2 = pow(1.0 - max(dot(normalize(vWN), V),0.0), 2.3);
          holo += uTint * rim2 * 1.0;
          lit = holo;
        }

        gl_FragColor = vec4(lit, 1.0);
      }`,
  });
  planet=new THREE.Mesh(geo, planetMat);
  planet._terrainTex=terrainTexAll;                 // {antique,holo} — applyTheme swaps between them
  root.add(planet);
  planet.visible=false;                             // hidden: replaced by the analytic vector globe
  buildVectorGlobe();
  atmoMesh=new THREE.Mesh(new THREE.SphereGeometry(1.055,64,40),
    new THREE.MeshBasicMaterial({color:THEME.atmo, transparent:true, opacity:0.09, side:THREE.BackSide}));
  root.add(atmoMesh);

  /* --- roads --- */
  const rp=[];
  for(const [i,j] of S.roads){
    const a=S.settlements[i].dir, b=S.settlements[j].dir;
    for(let k=0;k<18;k++){
      const p1=slerp(a,b,k/18).multiplyScalar(MARK_R);
      const p2=slerp(a,b,(k+1)/18).multiplyScalar(MARK_R);
      rp.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z);
    }
  }
  const rg=new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp,3));
  /* Roads are drawn on the sphere's surface, so depth alone can't be trusted at
     grazing angles — the far hemisphere is discarded outright in the shader. */
  roadMat=new THREE.ShaderMaterial({
    uniforms:{ horizon:{value:0.3}, camNrm:{value:new THREE.Vector3(0,0,1)}, tint:{value:new THREE.Color(THEME.road)} },
    transparent:true, depthWrite:false,
    vertexShader:`
      varying vec3 vW;
      void main(){
        vW = normalize((modelMatrix * vec4(position,1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader:`
      uniform float horizon;
      uniform vec3 camNrm;
      uniform vec3 tint;
      varying vec3 vW;
      void main(){
        // the camera axis (camNrm) tilts with the view (#28); anything past the limb
        // measured along it — i.e. below horizon — is on the far side and discarded
        float d = dot(vW, camNrm);
        if(d < horizon) discard;
        float fade = smoothstep(horizon, horizon+0.12, d);
        gl_FragColor = vec4(tint, 0.72*fade);
      }`,
  });
  roadLines=new THREE.LineSegments(rg, roadMat);
  roadLines.renderOrder=1;
  root.add(roadLines);

  markerGroup=new THREE.Group(); root.add(markerGroup);
  // #49 — one shared selection frame overlay, follows the active selection each frame
  if(!bracketTex) bracketTex=makeBracketTexture();
  selFrame=makeSprite(bracketTex, 0.05, THEME.iconAccent);
  selFrame.renderOrder=9; selFrame.visible=false;   // under icons (10); hidden until something is selected
  markerGroup.add(selFrame);
  pawnSprites=[]; pawnPositions=[]; pawnBuiltFor=null;

  const TIER_PX={megalopolis:0.062, city:0.048, village:0.034, camp:0.026};
  for(const st of S.settlements){
    const spr=makeSprite(ICONS[st.tier], TIER_PX[st.tier]);
    spr.position.copy(st.dir).multiplyScalar(MARK_R);
    markerGroup.add(spr);
    st._spr=spr; st._px=TIER_PX[st.tier];
    /* territory outline — an organic loop hugging the surface around the town */
    const ring=footprintRing(st); st._footRing=ring;
    const pos=[]; for(const d of ring) pos.push(d.x*MARK_R, d.y*MARK_R, d.z*MARK_R);
    const fg=new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    const foot=new THREE.LineLoop(fg, makeFootprintMat());
    foot.renderOrder=1; root.add(foot); st._foot=foot;
    const big=st.tier==='city'||st.tier==='megalopolis';
    const lab=labelTexture(st.name, big);
    const ls=makeSprite(lab.tex, 0.03, new THREE.Color(THEME.lbl[big?'big':'small']));
    ls.scale.set(0.028*lab.aspect, 0.028, 1);
    ls.center.set(0.5, 1.55);
    ls.position.copy(spr.position);
    ls.material.depthTest=false;
    ls._big=big;
    markerGroup.add(ls);
    st._label=ls;
  }
  for(const e of S.ents){
    if(ENT[e.kind].inside) continue;
    const st=stl(e.settlementId);
    if(!e._dir) e._dir=placeOutdoorEnterprise(st, e);
    const spr=makeSprite(ICONS[e.kind], 0.026, 0xE8CE96);
    spr.position.copy(e._dir).multiplyScalar(MARK_R);
    markerGroup.add(spr);
    e._spr=spr;
  }
  rebuildDynamicMarkers();
  updateMarkers();
}

let squadMeshes=new Map(), caravanMeshes=new Map();
function rebuildDynamicMarkers(){
  for(const m of squadMeshes.values()) markerGroup.remove(m);
  for(const m of caravanMeshes.values()) markerGroup.remove(m);
  squadMeshes.clear(); caravanMeshes.clear();
}
function factionColor(fid){
  const f=S.factions.find(x=>x.id===fid);
  return f? f.color : '#8894AC';
}

/* markers follow the sim, but their render position eases — no jitter */
function updateMarkers(){
  picks=[];
  for(const st of S.settlements){
    if(!st._spr) continue;
    const o=org(st.ownerOrgId);
    const col=factionColor(o?o.factionId:null);
    st._spr.material.color.set(col);
    const sel=S.selection && S.selection.type==='settlement' && S.selection.id===st.id;
    const hov=hover && hover.type==='settlement' && hover.id===st.id;
    st._spr.scale.setScalar(st._px*(hov?1.18:1));   // #49 selection = frame, not scale; hover keeps its own lighter cue
    if(st._foot){
      st._foot.material.uniforms.tint.value.set(col);
      st._foot.material.uniforms.alpha.value = sel?0.9 : hov?0.6 : 0.38;
    }
    picks.push({type:'settlement', id:st.id, dir:st.dir, px:st._px, ring:st._footRing});
  }
  for(const e of S.ents){
    if(!e._spr && !ENT[e.kind].inside && markerGroup){
      e._dir = e._dir || placeOutdoorEnterprise(stl(e.settlementId), e);
      e._spr = makeSprite(ICONS[e.kind], 0.026, THEME.iconAccent);
      markerGroup.add(e._spr);
    }
    if(!e._spr) continue;
    const hov=hover && hover.type==='enterprise' && hover.id===e.id;
    e._spr.material.color.set(e.stalled? 0x9A6A62 : THEME.iconAccent);
    e._spr.scale.setScalar(0.026*(hov?1.15:1));   // #49 selection = frame; keep a subtle hover-only cue
    picks.push({type:'enterprise', id:e.id, dir:e._dir, px:0.026});
  }
  const live=new Set();
  for(const sq of S.squads){
    live.add(sq.id);
    if(!sq.rdir) sq.rdir=sq.dir.clone();
    let m=squadMeshes.get(sq.id);
    if(!m){ m=makeSprite(ICONS.squad, 0.034); markerGroup.add(m); squadMeshes.set(sq.id,m); }
    m.material.color.set(factionColor(sq.factionId));
    const hov=hover && hover.type==='squad' && hover.id===sq.id;
    m.scale.setScalar((0.026+Math.min(0.016, sq.strength/900))*(hov?1.15:1));   // #49 selection = frame; keep a subtle hover-only cue
    picks.push({type:'squad', id:sq.id, dir:sq.rdir, px:0.034});
  }
  for(const [id,m] of squadMeshes) if(!live.has(id)){ markerGroup.remove(m); squadMeshes.delete(id); }

  const cl=new Set();
  for(const cv of S.caravans){
    cl.add(cv.id);
    if(!cv.rdir) cv.rdir=cv.dir.clone();
    let m=caravanMeshes.get(cv.id);
    if(!m){ m=makeSprite(ICONS.caravan, 0.024); markerGroup.add(m); caravanMeshes.set(cv.id,m); }
    m.material.color.set(cv.cargo? RES[cv.cargo].color : '#6C7590');
    picks.push({type:'caravan', id:cv.id, dir:cv.rdir, px:0.024});
  }
  for(const [id,m] of caravanMeshes) if(!cl.has(id)){ markerGroup.remove(m); caravanMeshes.delete(id); }
}
/* every frame: ease render positions and hide anything behind the globe */
function animateMarkers(){
  const horizon = 1/camDist;
  // The limb (horizon) is measured along the camera axis _camNrm, which tilts with the
  // view (#28); at pitch=0 _camNrm=(0,0,1) so every test below reduces to the old z-test.
  if(roadMat){ roadMat.uniforms.horizon.value = horizon; roadMat.uniforms.camNrm.value.copy(_camNrm); }
  for(const m of footMats){ m.uniforms.horizon.value = horizon; m.uniforms.camNrm.value.copy(_camNrm); }
  const q=root.quaternion;
  const put=(spr, dir, lift)=>{
    spr.position.copy(dir).multiplyScalar(lift);
    const z=dir.clone().applyQuaternion(q).dot(_camNrm);
    spr.visible = z > horizon - 0.02;
    const fade=Math.min(1, Math.max(0,(z-horizon+0.02)/0.08));
    spr.material.opacity = fade;
  };
  for(const st of S.settlements){
    if(!st._spr) continue;
    put(st._spr, st.dir, MARK_R);
    if(cityLive.has(st.id)){ st._spr.material.opacity *= 0.25; }
    if(st._label){
      const showLabel = st.tier==='megalopolis' || st.tier==='city' || camDist<2.4;
      st._label.visible = st._spr.visible && showLabel;
      st._label.position.copy(st._spr.position);
      st._label.material.opacity = st._spr.material.opacity*0.95;
    }
  }
  for(const e of S.ents) if(e._spr) put(e._spr, e._dir, MARK_R);
  // render position is the sim's last tick blended into its current one, by elapsed
  // tick fraction — motion is continuous, not a step per tick
  for(const sq of S.squads){
    const m=squadMeshes.get(sq.id); if(!m) continue;
    sq.rdir = sq.prevDir? slerp(sq.prevDir, sq.dir, tickAlpha) : sq.dir.clone();
    put(m, sq.rdir, MARK_R);
  }
  for(const cv of S.caravans){
    const m=caravanMeshes.get(cv.id); if(!m) continue;
    cv.rdir = cv.prevDir? slerp(cv.prevDir, cv.dir, tickAlpha) : cv.dir.clone();
    put(m, cv.rdir, MARK_R);
  }
  updateCityLOD();
  updatePawns();
  for(const pp of pawnPositions) put(pp.spr, pp.dir, MARK_R);
  for(const rec of squadPawnCache.values())
    for(const p of rec.sprites) if(p.dir) put(p.spr, p.dir, MARK_R);
  // A tile stays hot (built, walkers ticking) wherever an own squad sits, but only
  // DRAW its 3-D city while it's on the near hemisphere — a far-side city behind the
  // globe is never visible, so skip its render cost. Pure visibility cull; the hot-set
  // logic (cityLive) is untouched.
  for(const c of cityCache.values()){
    const z=c.st.dir.clone().applyQuaternion(q).dot(_camNrm);
    c.group.visible = z > horizon - 0.03;
  }
  // #49 — universal selection frame: hug the selected object's icon with corner brackets.
  // One shared overlay; sized to the marker's on-screen radius, hidden when nothing is
  // selected or when the selected marker is behind the globe.
  if(selFrame){
    const t=selectionFrameTarget();
    if(!t){ selFrame.visible=false; }
    else {
      const K=1.7;                                   // frame a touch larger than the icon it wraps
      selFrame.scale.set(t.px*K, t.px*K, 1);
      if(t.spr){                                     // a real marker exists: inherit its exact position + limb culling
        selFrame.position.copy(t.spr.position);
        selFrame.visible=t.spr.visible;
        selFrame.material.opacity=t.spr.material.opacity;
      } else {                                        // char/org (no dedicated marker): place from the on-sphere direction
        selFrame.position.copy(t.dir).multiplyScalar(MARK_R);
        const z=t.dir.clone().applyQuaternion(q).dot(_camNrm);
        selFrame.visible = z > horizon - 0.02;
        selFrame.material.opacity=Math.min(1, Math.max(0,(z-horizon+0.02)/0.08));
      }
    }
  }
}

/* =====================================================================
   HOT-REGION RENDER TRIGGER (#26) — detailed loading around the camera AND
   around the player's own squads. ONE rule materialises a settlement's
   residents and a squad's pawns alike (DESIGN §236 "Identified vs anonymous").
   A tile/point is a hot RENDER tile when EITHER holds — any number may be hot
   at once, there is no cap of one (DESIGN §257 "Hot-region trigger"):
     • it lies inside the camera's zoom cone (cosmetic, camera-driven detail —
       render/loading only; camera proximity deliberately does NOT drive the
       authoritative simulation LOD — that camera-independent-determinism
       question is issue #27 / DESIGN §259,§261), OR
     • a squad of the player's own side is present within a fixed world radius
       of it (an own squad's mere presence is its own qualifying signal,
       regardless of camera or whether it has an active order).
   Hot settlements load city geometry + resident pawns; hot squads load pawns.
   ===================================================================== */
const HOT_GEOM_DIST = 1.45;   // altitude under which the camera cone builds full city geometry
const HOT_GEOM_COS  = 0.90;   // EVERY settlement within ~26° of the camera axis loads — replaces slice(0,2)
                              // (a real cluster is 3–5 tiles here, so "several" load, not one or two)
const HOT_PAWN_DIST = 1.90;   // resident sprites fade in a little higher than full geometry
const HOT_PAWN_COS  = 0.85;   // ...across a WIDER ~32° cone, so full-geometry tiles are ringed by dot tiles
const HOT_SQUAD_COS = 0.997;  // an own squad within ~4.4° of a tile counts as "present" → tile is hot
const HOT_SQUAD_PAWN_DIST = 2.6; // own-side squads surface their pawns out to this altitude, wherever they sit
const CITY_BUILD_PER_FRAME = 1;  // amortise: build ONE (now denser #16) city per frame so a big reveal never spikes one frame

function cameraDir(){ return new THREE.Vector3(0,0,1).applyQuaternion(root.quaternion.clone().invert()); }
function playerFactionId(){
  const pc = S.playerCharId!=null ? chr(S.playerCharId) : null;
  const o  = pc ? org(pc.ledOrgId) : null;
  return o ? (o.factionId||o.id) : null;
}
/* the player's own squads — the mobile bodies whose presence makes a region hot.
   Before an avatar is chosen there is no "own side", so nothing qualifies here and
   only camera proximity drives detail. */
function ownSideSquads(){
  const f = playerFactionId();
  return f==null ? [] : S.squads.filter(s=>s.factionId===f);
}
/* a right-handed tangent frame on the sphere at `dir`, with a pole guard */
function tangentBasis(dir){
  const up=dir.clone();
  let tan=new THREE.Vector3(0,1,0).cross(up);
  if(tan.lengthSq()<1e-8) tan=new THREE.Vector3(1,0,0).cross(up);
  tan.normalize();
  const bit=up.clone().cross(tan).normalize();
  return {up, tan, bit};
}
function offsetDir(basis, ox, oy){
  return basis.up.clone()
    .add(basis.tan.clone().multiplyScalar(ox))
    .add(basis.bit.clone().multiplyScalar(oy)).normalize();
}

function updateCityLOD(){
  const camDir=cameraDir(), camHot=camDist<HOT_GEOM_DIST;
  const own=ownSideSquads();
  // every settlement in the camera cone (NO slice cap) OR carrying an own-side squad,
  // so several tiles around the camera — and any tile a player squad stands on, even
  // off-camera — all load full detail at once.
  const hot=S.settlements.filter(st=>
       (camHot && st.dir.dot(camDir)>HOT_GEOM_COS)
    || own.some(sq=>(sq.rdir||sq.dir).dot(st.dir)>HOT_SQUAD_COS));
  const hotIds=new Set(hot.map(s=>s.id));
  for(const [id,c] of cityCache) if(!hotIds.has(id)){ root.remove(c.group); cityCache.delete(id); }
  // share one resident-head budget across however many cities are live, so "several"
  // hot tiles don't multiply the walker draw calls without bound. The budget is sized so a
  // lone hot city reaches its full footprint-scaled crowd (#16) while a whole cluster splits it.
  const cap=Math.max(16, Math.round(180/Math.max(1,hot.length)));
  let built=0;
  for(const st of hot){
    if(cityCache.has(st.id)) continue;
    if(built++ >= CITY_BUILD_PER_FRAME) break;          // rest materialise over the next frames
    cityCache.set(st.id, buildCity(st, cap));
  }
  cityLive = new Set(cityCache.keys());                 // everything currently built is hot
  for(const c of cityCache.values()){
    stepWalkers(c, frameDtMs);
    // #50: every flying head is clickable. An IDENTIFIED cat (real S.char) picks its
    // character; an ANONYMOUS density head (#16 — a cosmetic walker with no sim entity
    // yet) is registered as a resident-pre-materialisation, so clicking it draws a real
    // character from the settlement's latent demographic pool (DESIGN §236 «Identified
    // vs anonymous», §954 «Settlement population: demographic pool»).
    for(const w of c.walkers){
      // r:w.r — project the pick at the head's OWN surface radius so the hit-test sits on the
      // VISIBLE head at every screen position (not just centred); see screenPos()/#50 note.
      if(w.id!=null) picks.push({type:'char', id:w.id, dir:w.dir, r:w.r, px:0.026});
      else           picks.push({type:'resident', walker:w, settlementId:c.st.id, dir:w.dir, r:w.r, px:0.026});
    }
  }
}

function updatePawns(){
  updateResidentPawns();
  updateSquadPawns();
}

/* --- residents: floating pawn dots over hot tiles that don't (yet) have full
       city geometry — the mid-detail tier just above street level --- */
let pawnBuiltFor=null, pawnPositions=[], pawnSprites=[];
function updateResidentPawns(){
  const show = camDist < HOT_PAWN_DIST;
  if(!show){
    if(pawnBuiltFor!==null){ for(const s of pawnSprites) markerGroup.remove(s);
      pawnSprites=[]; pawnPositions=[]; pawnBuiltFor=null; }
    return;
  }
  // the settlements the camera is over (several, no cap) that aren't already a full city
  const camDir=cameraDir();
  const near=S.settlements.filter(s=>s.dir.dot(camDir)>HOT_PAWN_COS && !cityLive.has(s.id));
  const key=near.map(s=>s.id).join(',');
  if(key!==pawnBuiltFor){
    pawnBuiltFor=key;
    for(const s of pawnSprites) markerGroup.remove(s);
    pawnSprites=[]; pawnPositions=[];
    for(const st of near){
      const residents=S.chars.filter(c=>c.homeId===st.id && c.alive).slice(0,18);
      const basis=tangentBasis(st.dir);
      residents.forEach((c,i)=>{
        const ang=i/Math.max(1,residents.length)*Math.PI*2 + (c.id%7)*0.31;
        const rad=0.006+(c.id%5)*0.0018;
        const d=offsetDir(basis, Math.cos(ang)*rad, Math.sin(ang)*rad);
        const col = c.id===S.playerCharId? 0xC89B3C : c.ledOrgId? 0xEFE0BC : 0xA8B7CE;
        const spr=makeSprite(ICONS.person, c.ledOrgId? 0.020 : 0.016, col);
        spr.userData.dir=d;
        markerGroup.add(spr);
        pawnSprites.push(spr);
        pawnPositions.push({type:'char', id:c.id, dir:d, spr});
      });
    }
  }
  for(const pp of pawnPositions){
    picks.push({type:'char', id:pp.id, dir:pp.dir, px:0.018});
  }
}

/* --- squad pawns: the SAME materialise rule as residents, applied to a squad's
       soldiers. The sim tracks a squad only as an aggregate `strength`, so these
       individual pawns are a purely cosmetic render-time materialisation (no sim
       entities created) that lets a squad show pawns exactly as a town does.
       A squad is hot when the player owns it and it's visible (its presence is
       its own signal, shown wherever it sits, not only dead-centre), or when the
       camera is zoomed onto it — mirroring how residents fade in. --- */
let squadPawnCache=new Map();    // squadId -> {n, sprites:[{spr, ox, oy, dir}]}
function squadPawnCount(sq){ return Math.max(4, Math.min(14, Math.round(sq.strength))); }
function hotSquads(){
  const f=playerFactionId(), camDir=cameraDir();
  return S.squads.filter(sq=>{
    const d=sq.rdir||sq.dir, front=d.dot(camDir);
    if(f!=null && sq.factionId===f && camDist<HOT_SQUAD_PAWN_DIST && front>0.72) return true; // own side, on-screen
    if(camDist<HOT_PAWN_DIST && front>HOT_PAWN_COS) return true;                               // zoomed onto any squad
    return false;
  });
}
function updateSquadPawns(){
  const hot=hotSquads(), hotSet=new Set(hot.map(s=>s.id));
  for(const [id,rec] of squadPawnCache){
    if(!hotSet.has(id)){ for(const p of rec.sprites) markerGroup.remove(p.spr); squadPawnCache.delete(id); }
  }
  for(const sq of hot){
    const n=squadPawnCount(sq);
    let rec=squadPawnCache.get(sq.id);
    if(!rec || rec.n!==n){                              // (re)build the fixed cluster when count changes
      if(rec) for(const p of rec.sprites) markerGroup.remove(p.spr);
      rec={n, sprites:[]};
      for(let i=0;i<n;i++){
        const ang=i/n*Math.PI*2 + (sq.id%7)*0.31;
        const rad=0.004+((i*3+sq.id)%5)*0.0015;
        const leader=(i===0);
        const col=leader? factionColor(sq.factionId) : 0xC3CAD8;
        const spr=makeSprite(ICONS.person, leader?0.019:0.014, col);
        markerGroup.add(spr);
        rec.sprites.push({spr, ox:Math.cos(ang)*rad, oy:Math.sin(ang)*rad, dir:null});
      }
      squadPawnCache.set(sq.id, rec);
    }
    const basis=tangentBasis(sq.rdir||sq.dir);          // squad moves — recompute the cluster each frame
    for(const p of rec.sprites){
      p.dir=offsetDir(basis, p.ox, p.oy);
      picks.push({type:'squad', id:sq.id, dir:p.dir, px:0.014});   // clicking a soldier selects the squad
    }
  }
}

const _camNrm=new THREE.Vector3(0,0,1);    // unit camera direction from the planet centre
let hover=null;
function selectionDir(){
  const s=S.selection; if(!s) return null;
  if(s.type==='settlement') return stl(s.id)?.dir;
  if(s.type==='squad') return sqd(s.id)?.dir;
  if(s.type==='caravan') return byId(S.caravans,s.id)?.dir;
  if(s.type==='enterprise'){const e=ent(s.id); return e? (e._dir||stl(e.settlementId)?.dir):null;}
  if(s.type==='char'){const c=chr(s.id); return c? stl(c.homeId)?.dir : null;}
  if(s.type==='org'){
    const o=org(s.id);
    const st=S.settlements.find(x=>x.ownerOrgId===s.id);
    if(st) return st.dir;
    const c=chr(o?.leaderId); return c? stl(c.homeId)?.dir : null;
  }
  return null;
}
/* #49 — resolve the current selection to the marker the shared frame should hug.
   Returns {spr,px} when a real marker sprite exists (frame inherits its rendered
   position + limb culling), or {dir,px} for char/org which have no dedicated marker
   (frame is placed from the on-sphere direction, as selectionDir already resolves). */
function selectionFrameTarget(){
  const s=S.selection; if(!s) return null;
  if(s.type==='settlement'){ const st=stl(s.id); if(st&&st._spr) return {spr:st._spr, px:st._spr.scale.x}; }
  else if(s.type==='enterprise'){ const e=ent(s.id); if(e&&e._spr) return {spr:e._spr, px:e._spr.scale.x}; }
  else if(s.type==='squad'){ const m=squadMeshes.get(s.id); if(m) return {spr:m, px:m.scale.x}; }
  else if(s.type==='caravan'){ const m=caravanMeshes.get(s.id); if(m) return {spr:m, px:m.scale.x}; }
  const d=selectionDir(); return d? {dir:d, px:0.03} : null;
}

// --- cross-module setters (owning module mutates its own binding) ---
export function setCamDist(v){ camDist=v; }
export function setHover(p){ hover=p; }
export function invalidatePawns(){ pawnBuiltFor=null; }

export {
  CITY_BUILD_PER_FRAME, FOOT_R, HOT_GEOM_COS, HOT_GEOM_DIST, HOT_PAWN_COS, HOT_PAWN_DIST, HOT_SQUAD_COS, HOT_SQUAD_PAWN_DIST, ICONS, ICON_URL, MARK_R, THEME,
  THEMES, THEME_NAME, VGLOBE_FS, VGLOBE_VS, _camNrm, _gKey, _tri, animateMarkers, applyTheme, atmoMesh, bgMesh, bracketTex,
  buildIconLegend, buildIcons, buildScene, buildVectorGlobe, camDist, camera, cameraDir, canvas, caravanMeshes, cityCache, cityLive, factionColor,
  footMats, footprintRing, globeDirty, globeRT, globeScene, hotSquads, hover, iconTexture, labelTexture, makeBracketTexture, makeFootprintMat, makeSprite,
  markerGroup, offsetDir, outline, ownSideSquads, pawnBuiltFor, pawnPositions, pawnSprites, picks, planet, playerFactionId, rebuildDynamicMarkers, renderGlobeCache,
  renderer, roadLines, roadMat, root, scene, selFrame, selectionDir, selectionFrameTarget, squadMeshes, squadPawnCache, squadPawnCount, sun,
  tangentBasis, toggleTheme, updateCityLOD, updateGlobeUniforms, updateMarkers, updatePawns, updateResidentPawns, updateSquadPawns, vGlobe,
};
