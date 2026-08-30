import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("extract-pit-management-guidance.py")
SPEC = importlib.util.spec_from_file_location("extract_pit_management_guidance", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PlusMinusGuidanceTests(unittest.TestCase):
    def events(self, sentence, metric="revenue_guidance"):
        metrics = MODULE.metric_names(sentence)
        return [
            MODULE.extract_event(
                "TEST",
                "Q12026",
                "2026-05-01",
                "https://example.test/release",
                Path("TEST-Q1-2026.txt"),
                "Test CEO",
                sentence,
                name,
                position,
                metrics,
            )
            for name, position in metrics
            if name == metric
        ]

    def event(self, sentence, metric="revenue_guidance"):
        return self.events(sentence, metric)[0]

    def test_money_plus_minus_uses_center_not_tolerance_average(self):
        event = self.event("Revenue is expected to be $4.1 billion, ±$100 million.")

        self.assertEqual(event["amount"], 4_100)
        self.assertEqual(event["currency"], "USD")

    def test_plus_or_minus_words_use_center_not_tolerance_average(self):
        event = self.event("Revenue is expected to be $2.1 billion, + or - $150 million.")

        self.assertEqual(event["amount"], 2_100)

    def test_mojibake_plus_minus_uses_center(self):
        event = self.event("Revenue is expected to be $1.5 billion Â±$50 million.")

        self.assertEqual(event["amount"], 1_500)

    def test_mojibake_attached_to_scale_does_not_hide_center(self):
        event = self.event("Revenue is expected to be $3.1 billionÂ±, $100 million.")

        self.assertEqual(event["amount"], 3_100)

    def test_percentage_tolerance_keeps_monetary_center(self):
        event = self.event("Revenue is expected to be $2.32 billion Â±5%.")

        self.assertEqual(event["amount"], 2_320)

    def test_multiple_percentage_tolerances_stay_with_their_metric(self):
        event = self.event(
            "We expect capital expenditures of $700 million Â±5% and depreciation of $690 million Â±5%.",
            metric="capex_guidance",
        )

        self.assertEqual(event["amount"], 700)

    def test_revenue_amount_is_not_stolen_by_a_later_margin_metric(self):
        event = self.event(
            "We expect revenue and gross margin to be $10 billion and 50%, respectively."
        )

        self.assertEqual(event["amount"], 10_000)

    def test_equidistant_amount_belongs_to_preceding_revenue_metric(self):
        event = self.event(
            "We expect total revenue to be $2.32 billion Â±5%, gross margin to be at least 26.5%, and EPS of $0.83 Â±5%."
        )

        self.assertEqual(event["amount"], 2_320)

    def test_margin_plus_minus_uses_percentage_center_and_no_money_amount(self):
        event = self.event(
            "Operating margin is expected to be 42% ±100 basis points and includes $100 million of synergies.",
            metric="operating_margin",
        )

        self.assertEqual(event["margin_pct"], 42)
        self.assertIsNone(event["amount"])

    def test_versus_values_are_not_averaged_as_a_range(self):
        event = self.event(
            "We expect to spend around $3.5 billion versus free cash flow of $2.4 billion.",
            metric="free_cash_flow_guidance",
        )

        self.assertEqual(event["amount"], 2_400)

    def test_explicit_to_range_uses_endpoint_midpoint(self):
        event = self.event("Revenue is expected to be $4.0 billion to $4.2 billion.")

        self.assertEqual(event["amount"], 4_100)

    def test_between_and_range_uses_endpoint_midpoint(self):
        event = self.event("We expect revenue between $900 million and $1.1 billion.")

        self.assertEqual(event["amount"], 1_000)

    def test_range_with_scale_only_after_second_endpoint_uses_midpoint(self):
        revenue = self.event("We expect revenue of $1.66-$1.68 billion.")
        operating_income = self.event(
            "We expect operating income of $205-$225 million.",
            metric="operating_income_guidance",
        )

        self.assertEqual(revenue["amount"], 1_670)
        self.assertEqual(operating_income["amount"], 215)

    def test_company_sales_and_data_center_revenue_are_separate_events(self):
        events = self.events(
            "We now expect full year sales to be roughly $23 billion, with organic growth up "
            "mid to high single-digits and full year data center revenue of approximately "
            "$2 billion versus $1.5 billion prior guide."
        )

        self.assertEqual([event["amount"] for event in events], [23_000, 2_000])
        self.assertEqual(events[0]["guidance_scope"], "full_year")
        self.assertEqual(events[0]["guidance_subject"], "company_total_or_unspecified")
        self.assertEqual(events[1]["guidance_subject"], "segment_or_subset")

    def test_mixed_horizon_sentence_scopes_selected_full_year_amount_locally(self):
        events = self.events(
            "Turning to service revenues, we continue to expect to deliver full-year service "
            "revenues of approximately $77 billion this year, representing 8% growth, with Q3 "
            "expectations of approximately $19.3 billion, or up 6% year-over-year."
        )
        valued = [event for event in events if event["amount"] is not None]

        self.assertEqual(len(valued), 1)
        self.assertEqual(valued[0]["amount"], 77_000)
        self.assertEqual(valued[0]["guidance_scope"], "full_year")
        self.assertEqual(valued[0]["guidance_subject"], "segment_or_subset")

    def test_month_named_quarter_is_structured_quarter_scope(self):
        event = self.event(
            "September quarter revenue is expected to be in a range of $2.1 billion, "
            "+ or - $150 million."
        )

        self.assertEqual(event["amount"], 2_100)
        self.assertEqual(event["guidance_scope"], "quarter")

    def test_cost_amount_is_not_owned_by_a_revenue_guidance_reference(self):
        sentences = (
            "At the midpoint of our revenue guidance, we expect operating margin to improve, "
            "including underutilization costs of approximately $20 million.",
            "We expect OpEx savings of approximately $40 million, with no expected impact to revenue.",
            "At the midpoint of our revenue guidance, we expect operating margin in the low "
            "single digits, including between $50 million and $60 million in underutilization cost.",
        )
        for sentence in sentences:
            with self.subTest(sentence=sentence):
                revenue_events = self.events(sentence)
                self.assertTrue(revenue_events)
                self.assertTrue(all(event["amount"] is None for event in revenue_events))

    def test_operating_cash_flow_amount_is_not_assigned_to_revenue_growth(self):
        sentence = (
            "At the midpoint, we now expect revenue growth of 19%, operating margin of "
            "44.25%, EPS of $8.10, and operating cash flow of $2 billion for the year."
        )
        event = self.event(sentence)
        cash_flow = self.event(sentence, metric="operating_cash_flow_guidance")

        self.assertIsNone(event["amount"])
        self.assertEqual(event["growth_yoy"], 19)
        self.assertEqual(cash_flow["amount"], 2_000)

    def test_amount_immediately_before_operating_cash_flow_uses_following_owner(self):
        sentence = (
            "We expect consolidated adjusted revenues to grow at least 20%, and we expect "
            "to generate at least $11 billion of operating cash flow."
        )

        self.assertIsNone(self.event(sentence)["amount"])
        self.assertEqual(
            self.event(sentence, metric="operating_cash_flow_guidance")["amount"],
            11_000,
        )

    def test_revenue_ocf_and_capex_values_bind_to_three_separate_metrics(self):
        sentence = (
            "We expect revenue growth of 10.5%-11%, adjusted EPS in the range of "
            "$6.28-$6.33, operating cash flow of approximately $900 million, and "
            "capital expenditures of $150 million."
        )

        self.assertIsNone(self.event(sentence)["amount"])
        self.assertEqual(
            self.event(sentence, metric="operating_cash_flow_guidance")["amount"],
            900,
        )
        self.assertEqual(self.event(sentence, metric="capex_guidance")["amount"], 150)

    def test_billings_and_revenue_ranges_bind_to_their_own_metrics(self):
        sentence = (
            "For fiscal 2026, we expect billings of $7.2 billion to $7.3 billion and "
            "revenue of $6.26 billion to $6.34 billion."
        )

        self.assertEqual(self.event(sentence, metric="backlog_guidance")["amount"], 7_250)
        self.assertEqual(self.event(sentence)["amount"], 6_300)

    def test_fcf_revision_delta_does_not_cross_average_with_new_range(self):
        event = self.event(
            "We are raising our free cash flow outlook by $88 million to a new range of "
            "$2.2 billion to $2.275 billion.",
            metric="free_cash_flow_guidance",
        )

        self.assertEqual(event["amount"], 2_237.5)

    def test_raise_by_delta_to_new_level_selects_new_level(self):
        event = self.event(
            "We are increasing our projected free cash flow by $200 million to about "
            "$1.9 billion.",
            metric="free_cash_flow_guidance",
        )

        self.assertEqual(event["amount"], 1_900)
        self.assertNotEqual(event["guidance_subject"], "non_company_or_non_periodic")

    def test_revenue_and_ebit_amounts_bind_independently(self):
        sentence = (
            "For the full year, we expect revenue of $16.5 billion and adjusted EBIT "
            "of $4.235 billion."
        )

        self.assertEqual(self.event(sentence)["amount"], 16_500)
        self.assertEqual(
            self.event(sentence, metric="operating_income_guidance")["amount"],
            4_235,
        )

    def test_fx_impacts_on_revenue_and_ebit_are_non_periodic_deltas(self):
        sentence = (
            "We estimate the full-year negative impact of foreign exchange on reported "
            "revenue and EBIT to be approximately $4 billion and $900 million, respectively."
        )

        revenue = self.event(sentence)
        ebit = self.event(sentence, metric="operating_income_guidance")
        self.assertEqual(revenue["amount"], 4_000)
        self.assertEqual(ebit["amount"], 900)
        self.assertEqual(revenue["guidance_subject"], "non_company_or_non_periodic")
        self.assertEqual(ebit["guidance_subject"], "non_company_or_non_periodic")

    def test_fx_reduction_to_operating_profit_is_non_periodic(self):
        event = self.event(
            "For the full year, we estimate foreign exchange will reduce operating "
            "profits by approximately $28 million.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["guidance_subject"], "non_company_or_non_periodic")

    def test_revenue_used_only_as_capex_ratio_denominator_is_non_company(self):
        for sentence in (
            "We expect capital expenditures to be approximately 3% of revenue, with a "
            "capacity access fee of $70 million and an equity investment of $80 million.",
            "We anticipate full-year capital expenditures will be 40%-42% of total "
            "revenue, including a $700 million impact from a contract.",
        ):
            with self.subTest(sentence=sentence):
                event = self.event(sentence)
                self.assertEqual(
                    event["guidance_subject"],
                    "non_company_or_non_periodic",
                )

    def test_fx_revenue_headwind_is_not_a_company_revenue_level(self):
        event = self.event(
            "We now expect FX to be a year-over-year headwind of $1.25 billion in "
            "revenue, or 3.2%."
        )

        self.assertEqual(event["guidance_subject"], "non_company_or_non_periodic")

    def test_depreciation_amount_does_not_enter_capex_range(self):
        event = self.event(
            "We expect depreciation and amortization of $57 million and capital "
            "expenditures of $35 million to $45 million.",
            metric="capex_guidance",
        )

        self.assertEqual(event["amount"], 40)

    def test_capex_range_and_fcf_level_do_not_cross_average(self):
        sentence = (
            "For the year, we expect capital spending of $1.4 billion to $1.7 billion "
            "and free cash flow of $7 billion."
        )

        self.assertEqual(self.event(sentence, metric="capex_guidance")["amount"], 1_550)
        self.assertEqual(self.event(sentence, metric="free_cash_flow_guidance")["amount"], 7_000)

    def test_between_range_accepts_text_currency_tokens(self):
        event = self.event(
            "For the full year, we expect revenue between EUR 8.4 billion and EUR 9 billion."
        )

        self.assertEqual(event["amount"], 8_700)

    def test_multiple_ranges_for_one_metric_choose_nearest_explicit_pair(self):
        event = self.event(
            "We expect capex in the range of $28 billion to $29 billion, compared with "
            "$27 billion to $28 billion in the prior year.",
            metric="capex_guidance",
        )

        self.assertEqual(event["amount"], 28_500)

    def test_low_and_high_end_wording_is_an_explicit_range(self):
        event = self.event(
            "We are raising the low end of revenue guidance to $8.7 billion and "
            "maintaining the high end at $8.9 billion."
        )

        self.assertEqual(event["amount"], 8_800)

    def test_down_to_up_range_preserves_endpoint_signs(self):
        event = self.event(
            "We expect operating profit to be in the range of down $125 million to "
            "up $25 million.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["amount"], -50)

    def test_q2_fy_label_is_quarter_scope_not_full_year(self):
        event = self.event(
            "For Q2 FY 2027, we expect revenue between $265 million and $273 million."
        )

        self.assertEqual(event["guidance_scope"], "quarter")

    def test_met_guidance_is_historical_not_a_new_outlook(self):
        sentence = "Revenue of $2 billion met our guidance for the second quarter."

        self.assertIsNotNone(MODULE.HISTORICAL_GUIDANCE.search(sentence))

    def test_actual_value_does_not_enter_later_forward_sentence_context(self):
        event = self.event(
            "We expect other income expense to remain flat in the June quarter. "
            "non-GAAP net income grew to $934 million with corresponding EPS of $4.10.",
            metric="net_income_guidance",
        )

        self.assertIsNone(event["amount"])

    def test_lowercase_following_actual_net_loss_is_not_forward_operating_income(self):
        event = self.event(
            "We expect to achieve non-GAAP operating income break even next quarter. "
            "non-GAAP net loss in Q3 was $13.4 million, compared with a net loss of "
            "$28.8 million last year.",
            metric="operating_income_guidance",
        )

        self.assertIsNone(event["amount"])

    def test_delivered_comparison_base_is_not_forward_fcf_guidance(self):
        event = self.event(
            "We expect to deliver over 50% growth in free cash flow in 2024 versus the "
            "$518 million we delivered in 2023.",
            metric="free_cash_flow_guidance",
        )

        self.assertIsNone(event["amount"])

    def test_actual_and_forward_revenue_values_bind_independently(self):
        events = MODULE.deduplicate_sentence_events(self.events(
            "Residential revenue came in at $10 million in the third quarter, and we expect "
            "full year revenue of $43 million."
        ))

        self.assertEqual([event["amount"] for event in events if event["amount"] is not None], [43])

    def test_reported_revenue_is_an_accounting_modifier_not_a_past_tense_verb(self):
        event = self.event(
            "We expect our reported revenue to be in the range of $1.79 billion-$1.82 billion."
        )

        self.assertEqual(event["amount"], 1_805)

    def test_closed_sales_is_a_pipeline_metric_not_a_past_tense_close(self):
        event = self.event(
            "We expect closed sales to be in the range of $170 million-$210 million."
        )

        self.assertEqual(event["amount"], 190)

    def test_excluded_expense_clause_does_not_steal_operating_income_range(self):
        event = self.event(
            "We anticipate consolidated operating income, which excludes stock-based compensation "
            "and other operating expense, to be between $275 million and $425 million.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["amount"], 350)

    def test_cash_balance_does_not_average_with_forward_fcf(self):
        event = self.event(
            "Our cash balance at year end was $8.4 billion, and we expect to generate free cash "
            "flow of approximately $21 billion in 2026.",
            metric="free_cash_flow_guidance",
        )

        self.assertEqual(event["amount"], 21_000)

    def test_fiscal_year_and_share_repurchase_do_not_become_fcf_guidance(self):
        sentence = (
            "This brings total share repurchases since the beginning of fiscal year 2025 "
            "to $1.4 billion, we see continued runway moving forward given our strong "
            "outlook for free cash flow."
        )
        event = self.event(sentence, metric="free_cash_flow_guidance")

        self.assertEqual(
            [value["value"] for value in MODULE.amount_values(sentence)],
            [1_400],
        )
        self.assertIsNone(event["amount"])
        self.assertEqual(event["guidance_subject"], "non_company_or_non_periodic")

    def test_earlier_cost_clause_does_not_steal_later_revenue(self):
        event = self.event(
            "Ramp-up costs will affect the fourth quarter, but in 2027 we expect to generate "
            "about $20 million of revenue."
        )

        self.assertEqual(event["amount"], 20)

    def test_repeated_metric_words_do_not_weight_the_same_sentence_more_than_once(self):
        events = self.events(
            "We expect revenue growth to improve and revenue momentum to support revenue "
            "of approximately $4 billion for the full year."
        )
        deduplicated = MODULE.deduplicate_sentence_events(events)

        self.assertEqual(len(deduplicated), 1)
        self.assertEqual(sum(event["amount"] is not None for event in deduplicated), 1)

    def test_empty_repeated_revenue_word_is_removed_after_plus_minus_center(self):
        for sentence, expected in (
            (
                "We expect revenue to be approximately $9.8 billion, plus or minus $300 million, "
                "including approximately $100 million of MI308 sales to China.",
                9_800,
            ),
            (
                "We expect revenue to be $8.7 billion +/- $200 million, which will represent a "
                "new record for quarterly revenues.",
                8_700,
            ),
        ):
            with self.subTest(sentence=sentence):
                deduplicated = MODULE.deduplicate_sentence_events(self.events(sentence))
                self.assertEqual(len(deduplicated), 1)
                self.assertEqual(deduplicated[0]["amount"], expected)

    def test_past_period_estimate_is_not_forward_guidance(self):
        sentence = (
            "We estimate the extra week last year was approximately $760 million in revenue "
            "and approximately $0.20 of non-GAAP diluted EPS."
        )

        self.assertIsNotNone(MODULE.HISTORICAL_GUIDANCE.search(sentence))

    def test_first_quarter_of_fiscal_year_is_quarter_scope(self):
        event = self.event(
            "For the first quarter of fiscal year 2027, we expect revenue between "
            "$10.3 billion and $10.8 billion."
        )

        self.assertEqual(event["amount"], 10_550)
        self.assertEqual(event["guidance_scope"], "quarter")

    def test_fy_scope_near_amount_outranks_earlier_quarter_reference(self):
        event = self.event(
            "After a transaction we expect to close later in Q3, we are increasing our FY 2026 "
            "subscription revenue guidance to $8.815 billion."
        )

        self.assertEqual(event["guidance_scope"], "full_year")
        self.assertEqual(event["guidance_subject"], "segment_or_subset")

    def test_non_company_sales_and_market_revenue_are_labeled(self):
        asset_sales = self.event("The total asset sales that we project are still $1.9 billion by 2028.")
        market_revenue = self.event(
            "We estimate the NAND market will exceed $300 billion in revenue in calendar year 2027."
        )

        self.assertEqual(asset_sales["guidance_subject"], "non_company_or_non_periodic")
        self.assertEqual(asset_sales["guidance_scope"], "multi_year_target")
        self.assertEqual(market_revenue["guidance_subject"], "non_company_or_non_periodic")

    def test_named_segment_revenues_are_not_company_total(self):
        events = self.events(
            "Within this outlook, we expect Semiconductor Systems revenue of around $6.9 billion, "
            "AGS revenue of about $1.75 billion, and other revenue of around $300 million."
        )

        self.assertEqual([event["amount"] for event in events], [6_900, 1_750, 300])
        self.assertTrue(all(event["guidance_subject"] == "segment_or_subset" for event in events))

    def test_segment_named_before_expect_revenue_is_not_company_total(self):
        event = self.event(
            "Shifting now to our Health Services segment, we expect revenue of approximately "
            "$185 billion, primarily driven by growth at Caremark."
        )

        self.assertEqual(event["amount"], 185_000)
        self.assertEqual(event["guidance_subject"], "segment_or_subset")

    def test_numeric_product_revenue_is_segment_evidence(self):
        events = self.events(
            "Looking ahead to Q4, we expect a substantial sequential increase in our data center "
            "revenue driven by growth in 400G revenue, as well as increased 800G revenue."
        )
        deduplicated = MODULE.deduplicate_sentence_events(events)

        self.assertTrue(deduplicated)
        self.assertTrue(all(event["guidance_subject"] == "segment_or_subset" for event in deduplicated))

    def test_direct_company_total_outranks_an_earlier_segment_reference(self):
        event = self.event(
            "After discussing the Health Services segment, we expect total company revenue "
            "of approximately $400 billion for the full year."
        )

        self.assertEqual(event["guidance_subject"], "company_total")

    def test_total_or_net_revenue_inside_named_segment_remains_segment(self):
        for sentence in (
            "Within the Healthcare Benefits segment, we expect total revenues in the range of "
            "$74.1 billion to $74.8 billion.",
            "For the international segment, net sales are expected to be approximately $275 million.",
        ):
            with self.subTest(sentence=sentence):
                event = self.event(sentence)
                self.assertEqual(event["guidance_subject"], "segment_or_subset")

    def test_company_total_revenue_can_be_driven_by_segments(self):
        event = self.event(
            "We now expect full-year total company revenues of at least $397 billion, "
            "driven by increases across all segments."
        )

        self.assertEqual(event["guidance_subject"], "company_total")

    def test_revenue_deltas_and_business_contributions_are_not_company_levels(self):
        for sentence in (
            "We estimate that we may lose revenues of between $240 million and $270 million "
            "on an annualized basis.",
            "We expect this new business to contribute annual revenues of approximately $390 million.",
            "We expect this business to contribute approximately $20 million in annual revenues.",
            "We expect $105 million per quarter of incremental revenue from Transco.",
        ):
            with self.subTest(sentence=sentence):
                event = self.event(sentence)
                self.assertEqual(event["guidance_subject"], "non_company_or_non_periodic")

    def test_actual_result_above_prior_guidance_is_not_forward_guidance(self):
        sentence = (
            "In the fourth quarter, we exceeded the high end of our guidance for both revenue "
            "and Adjusted EBITDA, achieving $953 million in total revenue and $476 million in Adjusted EBITDA."
        )

        self.assertIsNotNone(MODULE.HISTORICAL_GUIDANCE.search(sentence))

    def test_named_retail_business_revenue_is_segment_evidence(self):
        event = self.event(
            "For the year, we expect retail long-term care revenue to be between "
            "$85.3 billion and $86.8 billion."
        )

        self.assertEqual(event["guidance_subject"], "segment_or_subset")

    def test_annualized_run_rate_is_not_current_full_year_guidance(self):
        event = self.event(
            "We plan to grow our annualized sales run rate to $20 billion by the end of 2026."
        )

        self.assertEqual(event["guidance_scope"], "multi_year_target")
        self.assertEqual(event["guidance_subject"], "non_company_or_non_periodic")

    def test_segment_operating_income_and_discontinued_fcf_are_not_company_guidance(self):
        segment = self.event(
            "For the full year, the Health Services segment expects adjusted operating income of $7 billion.",
            metric="operating_income_guidance",
        )
        discontinued = self.event(
            "We expect $250 million of free cash flow from our discontinued operations in full year 2025.",
            metric="free_cash_flow_guidance",
        )

        self.assertEqual(segment["guidance_subject"], "segment_or_subset")
        self.assertEqual(discontinued["guidance_subject"], "segment_or_subset")

    def test_company_operating_income_and_fcf_levels_are_retained(self):
        operating_income = self.event(
            "In aggregate, we expect full-year enterprise adjusted operating income of $16.75 billion.",
            metric="operating_income_guidance",
        )
        free_cash_flow = self.event(
            "We expect aggregate company free cash flow of approximately $2.5 billion in 2026.",
            metric="free_cash_flow_guidance",
        )

        self.assertEqual(operating_income["guidance_subject"], "company_total")
        self.assertEqual(free_cash_flow["guidance_subject"], "company_total")

    def test_parallel_ebitda_and_operating_income_amounts_follow_metric_order(self):
        event = self.event(
            "EBITDA and operating income are expected to be approximately $2.6 billion "
            "and $1.9 billion at the midpoint, respectively.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["amount"], 1_900)

    def test_parallel_metric_list_without_respectively_follows_metric_order(self):
        event = self.event(
            "EBITDA and operating income are expected to be approximately $2.6 billion "
            "and $1.9 billion at the midpoint.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["amount"], 1_900)

    def test_trailing_sales_driver_does_not_break_parallel_amount_binding(self):
        event = self.event(
            "EBITDA and operating income are expected to be $2.4 billion and $1.6 billion "
            "at the midpoint, respectively, with strong year-over-year sales conversion.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["amount"], 1_600)

    def test_separate_ebitda_and_operating_income_ranges_do_not_cross_average(self):
        event = self.event(
            "We expect Adjusted EBITDA of $1.66 billion-$1.68 billion and adjusted operating "
            "income of $205 million-$225 million.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["amount"], 215)

    def test_named_services_revenue_carries_segment_subject_to_operating_income(self):
        event = self.event(
            "Moving to the segments for the full year, we expect Pharmacy Services revenues "
            "of $138 billion, with adjusted operating income of $5.25 billion.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["guidance_subject"], "segment_or_subset")

    def test_consolidated_operating_income_outranks_segment_driver_context(self):
        event = self.event(
            "Despite pressure in the Health Services segment, we expect consolidated operating "
            "income of $16.75 billion for the full year.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["guidance_subject"], "company_total")

    def test_operating_income_delta_is_not_an_absolute_company_level(self):
        event = self.event(
            "We estimate this will decrease full-year operating income by approximately $400 million.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["guidance_subject"], "non_company_or_non_periodic")

    def test_company_operating_income_delta_remains_non_periodic(self):
        event = self.event(
            "We estimate this will decrease company operating income by approximately $400 million.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["guidance_subject"], "non_company_or_non_periodic")

    def test_operating_profit_guarantee_is_not_company_profit_guidance(self):
        event = self.event(
            "We expect to benefit from approximately $27 million of operating profit "
            "guarantees this year.",
            metric="operating_income_guidance",
        )

        self.assertEqual(event["guidance_subject"], "non_company_or_non_periodic")


if __name__ == "__main__":
    unittest.main()
