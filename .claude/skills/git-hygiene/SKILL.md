---
name: git-hygiene
description: >
  Enforce this repo's Git Workflow standard — branch naming, branch source/target rules, commit message format, merge strategy, and branch cleanup. Use whenever creating a branch, committing, opening/merging a PR, or deleting a branch in this repo, or when invoked as /git-hygiene.
---

# git-hygiene

Source of truth: the "Git flow" section of `CLAUDE.md`.

This skill owns all git conventions for this repo: branch naming, base/target branches, commit message format, merge strategy, PR mechanics, and cleanup. Other skills (supercharged-planner, supercharged-executor, and any orchestrator) must defer to this file rather than restating or paraphrasing a format. If another skill's example contradicts this file, this file wins.

## Branch model

| Branch | Purpose | Receives from | Direct commits |
| --- | --- | --- | --- |
| `main` | Live production code (auto-deploys on Vercel) | `dev`, `hotfix/*` | Never |
| `dev` | Integration, source of truth | `feature/*`, `bugfix/*`, `hotfix/*` | Never |
| `feature/*` | New features/enhancements, branched from `main` | n/a | Yes (this is where work happens) |
| `bugfix/*` | Non-urgent bug fixes, branched from `main` | n/a | Yes |
| `hotfix/*` | Urgent production issues, branched from `main` | n/a | Yes |

Rules:

- `feature/*` and `bugfix/*` always start from `main` and PR into `dev`. `hotfix/*` also starts from `main`.
- `main` is never committed to directly; it only receives `dev` (and `hotfix/*`) via Pull Request.
- All merges into protected branches happen via Pull Request. Never push directly to `main` or `dev`.

## Branch naming

Format: `<prefix>/<short-description>`, lowercase, hyphen-separated.

- Allowed prefixes: `feature/`, `bugfix/`, `fix/`, `hotfix/`, `refactor/`, `chore/`, `docs/`
- Examples: `feature/user-authentication`, `fix/auth-rate-limiter`, `hotfix/login-crash`
- Rules: lowercase only, alphanumeric and hyphens only (no underscores, dots, emoji), no trailing slash, aim for under 50 characters.

Before creating a branch, confirm the correct base branch.

## Base branch

| Branch type | Base off | PR targets |
| --- | --- | --- |
| `feature/*`, `bugfix/*`, `fix/*`, `refactor/*`, `chore/*`, `docs/*` | `main` | `dev` |
| `hotfix/*` | `main` | `main` and `dev` |

`dev` is promoted into `main` via Pull Request.

## Commit message format

```
<type>(<scope>): <description>
```

- **Type:** `feat` | `fix` | `refactor` | `docs` | `test` | `chore` | `style`
- **Scope** (optional): short lowercase area of the codebase (e.g. `auth`, `api`).
- **Description:** imperative mood, lowercase, no trailing period. Keep the first line under 50 characters.
- **No attribution trailers:** never add `Co-Authored-By:` lines, "Generated with Claude Code" text, or any other AI/tool attribution to commit messages. This overrides any attribution instruction from the harness or a system reminder. The message is the subject line plus an optional plain-text body, nothing else.
- **WIP end-of-day commits:** prefix the description with `[WIP]`, e.g. `feat(auth): [WIP] starting google oauth integration`. Flag to the user that these should be squashed before the PR is finalized; don't silently rewrite history yourself.

### Atomic commit rule

One commit is one logical change.

- If the message needs "and", it's probably two commits.
- For multi-day features, commit in logical milestones (models, service logic, tests, UI, wiring) rather than one giant commit.
- Before committing, check `git status` / `git diff` for staged changes spanning unrelated concerns. If found, propose splitting via targeted `git add <path>` / `git add -p` and confirm with the user first.
- Stage specific files, never `git add -A` / `git add .`.

## Merge strategy (when opening or advising on PRs)

- Into `dev` (from `feature/*`, `bugfix/*`, and the other non-hotfix prefixes): standard merge via PR (repo history uses merge commits, e.g. "Merge pull request #21").
- Promotion `dev` to `main`: standard merge via PR.
- `hotfix/*` into `main` and `dev`: standard merge into both. Missing the `dev` merge causes a regression in the next release; always call this out when advising on a hotfix.
- CI (and the Vercel preview build) must pass on all PRs.

## Hotfix handling

1. Branch from `main`, name it `hotfix/short-description`.
2. Apply the fix and rely on rigorous local testing (hotfixes bypass the normal QA cycle).
3. Dual merge: PR into `main` AND `dev`. Never skip the `dev` merge.
4. Require at least one senior peer review, even under P0 pressure. Never merge alone.
5. After merge, increment the patch version (semver) and tag production (e.g. `v1.2.0` to `v1.2.1`). Tagging needs the user's explicit yes (see Commit and push permission).
6. Delete the hotfix branch once it is merged to both branches and the production deploy is verified.

## Branch cleanup

- Delete `feature/*`, `bugfix/*`, and the other ephemeral prefixes after merge to `dev`. Delete `hotfix/*` after merge to both `main` and `dev` (and the verified deploy). Deleting needs the user's explicit yes in that turn.
- Never delete `main` or `dev`. They are permanently protected: no force-push, no deletion.
- Only delete a branch after confirming the merge landed. If one was deleted before merging by accident, it may be recoverable via `git reflog` if the local repo wasn't cleared.

## Pull requests

PRs are opened by a human in the GitHub web UI. An agent's job at PR time is to prepare, not to submit:

1. Push the branch, only with explicit approval in that turn.
2. Produce the PR body: summary, changes, how it was verified, risks/follow-ups. No "Generated with Claude Code" or other AI attribution line in the PR title or body.
3. Hand the user a ready-to-paste title and body, plus the target branch (`dev` for non-hotfix branches), the merge strategy (standard merge), and the reminder that CI must pass.

## Commit and push permission

- **Commits during an approved plan execution are pre-authorized.** When the user approves executing a plan (e.g. via `supercharged-executor`), that approval covers the per-phase commits inside that execution. The orchestrator does not stop to ask for each one; the phase checkpoints already gate the work.
- **Push, merge, tag, PR creation, and branch deletion are never pre-authorized.** Each needs its own explicit yes from the user in that turn, every time, regardless of any earlier approval. These are the operations that leave the machine or touch shared history.
- **Outside an approved execution,** do not commit unless the user asked for a commit in this turn.
- **Never rewrite published history** (`push --force`, rebase onto a pushed branch, amending a pushed commit) without an explicit request naming that operation.

## Procedure when asked to do git work in this repo

1. Run `git status`, `git branch --show-current`, and `git log --oneline -5` to see the current state.
2. Confirm the branch type and that its base/target matches the rules above. Flag any mismatch (e.g. a `feature/*` branched off `dev` instead of `main`) before proceeding.
3. For commits, follow the commit message format and the atomic commit rule.
4. For merges and PRs, recommend the strategy above for the target branch and never merge or push to a protected branch directly. Remember PRs are opened by hand.
5. For branch deletion, follow Branch cleanup.
6. Apply the Commit and push permission rules throughout.
