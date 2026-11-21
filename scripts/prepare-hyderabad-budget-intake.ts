import { readFile, writeFile } from 'node:fs/promises';
import { prepareHyderabadBudgetIntake } from '../src/lib/hyderabad-budget-intake';

const candidatesPath = process.argv[2] ?? 'data/acquisition/state-development/36/candidates.json';
const checkpointPath = process.argv[3] ?? 'data/acquisition/state-development/36/checkpoint.json';
const outputPath = process.argv[4] ?? 'data/acquisition/state-development/36/hyderabad-intake.json';

const [candidates, checkpoint] = await Promise.all([
  readFile(candidatesPath, 'utf8'),
  readFile(checkpointPath, 'utf8'),
]);
const result = prepareHyderabadBudgetIntake(JSON.parse(candidates), JSON.parse(checkpoint));
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(
  JSON.stringify({ valid: true, output: outputPath, funding: result.funding.length }) + '\n',
);
