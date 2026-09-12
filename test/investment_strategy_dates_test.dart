import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';
import 'investment_strategy_lab_test.dart' as fixture;

class _DatedStrategyApi extends fixture.StrategyApi {
  String cutoff = '2026-09-11';
  Completer<void>? catalogGate;

  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    if (catalogGate != null) await catalogGate!.future;
    final result = await super.getJson(path);
    result['storage'] = {'cutoff': cutoff};
    return result;
  }
}

Future<void> selectDateRange(WidgetTester tester, DateTimeRange range) async {
  final button = find.widgetWithIcon(OutlinedButton, Icons.date_range);
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
  final picker = find.byType(DateRangePickerDialog);
  expect(picker, findsOneWidget);
  Navigator.of(tester.element(picker)).pop(range);
  await tester.pumpAndSettle();
}

void main() {
  test('only a valid earlier verified cutoff initializes the default end', () {
    expect(strategyDefaultEndDate('2026-09-12', '2026-09-11'), '2026-09-11');
    expect(strategyDefaultEndDate('2025-08-28', '2026-09-11'), '2025-08-28');
    for (final invalid in [null, '', 'tomorrow', '2026-02-30']) {
      expect(strategyDefaultEndDate('2026-09-12', invalid), '2026-09-12');
    }
  });

  testWidgets(
    'weekend defaults use Friday and disclose the actual range before running',
    (tester) async {
      final api = _DatedStrategyApi();
      await fixture.mount(tester, api, date: '2026-09-12');
      expect(find.text('2021-09-11 → 2026-09-11'), findsOneWidget);
      expect(
        find.textContaining('Default range ends on 2026-09-11'),
        findsOneWidget,
      );
      expect(api.posts, isEmpty);
      await fixture.choose(tester);
      await fixture.tap(tester, 'Run backtest');
      expect(api.posts.single['asOf'], '2026-09-12');
      expect(api.posts.single['end'], '2026-09-11');
      expect(api.posts.single['start'], '2021-09-11');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'historical workspace cutoff remains historical, not the latest session',
    (tester) async {
      final api = _DatedStrategyApi();
      await fixture.mount(tester, api, date: '2024-06-28');
      expect(find.text('2019-06-28 → 2024-06-28'), findsOneWidget);
      expect(find.textContaining('Default range ends on'), findsNothing);
      await fixture.choose(tester);
      await fixture.tap(tester, 'Run backtest');
      expect(api.posts.single['end'], '2024-06-28');
      expect(api.posts.single['asOf'], '2024-06-28');
    },
  );

  testWidgets('later catalog completion updates only untouched defaults', (
    tester,
  ) async {
    final api = _DatedStrategyApi()..cutoff = '2026-09-10';
    await fixture.mount(tester, api, date: '2026-09-12');
    expect(find.text('2021-09-10 → 2026-09-10'), findsOneWidget);
    api.catalogGate = Completer<void>();
    api.cutoff = '2026-09-11';
    final dynamic state = tester.state(find.byType(StrategyLabPanel));
    final refresh = state.load() as Future<void>;
    await tester.pump();
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    api.catalogGate!.complete();
    await refresh;
    await tester.pumpAndSettle();
    expect(find.text('2021-09-11 → 2026-09-11'), findsOneWidget);
    expect(api.posts, isEmpty);
  });

  testWidgets(
    'manual dates beyond the data cutoff are preserved across asynchronous refresh',
    (tester) async {
      final api = _DatedStrategyApi()..cutoff = '2026-09-10';
      await fixture.mount(tester, api, date: '2026-09-12');
      await selectDateRange(
        tester,
        DateTimeRange(start: DateTime(2025, 2, 3), end: DateTime(2026, 9, 12)),
      );
      api.catalogGate = Completer<void>();
      api.cutoff = '2026-09-11';
      final dynamic state = tester.state(find.byType(StrategyLabPanel));
      final refresh = state.load() as Future<void>;
      await tester.pump();
      api.catalogGate!.complete();
      await refresh;
      await tester.pumpAndSettle();
      expect(find.text('2025-02-03 → 2026-09-12'), findsOneWidget);
      expect(find.textContaining('Default range ends on'), findsNothing);
      await fixture.choose(tester);
      await fixture.tap(tester, 'Run backtest');
      expect(api.posts.single['start'], '2025-02-03');
      expect(api.posts.single['end'], '2026-09-12');
    },
  );
}
