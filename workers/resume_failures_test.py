import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import ppms_location_collection
import wb_jjm_schemes

PPMS_URL = "https://ppms.odisha.gov.in/report/geo-tagging-status-detail/1"
WB_URL = "https://maps.wbphed.gov.in/house_hold-2020/report/jjm-schemes-financial-status-distirct/1"


def run(module, argv):
    with patch.object(sys, "argv", ["worker", *argv]):
        module.main()


class PpmsLocationResumeTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.base = self.root / "data/acquisition/ppms/projects"
        self.base.mkdir(parents=True)
        dossier = {
            "projectCode": "P-1",
            "project": {"Project Code": "P-1", "sourceLinks": [PPMS_URL]},
            "bills": [{"Project Code": "P-1"}],
        }
        (self.base / "balangir-dossiers.json").write_text(json.dumps({"dossiers": [dossier]}))
        self.checkpoint = self.base / "expanded-location-assessment.json"
        self.checkpoint.write_text(
            json.dumps(
                {
                    "records": [],
                    "failures": [
                        {"projectCode": "P-1", "sourceUrl": PPMS_URL, "error": "timed out"}
                    ],
                }
            )
        )

    def tearDown(self):
        self.folder.cleanup()

    def collect(self, *argv):
        source = patch.object(ppms_location_collection, "source", return_value=("<html>", {}))
        with (
            patch.object(ppms_location_collection, "ROOT", self.root),
            source as fetched,
            patch.object(ppms_location_collection, "parse_geotags", return_value=[]),
            patch("builtins.print"),
        ):
            run(ppms_location_collection, argv)
        return fetched, json.loads(self.checkpoint.read_text())

    def test_failed_links_are_skipped_by_default(self):
        fetched, saved = self.collect()
        fetched.assert_not_called()
        self.assertEqual(len(saved["failures"]), 1)

    def test_retry_replaces_the_earlier_failure_and_keeps_the_old_checkpoint(self):
        original = self.checkpoint.read_bytes()
        fetched, saved = self.collect("--retry-failures")
        fetched.assert_called_once()
        self.assertEqual(saved["failures"], [])
        self.assertEqual([r["sourceUrl"] for r in saved["records"]], [PPMS_URL])
        backup = self.base / (hashlib.sha256(original).hexdigest() + ".checkpoint.json")
        self.assertEqual(backup.read_bytes(), original)


class WestBengalJjmResumeTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.base = self.root / "data/acquisition/wb-jjm"
        self.base.mkdir(parents=True)
        index = f'<a href="{WB_URL}">District</a>'.encode()
        digest = hashlib.sha256(index).hexdigest()
        (self.base / f"{digest}.html").write_bytes(index)
        (self.base / "index.source.json").write_text(json.dumps({"sha256": digest}))
        self.checkpoint = self.base / "assessment.json"
        self.checkpoint.write_text(
            json.dumps({"partitions": [], "failures": [{"url": WB_URL, "error": "timed out"}]})
        )

    def tearDown(self):
        self.folder.cleanup()

    def collect(self, *argv):
        source = patch.object(wb_jjm_schemes, "source", return_value=("<html>", {"url": WB_URL}))
        with (
            patch.object(wb_jjm_schemes, "ROOT", self.root),
            source as fetched,
            patch.object(wb_jjm_schemes, "normalize", return_value=[{"approved": False}]),
            patch("builtins.print"),
        ):
            run(wb_jjm_schemes, argv)
        return fetched, json.loads(self.checkpoint.read_text())

    def test_failed_districts_are_skipped_by_default(self):
        fetched, saved = self.collect()
        fetched.assert_not_called()
        self.assertEqual(len(saved["failures"]), 1)

    def test_retry_replaces_the_earlier_failure(self):
        fetched, saved = self.collect("--retry-failures")
        fetched.assert_called_once()
        self.assertEqual(saved["failures"], [])
        self.assertEqual(len(saved["partitions"]), 1)


if __name__ == "__main__":
    unittest.main()
