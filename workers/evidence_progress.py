"""Build factual public progress and private pilot dossiers from preserved inputs."""

import json
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from national_evidence_coverage import current as national_coverage
from delhi_coverage import current as delhi_coverage

ROOT = Path(__file__).resolve().parents[1]


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def draft_if_missing(path, text):
    if not path.exists():
        path.write_text(text)


def main():
    cases = json.loads(
        (ROOT / "data/acquisition/ommas-financial/road-financial-cases.json").read_text()
    )["cases"]
    tasks = [
        dict(
            id="road-public",
            lane="public",
            title="Trace the ten Odisha roads",
            owner="Hisaab",
            status="In progress",
            blocker="Eight sanction conflicts; contract units and bill allocations unresolved.",
            nextAction="Inspect project-specific official reports and retain each edition.",
            followUpOn=None,
            supportingRecord="OMMAS final-bill export; ten matched rows",
        ),
        dict(
            id="panchayat-public",
            lane="public",
            title="Select the best-evidenced panchayat",
            owner="Hisaab + owner",
            status="Access assistance needed",
            blocker="Public cashbook requires CAPTCHA; export/reuse authorization pending.",
            nextAction="Obtain authorized activity/location/voucher samples; assess up to five panchayats.",
            followUpOn=None,
            supportingRecord="eGramSwaraj cashbook access assessment",
        ),
        dict(
            id="nrida-export",
            lane="department",
            title="NRIDA project-to-payment export",
            owner="NRIDA / Hisaab",
            status="Forwarded · data response pending",
            blocker="NRIDA forwarded the request on 7 October 2026; no export, field definitions or reuse permission supplied.",
            nextAction="Assess the custodian response for bill-to-road allocations and field definitions; retain the planned follow-up date.",
            followUpOn="2026-10-16",
            supportingRecord="Incoming forwarding message preserved privately; routing is not data acceptance or payment coverage",
        ),
        dict(
            id="egram-export",
            lane="department",
            title="eGramSwaraj activity-to-voucher export",
            owner="eGramSwaraj / Hisaab",
            status="Sent · response pending",
            blocker="No substantive response; reuse permission unresolved.",
            nextAction="Request authorized sample and attributed publication terms.",
            followUpOn="2026-10-16",
            supportingRecord="Authorized request sent 7 October 2026",
        ),
        dict(
            id="roads-rti",
            lane="rti",
            title="Existing records for ten named roads",
            owner="Hisaab drafts · owner submits",
            status="Draft prepared",
            blocker="Verify current PIO and applicant details before filing.",
            nextAction="Review draft, identify record custodian and submit through the appropriate official route.",
            followUpOn="2026-10-27",
            supportingRecord="Ten-road RTI draft",
        ),
        dict(
            id="panchayat-rti",
            lane="rti",
            title="Project-specific panchayat request",
            owner="Hisaab drafts · owner submits",
            status="Waiting for pilot selection",
            blocker="No verified panchayat/activity IDs selected.",
            nextAction="Fill named activity IDs and custodian after sample assessment; do not submit a generic request.",
            followUpOn=None,
            supportingRecord="Panchayat RTI preparation template",
        ),
        dict(
            id="road-partner",
            lane="partnership",
            title="Odisha implementing-unit pilot",
            owner="Hisaab + owner",
            status="Proposal prepared",
            blocker="Current named custodian/contact verification needed.",
            nextAction="Verify official unit contacts and seek authorization for targeted outreach.",
            followUpOn=None,
            supportingRecord="Agency pilot proposal",
        ),
        dict(
            id="panchayat-partner",
            lane="partnership",
            title="Panchayat accounting and engineering pilot",
            owner="Hisaab + owner",
            status="Waiting for pilot selection",
            blocker="Pilot area and accountable contact not established.",
            nextAction="Use selected area; request activity register, voucher links and correction contact.",
            followUpOn=None,
            supportingRecord="Agency pilot proposal",
        ),
    ]
    sample_path = ROOT / "data/acquisition/egramswaraj/chandanbhati-march-2026.json"
    sample = json.loads(sample_path.read_text()) if sample_path.exists() else None
    if sample:
        task = next(t for t in tasks if t["id"] == "panchayat-public")
        task.update(
            status="Sample assessed · two work references",
            blocker="Exact project locations, stable activity IDs, sanctions, contracts and reuse permission missing; one voucher has a recipient-total conflict.",
            nextAction="Obtain work registers for CR 04-2025-26 (Baghala drain with CC road) and CR 20-2024-25 (GP office maintenance); resolve voucher P/35 discrepancy.",
            supportingRecord="Chandanbhati · March 2026: 10 payment vouchers and 3 grant receipts; 4 payment vouchers name 2 work references. Cashbook balances reconcile. No map projects published.",
        )
        task = next(t for t in tasks if t["id"] == "panchayat-rti")
        task.update(
            status="Named records and public authority identified",
            blocker="Proposed activity links need approval; applicant details and current office contact must be confirmed before filing.",
            nextAction="Use the named CR/activity and PPMS bill annexes; address the PIO of Panchayat Samiti Office, Balangir. Owner handles applicant details, filing and fees; no submission made.",
            supportingRecord="Panchayat request draft updated with cashbook references",
        )
        task = next(t for t in tasks if t["id"] == "panchayat-partner")
        task.update(
            status="Chandanbhati sample candidate",
            blocker="Official custodian/contact and project geography not established.",
            nextAction="Verify accounting/engineering custodian; seek work registers and coordinates for the two named CR references.",
        )
    contact_path = (
        ROOT / "data/acquisition/agency-contacts/balangir-bdo-directory-2026-10-08.provenance.json"
    )
    if contact_path.exists():
        task = next(t for t in tasks if t["id"] == "panchayat-partner")
        task.update(
            status="Official office address verified · request prepared",
            blocker="Actual record custodian, project allocations and site evidence remain unconfirmed.",
            nextAction="Send the prepared role-addressed office request when specifically authorized; ask the office to route it to accounting/engineering.",
            supportingRecord="Official BDO directory HTML preserved with checksum. Current incumbent not independently verified; proposal available in Owner request dossier.",
        )
    send_path = ROOT / "data/acquisition/agency-contacts/balangir-request-send-status.json"
    if send_path.exists():
        send = json.loads(send_path.read_text())
        task = next(t for t in tasks if t["id"] == "panchayat-partner")
        if send["status"] == "send_blocked":
            task.update(
                status="Authorized · sending temporarily blocked",
                blocker="Gmail service query quota rejected sending; no sent-message confirmation. Evidence/custodian gaps remain.",
                nextAction="Check Sent mail for duplicates before retrying the already authorized office request after quota recovery. No further approval required for this exact request.",
                supportingRecord="Specific owner authorization recorded; request prepared. No claim of delivery or partnership acceptance.",
            )
        elif send["status"] == "sent":
            task.update(
                status="Sent · custodian response pending",
                blocker="No official sample, allocation/geography confirmation or publication terms yet.",
                nextAction="Assess the office response and record custody; follow up after seven working days, checking office holidays.",
                followUpOn=send.get("followUpOn"),
                supportingRecord="Specifically authorized office request; Gmail sent-message receipt preserved privately. Sending is not data acceptance.",
            )
    api_summary_path = ROOT / "data/panchayat-acquisition.json"
    api_summary = json.loads(api_summary_path.read_text()) if api_summary_path.exists() else None
    if api_summary:
        task = next(t for t in tasks if t["id"] == "panchayat-public")
        task.update(
            status="API collection working · three plan years",
            blocker="Two proposed cashbook/activity links need review; geotag accuracy, contracts, gross/net basis and reuse permission unresolved.",
            nextAction="Review CR 04 against activity 122313690; confirm CR 20 mapping. Obtain bill/voucher detail and verify reported upload locations before publication.",
            supportingRecord=f"Chandanbhati: {api_summary['planningRecords']} activity-year planning records; {api_summary['administrativeRecords']} administrative approvals; {api_summary['activitiesWithReportedGeotags']} activity-year records with reported geotags. 111 report activities vs 100 API activities in FY 2025–26; eleven report-only rows are Activity Created. Zero approved map projects.",
        )
        task = next(t for t in tasks if t["id"] == "egram-export")
        task.update(
            nextAction="Confirm approved-activity API scope, supported collection limits, units, current payment/voucher service and reuse terms; provide the two pilot activity candidates.",
            supportingRecord="NIC v3.0 documentation and successful four-module pilot responses; sent request still awaiting reply",
        )
    ppms_path = ROOT / "data/ppms-acquisition.json"
    if ppms_path.exists():
        ppms = json.loads(ppms_path.read_text())
        tasks.append(
            dict(
                id="ppms-public",
                lane="public",
                title="Odisha project-linked treasury bills",
                owner="Hisaab",
                status="155 project joins · five cheque records",
                blocker="Payment dates, recipients, gross/net definitions, report cutoff, exact project geography and reuse basis unresolved.",
                nextAction="Review five private project dossiers inside Spending; obtain payment dates, confirmed recipients, amount definitions and reuse terms. Compare panchayat evidence before choosing the pilot.",
                followUpOn=None,
                supportingRecord=f"Balangir block: {ppms['billRecords']} bill records with project codes across {ppms['panchayats']} panchayats. 477 rows collected from the filtered geotag project report; 155 of 156 bill projects joined by exact code. Five different panchayats have reported photo locations and linked cheque records, pending review. Two cheque amounts differ from bill report totals and require allocation reconciliation. Cheque dates are not settlement dates. Two failed bills retained separately. Zero approved payments.",
            )
        )
    tasks.append(
        dict(
            id="ppms-export",
            lane="department",
            title="Odisha PPMS payment records sample",
            owner="PPMS / Hisaab",
            status="Sent · response pending",
            blocker="Payment date, recipient, amount definitions and reuse terms awaited.",
            nextAction="Assess the five-project sample response; request the correct custodian if support does not hold payment registers.",
            followUpOn="2026-10-16",
            supportingRecord="Explicitly authorized five-project request sent 7 October 2026",
        )
    )
    state_path = ROOT / "data/ppms-state-acquisition.json"
    if state_path.exists():
        statewide = json.loads(state_path.read_text())
        tasks.append(
            dict(
                id="ppms-state-public",
                lane="public",
                title="Expand Odisha treasury collection",
                owner="Hisaab",
                status=f"{statewide['billRecords']} bill records · {statewide['districts']} districts",
                blocker=f"{statewide['conflicts']} differing-edition comparisons retained and quarantined. Observed pagination collected; source editions are not a fixed-time census. Payment references, financial definitions, geography and reuse review pending.",
                nextAction=(
                    "Review supporting payment documents and obtain custodian definitions, allocated payment references and actual project geography."
                    if statewide.get("complete")
                    else "Resume observed pagination from saved checkpoints; deduplicate bills and quarantine differing editions before linking payment documents."
                ),
                followUpOn=None,
                supportingRecord=f"{statewide['collectedPages']} report pages; {statewide['projectCodes']} project codes; {statewide.get('failedPages', 0)} report pages awaiting retry. This overlaps the Balangir pilot; counts must not be added. Nationwide coverage remains unfinished.",
            )
        )
    observation_path = (
        ROOT
        / "data/acquisition/ppms/state-assessment/visible-pagination-observation-2026-10-08.json"
    )
    if state_path.exists() and observation_path.exists():
        observation = json.loads(observation_path.read_text())
        task = next(t for t in tasks if t["id"] == "ppms-state-public")
        task["supportingRecord"] += (
            " Later visible footer: "
            + observation["footer"]
            + ". Archived page positions have moved; this observation is not a refreshed collection or common reporting cutoff."
        )
    location_path = ROOT / "data/ppms-expanded-location-acquisition.json"
    if location_path.exists():
        ls = json.loads(location_path.read_text())
        tasks.append(
            dict(
                id="ppms-location-expansion",
                lane="public",
                title="Connect actual project photo-location evidence to bills",
                owner="Hisaab / owner geography review",
                status=f"{ls['assessedProjects']} project dossiers · {ls['photoLocationRecords']} photo coordinates",
                blocker="Source photo coordinates are not independently verified sites; contracts, allocation definitions and settlement remain pending.",
                nextAction="Inspect Road and panchayat locations in Spending with owner MFA; review source sites, stages and dates. Obtain the missing contract, amount definitions and final-recipient payment records.",
                followUpOn=None,
                supportingRecord=f"Exact project codes checked across project, bill and geotag pages. {ls['pendingObservedLinks']} observed links pending; {ls['failures']} failures. Zero verified map locations or payment approvals.",
            )
        )
    expanded_payment_path = (
        ROOT / "data/acquisition/ppms/projects/expanded-payment-integrity-review.json"
    )
    if expanded_payment_path.exists():
        ep = json.loads(expanded_payment_path.read_text())
        tasks.append(
            dict(
                id="ppms-expanded-bill-dossiers",
                lane="public",
                title="Review bill documents alongside project photo locations",
                owner="Hisaab / owner evidence review",
                status=f"{ep['scopeDocuments']} documents · {ep['scopeProjectsWithDocuments']} projects",
                blocker=f"{ep['scopeMissingChequeDates']} documents lack cheque dates; {ep['scopeClippedDocuments']} original PDF layouts are clipped (see separate dialog-recovery progress); {ep['scopeReadableBeneficiaryConflicts']} readable beneficiary discrepancies remain. Units, recipient roles, settlement and publication basis unresolved.",
                nextAction="Inspect the linked bill/cheque and source recipient evidence in the owner location review. Resolve component allocations and missing transaction records through the prepared custodian requests.",
                followUpOn=None,
                supportingRecord=f"{ep['scopeArithmeticMatches']} documents match report, cheque and beneficiary arithmetic; this is not verified settlement. {ep['scopeFailedBillRows']} failed bill rows retained separately. No permitted observed document downloads pending in this pilot scope; no payments approved.",
            )
        )
    gap_path = ROOT / "data/acquisition/ppms/projects/pilot-gap-register.json"
    if gap_path.exists():
        gaps = json.loads(gap_path.read_text())
        remaining_clipped = gaps["specificGapCounts"].get(
            "PDF component amounts clipped; visible bill dialog needed", 0
        )
        tasks.append(
            dict(
                id="ppms-pilot-gap-register",
                lane="public",
                title="Resolve named pilot evidence gaps",
                owner="Hisaab / source custodians",
                status=f"{gaps['projects']} project checklists · {remaining_clipped} clipped recoveries pending",
                blocker="Missing original cheque fields, unexposed bill documents, recipient-sum discrepancies and Failed bills remain separate categories.",
                nextAction="Use the owner expanded evidence dossier for named bill references; obtain existing transaction, allocation, agreement and site records without substituting other dates.",
                followUpOn=None,
                supportingRecord="Per-project private gap register prepared. Categories overlap; counts are not added as independent projects. Actual sites, contracts, amount definitions, final-recipient roles and reuse review remain common gaps.",
            )
        )
    pilot_path = ROOT / "data/panchayat-pilot-review.json"
    if pilot_path.exists():
        pilot = json.loads(pilot_path.read_text())
        task = next(t for t in tasks if t["id"] == "panchayat-public")
        task.update(
            status="Five candidates assessed · Chandanbhati working pilot",
            nextAction="Obtain contractor/settlement evidence and verify the named site/route; keep PPMS road and eGramSwaraj drain/office projects separate.",
            supportingRecord=f"{pilot['candidatesAssessed']} panchayats assessed; {pilot['arithmeticReconciles']} project has matching bill, cheque and beneficiary totals. {pilot['clippedDocuments']} clipped beneficiary documents; {pilot['beneficiarySumConflicts']} recipient-sum discrepancies. Zero approved payments.",
        )
    payment_path = ROOT / "data/ppms-state-payment-acquisition.json"
    flow_path = ROOT / "data/acquisition/ppms/payment-details/pilot-visible-treasury-flow.json"
    if flow_path.exists():
        tasks.append(
            dict(
                id="pilot-treasury-history",
                lane="public",
                title="Trace pilot bill processing dates",
                owner="Hisaab",
                status="Four official workflow events collected",
                blocker="Treasury processing is not independent recipient settlement; amount definitions, recipient roles, site accuracy and reuse review remain pending.",
                nextAction="Compare the 24 February cheque/initiation and 26 February treasury processing events with dated component-level settlement records from the custodian.",
                followUpOn=None,
                supportingRecord="Exact PPMS project and bill history preserved privately and displayed inside owner review cards; no payment approval inferred.",
            )
        )
    visible_path = (
        ROOT / "data/acquisition/ppms/payment-details/additional-visible-bill-details.json"
    )
    if (ROOT / "workers/department_payment_import.py").exists():
        tasks.append(
            dict(
                id="delhi-pilot-feasibility",
                lane="public",
                title="Whole Delhi authority and division coverage",
                owner="Hisaab / engineering and accounts custodians",
                status="Exact SER-2 tender found · records unresolved",
                blocker="Procurement reports Financial Evaluation while eMonitoring reports an award. Original tender-detail access was denied; authority/unit census, complete registers, allocations, locations and reuse review remain missing.",
                nextAction="Reconcile the two portals using the requested original award/agreement and allocated bills/payments; obtain the exact bridge site and complete SER-2 registers for the fixed periods. Review the separate NCRTC payment-report candidate without assuming its agreement allocation.",
                followUpOn=None,
                supportingRecord="Owner-approved CAPTCHA searches submitted 9 October: award results returned no matching rows; Tender Status found exact ID 2026_PWD_296167_1 at Financial Evaluation. AOC was not displayed. Private observations and screenshot hashes retained; no payments or locations approved.",
            )
        )
        tasks.append(
            dict(
                id="delhi-ser2-register-request",
                lane="department",
                title="SER-2 complete work and payment registers",
                owner="Delhi PWD SER-2 / Hisaab",
                status="Authorized and sent · response pending",
                blocker="No records, register control totals, bill allocations or reuse terms supplied yet.",
                nextAction="Assess the diagnostic and register response; confirm PAO-XVI transition, predecessor custody and current DDO identifiers. A reply alone does not establish complete division coverage.",
                followUpOn="2026-10-20",
                supportingRecord="Owner specifically authorized the ordinary SER-2 enquiry on 9 October. PAO and RTI drafts remain unsent/unfiled. Follow-up date counts weekdays; verify office holidays before use.",
            )
        )
        tasks.append(
            dict(
                id="delhi-rti-records",
                lane="rti",
                title="Delhi precise engineering and accounts records",
                owner="Hisaab drafts · owner submits",
                status="Record lists drafted · PIO verification pending",
                blocker="Current designated SER-2/PAO PIO, applicant information and filing route remain unverified.",
                nextAction="Verify current jurisdiction before adapting the prepared division and PAO-XVI record requests into formal applications. Owner supplies applicant information and handles fees/submission.",
                followUpOn=None,
                supportingRecord="Named project and two-year register scopes, opening liabilities, payment/return records, locations and custody-transition records specified. No filing or fee paid.",
            )
        )
        tasks.append(
            dict(
                id="delhi-agency-pilot",
                lane="partnership",
                title="Delhi division and accounting sample pilot",
                owner="SER-2 / PAO-XVI / Hisaab",
                status="Engineering enquiry sent · accounts route identified",
                blocker="A named accounts/export custodian, authorized sample, definitions, refresh and publication terms remain pending.",
                nextAction="Seek the existing engineering/accounting crosswalk and a minimized diagnostic bill/payment sample, then reconcile before expanding divisions. Keep bank-credit evidence separate from payment instructions.",
                followUpOn=None,
                supportingRecord="Current SER-2 institutional directory contact verified. The March 2026 PrAO circular places PWD under PAO-XVI since November 2025; earlier custody is still unknown.",
            )
        )
        if (ROOT / "data/acquisition/delhi-ncrtc-research/README.md").exists():
            tasks.append(
                dict(
                    id="delhi-ncrtc-register-request",
                    lane="department",
                    title="NCRTC exact bill links and complete Delhi registers",
                    owner="NCRTC Finance/Accounts / Hisaab",
                    status="Authorized and sent · response pending",
                    blocker="General institutional inbox is verified, but the specific Finance bill custodian, actual record crosswalk, definitions and full register scope remain unresolved.",
                    nextAction="Assess the two separate diagnostic bill chains and requested full-period registers, control totals, Delhi allocations, completion and reuse terms. Routing or acknowledgement alone does not establish payment coverage.",
                    followUpOn="2026-10-20",
                    supportingRecord="Owner specifically authorized the ordinary institutional request on 9 October; confirmed sent. Historical May 2024 ring-road bill and January 2026 complex bill are not merged. No formal RTI filing or automatic follow-up.",
                )
            )
            tasks.append(
                dict(
                    id="delhi-ncrtc-public-payments",
                    lane="public",
                    title="NCRTC Delhi vendor-payment evidence",
                    owner="Hisaab / NCRTC finance custodian",
                    status="Three official originals preserved · contract join candidate",
                    blocker="No identifier-proven invoice-to-agreement allocation, transmitted-amount definition, deductions/returns, sanction or exact site geometry. Reported paid date is not independently verified recipient credit.",
                    nextAction="Review the private source fields and award candidate in the owner dossier. Reconstruct the January–April 2026 report only after proving page/row alignment; obtain the exact contract/payment crosswalk and Delhi component allocation.",
                    followUpOn=None,
                    supportingRecord="Two official vendor MIS reports and one award original, all checksum verified. The exact inspected 2024 invoice is historical and outside the initial two-year register scope; a January 2026 complex-work lead is distinct. Mixed-region and inter-agency flows remain separate. Zero approvals or public payment totals.",
                )
            )
        tasks.append(
            dict(
                id="department-export-reconciliation",
                lane="department",
                title="Reconcile export editions before payment review",
                owner="Hisaab / owner reviewer",
                status="Implemented · official exports pending",
                blocker="No official allocated-payment export received; cross-export reconciliation does not establish settlement, recipient roles, geography or reuse.",
                nextAction="Stage a documented custodian sample, rebuild the private catalogue, and load Spending owner export review through MFA. Resolve conflicting editions and overlapping shares with documentary evidence.",
                followUpOn=None,
                supportingRecord="Checksummed originals, exact identities, duplicate exclusion, edition conflicts, split limits and owner-only projection. No automatic approval or payment total.",
            )
        )
        tasks.append(
            dict(
                id="department-export-staging",
                lane="department",
                title="Validate the first official project-payment export sample",
                owner="Hisaab / source custodian",
                status="Private staging validator implemented · official sample pending",
                blocker="No official project-allocation sample imported yet. Source authenticity, field meanings, recipient capacity, settlement, location and reuse still need reviewed evidence.",
                nextAction="Map an authorized small export to the prepared tables using documented field meanings. Preserve original hashes, validate exact project/payment/component IDs and splits, and retain conflicts before owner review.",
                followUpOn=None,
                supportingRecord="Repeat import, exact units, split limits, conflicting identities and source-date roles tested in isolated fixtures. Fixtures do not count as acquired data. No automatic approval, bank fields, public totals or guessed settlement.",
            )
        )
    guide_path = ROOT / "data/acquisition/ppms/source-guides/interpretation.json"
    if guide_path.exists():
        guide = json.loads(guide_path.read_text())
        tasks.append(
            dict(
                id="ppms-source-guidance",
                lane="department",
                title="Obtain existing PPMS case-record bundles from the custodian",
                owner="Hisaab / authorized source custodian",
                status=f"{guide['guides']} official guides assessed · document route identified",
                blocker="The documented Project All Document workflow requires an authorized departmental user. Public expenditure definitions, rounding, actual recipient capacity and settlement remain unresolved.",
                nextAction="Use the prepared named-project request annex and RTI draft to obtain sanction, work-order, measurement, component bill and payment/return records from their custodian. Confirm current guidance and reuse terms.",
                followUpOn=None,
                supportingRecord="Guide originals and hashes preserved privately. Departmental executants may be staff; individual project roles still need evidence. The illustrative bill is not a payment record. No login access, export permission or publication approval inferred.",
            )
        )
    if visible_path.exists():
        visible = json.loads(visible_path.read_text())
        visible_differences = sum(not r["matchesReportAmount"] for r in visible["records"])
        recovery_status = (
            " · pilot component recovery complete"
            if gap_path.exists() and remaining_clipped == 0
            else ""
        )
        tasks.append(
            dict(
                id="ppms-visible-breakdowns",
                lane="public",
                title="Recover clipped pilot bill breakdowns",
                owner="Hisaab",
                status=f"{len(visible['records'])} official dialogs preserved{recovery_status}",
                blocker=f"{visible_differences} visible component totals differ from reported bill amounts; source precision and cheque/component scope need custodian clarification. Recipient roles, settlement and reuse remain unverified.",
                nextAction="Review the distinct bill and cheque records inside the owner project cards; obtain component-level dates and official cheque scope before publication.",
                followUpOn=None,
                supportingRecord="Safe visible recipient/component/amount/status fields preserved separately from original PDFs. Recovery completes component reading only; it does not resolve missing transaction dates, recipient capacity or settlement. No bank or IFSC fields exposed; zero payment approvals.",
            )
        )
    if payment_path.exists():
        batch = json.loads(payment_path.read_text())
        tasks.append(
            dict(
                id="ppms-state-payments",
                lane="public",
                title="Inspect bill-linked cheque documents",
                owner="Hisaab",
                status=f"{batch['documents']} documents assessed",
                blocker=f"{batch['clippedDocuments']} clipped amount columns; {batch['chequeReportConflicts']} cheque/report differences; {batch['beneficiarySumConflicts']} beneficiary-sum discrepancies. Settlement/role/unit and reuse review pending.",
                nextAction="Continue bounded downloads from observed links. Preserve source payment identities, check shared allocations and retain originals when parsing fails.",
                followUpOn=None,
                supportingRecord=f"{batch['documentsPreserved']} originals preserved; {batch['failures']} parsing failures; {batch['sharedPaymentIdentities']} shared identities detected in this subset. Not verified nationwide payments; do not add totals from overlapping collections.",
            )
        )
    projects = [
        dict(
            id=c["officialRoadId"],
            title=c["title"],
            packageId=c["packageId"],
            district=c["districtLabel"],
            checks={
                "location": "Proposed · review pending",
                "sanction": "Conflicting editions"
                if c["sanctionComparison"] != "exact_numeric_match"
                else "Collected · review pending",
                "contract": "Identifier collected · unit unverified",
                "payments": "Project allocation missing",
                "recipient": "Missing",
                "completion": "Reported date · certificate missing",
            },
            nextAction="Resolve source conflicts and obtain bill-to-road allocations.",
        )
        for c in cases
    ]
    wb_path = ROOT / "data/wb-jjm-acquisition.json"
    if wb_path.exists():
        wb = json.loads(wb_path.read_text())
        tasks.append(
            dict(
                id="wb-water-financial",
                lane="public",
                title="West Bengal water scheme financial records",
                owner="Hisaab",
                status=f"{wb['schemeRows']} scheme rows · {wb['districtPartitions']} district reports",
                blocker="Cumulative expenditure only; dated transactions, payees, bill allocations, exact geography and reuse unresolved.",
                nextAction="Follow observed district reports; obtain scheme/work-order-to-bill exports. Financial PFMS page failed and agency bill page timed out during research.",
                followUpOn=None,
                supportingRecord=f"{wb['observedPartitions']} district links observed. Explicit lakh units and TSM/SM identifiers preserved privately; zero individual payments approved.",
            )
        )
    tasks.append(
        dict(
            id="nationwide-payment-research",
            lane="department",
            title="Find nationwide project-to-payment export routes",
            owner="Hisaab / source research",
            status="Seven blocker solution routes documented · 9 October research",
            blocker="No verified universal public payment feed. Custodian samples, actual work crosswalks, financial definitions, site review and publication terms remain required; documentation is not data access.",
            nextAction="Obtain a named-project sample: eGramSwaraj activity/voucher/geotag mapping; Odisha claim deconsolidation and IFMIS deduction/response records; applicable TSA/Hybrid claim reports. Validate one exact physical-work/payment allocation before wider state partitions.",
            followUpOn=None,
            supportingRecord="Detailed solutions and primary sources added to Nationwide payment source research inside Owner request dossier. Ten checksummed official manuals/notices preserved privately. September 2026 agency-project identifiers are optional; JJM 2.0 provides a scheme/asset/claim export target, not an open API. Rajasthan WAM, Chhattisgarh e-Kosh and Kerala bill-system leads require authorized samples. Zero new payment approvals, messages or published projects.",
        )
    )
    bbmp_path = ROOT / "data/bbmp-payment-source-assessment.json"
    if bbmp_path.exists():
        bbmp = json.loads(bbmp_path.read_text())
        tasks.append(
            dict(
                id="bbmp-payment-validation",
                lane="public",
                title="Validate Bengaluru work-bill payments",
                owner="Hisaab",
                status=f"{bbmp['rows']} source rows · two historical bills compared",
                blocker="Official displayed Paid differs from full net bill value in both samples; repeated RTGS event amounts, units, geography and publication remain unresolved.",
                nextAction="Obtain event-level paid amounts, reissue/instalment history and actual works locations; do not sum mirror nett values.",
                followUpOn=None,
                supportingRecord=f"{bbmp['recognizedJobCodes']} recognizable job codes; {bbmp['amountArithmeticMatches']} arithmetic matches; {bbmp['repeatedBillIds']} repeated bill IDs. Private normalization separates bills from RTGS events; zero payment approvals.",
            )
        )
        tasks.append(
            dict(
                id="mgnrega-chain-validation",
                lane="public",
                title="Reproduce a work-linked wage-payment chain",
                owner="Hisaab",
                status="Amarpur pilot work → three musters → wage list observed",
                blocker="Register reports 30,618 rupees paid, but consolidated date is Data Entry Date. Bank-response/FTO, actual geography and full source-original reproduction pending.",
                nextAction="Trace wage list 1728001019WL007148 through official FTO reports; preserve report scope and bank response without worker identifiers in public views.",
                followUpOn=None,
                supportingRecord="MP / Bhopal / Berasia / Amarpur plantation work; 126 person-days. Minimized UI observation retained; direct register fetch did not reproduce the displayed work. No settlement approval.",
            )
        )
        mplads_path = ROOT / "data/mplads-payment-source-assessment.json"
        if mplads_path.exists():
            mplads = json.loads(mplads_path.read_text())
            tasks.append(
                dict(
                    id="mplads-payment-validation",
                    lane="public",
                    title="Validate MPLADS work-to-vendor payments",
                    owner="Hisaab",
                    status=f"{mplads['rows']} Odisha expenditure rows · {mplads['distinctWorkIds']} work IDs",
                    blocker="Source transaction IDs, reversals, exact locations and publication review missing; seven rows have encoding faults. Source Payment Success is not independent settlement.",
                    nextAction="Inspect work documents using full WORK_ID; obtain payment references and geometry, then collect bounded official state/tenure partitions.",
                    followUpOn=None,
                    supportingRecord="Official public dashboard script report request reproduced. 3,719 source Payment Success rows and 107 In-Progress rows; no totals summed or payments approved. Country-wide response exceeded size bound.",
                )
            )
        else:
            tasks.append(
                dict(
                    id="mplads-payment-validation",
                    lane="public",
                    title="Validate MPLADS work-to-vendor payments",
                    owner="Hisaab",
                    status="Official public dashboard inspected",
                    blocker="Work/payment identities, exact locations and documents remain unverified.",
                    nextAction="Validate one official expenditure export before wider collection.",
                    followUpOn=None,
                    supportingRecord="Online source scope starts 1 April 2023; zero payments approved.",
                )
            )
    tasks.append(
        dict(
            id="mplads-records-request",
            lane="department",
            title="MPLADS payment definitions and five-project records",
            owner="MPLADS support / Hisaab",
            status="Sent · response pending",
            blocker="Payment references, recipient roles, deductions allocations, actual project locations and reuse conditions awaited.",
            nextAction="Assess the support response or routing to district/implementing-agency custodians; seek a supported sample export before wider ingestion.",
            followUpOn="2026-10-16",
            supportingRecord="Explicitly authorized five-project request sent 7 October 2026 to the verified eSAKSHI support contact. Sent-message reference retained privately; delivery and data completeness not yet confirmed.",
        )
    )
    mplads_states_path = ROOT / "data/mplads-state-collection-assessment.json"
    if mplads_states_path.exists():
        ms = json.loads(mplads_states_path.read_text())
        tasks.append(
            dict(
                id="mplads-state-collection",
                lane="public",
                title="MPLADS expenditure across states and union territories",
                owner="Hisaab",
                status=f"{ms['assessedStatePartitions']} of {ms['observedStatePartitions']} state reports · {ms['expenditureRows']} source expenditure rows",
                blocker=f"{ms['failedPartitions']} failed partitions. This covers one scheme and default Lok Sabha filters; transaction identities, settlement, geography and publication review remain pending.",
                nextAction="Both default house state scopes are collected. Review sample work documents, payment references, reversals and actual locations; assess additional tenure filters only after pilot validation.",
                followUpOn=None,
                supportingRecord=f"Checkpointed, size-bounded official state report requests; {ms['encodingIssueRows']} rows with encoding faults retained for review. Zero approved payments; no source row count is a count of independently verified transactions.",
            )
        )
    rajya_path = ROOT / "data/mplads-rajya-state-collection-assessment.json"
    if rajya_path.exists():
        rs = json.loads(rajya_path.read_text())
        tasks.append(
            dict(
                id="mplads-rajya-state-collection",
                lane="public",
                title="Extend MPLADS to Rajya Sabha reports",
                owner="Hisaab",
                status=f"{rs['assessedStatePartitions']} of {rs['observedStatePartitions']} state reports · {rs['expenditureRows']} source expenditure rows",
                blocker=f"{rs['failedPartitions']} failed partitions. Default Rajya Sabha filter only; payment references, reversals, geography, document review and reuse remain pending.",
                nextAction=(
                    "All default house state partitions collected. Browse source rows in the owner catalogue; obtain payment references, reversals, documents and actual geography."
                    if rs["assessedStatePartitions"] == rs["observedStatePartitions"]
                    and not rs["failedPartitions"]
                    else "Continue at most six official state partitions per batch with separate house checkpoints. Obtain sample payment references and locations; retain status and tenure scope."
                ),
                followUpOn=None,
                supportingRecord=f"{rs['distinctWorkIds']} distinct full work IDs in this subset. Official house-switch script identifies house 1; every returned row checked for state and house. Separate from the Lok Sabha inventory; no combined payment totals or approvals.",
            )
        )
    nhidcl_review_path = (
        ROOT / "data/acquisition/state-development/nhidcl-review/card-review-packets.json"
    )
    if nhidcl_review_path.exists():
        nr = json.loads(nhidcl_review_path.read_text())
        tasks.append(
            dict(
                id="nhidcl-project-fact-review",
                lane="public",
                title="Review source-backed road contract cards",
                owner="Hisaab · owner evidence review",
                status=f"{nr['candidatesChecked']} project candidates compared to the original · {nr['statesChecked']} states and {nr.get('territoriesChecked', 0)} UTs · {nr['reviewPriorities'].get('contract_facts_first', 0)} prioritised for contract-fact review",
                blocker="These are contract and project-status facts, not payment or location verification. The source reproduction policy is documented; document-level rights and explicit owner publication decisions remain required.",
                nextAction="In State-by-state development collection, choose Project card drafts. The stronger source-matched contract records appear first. Review the official source row, contract facts, attribution, exact geography and available bill allocations; preserve missing payments and completion certificates.",
                followUpOn=None,
                supportingRecord="docs/nhidcl-project-facts-review.md. The original PDF checksum and freshly extracted table match. Cost units, UPN identities and dates were compared exactly. A comparison notice is attached only while the card facts and original edition match; all publication approvals remain false.",
            )
        )
    ut_path = ROOT / "data/union-territory-development-acquisition.json"
    if ut_path.exists():
        ur = json.loads(ut_path.read_text())
        tasks.append(
            dict(
                id="eight-ut-project-card-review",
                lane="public",
                title="Eight union territories: project cards and evidence gaps",
                owner="Hisaab · owner evidence review",
                status=f"8 UTs separately indexed · {ur['projectCandidates']} project/tender records · {ur['budgetCandidates']} mixed Union-demand context entries · zero complete territories",
                blocker="Procurement samples and mixed Union transfer/territory demands are not a complete local development ledger. Actual payment recipients, allocations, dates, exact project geography and public source-rights review remain incomplete.",
                nextAction="Use Union-territory development collection inside Evidence progress; select each UT and inspect Project card drafts, Original sources or Union budget context. Preserve existing Delhi and Puducherry work; follow the specific source gaps in docs/union-territory-development-status.md.",
                followUpOn=None,
                supportingRecord="Recovered 21 in-scope NHIDCL rows for Andaman and Nicobar, Jammu and Kashmir and Ladakh that the old 28-state adapter excluded. All eight official procurement routes checked. No payment, geographic match or publication approval inferred.",
            )
        )
    review_catalogue = ROOT / "data/mplads-review-catalogue-assessment.json"
    if review_catalogue.exists():
        rc = json.loads(review_catalogue.read_text())
        tasks.append(
            dict(
                id="mplads-owner-catalogue",
                lane="public",
                title="Inspect nationwide MPLADS source records inside the app",
                owner="Hisaab · owner evidence review",
                status=f"{rc['projects']} project identities · {rc['sourceRows']} source rows",
                blocker="Unpublished source catalogue. Transaction references, exact location, gross/net allocation and review remain missing; catalogue size is not verified payment coverage.",
                nextAction="Open Nationwide MPLADS records inside Spending with owner MFA; search by project, state or house and inspect source rows. Use the five pilot receipts for supporting-document review.",
                followUpOn=None,
                supportingRecord=f"{rc['verifiedOriginals']} original house/state report checksums verified. Scoped project identities are indexed separately by house. Repeated source rows retained; no financial totals, invented transaction IDs or approvals.",
            )
        )
    supporting_path = ROOT / "data/mplads-supporting-review-assessment.json"
    if supporting_path.exists():
        sp = json.loads(supporting_path.read_text())
        tasks.append(
            dict(
                id="mplads-supporting-review",
                lane="public",
                title="Check bills and completion documents against MPLADS payments",
                owner="Hisaab · owner publication review",
                status=f"{sp['sampleProjects']} projects · {sp['sourceExpenditureRows']} expenditure rows · {sp['downloadedAttachments']} official attachments",
                blocker="Two bills show gross amounts matching portal disbursement but smaller net payable amounts; three certificate dates differ from portal dates. Bank settlement, final-recipient roles, contracts and geography remain unverified.",
                nextAction="Obtain payment/voucher references, deductions allocation and recipient-role definitions for the five named projects; retain certificate completion and portal dates separately.",
                followUpOn=None,
                supportingRecord=f"{sp['visuallyReviewedBills']} bills and {sp['visuallyReviewedCompletionCertificates']} certificates visually inspected. Scoped recommendation/MP/state/constituency joins checked; full payment work IDs differ from internal attachment work IDs. Five draft receipts and checksum-checked documents are available in Spending → MPLADS pilot receipts (owner MFA). Request and findings are in the owner dossier; zero approvals.",
            )
        )
    jurisdiction_path = ROOT / "data/acquisition/national-coverage/jurisdiction-matrix.json"
    jurisdiction_coverage = (
        json.loads(jurisdiction_path.read_text()) if jurisdiction_path.exists() else None
    )
    if jurisdiction_coverage:
        pmgsy_missing = [
            x["jurisdiction"]
            for x in jurisdiction_coverage["matrix"]
            if x["pmgsy"]["status"] == "not_in_source_partition"
        ]
        delhi = next(
            (x for x in jurisdiction_coverage["matrix"] if x["jurisdiction"] == "Delhi"), None
        )
        ut_totals_path = ROOT / "data/acquisition/national-coverage/union-ut-budget-context.json"
        ut_total_count = (
            len(json.loads(ut_totals_path.read_text()).get("records", []))
            if ut_totals_path.exists()
            else 0
        )
        ut_lines_path = ROOT / "data/acquisition/national-coverage/union-ut-demand-lines.json"
        ut_line_count = (
            len(json.loads(ut_lines_path.read_text()).get("records", []))
            if ut_lines_path.exists()
            else 0
        )
        ut_accounts_path = (
            ROOT / "data/acquisition/national-coverage/puducherry-accounts-2026-27-index.json"
        )
        ut_accounts = json.loads(ut_accounts_path.read_text()) if ut_accounts_path.exists() else {}
        cag_index_path = (
            ROOT / "data/acquisition/national-coverage/cag-state-accounts-manifest.json"
        )
        cag_index = json.loads(cag_index_path.read_text()) if cag_index_path.exists() else {}
    cag_indicators_path = (
        ROOT / "data/acquisition/national-coverage/cag-state-accounts-indicators.json"
    )
    cag_indicators = (
        json.loads(cag_indicators_path.read_text())
        if cag_indicators_path.exists()
        else {"snapshots": []}
    )
    puducherry_accounts_summary = f"Puducherry FY2026–27 monthly accounts: {ut_accounts.get('collectedReports', 0)} PDFs, {ut_accounts.get('pageCount', 0):,} pages, {ut_accounts.get('voucherLineCount', 0):,} voucher candidates; not settlement proof or project links."
    cag_indexed_statuses = {
        "indexed_candidate_rows",
        "manually_transcribed_visual_review_candidate_rows",
    }
    cag_indexed = sum(
        1
        for r in cag_indicators.get("snapshots", [])
        if r.get("extractionStatus") in cag_indexed_statuses
    )
    cag_rows = sum(
        len(r.get("records", []))
        for r in cag_indicators.get("snapshots", [])
        if r.get("extractionStatus") in cag_indexed_statuses
    )
    cag_summary = f"CAG FY2026–27 state-account snapshots: {cag_index.get('downloadedCount', 0)} of {cag_index.get('stateCount', 28)} state PDFs preserved; {cag_rows:,} broad account row candidates indexed in {cag_indexed} reports, still private and unreviewed, not development-only or project payment data."
    tasks.append(
        dict(
            id="national-jurisdiction-coverage",
            lane="public",
            title="Coverage across 28 states and 8 union territories",
            owner="Hisaab",
            status=f"36-jurisdiction ledger built · official tender-discovery portal mapped for all 36 · {ut_total_count} UT budget-context rows and {ut_line_count} raw MHA/UT demand lines indexed privately · {ut_accounts.get('collectedReports', 0)} Puducherry monthly account PDFs · {cag_index.get('downloadedCount', 0)} CAG state account snapshots · {cag_rows:,} CAG account row candidates indexed in {cag_indexed} reports · evidence remains partial",
            blocker=f"No complete state/UT coverage or payment-backed card. PMGSY national response has no partition for {', '.join(pmgsy_missing)}. Tender portals establish procurement routes, not award completeness or paid transactions. UT budget rows, raw demand lines and voucher entries are unreviewed; they do not establish project settlements.",
            nextAction="Continue classifying state and UT budgets and collecting listed official account reports with source hashes. Match voucher/account records to named contracts and works only through official identifiers or allocation statements. Prioritize one reviewed tender→award→bill allocation→settlement chain per jurisdiction; leave missing records unknown and never publish aggregate account vouchers as asset payments.",
            followUpOn=None,
            supportingRecord="docs/national-jurisdiction-coverage.md and private data/acquisition/national-coverage/jurisdiction-matrix.json. MPLADS default reports: 36/36 jurisdictions; PMGSY: 32 partitions; official GePNIC/CPPP directory directly lists 35 mapped jurisdictions (including A&N ePublishing only); separately verified A&N eProcurement and Ladakh portals complete the discovery routes for all 36. MoRD rural-work aggregates: 28 states + 6 UTs. Sixteen Union Budget MHA/UT FY2025–26/2026–27 context totals and 877 raw lines across MHA/UT Demands 52–59 are indexed privately with locators, not classified or published. Delhi demand originals: 20 volumes, 547 pages preserved privately; 420 pages have embedded text, D-7 is scanned and English-OCR indexed. Puducherry BE/AFS and monthly expenditure sources, Ladakh LIFMS, J&K BEAMS, and Lakshadweep PAO are documented. "
            + puducherry_accounts_summary
            + " "
            + cag_summary
            + " No project/payment card is completed by these counts.",
        )
    )
    tasks.append(
        dict(
            id="goa-monthly-expenditure",
            lane="rti",
            title="Request Goa’s monthly scheme-wise expenditure returns",
            owner="Owner files · Hisaab prepared draft",
            status="Draft ready · not filed",
            blocker="The official order requires department returns to DPSE, but no current public monthly return was verified. Owner applicant details and filing step are required.",
            nextAction="Confirm the current DPSE PIO in the Goa RTI portal, then file the prepared records-only request for FY2025–26 and FY2026–27 through the latest completed month. Ask for existing compiled returns, definitions, submission log and source identifiers; do not pay or submit automatically.",
            followUpOn=None,
            supportingRecord="docs/goa-monthly-expenditure-rti-draft.md; official reporting order and DPSE PIO listing are linked in the draft.",
        )
    )
    milestones = [
        dict(id="M1", name="In-app evidence tracker", status="Implemented"),
        dict(
            id="M2",
            name="Pilot dossiers and requests",
            status="Ten road dossiers and five panchayat candidates assessed; missing payment and completion evidence requested",
        ),
        dict(
            id="M3",
            name="First verified payment-backed dot",
            status="Blocked · allocation evidence needed",
        ),
        dict(id="M4", name="Ten complete pilot cards", status="Pending"),
        dict(
            id="M5",
            name="Repeatable verified collection",
            status="Public parsers and private export staging repeatable; official allocated-payment sample pending",
        ),
        dict(id="M6", name="Wider roads and panchayat coverage", status="Pending"),
        dict(id="M7", name="Other sectors and public launch", status="Pending"),
    ]
    if sample:
        milestones[1]["status"] = (
            "Ten road dossiers, five panchayat candidates and exact requests prepared; source gaps remain"
        )
    write(
        ROOT / "data/evidence-progress.json",
        dict(
            delhiCoverage=delhi_coverage(),
            nationalCoverage=national_coverage(),
            jurisdictionCoverage=jurisdiction_coverage,
            updatedOn=datetime.now(timezone.utc)
            .astimezone(ZoneInfo("Asia/Kolkata"))
            .date()
            .isoformat(),
            lanes=[
                dict(id=i, title=t)
                for i, t in [
                    ("public", "Official public reports"),
                    ("department", "Department exports / APIs"),
                    ("rti", "Targeted RTI requests"),
                    ("partnership", "Local agency pilots"),
                ]
            ],
            tasks=tasks,
            projects=projects,
            milestones=milestones,
            notes=[
                "Tracker update date is not a common reporting cutoff for all source records.",
                "Follow-up dates count Monday–Friday only; check office holidays before sending.",
                "Public-source collection continues. Outbound requests and RTI filing remain subject to separate authorization and applicant steps.",
                (
                    "One panchayat sample assessed: Chandanbhati. Two local work references found; exact geography and official activity mapping remain unverified."
                    if sample
                    else "Panchayat candidates assessed: zero; access assistance and authorized samples are still required."
                ),
            ],
        ),
    )
    if "--progress-only" in sys.argv:
        return
    dossier = ROOT / "data/acquisition/pilot-dossiers"
    dossier.mkdir(parents=True, exist_ok=True)
    for c, p in zip(cases, projects):
        write(
            dossier / (c["officialRoadId"] + ".json"), dict(project=p, sourceCase=c, approved=False)
        )
    names = "\n".join(
        f"- Road {c['officialRoadId']} / package {c['packageId']}: {c['title']} ({c['districtLabel']})"
        for c in cases
    )
    draft_if_missing(
        ROOT / "docs/roads-rti-draft.md",
        "# RTI draft: existing records for ten Odisha PMGSY roads\n\nNot submitted. Applicant information and current responsible PIO must be verified. Scope: sanction year 2020–21 and related contracts/payments through 7 October 2026.\n\n"
        + names
        + "\n\nPlease provide electronic copies of existing sanction orders and amendments; agreements showing amount units; project/package-linked bill and payment-register entries (dates, gross amounts, deductions, net amounts, recipient business, status, reversals and split allocations); available completion certificates; recorded project geometry/location references; and existing field definitions. Please provide the existing allocation register linking bill references to these road/package identifiers, if held. Do not include bank accounts or unnecessary personal identifiers.\n\nPlease supply existing records rather than creating a new analysis. The public final-bill parent reports nine works but exports ten road rows; please supply existing records explaining the scope/count and differing sanction editions, if held.\n\nResponsible custodian: Odisha implementing units / State Rural Roads agency for their records; confirm current PIO from official directories. NRIDA may hold central OMMAS exports. Do not submit a state request through the central portal.\n",
    )
    draft_if_missing(
        ROOT / "docs/panchayat-rti-draft.md",
        "# Panchayat RTI preparation template\n\nNot ready for submission: pilot, LGD code, named activity IDs and current PIO remain unverified.\n\nAfter selection, request existing activity registers, sanctions/work orders, geotags, activity-linked voucher allocations and payment entries, amount definitions, revisions/reversals and available completion records for FY 2025–26 and FY 2026–27 through the cutoff. Fill named IDs before filing. Exclude private banking and beneficiary identifiers. Owner supplies applicant details and handles any fee.\n",
    )
    draft_if_missing(
        ROOT / "docs/agency-pilot-proposal.md",
        "# Agency pilot proposal\n\nPrepared; not sent. Target the implementing units in the named Odisha road dossier, and later the selected panchayat. Verify current official contacts before requesting authorization to send.\n\nHisaab seeks a small source-attributed pilot linking named projects to official locations, contracts, bill allocations and payment records. Please provide a sample register/export with stable identifiers, payment dates, gross/deduction/net definitions, business recipients, reversals and package split allocations; available completion evidence; attribution/reuse terms; update frequency; and a named correction contact. Exclude bank accounts and unnecessary personal information. Source originals will be preserved privately; publication will follow evidence and permission review.\n\n"
        + names
        + "\n",
    )


if __name__ == "__main__":
    main()
