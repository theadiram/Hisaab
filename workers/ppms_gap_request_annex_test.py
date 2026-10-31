import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import ppms_gap_request_annex as annex


class AnnexTests(unittest.TestCase):
    def test_refreshes_counts_preserves_guidance_and_keeps_fractional_conflict(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / "data/acquisition/ppms"
            for folder in ("projects", "state-payment-details", "payment-details"):
                (base / folder).mkdir(parents=True)
            case = dict(
                projectCode="project",
                title="Named road",
                billReferences=["bill"],
                specificGaps=["Readable beneficiary totals differ from cheque"],
            )
            (base / "projects/pilot-gap-register.json").write_text(
                json.dumps(
                    dict(
                        cases=[case],
                        specificGapCounts={"Readable beneficiary totals differ from cheque": 1},
                    )
                )
            )
            payment = dict(
                projectCode="project",
                billSerial="bill",
                reportAmount="100.05",
                cheque={"chequeAmount": "100.05", "chequeDate": "01-01-2026"},
                beneficiarySum="100.00",
                beneficiariesMatchCheque=False,
                beneficiaryBreakdown={"layoutClipped": False},
            )
            (base / "state-payment-details/assessment.json").write_text(
                json.dumps({"records": [payment]})
            )
            visible = dict(
                projectCode="project",
                billSerial="bill",
                beneficiarySum="100.00",
                matchesReportAmount=False,
            )
            (base / "payment-details/additional-visible-bill-details.json").write_text(
                json.dumps({"records": [visible]})
            )
            (root / "docs").mkdir()
            doc = root / "docs/ppms-expanded-evidence-review.md"
            doc.write_text(
                "# Dossier\n\n- PDF component amounts clipped; visible bill dialog needed: 19 projects\n\n## Pilot component recovery\n\nStale count.\n\n## Official guidance\n\nPreserve this guidance.\n\n## Named bill-record request annex\n\nOld rows.\n"
            )
            with patch.object(annex, "ROOT", root), contextlib.redirect_stdout(io.StringIO()):
                annex.main()
                first = doc.read_text()
                annex.main()
            self.assertEqual(first, doc.read_text())
            self.assertIn("visible bill dialog needed: 0 projects", first)
            self.assertIn("Preserve this guidance.", first)
            self.assertIn("0 visible totals match", first)
            self.assertIn("100.05 | 100.05 | 100.00 | 100.00 | 0.05", first)
            self.assertIn("1 differ and remain unresolved", first)


if __name__ == "__main__":
    unittest.main()
