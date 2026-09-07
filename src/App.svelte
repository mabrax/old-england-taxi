<script lang="ts">
  import ControlRail from './lib/ui/ControlRail.svelte';
  import TopBar from './lib/ui/TopBar.svelte';
  import ViewportHud from './lib/ui/ViewportHud.svelte';
  import SceneViewport from './lib/scene/SceneViewport.svelte';
  import type { DrivingMode } from './lib/scene/validation-scene';
  import type { ZoneStatus, ZoneSummary } from './lib/zone/types';
  import type { GenerationJob } from './lib/zone/generation-types';
  import GenerationNotice from './lib/ui/GenerationNotice.svelte';

  let viewport: { resetCamera: () => void; pauseDriving: (reason?: string) => void } | undefined;
  let workspaceOpen = false;
  let generationBusy = false;
  let drivingMode: DrivingMode = 'inspect';
  let zoneStatus: ZoneStatus = 'loading';
  let zoneSummary: ZoneSummary | undefined;
  let generationJob: GenerationJob | undefined;

  function resetCamera() {
    viewport?.resetCamera();
  }
</script>

<svelte:head>
  <meta
    name="description"
    content="Generate and inspect OpenStreetMap zones from a place name or coordinates."
  />
</svelte:head>

<main class="app-shell" class:workspace-open={workspaceOpen} data-driving-mode={drivingMode}>
  <TopBar status={zoneStatus} />
  <button class="workspace-toggle" type="button" aria-expanded={workspaceOpen} on:click={() => {
    workspaceOpen = !workspaceOpen;
    if (workspaceOpen) viewport?.pauseDriving('Workspace opened. Resume driving when ready.');
  }}>{workspaceOpen ? 'Close workspace' : 'Locations & tools'}</button>

  <div class="workspace">
    <ControlRail onReset={resetCamera} resetEnabled={zoneStatus === 'ready'}
      onBusy={(busy) => { generationBusy = busy; }} summary={zoneStatus === 'ready' ? zoneSummary : undefined} onProgress={(job) => { generationJob = job; }} />

    <section class="viewport-area" class:has-generation-notice={!!generationJob} aria-label="Simulator viewport">
      <SceneViewport blocked={generationBusy} bind:drivingMode onDrive={() => { workspaceOpen = false; }} bind:this={viewport} bind:status={zoneStatus} bind:summary={zoneSummary} />
      {#if generationJob}
        <GenerationNotice job={generationJob} loadedLabel={zoneSummary?.label} onDismiss={() => { generationJob = undefined; }} />
      {/if}
      {#if zoneStatus === 'ready' && zoneSummary && drivingMode === 'inspect'}
        <ViewportHud buildingCount={zoneSummary.buildings} />
      {/if}
    </section>
  </div>
</main>
