import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';
import 'investment_explorer_test.dart' as explorer;

class LensApi extends explorer.ExplorerApi {
  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    final result = await super.getJson(path);
    if (path.startsWith('/api/investment/opportunities?')) {
      final rows = result['rows'] as List;
      final row = rows.first as Map;
      row['medianWeight'] = .12;
      row['valuation'] = {
        'trend': explorer.trendFixture(),
        'revenueGrowth': .3,
        'change': .1,
        'modelRoute': 'operating_company',
        'fairValue': 33,
        'previousFairValue': 30,
        'currency': 'USD',
        'date': '2026-05-15',
        'previousDate': '2026-02-15',
        'comparable': true,
      };
      row['managers'] = [
        for (final (id, action, previous, delta, weight) in [
          ('alpha', 'increased', 100, 50, .3),
          ('bravo', 'new', 0, 10, .01),
          ('charlie', 'increased', 100, 20, .1),
          ('delta', 'increased', 200, 40, .08),
          ('echo', 'reduced', 100, -50, .2),
          ('foxtrot', 'sold_out', 100, -100, 0.0),
        ])
          {
            'guruId': id,
            'name': '$id manager',
            'action': action,
            'previousShares': previous,
            'changeShares': delta,
            'shares': previous + delta,
            'weight': weight,
            'comparisonStatus': 'corporate_action_unverified',
            'availableAt': '2026-05-15',
            'reportDate': '2026-03-31',
            'accession': '$id-fixture',
          },
      ];
    }
    if (path.contains('/research/')) {
      (result['snapshot'] as Map)['availableAt'] = '2026-05-15';
      result['history'] = [
        {
          'availableAt': '2026-02-15',
          'period': '2025-Q4',
          'publishedFairValue': 30,
        },
        {
          'availableAt': '2026-05-15',
          'period': '2026-Q1',
          'publishedFairValue': 33,
        },
      ];
      result['metrics'] = [
        {'key': 'revenueGrowth', 'value': .3, 'previous': .2},
        {'key': 'operatingMargin', 'value': .3, 'previous': .28},
        {'key': 'fcfMargin', 'value': .18, 'previous': .22},
        {'key': 'capexIntensity', 'value': .05, 'previous': null},
      ];
    }
    return result;
  }
}

void main() {
  test(
    'manager sides are mutually exclusive, sorted by weight, null-safe and immutable',
    () {
      final rows = [
        {'name': 'B', 'action': 'new', 'weight': null},
        {'name': 'A', 'action': 'increased', 'weight': .2},
        {'name': 'C', 'action': 'sold_out', 'weight': 0},
        {'name': 'D', 'action': 'mixed_claims', 'weight': .5},
      ];
      expect(discoverManagerSide(rows, additions: true).map((m) => m['name']), [
        'A',
        'B',
      ]);
      expect(discoverManagerSide(rows, additions: false).single['name'], 'C');
      expect(rows.first['name'], 'B');
      expect(
        discoverShareChange({'previousShares': 100, 'changeShares': -50}),
        -.5,
      );
      expect(
        discoverShareChange({'previousShares': 0, 'changeShares': 100}),
        isNull,
      );
      expect(discoverShareChange({'previousShares': 100}), isNull);
    },
  );

  for (final size in [
    const Size(1487, 1058),
    const Size(1280, 720),
    const Size(390, 844),
  ]) {
    for (final language in AppLanguage.values) {
      for (final lens in ['adds', 'growth', 'revision', 'debate']) {
        testWidgets('$lens distinct evidence at $size $language', (
          tester,
        ) async {
          final api = LensApi();
          await explorer.mountExplorer(
            tester,
            api,
            size: size,
            language: language,
          );
          if (size.width < 620) {
            final carousel = find.byKey(
              const ValueKey('discover-collection-carousel'),
            );
            await tester.ensureVisible(carousel);
            for (
              var i = 0;
              i < ['adds', 'growth', 'revision', 'debate'].indexOf(lens);
              i++
            ) {
              await tester.drag(carousel, const Offset(-290, 0));
              await tester.pumpAndSettle();
            }
          }
          await explorer.tapKey(tester, 'discover-collection-$lens');
          await explorer.tapKey(tester, 'discover-candidate-TEST');
          expect(find.byKey(ValueKey('discover-lens-$lens')), findsOneWidget);
          for (final other in [
            'adds',
            'growth',
            'revision',
            'debate',
          ].where((v) => v != lens)) {
            expect(find.byKey(ValueKey('discover-lens-$other')), findsNothing);
          }
          expect(tester.takeException(), isNull);
          if (lens == 'adds' || lens == 'debate') {
            expect(
              find.byKey(const ValueKey('lens-adding-managers')),
              findsOneWidget,
            );
            expect(
              find.byKey(const ValueKey('lens-reducing-managers')),
              lens == 'debate' ? findsOneWidget : findsNothing,
            );
            expect(find.textContaining('+50.00%'), findsOneWidget);
            expect(
              find.textContaining(
                language == AppLanguage.en
                    ? 'corporate-action adjustments'
                    : '公司行动调整',
              ),
              findsWidgets,
            );
          }
          if (lens == 'growth') {
            expect(
              find.textContaining(
                language == AppLanguage.en ? 'FCF margin fell' : '自由现金流率下降',
              ),
              findsOneWidget,
            );
            expect(find.text('-4.00'), findsOneWidget);
          }
          if (lens == 'revision') {
            expect(find.byType(SteadyValueChart), findsOneWidget);
            await explorer.tapKey(tester, 'latest-value-revision');
            expect(find.text(r'$33.00'), findsOneWidget);
            expect(
              find.textContaining(
                language == AppLanguage.en
                    ? 'not a per-share contribution bridge'
                    : '不是逐项金额归因',
              ),
              findsOneWidget,
            );
          }
          final action = find.byKey(ValueKey('lens-$lens-research'));
          await tester.ensureVisible(action);
          expect(tester.takeException(), isNull);
          expect(api.calls, isEmpty); // Inspection never writes a decision.
        });
      }
    }
  }

  testWidgets(
    'switching lens on the same ticker changes evidence, not only selected styling',
    (tester) async {
      await explorer.mountExplorer(tester, LensApi());
      for (final lens in ['adds', 'growth', 'revision', 'debate', 'debate']) {
        await explorer.tapKey(tester, 'discover-collection-$lens');
        expect(find.byKey(ValueKey('discover-lens-$lens')), findsOneWidget);
        expect(find.text('TEST'), findsWidgets);
      }
      await explorer.tapKey(tester, 'lens-managers-more-adds');
      expect(find.byKey(const ValueKey('lens-manager-bravo')), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'growth CTA opens financial evidence and returns to its exact lens',
    (tester) async {
      await explorer.mountExplorer(tester, LensApi());
      await explorer.tapKey(tester, 'discover-collection-growth');
      await explorer.tapKey(tester, 'lens-growth-research');
      expect(find.text('Quarterly research'), findsOneWidget);
      final back = find.text('Back to candidates');
      await tester.ensureVisible(back);
      await tester.tap(back);
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('discover-lens-growth')),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'missing company model does not invent growth analysis or offer model CTA',
    (tester) async {
      final api = LensApi()..failure = 'missing';
      await explorer.mountExplorer(tester, api);
      await explorer.tapKey(tester, 'discover-collection-growth');
      expect(
        find.textContaining('Detailed model evidence is unavailable'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('lens-growth-research')), findsNothing);
      expect(find.textContaining('FCF margin fell'), findsNothing);
    },
  );
}
