# Repository tools

Run commands from the repository root. Scripts have different risk levels; do not run every script simply because it exists.

| Purpose                    | Tools                                                              | Boundary                                                                                   |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Contributor checks         | `check-publication.mjs`, formatter commands                        | Local review; publication scanning is supplementary to manual inspection                   |
| Schema reference           | `database-reference.mjs`                                           | Read catalog metadata from an explicitly named disposable Docker database; no row export   |
| Local setup                | `configure-local.mjs`                                              | Creates an ignored local environment file; preserves an existing one                       |
| Security/integration tests | `database-security.mjs`, `test-*.mjs`, `*-security.sql`            | Synthetic writes/deletions; disposable local database only                                 |
| Map packaging              | `build-map-overview.mjs`, `export-r2-map.mjs`, `upload-r2-map.mjs` | Separately reviewed data/package work; upload is an external action                        |
| Intake/review preparation  | `prepare-*`, `preserve-*`, `validate-intake.ts`, `render-*`        | May touch originals, storage or review preparation; inspect first                          |
| Hosted operation           | `run-hosted.mjs`, `hosted-read-check.mjs`                          | Not part of ordinary contributor setup; never substitute production credentials into tests |

See [CONTRIBUTING](../CONTRIBUTING.md) for the supported local sequence and CI for the complete validation order. Scripts intended for older deployments are not permission to change current hosting or production data. Keep operational credentials and outputs outside Git.
