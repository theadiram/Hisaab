# Contributing to Hisaab

Hisaab accepts code, documentation and data-source contributions. Read the [README](README.md) first. This guide covers setup, the checks CI runs, what works without a database, and what reviewers expect. Report security problems privately as described in [SECURITY.md](SECURITY.md), never in a public issue.

## Before you start

- Find or open an issue before starting anything larger than a small fix. One issue per pull request.
- For data, open a data source issue before collecting anything. See [Data contributions](#data-contributions).
- Code contributions: the project uses a Next.js release whose APIs and conventions differ from older versions. Before changing application code, read the relevant guide in `node_modules/next/dist/docs/`, as [AGENTS.md](AGENTS.md) describes.
- Routine contributions do not change deployment, DNS, paid plans or the public release gate (`HISAAB_PUBLIC_RELEASE`). They do not populate unverified records either. See the README's Deployment section.

## Setup

Use **Node 24**, the version CI and Netlify use. Other versions are untested. The pinned vitest declares support for Node 22.12+, 24 and 26+, which excludes Node 25.

```sh
npm ci
```

These commands need no `.env.local` and no database:

```sh
npm run typecheck
npm test          # vitest, about 180 tests, under a second
npm run build
```

When `HISAAB_DATA_MODE` is unset or set to anything other than `supabase`, the application reads local file data from the repository.

To view the atlas in `npm run dev`, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` to a public Mapbox token (it starts with `pk.`). See [Mapbox setup](docs/mapbox-setup.md). Never use a secret `sk.` token. Without a token the atlas shows a fallback message and the list views still work. Never commit populated environment files.

The README's full setup adds local Supabase and a persistent encryption key. You need it for the database-backed paths: private case storage and media, the owner console, publication and the default browser test suite.

### What works without Supabase

| Works with local file data | Needs local Supabase (Docker) |
|---|---|
| `npm run typecheck`, `npm test`, `npm run build` | `npm run test:e2e` as CI runs it |
| Python worker tests | `node scripts/database-security.mjs`, `test-admin.mjs`, `test-publication.mjs`, `test-retention.mjs`, `test-budget-context.mjs` |
| `npm run dev`: atlas and overview bubbles (with a Mapbox token), cards, panels | The SQL regressions in `scripts/*-security.sql` |
| Map and layout browser specs with `HISAAB_BROWSER_DATA_MODE=local` (see below) | Private case storage and media, owner console and MFA |

Individual location dots at zoom 6 and above come from either the hosted geography manifest (`HISAAB_GEOGRAPHY_MANIFEST`) or the private local store `data/acquisition/geography/assets.sqlite`. Neither ships with the repository. Without one of them, `/api/v1/geography` returns 503 and no individual dots appear. This is expected, not a bug. The overview bubbles from `public/geography/overview` still render, and the browser specs stub the detailed responses.

### Python workers

CI runs the workers on Python 3.12. The pinned `pyproj` and `shapely` publish wheels only up to Python 3.14. On newer versions pip tries to build them from source. Use a 3.12 virtual environment outside the repository:

```sh
python3.12 -m venv ~/.venvs/hisaab
source ~/.venvs/hisaab/bin/activate
python -m pip install -r workers/requirements.txt
python -m unittest discover -s workers -p '*test*.py'
```

### Browser tests

`npm run test:e2e` runs Playwright against a loopback Supabase instance and refuses remote database URLs. Start one with `npx supabase start` (needs Docker), then follow [browser tests](docs/browser-tests.md). The runner starts its own server on `http://127.0.0.1:3000` and will not reuse an existing one, so that port must be free.

Playwright needs its pinned Chromium (`npx playwright install chromium`). Alternatively, use an installed Google Chrome with `HISAAB_BROWSER_CHANNEL=chrome`.

For map and layout work without Docker, opt in to local file data:

```sh
HISAAB_BROWSER_DATA_MODE=local npm run test:e2e -- tests/browser/map-overview.spec.ts
```

Only the exact value `local` changes the mode. Without it, the suite uses Supabase. In local mode the map, card, content-mode, spending, state-development and preview specs pass. The specs that need the database fail: complaint videos, private photographs and case updates, acknowledgement PDFs, administrator MFA and funding privacy. A few other privacy specs pass in local mode, but those passes say nothing about the Supabase path, so don't report them as verified. CI always runs the full suite against Supabase.

## Checks

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs these on every push and pull request:

1. Database checks against a disposable local Supabase: `node scripts/database-security.mjs`, `scripts/publication-security.sql`, `scripts/source-invalidation-security.sql`, `node scripts/test-admin.mjs`, `node scripts/test-publication.mjs`, `node scripts/test-retention.mjs`, `node scripts/test-budget-context.mjs`, `scripts/catalogue-security.sql`
2. `npm run typecheck`
3. `npm test`
4. `python3 -m unittest discover -s workers -p '*test*.py'` on Python 3.12
5. `npm run build`
6. `npm run test:e2e`

Run what you can locally and say what you didn't run. A first-time contributor's CI run may wait for maintainer approval.

## Pull requests

- Branch from the current `main`. Keep the change to one issue and leave out unrelated formatting, refactors and dependency updates.
- Add or update a test that fails without your change and passes with it. Unit tests live in `tests/*.test.ts`, browser specs in `tests/browser/` and worker tests in `workers/`.
- In the description, link the issue, list the checks you ran, and state which checks you didn't run and why (for example, "database checks not run: no Docker").
- For visible changes, include desktop and mobile screenshots. The browser projects use 1440×1000 and 390×844.
- Before committing, check `git status`. `npm run build` rewrites `next-env.d.ts`. Unless your change needs it, restore it with `git checkout -- next-env.d.ts`.
- Write commit subjects as short imperative sentences, matching the history (for example, "Keep renderer checks conditional on CI map configuration").
- Never commit credentials, populated `.env*` files, source originals, private records or personal data.

## Data contributions

Data is the hardest part of Hisaab. Start with the [short data brief](docs/data-needed-brief.md) and the [collector contract](docs/data-acquisition-contract.md). They define the evidence chain: funding, named project, actual location, contract, bill/payment, recipient, completion evidence. They also set the rules: unknown is not zero, and links come from official identifiers or documented crosswalks, never from similar names, nearby coordinates or matching amounts.

1. **Open a data source issue first.** Name the source, custodian, jurisdiction, years, available fields and reuse terms. The maintainer can then say whether it fits the current scope and how to hand records over.
2. **Validate packages locally.** `npm run intake:validate -- /absolute/path/batch.json` checks a `hisaab-intake/1` package against the [schema](docs/data-intake/hisaab-intake.schema.json) and the runtime join, unit and allocation rules. It does not stage or publish anything.
3. **Originals and batches go through the maintainer's private review.** They are uploaded, checksum-verified and reviewed in the MFA-protected owner console before anything is published. Don't attach them to issues or pull requests. Agree the handover route in the issue.

Don't commit source originals, intake batches containing collected records, credentials or personal data. Don't collect bank account numbers, Aadhaar numbers, passwords or unnecessary private details. Collection doesn't authorize publication, emails to authorities, RTI filing, paid access or bypassing access controls and CAPTCHAs. Prepare drafts and record blockers in the issue instead.

Changes to code, the schema, the validator or documentation in `docs/` are ordinary pull requests.

## Licensing

Hisaab's original code and documentation are licensed under the [MIT License](LICENSE). Unless explicitly agreed otherwise, contributions of original code and documentation are submitted under the MIT License. You must have the right to submit your work.

Government records, datasets, maps, photographs, fonts, dependencies and other third-party material keep their own licenses and attribution requirements. Include the source and applicable terms with any such material. See [LICENSING.md](LICENSING.md).
