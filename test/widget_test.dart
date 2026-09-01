import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:guru_analysis_terminal/main.dart';

class _FakeAdminApiClient extends ApiClient {
  _FakeAdminApiClient() : super(() => 'test-token');

  int deleteCalls = 0;
  int restoreCalls = 0;

  @override
  Future<Map<String, dynamic>> deleteJson(String path) async {
    deleteCalls += 1;
    expect(path, '/api/portfolio/connection');
    return {
      'status': 'success',
      'recoverable': true,
      'undoUntil': '2099-01-01T00:15:00Z',
    };
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    if (path == '/api/portfolio/connection/restore') {
      restoreCalls += 1;
      expect(body, isEmpty);
      return {'ok': true, 'restored': true};
    }
    return <String, dynamic>{};
  }

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

ValuationRow _valuationRow(
  double upside, {
  bool hasModel = true,
  String ticker = 'TEST',
}) => ValuationRow(
  ticker: ticker,
  name: '$ticker Co',
  sector: 'Software',
  currency: 'USD',
  latestPrice: hasModel ? 100 : 0,
  fairValue: hasModel ? 100 * (1 + upside) : 0,
  upside: upside,
  targetPrice3Y: 120,
  expectedReturn3Y: .06,
  latestPriceDate: '2026-08-30',
  coverageKind: 'model',
  lineageStatus: 'pass',
  releaseStatus: 'verified',
  economicValidationStatus: 'not_validated',
  marketCalibrationStatus: 'guardrail_only',
  consensusStatus: 'watch',
  consensusUpside: null,
);

void main() {
  test('portfolio recovery countdown rounds up and expires safely', () {
    final now = DateTime.utc(2026, 9, 1, 12);
    expect(
      portfolioRecoveryMinutesRemaining('2026-09-01T12:14:01Z', now: now),
      15,
    );
    expect(
      portfolioRecoveryMinutesRemaining('2026-09-01T12:00:01Z', now: now),
      1,
    );
    expect(
      portfolioRecoveryMinutesRemaining('2026-09-01T12:00:00Z', now: now),
      0,
    );
    expect(portfolioRecoveryMinutesRemaining('invalid', now: now), 0);
  });

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

  test('loads guru data only when the guru route first needs it', () {
    expect(shouldLoadGuruDashboard('valuation', null), isFalse);
    expect(shouldLoadGuruDashboard('portfolio', null), isFalse);
    expect(shouldLoadGuruDashboard('guru', null), isTrue);
    expect(
      shouldLoadGuruDashboard('guru', <String, dynamic>{'gurus': []}),
      isFalse,
    );
  });

  test(
    'module truth headers use economic as-of dates and computed staleness',
    () {
      final now = DateTime.utc(2026, 9, 1, 12);
      final valuation = moduleHeaderState(
        mode: 'valuation',
        payload: {
          'generatedAt': '2026-09-01T11:00:00Z',
          'summary': {'latestPriceDate': '2026-08-29'},
          'source': {'label': 'Valuation DB'},
        },
        loading: false,
        now: now,
      );
      expect(valuation.asOf, '2026-08-29');
      expect(valuation.status, 'stale');

      final currentValuation = moduleHeaderState(
        mode: 'valuation',
        payload: {
          'generatedAt': '2026-08-27T00:00:00Z',
          'summary': {'latestPriceDate': '2026-08-30'},
        },
        loading: false,
        now: now,
      );
      expect(currentValuation.status, 'cached');

      final stale = moduleHeaderState(
        mode: 'valuation',
        payload: {
          'generatedAt': '2026-08-27T00:00:00Z',
          'summary': {'latestPriceDate': '2026-08-26'},
        },
        loading: false,
        now: now,
      );
      expect(stale.status, 'stale');

      final guru = moduleHeaderState(
        mode: 'guru',
        payload: {
          'generatedAt': '2026-09-01T08:00:00Z',
          'gurus': [
            {
              'summary': {
                'reportDate': '2026-06-30',
                'filingDate': '2026-08-14',
              },
            },
          ],
        },
        loading: false,
        now: now,
      );
      expect(guru.asOf, '2026-08-14');
      expect(guru.status, 'cached');

      final sample = moduleHeaderState(
        mode: 'portfolio',
        payload: {
          'source': {'mode': 'sample', 'label': 'Portfolio module sample'},
        },
        loading: false,
        now: now,
      );
      expect(sample.status, 'sample');
      expect(toolbarDateLabel('', AppLanguage.en), 'As-of unavailable');

      final liveWithoutEconomicAsOf = moduleHeaderState(
        mode: 'portfolio',
        payload: {
          'generatedAt': '2026-09-01T11:59:00Z',
          'source': {'mode': 'live', 'label': 'Yodlee Core APIs'},
        },
        loading: false,
        now: now,
      );
      expect(liveWithoutEconomicAsOf.asOf, isEmpty);
      expect(liveWithoutEconomicAsOf.status, 'cached');

      final liveWithUpstreamAsOf = moduleHeaderState(
        mode: 'portfolio',
        payload: {
          'generatedAt': '2026-09-01T11:59:00Z',
          'source': {
            'mode': 'multi_account_live',
            'label': 'IBKR Third-Party Reports / Yodlee',
            'toDate': '2026-08-31',
          },
        },
        loading: false,
        now: now,
      );
      expect(liveWithUpstreamAsOf.asOf, '2026-08-31');
      expect(liveWithUpstreamAsOf.status, 'live');
    },
  );

  test('valuation buckets use one consistent five-percent boundary', () {
    expect(valuationBucketForRow(_valuationRow(.05)), 'undervalued');
    expect(valuationBucketForRow(_valuationRow(.049)), 'fair');
    expect(valuationBucketForRow(_valuationRow(-.049)), 'fair');
    expect(valuationBucketForRow(_valuationRow(-.05)), 'expensive');
    expect(valuationBucketForRow(_valuationRow(0, hasModel: false)), 'missing');
  });

  test('valuation filtering reconciles selection to visible results', () {
    final visible = [
      _valuationRow(.2, ticker: 'AAA'),
      _valuationRow(.1, ticker: 'BBB'),
    ];

    expect(reconciledValuationTicker(visible, 'BBB'), 'BBB');
    expect(reconciledValuationTicker(visible, 'HIDDEN'), 'AAA');
    expect(reconciledValuationTicker(const <ValuationRow>[], 'AAA'), '');
  });

  test('valuation audit layers stay independent in dashboard rows', () {
    final rows = valuationRowsFromTickers([
      {
        'ticker': 'TEST',
        'latest': {
          'latestPrice': 100,
          'baseFairValue': 120,
          'upsideToBase': .2,
        },
        'dataQuality': {
          'auditLayers': {
            'lineage': {'status': 'pass'},
            'release': {'status': 'verified'},
            'economicValidation': {'status': 'not_validated'},
            'marketCalibration': {'status': 'guardrail_only'},
          },
        },
      },
    ]);
    expect(rows.single.lineageStatus, 'pass');
    expect(rows.single.releaseStatus, 'verified');
    expect(rows.single.economicValidationStatus, 'not_validated');
    expect(rows.single.marketCalibrationStatus, 'guardrail_only');
  });

  test('valuation default is neutral instead of highest model upside', () {
    Map<String, dynamic> ticker(
      String symbol,
      double fairValue, {
      String lineage = 'pass',
    }) => {
      'ticker': symbol,
      'latest': {'latestPrice': 100, 'baseFairValue': fairValue},
      'dataQuality': {
        'auditLayers': {
          'lineage': {'status': lineage},
        },
      },
    };

    final dashboard = {
      'tickers': [ticker('ZZZ', 500), ticker('BBB', 110), ticker('AAA', 105)],
    };
    expect(defaultValuationTicker(dashboard), 'AAA');
    expect(defaultValuationTicker(dashboard, preferred: 'ZZZ'), 'ZZZ');
    expect(
      defaultValuationTicker({...dashboard, 'featuredTicker': 'BBB'}),
      'BBB',
    );
  });

  test('reported 13F totals keep common longs and options separate', () {
    final guru = <String, dynamic>{
      'summary': {'reported13fValue': 150},
      'holdings': [
        {'value': 100, 'putCall': ''},
        {'value': 30, 'putCall': 'CALL'},
        {'value': 20, 'putCall': 'PUT'},
      ],
    };
    expect(reported13fTableValue(guru), 150);
    expect(reported13fCommonLongValue(guru), 100);
    expect(reported13fOptionsValue(guru), 50);
    expect(
      reported13fActionLabel('new', AppLanguage.en),
      'Reported new position',
    );
    expect(
      reported13fActionLabel('reduced', AppLanguage.en),
      'Reported reduction',
    );
    expect(
      guruDisplayStatus({
        'status': 'live',
        'dataStatus': {'status': 'local-db'},
      }),
      'cached',
    );
  });

  test('uses summary valuation data before full research is opened', () {
    expect(
      valuationTickerDetailPath('isrg'),
      '/api/valuation/ISRG?pricePoints=300&detail=summary',
    );
    expect(
      valuationTickerDetailPath('lseg.l', fullResearch: true),
      '/api/valuation/LSEG.L?pricePoints=900&detail=full',
    );
  });

  test('valuation chart removes the long price-only lead-in', () {
    final visible = valuationChartWindow(
      [
        {'asOfDate': '2015-01-15', 'fairValue': null, 'currentPrice': 5},
        {'asOfDate': '2020-01-15', 'fairValue': 24, 'currentPrice': 20},
        {'asOfDate': '2020-04-15', 'fairValue': 27, 'currentPrice': 23},
      ],
      [
        {'date': '2010-01-04', 'close': 2},
        {'date': '2019-12-01', 'close': 18},
        {'date': '2019-12-20', 'close': 19},
        {'date': '2020-01-15', 'close': 20},
        {'date': '2020-04-15', 'close': 23},
      ],
    );

    expect(visible.pricePoints.map((row) => row['date']), [
      '2020-01-15',
      '2020-04-15',
    ]);
    expect(visible.valuationPoints.map((row) => row['asOfDate']), [
      '2020-01-15',
      '2020-04-15',
    ]);
  });

  test('valuation chart preserves price history when no model exists', () {
    final visible = valuationChartWindow(
      const [
        {'asOfDate': '2020-01-15', 'fairValue': null, 'currentPrice': 20},
      ],
      [
        {'date': '2010-01-04', 'close': 2},
        {'date': '2020-01-15', 'close': 20},
      ],
    );

    expect(visible.pricePoints.length, 2);
    expect(visible.pricePoints.first['date'], '2010-01-04');
    expect(visible.valuationPoints.length, 1);
  });

  test('valuation chart preserves price history for one model estimate', () {
    final visible = valuationChartWindow(
      const [
        {'asOfDate': '2020-01-15', 'fairValue': 24, 'currentPrice': 20},
      ],
      const [
        {'date': '2010-01-04', 'close': 2},
        {'date': '2020-01-15', 'close': 20},
      ],
    );

    expect(visible.pricePoints.length, 2);
    expect(visible.pricePoints.first['date'], '2010-01-04');
  });

  test('valuation chart does not empty a non-overlapping price series', () {
    final visible = valuationChartWindow(
      const [
        {'asOfDate': '2020-01-15', 'fairValue': 24},
        {'asOfDate': '2020-04-15', 'fairValue': 27},
      ],
      const [
        {'date': '2010-01-04', 'close': 2},
        {'date': '2010-02-04', 'close': 3},
      ],
    );

    expect(visible.pricePoints.length, 2);
    expect(visible.pricePoints.last['date'], '2010-02-04');
  });

  test('valuation chart ignores invalid prices and deduplicates dates', () {
    final visible = valuationChartWindow(
      const [
        {'asOfDate': '2020-01-15', 'fairValue': 24},
        {'asOfDate': '2020-04-15', 'fairValue': 27},
      ],
      const [
        {'date': 'not-a-date', 'close': 100},
        {'date': '2020-01-15', 'close': 0},
        {'date': '2020-01-15', 'close': 20},
        {'date': '2020-01-15', 'close': 21},
        {'date': '2020-04-15', 'close': 23},
      ],
    );

    expect(visible.pricePoints.length, 2);
    expect(visible.pricePoints.first['close'], 21);
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
              onRetry: () {},
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

  testWidgets('auth shell fits a 390px mobile viewport without overflow', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: LanguageScope(
          language: AppLanguage.en,
          child: LoginScreen(
            authConfigured: true,
            localBypassEnabled: false,
            language: AppLanguage.en,
            onLanguage: (_) {},
            onGoogle: () {},
            onLocal: () {},
            onRetry: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final panel = tester.getRect(find.byKey(const ValueKey('login-panel')));
    expect(panel.left, greaterThanOrEqualTo(16));
    expect(panel.right, lessThanOrEqualTo(374));
    expect(tester.takeException(), isNull);
  });

  testWidgets('auth initialization error offers an in-page retry', (
    WidgetTester tester,
  ) async {
    var retried = false;
    await tester.pumpWidget(
      MaterialApp(
        home: LanguageScope(
          language: AppLanguage.en,
          child: LoginScreen(
            authConfigured: false,
            localBypassEnabled: false,
            authMessage: 'Supabase auth did not initialize.',
            language: AppLanguage.en,
            onLanguage: (_) {},
            onGoogle: () {},
            onLocal: () {},
            onRetry: () => retried = true,
          ),
        ),
      ),
    );

    expect(find.text('Retry auth initialization'), findsOneWidget);
    await tester.tap(find.text('Retry auth initialization'));
    expect(retried, isTrue);
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

  testWidgets('sample portfolio is unmistakably marked as non-account data', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LanguageScope(
          language: AppLanguage.en,
          child: Scaffold(
            body: SingleChildScrollView(
              child: PortfolioDashboard(
                data: {
                  'source': {
                    'mode': 'sample',
                    'label': 'Portfolio module sample',
                  },
                  'summary': {
                    'totalValue': 100000,
                    'accounts': 1,
                    'holdings': 0,
                    'cash': 100000,
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
                  },
                  'accounts': [
                    {'status': 'sample'},
                  ],
                  'holdings': <Map<String, dynamic>>[],
                  'sectors': <Map<String, dynamic>>[],
                  'performance': <Map<String, dynamic>>[],
                  'performanceStatus': {
                    'real': false,
                    'message': 'Sample data has no real NAV history.',
                  },
                  'dividends': <Map<String, dynamic>>[],
                  'dividendStatus': <String, dynamic>{},
                  'analytics': <String, dynamic>{},
                },
                api: _FakeAdminApiClient(),
                palette: Palette(false),
                onRefresh: () async {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Sample portfolio — not an account'), findsOneWidget);
    expect(
      find.textContaining('SAMPLE DATA · NOT A REAL ACCOUNT'),
      findsWidgets,
    );
    expect(find.text('Net liquidation'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('disconnect all requires explicit confirmation', (
    WidgetTester tester,
  ) async {
    final api = _FakeAdminApiClient();
    var refreshCalls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: LanguageScope(
          language: AppLanguage.en,
          child: Scaffold(
            body: PortfolioConnectionStatusPanel(
              connection: const {
                'status': 'linked',
                'configured': true,
                'accounts': <Map<String, dynamic>>[],
              },
              api: api,
              palette: Palette(false),
              onRefresh: () async {
                refreshCalls += 1;
              },
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Disconnect all'));
    await tester.pumpAndSettle();

    expect(find.text('Disconnect all portfolio connections?'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.text('Disconnect safely'), findsOneWidget);

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(api.deleteCalls, 0);
    expect(refreshCalls, 0);

    await tester.tap(find.text('Disconnect all'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Disconnect safely'));
    await tester.pumpAndSettle();

    expect(api.deleteCalls, 1);
    expect(refreshCalls, 1);
    expect(
      find.textContaining('Disconnected. Restore eligibility expires'),
      findsOneWidget,
    );
  });

  testWidgets('disconnected portfolio offers time-bounded undo', (
    WidgetTester tester,
  ) async {
    final api = _FakeAdminApiClient();
    var refreshCalls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: LanguageScope(
          language: AppLanguage.en,
          child: Scaffold(
            body: SingleChildScrollView(
              child: PortfolioConnectionPanel(
                connection: const {
                  'status': 'disconnected_recoverable',
                  'configured': false,
                  'recoverable': true,
                  'undoUntil': '2099-01-01T00:15:00Z',
                },
                api: api,
                palette: Palette(false),
                onConnected: () async {
                  refreshCalls += 1;
                },
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Undo disconnect'), findsOneWidget);
    expect(find.textContaining('encrypted credentials'), findsOneWidget);

    await tester.ensureVisible(find.text('Undo disconnect'));
    await tester.tap(find.text('Undo disconnect'));
    await tester.pumpAndSettle();

    expect(api.restoreCalls, 1);
    expect(refreshCalls, 1);
    expect(
      find.text('Connection restored from encrypted recovery.'),
      findsOneWidget,
    );
  });

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
                moduleState: const ModuleHeaderState(
                  status: 'cached',
                  source: 'Local SQLite database',
                  asOf: '2026-08-30T10:00:00Z',
                ),
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

  testWidgets('terminal header is overflow-safe at 390, 768, and 1024px', (
    WidgetTester tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    for (final width in <double>[390, 768, 1024]) {
      tester.view.physicalSize = Size(width, 844);
      await tester.pumpWidget(
        MaterialApp(
          home: LanguageScope(
            language: AppLanguage.en,
            child: Scaffold(
              body: TerminalHeader(
                mode: 'valuation',
                userName: 'Test User',
                moduleState: const ModuleHeaderState(
                  status: 'stale',
                  source: 'Local SQLite valuation database',
                  asOf: '2026-08-27T10:00:00Z',
                ),
                colorBlind: false,
                language: AppLanguage.en,
                showAdmin: true,
                onMode: (_) {},
                onRefresh: () {},
                onColorBlind: (_) {},
                onLanguage: (_) {},
                onLogout: () {},
                palette: Palette(false),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'width $width');
      expect(tester.getSize(find.byTooltip('Refresh')).height, 44);
      expect(find.text('ZH'), findsOneWidget);
    }
  });
}
