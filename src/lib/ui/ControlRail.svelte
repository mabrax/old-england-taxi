<script lang="ts">
  let { onReset, resetEnabled }: { onReset: () => void; resetEnabled: boolean } = $props();
</script>

<aside class="control-rail" aria-label="Viewport controls">
  <div class="rail-heading">
    <span class="eyebrow">Current workspace</span>
    <h1>Compiled zone</h1>
    <p>Inspect the prepared fixed-zone artifact with continuous roads and aligned building volumes.</p>
  </div>

  <div class="rail-card">
    <div class="card-heading">
      <span class="card-icon" aria-hidden="true">05</span>
      <div>
        <span class="eyebrow">Fixed zone</span>
        <h2>Trafalgar Square</h2>
      </div>
    </div>

    <div class="scene-summary">
      <span class="summary-line"><span class="summary-key">Road graph</span><span>1,582 edges</span></span>
      <span class="summary-line"><span class="summary-key">Buildings</span><span>1,005 volumes</span></span>
      <span class="summary-line"><span class="summary-key">Combined mesh</span><span>45,201 triangles</span></span>
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
    <span>Prepared artifact</span>
    <span class="footer-code">RTE / 05</span>
  </div>
</aside>
