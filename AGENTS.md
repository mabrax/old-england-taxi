# Champion companion

The project champion maintains `companion/index.html` as the visual companion to the coordination task. After a meaningful stage transition, reviewed handoff, acceptance/integration decision, or scope change, update `companion/project.json` from the actual plans and evidence and run `node companion/build.mjs` plus `node companion/build.mjs --check`. See `companion/README.md` for the update workflow.

Keep delivered implementation, independent review, stage acceptance and canonical integration distinct. Record deferred work as deferred, never passed. The companion is a dated snapshot, not a live monitor or a replacement for `plans/`. Focused implementation tasks should send changes to the owning champion for incorporation rather than independently editing the snapshot unless explicitly assigned that work.
