---
name: sync-design
description: Use when the user casually describes a new New Lords game mechanic, entity, organization kind, enterprise, or rule in conversation (capture it into docs/DESIGN.md), or when touching the prototype's own spec/plan/code under docs/superpowers/specs (reconcile it against the current docs/DESIGN.md). Keeps DESIGN.md as the single source of truth and the prototype as a thin, honest reflection of it.
---

# Sync Design

New Lords keeps exactly one source of truth for game mechanics: `docs/DESIGN.md`. This skill has two triggers — capturing new ideas into it, and keeping prototype work honest against it.

## Trigger 1 — Capture a new design idea

Fires whenever the user, in conversation, describes a new game mechanic, entity, organization kind, enterprise type, or rule, or resolves an open question — not when they're only asking about existing content.

1. Read the relevant section(s) of `docs/DESIGN.md` first — find where this idea actually belongs (an existing section it extends, or a new subsection near its closest relative). Don't append to the bottom of the file by default.
2. Check for consistency with adjacent rules before writing — kind enums, capacity tables, leader-count overrides, income-source lists, glossary terms, the inspector reference table, open-questions sections. A new idea often needs a one-line touch in 2-3 places, not just its own paragraph (the `network` kind's edits to the leader-count override and the `kind` enum are the reference example for this).
3. Write it in the doc's existing voice: a resolved rule stated as fact, with a **Why** only when the reason is non-obvious; no "TODO", no implementation traces ("currently", "already built", "as tested", "playtesting found"), no reference to this conversation or session. Genuine open design questions stay framed as "Open question," never silently resolved just to remove the label.
4. Self-review the diff before committing: placeholder scan, internal consistency (do the numbers/enums you touched still agree everywhere else they're mentioned?), scope (did this drag in something that needs its own separate discussion first, rather than a quick addition?).
5. Stage and commit just the design-doc change with a short, factual commit message — don't bundle it with unrelated file changes.

If the idea is big enough to need real back-and-forth (a new subsystem, a mechanic with several plausible shapes), don't silently guess — ask 1-3 targeted questions with a recommendation each, the way any brainstorming interview would, before writing.

## Trigger 2 — Reconcile prototype work against the design

Fires whenever you're touching the prototype's own spec (`docs/superpowers/specs/*.md`), an implementation plan for it, or its code — before finalizing a change there.

1. Diff what the prototype assumes against the *current* `docs/DESIGN.md` — not what DESIGN.md said when the prototype spec was last written. DESIGN.md changes independently (Trigger 1, above), so the prototype spec can go stale silently between sessions.
2. If DESIGN.md has since added or changed something the prototype's entity/inspector/graph model should reflect (a new org kind, a new inspector field, a new edge kind) — update the prototype spec to match, or explicitly note in the spec why it's deliberately deferred (out of scope for this iteration, not an oversight).
3. If the prototype invents something that reads like a real game mechanic rather than a prototype-only affordance — stop and route it through Trigger 1 first, so DESIGN.md stays the one source of truth and the prototype spec stays a thin reflection of it, not a second place where rules get decided.

## What never goes in DESIGN.md

Prototype-only scaffolding — debug panels, drag-to-reposition, disabled-with-tooltip placeholders for unsimulated actions, tech-stack choices, world-scale numbers (settlement counts, etc.) — belongs only in the prototype spec, never in DESIGN.md. DESIGN.md describes the full game; the prototype is one deliberately limited, current slice of it.
