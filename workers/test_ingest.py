import unittest
from ingest import money, source_record


class ExtractionTests(unittest.TestCase):
    def test_money(self):
        self.assertEqual(money("1,20,000"), "120000.00")
        self.assertEqual(money("1.25", "crore"), "12500000.00")
        self.assertIsNone(money(""))

    def test_invalid(self):
        for value in ["NaN", "Infinity", "unknown", "10.123"]:
            with self.assertRaises(ValueError):
                money(value)

    def test_permission_gate(self):
        self.assertEqual(source_record("egram")["status"], "permission_required")


class MultiRowSafetyTests(unittest.TestCase):
    def test_repeated_work_bills_cannot_overwrite_one_another(self):
        import csv, hashlib, json, tempfile, contextlib, io
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import patch
        import ingest

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            data = root / "data"
            acquisition = data / "acquisition"
            original = root / "bills.csv"
            fields = ["work", "title", "district", "state", "year", "bill", "paid", "date"]
            with original.open("w", newline="") as file:
                writer = csv.writer(file)
                writer.writerow(fields)
                writer.writerows(
                    [
                        [
                            "WORK-1",
                            "Test work",
                            "Test district",
                            "Test state",
                            "2025-26",
                            "BILL-A",
                            "100",
                            "2025-04-01",
                        ],
                        [
                            "WORK-1",
                            "Test work",
                            "Test district",
                            "Test state",
                            "2025-26",
                            "BILL-B",
                            "200",
                            "2025-04-02",
                        ],
                        [
                            "WORK-2",
                            "Separate test work",
                            "Test district",
                            "Test state",
                            "2025-26",
                            "BILL-C",
                            "50",
                            "2025-04-03",
                        ],
                    ]
                )
            digest = hashlib.sha256(original.read_bytes()).hexdigest()
            (acquisition / "documents").mkdir(parents=True)
            (acquisition / "documents" / f"{digest}.json").write_text(
                json.dumps(
                    {
                        "sourceId": "test",
                        "original": "bills.csv",
                        "url": "https://example.gov.in/bills.csv",
                        "permission": "Disposable test fixture",
                        "retrievedAt": "2026-10-06",
                    }
                )
            )
            mapping = root / "mapping.json"
            mapping.write_text(
                json.dumps(
                    {
                        "columns": dict(
                            zip(
                                [
                                    "work_id",
                                    "title",
                                    "district",
                                    "state",
                                    "financial_year",
                                    "payment_id",
                                    "payment",
                                    "payment_date",
                                ],
                                fields,
                            )
                        ),
                        "version": "test",
                        "document_title": "Disposable source fixture",
                    }
                )
            )
            with (
                patch.multiple(ingest, ROOT=root, DATA=data, ACQUISITION=acquisition),
                patch.object(ingest, "source_record", return_value={"id": "test"}),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                ingest.extract_csv(SimpleNamespace(mapping=mapping, hash=digest))
            result = json.loads((acquisition / "candidates" / f"{digest}.json").read_text())
            self.assertEqual([x["officialIds"] for x in result["candidates"]], [["WORK-2"]])
            self.assertEqual({x["row"] for x in result["quarantine"]}, {2, 3})
            self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), digest)


if __name__ == "__main__":
    unittest.main()
