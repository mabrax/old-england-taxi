import { acquireZone } from './acquire-zone';
import { createZoneRequest, type GenerationRequest } from './generation-request';
import { buildZone, inspectZone, listSourceIds, verifyAll, verifyZone } from './zone-workflow';
import { loadZoneSource } from './load-zone-source';
import { compileLocalCoordinates } from './local-coordinates';
import { compileRoadSurfaces } from './road-surfaces';
import { combineBuildingMeshes, compileBuildingVolumes } from './building-volumes';

export async function runCli(args: string[]) {
  const [command, ...rest] = args;
  if (!command || args.includes('--help')) {
    console.log(`Local zone generation\n  request|acquire|create --lat N --lon N [--width M --height M --label TEXT]\n  build|inspect|verify|source|coordinates|roads|buildings [zone-id]\nNo ID means all local sources; verify checks the complete catalogue.\ncreate = immutable acquire then offline build. request prints the contract without side effects.`);
    return;
  }
  if (['request', 'acquire', 'create'].includes(command)) {
    const input = parseCoordinates(rest);
    if (command === 'request') return createZoneRequest(input);
    const acquired = await acquireZone(input);
    if (command === 'create') return { acquisition: acquired, build: await buildZone(acquired.id) };
    return acquired;
  }
  if (!['build','inspect','verify','source','coordinates','roads','buildings'].includes(command) || rest.length > 1) throw new Error('Invalid command/arguments; use --help');
  if (command === 'verify' && !rest.length) return verifyAll();
  const ids = rest.length ? rest : await listSourceIds();
  const output = [];
  for (const id of ids) {
    if (command === 'build') output.push(await buildZone(id));
    else if (command === 'verify') output.push(await verifyZone(id));
    else if (command === 'inspect') output.push(await inspectZone(id));
    else {
      const source = await loadZoneSource(id);
      if (command === 'source') output.push({ id, counts: source.counts, manifest: source.manifest });
      else {
        const local = compileLocalCoordinates(source);
        if (command === 'coordinates') output.push({ id, coordinateSystem: local.metadata.coordinateSystem, points: local.points.length, lines: local.lines.length });
        else if (command === 'roads') {
          const first = compileRoadSurfaces(local);
          if (JSON.stringify(first) !== JSON.stringify(compileRoadSurfaces(local))) throw new Error('Non-deterministic roads');
          output.push({ id, diagnostics: first.diagnostics, triangles: first.mesh.triangleCount });
        } else {
          const first = compileBuildingVolumes(source, local, { invalidFeaturePolicy: 'report' });
          if (JSON.stringify(first) !== JSON.stringify(compileBuildingVolumes(source, local, { invalidFeaturePolicy: 'report' }))) throw new Error('Non-deterministic buildings');
          output.push({ id, buildings: first.buildings.length, triangles: combineBuildingMeshes(first.buildings).triangleCount });
        }
      }
    }
  }
  return output;
}
export function parseCoordinates(args: string[]): GenerationRequest {
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--lat','--lon','--width','--height','--label'].includes(flag) || args[i + 1] === undefined || values[flag] !== undefined) throw new Error('Invalid, missing or duplicate coordinate option');
    values[flag] = args[i + 1];
  }
  const number = (flag: string) => {
    if (!values[flag]?.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(values[flag])) throw new Error(`Expected numeric ${flag}`);
    return Number(values[flag]);
  };
  return { latitude: number('--lat'), longitude: number('--lon'),
    ...(values['--width'] === undefined ? {} : { widthMetres: number('--width') }),
    ...(values['--height'] === undefined ? {} : { heightMetres: number('--height') }),
    ...(values['--label'] === undefined ? {} : { label: values['--label'] }) };
}
