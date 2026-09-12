import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';
import 'investment_fundamentals_test.dart' show FundamentalApi, mount, tap;

class ShortlistApi extends FundamentalApi {
  final calls = <String>[];
  bool guruFail = false, wrongGuru = false;
  Completer<Map<String, dynamic>>? guruPending;
  Map<String, dynamic> gurus(String ticker, String date, String quarter) => {
    'version': 'fundamental-guru-quarter-v1',
    'ticker': wrongGuru ? 'WRONG' : ticker,
    'asOf': date,
    'reportDate': quarter,
    'quarters': ['2026-03-31', '2025-12-31'],
    'coverage': {
      'eligibleManagers': 3,
      'reportedManagers': 2,
      'extractedBooks': quarter == '2025-12-31' ? 2 : 0,
    },
    'managerCount': 1,
    'adds': quarter == '2026-03-31' ? 1 : 0,
    'trims': quarter == '2025-12-31' ? 1 : 0,
    'managers': [
      {
        'ticker': ticker,
        'guruId': 'bill-ackman',
        'name': 'Bill Ackman',
        'reportDate': quarter,
        'availableAt': quarter == '2026-03-31' ? '2026-05-15' : '2026-02-15',
        'action': quarter == '2026-03-31' ? 'increased' : 'reduced',
        'shares': 1000.0,
        'changeShares': quarter == '2026-03-31' ? 100.0 : -200.0,
        'weight': .12,
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    calls.add(path);
    final uri = Uri.parse(path);
    if (uri.path.endsWith('/gurus')) {
      if (guruFail) throw StateError('offline');
      if (guruPending != null) return guruPending!.future;
      return gurus(
        uri.pathSegments[3],
        uri.queryParameters['asOf']!,
        uri.queryParameters['quarter'] ?? '2026-03-31',
      );
    }
    return super.getJson(path);
  }
}

void main() {
  test(
    'combined rules require selected factors; null is unknown, not a zero pass',
    () {
      const r = FundamentalRules();
      final row = {
        'metrics': {
          'revenueGrowth': .15,
          'operatingMargin': .10,
          'fcfMargin': .05,
        },
      };
      expect(r.accepts(row), true);
      expect(r.hits(row), 3);
      final missing = {
        'metrics': {
          'revenueGrowth': .15,
          'operatingMargin': .10,
          'fcfMargin': null,
        },
      };
      expect(r.check(missing)['cash'], null);
      expect(r.accepts(missing), false);
      expect(r.copyWith(requireAll: false).accepts(missing), true);
      expect(r.copyWith(cash: 0).accepts(missing), false);
      expect(r.copyWith(factors: {}).accepts(missing), true);
      expect(
        r.accepts({
          'metrics': {
            'revenueGrowth': double.nan,
            'operatingMargin': double.infinity,
          },
        }),
        false,
      );
    },
  );
  test(
    'positive growth is separate from strict improvement and quality completeness',
    () {
      final row = {
        'metrics': {
          'revenueGrowth': .2,
          'operatingMargin': .2,
          'fcfMargin': .1,
        },
        'changes': {
          'revenueGrowth': .01,
          'operatingMargin': .02,
          'fcfMargin': 0,
        },
      };
      const r = FundamentalRules(improving: true);
      expect(r.accepts(row), false);
      expect(r.copyWith(improving: false).accepts(row), true);
      expect(
        r
            .copyWith(improving: false, factors: {'quality'})
            .check(row)['quality'],
        null,
      );
      expect(
        r.copyWith(improving: false, factors: {'quality'}).accepts(row),
        false,
      );
    },
  );
  test(
    'restored rules validate bounds and the exact filter list reconciles',
    () {
      final restored = FundamentalRules.restore({
        'growth': -1,
        'margin': double.infinity,
        'years': 4,
        'factors': ['growth', 'fake'],
        'requireAll': false,
      });
      expect(restored.growth, .15);
      expect(restored.margin, .1);
      expect(restored.years, 5);
      expect(restored.factors, {'growth'});
      final rows = asList(FundamentalApi().response('2026-06-01')['companies']);
      final r = const FundamentalRules().copyWith(improving: true);
      expect(
        filterFundamentals(
          rows,
          screen: 'combined',
          rules: r,
          sort: 'matches',
        ).map((e) => e['ticker']),
        ['ACC'],
      );
      expect(FundamentalRules.restore(r.json).json, r.json);
    },
  );
  testWidgets(
    'combined list changes with all/any, factors, threshold edits and missing quality',
    (t) async {
      await mount(t, ShortlistApi());
      expect(find.byKey(const ValueKey('fund-row-MISS')), findsNothing);
      await tap(t, find.byKey(const ValueKey('fund-improving')));
      expect(find.byKey(const ValueKey('fund-row-DIV')), findsNothing);
      await tap(t, find.byKey(const ValueKey('fund-match-any')));
      expect(find.byKey(const ValueKey('fund-row-DIV')), findsOneWidget);
      await tap(t, find.byKey(const ValueKey('fund-preset-quality')));
      await tap(t, find.byKey(const ValueKey('fund-match-all')));
      expect(find.text('No companies meet these conditions.'), findsOneWidget);
      await tap(t, find.byKey(const ValueKey('fund-factor-quality')));
      expect(find.byKey(const ValueKey('fund-row-ACC')), findsOneWidget);
      await tap(t, find.byKey(const ValueKey('fund-adjust')));
      final input = find.descendant(
        of: find.byKey(const ValueKey('fund-threshold-growth')),
        matching: find.byType(TextFormField),
      );
      await t.ensureVisible(input);
      await t.enterText(input, '50');
      await t.testTextInput.receiveAction(TextInputAction.done);
      await t.pumpAndSettle();
      expect(find.text('No companies meet these conditions.'), findsOneWidget);
      await t.enterText(input, '-5');
      await t.testTextInput.receiveAction(TextInputAction.done);
      await t.pumpAndSettle();
      expect(find.text('Enter 0–500'), findsOneWidget);
    },
  );
  testWidgets(
    'valuation, financial history and actual-quarter Guru evidence are distinct',
    (t) async {
      final api = ShortlistApi(), opened = <String>[];
      await mount(t, api, onCompany: (s, d) => opened.add('$s/$d'));
      expect(find.text('Why it is on your list'), findsOneWidget);
      await tap(t, find.byKey(const ValueKey('fund-detail-financials')));
      expect(find.text('ACC · Quarterly evidence'), findsOneWidget);
      await tap(t, find.byKey(const ValueKey('fund-detail-gurus')));
      expect(find.text('Bill Ackman'), findsOneWidget);
      expect(find.text('Increased'), findsOneWidget);
      await tap(t, find.byKey(const ValueKey('fund-guru-quarter-2026-03-31')));
      await tap(t, find.text('2025 Q4').last);
      expect(find.text('Reduced'), findsOneWidget);
      expect(api.calls.last, contains('quarter=2025-12-31'));
      await tap(t, find.byKey(const ValueKey('fund-row-DIV')));
      expect(
        api.calls.any(
          (p) => p.contains('/DIV/gurus?') && p.contains('2025-12-31'),
        ),
        true,
      );
      await tap(t, find.text('Evaluate the price'));
      expect(opened.last, 'DIV/value');
      await tap(t, find.text('Read financials & guidance'));
      expect(opened.last, 'DIV/financials');
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'Guru error and wrong identity do not show false no-holder conclusion',
    (t) async {
      final api = ShortlistApi()..guruFail = true;
      await mount(t, api);
      await tap(t, find.byKey(const ValueKey('fund-detail-gurus')));
      expect(find.text('Retry Guru evidence'), findsOneWidget);
      expect(find.text('0 hold'), findsNothing);
      api.guruFail = false;
      api.wrongGuru = true;
      await tap(t, find.text('Retry Guru evidence'));
      expect(find.text('Bill Ackman'), findsNothing);
      api.wrongGuru = false;
      await tap(t, find.text('Retry Guru evidence'));
      expect(find.text('Bill Ackman'), findsOneWidget);
    },
  );
  testWidgets(
    'late Guru response cannot replace another ticker and restored quarter is honoured',
    (t) async {
      final api = ShortlistApi()
        ..guruPending = Completer<Map<String, dynamic>>();
      await mount(t, api);
      await t.ensureVisible(find.byKey(const ValueKey('fund-detail-gurus')));
      await t.tap(find.byKey(const ValueKey('fund-detail-gurus')));
      await t.pump();
      final delayed = api.guruPending!;
      api.guruPending = null;
      await tap(t, find.byKey(const ValueKey('fund-row-DIV')));
      delayed.complete(api.gurus('ACC', '2026-06-01', '2026-03-31'));
      await t.pumpAndSettle();
      expect(find.text('Bill Ackman'), findsOneWidget);
      expect(find.text('DIV fixture company'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  for (final language in AppLanguage.values) {
    testWidgets('mobile Guru flow and restoration $language', (t) async {
      final api = ShortlistApi();
      await mount(
        t,
        api,
        width: 390,
        language: language,
        scale: 1.2,
        selection: {
          'ticker': 'DIV',
          'screen': 'combined',
          'detailTab': 'gurus',
          'guruQuarter': '2025-12-31',
        },
      );
      await tap(t, find.byKey(const ValueKey('fund-row-DIV')));
      expect(
        api.calls.any(
          (p) => p.contains('/DIV/gurus?') && p.contains('quarter=2025-12-31'),
        ),
        true,
      );
      expect(find.text('Bill Ackman'), findsOneWidget);
      await tap(t, find.byKey(const ValueKey('fund-detail-financials')));
      expect(t.takeException(), isNull);
    });
  }
}
