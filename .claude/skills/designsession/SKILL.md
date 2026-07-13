---
name: designsession
description: Use when the user runs /designsession — enter an explicit New Lords design session. Pull the GitHub Issues currently labeled status:to-design, work through their open design questions with the user (brainstorm / interview with recommendations), record each resolution into docs/DESIGN.md, then hand the issue to the worker as status:to-do (or split off new issues). The queue-driven counterpart to sync-design's conversational capture; see PIPELINE.md.
---

# Design Session

Explicit, queue-driven design work for New Lords, triggered by `/designsession`. The pipeline (`PIPELINE.md`) parks anything that needs a design decision in GitHub Issues under `status:to-design`; this skill is where those get resolved and handed back to the worker as `status:to-do`. Talk to the user in Ukrainian.

## 1. Open the session

Pull the queue and show it:

    gh issue list --label "status:to-design" --state open

Open with one short line: the count and the titles, e.g. «Ти в дизайн-сесії. Зараз у To Design N задач: …. З якої почнемо?». If the queue is empty, say so and ask what to brainstorm instead — design work can start without an issue (a new idea goes straight into DESIGN.md, and files a fresh issue only if it implies code).

## 2. Work one issue at a time

1. `gh issue view <N> --comments` — the open design question is usually stated in the body or in the comment the worker left when it bounced the task back.
2. Read the relevant section(s) of `docs/DESIGN.md` first — find where this belongs.
3. Interview: ask 1–3 targeted questions, each with a recommendation (per CLAUDE.md §6). Don't silently guess load-bearing decisions.

## 3. Record the resolution

Writing into `docs/DESIGN.md` follows **`sync-design` (Trigger 1) exactly** — same consistency checks, voice, self-review, and isolated commit. Don't restate those rules here; follow that skill.

## 4. Hand the issue back

Once the design is resolved and committed:
- Comment the resolution summary on the issue (what was decided + the DESIGN.md section).
- `gh issue edit <N> --remove-label "status:to-design" --add-label "status:to-do"`.
- Spawned new work? File new issues — `status:to-do` if clear, `status:to-design` if it still needs its own decision.

Still unresolved this session? Leave it in `status:to-design` with a comment on where it stands.
