import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLocalCoordinates } from './local-coordinates';
import { DEFAULT_ZONE_SLUG, loadZoneSource } from './load-zone-source';
import { compileRoadSurfaces } from './road-surfaces';
import type { RoadSurfaceZone } from './types';

const PREVIEW_PATH = fileURLToPath(
  new URL(
    '../../../src/lib/zone/generated/trafalgar-square-road-surfaces.json',
    import.meta.url
  )
);

interface RoadSurfacePreview {
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
    minimumZ: number;
    maximumZ: number;
  };
  statistics: {
    roads: number;
    segments: number;
    polygons: number;
    vertices: number;
    triangles: number;
  };
  positions: number[];
  indices: number[];
}

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run zone:roads [-- --write]');
  process.exitCode = 0;
} else if (args.some((argument) => argument !== '--write')) {
  console.error('Expected only the optional --write flag.');
  process.exitCode = 1;
} else {
  try {
    const source = await loadZoneSource(DEFAULT_ZONE_SLUG);
    const local = compileLocalCoordinates(source);
    const first = compileRoadSurfaces(local);
    const second = compileRoadSurfaces(local);
    const firstSerialised = JSON.stringify(first);
    const secondSerialised = JSON.stringify(second);

    if (firstSerialised !== secondSerialised) {
      throw new Error('Repeated road compilation was not byte-stable');
    }

    const preview = createPreview(first);
    const previewSerialised = `${JSON.stringify(preview)}\n`;
    const writePreview = args.includes('--write');

    if (writePreview) {
      await mkdir(dirname(PREVIEW_PATH), { recursive: true });
      await writeFile(PREVIEW_PATH, previewSerialised, 'utf8');
    } else {
      const existing = await readPreview();
      if (existing !== previewSerialised) {
        throw new Error(
          'The checked-in road preview is stale; run npm run zone:roads:write'
        );
      }
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
          preview: writePreview ? 'written' : 'current',
          previewSha256: createHash('sha256')
            .update(previewSerialised)
            .digest('hex'),
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

function createPreview(surface: RoadSurfaceZone): RoadSurfacePreview {
  const bounds = calculateBounds(surface.mesh.positions);
  return {
    schemaVersion: 1,
    slug: surface.metadata.slug,
    label: surface.metadata.label,
    coordinateSystem: {
      units: surface.metadata.coordinateSystem.units,
      x: surface.metadata.coordinateSystem.axes.x,
      y: surface.metadata.coordinateSystem.axes.y,
      z: surface.metadata.coordinateSystem.axes.z
    },
    bounds,
    statistics: {
      roads: surface.roads.length,
      segments: surface.roads.reduce(
        (total, road) => total + road.inZoneSegmentCount,
        0
      ),
      polygons: surface.polygons.length,
      vertices: surface.mesh.vertexCount,
      triangles: surface.mesh.triangleCount
    },
    positions: surface.mesh.positions,
    indices: surface.mesh.indices
  };
}

function calculateBounds(positions: number[]): RoadSurfacePreview['bounds'] {
  const bounds = {
    minimumX: Infinity,
    maximumX: -Infinity,
    minimumZ: Infinity,
    maximumZ: -Infinity
  };

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const z = positions[index + 2];
    if (x === undefined || z === undefined) {
      throw new Error('Road preview mesh contains an incomplete position');
    }
    bounds.minimumX = Math.min(bounds.minimumX, x);
    bounds.maximumX = Math.max(bounds.maximumX, x);
    bounds.minimumZ = Math.min(bounds.minimumZ, z);
    bounds.maximumZ = Math.max(bounds.maximumZ, z);
  }

  if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
    throw new Error('Road preview mesh has invalid bounds');
  }
  return bounds;
}

async function readPreview(): Promise<string> {
  try {
    return await readFile(PREVIEW_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      'The checked-in road preview is missing; run npm run zone:roads:write',
      { cause: error }
    );
  }
}
