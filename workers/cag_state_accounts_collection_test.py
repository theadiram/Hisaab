import unittest

from cag_state_accounts_collection import alternate_state_page, latest_report, state_pages


class CAGStateAccountsCollectionTests(unittest.TestCase):
    def test_state_index_requires_all_28_and_maps_official_state_ids(self):
        links = "".join(
            f'<a href="/en/state-accounts-report?defuat_state_id={64 + i}">{name}</a>'
            for i, name in enumerate(sorted(__import__("cag_state_accounts_collection").STATES))
        )
        pages = state_pages(links)
        self.assertEqual(set(pages), __import__("cag_state_accounts_collection").STATES)
        self.assertTrue(pages["Assam"].startswith("https://cag.gov.in/"))

    def test_latest_report_selection_uses_latest_month_and_pdf_download_link(self):
        page = """<div class="accTrigger"> 2026 - 27</div><div class="accordDetail"><ul>
        <li><a href="https://files.example/apr.pdf"><h5>April, 2026</h5></a></li>
        <li><h5>August, 2026</h5><a href="https://sharepoint.example/indicator.xlsx">Click Here</a></li>
        <li><a href="https://files.example/sep.pdf"><h5>September, 2026</h5></a></li>
        </ul></div><div class="accTrigger">2025 - 26</div>"""
        report = latest_report("Assam", "https://cag.gov.in/assam", page)
        self.assertEqual((report["month"], report["year"]), ("September", 2026))
        self.assertEqual(report["sourceUrl"], "https://files.example/sep.pdf")
        self.assertEqual(report["fiscalMonthIndex"], 6)
        self.assertEqual(report["fallbackReports"][0]["month"], "April")

    def test_fallback_months_are_sorted_newest_first(self):
        page = """<div class="accTrigger">2026 - 27</div><ul>
        <li><h5>April, 2026</h5><a href="https://files.example/apr.pdf">PDF</a></li>
        <li><h5>June, 2026</h5><a href="https://files.example/jun.pdf">PDF</a></li>
        <li><h5>May, 2026</h5><a href="https://files.example/may.pdf">PDF</a></li>
        </ul><div class="accTrigger">2025 - 26</div>"""
        report = latest_report("Telangana", "https://cag.gov.in/ts", page)
        self.assertEqual(report["month"], "June")
        self.assertEqual([r["month"] for r in report["fallbackReports"]], ["May", "April"])

    def test_li_year_heading_limits_reports_to_selected_fiscal_year(self):
        page = """<li class="accTrigger">2026 - 27</li><ul>
        <li><h5>June, 2026</h5><a href="https://files.example/jun.pdf">PDF</a></li>
        <li><h5>March, 2026</h5><a href="https://files.example/wrong.pdf">PDF</a></li>
        </ul><li class="accTrigger">2025 - 26</li><ul>
        <li><h5>September, 2026</h5><a href="https://files.example/old.pdf">PDF</a></li></ul>"""
        report = latest_report("Jammu and Kashmir", "https://cag.gov.in/", page)
        self.assertEqual(report["month"], "June")
        self.assertEqual(report["fallbackReports"], [])

    def test_missing_month_pdf_returns_gap_not_zero(self):
        report = latest_report(
            "Goa",
            "https://cag.gov.in/goa",
            '<div class="accTrigger">2026 - 27</div><div class="accordDetail"><h5>April, 2026</h5></div><div class="accTrigger">2025 - 26</div>',
        )
        self.assertEqual(report["status"], "no_2026_27_pdf_listed")
        self.assertNotIn("amount", report)

    def test_alternate_official_state_site_is_used_for_known_reporting_routes(self):
        self.assertEqual(
            alternate_state_page("Andhra Pradesh"),
            "https://cag.gov.in/ae/andhra-pradesh/en/state-accounts-report?defuat_account_report_type=360",
        )
        self.assertIsNone(alternate_state_page("Goa"))


if __name__ == "__main__":
    unittest.main()
