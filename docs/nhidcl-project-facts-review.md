# NHIDCL project-fact review checkpoint

15 October 2026. Private review packets; no new publication or payment approval.

## What was checked

- The preserved original PDF checksum matches its source receipt.
- A fresh extraction of PDF page 2 matches the cached 410-row table.
- The original headings explicitly label Total Project Cost and Awarded Cost in crore.
- All 211 in-scope state candidates match the original UPN, title, lifecycle status, costs, award date and reported completion date.
- 168 candidates have a positive contract amount, a calendar award date, a meaningful contractor field and no lifecycle termination/reaward/unappointed flag. These are first in the card-review queue.
- The other 43 need contract/date/contractor or lifecycle clarification.

## State breakdown

| State             | Contract facts first | Resolve source gaps |
| ----------------- | -------------------: | ------------------: |
| Arunachal Pradesh |                   13 |                   6 |
| Assam             |                   42 |                  10 |
| Manipur           |                   29 |                   5 |
| Meghalaya         |                   11 |                   7 |
| Mizoram           |                   20 |                   1 |
| Nagaland          |                   18 |                   3 |
| Sikkim            |                    8 |                   5 |
| Tripura           |                   11 |                   3 |
| Uttarakhand       |                    4 |                   0 |
| West Bengal       |                   12 |                   3 |

## Rights evidence

The [NHIDCL website policy](https://www.nhidcl.com/en/website-policies) allows accurate reproduction with prominent attribution and excludes third-party copyrighted material. The policy page is preserved privately with a SHA-256 receipt. This is a documented basis for review; it does not automatically approve every document or candidate.

## What remains

Exact geography, bill-to-project allocations, recipient payment dates, gross/net definitions, payment status and completion certificates remain missing from these register rows. Project cost and awarded cost remain separate; financial-progress percentages are not converted into money paid. A reported completion date is distinct from a certificate.

The owner card view prioritises the 168 stronger records, attaches a comparison notice only when the current facts and source edition still match the packet, and preserves explicit missing fields. No public map dots, payment totals, recipient claims or approval decisions are created.

Regenerate comparisons with `workers/nhidcl_card_review.py` using the project dependency environment.
