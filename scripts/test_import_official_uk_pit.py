#!/usr/bin/env python3

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("import-official-uk-pit.py")
SPEC = importlib.util.spec_from_file_location("import_official_uk_pit", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class LsegParserTest(unittest.TestCase):
    def test_lseg_legacy_march_fiscal_calendar_uses_real_period_ends(self):
        cases = (
            (MODULE.Event("LSEG", 2011, "Q1", "2010-07-14", "Q1", "u", None, "trading_update"), "2010-06-30"),
            (MODULE.Event("LSEG", 2011, "Q2", "2010-11-18", "H1", "u", None, "half_year"), "2010-09-30"),
            (MODULE.Event("LSEG", 2011, "Q3", "2011-01-27", "Q3", "u", None, "trading_update"), "2010-12-31"),
            (MODULE.Event("LSEG", 2011, "Q4", "2011-05-13", "FY", "u", None, "full_year"), "2011-03-31"),
        )

        for event, expected in cases:
            with self.subTest(event=event):
                period_end, basis = MODULE.event_period_end(event)
                self.assertEqual(period_end, expected)
                self.assertEqual(basis, "LSEG 31 March fiscal calendar")

    def test_lseg_2014_transition_switches_to_calendar_year(self):
        legacy_q3 = MODULE.Event(
            "LSEG", 2014, "Q3", "2014-01-23", "Q3 2013", "u", None, "trading_update"
        )
        calendar_q1 = MODULE.Event(
            "LSEG", 2014, "Q1", "2014-07-16", "Q1 2014", "u", None, "trading_update"
        )
        calendar_fy = MODULE.Event(
            "LSEG", 2014, "Q4", "2015-03-05", "FY 2014", "u", None, "full_year"
        )

        self.assertEqual(MODULE.event_period_end(legacy_q3)[0], "2013-12-31")
        self.assertEqual(MODULE.event_period_end(calendar_q1)[0], "2014-03-31")
        self.assertEqual(MODULE.event_period_end(calendar_fy)[0], "2014-12-31")

    def test_pre_quarter_end_trading_update_uses_event_date(self):
        event = MODULE.Event(
            "BA.L", 2014, "Q3", "2014-09-29", "September update", "u", None, "trading_update"
        )

        period_end, basis = MODULE.event_period_end(event)

        self.assertEqual(period_end, "2014-09-29")
        self.assertIn("carried prior disclosed TTM", basis)

    def test_split_pdf_numbers_and_comparatives(self):
        text = """
Total income (excl. recoveries) 4,799 4,489
Adjusted operating profit 2,008 1,726
Equity free cash flow £1. 2 billion
Equity free cash flow3 1,205 935
Operating net debt of £9, 982 million
Operating net debt 9,982 8,175
Weighted average number of ordinary shares is 497 million (H1 2025: 529 million).
Adjusted basic earnings per share 244.9p 208.9p
"""
        result = MODULE.parse_lseg_actual(text)

        self.assertEqual(result["revenue_m"], 4_799)
        self.assertEqual(result["operating_income_m"], 2_008)
        self.assertAlmostEqual(result["net_income_m"], 244.9 / 100 * 497)
        self.assertEqual(result["cfo_m"], None)
        self.assertEqual(result["fcf_after_capex_m"], 1_205)
        self.assertEqual(result["debt_m"], 9_982)
        self.assertEqual(result["_debt_basis"], "operating net debt")
        self.assertEqual(result["shares_m"], 497)
        self.assertEqual(result["_prior_comparable"]["revenue_m"], 4_489)
        self.assertEqual(result["_prior_comparable"]["operating_income_m"], 1_726)
        self.assertEqual(result["_prior_comparable"]["fcf_after_capex_m"], 935)
        self.assertAlmostEqual(
            result["_prior_comparable"]["net_income_m"],
            208.9 / 100 * 529,
        )

    def test_wrapped_table_values_and_split_income_word(self):
        text = """
Total inco me 386.5 321.1 20% 18%
Adjusted operating profit 2

214.3 154.8 38% 35%
Adjusted net debt was £80 million.
Weighted average number of ordinary shares is 269.4 million (H1 2010: 268.3 million).
Adjusted basic earnings per share increased from 32.2 pence to 47.6 pence.
"""
        result = MODULE.parse_lseg_actual(text)

        self.assertEqual(result["revenue_m"], 386.5)
        self.assertEqual(result["operating_income_m"], 214.3)
        self.assertAlmostEqual(result["net_income_m"], 47.6 / 100 * 269.4)
        self.assertEqual(result["_prior_comparable"]["revenue_m"], 321.1)
        self.assertEqual(result["_prior_comparable"]["operating_income_m"], 154.8)

    def test_operating_net_debt_wins_over_accounting_total_net_debt(self):
        text = """
Total income 2,200 2,000
Adjusted operating profit 900 800
Total net debt 622 700
Operating net debt had decreased to £1,627 million at 30 June 2018.
Weighted average number of ordinary shares is 500 million (H1 2017: 505 million).
Adjusted basic earnings per share 120.0p 110.0p
"""
        result = MODULE.parse_lseg_actual(text)

        self.assertEqual(result["debt_m"], 1_627)
        self.assertEqual(result["_debt_basis"], "operating net debt")

    def test_statutory_summary_wins_over_refinitiv_pro_forma_table(self):
        text = """
Pro-forma results - Financial summary
Total Income (excl. recoveries) 6,811 6,767
Adjusted operating profit 2,509 2,329
Adjusted basic earnings per share (p) 286.7 260.1

Statutory results - Financial summary
Continuing operations
Total Income (excl. recoveries) 6,416 2,030
Adjusted operating profit 2,384 889
Adjusted basic earnings per share (p) 286.5 166.7
Weighted average number of shares used to calculate basic earnings per share from continuing
operations is 538 million (2020: 350 million).
Operating net debt 6,308 1,425
"""

        result = MODULE.parse_lseg_actual(text)

        self.assertEqual(result["revenue_m"], 6_416)
        self.assertEqual(result["operating_income_m"], 2_384)
        self.assertEqual(result["shares_m"], 538)
        self.assertAlmostEqual(result["net_income_m"], 286.5 / 100 * 538)
        self.assertEqual(
            result["_financial_basis"],
            "statutory continuing operations with issuer-adjusted profit and EPS",
        )

    def test_ttm_uses_comparator_restatement_visible_in_current_release(self):
        current = {
            "revenue_m": 4_489,
            "fcf_after_capex_m": 935,
            "_prior_comparable": {
                "revenue_m": 4_204,
                "fcf_after_capex_m": 651,
            },
        }
        prior_full = {"revenue_m": 8_494, "fcf_after_capex_m": 2_184}
        prior_half = {"revenue_m": 4_204, "fcf_after_capex_m": 761}

        result, method = MODULE.ttm_from_half(current, prior_full, prior_half)

        self.assertEqual(result["revenue_m"], 8_779)
        self.assertEqual(result["fcf_after_capex_m"], 2_468)
        self.assertIn("comparator disclosed in current H1 release", method)

    def test_lseg_compact_guidance_bullets_are_model_ready(self):
        event = MODULE.Event(
            "LSEG",
            2026,
            "Q2",
            "2026-07-30",
            "H1 2026",
            "https://example.test/h1-2026",
            "https://example.test/h1-2026.pdf",
            "half_year",
        )
        text = """
2026 guidance - EBITDA margin guidance raised
Organic constant currency growth in total income (excl. recoveries) raised to 7.0-7.5%.
Constant currency EBITDA margin guidance raised to around 100 bps.
Capex intensity c. 9.5%.
Equity free cash flow at least £2.7 billion.
"""

        rows = MODULE.guidance_events(MODULE.guidance_module(), event, text)
        metrics = {row["metric_name"]: row for row in rows}

        self.assertEqual(metrics["revenue_guidance"]["growth_yoy"], 7.25)
        self.assertEqual(metrics["free_cash_flow_guidance"]["amount"], 2_700)
        self.assertEqual(metrics["free_cash_flow_guidance"]["currency"], "GBP")
        self.assertEqual(metrics["free_cash_flow_guidance"]["guidance_scope"], "full_year")
        self.assertEqual(metrics["free_cash_flow_guidance"]["guidance_year"], 2026)
        self.assertIn("Full-year 2026 guidance", metrics["free_cash_flow_guidance"]["value_text"])
        self.assertEqual(metrics["capex_guidance"]["margin_pct"], 9.5)

    def test_lseg_full_year_results_keep_reported_period_and_forward_guidance_year_separate(self):
        event = MODULE.Event(
            "LSEG",
            2025,
            "Q4",
            "2026-02-26",
            "FY 2025 preliminary results",
            "https://example.test/fy-2025",
            "https://example.test/fy-2025.pdf",
            "full_year",
        )
        text = """
2026 guidance
Organic constant currency growth in total income excluding recoveries of 6.5-7.5%.
Capex intensity c 9.5%.
Equity free cash flow at least £2.7 billion.
Medium-term guidance 2027-2029
Capex declining to c. 8% in 2029.
"""

        rows = MODULE.guidance_events(MODULE.guidance_module(), event, text)
        metrics = {row["metric_name"]: row for row in rows}

        self.assertEqual(metrics["free_cash_flow_guidance"]["fiscal_period"], "Q42025")
        self.assertEqual(metrics["free_cash_flow_guidance"]["guidance_year"], 2026)
        self.assertIn("Full-year 2026 guidance", metrics["free_cash_flow_guidance"]["value_text"])


if __name__ == "__main__":
    unittest.main()
