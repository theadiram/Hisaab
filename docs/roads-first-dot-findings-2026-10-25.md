# Road first-dot findings — 25 October 2026

## What changed

This pass produced concrete evidence-review inputs rather than another source inventory:

- Rechecked **7,161** existing road-to-geometry candidates against the current local SQLite source attributes. Reverified **32** distinct source original SHA-256 hashes covering the official work responses and proposal-route archives actually referenced by those candidates.
- Prepared **16** single-feature proposal-route review packets across **16 source states and 16 source district pairs**, plus a GeoJSON preview and machine-readable Work-shaped candidate batch. Amounts and payments remain unknown. None is approved or published.
- Downloaded a new official **30 April 2026 NHIDCL status report** and extracted **384** unique project UPN rows. Recovered explicit source **sanction dates for 206** of the existing 232 August comparison packets. **195** retain the same award date and awarded cost across both editions; the remaining **11** are flagged for edition reconciliation. These are exact UPN joins, not title/proximity guesses.
- Freshly preserved the OMMAS copyright policy and the official GIS release announcement, closing a source-policy discovery gap. Evidence/use review remains an owner decision; there is no automatic publication approval.

## Practical solution

A real official-record map dot does not have to imply that every payment and certificate is known. A source-backed proposal route can be presented with a label that accurately explains its age, precision and missing financial stages. This is a useful evidence-limited product milestone, distinct from a verified actual-site or paid/completed project.

The proposed label is: **Official road record with archived proposal route; actual site unverified. Financial amounts and payment evidence unavailable.**

The selected point is a source vertex on the original route. It is not the district centroid or a geocoded village guess. All six matching attributes were rechecked: source state, source district, official road identifier, sanction year, batch and exact case-normalised title. Multiple-feature candidates are not used in this first 16 to avoid arbitrary segment selection.

The records should enter owner review with every decision pending. They must not appear as verified ground locations or contribute to payment totals. The original source year is a sanction-year label and still needs fiscal-year interpretation before any financial-year claim.

## First 16 proposal-route packets

| State in source | District in source | Official road ID | Title                                                                                                   |
| --------------- | ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------- |
| Andhra Pradesh  | Kurnool            | 232001           | T01-Gudekal to Ganjihalli via S.Nagalapuram                                                             |
| Assam           | Baksa              | 244768           | MRL06-NH 127 A to Bhabanipur Salbari Road via Hollongbari,Karnachara,Hudukhata uttar chupa.             |
| Bihar           | Aurangabad         | 248665           | MRL10-AMJHAR-SHARIF T03 TO SHAHPUR                                                                      |
| Chhattisgarh    | Balod              | 231096           | T02-piperchhedi to Limora Mujhagahan                                                                    |
| Haryana         | Ambala             | 242944           | T04-SBK road (SH-4) to jagdhauli via zefarpur ,alisapur                                                 |
| Jharkhand       | Bokaro             | 251443           | MRL02-Khatritola to Chargi Chowk via Chargi                                                             |
| Karnataka       | Bidar              | 238307           | MRL07-Ghatboral to Sonekera                                                                             |
| Keralam         | Alappuzha          | 245927           | MRL16-Vathallurkoickal temple to pokkattumill road                                                      |
| Madhya Pradesh  | Alirajpur          | 247679           | MRL05-Alirajpur mathwad road to kiloda                                                                  |
| Maharashtra     | Akola              | 240341           | MRL03-NH-06 (Kurum) to ODR-75 to Madhapuri - jethapure - Hyatpure to join NH-06 ROAD                    |
| Odisha          | Balangir           | 247148           | MRL04-Chandanbhati to Bolangir Kagon Mirdhapali ,tulandi, Chhatamakhana                                 |
| Punjab          | Amritsar           | 250538           | T07-APK Road to Amritsar Mehta Road via Fatehgarh Shukarchak Nizampur                                   |
| Rajasthan       | Churu              | 236254           | MRL01-Bhanin (SH-36) Bain                                                                               |
| Tamil Nadu      | Dharmapuri         | 237293           | MRL23-Ramagondahalli to Neruppur road-Pudur Nagamari (via)Malaiyur                                      |
| Telangana       | Adilabad           | 245414           | T01-Road from Adilabad to Indervelly via Ankoli,Wanwat,Pippaldhari, Khandala,Chichdhari and Bursanpatar |
| Uttar Pradesh   | Agra               | 255877           | T04-Saiyan to Kheriya Road via Ladukhera                                                                |

The final queue prefers lower-friction districts: **15/16** have existing exact-name LGD district proposals. The Kerala candidate uses the separately documented **Keralam/Kerala correspondence proposal** for Alappuzha (`district:554`), pending owner review. Its provenance is in `district-recovery.json`. All 16 Work-shaped candidates have proposed area IDs; none is silently relabelled or approved. The earlier aliases Bagalkot, Agar, Ahmednagar and Angul were avoided by choosing alternatives within the same source states.

## New NHIDCL sanction-date evidence

The current August status PDF omits a Date of Sanction column. The newly retrieved April edition includes that explicit column. A unique exact UPN connects it to the current project packet. The output preserves the April source date and locator independently; it never calls the current project cost an original sanction amount. An earlier sanction date also does not prove a sanction-order document or its amendments were acquired.

A source comparison example is UPN **DN/19015/01012/SK**, Singtam–Tarku Package I. The April row supplies its sanction date; the packet keeps the official UPN and edition-specific supporting reference. This project still lacks reviewed actual route geometry and project-allocated payment evidence. It is not promoted as a paid/completed card. Older official status editions also disagree on this project's completion date, illustrating why dates must remain source/edition scoped.

The April official document is [NHIDCL status as of 30 April 2026](https://www.nhidcl.com/sites/default/files/2026-05/nhidcl_projects_status_as_on_30.04.2026_for_website.pdf). Its preserved SHA-256 is `62ce4ad6f870b22c460c75aac07554114ed63a670013a12de6ee2fd3b1479407`. Every recovered date includes PDF page, source row, explicit column and exact UPN.

## Reuse evidence recovered

The [OMMAS copyright policy](https://pmgsy.dord.gov.in/Home/HomeCopyrightPolicy/) permits accurate text/data reuse with attribution, date and no endorsement; named third-party material, logos, flags and some photographs are excluded. The [official 2022 GIS release](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1800373) names DataMeet as a release partner and identifies the Government Open Data License. The packets preserve mirror commit, original archive hash, source feature row and release date. We are using source text/data and proposal geometry, not programme logos or unreviewed photographs.

A downloaded Singtam–Tarku **draft contract agreement** was also preserved as a scope lead. It is explicitly a draft tender document; it is not a signed contract, awarded-contractor proof, payment record or actual-route coordinate source. Its text contains no recovered latitude/longitude fields in this pass, so no project point was generated from it.

## Stronger financial leads and remaining work

The existing ten Odisha final-bill-pending cases already have explicit lakh headings for reported sanction/expenditure. Their eight sanction-value differences remain unresolved and must stay visible. Of the two matching numerical sanction cases, Kendrapara **OR16319 / road 247177** is a reasonable next financial-review lead; Bhadrak **OR04342 / road 247572** has reported expenditure above sanction and needs additional scope/amendment evidence. Neither has project-allocated individual payment records, recipient-role proof or a certificate in the current dossier.

For evidence-limited publication the remaining concrete steps are: owner review of source/use evidence; approval of the narrow archived-route claim; district crosswalk review; fiscal-year label interpretation; and staging the proposed Work records through existing protected review. For payment-backed claims, acquire the actual bill-to-road allocation and recipient/transaction semantics; dates or percentages from status tables cannot substitute.

## Files and reproduction

- `workers/roads_first_dot_review.py`: reproducible local recheck and packet generator (run with bundled Python containing pdfplumber).
- `data/acquisition/first-dots/roads-evidence-limited-review.json`: 16 packets, source lineage, hash audit.
- `data/acquisition/first-dots/roads-work-candidates.json`: machine-readable Work-shaped proposals, explicit unknown amounts and pending review.
- `data/acquisition/first-dots/roads-evidence-limited-preview.geojson`: proposal routes for private preview.
- `data/acquisition/first-dots/roads-nhidcl-sanction-date-recovery.json`: 206 exact-UPN April sanction-date records with flags.
- `data/acquisition/first-dots/roads-originals/`: new official originals and retrieval receipts.

No existing checkpoint, application file, approval state or database was changed. No correspondence was sent. No complete payment-backed card was created or claimed. New packets retain all approval flags as false.

## Claim-by-claim original review — follow-through

All 16 selected roads now have a separate investigation at `data/acquisition/first-dots/roads-reviewed-claims.json`:

- Directly read each preserved ZIP's original DBF, SHX and SHP records. All **16 one-based feature-row locators are correct**; no off-by-one correction was required. Full route coordinate sequences match the originals exactly, and every marker is an exact original route vertex. The source CRS declares WGS 84 geographic degrees.
- Re-read each official JSON original at its stated one-based row. All **16 source rows match every candidate field**. Stage dates were independently decoded from original timestamps using the source India time offset.
- Checked 15 exact state/district name correspondences against the saved LGD registry and the separately documented Kerala/Alappuzha correspondence for the sixteenth. This verifies documentary district correspondence, not current boundary containment of every route vertex.
- Investigated source-use conditions for the narrowly proposed text/data and archived route use. Required attribution, source dates and precision labels are supplied in each minimal card; no government logo or photo reuse is included. A permission-discovery question is now replaced by a specific documented source-use basis. Owner publication approval remains a separate workflow decision.
- The [Department of Economic Affairs explanation](https://www.dea.gov.in/index.php/brief-description-budget-documents) explicitly defines the financial year as April–March. A new original and receipt are preserved under `roads-originals/financial-year-definition.json`. For all 16 roads, a **sanction-event financial year** can therefore be derived from the independently decoded source sanction date. Each minimal card labels this basis explicitly. It is not derived from IMS_YEAR and must never be described as the project's spending/payment year. Raw source-year codes remain separately preserved.

### Five oversized-original upload blockers resolved

The public dashboard script's `loadRoadTenderDetails(stateId, districtId)` explicitly sends `StateID`, `DistrictID` and `SchemeID` to its public report endpoint. Five fresh district-filtered responses were retrieved using the exact selected source district codes. These are newly returned originals, not locally split copies:

| State / district           | Fresh original bytes | Exact selected road row |
| -------------------------- | -------------------: | ----------------------: |
| Bihar / Aurangabad         |              628,865 |                      42 |
| Madhya Pradesh / Alirajpur |              283,640 |                      89 |
| Odisha / Balangir          |              709,619 |                      21 |
| Rajasthan / Churu          |              203,252 |                      23 |
| Uttar Pradesh / Agra       |              246,493 |                      17 |

Every returned row has the requested source state/district identity. The selected road occurs exactly once and matches **all fields** of the prior state original in all five responses. Each response is below the existing 10 MiB intake cap. No cap change is needed. New hashes, exact rows, request parameters, retrieval times and file paths are in `roads-district-original-recovery.json`; each reviewed claim also points to its smaller fresh original for intake construction.

The investigation resolves source identity, original feature/row locators, exact archived coordinates, documentary district correspondence, narrow-use evidence and correctly labelled sanction-event year. It does not establish current physical condition, payment amount/unit, recipient credit or completion certificate. All publication approvals remain false.
