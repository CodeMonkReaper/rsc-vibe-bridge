# Verification — 2026-11-16

Status: DONE_WITH_CONCERNS. Local package verified; real account inference deferred.

- Native node:test suite: 14 behavioral tests pass; 0 failures/skips. Raw output:
  [verification-tests.txt](../verification-tests.txt).
- Syntax checks: npm run check -> Syntax checks passed.
- Native doctor: all 9 local checks true; exit 0; DONE_WITH_CONCERNS. Raw output:
  [verification-doctor.json](../verification-doctor.json).
- Original .rsc/ and .rsc.json: SHA-256 comparison, 290 original files unchanged;
  current file count matches baseline. No registry or ledger files added.
- Native Vibe schema: five agent templates validate against installed 3.1.2
  Python schema; prompt-loading properties mocked to avoid user configuration
  initialization. Subagents/background disabled in every validated profile.
- npm pack --ignore-scripts: local archive with 16 entries and zero bundled deps.
  npm install --prefix .test-tmp/package-smoke from archive -> added 1 package;
  installed rsc-vibe.cmd --help -> expected four-command usage.
- Three review lenses approved after fixes; record in reviews/rsc-vibe-bridge.md.

No API calls, authentication probes, CI, remote push, publishing or real Vibe
dispatch were performed. Existing login and model entitlement are unverified.
Runtime tested with Node 24.18.0 on Windows, not every Node >=18 minor release.
RSC spec/risk CLI gates not executed; manual traceability and independent panel
used because no .rsc mutations are allowed. No formal CLI risk verdict is claimed.

Rollback: stay on the parked feature branch or revert its implementation commits;
main remains the original harness baseline. For initialized consuming projects,
remove only init-created paths after reviewing user edits. Restore local .vibe
configuration from its backup if needed. Keep run results/worktrees until reviewed;
cleanup refuses dirty or unmerged work.
