# PCG City Generator — extracted reference

Faithful extraction of Epic's **PCGPrimitives** city example, to be reproduced as a text-driven
"mini-PCG" runtime in our artifact. UE is a **read-only reference** — nothing is authored back into it.

- **Source graph:** `/PCGPrimitives/Examples/City/City_Circular_1km_2_arteries_NoAssetLibrary` (asset class `PCGGraph`, UE 5.8).
- **Why this variant:** "NoAssetLibrary" builds from **basic shapes + extrusions** (no bespoke CitySample meshes), so it reproduces honestly in Three.js.
- **Raw graph:** [city_generator.graph.json](city_generator.graph.json) — every node, param, and edge, dumped via `PCGToolset.GetGraphStructure`.
- **Scale:** UE `1uu = 1cm`. City hex = `100000uu = 1km`. Block `12000×6000uu = 120×60m`. Building max height `6000uu = 60m`.

## The architecture (what we are copying)

The plugin models a city as a dataflow over four data kinds — **Area** (2D polygon), **Spline** (polyline),
**Points**, **Mesh** — with a library of atomic operations under `/PCGPrimitives/Primitives/*`:

| Category | Primitives used by the city graph | Our JS equivalent |
|---|---|---|
| Create | `Create_Spline_Shape` (ngon), `Create_Spline_line`, `Create_Mesh_Extrude`, `Create_Mesh_Planar` | polygon/polyline factories; extrude 2D→3D |
| Subdivide | `Subdivide_Areas_withSpline`, `_withGrid`, `_WithRecursiveSplit` | split a polygon by a cutting polyline / grid / recursive OBB split |
| Compose | `Compose_Areas_Union`, `_Intersection`, `_Exclusion` | 2D polygon boolean (polygon-clipping lib) |
| Transform | `Transform_Jitter`, `_Offset`, `_Resample`, `Transform_Areas_Contract`, `_Expand` | jitter verts; offset; resample polyline; polygon inward/outward offset |
| Filter | `Filter_Areas_BySize`, `Filter_RandomChoice` | area threshold split; seeded random split |
| Fill | `Fill_Areas_Uniformly`, `Fill_Areas_Randomly` | grid / Poisson-ish point scatter inside a polygon |
| Extract | `Extract_Segments` | polygon boundary → edge segments |
| Spawn / Assign | `Spawn_Assets`, `Assign_ShapeGrammarDefinition` | instance a mesh; run a shape-grammar profile |

`Assign_ShapeGrammarDefinition` pulls a **shape-grammar data asset** (`SGD_*`) — the road/sidewalk/building
profiles under `/PCGPrimitives/Grammar/`. For roads it turns a centerline + width into a road footprint; for
buildings it turns a footprint + height into a facade. v1 reproduction can approximate these as extruded
ribbons (roads) and extruded prisms with a floor texture (buildings); faithful grammar is a later pass.

## The pipeline (execution order, with real params)

```
CITY OUTLINE
  Create_Spline_Shape ngon=6, 1km            -> Transform_Jitter 80m         = organic hex city area  [A]

ARTERIES (x2)
  Create_Spline_line 2km  (2nd rotated 120°) -> Resample 5 pts -> Jitter 80m = 2 curved arterials     [S]

DISTRICTS
  [A] Subdivide_Areas_withSpline by [S]                                        = districts
      -> Subdivide_Areas_WithRecursiveSplit (iter 1, seed 7)                   = sub-districts
      -> Filter_Areas_BySize 32000: Selected=dividable / Unselected=green      (undividable kept for parks)

BLOCKS
  dividable -> Subdivide_Areas_withGrid 120×60m                                = blocks (+ block splines)

ROADS  (centerlines from the three subdivision passes -> grammar -> footprints)
  artery splines   -> Assign SGD_Road width 34m
  district splines -> Assign SGD_Road width 26m  (collector)
  block splines    -> Assign SGD_Road width 19m  (local)
  Compose_Areas_Union of all three                                            = road footprints [R]

LOTS
  [A] Compose_Areas_Exclusion [R]            = lots (city minus roads)
      Compose_Areas_Exclusion undividable    = remove park-reserved districts
      Filter_RandomChoice 0.9                = 90% buildable / 10% -> plazas

BUILDINGS
  buildable lots Filter_BySize 2000..8000
      >8000 -> parks (scatter trees)
      2000..8000 -> Subdivide_WithRecursiveSplit -> Filter_BySize >=500        = footprints
      Write_Attribute_fromTexture(noise) -> @MaxHeight (0..60m)
      Create_Mesh_Extrude by @MaxHeight                                        = building volumes
      + roof (Create_Mesh_Planar), + rooftop clutter cubes (contract/fill/10%/spawn)

DRESSING
  lots -> Extract_Segments -> Assign SGD_Sidewalk                              = sidewalks
  lots -> Transform_Areas_Expand -> Fill_Uniformly 1.5m tiles                  = ground
  10% plaza lots -> contract 6m -> fill -> 10% -> spawn props
  oversized lots ∩ undividable -> Fill_Areas_Randomly 0.015/m² -> spawn trees  = parks
```

Graph parameters exposed for tuning: `LocalRoadWidth`, `CollectorRoadWidth`, `ArteryRoadWidth`,
`BlockWidth`, `BlockLength`, `DistrictSizeLimit`, `BuildableLotsRatio`, `Debug`.

## Reproduction plan (our artifact)

1. **Text-graph runtime** — a small JS executor over the node/edge JSON above. Each `type` maps to one pure
   function `(inputs, params) -> outputs`, keyed by pin labels. Deterministic from a seed (mulberry32).
   Data kinds: `Area` = `{ polygon: [[x,y]...], attrs }`, `Spline` = polyline, `Points`, `Mesh`.
2. **Geometry backbone** — a 2D polygon-clipping helper (union/intersection/difference/offset). This is the
   one real dependency; everything else is trivial geometry.
3. **Three.js renderer** — extrude Areas to Meshes, ribbon the road/sidewalk footprints, scatter instanced
   trees/props. Camera orbits; seed + the 8 graph params are live sliders.
4. **Standalone page** `city-generator.html` (viewed via `python -m http.server` + browser, since the in-app
   preview does not render our WebGL). This is the "city you can see."
5. **Verify** against a UE reference screenshot of `City_Generator_steps.umap`, tune params to match.
6. **Integrate** the runtime into the main prototype's Worldgen Stage 8 (in-settlement lots + streets).
