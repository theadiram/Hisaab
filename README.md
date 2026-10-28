# Hisaab

Hisaab is an evidence-led development atlas for India. Its public interface has three exploration screens: a clean satellite India opening, a state funding/development card and an asset/project receipt. Programme evidence, documented roles, sources, observations and private tracking open inside panels; the MFA owner console remains separate.

Current holdings include **812,976 preserved historical locations**, **86 reviewed PIB funding facts** and **zero published project/payment cards**. Historical locations and transfers do not establish individual project spending. Funding, reviewed projects and historical locations are independent map layers. Missing amounts remain unknown. Public release is blocked in the application.

See [the implemented design and screenshots](docs/rebuild-design.md), [delivery status](docs/rebuild-status.md), [short data brief](docs/data-needed-brief.md) and [collector contract](docs/data-acquisition-contract.md).

## Development

Node 24; install with `npm ci`. Copy `.env.example` to `.env.local`, configure local Supabase and a persistent encryption key. Never commit populated environment files. `npm run dev` serves the private preview on localhost. For the configured hosted database, run `npm run dev:hosted`; credentials remain in ignored `.env.hosted`. Local Supabase can be started with the installed CLI; see `supabase/config.toml` and [implementation status](docs/implementation-status.md).

Use `npm run build:hosted` followed by `npm run start:hosted` for a production preview connected to the configured hosted database. Browser keys are embedded at build time, so a local-database build cannot be reused as a hosted release. Repository CI uses disposable local credentials; the Netlify build needs the hosted environment configured separately.

Validation: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `python3 -m unittest discover -s workers -p '*test*.py'`. Database access checks: `node scripts/database-security.mjs`; MFA and publication regression: `node scripts/test-admin.mjs` and `node scripts/test-publication.mjs`; catalogue/map regression: pipe `scripts/catalogue-security.sql` into local Postgres; publication policy regression: pipe `scripts/publication-security.sql` into local Postgres. The latter runs in a transaction and rolls back its disposable fixtures. Release audit: `npm run release:check` must fail until the published coverage gates are satisfied.

Source revocation regression: run `scripts/source-invalidation-security.sql` against disposable local Postgres; it rolls back all fixtures. `npm run intake:validate -- /absolute/path/batch.json` validates a collector package without staging or publishing it. The prepared 36 state/UT jobs are handoffs; no collector is dispatched by that command.

Source route health: `npm run sources:check` requests each distinct `data/source-register.json` URL, cancels the body after the response headers and prints a table. Add `-- --json` for machine-readable output, `-- --only pmay,mplads` to recheck selected routes or `-- --resolver 1.1.1.1` to send its DNS lookup to a named resolver. It never disables certificate verification; an unreachable route is retried once by default and never more than twice (`--retries 0`–`2`). Only NXDOMAIN, certificate failures and HTTP 404/410 are definitive, and they set exit code 1. Timeouts, refused or reset connections, SERVFAIL and 401/403/5xx are inconclusive: some official hosts may not answer from outside India or without a browser session, so recheck from India before recording a route as moved. The register's URLs are preserved provenance; the checker doesn't edit them.

Hosted geography uses `HISAAB_GEOGRAPHY_MANIFEST`, immutable PMTiles archives and checksum-verified detail bundles. Build/package/upload/audit scripts are in `scripts/*geography*`. They preserve every source point at encoded zooms 0–9 and exact original receipt coordinates. Source drawing coordinates are quantized; they are not verified building footprints. The local SQLite store, private originals and credentials are excluded from production tracing. Configure the hosted manifest for deployment; do not package the 330 MB local fallback into server functions.

## Data and privacy

Amounts retain exact decimals and original units. Conflicting copies of the same financial event, uncited facts and cumulative snapshots are excluded from transaction totals. Source originals are checksummed; publication requires review. Official completion is distinct from independent physical verification.

Private reports use random capability links, hashed lookup identifiers and encrypted payloads. Tokens are exchanged for short-lived HttpOnly cookies and removed from the address bar. Photographs have encrypted originals and private metadata-stripped derivatives. PDF attachments preserve encrypted original bytes and require the owning case session. Videos use encrypted resumable chunks, checksum validation and case-only playback. Administrator review requires an active protected membership and authenticator MFA. No authority filing is implied by saving an observation or generating a draft.

Collector originals and components stay private. Explicit evidence, rights and accounting decisions are required for publication. Source-rights revocation withdraws related snapshots and never silently restores them. Transfers received by a state remain separate from development physically attributed to it. Joint shares and combined headlines require documentary reconciliation.

Complaint email dispatch is disabled until a dedicated verified Hisaab sender is configured. Accepted channels need current policy, exact citizen consent and owner review. CPGRAMS is a citizen portal route. An email provider receipt is not official registration; owner acknowledgement needs the original same-case document.

## Deployment

Target: Supabase in the separate Hisaab organisation and Netlify frontend; intended domain `adiram.me`. The hosted Supabase database is configured and verified. Delivery order is implementation and validation, GitHub upload and passing CI, then repository-connected Netlify staging. Direct-folder deployment is disabled. Netlify deployment and DNS cutover have not happened. Do not activate paid plans, change DNS, enable public release or populate unverified records as part of routine development.

## Open-source license

Hisaab’s original source code and project documentation are licensed under the [MIT License](LICENSE). You can use, modify, and redistribute them, including commercially, while preserving the copyright and license notice.

Original code and documentation contributions are submitted under the MIT License unless explicitly agreed otherwise. Government records, datasets, maps, photographs, dependencies, and other third-party material retain their own terms and attribution requirements. See [licensing details](LICENSING.md).
