# Odisha: five real project review packets, live sources recovered

25 October 2026. These are private evidence review packets, not approved public dots or verified paid/completed works.

## What changed

The source is accessible. The browser/search fetch of the PPMS homepage timed out, but direct bounded HTTPS retrieval of the already-observed public report URLs succeeded. We preserved **10 fresh official pages**: a project-register page and photo-location page for each of five shortlisted projects. Every live register still contains exactly one matching project code and the same title. All five live photo pages identify the exact project and match the preserved photo metadata: **26 photo-coordinate records** in total. No login or access-control bypass was involved.

The existing records can support concrete source-evidenced project cards with carefully limited claims. Waiting for independent settlement and completion evidence before showing any project at all is unnecessary if the interface explicitly distinguishes what the source actually proves. This does not waive source rights, location review or owner publication decisions.

## Evidence checked

- 155 project/location dossiers have exact PPMS project-code associations.
- **97 projects across 24 panchayats** have at least one bill PDF with readable components, a cheque date, no report-edition conflict, and agreeing source-report, cheque and component arithmetic.
- Rechecked original SHA-256 checksums for **10 project report pages, 155 photo report pages and 98 consistent supporting bill PDFs**.
- All 155 joined projects identify execution mode **Department**. Requiring a winning contractor and awarded contract for this entire source would misrepresent departmental execution. The source names an executant; that is not automatically a contractor or the final recipient of money.
- Source statuses are 122 `Bill Final` and 33 `Billing In Progress`. All 155 physical-completion date fields are blank (`-`). A final bill does not establish physical or certified completion.
- No bank accounts, phone numbers, beneficiary component identities or raw PDF text are projected into the review packets.

## Five first-review candidates

All five are in Balangir district/block, have source technical-sanction and administrative-approval dates, a consistent readable bill, and an exact-code photo page. We chose distinct panchayats, source `New Work` labels and construction titles, then prioritised small coordinate spread. Small spread is a review heuristic, not proof of accuracy.

| Work                                                 | Panchayat  | Source photo point (latitude, longitude) | Source status       | Maximum photo-coordinate spread |
| ---------------------------------------------------- | ---------- | ---------------------------------------- | ------------------- | ------------------------------: |
| Road from Dabkani village to Gotha Pada, 106 m       | Khujenpali | 20.658717, 83.5227008                    | Bill Final          |                          6.52 m |
| Road from Barkani to Pandarapita, 144 m              | Barkani    | 20.633847, 83.4960065                    | Bill Final          |                          7.45 m |
| Guardwall at Banjikata Barpita                       | Barapudgia | 20.7110912, 83.3201947                   | Bill Final          |                          8.17 m |
| Road from RD Road to Kaladunguri Bidighat, 100 m     | Bidighat   | 20.6742967, 83.3562636                   | Billing In Progress |                          8.35 m |
| CC road from Khaisbahali village to Sauntmunda Chhak | Sikachhida | 20.613711, 83.3879234                    | Bill Final          |                          9.49 m |

Coordinates above are the first source photo coordinate, not a centroid, road alignment, building footprint or independently checked project site. Multiple source points are retained in the packet. Any map presentation must say **“official project-linked photo location; actual site unverified.”**

Official project IDs, exact source URLs, source row locators, original hashes, source dates and the fresh comparison results are in `data/acquisition/first-dots/odisha-source-evidenced-project-review-2026-10-25.json`. Each fresh source is preserved in an `odisha-live-<SHA-256>.html` file in the same private directory.

The five records are also supplied as machine-usable `Work`-shaped drafts in `data/acquisition/first-dots/odisha-proposed-works-2026-10-25.json`. They have all four evidence stages represented as pending, no money events, no claimed payment dates or amounts, `demo=false`, the saved exact Balangir district identity, source receipts, the source-named departmental executant role, and `locationReviewPending=true`. Implementing authority is left unknown pending review; no authority is invented from the scheme name. The wrapper lists the per-record publication reviews and stronger financial-card gaps. They have not been staged in the application or database.

## What a truthful initial card can say

> Official PPMS identifies this named work, scheme and administrative area. It reports departmental execution and the displayed approval dates. These coordinates belong to official photos linked to the same project code. The source status is shown as reported. Actual project-site verification, paid amount, recipient settlement and certified completion are not established here.

It can show the source work ID, title, purpose, scheme, administrative area, source-reported execution mode/dates/status, the explicitly limited photo location and source receipts. A bill-evidence stage can say “source bill document available; accounting meaning under review.”

It must not show a rupee payment total merely because report/cheque/component numbers agree. The project-specific cheque PDFs do not establish the amount unit or gross/net/deduction allocation meanings. The packets preserve original numeric strings for private review; no unit is inferred from a generic manual. Cheque dates remain cheque dates. Public recipient claims remain withheld.

## Remaining decisions and records

1. **Source/rights review:** decide whether these exact official source records and limited facts can be republished with attribution. Source accessibility is not the same as publication approval.
2. **Location presentation:** review a source point as a reported photo location. To claim an actual project site/route, obtain an authoritative location/chainage/site document or inspect the source evidence sufficiently to support that stronger statement. Do not relabel the photo point silently.
3. **Execution:** obtain the departmental executant selection/work order and measurement-book allocation if seeking the full execution/payment chain. Do not require a nonexistent contractor award for departmental work.
4. **Money:** establish the specific report's currency and amount definitions; obtain bill gross/deduction/net and allocation records before displaying paid amounts. Obtain final-recipient credit/return evidence only for an independently settled-payment claim.
5. **Completion:** keep completion pending/unavailable unless a completion record is obtained. Neither `Bill Final` nor a generic source “Approved” photo label is a completion certificate.

These five projects can advance a first **source-evidenced project/location layer** after explicit review; this pass does not certify five publication-ready project sites or financial cards. They represent one district, not five districts or national coverage.

## Reproduce

Run `python3 workers/odisha_first_dot_review.py --refresh` to rebuild the 97-project private review collection, select the five candidates and refresh only their ten observed official pages. Without `--refresh`, it checks preserved originals and generates local review packets. It does not publish, approve, update old checkpoints, send correspondence or change any application/database data.

The checks above are evidence-lineage and field/arithmetic checks. We did not independently inspect sites, verify beneficiary credit or reinterpret source cheque amounts as spending.

## Follow-up: five source claims reviewed, authority basis recovered

The second review checks **35 documentary claims across five works** against the preserved fresh official pages: exact project identity/title, technical approval date, administrative approval date, execution authority/level, execution mode, source photo-point membership and reported work status. All 35 source comparisons pass, with no source fact mismatches. All five proposed points occur as exact longitude/latitude strings on the correct official project photo page. No centroid, nearby-name match or guessed site is used.

| Project ID suffix | Technical date reported | Administrative date reported | Execution-level evidence                          |
| ----------------- | ----------------------- | ---------------------------- | ------------------------------------------------- |
| `00125402`        | 16 May 2026             | 21 May 2026                  | Panchayat Samiti; Balangir block; Department mode |
| `00125715`        | 17 May 2026             | 21 May 2026                  | Panchayat Samiti; Balangir block; Department mode |
| `00097986`        | 22 March 2026           | 30 March 2026                | Panchayat Samiti; Balangir block; Department mode |
| `00098434`        | 16 March 2026           | 16 March 2026                | Panchayat Samiti; Balangir block; Department mode |
| `00063541`        | 8 March 2026            | 9 March 2026                 | Panchayat Samiti; Balangir block; Department mode |

These are source-reported approval dates, not claims that the signed approval orders or sanction amounts have been recovered. The five rows report the administrative approver role as BDO. An independent [official district directory](https://balangir.odisha.gov.in/en/directory/balangir-contact-directory) identifies the Balangir Sadar Block Development Office, and the [official RTI handbook](https://rtiodisha.gov.in/Pages/printAllManual/office_id%3A4240/lang%3A) identifies Panchayat Samiti Office, Balangir. Originals for both have been preserved. This supports the narrow implementing-level label **“Panchayat Samiti, Balangir (source-reported execution level)”** with the exact project row as its receipt. It does not certify a current named officeholder or every agency relationship. The general staff directory names a different BDO from these project rows, so no current-incumbent claim is made.

This resolves the previously unknown authority field at the stated source execution-level scope. Suggested authority patches and receipts are supplied separately in `data/acquisition/first-dots/odisha-reviewed-claims.json`; original proposed-work drafts are not silently rewritten.

### Reproduction policy: a specific, documented unresolved issue

The [PPMS privacy page](https://ppms.odisha.gov.in/privacy-policy) identifies its department but provides no reproduction licence; its footer reserves rights. The [PR&DW main-site policy](https://panchayat.odisha.gov.in/en/website-policy) asks for prior permission in its body while displaying a CC BY 4.0 footer. It does not expressly extend that footer to the PPMS subdomain or third-party photographs. The [state-portal policy](https://odisha.gov.in/en/website-policy) likewise uses permission wording. All three originals were downloaded and checksum-preserved.

We therefore have **not** resolved PPMS reproduction rights by assuming a blanket state-government licence. Text/data summaries and photos are kept separate: the review packets select and paraphrase limited factual claims with exact citations; no source photographs are copied or embedded. There is still no established PPMS-specific permission for republication. The precise question remaining for the source owner is whether five attributed factual summaries plus source photo-coordinate metadata may be published without copying photographs, original documents or banking fields, and whether the main-site CC BY footer covers PPMS report data. No correspondence has been sent.

The existing public “Sanction Order” route at `/report/sor` was also inspected and preserved. Its observed response is an aggregate scheme table, not five project-specific signed sanction orders. Its aggregate financial heading cannot establish the currency/accounting meaning of the separate cheque PDFs.

Run `python3 workers/odisha_reviewed_claims.py` to regenerate the source-claim comparisons from the preserved fresh pages. The result records source-level checks separately from owner/publication approval. Remaining limits are the explicit reuse basis, owner publication decision and actual-project-site evidence if the map claims more than a reported photo location. Money, settlement, awarded-contractor and completion claims remain withheld.
