# Hisaab

**Hisaab is a community-built, evidence-led atlas for exploring public development and funding in India.** We connect public records to places and projects, show where the evidence comes from, and make gaps visible instead of filling them with guesses. We want people to build it together in the open.

The project is being built in the open. Designers, developers, researchers, data contributors, writers, and testers are welcome. You do not need to be an expert to make a useful contribution.

> **Data and map coverage are incomplete.** Hisaab includes 812,976 preserved historical location records. These are not a verified count of current assets, completed works, or project payments. A mapped location, budget allocation, tender, reported status, or contract amount does not by itself prove that a project was paid for or completed. Read the source and its limits before drawing conclusions.

## Start here

- [Four contribution priorities](docs/contribution-priorities.md): legal protection, data verification, features, and mobile/accessibility/performance.
- [Contributor setup and checks](CONTRIBUTING.md)
- [Current architecture](docs/architecture.md) and [database guide](docs/database.md)
- [Private security reporting](SECURITY.md)

## How to help

Choose the kind of contribution that suits you:

- **Design and accessibility:** make the map and cards easier to understand, navigate, and use on different screens.
- **Features and engineering:** pick an issue, discuss the approach, and send a pull request.
- **Data research:** find official public records and document exactly what each source supports.
- **Testing:** try the site on different devices and report clear steps to reproduce a problem.
- **Writing and documentation:** improve setup instructions, explain a feature, or help new contributors get started.

### First contribution

1. Browse the repository’s open issues and discussions. If your idea is not listed, open an issue describing the problem or source you found.
2. For a substantial change, discuss the approach with the maintainers before starting. This helps coordinate work and keeps contributions aligned with Hisaab’s evidence and privacy standards.
3. Fork the repository or create a separate branch. Do not push directly to the default branch.
4. Make a focused change and include relevant screenshots, source links, or notes on how you checked it.
5. Open a pull request explaining what changed, why it helps, and anything reviewers should pay attention to. A maintainer will review it with you before it is merged or published.

New to open source? Open an issue and say what you are interested in—design, code, research, data, writing, or testing. We can help find a good first task.

## Contributing data

Data contributions should make it easier for another person to find and check the original evidence. Include:

- The original public source URL and the publishing authority
- State or union territory, district, department, and financial year, when available
- The exact page, table, row, record ID, or query used
- The source’s publication date or reporting period
- The amount exactly as reported, with its units and accounting meaning
- Any relevant limitation, ambiguity, correction, or mismatch

Keep financial stages separate. A budget allocation is not a release; a release is not a project payment; a tender or contract amount is not proof of payment; a reported completion status is not independent confirmation of the work’s condition. Do not infer a missing amount, date, location, payment, or completion. Mark it unknown and explain what evidence would be needed to establish it.

Contributors may identify and prepare evidence, but **adding a source or opening a pull request does not automatically approve it for publication**. Hisaab’s review process checks source identity, what the source actually says, links between records, accounting scope, location precision, reuse rights, and any conflicts before publishing a claim.

See the [data acquisition contract](docs/data-acquisition-contract.md), [data coverage audit](docs/data-coverage-audit-2026-10-25.md), and [state development status](docs/state-development-current-status.md) for current scope and known gaps. Counts are dated and scoped; records from different collections may overlap and must not be added together as one total.

## Privacy and safe contributions

- Only contribute material that is public and permitted to share.
- Do not commit passwords, API keys, populated environment files, private source originals, or personal information.
- Do not publish private intake records or add unreviewed candidate data directly to the public catalogue.
- If you find a security or privacy issue, do not post exploit details publicly. Contact the maintainers privately through the repository owner’s GitHub profile.

## Run Hisaab locally

### Requirements

- Node.js 24
- npm
- A local Supabase instance for features that need the database

### Setup

```bash
npm ci
cp .env.example .env.local
```

Configure `.env.local` with local development values only. Never commit it. Follow the [contributor guide](CONTRIBUTING.md) for disposable local database setup. The dated implementation-status document is historical. Then start the development server:

```bash
npm run dev
```

The app runs at `http://localhost:3000`. Do not use hosted production credentials for local development or publish data as part of testing.

### Useful project commands

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
python3 -m unittest discover -s workers -p '*test*.py'
```

Run the checks relevant to your change and note their results in your pull request. Some database checks require a running local Supabase instance; see the implementation status document for details. Do not run deployment, release, or data publication commands as part of routine contribution work.

Current hosting uses a VPS application and public catalogue, SQLite historical geography and R2 map delivery. Supabase authentication/private services remain retained during migration; application writes are paused. GitHub merges do not automatically deploy production. See the [architecture guide](docs/architecture.md).

## Project background

- [Data needed and collection brief](docs/data-needed-brief.md)
- [Data acquisition contract](docs/data-acquisition-contract.md)
- [Data coverage audit](docs/data-coverage-audit-2026-10-25.md)
- [State development collection status](docs/state-development-current-status.md)
- [Implementation status](docs/implementation-status.md)
- [Design and screenshots](docs/rebuild-design.md)

## Open-source license

Hisaab’s original source code and project documentation are licensed under the [MIT License](LICENSE). You can use, modify, and redistribute them, including commercially, while preserving the copyright and license notice.

Original code and documentation contributions are submitted under the MIT License unless explicitly agreed otherwise. Government records, datasets, maps, photographs, dependencies, and other third-party material retain their own terms and attribution requirements. See [licensing details](LICENSING.md).

Thank you for helping make Hisaab more useful, understandable, and trustworthy.
