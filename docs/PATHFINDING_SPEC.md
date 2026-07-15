# New Lords — Pathfinding & Movement Spec

The single source of truth for how units (and the ambient character placeholders) find paths and move through the world, at both the strategic (travel) and tactical (local formation/combat) scales. A living document: resolved rules are stated as fact; genuine gaps are marked **Open question**. This supersedes the pathfinding details sketched in `docs/DESIGN.md`'s LOD cost model ("pathfinding is ring-sampling + steering, not per-pawn A*") — that note is the rough historical sketch; this document is the model.

---

## Two layers

Movement splits into two connected layers, chosen by scale:

- **Strategic travel — graph-based.** Long-distance movement follows graphs (roads and streets, below). Cheap, precomputed, node-to-node.
- **Tactical movement — hex-based, local.** Close up — where formations and combat happen — movement is on a **hex grid**, instantiated only in active/hot regions, never world-wide (a planet-wide hex grid would be unmanageable and would break the LOD "cohorts everywhere, individuals only in hot regions" principle — see DESIGN.md, LOD-tiered simulation).

A unit traveling on the graph that enters a hot/tactical region hands off to the hex grid, and back to the graph when it leaves.

**Hand-off, resolved.** A unit travels the graph until it enters a hot/tactical region; the hex grid materializes with that region at the very boundary the LOD system already uses to go hot (see DESIGN.md, hot-region trigger — no new boundary is introduced). On crossing **in**, the unit's continuous position **snaps to the nearest free hex**; on crossing **out**, its hex is projected back onto the nearest graph node/edge and it resumes graph travel. The hex layer thus rides the existing materialize/collapse boundary rather than defining its own.

---

## Strategic travel — road & street graphs

- **Between settlements:** the inter-settlement **road graph** already generated at worldgen (see DESIGN.md, "Caravans on roads"). Units walk it node-to-node.
- **Within a settlement:** a per-city **street/corridor graph** — the corridors left between blocks by the city's recursive subdivision (see DESIGN.md, L2 city geometry) form the street network; nodes at corridor intersections, edges along corridors.
- **Off-road fallback:** when no road or street connects origin and destination, a unit moves **off-road** — steering roughly straight across the terrain toward the target, with buildings and impassable terrain excluded. Roads/streets are the preferred, faster route; absence of a road doesn't strand a unit.

Node-to-node graph travel needs no per-frame search — the path is a walk over precomputed edges.

---

## Tactical movement — the hex grid

- **Local only.** The hex grid exists only where tactical movement is happening (a hot region / a city under the camera), materialized and collapsed with that region.
- **Cell size.** The minimum hex is **1.5 × a unit's (cat's) radius** — small enough for tight packing, large enough to hold one unit per hex with room to step.
- **Occupancy.** One unit per hex. Buildings and impassable terrain block their hexes; units never cross a blocked hex.
- **Direction.** Units normally move **perpendicular to hex edges** — the straight step from a hex to an edge-adjacent neighbour is the default motion.

---

## Formations & team-based edge passability

When units stand densely in a hex-grid **formation**:

- **Allied edge-threading.** A unit of the **same team** may pass *along the edges* between its allies' occupied hexes — threading between friendly units even in a packed formation, so a dense body never traps its own members.
- **Closed to other teams.** Those same edges are **closed to other teams**: an enemy cannot slip along the gaps through a friendly formation. A packed allied formation is a wall to enemies but porous to friends.
- General movement stays perpendicular-to-edge (hex-to-hex); allied edge-threading is the tight exception.

**Formation & shared edges, resolved.** A "formation" is not an explicit order — it is simply **any contiguous cluster of same-team units on adjacent hexes**. The edge rule is per-edge: an edge is friendly-threadable (and closed to other teams) only when **both hexes it divides are held by the same team** — an edge internal to one team's own cluster. When the two hexes flanking an edge belong to different teams (or one is empty), the edge is an ordinary contested boundary — the front line — not a threading shortcut for anyone.

---

## Movement goals — ambient units

Ambient character placeholders (the flying cats, see issue #8) **random-wander the graph**: pick a random road/street-connected neighbour, walk there, repeat — optionally biased toward the unit's home. This is the cheap, lively default for background population; it is deliberately not a destination/errand system.

---

## Mass / crowd movement

Movement is resolved **for a whole mass at once**, not only per-unit:

- Selecting a **crowd** and issuing a step moves **every selected unit one hex forward simultaneously** — one coordinated group move, not N independent path solves.
- The system is therefore *movement together with pathfinding*: a whole mass advances as a body, keeping formation, rather than each unit independently re-pathing.

**Blocked group step, resolved — blocked units hold, the rest advance.** When part of a mass's target hexes are blocked (buildings, enemies, the map edge, or a stationary unit), only the blocked units stay put this step; every unit with a free target advances. The move is never cancelled wholesale (one obstacle must not freeze the whole body), and the mass is not re-pathed as a single unit (kept simple and predictable) — over successive steps a formation naturally flows around an obstacle as its blocked edge catches up.

---

## Scale, performance & determinism

- The **graph** layer is cheap: precomputed graphs, node-to-node walks, no per-frame search.
- The **hex grid** is bounded because it's local — only the handful of active/hot regions carry one at a time.

**Determinism & LOD, resolved.** The hex grid **is part of the authoritative deterministic simulation** — it carries tactical/combat movement, which must be as deterministic as the rest of the authoritative path. It **materializes and collapses with its hot region**, on the same machinery pawns and orgs use (see DESIGN.md, "Identified vs. anonymous" and the hot-region trigger): going hot instantiates the grid deterministically from the region's authoritative state at a fixed tick point (seeded RNG plus recorded inputs, camera focus included — see "Determinism across transitions — relative to recorded inputs"); going cold collapses unit positions back onto the cohort/graph representation. The grid needs no separate persistence — it is derived from the region's state whenever the region is hot.

---

## Prototype first slice (issue #20)

The immediately implementable slice — the walking-cat placeholders — is the **street-graph wander**, without the full hex/formation/mass system yet: extract the corridor graph from a city's block layout and walk cats node-to-node along it, so they follow streets and never cross buildings. The hex tactical layer (formations, team-edge passability, mass movement) is the larger build that follows, once its open questions above are resolved.
