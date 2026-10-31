import { readFile } from 'node:fs/promises';
import { validateIntake } from '../src/lib/intake-contract';
const file = process.argv[2];
if (!file) throw new Error('Supply an intake JSON file');
try {
  const result = validateIntake(JSON.parse(await readFile(file, 'utf8')));
  process.stdout.write(JSON.stringify({ valid: true, ...result.summary }) + '\n');
} catch (e) {
  process.stderr.write('Package rejected: ' + (e as Error).message + '\n');
  process.exitCode = 1;
}
