<script lang="ts">
  let { onReset }: { onReset: () => void } = $props();
</script>

<aside class="control-rail" aria-label="Viewport controls">
  <div class="rail-heading">
    <span class="eyebrow">Current workspace</span>
    <h1>Viewport check</h1>
    <p>Confirm the scene, movable camera, and application frame before adding a real zone.</p>
  </div>

  <div class="rail-card">
    <div class="card-heading">
      <span class="card-icon" aria-hidden="true">01</span>
      <div>
        <span class="eyebrow">Test scene</span>
        <h2>Neutral courtyard</h2>
      </div>
    </div>

    <div class="scene-summary">
      <span class="summary-line"><span class="summary-key">Surface</span><span>Grid + ground</span></span>
      <span class="summary-line"><span class="summary-key">Objects</span><span>4 primitives</span></span>
      <span class="summary-line"><span class="summary-key">Lighting</span><span>Soft directional</span></span>
    </div>

    <button class="reset-button" type="button" onclick={onReset}>
      <span>Reset camera</span>
      <span aria-hidden="true">↗</span>
    </button>
  </div>

  <div class="rail-note">
    <span class="note-marker" aria-hidden="true"></span>
    <p>Drag the viewport to orbit, scroll to zoom, or use two fingers on touch. Later stages will load prepared zones here.</p>
  </div>

  <div class="rail-footer">
    <span>Local preview</span>
    <span class="footer-code">RTE / 00</span>
  </div>
</aside>
