# Phase 03 — Driving interaction

**Status: implementation complete, verified in the available environment, and independently reviewed (2026-09-07); full device exit remains open.** The user said “Proceed with phase three”; this includes reasonable decisions within this phase and does not require another implementation approval. Work starts from reviewed local `0e60304` on isolated `codex/driveability-driving-interaction` in worktree `9db0`. Phase 04 remains unstarted.

## Goal

Make the vehicle understandable and controllable in desktop and iPad browsers while retaining zone inspection. The application is web-only; tablet support means using the web app in a browser.

## Deliverable

Keyboard and touch controls feeding the Phase 02 input contract, a chase camera, and clear driving/paused/unavailable/reset feedback integrated with the existing Svelte viewport.

## Success criteria

- Both input methods support simultaneous steering and acceleration/braking, an agreed brake-to-reverse interaction, and an accessible vehicle reset. Releasing/cancelling a pointer, losing capture/focus, switching modes, or hiding the page clears input and pauses as appropriate.
- Search fields, coordinate entry, selectors, and other UI controls never steer or accelerate the vehicle while focused. Touch controls fit the agreed small-screen and iPad browser layouts and orientations without unwanted page scroll or interference with overlays or browser controls. Record the browser/device targets and distinguish viewport emulation from checks on an actual iPad.
- Driving starts explicitly only after world and spawn readiness. Inspection pauses the vehicle and retains orbit/QA; chase and orbit do not compete for input. Hiding generated geometry for inspection cannot enable invisible-obstacle driving.
- The chase camera follows turns, braking, reverse, and reset with a clear view of the vehicle and nearby road. Near-wall and ground-occlusion cases have tested behavior; camera reset and vehicle reset remain separate actions.
- Pause/resume neither applies stale throttle nor catches up hidden-tab time. Recovery feedback distinguishes ordinary off-road movement, a manually reset stuck/overturned vehicle, an automatic invalid-state recovery, and a cell with no safe spawn.
- Existing catalogue, place/coordinate generation, cancellation/reconnection, failure feedback, attribution, and QA remain usable. Starting an asynchronous build or editing location controls pauses driving; build failure preserves the loaded cell. Successful navigation disposes the old simulation and opens the new cell with neutral input in inspection/paused state.

## Exit condition

A user can enter driving, steer a representative street area, stop/reverse, leave and return to pavement, recover, inspect, and change cells in the agreed desktop and iPad browsers without stuck inputs, competing cameras, or hidden simulation activity.

## Out of scope

Native apps, map-based selection, seamless zone handover, cache-management features, route guidance, scoring/training UI, gamepad support, and detailed vehicle art.

## Dependency and planning agreement

Depends on the independently reviewed [First vehicle](./phase-02-first-vehicle.md) exit. The authorized implementation plan follows. Use focused interaction/camera checks here; [Phase 04](./phase-04-qualification.md) verifies the integrated session and records acceptance evidence.

## Implementation plan (2026-09-07)

1. Keep one scene-owned world/vehicle/RAF and the existing 60 Hz bounded fixed-step session. Add explicit inspection, driving and paused interaction states, separate from artifact/physics readiness. New cells open in inspection; Drive/Resume is explicit and requires a safe vehicle, visible generated geometry, focused/visible page and no pending generation. Automatic recovery pauses with feedback.
2. Add keyboard (WASD/arrows, Space brake, Escape pause) and independent captured pointer controls through the existing normalized command contract. S/down or Brake / reverse applies opposing throttle: it brakes to rest, then continues in reverse while held. Space or Stop brakes without reversing. Opposed pedals brake; opposed steering cancels. Retain simultaneous pedal/steering input. Keyboard input is accepted only while the canvas has focus; UI focus, editing, pointer cancellation/capture loss, blur, visibility and orientation changes clear controls and pause. Repeat key events cannot revive held input after reset/resume.
3. Keep the controls in a compact viewport panel with two thumb groups, visible pressed states, speed/direction and explicit reset/pause feedback. Keep inspection and generation accessible through a workspace toggle on narrow screens; opening it pauses. Use safe-area padding, dynamic viewport height and no touch scrolling on driving pads; support both portrait and landscape without forcing browser orientation or fullscreen.
4. Give the chase camera exclusive ownership in driving/paused mode; orbit owns inspection only. Follow the interpolated upright heading with bounded time-based smoothing and a stable rear view in reverse (no sudden side swap). Sweep a camera clearance volume against static physical geometry, including ground and walls, retract immediately and ease outward. Reset snaps camera smoothing independently of vehicle reset; vehicle reset snaps both and leaves driving paused. Test close walls, corners, ground, reverse, reset and ownership.
5. Propagate generation busy state including submission, cancellation and reconnection. Any pending build prevents driving; failure retains the loaded world and allows explicit resume, while success navigates and disposes the old scene. Preserve loader/QA/report/attribution/catalogue and compiler boundaries. No prepared artifact, report, QA, catalogue, schema, acquisition or compiler change.
6. Intended browser targets: current stable desktop Chromium, Firefox and Safari, and Safari on representative iPadOS iPads, portrait and landscape. Available Linux Chromium desktop and tablet/touch emulation are implementation evidence only. Record actual versions/hardware used, and explicitly leave unperformed iPad/other-engine checks and performance acceptance open; do not claim the full device exit condition from emulation. No native app or Phase 04 qualification.
7. Run focused keyboard/pointer/state/camera/lifecycle tests, existing offline corpus/full suite/static/build and rendered browser regressions on isolated port 4188 with this worktree's cache. Record evidence and limitations in a linked verification record, commit, and send the report to the champion for independent review. Do not touch canonical main, preview 4175 or its cache; do not push, merge or deploy.

## Implementation outcome and evidence boundary

[Verification and limitations](./phase-03-verification.md) records the delivered input, interaction, camera and generation-lifecycle changes and links reproducible browser evidence. The complete device-level exit condition above is **not yet established**: actual iPad Safari, desktop Firefox/Safari and device performance have not been measured here. Independent review found no blocking implementation issues within the available evidence; Phase 04 has not begun.
