import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:guru_analysis_terminal/main.dart';

class _FakeAdminApiClient extends ApiClient {
  _FakeAdminApiClient() : super(() => 'test-token');

  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    if (path == '/api/admin/system-health') {
      return {
        'status': 'success',
        'database': {'sizeBytes': 1024, 'updatedAt': '2026-08-30T10:00:00Z'},
        'service': {'uptimeSeconds': 3600, 'environment': 'test'},
        'auth': {'allowedOriginCount': 1, 'apiCorsConfigured': 'true'},
        'portfolio': {
          'summary': {'users': 1},
        },
        'jobs': <Map<String, dynamic>>[],
      };
    }
    if (path.startsWith('/api/admin/portfolio-users/')) {
      return {
        'user': {
          'name': 'Test User',
          'email': 'test@example.com',
          'connection': {
            'status': 'not_configured',
            'accounts': <Map<String, dynamic>>[],
          },
        },
        'portfolio': {
          'summary': {
            'totalValue': 0,
            'holdings': 0,
            'accounts': 0,
            'cash': 0,
            'dayPnl': 0,
            'dayPnlPct': 0,
            'unrealizedPnl': 0,
            'unrealizedPnlPct': 0,
            'topWeight': 0,
            'currency': 'USD',
          },
          'connection': {
            'configured': false,
            'registered': false,
            'status': 'not_configured',
            'accounts': <Map<String, dynamic>>[],
          },
          'accounts': <Map<String, dynamic>>[],
          'holdings': <Map<String, dynamic>>[],
          'sectors': <Map<String, dynamic>>[],
          'performance': <Map<String, dynamic>>[],
          'performanceStatus': {
            'real': false,
            'message':
                'No real portfolio NAV history was returned by the upstream source.',
          },
          'dividends': <Map<String, dynamic>>[],
          'dividendStatus': <String, dynamic>{},
          'analytics': <String, dynamic>{},
        },
      };
    }
    return <String, dynamic>{};
  }
}

void main() {
  test('accepts only local ontology return paths', () {
    expect(ontologyReturnPath('/ontology/'), '/ontology/');
    expect(
      ontologyReturnPath('/ontology/?view=market#latest'),
      '/ontology/?view=market#latest',
    );
    expect(ontologyReturnPath('https://example.com/ontology/'), isNull);
    expect(ontologyReturnPath('//example.com/ontology/'), isNull);
    expect(ontologyReturnPath('/ontology-admin'), isNull);
    expect(ontologyReturnPath('/dbmf'), '/ontology/');
    expect(
      ontologyReturnPath('/dbmf/?view=market#latest'),
      '/ontology/?view=market#latest',
    );
  });

  test('redirects retired DBMF routes to the Ontology module', () {
    expect(normalizeRouteMode('dbmf'), 'ontology');
    expect(normalizeRouteMode(null, path: '/dbmf'), 'ontology');
    expect(normalizeRouteMode(null, path: '/dbmf/history'), 'ontology');
    expect(normalizeRouteMode('valuation', path: '/'), 'valuation');
  });

  test('keeps language while entering the Ontology explorer', () {
    expect(ontologyPathForLanguage(AppLanguage.zh), '/ontology/');
    expect(ontologyPathForLanguage(AppLanguage.en), '/ontology/?lang=en');
    expect(
      ontologyPathForLanguage(AppLanguage.en, '/ontology/?view=market#latest'),
      '/ontology/?view=market&lang=en#latest',
    );
  });

  test('localizes shared and dynamic UI labels', () {
    expect(localizeUiText(AppLanguage.zh, 'Dividend calendar'), '股息日历');
    expect(localizeUiText(AppLanguage.en, '股息日历'), 'Dividend calendar');
    expect(localizeUiText(AppLanguage.zh, '18 events'), '18 个事件');
    expect(localizeUiText(AppLanguage.zh, '\$12.3K model P/L'), '\$12.3K 模型盈亏');
    expect(localizeUiText(AppLanguage.zh, 'FV coverage 92.0%'), '估值覆盖率 92.0%');
    expect(
      localizeUiText(
        AppLanguage.zh,
        'API request timed out after 95s. Please retry.',
      ),
      'API 请求在 95 秒后超时，请重试。',
    );
    expect(localizeUiText(AppLanguage.zh, 'API 503'), 'API 请求失败（状态码 503）');
    expect(localizeUiText(AppLanguage.zh, 'not_configured'), '未配置');
    expect(localizeUiText(AppLanguage.en, 'not_configured'), 'Not configured');
    expect(localizeUiText(AppLanguage.zh, 'Communication Services'), '通信服务');
    expect(localizeUiText(AppLanguage.en, '通信服务'), 'Communication Services');
    expect(localizeUiText(AppLanguage.zh, '1 accounts'), '1 个账户');
    expect(localizeUiText(AppLanguage.en, '1 accounts'), '1 account');
    expect(
      localizeUiText(
        AppLanguage.zh,
        'Jansen Sharadar as-reported PIT financials + event-visible management guidance',
      ),
      'Jansen Sharadar 原始披露口径的 PIT 财务数据 + 当时可见的管理层指引',
    );
    expect(
      dividendWindowTitle(DateTime(2026, 8), AppLanguage.zh),
      '2026 年 8 月',
    );
    expect(dividendWindowTitle(DateTime(2026, 8), AppLanguage.en), 'Aug 2026');
  });

  testWidgets('renders the auth shell', (WidgetTester tester) async {
    await tester.pumpWidget(const GuruTerminalApp());

    await tester.pump();

    expect(find.text('研究终端'), findsOneWidget);
    expect(find.text('GURU INTELLIGENCE'), findsOneWidget);
    expect(find.text('使用 Google 继续'), findsOneWidget);
    expect(find.text('中文'), findsOneWidget);
    expect(find.text('EN'), findsOneWidget);
  });

  testWidgets('switches the auth shell completely to English', (
    WidgetTester tester,
  ) async {
    var language = AppLanguage.zh;
    await tester.pumpWidget(
      StatefulBuilder(
        builder: (context, setState) => MaterialApp(
          home: LanguageScope(
            language: language,
            child: LoginScreen(
              authConfigured: true,
              localBypassEnabled: true,
              language: language,
              onLanguage: (value) => setState(() => language = value),
              onGoogle: () {},
              onLocal: () {},
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('EN'));
    await tester.pump();

    expect(find.text('Research Terminal'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Enter Local Workspace'), findsOneWidget);
    expect(find.text('Chinese'), findsOneWidget);
    expect(find.text('English'), findsOneWidget);
    expect(find.text('研究终端'), findsNothing);
  });

  testWidgets(
    'representative data widgets contain no Chinese in English mode',
    (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1280, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final palette = Palette(false);
      await tester.pumpWidget(
        MaterialApp(
          home: LanguageScope(
            language: AppLanguage.en,
            child: Scaffold(
              body: SingleChildScrollView(
                child: Column(
                  children: [
                    DividendEmptyMonthNotice(
                      monthStart: DateTime(2026, 8),
                      nextMonth: DateTime(2026, 9),
                      palette: palette,
                      onJumpToNext: () {},
                    ),
                    ValuationWatchlistHeader(palette: palette),
                    PortfolioAnalyticsMetricCard(
                      label: 'Past 1Y Volatility',
                      value: '18.0%',
                      sub: 'current-weight backsolve',
                      icon: Icons.show_chart,
                      palette: palette,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      final visibleText = tester
          .widgetList<Text>(find.byType(Text))
          .map((widget) => widget.data ?? '')
          .join('\n');
      expect(RegExp(r'[\u3400-\u9fff]').hasMatch(visibleText), isFalse);
      expect(find.text('Aug 2026 has no dividend events.'), findsOneWidget);
      expect(find.text('COMPANY'), findsOneWidget);
      expect(find.text('current-weight backsolve'), findsOneWidget);
    },
  );

  testWidgets('admin portfolio surfaces contain no Chinese in English mode', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final palette = Palette(false);
    await tester.pumpWidget(
      MaterialApp(
        home: LanguageScope(
          language: AppLanguage.en,
          child: Scaffold(
            body: SingleChildScrollView(
              child: AdminPortfolioDashboard(
                data: {
                  'summary': {
                    'users': 1,
                    'linked': 0,
                    'accounts': 0,
                    'latestNav': 0,
                    'errors': 0,
                  },
                  'users': [
                    {
                      'userHash': 'abc123',
                      'email': 'test@example.com',
                      'name': 'Test User',
                      'connection': {
                        'status': 'not_configured',
                        'accountCount': 0,
                      },
                      'nav': {'latestValue': 0},
                    },
                  ],
                },
                api: _FakeAdminApiClient(),
                palette: palette,
                onRefresh: () async {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final visibleText = tester
        .widgetList<Text>(find.byType(Text))
        .map((widget) => widget.data ?? '')
        .join('\n');
    expect(RegExp(r'[\u3400-\u9fff]').hasMatch(visibleText), isFalse);
    expect(find.text('Portfolio admin console'), findsOneWidget);
    expect(find.text('System Health'), findsOneWidget);
    expect(find.text('All Portfolios'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mobile header keeps an always-visible language switch', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    var language = AppLanguage.en;
    await tester.pumpWidget(
      StatefulBuilder(
        builder: (context, setState) => MaterialApp(
          home: LanguageScope(
            language: language,
            child: Scaffold(
              body: TerminalHeader(
                mode: 'valuation',
                userName: 'Test User',
                sourceLabel: 'Local SQLite database',
                generatedAt: '2026-08-30T10:00:00Z',
                colorBlind: false,
                language: language,
                showAdmin: true,
                onMode: (_) {},
                onRefresh: () {},
                onColorBlind: (_) {},
                onLanguage: (value) => setState(() => language = value),
                onLogout: () {},
                palette: Palette(false),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('ZH'), findsOneWidget);
    await tester.tap(find.text('ZH'));
    await tester.pumpAndSettle();
    expect(language, AppLanguage.zh);
    expect(find.text('EN'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
