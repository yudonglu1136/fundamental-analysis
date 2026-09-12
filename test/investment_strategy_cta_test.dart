import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';
import 'investment_strategy_lab_test.dart' as fixture;

Future<void> edit(WidgetTester t, String key, String value) async {
  final f = find.byKey(ValueKey(key));
  await t.ensureVisible(f);
  await t.enterText(f, value);
  await t.pumpAndSettle();
}

void main() {
  testWidgets(
    'CTA modal applies editable stages, round-trips in requests and saved rules, cancel preserves config',
    (t) async {
      final api = fixture.StrategyApi();
      await fixture.mount(t, api);
      await fixture.tap(t, 'Configure mix');
      await fixture.tap(t, 'Index only');
      await fixture.tap(t, 'Apply mix');
      await fixture.tap(t, 'Add a CTA sleeve');
      await fixture.tap(t, 'Flexible tranches');
      await edit(t, 'cta-floor', '10');
      await edit(t, 'cta-trim-0', '18');
      await edit(t, 'cta-buy-0', '9');
      await edit(t, 'cta-cooldown', '7');
      await fixture.tap(t, 'Add stage');
      expect(find.byKey(const ValueKey('cta-trim-3')), findsOneWidget);
      await fixture.tap(t, 'Apply CTA rules');
      expect(api.posts, isEmpty);
      await fixture.tap(t, 'Run backtest');
      final policy = asMap(api.posts.single['ctaPolicy']);
      expect(policy['mode'], 'tranches');
      expect(policy['minWeight'], .1);
      expect(policy['trimThresholds'], [.18, .25, .35, .45]);
      expect(policy['buyThresholds'], [.09, .12, .18, .23]);
      expect(policy['cooldownSessions'], 7);
      await fixture.tap(t, 'Configure CTA rules');
      expect(
        t
            .widget<TextFormField>(find.byKey(const ValueKey('cta-floor')))
            .controller!
            .text,
        '10',
      );
      await fixture.tap(t, 'Buy & hold');
      await fixture.tap(t, 'Cancel');
      await fixture.tap(t, 'Run backtest');
      expect(api.posts.last['ctaPolicy'], policy);
      await fixture.tap(t, 'Save rules');
      await fixture.tap(t, 'Save');
      expect(api.posts.last['ctaPolicy'], policy);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'invalid ladder cannot apply; calendar frequency applies; No CTA omits dormant policy',
    (t) async {
      final api = fixture.StrategyApi();
      await fixture.mount(t, api);
      await fixture.tap(t, 'Configure mix');
      await fixture.tap(t, 'Index only');
      await fixture.tap(t, 'Apply mix');
      await fixture.tap(t, 'Configure CTA rules');
      await fixture.tap(t, 'Flexible tranches');
      await edit(t, 'cta-trim-0', '40');
      expect(
        t
            .widget<FilledButton>(find.byKey(const ValueKey('apply-cta-rules')))
            .onPressed,
        isNull,
      );
      await edit(t, 'cta-trim-0', '15');
      await fixture.tap(t, 'Scheduled');
      await fixture.tap(t, 'Annually');
      await fixture.tap(t, 'Apply CTA rules');
      await fixture.tap(t, 'Run backtest');
      expect(asMap(api.posts.last['ctaPolicy'])['frequency'], 'annually');
      await fixture.tap(t, 'No CTA');
      await fixture.tap(t, 'Run backtest');
      expect(api.posts.last.containsKey('ctaPolicy'), false);
      expect(t.takeException(), isNull);
    },
  );
  for (final language in [AppLanguage.en, AppLanguage.zh]) {
    testWidgets('CTA editor 390px 150 percent text ${language.name}', (
      t,
    ) async {
      await fixture.mount(
        t,
        fixture.StrategyApi(),
        size: const Size(390, 844),
        scale: 1.5,
        language: language,
      );
      await fixture.tap(
        t,
        language == AppLanguage.en ? 'Configure CTA rules' : '配置 CTA 规则',
      );
      await fixture.tap(
        t,
        language == AppLanguage.en ? 'Flexible tranches' : '灵活分批',
      );
      await edit(t, 'cta-floor', '12');
      await edit(t, 'cta-cooldown', '3');
      await fixture.tap(
        t,
        language == AppLanguage.en ? 'Apply CTA rules' : '应用 CTA 规则',
      );
      expect(t.takeException(), isNull);
    });
  }
}
