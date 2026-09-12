part of 'main.dart';

List<Map<String, dynamic>> filterFundamentals(
  List<Map<String, dynamic>> rows, {
  String screen = 'acceleration',
  String query = '',
  String sort = 'change',
  bool belowValue = false,
  FundamentalRules rules = const FundamentalRules(),
}) {
  final result = rows
      .where(
        (r) =>
            (screen == 'combined'
                ? rules.accepts(r)
                : screen == 'all' ||
                      (r['screens'] as List? ?? []).contains(screen)) &&
            '${r['ticker']} ${r['name']}'.toLowerCase().contains(
              query.trim().toLowerCase(),
            ) &&
            (!belowValue || (nullableNumber(r['modelGap']) ?? -1) > 0),
      )
      .toList();
  double? v(Map<String, dynamic> r) => nullableNumber(
    sort == 'value'
        ? r['modelGap']
        : sort == 'growth'
        ? asMap(r['metrics'])['revenueGrowth']
        : asMap(r['changes'])[screen == 'profit'
              ? 'operatingMargin'
              : {'cash', 'divergence'}.contains(screen)
              ? 'fcfMargin'
              : 'revenueGrowth'],
  );
  result.sort((a, b) {
    if (sort == 'matches') {
      final count = rules.hits(b).compareTo(rules.hits(a));
      if (count != 0) return count;
      return text(a['ticker']).compareTo(text(b['ticker']));
    }
    final x = v(a), y = v(b);
    if (x == null && y != null) return 1;
    if (y == null && x != null) return -1;
    final order = sort == 'change' && screen == 'divergence'
        ? (x ?? 0).compareTo(y ?? 0)
        : (y ?? 0).compareTo(x ?? 0);
    return order != 0 ? order : text(a['ticker']).compareTo(text(b['ticker']));
  });
  return result;
}

class FundamentalsPanel extends StatefulWidget {
  const FundamentalsPanel({
    super.key,
    required this.api,
    required this.palette,
    required this.asOf,
    required this.onCompany,
    this.initialSelection = const {},
    this.onSelection,
  });
  final ApiClient api;
  final Palette palette;
  final String asOf;
  final void Function(String ticker, String section) onCompany;
  final Map<String, dynamic> initialSelection;
  final ValueChanged<Map<String, dynamic>>? onSelection;
  @override
  State<FundamentalsPanel> createState() => _FundamentalsPanelState();
}

class _FundamentalsPanelState extends State<FundamentalsPanel> {
  final search = TextEditingController();
  final mobileEvidenceAnchor = GlobalKey();
  Map<String, dynamic>? data, research;
  String screen = 'combined', sort = 'matches', ticker = '';
  FundamentalRules rules = const FundamentalRules();
  String detailTab = 'value', guruQuarter = '';
  Map<String, dynamic>? guruData;
  bool guruLoading = false, guruFailed = false;
  int guruSerial = 0;
  List<String> guruQuarters = [];
  bool loading = true,
      failed = false,
      detailLoading = false,
      detailFailed = false,
      belowValue = false,
      mobileDetail = false;
  int serial = 0, detailSerial = 0, page = 0;
  Palette get p => widget.palette;
  String w(String en, String zh) => context.tr(zh, en);
  TextStyle st([double size = 14, bool bold = false, Color? color]) =>
      TextStyle(
        fontSize: size,
        height: 1.35,
        fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
        color: color ?? p.text,
      );
  String pct(dynamic x) => nullableNumber(x) == null
      ? '—'
      : '${(number(x) * 100).toStringAsFixed(1)}%';
  String pp(dynamic x) => nullableNumber(x) == null
      ? '—'
      : '${number(x) > 0 ? '+' : ''}${(number(x) * 100).toStringAsFixed(1)} ${w('pp', '个百分点')}';
  String money(dynamic x, dynamic c) => nullableNumber(x) == null
      ? '—'
      : '${text(c)} ${number(x).toStringAsFixed(2)}';
  List<Map<String, dynamic>> get rows => asList(data?['companies']);
  List<Map<String, dynamic>> get matches => filterFundamentals(
    rows,
    screen: screen,
    query: search.text,
    sort: sort,
    belowValue: belowValue,
    rules: rules,
  );
  Map<String, dynamic>? get selected =>
      matches.where((r) => r['ticker'] == ticker).firstOrNull;
  void updateDesk(VoidCallback change) => setState(change);
  String title(String id) => switch (id) {
    'combined' => w('Your combined shortlist', '综合候选清单'),
    'acceleration' => w('Growth accelerating', '增长正在提速'),
    'profit' => w('Profitability improving', '盈利能力改善'),
    'cash' => w('Cash flow keeping up', '现金流跟上增长'),
    'divergence' => w('Growth with a catch', '增长背后的背离'),
    _ => w('All operating companies', '全部经营类公司'),
  };
  String rule(String id) => switch (id) {
    'combined' =>
      rules.factors.isEmpty
          ? w(
              'No factors selected. Showing the covered universe.',
              '未选择因子，显示覆盖范围内全部公司。',
            )
          : w(
              '${rules.requireAll ? 'All' : 'Any'} of ${rules.factors.length} selected factors · not a stock rating.',
              '${rules.requireAll ? '全部' : '任一'} ${rules.factors.length} 项条件达标 · 非股票评级。',
            ),
    'acceleration' => w(
      'Revenue YoY ≥15%, accelerating by at least 5pp.',
      '收入同比 ≥15%，增速比上一季度提高至少 5 个百分点。',
    ),
    'profit' => w(
      'Revenue growing; positive operating margin, up at least 2pp.',
      '收入正增长；经营利润率为正，且提高至少 2 个百分点。',
    ),
    'cash' => w(
      'Revenue YoY ≥15%; positive FCF margin, flat or rising.',
      '收入同比 ≥15%；自由现金流率为正，且持平或上升。',
    ),
    'divergence' => w(
      'Revenue YoY ≥15%, but operating or FCF margin fell at least 2pp.',
      '收入同比 ≥15%，但经营利润率或自由现金流率下降至少 2 个百分点。',
    ),
    _ => w(
      'Browse the stored operating-company universe, including companies outside the screens.',
      '浏览本地覆盖的经营类公司，包括未命中筛选条件的公司。',
    ),
  };
  @override
  void initState() {
    super.initState();
    final s = widget.initialSelection;
    screen = text(s['screen'], 'combined');
    sort = text(s['sort'], screen == 'combined' ? 'matches' : 'change');
    rules = FundamentalRules.restore(asMap(s['rules']));
    detailTab = const {'value', 'financials', 'gurus'}.contains(s['detailTab'])
        ? text(s['detailTab'])
        : 'value';
    guruQuarter = text(s['guruQuarter']);
    ticker = text(s['ticker']);
    search.text = text(s['query']);
    belowValue = s['belowValue'] == true;
    page = number(s['page']).toInt();
    unawaited(load());
  }

  @override
  void didUpdateWidget(covariant FundamentalsPanel old) {
    super.didUpdateWidget(old);
    if (old.asOf != widget.asOf || old.api != widget.api) {
      guruQuarter = '';
      guruQuarters = [];
      unawaited(load());
    }
  }

  @override
  void dispose() {
    serial++;
    detailSerial++;
    guruSerial++;
    search.dispose();
    super.dispose();
  }

  void remember() => widget.onSelection?.call({
    'screen': screen,
    'sort': sort,
    'ticker': ticker,
    'query': search.text,
    'belowValue': belowValue,
    'page': page,
    'rules': rules.json,
    'detailTab': detailTab,
    'guruQuarter': guruQuarter,
  });
  Future<void> load() async {
    final id = ++serial, date = widget.asOf;
    detailSerial++;
    guruSerial++;
    guruData = null;
    setState(() {
      data = null;
      research = null;
      loading = true;
      failed = false;
      mobileDetail = false;
    });
    try {
      final r = await widget.api.getJson(
        '/api/investment/fundamentals?asOf=$date',
      );
      if (r['version'] != 'fundamental-changes-v1' || r['asOf'] != date) {
        throw StateError('Wrong data cut');
      }
      if (!mounted || id != serial) return;
      setState(() {
        data = r;
        loading = false;
        final list = matches;
        if (!list.any((r) => r['ticker'] == ticker)) {
          ticker = text(list.firstOrNull?['ticker']);
        }
        page = page.clamp(0, math.max(0, (list.length - 1) ~/ 8));
      });
      remember();
      unawaited(loadDetail());
    } catch (_) {
      if (mounted && id == serial) {
        setState(() {
          loading = false;
          failed = true;
        });
      }
    }
  }

  Future<void> loadDetail() async {
    guruSerial++;
    guruData = null;
    if (detailTab == 'gurus') unawaited(loadGurus());
    final id = ++detailSerial, symbol = ticker, date = widget.asOf;
    setState(() {
      research = null;
      detailFailed = false;
      detailLoading = symbol.isNotEmpty;
    });
    if (symbol.isEmpty) return;
    try {
      final r = await widget.api.getJson(
        '/api/investment/research/${Uri.encodeComponent(symbol)}?asOf=$date',
      );
      if (r['ticker'] != symbol || r['asOf'] != date) {
        throw StateError('Wrong company');
      }
      if (mounted && id == detailSerial) setState(() => research = r);
    } catch (_) {
      if (mounted && id == detailSerial) setState(() => detailFailed = true);
    } finally {
      if (mounted && id == detailSerial) setState(() => detailLoading = false);
    }
  }

  void filter(VoidCallback change) {
    final before = ticker;
    setState(() {
      change();
      page = 0;
      mobileDetail = false;
      final list = matches;
      if (!list.any((r) => r['ticker'] == ticker)) {
        ticker = text(list.firstOrNull?['ticker']);
      }
      page = math.max(0, list.indexWhere((r) => r['ticker'] == ticker)) ~/ 8;
    });
    remember();
    if (before != ticker) unawaited(loadDetail());
  }

  void pick(Map<String, dynamic> r, bool compact) {
    setState(() {
      ticker = text(r['ticker']);
      mobileDetail = compact;
    });
    remember();
    unawaited(loadDetail());
    if (compact) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final target = mobileEvidenceAnchor.currentContext;
        if (mounted && target != null) {
          Scrollable.ensureVisible(
            target,
            duration: const Duration(milliseconds: 200),
          );
        }
      });
    }
  }

  Widget note(String en, String zh) =>
      Text(w(en, zh), style: st(12, false, p.muted));
  Widget box(
    Widget child, {
    EdgeInsets padding = const EdgeInsets.all(20),
    Color? color,
  }) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: color ?? p.panel,
      border: Border.all(color: p.border),
      borderRadius: BorderRadius.circular(12),
    ),
    child: child,
  );
  Widget action(
    String en,
    String zh,
    VoidCallback onTap, {
    bool primary = false,
    IconData icon = Icons.arrow_forward,
  }) => primary
      ? FilledButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 17),
          label: Text(w(en, zh)),
          style: FilledButton.styleFrom(
            backgroundColor: p.accent,
            foregroundColor: p.background,
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          ),
        )
      : OutlinedButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 17),
          label: Text(w(en, zh)),
        );
  void open(String section) {
    remember();
    widget.onCompany(ticker, section);
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (_, c) {
      final compact = c.maxWidth < 960;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            w('Strong businesses. Your shortlist.', '好生意，组合筛出来。'),
            style: st(compact ? 26 : 32, true),
          ),
          const SizedBox(height: 8),
          Text(
            w(
              'Combine growth, profitability and cash flow. Select a stock to check valuation, financials and Guru activity.',
              '综合增长、盈利与现金流，生成股票清单。点选公司，连着看估值、财务与 Guru 当季增减持。',
            ),
            style: st(14, false, p.muted),
          ),
          const SizedBox(height: 20),
          if (loading)
            box(
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    w('Comparing disclosed quarters…', '正在比较已披露季度…'),
                    style: st(),
                  ),
                  const SizedBox(height: 12),
                  const LinearProgressIndicator(minHeight: 2),
                ],
              ),
            )
          else if (failed)
            box(
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  note(
                    'Financial data could not be loaded. No old snapshot is shown as current.',
                    '财务数据加载失败。不会用旧快照冒充当前结果。',
                  ),
                  action(
                    'Retry financial data',
                    '重试财务数据',
                    () => unawaited(load()),
                  ),
                ],
              ),
            )
          else ...[
            if (!compact || !mobileDetail) factorControls(c.maxWidth),
            const SizedBox(height: 14),
            Wrap(
              spacing: 14,
              runSpacing: 5,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                note(
                  '${asMap(data?['coverage'])['operating']} operating companies · ${asMap(data?['coverage'])['comparable']} comparable quarter pairs',
                  '${asMap(data?['coverage'])['operating']} 家经营类公司 · ${asMap(data?['coverage'])['comparable']} 组可比季度',
                ),
                TextButton(
                  onPressed: () => filter(() {
                    screen = 'all';
                    sort = 'growth';
                  }),
                  child: Text(w('Browse all companies', '浏览全部公司')),
                ),
                note(
                  'Card counts are individual factors; the shortlist combines your rules.',
                  '卡片显示单项达标数量；下方清单按所选条件综合筛选。',
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (compact && mobileDetail && selected != null) ...[
              SizedBox(key: mobileEvidenceAnchor),
              Align(
                alignment: Alignment.centerLeft,
                child: action(
                  'Back to results',
                  '返回筛选结果',
                  () => setState(() => mobileDetail = false),
                  icon: Icons.arrow_back,
                ),
              ),
              const SizedBox(height: 12),
              detail(selected!),
              const SizedBox(height: 16),
              if (detailTab == 'financials') historyPanel(),
            ] else ...[
              Wrap(
                spacing: 12,
                runSpacing: 12,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SizedBox(
                    width: compact ? c.maxWidth : 300,
                    child: TextField(
                      key: const ValueKey('fundamental-search'),
                      controller: search,
                      onChanged: (_) => filter(() {}),
                      decoration: InputDecoration(
                        isDense: true,
                        hintText: w('Search company or ticker', '搜索公司名称或代码'),
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: search.text.isEmpty
                            ? null
                            : IconButton(
                                onPressed: () => filter(search.clear),
                                icon: const Icon(Icons.close),
                              ),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: compact ? math.min(300, c.maxWidth) : 220,
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: sort,
                      items: [
                        DropdownMenuItem(
                          value: 'matches',
                          child: Text(w('Sort: factors matched', '排序：条件命中数')),
                        ),
                        DropdownMenuItem(
                          value: 'change',
                          child: Text(w('Sort: change', '排序：指标变化')),
                        ),
                        DropdownMenuItem(
                          value: 'growth',
                          child: Text(w('Sort: revenue growth', '排序：收入增速')),
                        ),
                        DropdownMenuItem(
                          value: 'value',
                          child: Text(w('Sort: model gap', '排序：估值空间')),
                        ),
                      ],
                      onChanged: (v) => filter(() => sort = v!),
                    ),
                  ),
                  FilterChip(
                    label: Text(w('Price below model value', '价格低于模型估值')),
                    selected: belowValue,
                    onSelected: (v) => filter(() => belowValue = v),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              if (matches.isEmpty)
                box(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        w(
                          'No companies meet these conditions.',
                          '当前条件下没有匹配公司。',
                        ),
                        style: st(18, true),
                      ),
                      const SizedBox(height: 8),
                      note(
                        'Try another research question, or remove the price filter.',
                        '换一个研究问题，或移除价格筛选。',
                      ),
                      action(
                        'Reset filters',
                        '重置筛选',
                        () => filter(() {
                          screen = 'all';
                          search.clear();
                          belowValue = false;
                          sort = 'growth';
                        }),
                      ),
                    ],
                  ),
                )
              else if (compact)
                companyTable(true)
              else
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 6, child: companyTable(false)),
                    const SizedBox(width: 20),
                    Expanded(flex: 4, child: detail(selected ?? matches.first)),
                  ],
                ),
              if (!compact &&
                  selected != null &&
                  detailTab == 'financials') ...[
                const SizedBox(height: 20),
                historyPanel(),
              ],
            ],
            const SizedBox(height: 20),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: Text(
                w('How to read this screen', '如何使用和理解这些数据'),
                style: st(13, true),
              ),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    w(
                      '1. Combine factors. 2. Select a stock. 3. Compare its model, quarterly financials and dated Guru disclosures. 4. Test your own assumptions.',
                      '1. 组合因子。2. 选择股票。3. 对比估值、季度财务和带日期的 Guru 披露。4. 检验自己的假设。',
                    ),
                    style: st(13),
                  ),
                ),
                const SizedBox(height: 10),
                note(
                  'Revenue is quarterly YoY; margins use trailing 12 months. FCF = operating cash flow − capital expenditure, not verified parent FCFE. Reported growth is not necessarily organic.',
                  '收入增速是单季度同比；利润率和现金流率使用过去 12 个月。FCF = 经营现金流 − 资本开支，并非已核实的母公司 FCFE。披露增长不一定是有机增长。',
                ),
                const SizedBox(height: 8),
                note(
                  'Changes require adjacent ARQ quarters, a consistent model version and currency. Banks and other non-operating routes are excluded. Missing values do not pass a screen.',
                  '变化计算要求相邻 ARQ 季度、相同模型版本和币种。银行等非经营类估值路线不参与筛选。缺失值不算达标。',
                ),
                const SizedBox(height: 8),
                note(
                  '${asMap(data?['coverage'])['excluded']} other model routes excluded · ${asMap(data?['coverage'])['invalid']} invalid source records withheld. This is stored coverage, not the whole market.',
                  '已排除 ${asMap(data?['coverage'])['excluded']} 个其他模型路线 · ${asMap(data?['coverage'])['invalid']} 个来源校验未通过的记录未展示。这是已存储覆盖范围，不代表全市场。',
                ),
                const SizedBox(height: 8),
                note(
                  'Historical PIT reconstruction, not an archived live signal. Value/price gaps require matching currency and a price no more than 7 days old. Price is comparison-only.',
                  '历史 PIT 重建，不是当时实时信号的存档。估值空间要求币种一致且价格不超过 7 天。市场价格仅用于比较。',
                ),
              ],
            ),
          ],
        ],
      );
    },
  );

  Widget companyTable(bool compact) {
    final list = matches;
    final visible = list.skip(page * 8).take(8).toList();
    return box(
      padding: EdgeInsets.zero,
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${title(screen)} · ${list.length}', style: st(19, true)),
                const SizedBox(height: 6),
                Text(rule(screen), style: st(12, false, p.muted)),
                const SizedBox(height: 8),
                note(
                  '2  Select a stock → valuation · financials · Guru quarter',
                  '2  点选股票 → 估值 · 财务 · Guru 季度',
                ),
              ],
            ),
          ),
          if (!compact)
            Container(
              color: p.card,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: Text(
                      w('Company / period', '公司 / 季度'),
                      style: st(11, false, p.muted),
                    ),
                  ),
                  for (final h in [
                    w('Revenue YoY', '收入同比'),
                    w('Op. margin', '经营利润率'),
                    w('FCF margin', 'FCF 率'),
                    w('Model gap', '估值空间'),
                  ])
                    Expanded(
                      flex: 2,
                      child: Text(
                        h,
                        textAlign: TextAlign.right,
                        style: st(11, false, p.muted),
                      ),
                    ),
                ],
              ),
            ),
          for (final r in visible)
            Material(
              color: r['ticker'] == ticker
                  ? p.accent.withValues(alpha: .09)
                  : Colors.transparent,
              child: InkWell(
                key: ValueKey('fund-row-${r['ticker']}'),
                onTap: () => pick(r, compact),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 13,
                  ),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: p.border),
                      left: BorderSide(
                        width: 3,
                        color: r['ticker'] == ticker
                            ? p.accent
                            : Colors.transparent,
                      ),
                    ),
                  ),
                  child: compact
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            identity(r),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: metricCell(
                                    r,
                                    'revenueGrowth',
                                    label: w('Revenue YoY', '收入同比'),
                                  ),
                                ),
                                Expanded(
                                  child: metricCell(
                                    r,
                                    'operatingMargin',
                                    label: w('Op. margin', '经营利润率'),
                                  ),
                                ),
                                Expanded(
                                  child: metricCell(
                                    r,
                                    'fcfMargin',
                                    label: w('FCF margin', 'FCF 率'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        )
                      : Row(
                          children: [
                            Expanded(flex: 3, child: identity(r)),
                            for (final k in [
                              'revenueGrowth',
                              'operatingMargin',
                              'fcfMargin',
                            ])
                              Expanded(flex: 2, child: metricCell(r, k)),
                            Expanded(
                              flex: 2,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    pct(r['modelGap']),
                                    style: st(
                                      14,
                                      true,
                                      nullableNumber(r['modelGap']) == null
                                          ? p.muted
                                          : number(r['modelGap']) > 0
                                          ? p.accent
                                          : p.secondary,
                                    ),
                                  ),
                                  Text(
                                    w('value / price − 1', '估值 / 价格 − 1'),
                                    style: st(9, false, p.muted),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: note(
                    '${page * 8 + 1}–${math.min((page + 1) * 8, list.length)} of ${list.length}',
                    '${page * 8 + 1}–${math.min((page + 1) * 8, list.length)} / ${list.length} 家',
                  ),
                ),
                IconButton(
                  tooltip: w('Previous results', '上一页'),
                  onPressed: page > 0
                      ? () => setState(() {
                          page--;
                          ticker = text(list[page * 8]['ticker']);
                          remember();
                          unawaited(loadDetail());
                        })
                      : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                IconButton(
                  tooltip: w('Next results', '下一页'),
                  onPressed: (page + 1) * 8 < list.length
                      ? () => setState(() {
                          page++;
                          ticker = text(list[page * 8]['ticker']);
                          remember();
                          unawaited(loadDetail());
                        })
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget identity(Map<String, dynamic> r) => Row(
    children: [
      StockLogo(
        ticker: text(r['ticker']),
        palette: p,
        size: 32,
        backgroundColor:
            {'AMZN', 'MRVL', 'ADI', 'ALB', 'ANET'}.contains(r['ticker'])
            ? p.card
            : null,
      ),
      const SizedBox(width: 9),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(text(r['ticker']), style: st(14, true)),
            Text(text(r['period']), style: st(10, false, p.muted)),
            if (screen == 'combined' && rules.factors.isNotEmpty)
              Text(
                w(
                  '${rules.hits(r)}/${rules.factors.length} factors',
                  '${rules.hits(r)}/${rules.factors.length} 项达标',
                ),
                style: st(10, true, p.accent),
              ),
          ],
        ),
      ),
    ],
  );
  Widget metricCell(Map<String, dynamic> r, String k, {String? label}) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (label != null) Text(label, style: st(10, false, p.muted)),
          Text(pct(asMap(r['metrics'])[k]), style: st(14, true)),
          Text(
            pp(asMap(r['changes'])[k]),
            style: st(
              10,
              false,
              nullableNumber(asMap(r['changes'])[k]) == null
                  ? p.muted
                  : number(asMap(r['changes'])[k]) < 0
                  ? p.secondary
                  : p.accent,
            ),
          ),
        ],
      );

  Widget detail(Map<String, dynamic> r) {
    final m = asMap(r['metrics']),
        d = asMap(r['changes']),
        prev = asMap(r['previous']),
        v = asMap(r['valuation']),
        price = asMap(r['price']);
    return box(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            w('THE BUSINESS CHECK', '经营变化核验'),
            style: st(10, true, p.accent),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              StockLogo(ticker: text(r['ticker']), palette: p, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(text(r['ticker']), style: st(26, true)),
                    Text(text(r['name']), style: st(12, false, p.muted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          note(
            '${r['period']} · Disclosed ${r['filingDate']}',
            '${r['period']} · 披露 ${r['filingDate']}',
          ),
          const SizedBox(height: 20),
          deskTabs(),
          if (detailTab == 'gurus') guruPanel(),
          if (detailTab == 'value') factorEvidence(r),
          if (detailTab == 'financials') ...[
            Text(w('What actually changed?', '具体改变了什么？'), style: st(17, true)),
            const SizedBox(height: 10),
            if (prev.isEmpty)
              note(
                'No comparable prior quarter. Changes are unavailable, not zero.',
                '没有可比的上一季度。变化值不可用，并非零。',
              )
            else ...[
              note(
                '${prev['period']} → ${r['period']} · change in percentage points',
                '${prev['period']} → ${r['period']} · 变化单位为百分点',
              ),
              const SizedBox(height: 12),
            ],
            for (final k in ['revenueGrowth', 'operatingMargin', 'fcfMargin'])
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(switch (k) {
                      'revenueGrowth' => w('Quarterly revenue YoY', '季度收入同比'),
                      'operatingMargin' => w(
                        'TTM operating margin',
                        'TTM 经营利润率',
                      ),
                      _ => w('TTM free-cash-flow margin', 'TTM 自由现金流率'),
                    }, style: st(12, false, p.muted)),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      children: [
                        Text(
                          '${pct(asMap(prev['metrics'])[k])} → ${pct(m[k])}',
                          style: st(19, true),
                        ),
                        Text(
                          pp(d[k]),
                          style: st(
                            14,
                            true,
                            number(d[k]) < 0 ? p.secondary : p.accent,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 10),
            Divider(color: p.border),
            const SizedBox(height: 10),
            Text(
              w('Check before you extrapolate', '外推之前，先核查'),
              style: st(14, true, p.secondary),
            ),
            const SizedBox(height: 8),
            Text(
              nullableNumber(m['operatingMargin']) != null &&
                      number(m['operatingMargin']) < 0
                  ? w(
                      'Operating margin is still negative. Is faster revenue growth enough to reach sustainable profitability?',
                      '经营利润率仍为负。收入加速增长，是否足以实现持续盈利？',
                    )
                  : (nullableNumber(d['fcfMargin']) != null &&
                        number(d['fcfMargin']) < 0)
                  ? w(
                      'Cash-flow margin fell. Check working capital, capex and one-off cash movements before calling the growth higher quality.',
                      '现金流率下降。先核查营运资本、资本开支和一次性现金变动，不能仅凭增长判断质量提高。',
                    )
                  : w(
                      'Check acquisition effects, last year’s comparison base and working capital. These numbers alone do not prove organic or durable growth.',
                      '核查并购影响、去年同期基数和营运资本。这些数字本身不能证明有机增长或可持续增长。',
                    ),
              style: st(12, false, p.muted),
            ),
            const SizedBox(height: 18),
          ],
          if (detailTab == 'value')
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: p.card,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    w('And what is priced in?', '价格是否已经反映？'),
                    style: st(14, true),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    '${w('Price', '市场价')}  ${money(price['value'], price['currency'])}',
                    style: st(15),
                  ),
                  note('${price['date'] ?? '—'}', '${price['date'] ?? '—'}'),
                  const SizedBox(height: 8),
                  Text(
                    '${w('Model', '模型估值')}  ${money(v['fairValue'], v['currency'])}',
                    style: st(18, true, p.accent),
                  ),
                  note(
                    '${v['date'] ?? '—'} · ${w('Published model, not your DCF', '平台模型，非个人 DCF')}',
                    '${v['date'] ?? '—'} · 平台模型，非个人 DCF',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    r['modelGap'] == null
                        ? w(
                            'Comparison unavailable: check price, currency or coverage.',
                            '暂不可比：请核查价格、币种或覆盖。',
                          )
                        : '${pct(r['modelGap'])} ${w('model / price − 1', '模型估值 / 价格 − 1')}',
                    style: st(12, false, p.muted),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 16),
          action(
            'Evaluate the price',
            '检验当前价格',
            () => open('value'),
            primary: true,
          ),
          const SizedBox(height: 8),
          action(
            'Read financials & guidance',
            '查看财报与管理层指引',
            () => open('financials'),
            icon: Icons.description_outlined,
          ),
        ],
      ),
    );
  }

  Widget historyPanel() {
    if (detailLoading) {
      return box(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            note('Loading the quarterly evidence…', '正在加载季度证据…'),
            const SizedBox(height: 10),
            const LinearProgressIndicator(minHeight: 2),
          ],
        ),
      );
    }
    if (detailFailed) {
      return box(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            note(
              'Quarterly detail could not be loaded. The screening snapshot is still available above.',
              '季度明细加载失败，上方筛选快照仍可查看。',
            ),
            action(
              'Retry quarter history',
              '重试季度历史',
              () => unawaited(loadDetail()),
            ),
          ],
        ),
      );
    }
    if (research == null) return const SizedBox.shrink();
    final byPeriod = <String, Map<String, dynamic>>{};
    for (final h in asList(research?['history'])) {
      if (text(h['availableAt']).compareTo(widget.asOf) <= 0 &&
          asMap(h['source'])['dimension'] == 'ARQ') {
        byPeriod[text(h['periodEnd'])] = h;
      }
    }
    final all = byPeriod.values.toList()
      ..sort((a, b) => text(a['periodEnd']).compareTo(text(b['periodEnd'])));
    final periods = all.skip(math.max(0, all.length - 8)).toList();
    return box(
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            runSpacing: 8,
            children: [
              Text(
                '$ticker · ${w('Quarterly evidence', '季度证据')}',
                style: st(20, true),
              ),
              Text(
                w('Reported facts · not forecasts', '披露事实 · 非预测'),
                style: st(11, false, p.muted),
              ),
            ],
          ),
          const SizedBox(height: 8),
          note(
            'Compare the last ${periods.length} available quarters. Revenue growth is quarterly YoY; margins are TTM. Scroll horizontally for every quarter.',
            '比较最近 ${periods.length} 个已披露季度。收入增速为单季同比；利润率和现金流率为 TTM。左右滑动查看全部季度。',
          ),
          const SizedBox(height: 16),
          if (periods.isEmpty)
            note(
              'No quarterly ARQ history is available at this cutoff.',
              '这个截止日没有可用的 ARQ 季度历史。',
            )
          else
            LayoutBuilder(
              builder: (_, constraints) => SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: DataTable(
                    horizontalMargin: 10,
                    columnSpacing: 22,
                    headingRowHeight: 68,
                    dataRowMinHeight: 44,
                    dataRowMaxHeight: 48,
                    columns: [
                      DataColumn(
                        label: Text(w('Metric', '指标'), style: st(12, true)),
                      ),
                      for (final h in periods)
                        DataColumn(
                          numeric: true,
                          label: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(text(h['period']), style: st(12, true)),
                              Text(
                                text(h['filingDate']),
                                style: st(10, false, p.muted),
                              ),
                            ],
                          ),
                        ),
                    ],
                    rows: [
                      for (final k in [
                        'revenueGrowth',
                        'operatingMargin',
                        'fcfMargin',
                      ])
                        DataRow(
                          cells: [
                            DataCell(
                              Text(switch (k) {
                                'revenueGrowth' => w('Revenue YoY', '收入同比'),
                                'operatingMargin' => w(
                                  'Operating margin',
                                  '经营利润率',
                                ),
                                _ => w('FCF margin', '自由现金流率'),
                              }, style: st(12)),
                            ),
                            for (final h in periods)
                              DataCell(
                                Text(
                                  pct(asMap(h['metrics'])[k]),
                                  style: st(
                                    13,
                                    true,
                                    nullableNumber(asMap(h['metrics'])[k]) ==
                                            null
                                        ? p.muted
                                        : number(asMap(h['metrics'])[k]) < 0
                                        ? p.secondary
                                        : p.text,
                                  ),
                                ),
                              ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 14),
          note(
            'Dates below quarters are disclosure dates. Missing quarters are not invented; consecutive columns may not be adjacent quarters.',
            '季度下方日期为披露日期。不补造缺失季度；相邻列不一定代表连续季度。',
          ),
        ],
      ),
    );
  }
}
