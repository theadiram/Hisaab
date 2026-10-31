"""Review exact documentary claims on five PPMS drafts without approving release."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from ppms_geotags import parse_geotags
from ppms_ifms import parse

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/acquisition/first-dots"


def read(name):
    return json.loads((BASE / name).read_text())


def checked_source(source):
    path = ROOT / source["file"]
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("Reviewed source hash mismatch")
    return raw.decode()


def main():
    packet = read("odisha-source-evidenced-project-review-2026-10-25.json")
    extra_sources = read("odisha-additional-review-sources.json")
    policies = [
        {
            "url": "https://ppms.odisha.gov.in/privacy-policy",
            "sha256": "7748029d13d98be2307358e937e41f3e47c185d2712e436abb76dc55122d5f68",
            "findings": [
                "PPMS contact identifies Panchayati Raj and Drinking Water Department, Odisha Government.",
                "Privacy policy contains no content/data/photo reproduction grant.",
                "Footer reserves rights; no PPMS-specific open reuse licence established.",
            ],
        },
        {
            "url": "https://panchayat.odisha.gov.in/en/website-policy",
            "sha256": "24fa3c31d0523aa9245be4c132c8370bf9128e79cba70862f9b13c9abbdba305",
            "findings": [
                "Body requires permission for reproduction, accuracy, attribution and separate third-party authorization.",
                "Footer also displays CC BY 4.0, an unresolved inconsistency with the permission wording.",
                "No explicit extension to PPMS subdomain or citizen/executant photographs was found.",
            ],
        },
        {
            "url": "https://odisha.gov.in/en/website-policy",
            "sha256": "c6edcbb122db3afc8c296c09efeee89b7ceb0f1a56ca3b4def2c1d5657443b94",
            "findings": [
                "State portal also uses prior-permission reproduction wording.",
                "State-portal policy is not assumed to grant PPMS photo or database reuse rights.",
            ],
        },
    ]
    for policy in policies:
        policy["file"] = f"data/acquisition/first-dots/odisha-policy-{policy['sha256']}.html"
        checked_source(policy)
        policy["preservedOn"] = "2026-10-25"
    authority_sources = [
        r
        for r in extra_sources
        if any(
            host in r["url"]
            for host in ["balangir.odisha.gov.in", "rtiodisha.gov.in", "panchayat.odisha.gov.in"]
        )
    ]
    for source in authority_sources:
        checked_source(source)
    records = []
    for old in packet["shortlist"]:
        code = old["projectCode"]
        project_source = old["liveProjectPage"]
        rows = parse(checked_source(project_source), "exortTable")
        matches = [row for row in rows if row.get("Project Code") == code]
        if len(matches) != 1:
            raise ValueError("Expected one exact-code live project row")
        row = matches[0]
        comparisons = {
            "Project Name": "title",
            "Technical Sanction Date": "sourceTechnicalSanctionDate",
            "Administrative Approval Date": "sourceAdministrativeApprovalDate",
            "Work Status": "sourceWorkStatus",
            "Mode of Execution": "executionMode",
            "District": "district",
            "Block": "block",
        }
        if any(row[key] != old[value] for key, value in comparisons.items()):
            raise ValueError("Fresh source differs from reviewed packet")
        photo_source = old["livePhotoPage"]
        tags = parse_geotags(checked_source(photo_source), code)
        marker = old["markerCandidate"]
        members = [
            t
            for t in tags
            if t["longitude"] == marker["longitude"] and t["latitude"] == marker["latitude"]
        ]
        if not members:
            raise ValueError("Proposed point is not an exact source photo coordinate")
        if (
            row["Execution Level"] != "Panchayat Samiti"
            or row["Block"] != "Balangir"
            or row["Mode of Execution"] != "Department"
        ):
            raise ValueError("Authority/execution source basis changed")
        source_receipt = {
            "id": "ppms-reviewed-" + hashlib.sha256(code.encode()).hexdigest()[:24],
            "title": "PPMS project register: execution level and approval dates",
            "url": project_source["url"],
            "documentHash": project_source["sha256"],
            "locator": f"exortTable; row {row['Sl. No.']}; exact Project Code {code}",
            "retrievedAt": project_source["retrievedAt"][:10],
            "rawText": json.dumps(
                {
                    k: row[k]
                    for k in [
                        "Project Code",
                        "Project Name",
                        "District",
                        "Block",
                        "Execution Level",
                        "Mode of Execution",
                        "Technical Sanction Date",
                        "Administrative Approval Date",
                    ]
                },
                ensure_ascii=False,
            ),
            "permission": "Official public source inspected; PPMS reproduction rights not granted or approved by this review.",
        }
        claims = [
            {
                "claim": "Project identity",
                "value": {"code": code, "title": row["Project Name"]},
                "result": "Exact live source row matches preserved project identity",
            },
            {
                "claim": "Technical approval date reported",
                "value": row["Technical Sanction Date"],
                "result": "Exact live source cell match; approval order and amount not claimed",
            },
            {
                "claim": "Administrative approval date reported",
                "value": row["Administrative Approval Date"],
                "result": "Exact live source cell match; source approver role is BDO; current officeholder not claimed",
            },
            {
                "claim": "Execution authority/level reported",
                "value": "Panchayat Samiti, Balangir (source-reported execution level)",
                "result": "Project explicitly identifies Panchayat Samiti level and Balangir block; official office existence cross-checked",
            },
            {
                "claim": "Mode of execution",
                "value": "Department",
                "result": "Source cell confirmed; no awarded-contractor claim",
            },
            {
                "claim": "Reported photo location",
                "value": {"longitude": marker["longitude"], "latitude": marker["latitude"]},
                "result": f"Exact coordinate-string membership in {len(tags)} source photo rows for this exact project code; {len(members)} matching rows",
            },
            {
                "claim": "Source work status",
                "value": row["Work Status"],
                "result": "Exact source cell confirmed; not interpreted as physical completion",
            },
        ]
        records.append(
            {
                "projectCode": code,
                "title": old["title"],
                "reviewKind": "Source documentary facts and coordinate provenance only",
                "claims": claims,
                "projectReceipt": source_receipt,
                "photoSource": photo_source,
                "sourcePhotoRows": [
                    {
                        k: t[k]
                        for k in ["stage", "latitude", "longitude", "sourceDate", "sourceStatus"]
                    }
                    for t in tags
                ],
                "authoritySupportSources": authority_sources,
                "suggestedWorkPatch": {
                    "authority": "Panchayat Samiti, Balangir (source-reported execution level)",
                    "authorityReceipt": source_receipt,
                },
                "locationClaimReview": {
                    "pointExactlyOccursInOfficialProjectPhotoPage": True,
                    "actualProjectSiteVerified": False,
                    "roadAlignmentVerified": False,
                    "acceptableNarrowLabel": "Official project-linked photo location; project site unverified",
                    "projectSiteVerificationPending": True,
                },
                "withhold": {
                    "paymentAmounts": True,
                    "paymentDate": True,
                    "recipientSettlement": True,
                    "winningContractor": True,
                    "certifiedCompletion": True,
                    "photographs": True,
                },
                "reproductionRightsApproved": False,
                "ownerPublicationApproved": False,
            }
        )
    result = {
        "reviewedAt": datetime.now(timezone.utc).isoformat(),
        "projectsReviewed": len(records),
        "documentaryClaimsReviewed": sum(len(r["claims"]) for r in records),
        "sourceFactMismatches": 0,
        "sourcePointMembershipPasses": len(records),
        "responsibleExecutionLevelResolved": len(records),
        "records": records,
        "rightsReview": {
            "policies": policies,
            "status": "PPMS-specific republication permission unresolved",
            "textAndData": "Facts have been independently selected, paraphrased and attributed for review. No PPMS-specific content/data reproduction grant was found; do not label source rights approved.",
            "photos": "Do not copy, embed or republish source photographs. A photo metadata page linkage is not a photo reuse licence.",
            "links": "Cite exact official pages. PR&DW main-site policy permits direct links but its scope is not silently extended to all PPMS content.",
            "specificQuestionForSourceOwner": "May Hisaab publish five attributed factual project summaries and their reported photo-coordinate metadata, without copying photographs, documents or banking fields? Does PR&DW CC BY4.0 cover the PPMS report data? No request sent.",
        },
        "resolvedGaps": [
            "Five exact live project identities",
            "Ten reported technical/administrative approval-date cells",
            "Five departmental execution-level/authority source bases",
            "Five exact photo-coordinate membership checks",
            "Source-policy ambiguity documented from preserved originals rather than inferred permission",
        ],
        "remainingNarrowReleaseGaps": [
            "Explicit source reuse basis/rights resolution",
            "Owner review and publication decision",
            "If a dot claims an actual project site rather than a photo location, authoritative project-site evidence is still needed",
        ],
        "scopeLimit": "Not a legal opinion, source licence grant, owner approval, settled-payment check or physical inspection.",
    }
    (BASE / "odisha-reviewed-claims.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    )
    print(
        json.dumps(
            {
                k: result[k]
                for k in [
                    "projectsReviewed",
                    "documentaryClaimsReviewed",
                    "sourceFactMismatches",
                    "sourcePointMembershipPasses",
                    "responsibleExecutionLevelResolved",
                ]
            }
        )
    )


if __name__ == "__main__":
    main()
