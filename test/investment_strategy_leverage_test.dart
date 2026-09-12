import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';
import 'investment_strategy_lab_test.dart' as lab;

class LeverageApi extends lab.StrategyApi {
  final gets = <String>[];
  Map<String, dynamic>? saved;
  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    gets.add(path);
    return {
      ...await super.getJson(path),
      if (saved != null) 'saved': [saved!],
    };
  }

  @override
  Map<String, dynamic> response(Map<String, dynamic> rules) {
    final base = super.response(rules);
    return {
      ...base,
      'results': {
        ...base['results'],
        if (rules['leverage']['multiple'] > 1)
          'leveraged': {
            ...base['results']['blend'],
            'financing': {
              'annualRate': .04,
              'interestPaid': .01,
              'costPaid': .002,
            },
            'trades': [
              {
                'date': '2026-08-01',
                'riskyWeight': 1.5,
                'borrowed': .5,
                'interestSincePriorRebalance': 0,
              },
            ],
          },
      },
    };
  }
}

void main() {
  testWidgets(
    'Leverage is fourth, affects run/save, preserves 1x and exposes financing',
    (t) async {
      final api = LeverageApi();
      await lab.mount(t, api, size: const Size(1800, 1100));
      expect(find.text('Add a hedge'), findsNothing);
      expect(find.text('Financing rate · 4% / year'), findsOneWidget);
      final cta = t.getTopLeft(find.text('Add a CTA sleeve')),
          fourth = t.getTopLeft(find.text('Add leverage'));
      expect(fourth.dx, greaterThan(cta.dx));
      expect(fourth.dy, closeTo(cta.dy, 5));
      await t.tap(find.byKey(const ValueKey('leverage-1.5')));
      await t.pumpAndSettle();
      expect(api.posts, isEmpty);
      expect(api.gets.any((p) => p.contains('hedge')), isFalse);
      await lab.choose(t);
      await lab.tap(t, 'Run backtest');
      expect(api.posts.last['leverage'], {
        'multiple': 1.5,
        'annualRate': .04,
        'reset': 'filing',
      });
      expect(api.posts.last.containsKey('hedge'), isFalse);
      expect(find.text('Leverage after financing costs'), findsOneWidget);
      expect(find.text('Leveraged · 1.50×'), findsWidgets);
      expect(find.text('Your blend · 1×'), findsWidgets);
      await lab.tap(t, 'Borrowing & interest ledger');
      expect(find.textContaining('loan / initial'), findsOneWidget);
      await lab.tap(t, 'Save rules');
      await lab.tap(t, 'Save');
      expect(api.posts.last['path'], '/api/investment/strategy-rules');
      expect(api.posts.last['leverage']['multiple'], 1.5);
      await t.ensureVisible(find.byKey(const ValueKey('leverage-1.0')));
      await t.tap(find.byKey(const ValueKey('leverage-1.0')));
      await t.pumpAndSettle();
      expect(
        find.text('Rules changed — run again to update results.'),
        findsOneWidget,
      );
      await lab.tap(t, 'Run backtest');
      expect(find.text('Leverage after financing costs'), findsNothing);
      expect(t.takeException(), isNull);
    },
  );
  for (final language in [AppLanguage.en, AppLanguage.zh]) {
    testWidgets('leverage fits 390px at 150% in $language', (t) async {
      await lab.mount(
        t,
        LeverageApi(),
        size: const Size(390, 844),
        scale: 1.5,
        language: language,
      );
      await t.ensureVisible(find.byKey(const ValueKey('leverage-2.0')));
      await t.tap(find.byKey(const ValueKey('leverage-2.0')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('strategy-leverage-step')), findsOneWidget);
      expect(find.text('2.00×'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
  for (final legacy in [false, true]) {
    testWidgets(
      'restore ${legacy ? 'legacy hedge without mutating it' : 'saved leverage'}',
      (t) async {
        final api = LeverageApi();
        api.saved = {
          'name': 'Saved fixture',
          'rules': {
            'managers': ['bill-ackman'],
            'topN': 5,
            'valuationEnabled': true,
            'maxPremium': .3,
            'excludedAllocation': 'redistribute',
            'cta': 'KMLM',
            'ctaWeight': .3,
            'costBps': 10,
            'start': '2025-08-28',
            'end': '2026-08-28',
            'asOf': '2026-08-28',
            if (legacy)
              'hedge': {'type': 'put_spread'}
            else
              'leverage': {
                'multiple': 1.5,
                'annualRate': .04,
                'reset': 'filing',
              },
          },
        };
        await lab.mount(t, api);
        await lab.tap(t, 'Saved fixture');
        expect(find.text(legacy ? '1.00×' : '1.50×'), findsOneWidget);
        expect(api.posts, isEmpty);
        if (legacy) {
          expect(
            find.textContaining('Legacy hedge rules retained'),
            findsOneWidget,
          );
        }
        expect(t.takeException(), isNull);
      },
    );
  }
  test(
    'numeric equality detects leverage changes but accepts JSON int/double',
    () {
      expect(
        strategyRuleValueEqual({'multiple': 1}, {'multiple': 1.0}),
        isTrue,
      );
      expect(
        strategyRuleValueEqual({'multiple': 1}, {'multiple': 1.5}),
        isFalse,
      );
    },
  );
}
