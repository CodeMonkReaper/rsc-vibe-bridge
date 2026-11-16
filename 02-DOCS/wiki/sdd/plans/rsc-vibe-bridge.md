# Bridge plan — approved in autopilot

## 0. Global constraints
Node >=18 native modules, Windows/pwsh, no shell interpolation, no RSC writes,
no credential inspection, at most 2 bridge-controlled sessions, at most 20 turns.

## 1. Context
Implements spec criteria 1–10 and the user's exact tier IDs and file layout.

## 2. Architecture
CLI -> init / doctor / dispatcher / state. Dispatcher -> router + worktree + state.
Router inspects installed help, then constructs argv. State uses atomic mkdir lock
and atomic replace, shared under LOCALAPPDATA/RscVibeBridge. Dependencies (spawn,
execFile and state directory) are injectable for tests. No shell is enabled.
One process owns the foreground run; child PID is persisted before releasing the
state lock. A reservation without a reliable child PID is never auto-reaped.

## 3. Contracts
router returns requested model and validated argv. state reserves under lock,
limits active slots, tracks child PID, finishes atomically. Dispatcher persists
outputs and outcomes, marks uncertain model evidence as unknown. Worktree creates
only fresh branches and safely removes only clean, merged bridge-owned paths.

## 4. Data flow
Validate -> inspect help -> reserve -> prepare worktree -> spawn under state lock
-> persist child -> collect output/export -> finish reservation. Logs live outside
repo in per-run directories. Task IDs are labels; random UUIDs name files.

## 5. Testing
Criteria 1/9: real temp trees and hashes. 2/3: fake execFile/help contract.
4/6: real child processes racing on one temp state directory; orphan states.
5: fake spawn streams, errors, exports and stop reasons. 7: fake git plus a real
throwaway repo for dirty/main/unmerged guards. 8/10: native doctor, no inference.

## 6. Tasks
- [x] T1 Router, safe init and templates; tests for flags, tiers, preservation.
- [x] T2 Shared state admission and crash semantics; cross-process tests.
- [x] T3 Worktree isolation and safe cleanup; disposable real Git fixture.
- [x] T4 Dispatcher, CLI, doctor and usage; process outcome tests.
- [x] T5 Full verification, independent review, fix findings; local delivery, no remote.

## 7. Risks and rollback
High: killed parent with surviving child -> keep slot while child lives; ambiguous
spawn -> retain slot. Lock-owner crash -> block, never time-based eviction.
Medium: account model catalog may differ -> report requested/effective separately.
Medium: arbitrary code tool access -> keep default approvals, no auto-approve;
instructions cannot enforce an OS sandbox. No WSL.
Rollback: uninstall local npm link if manually installed; remove only generated
files listed by init after reviewing edits; original RSC remains untouched.
No registry or review ledger commands that write under .rsc are run.
