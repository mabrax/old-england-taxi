# Street rendering depth correction

On 2026-09-07, camera movement over Pelluco reproduced white gaps and broken patches across road surfaces. These changed with the camera angle even though the compiled geometry was unchanged. The problem was depth fighting between the flat ground, grid and roads: the 4 cm road lift alone was insufficient at distant views with the existing perspective depth buffer.

The ground material now uses positive polygon offset, and the road material uses negative polygon offset. This separates the layers in the depth buffer while retaining depth testing against buildings. It does not alter compiled coordinates, triangle topology, camera limits or source artifacts. Three.js documents the underlying [perspective depth precision limitation](https://threejs.org/manual/en/cameras.html).

## Camera verification

`npm run zone:rendering` captures real rendered frames after pointer drags, targeted wheel events, pan and Reset camera. The CLI's wheel command delivered events to the page header, so the harness dispatches wheel events directly to the canvas's OrbitControls handler. Reset is scrolled into view before clicking. Each capture must differ from the previous frame; this catches ineffective test inputs. These checks establish camera motion and runtime health, not pixel correctness by themselves.

Pelluco's 1 km cell was visually checked at eight views: overview, orbit, low angle, close zoom, pan, overhead, maximum zoom out and reset. Roads remain continuous in the sampled views and buildings still occlude them. No browser exceptions were reported. [Frame hashes and runtime results](./street-rendering-verification.json) record the final run. The baseline overview, orbit and low-angle captures show the original defects at matching camera positions.

The local `.zone-cache/rendering-qa/pelluco-verified/` directory contains eight original PNGs and `camera-motion.webm`. The before/after overview also forms the draggable comparison shown in the conversation. Static checks and the production build pass; the existing bundle-size advisory remains. This is verification on the local browser, not a guarantee across every GPU and browser.
