# Benchmark implementation verification — 2026-09-08

The repeatable Chicago drive is implemented, and the coordinated displayed Chrome run completed with valid trajectory/foreground evidence and all four numeric budgets met. Its saved trace was inspected afterward in Perfetto. This establishes the reusable benchmark and one device observation; historical Driveability qualification remains open.

## Identity and reproducibility

- Branch: `codex/desktop-driving-benchmark`, based on reviewed `e9743e072a974094ad49038628d1310760037bf9`.
- Displayed capture: application/runner commit `b84b110`; initial offline reanalysis parser `945aeae`. Full original identities, hashes and outcomes are in [results-summary.json](results-summary.json); the bounded review correction is recorded separately in [parser-review.json](parser-review.json).
- Fixture: `chicago-loop-v1`, SHA-256 `39cf65e554fccd7bdcc9fa721a4e020fe61025e7cc68926163b92a84511ea79b`.
- Map SHA-256: `4a9037e4db68a6cd55cd3db90a0aa50988b550ca1f3cd7d68125d4a35f6473b6`. Prepared map/compiler bytes and dependency lock are unchanged.
- Production assets: `index-DevJONO8.js`, `vehicle-BLw_iexE.js`, `load-fixture-6987g8ig.js`, `index-CdNYqW5q.css`; served bytes matched local build hashes before starting.
- Offline rebake matched the fixture byte for byte. Real-physics replay at 30, 60 and 144 Hz rendered cadence produced identical final positions and all 125 checkpoints.

## Displayed Chrome observation

`headed-trace-02` used Chrome 152.0.7977.82 on Linux, Ryzen 7 5700X3D and NVIDIA GeForce RTX 4070 Ti SUPER through ANGLE/OpenGL ES. The page was 1440×900 at nominal DPR 1. Chrome reported DPR `1.0000000298023224`; preflight permits representation error up to 0.000001, while meaningful scale and all CSS-size changes remain invalid. The host had ordinary background processes; it was not certified idle.

The fixed tape completed 300 warm-up plus 7,200 measured physics steps. All 125 checkpoints matched exactly in position and speed; maximum orientation error was 0.000000060 rad. There were zero resets, recoveries, foreground violations, errors or dropped simulation milliseconds. The foreground protocol covered 124,990.6 ms including warm-up; the measured wall interval was 119,973.1 ms for 120 simulation seconds. This is not relabelled as the historical 120-wall-second qualification case.

| Measured metric | Observed | Fixed budget | Result |
| --- | ---: | ---: | --- |
| Physics step p95 / p99 | 0.20 / 0.30 ms | 2 / 4 ms | Pass |
| Frame work p95 | 0.60 ms | 16.7 ms | Pass |
| RAF interval p95 / p99 | 16.8 / 16.8 ms | 33.4 / 50 ms | Pass |
| Dropped simulation time | 0 ms | ≤1% | Pass |

Frame work measures synchronous game update/render submission; it is not GPU completion time. RAF intervals supply a separate cadence observation. Step/frame/RAF percentiles exclude warm-up. Dropped time is conservatively taken from the whole replay and divided by the measured wall interval.

Resource ownership at completion was one canvas, one body, one vehicle controller, seven colliders, 20 geometries, zero textures and four shader programs. These counts do not establish a complete memory or lifecycle plateau.

## Saved trace and visual inspection

The Chrome JSON trace is 346,196,745 bytes, SHA-256 `08d415d54d72603fad5490910a9eccb768eb60d54b6ee03891d69bd26dbb4098`. Chrome reported no data loss. The completed file contains 1,479,473 events, all 7,200 measured step records, 7,196 frame records whose starts fall within the trace markers, and zero screenshot events. The page observer retained 7,195 complete measured frame samples; timestamp precision and the first partial frame account for boundary-count differences.

The initial offline reanalysis matches zero-duration instant measures, reused async IDs, the frame crossing the warm-up boundary, and rounded frame endpoints crossing the completion marker. The final frame end is one microsecond after the marker in Chrome JSON. Original run results are immutable: they retain the earlier parser's `validWorkload: false`. A separate `reanalysis.json`, including original-results and analyzer hashes, records that successful validation of the saved trace. Replay, foreground and numeric outcomes in the original report already passed; only offline trace interpretation changed. The subsequent review correction below bounds that rounding allowance.

[Timeline overview](trace-overview.png) and [final physics step](trace-final-step.png) were captured from the loaded saved trace, after the workload and export. The renderer, compositor and CPU-profile tracks cover the whole drive; search finds all 7,500 warm-up plus measured step records. The final selected step is 201 microseconds in Chrome’s trace clock. No screenshot, filmstrip, video, forced GC or live viewer was used during measurement. Perfetto opened the local file in browser memory; no trace-sharing upload was requested. The same raw JSON can be loaded into Chrome DevTools Performance.

The trace checker found no ≥50 ms main-thread tasks matching its limited RunTask selectors in the measured interval. This is a scoped observation, not proof that every category of stall is absent. Numeric frame/cadence checks and the complete trajectory are stronger evidence for this run's behavior.

## Bounded parser review correction

Champion review found that the initial parser paired measured spans with ends arbitrarily far after completion. A synthetic frame ending one second after the completion marker incorrectly validated. The corrected analyzer allows at most **1 microsecond** past `benchmark:measure-end` for a span that began within the measured interval. This explicit parsing tolerance covers the actual saved final-frame discrepancy; it does not extend the workload or any performance budget. Frames beginning after measurement remain outside its scope.

Focused offline regression tests reproduced four failures before the fix: step and frame ends at +2 microseconds and +1 second were accepted. After the fix, all **14 parser tests pass**, including step/frame ends at +0 and +1 microsecond, rejection at +2 microseconds and +1 second, exclusion of later frames, and the existing missing-end, identifier-reuse, warm-up-boundary and screenshot checks. This review ran the focused suite and offline reanalysis only; it did not repeat a browser/benchmark run or the already-passed full application verification.

The corrected analyzer SHA-256 is `c76196051f02768b392467cc3f46b6d08827577923fe01f5bdb39302a3feb948`. [parser-review.json](parser-review.json) retains its separately identified results and the hashes of original trace, results, samples and reanalysis files. Those original files were read without modification, matched the committed evidence where original hashes were available, and had identical hashes before/after review. The original checked-in `results-summary.json` is also unchanged. New local logs and reanalysis are under `.zone-cache/desktop-benchmark/parser-review-01/`.

The displayed trace still validates **7,200 measured steps and 7,196 frames**, with exactly one measured-span end past completion: the final frame at **+1 microsecond**. Headless `trace-03` also still validates 7,200 steps and 4,102 frames, with no measured-span end past completion. A later headless frame begins outside measurement and remains excluded. Neither trace's prior timing, foreground or numeric results changed; the headless numeric failure remains failed. Original captures and both earlier `reanalysis.json` files remain immutable.

## Other evidence and limitations

The sampling-disabled and measured headless pair (`off-02`, `measure-02`, commit `d1db261`) both completed valid workloads on SwiftShader. Measurement recorded step p95 0.20 ms, frame p95 0.70 ms, RAF p95 `33.40000000000873` ms and p99 50 ms. The exact unchanged RAF p95 comparison failed; that failure is preserved. Headless SwiftShader and displayed NVIDIA results must not be pooled.

The pair's Chrome TaskDuration counter difference was −11.934 ms over roughly 125 seconds. These are noisy aggregate counter observations, not an estimate of CPU cost or proof of zero instrumentation overhead. The comparison tool checks identities and refuses incompatible runs. General overhead estimation still requires repeated interleaved off/measure/trace runs on the same build, recorder and device. Later trace-recorder/parser and preflight changes make this earlier pair unsuitable for a direct three-mode comparison with the displayed run.

All attempts remain in `.zone-cache/desktop-benchmark/`: initial capture attempts retained trace-flush failures; a final-frame pause race was corrected and regression-tested; `trace-03` exported a complete headless trace subsequently validated by the corrected parser; `headed-trace-01` was rejected before step zero by exact DPR equality. No failed result was discarded or turned into a numeric pass.

The original implementation verification passed offline corpus verification, Svelte/TypeScript checks with zero errors/warnings, production build and seven browser checks covering real hidden-tab interruption, input, resize, repeated start/focus loss, ordinary-mode isolation, QA rejection and tampered fixture rejection. That test suite passed 261 application tests across 26 files plus all eight foreground-protocol tests. It includes physics cadence replay, unsafe starts, dropped-time behavior and saved-trace truncation/format regressions. Logs and raw browser evidence remain in the cache. Vite's pre-existing large-chunk warning remains.

The full desktop browser/OS matrix, historical five-cell sustained checks, displayed Chromium lifecycle, desktop Safari and complete-memory gates remain open. iPad Safari interaction/performance/accessibility acceptance is deferred, not passed; touch behavior is retained. No merge, push or deployment was performed. The canonical preview and reviewed evidence worktree were not changed.
