import { loadPreparedJson, loadZoneArtifact, type ZoneArtifactLoadOptions } from './load-zone-artifact';
import { parseCatalogue, parseZoneQa, safeAssetUrl, validZoneId } from './catalogue';

const base = import.meta.env.BASE_URL;
const assetUrl = (path: string) => `${base}${safeAssetUrl(path).slice(1)}`;
export async function loadSelectedZone(search: string, fetcher: typeof fetch = fetch, options: ZoneArtifactLoadOptions = {}) {
  const params = new URLSearchParams(search);
  const id = params.get('zone');
  const url = params.get('artifact');
  const qaEnabled = params.get('qa') === '1';
  if (id !== null && !validZoneId(id)) throw new Error('Invalid zone ID');
  if (id !== null && url !== null) throw new Error('Choose either zone ID or artifact URL');
  if (url !== null) safeAssetUrl(url);
  const catalogue = url === null ? await loadPreparedJson(`${base}zones/index.json`, fetcher, options, parseCatalogue) : undefined;
  const entry = catalogue?.zones.find(zone => id === null || zone.id === id);
  if (url === null && !entry) throw new Error(id ? `Zone ${id} is not in the prepared catalogue` : 'The prepared catalogue is empty');
  const artifactUrl = url ?? assetUrl(entry!.artifact.url);
  let artifactHash = '';
  const artifact = await loadZoneArtifact(artifactUrl, fetcher, { ...options, sha256: entry?.artifact.sha256, onHash: hash => { artifactHash = hash; } });
  if (entry && artifact.slug !== entry.id) throw new Error('Artifact ID does not match catalogue selection');
  const qaUrl = entry ? assetUrl(entry.qa.url) : artifactUrl.replace(/\.zone\.json$/, '.qa.json');
  if (qaEnabled && !entry && qaUrl === artifactUrl) throw new Error('QA requires a .zone.json artifact URL with a sibling .qa.json asset');
  const qa = qaEnabled ? await loadPreparedJson(qaUrl, fetcher, { ...options, sha256: entry?.qa.sha256 }, parseZoneQa) : undefined;
  if (qa && (qa.id !== artifact.slug || qa.sourceSha256 !== artifact.source.snapshot.sha256 ||
      qa.artifactSha256 !== artifactHash)) throw new Error('QA provenance does not match artifact');
  return { artifact, qa, catalogue, reportUrl: entry ? assetUrl(entry.report.url) : artifactUrl.replace(/\.zone\.json$/, '.report.json') };
}
