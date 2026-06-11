import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

const _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const _supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');
const _authDevBypass = String.fromEnvironment(
  'AUTH_DEV_BYPASS',
  defaultValue: 'false',
);
const _localDevToken = 'local-dev-token';

bool get _authConfigured =>
    _supabaseUrl.trim().isNotEmpty && _supabaseAnonKey.trim().isNotEmpty;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (_authConfigured) {
    await Supabase.initialize(
      url: _supabaseUrl,
      publishableKey: _supabaseAnonKey,
    );
  }
  runApp(const GuruTerminalApp());
}

class GuruTerminalApp extends StatelessWidget {
  const GuruTerminalApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Guru Intelligence Executive Summary',
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B111D),
        fontFamily: 'Inter',
        colorScheme: ColorScheme.fromSeed(
          brightness: Brightness.dark,
          seedColor: const Color(0xFF22D3A6),
          surface: const Color(0xFF111827),
        ),
      ),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _loading = true;
  bool _localWorkspace = !_authConfigured && _authDevBypass == 'true';
  Session? _session;
  StreamSubscription<AuthState>? _authSub;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    if (_authConfigured) {
      final client = Supabase.instance.client;
      _session = client.auth.currentSession;
      _authSub = client.auth.onAuthStateChange.listen((event) {
        if (!mounted) return;
        setState(() => _session = event.session);
      });
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }

  Future<void> _signInWithGoogle() async {
    if (!_authConfigured) return;
    final base = Uri.base;
    final redirectTo = '${base.scheme}://${base.authority}${base.path}';
    await Supabase.instance.client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: redirectTo,
    );
  }

  Future<void> _logout() async {
    if (_authConfigured) {
      await Supabase.instance.client.auth.signOut();
    }
    if (!mounted) return;
    setState(() {
      _localWorkspace = false;
      _session = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final token = _localWorkspace ? _localDevToken : _session?.accessToken;
    final authenticated = token != null && token.isNotEmpty;

    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (!authenticated) {
      return LoginScreen(
        authConfigured: _authConfigured,
        localBypassEnabled: _authDevBypass == 'true',
        onGoogle: _signInWithGoogle,
        onLocal: () => setState(() => _localWorkspace = true),
      );
    }

    final user = _localWorkspace
        ? 'Local Workspace'
        : (_session?.user.userMetadata?['full_name']?.toString() ??
              _session?.user.email ??
              'Research user');

    return TerminalHome(accessToken: token, userName: user, onLogout: _logout);
  }
}

class LoginScreen extends StatelessWidget {
  const LoginScreen({
    super.key,
    required this.authConfigured,
    required this.localBypassEnabled,
    required this.onGoogle,
    required this.onLocal,
  });

  final bool authConfigured;
  final bool localBypassEnabled;
  final VoidCallback onGoogle;
  final VoidCallback onLocal;

  @override
  Widget build(BuildContext context) {
    final palette = Palette(false);
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0A1220), Color(0xFF0D1F24)],
          ),
        ),
        child: Center(
          child: Container(
            width: 520,
            padding: const EdgeInsets.all(32),
            decoration: panelDecoration(palette),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BadgeLabel(text: 'GURU INTELLIGENCE', color: palette.accent),
                const SizedBox(height: 18),
                Text(
                  'Executive Summary',
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'A buy-side terminal for 13F flows, insider activity, copy-simulation, and valuation context.',
                  style: TextStyle(color: palette.muted, height: 1.35),
                ),
                const SizedBox(height: 28),
                FilledButton.icon(
                  onPressed: authConfigured ? onGoogle : null,
                  icon: const Icon(Icons.login_rounded),
                  label: const Text('Continue with Google'),
                ),
                if (localBypassEnabled) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: onLocal,
                    icon: const Icon(Icons.terminal_rounded),
                    label: const Text('Enter Local Workspace'),
                  ),
                ],
                const SizedBox(height: 18),
                Text(
                  authConfigured
                      ? 'Production mode uses Supabase Google auth.'
                      : 'Supabase keys are not configured in this build; local workspace mode is available for development.',
                  style: TextStyle(color: palette.faint, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class TerminalHome extends StatefulWidget {
  const TerminalHome({
    super.key,
    required this.accessToken,
    required this.userName,
    required this.onLogout,
  });

  final String accessToken;
  final String userName;
  final VoidCallback onLogout;

  @override
  State<TerminalHome> createState() => _TerminalHomeState();
}

class _TerminalHomeState extends State<TerminalHome> {
  late final ApiClient _api = ApiClient(widget.accessToken);
  Map<String, dynamic>? _guruPayload;
  Map<String, dynamic>? _dbmfPayload;
  Map<String, dynamic>? _valuationPayload;
  bool _loadingGurus = true;
  bool _loadingSecondary = false;
  String _mode = 'guru';
  String _search = '';
  String _filter = 'all';
  String? _selectedGuruId;
  String? _error;
  bool _colorBlind = false;

  Palette get palette => Palette(_colorBlind);

  @override
  void initState() {
    super.initState();
    _loadGurus();
  }

  Future<void> _loadGurus({bool refresh = false}) async {
    setState(() {
      _loadingGurus = true;
      _error = null;
    });
    try {
      final payload = await _api.getJson(
        '/api/gurus${refresh ? '?refresh=1' : ''}',
      );
      final gurus = asList(payload['gurus']);
      setState(() {
        _guruPayload = payload;
        _selectedGuruId ??= gurus.isNotEmpty ? text(gurus.first['id']) : null;
      });
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loadingGurus = false);
    }
  }

  Future<void> _loadSecondary(String mode) async {
    if (mode == 'dbmf' && _dbmfPayload != null) return;
    if (mode == 'valuation' && _valuationPayload != null) return;
    setState(() => _loadingSecondary = true);
    try {
      final path = mode == 'dbmf' ? '/api/dbmf' : '/api/valuation';
      final payload = await _api.getJson(path);
      setState(() {
        if (mode == 'dbmf') _dbmfPayload = payload;
        if (mode == 'valuation') _valuationPayload = payload;
      });
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loadingSecondary = false);
    }
  }

  void _changeMode(String mode) {
    setState(() => _mode = mode);
    if (mode != 'guru') unawaited(_loadSecondary(mode));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            TerminalHeader(
              mode: _mode,
              userName: widget.userName,
              sourceLabel: text(
                asMap(_guruPayload?['source'])['label'],
                'Local SQLite database',
              ),
              generatedAt: text(_guruPayload?['generatedAt']),
              colorBlind: _colorBlind,
              onMode: _changeMode,
              onRefresh: () => _mode == 'guru'
                  ? _loadGurus(refresh: true)
                  : _loadSecondary(_mode),
              onColorBlind: (value) => setState(() => _colorBlind = value),
              onLogout: widget.onLogout,
              palette: palette,
            ),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                child: _mode == 'guru'
                    ? _buildGuruMode()
                    : SecondaryDashboard(
                        key: ValueKey(_mode),
                        mode: _mode,
                        data: _mode == 'dbmf'
                            ? _dbmfPayload
                            : _valuationPayload,
                        loading: _loadingSecondary,
                        palette: palette,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGuruMode() {
    if (_loadingGurus && _guruPayload == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _guruPayload == null) {
      return Center(
        child: ErrorCard(message: _error!, onRetry: () => _loadGurus()),
      );
    }

    final gurus = asList(_guruPayload?['gurus']);
    final filtered = filterGurus(gurus, _search, _filter);
    final selectedGuru = gurus.firstWhere(
      (guru) => text(guru['id']) == _selectedGuruId,
      orElse: () => filtered.isNotEmpty
          ? filtered.first
          : (gurus.isNotEmpty ? gurus.first : <String, dynamic>{}),
    );
    final signals = buildSignals(gurus);
    final exposures = buildExposures(gurus);
    final stats = buildExecutiveStats(gurus, signals);

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 1180;
        final content = wide
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 326,
                    child: GuruUniversePanel(
                      gurus: filtered,
                      selectedGuruId: text(selectedGuru['id']),
                      search: _search,
                      filter: _filter,
                      palette: palette,
                      onSearch: (value) => setState(() => _search = value),
                      onFilter: (value) => setState(() => _filter = value),
                      onSelect: (id) => setState(() => _selectedGuruId = id),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: CenterColumn(
                      stats: stats,
                      signals: signals,
                      exposures: exposures,
                      activeGuruId: text(selectedGuru['id']),
                      palette: palette,
                      onSelectGuru: (id) =>
                          setState(() => _selectedGuruId = id),
                    ),
                  ),
                  const SizedBox(width: 14),
                  SizedBox(
                    width: 382,
                    child: GuruInspector(
                      guru: selectedGuru,
                      api: _api,
                      palette: palette,
                    ),
                  ),
                ],
              )
            : Column(
                children: [
                  GuruUniversePanel(
                    gurus: filtered,
                    selectedGuruId: text(selectedGuru['id']),
                    search: _search,
                    filter: _filter,
                    palette: palette,
                    onSearch: (value) => setState(() => _search = value),
                    onFilter: (value) => setState(() => _filter = value),
                    onSelect: (id) => setState(() => _selectedGuruId = id),
                  ),
                  const SizedBox(height: 14),
                  CenterColumn(
                    stats: stats,
                    signals: signals,
                    exposures: exposures,
                    activeGuruId: text(selectedGuru['id']),
                    palette: palette,
                    onSelectGuru: (id) => setState(() => _selectedGuruId = id),
                  ),
                  const SizedBox(height: 14),
                  GuruInspector(
                    guru: selectedGuru,
                    api: _api,
                    palette: palette,
                  ),
                ],
              );

        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: content,
        );
      },
    );
  }
}

class TerminalHeader extends StatelessWidget {
  const TerminalHeader({
    super.key,
    required this.mode,
    required this.userName,
    required this.sourceLabel,
    required this.generatedAt,
    required this.colorBlind,
    required this.onMode,
    required this.onRefresh,
    required this.onColorBlind,
    required this.onLogout,
    required this.palette,
  });

  final String mode;
  final String userName;
  final String sourceLabel;
  final String generatedAt;
  final bool colorBlind;
  final ValueChanged<String> onMode;
  final VoidCallback onRefresh;
  final ValueChanged<bool> onColorBlind;
  final VoidCallback onLogout;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: palette.panel,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: palette.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  BadgeLabel(
                    text: 'GURU STOCK ANALYSIS',
                    color: palette.accent,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Guru Intelligence Executive Summary',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0,
                      color: palette.text,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '$sourceLabel · ${formatDate(generatedAt)} · $userName',
                    style: TextStyle(color: palette.muted),
                  ),
                ],
              ),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                ModeSegment(mode: mode, onMode: onMode, palette: palette),
                IconButton.filledTonal(
                  tooltip: 'Refresh',
                  onPressed: onRefresh,
                  icon: const Icon(Icons.refresh_rounded),
                ),
                FilterChip(
                  selected: colorBlind,
                  onSelected: onColorBlind,
                  label: const Text('色盲'),
                  avatar: Icon(
                    Icons.contrast_rounded,
                    size: 16,
                    color: colorBlind ? palette.accent : palette.muted,
                  ),
                ),
                IconButton(
                  tooltip: 'Logout',
                  onPressed: onLogout,
                  icon: const Icon(Icons.logout_rounded),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class ModeSegment extends StatelessWidget {
  const ModeSegment({
    super.key,
    required this.mode,
    required this.onMode,
    required this.palette,
  });

  final String mode;
  final ValueChanged<String> onMode;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final modes = const [
      ('guru', 'Guru'),
      ('dbmf', 'DBMF'),
      ('valuation', 'Valuation'),
    ];
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final item in modes)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: InkWell(
                borderRadius: BorderRadius.circular(9),
                onTap: () => onMode(item.$1),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 9,
                  ),
                  decoration: BoxDecoration(
                    color: mode == item.$1
                        ? palette.accent.withValues(alpha: .18)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text(
                    item.$2,
                    style: TextStyle(
                      color: mode == item.$1 ? palette.accent : palette.muted,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class GuruUniversePanel extends StatelessWidget {
  const GuruUniversePanel({
    super.key,
    required this.gurus,
    required this.selectedGuruId,
    required this.search,
    required this.filter,
    required this.palette,
    required this.onSearch,
    required this.onFilter,
    required this.onSelect,
  });

  final List<Map<String, dynamic>> gurus;
  final String selectedGuruId;
  final String search;
  final String filter;
  final Palette palette;
  final ValueChanged<String> onSearch;
  final ValueChanged<String> onFilter;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final filters = const [
      ('all', 'All'),
      ('manager13f', '13F'),
      ('insider', 'Form 4'),
      ('congress', 'STOCK'),
      ('profile', 'Profile'),
    ];
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.account_tree_rounded,
            kicker: 'GURU UNIVERSE',
            title: 'Research sources',
            palette: palette,
          ),
          const SizedBox(height: 14),
          TextField(
            onChanged: onSearch,
            decoration: InputDecoration(
              hintText: 'Search guru / firm / ticker',
              prefixIcon: const Icon(Icons.search_rounded),
              filled: true,
              fillColor: palette.card,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: palette.border),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final item in filters)
                FilterChip(
                  selected: filter == item.$1,
                  onSelected: (_) => onFilter(item.$1),
                  label: Text(item.$2),
                ),
            ],
          ),
          const SizedBox(height: 16),
          for (final guru in gurus)
            GuruListTile(
              guru: guru,
              active: text(guru['id']) == selectedGuruId,
              palette: palette,
              onTap: () => onSelect(text(guru['id'])),
            ),
        ],
      ),
    );
  }
}

class GuruListTile extends StatelessWidget {
  const GuruListTile({
    super.key,
    required this.guru,
    required this.active,
    required this.palette,
    required this.onTap,
  });

  final Map<String, dynamic> guru;
  final bool active;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final summary = asMap(guru['summary']);
    final type = text(guru['type']);
    final metric = type == 'manager13f'
        ? formatMoney(number(summary['totalValue']))
        : type == 'profile'
        ? 'Profile'
        : '${formatNumber(number(summary['recentTransactions']))} trades';
    final sub = type == 'manager13f'
        ? '${formatNumber(number(summary['totalPositions']))} holdings'
        : text(guru['sourceLabel'], text(guru['disclosureKind']));
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: active
                ? palette.accent.withValues(alpha: .14)
                : palette.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: active
                  ? palette.accent.withValues(alpha: .65)
                  : palette.border,
            ),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: palette.accent.withValues(alpha: .18),
                child: Text(
                  text(guru['name'], '?').characters.first.toUpperCase(),
                  style: TextStyle(
                    color: palette.accent,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      text(guru['name']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${disclosureLabel(type)} · $sub',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: palette.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    metric,
                    style: TextStyle(
                      color: palette.text,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  StatusDot(status: text(guru['status']), palette: palette),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CenterColumn extends StatelessWidget {
  const CenterColumn({
    super.key,
    required this.stats,
    required this.signals,
    required this.exposures,
    required this.activeGuruId,
    required this.palette,
    required this.onSelectGuru,
  });

  final ExecutiveStats stats;
  final List<SignalItem> signals;
  final List<ExposureItem> exposures;
  final String activeGuruId;
  final Palette palette;
  final ValueChanged<String> onSelectGuru;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ExecutiveSummaryGrid(stats: stats, palette: palette),
        const SizedBox(height: 14),
        SignalBoard(
          signals: signals.take(12).toList(),
          activeGuruId: activeGuruId,
          palette: palette,
          onSelectGuru: onSelectGuru,
        ),
        const SizedBox(height: 14),
        TickerHeatmap(exposures: exposures.take(12).toList(), palette: palette),
      ],
    );
  }
}

class ExecutiveSummaryGrid extends StatelessWidget {
  const ExecutiveSummaryGrid({
    super.key,
    required this.stats,
    required this.palette,
  });

  final ExecutiveStats stats;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final cards = [
      StatCardData(
        'Coverage',
        '${stats.count}',
        'monitored gurus',
        Icons.radar_rounded,
      ),
      StatCardData(
        '13F AUM',
        formatMoney(stats.aum),
        'live long equity',
        Icons.account_balance_wallet_rounded,
      ),
      StatCardData(
        'Signal spread',
        signedNumber(stats.netSignals),
        'buy/add minus sell/reduce',
        Icons.bolt_rounded,
      ),
      StatCardData(
        'Latest quarter',
        stats.latestQuarter,
        'dominant disclosure window',
        Icons.calendar_month_rounded,
      ),
    ];
    return GridWrap(
      minTileWidth: 190,
      spacing: 12,
      children: [
        for (final card in cards)
          ExecutiveStatCard(data: card, palette: palette),
      ],
    );
  }
}

class ExecutiveStatCard extends StatelessWidget {
  const ExecutiveStatCard({
    super.key,
    required this.data,
    required this.palette,
  });

  final StatCardData data;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Panel(
      palette: palette,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(data.icon, color: palette.accent, size: 20),
          const SizedBox(height: 12),
          Text(
            data.label,
            style: TextStyle(color: palette.muted, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            data.value,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w900,
              color: palette.text,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: 4),
          Text(data.sub, style: TextStyle(color: palette.faint, fontSize: 12)),
        ],
      ),
    );
  }
}

class SignalBoard extends StatelessWidget {
  const SignalBoard({
    super.key,
    required this.signals,
    required this.activeGuruId,
    required this.palette,
    required this.onSelectGuru,
  });

  final List<SignalItem> signals;
  final String activeGuruId;
  final Palette palette;
  final ValueChanged<String> onSelectGuru;

  @override
  Widget build(BuildContext context) {
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.timeline_rounded,
            kicker: 'SIGNAL BOARD',
            title: 'What changed in the public tape',
            trailing: Text(
              '${signals.length} visible',
              style: TextStyle(color: palette.muted),
            ),
            palette: palette,
          ),
          const SizedBox(height: 16),
          if (signals.isEmpty)
            EmptyState(
              text: 'No fresh signals in the current local database.',
              palette: palette,
            )
          else
            for (final signal in signals)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  onTap: () => onSelectGuru(signal.guruId),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: signal.guruId == activeGuruId
                          ? palette.accent.withValues(alpha: .12)
                          : palette.card,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: signal.guruId == activeGuruId
                            ? palette.accent
                            : palette.border,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 6,
                          height: 48,
                          decoration: BoxDecoration(
                            color: signal.tone == 'positive'
                                ? palette.positive
                                : signal.tone == 'negative'
                                ? palette.negative
                                : palette.muted,
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                signal.ticker,
                                style: TextStyle(
                                  color: palette.text,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 16,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${signal.guruName} · ${signal.type} · ${signal.actionLabel}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: palette.muted),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              signal.value > 0
                                  ? formatMoney(signal.value)
                                  : signal.detail,
                              style: TextStyle(
                                color: palette.text,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              formatDate(signal.date),
                              style: TextStyle(
                                color: palette.faint,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

class TickerHeatmap extends StatelessWidget {
  const TickerHeatmap({
    super.key,
    required this.exposures,
    required this.palette,
  });

  final List<ExposureItem> exposures;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final maxValue = exposures.fold<double>(
      0,
      (max, item) => math.max(max, item.value),
    );
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.grid_view_rounded,
            kicker: 'TICKER HEATMAP',
            title: 'Crowded external consensus',
            trailing: Text(
              'founders filtered',
              style: TextStyle(color: palette.muted),
            ),
            palette: palette,
          ),
          const SizedBox(height: 16),
          if (exposures.isEmpty)
            EmptyState(
              text: 'No external consensus exposure after filtering.',
              palette: palette,
            )
          else
            for (final item in exposures)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.ticker,
                            style: TextStyle(
                              color: palette.text,
                              fontWeight: FontWeight.w900,
                              fontSize: 17,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${item.guruCount} 位 · ${item.guruNames}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: palette.muted),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      flex: 2,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: maxValue <= 0
                              ? 0
                              : math.max(.05, item.value / maxValue),
                          minHeight: 9,
                          backgroundColor: palette.border,
                          color: palette.accent,
                        ),
                      ),
                    ),
                    const SizedBox(width: 18),
                    SizedBox(
                      width: 82,
                      child: Text(
                        formatMoney(item.value),
                        textAlign: TextAlign.end,
                        style: TextStyle(
                          color: palette.text,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class GuruInspector extends StatelessWidget {
  const GuruInspector({
    super.key,
    required this.guru,
    required this.api,
    required this.palette,
  });

  final Map<String, dynamic> guru;
  final ApiClient api;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    if (guru.isEmpty) {
      return Panel(
        palette: palette,
        child: EmptyState(text: 'Select a guru to inspect.', palette: palette),
      );
    }

    final summary = asMap(guru['summary']);
    final type = text(guru['type']);
    final holdings = asList(guru['holdings']);
    final activity = asList(guru['activity']);
    final transactions = asList(guru['transactions']);
    final rows = type == 'manager13f'
        ? activity.take(8).toList()
        : transactions.take(8).toList();

    return Column(
      children: [
        Panel(
          palette: palette,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        BadgeLabel(
                          text: disclosureLabel(type),
                          color: palette.accent,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          text(guru['name']),
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(
                                color: palette.text,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0,
                              ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          text(guru['entityName']),
                          style: TextStyle(color: palette.muted, height: 1.25),
                        ),
                      ],
                    ),
                  ),
                  StatusDot(status: text(guru['status']), palette: palette),
                ],
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  InfoChip(text(guru['thesisTag']), palette: palette),
                  InfoChip(
                    text(asMap(guru['simulationTag'])['label']),
                    palette: palette,
                  ),
                ],
              ),
              const SizedBox(height: 18),
              GridWrap(
                minTileWidth: 140,
                spacing: 10,
                children: type == 'manager13f'
                    ? [
                        MiniMetric(
                          'AUM',
                          formatMoney(number(summary['totalValue'])),
                          Icons.wallet_rounded,
                          palette,
                        ),
                        MiniMetric(
                          'Holdings',
                          formatNumber(number(summary['totalPositions'])),
                          Icons.list_alt_rounded,
                          palette,
                        ),
                        MiniMetric(
                          'New / Exit',
                          '${formatNumber(number(summary['newPositions']))}/${formatNumber(number(summary['soldOutPositions']))}',
                          Icons.swap_vert_rounded,
                          palette,
                        ),
                        MiniMetric(
                          'Filing lag',
                          filingLag(summary),
                          Icons.schedule_rounded,
                          palette,
                        ),
                      ]
                    : [
                        MiniMetric(
                          'Source',
                          text(
                            guru['sourceLabel'],
                            text(guru['disclosureKind']),
                          ),
                          Icons.source_rounded,
                          palette,
                        ),
                        MiniMetric(
                          'Activity',
                          formatNumber(number(summary['recentTransactions'])),
                          Icons.receipt_long_rounded,
                          palette,
                        ),
                      ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        BacktestPreview(guru: guru, api: api, palette: palette),
        const SizedBox(height: 14),
        Panel(
          palette: palette,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelTitle(
                icon: Icons.fact_check_rounded,
                kicker: type == 'manager13f'
                    ? 'LATEST FLOW'
                    : 'DISCLOSURE TRAIL',
                title: type == 'manager13f'
                    ? 'Quarterly operations'
                    : 'Recent records',
                palette: palette,
              ),
              const SizedBox(height: 14),
              if (rows.isEmpty)
                EmptyState(
                  text: text(summary['message'], 'No activity rows available.'),
                  palette: palette,
                )
              else
                for (final row in rows)
                  OperationRow(
                    row: row,
                    manager: type == 'manager13f',
                    palette: palette,
                  ),
              if (holdings.isNotEmpty) ...[
                const Divider(height: 28),
                Text(
                  'Top holdings',
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 10),
                for (final holding in holdings.take(8))
                  HoldingRow(
                    holding: holding,
                    total: number(summary['totalValue']),
                    palette: palette,
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class BacktestPreview extends StatefulWidget {
  const BacktestPreview({
    super.key,
    required this.guru,
    required this.api,
    required this.palette,
  });

  final Map<String, dynamic> guru;
  final ApiClient api;
  final Palette palette;

  @override
  State<BacktestPreview> createState() => _BacktestPreviewState();
}

class _BacktestPreviewState extends State<BacktestPreview> {
  Map<String, dynamic>? _payload;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant BacktestPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (text(oldWidget.guru['id']) != text(widget.guru['id'])) {
      _payload = null;
      _error = null;
      _load();
    }
  }

  Future<void> _load() async {
    final id = text(widget.guru['id']);
    if (id.isEmpty || text(widget.guru['type']) != 'manager13f') return;
    setState(() => _loading = true);
    try {
      final payload = await widget.api.getJson('/api/gurus/$id/backtest');
      if (mounted) setState(() => _payload = payload);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sim = asMap(widget.guru['simulationTag']);
    if (text(widget.guru['type']) != 'manager13f' ||
        text(sim['tone']) == 'muted') {
      return Panel(
        palette: widget.palette,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PanelTitle(
              icon: Icons.motion_photos_off_rounded,
              kicker: 'COPY SIMULATION',
              title: 'Not copy-tradable',
              palette: widget.palette,
            ),
            const SizedBox(height: 10),
            Text(
              text(
                sim['description'],
                'This profile is not suitable for proportional 13F copy trading.',
              ),
              style: TextStyle(color: widget.palette.muted),
            ),
          ],
        ),
      );
    }

    final equity = asList(_payload?['equity']);
    final summary = asMap(_payload?['summary']);
    return Panel(
      palette: widget.palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.stacked_line_chart_rounded,
            kicker: 'COPY SIMULATION',
            title: 'Portfolio vs SPY',
            palette: widget.palette,
          ),
          const SizedBox(height: 12),
          if (_loading && _payload == null)
            const SizedBox(
              height: 160,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null && _payload == null)
            EmptyState(text: _error!, palette: widget.palette)
          else if (text(_payload?['status']) != 'ready')
            EmptyState(
              text: text(
                asMap(_payload?['method'])['reason'],
                'Backtest is not ready.',
              ),
              palette: widget.palette,
            )
          else ...[
            GridWrap(
              minTileWidth: 120,
              spacing: 8,
              children: [
                MiniMetric(
                  'Total',
                  formatReturn(number(summary['totalReturn'])),
                  Icons.trending_up_rounded,
                  widget.palette,
                ),
                MiniMetric(
                  'SPY',
                  formatReturn(
                    number(asMap(summary['benchmark'])['totalReturn']),
                  ),
                  Icons.show_chart_rounded,
                  widget.palette,
                ),
                MiniMetric(
                  'Sharpe',
                  number(summary['sharpe']).toStringAsFixed(2),
                  Icons.speed_rounded,
                  widget.palette,
                ),
                MiniMetric(
                  'MDD',
                  formatReturn(number(summary['maxDrawdown'])),
                  Icons.arrow_downward_rounded,
                  widget.palette,
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 180,
              child: EquityChart(equity: equity, palette: widget.palette),
            ),
          ],
        ],
      ),
    );
  }
}

class EquityChart extends StatelessWidget {
  const EquityChart({super.key, required this.equity, required this.palette});

  final List<Map<String, dynamic>> equity;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    if (equity.length < 2) {
      return EmptyState(text: 'No equity curve available.', palette: palette);
    }
    return CustomPaint(
      painter: EquityPainter(equity: equity, palette: palette),
      size: Size.infinite,
    );
  }
}

class EquityPainter extends CustomPainter {
  EquityPainter({required this.equity, required this.palette});

  final List<Map<String, dynamic>> equity;
  final Palette palette;

  @override
  void paint(Canvas canvas, Size size) {
    final left = 8.0;
    final right = size.width - 8;
    final top = 12.0;
    final bottom = size.height - 22;
    final values = equity
        .expand<double>(
          (point) => [number(point['value']), number(point['benchmark'])],
        )
        .where((value) => value > 0)
        .toList();
    final minValue = values.reduce(math.min);
    final maxValue = values.reduce(math.max);
    final span = math.max(.0001, maxValue - minValue);

    final gridPaint = Paint()
      ..color = palette.border
      ..strokeWidth = 1;
    for (var i = 0; i < 4; i += 1) {
      final y = top + (bottom - top) * i / 3;
      canvas.drawLine(Offset(left, y), Offset(right, y), gridPaint);
    }

    Path pathFor(String key) {
      final path = Path();
      for (var i = 0; i < equity.length; i += 1) {
        final x = left + (right - left) * i / (equity.length - 1);
        final y =
            bottom -
            ((number(equity[i][key]) - minValue) / span) * (bottom - top);
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      return path;
    }

    canvas.drawPath(
      pathFor('benchmark'),
      Paint()
        ..color = palette.secondary
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2,
    );
    canvas.drawPath(
      pathFor('value'),
      Paint()
        ..color = palette.positive
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );

    final labelStyle = TextStyle(
      color: palette.faint,
      fontSize: 11,
      fontWeight: FontWeight.w700,
    );
    final start = formatDate(text(equity.first['date']));
    final end = formatDate(text(equity.last['date']));
    _drawText(
      canvas,
      start,
      Offset(left, bottom + 7),
      labelStyle,
      TextAlign.left,
    );
    _drawText(
      canvas,
      end,
      Offset(right - 76, bottom + 7),
      labelStyle,
      TextAlign.right,
    );
  }

  void _drawText(
    Canvas canvas,
    String text,
    Offset offset,
    TextStyle style,
    TextAlign align,
  ) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      textAlign: align,
    )..layout(maxWidth: 90);
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant EquityPainter oldDelegate) =>
      oldDelegate.equity != equity ||
      oldDelegate.palette.colorBlind != palette.colorBlind;
}

class OperationRow extends StatelessWidget {
  const OperationRow({
    super.key,
    required this.row,
    required this.manager,
    required this.palette,
  });

  final Map<String, dynamic> row;
  final bool manager;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final action = text(row['action']);
    final positive = ['new', 'increased', 'buy'].contains(action);
    final negative = ['reduced', 'sold_out', 'sell'].contains(action);
    final ticker = text(row['ticker'], compactName(text(row['issuer'])));
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Container(
            width: 5,
            height: 42,
            decoration: BoxDecoration(
              color: positive
                  ? palette.positive
                  : negative
                  ? palette.negative
                  : palette.muted,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ticker,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  actionLabel(action),
                  style: TextStyle(
                    color: positive
                        ? palette.positive
                        : negative
                        ? palette.negative
                        : palette.muted,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                manager
                    ? formatMoney(
                        number(row['value']) + number(row['previousValue']),
                      )
                    : formatMoney(
                        number(row['value']) + number(row['notional']),
                      ),
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                manager
                    ? formatNumber(number(row['changeShares']).abs())
                    : formatDate(
                        text(row['transactionDate'], text(row['filingDate'])),
                      ),
                style: TextStyle(color: palette.faint, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class HoldingRow extends StatelessWidget {
  const HoldingRow({
    super.key,
    required this.holding,
    required this.total,
    required this.palette,
  });

  final Map<String, dynamic> holding;
  final double total;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final value = number(holding['value']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  text(holding['ticker'], compactName(text(holding['issuer']))),
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  compactName(text(holding['issuer'])),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 70,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: total <= 0 ? 0 : math.max(.04, value / total),
                minHeight: 8,
                backgroundColor: palette.border,
                color: palette.accent,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            formatMoney(value),
            style: TextStyle(color: palette.text, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

class SecondaryDashboard extends StatelessWidget {
  const SecondaryDashboard({
    super.key,
    required this.mode,
    required this.data,
    required this.loading,
    required this.palette,
  });

  final String mode;
  final Map<String, dynamic>? data;
  final bool loading;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final title = mode == 'dbmf'
        ? 'DBMF Exposure Dashboard'
        : 'Valuation Research Terminal';
    final subtitle = mode == 'dbmf'
        ? 'Official holdings and trend-following exposure from the shared backend.'
        : 'Fundamental-analysis valuation snapshots, fair value, and current price context.';

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Panel(
            palette: palette,
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      BadgeLabel(
                        text: mode.toUpperCase(),
                        color: palette.accent,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        title,
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(
                              color: palette.text,
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Text(subtitle, style: TextStyle(color: palette.muted)),
                    ],
                  ),
                ),
                Icon(
                  mode == 'dbmf'
                      ? Icons.waves_rounded
                      : Icons.query_stats_rounded,
                  size: 44,
                  color: palette.accent,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (loading)
            const SizedBox(
              height: 260,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (data == null)
            Panel(
              palette: palette,
              child: EmptyState(
                text: 'Data has not loaded yet.',
                palette: palette,
              ),
            )
          else
            mode == 'dbmf'
                ? DbmfCompactDashboard(data: data!, palette: palette)
                : ValuationCompactDashboard(data: data!, palette: palette),
        ],
      ),
    );
  }
}

class DbmfCompactDashboard extends StatelessWidget {
  const DbmfCompactDashboard({
    super.key,
    required this.data,
    required this.palette,
  });

  final Map<String, dynamic> data;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final latestExposure = asMap(data['latestExposure']);
    final snapshots = asList(data['snapshots']);
    final latestSnapshot = snapshots.isNotEmpty
        ? asMap(snapshots.last)
        : const <String, dynamic>{};
    final exposureRows = asList(latestExposure['records']);
    final holdingsRows = asList(latestSnapshot['holdings']);
    final rows = exposureRows.isNotEmpty
        ? exposureRows.take(18).toList()
        : holdingsRows.take(18).toList();
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.waves_rounded,
            kicker: 'MANAGED FUTURES',
            title: 'Current DBMF book',
            palette: palette,
          ),
          const SizedBox(height: 14),
          if (rows.isEmpty)
            EmptyState(
              text: 'No DBMF holdings rows found in the backend response.',
              palette: palette,
            )
          else
            for (final row in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        text(
                          row['asset_name'],
                          text(
                            row['assetName'],
                            text(row['securityName'], text(row['ticker'])),
                          ),
                        ),
                        style: TextStyle(
                          color: palette.text,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Text(
                      text(row['ticker'], text(row['asset_key'], '-')),
                      style: TextStyle(color: palette.muted),
                    ),
                    const SizedBox(width: 18),
                    Text(
                      formatCurrencyValue(
                        number(row['market_value']) +
                            number(row['marketValue']),
                        'USD',
                      ),
                      style: TextStyle(
                        color: palette.text,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(width: 18),
                    SizedBox(
                      width: 72,
                      child: Text(
                        formatReturn(
                          number(row['exposure']) + number(row['weight']),
                        ),
                        textAlign: TextAlign.end,
                        style: TextStyle(
                          color:
                              (number(row['exposure']) +
                                      number(row['weight'])) >=
                                  0
                              ? palette.positive
                              : palette.negative,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class ValuationCompactDashboard extends StatelessWidget {
  const ValuationCompactDashboard({
    super.key,
    required this.data,
    required this.palette,
  });

  final Map<String, dynamic> data;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final tickers = asList(data['tickers']).isNotEmpty
        ? asList(data['tickers'])
        : asList(data['stocks']);
    final rows = tickers.take(24).toList();
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.query_stats_rounded,
            kicker: 'VALUATION',
            title: 'Fair value watchlist',
            palette: palette,
          ),
          const SizedBox(height: 14),
          if (rows.isEmpty)
            EmptyState(
              text: 'No valuation rows found in the backend response.',
              palette: palette,
            )
          else
            for (final row in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            text(row['ticker'], text(row['symbol'])),
                            style: TextStyle(
                              color: palette.text,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Text(
                            text(
                              row['companyName'],
                              text(row['name'], text(row['sector'])),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.muted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Builder(
                      builder: (context) {
                        final latest = asMap(row['latest']);
                        final currency = text(row['currency'], 'USD');
                        final latestPrice = number(latest['latestPrice']);
                        final fairValue = number(latest['baseFairValue']);
                        final upside = number(latest['upsideToBase']);
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              formatCurrencyValue(latestPrice, currency),
                              style: TextStyle(
                                color: palette.text,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'FV ${formatCurrencyValue(fairValue, currency)}',
                              style: TextStyle(
                                color: palette.faint,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              formatReturn(upside),
                              style: TextStyle(
                                color: upside >= 0
                                    ? palette.positive
                                    : palette.negative,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class ApiClient {
  ApiClient(this.accessToken);

  final String accessToken;

  Future<Map<String, dynamic>> getJson(String path) async {
    final uri = apiUri(path);
    final response = await http.get(
      uri,
      headers: {'authorization': 'Bearer $accessToken'},
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      String message = response.body;
      try {
        final payload = jsonDecode(response.body);
        if (payload is Map) {
          message = text(payload['message'], text(payload['error']));
        }
      } catch (_) {}
      throw Exception(message.isEmpty ? 'API ${response.statusCode}' : message);
    }
    final decoded = jsonDecode(response.body);
    if (decoded is Map) {
      return decoded.map((key, value) => MapEntry('$key', value));
    }
    throw Exception('API returned a non-object payload');
  }
}

Uri apiUri(String path) {
  final base = apiBaseUrl();
  if (base.isNotEmpty) {
    return Uri.parse('$base$path');
  }
  final normalized = path.startsWith('/') ? path.substring(1) : path;
  return Uri.base.resolve(normalized);
}

String apiBaseUrl() {
  final configured = _apiBaseUrl.trim();
  if (configured.isNotEmpty) return configured.replaceAll(RegExp(r'/+$'), '');
  final host = Uri.base.host;
  if (host == 'localhost' || host == '127.0.0.1' || host.isEmpty) {
    return 'http://127.0.0.1:8787';
  }
  return '';
}

class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.child,
    required this.palette,
    this.padding = const EdgeInsets.all(18),
  });

  final Widget child;
  final Palette palette;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: panelDecoration(palette),
      child: child,
    );
  }
}

BoxDecoration panelDecoration(Palette palette) {
  return BoxDecoration(
    color: palette.panel,
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: palette.border),
    boxShadow: [
      BoxShadow(
        color: Colors.black.withValues(alpha: .16),
        blurRadius: 24,
        offset: const Offset(0, 16),
      ),
    ],
  );
}

class PanelTitle extends StatelessWidget {
  const PanelTitle({
    super.key,
    required this.icon,
    required this.kicker,
    required this.title,
    required this.palette,
    this.trailing,
  });

  final IconData icon;
  final String kicker;
  final String title;
  final Palette palette;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: palette.accent, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                kicker,
                style: TextStyle(
                  color: palette.muted,
                  fontWeight: FontWeight.w900,
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                title,
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w900,
                  fontSize: 18,
                ),
              ),
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

class MiniMetric extends StatelessWidget {
  const MiniMetric(
    this.label,
    this.value,
    this.icon,
    this.palette, {
    super.key,
  });

  final String label;
  final String value;
  final IconData icon;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: palette.secondary, size: 17),
          const SizedBox(height: 10),
          Text(
            label,
            style: TextStyle(
              color: palette.muted,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.text,
              fontWeight: FontWeight.w900,
              fontSize: 16,
            ),
          ),
        ],
      ),
    );
  }
}

class BadgeLabel extends StatelessWidget {
  const BadgeLabel({super.key, required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .13),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: .35)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: .4,
        ),
      ),
    );
  }
}

class InfoChip extends StatelessWidget {
  const InfoChip(this.label, {super.key, required this.palette});

  final String label;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    if (label.trim().isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: palette.border),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: palette.muted,
          fontWeight: FontWeight.w800,
          fontSize: 12,
        ),
      ),
    );
  }
}

class StatusDot extends StatelessWidget {
  const StatusDot({super.key, required this.status, required this.palette});

  final String status;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final color = status == 'live' || status == 'profile'
        ? palette.positive
        : palette.negative;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          status.isEmpty ? 'cached' : status,
          style: TextStyle(
            color: palette.muted,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.text, required this.palette});

  final String text;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Text(text, style: TextStyle(color: palette.muted)),
    );
  }
}

class ErrorCard extends StatelessWidget {
  const ErrorCard({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final palette = Palette(false);
    return Panel(
      palette: palette,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline_rounded, color: palette.negative, size: 34),
          const SizedBox(height: 12),
          Text(message, style: TextStyle(color: palette.text)),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class GridWrap extends StatelessWidget {
  const GridWrap({
    super.key,
    required this.children,
    this.minTileWidth = 180,
    this.spacing = 12,
  });

  final List<Widget> children;
  final double minTileWidth;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final columns = math.max(1, (width / minTileWidth).floor());
        final itemWidth = (width - spacing * (columns - 1)) / columns;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [
            for (final child in children)
              SizedBox(width: itemWidth, child: child),
          ],
        );
      },
    );
  }
}

class Palette {
  Palette(this.colorBlind);

  final bool colorBlind;

  Color get background => const Color(0xFF0B111D);
  Color get panel => const Color(0xFF111827);
  Color get card => const Color(0xFF172033);
  Color get text => const Color(0xFFF7FAFC);
  Color get muted => const Color(0xFFAAB5C4);
  Color get faint => const Color(0xFF708093);
  Color get border => const Color(0xFF273244);
  Color get accent =>
      colorBlind ? const Color(0xFF58A6FF) : const Color(0xFF22D3A6);
  Color get secondary => const Color(0xFFE0B15A);
  Color get positive =>
      colorBlind ? const Color(0xFF4EA1F3) : const Color(0xFF18A878);
  Color get negative =>
      colorBlind ? const Color(0xFFFFB454) : const Color(0xFFE15A5A);
}

class ExecutiveStats {
  const ExecutiveStats({
    required this.count,
    required this.aum,
    required this.netSignals,
    required this.latestQuarter,
  });

  final int count;
  final double aum;
  final int netSignals;
  final String latestQuarter;
}

class SignalItem {
  const SignalItem({
    required this.guruId,
    required this.guruName,
    required this.type,
    required this.ticker,
    required this.actionLabel,
    required this.date,
    required this.value,
    required this.detail,
    required this.tone,
  });

  final String guruId;
  final String guruName;
  final String type;
  final String ticker;
  final String actionLabel;
  final String date;
  final double value;
  final String detail;
  final String tone;
}

class ExposureItem {
  ExposureItem({
    required this.ticker,
    required this.value,
    required this.guruNames,
  });

  final String ticker;
  double value;
  final Set<String> guruNames;

  int get guruCount => guruNames.length;
}

class StatCardData {
  const StatCardData(this.label, this.value, this.sub, this.icon);

  final String label;
  final String value;
  final String sub;
  final IconData icon;
}

ExecutiveStats buildExecutiveStats(
  List<Map<String, dynamic>> gurus,
  List<SignalItem> signals,
) {
  final aum = gurus
      .where((guru) => text(guru['type']) == 'manager13f')
      .fold<double>(
        0,
        (sum, guru) => sum + number(asMap(guru['summary'])['totalValue']),
      );
  final buys = signals.where((item) => item.tone == 'positive').length;
  final sells = signals.where((item) => item.tone == 'negative').length;
  final quarters =
      gurus
          .map((guru) => text(asMap(guru['summary'])['reportDate']))
          .where((value) => value.isNotEmpty)
          .toList()
        ..sort();
  return ExecutiveStats(
    count: gurus.length,
    aum: aum,
    netSignals: buys - sells,
    latestQuarter: quarters.isEmpty ? '-' : formatDate(quarters.last),
  );
}

List<Map<String, dynamic>> filterGurus(
  List<Map<String, dynamic>> gurus,
  String search,
  String filter,
) {
  final needle = search.trim().toLowerCase();
  return gurus.where((guru) {
    final type = text(guru['type']);
    if (filter != 'all' && type != filter) return false;
    if (needle.isEmpty) return true;
    final haystack = [
      guru['name'],
      guru['chineseName'],
      guru['entityName'],
      guru['thesisTag'],
      asMap(guru['summary'])['latestTicker'],
    ].map(text).join(' ').toLowerCase();
    return haystack.contains(needle);
  }).toList();
}

List<SignalItem> buildSignals(List<Map<String, dynamic>> gurus) {
  final signals = <SignalItem>[];
  for (final guru in gurus) {
    final type = text(guru['type']);
    final guruName = text(guru['name']);
    final guruId = text(guru['id']);
    final summary = asMap(guru['summary']);
    if (type == 'manager13f') {
      for (final item in asList(guru['activity']).take(14)) {
        final action = text(item['action']);
        final positive = action == 'new' || action == 'increased';
        final negative = action == 'reduced' || action == 'sold_out';
        signals.add(
          SignalItem(
            guruId: guruId,
            guruName: guruName,
            type: disclosureLabel(type),
            ticker: text(item['ticker'], compactName(text(item['issuer']))),
            actionLabel: actionLabel(action),
            date: text(summary['reportDate']),
            value: number(item['value']) + number(item['previousValue']),
            detail:
                '${formatNumber(number(item['changeShares']).abs())} shares',
            tone: positive
                ? 'positive'
                : negative
                ? 'negative'
                : 'neutral',
          ),
        );
      }
    } else {
      for (final tx in asList(guru['transactions']).take(18)) {
        final action = text(tx['action']);
        final positive = action == 'buy';
        final negative = action == 'sell';
        signals.add(
          SignalItem(
            guruId: guruId,
            guruName: guruName,
            type: disclosureLabel(type),
            ticker: text(tx['ticker'], compactName(text(tx['issuer']))),
            actionLabel: actionLabel(action),
            date: text(tx['transactionDate'], text(tx['filingDate'])),
            value: number(tx['value']) + number(tx['notional']),
            detail: text(
              tx['amountRange'],
              '${formatNumber(number(tx['shares']))} shares',
            ),
            tone: positive
                ? 'positive'
                : negative
                ? 'negative'
                : 'neutral',
          ),
        );
      }
    }
  }
  signals.sort((a, b) => b.date.compareTo(a.date));
  return signals;
}

List<ExposureItem> buildExposures(List<Map<String, dynamic>> gurus) {
  final byTicker = <String, ExposureItem>{};
  for (final guru in gurus) {
    if (text(guru['type']) != 'manager13f') continue;
    if (truthy(guru['excludeFromHeatmap'])) continue;
    for (final holding in asList(guru['holdings']).take(24)) {
      final ticker = text(holding['ticker']).toUpperCase();
      if (!RegExp(r'^[A-Z][A-Z0-9.-]{0,9}$').hasMatch(ticker)) continue;
      final current = byTicker.putIfAbsent(
        ticker,
        () => ExposureItem(ticker: ticker, value: 0, guruNames: <String>{}),
      );
      current.value += number(holding['value']);
      current.guruNames.add(text(guru['name']));
    }
  }
  final rows = byTicker.values.toList()
    ..sort((a, b) {
      final countCompare = b.guruCount.compareTo(a.guruCount);
      return countCompare != 0 ? countCompare : b.value.compareTo(a.value);
    });
  return rows;
}

List<Map<String, dynamic>> asList(dynamic value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => item.map((key, value) => MapEntry('$key', value)))
      .toList();
}

Map<String, dynamic> asMap(dynamic value) {
  if (value is! Map) return const {};
  return value.map((key, value) => MapEntry('$key', value));
}

String text(dynamic value, [String fallback = '']) {
  final string = value?.toString().trim() ?? '';
  return string.isEmpty ? fallback : string;
}

double number(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(text(value).replaceAll(',', '')) ?? 0;
}

bool truthy(dynamic value) =>
    value == true || text(value).toLowerCase() == 'true';

String compactName(String value) => value
    .replaceAll(RegExp(r'\s+'), ' ')
    .replaceAll(RegExp(r' - COMMON STOCK.*$', caseSensitive: false), '')
    .trim();

String disclosureLabel(String type) => switch (type) {
  'manager13f' => '13F fund',
  'insider' => 'Form 4',
  'congress' => 'STOCK Act',
  'profile' => 'Profile',
  _ => type.isEmpty ? 'Disclosure' : type,
};

String actionLabel(String action) => switch (action) {
  'new' => '新增',
  'increased' => '加仓',
  'reduced' => '减仓',
  'sold_out' => '清仓',
  'buy' => '买入',
  'sell' => '卖出',
  'award' => '授予',
  'option_exercise' => '行权',
  'tax_withholding' => '税务扣缴',
  'gift' => '赠与',
  _ => action.isEmpty ? '其他' : action,
};

String filingLag(Map<String, dynamic> summary) {
  final report = DateTime.tryParse(text(summary['reportDate']));
  final filing = DateTime.tryParse(text(summary['filingDate']));
  if (report == null || filing == null) return '13F';
  return '${filing.difference(report).inDays}d';
}

String formatDate(String value) {
  final date = DateTime.tryParse(value);
  if (date == null) return value.isEmpty ? '-' : value;
  return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
}

String formatNumber(double value) {
  if (!value.isFinite) return '-';
  final rounded = value.round();
  final chars = rounded.abs().toString().split('').reversed.toList();
  final buffer = StringBuffer();
  for (var i = 0; i < chars.length; i += 1) {
    if (i > 0 && i % 3 == 0) buffer.write(',');
    buffer.write(chars[i]);
  }
  final body = buffer.toString().split('').reversed.join();
  return rounded < 0 ? '-$body' : body;
}

String signedNumber(int value) => value >= 0 ? '+$value' : '$value';

String formatMoney(double value) {
  if (!value.isFinite || value == 0) return '\$0';
  final abs = value.abs();
  final sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return '$sign\$${(abs / 1e9).toStringAsFixed(2)}B';
  if (abs >= 1e6) return '$sign\$${(abs / 1e6).toStringAsFixed(1)}M';
  if (abs >= 1e3) return '$sign\$${(abs / 1e3).toStringAsFixed(1)}K';
  return '$sign\$${abs.toStringAsFixed(0)}';
}

String formatCurrencyValue(double value, String currency) {
  if (!value.isFinite || value == 0) return '${currencySymbol(currency)}0';
  final symbol = currencySymbol(currency);
  return '$symbol${value.toStringAsFixed(value >= 100 ? 0 : 2)}';
}

String currencySymbol(String currency) => switch (currency.toUpperCase()) {
  'GBP' => '£',
  'EUR' => '€',
  'USD' => '\$',
  _ => '${currency.toUpperCase()} ',
};

String formatReturn(double value) {
  if (!value.isFinite) return '-';
  final sign = value >= 0 ? '+' : '';
  return '$sign${(value * 100).toStringAsFixed(1)}%';
}
