"""Prepare a private, unsent named-record annex from exact pilot bill IDs."""

import json
import re
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKER = "\n\n## Named bill-record request annex\n"


def main():
    base = ROOT / "data/acquisition/ppms"
    gaps = json.loads((base / "projects/pilot-gap-register.json").read_text())
    payments = json.loads((base / "state-payment-details/assessment.json").read_text())["records"]
    visible_path = base / "payment-details/additional-visible-bill-details.json"
    visible = json.loads(visible_path.read_text())["records"] if visible_path.exists() else []
    visible_by_bill = {(r["projectCode"], r["billSerial"]): r for r in visible}
    lines = [
        MARKER.strip(),
        "",
        "Prepared from preserved exact project and bill identities. Not sent or filed; no applicant details, fees or new outreach authorized. Source units and settlement remain unverified.",
        "",
        "### Missing exposed supporting documents",
        "",
        "Please supply existing bill/payment-advice records for the following named bills, or identify their custodian. A missing exposed PDF does not establish that no payment occurred.",
        "",
    ]
    missing = [
        c for c in gaps["cases"] if "No assessed observed bill-linked document" in c["specificGaps"]
    ]
    for c in missing:
        lines.append(
            f"- {c['projectCode']} — {c['title']}; bill IDs: {', '.join(c['billReferences'])}."
        )
    lines += [
        "",
        "### Missing original cheque dates and references",
        "",
        "Please supply the existing dated payment advice, cheque/reference register and recipient transaction/return records for these exact bills. Preserve cheque issue, treasury processing and actual credit dates as separate fields. An empty public workflow result is not evidence that no payment occurred.",
        "",
        "| Official project / bill | Project | Report amount | Original cheque amount |",
        "|---|---|---:|---:|",
    ]
    for c in gaps["cases"]:
        if "Cheque date and number absent in original" not in c["specificGaps"]:
            continue
        for r in payments:
            if (
                r["projectCode"] == c["projectCode"]
                and r["billSerial"] in c["billReferences"]
                and not r.get("reportConflict")
                and not r["cheque"]["chequeDate"]
            ):
                lines.append(
                    f"| {r['projectCode']} / {r['billSerial']} | {c['title']} | {r['reportAmount']} | {r['cheque']['chequeAmount']} |"
                )
    lines += [
        "",
        "### Readable source amount discrepancies",
        "",
        "Please supply existing component/allocation registers, payment-advice editions and correction/reversal references explaining the figures below. Differences use source decimals without conversion; do not infer gross/net basis or settlement from arithmetic.",
        "",
        "| Official project / bill | Report amount | Cheque amount | PDF component sum | Visible dialog sum | Cheque minus PDF sum |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    discrepancies = 0
    for c in gaps["cases"]:
        for r in payments:
            if (
                r["projectCode"] != c["projectCode"]
                or r["billSerial"] not in c["billReferences"]
                or r.get("reportConflict")
                or r["beneficiaryBreakdown"]["layoutClipped"]
                or r["beneficiariesMatchCheque"]
                or r["beneficiarySum"] is None
            ):
                continue
            delta = Decimal(r["cheque"]["chequeAmount"]) - Decimal(r["beneficiarySum"])
            dialog = visible_by_bill.get((r["projectCode"], r["billSerial"]))
            visible_sum = dialog["beneficiarySum"] if dialog else "Not collected"
            lines.append(
                f"| {r['projectCode']} / {r['billSerial']} | {r['reportAmount']} | {r['cheque']['chequeAmount']} | {r['beneficiarySum']} | {visible_sum} | {delta} |"
            )
            discrepancies += 1
    lines += [
        "",
        "For every response, retain the official project/bill identifiers, original record reference, revision/cutoff and amount definitions. Ask for documented project shares of package/component payments, recipient capacity and actual credit/return references where held. Do not request bank accounts or unnecessary personal identifiers.",
        "",
        "This annex supplements the existing agency/RTI preparation; the responsible authority, submission route and applicant information must still be confirmed before filing. No inferred payment totals or approvals result from this checklist.",
    ]
    doc = ROOT / "docs/ppms-expanded-evidence-review.md"
    text = doc.read_text().split(MARKER)[0].rstrip()
    for label in (
        "No assessed observed bill-linked document",
        "PDF component amounts clipped; visible bill dialog needed",
        "Cheque date and number absent in original",
        "Readable beneficiary totals differ from cheque",
        "Failed bill; do not count as payment",
    ):
        text = re.sub(
            r"- " + re.escape(label) + r": \d+ projects",
            f"- {label}: {gaps['specificGapCounts'].get(label, 0)} projects",
            text,
        )
    if visible_path.exists():
        differences = sum(not r["matchesReportAmount"] for r in visible)
        paragraph = (
            f"{len(visible)} separately observed official bill dialogs are preserved privately with checksums. "
            f"{gaps['specificGapCounts'].get('PDF component amounts clipped; visible bill dialog needed', 0)} pilot projects still await clipped-component reading. "
            "Original PDFs remain unchanged and retain their clipped-layout labels. "
            f"{len(visible) - differences} visible totals match their reported bill amounts; {differences} differ and remain unresolved. "
            "These totals are component arithmetic, not new payments or verified settlement. Engineering-role labels are not assumed to be contractors. "
            "Missing transaction dates, agreements, actual sites, amount definitions, allocation/recipient roles and reuse remain unresolved."
        )
        text = re.sub(
            r"(## Pilot component recovery[^\n]*\n\n).*?(?=\n\n##)",
            lambda m: m.group(1) + paragraph,
            text,
            flags=re.S,
        )
    text = re.sub(
        r"All \d+ currently assessed statewide documents remain private and unapproved\.",
        f"All {len(payments)} currently assessed statewide documents remain private and unapproved.",
        text,
    )
    doc.write_text(text + "\n\n" + "\n".join(lines) + "\n")
    print(
        json.dumps(
            dict(
                missingDocumentProjects=len(missing),
                readableDiscrepancyBills=discrepancies,
                sent=False,
                approvedPayments=0,
            )
        )
    )


if __name__ == "__main__":
    main()
