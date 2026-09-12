import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';

// Synthetic fixtures only. No invented observations enter production.
class FundamentalApi extends ApiClient {
  FundamentalApi() : super(() => 'test');
  bool fail = false, detailFail = false, wrongDate = false;
  Completer<Map<String, dynamic>>? pending;
  Map<String, dynamic> response(String date) => {
    'version': 'fundamental-changes-v1',
    'asOf': date,
    'coverage': {'operating': 3, 'comparable': 2, 'excluded': 1, 'invalid': 1},
    'counts': {'acceleration': 2, 'profit': 1, 'cash': 1, 'divergence': 1},
    'companies': [
      row('ACC', .3, .2, ['acceleration', 'profit', 'cash']),
      row('DIV', .2, -.1, ['acceleration', 'divergence']),
      row('MISS', null, null, []),
    ],
  };
  Map<String, dynamic> row(
    String ticker,
    double? growth,
    double? gap,
    List<String> screens,
  ) => {
    'ticker': ticker,
    'name': '$ticker fixture company',
    'period': '2026-Q1',
    'periodEnd': '2026-03-31',
    'filingDate': '2026-05-01',
    'metrics': {
      'revenueGrowth': growth,
      'operatingMargin': .2,
      'fcfMargin': .1,
    },
    'changes': {
      'revenueGrowth': .1,
      'operatingMargin': .03,
      'fcfMargin': ticker == 'DIV' ? -.03 : .02,
    },
    'previous': {
      'period': '2025-Q4',
      'metrics': {
        'revenueGrowth': .1,
        'operatingMargin': .17,
        'fcfMargin': .08,
      },
    },
    'screens': screens,
    'price': {'value': 100, 'currency': 'USD', 'date': '2026-05-29'},
    'valuation': {'fairValue': 110, 'currency': 'USD', 'date': '2026-05-01'},
    'modelGap': gap,
  };
  Map<String, dynamic> detail(String ticker, String date) => {
    'ticker': ticker,
    'asOf': date,
    'history': [
      for (int i = 1; i <= 8; i++)
        {
          'period': 'Q$i',
          'periodEnd': '202${3 + i ~/ 4}-0${i % 3 + 1}-01',
          'availableAt': '2026-05-01',
          'filingDate': '2026-05-01',
          'source': {'dimension': 'ARQ'},
          'metrics': {
            'revenueGrowth': i / 10,
            'operatingMargin': .2,
            'fcfMargin': .1,
          },
        },
    ],
  };
  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    final date = Uri.parse(path).queryParameters['asOf']!;
    if (path.contains('/fundamentals?')) {
      if (fail) throw StateError('offline');
      if (pending != null) return pending!.future;
      return response(wrongDate ? '2025-01-01' : date);
    }
    if (detailFail) throw StateError('detail offline');
    return detail(Uri.parse(path).pathSegments.last, date);
  }
}

Future<void> mount(
  WidgetTester t,
  FundamentalApi api, {
  double width = 1450,
  AppLanguage language = AppLanguage.en,
  String date = '2026-06-01',
  void Function(String, String)? onCompany,
  Map<String, dynamic> selection = const {},
  double scale = 1,
}) async {
  t.view.physicalSize = Size(width, 1100);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  await t.pumpWidget(
    MaterialApp(
      theme: ThemeData.dark(),
      home: LanguageScope(
        language: language,
        child: Scaffold(
          body: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(scale)),
            child: SingleChildScrollView(
              child: FundamentalsPanel(
                api: api,
                palette: Palette(false),
                asOf: date,
                onCompany: onCompany ?? (_, _) {},
                initialSelection: selection,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await t.pumpAndSettle();
}

Future<void> tap(WidgetTester t, Finder f) async {
  await t.ensureVisible(f);
  await t.tap(f);
  await t.pumpAndSettle();
}

void main() {
  test('screen selection, search, exact signed gap and null-last sort', () {
    final rows = asList(FundamentalApi().response('2026-06-01')['companies']);
    expect(filterFundamentals(rows, screen: 'cash').map((r) => r['ticker']), [
      'ACC',
    ]);
    expect(
      filterFundamentals(rows, screen: 'divergence').map((r) => r['ticker']),
      ['DIV'],
    );
    expect(
      filterFundamentals(
        rows,
        screen: 'all',
        sort: 'value',
      ).map((r) => r['ticker']),
      ['ACC', 'DIV', 'MISS'],
    );
    expect(
      filterFundamentals(
        rows,
        screen: 'all',
        query: 'fixture',
        belowValue: true,
      ).map((r) => r['ticker']),
      ['ACC'],
    );
  });
  testWidgets(
    'distinct research screens select evidence; CTA uses the selected ticker',
    (t) async {
      final opened = <String>[];
      await mount(
        t,
        FundamentalApi(),
        onCompany: (s, d) => opened.add('$s/$d'),
      );
      await tap(t, find.byKey(const ValueKey('fund-screen-divergence')));
      expect(find.byKey(const ValueKey('fund-row-DIV')), findsOneWidget);
      expect(find.byKey(const ValueKey('fund-row-ACC')), findsNothing);
      expect(find.textContaining('Cash-flow margin fell.'), findsOneWidget);
      await tap(t, find.text('Evaluate the price'));
      expect(opened, ['DIV/value']);
      await tap(t, find.text('Read financials & guidance'));
      expect(opened.last, 'DIV/financials');
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('search empty reset and price filter remain functional', (
    t,
  ) async {
    await mount(t, FundamentalApi());
    await t.enterText(
      find.byKey(const ValueKey('fundamental-search')),
      'nothing',
    );
    await t.pumpAndSettle();
    expect(find.text('No companies meet these conditions.'), findsOneWidget);
    await tap(t, find.text('Reset filters'));
    await tap(t, find.text('Price below model value'));
    expect(find.byKey(const ValueKey('fund-row-ACC')), findsOneWidget);
    expect(find.byKey(const ValueKey('fund-row-MISS')), findsNothing);
  });
  for (final language in AppLanguage.values) {
    testWidgets('mobile navigation and evidence $language', (t) async {
      await mount(
        t,
        FundamentalApi(),
        width: 390,
        language: language,
        scale: 1.2,
      );
      await tap(t, find.byKey(const ValueKey('fund-row-ACC')));
      expect(
        find.text(language == AppLanguage.en ? 'THE BUSINESS CHECK' : '经营变化核验'),
        findsOneWidget,
      );
      await tap(
        t,
        find.text(language == AppLanguage.en ? 'Back to results' : '返回筛选结果'),
      );
      expect(find.byKey(const ValueKey('fund-row-ACC')), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('wrong date and network error fail closed with retry', (t) async {
    final api = FundamentalApi()..wrongDate = true;
    await mount(t, api);
    expect(find.text('Retry financial data'), findsOneWidget);
    expect(find.byKey(const ValueKey('fund-row-ACC')), findsNothing);
    api.wrongDate = false;
    await tap(t, find.text('Retry financial data'));
    expect(find.byKey(const ValueKey('fund-row-ACC')), findsOneWidget);
  });
  testWidgets(
    'detail failure is independent; selection restores from research',
    (t) async {
      final api = FundamentalApi()..detailFail = true;
      await mount(
        t,
        api,
        selection: {
          'screen': 'divergence',
          'ticker': 'DIV',
          'detailTab': 'financials',
        },
      );
      expect(find.text('Retry quarter history'), findsOneWidget);
      expect(find.byKey(const ValueKey('fund-row-DIV')), findsOneWidget);
      api.detailFail = false;
      await tap(t, find.text('Retry quarter history'));
      expect(find.text('DIV · Quarterly evidence'), findsOneWidget);
    },
  );
  testWidgets(
    'stale list response after date switch cannot overwrite the current cutoff',
    (t) async {
      final api = FundamentalApi()..pending = Completer<Map<String, dynamic>>();
      t.view.physicalSize = const Size(1450, 1100);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      Widget app(String date) => MaterialApp(
        home: LanguageScope(
          language: AppLanguage.en,
          child: Scaffold(
            body: SingleChildScrollView(
              child: FundamentalsPanel(
                api: api,
                palette: Palette(false),
                asOf: date,
                onCompany: (_, _) {},
              ),
            ),
          ),
        ),
      );
      await t.pumpWidget(app('2026-06-01'));
      await t.pump();
      final old = api.pending!;
      api.pending = null;
      await t.pumpWidget(app('2026-08-28'));
      await t.pumpAndSettle();
      old.complete(api.response('2026-06-01'));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('fund-row-ACC')), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
}
