part of 'main.dart';

List<Map<String, dynamic>> filterValueFlowCompanies(
  List<Map<String, dynamic>> rows, {
  required String stage,
  String query = '',
  bool belowValue = false,
  String sort = 'growth',
}) {
  final q = query.trim().toLowerCase();
  final selected = rows.where((r) {
    final matches = q.isEmpty
        ? r['layer'] == stage
        : '${r['ticker']} ${r['name']}'.toLowerCase().contains(q);
    return matches &&
        (!belowValue || (nullableNumber(r['modelGap']) ?? -1) > 0);
  }).toList();
  double? metric(Map<String, dynamic> r) => nullableNumber(
    sort == 'value' ? r['modelGap'] : asMap(r['metrics'])['revenueGrowth'],
  );
  selected.sort((a, b) {
    final x = metric(a), y = metric(b);
    if (x == null && y != null) return 1;
    if (y == null && x != null) return -1;
    return (y ?? 0).compareTo(x ?? 0) != 0
        ? (y ?? 0).compareTo(x ?? 0)
        : text(a['ticker']).compareTo(text(b['ticker']));
  });
  return selected;
}

class ValueFlowPanel extends StatefulWidget {
  const ValueFlowPanel({
    super.key,
    required this.api,
    required this.palette,
    required this.asOf,
    required this.onCompany,
    required this.onGuru,
    this.initialSelection = const {},
    this.onSelection,
  });
  final ApiClient api;
  final Palette palette;
  final String asOf;
  final void Function(String ticker, String section) onCompany;
  final ValueChanged<String> onGuru;
  final Map<String, dynamic> initialSelection;
  final ValueChanged<Map<String, dynamic>>? onSelection;
  @override
  State<ValueFlowPanel> createState() => _ValueFlowPanelState();
}

class _ValueFlowPanelState extends State<ValueFlowPanel> {
  Map<String, dynamic>? data;
  String stage = 'compute_silicon', symbol = 'NVDA', sort = 'growth';
  bool loading = true, failed = false, belowValue = false;
  int serial = 0;
  final search = TextEditingController();
  final stagesScroll = ScrollController();
  final evidenceAnchor = GlobalKey();
  final comparisonAnchor = GlobalKey();
  Palette get p => widget.palette;
  String w(String en, String zh) => context.tr(zh, en);
  String localized(dynamic value) =>
      text(asMap(value)[context.isEnglish ? 'en' : 'zh']);
  String pct(dynamic v, {bool signed = false}) {
    final n = nullableNumber(v);
    return n == null
        ? '—'
        : '${signed && n > 0 ? '+' : ''}${(n * 100).toStringAsFixed(1)}%';
  }

  String money(dynamic v, dynamic currency) => nullableNumber(v) == null
      ? '—'
      : '${text(currency)} ${number(v).toStringAsFixed(2)}';
  TextStyle style([double size = 14, bool bold = false, Color? color]) =>
      TextStyle(
        fontSize: size,
        height: 1.4,
        fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
        color: color ?? p.text,
      );
  List<Map<String, dynamic>> get companies => asList(data?['companies']);
  List<Map<String, dynamic>> get layers => asList(data?['layers']);
  List<Map<String, dynamic>> get matches => filterValueFlowCompanies(
    companies,
    stage: stage,
    query: search.text,
    belowValue: belowValue,
    sort: sort,
  );
  Map<String, dynamic> get selectedLayer =>
      layers.where((l) => l['id'] == stage).firstOrNull ?? {};
  Map<String, dynamic>? get selected =>
      matches.where((r) => r['ticker'] == symbol).firstOrNull ??
      matches.firstOrNull;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialSelection;
    stage = text(initial['stage'], 'compute_silicon');
    symbol = text(initial['symbol'], 'NVDA');
    sort = text(initial['sort'], 'growth');
    search.text = text(initial['query']);
    belowValue = initial['belowValue'] == true;
    unawaited(load());
  }

  void rememberSelection() => widget.onSelection?.call({
    'stage': stage,
    'symbol': selected?['ticker'] ?? symbol,
    'sort': sort,
    'query': search.text,
    'belowValue': belowValue,
  });

  void openCompany(Map<String, dynamic> row, String destination) {
    rememberSelection();
    widget.onCompany(text(row['ticker']), destination);
  }

  @override
  void didUpdateWidget(covariant ValueFlowPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.asOf != widget.asOf || oldWidget.api != widget.api) {
      unawaited(load());
    }
  }

  @override
  void dispose() {
    serial++;
    search.dispose();
    stagesScroll.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final request = ++serial, date = widget.asOf;
    setState(() {
      loading = true;
      failed = false;
      data = null;
    });
    try {
      final response = await widget.api.getJson(
        '/api/investment/value-flow?asOf=$date',
      );
      if (response['version'] != 'value-flow-v1' || response['asOf'] != date) {
        throw StateError('Wrong snapshot');
      }
      if (mounted && request == serial) {
        setState(() => data = response);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && stagesScroll.hasClients) {
            final index = layers.indexWhere((l) => l['id'] == stage);
            stagesScroll.jumpTo(
              (index * 195.0).clamp(0, stagesScroll.position.maxScrollExtent),
            );
          }
        });
      }
    } catch (_) {
      if (mounted && request == serial) setState(() => failed = true);
    } finally {
      if (mounted && request == serial) setState(() => loading = false);
    }
  }

  Widget panel(
    List<Widget> children, {
    EdgeInsets padding = const EdgeInsets.all(22),
  }) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: p.panel,
      border: Border.all(color: p.border),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    ),
  );
  Widget caption(String en, String zh) =>
      Text(w(en, zh), style: style(12, false, p.muted));
  Widget heading(String step, String en, String zh) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Row(
      children: [
        Container(
          width: 25,
          height: 25,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: p.accent.withValues(alpha: .12),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(step, style: style(12, true, p.accent)),
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(w(en, zh), style: style(17, true))),
      ],
    ),
  );
  IconData stageIcon(String id) => switch (id) {
    'power_cooling' => Icons.bolt_outlined,
    'semi_tools' => Icons.precision_manufacturing_outlined,
    'compute_silicon' => Icons.memory_outlined,
    'foundry_memory' => Icons.layers_outlined,
    'systems_network' => Icons.hub_outlined,
    'cloud_compute' => Icons.cloud_outlined,
    'model_data' => Icons.data_object,
    _ => Icons.apps_outlined,
  };
  void changeStage(String id) {
    setState(() {
      stage = id;
      search.clear();
      symbol = '';
    });
  }

  void selectCompany(Map<String, dynamic> r, bool compact) {
    setState(() => symbol = text(r['ticker']));
    if (compact) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && evidenceAnchor.currentContext != null) {
          Scrollable.ensureVisible(
            evidenceAnchor.currentContext!,
            duration: const Duration(milliseconds: 250),
            alignment: .05,
          );
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return panel([
        Text(
          w('Building your value-chain view…', '正在读取产业链研究数据…'),
          style: style(20, true),
        ),
        const SizedBox(height: 14),
        const LinearProgressIndicator(minHeight: 2),
        const SizedBox(height: 12),
        caption(
          'Aligning financials, prices and disclosures to ${widget.asOf}.',
          '正在对齐 ${widget.asOf} 之前的财务、价格和持仓披露。',
        ),
      ]);
    }
    if (failed) {
      return panel([
        Text(
          w('The value chain could not be loaded.', '暂时无法加载产业链。'),
          style: style(20, true),
        ),
        caption(
          'Your saved research is unchanged. Retry to reload the dated evidence.',
          '已保存研究不受影响，重试以重新加载当时可用的数据。',
        ),
        const SizedBox(height: 14),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: load,
            icon: const Icon(Icons.refresh),
            label: Text(w('Retry value chain', '重试产业链')),
          ),
        ),
      ]);
    }
    if (layers.isEmpty) {
      return panel([
        Text(
          w('No value-chain coverage is available.', '暂无产业链覆盖。'),
          style: style(20, true),
        ),
        caption(
          'Select another research view while the curated company map is unavailable.',
          '当前分类图谱不可用，请先使用其他研究视图。',
        ),
      ]);
    }
    final coverage = asMap(data?['coverage']);
    return LayoutBuilder(
      builder: (_, constraints) {
        final compact = constraints.maxWidth < 900;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        w('AI value chain', 'AI 产业链研究'),
                        style: style(28, true),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        w(
                          'Find the businesses behind the buildout. Check the price before building a thesis.',
                          '找到产业扩张背后的公司，再检验价格是否值得研究。',
                        ),
                        style: style(14, false, p.muted),
                      ),
                    ],
                  ),
                ),
                if (!compact)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: p.card,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      w(
                        '${coverage['comparable']} / ${coverage['total']} comparable valuations',
                        '${coverage['comparable']} / ${coverage['total']} 家估值可比',
                      ),
                      style: style(13, true, p.accent),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            caption(
              'Current classification · financial evidence available by ${widget.asOf} · company-wide metrics, not AI segment revenue.',
              '当前产业分类 · 财务数据截至 ${widget.asOf} · 指标为公司整体，并非 AI 分部收入。',
            ),
            const SizedBox(height: 22),
            heading('1', 'Choose a part of the value chain', '选择产业链环节'),
            stageMap(constraints.maxWidth),
            const SizedBox(height: 10),
            caption(
              'Stage cards show median quarterly revenue YoY. Bars show positive-growth companies / companies with growth data.',
              '环节卡片显示季度营收同比中位数；进度条表示正增长公司数 / 有增长数据的公司数。',
            ),
            const SizedBox(height: 24),
            if (!compact)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(flex: 6, child: companyList(false)),
                  const SizedBox(width: 20),
                  Expanded(flex: 4, child: companyEvidence()),
                ],
              )
            else ...[
              companyList(true),
              const SizedBox(height: 20),
              companyEvidence(),
            ],
            const SizedBox(height: 20),
            sources(),
          ],
        );
      },
    );
  }

  Widget stageMap(double width) {
    Widget tile(Map<String, dynamic> layer, double tileWidth) {
      final active = layer['id'] == stage;
      final known = number(layer['financialCount']);
      return SizedBox(
        width: tileWidth,
        child: Semantics(
          button: true,
          selected: active,
          child: Material(
            color: active ? p.accent.withValues(alpha: .09) : p.panel,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: BorderSide(
                color: active ? p.accent : p.border,
                width: active ? 1.5 : 1,
              ),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => changeStage(text(layer['id'])),
              child: Padding(
                padding: const EdgeInsets.all(15),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          stageIcon(text(layer['id'])),
                          color: active ? p.accent : p.muted,
                          size: 21,
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: SizedBox(
                            height: MediaQuery.textScalerOf(context).scale(40),
                            child: Text(
                              localized(layer['name']),
                              style: style(14, true),
                              maxLines: 2,
                            ),
                          ),
                        ),
                        Text(
                          '${layer['order']}'.padLeft(2, '0'),
                          style: style(11, false, p.muted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      pct(layer['medianGrowth'], signed: true),
                      style: style(23, true, active ? p.accent : p.text),
                    ),
                    const SizedBox(height: 7),
                    ExcludeSemantics(
                      child: LinearProgressIndicator(
                        value: known > 0
                            ? number(layer['positiveGrowth']) / known
                            : 0,
                        minHeight: 3,
                        backgroundColor: p.border,
                        color: p.accent,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      w(
                        '${layer['positiveGrowth']}/${layer['financialCount']} growing · ${layer['total']} tracked',
                        '${layer['positiveGrowth']}/${layer['financialCount']} 家正增长 · 跟踪 ${layer['total']} 家',
                      ),
                      style: style(11, false, p.muted),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (width < 650) {
      return Column(
        children: [
          SizedBox(
            height: MediaQuery.textScalerOf(context).scale(188),
            child: SingleChildScrollView(
              controller: stagesScroll,
              scrollDirection: Axis.horizontal,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final l in layers)
                    Padding(
                      padding: const EdgeInsets.only(right: 10),
                      child: tile(l, 185),
                    ),
                ],
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: caption(
                  'Swipe to explore all 8 stages',
                  '左右滑动浏览全部 8 个环节',
                ),
              ),
              IconButton(
                tooltip: w('Previous stages', '前面的环节'),
                onPressed: () => stagesScroll.animateTo(
                  (stagesScroll.offset - 390).clamp(
                    0,
                    stagesScroll.position.maxScrollExtent,
                  ),
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOut,
                ),
                icon: const Icon(Icons.chevron_left),
              ),
              IconButton(
                tooltip: w('Next stages', '后面的环节'),
                onPressed: () => stagesScroll.animateTo(
                  (stagesScroll.offset + 390).clamp(
                    0,
                    stagesScroll.position.maxScrollExtent,
                  ),
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOut,
                ),
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
        ],
      );
    }
    final columns = width >= 1650 ? 8 : 4;
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final l in layers) tile(l, (width - (columns - 1) * 10) / columns),
      ],
    );
  }

  Widget companyList(bool compact) {
    final rows = matches, chosen = selected;
    return Column(
      key: comparisonAnchor,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        heading('2', 'Compare the companies', '比较环节内的公司'),
        panel([
          Text(
            search.text.trim().isEmpty
                ? localized(selectedLayer['name'])
                : w('Search across the value chain', '搜索整个产业链'),
            style: style(22, true),
          ),
          const SizedBox(height: 6),
          Text(
            search.text.trim().isEmpty
                ? localized(selectedLayer['description'])
                : w(
                    'Results from all 8 stages; clear search to return to your selected stage.',
                    '结果来自所有环节；清空搜索以返回所选环节。',
                  ),
            style: style(13, false, p.muted),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: search,
            onChanged: (_) => setState(() => symbol = ''),
            decoration: InputDecoration(
              hintText: w(
                'Search all ${companies.length} companies',
                '搜索全部 ${companies.length} 家公司',
              ),
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: search.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: w('Clear search', '清空搜索'),
                      onPressed: () => setState(() {
                        search.clear();
                        symbol = '';
                      }),
                      icon: const Icon(Icons.close, size: 18),
                    ),
              border: const OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilterChip(
                label: Text(w('Below model value', '价格低于模型估值')),
                selected: belowValue,
                onSelected: (v) => setState(() {
                  belowValue = v;
                  symbol = '';
                }),
              ),
              PopupMenuButton<String>(
                tooltip: w('Sort companies', '公司排序'),
                initialValue: sort,
                onSelected: (v) => setState(() => sort = v),
                itemBuilder: (_) => [
                  PopupMenuItem(
                    value: 'growth',
                    child: Text(
                      w('Revenue growth: highest first', '营收增速：从高到低'),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'value',
                    child: Text(w('Model gap: highest first', '模型差距：从高到低')),
                  ),
                ],
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 12,
                    horizontal: 8,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.sort, size: 16),
                      const SizedBox(width: 7),
                      Text(
                        sort == 'growth'
                            ? w('Revenue growth', '营收增速')
                            : w('Model gap', '模型差距'),
                        style: style(12),
                      ),
                      const Icon(Icons.expand_more, size: 16),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          caption(
            '${rows.length} companies · select a row to inspect',
            '${rows.length} 家公司 · 点选一行查看证据',
          ),
          const SizedBox(height: 14),
          if (rows.isEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Text(
                w('No companies match these filters.', '当前筛选没有匹配公司。'),
                style: style(16, true),
              ),
            ),
            OutlinedButton(
              onPressed: () => setState(() {
                search.clear();
                belowValue = false;
              }),
              child: Text(w('Reset search & filters', '重置搜索和筛选')),
            ),
          ] else ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: Row(
                children: [
                  Expanded(flex: 5, child: caption('Company', '公司')),
                  Expanded(
                    flex: 3,
                    child: Text(
                      w('Revenue YoY', '营收同比'),
                      textAlign: TextAlign.right,
                      style: style(11, false, p.muted),
                    ),
                  ),
                  Expanded(
                    flex: 3,
                    child: Text(
                      w('Model gap', '模型差距'),
                      textAlign: TextAlign.right,
                      style: style(11, false, p.muted),
                    ),
                  ),
                ],
              ),
            ),
            for (final r in rows)
              companyRow(r, chosen?['ticker'] == r['ticker'], compact),
          ],
          const SizedBox(height: 14),
          caption(
            'Model gap = published value / price − 1. A positive gap is not a buy signal.',
            '模型差距 = 已发布估值 / 股价 − 1。正差距不等于买入信号。',
          ),
        ]),
      ],
    );
  }

  Widget companyRow(Map<String, dynamic> r, bool active, bool compact) =>
      Semantics(
        selected: active,
        child: Material(
          color: active ? p.accent.withValues(alpha: .10) : Colors.transparent,
          child: InkWell(
            key: ValueKey('value-flow-company-${r['ticker']}'),
            onTap: () => selectCompany(r, compact),
            child: Container(
              constraints: const BoxConstraints(minHeight: 80),
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: p.border),
                  left: BorderSide(
                    color: active ? p.accent : Colors.transparent,
                    width: 2,
                  ),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    flex: 5,
                    child: Row(
                      children: [
                        StockLogo(
                          ticker: text(r['ticker']),
                          palette: p,
                          size: compact ? 28 : 32,
                          backgroundColor:
                              const {'AMZN', 'MRVL'}.contains(r['ticker'])
                              ? p.card
                              : null,
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(text(r['ticker']), style: style(14, true)),
                              const SizedBox(height: 3),
                              Text(
                                compact
                                    ? text(r['period'], w('No model', '无模型'))
                                    : text(r['name']),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: style(11, false, p.muted),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    flex: 3,
                    child: Text(
                      pct(asMap(r['metrics'])['revenueGrowth']),
                      textAlign: TextAlign.right,
                      style: style(13, true),
                    ),
                  ),
                  Expanded(
                    flex: 3,
                    child: Text(
                      pct(r['modelGap'], signed: true),
                      textAlign: TextAlign.right,
                      style: style(
                        13,
                        true,
                        nullableNumber(r['modelGap']) == null
                            ? p.muted
                            : number(r['modelGap']) >= 0
                            ? p.accent
                            : p.secondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

  Widget companyEvidence() {
    final r = selected;
    if (r == null) return const SizedBox.shrink();
    final v = asMap(r['valuation']),
        price = asMap(r['price']),
        metrics = asMap(r['metrics']),
        holders = asList(r['holders']);
    final layer = layers.where((l) => l['id'] == r['layer']).firstOrNull ?? {};
    return Column(
      key: evidenceAnchor,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        heading('3', 'Inspect the evidence', '看证据，再进入估值'),
        if (MediaQuery.sizeOf(context).width < 1100)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () {
                if (comparisonAnchor.currentContext != null) {
                  Scrollable.ensureVisible(
                    comparisonAnchor.currentContext!,
                    duration: const Duration(milliseconds: 250),
                    alignment: .05,
                  );
                }
              },
              icon: const Icon(Icons.arrow_upward, size: 16),
              label: Text(w('Back to company comparison', '返回公司比较')),
            ),
          ),
        panel([
          Row(
            children: [
              StockLogo(
                ticker: text(r['ticker']),
                palette: p,
                size: 44,
                backgroundColor: const {'AMZN', 'MRVL'}.contains(r['ticker'])
                    ? p.card
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(text(r['ticker']), style: style(27, true)),
                    Text(text(r['name']), style: style(12, false, p.muted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(localized(layer['name']), style: style(12, true, p.accent)),
          const SizedBox(height: 6),
          Text(localized(r['role']), style: style(13, false, p.muted)),
          const SizedBox(height: 18),
          const Divider(height: 1),
          const SizedBox(height: 18),
          Text(
            w('Does the price leave room?', '价格是否留有空间？'),
            style: style(17, true),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (_, c) => Wrap(
              spacing: 16,
              runSpacing: 12,
              children: [
                SizedBox(
                  width: (c.maxWidth - 16) / 2,
                  child: metricBlock(
                    w('Market price', '市场价格'),
                    money(price['value'], price['currency']),
                    text(price['date'], '—'),
                  ),
                ),
                SizedBox(
                  width: (c.maxWidth - 16) / 2,
                  child: metricBlock(
                    w('Published value', '已发布估值'),
                    money(v['fairValue'], v['currency']),
                    text(v['date'], '—'),
                    accent: true,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: p.card,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Wrap(
              spacing: 12,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  pct(r['modelGap'], signed: true),
                  style: style(
                    24,
                    true,
                    number(r['modelGap']) < 0 ? p.secondary : p.accent,
                  ),
                ),
                Text(
                  w('value / price − 1', '估值 / 价格 − 1'),
                  style: style(12, false, p.muted),
                ),
              ],
            ),
          ),
          if (r['status'] != 'available') ...[
            const SizedBox(height: 10),
            Text(
              statusMessage(text(r['status'])),
              style: style(12, false, p.secondary),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            key: const ValueKey('value-flow-open-valuation'),
            onPressed: r['source'] == null
                ? null
                : () => openCompany(r, 'value'),
            icon: const Icon(Icons.tune, size: 17),
            label: Text(
              w('Test ${r['ticker']} valuation', '检验 ${r['ticker']} 估值'),
            ),
          ),
          const SizedBox(height: 8),
          caption(
            'Published model, not your own assumptions or an expected return.',
            '这是平台已发布模型，不是您的个人假设或预期回报。',
          ),
          const SizedBox(height: 22),
          const Divider(height: 1),
          const SizedBox(height: 18),
          Text(
            w('What did the business deliver?', '公司交出了什么业绩？'),
            style: style(17, true),
          ),
          const SizedBox(height: 6),
          caption(
            '${text(r['period'], '—')} · public ${text(r['availableAt'], '—')}',
            '${text(r['period'], '—')} · 公开于 ${text(r['availableAt'], '—')}',
          ),
          const SizedBox(height: 10),
          for (final metric in [
            ('revenueGrowth', 'Revenue YoY', '营收同比'),
            ('operatingMargin', 'Operating margin · TTM', '营业利润率 · TTM'),
            ('fcfMargin', 'FCF margin · TTM', '自由现金流率 · TTM'),
          ])
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 9),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      w(metric.$2, metric.$3),
                      style: style(12, false, p.muted),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(pct(metrics[metric.$1]), style: style(15, true)),
                      if (nullableNumber(asMap(r['changes'])[metric.$1]) !=
                          null)
                        Text(
                          '${number(asMap(r['changes'])[metric.$1]) >= 0 ? '+' : ''}${(number(asMap(r['changes'])[metric.$1]) * 100).toStringAsFixed(1)} ${w('pp vs prior', '个百分点 较前期')}',
                          style: style(10, false, p.muted),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          if (r['source'] != null)
            TextButton.icon(
              onPressed: () => openCompany(r, 'financials'),
              icon: const Icon(Icons.receipt_long_outlined, size: 16),
              label: Text(w('Read the quarterly evidence', '查看季度财报证据')),
            ),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 18),
          Text(
            w('Who disclosed a position?', '哪些大佬披露了持仓？'),
            style: style(17, true),
          ),
          const SizedBox(height: 6),
          caption(
            'Reported holdings, not live trades or an endorsement.',
            '这是已披露持仓，不是实时交易或投资背书。',
          ),
          if (data?['guruCoverage'] == null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: caption(
                'Guru disclosures are temporarily unavailable.',
                '大佬持仓披露暂不可用。',
              ),
            )
          else if (holders.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: caption(
                'No holders in the covered disclosure extract. This does not mean no institutional ownership.',
                '覆盖的披露摘录中未找到持有人，不代表没有机构持仓。',
              ),
            )
          else ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 7,
              runSpacing: 8,
              children: [
                for (final h in holders)
                  ActionChip(
                    avatar: GuruAvatar(
                      guru: {
                        'id': h['guruId'],
                        'name': h['name'],
                        'avatarUrl': h['avatar'],
                      },
                      palette: p,
                      size: 24,
                    ),
                    label: Text(text(h['name']), style: style(11)),
                    onPressed: () {
                      rememberSelection();
                      widget.onGuru(text(h['guruId']));
                    },
                  ),
              ],
            ),
            const SizedBox(height: 10),
            caption(
              'Report ${text(asMap(data?['guruCoverage'])['reportDate'])} · ${holders.length} covered holders',
              '报告期 ${text(asMap(data?['guruCoverage'])['reportDate'])} · ${holders.length} 位覆盖持有人',
            ),
          ],
        ]),
      ],
    );
  }

  Widget metricBlock(
    String label,
    String value,
    String date, {
    bool accent = false,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: style(11, false, p.muted)),
      const SizedBox(height: 5),
      Text(value, style: style(20, true, accent ? p.accent : p.text)),
      const SizedBox(height: 4),
      Text(date, style: style(11, false, p.muted)),
    ],
  );
  String statusMessage(String status) => switch (status) {
    'no_model' => w(
      'No dated model for this company in the connected source. A missing model is not a zero valuation.',
      '已连接数据中没有该公司在此日期的模型。缺失模型不等于估值为零。',
    ),
    'invalid_lineage' => w(
      'Source dates could not be verified. Valuation is withheld.',
      '无法验证数据日期，暂不展示估值。',
    ),
    'no_price' => w(
      'No eligible historical price. The model gap cannot be calculated.',
      '没有合格的历史价格，无法计算模型差距。',
    ),
    'currency_unverified' => w(
      'Price and model currencies are not reconciled. No gap is calculated.',
      '价格与模型币种尚未对齐，不计算差距。',
    ),
    _ => w(
      'No positive published value is available at this date.',
      '此日期没有可用的正数已发布估值。',
    ),
  };
  Widget sources() => ExpansionTile(
    title: Text(
      w('Coverage, dates & how to read this view', '覆盖范围、日期与阅读方法'),
      style: style(13, true),
    ),
    tilePadding: const EdgeInsets.symmetric(horizontal: 4),
    childrenPadding: const EdgeInsets.only(bottom: 16),
    children: [
      Align(
        alignment: Alignment.centerLeft,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            caption(
              '${asMap(data?['coverage'])['financial']} / ${companies.length} companies have financial observations; ${asMap(data?['coverage'])['comparable']} have currency-matched price/value pairs. Missing companies remain visible.',
              '${asMap(data?['coverage'])['financial']} / ${companies.length} 家有财务观测，${asMap(data?['coverage'])['comparable']} 家有币种一致的价格与估值。缺数据的公司仍保留显示。',
            ),
            const SizedBox(height: 8),
            caption(
              'Financials: stored PIT model inputs, usually Sharadar SF1. Growth is quarterly YoY; margins use TTM (FCF = CFO − capex). Not all companies report on the same fiscal calendar.',
              '财务：已存储的 PIT 模型输入，通常来自 Sharadar SF1。增速为季度同比，利润率用 TTM（自由现金流 = 经营现金流 − 资本开支）。各公司财年可能不同。',
            ),
            const SizedBox(height: 8),
            caption(
              'Classification ${text(asMap(data?['taxonomy'])['version'])} is a current curated research map, not a historical stock universe. Company roles are qualitative; no contracted supply relationship or AI revenue exposure is implied.',
              '产业分类 ${text(asMap(data?['taxonomy'])['version'])} 为当前人工研究分类，不是历史可投资股票池。公司角色为定性信息，不代表已签约供货关系或 AI 收入占比。',
            ),
            const SizedBox(height: 8),
            caption(
              'Historical values are reconstructed from dated inputs using the stored model version, not proof of a live signal at that time. Positive growth and a positive model gap are separate observations, not a recommendation.',
              '历史估值由当时输入和存储的模型版本重建，不证明当时已发布实时信号。增长和模型差距是独立观测，不构成推荐。',
            ),
            const SizedBox(height: 8),
            caption(
              'Guru coverage can include historical top-holding extracts. Missing holders are not zero ownership. Browsing does not save or change your portfolio.',
              '大佬覆盖可能只包含历史重点持仓摘录。未找到持有人不等于没有持仓；浏览不会保存或修改您的组合。',
            ),
            if (selected?['source'] != null) ...[
              const SizedBox(height: 10),
              Text(
                '${text(asMap(selected?['source'])['dataset'])} · ${text(asMap(selected?['source'])['modelVersion'])}',
                style: style(11, false, p.muted),
              ),
            ],
          ],
        ),
      ),
    ],
  );
}
