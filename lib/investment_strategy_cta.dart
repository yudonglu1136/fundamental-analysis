part of 'main.dart';

String strategyCtaMode(BuildContext context, Map<String, dynamic>? policy) =>
    switch (policy?['mode']) {
      'hold' => context.tr('持有不调仓', 'Buy & hold'),
      'tranches' => context.tr('上涨减仓 · 回撤买回', 'Trim rallies · buy drawdowns'),
      'scheduled' => switch (policy?['frequency']) {
        'monthly' => context.tr('每月再平衡', 'Monthly rebalance'),
        'annually' => context.tr('每年再平衡', 'Annual rebalance'),
        _ => context.tr('每季度再平衡', 'Quarterly rebalance'),
      },
      _ => context.tr('跟随股票调仓（原规则）', 'With equity rebalances (legacy)'),
    };
String strategyCtaReason(BuildContext context, dynamic reason) =>
    switch (reason) {
      'initial_allocation' => context.tr('期初建仓', 'Initial allocation'),
      'scheduled_rebalance' => context.tr('定期再平衡', 'Scheduled rebalance'),
      'rally_trim' => context.tr('上涨分批减仓', 'Rally trim'),
      'drawdown_buyback' => context.tr('回撤分批买回', 'Drawdown buyback'),
      _ => context.tr('股票换仓 · CTA 不交易', 'Equity rotation · CTA unchanged'),
    };

class StrategyCtaDialog extends StatefulWidget {
  const StrategyCtaDialog({
    super.key,
    required this.palette,
    required this.weight,
    this.initial,
  });
  final Palette palette;
  final double weight;
  final Map<String, dynamic>? initial;
  @override
  State<StrategyCtaDialog> createState() => _StrategyCtaDialogState();
}

class _StrategyCtaDialogState extends State<StrategyCtaDialog> {
  late String mode, frequency;
  late TextEditingController floor, step, cooldown;
  final trims = <TextEditingController>[], buys = <TextEditingController>[];
  String w(String en, String zh) => context.tr(zh, en);
  TextEditingController control(num value) => TextEditingController(
    text: value.toStringAsFixed(value == value.roundToDouble() ? 0 : 1),
  );
  @override
  void initState() {
    super.initState();
    final p = widget.initial ?? {};
    mode = text(p['mode'], 'scheduled');
    frequency = text(p['frequency'], 'quarterly');
    floor = control(
      (nullableNumber(p['minWeight']) ?? math.min(.15, widget.weight)) * 100,
    );
    step = control((nullableNumber(p['trancheWeight']) ?? .05) * 100);
    cooldown = control(nullableNumber(p['cooldownSessions']) ?? 5);
    for (final v in p['trimThresholds'] as List? ?? [.15, .25, .35]) {
      trims.add(control(number(v) * 100));
    }
    for (final v in p['buyThresholds'] as List? ?? [.08, .12, .18]) {
      buys.add(control(number(v) * 100));
    }
  }

  @override
  void dispose() {
    for (final c in [floor, step, cooldown, ...trims, ...buys]) {
      c.dispose();
    }
    super.dispose();
  }

  double? value(TextEditingController c) => double.tryParse(c.text);
  bool levelsValid(List<TextEditingController> cs) =>
      cs.isNotEmpty &&
      List.generate(cs.length, (i) => i).every((i) {
        final n = value(cs[i]);
        return n != null &&
            n.isFinite &&
            n > 0 &&
            n < 100 &&
            (i == 0 || n > (value(cs[i - 1]) ?? double.infinity));
      });
  bool get valid {
    final f = value(floor), s = value(step), c = value(cooldown);
    return f != null &&
        f.isFinite &&
        f >= 0 &&
        f <= widget.weight * 100 &&
        s != null &&
        s.isFinite &&
        s > 0 &&
        s <= 50 &&
        c != null &&
        c.isFinite &&
        c == c.roundToDouble() &&
        c >= 0 &&
        c <= 252 &&
        levelsValid(trims) &&
        levelsValid(buys) &&
        buys.length >= trims.length;
  }

  Widget field(
    String key,
    String en,
    String zh,
    TextEditingController c, {
    String? suffix,
  }) => TextFormField(
    key: ValueKey(key),
    controller: c,
    keyboardType: const TextInputType.numberWithOptions(decimal: true),
    decoration: InputDecoration(labelText: w(en, zh), suffixText: suffix),
    onChanged: (_) => setState(() {}),
  );
  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    return AlertDialog(
      backgroundColor: p.panel,
      insetPadding: const EdgeInsets.all(16),
      title: Text(w('Configure CTA rules', '配置 CTA 规则')),
      content: SizedBox(
        width: 690,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                w(
                  'Initial allocation ${(widget.weight * 100).toStringAsFixed(0)}% · independent of equity selection',
                  '初始配置 ${(widget.weight * 100).toStringAsFixed(0)}% · 与股票选股周期独立',
                ),
                style: TextStyle(color: p.accent),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final item in [
                    ('hold', 'Buy & hold', '持有不调仓'),
                    ('scheduled', 'Scheduled', '定期再平衡'),
                    ('tranches', 'Flexible tranches', '灵活分批'),
                  ])
                    ChoiceChip(
                      key: ValueKey('cta-mode-${item.$1}'),
                      label: Text(w(item.$2, item.$3)),
                      selected: mode == item.$1,
                      onSelected: (_) => setState(() => mode = item.$1),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              if (mode == 'hold')
                Text(
                  w(
                    'Buy the initial CTA allocation, then keep its total-return units. Equity rotations do not rebalance CTA; its weight drifts with markets.',
                    '期初买入 CTA，之后保留其含分红再投资份额。股票换仓不调整 CTA，权重随市场漂移。',
                  ),
                ),
              if (mode == 'scheduled') ...[
                Text(
                  w(
                    'Restore the initial allocation at the first market close of each calendar period.',
                    '每个日历周期的首个交易日收盘，恢复初始配置比例。',
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final item in [
                      ('monthly', 'Monthly', '每月'),
                      ('quarterly', 'Quarterly', '每季度'),
                      ('annually', 'Annually', '每年'),
                    ])
                      ChoiceChip(
                        label: Text(w(item.$2, item.$3)),
                        selected: frequency == item.$1,
                        onSelected: (_) => setState(() => frequency = item.$1),
                      ),
                  ],
                ),
              ],
              if (mode == 'tranches') ...[
                Text(
                  w(
                    'Sell CTA after its own rallies. Only buy back after its own drawdowns, and only what this cycle trimmed. Proceeds stay invested in your equity mix.',
                    'CTA 自身上涨后减仓；只有自身回撤后才买回，且不超过本轮已减份额。卖出资金配置到现有股票组合，不留现金。',
                  ),
                ),
                const SizedBox(height: 18),
                Wrap(
                  spacing: 12,
                  runSpacing: 16,
                  children: [
                    SizedBox(
                      width: 180,
                      child: field(
                        'cta-floor',
                        'Minimum target',
                        '最低目标仓位',
                        floor,
                        suffix: '%',
                      ),
                    ),
                    SizedBox(
                      width: 180,
                      child: field(
                        'cta-step',
                        'Each tranche',
                        '每批目标调整',
                        step,
                        suffix: w('pp', '百分点'),
                      ),
                    ),
                    SizedBox(
                      width: 180,
                      child: field(
                        'cta-cooldown',
                        'Cooldown sessions',
                        '冷却交易日',
                        cooldown,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Text(
                  w('Editable trigger ladder', '可调整触发阶梯'),
                  style: TextStyle(fontWeight: FontWeight.bold, color: p.text),
                ),
                const SizedBox(height: 8),
                for (var i = 0; i < math.max(trims.length, buys.length); i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (i < trims.length)
                          Expanded(
                            child: field(
                              'cta-trim-$i',
                              'Rally ${i + 1}',
                              '上涨 ${i + 1}',
                              trims[i],
                              suffix: '%',
                            ),
                          )
                        else
                          const Expanded(child: SizedBox()),
                        const SizedBox(width: 8),
                        if (i < buys.length)
                          Expanded(
                            child: field(
                              'cta-buy-$i',
                              'Drawdown ${i + 1}',
                              '回撤 ${i + 1}',
                              buys[i],
                              suffix: '%',
                            ),
                          )
                        else
                          const Expanded(child: SizedBox()),
                        IconButton(
                          tooltip: w('Remove stage', '删除此档'),
                          onPressed: trims.length <= 1 || buys.length <= 1
                              ? null
                              : () => setState(() {
                                  if (i < trims.length) {
                                    trims.removeAt(i).dispose();
                                  }
                                  if (i < buys.length) {
                                    buys.removeAt(i).dispose();
                                  }
                                }),
                          icon: const Icon(Icons.remove_circle_outline),
                        ),
                      ],
                    ),
                  ),
                TextButton.icon(
                  onPressed: math.max(trims.length, buys.length) >= 8
                      ? null
                      : () => setState(() {
                          trims.add(
                            control(
                              math.min(99, (value(trims.last) ?? 0) + 10),
                            ),
                          );
                          buys.add(
                            control(math.min(99, (value(buys.last) ?? 0) + 5)),
                          );
                        }),
                  icon: const Icon(Icons.add),
                  label: Text(w('Add stage', '增加一档')),
                ),
                Text(
                  w(
                    'Rallies: from the cycle entry level. Drawdowns: from its peak, frozen after the first buyback. One stage per eligible session, each level once per cycle; cooldown sessions are skipped. After all sold tranches are restored, a new cycle begins.',
                    '上涨基准为本轮入场值；回撤从本轮高点计算，首次买回后冻结高点。每个可交易日最多执行一档，每档每轮只触发一次，冷却期间不触发。已卖份额买回完毕后重置新一轮。',
                  ),
                  style: TextStyle(fontSize: 12, color: p.muted),
                ),
              ],
              const SizedBox(height: 18),
              Text(
                w(
                  'Weights are before leverage. Signals use the previous total-return close; trades execute at the next session close with your trading costs. Equity selection and leverage resets cannot automatically refill CTA. No guarantee of downside protection.',
                  '仓位比例为杠杆前。以前一交易日含分红复权收盘值判断，下一交易日收盘执行，并计交易成本。股票换仓及杠杆重置不会自动补回 CTA，不保证下跌保护。',
                ),
                style: TextStyle(fontSize: 12, color: p.muted),
              ),
              if (!valid)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    w(
                      'Check the limits: minimum ≤ initial allocation; positive, increasing trigger levels below 100%; whole-session cooldown. Buyback levels must cover every trim stage.',
                      '请检查：最低目标不高于初始配置；触发值需大于 0、小于 100% 且递增；冷却天数为整数；买回档数须覆盖减仓档数。',
                    ),
                    style: TextStyle(color: p.secondary),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(w('Cancel', '取消')),
        ),
        FilledButton(
          key: const ValueKey('apply-cta-rules'),
          onPressed: !valid
              ? null
              : () => Navigator.pop(context, <String, dynamic>{
                  'mode': mode,
                  'frequency': frequency,
                  'minWeight': value(floor)! / 100,
                  'trancheWeight': value(step)! / 100,
                  'trimThresholds': trims.map((c) => value(c)! / 100).toList(),
                  'buyThresholds': buys.map((c) => value(c)! / 100).toList(),
                  'cooldownSessions': value(cooldown)!.toInt(),
                }),
          child: Text(w('Apply CTA rules', '应用 CTA 规则')),
        ),
      ],
    );
  }
}

class StrategyCtaHistory extends StatelessWidget {
  const StrategyCtaHistory({
    super.key,
    required this.data,
    required this.palette,
    required this.onDate,
  });
  final Map<String, dynamic> data;
  final Palette palette;
  final ValueChanged<String> onDate;
  @override
  Widget build(BuildContext context) {
    final results = asMap(data['results']), rules = asMap(data['rules']);
    final result = asMap(
      results[number(asMap(rules['leverage'])['multiple']) > 1
          ? 'leveraged'
          : 'blend'],
    );
    final rows = asList(result['allocationHistory']),
        events = asList(result['ctaEvents']);
    String w(String en, String zh) => context.tr(zh, en);
    String pct(dynamic n) => '${(number(n) * 100).toStringAsFixed(1)}%';
    if (rows.isEmpty) {
      return Text(
        w(
          'Run this CTA policy to inspect actual allocations and trades.',
          '运行此 CTA 规则后查看实际仓位及调仓。',
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: palette.panel,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            w('CTA allocation & trades', 'CTA 仓位与调仓'),
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: palette.text,
            ),
          ),
          Text(
            '${rules['cta']} · ${strategyCtaMode(context, asMap(rules['ctaPolicy']))} · ${w('Ending weight', '期末仓位')} ${pct(rows.last['ctaWeight'])}',
            style: TextStyle(color: palette.accent),
          ),
          const SizedBox(height: 12),
          Text(
            w(
              'Actual CTA weight · % of gross invested assets, before leverage',
              'CTA 实际仓位 · 占总投资资产比例，杠杆前',
            ),
            style: TextStyle(color: palette.muted, fontSize: 12),
          ),
          SizedBox(
            height: 150,
            width: double.infinity,
            child: CustomPaint(
              painter: StrategyCtaWeightPainter(rows, palette),
            ),
          ),
          Row(
            children: [
              Text(text(rows.first['date'])),
              const Spacer(),
              Text(text(rows.last['date'])),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            w(
              '${events.length} CTA events · select one to inspect holdings. Equity-only rotations preserve CTA units.',
              '${events.length} 次 CTA 事件 · 点击查看当时持仓。仅股票换仓的事件保留 CTA 份额。',
            ),
            style: TextStyle(color: palette.muted, fontSize: 12),
          ),
          const SizedBox(height: 10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 430),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: events.length,
              itemBuilder: (context, i) {
                final e = events[events.length - 1 - i];
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  onTap: () => onDate(text(e['date'])),
                  leading: Icon(
                    e['reason'] == 'rally_trim'
                        ? Icons.trending_down
                        : Icons.swap_vert,
                    color: e['reason'] == 'rally_trim'
                        ? palette.secondary
                        : palette.accent,
                  ),
                  title: Text(
                    '${e['date']} · ${strategyCtaReason(context, e['reason'])}',
                  ),
                  subtitle: Text(
                    '${pct(e['weightBefore'])} → ${pct(e['weightAfter'])}${e['signalDate'] == null ? '' : ' · ${w('Signal', '信号')} ${e['signalDate']}'}${e['signalReturn'] == null ? '' : ' · ${pct(e['signalReturn'])}'}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class StrategyCtaWeightPainter extends CustomPainter {
  StrategyCtaWeightPainter(this.rows, this.palette);
  final List<Map<String, dynamic>> rows;
  final Palette palette;
  @override
  void paint(Canvas canvas, Size size) {
    final values = rows.map((r) => number(r['ctaWeight'])).toList();
    if (values.length < 2) return;
    final high = math.max(.1, (values.reduce(math.max) * 10).ceil() / 10),
        width = size.width - 46,
        height = size.height - 20;
    for (var i = 0; i <= 4; i++) {
      final y = 10 + height * (1 - i / 4);
      canvas.drawLine(
        Offset(40, y),
        Offset(size.width - 6, y),
        Paint()..color = palette.border,
      );
      final label = TextPainter(
        text: TextSpan(
          text: '${(high * i / 4 * 100).round()}%',
          style: TextStyle(fontSize: 10, color: palette.muted),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      label.paint(canvas, Offset(0, y - 6));
    }
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = 40 + width * i / (values.length - 1),
          y = 10 + height * (1 - values[i] / high);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = palette.accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant StrategyCtaWeightPainter old) =>
      old.rows != rows || old.palette != palette;
}
