<script lang="ts">
  import { onMount } from 'svelte';
  import { loadZoneArtifact } from '../zone/load-zone-artifact';
  import type { ZoneArtifact, ZoneStatus } from '../zone/types';
  import { createValidationScene, type SceneController } from './validation-scene';

  let container: HTMLDivElement;
  let controller: SceneController | undefined;
  let artifact: ZoneArtifact | undefined;
  export let status: ZoneStatus = 'loading';
  let errorMessage = '';

  export function resetCamera(): void {
    controller?.resetCamera();
  }

  onMount(() => {
    let disposed = false;

    void loadZoneArtifact()
      .then((loadedArtifact) => {
        if (disposed) return;
        artifact = loadedArtifact;
        controller = createValidationScene(container, loadedArtifact);
        status = 'ready';
      })
      .catch((error: unknown) => {
        if (disposed) return;
        status = 'error';
        errorMessage = error instanceof Error ? error.message : 'The zone could not be loaded.';
      });

    return () => {
      disposed = true;
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
  data-zone-slug={artifact?.slug}
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
