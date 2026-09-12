part of 'main.dart';

// Boolean conditions, not a fitted score. Missing inputs never pass a factor.
class FundamentalRules {
  final Set<String> factors;
  final double growth, margin, cash, roic;
  final bool requireAll, improving;
  final int years;
  const FundamentalRules({
    this.factors = const {'growth', 'profit', 'cash'},
    this.growth = .15,
    this.margin = .10,
    this.cash = .05,
    this.roic = .15,
    this.years = 5,
    this.requireAll = true,
    this.improving = false,
  });
  factory FundamentalRules.restore(Map<String, dynamic> value) {
    double threshold(String key, double fallback, double max) {
      final n = nullableNumber(value[key]);
      return n != null && n.isFinite && n >= 0 && n <= max ? n : fallback;
    }

    return FundamentalRules(
      factors: value['factors'] is List
          ? (value['factors'] as List)
                .whereType<String>()
                .where(const {'growth', 'profit', 'cash', 'quality'}.contains)
                .toSet()
          : const {'growth', 'profit', 'cash'},
      growth: threshold('growth', .15, 5),
      margin: threshold('margin', .10, 1),
      cash: threshold('cash', .05, 1),
      roic: threshold('roic', .15, 2),
      years: const [3, 5, 10].contains(value['years'])
          ? value['years'] as int
          : 5,
      requireAll: value['requireAll'] != false,
      improving: value['improving'] == true,
    );
  }
  FundamentalRules copyWith({
    Set<String>? factors,
    double? growth,
    double? margin,
    double? cash,
    double? roic,
    int? years,
    bool? requireAll,
    bool? improving,
  }) => FundamentalRules(
    factors: factors ?? this.factors,
    growth: growth ?? this.growth,
    margin: margin ?? this.margin,
    cash: cash ?? this.cash,
    roic: roic ?? this.roic,
    years: years ?? this.years,
    requireAll: requireAll ?? this.requireAll,
    improving: improving ?? this.improving,
  );
  Map<String, dynamic> get json => {
    'factors': factors.toList(),
    'growth': growth,
    'margin': margin,
    'cash': cash,
    'roic': roic,
    'years': years,
    'requireAll': requireAll,
    'improving': improving,
  };
  GrowthQualityRules get annual =>
      GrowthQualityRules(years: years, passingYears: years, roic: roic);
  Map<String, bool?> check(Map<String, dynamic> row) {
    final m = asMap(row['metrics']), d = asMap(row['changes']);
    bool? meets(String key, double minimum) {
      final n = nullableNumber(m[key]), change = nullableNumber(d[key]);
      if (n == null ||
          !n.isFinite ||
          (improving && (change == null || !change.isFinite))) {
        return null;
      }
      return n >= minimum - 1e-10 && (!improving || change! > 0);
    }

    final q = assessGrowthQuality(row, annual);
    return {
      'growth': meets('revenueGrowth', growth),
      'profit': meets('operatingMargin', margin),
      'cash': meets('fcfMargin', cash),
      'quality': q.complete ? q.passes : null,
    };
  }

  int hits(Map<String, dynamic> row) {
    final c = check(row);
    return factors.where((k) => c[k] == true).length;
  }

  bool accepts(Map<String, dynamic> row) =>
      factors.isEmpty ||
      (requireAll ? hits(row) == factors.length : hits(row) > 0);
}
