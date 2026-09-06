import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';

class LoginApi extends ApiClient {
  LoginApi() : super(() => 'synthetic-test-token');
  final calls = <Uri>[];
  bool failVisit = false;
  int visits = 0;
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    expect(path, '/api/auth/activity');
    expect(body, isEmpty);
    visits++;
    if (failVisit) throw Exception('synthetic unavailable backend');
    return {'authenticated': true};
  }

  Future<Map<String, dynamic>> Function(Uri) respond = (_) async =>
      loginFixture();
  @override
  Future<Map<String, dynamic>> getJson(String path) {
    final uri = Uri.parse(path);
    calls.add(uri);
    return respond(uri);
  }
}

Map<String, dynamic> loginFixture({int page = 1, int pages = 1}) => {
  'total': pages == 1 ? 2 : 21,
  'page': page,
  'pages': pages,
  'users': [
    {
      'name': 'Test Investor',
      'email': 'investor@example.test',
      'lastSignInAt': '2026-09-05T12:30:00Z',
      'lastSeenAt': '2026-09-05T13:00:00Z',
    },
    {
      'name': 'Legacy Visitor',
      'email': 'legacy@example.test',
      'lastSignInAt': null,
      'lastSeenAt': '2026-09-05T12:00:00Z',
    },
  ],
};

Future<void> showPanel(
  WidgetTester tester,
  LoginApi api, {
  AppLanguage language = AppLanguage.en,
  double width = 390,
}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: LanguageScope(
        language: language,
        child: Scaffold(
          body: SingleChildScrollView(
            child: AdminLoginActivityPanel(api: api, palette: Palette(false)),
          ),
        ),
      ),
    ),
  );
}

void main() {
  test(
    'auth-shell observation sends no client identity or timestamp and does not block on failure',
    () async {
      final api = LoginApi();
      await recordAuthenticatedVisit(api);
      api.failVisit = true;
      await recordAuthenticatedVisit(api);
      expect(api.visits, 2);
    },
  );
  for (final language in AppLanguage.values) {
    for (final width in [390.0, 1280.0]) {
      testWidgets(
        'sign-ins show identity, separate times and unknown status: $language $width',
        (tester) async {
          final api = LoginApi();
          await showPanel(tester, api, language: language, width: width);
          await tester.pumpAndSettle();
          expect(find.text('investor@example.test'), findsOneWidget);
          expect(
            find.textContaining(adminLoginDateTime('2026-09-05T12:30:00Z')),
            findsOneWidget,
          );
          expect(
            find.textContaining(
              language == AppLanguage.en ? 'Not recorded' : '未记录',
            ),
            findsOneWidget,
          );
          expect(find.textContaining(adminLoginTimezone()), findsOneWidget);
          if (language == AppLanguage.en) {
            final visible = tester
                .widgetList<Text>(find.byType(Text))
                .map((text) => text.data ?? '')
                .join('\n');
            expect(RegExp(r'[\u3400-\u9fff]').hasMatch(visible), false);
          }
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
  testWidgets('search is debounced, URL encoded, and resets pagination', (
    tester,
  ) async {
    final api = LoginApi();
    api.respond = (uri) async =>
        loginFixture(page: int.parse(uri.queryParameters['page']!), pages: 2);
    await showPanel(tester, api, width: 1280);
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('login-activity-next')),
    );
    await tester.tap(find.byKey(const ValueKey('login-activity-next')));
    await tester.pumpAndSettle();
    expect(api.calls.last.queryParameters['page'], '2');
    await tester.enterText(
      find.byKey(const ValueKey('login-activity-search')),
      'a+b@example.test',
    );
    await tester.pump(const Duration(milliseconds: 301));
    await tester.pumpAndSettle();
    expect(api.calls.last.queryParameters['search'], 'a+b@example.test');
    expect(api.calls.last.queryParameters['page'], '1');
    expect(tester.takeException(), isNull);
  });
  testWidgets('late old response cannot replace a new search', (tester) async {
    final api = LoginApi();
    final old = Completer<Map<String, dynamic>>();
    api.respond = (uri) => uri.queryParameters['search']!.isEmpty
        ? old.future
        : Future.value({
            'total': 0,
            'page': 1,
            'pages': 1,
            'users': <Map<String, dynamic>>[],
          });
    await showPanel(tester, api);
    await tester.enterText(
      find.byKey(const ValueKey('login-activity-search')),
      'missing',
    );
    old.complete(loginFixture());
    await tester.pump(const Duration(milliseconds: 301));
    await tester.pumpAndSettle();
    expect(find.text('No matching accounts.'), findsOneWidget);
    expect(find.text('investor@example.test'), findsNothing);
  });
  testWidgets(
    'failure can retry and refresh without showing a successful empty state',
    (tester) async {
      final api = LoginApi();
      api.respond = (_) async => throw Exception('synthetic failure');
      await showPanel(tester, api);
      await tester.pumpAndSettle();
      expect(
        find.text('Could not load sign-ins. Please retry.'),
        findsOneWidget,
      );
      api.respond = (_) async => loginFixture();
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('investor@example.test'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('login-activity-refresh')));
      await tester.pumpAndSettle();
      expect(api.calls.length, 3);
    },
  );
  testWidgets(
    'empty collection explains coverage, not fabricated historical sign-ins',
    (tester) async {
      final api = LoginApi();
      api.respond = (_) async => {
        'total': 0,
        'page': 1,
        'pages': 1,
        'users': <Map<String, dynamic>>[],
      };
      await showPanel(tester, api);
      await tester.pumpAndSettle();
      expect(find.textContaining('No records yet.'), findsOneWidget);
      expect(
        tester
            .widget<IconButton>(
              find.byKey(const ValueKey('login-activity-next')),
            )
            .onPressed,
        isNull,
      );
    },
  );
}
