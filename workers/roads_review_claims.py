"""Review narrow road claims directly against preserved originals; no approvals."""

import hashlib
import json
import re
import struct
import zipfile
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/acquisition/first-dots"


def load(path):
    return json.loads((ROOT / path).read_text())


def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def raw_feature(archive, one_based_row):
    with zipfile.ZipFile(ROOT / archive) as z:
        find = lambda ext: next(n for n in z.namelist() if n.lower().endswith(ext))
        dbf, shx, shp, prj = (z.read(find(ext)) for ext in [".dbf", ".shx", ".shp", ".prj"])
    count, header_length, record_length = struct.unpack_from("<IHH", dbf, 4)
    assert 1 <= one_based_row <= count
    record = dbf[
        header_length + (one_based_row - 1) * record_length : header_length
        + one_based_row * record_length
    ]
    assert record[0] == 32, "Deleted DBF row requires explicit row-index interpretation"
    fields, offset = {}, 1
    for i in range(32, header_length - 1, 32):
        if dbf[i] == 13:
            break
        descriptor = dbf[i : i + 32]
        name, length = descriptor[:11].split(b"\0")[0].decode("ascii"), descriptor[16]
        fields[name] = record[offset : offset + length].decode("utf-8").strip()
        offset += length
    shp_offset_words, content_words = struct.unpack_from(">II", shx, 100 + (one_based_row - 1) * 8)
    shp_offset = shp_offset_words * 2
    record_number, header_words = struct.unpack_from(">II", shp, shp_offset)
    assert record_number == one_based_row and header_words == content_words
    content = shp[shp_offset + 8 : shp_offset + 8 + content_words * 2]
    assert struct.unpack_from("<I", content)[0] == 3, "Expected original PolyLine source feature"
    part_count, point_count = struct.unpack_from("<II", content, 36)
    offsets = list(struct.unpack_from("<" + "I" * part_count, content, 44)) + [point_count]
    points = [
        list(struct.unpack_from("<dd", content, 44 + 4 * part_count + i * 16))
        for i in range(point_count)
    ]
    parts = [points[offsets[i] : offsets[i + 1]] for i in range(part_count)]
    assert "WGS_1984" in prj.decode("ascii") and "Degree" in prj.decode("ascii")
    return fields, parts, points


def main():
    packets = load("data/acquisition/first-dots/roads-evidence-limited-review.json")["packets"]
    works = {
        c["id"]: c
        for c in load("data/acquisition/first-dots/roads-work-candidates.json")["candidates"]
    }
    areas = {r["id"]: r for r in load("data/acquisition/districts.json")["areas"]}
    recovery = load("data/acquisition/first-dots/district-recovery.json")
    recovered = {p["candidateId"]: p for p in recovery["proposals"]}
    policy = load("data/acquisition/first-dots/roads-originals/pmgsy-reuse-policy.json")
    release = load("data/acquisition/first-dots/roads-originals/geography-license-release.json")
    financial_year_source = load(
        "data/acquisition/first-dots/roads-originals/financial-year-definition.json"
    )
    district_recovery_path = BASE / "roads-district-original-recovery.json"
    upload_originals = (
        {
            r["candidateId"]: r
            for r in json.loads(district_recovery_path.read_text())["requests"]
            if r["status"] == "preserved"
        }
        if district_recovery_path.exists()
        else {}
    )
    assert "1st April to 31st March" in (ROOT / financial_year_source["file"]).read_text()
    for source in [policy, release, financial_year_source]:
        assert sha(source["file"]) == source["sha256"]
    findings = []
    for p in packets:
        c = works[p["candidateId"]]
        g = p["geographySource"]
        assert sha(g["original"]) == g["sha256"]
        fields, parts, points = raw_feature(g["original"], g["featureRow"])
        raw = c["review"]["raw"]
        assert (
            int(fields["MRL_ID"]),
            int(fields["STATE_ID"]),
            int(fields["DISTRICT_I"]),
            int(fields["IMS_YEAR"]),
            int(fields["IMS_BATCH"]),
            fields["WORK_NAME"].strip().casefold(),
        ) == (
            int(raw["IMS_PR_ROAD_CODE"]),
            raw["MAST_STATE_CODE"],
            raw["MAST_DISTRICT_CODE"],
            raw["IMS_YEAR"],
            raw["IMS_BATCH"],
            raw["IMS_ROAD_NAME"].strip().casefold(),
        )
        assert parts == p["geometry"]["coordinates"], (
            "Full geometry must match the original source feature"
        )
        assert c["location"] in points, "Marker must be an actual original vertex"
        source = p["source"]
        original_path = "data/originals/pmgsy-dashboard/" + source["sha256"]
        assert sha(original_path) == source["sha256"]
        original_rows = load(original_path)
        row = int(re.search(r"JSON row (\d+)", source["locator"])[1])
        original_raw = original_rows[row - 1]
        assert original_raw == raw, "One-based original JSON row locator mismatch"
        dates = []
        for key in ["IMS_SANCTIONED_DATE", "TEND_DATE_OF_AGREEMENT"]:
            value = original_raw.get(key)
            epoch = re.fullmatch(r"/Date\((-?\d+)\)/", value or "")
            dates.append(
                datetime.fromtimestamp(
                    int(epoch[1]) / 1000, timezone(timedelta(hours=5, minutes=30))
                )
                .date()
                .isoformat()
                if epoch
                else None
            )
        assert dates == [p["sourceReportedSanctionDate"], p["sourceReportedAgreementDate"]]
        sanction_date = datetime.strptime(dates[0], "%Y-%m-%d").date()
        fy_start = sanction_date.year if sanction_date.month >= 4 else sanction_date.year - 1
        sanction_fy = f"{fy_start}-{fy_start + 1}"
        area = areas[c["areaId"]]
        if c["id"] in recovered:
            assert recovered[c["id"]]["areaId"] == c["areaId"]
            district_basis = "Exact district-name correspondence plus separately documented Keralam/Kerala state-label proposal"
        else:
            assert area["name"].strip().casefold() == c["district"].strip().casefold()
            assert area["state"].strip().casefold() == c["state"].strip().casefold()
            district_basis = "Exact state/district names in saved official LGD registry"
        claim_checks = {
            "officialWorkIdentity": {
                "result": "supported",
                "source": source,
                "exactOriginalRowMatched": True,
            },
            "archivedProposalRoute": {
                "result": "supported_with_scope",
                "archiveSha256": g["sha256"],
                "oneBasedDbfShpRow": g["featureRow"],
                "rowLocatorCorrect": True,
                "fullRouteCoordinatesMatched": True,
                "markerExactlyMatchesOriginalVertex": True,
                "crs": "WGS 84 geographic degrees",
                "meaning": "Archived proposal route, not independently verified physical road/site.",
            },
            "districtAssociation": {
                "result": "supported_as_proposed_correspondence",
                "areaId": c["areaId"],
                "registryName": area["name"],
                "registryState": area["state"],
                "basis": district_basis,
                "registryImportedAt": "2026-10-06",
                "physicallyWithinCurrentDistrictBoundaryVerified": False,
            },
            "sourceReportedDates": {
                "result": "supported_as_source_report",
                "sanctionDate": dates[0],
                "agreementDate": dates[1],
                "meaning": "Dashboard stage dates, not independently acquired original sanction/signed contract documents.",
            },
            "sourceUseBasis": {
                "result": "documented_for_narrow_text_data_and_archived_geometry",
                "officialTextDataPolicy": policy,
                "officialGeographyRelease": release,
                "requiredPresentation": [
                    "Accurate attribution",
                    "Source retrieval/edition dates",
                    "No government endorsement claim",
                    "Archived proposal precision label",
                    "No logo or photo reuse included",
                ],
            },
            "financialYear": {
                "result": "supported_as_derived_sanction_event_year",
                "rawSourceYear": raw["IMS_YEAR"],
                "sanctionEventFinancialYear": sanction_fy,
                "basisDate": dates[0],
                "calendarDefinitionSource": financial_year_source,
                "reason": "Derived solely from the dated sanction event using the official April–March financial-year definition. IMS_YEAR interpretation remains unproven and is not used. This is not a spending/payment/contract-lifecycle year.",
            },
            "moneyPaymentsCompletion": {
                "result": "withheld",
                "amounts": None,
                "recipient": None,
                "completionCertificate": None,
                "actualSiteIndependentlyVerified": False,
            },
        }
        minimal_card = {
            "title": c["title"],
            "officialRoadId": p["officialRoadId"],
            "packageReference": c["officialIds"][1] if len(c["officialIds"]) > 1 else None,
            "state": area["state"],
            "district": area["name"],
            "location": c["location"],
            "mapLabel": "Archived proposal route · actual road/site unverified",
            "sourceReportedSanctionDate": dates[0],
            "sourceReportedAgreementDate": dates[1],
            "agreementReference": p["sourceReportedAgreementReference"],
            "sourceReportedStatus": p["sourceReportedWorkStatus"],
            "statusAsOf": source["retrievedAt"],
            "financialYear": sanction_fy,
            "financialYearLabel": "Financial year containing source-reported sanction date",
            "rawSourceYearCode": raw["IMS_YEAR"],
            "money": [],
            "notice": "Official work record linked to archived 2022 proposal geometry. Current condition, expenditure, recipient payments and completion certificates are not established.",
            "attribution": "OMMAS portal, NRIDA, Ministry of Rural Development; GeoSadak 2022 GIS release via DataMeet archived mirror, Government Open Data License India.",
            "evidenceReview": "Original-source, coordinate and narrow-use evidence investigated; owner publication decision not recorded.",
            "publicationApproved": False,
        }
        upload_source = None
        if c["id"] in upload_originals:
            fresh = upload_originals[c["id"]]
            assert sha(fresh["file"]) == fresh["sha256"]
            fresh_raw = load(fresh["file"])[fresh["exactRoadRow"] - 1]
            assert fresh_raw == raw and fresh["sameAllFieldsAsPriorEdition"]
            upload_source = {
                k: fresh[k]
                for k in ["url", "query", "sha256", "file", "bytes", "retrievedAt", "exactRoadRow"]
            }
            upload_source["locator"] = (
                f"JSON row {fresh['exactRoadRow']}; IMS_PR_ROAD_CODE {p['officialRoadId']}; StateID {fresh['query']['StateID']}; DistrictID {fresh['query']['DistrictID']}"
            )
            upload_source["meaning"] = (
                "Fresh official district-filtered response, not a sliced original; selected row agrees in every field with prior state edition."
            )
        findings.append(
            {
                "candidateId": c["id"],
                "checks": claim_checks,
                "minimalAccurateCard": minimal_card,
                "smallerFreshOfficialOriginal": upload_source,
                "ownerPublicationApproval": False,
                "remainingEvidenceClaimsWithheld": [
                    "Current actual road/site verification",
                    "Financial amounts/units",
                    "Individual project payments and recipient roles",
                    "Completion certificate",
                    "Unproven IMS_YEAR semantics and project spending-year attribution",
                ],
            }
        )
    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "reviewedRoads": len(findings),
        "originalFeatureRowsVerified": len(findings),
        "exactOriginalCoordinateMembershipVerified": len(findings),
        "sourceJsonRowLocatorsVerified": len(findings),
        "rowLocatorCorrectionsRequired": 0,
        "existingExactDistrictCorrespondences": 15,
        "newKeralaStateCorrespondences": 1,
        "scope": "Narrow source-identity, archived route, original coordinates, district correspondence and use-basis investigation; no owner approval or publication.",
        "records": findings,
    }
    (BASE / "roads-reviewed-claims.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({k: v for k, v in report.items() if k != "records"}))


if __name__ == "__main__":
    main()
