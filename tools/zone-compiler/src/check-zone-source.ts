import { DEFAULT_ZONE_SLUG, loadZoneSource } from './load-zone-source';

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run zone:check -- [zone-slug]');
  process.exitCode = 0;
} else if (args.length > 1) {
  console.error('Expected zero or one zone slug.');
  process.exitCode = 1;
} else {
  try {
    const loaded = await loadZoneSource(args[0] ?? DEFAULT_ZONE_SLUG);
    const { manifest, counts } = loaded;

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          slug: manifest.slug,
          label: manifest.label,
          bounds: manifest.bounds,
          approximateAreaSquareKilometres: manifest.approximateAreaSquareKilometres,
          osmBaseTimestamp: manifest.source.osmBaseTimestamp,
          snapshot: {
            file: manifest.snapshot.file,
            byteLength: manifest.snapshot.byteLength,
            sha256: manifest.snapshot.sha256
          },
          elements: counts
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
