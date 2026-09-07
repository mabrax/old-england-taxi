# 04 — Zone Selection and Continuity

## Goal

Build map-based area selection and adjacent-zone continuity on the completed generation engine and qualified [Driveability](./driveability/README.md).

## Completed foundation

Coordinate/dimension generation, source acquisition, prepared catalogue, artifact loading/error states, and multi-cell compiler qualification moved into [Stage 02](./parameterized-zone-generation/README.md).

The subsequent [local on-demand extension](./on-demand-generation.md) delivered browser place-name search and coordinate entry, a bounded localhost request service and separate worker, progress/cancellation/reconnection, and selection of prepared or generated zones. Complete generated artifacts persist in a capped local cache and identical requests reuse verified immutable snapshots. These capabilities are no longer future Stage 04 work. Static hosting can serve prepared files but cannot run that generation service.

## Remaining scope

- Add a map-based area selector and refine selection/loading behavior over the existing coordinate, place-search, and catalogue contracts.
- Define richer cache behavior beyond current immutable reuse and capacity limits: user-visible storage management, explicit refresh/version policy, and eviction or prefetch where justified. Do not describe these as the first cache implementation.
- Qualify adjacent cells and choose continuity/stitching policy before claiming cross-boundary driving. Resolve local origins, clipped roads, full boundary buildings and graph segments, duplicate/missing source coverage, and physics/camera handover with Driveability's temporary cell limit. Same-cell reset or independent zone navigation does not establish continuity.

## Separate architectural decision

Hosted multi-user generation would require service placement, provider/quota policy, shared storage/cache ownership, resource limits, and deployment decisions. Existing local on-demand generation does not supply that hosted architecture. Hosting is not required for this stage's prepared/local adjacent-cell exit; discuss and scope it separately if requested.

## Exit condition

Different zones can be selected and loaded with clear cache/loading/failure behavior, and a qualified adjacent pair can be driven across its shared boundary under the agreed continuity policy without zone-specific code. Record physical handover and source-coverage limits; do not infer legal-route connectivity from the undirected graph.
