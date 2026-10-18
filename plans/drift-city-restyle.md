# Drift City visual restyle

On 2026-10-17 the user asked for the simulator's graphics to be changed immediately to resemble *Drift City*, a cel-shaded online racing game built on Gamebryo. The request was outside the stage order. The user explicitly directed the implementation, its commit, the merge into main and this record. The restyle was delivered in `014fbd9` and integrated in canonical main at `afd91ce`. It has not been independently reviewed or accepted.

## Delivered

- Banded toon lighting from one shared sun direction. A gradient sky with a sun glow is drawn at the far plane. Haze fades the far view while driving; during inspection only the far edge of the overview fades.
- Building faces use a facade shader. It draws a window grid on walls of at least 3 m height and 1.8 m length, adds darker shopfronts on the ground floor of buildings at least 6 m tall, and colours connected walls and roofs with one palette colour. Window detail blends to an average tone at distance. Building creases get ink outlines.
- Road surfaces use asphalt and pale painted curb strips taken from the road mesh boundary. Centre lines come from the street graph: double yellow on wide motorway, trunk, primary and secondary roads, dashed white elsewhere. Service roads and living streets are unmarked. Lines are trimmed at junctions and clipped to the zone bounds.
- The pavement-coloured ground extends past the zone and dissolves into the fog colour, which hides the plane's edge. The measurement grid now appears only with source comparison.
- The taxi has a toon lower body, sloped glass cabin, roof, roof sign, lights, bumpers, side stripes, outlined wheels with hubs, and a contact shadow on the flat ground. Every chassis detail stays within the collision dimensions. Wheels remain the last children of the vehicle root.

The implementation is `src/lib/scene/drift-style.ts`, with limited edits to `validation-scene.ts` and `vehicle-view.ts`. Compiled artifacts, physics, collision, the play envelope, inputs and the chase camera are unchanged.

## Verification

- `npx vitest run tests` passed 272 tests across 27 files, including 3 new tests. They check that paint strips face upward, that walls carry a consistent frame with one visible colour per building, and that markings respect road class, junction trimming and zone clipping.
- The 15 qualification-tool tests passed, `svelte-check` reported 0 errors and 0 warnings, and the production build passed with the existing bundle-size advisory.
- Headless Chromium (`agent-browser`) at 1440×900 rendered Chicago River North and Trafalgar Square through the dev server. Checks covered the overview, inspect-vehicle, low orbit and chase view after accelerating to 26 km/h. No console errors were reported.
- Two defects were found during that check and corrected before commit. Paint strips were wound downward and back-face culled, and the extended ground showed a hard edge against the sky. Screenshots were working files and are not retained in the repository.

## Limits and open items

- The Stage 03 Linux Chrome/Firefox frame, memory and benchmark evidence (`700cdfd`, integrated at `b1a5d06`) predates this renderer. It does not describe the restyled scene. No benchmark or qualification run has measured the facade shader, outlines, paint or extra vehicle meshes. A fresh benchmark is needed before relying on frame or memory numbers. Firefox was not checked.
- The restyle does not change the Stage 03 acceptance record or its deferrals, including issues #1 and #2 and the deferred macOS Edge and iPad checks.
- Windows, shopfronts and building colours are invented decoration from existing volumes, not source data. They do not deliver Stage 05 building detail or landmarks and must not be read as recognisable features of the real place.
- Markings come from the undirected street graph. They carry no direction, lane or legal-route meaning.
- The chase camera keeps its reviewed 9 m rear and 5.5 m height framing. A lower Drift City–style camera was offered but not done; it would change tested driving behaviour.
