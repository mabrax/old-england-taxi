import { compileLocalCoordinates } from './local-coordinates';
import { DEFAULT_ZONE_SLUG, loadZoneSource } from './load-zone-source';
import { compileRoadSurfaces } from './road-surfaces';

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run zone:roads');
  process.exitCode = 0;
} else if (args.length > 0) {
  console.error('This command does not accept arguments.');
  process.exitCode = 1;
} else {
  try {
    const source = await loadZoneSource(DEFAULT_ZONE_SLUG);
    const local = compileLocalCoordinates(source);
    const first = compileRoadSurfaces(local);
    const second = compileRoadSurfaces(local);

    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('Repeated road compilation was not byte-stable');
    }

    const widthSources = first.roads.reduce(
      (counts, road) => {
        counts[road.width.source] += 1;
        return counts;
      },
      { width: 0, lanes: 0, 'highway-default': 0 }
    );

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          slug: first.metadata.slug,
          deterministic: true,
          diagnostics: first.diagnostics,
          output: 'packaged by Phase 05 zone artifact',
          roads: {
            features: first.roads.length,
            segments: first.roads.reduce(
              (total, road) => total + road.segmentCount,
              0
            ),
            inZoneSegments: first.roads.reduce(
              (total, road) => total + road.inZoneSegmentCount,
              0
            ),
            widthSources
          },
          surfaces: {
            polygons: first.polygons.length,
            holes: first.polygons.reduce(
              (total, polygon) => total + polygon.rings.length - 1,
              0
            ),
            areaSquareMetres: first.mesh.areaSquareMetres
          },
          mesh: {
            vertices: first.mesh.vertexCount,
            triangles: first.mesh.triangleCount,
            maximumDeviation: first.mesh.maximumDeviation
          }
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
