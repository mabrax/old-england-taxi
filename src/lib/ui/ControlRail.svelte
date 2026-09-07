<script lang="ts">
  import GenerationPanel from './GenerationPanel.svelte';
  import type { ZoneSummary } from '../zone/types';

  let { onReset, resetEnabled, summary }: {
    onReset: () => void;
    resetEnabled: boolean;
    summary: ZoneSummary | undefined;
  } = $props();
</script>

<aside class="control-rail" aria-label="Viewport controls">
  <div class="rail-heading">
    <span class="eyebrow">Current workspace</span>
    <h1>Explore a location</h1>
    <p>Search the world, choose a point, and build its roads and buildings.</p>
  </div>

  <GenerationPanel onReady={(id) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('artifact');
    url.searchParams.set('zone', id);
    window.location.assign(url.href);
  }} />

  <div class="rail-card">
    <div class="card-heading">
      <span class="card-icon" aria-hidden="true">05</span>
      <div>
        <span class="eyebrow">Loaded zone</span>
        <h2>{summary?.label ?? 'No zone loaded'}</h2>
      </div>
    </div>

    <div class="scene-summary">
      <span class="summary-line"><span class="summary-key">Road graph</span><span>{summary?.graphEdges.toLocaleString('en-GB') ?? '—'} edges</span></span>
      <span class="summary-line"><span class="summary-key">Buildings</span><span>{summary?.buildings.toLocaleString('en-GB') ?? '—'} volumes</span></span>
      <span class="summary-line"><span class="summary-key">Combined mesh</span><span>{summary?.triangles.toLocaleString('en-GB') ?? '—'} triangles</span></span>
    </div>

    <button class="reset-button" type="button" onclick={onReset} disabled={!resetEnabled}>
      <span>Reset camera</span>
      <span aria-hidden="true">↗</span>
    </button>
  </div>

  <div class="rail-note">
    <span class="note-marker" aria-hidden="true"></span>
    <p>Geometry, graph, coordinates, and OSM provenance load from one deterministic artifact. Routing and driveability remain deferred.</p>
  </div>

  <div class="rail-footer">
    <span>Verified map geometry</span>
    <span class="footer-code">RTE / 05</span>
  </div>
</aside>
