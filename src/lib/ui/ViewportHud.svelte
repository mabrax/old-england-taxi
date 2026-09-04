<script lang="ts">
  export let buildingCount: number;
</script>

<div class="viewport-hud" aria-label="Viewport information">
  <div class="hud-status">
    <span class="hud-pulse" aria-hidden="true"></span>
    <span>Zone · roads + {buildingCount.toLocaleString('en-GB')} buildings</span>
  </div>
  <div class="hud-details">
    <span>Drag to orbit</span>
    <span aria-hidden="true">·</span>
    <span>Scroll to inspect</span>
  </div>
</div>
