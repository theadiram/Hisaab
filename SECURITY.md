# Security policy

Hisaab handles private observations, encrypted photographs, videos and PDF evidence, capability links and an MFA-protected owner console. A vulnerability in any of them can expose people who reported in confidence.

## Reporting a vulnerability

Report vulnerabilities privately. Don't put a suspected vulnerability or its details in a public issue, pull request, discussion or comment.

**Private contact:** _TODO (maintainer): choose the private reporting route before merging, for example GitHub private vulnerability reporting or a dedicated security address, and replace this line._

If no private route is listed above, open a public issue that says only that you have a security report and asks for a private contact. Don't include any details.

Please include:

- the affected route, page, script or migration, and the commit you tested;
- steps to reproduce against a local instance;
- the impact: what an attacker could read, change or delete;
- whether you saw or kept anyone else's data. If you did, say what it was and delete it.

Never include a real private report link, capability token, cookie or credential. Capability links grant access to a case.

## Scope

In scope: code and configuration in this repository, including private report links and cookie exchange, encrypted media, owner console authentication and MFA, publication and release gates, database policies in `supabase/migrations`, intake validation and the browser-test guard against remote databases.

Report problems in Supabase, Netlify, Mapbox or other dependencies to their maintainers. If Hisaab's use of a dependency is what makes it exploitable, report that here.

## Testing

Test against your own local instance. Don't scan, load-test or attack `adiram.me` or the hosted database. Don't access, change or keep other people's data, and don't use social engineering. Allow time for a fix before any public disclosure, and agree the date with the maintainer.

Only the current `main` branch is supported.
