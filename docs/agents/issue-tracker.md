# Issue tracker: GitHub (fork of record + read-only upstream)

This repo is a fork. Two GitHub repos carry tickets, and they are **not symmetric** — the
difference is access, not preference.

| | repo | access | role |
| --- | --- | --- | --- |
| **fork** | `itsbrex/allman-tui` | admin | **tracker of record — all writes go here** |
| **upstream** | `tarkaai/allman-tui` | read-only (`pull`) | **read-only source of context** |

`gh repo set-default` is set to the fork, so a bare `gh issue …` inside this clone targets
`itsbrex/allman-tui`. Reaching upstream **always** requires an explicit `-R tarkaai/allman-tui`.

## The one hard rule: never write a bare `#N`

GitHub numbers issues per repo, and this project spans **four** of them — the TUI fork and
upstream, plus `itsbrex/allman-cli` and `tarkaai/allman-cli`. `#25` names a different ticket in
each. Every reference a skill emits — in an issue body, a commit message, a spec, a test name, a
hypothesis — must be fully qualified:

- `itsbrex/allman-tui#7` — ours
- `tarkaai/allman-tui#25` — upstream
- `itsbrex/allman-cli#12` — the companion CLI (see below)

GitHub renders all of these as native cross-repo links. A bare `#N` anywhere in agent output is a
bug.

When resolving a bare `#N` a human typed, ask which repo rather than guessing.

## The companion CLI is a separate tracker

The TUI is a front-end over the `allman` binary built from `allman-cli`. Work often turns out to
belong there instead: rate limits, quotas, the store layout, every network call. **File it where
the fix lands**, not where it was noticed — a TUI issue for a CLI bug goes stale the moment the CLI
fixes it, and nobody watching the CLI ever sees it.

The same fork/upstream rule applies over there: writes go to `itsbrex/allman-cli`,
`tarkaai/allman-cli` is read-only. Cross-link the two with fully-qualified references so the pair
stays navigable.

## Upstream is read-only — what that forbids

Permissions on `tarkaai/allman-tui` are `pull: true, push: false, triage: false`. Allowed:

- **Read**: `gh issue view <n> -R tarkaai/allman-tui --comments`, `gh issue list -R tarkaai/allman-tui …`
- **Create / comment**: `gh issue create -R tarkaai/allman-tui …`, `gh issue comment <n> -R tarkaai/allman-tui …` — only when the work is genuinely meant to land upstream

Not available, and skills must not attempt them upstream:

- applying or removing labels (`gh issue edit --add-label`)
- assigning, closing, reopening
- issue dependencies / sub-issues

Upstream also has **none of the triage labels** — only GitHub's default set — and they cannot be
created there. `/triage` and `/wayfinder` therefore run **against the fork only**. A skill that
finds itself wanting to label an upstream issue has picked the wrong surface: adopt it instead.

## Adopting an upstream ticket

When work starts on something upstream tracks, open a fork issue rather than working the upstream
one. Put the link on the first line of the body:

```
Upstream: tarkaai/allman-tui#25
```

That line is the join key. It survives in the issue body, so `gh issue list --json body` can find
every adopted ticket, and it keeps our triage state on the surface we can actually write to.
If the work is later contributed back, reference both in the PR.

## Conventions (fork — the default target)

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

Note that a PR opened from this fork against upstream lives in **upstream's** number space.

## When a skill says "publish to the issue tracker"

Create an issue on the fork, `itsbrex/allman-tui`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments` for ours; add `-R tarkaai/allman-tui` for an upstream one.

## Wayfinding operations

Used by `/wayfinder`. Runs **on the fork only** — it needs assignment, closing and dependency
writes, none of which upstream permits. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/itsbrex/allman-tui/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/itsbrex/allman-tui/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: itsbrex/allman-tui#<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Repo-specific note

This TUI drives an account's live LinkedIn activity through the `allman` binary. Issues are public,
so redact anything that identifies a real account or person: profile IDs, slugs, cookie values, and
message text — including anything pasted out of a terminal capture of the inbox, which is the easy
one to miss. Use the placeholder shapes already used throughout the codebase (`ACo…`, `ACw…`,
`{convId}`, `sarah-chen`) instead of live values. This applies doubly to anything filed upstream.
