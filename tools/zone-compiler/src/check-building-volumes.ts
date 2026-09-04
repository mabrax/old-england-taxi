import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  combineBuildingMeshes,
  compileBuildingVolumes
} from './building-volumes';
import { DEFAULT_ZONE_SLUG, loadZoneSource } from './load-zone-source';
import type {
  BuildingHeightSource,
  BuildingVolumeZone,
  TriangulatedBuildingMesh
} from './types';

const PREVIEW_PATH = fileURLToPath(
  new URL(
    '../../../src/lib/zone/generated/trafalgar-square-building-volumes.json',
    import.meta.url
  )
);

interface BuildingVolumePreview {
  schemaVersion: 1;
  slug: string;
  label: string;
  coordinateSystem: {
    units: 'metres';
    x: 'east';
    y: 'up';
    z: 'south';
  };
  bounds: {
    minimumX: number;
    maximumX: number;
    minimumY: number;
    maximumY: number;
    minimumZ: number;
    maximumZ: number;
  };
  statistics: {
    buildings: number;
    wayFootprints: number;
    relationFootprints: number;
    holes: number;
    vertices: number;
    triangles: number;
  };
  positions: number[];
  indices: number[];
}

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run zone:buildings [-- --write]');
  process.exitCode = 0;
} else if (args.some((argument) => argument !== '--write')) {
  console.error('Expected only the optional --write flag.');
  process.exitCode = 1;
} else {
  try {
    const source = await loadZoneSource(DEFAULT_ZONE_SLUG);
    const first = compileBuildingVolumes(source);
    const second = compileBuildingVolumes(source);
    const firstSerialised = JSON.stringify(first);
    const secondSerialised = JSON.stringify(second);

    if (firstSerialised !== secondSerialised) {
      throw new Error('Repeated building compilation was not byte-stable');
    }

    const mesh = combineBuildingMeshes(first.buildings);
    const preview = createPreview(first, mesh);
    const previewSerialised = `${JSON.stringify(preview)}\n`;
    const writePreview = args.includes('--write');

    if (writePreview) {
      await mkdir(dirname(PREVIEW_PATH), { recursive: true });
      await writeFile(PREVIEW_PATH, previewSerialised, 'utf8');
    } else {
      const existing = await readPreview();
      if (existing !== previewSerialised) {
        throw new Error(
          'The checked-in building preview is stale; run npm run zone:buildings:write'
        );
      }
    }

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
          preview: writePreview ? 'written' : 'current',
          previewSha256: createHash('sha256')
            .update(previewSerialised)
            .digest('hex'),
          footprints: {
            buildings: first.buildings.length,
            ways: preview.statistics.wayFootprints,
            relations: preview.statistics.relationFootprints,
            holes: preview.statistics.holes,
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

function createPreview(
  zone: BuildingVolumeZone,
  mesh: TriangulatedBuildingMesh
): BuildingVolumePreview {
  return {
    schemaVersion: 1,
    slug: zone.metadata.slug,
    label: zone.metadata.label,
    coordinateSystem: {
      units: zone.metadata.coordinateSystem.units,
      x: zone.metadata.coordinateSystem.axes.x,
      y: zone.metadata.coordinateSystem.axes.y,
      z: zone.metadata.coordinateSystem.axes.z
    },
    bounds: calculateBounds(mesh.positions),
    statistics: {
      buildings: zone.buildings.length,
      wayFootprints: zone.buildings.filter((building) => building.source.type === 'way')
        .length,
      relationFootprints: zone.buildings.filter(
        (building) => building.source.type === 'relation'
      ).length,
      holes: zone.buildings.reduce(
        (total, building) => total + building.footprint.rings.length - 1,
        0
      ),
      vertices: mesh.vertexCount,
      triangles: mesh.triangleCount
    },
    positions: mesh.positions,
    indices: mesh.indices
  };
}

function calculateBounds(positions: number[]): BuildingVolumePreview['bounds'] {
  const bounds = {
    minimumX: Infinity,
    maximumX: -Infinity,
    minimumY: Infinity,
    maximumY: -Infinity,
    minimumZ: Infinity,
    maximumZ: -Infinity
  };

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (x === undefined || y === undefined || z === undefined) {
      throw new Error('Building preview mesh contains an incomplete position');
    }
    bounds.minimumX = Math.min(bounds.minimumX, x);
    bounds.maximumX = Math.max(bounds.maximumX, x);
    bounds.minimumY = Math.min(bounds.minimumY, y);
    bounds.maximumY = Math.max(bounds.maximumY, y);
    bounds.minimumZ = Math.min(bounds.minimumZ, z);
    bounds.maximumZ = Math.max(bounds.maximumZ, z);
  }

  if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
    throw new Error('Building preview mesh has invalid bounds');
  }
  return bounds;
}

async function readPreview(): Promise<string> {
  try {
    return await readFile(PREVIEW_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      'The checked-in building preview is missing; run npm run zone:buildings:write',
      { cause: error }
    );
  }
}

function roundOutput(value: number): number {
  return Number(value.toFixed(6));
}
