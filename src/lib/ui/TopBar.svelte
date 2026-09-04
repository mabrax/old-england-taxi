<script lang="ts">
  import type { ZoneStatus } from '../zone/types';

  export let status: ZoneStatus;
</script>

<header class="top-bar">
  <div class="top-status" aria-label="Application status">
    <span class="status-dot" class:status-error={status === 'error'} aria-hidden="true"></span>
    <span>{status === 'ready' ? 'Renderer online' : status === 'error' ? 'Zone error' : 'Loading zone'}</span>
    <span class="status-divider" aria-hidden="true"></span>
    <span class="status-muted">Phase 05 · zone artifact</span>
  </div>
</header>
