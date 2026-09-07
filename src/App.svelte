<script lang="ts">
  import ControlRail from './lib/ui/ControlRail.svelte';
  import TopBar from './lib/ui/TopBar.svelte';
  import ViewportHud from './lib/ui/ViewportHud.svelte';
  import SceneViewport from './lib/scene/SceneViewport.svelte';
  import type { ZoneStatus, ZoneSummary } from './lib/zone/types';

  let viewport: { resetCamera: () => void } | undefined;
  let zoneStatus: ZoneStatus = 'loading';
  let zoneSummary: ZoneSummary | undefined;

  function resetCamera() {
    viewport?.resetCamera();
  }
</script>

<svelte:head>
  <meta
    name="description"
    content="Inspect deterministic prepared zones and compare source road and building outlines."
  />
</svelte:head>

<main class="app-shell">
  <TopBar status={zoneStatus} />

  <div class="workspace">
    <ControlRail onReset={resetCamera} resetEnabled={zoneStatus === 'ready'}
      summary={zoneStatus === 'ready' ? zoneSummary : undefined} />

    <section class="viewport-area" aria-label="Simulator viewport">
      <SceneViewport bind:this={viewport} bind:status={zoneStatus} bind:summary={zoneSummary} />
      {#if zoneStatus === 'ready' && zoneSummary}
        <ViewportHud buildingCount={zoneSummary.buildings} />
      {/if}
    </section>
  </div>
</main>
