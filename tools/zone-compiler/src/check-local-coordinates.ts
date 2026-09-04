import { compileLocalCoordinates } from './local-coordinates';
import { DEFAULT_ZONE_SLUG, loadZoneSource } from './load-zone-source';

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run zone:coordinates -- [zone-slug]');
  process.exitCode = 0;
} else if (args.length > 1) {
  console.error('Expected zero or one zone slug.');
  process.exitCode = 1;
} else {
  try {
    const source = await loadZoneSource(args[0] ?? DEFAULT_ZONE_SLUG);
    const local = compileLocalCoordinates(source);
    const extents = local.points.reduce(
      (current, point) => ({
        minimum: {
          x: Math.min(current.minimum.x, point.position.x),
          y: Math.min(current.minimum.y, point.position.y),
          z: Math.min(current.minimum.z, point.position.z)
        },
        maximum: {
          x: Math.max(current.maximum.x, point.position.x),
          y: Math.max(current.maximum.y, point.position.y),
          z: Math.max(current.maximum.z, point.position.z)
        }
      }),
      {
        minimum: { x: Infinity, y: Infinity, z: Infinity },
        maximum: { x: -Infinity, y: -Infinity, z: -Infinity }
      }
    );

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          slug: local.metadata.slug,
          coordinateSystem: local.metadata.coordinateSystem,
          features: {
            points: local.points.length,
            lines: local.lines.length,
            linePositions: local.lines.reduce(
              (count, line) => count + line.positions.length,
              0
            )
          },
          extents
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
