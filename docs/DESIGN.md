# New Lords — Design Document

A single-player systemic strategy game about organizations — political, business, and criminal actors — built from People and Property, simulated at a scale from a handful of pawns in a firefight up to a world of thousands of settlements. This document describes how the game works: its systems, mechanics, and the open design questions still being worked out. It's organized by game system, not by when a decision was made.

Sections marked **Open question** are genuinely undecided — read them as invitations to rule on, not gaps in the writing.

---

## Organizations

The world is made of **organizations** — the fundamental political/economic actor. This is the spine the rest of the design hangs off: a **side/team = an independent political org**; **leaders** = an org's leadership; **enterprises** = economic orgs; **diplomacy** = relations between independent political orgs.

The game's core premise is a **mechanically-simulated world, not a decorative one**, built from three pillars: **Organizations** (political / business / criminal — composed of People and Property, led by a Person, with slots, rules, and perks), **People** (characters — who can lead an org, occupy a slot, or own property), and **Property** (owned by orgs or people). Kinship/family is not a fourth pillar or an org kind — it's a relationship between People (see Succession, below).

- **Organization ≠ leadership type.** The org is the actor; **leadership type** (monarch / city council / entrepreneur / mercenary / economic / anarchic, plus **warlord** — earned only via bandit conquest, excluded from the normal reform pool, see "Bandits & outlaw factions," below) is a **mutable attribute**. Org leaders make **decisions** — change leadership type, take a **perk/trait** (which may change type or leader count), set policy.
- **Leader count is the `Leader` post's capacity, not a separate rule.** It's unified into the same capacity table as the other organizational posts (see "Organizational posts," below): monarch 1, council ~9, mercenary 2, economic 1, anarchic 0 (no formal leader, headless), warlord 1 — **except `kind:'squad'`, `kind:'network'`, `kind:'intelligence'`, and `kind:'secret_police'` orgs, whose `Leader`-post base is hardcoded to exactly 1 regardless of leadership type.** This is a deliberate, resolved override: the leader-centric squad simulation's foundational claim that a squad has exactly one intelligent leader takes priority over the general leadership-type table for squad-kind orgs specifically, and `network`-, `intelligence`-, and `secret_police`-kind orgs all answer to that same single-handler model (see "Agent networks," below — `military` stays on the ordinary table instead, since it's administrative, not a single-handler operation). A squad, network, intelligence, or secret-police org that wants a second leadership seat gets there only through the **Council of Equals** perk (below, +1 `Leader`-post capacity), never through leadership-type alone.
- **Political vs non-political:** a political org has an **influence zone** and sets **policy** (laws, e.g. tax rate) within it. Non-political orgs have only a "political element" and can **become** political (e.g. an entrepreneur that grows to control a settlement).
- **Hierarchy / containment (Crusader-Kings-style):** a parent-chain of orgs; an **independent** org (no parent) tops a tree of subordinate orgs (council members, village heads, enterprises). Clicking an independent org lets you drill into everything beneath it. How much a single org can directly hold is governed by **organization capacity** (below) — a set of per-org caps, not a flat tree-depth limit; overall tree depth stays uncapped and self-regulates through the same utility-AI cost/benefit weighing that governs every other org decision.
- **Ambition = base mechanic:** every org's AI seeks power — grow strong, become political, become independent. (In design language this drive is expressed as **utility**/**decision weight** — see Leader-trait-driven utility AI, below; `ambition` names the same quantity.)
- **Free city:** an independent settlement run by an **auto-created political org** (e.g. a city council) — alive, not an inert decorative tile; there are no "barbarians." It's defended by a **garrison squad** that holds position and fights through the normal combat system. Capturing it re-parents or destroys its governing org, ending its independence; regaining independence afterward routes through the internal-factions system (below).

**Management slots.** A control layer independent of the org-parent hierarchy (which stays a pure territorial/political containment tree). A **slot** = `{ controllerOrgId, controlledOrgId, salary, slotType, traits[] }`: any org — political, economic, or squad — may occupy a slot in another org, regardless of parent-tree membership (a political org may occupy a slot in a foreign political org and influence it). The occupant receives periodic **salary** from the controller's treasury plus influence/bonuses from the slot type; per-slot traits modify the relationship. Salary feeds the occupant's **loyalty** — low pay lowers loyalty and risks the slot breaking or the occupant defecting.

Slots are **additive, not gating**: an occupied slot doesn't require a salary — it can be a bare capability grant (e.g. "lets you create/hire a squad") with zero financial effect. Salary, where it exists, is one optional modifier, and the direction isn't fixed in principle — a controller can pay the occupant, or tax/take income from it (v1 defaults to controller-pays-occupant; making it direction-agnostic is future work). **Every org has its own independent economic state** — being unslotted does not mean "no economy"; a fully independent org still has money and income. Multiple orgs can affect one org simultaneously through separate slots (e.g. two rival "protection" orgs both taxing the same target, plus a third org just raiding it with no slot relationship at all).

**Squad-as-org.** Every squad is a **full org entity** (its own identity and treasury), not a lightweight stub — it participates in the same slot and AI machinery as political and economic orgs, via one shared code path for all actor types. This also means every squad is tax/upkeep-liable — squad upkeep and creation cost will need a balance pass once population dynamics are observed in playtesting. A lower-level "plain squad, no paired org" primitive exists for movement/combat internals, but every squad the game actually spawns — city garrisons, settlement reinforcements, bandit bands, player squads — is org-backed.

**Leader-trait-driven utility AI.** Org decisions (grow power, seek independence, seek internal power, accept/break a slot) are a **utility-score model weighted by the current leader's traits** — a non-ambitious leader yields a passive org. Concretely, trait modifiers stack additively onto the org's base utility weight: **ambitious +0.35, passive −0.35, greedy −0.15, content +0.15**. These feed the org's expand/recruit/reform/become-political decisions. Salary satisfaction (from management slots, above) is one of the weighted utility terms.

Planned refinement: split the single weighting into separate per-decision weights — an **expansion drive**, an **independence-seeking** drive, and an **internal-power-seeking** drive — instead of one uniform ambitious/passive scaling across all decision types. This depends on independence and internal power being tracked quantities, which requires management slots and squad-as-org (both above) as prerequisites.

**Simulation mode — click-to-intervene.** The player may click **any** squad or org **at any time** and instantly take control to issue one order/intervention (redirect a squad, change policy, set a slot's salary). For a **squad**, control returns to the leader-trait-utility AI via an explicit "return to auto" action — there's no click-away or timeout trigger, it's a deliberate hand-back, not automatic. For an **org**, there's no need for an explicit return trigger at all: org decisions were never paused to begin with, so the AI simply resumes deciding on the next tick after the player's intervention. Either way there's no persistent mode switch — a free observe/intervene loop over a living AI ecosystem (management slots, squad-as-org), and the rest of the simulation keeps running throughout; the pause/override is scoped to the one entity being intervened on.

**Player Mode.** Distinct from Simulation Mode above — a session-start choice of **one persistent character** the player controls for the whole session: this is where the game begins. The player picks an **existing NPC leader** (reusing whatever leader/character entities the simulation already generates). The unit of control is the **character**, not the org — an org is reached transitively through the character's leadership — so switching avatar mid-session is just picking a different character. If the chosen Person **loses leadership** (a succession crisis, a coup, a broken slot) or otherwise ends up without any org, they **persist as a living character with no org** — not game over, not a forced new pick; the player can seek a new slot/org, or simply observe until one opens up. There's no win/loss condition — the core loop is observing and intervening as your chosen Person, matching the game's sandbox nature.

Selecting a character **pins** every squad-org in that character's own org's subtree into persistent manual control (walked through the full hierarchy, so nested/subordinate squad-orgs are included, not just directly-led ones) — reusing the same manual/auto toggle Simulation Mode uses, just made "sticky" instead of one-shot. Switching avatar unpins the previous avatar's squads (back to AI control) before pinning the new one; deselecting an avatar returns to pure observation.

- **Scope decision:** the pin does not re-apply automatically when a leader dies and control passes to a successor via the (lazy) succession hand-off — only an explicit avatar (re-)selection pins squads. Pinning stays limited to explicit selection, since a mid-session leader death briefly leaving squads on auto-control is a rare edge case with no visible gameplay gap.
- Session-start selection is a simple click-to-pick list of every character currently leading an org, shown before the world becomes interactive.
- A squad under the player's controlled org is orderable via the normal order UI even when it doesn't share the player's overall faction — it only needs to be pinned by Player Mode selection. The org policy panel (tax rate, income-source toggles, slot creation/breaking) is only editable for the player's own controlled org; a non-controlled org keeps every control disabled or read-only.
- **Open question:** at what point does walking a large org's full subtree on every avatar switch become expensive? There's no stated depth limit on the org hierarchy (see above), and every squad is its own org with no guaranteed dissolution path (see Org lifecycle, below) — for the top of a very deep, heavily-subdivided empire this walk is uncapped. Switching avatars is rare, not a per-tick cost, so this may not matter in practice, but there's no stated ceiling (see also the org-count-budget question in the LOD section, below).

There's also a separate, not-yet-specified **Editor/world-builder mode**, out of scope for v1.

Player Mode's session-start picker (choose an existing NPC leader) and the Experience system's `playerRole` (found a **new** character/org from a starting kit) are two different answers to "how does a session begin," and it isn't yet decided whether the eventual start screen unifies them into one flow or keeps them as separate entry points — see the open question in "Experience-driven architecture," below.

**Org slot kinds — control / influence.** Slots carry a `kind: 'control' | 'influence'`, layered onto the existing slot shape.
- **`control`** — the default kind: the occupant literally runs/commands that function (e.g. a garrison squad-org). Creating one uses a simple default-then-edit flow — it's filled immediately with a reasonable default occupant/salary/type, then edited or broken as needed; there's no separate occupant-picker dialog.
- **`influence`** — a softer effect: an occupant can sway decisions/policy without literal command authority.
- Each org kind exposes its own small set of default slot kinds; the exact per-kind template is a tunable, reversible default.

**Visibility — a property, not a kind.** Any edge that can plausibly be hidden — an `influence` slot, the parent/child hierarchy link, an agent edge — carries its own `visibility: 'public' | 'covert'`, orthogonal to its kind. `control` and `alliance` stay always-public; there's no established case yet for hiding either. This replaces what used to be three separate bespoke mechanisms (a `covert` slot kind, a wholly separate "secret ownership" hierarchy mechanic, and the agent edge's own hidden-by-default rule) with one shared rule, detailed next: what used to be called a "covert slot" is simply an `influence` edge with `visibility: 'covert'`; what used to be called "secret ownership" is simply a hierarchy edge with `visibility: 'covert'`. Same unlock cost, same exposure risk, same consequence, regardless of which underlying edge is hidden.

**Organizations relate through a graph, not a single link.** The one parent/child hierarchy line (territorial and political containment) is itself drawn as an edge on this graph, alongside any number of simultaneous slot-relationships between the same two organizations, each independently created, salaried, and broken — this is the organization graph: nodes are organizations, edges are the hierarchy link plus slots. An organization commonly sits inside several such edges at once (e.g. independent, but paying salary into two allied organizations' control slots, while itself hosting a rival's covert-influence slot it doesn't know about).

**Alliance — a fifth slot kind, symmetric.** Unlike control/influence/covert (which are directional: a controller occupies a slot inside a controlled org), an alliance is mutual between two independent organizations — modeled as a paired slot in each direction, created and broken together as one action. An alliance carries no salary by default; its effect is a standing diplomatic guarantee (allied organizations can't be at war with each other, and typically share some visibility into each other's forces) rather than a command relationship. Breaking an alliance is a distinct action from breaking a control/influence slot (mutual withdrawal, or one side unilaterally reneging — with a relations/loyalty cost for reneging).

**Financial investment — a funded variant of influence.** Where a plain influence slot is a free-floating soft sway with no cost, an investment slot is the same soft-influence effect but explicitly purchased: the investor pays a one-time or ongoing sum into the target's treasury, and the size of that payment scales how much sway the slot grants (a token gift barely moves the target's decisions; a large capital injection meaningfully does). This reuses the influence-kind mechanics wholesale — investment isn't a sixth kind, it's influence with a stated funding size attached, giving designers one lever (money in) instead of two disconnected systems.

**Covert visibility, resolved.** Rather than staying permanently locked pending a future perk system, flagging any coverable edge (influence slot or hierarchy link — see "Visibility," above) `covert` costs an upfront secrecy fee proportional to the target's own counter-intelligence (its leader's traits, garrison presence, or a future dedicated counter-intel stat) instead of requiring a perk. Exposure — a chance/intel event that flips the edge back to public — carries the same consequence regardless of which edge it was: a relations hit for the owner, and a chance the target's internal factions trigger a revolt/break rather than accept the newly-revealed arrangement. Exposure risk scales with how long the edge has been covert and how large its effect is — a small covert nudge is safer to maintain than an aggressive one. An agent edge (see "Agent networks," below) carries `visibility: 'covert'` by default under this same rule, rather than a bespoke hidden-by-default exception.

**Paid interaction unlocks — a slot upgrade, not a new mechanic.** Any existing control slot (most commonly a hired squad-org) can be upgraded piecemeal by paying an additional one-time fee to add a specific extra right on top of the base relationship — direct tactical command in battle (rather than only issuing high-level orders), the right to disband the occupant outright, or the right to reassign it to a different controller without its consent. Each right is its own toggle with its own price, not an all-or-nothing tier — a player can pay for battlefield command without also buying disband rights. This turns "hire a mercenary company" from a single binary relationship into a menu: hire cheaply for basic obedience, then spend further to buy the specific extra leverage a given campaign needs.

**Who can reassign a controlled org's leader or posts.** Two distinct relationships carry this right, independently of each other: holding a **control slot** over another org, or being that org's **direct parent** in the hierarchy. Either one grants reassignment of the target's leader and posts (see "Organizational posts," below), but only when the target's kind is `squad`, `business`, `political`, `military`, or `intelligence`. Influence and alliance edges never grant this right, regardless of target kind, and neither does the hierarchy link when the target's kind is `network` or `secret_police` — their single-handler model doesn't take an outside-imposed reassignment. Reassigning a leader this way triggers the same consequences as any other leader change (loyalty shock, rebellion roll — see "Succession crises," above).

**Organizational posts.** An org fills a small set of named posts from among its own members — **Leader**, **Advisor**, **Bodyguard**, **Negotiator** — the same four posts for every org kind and leadership type, `Leader` unified into this same system rather than a standalone concept (a resolved simplification: leader count used to be its own rule, now it's just this table's first column). Each post is filled from an existing member (the same pool the heir picker draws from); filling one doesn't grant membership by itself, and a vacant post simply grants nothing — except `Leader`, whose vacancy and continuity are governed by the existing succession/heir system (see "Succession crises," above), which stays specific to the `Leader` post and doesn't extend to Advisor/Bodyguard/Negotiator.

Each post's benefit scales with a skill the occupying character carries (see "Character skills," above): `Leader` and Advisor both scale with **Management** (the leader's contributes as the base of org Management, the Advisor's as an additive bonus on top — see "Org Management, a derived stat," below), Bodyguard with **Melee combat**, Negotiator with **Socialization**. **Post capacity** joins the other per-kind/leadership-type capacity dimensions (see "Organization capacity," below) — one counter per post, base by kind and leadership type, raised or lowered by perks like any other capacity:

| Kind / leadership type | Leader | Advisor | Bodyguard | Negotiator |
|---|---|---|---|---|
| political / Monarch | 1 | 1 | 2 | 1 |
| political / City Council | ~9 | 2 | 1 | 1 |
| business / Entrepreneur | 1 | 1 | 0 | 1 |
| squad / Mercenary | 1 (override) | 0 | 1 | 0 |
| network | 1 (override) | 0 | 0 | 1 |
| military | ordinary leadership-type table (not overridden) | 1 | 1 | 0 |
| intelligence | 1 (override) | 1 | 0 | 1 |
| secret_police | 1 (override) | 0 | 1 | 0 |

**Org Management, a derived stat.** An org's current Management capability is computed, not stored: the leader's own Management skill, plus a bonus from a filled Advisor post. What this aggregate feeds — which slots or future mechanics read it — is deliberately left open; only the computation and its display are in scope here.

**Observing the graph.** Inspecting organizations one at a time (an organization's own controlled slots, or one specific other organization) is not enough to see the web of relationships — that needs a single view of the graph itself. A dedicated Organization Graph view (nodes = organizations positioned by rough political proximity, edges = the hierarchy link plus slots, styled by kind — a thin plain line for the parent/child hierarchy edge, solid for control, dashed for influence/investment, a double line for alliance, a dotted line for an agent edge (see "Agent networks," above) — with any edge currently flagged `covert` (a hierarchy link, an influence slot, or an agent edge) hidden entirely except per the Viewpoint control, below) makes the web of relationships legible at a glance, and doubles as a navigation surface — clicking a node jumps the camera/inspector to that organization, following the clickable-instance convention (see UI conventions). Not yet decided: whether this is a standalone full-screen view, a mode of the inspector panel, or both.

**Organization Graph — property nodes and view filters, resolved.** The graph's nodes aren't only organizations — an org's owned property (its settlements, enterprises; see "Property — a first-class type," above) can also appear as a node, attached to its owning org by a distinct ownership edge (its own visual style, separate from the six edge kinds above, since ownership is a different relationship: passive, single-owner, not a management slot). Because most political orgs own a settlement and most business orgs own an enterprise, showing property this way means an org with zero slot-relationships to any other org is still very often *not* a bare, edgeless dot — it at least connects down to what it owns. Three view-only toggles (observation tooling, not gameplay — they don't change simulation state, only what's currently drawn) make this legible instead of overwhelming:
- **Hide property** — collapses the view back down to organizations only, hiding every property node and ownership edge, for when the player only cares about org-to-org politics and not the underlying asset ownership.
- **Focus on selection** — when an organization is selected, show only organizations reachable from it through any chain of slot edges, any number of hops, any edge kind (this reachability check always considers the true full graph, independent of whether covert edges are currently drawn) — hiding every organization outside that connected component. With no organization selected, this toggle has no effect (nothing to focus on yet).
- **Viewpoint** — a single control, defaulting to **Spectator**: an omniscient view showing every edge, `covert`-flagged ones included, regardless of ownership or exposure. Switching it to a specific organization applies a participant filter instead: every edge that isn't flagged `covert` (control, influence, alliance, investment, ownership, and a public hierarchy link) stays visible as always, but a `covert`-flagged one (whether it's a hierarchy link, an influence slot, or an agent edge) only shows if the selected organization owns it, or if it's already been exposed against that organization — everything else hidden. Switching back to Spectator clears the filter.

**A large fraction of organizations having no slot-relationship to any other organization at all is an expected, normal end state, not a bug or a generation failure** — most bandit squad-orgs, most small independent businesses, and any org that simply hasn't been drawn into a hire/alliance/investment/covert relationship yet will legitimately sit at zero graph-degree. The graph view's job is to make that sparse, uneven connectivity easy to navigate (via the two toggles above, plus laying out zero-degree organizations in their own uncluttered area rather than letting them drift randomly through the connected structure), not to force artificial connections that make the graph *look* denser than the underlying org population actually is.

**Open question:** should alliance, investment, and paid-unlock rights be visible to organizations outside the relationship (the way a control slot already is), or does an alliance's mutual-guarantee effect apply even if neither side wants it publicly known? The current design assumes alliances are public (that's what makes the war-block guarantee credible to third parties) and investments/paid-unlocks follow the visibility rule of whatever slot kind they're built on — but this hasn't been explicitly ruled on.

**Org inspector.** The panel shows a lot at once — name, leader + heir picker, member count, ambition, tax rate, leadership type, kind, a labor-pool "workers X/Y" readout (distinct from management slots), owned property (as clickable entries that jump the camera to that property), controlled slots, supply policy, and recursive children. Every edit control gates to player-controlled orgs (see UI conventions: "Org panel: read-only for non-controlled orgs") — letting the player edit a random NPC org would read as inconsistent.
- **Open question:** should there additionally be a genuinely read-only overview panel (name / leader / independence / owned property / member count), separate from an editable org-policy panel — or is uniform gating of every edit control enough? Should nested child orgs collapse by default instead of always rendering inline? Does the "workers" labor-pool readout belong in the default view at all?
- Open item: org membership as its own clickable roster in the main org view (not only inside the heir-selection control) — a possible follow-up.

**Internal factions / revolt.** Subordinate orgs have a **loyalty** scale fed by a CK-style **opinion** (archetype incompatibility · own power vs parent · high taxes/poverty · time under rule). Below threshold the **opponent** faction wins → **secede** (new independent org) or **coup** (leadership changes), optionally purging losers. Loyalty is shown on the org.

**Succession crisis.** On a leader's **death or handover**, each subordinate org rolls a rebellion probability: `base + lowLoyalty + powerGap − newLeaderLegitimacy` (tuning constants). Loyalty compares the subordinate's opinion of the **old** leader against the **new** one (reusing the internal-factions loyalty/opinion model). Below the threshold, the subordinate either **secedes** (new independent org) or **backs a rival claimant**, routed through the same internal-faction mechanics rather than a separate combat path.

V1 rules: opinion is archetype-compatibility + own-power-vs-parent + tax rate + time-under-rule (a poverty modifier is deferred — it needs a callback into the economy system and can be introduced later). Org power is approximated simply as member count. The pool of possible new leadership types on a coup excludes economic and anarchic types. New-leader legitimacy varies by how the successor was chosen: a designated heir carries the most legitimacy (**0.6**), a promoted senior member less (**0.35**), a generated stranger the least (**0.1**). The crisis roll only happens as part of the org's own regular simulation step (where the deterministic randomness lives) — a leader death outside that step still promotes a successor but doesn't roll the crisis; combat deaths, which do pass through the regular step, do trigger it. Seceding severs the parent link outright, with no seat/faction transfer.

"Back a rival claimant" only forks the secession branch (a coup stays untouched). Its outcome is a **throne-seizure**: the claimant's org takes over the parent org's leadership, the claimant's own org **stays subordinate** (no merge), and its own vacated leadership seat gets a **fresh promotion** rather than being left headless. A tunable chance parameter (default 0.35) controls how often "back a claimant" occurs versus a straightforward secession; at 0 it reduces to always-secede.

- **Open question:** does this apply unmodified to squad-orgs? Since every squad is a subordinate org, and squad leaders die in combat far more often than political or business leaders, taken literally this means every combat death of a squad leader rolls the same rebellion-probability formula a duke's death would — including a chance of an in-battle squad spontaneously seceding from its parent faction. See the open question in "Layered squad behavior + leader-centric simulation," below, for the fuller analysis; this is a real trade-off between simplicity/uniformity and battlefield-appropriate pacing, not resolved here.

**Play as a character + succession.** The player model: a human **plays a character** (a leader inside an org), can create/join an org, and on death control passes to a chosen **heir**, Crusader-Kings-style.

**Economic orgs.** `leadershipType:'economic'`, non-political — farms, mines, weapons-makers, construction. **Production chains** turn raw goods into products (`consumes`/`produces`): farm → **food**, mine → **materials**, weapons-maker (materials → **weapons**). Food feeds population growth; materials feed construction/buildings. Economic orgs grow over time. Hierarchy is flexible: parent can be null (independent) or a political org (dependent), changeable at runtime via ambition or internal factions.

Income sources are a **per-org-kind policy**, not one left/right toggle. An org's `incomeSources` is a mutable subset of `{tax, production, salary, loot, donation, fees}`, constrained by which sources its `kind` is allowed to use — mirroring how leadership-type reform can only reach a subset of leadership types. Core set: `tax` (political orgs, via tax rate and the ownership-modifier table below), `production` (business orgs, via enterprises), `loot` (bandit squad-orgs), and `salary` (squad-orgs occupying a paid control slot). Two additions: `donation`, tied to a new **religious** org kind — collecting it requires an actual presence/congregation (owning a temple/property in a settlement, mirroring how political tax requires owning a city, not a global passive trickle), scaled by the population served; and `fees`, a production-chain recipe that outputs money directly instead of a physical resource (e.g. a "dojo" enterprise), reusing the standard production pipeline. A business org can combine sources its kind allows (e.g. `production` + `fees`) — for instance a training enterprise that also takes patronage from a political sponsor via a slot.

This part of the org-kind/income model is still evolving — treat exact numbers as fluid — but the three-pillar framing (Organizations / People / Property) and "slots are additive, not gating" are considered stable.

**Org decisions & ambition.** Org-level decisions (`BecomePolitical`, `ChangeLeadershipType`, `TakePerk`, `Expand`) are scored by the same utility model, driven by the power drivers **wealth + territory/influence + military strength**. Runs on a **slow, visible cooldown** (an unobtrusive progress bar and short label per org) rather than continuously. Independence is **not** a simple threshold — it routes through **internal org factions**: loyalists vs. opponents/rival claimants, where a winning opponent faction secedes or takes over.

**Founding a subordinate organization, resolved.** Any org can found a brand-new org with itself as parent — spending resources to become someone's *direct* parent, rather than merely occupying a slot inside them. The child's kind is chosen at founding time; the action is gated by whichever subordinate-kind capacity applies (subordinate-squad, subordinate-business, or subordinate-political — see "Organization capacity," below) and costs a lump sum debited from the founder's own treasury (a tuning default, not fixed here). This is a distinct mechanism from a **character** founding a wholly independent squad-org from personal funds (see "Founding an independent squad-org from scratch," above) — that one has no parent at all; this one always does. **REPLACE**, one of a squad's three city-capture options (see "City capture by a squad," below), is a concrete instance of this general action: found a political-kind subordinate, transfer the captured settlement's ownership to it.

**Organization capacity — direct-control limits.** Rather than one flat cap on how deep or wide the org tree can grow, every organization has a small set of **capacity limits** on what it can directly hold at once, split by the *purpose* of the relationship rather than lumped into one counter:

- **Control-slot capacity** — how many control-kind slots it holds as controller, where the occupant stays its own independent org (hired squads, hired businesses — mercenaries, not vassals).
- **Subordinate-squad capacity** — how many squad-kind orgs it can hold as direct parent-tree children (not slots): a political org's own standing garrison force, a business org's worker squads staffing its enterprises, or a squad-org's own temporary detachment (see "Split squads and reserve pool," below). One dimension serves all three cases — a political org fields a squad in a garrison role exactly the way a business org fields one in a worker role.
- **Subordinate-business capacity** — how many business-kind orgs it can hold as direct children (a nationalized enterprise's owning business org, or a business's own rare sub-subsidiary).
- **Subordinate-political capacity** — how many political-kind orgs it can hold as direct children — the classic Crusader-Kings vassal chain (monarch → city council → village council).
- **Alliance capacity** — how many simultaneous alliances it can maintain.
- **Enterprise-ownership capacity** — how many enterprises it can directly own. A political org's capacity here stays at 0 by design — it only ever reaches an enterprise through a subordinate business org (above), never a direct ownership edge.
- **Agent-network capacity** — how many concurrent agent edges it can run (see "Agent networks," below).
- **Post capacity** — one counter per named post: `Leader`, Advisor, Bodyguard, Negotiator (see "Organizational posts," above). `Leader`'s base is the leadership-type table above, or 1 for the kinds with the single-handler override (see the leader-count override, above).
- **Caravan capacity** — how many squads it can have toggled into Caravan mode.
- **Property capacity** — how much property it can directly own overall (settlements, enterprises, vehicles combined — a ceiling above enterprise-ownership capacity specifically).

Each capacity's **base value is set by org kind and leadership type**, illustrated below for the archetypes discussed so far — the exact numbers are a tuning pass, not final:

| Kind / leadership type | Control-slot | Subordinate-squad | Subordinate-business | Subordinate-political | Alliance | Enterprise-ownership | Agent-network |
|---|---|---|---|---|---|---|---|
| political / Monarch | 2 | 3 | 2 | 5 | 3 | 0 | 0 |
| political / City Council | 2 | 2 | 3 | 2 | 2 | 0 | 0 |
| business / Entrepreneur | 1 | 2 | 1 | 0 | 1 | 2 | 0 |
| squad / Mercenary | 0 | 1 | 0 | 0 | 1 | 0 | 0 |
| network | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| military | 1 | 8 | 0 | 0 | 1 | 0 | 0 |
| intelligence | 0 | 0 | 0 | 0 | 0 | 0 | 6 |
| secret_police | 0 | 1 | 0 | 0 | 0 | 0 | 1 |

A City-Council-led political org's subordinate-political and subordinate-business bases scale with the settlement tier it governs (a village-tier council starts smaller than a megalopolis-tier one), rather than needing a separate "village council" archetype of its own.

**Perks are the primary way to raise a capacity above its base**, on top of whatever kind/leadership-type already grants — this is the resolution to "how big can an org get": not a hard global ceiling, but a chain of deliberate, permanent, trade-off-bearing choices (below), so a heavily-perked organization visibly earned its size rather than growing it for free. A capacity can also be *lowered* by a perk, as a genuine trade-off for a bigger benefit elsewhere (e.g. a perk that grants a strong economic bonus in exchange for a smaller control-slot cap). This reframes the earlier open question about tree depth/width: **per-node width is capped (base + perks), tree depth is not** — a deep tree is still possible, it just requires many separate orgs each independently earning their own width capacity, which naturally self-limits without needing an arbitrary depth number.

**Political & organizational perks.** Beyond leadership type and kind, an organization can accumulate **perks** — permanent traits chosen once and kept for the organization's lifetime, layered on top of everything else described above. This is deliberately the game's main **replayability** lever: which perks an organization draws and picks shapes what kind of organization it becomes and what playing it feels like, far more than its starting kind or leadership type alone.

*Acquisition.* An organization is offered a perk choice when its power (the same wealth + territory/influence + military-strength score used for org decisions elsewhere) crosses a milestone — a slow, occasional event, not a frequent one. When offered, the game deals **three candidate perks**, drawn from the pool currently eligible for that organization (filtered by its kind, its leadership type, and which perks it already holds — see prerequisites and exclusions below); the player picks one or declines all three and waits for the next offer. An AI-controlled organization runs the exact same three-card offer through its utility-AI scoring (the same framework used for `TakePerk` as one of an org's core decisions) — an ambitious leader favors perks that grow military or economic power, a content or passive leader favors perks that increase stability or unity, so different leader traits produce visibly different perk choices across AI organizations without any perk-specific AI code.

*Perks are permanent and mutually reinforcing, not a simple stat buff.* Every perk pairs a real upside with a real downside — never a pure bonus — so taking one is a genuine identity choice, not a strictly-better option. Some perks have prerequisites (a specific kind or leadership type, or an earlier perk already taken, for a light sense of a perk tree); some come in mutually exclusive pairs (taking one locks out its opposite permanently).

*Perks surface as effects, not as a collection.* Taking a perk applies its capacity/stat changes directly (e.g., Free Company Charter reads as "+2 control-slot capacity" on the org's own capacity numbers, not as a standing "Free Company Charter" badge). The org's internal record of which perk IDs it has taken exists only to drive the prerequisite/exclusion checks and the offer pool (above) — it's never its own browsable "perks held" list anywhere in the player-facing UI. The one place a perk's name is still visible is the event/history log, as a dated entry recording when it was taken.

*A kind/leadership-type prerequisite stays live, not just a one-time gate.* A perk taken while its kind or leadership-type prerequisite was satisfied keeps that prerequisite as an ongoing condition on its effect, checked continuously rather than only at acquisition: change away from the required kind or leadership type and the effect switches off; change back and it resumes automatically. The perk's own record (held for the prerequisite/exclusion checks above) is never lost or re-rolled — only whether its effect is currently active toggles with the match.

*Example perks:*

| Perk | Requires | Effect | Trade-off |
|---|---|---|---|
| Light Infantry Doctrine | squad-kind org | squads move faster | squads may not equip ranged weapons |
| Siege Tradition | squad-kind org | bonus damage against garrisons and settlements | squads move slower |
| Standing Army | squad-kind org | lower squad upkeep | lower squad cap |
| Matriarchy / Patriarchy *(mutually exclusive pair)* | council leadership | leadership seats restricted to one gender; a unity bonus — higher loyalty, more resistant to internal-faction splits | half the character pool is ineligible for any leadership seat, including succession |
| Meritocratic Charter | any political org | succession always favors the most capable eligible character over the closest blood relative; higher new-leader legitimacy | smaller eligible pool per vacancy, so a seat can sit empty longer |
| Hereditary Right | monarch leadership | succession always goes to a designated heir, removing the low-legitimacy "generated stranger" outcome entirely | no ability to pick a stronger successor over the bloodline |
| Council of Equals | any org | +1 `Leader`-post capacity beyond what the leadership type normally allows | decisions requiring leader agreement resolve more slowly, and the added leader can disagree, occasionally blocking a decision the utility model would otherwise take |
| Expansive Charter | political org | +2 control-slot capacity (more control slots it can hold as controller) | +1 tax-rate-sensitivity to loyalty — subordinates resent tax increases more |
| Mercantile Network | business-kind org | +2 enterprise-ownership capacity | −1 control-slot capacity — a sprawling business struggles to also field hired muscle |
| Free Company Charter | squad-kind org | +2 control-slot capacity (more squad-kind orgs it can keep on active hire at once) | +upkeep cost per hired squad — a bigger free company is a more expensive one |
| Trade Convoy Rights | any org | +3 caravan capacity | each caravan under this org carries a slightly higher ambush-risk profile — a larger convoy operation draws more attention |
| Landed Estate | political or business org | +property-ownership capacity | slower to raise a new army — this org's utility weighting shifts toward holding what it has over expanding militarily |
| Guild Charter | business-kind org | enterprises the org owns produce more | the org's economic policy is locked to laissez-faire, forfeiting the option to ever nationalize its own zone |
| War Economy | political org | squad upkeep is partly paid from captured territory income | enterprise output is reduced |
| Xenophobic Doctrine | any org | strong internal loyalty bonus; covert slots against this org are harder and more expensive to establish | cannot form alliances or accept investment slots from any other organization |

This table is illustrative, not exhaustive — the real pool should end up considerably larger so a given playthrough rarely sees the same three-card offer twice; the ones above establish the range (military doctrine, governance composition, leadership structure, economic policy, diplomacy) and the "always a real trade-off" rule the rest of the pool should follow.

*Interaction with leadership type and kind.* Perks are additive to, not a replacement for, the kind/leadership-type model described above — a perk never changes an organization's kind or leadership type by itself (that's still `ChangeLeadershipType`/kind-mutation, a separate decision); it only modifies what that kind/type means in play. This is also where the leader-count model's "+perk" bump to leader count lands: **Council of Equals** is that perk — it grants +1 leader slot to whichever organization takes it, regardless of what its leadership type's base count would otherwise be, with the coordination-cost trade-off stated above.

**Open question:** should perks be visible to other organizations inspecting this one, the same way kind and leadership type already are — or should some perks, particularly ones like Xenophobic Doctrine that describe a defensive posture, stay partially hidden until observed in play (e.g. another organization only learns you have it after a covert-slot attempt against you fails)? Not decided here.

**"Fake" independence — secret ownership.** A hierarchy edge (see "Organizations relate through a graph," above) flagged `visibility: 'covert'` lets a puppet org look openly independent, or openly subordinate to a different visible parent, while its real parent link stays hidden. The hidden owner can only issue **high-level decisions** through this link — declare war/peace, shift relations, optionally set policy/taxes — while the puppet still runs its **own squads and economy** day-to-day (espionage/proxy influence, not full remote control). Exposure follows the shared covert rule (see "Covert visibility, resolved," above): the link becomes public (the puppet becomes openly subordinate to its former hidden owner), the owner takes a relations hit with everyone else, and the puppet's internal factions may trigger a revolt/break instead of accepting the new arrangement. Both **AI and player** can use this — an ambitious org can pay the secrecy fee to secretly subordinate a weaker org and direct proxy wars through it, and a human-led org can do the same.

**Org kind axis — nature vs governance.** `org.kind` is an axis orthogonal to leadership type: `kind ∈ {squad, political, business, network, military, intelligence, secret_police}` (with `religious` added later, and criminal/media as future possibilities) describes an org's **nature**, while `leadershipType` describes its **governance profile** — the two vary independently (a squad-kind org can have any leadership type, etc.). **Loyalty/opinion stays keyed on leadership type, not kind** — the two systems must not be conflated. Kind can change at runtime, mirroring how leadership type can change.

Mechanically, a squad's paired org **references its squad** (rather than the org directly carrying movement/render data) — the pragmatic v1 choice. A cleaner future direction under consideration is to fold movement/render fields directly onto the org itself, so the simulation and renderer can iterate orgs directly instead of going through a separate node.

**Agent networks — the `network` kind.** Structurally an organization like any other — it can own property and hold or occupy slots — and it gets exactly one leader regardless of leadership type, the same override squad-kind orgs get, for the same reason: a network answers to a single handler, not a governing body. What sets it apart is membership: a network's members aren't co-located the way a squad's or a political org's are. Each member keeps their existing place in a separate host organization elsewhere in the world (staff of a political org, workforce of a business, ranks of a squad) and is additionally recruited into the network as an agent.

*Multi-membership, the one exception.* Every character otherwise holds exactly one primary org membership. Recruiting a character into a `network`-kind org is currently the sole exception: it adds a second, secondary membership on top of the character's existing primary one, rather than replacing it. This is deliberately scoped to network-kind orgs only for now — generalizing secondary membership to other kinds is a possible future direction, not decided here.

*Agent edges — a sixth graph-edge kind.* Recruiting an agent creates a distinct edge on the organization graph, from the network to the agent's host organization — its own kind, separate from the five slot kinds and from the ownership edge (see "Organizations relate through a graph," above, and "Observing the graph," below). An agent edge is hidden by default, following the same visibility rule as a covert slot: visible only to the network that owns it, or to anyone the connection has been exposed against. Through an active agent edge, the network can direct two actions at the host organization: an **intel report** (surface the host's slots, treasury, and pending decisions to the network) and a **paid sabotage** (spend money to damage the host's production or property). Further agent-channel actions — skimming money from the host's treasury, undermining the host's internal loyalty, or discounting a separate covert-influence slot the network holds in the same org — are deliberately left for a future pass rather than scoped into v1.

**Security and state-security kinds — `military`, `intelligence`, `secret_police`.** Three further `org.kind` values, each a specialized profile built entirely from mechanics that already exist elsewhere in this document — none introduces a new relationship type of its own; they differ from each other, and from a plain `network`, only in which existing capacity is raised or lowered and in how they're typically owned.

- **`military`** — a coordinating command, not a combat unit itself: its base **subordinate-squad capacity** (see "Organization capacity," below) is set much higher than an ordinary political org's, so a single `military`-kind org can hold many squad-kind orgs as direct children at once — a general staff sitting above an army of individually-simulated squads. Leader count follows the ordinary leadership-type table; it gets no override to 1, since it's administrative rather than a single-handler operation the way squad-, network-, intelligence-, and secret-police-kind orgs are.
- **`intelligence`** — mechanically identical to a `network`-kind org (same agent edges, same two actions: intel report and paid sabotage), but with a much higher base **agent-network capacity** than a plain `network` gets — a formal state service that can run many more embedded agents at once than an ordinary private agentura.
- **`secret_police`** — the same agent-edge mechanics again, but distinguished by two traits instead of a raised capacity: every one of its capacities gets a deliberately *low* base (a small, resource-starved service, not a well-funded one), and it's the canonical use case for the existing **hidden ownership link** (see "'Fake' independence — secret ownership," above) — a secret-police org is more often secretly controlled by its true master than openly parented to it, keeping its real chain of command deniable.

**Property — a first-class type.** A real unifying concept spanning **cities/settlements**, **enterprises** (mines, farms, forges, factories, oil depots, lumber camps), and **vehicles** — each carries a `propertyType` tag and a single ownership edge to its owning org. Property is **passive**: it owns nothing itself, and isn't part of the org control tree. Capturing property transfers its ownership edge uniformly across all three categories; vehicles become independently ownable (an owner can differ from whichever squad happens to be carrying/using it).

**Worldgen auto-leader.** At worldgen, every business and political org gets an auto-assigned leader: once a settlement's residents are generated, one of them is picked to lead each org that owns that settlement (both business shells and free-city political orgs), which also adds them to the org's membership. This only guarantees a floor of one leader — growth beyond that stays fully dynamic (through the AI's own recruiting decisions, or player hiring). Orgs created before any residents exist for their settlement are a rare timing edge case that may fall back to zero members — acceptable, not something worth guarding against.

**Ownership modifier table.** Owning property comes with bonuses and penalties keyed by (owner **kind** × property type × effect), covering at least a **loyalty multiplier** and a **tax multiplier**. This is what makes "a political org governs a city better than a squad does" mechanically true: a squad-kind ruler over a city gets loyalty ×0.5 and tax ×0 (a squad extracts no formal taxes, so the usual tax penalty to loyalty doesn't apply — a small net loyalty gain), while a political ruler gets the standard ×1.0. The modifier lookup is general enough to key off any property type, not just "city".

**City capture by a squad.** A squad that captures a city can own it **directly** (accepting the ownership-modifier penalties above), or optimize its hold in one of three ways: **PUPPET** (make the city's governing org secretly owned by the squad — the city keeps its full bonuses, but the arrangement is exposable, as above); **MUTATE** (the squad itself becomes a political-kind org that governs the city directly); or **REPLACE** (destroy the old governing org, install a fresh political-kind org subordinate to the squad — a concrete instance of "Founding a subordinate organization," above). Both **AI** and **player** can use any of these three options.

**Org economic policy — nationalization vs independent entrepreneurs.** A political org's rule over business orgs in its zone is governed by **two independent policy parameters**, not one left/right toggle:
- **`structuralPolicy`** (statist ↔ laissez-faire): whether a business org in the zone is *required* to be subordinate to the political org (nationalized) or *may* stay independent. This only changes what's allowed — it doesn't reparent anything directly.
- **`taxRate`, split by dependency:** an independent business pays a distinct **independent-entrepreneur tax rate** (the state doesn't own it, only regulates); a subordinate business is taxed/salaried through the normal management-slot and ownership-modifier machinery. These are two separate tunable rates, not one shared knob.
- **Policy shift ⇒ event, not instant reparent.** Flipping `structuralPolicy` toward statist does not silently reassign existing independent business orgs — it queues a **nationalization attempt** per affected org (an org-level utility decision) that resolves through **internal factions**, exactly like any other forced change of parent: an opinion hit, and a possible revolt or secession attempt. There's no separate "instant absorb" mechanic.
- **Family is not an org kind.** Kinship is a link between characters (extending the heir/succession model above), not a `kind:'family'` org — a family doesn't independently hold property or make political decisions the way squad/political/business orgs do. Revisit only if a future marriage/dynasty-diplomacy system needs it.

This model touches — without replacing — the economy/enterprise system, the political leadership model, diplomacy, and general org policy/tax; they remain valid as facets of the organization model rather than separate systems.

### Org lifecycle — creation, dissolution, and merger

The org lifecycle is well-defined at the creation end (worldgen seeding, squad-paired creation, secession, kind mutation), and now resolved at the other end too:

- **Dissolution — resolved.** A squad-kind org is cleanly destroyed along with its squad. Political/business/religious orgs that end up with zero members, zero property, and no children are garbage-collected after a grace period (giving time for a succession or a new hire to naturally refill the org rather than deleting it out from under a slow-recovering player); on collection, the treasury and any remaining property pass to the parent org, or are simply released back to the world (unowned) if there is no parent.
- **Hierarchy width/depth — resolved via organization capacity (above).** Per-org width is governed by the capacity system (control-slot, subordinate-squad, subordinate-business, subordinate-political, alliance, enterprise-ownership, agent-network, caravan, property capacities — each a base by kind/leadership-type, raised or lowered by perks). Tree depth itself is deliberately not capped — it self-limits because every additional layer of subordinate orgs each needs their own earned capacity, which costs perks/power to acquire.
- **Merger — deferred, not designed.** No true-merge mechanic is designed, and no rule forbids one — every "orgs interact" mechanic (secret ownership, slots, squad control, capture) is subordination/control, never a genuine merge that retires one org's identity into another's. Left open rather than ruled out: a future perk or decision could plausibly unlock a real merge (shared treasury, shared membership, subtrees combining), but that needs its own design pass — particularly reconciling conflicting leadership type / kind / policy between the two merging orgs — and isn't scoped now.

---

## LOD-tiered simulation & entity budget

How orgs, pawns, and property are simulated at each level of detail, how AI and pathfinding scale, and how far entity counts can be pushed.

**Foundation — "tiered reality."** Reach *a million population* as a **design, not brute force**: cohorts everywhere, individuals only in hot regions. Population can be millions; the individually-simulated set stays ~10k. The simulation is fully **deterministic**, with **no GPU, no threads** in the authoritative path (this is how Dwarf Fortress / RimWorld / Victoria 3 do it — their lesson: cost tracks the number of population **objects**, not headcount). Genuine million-individual GPU simulation is **rejected** as the authoritative model — cross-vendor float non-determinism and readback stalls make it a poor fit for a deterministic sim — though GPU compute is reserved as a possible option for a later, purely **cosmetic** far-tier crowd if the spectacle is ever wanted.

**Identified vs. anonymous — the general materialize/collapse contract.** One rule governs every container of individuals in the game — a settlement's residents and a squad's pawns alike — so cities and squads share exactly the same two-layer model instead of each having their own bespoke mechanic:

- An individual (a character, a pawn) is either **anonymous** — a pure statistical contribution to its container's aggregate profile, with no persistent record of its own — or **identified** — it has a persistent record (name, traits, history) because it holds a role: an org leader, an heir, a slot occupant, a named squad pawn, anything the player has selected, ordered, or otherwise touched.
- An identified individual is further either **simulated** (actively ticking: full AI, movement, fully interactable) or **dormant** (its record is preserved exactly as-is, but it isn't separately ticked — it's folded into its container's aggregate count/composition using its *real* stored stats, not regenerated ones).
- **Expand** (simplified → detailed): draw anonymous individuals out of the aggregate by filter — decrementing the aggregate's count and removing their trait contribution, same math whether it's a city drawing residents or a squad's cohort drawing pawns — and give each a persistent record; they become identified + simulated. A dormant identified individual doesn't need drawing at all — it simply resumes ticking from its preserved record.
- **Collapse** (detailed → simplified): a simulated individual stops being separately ticked. If it holds no role and has no history worth keeping (ordinary background population, an un-named rank-and-file pawn), it dissolves back to anonymous — its current stats fold into the aggregate, exactly reversing the expand step, so **population/pawn count is always conserved** across the round trip. If it holds a role or has accumulated history (a veteran pawn, a named character, anyone the player has interacted with), it goes dormant instead of dissolving — its record is preserved and will resume identically, not be re-rolled, the next time its container goes hot. This is the exchange of data you're describing: switching detail levels moves real state across the boundary in both directions, it never discards and re-randomizes.
- This directly resolves the earlier open question about pawn veterancy: a pawn that survives enough to matter simply becomes identified, and identification is exactly what makes its record durable across zoom/detail changes — no separate veterancy system needed.

**Three fidelity regimes**, assigned by strategic importance, applied world-wide (not tied to camera position):
- **Data-only (frozen):** property (a `propertyType` tag plus one ownership edge — passive) is pure data, recomputed on a slow, world-wide cadence (~1s for economy).
- **Aggregate (cohort):** off-screen/strategic pawns are anonymous, represented as a `{count, composition, morale, avgHp}` per region/squad, updated by cheap statistical math; **leader-only simulation, no per-follower AI/collision** (the leader itself, being a named role-holder, is always identified — see the leader-centric squad simulation, below). Dormant identified pawns (veterans, named members) ride along in the same cohort record without losing their specific data.
- **Full (individual):** hot-region pawns are real, simulated entities with movement, collision, and full AI/pathfinding — identified or not.

| Entity | Off-screen / strategic | Hot / near | AI |
|---|---|---|---|
| **Property** | data-only, world-wide | same | none |
| **Orgs** | **cohort** (idle/low-activity orgs collapse into an aggregate record) | **materialized** individuals: full utility-AI tick, slots, treasury | org-level utility AI (idle/expand/recruit) only for materialized orgs; collapsed cohorts advance by cheap aggregate math |
| **Pawns** | **cohort** + leader-only; no per-follower AI/collision | **materialized** individuals: movement + collision + full AI | full AI only for materialized pawns; followers/off-screen pawns stay abstracted |

Orgs follow the same materialize/cohort pattern as pawns (see Org cohorts, below) — a squad-org's own record and its follower bodies are two separate things that can each be independently collapsed or materialized (a squad can be a materialized org with cohort-abstracted followers, or vice versa), but both now sit under the same detail-scales-with-proximity principle.

**Hot-region trigger — resolved.** A region is "hot" (materialized to full individual simulation) whenever any of the following is currently true within a fixed world-space radius of it, decided world-wide by game-state signals — never simply by where the player's camera happens to be pointed: an active combat, a squad executing a player-issued order, a scripted/world event in progress, or **a squad belonging to the player's own side simply being present, regardless of whether it currently has an active order** (the player cares what their own squads are doing even when idle or auto-controlled, so their mere presence is its own qualifying signal). One fixed radius applies uniformly to every signal type (a tunable constant, not per-signal-type tuning) — simplicity over precision, revisit only if playtesting shows a specific signal type clearly needs a different radius. Any number of regions can be hot simultaneously — there's no cap of one — so several distant locations each holding one of the player's own squads all stay fully simulated at once. A region stays hot for a few seconds (a tunable grace period, proposed default 5–10s) after its last qualifying signal ends before demoting back to a cohort, to avoid flicker at the boundary when a fight, order, or the player's own squad briefly leaves. This keeps events happening elsewhere in the world properly simulated even when the player isn't currently looking at them. The game may additionally render cosmetic individuals or a heatmap near the camera purely for visual flavor, without that affecting the underlying simulation or its hot/cold state.

**This is a simulation-fidelity signal only, not a render one.** A player-owned squad staying hot (full AI/movement/collision simulation) is independent of what render-LOD tier it's currently drawn at — render-LOD stays purely camera-zoom-driven (see "Camera controls," under UI, input & camera). A distant owned squad can be fully simulated while still rendering as a simple far-zoom glyph; the two axes don't couple.

**Determinism across transitions.** Materializing and dematerializing a region happens at a fixed point in the tick order, driven only by the seeded simulation RNG — never by wall-clock time or by when the player happens to be looking. The same world state, replayed from the same seed, produces the same hot regions at the same ticks regardless of camera behavior.

**Cost model — design targets** (planning estimates for a headless simulation, ms/tick, to be validated by profiling once the sim exists; budget roughly 50ms per simulation step, 16.7ms for a 60fps frame). The scarce resource is expected to be **collision + AI, not movement**:

| capability | 1k | 10k | 30k | 100k | per-pawn |
|---|---|---|---|---|---|
| movement (no body) | 0.22 | 1.9 | 6.4 | 118 ⚠ | ~0.2µs (linear to 30k, then a data-structure cliff) |
| +collision | 2.8 | 20 | 60 | — | ~2µs (~10× movement) |
| +AI+pathfinding | 3.9 | 26 | — | — | ~3µs (pathfinding is mostly amortized, adding only ~50%) |

**Rough target ceilings** (leaving ~30% headroom): cohorts scale to **millions** · a movement-only cosmetic crowd tops out around **30k** (with a cliff at 100k) · collision-bodied pawns top out around **15–20k** · **full AI+pathfinding tops out around 10–15k in a dedicated simulation step, or around 5k if it has to run inside a 60fps render frame.** (The game's "pathfinding" is ring-sampling + steering, not per-pawn A* — true A* at this scale would need flow-fields instead.)

**Org cohorts — resolved: orgs get the same LOD treatment pawns do.** Every org is, by definition, identified (it always has a persistent record — identity, treasury, leader) — so an org never dissolves to anonymous the way a rank-and-file pawn or an untouched villager can. What it *can* do is go **dormant**: a **low-activity, similar-org cohort** groups many individual dormant org records under one aggregate `{count, composition, avgWealth, avgPower}` view for cheap display/scoring purposes, without deleting or regenerating any of them — each org's own record is untouched and resumes ticking exactly as it was the moment it materializes again.

- **Collapse eligibility:** an org is a cohort-collapse candidate when it's had no player interaction, no combat, and no slot relationship with a non-collapsed org for some tunable idle period, and it belongs to a large-enough population of similar orgs (same kind, same faction/leadership-archetype family) to be worth aggregating — the canonical example is a faction with dozens of small, idle bandit squad-orgs.
- **Collapsed representation:** one aggregate cohort record per (faction × kind × rough-power-bracket) group replaces the individual org ticks entirely while collapsed — no per-org utility-AI decisions run; the cohort advances with cheap aggregate math instead (analogous to how a pawn cohort updates count/morale/avgHp).
- **De-aggregation (re-materialize):** the same hot-region signals that materialize pawns (combat, a player-issued order, an event) also pull the specific org(s) involved back out of the cohort into individually-ticking records. Because an org is always identified, this is a pure lookup, not a regeneration — the org's own record (identity, treasury, leader, relationships) was never deleted, only excluded from per-tick simulation while collapsed, so it resumes exactly as it left off. Only the org(s) actually touched by the triggering signal re-materialize; the rest of the cohort stays collapsed.
- **Property is unaffected** — property stays data-only and world-wide regardless of whether its owning org is currently collapsed or materialized (a cohort-collapsed org still owns its settlements/enterprises; only its *decision-making* tick pauses while collapsed).

This keeps the always-on org tier flat-cost in the common case (most of a large world's orgs are idle background population, not active players in the story) while still giving every org full utility-AI behavior the moment anything actually touches it — matching the pawn model's promise that "detail scales with proximity/hotness, not render zoom" without an arbitrary org-count ceiling.

**Optimization levers**, roughly ranked by effort / payoff / determinism risk:
1. **Cohort simulation + materialize-on-zoom** — unlocks a million *population* (~10k individually simulated); medium effort, **low** risk; the only path to a million that keeps determinism.
2. **A flat-array uniform grid** for the core simulation loop — removes the super-linear collision cost and the 100k movement cliff; low–medium effort, **no** risk; the prerequisite and single biggest win.
3. **Zoom-tiered particle rendering + heatmap** — renders any count without being the bottleneck (rendering is not the bottleneck; simulation is); low effort, no risk.
4. **Worker threads + shared-memory movement pass** — roughly 300–500k individuals; medium–high effort, medium risk (needs order-independent accumulation to stay deterministic); deferred.
5. **GPU compute** — a million-plus genuine individuals; high effort, **high** risk, cosmetic-only (never authoritative); deferred.

Sensible build order: the uniform-grid rework first (the concrete near-term improvement), then the cohort system (the actual foundation for scale), then the rendering work — with the worker-thread and GPU options deferred.

### Principle — LOD governs simulation depth, not just render zoom

The hot-region/cohort materialize system above is an instance of a broader rule: **detail (individual sim vs. abstract aggregate) scales with proximity to player-controlled squads/avatars and with hot-region signals (combat, player focus, events — world-wide, never tied to a camera), uniformly across every simulated subsystem** — not just pawns, and not just rendering. "Level of detail" here is the general knob for how much compute and state a piece of the world gets, wherever that piece lives — building interiors and orgs (see Org cohorts, above) are two further subsystems this principle extends to, each getting the same hot/cold materialize treatment pawns get. Property remains the one deliberate exception: it stays flat data-only regardless of hotness, since a passive `propertyType` + ownership edge is already as cheap as data gets.

---

## Experience-driven architecture

A session isn't always the full game — it can instead be a **curated slice of the whole simulation** (e.g. econ-only, combat-only, entrepreneur-start), assembled from the same systems as the full game and selected up front as an **Experience**. With no Experience chosen, the game behaves exactly like the full default game.

- An **Experience** selects a subset of the game's systems (economy, organizations, combat, trade, worldgen, vehicles, AI, movement — roughly this many, at this granularity), plus an optional starting scenario, an optional player role, and optional tuning overrides for that specific session (e.g. a proving-ground Experience could force every faction to always secede rather than fight).
- **Player role** is what "you" are at session start — entrepreneur, character, squad, or political — each with its own starting kit, driving the "found a new character/org" entry point instead of a single hardcoded default. Player control stays implicit (whichever character the player is currently controlling), with no separate "controller" concept.
- **Start menu = Experience selectability** — different start-scenario/player-role combinations are different starts (entrepreneur from scratch, naked character, starting with a squad, starting with a city + treasury). The player picks a role at the start. (The client selection UI for this is a later layer — see below.)
- Disabling one of a session's systems doesn't discard its state — it simply pauses (e.g. disabling combat freezes battles but keeps every combatant as they are); re-enabling it resumes exactly where it left off.

**Open question:** this player-role start-menu concept and Player Mode's avatar-select screen (Organizations section, above) are two independently designed answers to "how does a session begin," and neither references the other. Player Mode lets the player inhabit an existing NPC leader already in the generated world; a player role lets the player found a brand-new character/org with a starting kit. Should the eventual start screen be **one unified flow** (e.g. a single screen offering both "join an existing leader" and "found new" as tabs), or **two separate entry points** gated by which Experience is loaded (e.g. a sandbox/observe Experience offers the join-existing picker, a campaign-start Experience offers the found-new picker, and the two are never shown together)? Not resolved here — a real UX/scope decision for whoever designs the eventual start-menu UI.

**Deferred (out of v1 scope):**
- A **start-menu client UI** — experience/role selectability and a starting-kit picker, on the client.
- Extending the same restricted-session idea to the remaining systems, once it's proven on the first few.
- Letting Experiences be authored outside this document, so new ones don't need a design pass each time.

---

## Layered squad behavior + leader-centric simulation

Two coupled design decisions: squad/leader/AI behavior runs as a small set of layered states (instead of ad-hoc order strings), and squads are simulated leader-centric.

### Layered behavior system

Behavior runs in layers, resolved by priority, with higher layers preempting lower ones:

- **Order layer** — runs explicit player/AI orders from an execution queue: move, capture, attack, garrison, route, and so on, executed sequentially.
  - A **move** order completes on arrival within an arrival radius of its target point; an **attack** order completes when its target dies. An empty queue **holds the last order** — there's no automatic revert to AI control. A fresh click **replaces** the current plan (clears the queue); a shift-click **appends** to it instead.
  - Attacking a **ground point** completes as a move-to-point, and the squad holds there. Attacking a **unit/squad** completes on that target's death, after which the squad goes idle — it doesn't explicitly chase a new target, but an auto-control squad's own auto layer will naturally re-engage the nearest enemy in sensor range (emergent from auto-mode, not a special chase mechanic). A **hold-position stance** suppresses movement/chasing entirely, firing only at enemies already in range from its current position.
- **Auto layer** — with no pending order, the actor runs as an auto-battler with its own scored option set (engage/hold/reposition/retreat, …). This layer specifically is what a squad's auto-control/manual-lock toggle gates: the **order layer** always executes whatever was last queued regardless of manual/auto state, and the **reactive layer** (below) always runs even under manual control (a player-controlled squad still flees, panics, or gets stunned) — but the **auto layer's own scored decision-making only runs when the squad is in auto-control and not locked to manual**. A manually-controlled squad with an empty order queue therefore just holds, rather than opportunistically auto-battling.
  - A couple of squad capabilities (Wander, Reconnect) only ever exist inside this auto layer — there's no corresponding player-issuable order for either, so they're reachable only when a squad is in auto mode.
- **Reactive/interrupt layer** — top priority, preempts everything: stun (can do nothing), panic-flee, and similar effects. Suspends the layers below it; when it clears, control returns to order/auto.

One shared framework drives both AI and player-controllable squads — states have enter/tick/exit, and layers resolve by priority (interrupt > order > auto). This "one framework" claim refers specifically to the shared **utility-scoring** math (see Architecture principles, below), reused across all three AI scales — the order/auto/reactive layering with an execution queue is additional machinery specific to squad/pawn-scale actors that receive discrete player orders. Org-level decisions don't have a player order queue (Simulation Mode intervenes by directly mutating org state — tax rate, kind, slot salary — not by queuing a competing order) and have no reactive/interrupt concept (no org-level panic or stun). Org-scale utility AI is a flat, cooldown-gated scorer with no queue and no preemption layers.

### Leader-centric squad simulation

- A squad has **no collective "intelligence" and no per-follower AI** — it has exactly **one** intelligent leader; every other member simply follows the leader in formation. The layered behavior system above runs on the leader only.
- Only leaders are actually simulated in detail — squad leader, detachment/unit leader, org leader — not every individual pawn; followers are cheap trailing bodies, abstracted further still at low LOD.
- A squad's **emblem/icon is attached to its leader** and **passes by succession** when the leader dies — the next-in-line inherits both leadership and the emblem.

**Open question:** is a squad's tactical leader (the one driving its behavior states) the same character as the seat counted by the org leader-count model — i.e. one person wearing both hats, driving the squad's movement/combat *and* the paired org's utility-AI decisions, carrying both the emblem and the succession-legitimacy math? This is never stated as an explicit rule, and two concrete conflicts follow from assuming it is:
1. The org leader-count model gives a mercenary-flavored org 2 leaders (the type squad-orgs commonly default to), while this section says flatly that a squad has exactly one leader. Does "one leader" mean only the tactical, behavior-driving leader, with a second org-level "leader" being a co-signer with no behavioral presence at all — or should squad-kind orgs simply be hardcoded to a leader count of 1, since they're structurally different from political/business orgs?
2. Does a squad leader's death in combat roll the full succession-crisis formula (a rebellion-probability roll that can result in secession), the same as a duke's death would? Since squad-orgs are subordinate orgs once they join the hierarchy, taken literally every routine combat leader-death would roll the same CK-style crisis math — including a chance of a squad spontaneously seceding from its parent faction mid-battle. This seems unlikely to be the intended pacing (this section's own succession model for squads is much simpler: "next-in-line inherits leadership and the emblem," no rebellion roll, no secession branch) but nothing states squad-orgs are exempt from the general org succession rules.

This is a genuine balance/scope trade-off between narrative richness (even squads can fracture on bad leadership) and battlefield pacing (combat leader deaths are routine, not crisis-worthy) — not resolved here; both sub-questions share the same root cause (whether squad-kind orgs are a first-class exception to the general org leadership/succession rules) and are best resolved together.

---

## Architecture principles

- **Behavior selection = Utility AI.** Any "what should this unit/team do" choice is modeled as candidate **actions scored by weighted factors**, highest wins — never a fixed if/else priority chain. Factors live in one shared registry, so adding a new one is a localized change. This is deliberately built as a **scalable tool**: the factor set is expected to grow, and the scoring policy itself may later be augmented or replaced by **imitation learning / neural nets**. New behavior work should extend this framework rather than bypass it.
- **Utility AI runs at three scales** — **organization** (strategic: become political, change leadership type, seek power; a slow, visible cooldown), **squad/caravan** (tactical: capture/attack/move), and **pawn** (micro: positioning within a squad). Same framework, different action/factor sets per scale — reuse it, don't invent a parallel decision system per scale. "Same framework" means the shared **utility-scoring** math specifically — the order/auto/reactive **layering** with an execution queue (Layered squad behavior, above) is additional machinery present only at the squad/pawn scales, not the org scale.
- **Tunable constants live in a parameter registry.** Don't scatter magic numbers — register a balance/AI/world constant once (`{key, group, type, default, applyMode}`) and read it through a single accessor. The tuning UI auto-generates from the registry, so a new tunable needs no bespoke UI of its own.
- **Hierarchical gameplay tags.** Identities and states (leader archetypes, unit/order states, behavior hints) are expressed as **dot-hierarchical string tags** (`Leader.Monarch`, `Squad.Attacking`), matchable both exactly and by prefix. Prefer a tag + a factor-weight profile over hardcoding archetype/state-specific branches.
- **Attribute calculation = base + independent modifiers.** Any attribute built from a base value plus bonuses/penalties (an organization capacity, a derived stat like org Management, a character skill) follows one shared formula: `result = base + Σ(flat modifiers) + Σ(base × (multiplier − 1))`. Every multiplier computes its own contribution against the original base value — multipliers never compound on each other or on an already-modified running total. This turns every contribution, flat or multiplicative, into one comparable line item, which is what a Crusader-Kings-style breakdown tooltip reads from directly: the base value in white, each positive contribution in green, each negative one in red, summing to the shown result. Organization capacities, org Management, and character skills already follow this shape (see their own sections); combat, pricing, and upkeep formulas elsewhere in this document predate the rule and sequentially compound instead — reconciling them is future work, not scoped here.

---

### Founding an independent squad-org from scratch
A player-controlled character can found a brand-new independent squad organization — raising a mercenary company, effectively — with no settlement or territory backing it, distinct from recruiting a squad from an owned settlement's existing stock. The new org forms at the founding character's current location with no territory requirement. Funding is debited from the founding character's own personal funds rather than granted from any org treasury. A character can have only one actively founded squad-org at a time; once it's lost or disbanded, they can found another. Squad size defaults to the standard reinforcement squad size, and members start as bare recruits. The same mechanism could later let NPC organizations spin off splinter squads of their own.

---

## Worldgen

Worldgen produces the game world deterministically from a seed. Generation is **region-local**: any region of the map can be regenerated in isolation and will always produce the same result. One shared underlying layout, built once from the world's settlement and zone positions, yields territory borders, road-candidate topology, and terrain-zone borders together, so all three stay consistent with each other rather than risking disagreement between separately-generated passes.

**Determinism** means the same seed always reproduces the same map when regenerated. This is a single-player
guarantee — it lets a region be regenerated in isolation, lets a bug be reproduced exactly by replaying a seed,
and underpins any future debug tooling that regenerates part of the map on demand.

### World shape — a sphere with continents and ocean

The game world is a full sphere (a planet), not a flat plane — the camera orbits its surface freely (see
"Camera controls," under UI, input & camera, below), and world generation places one or more procedurally
generated continents on it, surrounded by ocean. Ocean is a geographic/visual backdrop only, not a
movement-blocking mechanic — it carries no travel, combat, or logistics rule of its own. All playable
territory — every settlement, zone, and road the pipeline below produces — sits on a single reachable
landmass; if worldgen happens to place additional, separate continents, they're simply unreachable in v1 (no
ship/naval transport exists to cross open ocean to them) — future work, not a gap to fill now. The
zone-tessellation, road-network, and settlement-placement pipeline below is otherwise unchanged by this — it
runs entirely within that one landmass's bounds, just projected onto a curved surface instead of an unbounded
flat plane.

### Foundational content

Some worldgen output is fixed up front as the base the rest of the system builds on:

- **Wild camps.** The world seeds 8 wild-camp entities (radius 60, alternating between two factions, minimum
  distance 1800 from all cities, seeded from the world seed), plus one city-aligned camp per city (radius equal
  to the city's radius).
- **People are simulated pawns** — real sim entities, not decoration (a demo-scale map spawns roughly 1,200
  people near a single city). **Cars and biome decoration** (trees, ridges, dunes, grass) are render-only —
  visual dressing with no simulated state.
- **Highways** are built as two edge sets kept together: a minimum spanning tree (guarantees every city is
  connected) plus additional "shortcut" links between settlements that are close together (under roughly 2600
  units apart). Dropping the shortcut links still leaves a fully connected road network via the spanning tree
  alone.

### Generation pipeline

The stages below run in order at world creation and consume each other's output:

| Stage | Input | Output | Consumers |
|---|---|---|---|
| 1. Seed | World seed (set at world creation or on a map-select screen) | A deterministic way to turn any position into the same reproducible value every time | Every later stage (all reseed from the world seed directly, never from a shared stream) |
| 2. Coarse-to-fine grid | World seed | A seeded, region-addressable layout (any single region can be regenerated in isolation) | Simulation systems that share the grid; density/region stage; territory-border stage |
| 3. Seed-point layout | City/zone seed points, placed with even, non-overlapping spacing (the same placement rule used for capital placement) | A shared underlying layout connecting those points, used to derive borders and road candidates | Territory borders, road-candidate edges, terrain zone borders |
| 4. Density/regions | Seeded grid + noise | Region masks (e.g. "is forest," "is wetland") | Biome assignment; forest/mountain/plains ratios |
| 5. Biome assignment | Noise + region masks | Per-cell biome tag (forest/mountain/plains/desert/…) plus an elevation field | Terrain texture and hypsometric shading, a coarse cover/occlusion layer for combat (mountain-zone edges and forest interiors as cover candidates), economy resource binding |
| 6. Territory borders | The shared underlying layout, smoothed into more even-sized regions | Political-influence-ready territory cells | Political influence field |
| 7. Road network | The shared underlying layout, pared down to a sensible candidate set of connections, then routed to prefer easy terrain (plains are cheap to build through, forest/mountain are expensive, rivers are only crossable at bridge/ford points) and smoothed into natural-looking paths | A road graph: nodes are settlements and junctions, edges carry a path and a terrain cost | Caravan/trade routing, porter routing, road safety and blockade events, automated logistics |
| 8. City/feature placement | A tight-fitting building-lot layout generated per settlement footprint | Building footprints and descriptive feature tags | City rendering, settlement detail inspector |
| 9. Baseline economy seed | Biome tag at a settlement's position + settlement tier | 1–3 baseline producer enterprises per settlement, matched to biome and tier | Economy baseline at world start; the org-AI enterprise-founding system that grows the economy further |

This table connects stages that were designed at different times into one traceable pipeline — it states the
*wiring* (what feeds what), not new mechanics.

**Streets between buildings, distinct from the inter-settlement road graph.** Stage 8's building-lot generation produces its own internal street network connecting building lots within a settlement, as part of the same generation step that lays out the lots themselves. This is a separate layer from Stage 7's road graph (which connects settlements to each other): together, a settlement gets both an outer road link to the rest of the world and an inner street layout between its own buildings.

### Terrain zones

A dedicated map layer describes what the land *is*, using real tessellating territorial zones rather than
ad-hoc placement, with no gaps between zones. Three layers are kept conceptually separate:

1. **Terrain zones** — every point on the map belongs to exactly one zone, whichever zone seed sits nearest to
   it. Zone kinds are forest, mountain, and plains; rivers are drawn as connected paths.
2. **Political influence field** — a separate zone layer that, unlike terrain zones, can leave wilderness gaps
   between territories.
3. **Settlement footprints** — see site selection below.

**Generation:** a fixed number of zone seed points (roughly a dozen) are placed with even, non-overlapping
spacing, the same placement rule used for capital placement. Zone kind is assigned by a seeded rule —
mountains are biased toward the map rim, forests toward the interior, with tunable kind ratios. A handful of
rivers (roughly three) are traced along the boundaries between zones.

**Forests as a resource:** forest zones behave as non-depleting wood sources — a forest zone always has wood
available rather than being harvested down to nothing.

**Passability:** in v1, zones affect resource binding and are cosmetic for movement — mountain path cost and
river crossings are not modeled (see the open questions below).

Consumers reference a zone's kind at a given map position — for example, a lumber camp needs to sit in or near
a forest zone, and a mine needs a mountain zone.

**Open question:** are terrain zones (this tessellation) and political-territory borders (built from the same
underlying layout, then smoothed into more even regions) meant to be the same structure, or deliberately
separate layers that only share the underlying geometry? The pipeline above treats them as separate outputs of
a shared backbone; that should be confirmed as an explicit design decision rather than left implicit.

### Settlement site selection

**Open question:** how is a settlement's exact position chosen? A seeded rule analogous to capital placement is
needed, but scored against the terrain-zone layer rather than placed independently of it — e.g. biased toward
plains zones, near-but-not-inside forest/mountain zones (buildable land with adjacent resources nearby), and
near river polylines for water access. Still to decide: the minimum-distance-between-settlements rule
(parallel to the wild camps' minimum spacing), and whether settlement tier (capital/town/hamlet) is assigned at
generation time or grown in over play.

### Resource-node distribution & density

**Open question:** zone kind determines which enterprise *types* can appear where (forest → lumber camp,
mountain → mine), but not the density or placement of resource nodes *within* a zone. Is a mountain zone
uniformly mineable, or does it need discrete ore-node points that baseline economy seeding and later
player-issued construction both query? This feeds baseline economy seeding directly and should be resolved
alongside it.

### Baseline economy per settlement

**Rationale:** if enterprises were only ever created by (1) a construction order completing, or (2) a fixed,
small, world-wide scatter of standalone map enterprises not owned by any city, a freshly generated world would
stay economically empty everywhere except wherever construction happened to finish first — one settlement with
enterprises, every other settlement with zero. Worldgen-time seeding of city-owned producers (farms, mines,
lumber mills, etc.) prevents that.

**Rule:** worldgen seeds each settlement with baseline producer(s) matching its biome and
tier at generation time, so the map reads as economically alive immediately, instead of depending on elapsed
construction in one city. This is additive to — and distinct from — the standalone map-enterprise
scatter, which is unaffected.

**Proposed algorithm:**

1. After settlement placement and zone tessellation are both resolved, look up each settlement's biome via its
   zone kind at its position.
2. Map biome to an ordered candidate list of producer chains tagged for that biome (forest → lumber mill first,
   plains → farm first, mountain → mine first), reusing the existing chain-definition data rather than a new
   parallel table.
3. Producer count scales with settlement tier: a capital seeds up to 3 baseline producers (diversified across
   biomes available within its territory, not just the exact zone it sits in), a town 1–2, a hamlet 1 — these
   counts are a balance default, not fixed here.
4. Seeded producers are owned by the settlement's own city organization (unlike the standalone map-enterprise
   scatter), so they participate in the settlement's economy and upkeep loop from the start, and are eligible
   for worker-squad hiring the same as any construction-completed enterprise.
5. Node/site placement within a settlement's territory (which specific tile hosts the seeded mine or farm) is a
   direct consumer of resource-node distribution and density, above; until that's resolved, placement can
   default to "anywhere within the settlement's zone-kind-matching territory."
6. Baseline seeding and runtime org-AI enterprise founding shape the same economic baseline from opposite
   directions (world-generation-time seeding vs. runtime founding) — any recorded economy telemetry baseline
   must be regenerated whenever this seeding logic changes.

**Cross-reference:** the long-run growth mechanism once a settlement's baseline is seeded is the org-AI
enterprise-founding system described elsewhere in this document — baseline seeding sets the starting state,
org-AI founding grows it from there. Worth remembering that the very first enterprise in a settlement comes
from this baseline seeding step, not from org-AI founding.

### Open questions

- **World size & coordinate scale.** No section states the planet's radius/circumference in world units, or how
  world units map to the existing pixel scale visible in wild-camp radii (radius 60, minimum distance 1800). This
  is needed so seed-point density, grid cell size, and road-length budgets can be set deliberately instead of
  guessed. Related: should planet size scale with something (e.g. scenario size), or is it fixed?
- **Worldgen × level-of-detail coupling.** The broader simulation scales detail with proximity to the player.
  Worldgen output (zone borders, road polylines, biome texture) is generated once at world creation and is
  otherwise static, so it isn't an obvious candidate for the same materialize/collapse treatment used
  elsewhere — but that exemption isn't stated explicitly anywhere. Needs a short pass to either explicitly
  exempt static terrain geometry with a one-line rationale, or define what a "low-detail" version of terrain
  geometry collapses to.
- **Map editing & regeneration tooling.** No section describes a dev/debug tool to regenerate a single region,
  or to override the world seed mid-session for testing. Useful for verifying determinism and for playtesting
  biome/road variety without a full world reload.
- **Terrain passability & movement cost.** Mountain path cost and river crossings are not yet designed — zones
  only affect resource binding and rendering, not movement.

---

### Non-mountain biome texture variation
Mountains render with a multi-stop elevation-based color ramp for visual variation; plains, forest, and desert start as flat single colors. Direction: extend ramp-based variation to the non-mountain biomes, driven by a noise-based per-tile value rather than elevation (elevation isn't a meaningful visual signal outside mountains). Forest should get the tightest, most visually distinct ramp (green fading to a dark speckle) to read as dense tree cover; plains and desert get a subtler version. This is a one-time cost computed at world generation, not a per-frame effect.

### Worldgen: cover/occlusion data for tactical pawn positioning
No queryable concept of physical cover or occlusion is designed yet — terrain and biome scatter (forests, rocks, etc.) are decorative only, with no obstruction data, line-of-sight query, or per-tile "cover value" that pawn AI could use for tactical positioning. This needs its own design pass to decide: whether cover is a continuous per-tile density value versus discrete cover points pawns can path to and use; whether it's derived cheaply from existing terrain/scatter data at world-generation time or needs a dedicated pass; and what the query interface should actually look like (e.g. "find nearest cover point" vs. "get cover value at this tile"), and at what scale it matters (most likely squad/pawn-scale tactical play only, not relevant at territory-aggregate scale). This is a prerequisite for real cover-taking behavior in combat (above) and is intentionally not decided here.

### Forest placement near settlements
**Rule:** when placing forests during world generation, deliberately anchor a forest patch within harvesting range of most settlements, while still scattering some forest through the wilderness for flavor and non-settlement resource sites. Without this, forest patches scatter with no guarantee of being near any settlement, leaving lumber mills little wood within practical harvesting range. Forests deplete as they're harvested with no regrowth, so forest placement is a real, finite spatial constraint rather than an infinite tap.

---

## Squads, combat & territory

Squads are also organizations: each squad is paired with its own organization entity, sitting in the same ownership hierarchy every other organization uses. This means a squad can be independent, secretly owned by another organization, itself control other organizations, or even mutate into a political organization over time. See the Organizations section for the full squad-as-org model, property ownership, the ownership-modifier rules, and squad-driven city capture.

See the Abilities reference for the full input model — player abilities (quick vs. confirmation input modes, a quick context action on right-click, an options window, and a distinct cursor) plus squad capabilities.

### Caravans on roads
Caravans are squads with a "trade" specialization. Active only while the simulation is running, and visual-only (they carry no economic influence). Behavior: sit at a settlement, pick a random road-connected neighbour, walk that road segment, repeat. A caravan never leaves the road graph.

### Capture order
Squads have an attacking / non-attacking state, defaulting to attacking. Right-clicking a settlement sends the squad there; on arrival, if the squad is attacking and the settlement belongs to a different team, ownership instantly flips to the squad's team. (See "Contested capture," below, for the refined multi-squad version of this rule.)

### Squad attack/non-attack toggle
An inspector toggle for the attacking/non-attacking state, alongside Hold and Wander.

### Combat at two scales
Combat resolves differently depending on how far the camera is zoomed in.

- **Scale A (far zoom):** proximity-triggered, gradual attrition. A squad's health is the sum of its pawns' strength; both sides lose pawns in proportion to the opponent's strength, the loser is destroyed and the winner weakened. Gated by the simulation running and by war status between the two sides.
- **Scale B (closest zoom):** squads load as individual pawns that fight directly, exchanging fire and taking casualties pawn-by-pawn, and the player can order a single pawn to hold a position.

Which scale is active is chosen by the LOD tier the camera is currently at (see "LOD tiers," below).

Scale A is a pure, deterministic resolver — a Lanchester-style discrete calculation with no randomness — so the outcome of a given fight at that scale is fully predictable from the inputs. A "defense" divisor from entrenchment (see below) reduces incoming damage at this scale too. Exactly how Scale A and Scale B reconcile at the moment the camera crosses the LOD boundary mid-fight is not yet fully specified — see "Open question: Scale-A / Scale-B reconciliation," below.

### Pawn weapon classes and behaviors
Pawns get weapon classes: **ranged** (kites, holds standoff, shoots) and **melee** (shield blocks incoming fire, dodges, closes to strike). Behavior is driven by the pawn-level utility-AI: target and position are scored by factors like range, threat, exposure, and distance to the rest of the team, using tunable response curves. Automatic by default; player orders override it.

Positioning: melee pawns press in to about half their weapon's range; ranged pawns hold standoff at full range.

Out of v1 scope: the shield-blocks-bullets-and-dodge half of melee behavior (a directional damage-mitigation and evasion layer) is a planned future addition, as is melee pawns kiting away at low health — v1 has only a generic "flee" reaction below 20% HP for any pawn.

### LOD tiers
Three named level-of-detail tiers replace ad-hoc zoom thresholds:

- **L0 — Strategic:** borders and glyphs only.
- **L1 — Operational:** settlement footprints, roads, squads shown as single units.
- **L2 — Detailed:** buildings, trees, parking, squads shown as individual pawns.

Tiers cross-fade smoothly into each other rather than popping. L2 geometry is procedurally generated per settlement, seeded consistently, and cached. L2 is the detailed scale that Scale-B combat and per-pawn weapon behaviors build on.

**Pawn rendering: a body sphere plus two floating hand spheres, at real-world scale.** A pawn renders as one sphere for the body, plus two smaller spheres floating beside it standing in for hands — no detailed humanoid mesh, no connecting limb geometry. This is the visual primitive for every character/pawn at L2, not just a placeholder for one specific system. It's sized to the game's scale convention (1 unit ≈ 25 m — see Metric ruler overlay, below), so a pawn, a building footprint, and the street width between buildings (see "City/feature placement," under Worldgen) all read at one consistent, believable relative scale — the same relationship the Metric ruler overlay's scale-audit panel checks.

### Squad inspector: owning organization
Since every squad is also an organization with its own place in the ownership hierarchy, the squad inspector shows whether the selected squad is independent or belongs to a parent organization — rendered as either "Independent" or a clickable "Belongs to: `<parent org name>`" that jumps to that parent's own inspector panel.

### Squad marker rendering: activity-status badge
The squad marker communicates the squad's current activity state at a glance — marching/moving, resting, garrisoned, assaulting, or entrenched/dug-in — via the marker's own icon, color, or badge (one status glyph per squad, in that priority order). No separate zone or ring is drawn around a squad at any zoom level; the badge is the entire visual language for squad state.

### Squad marker: leader indicator at detail zoom
At far zoom (world/city view) a squad shows as a simple faction-colored circle with a soldier count — a strategic "a squad is here" marker. At near/detail zoom, once individual pawns are visible, that map-marker fades out and is replaced by a thin faction-colored ring plus a small faction dot on the squad's leader pawn, tracking the leader's live position — so the leader is picked out without a floating circle and count cluttering the detailed view. The transition cross-fades smoothly across the zoom band, with no pop at the boundary. This composes with, rather than replaces, the activity-status badge above.

### Contested capture
A settlement is contested while squads from two or more teams are within its capture zone. Capture is suppressed while at least one living enemy squad remains in the zone — ownership flips only once a single team remains, and ordinary combat resolves the contest in the meantime. This replaces the plain capture order's instant flip-on-arrival whenever enemies are present.

Tunings: capture completes after roughly 12 seconds of uncontested presence, decaying back down over about 6 seconds if interrupted; the capture zone is a fixed radius around the settlement (default 20 units). Capture progress is transient state (not saved). Only health-bearing units — soldiers, pawns, porters — contest a zone; buildings alone don't count. A zone with multiple contesting factions simply stays contested (no side "wins" a stalemate). A completed flip sets the settlement's controlling faction to the attacker and clears any specific-organization ownership (reassigning it to a political organization is a separate, not-yet-designed concern).

### Open question: Scale-A / Scale-B reconciliation at the LOD boundary
How does detail-LOD per-pawn combat (Scale B) reconcile with aggregate-LOD combat (Scale A) at the moment the camera crosses the LOD boundary mid-fight? A proposed contract, mirroring the same materialize/dematerialize pattern used for building interiors (see the Territory control section, below):

- **Zooming OUT** (Scale-B pawns → Scale-A force): sum the squad's live pawns into an aggregate force strength, HP-weighted so mid-fight damage isn't lost at the boundary — a squad at half its pawns' HP contributes half strength, not the full nominal value. This follows the general collapse rule (see "Identified vs. anonymous," under LOD): an ordinary rank-and-file pawn folds back into the aggregate and its specific identity dissolves, but a pawn that's identified (a veteran, a named member, the leader) goes dormant instead — its record is preserved untouched, not folded away.
- **Zooming IN** (Scale-A force → Scale-B pawns): any dormant identified pawns (the leader, veterans, named members) resume from their exact preserved record — no reconstruction needed. The remaining anonymous headcount is expanded from the aggregate by the same seeded draw used everywhere else, proportioned to match the force's current strength (a squad at half strength expands to roughly half its nominal anonymous pawn count) — best-effort for this anonymous portion only, since it never had individual identity to preserve.

**Note:** Scale A's resolver is deliberately pure and deterministic. If Scale B's per-shot resolution uses randomness, the same fight could produce different outcomes purely depending on which LOD tier it happens to be resolving at — a predictability concern even in single-player: a fight shouldn't play out differently just because the player zoomed in or out on it. Recommendation: Scale A stays the authoritative resolution regardless of the player's own camera zoom, and Scale B is treated as a visual re-enactment/feedback layer rather than a second, independently-authoritative resolution. Not yet ratified.

### Open question: Scale-B pawn damage resolution — to-hit, damage, range bands
Neither the two-scale combat model nor the weapon-class mechanic above writes down the actual per-shot to-hit/damage math. A concrete starting proposal, all values tunable:

- **To-hit:** hit chance = a base chance, reduced by range falloff (distance as a fraction of weapon range) and by the target's cover, clamped to a 10–95% band. Base hit chance is roughly 75% for ranged attacks and 90% for melee (melee only rolls once already in range, so falloff barely matters). Cover starts at a constant zero — terrain/occlusion data isn't designed yet (see "Note: terrain effects on combat," below) — but the term is defined here so that data has a slot to plug into later.
- **Damage:** on a hit, damage = the weapon's base damage, scaled by the attacker's strength relative to a reference value, times a small random roll (roughly ±15%), then divided by the entrenchment defense multiplier (ranged attacks only — see "Entrenchment," below) before being applied to the target's HP. A pawn at 0 HP dies and leaves its squad's live pawn set.
- **Range bands:** implied only by weapon range — melee presses to about half range, ranged holds standoff at full range — a single flat linear falloff rather than discrete short/medium/long bands. Worth revisiting once cover data lands, since falloff and cover likely want to combine non-linearly rather than just being subtracted separately.
- **Rate of fire:** gated by the weapon's cooldown plus a short aim delay (roughly 8–10 ticks) before firing. **Open question:** is that aim delay paid once per engagement, or before every single shot? These read as very different feels and need to be resolved explicitly.

**Open question:** is randomized damage variance actually wanted here, given Scale A is deliberately deterministic? Adding randomness at Scale B while Scale A stays random-free is the same internal-consistency risk flagged in the LOD-reconciliation question above — recommend resolving both together.

### Open question: supply-linked combat effectiveness
Supply is defined (see the Glossary) as sustaining "combat effectiveness over distance/time from own territory; low supply degrades performance" — but no combat formula (defense multiplier, squad strength, hit chance, damage) is specified to read from a supply value anywhere in this cluster. The only supply-adjacent hook specified is fuel/resupply gating for shuttle refueling during an air-assault operation (see below) — not melee/ranged combat output. Compare fatigue, which does have an explicit combat hook (a condition multiplier that shrinks squad strength, feeding into Assault mode's capture-speed contribution below). Recommend supply get the same treatment: a supply multiplier composed into the same damage/defense pipeline as fatigue and entrenchment, sourced from whatever the trade/logistics systems expose as a per-squad supply level.

### Open question: squad morale and rout
No squad-level morale/break mechanic is designed yet. The only retreat-adjacent behavior is an individual pawn fleeing reactively below 20% HP — an individual reaction, not a squad-wide rout. Missing: (a) a squad-level morale stat that erodes from casualties, fatigue, or flanking and triggers a mass retreat below some threshold; (b) what a "rout" actually does — auto-move to the nearest owned settlement? drop the attacking stance? instantly lose entrenchment or assault state?; (c) whether a routed squad can be rallied by player order, or simply deprioritizes combat until morale recovers on its own. Recommend scoping this as a utility-AI behavior profile, gated behind Scale-B combat being solid.

### Unit/squad experience and veterancy — resolved via identification
A pawn that survives enough combat to matter becomes **identified** (see "Identified vs. anonymous," under LOD) — the same mechanism that already preserves a leader's or named character's record across detail-level changes. Becoming identified is what makes a pawn's record durable: its stats stop being folded away when its squad collapses to a cohort, and it resumes from its exact preserved state (including whatever it accumulated) rather than being anonymously re-expanded. This gives veterancy a natural, cheap home without a second progression system — the open question is only the trigger and reward, not the plumbing: what specifically promotes a pawn from anonymous to identified (surviving N fights? a flat chance per fight survived?), and whether identification alone is the full "veterancy" reward or it should also carry a small stat bump. Visibility (inspector badge) and persistence through squad split/reserve pool both fall out for free once a pawn is identified, since identified records already persist through every other LOD transition.

### Open question: friendly fire
Not addressed anywhere in this cluster. The shuttle-shootdown mechanic (below) explicitly checks for hostility before rolling an intercept, and pawn targeting is implicitly hostile-only — nothing describes whether misses, splash damage, or stray fire can hit friendly or allied units. Given the aggregate-only combat-feedback approach (no floating damage numbers, just a status badge and event-log entries), friendly fire, if added, would need its own feedback treatment — a distinct event-log entry, since the general "a fight is happening" badge wouldn't distinguish it. Low priority unless a future splash-damage mechanic (artillery, a vehicle-mounted gun, drone strikes) makes stray hits plausible.

---

## Vehicles & crews

New ground vehicles plus an ammunition resource, building on the shuttle/fuel system and the combat model. Fuel is modeled as a self-contained per-squad resource rather than a shared pool; ammunition is the one genuinely new per-squad resource this system introduces.

**Vehicles** — squad-attached transports; mounted travel is faster than on foot:

- **Cars** — fast ground transport, running on fuel (the same fuel economy as shuttles — no new resource). Consumes fuel per distance traveled.
- **Bikes** — 2-seat fast ground transport, fuel-powered. Purpose-built as the transport for drone-operator crews (below).
- **Van / minibus (бусік)** — 6-seat, road-bound transport on fuel, following the road graph rather than flying straight like a shuttle. Vehicle table: bike (2 seats) · car (4 seats) · van (6 seats, road-bound) · shuttle (6 seats, flies off-road).
- **НРК (ground robot / UGV)** — a battery-powered cargo robot attached to a squad, with a self-contained battery stat (bigger battery = more range and cargo). No new electricity resource — it recharges abstractly in a friendly city. Hauls extra cargo, primarily ammunition, enabling suppression play (surrounding a target and sustaining fire from a large ammo reserve).
- **Ammunition (БК)** — a per-squad resource, consumed when the squad fires in combat (ranged and suppression fire spend it faster). Replenished in a friendly city, or from an attached НРК's cargo. At zero ammunition, the squad can't sustain fire and must resupply. Suppression means deliberately spending a large ammunition budget for continuous fire.

**Drone-operator crews** — a 2-pawn ranged standoff crew that attacks from a distance via drones, extending the ranged weapon class with a longer-range "drone" variant. Moves as a pair on a bike, and spends ammunition like any other ranged fire.

**Crew-only advanced systems** generalize the drone crew: drone control (strike and cargo drones), anti-air, and anti-missile defense can only be operated by a dedicated 2-person crew — never a plain squad or single pawn. In the loadout manager (below), these "means of action" are gated to a crew slot, requiring two pawns dedicated to fielding the system. Anti-air/anti-missile is a defensive capability that intercepts air threats — enemy shuttles, drones, or missiles — within range. Default crew size is 2; intercept range and rate are tunable.

Together: a squad can mount a car or bike (faster, burns fuel) and attach an НРК (extra ammunition capacity); firing drains ammunition, hitting zero halts sustained fire until resupplied in a friendly city; a 2-pawn drone crew on a bike attacks at extended range.

### Mounted combat: dismount to fight, and combat-transports
**Core rule: you cannot fight while mounted — passengers must dismount to fight.** A normal transport (shuttle, car, bike, van) is movement only: when combat starts, its passengers automatically disembark and fight on foot, and the transport parks. Every transport carries a "can fight mounted" flag, false by default; combat-transports (below) set it true. Mounted-but-not-fighting units caught in a fight are vulnerable until they dismount.

Auto-dismount trigger: an armed rider on a non-combat transport auto-dismounts once a hostile armed combatant comes within about 40 units of the vehicle. Unarmed riders never auto-dismount — they can't fight anyway, and just ride.

Auto-re-board when the fight ends: a pawn that was force-dismounted by the core rule automatically re-boards once the fight is over (no hostile threat remains within range of the vehicle) and it has walked back within a shorter re-board range (about 8 units) of that vehicle. A returning driver reclaims the wheel if the seat is empty, so a parked transport can move again the moment its driver returns. Manually leaving a transport (a deliberate player action) is one-way and does not auto-re-board — only a combat-forced dismount reverses itself automatically.

**БМП / IFV** — a weapon platform, unlocked through an organization upgrade. Carries 6 dismount infantry, who get out and fight on foot per the core rule above, plus 3 crew who do not dismount — they man the vehicle's own gun and fight from inside it. The БМП is itself an armored combat unit: after its 6 passengers disembark, the vehicle and its 3 crew keep fighting on as a tough armored/ranged unit in its own right.

**Combat shuttle** — a premium shuttle variant, also gated behind an organization upgrade, that can fight while mounted: the squad fires while flying instead of being forced to dismount, for an airborne-gunship feel.

### Squad loadout and transport manager
A management window in a squad's settings, composing its roster, transport, and "means of action" in one place.

- **Per-pawn assignment.** Each pawn gets a transport role — driver, operator (which can be remote), passenger, or on-foot — plus an equipment/means assignment (strike drones, cargo/hauling, explosives, and so on). Example: pawn A drives a bike; pawn B rides the same bike but remotely operates the squad's НРК, which follows under that remote control.
- **Remote operation is free within the squad.** A vehicle's designated operator is a logical assignment independent of which seat that pawn actually occupies — any pawn can operate any of its own squad's vehicles, since the squad moves together and stays in range. No comms/range limit for now. Operators of combat-transports still follow the dismount rule: operators of a "can fight mounted" vehicle fight mounted, everyone else must dismount.
- **"Means of action" surfaces the orders the current loadout unlocks** — strike (combat drones), supply (send a cargo delivery to someone), work at an enterprise plus deliver via cargo drone while working. The window configures and exposes these; it doesn't reinvent the underlying order systems.
- Opening a squad's manager lets you assign each pawn a transport role (including a remote НРК operator riding a bike) and an equipment; the squad's available actions reflect the loadout, and assignments drive both movement (an НРК follows its remote operator's squad) and combat (dismount rules apply as above).

### Open question: cargo/passenger weight and vehicle speed
Whether cargo or passenger load affects vehicle speed is unresolved. The base rule gives each vehicle family one flat speed constant (a mounted group moves at its slowest member's speed), with nothing scaling it down by passenger count, ammunition load, or an attached НРК's cargo — consistent with keeping fuel and cargo simple, but not explicitly ratified either way. Options: (a) confirm "no cargo speed penalty" as the deliberate answer, or (b) if a penalty is wanted (a laden НРК should plausibly be slower), scope it as a small additive multiplier on group speed.

### Open question: boarding/disembarking inside a contested capture zone
The auto-dismount/auto-re-board rules above are specified purely in terms of distance-to-threat, with no mention of contested-capture state (two or more teams' squads inside the same capture zone). Two edge cases fall through: (1) can a squad board a vehicle while standing inside a contested zone with living enemies present, or should mounting be blocked or interrupted the same way combat forces a dismount? (2) if a squad completes an auto-re-board inside a settlement that's mid-capture, does that reset or pause the capture-progress meter, or is occupancy purely presence-based regardless of mounted state? Recommendation: capture-meter contribution should key off "health-bearing units present," regardless of mounted state — mounting or dismounting shouldn't interrupt an in-progress capture, only actual presence/absence should. Boarding while contested should probably be allowed (the fight being over is the natural gate, not zone-contest status), but this isn't yet ratified.

---

## Transport, squads & command

### Mounted-movement rules: seating, family, speed
The seating/family/speed contract the rest of the transport and command system reads.

- Transport types are air (shuttles) and ground (cars, bikes, vans, НРК, and so on), each with a seat count, a speed multiplier, and a family tag: bike (2 seats) · car (4) · van (6, road-bound) · shuttle (6, air) · attack-shuttle/gunship (6, air).
- **All-or-nothing seating:** a squad can only mount up if total seat capacity covers every soldier in the squad — one unseated pawn means no mounted departure at all. The remedy is to split the squad or release the extra pawns to reserve (below).
- **Family homogeneity:** a mounted group must be all-air or all-ground — never mixed.
- **Group speed is the minimum** speed multiplier across the active family's vehicles — the group moves at the pace of its slowest transport. Air transport flies in a straight line; road-bound ground transport follows the road graph.

Ground transport genuinely following roads (rather than driving straight) is specified in "Van/minibus road-following," below.

### Split squads and reserve pool
The escape valve for when the seating rule can't fit everyone.

- **Split:** select a subset of a squad's pawns to form a new squad at the same spot, taking those concrete pawns with their strength/traits preserved; both squads re-seat afterward. Default subset is the current selection, or half the squad if nothing's selected. The new squad-org is a **direct subordinate** of the original (parentId = the original squad), not an independent peer — this is exactly what a squad's subordinate-squad capacity (base 1, see "Organization capacity," above) is for: a temporary detachment (e.g. sending pawns to rest while the main body stays mobile), not a permanent fork.
- **Recall:** the reverse of Split — dissolves a direct-subordinate squad-org and merges its pawns back into the parent's roster, freeing the subordinate-squad slot. Requires the same proximity Split itself needs (both squads at the same spot).
- **Release to reserve ("в запас"):** selected pawns leave as concrete pawn objects into a reserve pool, rather than being dissolved into abstract population; an emptied squad is deleted.
- Reserves live at the nearest settlement owned by the squad's organization, and are shown in that settlement's inspector. Pooling is instant and abstracted — no walk-back required.
- **Pulling from reserve:** a settlement-inspector action beside recruit — "From reserve (N)" — reinforces the nearest friendly squad, or forms a new one, for free (the people and equipment were already paid for). Reserve pawns are already-counted residents, not double-counted population.
- The per-settlement reserve pool is the same pool that organization-level worker-role systems draw from — one shared pool, not a parallel store.
- **Note:** the split/merge action has a keyboard shortcut (`K`) — see the player-abilities reference.

### Squad context menu and order options
The canonical input scheme for a selected squad:

- **Plain right-click = MOVE** to the point or object (capture behavior governed by the attacking/non-attacking toggle above).
- **Shift+right-click = QUEUE** — append to the squad's order queue rather than replacing it; degrades to a plain replace if the order-queue system isn't available.
- **Hold right-click on an object (~250ms) = OPTIONS WINDOW** at the target: left-click picks an option, right-click cancels/closes; a quick right-click, released before the hold threshold, stays a plain MOVE.
- Options include **Attack** (an attacking move, resolved by the combat system) and **Garrison** (enabled only when the target is your own property and the squad is yours — assigns the garrison role, giving cheaper upkeep and a defense bonus); the menu is extensible to Split/Release and Board/Dismount. A separate hotkey (`R`) sets a patrol route.
- The enable/disable logic for each option (Attack requires a hostile-faction target; Garrison requires a friendly settlement and toggles to "stand down" if already garrisoning it; Cancel requires an active order) is centrally defined, so the menu widget just renders the resulting list.

This is one instance of a general rule, not a squad-specific mechanism — see "Context-sensitive option menu — one mechanism for every controllable actor," under UI conventions, below, for how the same hold-right-click Options window behaves when an organization or a character is the currently selected actor instead of a squad.

The order-menu interaction, in detail:

- **Opening:** hold right mouse button on the selected squad for about 0.3 seconds — the menu opens while still held, not on release. A quick right-click, released before the hold timer fires, is a plain MOVE.
- **Confirming:** left-click the option row. **Closing without acting:** left-click anywhere, or right-click anywhere on an already-open menu (which only closes it — no order issued, no new menu opened).
- A **"quick-cast orders" toggle** (default off): when on, releasing right-click exactly over an option applies it immediately — hold, hover, release, all in one motion. When off, releasing does nothing and the menu stays open until confirmed with a left-click.

### Air-assault AI: fly in, dismount, storm, refuel or garrison
A utility-AI behavior for automated squads, built on the same framework as other AI behaviors rather than as a separate system.

- **Eligibility:** squads with an all-air, fully-seated transport.
- **Targets:** capturable enemy cities, scored by distance, relative strength, and a fuel-range gate.
- **Phase machine:** APPROACH (fly mounted to a drop point near the target city) → DISMOUNT (leave the shuttles, which park) → STORM (fight and capture on foot) → RESOLVE on success, choosing between refuel-return (re-board and fly to the nearest own city to refuel) or garrison (assign the garrison role, hold the position, and wait for supply logistics to bring fuel locally). Fuel is a hard gate throughout — a garrisoning squad's shuttles won't re-mount until fuel is actually delivered.
- The refuel/garrison-replenish loop draws fuel from the captured city's local supply stock once that system is available.

### Squad behavioral leash (homing bias)
A soft tether so wandering AI squads drift back toward home instead of straying indefinitely.

An anchor point is set per squad — preferring, in order, a parked transport's position, the nearest owned settlement, or a cached spawn point. This applies only to squads with no active player order, not currently garrisoned, and specifically set to "wander." A squad that strays past a leash radius (default about 250 units) gets a heading bias back toward its anchor, stronger the further past the radius, so it makes brief excursions and then drifts home; within the radius, behavior is unaffected. Leash strength is tunable (zero disables it). Player-ordered squads — move, attack, patrol, caravan — are never leashed.

### Van/minibus (бусік) road-following
Vans follow the road graph rather than driving in a straight line, via pathfinding over the road network with mid-segment road entry (a van can join a road partway between two nodes) and off-graph snapping back to a direct path when no road route exists. Applies only while van-mounted and not flying. Reuses the car's fuel economy.

### Note: Camp
Both the player-abilities and squad-capabilities references mention a "Camp" action (build/occupy at a point, tied to camp-rest), and it's referenced in passing elsewhere in this cluster (see "Field defensive mode," below) — but no section within this cluster fully specifies Camp's own mechanics: what "build/occupy at a point" means mechanically, its relationship to fatigue/rest, or whether a camp is a persistent map object or transient squad-state (like entrenchment, below). It likely belongs in a different part of the design document; flagging so it has a clear home somewhere, if it doesn't already.

---

## Territory control, assault & shuttle ops

### Territory and settlement ownership
Territory isn't a continuous field radiating from squads — it's discrete and settlement-anchored. A settlement belongs to whichever faction/organization last captured it (see Contested capture, below); the area a settlement's ownership is credited with for income and scoring purposes is its worldgen-assigned zone (see Terrain zones under Worldgen), not anything projected by the squads standing in it. Open ground between settlements isn't "controlled" by anyone in the simulation sense — a squad sitting in the open influences nothing beyond its own combat presence.

### Assault mode
A per-squad toggle that trades fatigue for a faster capture attempt on a hostile, uncontested settlement it's physically present at.

- Assault is a per-squad on/off state, player-toggled from the squad's orders panel.
- **Cost:** the fatigue system drains noticeably faster while assaulting (about ×2.5) — no new bar, no separate recovery track. A worn-down assaulting squad's own strength (and therefore its capture contribution, below) degrades along with its fatigue, so the cost is self-limiting.
- **Reward:** the capture-progress meter on a hostile, uncontested settlement (see Contested capture, above) fills faster while an assaulting squad is present, scaled by that squad's live pawn count and fatigue level. Settlement income is untouched by Assault mode — income comes from settlements actually owned, not from contested ground.
- Assault stays a manual player toggle for now; an automated squad choosing to assault on its own would be a future addition to the utility-AI framework, not a way of bypassing it.
- Surfaced on the squad marker as a fifth activity-status badge state, alongside marching/resting/garrisoned/entrenched (see "Squad marker rendering," above).

### Entrenchment / dig-in (окопи)
A field "dig in" mechanic distinct from garrison and camp: pure squad-state that decays on move, with no persistent map feature and no ownable trench.

- A squad has a standing-intent toggle ("dig in," a player order, hotkey `E`) and a progress value from 0 to 1.
- While dug in and stationary, progress rises over roughly 20 seconds; moving, or cancelling dig-in, decays it over about 8 seconds — you can't carry your trench with you.
- The defense bonus is a single damage-reduction divisor applied to incoming damage at both combat scales: fully dug in roughly halves damage taken. The squad's own offense is untouched.
- Dig-in is free — the only cost is time and immobility.
- **Render:** earthwork visuals around pawns at detail zoom while entrenching, and a fortified badge on the squad/settlement marker once entrenchment progress crosses a threshold.
- Composes independently with Assault mode and fatigue (condition multiplier) — the math for each is orthogonal.
- Entrenchment progress is transient (not saved) — on loading a save, a squad simply isn't dug in until re-ordered, a minor loss given it fully decays after about 8 seconds of movement anyway.

**Note (unresolved terminology mismatch):** elsewhere, entrenchment is described as a defense bonus that accumulates over time and is "lost on damage/move." The rule specified above only decays entrenchment on movement — taking damage doesn't reset or reduce it at all, so a dug-in squad keeps its full defense bonus indefinitely while stationary, regardless of casualties taken. This is a real behavior question, not just wording: either (a) "lost on damage" should be corrected to "lost on move only," matching the mechanic as designed and the simpler option, or (b) entrenchment should actually break, at least partially, on taking a hit, matching more conventional expectations — which would need an added rule (entrenchment decays by some amount on taking any damage, on top of the move-decay). Not resolved here — flagging for a ruling, and noting explicitly so this doesn't get silently "fixed" as a wording issue without checking whether the mechanic itself should change.

### Field defensive mode (melee camouflage, ranged entrenchment)
Evolves the entrenchment mechanic above: on the same "dig in / take cover" order, the effect branches by weapon type.

- **Melee = camouflage:** detected later by enemies (a reduced detection radius), plus an ambush first-strike bonus on breaking cover.
- **Ranged = entrenchment:** the damage-reduction bonus described above.
- Allowed near a camp too, tying into camp-rest.
- The squad gets a field-defensive/entrenched status icon.

V1 scope: camouflage only affects detection (a dug-in melee squad is simply harder to spot until an enemy gets close), and the damage-reduction bonus applies to ranged attackers only — so a dug-in melee squad genuinely trades the defense bonus for stealth rather than getting both. The ambush first-strike bonus and the status icon are later additions.

### Siege pawn behavior (garrison ring and attacker encirclement)
Garrisoned defenders at detail zoom arrange themselves in a perimeter ring around the settlement footprint, rather than a blob.

- The player can focus the ring toward a threatened direction with a directional drag on the garrisoned settlement, skewing ring-slot density toward that arc (also reachable from the order-options window); absent player input, the ring auto-shifts toward an active threat as a fallback.
- Ring positions are static slots derived from the settlement's footprint radius. Defenders hold their ring position elastically — allowed a short deviation toward a nearby threat before snapping back, rather than fully pursuing.
- Attacking pawns score ring positions by how thin the defensive arc is there, so encirclement and flanking emerge from that scoring rather than being scripted directly.

In short: garrison forms a perimeter defensive ring; the player can shift the ring's weight toward the attack direction; attackers seek out and exploit the thinnest arcs. Ring radius scales with the settlement's footprint.

### Open question: siege attrition (starving or breaching a besieged garrison)
The siege behavior above fully specifies ring formation, directional focus, and flank-scoring — a positioning and rendering layer — but says nothing about a besieged garrison taking any special attrition beyond ordinary combat at the ring's edge. Real sieges typically have the garrison's supply or upkeep degrade under blockade (compare the supply-linked combat effectiveness gap noted above), or a distinct "breach" state once ring pressure crosses some threshold. As specified, this reads as "combat, but pawns stand in a ring" rather than a distinct siege mechanic with its own win condition beyond ordinary attrition and capture. Flagging for a future ruling on whether siege should stay positioning-only, or gain a blockade/starvation layer.

### Enter buildings — interior sub-LOD
Zooming past the detailed (L2) tier into a single building opens a procedurally generated interior — a new, more detailed LOD tier — within the same continuous world view, rather than a separate scene or a modal, seeded consistently with the rest of procedural worldgen. Pawns walk from room to room inside.

What pawns do inside, for now, is occupancy and cover (using the same damage-reduction-divisor approach as entrenchment and garrison); full interior combat — room-clearing, interior pathfinding as its own tactical layer — is a deeper feature this sub-LOD enables but doesn't yet fully deliver.

Pawns collide with each other and with building walls; a rotated building's collision shape is a simple box around it, slightly larger than its drawn footprint, which can very occasionally let a pawn visually clip a corner — an accepted v1 trade-off, reversible later if it reads as a real problem. In v1, only pawn-versus-pawn and pawn-versus-building collision exists: parked vehicles don't yet block movement, and a pawn blocked by a building simply stops at the wall rather than routing around it — both are later additions, as is genuine pathing through maze-like interiors (out of scope unless playtesting shows it's actually needed). Background civilians have no physical body in v1, to keep a crowded settlement affordable to simulate — a fully physical crowd is a future option if the world reads as too insubstantial.

The interior design, in full:

1. **Interior LOD.** A building's interior is either fully simulated, with individually-simulated pawns walking room to room inside it, or an abstract occupancy aggregate (count, composition, morale, average HP) — decided by the same world-global "what's currently relevant" signal (combat, player focus, nearby events) that already governs simulation depth elsewhere, never a separate per-building or per-camera rule.
2. **Room layout generation.** Procedural, per building footprint: each building's interior is divided into rooms with a minimum size, connected by doors on the walls they share, with exactly one exterior door on the street-facing side. Deterministically seeded, the same as the rest of building generation.
3. **Interior navigation.** Pawns path from room to room through doors, rather than moving freely across a whole interior at once; once inside a room, they move and avoid each other and the walls the same way they do outdoors.
4. **Camera and render.** Entering a building zooms the same continuous camera into that building's footprint and draws its room layout instead of the world — not a modal or a separate scene, consistent with the existing zoom mechanics.
5. **Storage and inventory.** A simple numeric stock readout per resource type, shown read-only in the inspector when a building's interior is focused — no drag-drop or slot-based inventory UI.

Taken together: the materialize/dematerialize mechanism that decides when a building's interior becomes "real" versus collapses to an aggregate, the room-layout generator, room-to-room pathfinding, and the interior camera panel with its live storage readout — selecting a settlement at street-level zoom opens an interior overlay showing an actual room layout and live per-building stock.

### Shuttle disembark modes (full dismount vs. keep-a-pilot) and Extract-here
Extends the boarding/leaving mechanic with a per-squad disembark mode plus an "Extract-here" order, turning leaving your shuttles into a firepower-versus-extraction tradeoff.

- **Full dismount** (default): all occupants disembark and every shuttle empties and parks — maximum boots on the ground, but the squad must walk back together to re-board (slow, and exposed while doing it).
- **Keep-a-pilot:** leave exactly one pawn aboard one parked shuttle — one fewer fighter on foot, but that shuttle stays crewed and can fly back quickly.
- **Extract-here:** a new order that flies the kept-pilot shuttle to the on-foot squad's current position and re-boards everyone present. Manual by default; the air-assault AI automatically picks the keep-a-pilot option and issues an extract order when shootdown risk (below) is assessed as low.

On extraction, the shuttle flies to the squad and, once within re-board range, re-seats everyone present up to capacity and restores mounted state. UI: a "keep pilot" toggle on the leave-shuttles order, plus the Extract-here order itself; both are queueable.

### Shuttle shootdown (intercept roll) and crews garrisoning like squads
Two connected mechanics that make extraction (above) a real gamble.

- **Shuttle shootdown:** a periodic scan checks every in-flight shuttle (including a kept-pilot shuttle mid-extraction) against every hostile anti-air crew within intercept range, and rolls an intercept chance modified by the shuttle's speed — a faster shuttle is harder to hit. On a successful intercept, the shuttle is destroyed and everyone aboard, pilot included, dies. Combat-shuttle and strike-drone shooters aren't modeled as threats in v1.
- **Crews garrison like squads:** anti-air and anti-missile crew types are first-class crews that garrison exactly like a plain squad, through the same garrison role — no special anti-air slot or separate policy. Air defense emerges naturally from this: a garrisoned interceptor or missile crew is simply a hostile anti-air crew within intercept range of any shuttle flying over its city, so the shootdown scan already covers it automatically. Splitting interceptor-drone versus missile-interceptor (SAM) capabilities into distinct types is a deferred follow-up.

### Note: terrain effects on combat
A few related points worth cross-referencing here, from elsewhere in the design:

- The combat-feedback design (see "Combat feedback: exchange-of-fire visibility," below) keeps feedback aggregate-only: attack-lines, an "in combat" badge, and event-log casualty entries — deliberately no floating damage numbers, consistent with Scale A's aggregate-only design.
- An aim-before-fire / reposition / take-cover addition layers an aim phase (roughly 8–10 ticks) onto the same per-pawn engagement task the weapon-class mechanic runs on — this is the same rate-of-fire question flagged in "Scale-B pawn damage resolution" above, where per-shot aim versus one-time aim cost need to be resolved together.
- Worldgen cover/occlusion data for tactical pawn positioning is planned but not yet designed. Until it lands, no terrain or cover data feeds combat anywhere in this cluster — the entrenchment defense bonus is squad-state only, not tied to any specific tile or position, and the siege ring/flank scoring is pure geometry, not terrain-aware. The to-hit formula above stubs a cover-mitigation term, ready to wire in once that data exists.

---

### Combat feedback: exchange-of-fire visibility
Squad-scale combat at default zoom must visibly show that a fight is happening — otherwise casualties read as unexplained HP loss. Design: a short-lived attack-line/tracer between attacker and target at close-to-medium zoom, aggregating to a single line per squad-pair at far zoom; an "in combat" status badge visible at any zoom level; and casualty events surfaced as text in the event log as a fallback. Deliberately no floating damage numbers — the combat badge plus event log should communicate "a fight is happening" without per-hit clutter at squad scale. No projectile simulation is needed; a flash-and-fade effect driven by discrete fire events is enough.

### Combat behavior: aim-before-fire, reposition, take cover
Combat pawns should have a brief aim phase before firing: once weapon-ready and in range, a pawn stops moving, aims for a short duration (roughly 8–10 ticks, to be tuned via playtesting), and suppresses repositioning during that window. After the aim window it fires, then re-arms before considering repositioning again. This aim delay applies to all weapon types, including melee, not just ranged weapons. Taking cover during combat should be based on real physical cover geometry in the world (walls, rocks, treelines) rather than an abstract approximation — this depends on a cover/occlusion data system that isn't designed yet (see below) and shouldn't ship as a rough approximation ahead of it. **Open question:** whether the aim-phase countdown should freeze while the game is paused (see the pause behavior matrix above) is unresolved.

### Heavy autonomous ground vehicle
A large, crewless armored ground vehicle — no soldiers required to operate it. Two variants: a Worker variant that can staff an enterprise without drawing on the population pool (since it's a machine, not a person), and a Combat variant that carries a slow-firing cannon. The cannon's ammunition is a scarce, manufactured resource produced by a staffed forge (a step up from ordinary small-arms production), so fielding combat UGVs is gated by industrial capacity, not just money. The vehicle runs on an electric battery that only drains while actually moving — sitting idle costs nothing — giving it a long standing presence at low cost, unlike fuel-hungry vehicles that burn resources even when parked. It's driven by the same AI as any other squad.

---

## Economy & production

### Resource model — canonical reference table

| Resource | Unit | Held at | Produced by | Consumed by |
|---|---|---|---|---|
| **money** | abstract currency, not physically hauled | per-org treasury (the chain-of-command root org) | tax, territory income, production/trade fees, arbitrage margin | hire cost, upkeep, construction payments, recruit cost, trade-post purchases |
| **people** | headcount | per-settlement stock | settlement population growth (food-gated, housing-capped) | squad recruiting, worker-squad hiring (founding a squad-org itself draws on personal funds, not the people pool) |
| **food** | ration units | per-settlement stock | farm (output rate 1/tick, tuned to match upkeep) | population upkeep/growth, squad rations ("located rations" model — a squad's rations are the same food resource, carried) |
| **weapons** | unit count | per-settlement/team stock | arms maker / armory (steel + components → weapons) | recruit cost, squad equipping |
| **materials** ("wood") | unit count | per-settlement stock | lumber mill / lumberjack camp (forest → materials) | house/settlement upgrades, construction |
| **ore** | unit count | per-settlement stock | mine (materials → ore) | smelter (ore → steel) |
| **steel** | unit count | per-settlement stock | smelter/forge (ore → steel) | weaponsmith or armory (steel → weapons, or steel → parts), ammoworks (steel → ammo) |
| **parts** | unit count | per-settlement stock | forge (steel → parts) | armory (parts → weapons) |
| **components** | unit count | per-settlement stock | component factory | shuttle assembly (10 components → 1 shuttle), arms maker (1 component → 1 weapon), drone assembly |
| **fuel** | unit count (settlement stock) + per-vehicle tank | settlement stock + per-shuttle/vehicle tank (shuttle tank capacity 400) | oil depot | shuttle flight (drains per straight-line distance flown), vehicle movement, squad refuel |
| **ammo** | unit count | settlement stock + per-squad carried | ammoworks (steel → ammo) | squad ranged fire (per-shot drawdown) |
| **explosives** | unit count | per-settlement stock | explosives plant (flat rate) | drone assembly at the armory |
| **drones** (consumable strike drones — distinct from cargo drones) | unit count | settlement stock | armory (two-input recipe: components + explosives) | drone-crew strike attacks (replaces ammo for drone crews) |

Several production-chain rates and thresholds are not yet given fixed numeric defaults anywhere in the design. Proposed starting values (tune via playtesting): forge steel/weapon rates, armory rate, weapon-steel cost, parts rate; worker-hire people cost; ammoworks steel→ammo ratio; drone-assembly components/explosives cost and strike damage/radius; arbitrage minimum margin; ambush radius/chance and drone risk multiplier; stock soft-caps and surplus/deficit thresholds. Where a concrete number is proposed below, it's marked as a proposed default.

**Open question — storage caps and overflow.** No section states what happens when a local stockpile hits its cap: does the producer stall, or does the excess simply get discarded? Proposed default: excess production beyond a resource's stock cap is discarded (wasted), and producers do not stall — this avoids one stalled producer silently backing up and blocking an entire chain (e.g. an unharvested mine backing ore into a stalled smelter into a stalled weaponsmith). A future waste-visibility indicator is a natural companion but not yet designed. Proposed stock cap: roughly 4× a resource's target stock.

### Unified resource pool

One resource pool per owning org (the root org at the top of a chain of command) — not a parallel per-team or per-settlement system. Base resources: **money**, **people**, **food**, **weapons**, **materials** ("wood"), later expanded with ore/steel/parts/components/fuel/ammo/explosives/drones (see the table above).

Producers are economic organizations, each running a per-tick production rule into the shared pool:
- **lumber mill:** forest → materials; materials fund settlement upgrades (housing).
- **farm:** → food; food feeds population growth; a food deficit causes population decline (starvation).
- **arms maker:** materials (later: components) → weapons.

Sinks: house/settlement upgrades consume materials; recruiting a squad costs **people + weapons** simultaneously — missing either blocks the spawn (starting cost: 10 people + 5 weapons per pawn) via a recruit button in the settlement inspector, disabled when unaffordable.

v1 defaults: forest is a coarse cell layer seeded near settlements (harvesting clears cells); lumber mills, farms, and arms makers are auto-placed near their settlement (no manual placement); weapons production is restricted to city and megalopolis tier settlements. Population grows slowly over time, gated by food and (see below) by housing; weapons are produced by enterprises at a roughly constant per-tick rate.

Proposed default production rates (tune via playtesting): lumber mill materials rate = 1/tick, arms-maker weapons rate = 1/tick, farm food rate = 1/tick (matches upkeep) — all scaling up with settlement tier (see "Enterprise distribution scales with settlement tier" below).

### Settlement population decline and death

Sustained food deficit actively decreases population, symmetric to growth: when food surplus is negative, population is reduced by a decline rate each tick (proposed default: half the growth rate), floored at 0.

A settlement at population 0 becomes **abandoned**: it loses its owner, its enterprises stop producing (no staff), and it earns no income. It remains a normal, capturable map location — it isn't removed — and can be repopulated later: population can grow again from 0 once the settlement is recaptured and reseeded with real food production. An unowned settlement with no food production simply stays at 0 indefinitely; it isn't "dead," just unpopulated.

### Territory-based settlement income

Income is a base amount by settlement tier (city +1, megalopolis +3 per interval; village/camp earn nothing) plus a small, saturating scaling bonus from the territory the settlement controls (its influence-field/region area):

```
income = base + territoryFactor × min(area, areaCap)
```

Proposed defaults: `territoryFactor = 0.002`, `areaCap = 1000`. The bonus is deliberately kept small and saturating so it's a gentle modifier rather than a runaway snowball — but a settlement holding more territory does earn measurably more than an identical one holding less, giving expansion a concrete economic payoff.

### Squad upkeep and the creation premium

Two levers keep squad counts self-limiting economically, with no hard squad cap — the economy itself is the limiter (tuned so roughly one city + one megalopolis sustains about 5 squads):

1. **Creation premium** — spawning a squad costs an up-front bonus on top of the base hire cost (proposed default: ×1.0, i.e. roughly doubling the up-front cost), so losing a squad genuinely hurts.
2. **Ongoing per-squad upkeep** drains money continuously, so an org's sustainable squad count is roughly income ÷ upkeep.

The payer is the squad's funding org's treasury — specifically the root org at the top of its chain of command; an unpaired squad's upkeep goes untracked. **Insolvency is gradual desertion, not instant disbanding:** an unpaid squad loses pawns one at a time — the last-joined pawn leaves first, keeping the leader stable until the squad's final pawn — and eventually disbands. This is a soft, reversible slide: paying again halts it. A deserted pawn isn't removed from the game; it stays a live, unaffiliated entity.

**Open question — bankruptcy.** Squad-upkeep desertion and bank-loan default (see "Bank — a credit enterprise," below) are the only insolvency mechanics decided so far. There's no decided behavior for an org's treasury itself going negative from other sinks (construction payments, recruit costs, arbitrage purchases, founding a trading post) — see "Open design questions" at the end of this document.

### City garrison

A garrison is a role assigned to a normal squad, not a separate unit type. Assigning a squad to a city makes it that city's defender: cheaper upkeep (proposed default ×0.5) and a defense bonus while defending its assigned settlement (proposed default ×1.5). Ordering it off to attack, or unassigning it, clears the garrison status and reverts it to a normal, full-upkeep mobile squad.

### Recruiting and reinforcing squads

Owned city/megalopolis settlements can produce new squads two ways:

- **Automatic reinforcement:** on a per-settlement cooldown, once the owning treasury can afford the hire cost, a new squad spawns just outside the settlement with a hold/garrison order, and the hire cost is deducted.
- **Manual recruiting:** the settlement inspector shows a "Recruit squad" button for a settlement the player owns directly, showing its cost (example: 80 money · 10 people · 5 weapons → squad of 4), disabled when unaffordable.

**Open question:** the recruit button only forms a *new* squad — reinforcing an existing squad with additional pawns isn't designed yet. It's also scoped to settlements owned directly by the player's org, not subordinate-owned settlements.

### Construction as a market

Construction is a market loop, not a direct build: a construction company (an economic org) builds structures for payment, consuming materials and labor over time. The demanding political org (a city council or city owner) issues build orders ("need N houses") and pays for them, rather than building directly. Builds cover settlement buildings (e.g. houses) and new enterprises. An enterprise is either embedded in a settlement (visible only at close zoom) or standalone (a camp-like map entity, e.g. a lumberjack camp by a forest). Demand can be auto-issued by org AI from need, or issued manually by a human-controlled org.

Materials are drawn from the target settlement's stock; money flows from buyer to builder each productive tick (no escrow). If inputs are missing or the buyer can't pay on a given tick, the build simply stalls — no spend, no progress — until conditions are met again.

**Any org's existing squad can build**, not only a dedicated construction company: assigning a squad a "build" order targets it at a build order and site. A raw, untrained squad can build, just less efficiently (proposed default: 0.5× work rate) than a squad drawn from a dedicated construction-company enterprise (1.0× rate) — the construction company is an upgrade path, not a prerequisite, unlocked by paying a founding cost (proposed default: 50 money). A builder squad must physically travel to the build site before work begins, which is what makes construction visible and interruptible — a squad marching to a site — rather than an invisible settlement-local stat.

Any defined structure type can be commissioned this way — houses, farms, mines, factories, and other enterprise types, not just houses.

**Open question:** per-company build serialization (limiting a construction company to one build at a time) is undecided. Tools/materials required for construction are a flat efficiency multiplier in v1 rather than a tracked, consumable inventory item.

### Population growth capped by housing

Population growth is gated by both food and housing. Housing has a demand signal: `housingShortfall = max(0, ceil(people/peoplePerHouse) − housing)`. Growth halts once `people >= housing × peoplePerHouse`, on top of the existing food-surplus gate — housing is a second growth gate alongside food (proposed/confirmed default: `peoplePerHouse = 20`).

A freshly founded settlement is seeded with housing ahead of its starting population (`housing = ceil(people/peoplePerHouse) × headroom`, proposed default `headroom = 1.5`), so it has growth room before construction becomes the bottleneck. An owner-org settlement keeps raising its housing over time by automatically issuing house-build orders as it grows. An ownerless/unowned settlement's population plateaus permanently at its seeded housing cap until it's captured and re-owned (consistent with the abandonment behavior above) — it doesn't regress, it simply stops growing. A settlement with no housing seeded at all is treated as uncapped rather than frozen, so the housing gate never accidentally blocks growth by default.

### Dynamic scarcity-based pricing and deficit-priority delivery

Every resource has a smooth, deterministic price curve driven by local scarcity — no cliffs, no randomness:

```
price = basePrice / (1 + stock/targetStock)
```

This is sharpened by a demand-pressure term so two settlements with identical stock but different consumption rates don't read as equally scarce — the one burning through stock faster is more urgent:

```
demandPressure = clamp(lastConsumption / targetStock, 0, demandPressureCap)   // proposed cap: 1.0
effectivePrice = price × (1 + demandPressure)
```

`lastConsumption` reuses the settlement's already-tracked last-step consumption — no separate demand-tracking state is needed.

This price signal drives more than display — it also determines delivery order. When multiple settlements have simultaneous deficits, deliveries are dispatched in order of scarcity (highest effective price first) rather than in a fixed resource-type order, so the most dire shortage is serviced first. Carrier/dispatch mechanics (which carrier, which donor site) are otherwise unchanged; only the outer order in which deficits are worked through changes.

The price is shown directly to the player in the settlement inspector (a resource / stock / net-per-step / price table, both per-settlement and in a multi-settlement economy view) — the same number driving delivery urgency is the number the player sees, with no separate hidden heuristic.

**Out of scope (deferred):** inter-org/inter-faction market pricing, labor-pool economics, distance-based delivery cost.

### Caravans carry influence (future)

A possible future upgrade: caravans carry their owner's color/influence along the roads they travel, leaving either a fading trail or a persistent corridor. Deferred until caravans are established and testable in-game — the visual effect can't be tuned unseen.

### Settlement population: demographic pool and character generation

A settlement's population is two layers over one headcount: the flat **people** resource stays the total, and on top of it sits a population layer of concrete characters plus a latent pool.

- **Latent pool:** an aggregate statistical profile of the not-yet-individualized residents — gender split plus per-trait/skill counts (e.g. 30% brave) — a "lot" of latent people, not entities.
- **Materialized characters:** full characters with the same traits and logic as any other character in the game, not a separate "citizen" type. A settlement's key people (org leaders, enterprise owners, enterprise worker squads) are these materialized characters.
- **Generation = draw from the pool by filter.** Requesting, say, "10 unemployed" or "10 highest military" picks from the latent pool and materializes each as a persistent, identified character (see "Identified vs. anonymous," under LOD, above) — a candidate generated but not selected has still been given a real record and stops being part of the pool's statistics.
- **Depletion and proportion recompute:** materializing a person decrements the latent pool by one and removes that person's trait contribution, so displayed proportions shift accordingly (drawing a brave character lowers the pool's brave count and brave-fraction). Total people is conserved — the person just moved from latent to concrete.
- **Going dormant and returning:** a materialized character who holds no role and has no history the player or simulation cares about can later collapse back to anonymous, restoring its trait contribution to the pool (the exact reverse of the draw above) — freeing simulation budget for population nobody's paying attention to. A character who holds a role (org leader, heir, slot occupant, enterprise owner) or has accumulated real history instead goes dormant, not anonymous: its record is preserved and resumes unchanged the next time it's needed, rather than being re-rolled from the pool.

A character's age is a flavor stat only (default: adult; demographic reports bucket child/adult/elder) — it does not drive aging or death-by-age mechanics. A character's settlement affiliation is an explicit residence link assigned at birth/recruitment, independent of which org owns the character — settlement demographics count residents by that link (a character with no residence link is uncounted).

### Character skills
Four skills sit alongside the ten personality traits (Just, Generous, Brave, Patient, Content, Cruel, Greedy, Wrathful, Cunning, Ambitious) on every character: **Melee combat**, **Shooting**, **Management**, **Socialization**. Skills are generated the same way traits are — part of the latent pool's statistical profile, materializing with the character exactly like a trait does (see "Settlement population," above), not a separate progression system. Traits layer an additive modifier onto their related skill (a tuning pass, not fixed here) rather than replacing it.

Skills currently drive organizational posts only (see "Organizational posts," below) — they don't yet feed Scale-B combat's to-hit/damage formula (see "Scale-B pawn damage resolution," above), which still reads from generic squad strength. Extending skills into combat is a natural future step, not ruled out, just not wired in yet.

---

## Trade & logistics

Physical trade fixes a "teleporting global pool" problem: resources are local and must be carried, so they visibly flow across the map — a shortage at the front pulls goods along the roads, and a broken or blocked route starves the settlements downstream of it.

### Foundation: local stockpiles, auto-logistics, and caravans

- **Local stockpiles.** Each settlement/enterprise holds its own stockpile per resource. Money may stay an abstract, global-per-org number, but goods do not — they're local. Producers fill local stock; consumers (smiths, recruiting, construction) draw from local stock; if it's empty locally, the good must be hauled in.
- **Auto-logistics by deficit.** A site with a surplus of a resource automatically dispatches a carrier to the nearest same-owner site with a deficit of that resource. This is internal logistics only — no prices, no inter-org money at this layer — an org only ever moves its own surplus to its own deficit.
- **Caravans are the carrier backbone.** Road-bound, owned by the dispatching site/org, a caravan picks up cargo at the surplus site, travels the road network, and drops it at the deficit site. High capacity, slow — caravans are the mass mover, with porters and drones as supplements.

Proposed defaults (tune via playtesting): surplus donor threshold = stock > 50, deficit sink threshold = stock < 15, stock soft-cap ≈ 4× target stock per resource.

### Porter units

A hauler unit that carries cargo using a cart (basic, road-bound, cheap) or an off-road unmanned ground vehicle (slower, no road needed). Supplements caravans for short, off-road, or flexible hauls — e.g. a standalone lumberjack camp with no road to the city — using the same surplus→deficit dispatch logic, picking cart vs. off-road vehicle by availability and terrain.

### Cargo drones

Flying resource transport that ignores roads and terrain: fast, but limited capacity and battery range. Gated behind an organizational upgrade — only a progressed/upgraded org unlocks drone logistics, making it a visible tech-progression payoff for premium long-range transfers between an upgraded org's sites. Once a source settlement's controlling org holds the cargo-drone upgrade, every haul from that source dispatches by drone (faster, smaller capacity) instead of by ground porter.

**Open question:** a manual per-order delivery-mode choice (auto/cart/drone) and route-risk/ambush exposure for ground carriers (see "Delivery mode and route risk" further below) are designed at the policy level; how they wire into logistics dispatch in detail is not yet specified.

### Caravan routing and behavior

Caravans route over the actual road network — pathfinding waypoint-to-waypoint along roads — rather than cutting straight lines across terrain, falling back to a direct straight-line path only when no road connects the two settlements (e.g. disconnected road networks), so a caravan never gets stuck with no route. Road paths are naturally longer than straight-line distance, so delivery timing reflects real travel distance.

Caravans are first-class map objects: distinctly sized and clickable, selectable and inspectable like a squad, with their own selection ring and an inspector panel showing route (origin → destination), cargo (resource and carried/capacity), phase (hauling vs. returning empty), carrier type (porter / ground vehicle / drone), and owning org. A caravan log records dispatch/arrival/loss events, with in-transit entries clickable to select-and-jump to the caravan; delivered/lost/cancelled entries are inert.

Carrier travel speed is tuned so a typical delivery route takes on the order of a few real-time minutes rather than tens of minutes, so caravans are actually observable during normal play instead of arriving long after the player has moved on.

### Trade & supply

**Supply policy.** A top-down supply-policy layer over the org hierarchy dictates what each settlement stocks and sells, and how much — the logistics layer above simply moves goods to fulfil it; squads replenish (refuel, resupply food) from a settlement's local for-sale stock. This adds no second "mover," it just sets the targets the surplus→deficit haulage already honors.

Policy fields: a stock minimum per resource, a for-sale flag per resource, and a one-time stock floor applied when a settlement is captured. Policy propagates top-down: the independent root org's policy applies to every settlement under it, and dependent orgs inherit it (a puppet's controller may dictate the puppet's policy).

**Trade enterprises** are a lightweight flag on a settlement (not a separate capturable entity), available at village and city tier, offering local stock for sale; a megalopolis is a top producer rather than a retail market. Food is part of the same local-stock model as every other good — farms feed a settlement's food stock, and both the market and squad resupply read from it.

A friendly squad at a settlement offering a resource for sale draws it (e.g. fuel) from local stock into its own tank; drawing from your own faction's stock is free (cross-faction pricing is a deferred future layer). Player-facing UI lets the player edit their own org's supply-policy fields — stock minimums, for-sale flags, delivery mode, escort level — per settlement.

**Open question — taxation.** A tax income source and a `taxRate` policy field are referenced as existing scaffolding, but nothing specifies who pays tax to whom, on what base, or at what cadence. See "Open design questions" below.

**Trade orgs, arbitrage, and player-as-merchant.** On top of internal (same-org) logistics, dedicated trade organizations can profit from arbitrage — buying a resource where the local price is low and selling where it's high.

- A city can host several independent trading posts simultaneously, each its own property with its own local stock and its own price — two posts in the same city can legitimately quote different prices, because each is priced from its own stock rather than a shared settlement-wide number.
- **Arbitrage caravans:** when a same-faction pair of trading posts shows a price gap beyond a minimum margin (proposed default: 15% spread), a caravan is automatically dispatched to buy at the cheap post and sell at the expensive one, crediting the margin (minus haul cost) to the owning org's treasury. This reuses the same porter/escort/ambush machinery as ordinary logistics — an arbitrage caravan is just another haul job with a different purpose.
- **Org AI trade decisions:** pursuing trade is one of an org's scored decision weights (alongside expansion, recruiting, and so on) — an org with a strong trade drive reopens resources it had previously fenced off from sale. Org AI also auto-tunes its supply policy under threat (raising escort levels) versus at peace/surplus (opening more stock for sale).
- **Player-as-merchant:** the player can execute a direct Buy/Sell transaction at a specific trading post's current live price (no negotiation — a simple pick-resource/quantity/confirm flow), rejected outright if the post lacks the stock or the player can't afford it. Because posts are independently priced, the player can shop around between posts in the same city. An auto-find-best-price helper scans a set of candidate posts and picks the best buy or sell price automatically.
- Both the player and org AI share the same underlying dispatch mechanism — neither gets a manual "send this specific caravan" action; both only ever steer dispatch indirectly, via supply-policy edits and Buy/Sell actions (player) or trade drive (AI).

**Out of scope (deferred):** market negotiation/haggling, inter-faction trade (arbitrage and Buy/Sell both stay same-faction only), a manual per-caravan route-dispatch action for the player, dynamic trading-post founding cost beyond ordinary org-creation cost.

---

## Shuttle logistics & enterprises

A logistics layer built on top of the org economy, adding two new pooled resources — **components** and **fuel** — joining money/people/food/weapons/materials.

### Production

- **Components** are produced at component factories, in cities and megalopolises. Recipes: 10 components → 1 shuttle; 1 component → 1 weapon (an armory consumes a component per weapon manufactured, alongside its existing steel input).
- **Fuel** is produced at oil depots. **Materials** ("wood") are produced at lumberjack camps — a standalone map enterprise realizing the same forest → materials chain as an embedded lumber mill.
- Every enterprise requires a worker squad to produce — no workers, no output.

Proposed default for all primary producer rates: 1 unit/tick at the base settlement tier, scaling up with settlement tier (see "Enterprise distribution scales with settlement tier" below).

### Map enterprises

Map enterprises (oil depot, lumberjack camp, mine) sit between a camp and a settlement in tier/role — each is an economic org in its own right, not a separately-capturable POI type. They can appear at worldgen as independent businesses, or be built via construction. Defense is a function of hierarchy: a dependent enterprise (with a parent political org) relies on its controller and keeps no garrison of its own; an independent enterprise (no parent) must station its own garrison squad or be captured by anyone bringing force. Capturing an enterprise re-parents its org.

### Worker squads (labor)

A worker is an ordinary squad given a "work" order, not a separate entity type — a pawn's equipment/traits determine whether it can also fight or only harvest. An enterprise can be staffed two ways:

1. **Assign an existing squad** to work there — reversible: the squad is occupied and doesn't fight, but can be recalled, and its people aren't consumed.
2. **Create a new worker squad** at the enterprise, hiring people from the nearest city (proposed default cost: 10 people, mirroring the recruit-squad cost).

An enterprise only produces while staffed — a hard gate, not a partial-output penalty.

### Shuttles: manufacture, fuel, and range

- Shuttle assembly happens only at a megalopolis, consuming 10 components → 1 shuttle.
- Each shuttle has its own fuel tank (proposed/confirmed default: capacity 400 units, roughly a 10 km flight radius). A group of shuttles can optionally link to share/distribute fuel across all of them (future work).
- **Range is a hard block on fuel:** a flight target beyond the shuttle's remaining fuel range simply cannot be ordered — the order is rejected outright, not clamped to the nearest reachable point. To go further, the player places a target within range, then queues an on-foot leg beyond it: the squad flies to the fuel limit, leaves its shuttles there, and continues on foot. Mounted movement is fast; on-foot is normal speed. Fuel drains proportionally to straight-line distance flown (flight is point-to-point, ignoring roads).
- A combat-capable shuttle variant exists, gated behind an organizational upgrade.

**Open question:** shared fuel-group linking across multiple shuttles, and the fly-to-limit-then-continue-on-foot order sequencing, are both designed only at a high level — the detailed sequencing is not yet specified.

---

## Enterprise production & visibility

### Enterprise model

Enterprises are lightweight — seated economic orgs or settlement flags, not separately-capturable entities; they belong to their host settlement and change hands with it. Placement follows one of two patterns: an outside camp-type enterprise (oil depot, lumberjack camp, mine/quarry) sits near but outside the settlement; an inside building-type enterprise (forge, armory, component factory, construction company) sits inside the city and is visible only at close zoom.

### Training school (dojo) — a placement-flexible enterprise

Named and given its own identity rather than staying a passing `fees` example (see "Income sources," above): a dojo is the one enterprise type allowed either placement pattern — it can spawn as an inside-type building (like a forge or armory) or as a standalone outside-type compound near but outside a settlement (like a mine or lumberjack camp). Its effect stays exactly what `fees` already describes: training fees convert straight to money, with no separate effect on any character or pawn. Becoming identified/veteran remains purely a combat-survival mechanic (see "Unit/squad experience and veterancy," above) — visiting a dojo doesn't grant it.

### Bank — a credit enterprise

An inside-type enterprise that extends credit rather than producing a physical good. A bank issues a loan — a principal sum plus an interest rate — to another organization's treasury; the borrower repays principal and interest in installments drawn automatically from its treasury each interval. The bank's own income is the interest collected, using the existing `fees` income source (the same model the dojo uses, above) rather than a new income type. Missing a scheduled repayment costs the borrower relations with the bank; continued default eventually forces the bank to write the loan off as a loss — this is the concrete trigger the "Open question — bankruptcy" (see "Open design questions," below) has been missing, though the general negative-treasury consequence for the borrower itself is still unresolved there. Deposits (an org parking money at a bank to earn interest) are deliberately out of scope for now — a bank only lends, it doesn't yet hold anyone else's funds.

### Worldgen seeds a baseline economy

Every settlement is seeded at world creation with a staffed starting farm, plus a mine if it's near mountainous terrain or a lumber mill if it's near forest — deterministic from the world seed. This is distinct from standalone map-enterprise points of interest, which are unstaffed and scattered separately.

### Enterprise distribution scales with settlement tier

Enterprise count and variety scale up with settlement tier rather than every settlement getting an identical flat baseline. Proposed tiers: town = 1 farm; city = 2 farms + a factory; megalopolis = 3 farms + a factory, forge, and oil depot. Biome bonuses layer on top and are tier-independent: mountainous terrain adds a mine, forest adds a lumber mill, plains adds one bonus farm.

### Multi-step production chains

Seeded enterprises come with the downstream converter needed to consume their output, so raw intermediates (ore, components, steel) don't pile up unbounded with nothing to consume them — a mountain settlement gets the full mine → smelter → weaponsmith chain, a city's factory is paired with a forge that consumes its components. Chains are intentionally balanced roughly 1:1 so a converter is never starved by design.

**Note:** because these chains are self-contained and co-located within a single settlement, intermediate goods tend to be consumed in place rather than exported as surplus, which thins out cross-settlement trade. Heavier goods (vehicles, ammunition — each costing 4-10 components) aren't seeded this way, since a single factory can't support them without starving the simpler chains; they need a multi-factory components surplus first.

**Open question:** whether production chains should eventually be distributed across settlements (raw materials produced in one place, refined in another) to genuinely drive trade, versus the self-sufficient, co-located model above.

**Note:** two chain topologies coexist in this document for turning raw ore into weapons — one goes ore → steel → weapons directly, the other inserts a parts intermediate step (ore → steel → parts → weapons). These haven't been reconciled into a single design; a future pass should decide whether the parts step is kept throughout, or dropped entirely.

### Enterprise rendering

Enterprise map nodes carry a type-prefixed label (e.g. "Oil depot · Corburg") and a distinct icon per kind on a shared marker base (oil depot = barrel, lumber camp = axe, mine = pick, farm = furrows, forge = anvil, armory = crossed blades, factory = gear, dojo = folded belt, bank = coin) rather than a generic, unlabeled glyph. An in-city enterprise is its own clickable building node, visible only at close zoom; an outside enterprise draws as a camp-style marker linked to the road network like any other camp.

### Steel / forge / weapon production chain

The materials-to-weapons chain runs through two enterprises: the **forge** converts ore → steel, then steel → parts; the **armory** converts parts (+ components) → weapons. Parts is a resource distinct from components (which stay reserved for electronics/drones). City-wide flat weapons production, independent of this chain, is kept as an additive and separately tunable source that can be set to zero to force a pure forge/armory chain.

Proposed default rates (all per tick, deliberately flat 1:1 across every step so no converter in the chain is starved by design): ore→steel = 1, steel→parts = 1, parts→weapons = 1, steel and components consumed per weapon = 1 each, materials→ore (mine) = 1, component factory output = 1.

### Inspector visibility

Settlement/enterprise inspectors surface the state of each production step directly: component-factory output and stock (with an idle indicator when unstaffed), mine ore output and stock, and wood-harvest status (including a "no forest nearby" indicator when a settlement has no forest within harvesting range).

---

## Logistics, munitions & sustainability

### Consumables: fuel and ammunition

Single-use consumables are handled by the same logistics system as any other good, not a separate mechanism. Fuel exists both as settlement stock and as a per-vehicle tank; ammunition exists as settlement stock and as per-squad carried ammo, both haulable like any resource. Ammo is produced by a converter chain from steel (ammoworks: steel → ammo, proposed default ratio 1:1) rather than a flat producer, so ammunition genuinely competes with weapons production for the same steel supply — an intended economic tension. A squad's automatic resupply draws fuel and ammo from local stock, bounded by what's actually available — an empty stockpile means a squad can't rearm.

### Delivery mode and route risk

An org's supply policy (what/how much to stock) is executed through a delivery-mode choice and a route-risk system: auto, cart (cheap, exposed ground carrier), or drone (safer, perk-gated, small money cost). A ground carrier within ambush range of a hostile squad has a per-scan chance of being ambushed — destroyed, its cargo lost, its crew killed; drones are largely immune (a small residual risk, not literal invulnerability). Proposed defaults: ambush radius ≈ 150 units (roughly 3.75 km), ambush chance = 5% per scan, drone risk multiplier = 5% of the ground rate.

Couriers/porters are real hired crews (1-2 pawns), hired either directly by an enterprise or onto a political org's staff to run its logistics — they're vulnerable and suffer real casualties on ambush, not an abstract resource count.

### Strike drones (consumable munitions)

A manufactured explosive consumable, distinct from cargo drones: a drone-crew strike consumes one unit of the `drones` good (replacing ammo for that crew type) for an area-damage attack, cheaper than risking the crew in direct fire. Manufacture chain: an explosives plant produces explosives at a flat rate; the armory assembles drones from a two-input recipe (components + explosives). Running low on drones means the crew can't strike and must resupply at a friendly city/armory.

Proposed default rates: explosives plant output = 1/tick; drone assembly = 2 components + 1 explosive per drone; drone stock cap = 5 (small, deliberately limited capacity). Strike damage and radius are combat-balance numbers, outside this document's scope.

### Lone-unit reconnection

A "cut-off" unit — a lone squad with no active player order and no friendly settlement or squad within reconnection range — automatically walks toward the nearest friendly settlement to re-link with the faction's network. A faction with no settlement anywhere is treated as not-cut-off (avoiding meaningless reconnection attempts); a friendless-but-homed squad that can't reach anything is marked stranded and idles rather than wandering. A live player order always overrides an automatic reconnect attempt. A newly recruited unit spawned away from its base physically walks there and garrisons/merges on arrival, rather than teleporting.

### Squad fatigue and sustainability

Squads accumulate fatigue and deplete carried food (rations) over time in the field, recovering by resting at friendly buildings. Rations are the same food resource as everywhere else, located on the squad rather than a separate number. A day is a fixed length of sim-time; fatigue rises and rations deplete while active, and both recover while resting within range of a friendly settlement or camp (better-tier settlements offer fuller rest). Running out of rations accelerates fatigue and, eventually, causes pawn attrition (desertion, not instant death) from starvation. A tired/hungry squad's combat effectiveness and territorial control both suffer, scaled by its fatigue level.

**V1 simplifications:** rest doesn't distinguish faction ownership of the building being rested at, and doesn't draw from a settlement's actual food stock (rations restock "for free" up to a cap) — both are follow-up refinements. Fatigue's full effect on combat damage and squad strength, and starvation actually causing pawn attrition, are also follow-ups to the base rules above.

### Open design questions

Several genuine design gaps remain unresolved anywhere in this material:

- **Bankruptcy / negative-money handling.** Two insolvency mechanics are decided so far: squad-upkeep desertion (gradual pawn loss, reversible by paying again) and bank-loan default (a relations hit, then the bank writes off the loan — see "Bank — a credit enterprise," above). Neither covers the general case: every other money sink — construction payments, recruit cost, founding a construction company or trading post — doesn't state whether an org's treasury can go negative at all outside those two specific paths, and if so, what the consequence is (a distressed-org state, forced asset liquidation, cascading desertion across all of an org's squads, dissolution).
- **Inter-org / cross-faction trade.** Every trade mechanism (auto-logistics, arbitrage, Buy/Sell) is same-faction only; nothing yet sketches what a future cross-faction trade layer would look like — negotiated agreements, an open market at existing prices, embargoes, or whether being at war forecloses it automatically.
- **Taxation mechanics.** A tax income source and a `taxRate` policy field are referenced as existing scaffolding, but nothing specifies who pays tax to whom, on what base, or at what cadence.
- **War's effect on the economy.** Beyond the ambush mechanic above, nothing specifies whether a captured/besieged settlement's stock is seized or destroyed, whether a hostile force can deliberately blockade a supply route without destroying the caravan (area denial vs. probabilistic ambush), or whether territory income responds to contested/blockaded status rather than just held-vs-not-held.

---

### Org-AI enterprise founding (auto-demand growth)
Organizations with AI-driven ambition can automatically found new enterprises to grow their economic footprint: when an org has surplus capital beyond a chain's construction cost plus a safety buffer, and doesn't already have a producing or under-construction enterprise of that type within its settlement's territory, it automatically starts building one. New enterprises spawn unstaffed and are staffed through the normal worker-hiring flow. This is top-down (org-directed) growth only — an individual population member independently founding their own enterprise from scratch is a separate, not-yet-designed mechanic. Each settlement/chain combination has a soft cap on enterprise count so this growth doesn't run unchecked.

### Economy: asymmetric production/consumption ratios
**Open question:** production chains are deliberately balanced so production roughly equals consumption, keeping settlement stockpiles flat over time. Should some chains instead be allowed to drift — e.g. a lumber chain that slowly depletes forest stock, or a food chain that visibly stockpiles in good seasons — so players get a legible sense of an economy under real pressure rather than a static equilibrium? Open sub-questions: which chains (if any) get asymmetric ratios; how much drift per game-year feels meaningful without being destabilizing; and whether drift should vary seasonally rather than stay constant. Not yet decided.

### Economy inspector: gross flow legibility
A perfectly balanced production chain (production equals consumption) would look identical to a dead chain in the economy inspector — both show a net change of +0.0 per step. Rule: display gross production and consumption alongside the net figure (e.g. "+0.0 (2 up / 2 down)"), shown only when either value is nonzero, in both the settlement detail panel and the settlement economy summary. This is a legibility rule only — it doesn't address whether chains should be allowed to drift over time (see the asymmetric-ratio question above).

---

### Worker pool (unaffiliated labor)
Each organization holds one shared pool of idle, unaffiliated workers drawn from its own territory's population — a labor reserve rather than named individuals. A pool worker can be committed to one of three roles: staffing an enterprise as an employee, running goods as a courier for trade, or joining a newly formed squad as a recruit. Committing a worker turns it into a real, visible unit; losing that job (an enterprise closes, a squad is destroyed or disbanded) returns the worker to the idle pool rather than removing them from the game. This gives organizations one legible labor economy instead of separate ad hoc staffing rules for enterprises, trade, and recruitment.

### Road safety and caravan escorts
Each road segment has a safety level that degrades when hostile squads operate nearby and gradually recovers once the area is clear — unsafe roads should be visibly distinguishable on the map (e.g. a red tint). Caravans can be assigned an armed escort: escort strength costs cargo capacity and adds ongoing upkeep, trading carrying capacity for survivability — the player (or the AI managing a caravan) chooses how much escort is worth paying for on a given route. A hostile squad can deliberately blockade a road by camping on it, cutting off any trade route that depends on that segment — this feeds directly into the existing "a cut route can't deliver" trade behavior rather than needing a separate blockade mechanic.

---

## AI & autonomy

### Basic team AI (utility-AI scaffold)
Every team auto-controls its squads by default; a player may optionally flip a team or squad to **manual** control. Decisions use a **utility-AI framework**, not hardcoded if/else logic: each idle auto-controlled squad, on a decision cooldown, scores candidate actions — Capture Settlement / Attack Enemy Squad / Idle — by weighted factors and picks the highest-scoring one. Attacking is vetoed (score ~0) when the squad's own strength is less than the target's — "attack only if not weaker."

**Scoring factors:**

| Factor | Rule |
|---|---|
| Distance | Closer targets score higher, with asymptotic decay as distance grows |
| Target weight | Each candidate settlement or enemy carries a weight (default equal for all) |
| Relative strength (attack only) | Hard veto (score ≈0) when the squad's strength is less than the enemy's — a binary gate, not a smooth penalty |
| Strength metric | (number of living squad members) × a fatigue-scaled condition multiplier — headcount, not raw hit points, so a tired squad reads as weaker without over-weighting a few tanky pawns |
| Idle | A flat floor score, so there's always a valid fallback action |
| Tie-break | A small random factor breaks ties between equally-scored actions |

The AI re-evaluates idle squads on a cooldown (roughly every few seconds of sim time); squads already executing an order are left alone until it completes, and manual squads or squads with a dead leader are skipped. An attack order targets the enemy squad's leader; a capture order that simply moves to and holds the settlement is an acceptable baseline — a settlement leaves the "capturable" set once it changes hands. Ownership for capture purposes is resolved by military-control faction, not by economic/political org ownership: a settlement is capturable if it belongs to a faction hostile to the squad's own faction.

This is the complete scoring model — no terrain, supply, morale, or leader-personality term feeds it. (Leader-trait weighting is a separate mechanism that layers on top of the leadership-type baseline — see "Sides as leaders," above.)

**Open question:** the tie-break random factor isn't specified as deterministic. Since the rest of the simulation is meant to be deterministic under a fixed seed (worldgen, save round-trips), and AI behavior is expected to be repeatable across seeds for testing, the tie-break probably should draw from the same seeded random stream as the rest of the sim rather than an unseeded source — but this hasn't been decided.

### Squad auto/manual toggle
Squads can be individually toggled between AI-controlled ("auto") and player-controlled ("manual"). Issuing a hand order (move/attack) to an auto squad flips it to manual, so the AI won't override the player's order; a hotkey flips a squad back to auto. A per-squad "lock auto" option disables this auto-flip-on-order behavior, for a squad the player wants to stay AI-controlled even while receiving occasional manual nudges.

### Territory scoreboard & domination win
A leaderboard panel ranks sides by controlled territory — the summed zone area of every settlement that side owns (see Territory and settlement ownership, under Territory control, assault & shuttle ops). A domination win triggers when one side is the last one standing, or holds a high enough share of total controlled territory — the winner is announced and the simulation stops. This gives the self-playing simulation a sense of feedback and closure.

**Note:** domination is the only win/loss condition designed so far. Elsewhere, the game is framed as sandbox-style — observe and intervene as your character, with no win condition required. Whether a designed domination win coexists with that sandbox default (e.g., as an optional toggle) hasn't been reconciled.

**Open question:** no economic win (e.g. a wealth/GDP threshold), elimination win (every rival org destroyed or absorbed — distinct from domination, since the org-hierarchy/secession systems can keep a nearly territoryless org alive), or diplomatic win (e.g. a Council-archetype side peacefully unifying rivals via alliance/vassalization) is designed yet. Right now every archetype converges on the same conquest-flavored domination win, even ones that are thematically cooperative rather than conquest-driven.

### AI difficulty & aggression tuning
No player-facing "AI difficulty" concept is designed yet. The designer/debug balance editor (see Tuning tools, under Sides & identity) exposes every individual AI factor weight and curve, but that's a power-tool, not a simple Easy/Normal/Hard choice. Proposal: a single scalar multiplier over aggression-related factors (attack-veto threshold, decision cadence, archetype hostility bias), exposed as a small set of preset bundles (e.g. Relaxed / Standard / Ruthless) a player picks at match setup or in settings — reusing the same preset/save-slot system already used for balance presets. The actual multiplier values, and which factors they touch, still need to be decided.

---

## Sides & identity

### Sides as leaders
Each side is led by a leader — an identity attached to the side, not a map entity. A side's playstyle flavor comes directly from its leading (independent) org's **leadership type** (see "Organizations," above) — monarch defends and taxes steadily, city council grows population, entrepreneur maximizes money and expansion, mercenary attacks and leans on conquest, economic focuses on production, anarchic has no formal leader and drifts. Two sides with different leadership types should visibly play differently under AI control.

This resolves what used to be a separate, parallel four-archetype list (Monarch/City Council/Entrepreneur/Mercenary) layered on top of the org's own leadership type: the two were never actually different things, so a side simply reads its leading org's leadership type directly rather than carrying a second, redundant label. Leadership type sets the baseline utility-AI factor-weight profile; individual leader-trait scoring (Just, Generous, Brave, Patient, Content, Cruel, Greedy, Wrathful, Cunning, Ambitious — see "Leader-trait-driven utility AI," above) layers additively on top of that baseline, the same way it already does everywhere else in the org-leadership model — not a competing system, just the next-finer layer.

**Warlord** is a leadership type earned only through bandit conquest (see "Bandits & outlaw factions," below) — excluded from the normal reform pool, so it only ever appears through conquest.

### Hierarchical gameplay tags
A convention for tagging things with dot-hierarchical string labels (e.g. `Leader.Monarch`, `Behavior.Aggressive`, `Squad.Attacking`), supporting both exact matches and hierarchical prefix matches. Used as a lightweight foundation for archetypes, unit/order states, and weighting AI factors.

### Diplomacy: relations between sides
Relations between sides gate combat and capture: only a side at war with another can attack or capture from it; neutral and allied sides are protected. AI sides also shift their own relations over time, biased by leader archetype — Mercenary drifts toward hostility, City Council toward cooperation.

**Relation states (discrete, not a numeric scale):**

| State | Meaning | Gates |
|---|---|---|
| War | Hostile; the default relation between two newly-created sides | Combat and capture allowed |
| Peace | Non-hostile | Combat and capture blocked |
| Neutral | Non-hostile | Same as peace — no distinct behavior defined yet for neutral vs. peace |

Two sides sharing the same faction are always at peace and skip diplomacy entirely — this covers the player's own side and any AI-controlled side deliberately allied with it from the start.

There is no alliance tier (no shared vision, no joint war, no coalitions) and no vassal relation state. Vassalage is instead modeled as a parent/child organization hierarchy (see the Organizations material) — a structurally separate system from side-to-side diplomacy. Conflict inside that hierarchy (secession, coups, rival claimants) is handled by that system, not by war/peace/neutral.

**Note:** a numeric −100..+100 relation scale with war/neutral/ally thresholds was considered and rejected in favor of the discrete three-state model above.

**Open question:** what distinguishes "neutral" from "peace" in practice — nothing is specified to read them differently.

**AI declares and ends war.** A side's AI can decide to declare war on a peer side (no parent/child relationship — that's handled by the secession system instead) or seek peace with a side it's currently at war with, as part of the same trait-weighted decision-making that governs its other choices (expand, recruit, reform, etc.). A more ambitious leader is more likely to declare war; a more content or passive one is more likely to seek peace, especially once losing (dropping relative power, or under financial pressure).

Declaring or ending a war has no cost or legitimacy gate — it's free in both directions. War simply enables combat and capture between the two sides; there's no deeper layer yet (no casus belli, war exhaustion, formal treaties, war goals, or coalitions — explicitly out of scope for now).

**Note:** no UI is designed yet that lets the player see relation state or manually declare war, seek peace, or propose peace. Given the player can already intervene directly in squad orders and org policy elsewhere, this is a conspicuous gap. A relations panel — listing known peer sides, their current relation, and manual action buttons driving the same logic the AI uses — would close it. Whether a player-initiated action should carry the same "free" rule the AI gets, or be gated differently, is undecided.

### Player entry: implicit play-as-character
Single-player. There's no explicit "simulation mode" vs. "player mode" toggle and no separate controller-assignment UI. Instead, playing as a character implicitly makes you the player of that character's org; otherwise you simply observe the AI-run simulation. This needs the play-as-character entry point to work reliably. (A match-setup screen — picking side count, leader archetype per side, and who controls each side — was considered and rejected in favor of this simpler model.)

### Tuning tools (world / balance / AI editors)
In-app editors let a designer tune parameters live, instead of editing values in code. A central parameter registry holds every tunable constant (key, group, type, range, default, description); an auto-generated UI renders the right control per type — a slider for a scalar value, a draggable-point response curve for factors like distance-vs-score or threat-vs-score, a toggle/enum for flags, plus specialized world-gen and tag controls. Some changes apply live to the running simulation; others apply after the current tick, or only on world regeneration.

Leader archetypes layer a scalar weight multiplier over one shared response curve per factor, rather than each archetype getting its own full custom curve — this keeps presets and save data simple.

**Note:** the proposed AI difficulty presets (Relaxed / Standard / Ruthless, above) would naturally ride this same preset system rather than needing new plumbing.

### Named save/preset slots
One shared slot model covers both full world saves and balance/tuning presets. A default slot auto-saves on change (and on pause) and auto-restores when the app opens, so saving "just works" with zero setup. Optional named slots let a player keep multiple worlds or multiple balance presets side by side, with Save As / Load / file export & import for sharing. Starting a new world always discards the restored default rather than reloading an old one automatically.

A separate, simpler single-slot quick save/load also exists: quick save/load buttons plus keyboard shortcuts, with load disabled until a save exists.

---

## AI framework & org limits

### Modular AI behavior structure
A general-purpose state-based behavior structure sits above the utility-AI scoring model rather than replacing it: the structure decides *when* / *in what state* a unit offers a given set of actions, and utility scoring decides *which* action from that set wins. This lets more complex behavior (e.g. an "Engage" state vs. a "Roam" state, chosen by whether an enemy is nearby) build on top of the same scoring model described under AI & autonomy, without hardcoding transitions. Behaviors are meant to be describable as plain structured data, so they're easy to write and adjust without touching the underlying engine.

Applied to squad AI: an "Engage" state (triggered when an enemy is near) offers Attack Enemy Squad as its option; a "Roam" state offers Capture Settlement / Idle. Units on screen get full-rate AI updates; off-screen units update at a reduced rate to save performance.

### Crew support behavior
A support crew (a small non-combat unit — strike drone, anti-air, cargo, courier) can be given a standing order to attach to a friendly combat squad, set by targeting a friendly squad directly (a manual move order, or re-targeting while attached, detaches it). While attached, the crew is driven entirely by AI rather than manual orders, choosing between: repositioning to stay near its host squad, moving into a type-appropriate support position (e.g. a strike crew moving into weapon range of the host's enemy target; an anti-air crew staying within intercept range of the host versus the nearest air threat), and falling back toward the host when an enemy gets close. This selection reuses the same utility-scoring approach as squad AI — crew type only changes standoff distance and which targets count as assist-worthy, it doesn't add a new decision engine. Actually landing hits stays with the existing automatic weapon systems (a strike crew's drone fire, an anti-air crew's intercept) — the AI here only decides positioning, not damage. If a crew's host squad is destroyed or removed, the crew auto-detaches to a manual hold.

### Org squad cap
An org's total fielded combat/garrison squads is capped by the sum of its **control-slot capacity** (hired) and **subordinate-squad capacity** (its own direct squads) — see "Organization capacity," above — rather than one flat number shared by every org kind: the ceiling now varies naturally by kind and leadership type instead of a universal default. This sits on top of a separate, softer economic limiter. The cap counts only real combat/garrison squads — support crews and visual-only caravans don't count toward it. When an org is at its cap, both automatic squad spawning and manual "recruit new squad" actions are blocked (reinforcing an existing squad is still allowed); the UI should show a disabled "cap reached" state rather than silently doing nothing. The org info panel shows a "squads: used / max" readout.

### Succession crises
Loyalty is bound to the person, not the office. When an org's leader dies or hands over, every subordinate vassal org takes an instantaneous loyalty shock, on top of the normal slow drift loyalty already experiences over time. The shock scales with how illegitimate the new leader's claim is — harsher if a stranger was appointed by the faction with no prior connection, versus a designated heir taking over, which is treated as continuity and carries no penalty.

Each vassal then rolls a rebellion chance based on: how strong that loyalty shock was, the new leader's own ambition (from their trait profile) combined with the org's relative power, and how incompatible the vassal's governing style is with the parent's. The new leader's own traits also set a baseline legitimacy: personalities that read as Just, Generous, Brave, Patient, or Content raise it; Cruel, Greedy, Wrathful, or Cunning lower it.

If the rebellion roll succeeds, the vassal secedes outright — breaks from its parent, keeps its own settlement and garrison, and becomes an independent side — immediately starting at war with its former parent. A portion of the parent's own squads (not counting support crews or bandits) may also defect to the rebel side at that moment, reflecting officers choosing sides. (Squads that don't join a successful rebellion but still desert are intended to eventually become bandits — not yet designed.)

---

## Bandits & outlaw factions

A bandit is designed as an ordinary org/squad actor on a shared bandit faction, not a special-cased raider — there is deliberately no separate "raid" mechanic and no separate "siphon" mechanic; both fall out naturally once a bandit actor is driven by the normal org-AI ambition system:

- Bandits are hostile to every other side by default — no diplomacy setup needed for the bandit faction specifically.
- A bandit org farms money and holds it as its own property, can set up a camp/base that holds goods, and can attack and capture a settlement outright (the settlement re-parents to the bandit org — not a smash-and-grab raid).
- "Raiding" is simply an ambition-driven attack that ends in capture; "siphoning" is simply the bandit accumulating money as property. Neither needs its own system.

Bandit bases spawn in poor or weakly-controlled regions — banditry emerging from want rather than at random. (The spawn signal is a settlement's liquid money reserves; a later pass may also factor in low org loyalty/control.) There's a global cap on how many bandit squads can exist at once (default 5 — deliberately small; tune via playtesting).

**Bandits never hold territory as bandits.** The moment a bandit faction captures a settlement, it stops being "bandits" — it converts into a legitimate, independent **Warlord**-led political org that holds territory, earns income, and can be diplomatically or militarily engaged like any other side. A fresh, landless bandit pool spawns afterward, so the poverty → bandits → conquest → new regime loop can repeat. Warlord is a leadership type earned only this way — it's excluded from the normal reform pool and from AI self-reform, so it only ever appears through conquest.

Bandit squads can also blockade roads: a bandit squad camped on a road cuts that route, starving trade that depended on it (this plugs into the existing trade-routing system rather than adding a parallel one). The AI weighs blockading as one of a bandit squad's available actions. (The broader caravan-escort and road-safety-decay mechanics this interacts with are covered under "Road safety and caravan escorts," in the Economy & Trade material.)

**Open question:** bandit spawning and ongoing bandit behavior should ultimately run through the same org-AI ambition system used elsewhere (rather than a bespoke spawn script) — the pieces above (shared faction, spawn-trigger logic, squad cap) are designed with that intent, but the full wiring isn't specified yet.

---

## Robotic threat faction

A second hostile faction, flavored as machines rather than bandits, mechanically parallel to bandits but able to hold cities outright from the start (unlike bandits, which must convert via conquest). Robots are hostile to every other faction, including bandits.

World generation places a set number of robot-held cities at deterministic, sparsely-populated points, each defended by one notably tougher boss squad. Robot cities periodically spawn ordinary robot squads, up to a local cap per city. Robot squads and bosses otherwise reuse the normal squad/combat/AI systems wholesale — a boss is a strength multiplier and a name, not a new unit type.

**Note:** there's deliberately only one robot unit archetype (the reused generic squad, re-skinned) plus one boss variant — no robot-specific unit variety yet. Scope discipline: ship the faction skeleton first; unit variety can come later.

### Boss fight
The strongest robot city's boss can be promoted into a full boss encounter. Design intent: the boss should not be soloable, achieved *emergently* rather than through a hard mechanical gate — very high HP plus continuous reinforcement, not an artificial "need N squads" check. A ring of drone launchers spawns around the boss at fight start; each periodically emits a reinforcement drone, and destroying launchers is the intended way to throttle reinforcement and make the fight manageable. The boss itself has a long-range area attack that intensifies across two HP-threshold phases (roughly 60% and 30% HP) — shorter interval, larger radius, more damage as it gets low. The boss is otherwise a normal AI-driven unit using the standard decision system.

**Open question:** is the boss fight one-time-per-world, or can a new boss (re-)emerge later — e.g. by re-promoting the next-strongest robot city once robot spawning has replenished it? And should the boss's strength scale to the player's current power/army size for difficulty consistency across different play lengths, or stay a fixed absolute encounter regardless of when the player takes it on? Neither is decided.

---

## UI, input & camera

**Note:** the abilities registry (below) is the source of truth for input-model semantics — what each command does, how targeting and cancel work, and which hotkey or mouse button triggers it. The rest of this section is the camera/UI-shell layer built on top of that: camera behavior (pan/zoom/focus), panel/HUD layout, and UI features that aren't a specific ability (search, tooltips, teleport-to-name). The abilities registry remains the only place hotkeys and activation are enumerated; the rest of this section doesn't duplicate that table.

### Abilities registry

The player's vocabulary for commanding the world, and what a squad can actually do once commanded.

**Ability** = a player command, defined by:
- **modes**: Quick and/or Confirmation. Some abilities support both (Move, Attack).
- **activation**: mouse button, hotkey, UI button, or an inspector action list.
- **cancellable**: yes for Confirmation-mode abilities.
- **cursor**: an arrow while idle or during Quick activation; a crosshair while targeting during Confirmation mode.

**Quick mode** — executes immediately on activation, no targeting phase, arrow cursor.

**Confirmation mode** — activation enters a targeting state: the cursor becomes a crosshair, an on-screen prompt shows what's about to happen (e.g. "Attack — left-click a target, right-click to cancel"), the player designates a target or point with the left mouse button, then it executes. Right-click cancels.

**Quick Context Action (QCA)** — when no confirmation-mode ability is currently armed, right-click performs whatever action makes sense for what's under the cursor:
- over an enemy unit → **Attack** (pursue and engage)
- over your own settlement, with your own squad selected → **Garrison**
- over open ground, or anything else → **Move**
- extensible to further target types as they're added

**Right-click is fully defined by state, never overloaded:** if a confirmation-mode ability is armed, right-click cancels it. If nothing is armed, right-click performs the Quick Context Action. The on-screen prompt always states which of the two it will do.

**Inspector action list** — selecting an organization, property, or squad shows its full list of available actions in the inspector panel, as an alternate way to reach any ability besides clicking in the world or using a hotkey.

**Move and Attack are the model dual-mode abilities.** Both support Quick and Confirmation, both target with a left-click, both cancel with a right-click, both show a crosshair while targeting. A single shared "go to a point" engine underlies Quick-Move, Confirmation-Move, attack-move (go to a point, engaging any enemies encountered along the way, then continuing), and Attack (pursuing a specific unit is just "go to that unit's point" plus engaging on arrival). An "attacking" stance makes a plain Quick-Move behave as an attack-move automatically.

**Player abilities**

| Ability | Modes | Activation | Confirm | Cancel | Cursor | What it commands |
|---|---|---|---|---|---|---|
| Select / drag unit | Quick | left-click | — | — | arrow | — |
| Marquee-select | Quick | left-click-drag on empty ground | — | — | arrow | — |
| Pan camera | Quick | middle-click, or left-click-drag on empty ground | — | — | arrow | — |
| **Move** | Quick + Confirmation | right-click (QCA on ground), or a hotkey / UI / options menu | left-click a point | right-click | arrow / crosshair | Move |
| **Attack** | Quick + Confirmation | right-click (QCA on an enemy), or a hotkey / inspector / options menu | left-click an enemy or point | right-click | arrow / crosshair | Attack / attack-move |
| **Garrison** | Quick (QCA) | right-click on your own settlement, or options menu / inspector | — | right-click, if armed | arrow | Garrison |
| **Options window** | Confirmation | hold right-click on a target, or the inspector action list | left-click to pick | right-click | arrow / crosshair | (dispatches to whichever ability is picked) |
| Patrol (route) | Confirmation | hotkey → place points → confirm | left-click points | right-click | crosshair | Patrol |
| Set Camp | Confirmation | options menu / hotkey → click ground | left-click a point | right-click | crosshair | Camp |
| Board / Leave / Return to transport | Quick | hotkeys | — | — | arrow | Board / Dismount |
| Toggle Caravan | Quick | hotkey | — | — | arrow | Caravan |
| Split / merge crew | Quick | hotkey | — | — | arrow | Split / Merge |
| Attack / Hold stance | Quick | inspector toggle | — | — | arrow | (sets the attacking flag) |
| Un-hold | Quick | hotkey | — | — | arrow | — |
| Ruler (measuring tool) | Quick (tool) | hotkey | left-click ends it | right-click | crosshair | — |
| Delete unit | Quick | hotkey | — | — | arrow | — (world-editing use) |
| Queue modifier | modifier | held while right-clicking | — | — | — | (appends to the order queue instead of replacing it) |

**Squad capabilities** — what a squad can actually do, whether the order comes from the player or from its own AI.

| Capability | What it does | Driven by |
|---|---|---|
| Move | go to a point, using the shared go-to-point engine | player or AI |
| Attack / attack-move | pursue a unit, or move to a point while engaging anything encountered along the way | player or AI |
| Patrol | loop a route | player or AI |
| Hold / Stop | stand still | player or systems |
| Garrison | defend a settlement from inside it — divides incoming damage, cheaper upkeep than standing in the open | player |
| Camp | build or occupy a camp at a point | player |
| Capture | flip a settlement's ownership on arrival, when set to an attacking stance | player or AI |
| Caravan | autonomously hop along roads trading | AI, once toggled on by the player |
| Work | occupy an enterprise to staff it | player or AI |
| Board / Dismount | enter or exit a vehicle or transport | player |
| Split / Merge | divide one squad into two, or combine two into one | player |
| Wander | aimless idle drift | AI only — no player-issuable equivalent |
| Reconnect | rejoin its parent organization's forces after being cut off | AI only — no player-issuable equivalent |

**A player ability is not the same thing as a squad capability.** An ability is the act of commanding — the click, the hotkey, the targeting phase. A capability is what the squad actually does once commanded. Wander and Reconnect are capabilities with no corresponding player ability (they only ever happen under AI control); Select, Pan, and the Options window are abilities with no corresponding squad capability (they're pure interface, not something a squad "does").

### Click a name to teleport the camera
Clicking an entity name anywhere in the UI pans the camera to it and selects it, with a short (~300ms) animated pan. The current zoom level is preserved — it's only clamped to a readable minimum if the camera is zoomed very far out. Applies to enterprises, points of interest, and settlements directly; a character resolves through their org's seat. A character that can't be resolved to a location isn't clickable. Any manual pan or zoom cancels an in-progress teleport. Hover cue is a pointer cursor with a dotted underline.

### Pinnable, nested tooltips
Hovering an entity link (settlement, org, or character) anywhere in the UI shows a tooltip anchored near the cursor; it follows the pointer and disappears on mouse-out unless pinned. Middle-click pins a tooltip — it stops following the cursor and gains a close control. A pinned tooltip's body can itself contain links; clicking one opens a nested tooltip anchored off the parent's edge, and any tooltip in the chain can be pinned independently, stacking to unbounded depth. Clicking outside the entire stack dismisses it, pinned tooltips included. Tooltips clamp to the screen edge so they never overflow the viewport. This is an additive layer — it doesn't replace the click-to-open inspector panels for the same objects.

**Open question:** this system is hover-triggered and pinned by middle-click, both mouse-only interactions with no touchscreen equivalent (no hover state, no middle button). See "Touch equivalent for hover-triggered tooltips" under Mobile web support, below.

### Search box for tuning params
A text search over the tuning panel filters rows to those whose label or parameter key matches the query (case-insensitive), composing as an AND with the existing tag-filter chips. Groups that end up empty are hidden. The query persists across panel rebuilds.

### Camera controls (pan, zoom, rotation)
The world is a sphere (see "World shape," under Worldgen, above), not a flat plane. Pan: dragging orbits the camera around the sphere's surface (middle-mouse-button drag, or left-mouse-button drag on empty space) rather than sliding across a flat plane. Zoom: mouse wheel; the resulting camera distance from the surface drives the level-of-detail tier (see Glossary: tier) and is what the metric-ruler overlay reads and displays. On touch, a second finger switches single-finger panning into two-finger pinch-zoom-and-pan.

**Rotation, resolved.** Free camera rotation around the planet is part of the design — this replaces the earlier "no rotation" placeholder and closes what used to be an open question here. Rotation applies at the world/strategic tiers, orbiting the sphere; the building-interior sub-LOD (see "Enter buildings," above) keeps its own fixed top-down/orthographic camera once you're inside a specific building, since the procedurally generated room layout and the metric-ruler's scale-audit panel both depend on a stable, non-rotating view at that one sub-tier.

### HUD layout and panel placement
Inspector panels dock as a fixed group in the top-right of the screen. No overall HUD region map is defined yet — where a time-control/pause bar, resource ticker, notification tray, or minimap would live is unspecified, and no minimap exists in the design.

**Open question:** is the absence of a minimap deliberate? Zone-based world generation and a "Sides & identity" strategic layer are exactly the kind of systems that usually want one. Needs a design session to lay out HUD regions (top bar, side panels, bottom bar if any), decide whether a minimap/strategic overview is in scope, and decide how the notification tray and settings menu (both below) dock alongside the inspector stack.

### Notification and alert system
Nothing in the design yet tells the player about game events that happen off-screen or between clicks — a settlement captured, a squad destroyed, an org going bankrupt, supply running out (see Glossary: upkeep, supply). Given the org-centric, LOD-tiered model, where many things can happen far from the current camera focus, this is close to load-bearing rather than a nice-to-have.

**Open question:** toast vs. persistent event log vs. both; per-category opt-out; whether an alert can double as a teleport-to-source link using the existing camera-teleport behavior above.

### Settings and options menu
No settings/options menu is designed yet — there's no documented surface for audio, graphics/quality, language/localization, keybind rebinding, or an entry point to save/load.

**Open question:** scope a minimal first version (at minimum: audio, save/load, keybinds if rebinding ships, quit-to-menu) and decide where it docks in the layout.

---

## Tooling, telemetry & generation

### World generation pipeline
World generation runs as a point-based procedural pipeline: point sets with attributes flow through samplers, filters, transforms, and spawners. Points of interest are placed on top of this pipeline as declarative rules — for example, an oil depot can spawn anywhere, while a lumberjack camp spawns near forest. This pairs with the world-generation seed and parameters.

### Metric ruler overlay
A toggleable overlay (hotkey M, off by default) lets the player measure the world and check it against the game's scale convention (1 unit ≈ 25 m):
- **Metric grid:** full-screen gridlines labeled in metres/kilometres, with spacing that adapts to zoom so the real-world span of the screen is always readable.
- **Measure tool:** click-drag between two points for a live distance readout in metres/kilometres.
- **Scale-audit panel:** reports rendered sizes converted to metres against the expected convention — pawn diameter (see "Pawn rendering: a body sphere plus two floating hand spheres, at real-world scale," under LOD tiers, above), a building footprint, inter-building gap, and screen width — flagging anything that disagrees with the convention.

This is a player-facing tool as well as a design one: the abilities registry lists Ruler as a Quick action bound to the same hotkey, with click-to-place targeting and a cancel action.

---

## Mobile web support

The game is playable in a mobile browser, installable to the home screen, alongside desktop play.

V1 scope:
1. **Touch-to-pointer / pinch-zoom:** a second touch switches single-finger drag-pan into two-finger pinch-zoom-and-pan around the midpoint, alongside the existing mouse/wheel controls.
2. Touch gestures control the game view directly instead of triggering the browser's native scroll/zoom.
3. **Touch equivalent for the one hotkey-only action** (squad re-auto-control): a roughly 500ms long-press on the game view with a squad selected re-autos it, mirroring the existing hold-to-open order-menu timing.

Deferred:
4. **Full touch-target sizing pass** — beyond the order-menu row height (touch-friendly from the start), inspector panel tables/buttons and tooltip pin controls are sized for a mouse pointer and need a dedicated sizing audit.
5. **Home-screen install support** — treated as optional.

Quick-save/quick-load keyboard shortcuts are power-user shortcuts, not gameplay-blocking, and are deferred along with the rest.

### Touch equivalent for hover-triggered tooltips (open question)
Neither the mobile-input work above, nor the tooltip system itself, nor the term-tooltip convention (below) defines a touch equivalent for hover-to-show / mouse-out-to-hide / middle-click-to-pin — all three assume a mouse. On a touch device there's no hover state and no middle button, so without a defined touch interaction the entire tooltip layer (both entity tooltips and term tooltips) would be unreachable.

**Open question:** pick a touch interaction. Candidates: tap-to-pin (replacing hover+middle-click with a single tap), or long-press-to-pin with a short tap passing through to the underlying element.

---

## Inspector — object types & fields (living reference)

What you can click and what each inspector panel shows. One entry per selectable object type. Every instance link named inside a panel follows the clickable-instance convention (see UI conventions, below) — it's clickable and jumps to that object's own inspector.

| Object | How to select | Panel / view type | Fields shown |
|---|---|---|---|
| **Settlement** | click a settlement marker | Settlement detail view | name, property type (camp/village/city/megalopolis), owner org (clickable, + its parent org clickable, or "independent"/"unowned"), territory area, money income (base + territory bonus breakdown), active resources with net production/step, enterprise count (running vs idle split), clickable list of owned enterprises |
| **Enterprise** | click an outside-type enterprise marker (farm, mine, lumberjack camp, oil depot, or a dojo placed outside), or its entry in a settlement's enterprise list (inside-type: forge, armory, factory, component factory, construction company, bank, or a dojo placed inside) | Enterprise detail view | type-prefixed label (e.g. "Oil depot · Corburg"), kind, owner org (clickable), host settlement (clickable), staffed/idle status, output rate, current stock |
| **Squad** | click a squad marker | Squad detail view | id, faction, strength, control mode (auto/manual toggle), lock-auto toggle, order status (has order / idle), garrison target (if garrisoning), mounted vehicle if any (clickable), owning org (clickable "Belongs to: X" / "Independent") |
| **Vehicle** | click a parked vehicle marker, or the mounted-vehicle link in a Squad panel | Vehicle detail view | type (car / bike / van / shuttle / ground robot (НРК) / IFV (БМП) / combat shuttle / heavy autonomous ground vehicle), seat capacity + family (air/ground), owner org (clickable), mounted squad if any (clickable), or "Parked" if unmounted |
| **Caravan** | click an in-transit caravan (small moving dot) | Caravan detail view | route (from → to settlement names), transport mode (porter/ugv/drone), cargo phase (hauling N of resource / empty heading to pickup), owning org (clickable / "unowned") |
| **Organization** | click an org name anywhere (name in a panel, or the standalone Orgs list) | Org node view | name (drill-in link), leader name (+ heir picker if player-controlled), member count, ambition, tax rate (editable if player-controlled), leadership type + kind (editable if player-controlled, `kind` now includes `network` — see Agent networks), owned property (clickable settlement links), controlled slots (occupant + salary, editable if player-controlled), agent edges for a `network`-kind org (host org + available actions, editable if player-controlled), supply policy (per owned settlement, editable if player-controlled), income sources (editable if player-controlled), labor pool (player-controlled only), subordinate orgs (recursive subtree), ancestor breadcrumb upward to root |
| **Character** | click a character name (leader/heir/member link) | Character detail view | name, age/age-bucket, traits, the four character skills (see Character skills), residence settlement, primary org membership (clickable), secondary network membership if recruited as an agent (clickable, see Agent networks), org led (if a leader, clickable) + CK-style title, heir (if any, clickable), post held in any organization (if any, clickable — see Organizational posts) |
| **My Character** (avatar) | persistent panel while playing as a character | Character detail view + org forest | same as Character, plus the avatar's own org tree context |
| **Squad loadout** | opens alongside a selected squad, side by side with the squad detail panel (see the layout rule below) | Squad loadout view | per-pawn seat role, mounted vehicle (if any), remote-operator link (cycle-role click target) |
| **Building interior** | select a building at close-zoom/street tier | Interior panel | building label, room layout (procedurally generated, fixture preview), building stock |
| **Term (glossary)** | hover a mechanics term in any panel or tooltip (mouse-only — see the touch tooltip open question under Mobile web support) | Term tooltip | CK-style nested definition, sourced from the Glossary below, may drill into further terms/instances |


**Layout rule:** the squad and loadout panels open together and lay out side by side, via a shared layout container rather than two independently-positioned fixed elements — they must never render stacked on top of one another.

---

## UI conventions

Several standing conventions govern how instances and terms are presented in the UI. New UI work should follow all of them by default.

### Clickable inspectable instances
Whenever a concrete instance of an object that has an inspector view — organization, settlement, squad, character, enterprise, caravan, etc. — is named in any inspector panel or tooltip, it must be a clickable link that selects and jumps to it. A plain-text instance name is a bug, not an acceptable default. This convention covers, at minimum: the settlement's owner org and that org's parent, the management-slot occupant org, the supply-policy settlement name, and the character's heir.

**Rule (ancestor breadcrumb):** the org panel shows a focused org's subordinate orgs (recursively) and must also show a breadcrumb of its ancestors — otherwise a player who jumps to a subordinate org can't see who owns it without separately reopening the full org list and scanning it. The breadcrumb row sits above the focused org, walking from the root to the focused org, each ancestor a clickable link (most-distant ancestor first); no breadcrumb if the focused org has no parent.

### Org panel: read-only for non-controlled orgs
Every edit control in the org inspector — leadership type, kind, heir, tax rate, income/supply policy — gates behind one shared player-controlled check; letting the player edit a random NPC org would read as inconsistent and confusing rather than a clear "who owns what" overview. A non-controlled org renders name, leader, members, ambition, kind, and leadership type as plain text, plus read-only owned-property and slot lists — no editable controls at all. The labor-pool readout is labeled ("labor pool N/M") and shown only on the editable (player-controlled) row.

**Deliberately deferred:** a separate, dedicated read-only overview panel/tab listing all world orgs — uniform read-only gating addresses the same need with a smaller surface; revisit if still wanted. Child-org tree collapse/expand is also deferred.

### Term tooltips
Whenever a game term or mechanic that's explained elsewhere is mentioned in the UI, it's wrapped in a term tooltip. Term tooltips are nested and pinnable, CK3-style, the same as the instance tooltips above — you can dive from one term into another to go deeper into the mechanics. Term tooltips reuse the same pinnable/nested tooltip system as instance tooltips. The Glossary (below) is the single source of truth for term definitions — it's written once and reflected automatically wherever a term is mentioned in the UI.

Initial term set: entrenchment, supply, upkeep, garrison, tier, org, side, LOD. The squad's garrison line and the org's supply-policy label are wrapped as term links from the start; any new term-bearing UI copy should be too, so the term layer grows with the UI rather than needing a separate pass.

**Note:** because the Glossary is shown verbatim in player-facing tooltips, it must only ever contain player-facing game-mechanic terms — never process or documentation jargon.

### Single active inspector panel
Only one inspector popup (economy/orgs/detail/squad+loadout/character/my-character/caravan) is visible at a time, governed by a single piece of "which panel is active" state. Every way of opening or closing a panel — selecting something on the map, clicking a cross-link, clicking a toggle button — sets this state, and every panel's visibility is derived from it in one place. Panel *content* refreshes independently of open/closed state: refreshing a panel's contents must never force it open or closed, since a background data refresh forcing a panel open would otherwise fight with the player's own navigation (e.g. jumping from a settlement to its owner org would flicker back to the settlement panel). Deselecting an object only closes its panel if that panel was the active one, so it can't yank away a panel the player has since navigated elsewhere from.

### Context-sensitive option menu — one mechanism for every controllable actor

Whichever controllable actor is currently selected — a **character**, an **organization**, or a **squad** — dictates what the hold-right-click Options window (see "Squad context menu and order options," under Transport, squads & command, above) offers when the player holds right-click on a target. The menu's contents are a pure function of *(selected actor, target under cursor)*: it lists whichever of that actor's already-existing actions has a natural target and applies to what's currently under the cursor, gated by the same kind of centrally-defined enable/disable logic the squad menu already uses (Attack requires a hostile target, Garrison requires a friendly settlement, and so on) — a generic rule, not something specific to squads.

This deliberately introduces no new actions — it's a second way to reach actions this document already defines elsewhere (the org inspector's Decisions tab, the squad order menu, character actions), for whichever of them naturally targets something:

- **Squad** (target-driven): Attack, Garrison, Split/Release, Board/Dismount — already specified in full under "Squad context menu and order options."
- **Organization** (target-driven): create/break a control or influence slot (target: another organization), propose/break an alliance (target: another independent organization), assign or remove a post (target: a character among the org's own members), trigger an intel report or paid sabotage through an existing agent edge (target: the edge's host organization), reassign a controlled organization's leader or posts (target: that controlled organization — see "Who can reassign a controlled org's leader or posts," under Organizations).
- **Character** (target-driven): none yet. A character's one dedicated action — dissolving back into a settlement's latent pool (see "Settlement population: demographic pool and character generation") — has no target of its own. Playing as a character in Player Mode reaches an organization's target-driven actions transitively, through whichever org that character leads (Player Mode: "an org is reached transitively through the character's leadership") — the menu shown in that case is the led organization's, not a separate character-specific list.

**Self-directed decisions have no natural target and stay off this menu.** `BecomePolitical`, `ChangeLeadershipType`, `Expand`, `TakePerk`, and founding a subordinate organization don't point at anything under the cursor — they apply to the selected actor itself, so they remain reachable only through the inspector's own Decisions/Perks tabs, exactly as already specified elsewhere. This isn't an oversight: forcing a target onto a self-directed decision would invent a targeting rule this document doesn't otherwise describe.

### Accessibility and input rebinding (open question)
No section of this document or the abilities registry mentions accessibility. Every hotkey (move, attack, patrol, toggle caravan, crew split/merge, un-hold, ruler, board/leave/return, delete, squad re-auto-control, queue-order modifier) is hardcoded in v1, with no rebinding UI anywhere. Also missing: colorblind-safe palettes/iconography (relevant given side/faction color-coding), scalable UI text, and screen-reader/keyboard-only navigation for panel content.

**Open question:** scope a first version — candidates are rebindable keybinds via the settings menu, a colorblind-safe palette mode, and minimum contrast/text-scale settings — and decide whether touch parity (above) and accessibility should be planned together, since both touch the same input and rendering surfaces.

### Open question: save/load consistency
Elsewhere, this document describes both quick save/load hotkeys and a separate, unified named-slot save system. It isn't yet decided whether these share one underlying save format/slot or are two persistence mechanisms that could drift apart, or whether either has a settings-menu or in-game entry point beyond the keyboard shortcut. Needs a ruling.

---

## Glossary

Each entry below is a term that appears as an in-game tooltip wherever the term is mentioned in the UI (see Term tooltips, above). Keep entries short (1-3 sentences); related terms/mechanics referenced by name become links for the nested dive.

**Note:** every entry below is shown verbatim in-game. Only add player-facing game-mechanic terms here — never process or documentation jargon.

### entrenchment
A squad that stays stationary and undisturbed accumulates entrenchment over time, boosting its defense. Lost immediately on taking damage or moving.

### supply
A squad's ability to sustain combat effectiveness over distance/time from its owning org's territory. Low supply degrades combat performance; see upkeep.

### upkeep
The ongoing money/resource cost an org pays per tick to maintain its squads and enterprises. Pause freezes upkeep drain.

### garrison
A squad stationed inside a settlement rather than in the field — defends the settlement, doesn't fight in the open field.

### tier
The level-of-detail (LOD) a squad or entity renders/simulates at, driven by camera zoom — collapses simulation and rendering cost at low tiers (aggregate) vs high tiers (per-pawn detail).

### org
Short for **organization** — New Lords' core actor: a persistent entity (company, army, family, state, etc.) that owns property, employs characters, fields squads, and issues commands. Orgs nest into parent/subordinate hierarchies and are the backbone of sides, settlement ownership, and enterprises.

### side
A political/military allegiance that characters, orgs, and squads belong to, determining who can attack or ally with whom. Distinct from an org's ownership hierarchy: a side is allegiance, an org is the actor that holds property and commands squads.

### LOD
**Level of detail** — shorthand for the fidelity tier (see tier) an entity is simulated and rendered at; coarser/aggregate when zoomed out, finer/per-pawn when zoomed in.

---

## Sim loop & pause

### Freeze units while paused / pre-start
Ordering a squad while the game is paused (or before play has started) should never cause it to move — the order should sit queued until play resumes, then execute normally. Mechanically, pause is a single global gate: while paused, no position/movement integration happens for any mover, but the underlying order (destination, attack target, patrol route) persists untouched and resumes the instant pause is lifted. Formation micro-positioning and garrison/camp settling keep running while paused, since they're purely cosmetic sub-pawn adjustments and don't affect gameplay state.

Pause also freezes the economy: farm/enterprise production, upkeep drain, and new caravan/trade dispatch do not advance while paused — economy and trade respect the pause state the same way movement and combat do. (This is an easy subsystem to forget when adding economy systems; see the design principle below.)

**Design principle:** any new per-tick system should make an explicit choice about whether it freezes on pause. As a rule of thumb — anything that changes persistent game state (movement, combat resolution, production, trade) should freeze; purely cosmetic/visual settling (formation micro-positioning, garrison idle animation) does not need to.

### Pause behavior matrix
Pause behavior by subsystem:

| Subsystem | Frozen while paused? |
|---|---|
| Movement | Yes |
| Combat resolution / damage application | Yes |
| Economy step (production, upkeep drain) | Yes |
| Trade dispatch (new caravan planning) | Yes |
| AI decision ticks (utility scoring, goal/target selection) | No — runs at normal rate; "thinking" isn't treated as a mover, though any resulting movement/order intent then sits inert since movement itself is frozen |
| Wander / leash / formation micro-positioning | No (deliberate — cosmetic sub-pawn settling only) |
| Garrison / camp idle ticks | No (deliberate — cosmetic only) |

**Open question:** whether the aim-before-fire countdown (see the combat design notes below) should freeze under pause — arguably yes, since it's a combat-resolution countdown rather than "thinking" — is not yet resolved.

This table isn't guaranteed exhaustive; it should be revisited whenever a new per-tick system is added, to confirm it was given an explicit pause decision rather than defaulting silently.

### Time control (speed multiplier)
Strategy-game-style speed controls sit next to the pause toggle: x1 / x2 / x3 / x5 / x10, with x1 as the default. The current speed is shown as text next to the game clock. Speed does not persist between sessions — it resets to x1 on reload or on starting a new game, since it's treated as a per-session play preference rather than a saved setting. Pause always fully freezes the simulation regardless of the current speed multiplier.

**Speed and pause hotkeys.** Both pause and the speed tiers should be reachable from the keyboard, not just the mouse, matching standard genre expectations. Proposed bindings: `Space` toggles pause; `1`–`5` select the five speed tiers directly. No new acceleration curve or ramping between tiers — the keys just trigger the same behavior as their equivalent buttons. **Open question:** these bindings need to be checked against the camera-pan/zoom and selection-group hotkeys owned by the UI/input design — flagged for that cluster's sign-off rather than decided here.

**Calendar.** A Dwarf-Fortress-style calendar sits alongside the existing clock display, purely as a display extension with no gameplay effect in the current version: 4 seasons × 30 days per season = 120 days per year, displayed as e.g. "Spring, Day 4, Year 1." The calendar updates live and freezes with pause, same as the clock. A scrubbable timeline and a "fast-forward to next event" feature are explicitly out of scope for now. Seasonal gameplay modifiers (e.g. production or caravan speed varying by season) are a natural future extension once the calendar itself is in place.

---

## How this doc is maintained

This document is organized by game system (Organizations, Squads & Combat, Worldgen, Economy, AI & Sides, UI, and so on). It's kept in sync by hand during design sessions — when a decision is made, the relevant section is updated directly rather than tracked elsewhere.

---
