<script lang="ts">
  import { onMount } from 'svelte';
  import { createValidationScene, type SceneController } from './validation-scene';

  let container: HTMLDivElement;
  let controller: SceneController | undefined;
  let status: 'loading' | 'ready' | 'error' = 'loading';
  let errorMessage = '';

  export function resetCamera(): void {
    controller?.resetCamera();
  }

  onMount(() => {
    try {
      controller = createValidationScene(container);
      status = 'ready';
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : 'The renderer could not start.';
    }

    return () => {
      controller?.dispose();
      controller = undefined;
    };
  });
</script>

<div class="scene-viewport" bind:this={container} aria-label="Three.js validation viewport">
  <div class="scene-badge">
    <span class="badge-kicker">LIVE VIEWPORT</span>
    <span class:badge-ready={status === 'ready'}>{status === 'ready' ? 'READY' : status.toUpperCase()}</span>
  </div>

  {#if status === 'loading'}
    <div class="scene-overlay" role="status">
      <span class="loader-ring" aria-hidden="true"></span>
      <span>Mounting renderer…</span>
    </div>
  {:else if status === 'error'}
    <div class="scene-overlay scene-error" role="alert">
      <span class="error-symbol" aria-hidden="true">!</span>
      <strong>Renderer unavailable</strong>
      <span>{errorMessage}</span>
    </div>
  {/if}
</div>
