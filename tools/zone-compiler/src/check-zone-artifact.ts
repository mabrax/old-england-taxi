import { runCli } from './cli';
try {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  console.log(JSON.stringify(await runCli([write ? 'build' : 'verify', ...args.filter(arg => arg !== '--write')]), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
