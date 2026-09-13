import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';
import 'investment_workflow_test.dart' show DiscoveryFixtureApi;

class SourceErrorApi extends DiscoveryFixtureApi {
  SourceErrorApi(this.code);
  final String code;
  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    final data = await super.getJson(path);
    if (path.contains('/gurus/')) {
      final history = data['history'] as List;
      history[0] = {
        ...history[0] as Map<String, dynamic>,
        'status': 'source_error',
        'sourceErrorCodes': [code],
        // Deliberately retain fixture figures to verify presentation also
        // fails closed if an adapter sends fields with an explicit error.
      };
      history[1] = {
        ...history[1] as Map<String, dynamic>,
        'comparisonStatus': 'previous_source_error',
      };
      data['latest'] = history[1];
    }
    return data;
  }
}

Future<void> mount(
  WidgetTester t, {
  required String code,
  required String filing,
  AppLanguage lang = AppLanguage.en,
  double width = 1487,
}) async {
  t.view.physicalSize = Size(width, 1400);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  await t.pumpWidget(
    MaterialApp(
      home: LanguageScope(
        language: lang,
        child: InvestmentWorkspace(
          api: SourceErrorApi(code),
          palette: Palette(false),
          initialPage: 'discover',
          initialTicker: '',
          initialAsOf: '2026-06-01',
          initialQuery: {
            'discoverTab': 'managers',
            'guru': 'test-manager',
            'filing': filing,
            'holding': 'TEST',
          },
          onLanguage: (_) {},
          onLegacy: () {},
        ),
      ),
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  for (final code in [
    'reported_value_error',
    'invalid_13f_identifier',
    'unexpected_source_error',
  ]) {
    testWidgets(
      'source-error quarter $code is explicit, not a holding or exit',
      (t) async {
        await mount(t, code: code, filing: 'old-filing');
        expect(find.text('This filing needs source review'), findsOneWidget);
        expect(
          find.textContaining('not an empty portfolio or an exit'),
          findsOneWidget,
        );
        expect(find.textContaining('old-filing'), findsOneWidget);
        expect(find.text('What did they own?'), findsNothing);
        expect(find.text('TEST · position history'), findsNothing);
        expect(find.text('Research TEST'), findsNothing);
        expect(find.textContaining('1.25B'), findsNothing);
        if (code == 'reported_value_error') {
          expect(
            find.textContaining('inconsistent reported value'),
            findsOneWidget,
          );
        }
        if (code == 'invalid_13f_identifier') {
          expect(
            find.textContaining('invalid security identifiers'),
            findsOneWidget,
          );
        }
        expect(t.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'valid following quarter keeps holdings but labels source gap in history',
    (t) async {
      await mount(t, code: 'reported_value_error', filing: 'new-filing');
      expect(find.text('Quarterly changes are unavailable'), findsOneWidget);
      expect(find.text('What did they own?'), findsOneWidget);
      expect(find.text('TEST · position history'), findsOneWidget);
      expect(find.text('Source unavailable'), findsOneWidget);
      expect(find.text('Not in extract'), findsNothing);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('Chinese mobile error is translated and has no overflow', (
    t,
  ) async {
    await mount(
      t,
      code: 'invalid_13f_identifier',
      filing: 'old-filing',
      lang: AppLanguage.zh,
      width: 390,
    );
    expect(find.text('这份申报需要核查来源'), findsOneWidget);
    expect(find.textContaining('不代表空仓或清仓'), findsOneWidget);
    expect(find.textContaining('无效的证券标识'), findsOneWidget);
    expect(find.text('This filing needs source review'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
