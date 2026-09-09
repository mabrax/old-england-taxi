# Linux qualification disposition — 2026-09-09

The champion independently reviewed Linux qualification through `700cdfd70e8c29ef64b56b3092d2aeda3e722bf3`. The review confirmed the named Chrome/Firefox cold, keyboard, sustained-foreground and completed lifecycle records, preserved incomplete/invalid attempts, and verified the complete memory observations. Independent `npm run verify` passed the five-cell corpus, 269 application tests, 15 protocol/support tests, static checks and production build. The review did not establish a cause or runtime fix for the Chrome RAF stall, or certify process-memory growth as acceptable against a native-memory budget.

## User decision

On 2026-09-09 the user explicitly requested that the unexplained Chrome frame stall be tracked for later investigation and fix, like the recorded process-memory growth, so the project can continue. Additional functionality and observability may clarify the symptom later; that is a reason to preserve it, not to close it.

| Follow-up | Current disposition | Tracking |
| --- | --- | --- |
| Unexplained Chrome animation-frame stall | Deferred; unresolved; requires a fix or validated mitigation supported by evidence | [Issue #2](https://github.com/mabrax/old-england-taxi/issues/2) |
| Recorded process-memory growth and allocation/GC investigation | Deferred; resident growth remains an observation to investigate, not a diagnosed leak or a new memory-budget pass | [Issue #1](https://github.com/mabrax/old-england-taxi/issues/1) |

Issue #2 retains the stall report identity, independent RAF/timer observations, diagnostic non-reproductions and closure criteria. Issue #1 now includes the complete Chrome/Firefox lifecycle PSS/GPU observations and their measurement limits. Both remain open and neither blocks Stage 04 planning. No new profiling campaign is active.

## Current project position

Driveability implementation and the available Linux qualification evidence are independently reviewed. The disposition of the two residual concerns is now explicit deferral. This supersedes earlier instructions to resolve their disposition before moving the planning conversation forward; it does not change raw run acceptance, establish a stall fix, or declare process-memory growth passed.

The next planning topic is **Stage 04 — Zone selection and continuity**: map selection, richer cache behavior and adjacent-cell continuity. This decision records follow-up scheduling; it does not claim unconditional Stage 03 acceptance or authorize Stage 04 implementation. Canonical integration remains a separate pending step.

macOS Edge and iPad checks remain explicitly deferred, not passed. Safari remains outside the selected desktop scope. Existing prospective numeric budgets are unchanged. The dated [qualification report](verification.md), [manifest](results-summary.json) and original evidence remain intact; their earlier open-disposition recommendations describe the handoff before this decision.
