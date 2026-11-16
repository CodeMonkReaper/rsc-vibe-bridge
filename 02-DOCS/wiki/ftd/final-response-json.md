---
author: Luis Haroldo Salamanca Fernandéz
branch: feat/rsc-vibe-bridge
status: in-progress
---
# Recognize final JSON after response prose

## Intent
Real balanced/debug connectivity probes returned valid final JSON after prose.
The parser treated those successful responses as unrecognized status.

## Scope
Recognize complete JSON and a terminal fenced JSON block in the last assistant
message. Preserve exit/refusal precedence. Reject invalid, unknown, nonterminal or
ambiguous statuses. No new inference, auth access, RSC modifications or replay writes.

## Checklist
- [x] Add regression fixtures for prose + final JSON and malformed/ambiguous output.
- [x] Fix extraction and verify actual saved responses offline.
- [x] Run tests/syntax and independent review; refresh local package.

## Evidence
Before fix: heavy/light DONE; balanced/debug finished with matching model and final
DONE JSON, but bridge returned DONE_WITH_CONCERNS. User authorized parser fix/tests.

After fix: 16/16 native tests pass, zero failures/skips; npm run check passes.
Offline replay of both actual stdout.log files yields DONE. No inference or writes
to historical run records. Regression tests reject trailing prose, malformed final
blocks, unknown statuses and unsupported fence languages; the last terminal block
wins over earlier examples. Nonzero exits/refusals still take precedence.
Independent correctness review: APPROVE, no actionable regression. RSC CLI risk
and ledger were not run, following the documented immutability exception.
Archive rebuilt and installed into an isolated local prefix; packaged parser smoke
returns DONE. No runtime config/templates changed and no credential access.

## Next
Fix verified and parked on the existing feature branch. Human merge/publication
remains separate. Historical probe records remain unchanged.
