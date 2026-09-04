<script lang="ts">
  let { onReset }: { onReset: () => void } = $props();
</script>

<aside class="control-rail" aria-label="Viewport controls">
  <div class="rail-heading">
    <span class="eyebrow">Current workspace</span>
    <h1>Building volumes</h1>
    <p>Inspect aligned building footprints together with the fixed cell’s continuous road network.</p>
  </div>

  <div class="rail-card">
    <div class="card-heading">
      <span class="card-icon" aria-hidden="true">04</span>
      <div>
        <span class="eyebrow">Fixed zone</span>
        <h2>Trafalgar Square</h2>
      </div>
    </div>

    <div class="scene-summary">
      <span class="summary-line"><span class="summary-key">Buildings</span><span>1,005 volumes</span></span>
      <span class="summary-line"><span class="summary-key">Source heights</span><span>513 footprints</span></span>
      <span class="summary-line"><span class="summary-key">Building mesh</span><span>38,664 triangles</span></span>
    </div>

    <button class="reset-button" type="button" onclick={onReset}>
      <span>Reset camera</span>
      <span aria-hidden="true">↗</span>
    </button>
  </div>

  <div class="rail-note">
    <span class="note-marker" aria-hidden="true"></span>
    <p>Heights use OSM height or level tags, then one 12 m fallback. Building parts, complex roofs, and landmarks remain deferred.</p>
  </div>

  <div class="rail-footer">
    <span>Local preview</span>
    <span class="footer-code">RTE / 04</span>
  </div>
</aside>
