<script lang="ts">
  import ControlRail from './lib/ui/ControlRail.svelte';
  import TopBar from './lib/ui/TopBar.svelte';
  import ViewportHud from './lib/ui/ViewportHud.svelte';
  import SceneViewport from './lib/scene/SceneViewport.svelte';
  import type { ZoneStatus } from './lib/zone/types';

  let viewport: { resetCamera: () => void } | undefined;
  let zoneStatus: ZoneStatus = 'loading';

  function resetCamera() {
    viewport?.resetCamera();
  }
</script>

<svelte:head>
  <meta
    name="description"
    content="The Route Simulator's deterministic Trafalgar Square compiled zone artifact."
  />
</svelte:head>

<main class="app-shell">
  <TopBar status={zoneStatus} />

  <div class="workspace">
    <ControlRail onReset={resetCamera} resetEnabled={zoneStatus === 'ready'} />

    <section class="viewport-area" aria-label="Simulator viewport">
      <SceneViewport bind:this={viewport} bind:status={zoneStatus} />
      {#if zoneStatus === 'ready'}
        <ViewportHud />
      {/if}
    </section>
  </div>
</main>
