<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSelectedZone } from '../zone/load-selected-zone';
  import type { ZoneCatalogue } from '../zone/catalogue';
  import type { ZoneStatus, ZoneSummary } from '../zone/types';
  import { createValidationScene, type SceneController, type DrivingMode, type DrivingState } from './validation-scene';
  import type { PhysicsState } from '../physics/physics-session';
  import { onPageExit } from './page-lifetime';
  import type { BenchmarkFixture, BenchmarkReplay } from '../benchmark/replay';

  export let blocked = false;
  export let drivingMode: DrivingMode = 'inspect';
  export let onDrive: () => void = () => {};
  let driving: DrivingState = { mode: 'inspect', speed: 0, message: 'Choose Drive when the vehicle is ready.' };
  let container: HTMLDivElement;
  let controller: SceneController | undefined;
  let artifactSlug: string | undefined;
  export let status: ZoneStatus = 'loading';
  export let summary: ZoneSummary | undefined = undefined;
  let errorMessage = '';
  let catalogue: ZoneCatalogue | undefined;
  let qaEnabled = false;
  let sourceVisible = true;
  let generatedVisible = true;
  let reportUrl = '';
  let comparisonUrl = '';
  let label = '';
  let physics: PhysicsState = { status: 'loading' };
  let collisionVisible = false;
  let vehicleHarness = false;
  let benchmarkFixture: BenchmarkFixture | undefined;
  let benchmarkReport: ReturnType<BenchmarkReplay['snapshot']> | undefined;
  let benchmarkError = '';
  function startBenchmark() {
    try { controller?.benchmark?.start(); benchmarkError = ''; }
    catch (error) { benchmarkError = String(error); }
  }
  $: controller?.setDrivingBlocked(blocked);
  $: controller?.setQaVisibility(qaEnabled && sourceVisible, generatedVisible);
  $: controller?.setCollisionVisibility(collisionVisible);

  export function pauseDriving(reason?: string): void { controller?.pauseDriving(reason); }

  function drive() { onDrive(); controller?.drive(); }

  export function resetCamera(): void {
    controller?.resetCamera();
  }

  onMount(() => {
    vehicleHarness = new URLSearchParams(window.location.search).get('vehicle') === '1';
    let disposed = false;
    const loadController = new AbortController();
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      detachPageExit();
      loadController.abort();
      if (controller?.benchmark && window.__drivingBenchmark === controller.benchmark) delete window.__drivingBenchmark;
      controller?.dispose();
      controller = undefined;
    };
    // Navigation can cache this component without unmounting it. Release the
    // loading owner and scene reference too, including navigation during loading.
    const detachPageExit = onPageExit(cleanup);

    void loadSelectedZone(window.location.search, undefined, { signal: loadController.signal })
      .then(async (loaded) => {
        const loadedArtifact = loaded.artifact;
        if (disposed) return;
        if (new URLSearchParams(window.location.search).has('benchmark')) {
          const { loadBenchmarkFixture } = await import('../benchmark/load-fixture');
          benchmarkFixture = await loadBenchmarkFixture(window.location.search, { id: loadedArtifact.slug, sha256: loaded.artifactHash }, loadController.signal);
          if (disposed) return;
        }
        artifactSlug = loadedArtifact.slug;
        controller = createValidationScene(container, loadedArtifact, loaded.qa, state => { physics = state; }, state => {
          driving = state; drivingMode = state.mode;
          benchmarkReport = controller?.benchmark?.snapshot();
        }, benchmarkFixture);
        if (controller.benchmark) { window.__drivingBenchmark = controller.benchmark; benchmarkReport = controller.benchmark.snapshot(); }
        catalogue = loaded.catalogue;
        qaEnabled = !!loaded.qa;
        reportUrl = loaded.reportUrl;
        const comparisonParams = new URLSearchParams(window.location.search);
        comparisonParams.set('qa', '1');
        comparisonUrl = `${window.location.pathname}?${comparisonParams}`;
        label = loadedArtifact.label;
        summary = {
          label: loadedArtifact.label,
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

    return cleanup;
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
      <span>Loading zone…</span>
    </div>
  {:else if status === 'error'}
    <div class="scene-overlay scene-error" role="alert">
      <span class="error-symbol" aria-hidden="true">!</span>
      <strong>Zone unavailable</strong>
      <span>{errorMessage}</span>
    </div>
  {/if}
  {#if status === 'ready'}
    <div class="driving-panel" data-driving-state={driving.mode} aria-label="Driving controls">
      <div class="driving-toolbar" role="group" aria-label="Driving actions" on:pointerdown={event => { if ((event.target as HTMLElement).closest('button')) event.preventDefault(); }}>
        <strong>{driving.mode === 'driving' ? 'Driving' : driving.mode === 'paused' ? 'Paused' : 'Inspecting'}</strong>
        <span class="speed-readout">{Math.abs(driving.speed * 3.6).toFixed(0)} km/h {driving.speed < -0.08 ? '· Reverse' : ''}</span>
        {#if driving.mode === 'driving'}
          <button type="button" on:click={() => controller?.pauseDriving()}>Pause driving</button>
        {:else if !benchmarkFixture}
          <button class="drive-primary" type="button" disabled={blocked || physics.vehicle?.status !== 'ready' || !generatedVisible || physics.status === 'error'} on:click={drive}>{driving.mode === 'paused' ? 'Resume driving' : 'Drive'}</button>
        {/if}
        {#if driving.mode !== 'inspect'}<button type="button" on:click={() => controller?.inspectVehicle()}>Inspect</button>{/if}
        <button type="button" disabled={physics.vehicle?.status !== 'ready'} on:click={() => controller?.resetVehicle()}>Reset vehicle</button>
        <button type="button" on:click={() => controller?.resetCamera()}>Reset view</button>
      </div>
      <p class="driving-message" role="status">{blocked ? 'Location work in progress. Driving is paused.' : physics.status === 'loading' ? 'Preparing physical world…' : physics.status === 'error' ? 'Physics unavailable. Geometry inspection remains available.' : physics.vehicle?.status === 'unavailable' ? physics.vehicle.message : driving.message}</p>
      {#if benchmarkFixture}
        <div class="benchmark-controls driving-toolbar" data-benchmark-phase={benchmarkReport?.phase}>
          <strong>Driving benchmark · {benchmarkReport?.phase ?? 'preparing'}</strong>
          <span>{benchmarkReport?.step ?? 0} / {benchmarkFixture.warmupSteps + benchmarkFixture.measuredSteps} steps</span>
          <button type="button" disabled={blocked || physics.vehicle?.status !== 'ready' || benchmarkReport?.phase !== 'ready'} on:click={startBenchmark}>Start benchmark</button>
          {#if benchmarkError || benchmarkReport?.failure}<p role="alert">{benchmarkError || benchmarkReport?.failure}</p>{/if}
        </div>
      {/if}
      {#if driving.mode === 'driving' && driving.onPavement === false}<p class="driving-surface" role="status">At the pavement edge or off road. Drive back within the amber limit; reset if stuck or overturned.</p>{/if}
      {#if driving.mode !== 'inspect'}
        <p class="driving-help">WASD / arrows · Hold S / ↓ to brake, then reverse · Space to stop · R to reset</p>
        <p class="driving-attribution">Flat geometry · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors · ODbL</a></p>
      {/if}
    </div>
    {#if driving.mode !== 'inspect'}
      <div class="touch-driving" aria-label="Touch driving controls">
        <div class="touch-steering">
          {#each [['left', '←', 'Steer left'], ['right', '→', 'Steer right']] as [action, symbol, label]}
            <button type="button" data-drive-input={action} aria-label={label} disabled={driving.mode !== 'driving'} on:pointerdown={event => controller?.pointerDown(event, action as 'left' | 'right')} on:contextmenu={event => event.preventDefault()}>{symbol}</button>
          {/each}
        </div>
        <div class="touch-pedals">
          {#each [['brake', 'Stop'], ['reverse', 'Brake / reverse'], ['forward', 'Accelerate']] as [action, label]}
            <button type="button" data-drive-input={action} disabled={driving.mode !== 'driving'} on:pointerdown={event => controller?.pointerDown(event, action as 'brake' | 'reverse' | 'forward')} on:contextmenu={event => event.preventDefault()}>{label}</button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if status === 'ready' && drivingMode === 'inspect'}
  <div class="qa-controls" aria-label="Zone inspection controls">
    {#if catalogue}
      <label>Available zones
        <select aria-label="Available zones" value={artifactSlug} on:change={(event) => {
          const params = new URLSearchParams(window.location.search);
          params.set('zone', event.currentTarget.value);
          window.location.search = params.toString();
        }}>
          {#each catalogue.zones as zone}<option value={zone.id}>{zone.label}</option>{/each}
        </select>
      </label>
    {:else}<strong>{label}</strong>{/if}
    <div class="physics-controls" data-physics-state={physics.status} aria-label="Physical world inspection">
      {#if physics.status === 'error'}
        <span role="alert">Physics unavailable: {physics.message} Geometry inspection is still available.</span>
      {:else if physics.status === 'loading'}
        <span role="status">Preparing physical world…</span>
      {:else}
        <strong>Physics {physics.status}</strong>
        <span>{physics.metrics?.colliders} colliders · Flat ground at 0 m</span>
        <label><input type="checkbox" bind:checked={collisionVisible} /> Collision surfaces</label>
        <span>Amber: simulation limit</span>
        <span data-vehicle-state={physics.vehicle?.status}>{physics.vehicle?.message}</span>
        {#if physics.vehicle?.status === 'ready'}
          <button type="button" on:click={() => controller?.inspectVehicle()}>Inspect vehicle</button>
          {#if vehicleHarness}
            <details class="vehicle-harness">
              <summary>Vehicle development exercises</summary>
              <span>Each command runs 60 fixed steps, then pauses. Inspect vehicle to see it nearby.</span>
              {#each [
                ['Accelerate', 1, 0, 0], ['Coast', 0, 0, 0], ['Brake', 0, 0, 1],
                ['Reverse', -1, 0, 0], ['Turn left', 1, 1, 0], ['Turn right', 1, -1, 0]
              ] as exercise}
                <button type="button" disabled={!generatedVisible} on:click={() => controller?.exerciseVehicle({ throttle: Number(exercise[1]), steering: Number(exercise[2]), brake: Number(exercise[3]) })}>{exercise[0]} · 1 s</button>
              {/each}
            </details>
          {/if}
        {/if}
      {/if}
    </div>
    {#if qaEnabled}
      <label><input type="checkbox" bind:checked={sourceVisible} /> Source outlines</label>
      <label><input type="checkbox" bind:checked={generatedVisible} /> Generated geometry</label>
      <span>Cyan: roads · Magenta: footprints · Orange: excluded</span>
      <a href={reportUrl} target="_blank" rel="noreferrer">Validation report</a>
    {:else}<a href={comparisonUrl}>Open source comparison</a>{/if}
    <span>Flat geometry · © OpenStreetMap contributors · <a href="https://www.openstreetmap.org/copyright">ODbL</a></span>
  </div>
{/if}
