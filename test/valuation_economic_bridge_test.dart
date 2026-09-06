import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';

// Synthetic presentation fixtures, not a CRDO valuation or financial release.
Map<String, dynamic> economicFixture() => {
  'fairValue': 100,
  'priceAtDate': 90,
  'targetPrice3Y': 130,
  'methodOutputs': [
    for (var i = 0; i < 7; i++)
      {
        'key': 'ordinary-$i',
        'label': 'Model $i',
        'value': 100,
        'format': 'currency',
      },
    {
      'key': 'other-equity-claims',
      'label': 'Other outstanding equity claims',
      'value': -2,
      'format': 'currency',
    },
    {
      'key': 'vested-option-claims',
      'label': 'Option and warrant claims',
      'value': -1,
      'format': 'currency',
    },
    {
      'key': 'economic-fcfe-bridge',
      'label': 'Economic cash-flow bridge',
      'value': 240,
      'format': 'millions',
    },
  ],
  'dataSnapshot': {
    'selectedFinancialPeriod': {'periodEndDate': '2026-06-30'},
    'fiscalFinancials': {
      'revenue_m': 100,
      'shares_m': 100,
      'fcf_after_capex_m': 40,
      'cash_m': 400,
    },
    'valuationSemantics': {
      'scoreInputs': {
        'reviewedEconomicInput': {
          'ttm': {
            'reportedFcfM': 440,
            'economicFcfeM': 240,
            'sbcM': 180,
            'licensePaymentsM': 20,
          },
          'warrantNormalization': {'taxRate': .21},
          'balanceNormalization': {
            'fundedDebtM': 0,
            'operatingLeaseCurrentM': 5,
            'operatingLeaseNoncurrentM': 25,
          },
        },
      },
    },
  },
};

void main() {
  for (final language in AppLanguage.values) {
    for (final size in [const Size(1280, 720), const Size(390, 844)]) {
      testWidgets(
        'economic bridge is explicit, untruncated and fits $language $size',
        (tester) async {
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(
            MaterialApp(
              home: LanguageScope(
                language: language,
                child: Scaffold(
                  body: SingleChildScrollView(
                    child: Column(
                      children: [
                        ValuationInputResearchCard(
                          row: economicFixture(),
                          currency: 'USD',
                          palette: Palette(false),
                        ),
                        ValuationOutputResearchCard(
                          row: economicFixture(),
                          fallbackMethodCards: const [],
                          currency: 'USD',
                          palette: Palette(false),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final english = language == AppLanguage.en;
          for (final label
              in english
                  ? [
                      'Reported FCF (TTM)',
                      'Economic FCFE (TTM)',
                      'SBC deducted (TTM)',
                      'License cash deducted (TTM)',
                      'Cash & unrestricted investments',
                      'Funded debt',
                      'Operating lease liabilities',
                      'Other outstanding equity claims',
                      'Option and warrant claims',
                      'Economic cash-flow bridge',
                    ]
                  : [
                      '报告自由现金流（TTM）',
                      '经济股权现金流（TTM）',
                      '扣除股票薪酬（TTM）',
                      '扣除许可付款（TTM）',
                      '现金及非受限投资',
                      '融资债务',
                      '经营租赁负债',
                      '其他未结算股权索偿',
                      '期权及认股权证索偿',
                      '经济现金流调整',
                    ]) {
            expect(find.text(label), findsOneWidget);
          }
          expect(find.text('Model 4'), findsOneWidget);
          expect(find.text('Model 5'), findsNothing);
          expect(
            find.textContaining(english ? 'not reported FCF' : '并非公司报告'),
            findsOneWidget,
          );
          expect(find.text(r'$240M'), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
