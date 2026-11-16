---
type: spec
title: RSC Vibe Bridge
timestamp: 2026-11-16T15:00:00Z
slug: rsc-vibe-bridge
status: clarified
approval: approved in autopilot by user on 2026-11-16
---

# RSC Vibe Bridge

## Problem & why
The project owner needs bounded, observable Vibe task execution in RSC-governed
projects on native Windows without changing RSC itself.

## Cost of not building it
Manual dispatch from several terminals can exceed the intended two-run budget and
loses durable task results. There is no existing application code here.

## The cheapest alternative
Run Vibe manually and track two terminals. This does not enforce a shared ceiling.
Vibe's own worktree mode handles isolation, but not cross-terminal bridge admission.

## Goals
Initialize safely, route four tiers, dispatch bounded tasks, inspect shared status,
diagnose prerequisites, and optionally isolate work in Git worktrees.

## Users & context
The authenticated Windows developer using PowerShell 7, Git and Node >=18.
Actor: project owner. Workaround: manual CLI. Desired progress: repeatable dispatch.
Constraints: no keys, no heavy dependencies, max two bridge-managed Vibe instances.
Known: Vibe 3.1.2 is installed. Assumed: requested models are entitled by the account.

## What the user can do
Run init, dispatch with task/tier/prompt and optional worktree, status, and doctor.
Dispatch rejects invalid input, missing governance, unsupported flags and unsafe branches.

## What result they get
Status reports active count as N/2 with task, PID and worktree. Dispatch produces a
record with requested model, duration, exit code and one of DONE,
DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT. Effective model is reported only when
Vibe's export supplies evidence. Expected examples: third run -> BLOCKED; turn
limit -> DONE_WITH_CONCERNS; missing context -> NEEDS_CONTEXT.

## What it must respect
User constitution: native Windows; Node >=18; native modules only; original .rsc/
and .rsc.json unchanged; no credential access; maximum two managed sessions globally;
strict positive turn ceiling; no overwrites; no main changes or destructive cleanup.

## How it proves it
node:test with fake processes/git and real temporary filesystem state; adversarial
multi-process reservation tests; doctor on this machine without a model request;
hash comparison of all original RSC files. No paid inference in verification.

## Behaviour
- init preserves existing files and reports skipped files, including partial installs.
- dispatch stays foreground, captures output, records failure and releases its slot.
- active ambiguous orphan reservations remain occupied (fail closed).
- worktrees preserve dirty or unmerged work, and cleanup is explicit and safe.
- models are requested exactly; unsupported models fail without fallback chosen by bridge.
- CLI arguments are values, never shell command fragments.

## Acceptance criteria
1. Init reads catalogVersion and produces config, five profiles and tool documentation;
   second init leaves existing bytes unchanged.
2. Each tier maps to the exact four model IDs in the user's request; invalid tiers fail.
3. Runtime help inspection confirms required flags before spawning inference.
4. Across terminals, at most two active reservations exist; a third is rejected.
5. Every run has 1..20 turns (default 8), stdout/stderr files and a durable final record.
6. Status includes live and unresolved orphan slots and linked worktree paths.
7. Main/master/default branches and dirty roots are refused for worktree creation;
   cleanup refuses dirty/unmerged work and never uses force.
8. Doctor reports executable versions, CLI flags, RSC catalog and Git readiness;
   it does not claim account entitlement/authentication from --help alone.
9. Original RSC bytes remain unchanged; no keys are read or stored by the bridge.
10. npm test and syntax checks pass using no real inference; native doctor runs.

## Non-goals / out of scope
No npm publish, remote push, PR creation without a remote, RSC fork, key management,
model entitlement probes, background service, GUI, global Vibe config edits or control
of Vibe launched outside this bridge. Agent instructions are not an OS sandbox.

## Points to clarify
- **suposición tomada** — 8 default turns, hard ceiling 20; basis: bounded budget requested.
- **suposición tomada** — foreground dispatch; basis: captures output and process ownership.
- **suposición tomada** — manual lock recovery after a crashed writer; basis: fail closed
  is safer than deleting a lock whose owner may be writing.
- **decisión diferida** — account entitlement and real inference; avoid spending quota.

## Clarifications
2026-11-16: User authorized Git initialization, feat/rsc-vibe-bridge and full automatic
implementation/verification. No registry refresh: user explicitly forbids .rsc writes.
Config schema initially failed inside sandbox; succeeded outside it without inference.
