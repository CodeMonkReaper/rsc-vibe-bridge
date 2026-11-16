# Decisions

2026-11-16: User authorized automatic ASDD and feature branch initialization.
Use ESM/native Node only, JSON state with exclusive directory lock and atomic rename.
Prefer fail-closed orphan slots over unsafe stale eviction. No RSC-owned writes,
including registry refresh/review ledger, despite generic workflow defaults.
Use observed Vibe flags. Keep account auth entirely within the official CLI.
Project agent configuration disables subagents and background commands; dispatch
also restricts exposed tools. No automatic worktree deletion after a coding run.
