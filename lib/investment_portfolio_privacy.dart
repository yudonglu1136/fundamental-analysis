part of 'main.dart';

// Loaded synchronously before the first portfolio frame. Shared by Home and
// Portfolio; this is visual privacy, not an authorization or encryption layer.
final portfolioPrivacyMode = ValueNotifier<bool>(
  readPortfolioPrivacyPreference(),
);

double? portfolioRatio(dynamic numerator, dynamic denominator) {
  final n = nullableNumber(numerator), d = nullableNumber(denominator);
  if (n == null || d == null || !n.isFinite || !d.isFinite || d <= 0) {
    return null;
  }
  final result = n / d;
  return result.isFinite ? result : null;
}

String portfolioRateLabel(dynamic rate) {
  final value = nullableNumber(rate);
  return value == null || !value.isFinite
      ? '—'
      : '${value > 0 ? '+' : ''}${(value * 100).toStringAsFixed(2)}%';
}

List<Map<String, dynamic>> portfolioDatedNav(List<Map<String, dynamic>> rows) {
  final dates = <String, Map<String, dynamic>>{};
  final conflicts = <String>{};
  for (final row in rows) {
    final date = text(row['date']), nav = nullableNumber(row['nav']);
    if (DateTime.tryParse(date) == null || nav == null || !nav.isFinite) {
      continue;
    }
    if (dates.containsKey(date) && number(dates[date]!['nav']) != nav) {
      conflicts.add(date);
    }
    dates[date] = row;
  }
  return dates.entries
      .where((e) => !conflicts.contains(e.key))
      .map((e) => e.value)
      .toList()
    ..sort((a, b) => text(a['date']).compareTo(text(b['date'])));
}

// Never borrow a future NAV or mix base-currency groups. Exact mode is used
// for the explicitly reported previous date of a cash-adjusted interval.
double? portfolioNavBasis(
  List<Map<String, dynamic>> rows,
  String date, {
  bool strictlyBefore = false,
  bool exact = false,
}) {
  if (DateTime.tryParse(date) == null) return null;
  final eligible = portfolioDatedNav(rows).where(
    (r) => exact
        ? r['date'] == date
        : strictlyBefore
        ? text(r['date']).compareTo(date) < 0
        : text(r['date']).compareTo(date) <= 0,
  );
  final nav = nullableNumber(eligible.lastOrNull?['nav']);
  return nav != null && nav > 0 ? nav : null;
}

double? portfolioOpenPnlRate(
  Map<String, dynamic> row,
  List<Map<String, dynamic>> positions,
) {
  final matching = positions
      .where(
        (p) =>
            p['kind'] == 'equity' &&
            p['ticker'] == row['ticker'] &&
            p['assetCategory'] == row['assetCategory'],
      )
      .toList();
  if (matching.isEmpty) return null;
  var cost = 0.0, pnl = 0.0;
  for (final position in matching) {
    final value = nullableNumber(position['value']),
        gain = nullableNumber(position['unrealizedPnl']);
    if (value == null ||
        gain == null ||
        !value.isFinite ||
        !gain.isFinite ||
        number(position['quantity']) <= 0 ||
        value - gain <= 0) {
      return null;
    }
    cost += value - gain;
    pnl += gain;
  }
  final reported = nullableNumber(row['pnl']);
  if (reported == null || (pnl - reported).abs() > .01) return null;
  return portfolioRatio(reported, cost);
}

// Input P&L rows have already been rebased to the chosen interval. Preserve
// missing denominators as missing; never normalize P&L by P&L itself.
List<Map<String, dynamic>> portfolioPercentageSeries(
  List<Map<String, dynamic>> rows,
  double? basis, {
  required bool nav,
}) {
  return rows.map((r) {
    final ratio = portfolioRatio(r['nav'], basis);
    return <String, dynamic>{
      'date': r['date'],
      'nav': ratio == null ? null : ratio - (nav ? 1 : 0),
    };
  }).toList();
}

extension _PortfolioPrivacyControl on _PortfolioResearchPanelState {
  Widget privacyToggle() => Semantics(
    key: const ValueKey('portfolio-privacy-state'),
    toggled: hideAmounts,
    child: Tooltip(
      message: w(
        'Hide amounts, units and account labels on Home and Portfolio. Remembered in this browser; visual privacy only.',
        '隐藏首页与组合页的金额、数量及账户标识。本浏览器记住设置；仅用于屏幕隐私。',
      ),
      child: OutlinedButton.icon(
        key: const ValueKey('portfolio-privacy-toggle'),
        style: OutlinedButton.styleFrom(
          foregroundColor: hideAmounts ? p.accent : p.text,
          backgroundColor: hideAmounts ? p.accent.withValues(alpha: .10) : null,
        ),
        onPressed: () {
          final hidden = !hideAmounts;
          portfolioPrivacyMode.value = hidden;
          if (!writePortfolioPrivacyPreference(hidden)) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  w(
                    'Display changed for this visit. This browser could not save the privacy preference.',
                    '本次显示已切换，但浏览器无法保存隐私设置。',
                  ),
                ),
              ),
            );
          }
        },
        icon: Icon(
          hideAmounts
              ? Icons.visibility_off_outlined
              : Icons.visibility_outlined,
          size: 18,
        ),
        label: Text(
          hideAmounts
              ? w('Privacy on · Show amounts', '隐私已开启 · 显示金额')
              : w('Hide amounts', '隐藏金额'),
        ),
      ),
    ),
  );
}
