# Linux desktop qualification — 2026-09-08

**Linux Chrome and Firefox now have passing cold/keyboard, complete sustained-foreground, and 20-cycle lifecycle evidence under the unchanged budgets. Full Phase 04 / Stage 03 acceptance is not recommended yet:** the earlier displayed Chrome RAF stall is reproduced but not causally resolved, and the complete-memory measurement/acceptance gate remains open. A successful later session does not turn an earlier incomplete observation into a pass.

The user explicitly limited this task to **Linux Chrome and Firefox**. Desktop Safari is removed from scope. macOS Edge remains a future target whose testing the user explicitly deferred; iPad acceptance also remains deferred. Neither is passed, and neither is a required execution step in this Linux task.

## Scope and identity

Work is isolated on `codex/desktop-qualification-astra`, based on reviewed `179814c`; canonical main remains `712fe6f`. Application source, vehicle configuration, schema-v1, prepared artifacts, compiler and dependency lock are unchanged. Changes are qualification tooling, its test command, evidence and planning status. No Stage 04 implementation, canonical merge, push or deployment occurred.

The [prospective procedure](README.md) precedes the new runs. `7222cd4` adds bounded external deadlines, lifecycle foreground checks, immutable output directories, served-build checks, diagnostic counters and supplementary memory sampling. `3f27aba` adds the bounded display-backend comparison. `d49050c` records the user's platform decisions and correct OS reporting. `9b47e71` preserves and retries incomplete process-memory reads, with focused regressions. Each raw result records its actual commit/tool hashes; subsequent tool changes do not relabel earlier records.

The [manifest and numeric summary](results-summary.json) links every immutable raw report, original local path and SHA-256, including failed/incomplete attempts. Full browser reports are committed in `evidence/`. Screenshots remain in the isolated cache with dimensions/hashes in the manifest. All 29 initial screenshots are 1440×900; representative post-run Chrome Trafalgar, Firefox Lucca and Chrome Tower Bridge images were visually inspected. Their controls, vehicle, attribution and camera render coherently. Stills do not establish measured cadence or all-map coverage.

The production assets are the reviewed `index-DevJONO8.js`, `vehicle-BLw_iexE.js`, `load-fixture-6987g8ig.js` and `index-CdNYqW5q.css`. Each acceptance runner verifies the served hashes against its local build before visiting cells. Preview 4196 and its cache are isolated from canonical 4175 and the reviewed worktree.

## Available desktop results

Host: Fedora Linux 44, KDE Wayland session, Ryzen 7 5700X3D, NVIDIA RTX 4070 Ti SUPER / driver 610.57.04. Chrome **152.0.7977.82** reports ANGLE/OpenGL ES on that GPU; Firefox **155.0** reports NVIDIA WebGL with a masked “GTX 980, or similar” renderer string. That mask is not a second physical GPU. Viewport is 1440×900 / nominal DPR 1. Chrome's `1.0000000298023224` DPR is within the reviewed representation tolerance. Background applications and an existing VM were present; no idle-host claim is made. Performance runs were sequential with no simultaneous build/test/benchmark workload.

| Displayed engine | Cold visits | Maximum setup / initialization / usable Drive | Five-cell keyboard checks |
| --- | ---: | --- | --- |
| Chrome | 15/15 pass | 389.30 / 661.20 / 1850.30 ms | 5/5 pass |
| Firefox | 15/15 pass | 219.00 / 396.00 / 1152.41 ms | 5/5 pass |

Cold budgets remain 1000 / 3000 / 5000 ms. Browser contexts are fresh; OS/shader caches are not asserted cold. Functional checks cover acceleration/steering, Stop, reverse, reset, Escape pause and return to inspection in all five cells, including Tower Bridge. The existing independently reviewed physical/contact/source matrix remains the physical evidence; it was not reconstructed from screenshots here.

Each sustained row below independently passes its numeric budgets, latched foreground protocol and correctness checks. Values are rounded for presentation; exact original numbers are retained and compared without relaxing thresholds. These are repeated keyboard maneuvers with deliberately marked reset intervals, not uninterrupted road travel.

| Engine / cell | Target wall duration | Step p95 / p99 (ms) | Frame work p95 (ms) | RAF p95 / p99 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Chrome / Cambridge | 60 s | 0.20 / 0.20 | 0.50 | 16.80 / 17.10 |
| Chrome / Chicago | 60 s | 0.20 / 0.20 | 0.50 | 16.80 / 16.90 |
| Chrome / Lucca | 120 s | 0.20 / 0.20 | 0.50 | 16.80 / 16.90 |
| Chrome / Trafalgar | 120 s | 0.20 / 0.20 | 0.40 | 16.80 / 16.90 |
| Firefox / Cambridge | 60 s | 1.00 / 1.00 | 1.00 | 17.08 / 17.14 |
| Firefox / Chicago | 60 s | 1.00 / 1.00 | 1.00 | 17.08 / 17.18 |
| Firefox / Lucca | 120 s | 1.00 / 1.00 | 2.00 | 17.22 / 17.48 |
| Firefox / Trafalgar | 120 s | 1.00 / 1.00 | 1.00 | 17.10 / 17.26 |

All eight accepted rows have complete interval coverage, no protocol violations, no unexpected recovery, one live scene, and pass the unchanged dropped-time limit. Firefox's millisecond timer granularity limits interpretation of its very short CPU durations. Frame work excludes asynchronous GPU completion. Tower Bridge retains its original cold/normal-motion/functional role; it is not silently given a new sustained duration.

Chrome Cambridge is the accepted first row of `chrome-performance-01`; the later Chicago row in that file is invalid. Valid Chicago/Lucca/Trafalgar results come from their individually named `chrome-coordinated-*` records after the user confirmed the desktop would remain available. Firefox's four accepted rows are in `firefox-performance-01`. These are separate runs, not a pooled distribution or an erased retry history.

Both displayed browsers complete **20 alternating Lucca/Trafalgar loads, 60 resets, three guarded drive intervals per load and at least 135 fixed steps per load**. Every reset is paused and neutral. Active counts stay at one canvas/body/controller, seven colliders, 20 geometries, zero textures and four programs. Back restoration reloads to a zero-step, zero-reset neutral inspection state. Same-document disposal and late initialization retain their existing unit/browser-test scope; these navigation cycles do not replace those tests.

## Retained interruptions and diagnosis

`chrome-lifecycle-01` is **incomplete** in its first load. Its external 12-second progress deadline fired with physics at 25 steps, still in driving/running state. The independent RAF observer stopped at 39 callbacks, last delivered at page time 1847.3 ms; page timers continued to 13417.8 ms. The final page reported visible/focused, with no error or recovery. This reproduces the earlier scheduling symptom and does not establish an application-loop-only defect. Actual desktop visibility had not been confirmed for this attempt.

Six subsequent 15-second diagnostic observations—minimal no-app/no-WebGL page and Lucca app, each under default, explicit X11 and explicit Wayland Chrome—complete. Timers and RAF continue, with maximum sampled RAF age below 18 ms. This non-reproduction does **not** identify a backend cause, prove the prior window was occluded, or fix the historical observation. No compositor/user preference or application scheduling workaround was applied.

`chrome-performance-01` passes Cambridge, then rejects Chicago after about 40.22 seconds of measured wall time. A real window blur at page time 41982.3 ms causes a neutral application pause; focus returns around 42925.4 ms and the application remains paused. The guard retains the violation. Numeric percentiles pass for the partial data, but the run is **invalid**, not a performance acceptance pass. This is distinct from the RAF stall.

After explicit user coordination, Chrome completes Chicago, Lucca, Trafalgar and all displayed lifecycle cycles. This closes the missing valid-run evidence for those named sessions. It does not explain every historical interruption, establish reliability on untested desktop conditions, or demonstrate a runtime fix. The RAF cause/disposition remains an explicit acceptance decision.

## Memory evidence and its limits

Displayed Chrome's completed lifecycle passes the original JS budget: cycle 5 **37,737,174 bytes**, cycle 20 **47,866,988 bytes**, growth **10,129,814 bytes**, below **20,971,520 bytes**. Every heap sample is below 256 MiB. The separate headless observation also completes 20 cycles and passes those JS limits; its scope is recorded separately and is not displayed-device acceptance. Firefox has no reliable post-GC JS heap API here, so that metric remains **unmeasured**.

The supplementary method was recorded before capture: browser-tree PSS/RSS/private/SwapPss from Linux, plus separate NVIDIA driver process GPU allocation. It includes resident native/WASM mappings and browser infrastructure, cannot isolate every allocation owner, and is non-atomic. PSS and GPU numbers must not be summed into a claimed disjoint total. No new total-memory numeric budget is inferred after measurement; the original JS growth budget is not applied to a different metric.

Firefox has 20 complete process snapshots. PSS is **917,735,424 bytes** at cycle 5 and **962,051,072** at cycle 20; driver GPU allocation is **264,241,152** and **260,046,848** bytes respectively. Those endpoints are different cells. Same-cell observations, per-process readings and all intermediate samples are retained for review. These numbers are observations, not a declared total-memory pass or a leak diagnosis.

The first coordinated Chrome run has 19 complete PSS snapshots. At cycle 20 a child exits during enumeration, producing retained `ENOENT`; total PSS is **unmeasured** for that sample rather than silently undercounted. GPU allocations and post-GC JS measurements remain separately available. `9b47e71` adds at most three whole-tree attempts, preserves failures and selects the first complete snapshot, never a lower value. Its original incomplete result stays unchanged. A separate repeat requires desktop coordination and cannot retroactively repair that original record.

The memory gate still requires complete observations or an explicitly accepted measurement method. This task does not restart the allocation/GC investigation deferred to issue #1, nor invent a post-measurement threshold to close the gate.

## Verification and handoff

`npm run verify` passes the five-cell offline corpus, **269 tests across 26 files**, **12 protocol/support tests**, Svelte/TypeScript with **zero errors/warnings**, and production build. Subsequent memory-retry-only changes pass all **15 focused protocol/support tests**, including an exited child, bounded repeated failure and unsupported platform. Four real Chromium miniature-DOM foreground-guard checks also pass. These guard fixtures are not application performance runs. Vite's existing large-chunk warning remains.

All runtime/prepared/compiler/lockfile paths and original Phase 04/benchmark evidence remain byte-identical to `179814c`. The saved-trace parser and its 1-microsecond final-span bound are unchanged. New evidence supports the declared Linux sessions; a broader device, Safari, iPad, arbitrary-map or legal-route claim does not follow.

**Recommendation:** accept the new Linux cold, functional, sustained and completed lifecycle evidence for independent champion review, while keeping full Phase 04 / Stage 03 acceptance open for the RAF-stall disposition and complete-memory/method gate. macOS Edge and iPad checks remain explicitly deferred; Safari is removed. Hand off to Project Champion — Old England Taxi for review and incorporation into its existing companion. No competing companion is created.
