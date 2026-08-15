import 'package:flutter_test/flutter_test.dart';

import 'package:guru_analysis_terminal/main.dart';

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
  });

  testWidgets('renders the auth shell', (WidgetTester tester) async {
    await tester.pumpWidget(const GuruTerminalApp());

    await tester.pump();

    expect(find.text('Executive Summary'), findsOneWidget);
    expect(find.text('GURU INTELLIGENCE'), findsOneWidget);
  });
}
