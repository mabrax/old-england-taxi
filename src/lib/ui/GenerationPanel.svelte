<script lang="ts">
  import { onMount } from 'svelte';
  import { GenerationApiError, generationApi, parseGenerationJob, parseLocationChoices } from '../zone/generation-client';
  import { isFinished, type GenerationJob, type LocationChoice } from '../zone/generation-types';

  let { onReady }: { onReady: (id: string) => void } = $props();
  let mode = $state<'place' | 'coordinates'>('place');
  let query = $state('');
  let latitude = $state<number | undefined>();
  let longitude = $state<number | undefined>();
  let size = $state(1000);
  let locations = $state<LocationChoice[]>([]);
  let selected = $state<LocationChoice>();
  let searched = $state(false);
  let searching = $state(false);
  let submitting = $state(false);
  let job = $state<GenerationJob>();
  let error = $state('');
  let connectionError = $state(false);
  let pendingId = $state<string>();
  let elapsed = $state(0);
  let available = $state(true);
  let disposed = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const busy = $derived(submitting || !!pendingId || !!job && !isFinished(job.state));
  const stages = ['queued', 'acquiring', 'compiling', 'verifying', 'ready'];
  const currentStage = $derived(job ? stages.indexOf(job.state) : -1);
  const storageKey = 'zone-generation-job';

  function setMode(next: typeof mode) {
    mode = next; selected = undefined; locations = []; searched = false; error = '';
  }
  async function search() {
    searching = true; error = ''; locations = []; selected = undefined; searched = false;
    try {
      const results = parseLocationChoices(await generationApi('/search', { query }));
      if (disposed) return;
      locations = results; searched = true;
      if (results.length === 1) selected = results[0];
    } catch (reason) { if (!disposed) error = message(reason); }
    finally { if (!disposed) searching = false; }
  }
  async function generate() {
    submitting = true; error = ''; connectionError = false;
    try {
      const location = mode === 'place' ? selected : { latitude, longitude };
      if (!location || location.latitude === undefined || location.longitude === undefined) throw new Error('Choose a search result or enter both coordinates.');
      const next = parseGenerationJob(await generationApi('/jobs', { ...location, widthMetres: size, heightMetres: size }));
      if (disposed) return;
      job = next; elapsed = 0;
      sessionStorage.setItem(storageKey, next.jobId);
      pendingId = next.jobId;
      accept(next);
    } catch (reason) { if (!disposed) error = message(reason); }
    finally { if (!disposed) submitting = false; }
  }
  function accept(next: GenerationJob) {
    connectionError = false; error = ''; available = true;
    job = next;
    if (next.state === 'ready') {
      pendingId = undefined;
      sessionStorage.removeItem(storageKey);
      onReady(next.zoneId);
    } else if (isFinished(next.state)) {
      pendingId = undefined;
      sessionStorage.removeItem(storageKey);
    } else {
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => { void poll(next.jobId); }, 1000);
    }
  }
  async function poll(id: string) {
    try {
      const next = parseGenerationJob(await generationApi(`/jobs/${id}`));
      if (disposed) return;
      connectionError = false; error = '';
      accept(next);
    } catch (reason) {
      if (disposed) return;
      handleConnectionFailure(reason);
      // Keep the job ID for manual reconnection or a reload; a lost connection is not job failure.
    }
  }
  async function cancel() {
    if (!job) return;
    clearTimeout(pollTimer);
    try {
      const next = parseGenerationJob(await generationApi(`/jobs/${job.jobId}/cancel`, {}));
      if (!disposed) accept(next);
    } catch (reason) { if (!disposed) handleConnectionFailure(reason); }
  }
  function handleConnectionFailure(reason: unknown) {
    error = message(reason); connectionError = true;
    if (reason instanceof GenerationApiError && reason.status === 404) {
      pendingId = undefined; job = undefined; connectionError = false;
      sessionStorage.removeItem(storageKey);
    }
  }
  function message(reason: unknown) { return reason instanceof Error ? reason.message : 'The request failed. Please try again.'; }
  onMount(() => {
    const existing = sessionStorage.getItem(storageKey);
    void generationApi().catch(reason => { if (!disposed) { available = false; error = message(reason); } });
    if (existing && /^[a-f0-9-]{36}$/.test(existing)) { pendingId = existing; void poll(existing); }
    const clock = setInterval(() => { if (job) elapsed = Math.max(0, Math.floor((Date.now() - job.createdAt) / 1000)); }, 1000);
    return () => { disposed = true; clearInterval(clock); clearTimeout(pollTimer); };
  });
</script>

<section class="generation-panel" aria-label="Generate a new zone">
  <div class="generation-heading"><span class="eyebrow">Build somewhere new</span><span class="generation-live">ON DEMAND</span></div>
  <div class="location-tabs" aria-label="Location input">
    <button type="button" class:active={mode === 'place'} aria-pressed={mode === 'place'} onclick={() => setMode('place')} disabled={busy}>Place name</button>
    <button type="button" class:active={mode === 'coordinates'} aria-pressed={mode === 'coordinates'} onclick={() => setMode('coordinates')} disabled={busy}>Coordinates</button>
  </div>
  {#if mode === 'place'}
    <form onsubmit={(event) => { event.preventDefault(); void search(); }}>
      <label for="location-query">Place, address or landmark</label>
      <div class="location-search">
        <input id="location-query" bind:value={query} oninput={() => { selected = undefined; locations = []; searched = false; }} placeholder="e.g. Shibuya Crossing, Tokyo" minlength="2" maxlength="200" required disabled={busy || !available} />
        <button type="submit" disabled={searching || busy || !available}>{searching ? 'Finding…' : 'Find'}</button>
      </div>
    </form>
    {#if busy && selected}<p class="generation-hint">{selected.label}</p>
    {:else if locations.length}
      <div class="location-results" aria-label="Matching locations">
        {#each locations as location}
          <button type="button" class:selected={selected === location} aria-pressed={selected === location} disabled={busy} onclick={() => { selected = location; }}>
            <span>{location.label}</span><small>{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</small>
          </button>
        {/each}
      </div>
    {:else if searched}<p class="generation-hint">No matches. Try a more specific name, or use coordinates.</p>{/if}
  {:else}
    <div class="coordinate-fields">
      <label>Latitude<input aria-label="Latitude" type="number" bind:value={latitude} min="-90" max="90" step="any" placeholder="35.6595" disabled={busy} /></label>
      <label>Longitude<input aria-label="Longitude" type="number" bind:value={longitude} min="-180" max="180" step="any" placeholder="139.7005" disabled={busy} /></label>
    </div>
  {/if}
  <label class="cell-size">Cell size
    <select aria-label="Cell size" bind:value={size} disabled={busy}>
      <option value={500}>500 × 500 m</option><option value={1000}>1 × 1 km</option><option value={1500}>1.5 × 1.5 km</option><option value={2000}>2 × 2 km</option>
    </select>
  </label>
  <button class="generate-button" type="button" onclick={generate} disabled={busy || searching || !available || (mode === 'place' && !selected)}>
    {busy ? 'Generating…' : 'Build this location'} <span aria-hidden="true">↗</span>
  </button>
  <p class="generation-hint">Downloads OpenStreetMap data and builds the area around your point. Coverage and generation time vary.</p>
  {#if job}
    <div class="generation-progress" data-generation-state={job.state} role="status" aria-live="polite">
      <div class="generation-steps" aria-hidden="true">
        {#each ['Queue', 'Download', 'Build', 'Check'] as stage, index}<span class:done={currentStage > index} class:current={currentStage === index}>{stage}</span>{/each}
      </div>
      <strong>{job.message}</strong>
      {#if job.state === 'failed'}<p>Try a smaller cell or a nearby location. If the map provider is unavailable, try again later.</p>{/if}
      {#if !isFinished(job.state)}
        <div class="generation-progress-actions"><span>{elapsed}s elapsed</span><button type="button" onclick={cancel}>Cancel</button></div>
      {/if}
    </div>
  {/if}
  {#if error}<p class="generation-error" role="alert">{error}</p>{/if}
  {#if connectionError && pendingId}<button type="button" class="reconnect-button" onclick={() => poll(pendingId!)}>Check progress</button>{/if}
  <a class="generation-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Search and map data © OpenStreetMap contributors</a>
</section>
