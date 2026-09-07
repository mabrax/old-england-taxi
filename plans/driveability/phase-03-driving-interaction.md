# Phase 03 — Driving interaction

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

Depends on the verified [First vehicle](./phase-02-first-vehicle.md) exit. Discuss and detail this phase's implementation plan with the user when ready under the [stage working agreement](./README.md#working-agreement). Use focused interaction/camera checks here; [Phase 04](./phase-04-qualification.md) verifies the integrated session and records acceptance evidence.
