# 200 source-backed road records for protected owner review

Prepared 25 October 2026. These are private pending records, not published projects or verified current sites.

The repeatable worker `workers/prepare_two_hundred_roads.py` selected 200 distinct official road identifiers across 16 states and 37 proposed LGD district associations. All 16 roads from the original first batch are included. The current source pool meeting these checks and restricted to originals already usable by the 10 MiB intake route contains 1,168 candidates.

For every selected road, the worker checks the exact preserved original JSON row, all fields against the old edition where a fresh district-filtered report is used, the six original DBF identity attributes, the complete corresponding SHP route coordinates, and the marker's exact membership in the source route vertices. It also checks exact district-name association against the saved registry, documented Kerala/Keralam correspondence where needed, and both source date values. The fiscal year describes only the sanction date under the preserved official April–March definition. It does not interpret IMS_YEAR as spending.

Forty original checksums were checked, including previous editions and three policy/calendar originals. The two intake packages cite 32 originals, all already represented in the first batch preservation manifest. No additional original uploads are required.

| Private package                                              | Projects | Assets | Sources | UTF-8 bytes |
| ------------------------------------------------------------ | -------: | -----: | ------: | ----------: |
| `data/acquisition/first-dots/two-hundred/intake-part-1.json` |      100 |    100 |      16 |     528,845 |
| `data/acquisition/first-dots/two-hundred/intake-part-2.json` |      100 |    100 |      16 |     532,160 |

Both packages pass the existing strict intake validator. Their raw combined size exceeds the previously observed approximately 494 KB database guard headroom. Diagnostic gzip sizes total approximately 71 KB, but this is not a measurement or guarantee of PostgreSQL storage growth. Check actual remaining capacity before and after each protected intake; do not raise or bypass the 425 MiB guard. Existing original records are reused by exact source ID/hash/URL/path.

All 200 project IDs already originate in the existing private candidate pool. Preparing these batches does not authorize an automatic overwrite. Use the explicit pending reconciliation process for changed geography, financial year, summaries and receipts. Source-specific reuse decisions, individual narrow evidence decisions, and publication review remain necessary through the actual owner session.

Public scope, once reviewed: official OMMAS sanction-date and agreement-reference reports, linked to archived GeoSadak 2022 proposal coordinates via DataMeet, with NRIDA/Ministry of Rural Development attribution and no government endorsement. These are not original signed sanction orders or agreements. Money arrays are empty; payments, recipients, settlement, current physical condition and completion are not established. Each map point is labelled as archived proposal-coordinate provenance. The 37 district associations describe source-name correspondence, not independently verified current boundary membership.

Artifacts: `two-hundred/works.json`, `two-hundred/claim-checks.json`, `two-hundred/summary.json`, and the two intake files, under `data/acquisition/first-dots/`. No network operations, staging, owner decisions or publication were performed by this preparation.
