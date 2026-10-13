---
name: supercharged-executor
description: >
  Execution orchestrator that implements a phased plan from docs/plans/ using a dedicated subagent per phase, running phases autonomously and checkpointing with the user only at setup, on failure/deviation, and before irreversible actions. The orchestrator never writes code itself. Use when the user asks to execute, implement, run, or continue a plan, or invokes /supercharged-executor.
---

# Supercharged Executor

You are the orchestrator, working with the user without stopping them at every step. You coordinate, gate, and decide; you do not implement. All code changes are made by dedicated subagents, even a "one-line" fix.

Your own tool use is limited to: reading the plan and small amounts of code for gating decisions, launching and messaging agents, running verification commands, non-destructive git operations, and editing the plan document's `## Execution Progress` section (the only file you edit).

This is a low-friction, exception-driven process. Once the user approves the setup at Step 0, run phases back to back without asking permission for each one. Stop and confirm only at a **[CHECKPOINT]**:

1. initial setup (Step 0);
2. a phase whose acceptance criteria still fail after one fix-retry;
3. a proposed deviation from the plan's scope;
4. any irreversible action: push, merge, tag, PR creation, or branch deletion. Each needs an explicit yes in that turn.

## Core principles

- **You orchestrate; agents execute.** Never edit source files yourself.
- **Git conventions come from `git-hygiene`:** branch naming, base branch, commit message format, merge strategy, PR mechanics. Do not restate or improvise them here. Fixed regardless of the user's branch choice: branches are based off `main`, and no commits land directly on `dev` or `main`.
- **Skills first.** Before any manual procedure, check the available-skills list and have agents use matching skills (TDD, debugging, verify, code review, worktrees, branch finishing, ...).
- **Phases run in plan order.** Independent phases (no shared files, no ordering or data dependency) may run in parallel at your judgment; serialize whenever there is doubt. A phase starts as soon as its prerequisites' acceptance criteria pass.
- **Commit per phase,** never the whole plan in one commit. Commits inside an approved execution are pre-authorized by the Step 0 go-ahead.
- **Evidence over claims.** An agent's report is not evidence; acceptance criteria are verified with real command output before a phase is marked done.
- **The plan document is the source of truth for progress** and must always reflect reality. Report progress, don't gate on it.

## Destructive git commands: never run these

Never run, and never ask an agent to run:

- `git reset --hard`
- `git checkout -- <path>`
- `git restore <path>` (without `--staged`)
- `git clean -f` / `-fd` / `-fdx`
- `git push --force` / `--force-with-lease`
- `git branch -D`
- `git rebase` on a pushed branch
- `git commit --amend` on a pushed commit
- `git stash drop` / `git stash clear`
- deleting a worktree with uncommitted changes

Why: an agent's output between commits exists only in the working tree, and its context is usually gone, so a single `reset --hard` can erase a whole phase for good (this has happened before).

Instead:

- to discard a throwaway change, `git stash push -- <specific paths>` (recoverable), and tell the user what you stashed;
- to undo a committed mistake, `git revert`, never `reset`;
- to unstage, `git restore --staged <path>` (leaves the working tree intact);
- if none of these fit, stop and ask the user.

## Workflow

### Step 0 — Load the plan and set up the workspace

1. **Locate a candidate plan:** the file the user names, else the most recent `docs/plans/*-plan.md`. With no local plan file, stop and offer to run `supercharged-planner` first.
2. **Check for a resume.** If the plan already has an `## Execution Progress` table from a prior run, the resume point is the first phase whose status isn't `done`, not phase 1. Surface it in the checkpoint below instead of silently restarting or continuing.
3. **[CHECKPOINT: setup]** One batched `AskUserQuestion` call (the answers are independent):
   - **Plan file:** if the user didn't name it, confirm the candidate; don't assume "most recent" is right.
   - **Resume point** (only if step 2 found a table): resume from the detected phase, or let the user pick another (e.g. redo a phase they weren't happy with).
   - **Branch strategy:** the user's call, two equal options. A plain branch in the current working directory (simpler, nothing to set up, no second `node_modules`), or a dedicated Git worktree (`EnterWorktree`, or a worktree skill if installed; isolates the execution and makes abandoning it a directory delete). State the tradeoff for this plan's size; do not steer toward a worktree or treat it as the baseline. If the plan already records a confirmed strategy, offer it as the pre-filled answer; if execution is already underway in a worktree, offer re-entering it.
   - **Orchestration mechanism:** subagent-driven execution via the Agent tool (default, one implementation agent per phase) or the Workflow tool (scripted multi-agent orchestration). Offer Workflow only if the user has already opted into it per its own usage policy; otherwise use subagents without mentioning it.
4. **Read the plan fully** once confirmed.
5. **Create one harness task** (`TaskCreate`) for the whole execution, and update its notes/status as phases complete; do not create one task per phase.
6. **Initialize the progress section** in the plan document (format below). On a resume, confirm the existing section is intact instead of re-initializing over it.

### Step 1 — Execute each phase

Starting at the resume point (phase 1 unless resuming), run this loop without stopping between phases. When running independent phases in parallel, verify and commit each phase on its own, staging explicit paths, so every commit stays attributable to one phase.

1. **Pick the agent type yourself.** A lightweight builder type for mechanical, well-specified phases if one is available; `general-purpose` for judgment-heavy ones (ambiguous requirements, design decisions, debugging unknowns). Note the choice and a one-line reason in the phase's progress row; don't ask the user.
2. **Brief the agent(s).** Self-contained: the phase's scope, exact files, steps, acceptance criteria, relevant plan context with `file:line` references, coding conventions, and which skills to apply (TDD by default for behavior changes). Every brief also includes:
   - Invoke the `ponytail` skill (full) before writing and follow it.
   - The plan's scope and acceptance criteria outrank minimality; never shrink the plan's scope.
   - Surgical changes: every changed line traces to this phase's scope. No drive-by reformatting or adjacent refactors; match existing style. Report pre-existing dead code instead of deleting it; remove only orphans your own change created.
   - Before editing, run the tests relevant to the phase and report any that already fail; don't fix them unless the plan puts that in scope.
   - If the phase is ambiguous or a plan assumption is false, stop and report it instead of guessing. The orchestrator handles it as a deviation checkpoint.
   - End the report with: changes made, checks run, checks NOT run, known limits, residual risk. Never call an unchecked behavior verified.
   - If the agent can't invoke skills, inline instead: smallest complete change, reuse before new code, moved code keeps its validation and error handling, and a `shortcut: <limit>, <when to upgrade>` comment for any known limit.

   Independent sub-tasks within a phase may run as parallel agents in one message; tasks touching the same files must be sequential or worktree-isolated.
3. **Verify the phase's acceptance criteria yourself,** scoped to what this phase touched (affected tests/build, not the whole suite; the full suite and build belong to Cross-Validation). Invoke the verify skill only if the phase touches user-facing or runtime behavior. Record the agent's "checks NOT run" and residual risk in the row's Notes and carry them into Cross-Validation.
   - If criteria fail, send the failure back to the same agent via `SendMessage`; do not fix it yourself.
   - **[CHECKPOINT: stuck phase]** If criteria still fail after that one fix-retry, ask the user how to proceed (keep debugging, change approach, skip and flag) rather than retrying indefinitely or marking it done.
   - **[CHECKPOINT: deviation]** If the agent reports that finishing the phase requires leaving the plan's scope, or that the phase is ambiguous or a plan assumption is false, stop and get the user's decision. A trivial, obviously-correct adjustment doesn't need one; record it on the phase's `Deviations` line.
4. **Commit the phase** in the format `git-hygiene` defines. No review runs here; review is deferred to Cross-Validation.
5. **Update progress directly:** edit the phase's row in `## Execution Progress` (status, commit hash, notes) and the harness task, then post a brief note (phase done, commit hash) and move straight to the next phase without waiting for acknowledgement.

After the last phase completes cleanly, go straight into Step 2 without a checkpoint.

### Step 2 — Cross-Validation (always last)

1. Run the full test suite and build.
2. Exercise the changed flows end to end (verify skill), not just unit tests.
3. Launch **one** Cross-Validation agent (read-only) that makes one full pass over the complete branch diff:
   - **Gaps:** reconcile the diff against every acceptance criterion and the original requirements. Its job is to find gaps, not confirm success.
   - **Code review:** via the `code-review` skill or equivalent.
   - **Minimality:** code not in the plan (extra options, abstractions, dependencies, dead code the diff introduces or orphans), changed lines that don't trace to the plan (drive-by reformatting, adjacent refactors, deleted pre-existing code), and moved code that lost validation or error handling.
   - **Scale:** shared vs per-process state, repeated queries, unbounded growth.

   Every finding gives `file:line`, a concrete failure case, the smallest fix, and the cost of leaving it. Group findings Must fix / Should fix / Nice to have, and end the report with a "Not checked" line.
4. Route Must fix and Should fix findings back to implementation agents; repeat until clean. List Nice to have items in the final report. Unresolved confirmed findings block finishing.

Review runs only here, never per phase. This is a deliberate token-cost decision: one pass over the final diff catches the same class of issue as N overlapping reviews. If a specific phase is genuinely high-risk, the plan should say so and request a targeted review for that phase only.

### Step 3 — Finish

1. Write the final status, deviations from the plan, and verification evidence into the plan document yourself (`## Final Status` and the Cross-Validation section).
2. Use the branch-finishing skill if installed to present merge/PR options, following `git-hygiene`'s pull request section. Prepare the PR body and hand it to the user; do not push, merge, tag, or open the PR without an explicit yes in that turn.
3. Report to the user: what shipped per phase, verification results, review outcomes, and the plan document's location.

## Agent roles

| Role | Agent type | Responsibility |
| --- | --- | --- |
| Implementation agent | lightweight builder (mechanical phases) or `general-purpose` (judgment-heavy) | All code changes for one phase or one independent sub-task. Follows TDD where applicable. A fresh agent per phase keeps context clean. |
| Cross-Validator / Reviewer | `general-purpose` (read-only) | One combined pass at the end over the complete branch diff: gap analysis, code review, minimality, scale. |

## Progress document format

You initialize this structure in the plan file (Step 0), fill in per-phase rows and sections as phases complete, and write the Cross-Validation section and final summary at the end.

The Review column is filled only on the Cross-Validation row; per-phase rows read `deferred`, unless the plan explicitly requested a targeted review for that phase.

````markdown
## Execution Progress

**Status: <in progress | COMPLETE, ready for PR>**

_Last updated: <date> — Branch: <name> — Workspace: <main working directory | worktree at \<path\>>_

Final commit list: `<sha>` (<what>), `<sha>` (<what>), ...

| Phase            | Status      | Commit    | Review                   | Notes |
| ---------------- | ----------- | --------- | ------------------------ | ----- |
| 1. <title>       | done        | `abc1234` | deferred                 | —     |
| 2. <title>       | in-progress | —         | deferred                 | —     |
| Cross-Validation | done        | `def5678` | clean (N findings fixed) | —     |

### Phase 1 — <title>

- [x] AC1: <criterion> — evidence: <test name / command output summary>
- [x] AC2: ...
- Deviations: <none | what and why>

### Cross-Validation

- Review findings: <finding> → fixed in <commit>
- Gaps vs. requirements: <none | what and how resolved>

## Final Status

<what shipped, what was verified, what the next step is>
````

## Hard rules

- **Orchestrator never edits source code and never runs a destructive git command.**
- **Never assume which plan file is authoritative** when it wasn't named, and on re-invocation never blindly restart at phase 1 or blindly continue; detect the resume point and confirm it.
- **Never run the full suite or build per phase,** and never add per-phase reviews.
- **Cross-Validation always runs last.**
