<script lang="ts">
  import { generationFailureMessage } from '../zone/generation-client';
  import { isFinished, type GenerationJob } from '../zone/generation-types';
  let { job, loadedLabel, onDismiss }: {
    job: GenerationJob; loadedLabel?: string; onDismiss: () => void;
  } = $props();
</script>

<div class="generation-notice" class:failed={job.state === 'failed'} data-generation-notice={job.state}
  role={job.state === 'failed' ? 'alert' : 'status'} aria-live={job.state === 'failed' ? 'assertive' : 'polite'}>
  <div class="generation-notice-heading">
    <strong>{job.state === 'failed' ? 'Build failed' : job.state === 'cancelled' ? 'Build cancelled' : job.state === 'ready' ? 'Opening your zone…' : 'Building your location…'}</strong>
    {#if isFinished(job.state) && job.state !== 'ready'}<button type="button" onclick={onDismiss} aria-label="Dismiss generation notice">×</button>{/if}
  </div>
  <p class="generation-notice-location">{job.label}</p>
  <p>{job.state === 'failed' ? generationFailureMessage(job.message) : job.message}</p>
  {#if loadedLabel && job.state !== 'ready'}
    <p class="generation-notice-current">{job.state === 'failed' || job.state === 'cancelled' ? 'No new zone was opened.' : 'The new zone will open when it is ready.'} Currently showing: {loadedLabel}.</p>
  {/if}
</div>
