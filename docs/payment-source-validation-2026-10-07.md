# Payment-source validation after the three-report review

7 October 2026. This records independently observed evidence, not claims copied from the supplied reports. No records published or owner decisions inferred.

## MPLADS: an official work-linked expenditure response obtained

The public dashboard at https://mplads.mospi.gov.in/digigov/dashboard.html currently raises a browser error in `loksaba.js` concerning an absent `contentDocument`. Clicking its expenditure tile did not replace the allocation table. Preserved public scripts identify a read-only report operation: `/rest/PreLoginDashboardData/getTilesReportData`. The actual handler sends `comboData.toString()`, not an array. State IDs come from its public `getStateData` report; Odisha is 25. A malformed initial array request returned only a zero total; it is preserved separately and not treated as evidence of zero spending.

The official Odisha request uses combo `25,0,0,2` and key `Expenditure on Completed and On-going Works as on Date`. Its 2,767,149-byte original is preserved privately with SHA-256. There are **3,826 expenditure rows and 2,195 distinct full WORK_ID values**. All returned state labels are Odisha. Source statuses: **3,719 Payment Success**, **107 Payment In-Progress**. All rows have parseable expenditure dates and non-negative finite amounts. The public script labels FUND_DISBURSED_AMT in rupees. These are source-reported vendor expenditure records; success is not promoted to independently verified bank settlement.

Fields include ACTIVITY_NAME, WORK_ID, WORK_RECOMMENDATION_DTL_ID, MP_NAME, HOUSE_OF_PARLIAMENT, TENURE, IDA_NAME, IA_NAME, VENDOR_ID, VENDOR_NAME, EXPENDITURE_DATE, FUND_DISBURSED_AMT and WORK_STATUS. A full work ID looks like `WS/MP373/2025-2026/249707`. Retain the full WORK_ID, house and source scope when connecting documents; do not assume the recommendation ID alone is globally unique. This sample has no recommendation IDs shared across different MP labels, but that does not prove nationwide uniqueness. The default combo does not explicitly filter a tenure; do not describe this as a validated single-tenure universe merely because the browser heading says 18th Lok Sabha.

**Still missing:** stable individual payment/bill references, reversals/reissues, allocation and reconciliation definitions, work geometry, supporting agreements/sanctions/completion documents and publication review. No amounts are summed. Equal work/date/vendor/amount rows are retained rather than deduplicated on assumed transaction identity. Seven rows have invalid UTF-8 bytes: the parser preserves those bytes as escaped values and flags their text for review. No replacement names are invented. A country-wide response exceeded a 50 MiB collection bound and was not accepted; use bounded state/tenure or MP partitions identified by official lists.

Private input manifest: `data/acquisition/mplads/public-script-review/odisha-expenditure-response.json`. Private normalized review: `odisha-normalized-review.json`. Public summary: `data/mplads-payment-source-assessment.json`. Reproduce assessment with `python3 workers/mplads_payment_assessment.py`.

## Bengaluru: full net bill value is not necessarily paid amount

Normalized 4,729 mirrored FY 2025–26 rows into **4,715 provisional bills**, **4,729 event references**, and **3,964 recognizable job codes**. Twenty-seven rows need job identifier interpretation. Fourteen source bill IDs occur with different RTGS events; exact duplicate rows are zero. Gross minus deductions equals net in every row. This checks arithmetic, not units, successful payment, allocation or location.

Compared two historical mirror bills with the official viewer https://accounts.bbmp.gov.in/vssWB/ through visible Bill Status searches:

| Official job  | Net bill value | Displayed Paid | Selected RTGS date | Another listed RTGS date |
| ------------- | -------------: | -------------: | ------------------ | ------------------------ |
| 198-21-000007 |   4,791,650.00 |   3,542,778.00 | 16 Oct 2023        | 1 Apr 2025               |
| 012-20-000078 |     700,640.00 |     518,825.00 | 9 Apr 2025         | 5 Jul 2025               |

Mirror gross, deduction and net values match the bills; they do not identify the individual transaction amounts. Both selected events show RTGS Generated and populated UTR fields. Presence of a UTR is recorded privately as a boolean; no banking identifiers or contractor phones are propagated. The earlier current-year sample had blank UTRs, so that observation must not be generalized to these historical samples. The UI shows different RTGS events; whether they represent instalments, reissues or other history needs evidence. Never count the full net value for each event.

The new assessment worker keeps bills and payment references separate, leaves transactionAmount unknown, retains differing editions and strips contractor strings entirely from normalized review output. It creates no monetary total or approvals. Exact geography, recipient business capacity, amount definitions and publication review remain pending.

Private review: `data/acquisition/report-review-2026-10-07/bbmp-normalized-review.json`. Minimized historical UI observation and checksum are indexed by `bbmp-historical-primary-observations.json`. Reproduce with `python3 workers/bbmp_payment_assessment.py`.

## MGNREGA: one actual work-to-wage-list link observed

Used official public navigation: Madhya Pradesh → Bhopal → Berasia → Amarpur → Work Register. Plantation work **1728001019/DP/22012034619924**, near a segregation shed in Barkheda Kalan, shows technical and administrative sanction dates 26 June 2024; start 20 July 2024; estimated completion 20 April 2025; actual completion blank. Sanction amounts 1.036452 unskilled and 0.9629077 material remain raw because the viewed register does not establish their units.

Its Work Register detail lists wage list **1728001019WL007148** against three musters: 16618 (48 person-days, reported paid 11,664); 16619 (60, 14,580); 16620 (18, 4,374). Total: **126 person-days, 30,618 reported paid, zero reported due**. The separate work-wise consolidated payment report explicitly labels Total Cash Payment in rupees and shows the same total. Its date column is **Data Entry Date**, not bank settlement date. Do not use that date as payment date.

No FTO/bank response chain has yet been reproduced. Worker identities and job-card/banking identifiers are excluded from the minimized observation. An independent fetch of the observed Work Register URL returned HTML without this work; it is preserved but explicitly rejected as an original of the displayed register. Navigation/session report scope needs preservation before relying on this chain. Exact geometry, completion evidence and publication review remain missing.

Private minimized observation: `data/acquisition/mgnrega/amarpur-pilot/assessment.json`. Continue through official wage-list/FTO navigation rather than guessing encrypted report payloads or assuming the same report across sessions.

## Nationwide MPLADS collection completed for the default Lok Sabha scope

Collected and assessed all **36 official state and union-territory partitions**, with zero failed partitions. The preserved responses contain **89,497 source expenditure rows linked to 59,785 distinct full work IDs**. Source status counts: **86,335 Payment Success**, **3,162 Payment In-Progress**. There are **194 rows with encoding faults**, retained for review. Every state original checksum was verified. Re-running the collector after completing the list made no new network requests and rebuilt the same summary from preserved originals.

This is nationwide collection for one development scheme's default Lok Sabha public filter. It is not complete Indian government spending, all MPLADS tenures/houses, a set of independently verified transactions or verified project geography. No payment amounts were summed, no inferred transaction IDs created and no map dots approved. Full WORK_ID remains the key; this collected scope has zero recommendation IDs mapping to different full work IDs, but other scopes still need validation.

Collection: `python3 workers/mplads_state_collection.py --max-states 6` processes at most six previously unattempted official state IDs per invocation. Each response is limited to 20 MiB and 35 seconds. Checkpoints, request bodies, source originals, content types and checksums are private in `data/acquisition/mplads/state-expenditure/`. Public aggregate summary: `data/mplads-state-collection-assessment.json`. Failed partitions remain explicit and are not silently converted to zero spending. The separate initial Odisha export is an earlier source observation; do not add it to the state collector totals.

Next: validate supporting work/payment documents and actual locations for a small review sample, investigate encoding faults and reversal/payment references, and collect Rajya Sabha and explicit tenure scopes through their observed official UI definitions. Keep previous editions rather than overwriting them.

## Next bounded work

1. MPLADS: retrieve supporting work records for a small Odisha sample using full work identity; confirm payment references/allocations, encoding and geography. The default Lok Sabha state collection is now complete; next expand only validated house/tenure filters with checkpoints.
2. Bengaluru: inspect event history for the two compared bills, obtain explicit paid amounts and actual project location; review the 27 ambiguous identifiers.
3. MGNREGA: obtain the wage list/FTO bank response and preserve the displayed report scope; distinguish wages, materials and vendor payments.
4. Continue Odisha PPMS, existing agency requests and targeted RTI drafts in parallel with these acquisitions. New correspondence and fee submissions require their own authorization.

Verification: nine new parser tests cover repeated events, no invented transaction identity, amount/date distinctions, conflicting editions, privacy minimization and invalid encoding. Public tracker exposes aggregate progress only; originals, recipients and unreviewed evidence stay private. No paid map dots or approvals added.

## Rajya Sabha scope extension — 7 October 2026

The preserved official rajyasaba.js switch explicitly supplies combo [0,0,0,1], while Lok Sabha uses house 2. Collector now accepts --house rajya, checks that every returned expenditure row matches the requested state and house, and keeps house checkpoints and summaries separate. The first six official state partitions yielded 2378 expenditure rows linked to 2078 distinct full work IDs; zero failures, one encoding issue. Zero-row partitions are observations of the returned default filter, not declarations of no development spending. Public progress exposes aggregates only. Remaining states, explicit status/tenure scope, payment identities/reversals, supporting documents, actual geography and publication review remain. No financial totals are combined across houses.

### Nationwide source catalogue and Odisha pagination completion — 7 October 2026

Completed all 36 default Lok Sabha and all 36 default Rajya Sabha expenditure partitions. The owner-only Spending catalogue indexes 75,805 house-scoped project identities and 115,783 source rows from 72 checksum-verified originals: Lok Sabha 59,785 IDs / 89,497 rows; Rajya Sabha 16,020 IDs / 26,286 rows. These scopes do not establish all tenures, all schemes or independently settled transactions. Search, state/house filters, project selection and paginated source expenditure rows are implemented behind existing owner MFA. Encoding-fault text is flagged; exact decimal source amounts are preserved without floating-point rounding. No banking fields, new payment totals or invented locations are published.

Odisha PPMS observed pagination is exhausted: 856 URL originals (default plus pages 1–855), no missing page numbers, no failed or queued pages. Preserved 43,265 distinct bill identities and 42,260 project codes across 30 districts. Seven differing-edition comparisons affect five bill identities and remain quarantined. All 856 report and 221 supporting-PDF checksums pass. Reassessment confirms 44 clipped PDF layouts, 20 cheque/report differences and 31 readable beneficiary-sum discrepancies; zero approvals. Report footers vary across retrieval editions (for example 42,361 versus 42,720), so collected distinct identities are not a reconciled single-cutoff census. Completed traversal does not prove every payment or settlement. Collector uses at most three concurrent observed URLs and twenty pages per checkpointed batch; one timeout recovered through a bounded observed-URL retry with the earlier checkpoint archived.

Added three prepared, unsent existing-thread follow-up drafts to the private owner request dossier. Mail check found no new usable export or permission response; NRIDA forwarding remains unchanged. Verified current MPLADS support/routing contact and updated the five-project request, still unsent. GeoSadak official download host remained unreachable; no access controls bypassed or proposed geometry certified. Public payment-backed map coverage remains zero pending actual geography, allocation/recipient evidence, reuse review and explicit owner approvals.

Verification: 44 app tests, 10 MPLADS parser tests, type checking and production build passed. SQLite integrity and original checksums verified. Private catalogue API rejects unauthenticated access; hosted read checks confirm private evidence storage and denied anonymous private access. Restored the preview using the existing hosted configuration; public app returns 200. No environment secrets changed, MFA weakened, emails sent, RTIs filed or fees paid.
