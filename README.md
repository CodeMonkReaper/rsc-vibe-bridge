# rsc-vibe-bridge

Local npm CLI for RSC projects on native Windows 11 / PowerShell 7. Node >=18,
Git for Windows and an already authenticated official `vibe` are required.
No runtime dependencies, WSL, provider setup or API key handling.

```powershell
node ./bin/cli.js init
node ./bin/cli.js doctor
node ./bin/cli.js status
node ./bin/cli.js dispatch --task issue-42 --tier balanced --prompt "Implement the approved spec" --max-turns 8
# Clean, committed Git root required for a new isolated branch:
node ./bin/cli.js dispatch --task review-42 --tier heavy --prompt "Analyze the approved spec" --worktree feat/review-42
```

The package declares the `rsc-vibe` bin. After installing/linking this local package
with npm, the same commands work as `rsc-vibe init`, etc. This project does not
install itself globally. `npm pack --ignore-scripts` creates an installable archive.

## Routing and execution

- heavy: `mistral-large-4`, architect profile (read only).
- balanced: `zai-glm-5-3-flash`, developer profile.
- light: `mistral-small-2603`, tester profile (read only).
- debug: `zai-glm-5-3`, debugger profile.

Reviewer is also available as a supplied Vibe profile. Models are recorded in
`01-TOOLS/vibe-bridge/models.json` and explicitly declared in the project TOML using
the existing Mistral provider. Presets do not prove account entitlement. Vibe's export
reports the resolved model; without export evidence it remains null. A different
model adds concerns and never hides BLOCKED or NEEDS_CONTEXT. No automatic retry.

Dispatch validates the installed help before inference. It runs foreground using
`spawn` with `shell:false`, separate arguments, ignored stdin, JSON output, explicit
model and turns. Default 8, hard ceiling 20 turns. Vibe's native time limit is 900s
when available; a 930s parent watchdog interrupts a stuck root process. Ctrl+C also
interrupts the root and records a blocked run. This is a turn/time budget, not a
guaranteed monetary quota: provider pricing and account limits remain Vibe's concern.

Only read_file, grep, write_file and edit are exposed. Architect/reviewer/tester
deny writes. Developer/debugger deny RSC, Git and AGENTS.md writes. Subagents,
background processes, MCP and connectors are disabled. Shell tools are unavailable,
so an agent must report tests it cannot execute as NEEDS_CONTEXT. Run tests through
the owning developer terminal. This restriction keeps the two managed sessions from
spawning additional Vibe instances. No --auto-approve or persistent trust changes.
`--trust` applies to the explicitly dispatched directory for that invocation only.

These profiles are not an OS sandbox. Codex RSC hooks are not automatically Vibe
hooks. External Vibe launches and other Windows accounts are outside the ceiling.
Treat logs and prompts as private project data. The bridge never reads auth stores.

## Safe initialization and preserved configuration

`init` reads `.rsc.json.catalogVersion`, creates project config, five profiles,
model mappings and tool docs, and reports every created/skipped path. Existing files
are never overwritten. Junction/symlink ancestors are rejected. It never writes
`.rsc/`, `.rsc.json` or AGENTS.md. A missing skill registry is reported in instructions,
not silently generated. Dispatch refuses modified/missing selected bridge profiles
or project config, so a skipped permissive existing file cannot disable protections.
Back up your existing config/profile and explicitly install the supplied templates
to resolve this. Preserve an already configured Mistral provider; do not copy keys.

## State, logs and crash recovery

Global per-user state is `%LOCALAPPDATA%\RscVibeBridge\state.json`; logs are under
`runs\<UUID>\stdout.log`, `stderr.log`, Vibe's `export.json`/session journal, and a
permanent bridge `result.json`. Recent history is bounded at 100; per-run results
are retained. State uses an exclusive mkdir lock, fsync and atomic rename. It
includes run UUID, task, owner/child PIDs, project, requested/effective model,
worktree, duration, exit code and final status.

Two reservations maximum across PowerShell terminals. Duplicate active task IDs
within one project are refused. Reservations without a known child PID stay occupied
after a crash: this deliberately favors safety over availability. A recorded child
is reclaimed only when both owner and child are dead. PID reuse conservatively keeps
a slot occupied. There is no age-based stale-lock deletion.

If a lock or ambiguous reservation survives a crash: close dispatch terminals,
inspect `state.lock/owner.json`, state.json and actual Vibe processes in Task Manager,
and verify no run is alive. Back up state first. Only then remove the abandoned lock
or reconcile an ambiguous reservation. Never remove a lock based only on elapsed time.
Status can block on such a lock; doctor remains usable because it does not acquire it.

## Worktrees and rollback

`--worktree feat/name` creates a fresh branch at current HEAD under a hashed
`.worktrees/` directory. The repository must be clean and committed. Main/master
are refused; ordinary dispatch also refuses the configured default branch.
Worktrees remain after dispatch so their work is reviewable. No auto-merge or deletion.
Keep `.worktrees/` ignored in consuming projects.

Explicit safe cleanup is available as an exported local API:

```js
import { cleanupWorktree } from './lib/worktree.js';
// Use the worktree object from the completed run in status/state.
await cleanupWorktree(process.cwd(), run.worktree);
```

Cleanup validates the hashed path, Git registration and clean status and refuses
unmerged commits. It never uses force or deletes the branch. Rollback: remove only
the paths init reported after reviewing local edits; keep user backups and results.
Removing the bridge leaves original RSC intact.

## Verification

`npm test` uses native node:test, fake Vibe child processes, real temporary filesystem
state, racing Node workers and a disposable Git repository. It never calls inference.
`npm run check` checks JavaScript syntax. `node ./bin/cli.js doctor` checks Windows,
versions, required flags, governance and Git/local config. Doctor deliberately does
not prove authentication or model entitlement and reports DONE_WITH_CONCERNS for
that untested boundary. No tests require Python; installed Vibe Python models were
used once during development to validate the TOML schema without a session.
