import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guru_analysis_terminal/main.dart';

Map<String, dynamic> directoryUser(
  String id, {
  String? login,
  bool registered = false,
  String status = 'not_configured',
}) => {
  'userHash': id,
  'name': 'Investor $id',
  'email': '$id@example.test',
  'lastSignInAt': login,
  'lastSeenAt': '2026-09-05T18:00:00Z',
  'connection': {
    'registered': registered,
    'status': status,
    'accountCount': registered ? 1 : 0,
  },
};

Future<void> showDirectory(
  WidgetTester tester,
  List<Map<String, dynamic>> users, {
  double width = 1280,
  AppLanguage language = AppLanguage.en,
  ValueChanged<String>? select,
  ValueChanged<String>? search,
  Future<void> Function()? refresh,
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
            child: AdminUserDirectoryPanel(
              users: users,
              selectedHash: '',
              search: '',
              palette: Palette(false),
              onSearch: search ?? (_) {},
              onSelect: select ?? (_) {},
              onRefresh: refresh ?? () async {},
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  test(
    'grouping counts saved failed connections but not empty DBs or historical NAV',
    () {
      expect(
        adminUserPortfolioRegistration(
          directoryUser('saved', registered: true, status: 'decrypt_error'),
        ),
        'registered',
      );
      expect(
        adminUserPortfolioRegistration({
          ...directoryUser('db'),
          'databaseExists': true,
          'nav': {'pointCount': 99},
        }),
        'not_registered',
      );
      expect(
        adminUserPortfolioRegistration(
          directoryUser('failed', status: 'read_error'),
        ),
        'unknown',
      );
    },
  );
  test(
    'last sign-in sorting ignores activity and puts missing or invalid times last',
    () {
      final users = [
        directoryUser('unknown'),
        directoryUser('old', login: '2026-09-01T00:00:00Z'),
        directoryUser('new', login: '2026-09-05T00:00:00Z'),
        directoryUser('broken', login: 'not-a-date'),
      ]..sort(compareAdminUserLastSignIn);
      expect(users.map((user) => user['userHash']), [
        'new',
        'old',
        'broken',
        'unknown',
      ]);
    },
  );

  for (final language in AppLanguage.values) {
    for (final width in [390.0, 1280.0]) {
      testWidgets('two cohorts, login time and no overflow: $language $width', (
        tester,
      ) async {
        await showDirectory(
          tester,
          [
            directoryUser(
              'saved',
              registered: true,
              login: '2026-09-05T12:30:00Z',
              status: 'error',
            ),
            directoryUser('visitor'),
          ],
          width: width,
          language: language,
        );
        final yes = find.byKey(const ValueKey('admin-users-registered'));
        final no = find.byKey(const ValueKey('admin-users-not_registered'));
        expect(
          find.descendant(of: yes, matching: find.text('saved@example.test')),
          findsOneWidget,
        );
        expect(
          find.descendant(of: no, matching: find.text('visitor@example.test')),
          findsOneWidget,
        );
        expect(
          find.textContaining(adminLoginDateTime('2026-09-05T12:30:00Z')),
          findsOneWidget,
        );
        expect(
          find.text(
            language == AppLanguage.en
                ? 'Last sign-in: Not recorded'
                : '上次登录：未记录',
          ),
          findsOneWidget,
        );
        expect(find.textContaining(adminLoginTimezone()), findsOneWidget);
        final first = tester.getTopLeft(yes);
        final second = tester.getTopLeft(no);
        if (width > 760) {
          expect(second.dy, first.dy);
          expect(second.dx, greaterThan(first.dx));
        } else {
          expect(second.dy, greaterThan(first.dy));
        }
        final visible = tester
            .widgetList<Text>(find.byType(Text))
            .map((widget) => widget.data ?? '')
            .join('\n');
        if (language == AppLanguage.en) {
          expect(RegExp(r'[\u3400-\u9fff]').hasMatch(visible), false);
        }
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets(
    'each cohort is independently sorted and unknown status is not classified as no portfolio',
    (tester) async {
      await showDirectory(tester, [
        directoryUser(
          'saved-old',
          registered: true,
          login: '2026-09-01T00:00:00Z',
        ),
        directoryUser('visitor-old', login: '2026-09-01T00:00:00Z'),
        directoryUser(
          'saved-new',
          registered: true,
          login: '2026-09-05T00:00:00Z',
        ),
        directoryUser('visitor-new', login: '2026-09-05T00:00:00Z'),
        directoryUser('unknown', status: 'read_error'),
      ]);
      for (final prefix in ['saved', 'visitor']) {
        expect(
          tester.getTopLeft(find.byKey(ValueKey('admin-user-$prefix-new'))).dy,
          lessThan(
            tester
                .getTopLeft(find.byKey(ValueKey('admin-user-$prefix-old')))
                .dy,
          ),
        );
      }
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('admin-users-unknown')),
          matching: find.text('unknown@example.test'),
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'select, search and refresh remain actionable with both empty cohorts',
    (tester) async {
      String? selected;
      String? query;
      var refreshes = 0;
      await showDirectory(
        tester,
        [directoryUser('pick', registered: true)],
        select: (value) => selected = value,
        search: (value) => query = value,
        refresh: () async {
          refreshes++;
        },
      );
      await tester.tap(find.byKey(const ValueKey('admin-user-pick')));
      expect(selected, 'pick');
      await tester.enterText(
        find.byKey(const ValueKey('admin-users-search')),
        'a+b@example.test',
      );
      expect(query, 'a+b@example.test');
      await tester.tap(find.byKey(const ValueKey('admin-users-refresh')));
      await tester.pumpAndSettle();
      expect(refreshes, 1);
      await showDirectory(tester, []);
      expect(find.text('Portfolio registered (0)'), findsOneWidget);
      expect(find.text('No portfolio registered (0)'), findsOneWidget);
      expect(find.text('No matching users'), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'large groups scroll independently without expanding every user row',
    (tester) async {
      await showDirectory(
        tester,
        List.generate(
          120,
          (i) => directoryUser(
            'user-${i.toString().padLeft(3, '0')}',
            registered: i.isEven,
          ),
        ),
      );
      final list = find.byKey(const ValueKey('admin-user-list-registered-'));
      expect(tester.getSize(list).height, lessThanOrEqualTo(460));
      expect(find.text('user-118@example.test'), findsNothing);
      await tester.drag(list, const Offset(0, -10000));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
