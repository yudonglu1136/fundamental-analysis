import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';
import 'package:guru_analysis_terminal/browser_location.dart';
import 'investment_portfolio_home_test.dart' as home;
import 'investment_portfolio_test.dart' as detail;

// Synthetic, test-only balances. No real account data or network calls.
class PrivacyApi extends home.HomeApi {
  PrivacyApi() {
    history = true;
    pnlHistory = true;
  }
  @override
  Map<String, dynamic> group(String c) {
    final g = super.group(c);
    for (final r in (g['positions'] as List).cast<Map<String, dynamic>>()) {
      r['assetCategory'] = 'STK';
      r['accountNumber'] = 'PRIVATE-ACCOUNT-67890';
      r['reportDate'] = '2026-09-09';
      if (r['ticker'] == 'AAA') r['unrealizedPnl'] = 200;
    }
    g['home']['nav']['rows'] = [
      {'date': '2026-07-01', 'nav': 2500},
      {'date': '2026-08-20', 'nav': 3200},
      {'date': '2026-09-08', 'nav': 3010},
      {'date': '2026-09-09', 'nav': 3000},
    ];
    // A different currency group has its own NAV denominator.
    if (c == 'EUR') {
      for (final r in g['home']['nav']['rows']) {
        r['nav'] *= 2;
      }
      g['home']['accountValue'] = 6000;
    }
    return g;
  }
}

final privacyToggle = find.byKey(const ValueKey('portfolio-privacy-toggle'));

void expectNoAmounts(WidgetTester t) {
  final texts = t
      .widgetList<Text>(find.byType(Text))
      .map((w) => w.data ?? w.textSpan?.toPlainText() ?? '')
      .join('\n');
  expect(texts, isNot(matches(RegExp(r'(USD|EUR)\s*[+−\-]?\d'))));
  expect(texts, isNot(contains('PRIVATE-ACCOUNT-67890')));
  expect(texts, isNot(contains('3,000')));
  expect(texts, isNot(contains('1,000')));
  expect(texts, isNot(contains('NaN')));
  expect(texts, isNot(contains('Infinity')));
}

void main() {
  setUp(() {
    portfolioPrivacyMode.value = false;
    writePortfolioPrivacyPreference(false);
  });
  tearDown(() {
    portfolioPrivacyMode.value = false;
    writePortfolioPrivacyPreference(false);
  });

  test('rates require a finite positive denominator, not a zero fallback', () {
    expect(portfolioRatio(-20, 100), -.2);
    for (final denominator in [null, 0, -10, double.nan, double.infinity]) {
      expect(portfolioRatio(20, denominator), isNull);
    }
    expect(portfolioRatio(null, 100), isNull);
    expect(portfolioRatio(double.infinity, 100), isNull);
    expect(portfolioRateLabel(null), '—');
    expect(portfolioRateLabel(.125), '+12.50%');
  });

  test(
    'NAV basis sorts, rejects conflicts, never uses a future or negative balance',
    () {
      final rows = <Map<String, dynamic>>[
        {'date': '2026-09-09', 'nav': 300},
        {'date': '2026-09-07', 'nav': 100},
        {'date': '2026-09-08', 'nav': -10},
        {'date': 'invalid', 'nav': 1000},
      ];
      expect(portfolioNavBasis(rows, '2026-09-06'), isNull);
      expect(portfolioNavBasis(rows, '2026-09-08'), isNull);
      expect(
        portfolioNavBasis(rows, '2026-09-09', strictlyBefore: true),
        isNull,
      );
      expect(portfolioNavBasis(rows, '2026-09-07', exact: true), 100);
      rows.add({'date': '2026-09-07', 'nav': 200});
      expect(portfolioNavBasis(rows, '2026-09-07', exact: true), isNull);
      expect(portfolioNavBasis(rows, '2026-09-10', exact: true), isNull);
    },
  );

  test(
    'chart receives percentage-only values and cannot infer account size',
    () {
      final rows = <Map<String, dynamic>>[
        {'date': '2026-07-01', 'nav': 2500, 'pnl': 98765},
        {'date': '2026-09-09', 'nav': 3000},
      ];
      final normalized = portfolioPercentageSeries(rows, 2500, nav: true);
      expect(normalized.first['nav'], 0);
      expect(normalized.last['nav'], closeTo(.2, 1e-9));
      expect(normalized.first.keys, ['date', 'nav']);
      expect(rows.first['nav'], 2500); // Source evidence is unchanged.
      expect(
        portfolioPercentageSeries(rows, null, nav: true).first['nav'],
        isNull,
      );
      expect(
        portfolioPercentageSeries(
          [
            {'date': '2026-09-09', 'nav': -50},
          ],
          2500,
          nav: false,
        ).single['nav'],
        -.02,
      );
    },
  );

  test('open P&L uses reconciled long cost basis, not market value', () {
    final row = <String, dynamic>{
      'ticker': 'AAA',
      'assetCategory': 'STK',
      'pnl': 200,
    };
    final positions = <Map<String, dynamic>>[
      {
        'ticker': 'AAA',
        'assetCategory': 'STK',
        'kind': 'equity',
        'quantity': 10,
        'value': 1000,
        'unrealizedPnl': 200,
      },
    ];
    expect(portfolioOpenPnlRate(row, positions), .25);
    positions.add({...positions.first, 'value': 500, 'unrealizedPnl': 100});
    expect(portfolioOpenPnlRate({...row, 'pnl': 300}, positions), .25);
    expect(portfolioOpenPnlRate(row, positions), isNull); // Partial mismatch.
    positions.last['unrealizedPnl'] = null;
    expect(portfolioOpenPnlRate(row, positions), isNull);
    expect(
      portfolioOpenPnlRate({...row, 'assetCategory': 'OPT'}, positions),
      isNull,
    );
    positions.removeLast();
    positions.first['quantity'] = -10;
    expect(portfolioOpenPnlRate(row, positions), isNull);
  });

  testWidgets(
    'one click masks Home, changes every chart/hover to rates, and restores amounts',
    (t) async {
      final api = PrivacyApi();
      await home.mount(t, api);
      expect(find.text('USD 3,000'), findsOneWidget);
      await detail.tap(t, privacyToggle);
      expectNoAmounts(t);
      expect(find.text('+20.00%'), findsOneWidget);
      expect(find.text('+25.00%'), findsOneWidget); // Open P&L 200 / cost 800.
      expect(find.text('2026-09-09 · +20.00%'), findsOneWidget);
      expect(readPortfolioPrivacyPreference(), isTrue);
      final initialReads = api.reads.length;
      for (final mode in ['realized', 'cashAdjusted', 'nav']) {
        await detail.tap(t, find.byKey(ValueKey('history-metric-$mode')));
        expectNoAmounts(t);
        final chart = find.byKey(
          ValueKey(mode == 'nav' ? 'actual-nav-chart' : '$mode-pnl-chart'),
        );
        await t.ensureVisible(chart);
        await t.tapAt(t.getCenter(chart));
        await t.pumpAndSettle();
        expectNoAmounts(t);
      }
      await detail.tap(
        t,
        find.byKey(const ValueKey('history-metric-realized')),
      );
      expect(find.text('2026-09-09 · +2.00%'), findsOneWidget);
      await detail.tap(t, find.text('1M'));
      expect(
        find.text('2026-09-09 · +1.20%'),
        findsOneWidget,
      ); // 30 / 2500, not 30 / previous P&L.
      expect(
        api.reads.length,
        initialReads,
      ); // Display-only, no server mutation.
      await detail.tap(t, privacyToggle);
      expect(readPortfolioPrivacyPreference(), isFalse);
      expect(find.text('USD 3,000'), findsOneWidget);
      expect(find.text('2026-09-09 · USD 30'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'preference survives remount and Home/detail navigation; units and labels stay hidden',
    (t) async {
      final api = PrivacyApi();
      await home.mount(t, api);
      await detail.tap(t, privacyToggle);
      await t.pumpWidget(const SizedBox.shrink());
      // Simulate startup using the same persisted preference.
      portfolioPrivacyMode.value = readPortfolioPrivacyPreference();
      await detail.mount(t, api);
      expectNoAmounts(t);
      await detail.tap(t, find.widgetWithText(ChoiceChip, 'Holdings & value'));
      expectNoAmounts(t);
      expect(find.text('10'), findsNothing);
      expect(find.text('30'), findsNothing);
      for (final name in ['Overview', 'Risk & SPY', 'Compare with Gurus']) {
        final chip = find.widgetWithText(ChoiceChip, name);
        await detail.tap(t, chip);
        expectNoAmounts(t);
      }
      await t.pumpWidget(const SizedBox.shrink());
      await home.mount(t, api);
      expectNoAmounts(t);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'daily and realized ranks use explicit NAV contribution, separately by currency',
    (t) async {
      await home.mount(t, PrivacyApi()..daily = true);
      await detail.tap(t, privacyToggle);
      expect(find.text('+3.32%'), findsOneWidget); // AAA 100 / prior NAV 3010.
      await detail.tap(t, find.widgetWithText(ChoiceChip, 'Realized P&L').last);
      expect(find.text('+2.80%'), findsOneWidget); // AAA 70 / opening NAV 2500.
      await detail.tap(t, find.widgetWithText(ChoiceChip, 'EUR'));
      expect(find.text('+1.40%'), findsOneWidget); // EUR's own NAV 5000.
      expectNoAmounts(t);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'single observation and missing cost do not invent returns or reveal values',
    (t) async {
      portfolioPrivacyMode.value = true;
      await home.mount(t, home.HomeApi());
      expect(find.byKey(const ValueKey('nav-history-needed')), findsOneWidget);
      expect(find.textContaining('Rate unavailable'), findsOneWidget);
      expect(find.text('+25.00%'), findsNothing);
      expectNoAmounts(t);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets('privacy button supports keyboard and exposes its toggle state', (
    t,
  ) async {
    final semantics = t.ensureSemantics();
    await home.mount(t, PrivacyApi());
    await t.ensureVisible(privacyToggle);
    final buttonContext = t.element(
      find.descendant(of: privacyToggle, matching: find.byType(Text)).first,
    );
    Focus.of(buttonContext).requestFocus();
    await t.pump();
    await t.sendKeyEvent(LogicalKeyboardKey.enter);
    await t.pumpAndSettle();
    expect(portfolioPrivacyMode.value, isTrue);
    expect(
      t
          .widget<Semantics>(
            find.byKey(const ValueKey('portfolio-privacy-state')),
          )
          .properties
          .toggled,
      isTrue,
    );
    expectNoAmounts(t);
    semantics.dispose();
  });

  testWidgets(
    'nonpositive chart base hides the amount chart without fabricating a rate',
    (t) async {
      await t.pumpWidget(
        MaterialApp(
          home: LanguageScope(
            language: AppLanguage.en,
            child: Scaffold(
              body: PortfolioAccountValueChart(
                rows: const [
                  {'date': '2026-07-01', 'nav': 0},
                  {'date': '2026-09-09', 'nav': 3000},
                ],
                currency: 'USD',
                palette: Palette(false),
                hideAmounts: true,
              ),
            ),
          ),
        ),
      );
      expect(find.byKey(const ValueKey('actual-nav-chart')), findsNothing);
      expect(
        find.textContaining('positive starting account value'),
        findsOneWidget,
      );
      expect(find.text('2026-09-09 · —'), findsOneWidget);
      expectNoAmounts(t);
      expect(t.takeException(), isNull);
    },
  );

  for (final lang in AppLanguage.values) {
    testWidgets(
      '390px privacy rates and all P&L modes fit $lang at 150% text',
      (t) async {
        portfolioPrivacyMode.value = true;
        await home.mount(
          t,
          PrivacyApi(),
          size: const Size(390, 844),
          lang: lang,
          scale: 1.5,
        );
        for (final mode in ['nav', 'realized', 'cashAdjusted']) {
          await detail.tap(t, find.byKey(ValueKey('history-metric-$mode')));
          expectNoAmounts(t);
          expect(t.takeException(), isNull);
        }
        await detail.mount(
          t,
          PrivacyApi(),
          size: const Size(390, 844),
          lang: lang,
          scale: 1.5,
        );
        expectNoAmounts(t);
        expect(t.takeException(), isNull);
      },
    );
  }
}
