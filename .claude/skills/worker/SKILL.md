---
name: worker
description: Use when the user runs /worker — the New Lords build worker. One invocation = one tick of a long-running pool: reconcile in-progress issues against GitHub, then top up from status:to-do so at most 10 sub-agents run at once. Each task is worked by two agents in sequence — a Builder (implement → open PR with Closes #N) then a Tester/Integrator (independently test the PR → squash-merge to main, or fix it, or bounce to to-design). A status:nonparallel task runs alone (drain the pool first). See PIPELINE.md.
---

# Worker

The New Lords build worker. Queue = GitHub Issues in `dry-eye/the-new-lords`, status via labels (see `PIPELINE.md`). Design source of truth = `docs/DESIGN.md`. One `/worker` invocation runs **one tick**; the worker stays alive across ticks via cron + sub-agent completions (§5). **Talk to the user in Ukrainian; write all GitHub content — issue/PR titles & bodies, comments — and commit messages in English** (per `PIPELINE.md` → Конвенції). Every versioned change goes through a worktree/branch → PR → squash-merge; **never commit directly to `main`**.

## Model

- Pool cap: **≤10 concurrent sub-agents**, each in its own git-worktree (spawn the Agent with `isolation: "worktree"`, in the background).
- Each task flows through **two agents, in sequence**:
  1. **Builder** — implements the issue, verifies, opens a PR (`Closes #N`). Never merges.
  2. **Tester/Integrator** — a *different* agent independently tests that PR, then squash-merges to `main` if green, fixes it if it's close, or bounces the issue to `to-design` if it's underspecified.
- The two-agent split means every change is independently verified before it reaches `main`.
- A task holds **one live slot at a time** (its current-stage agent), so ≤10 agents ≈ up to 10 tasks in flight.
- **Exception — `status:nonparallel`:** such a task runs **alone**, never beside other work (see §"Nonparallel tasks").

## One tick

1. **Read the queue** — open issues in `dry-eye/the-new-lords`:
   - `READY` = label `status:to-do`
   - `WIP` = label `status:in-progress`
   - `NONPARALLEL` = label `status:nonparallel` — a task that must run **alone**; it is NOT normal `READY` (see §"Nonparallel tasks").
   For each WIP issue, look for an open PR whose body has `Closes #N`:
     - open PR present → stage **TEST**
     - no open PR → stage **BUILD**
2. **Reconcile live agents** (`TaskList`): map each still-running Builder/Tester sub-agent to its issue. Any WIP issue with no matching live agent was orphaned (e.g. the container was reclaimed) and must be re-spawned.
3. **Free slots** = 10 − (live sub-agents).
4. **Fill slots**, in this priority order, until slots run out.
   **Nonparallel gate first:** if any `status:nonparallel` issue is pending, do **not** start Builders for `READY` issues — instead drain the pool and run the nonparallel task solo (§"Nonparallel tasks"). Testers for in-flight PRs and orphan-resumes still run (they drain the pool). Otherwise:
   1. **Tester** for each TEST-stage issue with no live tester (finish work already in flight first).
   2. **Builder** for each BUILD-stage issue with no live builder (resume orphaned builds).
   3. **Builder** for each READY issue, lowest number first — relabel `to-do`→`in-progress`, drop a one-line English pickup comment, then spawn.
5. **On sub-agent completion** (event-driven — preferred over waiting for the next tick):
   - Builder returns `PR ready` → the issue is now TEST stage → spawn its Tester (if a slot is free).
   - Tester returns `MERGED` / `BOUNCED` → the slot frees → top up from READY (or, if a nonparallel is pending and the pool is now empty, start it solo).
6. **Re-arm** the loop (§5) and end the tick. If READY is empty and no agents are live, just idle — re-arm and end.

**Blocked / dependencies.** Before starting a READY issue, check whether it declares a dependency on another issue — an explicit `Залежить від #N` / `depends on #N` in the body, or a worker hold-comment `⛔ HELD by worker: depends on #N`. If that `#N` is still **open**, skip the issue (leave it in `to-do`); if you are the one who discovered the dependency, post the `⛔ HELD by worker: depends on #N` comment so later ticks skip it too. It becomes eligible automatically once `#N` closes.

**Nonparallel tasks (`status:nonparallel`).** Such a task touches what all parallel work touches (e.g. the monolith→modules refactor, #65) and must run **alone**. Never grab it into the pool beside other work. When one or more are pending:
1. **Stop taking new `to-do`** — start no new Builder for a `READY` issue.
2. **Drain the pool** — let every in-flight Builder/Tester finish and its PR merge (or bounce), until nothing is `in-progress` and no sub-agent is live.
3. **Run one nonparallel task solo** — lowest number first: relabel it `status:in-progress`, run Builder → Tester → squash-merge as the **sole** in-flight work.
4. **Resume** normal parallel picking only **after** it merges (then repeat for any further nonparallel task).
Because it modifies what everything else touches, running it concurrently with anything else would guarantee conflicts — the solo run is the whole point.

Never run a Builder and a Tester on the same issue at once (they are sequential: a Tester only starts once the PR exists).

## Builder sub-agent — prompt template

Spawn one background Agent with `isolation: "worktree"`, filling in `#N`, the title, and the full issue body:

> You are a **Builder** for New Lords (`dry-eye/the-new-lords`), issue **#N: "<title>"**. Work only in your own worktree.
> 1. Create branch `task/N-<slug>` off the latest `origin/main`.
> 2. Read `docs/DESIGN.md` (source of truth) and the issue body below. The prototype is **split into ES modules under `src/`** (`state worldgen citygen economy orgs squads render ui main`) since #65. **Grep `src/` for the functions the issue names** and implement the change in the relevant module(s); match the existing style, keep module boundaries clean (explicit `import`/`export`, no new implicit cross-module globals), and expose any new page-eval/debug surface on `window` via `main.js`. Issues written before #65 may cite `new-lords-prototype.html:LINE` — those line refs are pre-refactor; the code now lives in `src/`.
> **After editing `src/`, run `node build-bundle.mjs`** (required). `new-lords-prototype.html` is a **generated, self-contained build artifact** — the script inlines every `src/` module into one inline `<script type="module">` (three.js r128 stays a CDN classic script above it) so the game opens by **double-click (`file://`)**; external ES modules cannot, because the browser blocks module fetch from a `file://` origin. **Never hand-edit the HTML between the `NEWLORDS:BUNDLE` markers.** Verify against — and commit — this regenerated HTML.
> 3. **Verify** the issue's «Верифікація» steps as ONE self-contained Playwright script (Chromium `/opt/pw-browsers/chromium`, three.js r128 served locally via route-interception) that runs to completion and **exits** — do NOT use the Monitor tool or wait on any background process. Confirm the check passes with **no new console errors**.
> 4. If the design is ambiguous, or you'd have to guess a load-bearing decision: do **not** implement. Relabel #N `status:in-progress`→`status:to-design`, comment (English) exactly what's unclear, and return `BOUNCED #N: <reason>`.
> 5. Otherwise run `node build-bundle.mjs`, then commit your `src/` edits **together with the regenerated `new-lords-prototype.html`**, push the branch, and open a PR whose body contains `Closes #N` plus a short summary and what you verified. Return `PR #M ready for #N`. **Do not merge.**
>
> --- issue #N body ---
> <body>

## Tester/Integrator sub-agent — prompt template

Spawn one background Agent with `isolation: "worktree"`, once the PR exists, filling in `#M` (PR) and `#N` (issue):

> You are a **Tester/Integrator** for New Lords. Independently validate **PR #M** (issue **#N**) — you did **not** write this code, so be adversarial.
> 1. Check out the PR branch in your worktree.
> 2. Re-read the issue's «Верифікація» steps and the relevant `docs/DESIGN.md` section.
> 3. Verify as ONE self-contained Playwright script (Chromium `/opt/pw-browsers/chromium`, three.js r128 local via route-interception) that runs and **exits** — no Monitor, no background waits. Confirm the desired behavior **and** no regressions / new console errors.
> 4. **Pass** → squash-merge PR #M into `main` (this closes #N via `Closes`). Return `MERGED #M (#N)`.
> 5. **Fixable defects** → fix them on the PR branch (if you touch `src/`, re-run `node build-bundle.mjs` and commit the regenerated `new-lords-prototype.html` too), commit, push, re-verify, then squash-merge. Return `FIXED+MERGED #M (#N): <what you fixed>`.
> 6. **Fundamentally unclear / underspecified** → relabel #N to `status:to-design` with an English comment on what's unclear, close PR #M, and return `BOUNCED #N: <reason>`. Never merge in this case.

If `main` has advanced and the squash-merge conflicts, rebase the branch onto latest `origin/main`, resolve, re-verify, then merge.

## Environment notes (browser verify)

Since #65 the prototype's **source** is modular — ES modules under `src/` — but `new-lords-prototype.html` is a **self-contained build artifact** that `build-bundle.mjs` regenerates by inlining those modules into one inline `<script type="module">` (so the game opens by double-click). **Run `node build-bundle.mjs` before verifying**, then load the regenerated `new-lords-prototype.html` directly — its app code is inline, so nothing under `src/` needs to resolve over the network (serving the worktree root still works if you prefer). The prototype pulls **three.js r128** and a webfont from a CDN, which the sandbox egress policy **blocks**. Load with Playwright **route-interception serving three.js r128 locally** — do not edit the HTML/modules to work around it. Console errors present on a clean `main` too (e.g. blocked-webfont `ERR_CONNECTION_RESET`; a planet-shader warning on older `main`) are **pre-existing/environmental, not regressions**. Chromium is at `/opt/pw-browsers/chromium`; never run `playwright install`. Verification runs as one self-contained script that exits — never via the Monitor tool (agents that wait on a monitor stall).

## Staying alive (persistence)

The worker is a daemon kept alive by an **instant wake on new work**, event-driven wakeups, and two recurring heartbeats as a safety net. All are already armed — **a tick just does its work; it does not re-arm timers** (the heartbeats are recurring cron, so re-arming would duplicate them).
- **Instant wake on new `to-do` (preferred)** — producers of `to-do` (the `designsession` skill) `fire_trigger` this session's `nl-worker-heartbeat` immediately after relabeling, so newly-ready work is picked up in **seconds**, only when there is real work. The heartbeats below only cover transitions that bypass the fire (e.g. a label edited directly in the GitHub UI).
- **Durable backstop** — recurring trigger `nl-worker-heartbeat` (`create_trigger`, hourly) fires a worker tick into this session and **survives container reclaim**. Ensure exactly one exists (`list_triggers`); create if missing, never duplicate.
- **Warm heartbeat** — a recurring `CronCreate` job (~every 15 min) gives sub-hour pickup of new `to-do` items while the session is warm. Session-only (lost on reclaim; the durable trigger revives things afterward) and auto-expires after 7 days — re-create it if it lapses.
- **Event-driven top-ups** — background sub-agents re-invoke this session when they finish; handle the handoff/top-up immediately (§5) rather than waiting for a heartbeat.

GitHub does not push issue **label** changes to the session (only PR events), so instant pickup relies on the producer firing `nl-worker-heartbeat` (above). A `to-do` set some other way (e.g. edited directly in the GitHub UI) is caught by the poll instead — within ~15 min while warm, ~1 h after a reclaim.

> Survive-reclaim note: the durable trigger resumes this session, but a reclaimed container may re-clone the repo on `main`. This skill must therefore live on `main` for a cold resume to find it — keep the worker infrastructure merged.

**Stop the worker:** `CronDelete` the warm heartbeat, `delete_trigger` the `nl-worker-heartbeat` trigger, and `TaskStop` any live sub-agents. In-flight PRs are left untouched.

## Multi-session coordination

Other Claude sessions may work the same repo (the owner runs separate "чіп" sessions and files revert PRs). Do **not** touch work that isn't the worker's: an `in-progress` issue with no PR and no worker sub-agent that a comment marks as handled elsewhere is **not** an orphan to resume; a PR on a non-`task/*` branch (e.g. `claude/…`, `revert/…`) is not the worker's to test/merge. Leave them; only act on the worker's own `task/*` pipeline and the `to-do` queue.

## Empty queue

If `to-do` (and `nonparallel`) is empty and nothing is `in-progress`, the worker is **armed and idle**: it holds the heartbeat and does nothing until a design/feedback session moves an issue into `to-do`. That is the normal resting state — report it and end the tick.
