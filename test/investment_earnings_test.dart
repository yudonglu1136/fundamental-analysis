import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';

class EarningsApi extends ApiClient {
  EarningsApi() : super(() => 'fixture');
  final reads = <String>[];
  bool fail = false, wrong = false, empty = false;
  Completer<Map<String, dynamic>>? pending;
  Map<String, dynamic> response(
    String period, {
    String ticker = 'TEST',
    String asOf = '2026-08-28',
  }) => {
    'ticker': ticker,
    'asOf': asOf,
    'periods': empty
        ? []
        : [
            {'period': '2026-Q2', 'availableAt': '2026-07-20'},
            {'period': '2026-Q1', 'availableAt': '2026-04-20'},
            {'period': '2025-Q4', 'availableAt': '2026-01-20'},
          ],
    'selected': empty
        ? null
        : {
            'period': period,
            'periodEnd': '2026-06-30',
            'availableAt': '2026-07-20',
            'previousPeriod': '2026-Q1',
            'currency': 'USD',
            'metrics': [
              for (final key in [
                'revenueGrowth',
                'operatingMargin',
                'fcfMargin',
                'capexIntensity',
              ])
                {'key': key, 'value': .2, 'previous': .15, 'delta': .05},
            ],
            'model': {'value': 110, 'previous': 100, 'delta': 10},
            'guidance': [
              {
                'excerpt': 'Synthetic guidance $period',
                'speaker': 'Fixture CFO',
                'observedAt': '2026-07-20',
                'url': 'https://example.com/fixture',
              },
            ],
            'coverage': {
              'status': period == '2026-Q1'
                  ? 'has_qa'
                  : 'transcript_not_in_source',
              'callDate': '2026-07-20',
            },
            'qa': period != '2026-Q1'
                ? []
                : [
                    {
                      'question': 'Synthetic analyst question?',
                      'answer': 'Synthetic management response.',
                      'questionZh': '测试分析师问题？',
                      'answerZh': '测试管理层回答。',
                      'askedBy': 'Fixture analyst',
                      'askedByZh': '测试分析师',
                      'callDate': '2026-04-20',
                      'url': 'https://example.com/fixture',
                    },
                  ],
          },
  };
  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    reads.add(path);
    if (fail) throw StateError('fixture');
    if (pending != null) {
      final p = pending!;
      pending = null;
      return p.future;
    }
    final q = Uri.parse(path).queryParameters;
    return response(
      q['period'] ?? '2026-Q2',
      ticker: wrong ? 'WRONG' : 'TEST',
      asOf: q['asOf']!,
    );
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) => throw StateError('Must never write');
}

Future<void> mount(
  WidgetTester t,
  EarningsApi api, {
  Size size = const Size(1280, 900),
  AppLanguage lang = AppLanguage.en,
  String asOf = '2026-08-28',
  List<Map<String, dynamic>> history = const [],
  VoidCallback? onOpenValuation,
  double textScale = 1,
}) async {
  t.view.physicalSize = size;
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  await t.pumpWidget(
    MaterialApp(
      home: LanguageScope(
        language: lang,
        child: Scaffold(
          body: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
            child: SingleChildScrollView(
              child: EarningsResearchPanel(
                api: api,
                ticker: 'TEST',
                asOf: asOf,
                palette: Palette(false),
                history: history,
                onOpenValuation: onOpenValuation,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await t.pumpAndSettle();
}

Future<void> tapVisible(WidgetTester t, Finder f) async {
  await t.ensureVisible(f);
  await t.tap(f);
  await t.pumpAndSettle();
}

void main() {
  test(
    'quarter preview binds exact fiscal period, publication node and cutoff',
    () {
      final history = <Map<String, dynamic>>[
        {
          'period': '2026-Q1',
          'availableAt': '2026-04-20',
          'publishedFairValue': 90,
        },
        {
          'period': '2026-Q1',
          'availableAt': '2026-04-25',
          'publishedFairValue': 100,
        },
        {
          'period': '2026-Q2',
          'availableAt': '2026-07-20',
          'publishedFairValue': 110,
        },
      ];
      final q = {'period': '2026-Q1', 'availableAt': '2026-04-20'};
      expect(
        earningsBookObservation(history, q, '2026-08-28')['publishedFairValue'],
        90,
      );
      expect(earningsBookObservation(history, q, '2026-04-19'), isEmpty);
      expect(
        earningsBookObservation(history, {
          'period': '2026-Q1',
          'availableAt': '2026-04-21',
        }, '2026-08-28'),
        isEmpty,
      );
    },
  );
  for (final lang in AppLanguage.values) {
    testWidgets(
      'phone large type keeps timeline, detail and valuation action reachable $lang',
      (t) async {
        var opens = 0;
        final api = EarningsApi();
        await mount(
          t,
          api,
          size: const Size(390, 844),
          lang: lang,
          textScale: 1.5,
          onOpenValuation: () => opens++,
        );
        expect(t.takeException(), isNull);
        await tapVisible(
          t,
          find.byKey(const ValueKey('earnings-select-2026-Q1')),
        );
        expect(api.reads.last, contains('period=2026-Q1'));
        await tapVisible(
          t,
          find.byKey(const ValueKey('earnings-open-valuation')),
        );
        expect(opens, 1);
        expect(t.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'timeline shows real quarter-specific metrics and selection is read-only',
    (t) async {
      final api = EarningsApi();
      await mount(
        t,
        api,
        history: [
          {
            'period': '2026-Q2',
            'availableAt': '2026-07-20',
            'metrics': {'revenueGrowth': .2573, 'fcfMargin': .0776},
          },
          {
            'period': '2026-Q1',
            'availableAt': '2026-04-20',
            'metrics': {'revenueGrowth': .1692, 'fcfMargin': .0893},
          },
        ],
      );
      expect(find.text('25.73%'), findsOneWidget);
      expect(find.text('16.92%'), findsOneWidget);
      final reads = api.reads.length;
      await tapVisible(
        t,
        find.byKey(const ValueKey('earnings-select-2026-Q2')),
      );
      expect(api.reads.length, reads);
      await tapVisible(
        t,
        find.byKey(const ValueKey('earnings-select-2026-Q1')),
      );
      expect(api.reads.last, contains('period=2026-Q1'));
    },
  );
  for (final lang in AppLanguage.values) {
    for (final size in [
      const Size(1487, 1058),
      const Size(1280, 720),
      const Size(390, 844),
    ]) {
      testWidgets(
        'quarter recap guidance Q&A and portrait-safe layout $lang $size',
        (t) async {
          final api = EarningsApi();
          await mount(t, api, size: size, lang: lang);
          expect(find.text('\$110.00'), findsOneWidget);
          await tapVisible(
            t,
            find.byKey(const ValueKey('earnings-tab-guidance')),
          );
          expect(find.text('Synthetic guidance 2026-Q2'), findsOneWidget);
          await tapVisible(t, find.byKey(const ValueKey('earnings-tab-qa')));
          expect(
            find.text(
              lang == AppLanguage.en ? 'Read available guidance' : '查看已有指引',
            ),
            findsOneWidget,
          );
          await tapVisible(
            t,
            find.byTooltip(
              lang == AppLanguage.en ? 'Previous quarter' : '上一季度',
            ),
          );
          await tapVisible(
            t,
            find.byKey(const ValueKey('earnings-question-2026-Q1-0')),
          );
          expect(
            find.text(
              lang == AppLanguage.en
                  ? 'Synthetic management response.'
                  : '测试管理层回答。',
            ),
            findsOneWidget,
          );
          expect(api.reads.last, contains('period=2026-Q1'));
          expect(api.reads.every((r) => r.contains('asOf=2026-08-28')), isTrue);
          expect(t.takeException(), isNull);
        },
      );
    }
  }
  testWidgets('year jump selects the latest available quarter in that year', (
    t,
  ) async {
    final api = EarningsApi();
    await mount(t, api);
    await tapVisible(t, find.byType(DropdownButtonFormField<String>));
    await tapVisible(t, find.text('2025').last);
    expect(api.reads.last, contains('period=2025-Q4'));
    await tapVisible(t, find.text('Latest'));
    expect(api.reads.last, isNot(contains('&period=')));
  });
  testWidgets('failed quarter hides stale results and retry keeps selection', (
    t,
  ) async {
    final api = EarningsApi();
    await mount(t, api);
    api.fail = true;
    await tapVisible(t, find.byTooltip('Previous quarter'));
    expect(find.text('\$110.00'), findsNothing);
    expect(find.byKey(const ValueKey('earnings-retry')), findsOneWidget);
    api.fail = false;
    await tapVisible(t, find.byKey(const ValueKey('earnings-retry')));
    expect(api.reads.last, contains('period=2026-Q1'));
    expect(find.text('\$110.00'), findsOneWidget);
  });
  testWidgets('late quarter response cannot replace newer selection', (
    t,
  ) async {
    final api = EarningsApi();
    await mount(t, api);
    final delayed = Completer<Map<String, dynamic>>();
    api.pending = delayed;
    await t.tap(find.byKey(const ValueKey('earnings-select-2026-Q1')));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('earnings-select-2026-Q2')));
    await t.pumpAndSettle();
    delayed.complete(api.response('2026-Q1'));
    await t.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('earnings-quarter-2026-Q2')),
      findsOneWidget,
    );
  });
  testWidgets('identity mismatch fails closed and empty coverage stays empty', (
    t,
  ) async {
    final api = EarningsApi()..wrong = true;
    await mount(t, api);
    expect(find.byKey(const ValueKey('earnings-retry')), findsOneWidget);
    api.wrong = false;
    api.empty = true;
    await tapVisible(t, find.byKey(const ValueKey('earnings-retry')));
    expect(
      find.textContaining('No quarterly research is stored'),
      findsOneWidget,
    );
    expect(find.text('\$110.00'), findsNothing);
  });
}
