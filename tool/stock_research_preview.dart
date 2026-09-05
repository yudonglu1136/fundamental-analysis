// Local visual-QA harness only; never used as the production entrypoint.
// Uses the already-public, reviewed ISRG snapshot, not fabricated forecasts.
import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:guru_analysis_terminal/main.dart';

class PublicCasePreviewApi extends ApiClient {
  PublicCasePreviewApi() : super(() => '');
  @override
  Future<Map<String, dynamic>> getJson(String path) async {
    if (!path.startsWith('/api/valuation/ISRG?')) {
      throw StateError('Preview only covers the public ISRG case');
    }
    final response = await http.get(
      Uri.base.resolve('/research/isrg/snapshot.json'),
    );
    final source = asMap(jsonDecode(response.body));
    final previous = asMap(source['previous']),
        inputs = asMap(source['assumptions']);
    Map<String, dynamic> score(Map<String, dynamic> row) => {
      'valuationRevenue': row['forwardRevenueM'],
      'valuationFreeCashFlow': row['forwardFcfM'],
    };
    return {
      'ticker': {
        'ticker': 'ISRG',
        'name': source['company'],
        'currency': source['currency'],
        'latest': {
          'latestPrice': source['price'],
          'baseFairValue': source['fairValue'],
          'upsideToBase': source['upsideToPrice'],
          'latestPriceDate': source['priceDate'],
        },
        'history': asList(source['history'])
            .map(
              (row) => {
                'asOfDate': row['date'],
                'fairValue': row['fairValue'],
                'currentPrice': row['price'],
                if (row['date'] == source['asOfDate'] ||
                    row['date'] == previous['asOfDate'])
                  'dataSnapshot': {
                    'valuationSemantics': {
                      'scoreInputs': score(
                        row['date'] == source['asOfDate'] ? inputs : previous,
                      ),
                    },
                  },
              },
            )
            .toList(),
        'priceHistory': asList(
          source['prices'],
        ).map((row) => {'date': row['date'], 'close': row['price']}).toList(),
      },
    };
  }
}

void main() {
  final api = PublicCasePreviewApi(), palette = Palette(false);
  final language = parseAppLanguage(Uri.base.queryParameters['lang']);
  runApp(
    MaterialApp(
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        scaffoldBackgroundColor: palette.background,
        colorScheme: ColorScheme.dark(
          primary: palette.accent,
          surface: palette.panel,
        ),
      ),
      home: LanguageScope(
        language: language,
        child: StockResearchScope(
          api: api,
          palette: palette,
          sourceLabel: 'Preview · reviewed public ISRG case',
          child: Builder(
            builder: (context) => Scaffold(
              appBar: AppBar(
                title: Text(
                  context.tr(
                    '本地交互验收 · 非线上版本',
                    'Local interaction QA · not the live terminal',
                  ),
                ),
              ),
              body: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr(
                        '点股票 → 查看估值 → 返回原位置',
                        'Select a stock → inspect valuation → keep your place',
                      ),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      context.tr(
                        '使用已发布的 ISRG 案例数据校验真实组件。未接入私人账户或生产数据库。',
                        'Real components using the published ISRG case. No private accounts or production database attached.',
                      ),
                    ),
                    const SizedBox(height: 22),
                    const TextField(
                      key: ValueKey('preview-context'),
                      decoration: InputDecoration(
                        labelText: 'Context retention test',
                      ),
                    ),
                    const SizedBox(height: 16),
                    StockResearchButton(ticker: 'ISRG', palette: palette),
                    const SizedBox(height: 22),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        for (final ticker in [
                          'NVDA',
                          'AMZN',
                          'ISRG',
                          'PLTR',
                          'LSEG',
                          'BRK.A',
                          'BRK.B',
                          'GOOGL',
                          'MSFT',
                          'META',
                          'BN',
                          'HHH',
                          'CBRS',
                          'SPCX',
                          'HNGE',
                          'ASIC',
                          'VOYG',
                          'SLDE',
                        ])
                          Column(
                            children: [
                              StockLogo(
                                ticker: ticker,
                                palette: palette,
                                size: 42,
                              ),
                              Text(ticker),
                            ],
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
