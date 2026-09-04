import {
  combineBuildingMeshes,
  compileBuildingVolumes
} from './building-volumes';
import { DEFAULT_ZONE_SLUG, loadZoneSource } from './load-zone-source';
import type { BuildingHeightSource } from './types';

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run zone:buildings');
  process.exitCode = 0;
} else if (args.length > 0) {
  console.error('This command does not accept arguments.');
  process.exitCode = 1;
} else {
  try {
    const source = await loadZoneSource(DEFAULT_ZONE_SLUG);
    const first = compileBuildingVolumes(source);
    const second = compileBuildingVolumes(source);

    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('Repeated building compilation was not byte-stable');
    }

    const mesh = combineBuildingMeshes(first.buildings);
    const heightSources = first.buildings.reduce<Record<BuildingHeightSource, number>>(
      (counts, building) => {
        counts[building.height.source] += 1;
        return counts;
      },
      { height: 0, 'building:levels': 0, fallback: 0 }
    );
    const footprintAreaSquareMetres = first.buildings.reduce(
      (total, building) => total + building.footprint.areaSquareMetres,
      0
    );

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          slug: first.metadata.slug,
          deterministic: true,
          output: 'packaged by Phase 05 zone artifact',
          footprints: {
            buildings: first.buildings.length,
            ways: first.buildings.filter((building) => building.source.type === 'way')
              .length,
            relations: first.buildings.filter(
              (building) => building.source.type === 'relation'
            ).length,
            holes: first.buildings.reduce(
              (total, building) => total + building.footprint.rings.length - 1,
              0
            ),
            areaSquareMetres: roundOutput(footprintAreaSquareMetres)
          },
          heights: {
            sources: heightSources,
            minimumMetres: Math.min(
              ...first.buildings.map((building) => building.height.metres)
            ),
            maximumMetres: Math.max(
              ...first.buildings.map((building) => building.height.metres)
            ),
            fallbackMetres: first.metadata.heightRules.fallbackHeightMetres
          },
          mesh: {
            vertices: mesh.vertexCount,
            triangles: mesh.triangleCount,
            roofs: mesh.roofTriangleCount,
            floors: mesh.floorTriangleCount,
            walls: mesh.wallTriangleCount,
            maximumDeviation: mesh.maximumDeviation
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

function roundOutput(value: number): number {
  return Number(value.toFixed(6));
}
