---
name: worker
description: Use when the user runs /worker — the New Lords build worker. One invocation = one tick of a long-running pool: reconcile in-progress issues against GitHub, then top up from status:to-do so at most 10 sub-agents run at once. Each task is worked by two agents in sequence — a Builder (implement → open PR with Closes #N) then a Tester/Integrator (independently test the PR → squash-merge to main, or fix it, or bounce to to-design). See PIPELINE.md.
---

# Worker

The New Lords build worker. Queue = GitHub Issues in `dry-eye/the-new-lords`, status via labels (see `PIPELINE.md`). Design source of truth = `docs/DESIGN.md`. One `/worker` invocation runs **one tick**; the worker stays alive across ticks via cron + sub-agent completions (§5). Talk to the user in Ukrainian; write issue/PR comments in Ukrainian.

## Model

- Pool cap: **≤10 concurrent sub-agents**, each in its own git-worktree (spawn the Agent with `isolation: "worktree"`, in the background).
- Each task flows through **two agents, in sequence**:
  1. **Builder** — implements the issue, verifies, opens a PR (`Closes #N`). Never merges.
  2. **Tester/Integrator** — a *different* agent independently tests that PR, then squash-merges to `main` if green, fixes it if it's close, or bounces the issue to `to-design` if it's underspecified.
- The two-agent split means every change is independently verified before it reaches `main`.
- A task holds **one live slot at a time** (its current-stage agent), so ≤10 agents ≈ up to 10 tasks in flight.

## One tick

1. **Read the queue** — open issues in `dry-eye/the-new-lords`:
   - `READY` = label `status:to-do`
   - `WIP` = label `status:in-progress`
   For each WIP issue, look for an open PR whose body has `Closes #N`:
     - open PR present → stage **TEST**
     - no open PR → stage **BUILD**
2. **Reconcile live agents** (`TaskList`): map each still-running Builder/Tester sub-agent to its issue. Any WIP issue with no matching live agent was orphaned (e.g. the container was reclaimed) and must be re-spawned.
3. **Free slots** = 10 − (live sub-agents).
4. **Fill slots**, in this priority order, until slots run out:
   1. **Tester** for each TEST-stage issue with no live tester (finish work already in flight first).
   2. **Builder** for each BUILD-stage issue with no live builder (resume orphaned builds).
   3. **Builder** for each READY issue, lowest number first — relabel `to-do`→`in-progress`, drop a one-line Ukrainian pickup comment, then spawn.
5. **On sub-agent completion** (event-driven — preferred over waiting for the next tick):
   - Builder returns `PR ready` → the issue is now TEST stage → spawn its Tester (if a slot is free).
   - Tester returns `MERGED` / `BOUNCED` → the slot frees → top up from READY.
6. **Re-arm** the loop (§5) and end the tick. If READY is empty and no agents are live, just idle — re-arm and end.

Never run a Builder and a Tester on the same issue at once (they are sequential: a Tester only starts once the PR exists).

## Builder sub-agent — prompt template

Spawn one background Agent with `isolation: "worktree"`, filling in `#N`, the title, and the full issue body:

> You are a **Builder** for New Lords (`dry-eye/the-new-lords`), issue **#N: "<title>"**. Work only in your own worktree.
> 1. Create branch `task/N-<slug>` off the latest `origin/main`.
> 2. Read `docs/DESIGN.md` (source of truth) and the issue body below. Implement the change — almost always in `new-lords-prototype.html` unless the issue says otherwise. Match the file's existing style.
> 3. **Verify** the issue's «Верифікація» steps: load `new-lords-prototype.html` in Chromium via Playwright (`executablePath: '/opt/pw-browsers/chromium'`), reproduce the check, and confirm it passes with **no console errors**.
> 4. If the design is ambiguous, or you'd have to guess a load-bearing decision: do **not** implement. Relabel #N `status:in-progress`→`status:to-design`, comment (Ukrainian) exactly what's unclear, and return `BOUNCED #N: <reason>`.
> 5. Otherwise commit, push the branch, and open a PR whose body contains `Closes #N` plus a short summary and what you verified. Return `PR #M ready for #N`. **Do not merge.**
>
> --- issue #N body ---
> <body>

## Tester/Integrator sub-agent — prompt template

Spawn one background Agent with `isolation: "worktree"`, once the PR exists, filling in `#M` (PR) and `#N` (issue):

> You are a **Tester/Integrator** for New Lords. Independently validate **PR #M** (issue **#N**) — you did **not** write this code, so be adversarial.
> 1. Check out the PR branch in your worktree.
> 2. Re-read the issue's «Верифікація» steps and the relevant `docs/DESIGN.md` section.
> 3. Load `new-lords-prototype.html` in Chromium via Playwright (`/opt/pw-browsers/chromium`). Confirm the desired behavior **and** no regressions / console errors.
> 4. **Pass** → squash-merge PR #M into `main` (this closes #N via `Closes`). Return `MERGED #M (#N)`.
> 5. **Fixable defects** → fix them on the PR branch, commit, push, re-verify, then squash-merge. Return `FIXED+MERGED #M (#N): <what you fixed>`.
> 6. **Fundamentally unclear / underspecified** → relabel #N to `status:to-design` with a Ukrainian comment on what's unclear, close PR #M, and return `BOUNCED #N: <reason>`. Never merge in this case.

## Staying alive (persistence)

The worker is a daemon; keep it running with the least babysitting:
- **Durable backstop** — one hourly cron trigger named `nl-worker-heartbeat` that fires a `/worker` tick into this session (`create_trigger`, cron `0 * * * *`). Survives container reclaim. Ensure exactly one exists (`list_triggers`); create it if missing, never duplicate it.
- **Event-driven top-ups** — background sub-agents re-invoke this session when they finish; handle the handoff/top-up immediately (§5) instead of waiting for a tick.
- **Warm heartbeat** — only while there is active work *or* a non-empty `to-do`, re-arm a ~15-min `send_later` each tick for sub-hour pickup of newly-added `to-do` items. Skip it when fully idle; the hourly cron covers the idle case.

There is no push notification for issue **label** changes (only PR events), so a `to-do` added by a design session is picked up on the next heartbeat/cron tick — within ~15 min while active, ~1 h when idle — not instantly.

**Stop the worker:** delete the `nl-worker-heartbeat` trigger (`delete_trigger`) and stop any live sub-agents (`TaskStop`). In-flight PRs are left untouched.

## Empty queue

If `to-do` is empty and nothing is `in-progress`, the worker is **armed and idle**: it holds the heartbeat and does nothing until a design session moves an issue into `to-do`. That is the normal resting state — report it and end the tick.
