// build-bundle.mjs — make new-lords-prototype.html self-contained (#65 regression fix)
//
// WHY: #65 split the inline monolith into ES modules loaded via
//   <script type="module" src="./src/main.js">.
// External ES modules are fetched under the CORS model, and a file opened by
// double-click has origin "null" — so the browser BLOCKS every module fetch and
// the game never boots (empty start card, no character choice). An *inline*
// <script type="module"> fetches nothing, so it runs identically over file://
// and http://. This script concatenates src/*.js back into one inline module and
// writes it into new-lords-prototype.html between stable markers (idempotent).
//
// src/*.js stays the source of truth (the worker edits it). After editing src/,
// re-run:  node build-bundle.mjs   — then the HTML opens by double-click again.
//
// Safe because src/ is an auto-split of the original monolith: names are unique,
// and stripping the internal import lines leaves each name declared exactly once
// (in its owning module), so the flat concat has no redeclarations. THREE remains
// the global classic-script above the bundle — it is never imported.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC  = join(ROOT, 'src');
const HTML = join(ROOT, 'new-lords-prototype.html');

// Concatenation order = main.js import order: state defines S/RNG/tables first;
// render & ui do top-level DOM/THREE work; main (bootstrap) runs last.
const ORDER = ['state', 'economy', 'worldgen', 'orgs', 'squads', 'citygen', 'render', 'ui', 'main'];

const exported = new Set();   // union of every module's exports → the window surface
const topDecl = new Map();    // top-level id → {mod, text} — collision guard for the flat scope
const bodies = [];

for (const name of ORDER) {
  let code = readFileSync(join(SRC, `${name}.js`), 'utf8');

  // 1) collect + strip `export { a, b, c };` blocks (name lists, no nested braces)
  code = code.replace(/export\s*\{([^}]*)\}\s*;?/g, (_, list) => {
    for (const raw of list.split(',')) {
      const id = raw.trim().split(/\s+as\s+/).pop().trim();   // `x as y` → y (defensive)
      if (id) exported.add(id);
    }
    return '';
  });

  // 2) collect + strip the inline `export` keyword (export function/const/let/var/class)
  code = code.replace(
    /^export\s+(async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
    (_, kw, id) => { exported.add(id); return `${kw} ${id}`; },
  );

  // 3) drop internal import statements — all single-line `import … from './x.js';`
  //    (incl. `import * as _x from './x.js';`). Anything imported is declared in its
  //    owning module, which is also in this bundle, so the reference still resolves.
  code = code.split('\n').filter(l => !/^\s*import\s.*from\s*['"]\.\//.test(l)).join('\n');

  // 4) main.js only: drop the namespace-spread reassembly (`Object.assign(window, _state, …)`);
  //    those `_x` bindings no longer exist. The generated surface below replaces it exactly.
  if (name === 'main') {
    code = code.split('\n').filter(l => !/Object\.assign\(window,\s*_[a-z]/.test(l)).join('\n');
  }

  // 5) flat-scope collision guard. In separate modules two files may each hold a private
  //    top-level decl of the same name (e.g. `const canvas = document.getElementById('scene')`,
  //    which #65 duplicated into render.js and ui.js). In one scope that is a redeclaration.
  //    Byte-identical single-line const/let/var decls are safe to dedupe (same value, the later
  //    module just sees the earlier binding); a same-name-but-different decl is a real conflict
  //    the maintainer must resolve — fail loudly rather than emit a broken bundle.
  code = code.split('\n').filter(line => {
    const d = line.match(/^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
    if (!d) return true;
    const id = d[1], text = line.trim();
    // canon = a single-line const/let/var decl up to its first ';' (ignores a trailing // comment),
    // or null for anything else (functions, classes, multi-line decls) — those never auto-dedupe.
    const semi = text.indexOf(';');
    const canon = (/^(?:const|let|var)\s/.test(text) && semi >= 0) ? text.slice(0, semi + 1) : null;
    const prev = topDecl.get(id);
    if (prev) {
      if (canon && prev.canon === canon) return false;   // identical decl → drop dup, earlier binding stands
      throw new Error(`bundle conflict: top-level '${id}' declared in ${prev.mod}.js and ${name}.js with differing text — rename one before bundling.`);
    }
    topDecl.set(id, { mod: name, canon });
    return true;
  }).join('\n');

  bodies.push(`/* ===== src/${name}.js ===== */\n${code.trim()}`);
}

// Reproduce the page-eval/test surface that main.js published via Object.assign(window, _state, …).
const surface = `Object.assign(window, { ${[...exported].sort().join(', ')} });`;

// Visible build stamp: a short content hash of the SOURCE (deterministic — same src ⇒ same id,
// so the CI bundle-check stays green). Shown in a corner and logged, so you can SEE which build
// is loaded and match it against what the chat says the latest should be.
const buildId = createHash('sha1').update(bodies.join('\n')).digest('hex').slice(0, 8);
const stamp =
  `\n/* ===== visible build stamp (${buildId}) ===== */\n` +
  `try{console.log('%c[New Lords] build ${buildId}','color:#C89B3C');}catch(e){}\n` +
  `(function(){function add(){try{var d=document.createElement('div');d.textContent='build ${buildId}';` +
  `d.style.cssText='position:fixed;right:6px;bottom:4px;font:10px/1 ui-monospace,monospace;color:#7B88A6;'+` +
  `'background:rgba(8,11,18,.72);padding:3px 6px;border-radius:2px;z-index:99999;opacity:.85;pointer-events:none';` +
  `document.body.appendChild(d);}catch(e){}}if(document.body){add();}else{addEventListener('DOMContentLoaded',add);}})();\n`;

const bundle = `${bodies.join('\n\n')}\n\n/* ===== window test/debug surface (bundled) ===== */\n${surface}\n${stamp}`;

const block =
`<!-- NEWLORDS:BUNDLE — generated by build-bundle.mjs from src/*.js. DO NOT EDIT BY HAND.
     Re-run after editing src/:  node build-bundle.mjs
     Inline module = self-contained, so the file opens by double-click (file://).
     External ES modules cannot: CORS blocks module fetch from origin "null". -->
<script type="module">
${bundle}</script>
<!-- /NEWLORDS:BUNDLE -->`;

let html = readFileSync(HTML, 'utf8');
if (html.includes('<!-- NEWLORDS:BUNDLE')) {
  html = html.replace(/<!-- NEWLORDS:BUNDLE[\s\S]*?\/NEWLORDS:BUNDLE -->/, block);   // idempotent re-bundle
} else {
  // first run: replace the #65 comment + external-module tag (the comment describes the
  // now-superseded external-module bootstrap, so swap it out with the tag).
  html = html.replace(/<!-- New Lords prototype[\s\S]*?<script type="module" src="\.\/src\/main\.js"><\/script>/, block);
}
writeFileSync(HTML, html);
console.log(`bundled ${ORDER.length} modules · ${exported.size} exported names · ${bundle.length} bytes · build ${buildId}`);
