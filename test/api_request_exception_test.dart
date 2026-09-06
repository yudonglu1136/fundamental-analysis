import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:guru_analysis_terminal/main.dart';

void main() {
  test(
    'API decoding retains status and machine code independently of prose',
    () {
      final error = ApiRequestException.fromResponse(
        http.Response(
          '{"error":"valuation_not_covered","message":"No released model"}',
          404,
        ),
      );
      expect(error.statusCode, 404);
      expect(error.code, 'valuation_not_covered');
      expect(error.toString(), 'Exception: No released model');
    },
  );
  test(
    'proxy HTML and legacy 404 messages never imply typed missing coverage',
    () {
      for (final response in [
        http.Response('<html>Gateway error</html>', 503),
        http.Response('{"error":"Valuation ticker not found: CRDO"}', 404),
        http.Response('', 401),
        http.Response('[]', 500),
      ]) {
        final error = ApiRequestException.fromResponse(response);
        expect(error.statusCode, response.statusCode);
        expect(error.code, isNot('valuation_not_covered'));
        expect(error.message, isNotEmpty);
      }
    },
  );
}
