# New Lords — Pathfinding & Movement Spec

The single source of truth for how a settlement's resident cats (the walking flying-cat
heads, issue #8) — and any in-city units — move. A living document: resolved rules are
stated as fact; genuine gaps are marked **Open question**. Supersedes the LOD sketch in
`docs/DESIGN.md` ("pathfinding is ring-sampling + steering, not per-pawn A*").

---

## Model — a local hex grid the residents walk

In-city movement is on a **hex grid** laid over a settlement, not free steering toward
random points:

- **Local only.** The grid exists only for a **hot city** (under the camera, or holding an
  own squad) and is materialised and collapsed with that region on the same LOD boundary the
  walkers and pawns already ride (see DESIGN.md, hot-region trigger). There is never a
  planet-wide grid.
- **Buildings block; everything else is free — the "lot" model.** A hex is **blocked** when
  its centre falls inside a building footprint. **Every other hex in the city disk is free
  and walkable** — cats use the streets *and* the courtyards between buildings. (The
  alternative "block" model — only the corridors between whole quarters are free — was
  considered against this one and **rejected**; the owner chose the lot model, 2026-07-18.)
- **One cat per hex.** Occupancy is exclusive.
- **Cell size — 1.5 × the cat-head radius (resolved).** The hex inradius is
  **1.5 × the cat-head radius** (≈`0.00036` surface units) — "just larger than a head", the
  owner's calibration from rendered size variants (2026-07-18). This physical size is
  **constant across city tiers**; only the cell *count* scales with a city's area — roughly
  **5k free hexes** for a `city`, up to ~9k for a `megalopolis`, fewer for villages and camps.

---

## Movement — one synchronous tick, everyone steps at once

All cats move **together**, in lockstep — the core feel the owner asked for ("головне, щоб
всі юніти рухались одночасно"). On each movement tick **every cat advances one hex at once**
— a single group step, not N independent path solves nor per-cat clocks:

- **Ordered cats step toward their goal.** A cat carries a target hex; its step this tick is
  the next hex along a path to that target (pathfinding over the free-hex graph — 6
  edge-adjacent neighbours — routing around buildings and, where it matters, occupied hexes).
- **Unordered / arrived cats wander.** With no order, a cat targets a **random free
  edge-adjacent neighbour** — the cheap, lively background behaviour for the resident
  population (issue #8), not an errand system.
- **Blocked step — blocked hold, the rest go.** If a cat's next hex is occupied or blocked
  this tick, that cat stays put; every cat with a free target still advances. One obstacle
  never freezes the whole body.
- **Smooth between ticks.** A cat slides from its old hex centre to the new one over the tick
  interval, so lockstep reads as walking rather than teleporting.

**Open question (calibrated by eye in step 5).** Whether the group truly steps in a single
synchronous tick (strict lockstep) or each cat glides its path at its own cadence while still
moving "together" — the owner will pick from the running prototype.

---

## Test harness (issue #20) — RTS-style, so pathfinding is watchable

The grid and movement are exercised the way the owner asked to test them:

- **Spawn.** An explicit control drops N test cats onto free hexes of the hot city
  (independent of the worldgen population), one cat per hex.
- **Select.** Left-drag a screen-rectangle selects the cats inside it; Shift-drag adds;
  clicking empty space clears. Selected cats are framed (the universal selection frame, #49).
- **Order.** Right-click a target hex moves the selected group there — they path to it and
  advance together; the rest keep wandering.
- **Grid overlay.** Toggled with the `H` key.

*(Control bindings are provisional defaults, refined as the harness is used.)*

---

## Strategic travel — between settlements (unchanged, out of prototype scope)

Movement between settlements follows the **inter-settlement road graph** from worldgen (see
DESIGN.md, "Caravans on roads"): node-to-node over precomputed edges, no per-frame search;
an **off-road fallback** steers roughly straight when no road connects origin and
destination, excluding buildings/impassable terrain. This layer is orthogonal to the in-city
hex grid and is out of scope for the resident-movement prototype.

---

## Determinism

Resident wander is **cosmetic** and is deliberately kept out of the seeded authoritative
sim stream (as the current walkers already are), so it needs no determinism or hashing.

---

## Out of scope — reverted

The earlier **tactical combat hex layer** (issue #43 / PR #46) — team-based edge passability,
dense formations, per-team mass combat moves, a deterministic grid hash — was **reverted
(PR #53)** and is **not** part of this model. Walking residents don't need it. Authoritative
tactical/formation combat, if ever wanted, is a separate future design — not a default
revival of #43.

---

## Prototype slice (issue #20)

Built in small, owner-reviewed steps:

0. **Remove the reverted #43 layer.** ✅ Stripped `buildHexLayer` / the `HEX_*` primitives /
   the tactical HUD so movement starts from a clean base.
1. **Grid over one hot city + size calibration.** ✅ Lay the hex grid on a hot city; mark
   building hexes blocked, the rest free; render it (`H` toggles). Hex size resolved to
   1.5 × head radius from rendered variants.
2. **Spawn test cats onto hexes.** Drop N cats onto free hexes, one cat per hex.
3. **RTS box-select.** Left-drag selects a group of cats; frame the selection.
4. **Group move + pathfinding.** Right-click a target hex; the selected group paths there and
   steps together (blocked hold, the rest go).
5. **Continuous ticking, wander & density.** Run steps on a cadence; unselected residents
   wander; scale resident count to the city footprint; calibrate the step feel.

The grid rides the existing materialise/collapse LOD boundary; when the city goes cold, the
grid and its residents collapse with it.
