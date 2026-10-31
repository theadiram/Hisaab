"""Validate official MoRD state-wise rural development funding tables.

The source is a PIB parliamentary answer that reproduces MoRD/NREGA Soft
tables. Values are private candidates, not owner-reviewed public records.
"""

import hashlib
import json
import re
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/acquisition/national-rural-development/mord-rural-works-finance.json"
RELEASES_ORIGINAL = (
    ROOT
    / "data/originals/national-rural-development/mgnregs-funds-releases-2021-22-through-2025-26-pib-prid-2288990.html"
)
WATER_ORIGINAL = (
    ROOT
    / "data/originals/national-rural-development/mgnregs-water-works-expenditure-through-2026-06-30-pib-prid-2295541.html"
)
RELEASES_HASH = "2fc03ec5824364738dedc91c837735a0db650b32036e9b71f699fa24e484f470"
WATER_HASH = "b8950054ec42bc57e293bcac427b819e226364cbfdce25f98c455f74569b4f51"
STATES = {
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
}


class TableParser(HTMLParser):
    """Small standard-library table reader; select by source heading text."""

    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = None

    def handle_starttag(self, tag, attrs):
        if tag == "table" and self.table is None:
            self.table = {"rows": [], "row": None, "cell": None}
            self.tables.append(self.table)
        elif self.table is not None and tag == "tr":
            self.table["row"] = []
        elif self.table is not None and tag in ("td", "th"):
            self.table["cell"] = ""

    def handle_data(self, data):
        if self.table is not None and self.table.get("cell") is not None:
            self.table["cell"] += data

    def handle_endtag(self, tag):
        if self.table is None:
            return
        if tag in ("td", "th") and self.table.get("cell") is not None:
            self.table["row"].append(" ".join(self.table["cell"].split()))
            self.table["cell"] = None
        elif tag == "tr" and self.table.get("row") is not None:
            if self.table["row"]:
                self.table["rows"].append(self.table["row"])
            self.table["row"] = None
        elif tag == "table":
            self.table = None


def tables_from(path):
    parser = TableParser()
    parser.feed(path.read_text(errors="replace"))
    return [table["rows"] for table in parser.tables]


def number(value, unit):
    value = value.strip().replace(",", "").replace("₹", "").replace("Rs.", "").strip()
    if value in ("", "-", "—", "–"):
        return None
    amount = Decimal(value)
    # Stable decimal strings without float conversion or trailing zero noise.
    text = format(amount, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def pick(rows, predicate):
    for table in rows:
        if predicate(" ".join(" ".join(row) for row in table).lower()):
            return table
    raise ValueError("Expected source table not found")


def parse_release_table(rows):
    table = pick(rows, lambda text: "funds released (rs. in crores)" in text)
    years = table[2]
    if years != ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"]:
        raise ValueError(f"Unexpected MGNREGS release years: {years}")
    records, printed = [], None
    for row in table[3:]:
        if row[0].strip().lower() == "total":
            printed = {year: number(value, "crore_rupees") for year, value in zip(years, row[2:])}
            break
        if len(row) < 7:
            raise ValueError(f"Malformed release row: {row}")
        records.append(
            {
                "jurisdiction": row[1],
                "values": {
                    year: number(value, "crore_rupees") for year, value in zip(years, row[2:7])
                },
            }
        )
    return records, printed


def parse_vb_table(rows):
    table = pick(
        rows, lambda text: "total interim allocation" in text and "mother sanctions issued" in text
    )
    if len(table[1]) != 4 or "Mother Sanctions Issued as 1st Installment" not in table[1][3]:
        raise ValueError("Unexpected VB-G RAM-G headings")
    records, printed, admin = [], None, None
    for row in table[2:]:
        if len(row) >= 4 and row[1].strip().lower() == "total":
            printed = {
                "interimAllocationCrore": number(row[2], "crore_rupees"),
                "firstInstallmentMotherSanctionCrore": number(row[3], "crore_rupees"),
            }
        elif row[0].lower().startswith("funds for social audit"):
            admin = number(row[1], "crore_rupees")
        elif row and row[0].strip().isdigit():
            records.append(
                {
                    "jurisdiction": row[1],
                    "interimAllocationCrore": number(row[2], "crore_rupees"),
                    "firstInstallmentMotherSanctionCrore": number(row[3], "crore_rupees"),
                }
            )
    # The final printed grand total follows a separate central admin row.
    grand = None
    for row in table:
        if row and row[0].strip() == "Total" and len(row) == 3:
            grand = number(row[1], "crore_rupees")
    return records, printed, admin, grand


def parse_water_table(rows):
    table = pick(rows, lambda text: "water related works" in text and "30th june 2026" in text)
    years = table[2][2:]
    if years != ["2026-27", "2025-26", "2024-25", "2023-24"]:
        raise ValueError(f"Unexpected water-work years: {years}")
    records, printed = [], None
    for row in table[4:]:
        if len(row) >= 6 and row[1].strip().lower() == "total":
            printed = {year: number(value, "lakh_rupees") for year, value in zip(years, row[2:6])}
            break
        if row and row[0].strip().isdigit():
            records.append(
                {
                    "jurisdiction": row[1],
                    "valuesLakhRupees": {
                        year: number(value, "lakh_rupees") for year, value in zip(years, row[2:6])
                    },
                }
            )
    return records, printed


def normalize_name(name):
    name = name.strip().rstrip("*").strip()
    aliases = {
        "Dn Haveli And Dd": "Dadra and Nagar Haveli and Daman and Diu",
        "Dadra & Nagar Haveli Daman & Diu": "Dadra and Nagar Haveli and Daman and Diu",
        "Dadra Nagar Haveli & Daman Diu": "Dadra and Nagar Haveli and Daman and Diu",
        "Andaman & Nicobar": "Andaman and Nicobar Islands",
        "Andaman and Nicobar": "Andaman and Nicobar Islands",
        "Andaman And Nicobar": "Andaman and Nicobar Islands",
        "Jammu And Kashmir": "Jammu and Kashmir",
        "Jammu & Kashmir": "Jammu and Kashmir",
        "Dn Haveli And Dd": "Dadra and Nagar Haveli and Daman and Diu",
    }
    return aliases.get(name, name)


def jurisdictions(records):
    out = []
    for row in records:
        name = normalize_name(row["jurisdiction"])
        out.append(
            {**row, "jurisdiction": name, "type": "state" if name in STATES else "unionTerritory"}
        )
    return out


def build():
    releases_rows = tables_from(RELEASES_ORIGINAL)
    water_rows = tables_from(WATER_ORIGINAL)
    releases, release_totals = parse_release_table(releases_rows)
    allocations, allocation_totals, central_admin, grand_total = parse_vb_table(releases_rows)
    water, water_totals = parse_water_table(water_rows)
    release_records = jurisdictions(releases)
    allocation_records = jurisdictions(allocations)
    water_records = jurisdictions(water)
    release_differences = {}
    for year, printed in release_totals.items():
        row_sum = sum(Decimal(row["values"][year]) for row in release_records)
        difference = row_sum - Decimal(printed)
        if difference:
            release_differences[year] = {
                "stateAndUtRowSumCrore": format(row_sum, "f"),
                "printedTotalCrore": printed,
                "rowSumMinusPrintedCrore": format(difference, "f"),
            }
    return {
        "source": {
            "title": "Ministry of Rural Development parliamentary answer: VB-G RAM-G allocations, MGNREGS releases and water-related works expenditure",
            "originals": [
                {
                    "path": str(RELEASES_ORIGINAL.relative_to(ROOT)),
                    "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2288990&lang=1&reg=48",
                    "sha256": RELEASES_HASH,
                    "retrievedOn": "2026-10-15",
                },
                {
                    "path": str(WATER_ORIGINAL.relative_to(ROOT)),
                    "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295541&lang=2&reg=48",
                    "sha256": WATER_HASH,
                    "retrievedOn": "2026-10-15",
                },
            ],
            "attribution": "As reported in MoRD answers to Parliament; the MGNREGS figures state source as NREGA Soft.",
            "rightsReviewed": False,
        },
        "publicationApproved": False,
        "settlementVerified": False,
        "scope": "Scheme-level State/UT aggregates only; no project IDs, site coordinates, recipient-level transaction detail, or proof of bank settlement.",
        "mgnregsReleases": {
            "measure": "fundsReleased",
            "unit": "crore_rupees",
            "financialYears": ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"],
            "basis": "Union funds reported released under Mahatma Gandhi NREGS; not state utilisation or contractor payments.",
            "records": release_records,
            "printedTotals": release_totals,
            "controlDifferences": release_differences,
            "westBengalNote": "The source reports no releases in FY2021-22 through FY2025-26 and says implementation resumed 1 June 2026; do not infer zero across all subsequent programmes.",
        },
        "vbGramG": {
            "measure": "interimAllocationAndFirstInstallmentMotherSanction",
            "unit": "crore_rupees",
            "asOf": "2026-07-16",
            "financialYear": "2026-27",
            "basis": "Allocation and mother-sanction amounts are not expenditure or settlement. Programme commenced 1 July 2026.",
            "records": allocation_records,
            "printedStateTotal": allocation_totals,
            "centralSocialAuditAndAdministrationSeparate": central_admin,
            "printedGrandTotalIncludingCentralAdmin": grand_total,
        },
        "mgnregsWaterWorks": {
            "measure": "reportedExpenditureOnWaterRelatedWorks",
            "unit": "lakh_rupees",
            "financialYears": ["2026-27", "2025-26", "2024-25", "2023-24"],
            "cutoff": "2026-06-30",
            "basis": "State-reported MGNREGS expenditure aggregate for water-related works; no project split or individual payments. FY2026-27 figure stops before VB-G RAM-G commencement on 1 July 2026.",
            "records": water_records,
            "printedTotalsLakhRupees": water_totals,
        },
    }


def validate(data=None):
    data = data or json.loads(DATA.read_text())
    for item, expected in zip(data["source"]["originals"], [RELEASES_HASH, WATER_HASH]):
        original = ROOT / item["path"]
        digest = hashlib.sha256(original.read_bytes()).hexdigest()
        if digest != expected or digest != item["sha256"]:
            raise ValueError(f"Original checksum mismatch: {item['path']}")
    if (
        data["publicationApproved"]
        or data["settlementVerified"]
        or data["source"]["rightsReviewed"]
    ):
        raise ValueError("Unreviewed source cannot be public or settlement-verified")
    expected_names = STATES
    for key in ["mgnregsReleases", "vbGramG", "mgnregsWaterWorks"]:
        rows = data[key]["records"]
        states = {row["jurisdiction"] for row in rows if row["type"] == "state"}
        if len(rows) != 34 or states != expected_names:
            raise ValueError(f"{key}: expected all 28 states and 6 UTs")
        if len({row["jurisdiction"] for row in rows}) != len(rows):
            raise ValueError(f"{key}: duplicate jurisdiction")
    r = data["mgnregsReleases"]
    release_differences = {}
    for year in r["financialYears"]:
        actual = sum(Decimal(row["values"][year]) for row in r["records"])
        difference = actual - Decimal(r["printedTotals"][year])
        if abs(difference) > Decimal("0.03"):
            raise ValueError(
                f"MGNREGS release control mismatch {year}: {actual} != {r['printedTotals'][year]}"
            )
        if difference:
            release_differences[year] = format(difference, "f")
    if {
        year: diff["rowSumMinusPrintedCrore"] for year, diff in r["controlDifferences"].items()
    } != release_differences:
        raise ValueError("MGNREGS printed-control difference ledger mismatch")
    water = data["mgnregsWaterWorks"]
    for year, expected in water["printedTotalsLakhRupees"].items():
        actual = sum(
            Decimal(row["valuesLakhRupees"][year])
            for row in water["records"]
            if row["valuesLakhRupees"][year] is not None
        )
        if actual != Decimal(expected):
            raise ValueError(f"Water-work control mismatch {year}: {actual} != {expected}")
    alloc = data["vbGramG"]
    for field, expected in alloc["printedStateTotal"].items():
        actual = sum(Decimal(row[field]) for row in alloc["records"])
        if actual != Decimal(expected):
            raise ValueError(f"VB-G RAM-G state control mismatch {field}: {actual} != {expected}")
    if Decimal(alloc["printedStateTotal"]["interimAllocationCrore"]) + Decimal(
        alloc["centralSocialAuditAndAdministrationSeparate"]
    ) != Decimal(alloc["printedGrandTotalIncludingCentralAdmin"]):
        raise ValueError("VB-G RAM-G grand total control mismatch")
    return {
        "jurisdictionsPerTable": 34,
        "statesPerTable": 28,
        "mgnregsReleaseCells": 170,
        "waterWorkExpenditureCells": 136,
        "vbGramGAllocationRows": 34,
        "sourceHashesVerified": True,
        "waterAndAllocationControlsExact": True,
        "mgnregsReleasePrintedDifferencesCrore": release_differences,
        "printedControlsReconciled": not release_differences,
        "projectPayments": 0,
        "publicationApproved": False,
        "settlementVerified": False,
    }


if __name__ == "__main__":
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(build(), indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(validate(), indent=2))
