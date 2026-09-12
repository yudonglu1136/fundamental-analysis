part of 'main.dart';

extension _FundamentalDesk on _FundamentalsPanelState {
  String factorTitle(String id) => switch (id) {
    'growth' => w('Growth', '增长'),
    'profit' => w('Profitability', '盈利能力'),
    'cash' => w('Cash flow', '现金流'),
    _ => w('Durable ROIC', '长期 ROIC'),
  };
  String factorRule(String id) => switch (id) {
    'growth' => w(
      'Quarterly revenue YoY ≥ ${pct(rules.growth)}',
      '季度收入同比 ≥ ${pct(rules.growth)}',
    ),
    'profit' => w(
      'TTM operating margin ≥ ${pct(rules.margin)}',
      'TTM 经营利润率 ≥ ${pct(rules.margin)}',
    ),
    'cash' => w(
      'TTM FCF margin ≥ ${pct(rules.cash)}',
      'TTM 自由现金流率 ≥ ${pct(rules.cash)}',
    ),
    _ => w(
      'ROIC ≥ ${pct(rules.roic)} in every one of ${rules.years} years',
      '连续 ${rules.years} 年 ROIC 均 ≥ ${pct(rules.roic)}',
    ),
  };
  void setRules(FundamentalRules next) => filter(() {
    rules = next;
    screen = 'combined';
    sort = 'matches';
  });
  Widget factorControls(double width) {
    final narrow = width < 700;
    final checks = rows.map(rules.check).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              w('1  Build your shortlist', '1  组合条件，生成候选清单'),
              style: st(17, true),
            ),
            const SizedBox(width: 8),
            ChoiceChip(
              key: const ValueKey('fund-preset-balanced'),
              label: Text(w('Balanced growth', '增长 + 盈利 + 现金流')),
              selected:
                  screen == 'combined' &&
                  rules.factors.length == 3 &&
                  !rules.factors.contains('quality') &&
                  rules.requireAll &&
                  !rules.improving &&
                  rules.growth == .15 &&
                  rules.margin == .10 &&
                  rules.cash == .05,
              onSelected: (_) => setRules(const FundamentalRules()),
            ),
            ChoiceChip(
              key: const ValueKey('fund-preset-quality'),
              label: Text(w('Add long-term quality', '再看长期质量')),
              selected:
                  screen == 'combined' && rules.factors.contains('quality'),
              onSelected: (_) => setRules(
                rules.copyWith(
                  factors: {'growth', 'profit', 'cash', 'quality'},
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final id in const ['growth', 'profit', 'cash', 'quality'])
              SizedBox(
                width: narrow ? width : (width - 36) / 4,
                child: Material(
                  color: screen == 'combined' && rules.factors.contains(id)
                      ? p.accent.withValues(alpha: .09)
                      : p.panel,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    key: ValueKey('fund-factor-$id'),
                    borderRadius: BorderRadius.circular(12),
                    onTap: () {
                      final next = {...rules.factors};
                      next.contains(id) ? next.remove(id) : next.add(id);
                      setRules(rules.copyWith(factors: next));
                    },
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color:
                              screen == 'combined' && rules.factors.contains(id)
                              ? p.accent
                              : p.border,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                screen == 'combined' &&
                                        rules.factors.contains(id)
                                    ? Icons.check_circle
                                    : Icons.add_circle_outline,
                                color: p.accent,
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  factorTitle(id),
                                  style: st(15, true),
                                ),
                              ),
                              Text(
                                '${checks.where((c) => c[id] == true).length}',
                                style: st(21, true, p.accent),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(factorRule(id), style: st(12)),
                          const SizedBox(height: 6),
                          Text(
                            w(
                              '${checks.where((c) => c[id] == null).length} missing · individual count',
                              '${checks.where((c) => c[id] == null).length} 家数据不全 · 单项数量',
                            ),
                            style: st(10, false, p.muted),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            ChoiceChip(
              key: const ValueKey('fund-match-all'),
              label: Text(w('Match all selected', '全部条件同时满足')),
              selected: rules.requireAll,
              onSelected: (_) => setRules(rules.copyWith(requireAll: true)),
            ),
            ChoiceChip(
              key: const ValueKey('fund-match-any'),
              label: Text(w('Match any selected', '满足任一条件')),
              selected: !rules.requireAll,
              onSelected: (_) => setRules(rules.copyWith(requireAll: false)),
            ),
            FilterChip(
              key: const ValueKey('fund-improving'),
              label: Text(w('Also improving vs prior quarter', '同时要求环比改善')),
              selected: rules.improving,
              onSelected: (v) => setRules(rules.copyWith(improving: v)),
            ),
            TextButton(
              key: const ValueKey('fund-screen-divergence'),
              onPressed: () => filter(() {
                screen = 'divergence';
                sort = 'change';
                detailTab = 'financials';
              }),
              child: Text(
                w('Inspect weakening cash / margins', '检查现金流或利润率恶化'),
                style: st(12, false, p.secondary),
              ),
            ),
          ],
        ),
        ExpansionTile(
          key: const ValueKey('fund-adjust'),
          tilePadding: EdgeInsets.zero,
          title: Text(w('Adjust thresholds', '调整筛选阈值'), style: st(13, true)),
          children: [
            Wrap(
              spacing: 14,
              runSpacing: 16,
              children: [
                ruleInput(
                  'growth',
                  w('Revenue growth ≥', '收入增速 ≥'),
                  rules.growth,
                  5,
                  (v) => setRules(rules.copyWith(growth: v)),
                ),
                ruleInput(
                  'margin',
                  w('Operating margin ≥', '经营利润率 ≥'),
                  rules.margin,
                  1,
                  (v) => setRules(rules.copyWith(margin: v)),
                ),
                ruleInput(
                  'cash',
                  w('FCF margin ≥', '自由现金流率 ≥'),
                  rules.cash,
                  1,
                  (v) => setRules(rules.copyWith(cash: v)),
                ),
                ruleInput(
                  'roic',
                  w('Annual ROIC ≥', '每年 ROIC ≥'),
                  rules.roic,
                  2,
                  (v) => setRules(rules.copyWith(roic: v)),
                ),
                SizedBox(
                  width: 150,
                  child: DropdownButtonFormField<int>(
                    isExpanded: true,
                    initialValue: rules.years,
                    decoration: InputDecoration(
                      labelText: w('ROIC history', 'ROIC 历史'),
                    ),
                    items: [
                      for (final y in const [3, 5, 10])
                        DropdownMenuItem(
                          value: y,
                          child: Text(w('$y years', '$y 年')),
                        ),
                    ],
                    onChanged: (v) => setRules(rules.copyWith(years: v)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            note(
              'Quality uses paid Jansen / SF1 annual ART observations: pre-tax EBIT / average invested capital, not after-tax ROIC. Every selected year must be available.',
              '质量使用付费 Jansen / SF1 年度 ART 数据：税前 EBIT / 平均投入资本，非税后 ROIC。所选年数必须完整。',
            ),
            const SizedBox(height: 8),
            note(
              'Improvement means a strictly positive change in each selected quarterly metric; annual ROIC uses its own multi-year rule.',
              '环比改善指所选季度指标变化严格大于零；年度 ROIC 使用独立多年条件。',
            ),
          ],
        ),
      ],
    );
  }

  Widget ruleInput(
    String id,
    String label,
    double value,
    double max,
    ValueChanged<double> change,
  ) => SizedBox(
    width: 175,
    child: _QualityNumberField(
      key: ValueKey('fund-threshold-$id'),
      title: label,
      value: value,
      maximum: max,
      color: p.text,
      onChanged: change,
      error: w(
        'Enter 0–${(max * 100).round()}',
        '请输入 0–${(max * 100).round()}',
      ),
    ),
  );

  Widget factorEvidence(Map<String, dynamic> r) {
    final status = rules.check(r), q = assessGrowthQuality(r, rules.annual);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(w('Why it is on your list', '为什么进入候选清单'), style: st(16, true)),
        const SizedBox(height: 8),
        if (screen != 'combined')
          Text(rule(screen), style: st(12, false, p.muted))
        else if (rules.factors.isEmpty)
          note(
            'Browsing all companies; no factor judgement applied.',
            '正在浏览全部公司，未应用因子判断。',
          )
        else
          for (final id in rules.factors)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    status[id] == true
                        ? Icons.check_circle_outline
                        : status[id] == null
                        ? Icons.help_outline
                        : Icons.remove_circle_outline,
                    size: 17,
                    color: status[id] == true ? p.accent : p.secondary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${factorRule(id)} · ${status[id] == true
                          ? w('Pass', '达标')
                          : status[id] == null
                          ? w('Missing', '缺数据')
                          : w('Below rule', '未达标')}',
                      style: st(12),
                    ),
                  ),
                ],
              ),
            ),
        if (rules.factors.contains('quality') && screen == 'combined') ...[
          Text(
            w(
              '${q.validYears}/${rules.years} verified years · lowest pre-tax ROIC ${pct(q.worst)}',
              '${q.validYears}/${rules.years} 年可核实 · 最低税前 ROIC ${pct(q.worst)}',
            ),
            style: st(12, false, p.muted),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              for (final y in q.years)
                Text(
                  'FY${y['year']}  ${pct(y['roic'])}',
                  style: st(11, false, p.muted),
                ),
            ],
          ),
        ],
        const SizedBox(height: 12),
        note(
          'A shortlist for further research, not a buy signal or a quality rating.',
          '这是后续研究候选清单，不是买入信号或质量评级。',
        ),
      ],
    );
  }

  Widget deskTabs() => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final id in const ['value', 'financials', 'gurus'])
          ChoiceChip(
            key: ValueKey('fund-detail-$id'),
            selected: detailTab == id,
            label: Text(switch (id) {
              'value' => w('Valuation', '估值'),
              'financials' => w('Financials', '财务'),
              _ => w('Guru quarter', 'Guru 季度'),
            }),
            onSelected: (_) {
              updateDesk(() => detailTab = id);
              remember();
              if (id == 'gurus' && guruData == null) unawaited(loadGurus());
            },
          ),
      ],
    ),
  );

  Future<void> loadGurus() async {
    final id = ++guruSerial,
        symbol = ticker,
        date = widget.asOf,
        quarter = guruQuarter;
    updateDesk(() {
      guruData = null;
      guruLoading = symbol.isNotEmpty;
      guruFailed = false;
    });
    if (symbol.isEmpty) return;
    try {
      final r = await widget.api.getJson(
        '/api/investment/fundamentals/${Uri.encodeComponent(symbol)}/gurus?asOf=$date${quarter.isEmpty ? '' : '&quarter=$quarter'}',
      );
      if (r['version'] != 'fundamental-guru-quarter-v1' ||
          r['ticker'] != symbol ||
          r['asOf'] != date ||
          (quarter.isNotEmpty && r['reportDate'] != quarter) ||
          asList(r['managers']).any(
            (m) =>
                m['ticker'] != symbol ||
                m['reportDate'] != r['reportDate'] ||
                text(m['availableAt']).compareTo(date) > 0,
          )) {
        throw StateError('Mismatched Guru evidence');
      }
      if (!mounted || id != guruSerial) return;
      updateDesk(() {
        guruData = r;
        guruQuarter = text(r['reportDate']);
        guruQuarters = (r['quarters'] as List? ?? [])
            .whereType<String>()
            .toList();
      });
      remember();
    } catch (_) {
      if (mounted && id == guruSerial) updateDesk(() => guruFailed = true);
    } finally {
      if (mounted && id == guruSerial) updateDesk(() => guruLoading = false);
    }
  }

  String filingQuarter(String date) {
    final d = DateTime.tryParse(date);
    return d == null ? '—' : '${d.year} Q${(d.month - 1) ~/ 3 + 1}';
  }

  Widget guruPanel() {
    final members = asList(guruData?['managers']),
        coverage = asMap(guruData?['coverage']);
    final quarters = guruQuarters;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          w('What did Gurus disclose?', 'Guru 当季披露了什么？'),
          style: st(17, true),
        ),
        const SizedBox(height: 8),
        note(
          'Calendar-quarter 13F disclosures, not the company’s fiscal quarter or execution dates.',
          '按自然季度查看 13F 披露，并非公司的财年季度或交易发生日期。',
        ),
        const SizedBox(height: 12),
        if (quarters.isNotEmpty)
          DropdownButtonFormField<String>(
            key: ValueKey('fund-guru-quarter-$guruQuarter'),
            initialValue: quarters.contains(guruQuarter) ? guruQuarter : null,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: w('13F reporting quarter', '13F 申报季度'),
            ),
            items: [
              for (final q in quarters)
                DropdownMenuItem(value: q, child: Text(filingQuarter(q))),
            ],
            onChanged: (q) {
              if (q == null) return;
              updateDesk(() => guruQuarter = q);
              remember();
              unawaited(loadGurus());
            },
          ),
        if (guruLoading)
          const Padding(
            padding: EdgeInsets.all(16),
            child: LinearProgressIndicator(minHeight: 2),
          )
        else if (guruFailed) ...[
          note(
            'Guru evidence could not be loaded. No ownership conclusion is available.',
            'Guru 证据加载失败，不能据此判断持仓情况。',
          ),
          action(
            'Retry Guru evidence',
            '重试 Guru 证据',
            () => unawaited(loadGurus()),
          ),
        ] else if (guruData != null) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 14,
            runSpacing: 8,
            children: [
              Text(
                w(
                  '${guruData!['managerCount']} hold',
                  '${guruData!['managerCount']} 位持有',
                ),
                style: st(14, true),
              ),
              Text(
                w(
                  '${guruData!['adds']} added / new',
                  '${guruData!['adds']} 位增持 / 新进',
                ),
                style: st(14, true, p.accent),
              ),
              Text(
                w(
                  '${guruData!['trims']} reduced / exited',
                  '${guruData!['trims']} 位减持 / 退出',
                ),
                style: st(14, true, p.secondary),
              ),
            ],
          ),
          const SizedBox(height: 8),
          note(
            '${coverage['reportedManagers'] ?? 0}/${coverage['eligibleManagers'] ?? 0} tracked managers filed · ${coverage['extractedBooks'] ?? 0} historical extracts',
            '${coverage['reportedManagers'] ?? 0}/${coverage['eligibleManagers'] ?? 0} 位跟踪经理已披露 · ${coverage['extractedBooks'] ?? 0} 份历史摘录',
          ),
          if (members.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Text(
                w(
                  'No matching holding or exit was found in the covered books for this quarter. This is not proof of no ownership.',
                  '本季度覆盖的账簿中未发现对应持仓或退出记录，不代表所有机构均未持有。',
                ),
                style: st(13, false, p.muted),
              ),
            ),
          for (final m in members)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Divider(color: p.border),
                  Row(
                    children: [
                      GuruAvatar(
                        guru: {
                          'id': m['guruId'],
                          'name': m['name'],
                          'avatarUrl': m['avatar'],
                        },
                        palette: p,
                        size: 32,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(text(m['name']), style: st(14, true)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    runSpacing: 6,
                    children: [
                      Text(
                        switch (text(m['action'])) {
                          'new' => w('New holding', '新进'),
                          'increased' => w('Increased', '增持'),
                          'reduced' => w('Reduced', '减持'),
                          'sold_out' => w('Exited', '退出'),
                          'mixed_claims' => w('Mixed share classes', '多个股份类别'),
                          _ => w('Reported holding', '披露持仓'),
                        },
                        style: st(
                          13,
                          true,
                          const {'reduced', 'sold_out'}.contains(m['action'])
                              ? p.secondary
                              : p.accent,
                        ),
                      ),
                      Text(
                        w(
                          'Weight ${holdingWeight(m['weight'])}',
                          '权重 ${holdingWeight(m['weight'])}',
                        ),
                        style: st(12),
                      ),
                      Text(
                        w(
                          'Share change ${shareCount(m['changeShares'], signed: true)}',
                          '股数变化 ${shareCount(m['changeShares'], signed: true)}',
                        ),
                        style: st(12),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    w(
                      '${shareCount(m['shares'])} shares · Public ${m['availableAt']}',
                      '${shareCount(m['shares'])} 股 · 披露 ${m['availableAt']}',
                    ),
                    style: st(11, false, p.muted),
                  ),
                  if (Uri.tryParse(text(m['sourceUrl']))?.scheme == 'https')
                    TextButton.icon(
                      onPressed: () => openBrowserPath(text(m['sourceUrl'])),
                      icon: const Icon(Icons.open_in_new, size: 13),
                      label: Text(w('Open filing', '查看原始申报')),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 10),
          note(
            'Reported share changes may include corporate actions; they are not verified trades. Historical extracts can omit positions. Quant funds excluded from this signal universe remain outside these counts.',
            '申报股数变化可能受公司行动影响，不等同于已核实交易。历史摘录可能遗漏持仓。此信号池排除的量化基金不计入数量。',
          ),
        ],
      ],
    );
  }

  String shareCount(dynamic value, {bool signed = false}) {
    final n = nullableNumber(value);
    return n == null ? '—' : '${signed && n > 0 ? '+' : ''}${formatNumber(n)}';
  }

  String holdingWeight(dynamic value) {
    final n = nullableNumber(value);
    if (n == null) return '—';
    if (n > 0 && n < .0001) return '<0.01%';
    return '${(n * 100).toStringAsFixed(2)}%';
  }
}
