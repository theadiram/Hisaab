# A practical evidence-publication path

25 October 2026. This review makes no publication or owner evidence decisions.

## Main finding

Hisaab does not need to wait until every work has a payment and a completion certificate before showing meaningful real project evidence. The current model, API validation and latest publication SQL already permit an evidence-limited project whose contract or sanction is verified while payment is unknown and completion is pending.

The earlier statement “zero publishable dots” was too broad if interpreted as “no useful source-backed map output can be shown.” Zero complete payment-backed cards is a narrower statement. Historical locations, documented projects, financial events and completed works need distinct descriptions and counts.

This does not make the current candidate queues automatically publication-ready. Every actual project dot still needs a reviewed documentary site association, reconciled project/district identity, original source/reuse evidence and explicit owner approval. A label such as `source_point` alone does not prove that the coordinate belongs to the project.

## Current rules, verified in this checkout

The relevant implementation is:

- `src/lib/validation.ts`: all four stages must be represented; `missing`, `pending`, `inaccessible`, `conflicting` and `not_applicable` are valid states. It does not require all stages to be `found`.
- `src/lib/publication-evidence.ts`: a stage marked `found` needs explicit verified review and receipts. A found completion needs its reported/certificate basis. An approved individual payment needs its source reference, date, allocated project and amount, recipient, flow and gross/net meaning.
- `src/app/api/v1/admin/review/route.ts`: requires owner MFA, documented confirmation, an existing candidate and the above validation before the publication RPC.
- `supabase/migrations/20261006193637_explicit_evidence_publication.sql`: the effective `publish_reviewed_candidate` requires a pending real candidate, exact reconciled payload, permitted preserved originals, approved source and district, and evidence checks. It does not demand a payment or certificate when those claims are absent.
- `supabase/migrations/20261011180000_atlas_review_safeguards.sql`: replaces `private.assert_publication_evidence`, preserving missing-stage support and requiring dates for approved individual payments, plus party/media source checks.
- `supabase/migrations/20261005182957_withdrawn_publications.sql`: `published_work_receipts` shows the latest approved, non-withdrawn snapshot. It adds no all-stages-found requirement.
- The map functions in `20261006161459_viewport_work_clusters.sql` and `20261011170000_atlas_intake_and_development.sql` additionally require a source-point/address coordinate for map display. An unlocated project can be a receipt/catalogue record without becoming a precise map dot.

There is no `can_publish_work` or `validateWorkPublication` symbol in the checked-in implementation. These conclusions come from the actual functions above. The SQL was inspected statically; the database functions were not executed against hosted or local Postgres in this task.

## Publish the claim that the evidence supports

| Output                               | Evidence and wording                                                                                                        | What must remain unknown                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Historical location                  | “Historical source location, 2022 archive; source coordinates.” Preserve exact archive attribution and record identity.     | Current existence/status, project identity, spending, completion and independently verified physical location |
| Documented tender                    | “Official tender notice” only when the notice, work identity and site are evidenced.                                        | Contract award, payment and completion                                                                        |
| Documented sanction/contract project | Exact source work identity, reviewed geography, verified approval/contract facts, original amount units and source receipts | Any payment/completion stage not documented                                                                   |
| Source-reported payment              | Exact source payment identity, dated status, allocated amount, recipient role and gross/net meaning                         | Independent recipient credit unless separately established                                                    |
| Reported completion                  | Official status/date with explicit reported basis                                                                           | Certificate-backed completion and independent physical inspection                                             |
| Certificate-backed completion        | Actual work-linked certificate, locator/date and review                                                                     | Independent field verification unless separately acquired                                                     |

A current funded or contracted work can therefore be useful without pretending it is fully paid or physically finished. Do not place a district summary at its centroid and call it a project site. Do not copy a contract value into paid money. Public money totals must continue to exclude unapproved, cumulative, conflicting and transfer records under the existing rules.

## New concrete verification completed

`workers/evidence_publication_audit.py` now verifies the historical map provenance independently of the older summary files:

- All **58 original archives**, totalling **50,652,495 bytes**, match both their manifest SHA-256 checksums and file sizes.
- All **58 SQLite source metadata records** exactly match the archive manifest.
- All **812,976 accepted map records** join to preserved source references. They use **45** of the 58 archives; empty proposal archives need not contribute an accepted feature.
- No accepted coordinate falls outside global longitude/latitude bounds. This is a range check, not a check of actual site identity or national boundary membership.
- **47 records retain text-encoding review flags**. Do not silently relabel or “correct” source text.

The official [PIB GIS release](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1800373) was checked again on 25 October. It describes the GIS data release, names the DataMeet collaboration and states the Government of India Open Data License basis. This is a useful rights/provenance basis for the historical layer. It does not certify individual sites or connect those locations to spending.

The live [NHIDCL policy](https://www.nhidcl.com/en/website-policies) was also checked. It allows accurate attributed reproduction while excluding designated third-party materials. This is not an automatic permission decision for every linked source or photograph; document-specific provenance/attribution checks remain necessary.

The saved NHIDCL review packet has **232 source comparison records** and **184 contract-facts-first candidates**, but **zero reviewed exact locations** and **zero verified payment-evidence flags** in that packet. These are candidates for project review, not 184 publication-ready dots. They overlap other candidate registers.

Aggregate output and all archive check results: `data/acquisition/first-dots/publication-path-audit-2026-10-25.json`.

## An existing validation gap, kept separate from the proposed path

The base schema and evidence function currently also accept a structurally valid work with all four stages pending, no receipts and no money. They verify claims when present, but do not require a minimum meaningful claim. Likewise, coordinates with an accepted precision label are not themselves documentary site proof. These properties must not be used to manufacture empty “reviewed project” dots.

No existing publication gate was weakened or changed. Instead a new isolated private review helper, `src/lib/publication-review-readiness.ts`, adds stricter checks before a future owner decision:

1. Existing schema and evidence checks must pass.
2. At least one meaningful stage must have reviewed source evidence.
3. All cited documents need matching checksum/source/reuse reviews.
4. The approved district must match the project.
5. Project identity must have an official-ID or documented-crosswalk association.
6. Site evidence must be reviewed, match the same project identity, and explicitly support the exact displayed coordinates.

Its output can say `readyForOwnerDecision`; it always returns `publicationApproved: false`. The caller supplies actual documentary review results. The helper cannot establish those results from a boolean alone and is not yet connected to the app/API/database. No current candidate is declared ready by this implementation.

## Tests and remaining work

`tests/evidence-limited-publication.test.ts` exercises the existing validators and new stricter helper. The tests prove that a synthetic reviewed contract-only ongoing work can pass the current validation shape, while a fabricated payment, unsupported completion basis, missing rights review, mismatched identity/district/site and all-pending empty record fail the appropriate review checks. The fixtures are synthetic tests, never acquired government records.

Validation completed: **20 tests passed** across this test file and the existing publication-evidence suite; **TypeScript checking passed**.

The next substantive step is to review actual source-linked site geometry for a small sanction/contract queue and prepare the corresponding owner decisions. Payments and certificates should continue as separate evidence acquisition work. The project can demonstrate historical-map functionality and then documented ongoing projects while its deeper spending trace grows over time.

## Concrete owner-review route for the first packets

The existing route is `/admin/intake` → upload originals → stage strict package → **Prepare project review queue** → `/admin` → inspect and reconcile the candidate → record individual stage/amount decisions → publish after the unchanged security checks pass.

The corresponding actions are:

1. Upload each private original with `/api/v1/admin/intake/original`, using the package source ID and SHA-256; upload bytes only to the returned private signed path.
2. POST the matching strict package to `/api/v1/admin/intake`. It re-downloads and checksum-verifies each uploaded original before registering/staging. It does not approve evidence.
3. POST `{batchId}` to `/api/v1/admin/intake/reviews`. This creates pending project candidates through `prepare_atlas_project_reviews`; it does not mark their stages verified.
4. Use the protected review console to confirm original work identity, the approved LGD district and documentary route/site association. The present identity form edits title, district ID and summary; it does not provide a coordinate editor. Coordinates therefore must already be supported by the source-linked packet and checked during reconciliation.
5. Review **every** distinct source document's reuse basis. `/api/v1/admin/source-permission` needs the registered document UUID, precise basis, evidence reference and confirmation. `CandidateTools` currently exposes this form for the primary `sourceDocument`; secondary geometry/photo documents still need their own registered UUID and rights review. Permission on the primary source alone is insufficient.
6. `EvidenceDecisions` records only the stages and monetary entries the owner actually verifies. Pending payment/completion may remain pending; a documentary site review does not mean an independent field visit occurred.
7. The final action posts the candidate ID, documented reason and confirmation to `/api/v1/admin/review`. The server fetches the preserved effective candidate and uses the existing schema, evidence rules and publication RPC. Do not send a client-authored publication payload or bypass MFA.

All these API actions require owner MFA and same-origin writes. Originals and private packet content must not be embedded in an anonymous page or added to public static assets.

`src/lib/first-dot-owner-review-plan.ts` now creates a private per-project checklist from a strict validated intake package. It lists primary and secondary source documents, exact locators, proposed reuse bases and supported stage-review choices. Every source retains a separate rights decision requirement; every candidate retains identity/district/documentary-site decisions and `publicationBlocked: true`. It does not upload or stage anything. The caller must enforce owner access before displaying it.

`scripts/render-first-dot-owner-review.ts` renders those same checklists into `output/first-dots-owner-review/index.html` for offline local review. It reads only validated `hisaab-intake/1` packages from `data/acquisition/first-dots/intake` by default. The offline artifact includes no raw beneficiary tables, bank account details or private citizen uploads, and has no automatic publication or staging buttons.

The readiness helper now explicitly returns `independentPhysicalVerificationAssessed: false`. Its `site.reviewed` property means that a reviewer checked the documentary project-to-coordinate association; it must never be described as independent actual-site verification.

Additional tests verify secondary document-rights enumeration, unsupported source rejection, malformed candidate rejection and the collector non-approval rule. **25 targeted tests and TypeScript checking pass** after these additions.

## Secondary document rights controls implemented

The primary-document-only UI limitation described above now has a minimal protected solution in the intake screen. Every `selected.sources` original is displayed through `IntakeSourceRightsReview`, including separate route geometry and source photo documents. The owner first inspects the exact registered document, then manually enters a verified basis, policy/permission evidence and an unchecked confirmation. Collector reuse proposals are labelled unapproved. Saving one document's rights does not approve project facts or any other original.

`GET /api/v1/admin/source-permission` requires owner MFA before parsing or querying anything. It accepts exactly one `sourceId`, `hash` and HTTPS `url`. Repeated/unknown parameters, malformed hashes and credential-bearing URLs are rejected. The endpoint returns only the matching registered UUID and narrow source/permission metadata; it excludes private storage paths, raw originals and query manifests and verifies that returned identity still matches the request. Missing originals return 404, unavailable lookup/backend returns 503, and every response is `private, no-store`.

The RPC is declared in the CLI-created migration `supabase/migrations/20261025105604_first_dot_document_rights_lookup.sql`. It checks the existing protected owner-MFA function, uses an empty search path and schema-qualified tables, revokes public/anonymous execution and grants execution only to authenticated callers who still must satisfy the internal owner check. It reads exact identity metadata only and changes no publication or source-rights decision.

**The migration has not been applied or executed against a database.** Until it is installed on the restored endpoint, the new inspect control fails closed with an unavailable message. Existing explicit permission writes remain unchanged. The denial-path SQL regression script is `scripts/source-permission-lookup-security.sql`; it is prepared for a disposable/local database and has not yet been run.

Validation: **32 targeted tests pass**, including seven new API tests for MFA, exact matching, response minimisation, invalid/repeated fields, unavailable backend, same-origin writes and explicit confirmation. TypeScript checking passes. No database migration, source-rights approval or publication was performed by this task.
