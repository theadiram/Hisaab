// Netlify skips a build on exit 0. Unknown comparisons always build.
import { execFileSync } from 'node:child_process';
const previous = process.env.CACHED_COMMIT_REF,
  current = process.env.COMMIT_REF;
if (!previous || !current) {
  console.log('Build: no previous deploy comparison.');
  process.exit(1);
}
try {
  const files = execFileSync('git', ['diff', '--name-only', previous, current, '--'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
  // Skip only known non-runtime files. New or unfamiliar inputs must build.
  const runtime = files.some(
    (file) =>
      !(
        /^(docs\/|tests\/|\.github\/)/.test(file) ||
        /^[^/]+\.md$/.test(file) ||
        ['LICENSE', 'LICENSE.md', 'vitest.config.ts', 'playwright.config.ts'].includes(file)
      ),
  );
  console.log(
    runtime ? 'Build: website inputs changed.' : 'Skip: documentation/test-only changes.',
  );
  process.exit(runtime ? 1 : 0);
} catch {
  console.log('Build: change comparison unavailable.');
  process.exit(1);
}
