import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("import-sec-official-guidance.py")
SPEC = importlib.util.spec_from_file_location("import_sec_official_guidance", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class OfficialSecGuidanceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guidance = MODULE.guidance_module()

    def event(self, excerpt, metric="ebitda_guidance"):
        return MODULE.extract_metric_event(
            self.guidance,
            "PSX",
            "2024-Q1",
            "2024-04-26",
            "https://example.test/filing",
            "SEC:test:release.htm",
            metric,
            excerpt,
        )

    def test_amount_before_metric_is_retained_for_company_target(self):
        event = self.event(
            "Our strategic priorities put us on a clear path to achieve our "
            "$14 billion mid-cycle adjusted EBITDA target by 2025."
        )

        self.assertEqual(event["amount"], 14_000)

    def test_synergy_components_do_not_become_company_ebitda_guidance(self):
        event = self.event(
            "The company has provided an incremental $1.25 billion toward its 2025 "
            "mid-cycle adjusted EBITDA target, including approximately $250 million "
            "of synergies, and remains focused on capturing over $400 million of "
            "run-rate commercial and operating synergies by year end."
        )

        self.assertIsNone(event["amount"])


if __name__ == "__main__":
    unittest.main()
