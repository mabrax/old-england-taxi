# Desktop driving benchmark

## Goal and authorization

The user approved implementation on 2026-09-08 after discussing a repeatable taxi drive on one downloaded map, scripted controls through real physics, and Chrome trace inspection after capture. This work extends reviewed Driveability `e9743e0`; it does not replace its historical qualification results.

Desktop web driving is the current priority. iPad Safari interaction/performance/accessibility acceptance is explicitly **deferred, not passed**. Existing touch behavior remains. Chrome is the first benchmark capture target; the complete desktop browser/OS support matrix remains to be agreed, including the existing desktop Safari gate.

## Bounded implementation

1. Bake one versioned Chicago road-loop fixture offline from the existing artifact. Record its hash, route, validated starting pose, vehicle settings, fixed-step control tape and trajectory checkpoints. Validate the physical drive against the baked geometry before freezing it; graph connectivity alone is not clearance proof. Fixture generation never runs during measurement or enters the compiler/runtime artifact contract.
2. Add an opt-in benchmark driver that submits the tape before each normal 1/60 s physics step. Retain normal collision, suspension, chase camera, rendering, bounded catch-up and pause/recovery behavior. Use a validated, explicitly labelled fixture start; ordinary driving keeps its generic spawn. No pose animation during the drive.
3. Run a fixed 120 simulation-second workload after a fixed 5 simulation-second settling warm-up, with a bounded external wall-clock deadline. Validate checkpoint position/orientation/speed and zero unexpected resets/recoveries. Keep elapsed wall time, dropped simulation time and foreground validity separate from performance budgets.
4. Provide lightweight measurement and Chrome trace modes over the identical fixture, plus a sampling-disabled control for overhead comparisons. No screenshots, filmstrip, video or forced GC during the workload. Save bounded raw evidence and the trace locally, including failures. Inspect and take screenshots afterward.
5. Verify route baking/replay, cadence independence, interruption/failure handling, opt-in isolation, the production browser flow, offline corpus, tests, static checks and build. Use an isolated preview/cache. Displayed runs require coordinated foreground ownership; headless evidence remains labelled as such.

## Success and exit

The fixture rebuilds reproducibly; the taxi follows it using the real game loop without keyboard automation or mid-run resets; identical scenario identities make results comparable; interrupted/divergent/incomplete runs cannot pass; exported Chrome traces contain the existing step/frame measures and benchmark phase markers. Existing interaction and protected compiler/artifact behavior remains verified. Record instrumentation overhead and any unavailable displayed evidence. No relaxation of the existing desktop budgets, closure of old sustained/lifecycle gates, canonical merge, push or deployment is part of this work.

## Frozen scenario

`chicago-loop-v1` uses the existing Chicago artifact (`4a9037e4…`), a 413.57 m road loop and an explicitly validated secondary-road fixture start. Its 7,200 measured steps travel 419.27 m (slightly over one lap). The 300-step neutral warm-up is excluded from frame/step/RAF percentiles. Every baked measured step has full pavement coverage, four supported wheels, clear building/boundary bounds and no recovery. Commands are baked using an offline look-ahead controller; runtime replays the tape, without running that controller or searching a route.

The tape is SHA-256 pinned in `src/lib/benchmark/load-fixture.ts`. Checkpoints every 60 simulation steps use position ≤0.3 m, orientation ≤0.05 rad and speed ≤0.05 m/s tolerances. These are workload-validity tolerances, not relaxed collision tolerances. Offline clearance has 0.05 m margin and 0.5 m boundary margin. The workload uses normal 1/60 s physics, maximum five catch-up steps, vehicle settings and chase camera. It does not certify routes, street legality or the full map.

## Usage

From an isolated checkout, install the existing locked dependencies and build the production app. Run a preview on an unused port (this task uses 4193). The browser runner uses the same external Puppeteer 25 installation convention as Phase 04; no telemetry SDK or external exporter is installed.

```sh
npm ci
npm run verify
npm run preview -- --host 127.0.0.1 --port 4193 --strictPort
```

In another terminal, set `PUPPETEER_MODULE` to the absolute Puppeteer module file and `BROWSER_PATH` to the Chrome executable. Each run requires a **new** output directory under an existing parent. Run modes sequentially, with the same declared background workload and no other benchmark/test/build work running.

```sh
mkdir -p .zone-cache/desktop-benchmark
export PUPPETEER_MODULE=/absolute/path/to/puppeteer/lib/puppeteer/puppeteer.js
export BROWSER_PATH=/usr/bin/google-chrome
export BENCHMARK_WORKLOAD='Describe host workload and power/display conditions'
npm run benchmark:run -- off http://127.0.0.1:4193 .zone-cache/desktop-benchmark/off-01
npm run benchmark:run -- measure http://127.0.0.1:4193 .zone-cache/desktop-benchmark/measure-01
npm run benchmark:run -- trace http://127.0.0.1:4193 .zone-cache/desktop-benchmark/trace-01
npm run benchmark:compare -- .zone-cache/desktop-benchmark/off-01/results.json .zone-cache/desktop-benchmark/measure-01/results.json .zone-cache/desktop-benchmark/trace-01/results.json
```

Default runs are **headless**, appropriate for harness verification but not displayed desktop acceptance. Set `HEADED=1` for an explicitly coordinated foreground session. Launch uses the normal Chrome sandbox; `CHROME_NO_SANDBOX=1` is an explicit environment escape hatch only for isolated test environments that cannot launch it. No keyboard or mouse commands drive the taxi. The runner starts the exposed one-shot benchmark control before warm-up, then awaits completion without page polling during the drive. Its 180 s deadline runs outside the page; a stopped RAF cannot disable that deadline.

A manual benchmark page uses the Chicago zone ID with `benchmark=chicago-loop-v1&qualify=1`. The **Start benchmark** button requires a fresh ready 1440×900 / DPR 1 page, no QA/collision overlays, and foreground focus. Raw physics/control handles are not exposed. User input, focus/visibility loss, viewport changes, pause/reset/recovery or trajectory divergence invalidate a run; reload for another attempt. Ordinary driving has no benchmark global and retains its generic spawn and controls.

## Results and interpretation

`results.json` records identities, served-build verification, Chrome/OS/CPU/renderer, viewport, declared workload/load, trajectory checks, full foreground guard, timing summaries and separate workload-validity/numeric outcomes. `samples.json` retains bounded, timestamped step/frame/RAF records and lifecycle events on the page's monotonic clock. `off` disables those performance samples but retains identical replay validation/foreground checks and Chrome counters; it is the control for added sampling overhead. Chrome TaskDuration comparisons cover warm-up plus the route, while page percentiles cover complete measured-interval samples. A single paired observation is noisy; repeat and interleave modes before claiming a general overhead number.

Trace mode additionally writes `trace.json` with script, rendering, compositor/GPU, User Timing and CPU profile categories. It uses a 128 MiB browser buffer and a 512 MiB export bound; data loss or export failure invalidates the capture. No screenshot category, filmstrip, video, forced GC, live trace viewer or external upload is used. Open the saved trace in Chrome DevTools **Performance → Load profile** afterward, then zoom to `benchmark:measure-start` / `benchmark:measure-end` and the `driveability:step` / `driveability:frame` tracks. Screenshots of that saved view are taken after capture.

Measurement mode compares the existing fixed desktop frame/physics/RAF/dropped-time budgets. Off mode leaves numeric budgets unmeasured. A process exits nonzero for an invalid workload or a measured numeric failure, while retaining evidence. Neither this single route nor headless runs close the historical five-cell, displayed Chromium lifecycle, desktop Safari or complete-memory gates. Trace and untraced values are labelled separately.

## Rebuilding and checking the fixture

```sh
npm run benchmark:bake -- .zone-cache/desktop-benchmark/rebaked.json
cmp public/benchmarks/chicago-loop-v1.json .zone-cache/desktop-benchmark/rebaked.json
node tools/physics/benchmark/verify-browser.mjs http://127.0.0.1:4193 .zone-cache/desktop-benchmark/functional-01
```

The baker is offline and separate from `npm run build`. Changing geometry, vehicle settings or the tape requires explicit fixture versioning and new comparisons; never silently regenerate the existing baseline to accept a changed trajectory.
