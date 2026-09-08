# Rollout Plans

Each stage brief defines one bounded stage. Stages that benefit from incremental delivery keep their overview and phase briefs in a slugged subfolder. Each phase's implementation plan is discussed with the user and detailed only when that phase is ready to begin; writing a brief does not authorize implementation.

The application runs only on the web. The user has prioritized desktop browser driving now (2026-09-08). iPad browser acceptance is deferred, not passed; existing touch behavior and historical device evidence remain. The user has selected **Linux Chrome, Linux Firefox, and macOS Microsoft Edge** as the desktop matrix. Desktop Safari is explicitly removed from acceptance scope; earlier Safari requirements are historical and superseded. The user deferred macOS Edge testing and limited this continuation to Linux Chrome/Firefox; Chrome profiling does not qualify the deferred Mac target. Native apps are outside the rollout scope. Browser/device support must be established by the relevant qualification evidence.

1. [00 — Project setup](./00-project-setup.md)
2. [01 — Zone compiler](./zone-compiler/README.md)
3. [02 — Parameterized Zone Generation](./parameterized-zone-generation/README.md)
4. [03 — Driveability](./driveability/README.md)
5. [04 — Zone selection and continuity](./03-zone-generalization.md)
6. [05 — Geographic fidelity](./04-geographic-fidelity.md)
7. [06 — Training experience](./05-training-experience.md)

Stage implementation proceeds in order, only after the previous exit condition is met; phases are tackled in order unless the stage brief explicitly says otherwise. User-requested planning discussions may happen earlier without closing those exit conditions or authorizing implementation.

Zone Compiler and Driveability keep their complete stage briefs in their subfolders. Remaining later-stage filenames stay stable for links; their headings and ordering reflect the promoted stage.

Stages 01–02 and the user-requested [on-demand location generation extension](./on-demand-generation.md) are complete. The extension adds delivered browser place-name/coordinate input, bounded localhost generation through a separate worker, and persistent verified cache/catalogue reuse. Earlier completion records retain their original scope and verification evidence; their geocoding/on-demand exclusions describe those stages, not missing current capabilities.

Stage 03 has completed its authorized Phase 01 physical world and Phase 02 first vehicle implementations. Phase 03 driving interaction is implemented and independently reviewed. Phase 04 evidence and bounded changes have also been independently reviewed; [its record](./driveability/phase-04-verification.md) preserves the historical five-cell sustained, displayed-browser lifecycle, desktop Safari and complete-memory gates. macOS Edge testing is explicitly deferred; see the [desktop continuation](./driveability/desktop-qualification/README.md). iPad acceptance is deferred by the desktop priority amendment above. The [Linux continuation](./driveability/desktop-qualification/verification.md) adds valid Chrome/Firefox sustained and displayed lifecycle evidence for review, preserving incomplete attempts and open RAF/memory decisions. Stage 03 is not complete.

The [repeatable desktop driving benchmark](./driveability/desktop-benchmark/README.md) is implemented and independently reviewed through `84cedae`. One displayed Chrome/NVIDIA run passed its workload and numeric checks; this does not close the broader qualification gates. The user has deferred further allocation/GC investigation to [issue #1 — Analyze driving-loop allocations and garbage-collection pauses](https://github.com/mabrax/old-england-taxi/issues/1), alongside next-phase planning. That investigation does not block planning and no new profiling campaign is started by this status update. The reviewed work remains on `codex/desktop-driving-benchmark`; canonical integration is pending.

Stage 04 retains map selection, richer cache policy, and adjacency/continuity. Hosted multi-user generation remains a separate decision. Physical driveability does not certify legal routes or all graph-connected streets; routing semantics and qualification remain a dependency to resolve before Stage 06 training.
