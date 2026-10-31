# Proposed department sample export

Prepared for custodian review; not sent and not an agreed API contract. Existing CSV/XLSX registers are welcome. Do not ask a department to create fields or certify facts it does not hold. Missing values remain blank with an explanation; zero means an actual recorded zero.

## Minimum tables

| Table       | One row represents                             | Required identity and evidence                                                                                                                                                                               |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Projects    | One source project/activity                    | Source system, official project ID, package/activity namespace, purpose, agency, financial year, official location reference and source document/locator                                                     |
| Sanctions   | One sanction or amendment edition              | Sanction ID, project ID, amount, explicit currency/unit, date, original/revised scope and superseded reference                                                                                               |
| Agreements  | One recorded agreement/work order              | Agreement ID, project/package IDs, source amount/unit, date, business executant role and document reference                                                                                                  |
| Payments    | One source transaction or recorded component   | Stable source payment ID, bill/voucher ID, component ID when applicable, status, relevant recorded dates, payee label and role, gross/deductions/net, unit, reversal/reissue references and evidence locator |
| Allocations | One documented payment-to-project share        | Payment ID, official project ID, allocated amount, gross/net/component basis and allocation-register reference                                                                                               |
| Completion  | One certificate or reported completion edition | Project ID, recorded physical completion date, portal marking date separately, certificate ID/date and source reference                                                                                      |

## Payment distinctions

- Keep initiation, treasury acceptance, cheque, recipient-credit/return and reporting dates in separate columns. Never relabel the only available date as settlement.
- State whether an entry represents a government transfer, contractor/supplier payment, statutory deduction/component, departmental advance or an unclassified flow. Department staff listed as beneficiaries are not automatically contractors.
- Supply source decimals exactly, with currency and rupee/lakh/crore definitions. If gross, deductions and net are not held separately, label the actual amount meaning rather than populate calculated fields as source facts.
- A package payment belongs once in Payments; its documented shares belong in Allocations. Do not repeat the full package amount for every road.
- Preserve Failed/returned/reissued and superseded entries. Provide links between editions, original and reversal rather than deleting history.
- If payment identity or allocation is unavailable, retain the original bill/register row and mark the missing linkage. Hisaab will quarantine it from verified project payment totals.

## Sample CSV headers for existing-record mapping

```csv
source_system,source_payment_id,bill_voucher_id,component_id,recorded_status,initiation_date,treasury_date,cheque_date,recipient_credit_return_date,payee_label,payee_role,flow_type,gross_amount,deduction_amount,net_amount,currency,source_unit,reversal_of,reissue_of,reporting_cutoff,evidence_reference
```

```csv
source_system,source_payment_id,component_id,official_project_id,allocated_amount,currency,source_unit,amount_basis,allocation_evidence_reference
```

Dates should retain their source format alongside any agreed ISO conversion. Identifiers remain text, preserving leading zeros and namespace. These are empty templates, not fabricated payment examples.

## Delivery and review

For the named pilot projects, seek a small export plus supporting originals, field definitions, filter/scope/cutoff, revision date, coverage limitations, attribution/reuse terms and a correction contact. Confirm which module/custodian holds each record, especially CePC/treasury feedback versus project-management registers. A procurement requirement does not prove a current implemented export.

Exclude account numbers, Aadhaar/PAN, private phone numbers and unnecessary personal identifiers. Do not request credentials or bank login access. Any received export stays private until project identity, amount meaning, allocation, location, permissions and explicit owner decisions are reviewed. This draft does not authorize new messages, paid access or RTI filing.

## Private staging readiness — 8 October 2026

A validator is implemented for a small agreed CSV sample. It joins existing source-system, payment/component and project IDs with recorded allocation references; it does not join by names or location. It preserves leading zeros, source dates and their roles, exact rupee/lakh/crore conversions, gross/deduction/net fields and recipient-role labels. Missing values remain missing. Departmental advances, statutory components, transfers and Failed source rows remain source records, with no automatic payment approval or total.

The optional component ID must be included in both tables when a payment has separate components; omitting it produces an unresolved join. Allocations need a recorded gross/net basis with the matching source payment amount. Partial shares remain partial; shares exceeding that amount are quarantined. Duplicate source rows are excluded and conflicting identity editions are retained as quarantine. No source rounding rule is guessed.

The project lookup table uses this header:

```csv
source_system,official_project_id,project_name,location_reference,project_evidence_reference
```

Supply a separate metadata file identifying the source correspondence/original, field-definition reference, actual scope and declared date format (`iso`, `dmy-slash` or `dmy-dash`). These metadata values are provenance supplied for review; they are not authenticity, reuse or settlement approval. Source banking/identity columns must be excluded from the mapped sample. The custodian's private original remains preserved separately. No official export has been received or imported through this validator yet; isolated test fixtures are excluded from acquisition counts.

For the acquisition operator, the implementation is `workers/department_payment_import.py`, with `--projects`, `--payments`, `--allocations` and `--metadata` files. Originals and assessments are saved under the ignored private acquisition folder with checksums and restricted file permissions. Identical repeats retain the same assessment; changed bytes or parser editions receive a separate import identity, and prior evidence remains. The output is private staging only. Owner MFA, official identity/allocation/role/site/reuse checks and explicit publication decisions still apply.

## Exact custodian record targets — 9 October 2026 research

These refine a future sample request; no new request is sent by this document. Confirm module applicability and current schema for the named project before requesting its records. Do not request credentials, access tokens or unnecessary personal/banking identifiers.

| Custodian / applicable module                                     | Existing records to seek                                                                                                                             | Verification needed                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Panchayat accounting / eGramSwaraj                                | Activity/work-code-to-voucher mapping and asset/geotag crosswalk                                                                                     | The 2021 XVFC mandatory-work-code notice is scope-specific; test current pilot vouchers rather than assume every voucher complies           |
| Odisha implementing agency, DDO and IFMIS                         | Individual claim IDs, consolidated bill ID, post-payment voucher/claim mapping, deductions, recipient capacity and transaction credit/return extract | CGA documents claim deconsolidation; applicability to each PPMS pilot remains unconfirmed                                                   |
| Chhattisgarh treasury / implementing unit                         | FTO-to-merged-file-to-bill mapping, component definitions and transaction response                                                                   | Documented integration is an export target, not Hisaab access or physical work linkage by itself                                            |
| Programme division / enabled TSA Hybrid project module            | Project-agency-claim mapping plus implementing-unit physical-work crosswalk                                                                          | PFMS project granularity must correspond to the physical work before attaching a map dot                                                    |
| CNA / agency using September 2026 programme/project functionality | Agency Program Code, Agency Project Code, Claim Transaction ID, Voucher Number, component and deduction records, existing physical-project crosswalk | Program/project identifiers are optional in limit allocation; retain nulls and confirm actual adoption, not merely documented functionality |
| Applicable TSA agency / PAO                                       | TSA01 tracking, TSA02 expenditure, TSA07 transfers, TSA08 rejection/cancellation/reversal details                                                    | Capture filter, period, Figures In scale and status definitions; transfers are separate from end payments                                   |
| Applicable TSA Hybrid agency / PAO                                | HTSA02 claim tracking, HTSA05 expenditure, HTSA06 transfer and HTSA09 monthly agency expenditure                                                     | Assignment transfers and monthly summaries do not establish individual recipient settlement                                                 |
| State IFMIS for SNA-SPARSH                                        | Individual deductions, project/component allocations and suitable transaction-level response records                                                 | PFMS gross/net values alone omit individual deduction detail; file-level movement is not beneficiary credit                                 |
| Rajasthan works division / WAM; Kerala implementing unit / BiMS   | Existing work-order/agreement, bill/voucher and payment-event crosswalk                                                                              | Authenticated workflow documentation does not establish public bulk export permission                                                       |
| JJM implementing unit / DWSM / SWSM and state treasury            | Existing water scheme and Sujalam Bharat asset IDs, scheme/asset geometry, JJM-MIS claims, IFMIS bills, deductions and transaction responses         | Confirm implemented crosswalk and granularity; central releases and prescribed integrations are not complete vendor-payment exports         |

Newer references: [1 September 2026 programme/project SOP](https://cga.nic.in/writereaddata/file/ITD94dt01092026.pdf), [30 September 2026 limit-allocation SOP](https://cga.nic.in/writereaddata/file/ITD108dt30092026.pdf), [JJM 2.0 guidelines](https://jaljeevanmission.gov.in/sites/default/files/guideline/Operational-Guidelines-JJM-2.pdf). JJM PDF pages 78/81/137 and agency-project PDF page 8 were visually checked. No access, export or new outreach is implied by adding these targets.

Primary references: [CGA SNA-SPARSH FAQ and state practices](https://cga.nic.in/writereaddata/file/OMNo115dt25092025.pdf), [CGA TSA/Hybrid reports manual](https://cga.nic.in/writereaddata/file/OMNo30SOPTSAdt04062025.pdf), [CGA project mapping](https://cga.nic.in/writereaddata/file/OMNo354-357dtdt29012025.pdf), [eGramSwaraj dated changes notice](https://panchayat.tripura.gov.in/sites/default/files/2023-10/List%20of%20Changes%20effective%20in%20eGramSwaraj%20wef%201_April_2021.pdf), [Rajasthan WAM](https://wam.rajasthan.gov.in/), [Kerala LSGD systems](https://lsgd.kerala.gov.in/en/digital-governance/other-systems/). Original official manuals are preserved privately with checksums. Full blocker solutions are included in the owner research dossier.

## Cross-export reconciliation and in-app review — 9 October 2026

After staging an authorized sample, run `workers/department_export_catalogue.py`. It checks preserved-original and assessment hashes, then reconciles exact source/payment/component identities across all preserved imports. Repeated payment editions and exact allocation identities count once. Conflicting editions, previously quarantined identities, overlapping project allocation references, combined shares exceeding recorded gross/net amounts and incompatible signs remain unresolved. Gross and net bases remain separate; full arithmetic coverage never proves settlement.

Open **Spending → Evidence progress → Department exports · Owner review**, sign in through owner MFA and select **Inspect department exports**. Search by source, payment or project ID. Review the separate date roles, recorded amount bases, source status, shares and conflicts. The API uses a whitelist, pagination and private/no-store responses; originals, payee labels and banking fields are excluded. Missing or corrupted catalogues produce an unavailable response rather than zero coverage. This interface does not approve or publish payments. Official source identity, recipient role, allocation evidence, geography, reuse and settlement decisions remain separate review steps.

No official department export was received as of this checkpoint. The empty real catalogue and all isolated test fixtures are excluded from acquired/payment coverage.
