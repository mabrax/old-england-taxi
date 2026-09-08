# Desktop qualification continuation — 2026-09-08

Isolated branch `codex/desktop-qualification-astra`, starting at reviewed `179814c`. Canonical main `712fe6f` and the reviewed benchmark worktree remain unchanged. No runtime, vehicle, compiler, prepared artifact or schema change is planned. The user explicitly selected **Linux Chrome, Linux Firefox, and macOS Microsoft Edge** during this task. Desktop Safari is removed from acceptance scope, superseding its historical gate. iPad acceptance remains deferred. The user has a Mac but explicitly deferred its testing and limited this task to Linux Chrome/Firefox. macOS Edge is not passed and is not a required execution step in this task.

## Protocol recorded before new acceptance runs

Run Chrome 152.0.7977.82 and Firefox 155.0 on the available Fedora 44 / Ryzen 7 5700X3D / NVIDIA RTX 4070 Ti SUPER desktop, sequentially. Use an isolated production preview on 4196, 1440×900 with nominal DPR 1, generation unavailable, and fresh browser processes/output directories. The displayed window must stay visible and focused. Record actual backend, viewport, executable arguments, served asset hashes, source commit/tool hashes, host load and declared background workload. Representation error of at most 0.000001 in nominal DPR uses the reviewed benchmark preflight convention.

Apply the original [budgets and durations](../phase-04-qualification.md#prospective-budgets-fixed-before-acceptance-runs). Three cold visits and normal keyboard maneuvers cover all five cells; Cambridge/Chicago sustain 60 seconds each and Lucca/Trafalgar 120 seconds each after settling. Tower Bridge retains its original cold/normal-motion/functional scope. Each sustained run requires the existing latched foreground observer. Keep rejected attempts and numeric failures separately.

Lifecycle remains 20 same-tab alternating Lucca/Trafalgar loads, three reset/drive operations and at least 135 active simulation steps per load. Each drive now gets the existing foreground observer, completed before its planned reset; validate paused neutral reset and active resource ownership. Record partial attempts before closing pages. A Node wall-clock deadline now bounds waits independently of RAF; passive RAF/timer counters and focus events help distinguish scheduling loss from simulation pause. No focus-recovery workaround runs inside a measured interval.

Use normal Chrome sandboxing and a 1460×1020 outer window, as in the successful benchmark. This is a named configuration change from the older runner's unsized/no-sandbox launch, not proof that either setting caused the historical stall. Record all arguments. Do not change desktop compositor settings or add throttling-disabling flags in response to a failure.

## Supplementary memory method (acceptance unresolved)

Keep the original post-GC JS-heap limit and cycle-5-to-20 growth limit. Check every sample against 256 MiB, not just the last. Firefox without reliable forced GC/heap reporting stays unmeasured for that metric.

Outside timed driving, sample the fresh browser process tree through Linux `/proc/PID/smaps_rollup`, preserving per-process PSS/RSS/private/SwapPss values and failed reads. This includes resident JS, WASM and native mappings plus apportioned shared mappings; it cannot isolate app allocations or virtual reservations. PSS semantics follow the [Linux kernel documentation](https://www.kernel.org/doc/html/latest/filesystems/proc.html).

Also retain NVIDIA driver process GPU memory for the same descendant PIDs through `nvidia-smi -q -x`; missing/unsupported values remain unmeasured. See [NVIDIA process-memory documentation](https://docs.nvidia.com/deploy/nvml-api/structnvmlProcessInfo__v1__t.html). Samples are sequential, not atomic. PSS and GPU figures can overlap and must not be summed into a claimed complete total. They include browser infrastructure and require an explicit accepted measurement method/budget before becoming total-device-memory acceptance. No new numeric total-memory threshold is invented from the results. This is bounded qualification evidence, not the deferred allocation/GC investigation in issue #1.

## Reproduction

Run `npm ci`, `npm run verify`, and `npm run preview -- --host 127.0.0.1 --port 4196 --strictPort` in this checkout. The external Puppeteer installation remains 25.10.0; no browser tooling dependency is added to the app.

Set `PUPPETEER_MODULE`, `BROWSER_PATH`, `HEADED=1` and `QUALIFICATION_WORKLOAD`. Run `node tools/physics/qualify-browser.mjs chromium http://127.0.0.1:4196 <new-output-directory>`. `FUNCTIONAL_ONLY=1`, `SUSTAINED_ZONE=<original-cell-id>` and `LIFECYCLE_ONLY=1` provide independently recorded subsets; run them sequentially. Substitute `firefox` and its executable for the second engine. Do not reuse output directories or modify original Phase 04/benchmark records.

Results and acceptance will be appended after measurement. Further hardware/browser or memory-method decisions remain explicit; no Stage 04 implementation, merge, push or deployment follows from this work.

The coordinated Chrome lifecycle completed, but its cycle-20 PSS snapshot retained an `ENOENT` after a child exited during enumeration. That original record remains incomplete for PSS. Before a separate memory repeat, the sampler now permits up to three whole-tree attempts for incomplete reads, retains every attempt, and takes the first complete sample. It never retries a high value to obtain a lower one. Unsupported platforms stay unmeasured immediately. Budgets and active driving are unchanged.

## Bounded display diagnostic amendment

The first new default-platform Chrome lifecycle attempt stopped independent RAF delivery after 39 callbacks while the 100 ms timer continued. Its 12-second external deadline retained physics at 25 steps, visible/focused/running state and no errors. It remains incomplete. Do not infer a Wayland cause solely from the host's session type.

Before further Chrome acceptance attempts, compare fresh default, explicit X11 and explicit Wayland launches with `diagnose-chrome-raf.mjs`. Each configuration gets a minimal document without app/WebGL plus a 15-second Lucca drive, with one-second timer/RAF/state observations. This diagnostic is not a sustained performance acceptance run. Chromium documents the explicit selector in its [Ozone overview](https://chromium.googlesource.com/chromium/src/+/main/docs/ozone_overview.md). If a separately named platform completes, the existing qualification runner can test it using `CHROME_OZONE_PLATFORM=x11` or `wayland`; every original budget remains unchanged. No system/browser preference is modified, and a passing alternative cannot retroactively pass the default launch or establish its root cause.

## Deferred macOS Edge handoff

When the user resumes the explicitly deferred macOS checks, use the same committed production build and prospective budgets on a representative Mac with Microsoft Edge. Record the Mac model/chip/RAM, macOS version, Edge version, display refresh rate, viewport/DPR, power state and renderer. The current runner records the actual OS instead of assuming Fedora, and explicitly leaves the Linux/NVIDIA process-memory method unmeasured on macOS.

Run the existing Chromium protocol with `BROWSER_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'`, external Puppeteer 25.10.0, `HEADED=1`, and a fresh output directory. Use a local secure loopback preview of the static build; do not expose the generation service. Run all five cold/functional cases, all four sustained durations, and the 20-cycle lifecycle/Back restoration sequence. CDP post-GC JS heap retains the original limits. A separately agreed macOS native/GPU-memory method is still required. Desktop Safari is not part of this handoff.
