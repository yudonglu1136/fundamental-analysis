import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';

// Synthetic presentation data, never a TBBB model output or published estimate.
Map<String, dynamic> currentFixture() => {
  'ticker': 'TBBB',
  'name': 'Synthetic retailer',
  'currency': 'USD',
  'latest': {
    'latestPrice': null,
    'baseFairValue': 12.5,
    'upsideToBase': null,
    'targetPrice3Y': null,
    'valuationAnchorDate': '2026-09-05',
  },
  'history': [
    {
      'asOfDate': '2026-09-05',
      'fiscalYear': 2026,
      'fiscalQuarter': 'Q2',
      'fairValue': 12.5,
      'priceAtDate': null,
    },
  ],
  'priceHistory': <Map<String, dynamic>>[],
  'dataQuality': {'currentOnly': true, 'historicalCurveAuthorized': false},
  'currentScenarioDetails': {
    'analystAssumptions': {'keMxn': .125, 'terminalPerCurrentClaimGrowth': .02},
    'fx': {'mxnPerUsd': 18.0},
  },
  'scenarios': [
    {'scenarioId': 'base', 'fairValue': 12.5},
    {'scenarioId': 'downside', 'fairValue': null, 'fundingDeficitMxnM': 2000},
    {'scenarioId': 'upside', 'fairValue': 15.5},
  ],
  'warningTranslations': [
    {
      'en': 'Synthetic claim-bound warning. Not a guaranteed price floor.',
      'zh': '测试股权索偿上限提示，不是保证底价。',
    },
  ],
};

class CurrentApi extends ApiClient {
  CurrentApi() : super(() => 'test');
  @override
  Future<Map<String, dynamic>> getJson(String path) async => {
    'ticker': currentFixture(),
  };
}

const currentRow = ValuationRow(
  ticker: 'TBBB',
  name: 'Synthetic retailer',
  sector: 'Consumer Staples',
  currency: 'USD',
  latestPrice: 0,
  fairValue: 12.5,
  upside: 0,
  targetPrice3Y: 0,
  expectedReturn3Y: 0,
  latestPriceDate: '',
  coverageKind: 'current_only',
  lineageStatus: 'pass',
  releaseStatus: 'pending',
  economicValidationStatus: 'not_validated',
  marketCalibrationStatus: 'not_run',
  consensusStatus: '',
  consensusUpside: null,
);

void main() {
  for (final language in AppLanguage.values) {
    for (final size in [const Size(1280, 720), const Size(390, 844)]) {
      for (final surface in ['drawer', 'overview']) {
        testWidgets(
          'current scenario is explicit and nullable: $surface $language $size',
          (tester) async {
            tester.view.physicalSize = size;
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            final palette = Palette(false);
            final widget = surface == 'drawer'
                ? StockValuationPanel(
                    ticker: 'TBBB',
                    api: CurrentApi(),
                    palette: palette,
                    onClose: () {},
                  )
                : SingleChildScrollView(
                    child: ValuationSelectedOverview(
                      payload: {'ticker': currentFixture()},
                      selectedRow: currentRow,
                      loading: false,
                      error: null,
                      palette: palette,
                      showFullResearch: false,
                      onRetry: () {},
                      onToggleFullResearch: () {},
                    ),
                  );
            await tester.pumpWidget(
              MaterialApp(
                home: LanguageScope(
                  language: language,
                  child: Scaffold(body: widget),
                ),
              ),
            );
            await tester.pumpAndSettle();
            expect(find.byType(CurrentValuationScenarioCard), findsOneWidget);
            expect(find.byType(ValuationTrendChart), findsNothing);
            expect(
              find.text(
                language == AppLanguage.en ? 'Base scenario value' : '基准情景估值',
              ),
              findsWidgets,
            );
            await tester.ensureVisible(
              find.byType(CurrentValuationScenarioCard),
            );
            await tester.pumpAndSettle();
            expect(
              find.text(
                language == AppLanguage.en ? 'No valid target' : '无有效目标价',
              ),
              findsOneWidget,
            );
            expect(find.textContaining('MXN 2.00B'), findsOneWidget);
            expect(find.textContaining('12.50%'), findsOneWidget);
            expect(find.textContaining('2.00%'), findsOneWidget);
            expect(find.textContaining('18.0000'), findsOneWidget);
            expect(find.text('\$0.00'), findsNothing);
            expect(find.text('Why the valuation changed'), findsNothing);
            expect(find.text('Why it changed'), findsNothing);
            expect(find.text('+0.0%'), findsNothing);
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}
