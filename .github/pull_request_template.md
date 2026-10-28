## Summary

<!-- What changes and why. One issue per pull request. -->

Fixes #

## Checks

<!-- Tick what you ran locally. CI runs the full set. See CONTRIBUTING.md for what needs Docker. -->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build` (and `next-env.d.ts` restored)
- [ ] `python3 -m unittest discover -s workers -p '*test*.py'` on Python 3.12
- [ ] `npm run test:e2e` against local Supabase
- [ ] Database checks: `node scripts/database-security.mjs`, `test-admin.mjs`, `test-publication.mjs`, `test-retention.mjs`, `test-budget-context.mjs` and the `scripts/*-security.sql` regressions CI runs
- [ ] Only these browser specs, with `HISAAB_BROWSER_DATA_MODE=local`:

**Not run, and why:**

## Tests

- [ ] Adds or updates a test that fails without this change

## Data, privacy and licensing

- [ ] No credentials, populated `.env*` files, source originals, private records or personal data
- [ ] Third-party material includes its source and applicable terms
- [ ] No deployment, DNS, paid-plan or public-release changes

## Screenshots

<!-- For visible changes: desktop (1440×1000) and mobile (390×844). -->
