# Rollout Plans

Each top-level document defines one bounded stage. Stages that benefit from incremental delivery keep their phase briefs in a slugged subfolder. Detailed implementation tasks are created only when a phase begins.

1. [00 — Project setup](./00-project-setup.md)
2. [01 — Zone compiler](./zone-compiler/README.md)
3. [02 — Driveability](./02-driveability.md)
4. [03 — Zone generalization](./03-zone-generalization.md)
5. [04 — Geographic fidelity](./04-geographic-fidelity.md)
6. [05 — Training experience](./05-training-experience.md)

Stages are tackled in order. A stage starts only after the previous exit condition is met, and its phases are tackled in order unless the stage brief explicitly says otherwise.
