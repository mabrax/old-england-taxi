# Rollout Plans

Each stage brief defines one bounded stage. Stages that benefit from incremental delivery keep their overview and phase briefs in a slugged subfolder. Each phase's implementation plan is discussed with the user and detailed only when that phase is ready to begin; writing a brief does not authorize implementation.

1. [00 — Project setup](./00-project-setup.md)
2. [01 — Zone compiler](./zone-compiler/README.md)
3. [02 — Parameterized Zone Generation](./parameterized-zone-generation/README.md)
4. [03 — Driveability](./driveability/README.md)
5. [04 — Zone selection and continuity](./03-zone-generalization.md)
6. [05 — Geographic fidelity](./04-geographic-fidelity.md)
7. [06 — Training experience](./05-training-experience.md)

Stages are tackled in order. A stage starts only after the previous exit condition is met, and its phases are tackled in order unless the stage brief explicitly says otherwise.

Existing later-stage filenames remain stable for links; their headings and ordering reflect the promoted stage. The earlier [Driveability brief](./02-driveability.md) remains a compatibility link to its stage directory.

Stages 01–02 and the user-requested [on-demand location generation extension](./on-demand-generation.md) are complete. The extension adds delivered browser place-name/coordinate input, bounded localhost generation through a separate worker, and persistent verified cache/catalogue reuse. Earlier completion records retain their original scope and verification evidence; their geocoding/on-demand exclusions describe those stages, not missing current capabilities.

Stage 03 is a planning proposal for one vehicle inside one bounded flat cell, followed by physical qualification; it has not started. Stage 04 retains map selection, richer cache policy, and adjacency/continuity. Hosted multi-user generation remains a separate decision. Physical driveability does not certify legal routes or all graph-connected streets; routing semantics and qualification remain a dependency to resolve before Stage 06 training.
