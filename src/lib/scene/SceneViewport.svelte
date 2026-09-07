<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSelectedZone } from '../zone/load-selected-zone';
  import type { ZoneCatalogue } from '../zone/catalogue';
  import type { ZoneStatus, ZoneSummary } from '../zone/types';
  import { createValidationScene, type SceneController } from './validation-scene';

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
  $: controller?.setQaVisibility(qaEnabled && sourceVisible, generatedVisible);

  export function resetCamera(): void {
    controller?.resetCamera();
  }

  onMount(() => {
    let disposed = false;
    const loadController = new AbortController();

    void loadSelectedZone(window.location.search, undefined, { signal: loadController.signal })
      .then((loaded) => {
        const loadedArtifact = loaded.artifact;
        if (disposed) return;
        artifactSlug = loadedArtifact.slug;
        controller = createValidationScene(container, loadedArtifact, loaded.qa);
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

{#if status === 'ready'}
  <div class="qa-controls" aria-label="Zone inspection controls">
    {#if catalogue}
      <label>Prepared zone
        <select aria-label="Prepared zone" value={artifactSlug} on:change={(event) => {
          const params = new URLSearchParams(window.location.search);
          params.set('zone', event.currentTarget.value);
          window.location.search = params.toString();
        }}>
          {#each catalogue.zones as zone}<option value={zone.id}>{zone.label}</option>{/each}
        </select>
      </label>
    {:else}<strong>{label}</strong>{/if}
    {#if qaEnabled}
      <label><input type="checkbox" bind:checked={sourceVisible} /> Source outlines</label>
      <label><input type="checkbox" bind:checked={generatedVisible} /> Generated geometry</label>
      <span>Cyan: roads · Magenta: footprints · Orange: excluded</span>
      <a href={reportUrl} target="_blank" rel="noreferrer">Validation report</a>
    {:else}<a href={comparisonUrl}>Open source comparison</a>{/if}
    <span>Flat geometry · © OpenStreetMap contributors · <a href="https://www.openstreetmap.org/copyright">ODbL</a></span>
  </div>
{/if}
