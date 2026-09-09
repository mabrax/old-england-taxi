# Champion companion

Open `index.html` in a browser. It is a self-contained, offline page: no build server, external fonts, analytics or network data are needed. The stage selector, phase details, open gates, decisions and source-path dialog work from the saved file.

This is a curated companion to the champion conversation, not a second planning system. The canonical plans and reviewed evidence remain the source of truth. A passing benchmark is not stage acceptance; reviewed work is not automatically integrated.

## Maintain after a meaningful sync

The owning champion updates this page after stage changes, reviewed handoffs, scope/deferral decisions or integration. Focused tasks return their handoff to the champion rather than editing this snapshot independently.

1. Verify current plans, reviewed commit and canonical main. Update `project.json`: the honest sync date, current/next stage, concise outcomes, open gates, decisions, milestones and provenance. Keep acceptance, review and integration separate. Do not use a percentage as a proxy for progress.
2. Run `node companion/build.mjs`, then `node companion/build.mjs --check`. This updates the single-file `index.html` deterministically. Change `template.html` only when the visual structure needs to evolve.
3. Check the glance view and selected-stage details when content length or layout changes. Verify the page also works in a narrow companion panel. Keep the first view concise; put explanations and source paths in disclosures.
4. Commit the source data and rebuilt page together on the authorized work branch. Reopen or reload the companion in the champion task. No background polling or deployment is implied.

`sourceRoot` identifies the reviewed worktree holding the plans. Update it when work is integrated or moved; the UI displays copyable absolute source paths instead of inventing remote links to unpublished commits. The snapshot remains readable if those local files later move, but the references need updating.

## Optional local preview

From the repository root: `python3 -m http.server 4196 --bind 127.0.0.1 --directory companion`. Open `http://127.0.0.1:4196/`. Use a different free port if this one is occupied. The simulator and its generation service are independent.
