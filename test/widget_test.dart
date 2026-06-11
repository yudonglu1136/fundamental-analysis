import 'package:flutter_test/flutter_test.dart';

import 'package:guru_analysis_terminal/main.dart';

void main() {
  testWidgets('renders the auth shell', (WidgetTester tester) async {
    await tester.pumpWidget(const GuruTerminalApp());

    await tester.pump();

    expect(find.text('Executive Summary'), findsOneWidget);
    expect(find.text('GURU INTELLIGENCE'), findsOneWidget);
  });
}
