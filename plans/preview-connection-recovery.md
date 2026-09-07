# Preview connection recovery

On 2026-09-07, searching for Pelluco showed “Failed to fetch” while the previously loaded Angelmó map remained visible. Port 4175 refused connections, and no Vite preview process was running. The earlier preview session no longer existed; the evidence does not establish why it stopped.

`npm run preview:start` now launches Vite in its own process group with file-backed logs and waits for generation API readiness. Its launcher exits while the preview continues to run. Repeating the command reuses a healthy service. This is a local preview launcher, not a process supervisor or a service that starts after a reboot.

The form distinguishes a lost local connection from an error returned by the map provider. A visible connection warning offers Reconnect, including when the initial health check fails or no job has yet been created. Reconnecting checks service health, resumes a known job, and preserves entered form values. It never automatically replays a search or build submission. Provider connection errors explain that coordinate entry remains available.

## Verification

- Retried the user's actual query, `pelluco, puerto montt, los lagos, chile`, selected **Pelluco, Puerto Montt, Los Lagos Region, Chile**, and built a 1 km cell in their browser. The completed map opened automatically with 317 buildings, 522 road graph edges and 8,176 triangles. The job was ready in 4,956 ms on this run; this is an observation, not a latency guarantee.
- Generated zone: `cell-02354f144ad1bd98f7c42e3d1d4a9594d06c17e7c64019da0257e804565595e6`. Runtime source and artifacts remain in the ignored local cache.
- Verified from a separate command that preview continued to respond after its launcher exited and had its own process group/session; a repeated startup reused the existing process.
- All 153 tests pass. Static checks report zero errors/warnings, offline corpus verification passes, and the production build passes with the existing bundle-size advisory.
- `npm run zone:live-browser` passes: a blocked search request before a job exists, preserved query and loaded map, explicit reconnect without automatic resubmission, successful Pelluco search retry, and an unavailable initial health check followed by reconnect. Existing cached-build, pending-job, reload, missing-job, desktop and mobile checks also pass. [Machine-readable evidence](./preview-connection-browser-verification.json) records the run. The connection warning screenshot was visually inspected.
