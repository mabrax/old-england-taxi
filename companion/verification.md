# Companion verification — 8 September 2026

The standalone `index.html` was opened directly from disk in Chromium. No external resource requests or browser console errors were observed.

- All seven stages select the matching panel, with exactly one active stage and four delivery/review/acceptance/integration values.
- The next-conversation card selects Stage 04 and moves keyboard focus to its heading. Milestone navigation selects its associated stage.
- Phase, gate and decision disclosures open and close. Benchmark work is marked as an extension.
- The sources dialog opens, copies a source path and closes with Escape.
- Desktop (1440 px), companion panel (720 px) and narrow (390 px) layouts were inspected visually. Every stage was checked at 390 px with no horizontal page overflow.
- All ten unique plan/evidence paths existed in the reviewed worktree when checked. Inline JavaScript syntax, deterministic output freshness and whitespace checks passed.
- A separate UX review checked the glance view and disclosure affordances; its two findings were corrected before delivery.

This verifies the companion artifact. It adds no simulator acceptance evidence or cross-browser qualification claim. Project facts are a dated snapshot of the reviewed plans and handoffs, with canonical integration tracked separately.

After the Linux qualification handoff, the companion was checked again at 1440 px and 720 px. The snapshot date stays visible in the narrow header, the next-decision card selects Driveability, the sources dialog resolves the absolute champion-review path, all 12 unique source references exist, and no horizontal overflow or browser error was observed. The independent simulator evidence review is recorded separately in `reviews/2026-09-08-linux-qualification.md`.

## Follow-up deferral update — 9 September 2026

The companion now records the user's deferral of the Chrome frame stall to issue #2 alongside process-memory growth/GC in issue #1. Both open issue bodies were read back and verified. The qualification plans record the decision at `9506cb1`; implementation/evidence review remains through `700cdfd`. Original evidence and runtime/tooling files are unchanged.

The rebuilt page was inspected at 1440 px and 720 px with no horizontal overflow or browser errors. The next-conversation card selects Stage 04 and focuses its heading; the stall decision expands to the correct issue link. The sources dialog opens to the current disposition, closes with Escape, and all 13 unique local source references resolve. Build freshness and whitespace checks pass. Deferred checks and pending integration remain distinct from implemented/reviewed work.
