# Contributing to Hisaab

Hisaab connects public development records to places and projects. We welcome developers, researchers, designers, accessibility testers, public-finance specialists and legal professionals.

Start with the [four contribution priorities](docs/contribution-priorities.md), [architecture](docs/architecture.md) and [database guide](docs/database.md). Join [Discord](https://discord.gg/A4gMtx38z) to discuss a proposal. Security findings belong in the private process described in [SECURITY.md](SECURITY.md).

## Choose a bounded change

Check existing issues and pull requests before starting. For a substantial change, describe the problem and approach first. Keep formatting, behavior changes, dataset additions and deployment work in separate pull requests. Use a feature branch; `main` requires review and validation.

A useful proposal states:

- The user or contributor problem, with reproduction steps or source evidence.
- The proposed result and how we will know it works.
- Dependencies, privacy concerns, licensing and limitations.
- What is deliberately outside the change.

## Local development

Use Node.js 24, Python 3.12 and Docker with enough space for the local Supabase images. The checked-in Supabase CLI dependency provides the development database; it does not require production access.

```sh
npm ci
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r workers/requirements-dev.txt
```

Start a **disposable development project**, not a restored production database. Check for existing local containers and volumes before using the default project name in `supabase/config.toml`. If they contain work, create a separate checkout/configuration with a different Supabase project ID and unused ports. Never reset an existing database to make tests pass.

```sh
npx supabase start -x studio,realtime,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit
node scripts/configure-local.mjs
npm run dev
```

`configure-local.mjs` creates a private `.env.local` from local service configuration and preserves any existing file. If it already exists, check its configuration yourself; do not replace it with production values. Browser tests reject remote database URLs. The application runs on `http://127.0.0.1:3000`.

A fresh database has no approved government projects. Missing historical geography should appear unavailable, not as invented dots. Browser tests supply clearly synthetic map fixtures. The full private acquisition dataset is not needed for normal contributions.

## Checks

```sh
npm run check:publication
npm run format:check
ruff format --check workers scripts
npm run typecheck
npm test
python -m unittest discover -s workers -p '*test*.py'
npm run build
npx playwright install chromium
npm run test:e2e
```

For a differently named disposable project, set `HISAAB_TEST_DATABASE_CONTAINER=supabase_db_<project>` for Node integration scripts and `TEST_SUPABASE_URL=http://127.0.0.1:<local-api-port>` for browser tests. SQL checks must target that same explicit container.

Database integration checks also live in `scripts/` and `.github/workflows/ci.yml`. They use disposable local services and include owner MFA, private-file isolation, publication and withdrawal checks. Some scripts create or delete synthetic records; do not run them against databases holding work you need to preserve. CI's required `validate` job is the complete acceptance gate.

Use `npm run format` and `ruff format workers scripts` for intentional formatting changes. Check the diff before committing. Keep applied SQL migrations, source originals and generated datasets out of mechanical formatting changes.

## Evidence and privacy rules

- Preserve source identity, dates, hashes, units and exact record locators.
- Distinguish allocation, release, expenditure, contract and payment. Do not count a transfer and downstream payment twice.
- Verify individual claims. A source-backed project identity does not establish payment or physical completion.
- Keep unknown values unknown. Do not infer payment, precise location or completion from similar names or amounts.
- Use synthetic fixtures in tests. Do not submit citizen reports, private originals, credentials, account captures or personal chat/agent memory.
- Third-party records retain their own reuse terms; the code's MIT license does not relicense them.

## Pull requests

Explain the problem, change, checks and remaining limitations. Include screenshots for interface changes, using synthetic data. Review logs and screenshots for private information before attaching them. A maintainer reviews contributions before merge; merging code is separate from deploying the VPS or approving data publication.
