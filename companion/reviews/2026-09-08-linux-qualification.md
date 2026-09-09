# Champion review — Linux desktop qualification

Reviewed commit: `700cdfd70e8c29ef64b56b3092d2aeda3e722bf3`, branch `codex/desktop-qualification-astra`, worktree `/home/mabrax/.codex/worktrees/1e4a/old-england-taxi`.

The new Linux evidence is accepted as a reviewed addition to the qualification record. Full Phase 04 / Stage 03 acceptance remains open. This review does not authorize canonical integration, push, deployment or Stage 04 implementation.

## Scope confirmed from the task conversation

The user explicitly selected Linux Chrome/Firefox plus macOS Edge, removed Safari, then deferred Mac testing and limited this continuation to Linux Chrome/Firefox. iPad remains deferred. The user also accepted the documented Linux memory method without inventing a new numeric threshold or automatically approving observed growth. The foreground Chrome runs and separate memory repeat were explicitly coordinated with the user.

These decisions were checked directly in task `01a08266-38aa-7201-93de-bb61101b6091`, rather than inferred from the handoff alone.

## Independent review and verification

- Reviewed the changes to the qualification runner, external deadlines, lifecycle foreground guards, diagnostic runner, memory sampler/retries and acceptance evaluation. No application, vehicle, schema, prepared-artifact, compiler, lockfile, benchmark or saved-trace-parser change was found against `179814c`.
- Independently ran `npm run verify` at the handed-off commit: five-cell offline corpus verification; **269 application tests across 26 files**; **15 protocol/support tests**; static checks with **zero errors/warnings**; production build passed. The existing large-chunk build warning remains.
- Verified all **17 committed raw-report hashes** and byte equality with their retained local originals, plus all **29 screenshot hashes and dimensions**. Independently inspected the Chrome and Firefox Trafalgar stills. Stills are presentation evidence, not cadence measurements.
- Recomputed cold-budget results and the numeric limits of all **8 accepted sustained engine/cell rows**. Their foreground observers are complete, contain no violations or dropped records, and have contiguous observed intervals. The first sampling offset is 0–0.2 ms; this is the observer's recorded initialization offset, not a changed budget or a missing driving session.
- Checked both final displayed-engine lifecycle records: **20 loads, 60 guarded drive/reset intervals, at least 135 physics steps per load**, paused zero-speed reset state, expected active ownership and neutral Back restoration. Both contain 20 process/GPU memory observations. The partial attempts remain separate.

The new cold/keyboard, sustained and completed lifecycle records support their declared Linux configurations. No review finding invalidates those completed records. The final suite was rerun after the memory-retry changes, closing the handoff's earlier full-suite versus focused-test distinction.

## Memory assessment

Chrome's final repeat passes the unchanged 256 MiB post-GC JS ceiling and cycle-5-to-20 growth allowance. Its heap grows from **35.96 to 45.63 MiB** over that comparison. Firefox's unavailable post-GC JS API remains unmeasured under the accepted method.

Browser-tree PSS is resident process memory, including native/WASM mappings and browser infrastructure. Its samples are non-atomic. Driver GPU allocations are separate and cannot be added to PSS as a disjoint total. Recomputed per-process sums match the reported PSS values.

| Displayed engine | Cycle 5 PSS | Cycle 20 PSS | Same-cell comparisons |
| --- | ---: | ---: | --- |
| Chrome | 527.25 MiB | 597.38 MiB | Lucca 5→19: +53.32 MiB; Trafalgar 6→20: +41.15 MiB |
| Firefox | 875.22 MiB | 917.48 MiB | Lucca 5→19: −9.19 MiB; Trafalgar 6→20: +53.03 MiB |

Chrome's later cycles 9–20 range from **580.56 to 597.38 MiB**, after an earlier rise. Firefox fluctuates, peaks at cycle 10 and later falls; the endpoint is not its maximum. GPU observations do not show corresponding endpoint growth. These data provide the agreed measurement evidence, but neither establish leak freedom nor define a new native-memory pass threshold. Final acceptance of the observed growth remains explicit; the allocation/GC investigation in issue #1 stays deferred.

## Remaining acceptance concerns

1. **Chrome RAF scheduling:** the incomplete first lifecycle attempt retained independent RAF stopping after 39 callbacks while timers continued and the page reported visible/focused. Actual desktop visibility had not been confirmed for that attempt. Later user-coordinated sessions passed; six short backend diagnostics did not reproduce it. There is no established cause or runtime fix. Decide how to disposition this observation before closing the stage.
2. **Memory growth:** the method and observations are now available and independently reviewed. The remaining issue is acceptance of the explicit growth within that bounded evidence, not missing samples or a need to restart a broad GC campaign.

The separate Chicago interruption recorded real window blur and the application's correct pause. It remains invalid as a sustained acceptance attempt, with successful coordinated repeats recorded independently.

Canonical main remains `712fe6f`; the earlier reviewed benchmark branch remains `179814c`. The qualification worktree remained clean after review.

## Sources

- [Qualification record](/home/mabrax/.codex/worktrees/1e4a/old-england-taxi/plans/driveability/desktop-qualification/verification.md)
- [Procedure and scope decisions](/home/mabrax/.codex/worktrees/1e4a/old-england-taxi/plans/driveability/desktop-qualification/README.md)
- [Immutable evidence manifest](/home/mabrax/.codex/worktrees/1e4a/old-england-taxi/plans/driveability/desktop-qualification/results-summary.json)
