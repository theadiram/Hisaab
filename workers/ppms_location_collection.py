"""Checkpoint observed project geotags for exact-code bill dossiers.

Coordinates and photo approvals remain source claims, never verified spending.
Only observed official links are followed; originals stay private.
"""

import argparse
import json
from urllib.parse import urlparse
from ppms_project_dossiers import ROOT, source
from ppms_geotags import parse_geotags


def candidates(dossiers):
    result = []
    for dossier in dossiers:
        project = dossier.get("project")
        if not project or dossier.get("projectConflict"):
            continue
        code = dossier["projectCode"]
        if project.get("Project Code") != code:
            raise ValueError("Project dossier identity mismatch")
        if not dossier.get("bills") or any(b["Project Code"] != code for b in dossier["bills"]):
            raise ValueError("Bill identity mismatch")
        for url in project.get("sourceLinks", []):
            parsed = urlparse(url)
            if (
                parsed.scheme == "https"
                and parsed.netloc == "ppms.odisha.gov.in"
                and parsed.path.startswith("/report/geo-tagging-status-detail/")
            ):
                result.append((code, url))
    return sorted(set(result))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-projects", type=int, default=20)
    args = parser.parse_args()
    if not 1 <= args.max_projects <= 20:
        raise ValueError("Use at most twenty projects per checkpointed batch")
    base = ROOT / "data/acquisition/ppms/projects"
    dossiers = json.loads((base / "balangir-dossiers.json").read_text())["dossiers"]
    checkpoint = base / "expanded-location-assessment.json"
    previous = (
        json.loads(checkpoint.read_text())
        if checkpoint.exists()
        else {"records": [], "failures": []}
    )
    records, failures = previous["records"], previous["failures"]
    observed = candidates(dossiers)
    attempted = {(r["projectCode"], r["sourceUrl"]) for r in records + failures}
    pending = [(code, url) for code, url in observed if (code, url) not in attempted]
    for code, url in pending[: args.max_projects]:
        try:
            html, metadata = source(url, base)
            tags = parse_geotags(html, code)
            records.append(
                dict(
                    projectCode=code,
                    sourceUrl=url,
                    source=metadata,
                    geotags=tags,
                    associationBasis="Exact project code in project, bill and geotag page",
                    actualSiteVerified=False,
                    paymentAllocationVerified=False,
                    approved=False,
                )
            )
        except Exception as error:
            failures.append(dict(projectCode=code, sourceUrl=url, error=str(error)))
    assessed = {(r["projectCode"], r["sourceUrl"]) for r in records + failures}
    remaining = sum((code, url) not in assessed for code, url in observed)
    staged = checkpoint.with_suffix(".json.tmp")
    staged.write_text(
        json.dumps(
            dict(
                records=records,
                failures=failures,
                pendingObservedLinks=remaining,
                scope="Observed Balangir geotag report dossiers with exact project/bill codes, not nationwide geometry",
                approved=False,
            ),
            indent=2,
        )
        + "\n"
    )
    staged.replace(checkpoint)
    summary = dict(
        observedProjectLinks=len(observed),
        assessedProjects=len(records),
        projectsWithSourceCoordinates=sum(bool(r["geotags"]) for r in records),
        photoLocationRecords=sum(len(r["geotags"]) for r in records),
        failures=len(failures),
        pendingObservedLinks=remaining,
        verifiedLocations=0,
        approvedPayments=0,
    )
    (ROOT / "data/ppms-expanded-location-acquisition.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
