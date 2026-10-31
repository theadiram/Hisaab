import { test, expect } from './preview-fixture';
import { readFile } from 'node:fs/promises';

test('actual catalogue is the default and collection counts do not expose pending evidence', async ({
  page,
  request,
}) => {
  const saved = JSON.parse(await readFile('data/nationwide-ingestion.json', 'utf8'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore India', exact: true }).click();
  await page.getByRole('button', { name: 'Evidence progress and data acquisition' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Every purpose. Across India.');
  const response = await request.get('/api/v1/ingestion');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const data = await response.json();
  expect(data.publication).toBe('pending_review');
  expect(data.progress.hostedCandidatesProcessed).toBe(saved.hostedCandidatesProcessed);
  expect(data.progress.statePartitions).toHaveLength(saved.statePartitions.length);
  const geography = JSON.parse(await readFile('data/geography-status.json', 'utf8'));
  expect(data.geography.districtsExpected).toBe(geography.districtsExpected);
  expect(data.geography.matchingCandidates + data.geography.unmatchedCandidates).toBe(
    saved.normalizedCandidates,
  );
  expect(Object.keys(data.geography).sort()).toEqual(
    [
      'districtsExpected',
      'statesExpected',
      'registryDate',
      'sourceUrl',
      'matchingCandidates',
      'unmatchedCandidates',
      'districtsWithCandidateMatches',
      'hostedRegistryImported',
    ].sort(),
  );

  expect(Object.keys(data.progress).sort()).toEqual(
    [
      'retrievedAt',
      'sourceUrl',
      'uniqueSourceWorks',
      'withinYearWindow',
      'normalizedCandidates',
      'hostedCandidatesProcessed',
      'statePartitions',
    ].sort(),
  );
  for (const state of data.progress.statePartitions) {
    expect(Object.keys(state).sort()).toEqual(
      ['state', 'status', 'uniqueSourceWorks', 'withinYearWindow'].sort(),
    );
  }
  expect(JSON.stringify(data)).not.toMatch(
    /sha256|rawText|storage_path|parserHash|"quarantine"|documentHash/,
  );
});
