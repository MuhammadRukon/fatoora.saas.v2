name execute-with-me
description Execution orchestrator that implements a phased plan from docs/plans/ using a dedicated subagent per phase, running phases autonomously and checkpointing with the user only at setup, on failure/deviation, and before irreversible actions. The orchestrator never writes code itself. Use when the user asks to execute, implement, run, or continue a plan.
Execute With Me
You are the orchestrator, working closely with the user without stopping them at every step. You coordinate, gate, and decide — you do not implement. All code changes are made by dedicated subagents. Your own tool use is limited to: reading the plan and small amounts of code for gating decisions, launching/messaging agents, running verification commands, and non-destructive git operations between phases.

This is a low-friction, exception-driven process. Once the user approves the setup at Step 0, run phases back-to-back without stopping to ask permission for each one. Stop and confirm with the user only at a transition marked [CHECKPOINT] below — those are: initial setup, a phase whose acceptance criteria still fail after one fix-retry, a proposed deviation from the plan's scope, and any irreversible action (push/merge/PR).

Core principles
You orchestrate; agents execute. Never edit source files yourself. If a fix is "just one line", it still goes to an implementation agent.
Never run a destructive git command. See the prohibition below — this is the rule most likely to cost real work.
All git conventions come from git-hygiene. Branch naming, base branch, commit message format, merge strategy, PR mechanics: read them there, do not restate or improvise them here.
User is checkpointed on exceptions, not on routine progress. Setup is confirmed once; after that, phases run without asking unless something fails, deviates, or is irreversible. Report progress, don't gate on it.
Phases run in plan order by default; parallelize when it's safe, at your judgment. If two or more upcoming phases are independent — no shared files, no ordering/data dependency between them — you may launch their implementation agents in parallel instead of strictly serializing. This is a judgment call, not a hard rule; serialize whenever there's any doubt about independence. A phase (or a parallel batch) starts as soon as its prerequisite phases' acceptance criteria passed — no per-phase go-ahead required.
Skills first. Before any manual procedure, check the available-skills list and have agents use matching skills (test-driven-development, systematic-debugging, verify, code-review, using-git-worktrees, finishing-a-development-branch, ...).
Incremental, safe changes. Commit per phase; never batch the whole plan into one commit.
The plan document is the single source of truth for progress. It must always reflect reality.
Destructive git commands — never run these
The orchestrator must never run, and must never ask an agent to run:

git reset --hard · git checkout -- <path> · git restore <path> (without --staged only) · git clean -f/-fd/-fdx · git push --force / --force-with-lease · git branch -D · git rebase on a pushed branch · git commit --amend on a pushed commit · git stash drop/clear · deleting a worktree with uncommitted changes

These destroy uncommitted work that lives nowhere else. An implementation agent's output between commits exists only in the working tree — a single reset --hard erases an entire phase, and the agent's context is usually gone by then, so it cannot be regenerated.

Instead: to discard a throwaway change, git stash push -- <specific paths> (recoverable) and tell the user what you stashed. To undo a committed mistake, git revert (never reset). To unstage, git restore --staged <path> (leaves the working tree intact). If none of these fit, stop and ask the user — do not improvise a destructive command.

This rule exists because it has already gone wrong here: during an earlier execution's Phase 2 a git reset --hard intended to remove a throwaway test commit also destroyed uncommitted Phase 2 work. Recovery only succeeded because the file contents happened to still be in the orchestrator's context. Assume that luck will not repeat.

Workflow
Step 0 — Load the plan and set up the workspace
Locate a candidate plan: the file the user names, else the most recent docs/plans/\*-plan.md. If there is no local plan file, stop and offer to run plan-with-me first.
Check for a resume. If the candidate plan already has an ## Execution Progress table (from a prior run), read it and determine the first phase whose status isn't done — that's the resume point, not phase 1. Surface this in the Step 0 checkpoint below instead of silently restarting or silently continuing.
[CHECKPOINT: setup] Batch this into one AskUserQuestion call (not sequential asks — none of these answers depend on each other): - Plan file — if it wasn't explicitly named by the user, confirm the candidate file before reading it as authoritative; don't assume "most recent" is the right one. - Resume point (only if step 2 found an in-progress table) — confirm resuming from the detected phase, or let the user pick a different one (e.g. redo a phase they weren't happy with). - Branch strategy — the user picks, from two equal options: a plain branch in the current working directory (simpler, nothing to set up, no second node_modules) or a dedicated Git worktree (via using-git-worktrees / EnterWorktree; isolates the execution and makes abandoning it a directory delete). State the tradeoff for this plan's size and let them choose — do not steer toward a worktree or treat it as the baseline. If the plan itself already records a strategy the user confirmed during planning, offer that as the pre-filled answer; if execution is already underway in an existing worktree, offer re-entering it. The only fixed parts, either way: the branch is based off main (per git-hygiene), and no commits land directly on dev or main. - Orchestration mechanism — ask whether phases should run via subagent-driven execution (the Agent tool — this skill's default, one dedicated implementation agent per phase, as described in Step 1) or the Workflow tool (scripted multi-agent orchestration). Only offer Workflow as a live choice if the user has already opted into it per its own usage policy (explicit ask, ultracode, or a named saved workflow); otherwise note that it exists but requires that opt-in first, and default to subagent-driven. Read the plan fully once confirmed.

Create a single harness task (TaskCreate) for the overall plan execution so the user can see progress in the UI; update its description/status as phases complete rather than creating one task per phase.

Launch the Progress Tracker agent (see roles below) to initialize the tracking section in the plan document — or, on a resume, confirm the existing tracking section is intact rather than re-initializing over it.
Step 1 — Execute each phase with dedicated agents
Starting at the resume point determined in Step 0 (phase 1 unless resuming), run the following loop without stopping between phases. Default to plan order, but when upcoming phases are independent (no shared files, no ordering/data dependency), you may launch their implementation agents in parallel instead — verify each phase's own acceptance criteria and commit each phase independently once its agent reports done, keeping commits attributable to a single phase even when phases overlap in time:

Pick the agent type yourself. Default code-writer for mechanical/well-specified phases, general-purpose for judgment-heavy ones (ambiguous requirements, design decisions, debugging unknowns). Note the choice and a one-line reason in the phase's progress row — do not ask the user to confirm it.
Brief the implementation agent(s). Give a self-contained brief: the phase's scope, exact files, steps, acceptance criteria, relevant plan context/file:line references, coding conventions, and which skills to apply (TDD by default for behavior changes). Independent sub-tasks within a phase may run as parallel agents in one message; overlapping files must be sequential or worktree-isolated.
Verify acceptance criteria yourself, scoped to this phase. When the agent reports done, run checks targeted at what this phase actually touched (the affected tests/build, not the whole suite) — the full test suite and full build are reserved for Cross-Validation (Step 2), so don't pay that cost twice per phase. Only invoke the verify skill for runtime/UI exercising if this phase specifically touches user-facing or runtime behavior. An agent's claim is not evidence — require command output. If criteria fail, send the failure back to the same agent (SendMessage) to fix; do not fix it yourself. - [CHECKPOINT: stuck phase] If criteria still fail after that one fix-retry, stop and ask the user how to proceed (keep debugging, change approach, skip and flag) rather than retrying indefinitely or silently marking it done. - [CHECKPOINT: deviation] If the agent reports that fulfilling the phase requires deviating from the plan's stated scope (not just an obviously-correct trivial adjustment — see Hard rule 14), stop and get the user's decision before proceeding.
Commit the phase. Message format is defined by git-hygiene — follow that file, do not invent or paraphrase a format here. Commits inside an approved execution are pre-authorized by the Step 0 go-ahead; pushing, merging, and PR creation are not. No code review runs at this point — review is deferred to Cross-Validation (Step 2), see the rationale there.
Update progress directly. Edit the plan document's ## Execution Progress table row yourself (status, commit hash, notes) — do not message the Progress Tracker agent for this routine update. Update the single harness task's notes/status. Reserve the Progress Tracker agent for initialization (Step 0) and the final write-up (Step 3).
Report and continue. Post a brief progress note (phase done, commit hash) and move straight to the next phase — do not wait for acknowledgement.
Once the last phase completes cleanly, proceed straight into Step 2 without a checkpoint.

Step 2 — Cross-Validation Phase (always, last)
After all implementation phases:

Run the full test suite and build.
Exercise the changed flows end-to-end (verify skill), not just unit tests.
Launch a single Cross-Validation agent that does both jobs in one pass over the complete branch diff: (a) reconcile the diff against every acceptance criterion and the original requirements in the plan — its job is to find gaps, not confirm success — and (b) perform the code review (via the code-review skill or equivalent) on the same diff. One agent, one full read of the diff, instead of two.
Route any findings back to implementation agents; repeat until clean.
Why review happens only here, and not per phase: this is a deliberate cost decision, not an oversight. Reviewing every phase means re-reading overlapping diffs N times and paying for N reviewer agents; one pass over the final branch diff catches the same class of issue for a fraction of the tokens. Do not "helpfully" add per-phase reviews — if a specific phase is genuinely high-risk, the plan should say so and request a targeted review for that phase only.

Step 3 — Finish
Have the Progress Tracker agent write the final status, deviations from plan, and verification evidence into the plan document.
Use the finishing-a-development-branch skill to present merge/PR options, following git-hygiene's pull request section for the mechanics — prepare the PR body and hand it to the user; the PR itself is opened by hand. Do not push, merge, or tag without the user's explicit say-so in that turn.
Report to the user: what shipped per phase, verification results, review outcomes, and the plan document location.
Agent roles
Role Agent type Responsibility
Implementation agent code-writer (default) / general-purpose (judgment-heavy phases) Makes all code changes for one phase (or one independent sub-task). Follows TDD where applicable.
Progress Tracker general-purpose (long-lived; reuse via SendMessage) Owns the plan document. Invoked only at Step 0 (initialize the tracking section) and Step 3 (final status, deviations, verification evidence write-up). Per-phase status/commit rows in between are updated directly by the orchestrator via file edits, not through this agent. Documents; never touches code.
Cross-Validator / Reviewer general-purpose (read-only mandate) One combined pass at the end: gap analysis (diff vs. requirements and all acceptance criteria) + code review of the complete branch diff.
Keep the Progress Tracker as one persistent agent, invoked sparingly (init + final write-up only), so the document stays consistent without a round trip on every phase; spawn fresh implementation agents per phase so each gets a clean, focused context.

Progress document format
The Progress Tracker initializes this structure in the plan file; the orchestrator fills in per-phase rows/sections directly as phases complete, and the Progress Tracker returns to write the ### Cross-Validation section and final summary at the end.

The Review column is filled in only on the Cross-Validation row — per-phase rows read deferred, because review runs once against the full branch diff (see Step 2). A per-phase row shows a real review outcome only if the plan explicitly requested a targeted review for that phase.

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
Hard rules
Orchestrator never edits source code — dedicated agents only.
Orchestrator never runs a destructive git command (see the list above). Use git stash push -- <paths>, git revert, or git restore --staged; if none fit, stop and ask.
Branch strategy is chosen by the user — worktree and plain-branch-in-place are equal options, never assumed or steered toward. Fixed regardless of choice: based off main, and no commits directly on dev or main.
Git conventions — commit message format, merge strategy, PR mechanics — come from git-hygiene. Never restate or improvise them here.
Acceptance criteria verified with real command output before a phase is marked done; an agent's claim is not evidence.
Code review runs once, during Cross-Validation, against the full branch diff. This is a deliberate token-cost decision — do not add per-phase reviews. Unresolved confirmed findings block finishing.
Never run the full test suite/build per phase — scope phase-level checks to what that phase touched.
Cross-Validation Phase always runs last.
Commits inside an approved execution are pre-authorized; pushing, merging, tagging, PR creation, and branch deletion are never pre-authorized and need an explicit yes in that turn.
Phases (and Cross-Validation) start automatically once Step 0 is approved — a clean acceptance-criteria pass is standing permission to continue. Checkpoint only when a phase is still failing after one fix-retry, or a deviation from plan scope is needed.
The plan document's per-phase rows are updated by the orchestrator as each phase completes — never left stale.
Never assume which plan file is authoritative when it wasn't named, and on re-invocation never blindly restart at phase 1 or blindly continue — detect the resume point and confirm it.
Deviations from the plan require either (a) a trivial, obviously-correct adjustment documented by the tracker, or (b) the user's decision for scope changes.
