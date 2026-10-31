<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# Hisaab development rules

- Start with CONTRIBUTING.md, docs/architecture.md and docs/database.md. Dated research is not a current operating instruction.
- Use a feature branch and focused PRs. Preserve unrelated local edits; never bypass main protection.
- Test against disposable local services. Never reset a database holding work or use production credentials for tests.
- Preserve the migration write pause and public/private service separation. Deployment and data publication are separate tasks.
- Keep source identity, evidence uncertainty, exact financial stages and reuse limits intact. Refactoring must not create new claims.
- Do not commit credentials, backups, private originals, citizen records, account captures or personal agent memory. Review generated files and logs before publication.
- Use readable formatting. Separate formatting, bug fixes and structural changes. Avoid abstractions without a concrete maintenance benefit.
- Run relevant checks and report their actual results. Do not claim full CI is passing from a scoped local test.
- Do not rewrite applied SQL migrations. Generate the schema reference from a disposable database after intentional schema changes.
