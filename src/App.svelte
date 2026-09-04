<script lang="ts">
  import ControlRail from './lib/ui/ControlRail.svelte';
  import TopBar from './lib/ui/TopBar.svelte';
  import ViewportHud from './lib/ui/ViewportHud.svelte';
  import SceneViewport from './lib/scene/SceneViewport.svelte';

  let viewport: { resetCamera: () => void } | undefined;

  function resetCamera() {
    viewport?.resetCamera();
  }
</script>

<svelte:head>
  <meta
    name="description"
    content="A quiet validation shell for the Route Simulator's Three.js viewport."
  />
</svelte:head>

<main class="app-shell">
  <TopBar />

  <div class="workspace">
    <ControlRail onReset={resetCamera} />

    <section class="viewport-area" aria-label="Simulator viewport">
      <SceneViewport bind:this={viewport} />
      <ViewportHud />
    </section>
  </div>
</main>
