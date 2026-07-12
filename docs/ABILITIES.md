# New Lords — Abilities & Capabilities Reference

The player's vocabulary for commanding the world, and what a squad can actually do once commanded. Kept in sync with the design document — when a mechanic here changes, this file changes with it.

## Concepts

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

## Player abilities

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

## Squad capabilities

What a squad can actually do, whether the order comes from the player or from its own AI.

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
