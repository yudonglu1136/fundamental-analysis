import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';

// Synthetic fixtures only; production never reads these examples.
class FlowApi extends ApiClient {
  FlowApi() : super(() => 'test');
  bool fail = false, wrongDate = false;
  int calls = 0;
  Completer<Map<String, dynamic>>? pending;
  Map<String, dynamic> response(String date) => {
    'version': 'value-flow-v1',
    'asOf': date,
    'coverage': {'total': 3, 'financial': 2, 'comparable': 2},
    'taxonomy': {'version': '2026-08-14'},
    'guruCoverage': {'reportDate': '2026-06-30'},
    'layers': [
      for (final l in [
        ('compute_silicon', 'Compute chips', '计算芯片'),
        ('cloud_compute', 'Cloud / compute', '云/算力'),
      ])
        {
          'id': l.$1,
          'order': 1,
          'name': {'en': l.$2, 'zh': l.$3},
          'description': {'en': 'Fixture stage description.', 'zh': '测试环节说明。'},
          'total': 2,
          'financialCount': 1,
          'comparableCount': 1,
          'medianGrowth': .2,
          'positiveGrowth': 1,
        },
    ],
    'companies': [
      row('NVDA', 'compute_silicon', .2, .1),
      row('AMD', 'compute_silicon', -.1, -.2),
      row('MISS', 'cloud_compute', null, null),
    ],
  };
  Map<String, dynamic> row(
    String ticker,
    String layer,
    double? growth,
    double? gap,
  ) => {
    'ticker': ticker,
    'name': '$ticker fixture company',
    'layer': layer,
    'role': {'en': 'Test company role.', 'zh': '测试公司角色。'},
    'period': growth == null ? null : '2026-Q2',
    'availableAt': '2026-08-01',
    'metrics': {
      'revenueGrowth': growth,
      'operatingMargin': .2,
      'fcfMargin': .1,
    },
    'changes': {'revenueGrowth': .1},
    'price': {'value': 100, 'currency': 'USD', 'date': '2026-08-28'},
    'valuation': {
      'fairValue': gap == null ? null : 110,
      'currency': 'USD',
      'date': '2026-08-01',
    },
    'modelGap': gap,
    'status': growth == null ? 'no_model' : 'available',
    'source': growth == null
        ? null
        : {'dataset': 'SYNTHETIC ONLY', 'modelVersion': 'test'},
    'holders': ticker != 'NVDA'
        ? []
        : [
            {
              'guruId': 'test-guru',
              'name': 'Fixture Manager',
              'avatar': '',
              'reportDate': '2026-06-30',
            },
          ],
  };
  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    calls++;
    if (fail) throw StateError('test offline');
    if (pending != null) return pending!.future;
    return response(
      wrongDate ? '2026-01-01' : Uri.parse(path).queryParameters['asOf']!,
    );
  }
}

Future<void> mount(
  WidgetTester t,
  FlowApi api, {
  double width = 1320,
  double scale = 1,
  AppLanguage lang = AppLanguage.en,
  String date = '2026-08-28',
  void Function(String, String)? open,
  ValueChanged<String>? guru,
}) async {
  t.view.physicalSize = Size(width, 1100);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  await t.pumpWidget(
    MaterialApp(
      theme: ThemeData.dark(),
      home: LanguageScope(
        language: lang,
        child: Scaffold(
          body: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(scale)),
            child: SingleChildScrollView(
              child: ValueFlowPanel(
                api: api,
                palette: Palette(false),
                asOf: date,
                onCompany: open ?? (_, _) {},
                onGuru: guru ?? (_) {},
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await t.pumpAndSettle();
}

Future<void> tap(WidgetTester t, Finder finder) async {
  await t.ensureVisible(finder);
  await t.tap(finder);
  await t.pumpAndSettle();
}

void main() {
  test('stage/search/value screens and null-last signed sorting', () {
    final rows =
        FlowApi().response('2026-08-28')['companies']
            as List<Map<String, dynamic>>;
    expect(
      filterValueFlowCompanies(
        rows,
        stage: 'compute_silicon',
      ).map((r) => r['ticker']),
      ['NVDA', 'AMD'],
    );
    expect(
      filterValueFlowCompanies(
        rows,
        stage: 'compute_silicon',
        belowValue: true,
      ).map((r) => r['ticker']),
      ['NVDA'],
    );
    expect(
      filterValueFlowCompanies(
        rows,
        stage: 'compute_silicon',
        query: 'miss',
      ).single['ticker'],
      'MISS',
    );
    expect(
      filterValueFlowCompanies(rows, stage: 'cloud_compute', belowValue: true),
      isEmpty,
    );
  });
  testWidgets(
    'stage selection reveals missing models instead of a wrong stock',
    (t) async {
      await mount(t, FlowApi());
      await tap(t, find.text('Cloud / compute').first);
      expect(find.text('MISS'), findsWidgets);
      expect(find.textContaining('No dated model'), findsOneWidget);
      final button = t.widget<FilledButton>(
        find.byKey(const ValueKey('value-flow-open-valuation')),
      );
      expect(button.onPressed, isNull);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'stock selection routes exact company and section; avatars open exact Guru',
    (t) async {
      final opened = <String>[], gurus = <String>[];
      await mount(
        t,
        FlowApi(),
        open: (s, section) => opened.add('$s:$section'),
        guru: gurus.add,
      );
      await tap(t, find.byKey(const ValueKey('value-flow-open-valuation')));
      expect(opened, ['NVDA:value']);
      await tap(t, find.text('Read the quarterly evidence'));
      expect(opened.last, 'NVDA:financials');
      await tap(t, find.text('Fixture Manager'));
      expect(gurus, ['test-guru']);
      await tap(t, find.byKey(const ValueKey('value-flow-company-AMD')));
      await tap(t, find.byKey(const ValueKey('value-flow-open-valuation')));
      expect(opened.last, 'AMD:value');
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('global search, empty reset, below-value filter', (t) async {
    await mount(t, FlowApi());
    await tap(t, find.text('Below model value'));
    expect(find.byKey(const ValueKey('value-flow-company-AMD')), findsNothing);
    await t.enterText(find.byType(TextField), 'XYZ');
    await t.pumpAndSettle();
    expect(find.text('No companies match these filters.'), findsOneWidget);
    await tap(t, find.text('Reset search & filters'));
    expect(
      find.byKey(const ValueKey('value-flow-company-AMD')),
      findsOneWidget,
    );
    await t.enterText(find.byType(TextField), 'MISS');
    await t.pumpAndSettle();
    expect(find.text('Search across the value chain'), findsOneWidget);
    expect(find.textContaining('No dated model'), findsOneWidget);
  });
  testWidgets('error retry and mismatched date guard', (t) async {
    final api = FlowApi()..fail = true;
    await mount(t, api);
    expect(find.text('The value chain could not be loaded.'), findsOneWidget);
    api.fail = false;
    await tap(t, find.text('Retry value chain'));
    expect(find.text('AI value chain'), findsOneWidget);
    api.wrongDate = true;
    await mount(t, api, date: '2026-06-01');
    expect(find.text('The value chain could not be loaded.'), findsOneWidget);
    expect(find.text('NVDA'), findsNothing);
  });
  for (final lang in [AppLanguage.en, AppLanguage.zh]) {
    testWidgets('390px ${lang.name} with 150% text has no overflow', (t) async {
      await mount(t, FlowApi(), width: 390, scale: 1.5, lang: lang);
      await tap(t, find.byKey(const ValueKey('value-flow-company-AMD')));
      await tap(t, find.byKey(const ValueKey('value-flow-open-valuation')));
      expect(t.takeException(), isNull);
    });
  }
  testWidgets(
    'a late response from a prior date cannot replace the new snapshot',
    (t) async {
      final api = FlowApi();
      await mount(t, api);
      final pending = Completer<Map<String, dynamic>>();
      api.pending = pending;
      // Mounted date change starts a request, then a newer request supersedes it.
      Future<void> replace(String date) async {
        await t.pumpWidget(
          MaterialApp(
            home: LanguageScope(
              language: AppLanguage.en,
              child: Scaffold(
                body: SingleChildScrollView(
                  child: ValueFlowPanel(
                    api: api,
                    palette: Palette(false),
                    asOf: date,
                    onCompany: (_, _) {},
                    onGuru: (_) {},
                  ),
                ),
              ),
            ),
          ),
        );
        await t.pump();
      }

      await replace('2026-06-01');
      api.pending = null;
      await replace('2026-08-28');
      await t.pumpAndSettle();
      pending.complete(api.response('2026-06-01'));
      await t.pumpAndSettle();
      expect(
        find.textContaining('financial evidence available by 2026-08-28'),
        findsOneWidget,
      );
      expect(find.text('The value chain could not be loaded.'), findsNothing);
    },
  );
}
