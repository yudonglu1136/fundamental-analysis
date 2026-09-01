#!/usr/bin/env python3
"""Focused regression tests for Ontology publication snapshot route coverage."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT_PATH = Path(__file__).with_name("export-ontology-snapshot.py")
SPEC = importlib.util.spec_from_file_location("export_ontology_snapshot", SCRIPT_PATH)
assert SPEC and SPEC.loader
EXPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORTER)


class OntologySnapshotExporterTest(unittest.TestCase):
    def test_valuation_heatmap_is_a_required_fixed_export(self) -> None:
        self.assertEqual(
            EXPORTER.FIXED_ROUTES["valuation_heatmap"],
            "/api/market/valuation-heatmap",
        )

    def test_every_date_and_sector_gets_a_valuation_snapshot_route(self) -> None:
        heatmap = {
            "dates": ["2026-07-31", "2026-08-19T00:00:00Z"],
            "sectors": [
                {"group_id": "technology"},
                {"group_id": "health care"},
                {"group_id": ""},
            ],
        }
        dates, sectors, tasks = EXPORTER.valuation_snapshot_requests(heatmap)

        self.assertEqual(dates, ["2026-07-31", "2026-08-19"])
        self.assertEqual(sectors, ["technology", "health care"])
        self.assertEqual(len(tasks), 4)
        self.assertIn(
            (
                "valuation_heatmap_snapshot:health care:2026-08-19",
                "/api/market/valuation-heatmap/snapshot?group_id=health+care&as_of=2026-08-19",
            ),
            tasks,
        )

    def test_current_only_keeps_all_sectors_for_the_latest_date(self) -> None:
        heatmap = {
            "dates": ["2026-07-31", "2026-08-19"],
            "sectors": [{"group_id": "technology"}, {"group_id": "energy"}],
        }
        dates, sectors, tasks = EXPORTER.valuation_snapshot_requests(
            heatmap, current_only=True
        )

        self.assertEqual(dates, ["2026-08-19"])
        self.assertEqual(sectors, ["technology", "energy"])
        self.assertEqual(
            [key for key, _route in tasks],
            [
                "valuation_heatmap_snapshot:technology:2026-08-19",
                "valuation_heatmap_snapshot:energy:2026-08-19",
            ],
        )


if __name__ == "__main__":
    unittest.main()
