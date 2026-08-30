import importlib.util
import unittest
from datetime import date
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build-pit-valuation-source.py")
SPEC = importlib.util.spec_from_file_location("build_pit_valuation_source", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ShareCountBasisTests(unittest.TestCase):
    def base_row(self):
        return {
            "fiscalperiod": "2026-Q2",
            "datekey": date(2026, 8, 1),
            "reportperiod": date(2026, 6, 30),
            "calendardate": date(2026, 6, 30),
            "lastupdated": date(2026, 8, 2),
            "dimension": "ARQ",
            "sharesbas": 100_000_000,
            "shareswadil": 60_000_000,
            "shareswa": 55_000_000,
            "sharefactor": 2,
            "revenueusd": 1_000_000_000,
            "netinccmnusd": 100_000_000,
        }

    def test_period_end_basic_shares_are_preferred_and_adjusted_once(self):
        result = MODULE.build_period("TEST", "TEST", self.base_row(), Path("unused.sqlite"))

        self.assertEqual(result["shares_m"], 200)
        self.assertEqual(result["sourceRecord"]["shareCountBasis"], "sharesbas")
        self.assertEqual(result["sourceRecord"]["appliedShareFactor"], 2)
        self.assertEqual(result["sourceRecord"]["rawShareCounts"]["shareswadil"], 60_000_000)
        self.assertIn("never infer splits", result["sourceRecord"]["shareCountPolicy"])

    def test_diluted_shares_are_only_a_fallback(self):
        row = self.base_row()
        row["sharesbas"] = None

        result = MODULE.build_period("TEST", "TEST", row, Path("unused.sqlite"))

        self.assertEqual(result["shares_m"], 120)
        self.assertEqual(result["sourceRecord"]["shareCountBasis"], "shareswadil")

    def test_london_ordinary_listing_excludes_us_adr_sharefactor(self):
        row = self.base_row()
        row["sharefactor"] = 0.25
        row["sharesbas"] = 2_400_000_000

        result = MODULE.build_period("DGE.L", "DEO", row, Path("unused.sqlite"))

        self.assertEqual(result["shares_m"], 2400)
        self.assertEqual(result["sourceRecord"]["sharefactor"], 0.25)
        self.assertEqual(result["sourceRecord"]["appliedShareFactor"], 1)
        self.assertIn("US ADR equivalents", result["sourceRecord"]["shareCountPolicy"])

    def test_azn_uses_ecb_pit_fx_instead_of_cross_listing_price_ratio(self):
        row = self.base_row()
        row.update(
            {
                "revenue": 1_000_000_000,
                "revenueusd": 1_000_000_000,
                "fxusd": 1.0,
                "price": 200.0,
            }
        )
        rates = MODULE.FxRateBook(
            [
                {
                    "currency": "USD",
                    "rate_date": "2026-07-31",
                    "units_per_eur": 1.16,
                    "source_url": "https://data-api.ecb.europa.eu/usd",
                },
                {
                    "currency": "GBP",
                    "rate_date": "2026-07-31",
                    "units_per_eur": 0.87,
                    "source_url": "https://data-api.ecb.europa.eu/gbp",
                },
            ]
        )

        result = MODULE.build_period(
            "AZN", "AZN", row, Path("unused.sqlite"), fx_rate_book=rates
        )

        expected_rate = 0.87 / 1.16
        self.assertAlmostEqual(result["revenue_m"], 1_000 * expected_rate)
        self.assertEqual(result["financialStatementCurrency"], "GBP")
        self.assertEqual(result["sourceFinancialStatementCurrency"], "USD")
        self.assertEqual(result["sourceRecord"]["sourceCurrency"], "USD")
        self.assertEqual(result["sourceRecord"]["modelCurrency"], "GBP")
        self.assertAlmostEqual(
            result["sourceRecord"]["fxConversion"]["conversionRate"], expected_rate
        )
        self.assertEqual(
            result["sourceRecord"]["fxConversion"]["targetRateDate"],
            "2026-07-31",
        )
        self.assertNotIn("price", result["sourceRecord"]["currencyScaleNote"].lower())
        self.assertNotIn("fallback", result["sourceRecord"]["currencyScaleNote"].lower())

    def test_azn_missing_ecb_rates_is_a_hard_failure(self):
        with self.assertRaisesRegex(RuntimeError, "requires official ECB FX rates"):
            MODULE.build_period("AZN", "AZN", self.base_row(), Path("unused.sqlite"))


if __name__ == "__main__":
    unittest.main()
