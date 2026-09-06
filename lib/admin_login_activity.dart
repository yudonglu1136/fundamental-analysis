part of 'main.dart';

Future<void> recordAuthenticatedVisit(ApiClient api) async {
  try {
    await api
        .postJson('/api/auth/activity', {})
        .timeout(const Duration(seconds: 3));
  } catch (_) {
    // Non-critical telemetry must not prevent a successful sign-in/navigation.
  }
}

String adminLoginDateTime(String? value) {
  final date = DateTime.tryParse(value ?? '');
  if (date == null) return '—';
  final local = date.toLocal();
  String pad(int n) => n.toString().padLeft(2, '0');
  return '${local.year}-${pad(local.month)}-${pad(local.day)} '
      '${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}';
}

String adminLoginTimezone() {
  final offset = DateTime.now().timeZoneOffset;
  final minutes = offset.inMinutes.abs();
  return 'UTC${offset.isNegative ? '-' : '+'}'
      '${(minutes ~/ 60).toString().padLeft(2, '0')}:'
      '${(minutes % 60).toString().padLeft(2, '0')}';
}

class AdminLoginActivityPanel extends StatefulWidget {
  const AdminLoginActivityPanel({
    super.key,
    required this.api,
    required this.palette,
  });
  final ApiClient api;
  final Palette palette;
  @override
  State<AdminLoginActivityPanel> createState() =>
      _AdminLoginActivityPanelState();
}

class _AdminLoginActivityPanelState extends State<AdminLoginActivityPanel> {
  final _search = TextEditingController();
  Timer? _debounce;
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _failed = false;
  int _page = 1;
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final id = ++_requestId;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final path = Uri(
        path: '/api/admin/login-activity',
        queryParameters: {
          'page': '$_page',
          'pageSize': '20',
          'search': _search.text.trim(),
        },
      ).toString();
      final data = await widget.api.getJson(path);
      if (!mounted || id != _requestId) return;
      setState(() {
        _data = data;
        _page = math.max(1, number(data['page']).toInt());
      });
    } catch (_) {
      if (!mounted || id != _requestId) return;
      setState(() => _failed = true);
    } finally {
      if (mounted && id == _requestId) setState(() => _loading = false);
    }
  }

  void _searchChanged(String _) {
    _debounce?.cancel();
    ++_requestId; // Reject a previous response immediately, including during debounce.
    setState(() {
      _page = 1;
      _loading = true;
      _failed = false;
    });
    _debounce = Timer(
      const Duration(milliseconds: 300),
      () => unawaited(_load()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    final users = asList(_data?['users']);
    final total = number(_data?['total']).toInt();
    final pages = math.max(1, number(_data?['pages']).toInt());
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.login_rounded,
            kicker: context.tr('仅管理员可见', 'ADMIN ONLY'),
            title: context.tr('最近登录', 'Recent sign-ins'),
            palette: palette,
            trailing: IconButton(
              key: const ValueKey('login-activity-refresh'),
              tooltip: context.tr('刷新登录记录', 'Refresh sign-ins'),
              onPressed: _loading ? null : () => unawaited(_load()),
              icon: Icon(Icons.refresh_rounded, color: palette.accent),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            context.tr(
              '每个账号显示最近一次已验证登录。最近访问单独列出，不代表再次登录。',
              'Latest verified sign-in per account. Last activity is separate and is not another sign-in.',
            ),
            style: TextStyle(color: palette.muted, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Text(
            context.tr(
              '设备时区：${adminLoginTimezone()}',
              'Device timezone: ${adminLoginTimezone()}',
            ),
            style: TextStyle(color: palette.faint, fontSize: 12),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('login-activity-search'),
            controller: _search,
            onChanged: _searchChanged,
            style: TextStyle(color: palette.text),
            decoration: InputDecoration(
              prefixIcon: Icon(Icons.search_rounded, color: palette.muted),
              hintText: context.tr('搜索姓名或邮箱', 'Search name or email'),
              hintStyle: TextStyle(color: palette.faint),
              enabledBorder: OutlineInputBorder(
                borderSide: BorderSide(color: palette.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderSide: BorderSide(color: palette.accent),
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(18),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_failed)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.tr(
                    '登录记录加载失败，请重试。',
                    'Could not load sign-ins. Please retry.',
                  ),
                  style: TextStyle(color: palette.negative),
                ),
                TextButton(
                  onPressed: () => unawaited(_load()),
                  child: Text(context.tr('重试', 'Retry')),
                ),
              ],
            )
          else if (users.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(
                _search.text.trim().isEmpty
                    ? context.tr(
                        '暂无记录。启用后，用户使用已登录账号访问平台时会开始记录。',
                        'No records yet. Recording starts when signed-in users access the platform after this feature is enabled.',
                      )
                    : context.tr('没有匹配的账号。', 'No matching accounts.'),
                style: TextStyle(color: palette.muted),
              ),
            )
          else
            SizedBox(
              height: math.min(380.0, users.length * 132.0),
              child: ListView.separated(
                key: const ValueKey('login-activity-list'),
                primary: false,
                itemCount: users.length,
                separatorBuilder: (_, _) => Divider(color: palette.border),
                itemBuilder: (context, index) {
                  final user = users[index];
                  final email = text(user['email']);
                  final login = text(user['lastSignInAt']);
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          text(
                            user['name'],
                            email.isEmpty
                                ? context.tr('未命名账号', 'Unnamed account')
                                : email,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.text,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (email.isNotEmpty)
                          Text(
                            email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.muted,
                              fontSize: 12,
                            ),
                          ),
                        const SizedBox(height: 5),
                        Text(
                          context.tr('最近登录：', 'Last sign-in: ') +
                              (DateTime.tryParse(login) == null
                                  ? context.tr('未记录', 'Not recorded')
                                  : adminLoginDateTime(login)),
                          style: TextStyle(color: palette.accent, fontSize: 13),
                        ),
                        Text(
                          context.tr('最近访问：', 'Last activity: ') +
                              adminLoginDateTime(text(user['lastSeenAt'])),
                          style: TextStyle(color: palette.muted, fontSize: 12),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          if (!_loading && !_failed) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  context.tr(
                    '$total 个账号 · 第 $_page / $pages 页',
                    '$total accounts · Page $_page / $pages',
                  ),
                  style: TextStyle(color: palette.muted, fontSize: 12),
                ),
                IconButton(
                  key: const ValueKey('login-activity-previous'),
                  tooltip: context.tr('上一页', 'Previous page'),
                  onPressed: _page <= 1
                      ? null
                      : () {
                          _page--;
                          unawaited(_load());
                        },
                  icon: Icon(Icons.chevron_left_rounded, color: palette.muted),
                ),
                IconButton(
                  key: const ValueKey('login-activity-next'),
                  tooltip: context.tr('下一页', 'Next page'),
                  onPressed: _page >= pages
                      ? null
                      : () {
                          _page++;
                          unawaited(_load());
                        },
                  icon: Icon(Icons.chevron_right_rounded, color: palette.muted),
                ),
              ],
            ),
          ],
          const SizedBox(height: 6),
          Text(
            context.tr(
              '仅包含启用后访问过 API 的已登录账号；旧访问记录不补造登录时间。访问时间精度约 1 分钟。',
              'Includes signed-in accounts observed by the API after enablement. Earlier sign-ins are not reconstructed. Activity precision is about 1 minute.',
            ),
            style: TextStyle(color: palette.faint, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
