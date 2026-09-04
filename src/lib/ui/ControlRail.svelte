<script lang="ts">
  let { onReset }: { onReset: () => void } = $props();
</script>

<aside class="control-rail" aria-label="Viewport controls">
  <div class="rail-heading">
    <span class="eyebrow">Current workspace</span>
    <h1>Road surfaces</h1>
    <p>Inspect the fixed Trafalgar Square cell as one continuous local-metre road network.</p>
  </div>

  <div class="rail-card">
    <div class="card-heading">
      <span class="card-icon" aria-hidden="true">03</span>
      <div>
        <span class="eyebrow">Fixed zone</span>
        <h2>Trafalgar Square</h2>
      </div>
    </div>

    <div class="scene-summary">
      <span class="summary-line"><span class="summary-key">Roads</span><span>475 ways</span></span>
      <span class="summary-line"><span class="summary-key">Segments</span><span>1,582 in zone</span></span>
      <span class="summary-line"><span class="summary-key">Mesh</span><span>6,537 triangles</span></span>
    </div>

    <button class="reset-button" type="button" onclick={onReset}>
      <span>Reset camera</span>
      <span aria-hidden="true">↗</span>
    </button>
  </div>

  <div class="rail-note">
    <span class="note-marker" aria-hidden="true"></span>
    <p>Widths come from OSM width or lane tags, then deterministic road-class fallbacks. Buildings and markings remain deferred.</p>
  </div>

  <div class="rail-footer">
    <span>Local preview</span>
    <span class="footer-code">RTE / 03</span>
  </div>
</aside>
