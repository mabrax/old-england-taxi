# 00 — Project Setup

## Goal

Establish a lean application shell, clear module boundaries, and the simulator viewport before adding geographic data or driving behavior.

## Technical decisions

- Svelte 5 + Vite + TypeScript as a single-page application.
- Three.js owns rendering; Svelte owns interface and application state.
- Plain CSS and Svelte components; no UI framework or global state library.
- A local Node/TypeScript tool will compile zones. The browser only loads prepared zone artifacts.
- Vercel is the eventual static host, but deployment is outside this stage.

Approved libraries, introduced only when their stage needs them:

| Area | Library | Stage |
| --- | --- | --- |
| Application | Svelte, Vite, TypeScript | 00 |
| 3D rendering | Three.js | 00 |
| Geometry | Earcut, polygon-clipping | 01 |
| Physics | Rapier 3D | 03 |
| Checks | svelte-check, Vitest | 00 |

## Project shape

```text
src/
  lib/ui/           Interface components
  lib/scene/        Three.js lifecycle and camera
  lib/geo/          Coordinates and geographic types
  lib/zone/         Zone artifact loading
  App.svelte        Single application shell
tools/zone-compiler/
public/zones/
tests/
plans/
```

## View layout

```text
┌──────────── top status bar ────────────┐
│ zone/control rail │                    │
│ 280–320 px        │ Three.js viewport  │
│                   │                    │
└────────────── HUD / controls ──────────┘
```

- The viewport is the primary surface and always fills available space.
- The control rail collapses into a bottom sheet on small screens.
- Loading, errors, and completion appear as overlays rather than separate pages.
- Phase 00 renders only a neutral grid, camera, and layout placeholders.

## Exit condition

The app starts, checks, tests, and builds; the renderer mounts and disposes cleanly; the layout works on desktop and mobile. No OSM data, generated city, vehicle, or deployment is included.
