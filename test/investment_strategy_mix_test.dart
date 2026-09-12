import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';
import 'investment_strategy_lab_test.dart' as fixture;

Future<void> edit(WidgetTester t, String key, String value) async {
  final field = find.byKey(ValueKey(key));
  await t.ensureVisible(field);
  await t.enterText(field, value);
  await t.pumpAndSettle();
}

Future<void> toggle(WidgetTester t, String factor) async {
  final field = find.byKey(ValueKey('mix-enable-$factor'));
  await t.ensureVisible(field);
  await t.tap(field);
  await t.pumpAndSettle();
}

void main() {
  test(
    'older saved mixes expand to all four factors and the original ROIC window',
    () {
      final mixed = strategyMixForRequest({
        'weights': {'factors': 1.0},
        'factors': {'qualityYears': 3, 'growth': .2},
      });
      final f = asMap(mixed['factors']);
      expect(f['enabled'], ['growth', 'operatingMargin', 'fcfMargin', 'roic']);
      expect(f['qualityPassYears'], 3);
      expect(f['rankBy'], 'growth');
      expect(f['growth'], .2);
    },
  );
  testWidgets(
    'single-factor selection, empty protection, ranking and draft restoration',
    (t) async {
      final api = fixture.StrategyApi();
      await fixture.mount(t, api);
      await fixture.tap(t, 'Configure mix');
      await fixture.tap(t, 'Four-factor only');
      await fixture.tap(t, 'Configure factors →');
      await edit(t, 'mix-factor-fcfMargin', '8');
      for (final key in ['growth', 'operatingMargin', 'roic']) {
        await toggle(t, key);
      }
      expect(
        t
            .widget<TextFormField>(
              find.byKey(const ValueKey('mix-factor-growth')),
            )
            .enabled,
        false,
      );
      await toggle(t, 'fcfMargin');
      expect(
        t
            .widget<FilledButton>(
              find.byKey(const ValueKey('apply-equity-mix')),
            )
            .onPressed,
        isNull,
      );
      await toggle(t, 'fcfMargin');
      await fixture.tap(t, 'Apply mix');
      await fixture.tap(t, 'Run backtest');
      final f = asMap(asMap(api.posts.single['equityMix'])['factors']);
      expect(f['enabled'], ['fcfMargin']);
      expect(f['rankBy'], 'fcfMargin');
      expect(f['fcfMargin'], .08);
      await fixture.tap(t, 'Configure mix');
      expect(
        t
            .widget<SwitchListTile>(
              find.byKey(const ValueKey('mix-enable-growth')),
            )
            .value,
        false,
      );
      expect(
        t
            .widget<SwitchListTile>(
              find.byKey(const ValueKey('mix-enable-fcfMargin')),
            )
            .value,
        true,
      );
      await fixture.tap(t, 'Cancel');
      await fixture.tap(t, 'Save rules');
      await fixture.tap(t, 'Save');
      expect(asMap(api.posts.last['equityMix'])['factors'], f);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'ROIC observation and passing-year parameters remain bounded when the window changes',
    (t) async {
      final api = fixture.StrategyApi();
      await fixture.mount(t, api);
      await fixture.tap(t, 'Configure mix');
      await fixture.tap(t, 'Four-factor only');
      final passing = find.byKey(const ValueKey('mix-quality-pass-5-5'));
      await t.ensureVisible(passing);
      await t.tap(passing);
      await t.pumpAndSettle();
      await t.tap(find.text('4 of 5 years').last);
      await t.pumpAndSettle();
      await fixture.tap(t, 'Apply mix');
      await fixture.tap(t, 'Run backtest');
      expect(
        asMap(
          asMap(api.posts.single['equityMix'])['factors'],
        )['qualityPassYears'],
        4,
      );
      await fixture.tap(t, 'Configure mix');
      final window = find.byKey(const ValueKey('mix-quality-years'));
      await t.ensureVisible(window);
      await t.tap(window);
      await t.pumpAndSettle();
      await t.tap(find.text('3 consecutive years').last);
      await t.pumpAndSettle();
      await fixture.tap(t, 'Apply mix');
      await fixture.tap(t, 'Run backtest');
      final f = asMap(asMap(api.posts.last['equityMix'])['factors']);
      expect(f['qualityYears'], 3);
      expect(f['qualityPassYears'], 3);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'index-only config enables run without Guru, persists exact weights, cancel is transactional',
    (t) async {
      final api = fixture.StrategyApi();
      await fixture.mount(t, api);
      await fixture.tap(t, 'Configure mix');
      await fixture.tap(t, 'Index only');
      await edit(t, 'mix-weight-QQQ', '50');
      await edit(t, 'mix-weight-SPY', '25');
      await edit(t, 'mix-weight-SCHD', '25');
      await fixture.tap(t, 'Apply mix');
      expect(api.posts, isEmpty);
      await fixture.tap(t, 'Run backtest');
      expect(api.posts.single['managers'], isEmpty);
      expect(asMap(api.posts.single['equityMix'])['weights'], {
        'guru': 0.0,
        'factors': 0.0,
        'QQQ': .5,
        'SPY': .25,
        'SCHD': .25,
      });
      expect(
        find.textContaining('Index ETFs exempt from valuation filtering'),
        findsOneWidget,
      );
      await fixture.tap(t, 'View holdings & filters');
      expect(
        find.textContaining('Each source keeps its configured budget'),
        findsOneWidget,
      );
      expect(find.textContaining('eligible stocks share'), findsNothing);
      await fixture.tap(t, 'Configure mix');
      await fixture.tap(t, 'Four-factor only');
      await fixture.tap(t, 'Cancel');
      await fixture.tap(t, 'Run backtest');
      expect(api.posts.last['equityMix'], api.posts.first['equityMix']);
      await fixture.tap(t, 'Save rules');
      await fixture.tap(t, 'Save');
      expect(api.posts.last['equityMix'], api.posts.first['equityMix']);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'invalid total and missing Guru block Apply; four-factor thresholds are editable',
    (t) async {
      final api = fixture.StrategyApi();
      await fixture.mount(t, api);
      await fixture.tap(t, 'Configure mix');
      expect(
        t
            .widget<FilledButton>(
              find.byKey(const ValueKey('apply-equity-mix')),
            )
            .onPressed,
        isNull,
      );
      await fixture.tap(t, 'Four-factor only');
      await edit(t, 'mix-weight-factors', '80');
      expect(
        t
            .widget<FilledButton>(
              find.byKey(const ValueKey('apply-equity-mix')),
            )
            .onPressed,
        isNull,
      );
      await edit(t, 'mix-weight-factors', '100');
      await edit(t, 'mix-factor-growth', '20');
      await edit(t, 'mix-factor-roic', '18');
      await fixture.tap(t, 'Apply mix');
      await fixture.tap(t, 'Run backtest');
      final f = asMap(asMap(api.posts.single['equityMix'])['factors']);
      expect(f['growth'], .2);
      expect(f['roic'], .18);
      expect(f['qualityYears'], 5);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'cleared factor input survives switching sources without a crash',
    (t) async {
      final api = fixture.StrategyApi();
      await fixture.mount(t, api);
      await fixture.tap(t, 'Configure mix');
      await fixture.tap(t, 'Four-factor only');
      await edit(t, 'mix-factor-growth', '');
      expect(
        t
            .widget<FilledButton>(
              find.byKey(const ValueKey('apply-equity-mix')),
            )
            .onPressed,
        isNull,
      );
      await fixture.tap(t, 'Index only');
      expect(
        t
            .widget<FilledButton>(
              find.byKey(const ValueKey('apply-equity-mix')),
            )
            .onPressed,
        isNotNull,
      );
      await fixture.tap(t, 'Four-factor only');
      expect(t.takeException(), isNull);
      expect(
        t
            .widget<FilledButton>(
              find.byKey(const ValueKey('apply-equity-mix')),
            )
            .onPressed,
        isNull,
      );
      await fixture.tap(t, 'Index only');
      await fixture.tap(t, 'Apply mix');
      await fixture.tap(t, 'Run backtest');
      expect(
        asMap(asMap(api.posts.single['equityMix'])['factors'])['growth'],
        .15,
      );
      expect(t.takeException(), isNull);
    },
  );
  for (final language in [AppLanguage.en, AppLanguage.zh]) {
    testWidgets('mix modal on 390px at 150% text in ${language.name}', (
      t,
    ) async {
      final api = fixture.StrategyApi();
      await fixture.mount(
        t,
        api,
        size: const Size(390, 844),
        scale: 1.5,
        language: language,
      );
      await fixture.tap(
        t,
        language == AppLanguage.en ? 'Configure mix' : '配置组合',
      );
      await fixture.tap(
        t,
        language == AppLanguage.en ? 'Four-factor only' : '仅四因子',
      );
      expect(find.byKey(const ValueKey('apply-equity-mix')), findsOneWidget);
      expect(t.takeException(), isNull);
      await fixture.tap(t, language == AppLanguage.en ? 'Apply mix' : '应用组合');
      expect(t.takeException(), isNull);
    });
  }
}
