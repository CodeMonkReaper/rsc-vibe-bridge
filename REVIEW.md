# Review contract

Check spec acceptance criteria before style. Failures: unsafe argv, oversubscribed slots,
stale-state reclamation while a child lives, unbounded turns, overwriting user config,
forced worktree deletion, invented effective model, or writing RSC-owned files.
Tests must use fakes, never inference. Report counts first; at most three nits.
Skip original .rsc and .codex content. Runtime process/state/worktree boundaries require
correctness, security and tests review. Human approval is required before publishing or merging.
No risk configuration is written into .rsc because the user's immutability rule takes precedence.
