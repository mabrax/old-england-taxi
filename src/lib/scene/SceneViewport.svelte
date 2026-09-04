<script lang="ts">
  import { onMount } from 'svelte';
  import { loadZoneArtifact } from '../zone/load-zone-artifact';
  import type { ZoneStatus, ZoneSummary } from '../zone/types';
  import { createValidationScene, type SceneController } from './validation-scene';

  let container: HTMLDivElement;
  let controller: SceneController | undefined;
  let artifactSlug: string | undefined;
  export let status: ZoneStatus = 'loading';
  export let summary: ZoneSummary | undefined = undefined;
  let errorMessage = '';

  export function resetCamera(): void {
    controller?.resetCamera();
  }

  onMount(() => {
    let disposed = false;
    const loadController = new AbortController();

    void loadZoneArtifact(undefined, undefined, { signal: loadController.signal })
      .then((loadedArtifact) => {
        if (disposed) return;
        artifactSlug = loadedArtifact.slug;
        controller = createValidationScene(container, loadedArtifact);
        summary = {
          graphEdges: loadedArtifact.streetGraph.statistics.edges,
          buildings: loadedArtifact.geometry.buildings.statistics.buildings,
          triangles: loadedArtifact.geometry.roads.statistics.triangles +
            loadedArtifact.geometry.buildings.statistics.triangles
        };
        status = 'ready';
      })
      .catch((error: unknown) => {
        if (disposed) return;
        status = 'error';
        errorMessage = error instanceof Error ? error.message : 'The zone could not be loaded.';
      });

    return () => {
      disposed = true;
      loadController.abort();
      controller?.dispose();
      controller = undefined;
    };
  });
</script>

<div
  class="scene-viewport"
  bind:this={container}
  aria-label="Three.js validation viewport"
  data-zone-status={status}
  data-zone-slug={artifactSlug}
>
  <div class="scene-badge">
    <span class="badge-kicker">LIVE VIEWPORT</span>
    <span class:badge-ready={status === 'ready'}>{status === 'ready' ? 'READY' : status.toUpperCase()}</span>
  </div>

  {#if status === 'loading'}
    <div class="scene-overlay" role="status">
      <span class="loader-ring" aria-hidden="true"></span>
      <span>Loading prepared zone…</span>
    </div>
  {:else if status === 'error'}
    <div class="scene-overlay scene-error" role="alert">
      <span class="error-symbol" aria-hidden="true">!</span>
      <strong>Zone unavailable</strong>
      <span>{errorMessage}</span>
    </div>
  {/if}
</div>
