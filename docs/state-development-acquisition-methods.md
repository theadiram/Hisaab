# State development evidence — continuation methods

Scope is FY2025–26 and FY2026–27 to explicit source cutoffs. Source fiscal columns are private candidates, not unique schemes, payments, or publication approvals.

## Repeatable collection

`workers/state_development_collection.py` preserves original response bytes/checksums, source links, edition hints and failures. A budget index can select at most twenty observed PDF links per request. `linkedReportOffset` advances to subsequent stable link ranks; it does not silently stop the source inventory at twenty. Paths containing spaces are encoded, and PDF downloads with a trailing document identifier are validated as PDFs. HTML error responses are not financial evidence.

`workers/state_development_inventory.py` records every observed same-host or permitted official-storage PDF link in saved budget indices. Older/unrelated documents remain marked as fiscal membership unverified. Its counts are an observed-link backlog, not a census of missing current-year government publications.

`workers/state_development_full_text.py` resumes local extraction in batches of at most 250 pages for AP and Haryana demand books. The saved supplement is tied to the original checksum; extraction never changes original bytes. Complete text processing does not mean complete financial review.

`workers/state_development_hp_reports.py` uses the observed anonymous report form, its selected fiscal year and its explicit viewer result. Only the reviewed official host is accepted. No private analytics, authentication, guessed report API or CAPTCHA bypass is used. Failed reports stay unavailable.

## Scans and legacy text

English scan OCR uses local Apple Vision through the existing Swift collector; bundled Python needs pdfplumber. The Tamil Nadu AFS has 42 OCR-processed pages but only nine visually transcribed revenue heads in this continuation. A newer website heading never changes an older source cover year.

Hindi/English OCR uses an isolated Tesseract.js **7.0.0** runtime under the ignored private acquisition folder. Install there with `npm install --prefix data/acquisition/state-development/ocr-runtime --save-exact --ignore-scripts --no-audit --no-fund tesseract.js@7.0.0`. App dependencies are unchanged. The wrapper recognizes private local page images; only language/runtime models are downloaded. Recognition quality is insufficient for automatic monetary acceptance on the inspected Chhattisgarh scans. Native numeric PDF cells are used where available, and legacy-language labels remain unresolved.

## Source-specific normalization

`workers/state_development_programme_tables.py` documents each accepted source layout and unit. AP is lakh; Haryana absolute rupees; Assam and Himachal lakh; Chhattisgarh and Maharashtra targeted outlays thousand; Karnataka regional portions crore; Goa lakh; Tamil Nadu inspected heads thousand. Original/revised estimates remain alternatives. Previous-year actuals are excluded when outside the requested scope. Empty cells remain unknown; negative adjustments remain negative. Beneficiary counts, geographical components and targeted subsets are not added as extra money.

`workers/state_development_remaining_tables.py` retains Meghalaya voted/charged rows only under an explicitly unfunded parent in the same physical table; it does not count that placeholder parent or attach an unanchored child.

`workers/state_development_reconcile.py` preserves printed differences. A rounding bound is explanatory context only, never a correction or approval. Missing Manipur capital components are not filled by subtracting other tables. Jharkhand June overview amounts may be normalized only where each exact summary item has an explicitly cross-referenced Monthly Trend page stating crores. These are provisional cumulative category accounts, not projects or payments; do not add summary totals to their components. Goa demand summaries are accepted only after all 97 official demand codes are recovered and both per-row revenue-plus-capital checks and aggregate sums match the separate printed all-demands control. They are broad, mixed budget totals, overlap AFS heads and are never classed as development or payment evidence automatically. Sikkim’s official Information Commission Demand 28 page is a one-department sample: parent plus 18 object-head details reconcile to the printed 2025–26 and 2026–27 budget totals. Only estimate columns in the requested period are normalized; out-of-scope actuals are excluded, component hierarchy is retained, and the sample is classified administrative rather than development expenditure.

Classification suggestions and source-local accounting paths support owner review. They do not establish source reuse permission, unique programme identity, exact project geography or a bill-to-project allocation. All originals, OCR and newly normalized monetary evidence remain private. No automatic publication or relaxed MFA is introduced.

## Refresh order

Run source retrieval/checkpointing first, then wait for it to finish. Complete local text/OCR batches and inspect originals before adapting numeric layouts. Run normalization to completion before reconciliation, classification and the public count summary. Update the in-app progress tasks and current-status document from that coherent summary. Verify checksums and parser/application tests before committing. Do not run dependent summaries against a partially rewritten normalized catalogue.

The current state list and unresolved source/review work are in `docs/state-development-current-status.md`. This method does not claim all28 states complete, or complete national contractor-payment coverage.

Sikkim acquisition note, 15 October 2026: the Finance Department's 2026–27 AFS exact PDF URL is now identified from an official-document citation. HTTPS timed out; an HTTP HEAD answered 200 but was not accepted as a safe document-transfer route. The official Assembly notice confirms that the budget, AFS and separate demands were presented/passed in July. This narrows the Sikkim gap to secure source retrieval and full demand extraction; the notice's gross/net budget totals are only broad context.

MoPR cross-state programme context: the 4 August 2026 Ministry of Panchayati Raj scheme-wise BE/RE/actual statement is transcribed separately from state budgets. It is useful as an India-wide ministry funding line only; it supplies no state split and must not be distributed to jurisdictions. Its latest actual (FY2025–26) is distinct from the 2026–27 BE. For the project layer, continue acquiring the activity/work-code → voucher → official payment-status chain and geographic crosswalk documented by eGramSwaraj. See docs/mopr-scheme-finance-source-review.md.

# State-wide Union rural local body grant source (15th Finance Commission)

The Ministry of Panchayati Raj's official statement reports state-wise annual allocations and releases for XV Finance Commission grants to Rural Local Bodies from FY2020–21 through FY2025–26, as of 31 March 2026. It covers 28 States and does not provide a Union Territory table. Preserve the columns as `allocation` and `release`; do not label release as expenditure, contractor payment, or verified bank settlement. These grants are an untied/basic-grant funding channel for local bodies and may support local needs; the source does not allocate the state amounts to development sectors, works or sites. Keep it as a separate RLB-grant measure, not part of a general “development spend” total.

Source PDF: https://cdnbbsr.s3waas.gov.in/s316026d60ff9b54410b3435b403afd226/uploads/2025/10/202605121393554313.pdf . The original is private at `data/originals/national-panchayat-finance/15th-fc-allocation-release-as-of-2026-03-31.pdf`; manual visual transcription and control validator are under `data/acquisition/national-panchayat-finance/` and `workers/mopr_15fc_rlb.py`. Preserve all printed values and unresolved arithmetic control differences. Publication and source-reuse approval are pending.

## MoRD rural-development aggregates (added 15 October 2026)

Use MoRD parliamentary-answer tables as their own funding channel, not a state-budget substitute: (1) MGNREGS funds reported released by State/UT and fiscal year; (2) MGNREGS water-related works expenditure by State/UT and year; and (3) VB-G RAM-G interim allocations and first-installment mother sanctions after its 1 July 2026 start. The source preserves the 30 June cutoff on legacy-scheme water expenditure. The source's MGNREGS release annual totals do not equal the sums of State/UT rows by up to ₹0.03 crore; report both and flag the difference. No state purpose amount may be inferred from general-purpose releases, and none of these summary tables supplies work-ID-to-payment joins, payee details, or settlement evidence. Private originals, parser, row-level ledger and control tests are in `data/originals/national-rural-development/`, `workers/mord_nrega_finance.py`, and `data/acquisition/national-rural-development/`.
