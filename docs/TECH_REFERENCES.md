# New Lords — Tech References

`DESIGN.md` describes only the game and its simulation — no engine, library, or algorithm names. This file is the deliberately separate place for "what could actually build this": specific existing tools whose own systems already solve a problem `DESIGN.md` describes, kept here as an implementation inspiration rather than folded into the design itself.

The throughline across all three entries below is Unreal Engine. The working idea is that the engine could be built leaning on these existing, well-proven integrations rather than each being reinvented from scratch — they already work well at exactly the jobs `DESIGN.md` asks for, and the design goal is to reach the same player-facing outcomes they demonstrate, not necessarily their exact internals.

## PCG / PCGEx — Worldgen

Unreal's Procedural Content Generation framework, extended by the community PCGEx plugin, is a candidate implementation path for everything under `DESIGN.md`'s Worldgen section: a point-based pipeline where point sets flow through samplers, filters, transforms, and spawners.

Specific techniques that map onto specific `DESIGN.md` facts:
- **Poisson-disc rejection sampling** — placing zone seed points, capital/settlement seed points, and wild-camp positions with even, non-overlapping spacing.
- **Delaunay triangulation and its dual Voronoi diagram** — the shared geometric backbone: one triangulation of seed points yielding territory borders, road-candidate topology, and terrain-zone borders together.
- **Lloyd relaxation** — smoothing the political-influence Voronoi cells into more even regions.
- **Urquhart subgraph + A\* terrain-cost routing** — paring the full triangulation down to a sensible road-candidate set, then routing roads to prefer cheap terrain (plains) over expensive terrain (forest/mountain), crossing rivers only at bridge/ford points.
- **Douglas-Peucker simplification + spline smoothing** — turning a raw routed path into a natural-looking road polyline.
- **Marching squares over a nearest-seed label grid** — extracting clean zone borders from the underlying tessellation.
- **Watabou-style minimum-area oriented bounding box + footprint-to-plan generation** — the specific technique (from Oleg Dolya's "Watabou" city/dungeon generators) behind settlement building-lot layout and the street network between those lots.

## StateTree — Layered squad/leader behavior

Unreal's StateTree plugin is a candidate implementation for `DESIGN.md`'s layered squad-behavior system (order / auto / reactive layers, resolved by priority, higher layers preempting lower ones) — it's built for exactly this kind of hierarchical, priority-resolved state machine.

## Lyra's Experience/GameFeature system — Session composition

Epic's official Lyra sample project demonstrates composing a session out of toggleable "GameFeatures" selected by an "Experience" — a candidate implementation pattern for `DESIGN.md`'s Experience-driven architecture (a session as a curated, runtime-toggleable slice of the full simulation, rather than a fixed bootstrap). Porting the idea, not necessarily any of Lyra's specific code.
