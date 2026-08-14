import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'browser_location.dart';

const _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const _supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');
const _adminEmail = 'luyudong1136@gmail.com';
const _authDevBypass = String.fromEnvironment(
  'AUTH_DEV_BYPASS',
  defaultValue: 'false',
);
const _localDevToken = 'local-dev-token';

bool get _authConfigured =>
    _supabaseUrl.trim().isNotEmpty && _supabaseAnonKey.trim().isNotEmpty;

bool isAdminEmail(String value) => value.trim().toLowerCase() == _adminEmail;

enum AppLanguage { zh, en }

AppLanguage parseAppLanguage(String? value) =>
    text(value).toLowerCase().startsWith('en')
    ? AppLanguage.en
    : AppLanguage.zh;

String trFor(AppLanguage language, String zh, String en) =>
    language == AppLanguage.en ? en : zh;

class LanguageScope extends InheritedWidget {
  const LanguageScope({
    super.key,
    required this.language,
    required super.child,
  });

  final AppLanguage language;

  static AppLanguage of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<LanguageScope>()?.language ??
      AppLanguage.zh;

  @override
  bool updateShouldNotify(covariant LanguageScope oldWidget) =>
      oldWidget.language != language;
}

extension LanguageContext on BuildContext {
  AppLanguage get language => LanguageScope.of(this);
  bool get isEnglish => language == AppLanguage.en;
  bool get isChinese => language == AppLanguage.zh;
  String tr(String zh, String en) => trFor(language, zh, en);
}

bool _supabaseReady = false;
Object? _supabaseInitError;
Future<bool>? _supabaseInitFuture;

Future<bool> _ensureSupabaseReady() {
  if (!_authConfigured) return Future.value(false);
  if (_supabaseReady) return Future.value(true);
  return _supabaseInitFuture ??= () async {
    try {
      await Supabase.initialize(
        url: _supabaseUrl,
        publishableKey: _supabaseAnonKey,
      ).timeout(const Duration(seconds: 8));
      _supabaseReady = true;
      _supabaseInitError = null;
      return true;
    } catch (error) {
      _supabaseInitError = error;
      return false;
    }
  }();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
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
  String? _authMessage;
  Session? _session;
  StreamSubscription<AuthState>? _authSub;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    if (await _ensureSupabaseReady()) {
      final client = Supabase.instance.client;
      _session = client.auth.currentSession;
      _authSub = client.auth.onAuthStateChange.listen((event) {
        if (!mounted) return;
        setState(() => _session = event.session);
      });
    } else if (_authConfigured) {
      _authMessage =
          'Supabase auth did not initialize. Check DNS/network and Supabase URL.';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }

  Future<void> _signInWithGoogle() async {
    if (!await _ensureSupabaseReady()) {
      if (!mounted) return;
      setState(() {
        _authMessage =
            'Supabase auth is not reachable yet. Refresh after network/DNS is back.';
      });
      return;
    }
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
        authConfigured: _authConfigured && _supabaseReady,
        localBypassEnabled: _authDevBypass == 'true',
        authMessage: _authMessage ?? _supabaseInitError?.toString(),
        onGoogle: _signInWithGoogle,
        onLocal: () => setState(() => _localWorkspace = true),
      );
    }

    final user = _localWorkspace
        ? 'Local Workspace'
        : (_session?.user.userMetadata?['full_name']?.toString() ??
              _session?.user.email ??
              'Research user');
    final userEmail = _localWorkspace
        ? 'local-dev@guru-analysis.test'
        : (_session?.user.email ?? '');

    return TerminalHome(
      accessToken: token,
      userName: user,
      userEmail: userEmail,
      onLogout: _logout,
    );
  }
}

class LoginScreen extends StatelessWidget {
  const LoginScreen({
    super.key,
    required this.authConfigured,
    required this.localBypassEnabled,
    this.authMessage,
    required this.onGoogle,
    required this.onLocal,
  });

  final bool authConfigured;
  final bool localBypassEnabled;
  final String? authMessage;
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
                  authMessage ??
                      (authConfigured
                          ? 'Production mode uses Supabase Google auth.'
                          : 'Supabase keys are not configured or auth is not reachable; local workspace mode is available for development.'),
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
    required this.userEmail,
    required this.onLogout,
  });

  final String accessToken;
  final String userName;
  final String userEmail;
  final VoidCallback onLogout;

  @override
  State<TerminalHome> createState() => _TerminalHomeState();
}

class _TerminalHomeState extends State<TerminalHome>
    with WidgetsBindingObserver {
  late final ApiClient _api = ApiClient(() => widget.accessToken);
  Map<String, dynamic>? _guruPayload;
  Map<String, dynamic>? _ontologyPayload;
  Map<String, dynamic>? _portfolioPayload;
  Map<String, dynamic>? _valuationPayload;
  Map<String, dynamic>? _adminPayload;
  bool _loadingGurus = true;
  bool _loadingSecondary = false;
  String _mode = 'guru';
  String _search = '';
  String _filter = 'all';
  String? _selectedGuruId;
  int _guruModule = 0;
  String _guruTradeTicker = '';
  String _guruQuarterId = '';
  String _valuationTicker = '';
  String? _error;
  String? _secondaryError;
  bool _colorBlind = false;
  AppLanguage _language = AppLanguage.zh;
  Timer? _secondaryRecoveryTimer;
  bool _secondaryRecoveryScheduled = false;
  int _guruRequestSerial = 0;
  int _secondaryRequestSerial = 0;

  Palette get palette => Palette(_colorBlind);
  bool get _adminEnabled => isAdminEmail(widget.userEmail);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _secondaryRecoveryTimer = Timer.periodic(
      const Duration(minutes: 2),
      (_) => _recoverSecondaryIfNeeded(),
    );
    final route = readBrowserQuery();
    _mode = normalizeRouteMode(route['view'] ?? route['mode']);
    if (_mode == 'admin' && !_adminEnabled) _mode = 'guru';
    _selectedGuruId = cleanRouteValue(route['guru']);
    _guruModule = guruModuleIndex(route['module']);
    _guruTradeTicker = cleanRouteValue(route['trade'])?.toUpperCase() ?? '';
    _guruQuarterId = cleanRouteValue(route['quarter']) ?? '';
    _valuationTicker = cleanRouteValue(route['valuation'])?.toUpperCase() ?? '';
    _language = parseAppLanguage(route['lang']);
    _loadGurus();
    if (_mode != 'guru') {
      unawaited(_loadSecondary(_mode));
    }
  }

  @override
  void didUpdateWidget(covariant TerminalHome oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.accessToken != widget.accessToken) {
      _recoverSecondaryIfNeeded(forceWhenEmpty: true);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _recoverSecondaryIfNeeded(forceWhenEmpty: true);
    }
  }

  @override
  void dispose() {
    _secondaryRecoveryTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _loadGurus({bool refresh = false}) async {
    final requestId = ++_guruRequestSerial;
    setState(() {
      _loadingGurus = true;
      _error = null;
    });
    try {
      final payload = await _api.getJson(
        '/api/gurus${refresh ? '?refresh=1' : ''}',
      );
      final gurus = asList(payload['gurus']);
      if (!mounted || requestId != _guruRequestSerial) return;
      setState(() {
        _guruPayload = payload;
        final selectedExists = gurus.any(
          (guru) => text(guru['id']) == _selectedGuruId,
        );
        if (_selectedGuruId == null || !selectedExists) {
          _selectedGuruId = defaultGuruId(gurus);
        }
      });
      _persistRouteState();
    } catch (error) {
      if (mounted && requestId == _guruRequestSerial) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted && requestId == _guruRequestSerial) {
        setState(() => _loadingGurus = false);
      }
    }
  }

  Map<String, dynamic>? _secondaryPayloadFor(String mode) => switch (mode) {
    'ontology' => _ontologyPayload,
    'portfolio' => _portfolioPayload,
    'admin' => _adminPayload,
    _ => _valuationPayload,
  };

  void _recoverSecondaryIfNeeded({bool forceWhenEmpty = false}) {
    if (!mounted || _mode == 'guru' || _loadingSecondary) return;
    final payload = _secondaryPayloadFor(_mode);
    if (payload == null || _secondaryError != null || forceWhenEmpty) {
      unawaited(_loadSecondary(_mode, refresh: payload != null));
    }
  }

  void _scheduleSecondaryRecoveryIfStale() {
    if (_secondaryRecoveryScheduled ||
        _mode == 'guru' ||
        _loadingSecondary ||
        _secondaryError != null ||
        _secondaryPayloadFor(_mode) != null) {
      return;
    }
    _secondaryRecoveryScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _secondaryRecoveryScheduled = false;
      if (!mounted ||
          _mode == 'guru' ||
          _loadingSecondary ||
          _secondaryError != null ||
          _secondaryPayloadFor(_mode) != null) {
        return;
      }
      _recoverSecondaryIfNeeded(forceWhenEmpty: true);
    });
  }

  Future<void> _loadSecondary(String mode, {bool refresh = false}) async {
    if (!refresh && mode == 'ontology' && _ontologyPayload != null) return;
    if (!refresh && mode == 'portfolio' && _portfolioPayload != null) return;
    if (!refresh && mode == 'valuation' && _valuationPayload != null) return;
    if (!refresh && mode == 'admin' && _adminPayload != null) return;
    if (mode == 'admin' && !_adminEnabled) return;
    final requestId = ++_secondaryRequestSerial;
    setState(() {
      _loadingSecondary = true;
      _secondaryError = null;
    });
    try {
      final basePath = switch (mode) {
        'ontology' => '/api/ontology/overview',
        'portfolio' => '/api/portfolio',
        'admin' => '/api/admin/portfolio-users',
        _ => '/api/valuation',
      };
      final path = refresh ? '$basePath?refresh=1' : basePath;
      final payload = await _api.getJson(path);
      if (!mounted || requestId != _secondaryRequestSerial) return;
      setState(() {
        if (mode == 'ontology') _ontologyPayload = payload;
        if (mode == 'portfolio') _portfolioPayload = payload;
        if (mode == 'valuation') _valuationPayload = payload;
        if (mode == 'admin') _adminPayload = payload;
        _secondaryError = null;
      });
    } catch (error) {
      if (mounted && requestId == _secondaryRequestSerial) {
        setState(() => _secondaryError = error.toString());
      }
    } finally {
      if (mounted && requestId == _secondaryRequestSerial) {
        setState(() => _loadingSecondary = false);
      }
    }
  }

  void _changeMode(String mode) {
    if (mode == 'admin' && !_adminEnabled) return;
    setState(() {
      _mode = mode;
      _secondaryError = null;
    });
    _persistRouteState();
    if (mode != 'guru') unawaited(_loadSecondary(mode));
  }

  void _persistRouteState() {
    replaceBrowserQuery({
      'view': _mode == 'guru' ? null : _mode,
      'guru': _mode == 'guru' ? _selectedGuruId : null,
      'module': _mode == 'guru' && _guruModule > 0
          ? guruModuleRouteName(_guruModule)
          : null,
      'trade': _mode == 'guru' && _guruTradeTicker.isNotEmpty
          ? _guruTradeTicker
          : null,
      'quarter':
          _mode == 'guru' && _guruModule == 2 && _guruQuarterId.isNotEmpty
          ? _guruQuarterId
          : null,
      'valuation': _mode == 'valuation' && _valuationTicker.isNotEmpty
          ? _valuationTicker
          : null,
      'lang': _language == AppLanguage.en ? 'en' : null,
    });
  }

  void _setLanguage(AppLanguage language) {
    if (_language == language) return;
    setState(() => _language = language);
    _persistRouteState();
  }

  void _selectGuru(String id) {
    setState(() {
      _selectedGuruId = id;
      _guruTradeTicker = '';
      _guruQuarterId = '';
    });
    _persistRouteState();
  }

  @override
  Widget build(BuildContext context) {
    _scheduleSecondaryRecoveryIfStale();
    return LanguageScope(
      language: _language,
      child: Scaffold(
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
                language: _language,
                showAdmin: _adminEnabled,
                onMode: _changeMode,
                onRefresh: () => _mode == 'guru'
                    ? _loadGurus(refresh: true)
                    : _loadSecondary(_mode, refresh: true),
                onColorBlind: (value) => setState(() => _colorBlind = value),
                onLanguage: _setLanguage,
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
                          api: _api,
                          data: switch (_mode) {
                            'ontology' => _ontologyPayload,
                            'portfolio' => _portfolioPayload,
                            'admin' => _adminPayload,
                            _ => _valuationPayload,
                          },
                          loading: _loadingSecondary,
                          error: _secondaryError,
                          palette: palette,
                          onRefresh: () => _loadSecondary(_mode, refresh: true),
                          initialValuationTicker: _valuationTicker,
                          onValuationTickerChanged: (value) {
                            _valuationTicker = value.toUpperCase();
                            _persistRouteState();
                          },
                        ),
                ),
              ),
            ],
          ),
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
        final wide = constraints.maxWidth >= 1280;
        final medium = constraints.maxWidth >= 980;
        final mobile = constraints.maxWidth < 760;
        final universe = GuruUniversePanel(
          gurus: filtered,
          selectedGuruId: text(selectedGuru['id']),
          search: _search,
          filter: _filter,
          palette: palette,
          onSearch: (value) => setState(() => _search = value),
          onFilter: (value) => setState(() => _filter = value),
          onSelect: _selectGuru,
        );
        final mobileUniverse = MobileGuruPicker(
          gurus: filtered,
          selectedGuruId: text(selectedGuru['id']),
          search: _search,
          filter: _filter,
          palette: palette,
          onSearch: (value) => setState(() => _search = value),
          onFilter: (value) => setState(() => _filter = value),
          onSelect: _selectGuru,
        );
        final workspace = GuruWorkspace(
          guru: selectedGuru,
          api: _api,
          palette: palette,
          initialModule: _guruModule,
          initialTicker: _guruTradeTicker,
          initialQuarterId: _guruQuarterId,
          onModuleChanged: (value) {
            _guruModule = value;
            _persistRouteState();
          },
          onTickerChanged: (value) {
            _guruTradeTicker = value.toUpperCase();
            _persistRouteState();
          },
          onQuarterChanged: (value) {
            _guruQuarterId = value;
            _persistRouteState();
          },
        );
        final rightRail = GuruRightRail(
          gurus: gurus,
          signals: signals.take(3).toList(),
          exposures: exposures.take(mobile ? 12 : 18).toList(),
          activeGuruId: text(selectedGuru['id']),
          palette: palette,
          onSelectGuru: _selectGuru,
          deckHeight: mobile ? 720 : 860,
          deckLimit: mobile ? 12 : 16,
        );
        final content = wide
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 270, child: universe),
                  const SizedBox(width: 10),
                  Expanded(child: workspace),
                  const SizedBox(width: 10),
                  SizedBox(width: 280, child: rightRail),
                ],
              )
            : medium
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 276, child: universe),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      children: [
                        workspace,
                        const SizedBox(height: 10),
                        rightRail,
                      ],
                    ),
                  ),
                ],
              )
            : mobile
            ? Column(
                children: [
                  mobileUniverse,
                  const SizedBox(height: 10),
                  MobileOverviewBar(stats: stats, palette: palette),
                  const SizedBox(height: 10),
                  workspace,
                  const SizedBox(height: 10),
                  rightRail,
                ],
              )
            : Column(
                children: [
                  universe,
                  const SizedBox(height: 10),
                  workspace,
                  const SizedBox(height: 10),
                  rightRail,
                ],
              );

        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            mobile ? 8 : 10,
            10,
            mobile ? 8 : 10,
            22,
          ),
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
    required this.language,
    required this.showAdmin,
    required this.onMode,
    required this.onRefresh,
    required this.onColorBlind,
    required this.onLanguage,
    required this.onLogout,
    required this.palette,
  });

  final String mode;
  final String userName;
  final String sourceLabel;
  final String generatedAt;
  final bool colorBlind;
  final AppLanguage language;
  final bool showAdmin;
  final ValueChanged<String> onMode;
  final VoidCallback onRefresh;
  final ValueChanged<bool> onColorBlind;
  final ValueChanged<AppLanguage> onLanguage;
  final VoidCallback onLogout;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final initials = userInitials(userName);
    final logo = Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: palette.accent.withValues(alpha: .24),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.accent.withValues(alpha: .32)),
      ),
      child: Text(
        'GI',
        style: TextStyle(
          color: palette.text,
          fontSize: 14,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
    final accountMenu = PopupMenuButton<String>(
      tooltip: 'Account',
      color: palette.card,
      onSelected: (value) {
        if (value == 'logout') onLogout();
      },
      itemBuilder: (context) => [
        PopupMenuItem(
          value: 'logout',
          child: Text('Logout', style: TextStyle(color: palette.text)),
        ),
      ],
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.accent.withValues(alpha: .28),
              shape: BoxShape.circle,
            ),
            child: Text(
              initials,
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Icon(Icons.expand_more_rounded, color: palette.muted, size: 20),
        ],
      ),
    );
    final refreshButton = _ToolbarIconButton(
      tooltip: 'Refresh',
      icon: Icons.refresh_rounded,
      palette: palette,
      onPressed: onRefresh,
    );
    final contrastButton = _ToolbarIconButton(
      tooltip: 'Color contrast',
      icon: Icons.contrast_rounded,
      active: colorBlind,
      palette: palette,
      onPressed: () => onColorBlind(!colorBlind),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 720;
        final titleBlock = Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Guru Intelligence',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.text,
                fontSize: compact ? 14 : 15,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              compact
                  ? '${toolbarDateLabel(generatedAt)} · ${sourceLabel.replaceAll(' database', '')}'
                  : 'Guru Stock Analysis',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.muted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        );

        return Container(
          height: compact ? 112 : 66,
          padding: EdgeInsets.symmetric(horizontal: compact ? 10 : 14),
          decoration: BoxDecoration(
            color: palette.background.withValues(alpha: .96),
            border: Border(bottom: BorderSide(color: palette.border)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: .18),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: compact
              ? Column(
                  children: [
                    SizedBox(
                      height: 58,
                      child: Row(
                        children: [
                          logo,
                          const SizedBox(width: 10),
                          Expanded(child: titleBlock),
                          const SizedBox(width: 8),
                          StatusDot(status: 'live', palette: palette),
                          const SizedBox(width: 8),
                          accountMenu,
                        ],
                      ),
                    ),
                    Container(height: 1, color: palette.border),
                    SizedBox(
                      height: 53,
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            ModeSegment(
                              mode: mode,
                              onMode: onMode,
                              palette: palette,
                              showAdmin: showAdmin,
                            ),
                            const SizedBox(width: 8),
                            LanguageSegment(
                              language: language,
                              onLanguage: onLanguage,
                              palette: palette,
                            ),
                            const SizedBox(width: 8),
                            refreshButton,
                            const SizedBox(width: 6),
                            contrastButton,
                          ],
                        ),
                      ),
                    ),
                  ],
                )
              : Row(
                  children: [
                    logo,
                    const SizedBox(width: 12),
                    SizedBox(width: 210, child: titleBlock),
                    Container(width: 1, height: 34, color: palette.border),
                    const SizedBox(width: 16),
                    Text(
                      toolbarDateLabel(generatedAt),
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(width: 18),
                    StatusDot(status: 'live', palette: palette),
                    const Spacer(),
                    ModeSegment(
                      mode: mode,
                      onMode: onMode,
                      palette: palette,
                      showAdmin: showAdmin,
                    ),
                    const SizedBox(width: 10),
                    LanguageSegment(
                      language: language,
                      onLanguage: onLanguage,
                      palette: palette,
                    ),
                    const SizedBox(width: 10),
                    refreshButton,
                    const SizedBox(width: 6),
                    contrastButton,
                    const SizedBox(width: 8),
                    accountMenu,
                  ],
                ),
        );
      },
    );
  }
}

class _ToolbarIconButton extends StatelessWidget {
  const _ToolbarIconButton({
    required this.tooltip,
    required this.icon,
    required this.palette,
    required this.onPressed,
    this.active = false,
  });

  final String tooltip;
  final IconData icon;
  final Palette palette;
  final VoidCallback onPressed;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onPressed,
        child: Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active
                ? palette.accent.withValues(alpha: .18)
                : palette.card.withValues(alpha: .7),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: active
                  ? palette.accent.withValues(alpha: .42)
                  : palette.border,
            ),
          ),
          child: Icon(
            icon,
            size: 19,
            color: active ? palette.accent : palette.muted,
          ),
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
    required this.showAdmin,
  });

  final String mode;
  final ValueChanged<String> onMode;
  final Palette palette;
  final bool showAdmin;

  @override
  Widget build(BuildContext context) {
    final modes = [
      ('guru', 'Guru'),
      ('ontology', 'Ontology'),
      ('valuation', 'Valuation'),
      ('portfolio', 'Portfolio'),
      if (showAdmin) ('admin', 'Admin'),
    ];
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(8),
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
                    horizontal: 18,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: mode == item.$1
                        ? palette.accent.withValues(alpha: .18)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(6),
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

class LanguageSegment extends StatelessWidget {
  const LanguageSegment({
    super.key,
    required this.language,
    required this.onLanguage,
    required this.palette,
  });

  final AppLanguage language;
  final ValueChanged<AppLanguage> onLanguage;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final options = [
      (AppLanguage.zh, language == AppLanguage.en ? 'Chinese' : '中文'),
      (AppLanguage.en, language == AppLanguage.en ? 'English' : 'EN'),
    ];
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final option in options)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: InkWell(
                borderRadius: BorderRadius.circular(7),
                onTap: () => onLanguage(option.$1),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: language == option.$1
                        ? palette.accent.withValues(alpha: .18)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    option.$2,
                    style: TextStyle(
                      color: language == option.$1
                          ? palette.accent
                          : palette.muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
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
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _UniverseTopTabs(palette: palette),
          const SizedBox(height: 10),
          SizedBox(
            height: 42,
            child: TextField(
              onChanged: onSearch,
              style: TextStyle(color: palette.text, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Search guru / firm / ticker',
                hintStyle: TextStyle(color: palette.faint),
                prefixIcon: Icon(Icons.search_rounded, color: palette.muted),
                suffixIcon: Icon(
                  Icons.keyboard_command_key_rounded,
                  color: palette.faint,
                  size: 16,
                ),
                filled: true,
                fillColor: palette.background.withValues(alpha: .52),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: palette.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: palette.accent),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final item in filters)
                FilterChip(
                  selected: filter == item.$1,
                  onSelected: (_) => onFilter(item.$1),
                  label: Text(item.$2),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _SidebarSelectChip(
                  label: 'All Strategies',
                  palette: palette,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SidebarSelectChip(
                  label: 'All Status',
                  palette: palette,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
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

class MobileGuruPicker extends StatelessWidget {
  const MobileGuruPicker({
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
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.account_tree_rounded,
            kicker: 'GURU UNIVERSE',
            title: context.tr('选择大佬', 'Select Guru'),
            trailing: Text(
              '${gurus.length} visible',
              style: TextStyle(
                color: palette.faint,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
            palette: palette,
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 40,
            child: TextField(
              onChanged: onSearch,
              style: TextStyle(color: palette.text, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Search guru / firm / ticker',
                hintStyle: TextStyle(color: palette.faint),
                prefixIcon: Icon(
                  Icons.search_rounded,
                  color: palette.muted,
                  size: 19,
                ),
                filled: true,
                fillColor: palette.background.withValues(alpha: .48),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: palette.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: palette.accent),
                ),
              ),
            ),
          ),
          const SizedBox(height: 9),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final item in filters) ...[
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      selected: filter == item.$1,
                      onSelected: (_) => onFilter(item.$1),
                      label: Text(item.$2),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 104,
            child: gurus.isEmpty
                ? EmptyState(
                    text: 'No gurus match this filter.',
                    palette: palette,
                  )
                : ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: gurus.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final guru = gurus[index];
                      return _MobileGuruCard(
                        guru: guru,
                        active: text(guru['id']) == selectedGuruId,
                        palette: palette,
                        onTap: () => onSelect(text(guru['id'])),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _MobileGuruCard extends StatelessWidget {
  const _MobileGuruCard({
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
        : type == 'insider'
        ? '${formatNumber(number(summary['trackedTickers']))} stocks'
        : '${formatNumber(number(summary['recentTransactions']))} trades';
    final sub = type == 'manager13f'
        ? '${formatNumber(number(summary['totalPositions']))} holdings'
        : type == 'insider'
        ? 'sold ${formatMoney(number(summary['cumulativeSoldValue']))}'
        : disclosureLabel(type);
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 174,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: active ? palette.accent.withValues(alpha: .14) : palette.card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active
                ? palette.accent.withValues(alpha: .62)
                : palette.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                GuruAvatar(guru: guru, palette: palette, size: 36),
                const SizedBox(width: 9),
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
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        metric,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: active ? palette.accent : palette.muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Spacer(),
            Text(
              text(guru['entityName'], disclosureLabel(type)),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.faint, fontSize: 10),
            ),
            const SizedBox(height: 5),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${disclosureLabel(type)} · $sub',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                StatusDot(status: text(guru['status']), palette: palette),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class MobileOverviewBar extends StatelessWidget {
  const MobileOverviewBar({
    super.key,
    required this.stats,
    required this.palette,
  });

  final ExecutiveStats stats;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final cards = [
      StatCardData('Coverage', '${stats.count}', 'gurus', Icons.radar_rounded),
      StatCardData(
        '13F AUM',
        formatMoney(stats.aum),
        'long equity',
        Icons.account_balance_wallet_rounded,
      ),
      StatCardData(
        'Spread',
        signedNumber(stats.netSignals),
        'buy minus sell',
        Icons.bolt_rounded,
      ),
      StatCardData(
        'Quarter',
        stats.latestQuarter,
        'latest filing',
        Icons.calendar_month_rounded,
      ),
    ];
    return Panel(
      palette: palette,
      padding: const EdgeInsets.all(12),
      child: SizedBox(
        height: 70,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: cards.length,
          separatorBuilder: (context, index) => const SizedBox(width: 8),
          itemBuilder: (context, index) {
            final card = cards[index];
            return Container(
              width: 142,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
              decoration: BoxDecoration(
                color: palette.card,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: palette.border),
              ),
              child: Row(
                children: [
                  Icon(card.icon, color: palette.accent, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          card.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.muted,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          card.value,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.text,
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          card.sub,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: palette.faint, fontSize: 9),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _UniverseTopTabs extends StatelessWidget {
  const _UniverseTopTabs({required this.palette});

  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: .72),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: palette.accent.withValues(alpha: .13),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: palette.accent.withValues(alpha: .18),
                ),
              ),
              child: Text(
                'Gurus',
                style: TextStyle(
                  color: palette.accent,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: Text(
                'Firms',
                style: TextStyle(
                  color: palette.muted,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SidebarSelectChip extends StatelessWidget {
  const _SidebarSelectChip({required this.label, required this.palette});

  final String label;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 34,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: palette.background.withValues(alpha: .34),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.muted,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Icon(
            Icons.keyboard_arrow_down_rounded,
            color: palette.muted,
            size: 16,
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
        : type == 'insider'
        ? '${formatNumber(number(summary['trackedTickers']))} stocks'
        : '${formatNumber(number(summary['recentTransactions']))} trades';
    final sub = type == 'manager13f'
        ? '${formatNumber(number(summary['totalPositions']))} holdings'
        : type == 'insider'
        ? 'sold ${formatMoney(number(summary['cumulativeSoldValue']))}'
        : text(guru['sourceLabel'], text(guru['disclosureKind']));
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          decoration: BoxDecoration(
            color: active
                ? palette.accent.withValues(alpha: .14)
                : palette.card,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: active
                  ? palette.accent.withValues(alpha: .65)
                  : palette.border,
            ),
          ),
          child: Row(
            children: [
              GuruAvatar(guru: guru, palette: palette, size: 34),
              const SizedBox(width: 10),
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
                        fontSize: 13,
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
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.text,
                      fontWeight: FontWeight.w900,
                      fontSize: 12,
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

class GuruAvatar extends StatelessWidget {
  const GuruAvatar({
    super.key,
    required this.guru,
    required this.palette,
    this.size = 40,
  });

  final Map<String, dynamic> guru;
  final Palette palette;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = publicAssetUrl(guru['avatarUrl']);
    final name = text(guru['name'], '?');
    final fallback = _AvatarInitial(name: name, palette: palette, size: size);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFFDADFE6),
        border: Border.all(color: palette.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: .18),
            blurRadius: 10,
            spreadRadius: 0,
          ),
        ],
      ),
      child: ClipOval(
        child: url.isEmpty
            ? fallback
            : Image.network(
                url,
                fit: BoxFit.cover,
                filterQuality: FilterQuality.medium,
                errorBuilder: (context, error, stackTrace) => fallback,
              ),
      ),
    );
  }
}

class _AvatarInitial extends StatelessWidget {
  const _AvatarInitial({
    required this.name,
    required this.palette,
    required this.size,
  });

  final String name;
  final Palette palette;
  final double size;

  @override
  Widget build(BuildContext context) {
    final letter = text(name, '?').characters.first.toUpperCase();
    return Container(
      color: palette.accent.withValues(alpha: .17),
      alignment: Alignment.center,
      child: Text(
        letter,
        style: TextStyle(
          color: palette.accent,
          fontSize: math.max(13, size * .34),
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class GuruWorkspace extends StatefulWidget {
  const GuruWorkspace({
    super.key,
    required this.guru,
    required this.api,
    required this.palette,
    required this.initialModule,
    required this.initialTicker,
    required this.initialQuarterId,
    required this.onModuleChanged,
    required this.onTickerChanged,
    required this.onQuarterChanged,
  });

  final Map<String, dynamic> guru;
  final ApiClient api;
  final Palette palette;
  final int initialModule;
  final String initialTicker;
  final String initialQuarterId;
  final ValueChanged<int> onModuleChanged;
  final ValueChanged<String> onTickerChanged;
  final ValueChanged<String> onQuarterChanged;

  @override
  State<GuruWorkspace> createState() => _GuruWorkspaceState();
}

class _GuruWorkspaceState extends State<GuruWorkspace> {
  int _module = 0;
  Map<String, dynamic>? _backtestPayload;
  bool _backtestLoading = false;
  String? _backtestError;
  Map<String, dynamic>? _contextPayload;
  bool _contextLoading = false;
  String? _contextError;
  String _selectedTicker = '';
  String _selectedQuarterId = '';
  Timer? _backtestWarmupTimer;
  int _backtestWarmupPolls = 0;
  bool _backtestFullAttribution = false;

  @override
  void initState() {
    super.initState();
    _module = widget.initialModule.clamp(0, 2).toInt();
    _selectedTicker = _initialTicker();
    _selectedQuarterId = widget.initialQuarterId;
    scheduleMicrotask(() {
      _loadBacktest();
      if (_selectedTicker.isNotEmpty) _loadContext(_selectedTicker);
    });
  }

  @override
  void didUpdateWidget(covariant GuruWorkspace oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (text(oldWidget.guru['id']) == text(widget.guru['id'])) return;
    final ticker = _initialTicker();
    _backtestWarmupTimer?.cancel();
    _backtestWarmupPolls = 0;
    setState(() {
      _backtestPayload = null;
      _backtestError = null;
      _backtestLoading = false;
      _backtestFullAttribution = false;
      _contextPayload = null;
      _contextError = null;
      _contextLoading = false;
      _selectedTicker = ticker;
      _selectedQuarterId = widget.initialQuarterId;
    });
    widget.onTickerChanged(ticker);
    _loadBacktest();
    if (ticker.isNotEmpty) _loadContext(ticker);
  }

  @override
  void dispose() {
    _backtestWarmupTimer?.cancel();
    super.dispose();
  }

  String _defaultTicker() {
    final rows = guruTradeRows(widget.guru);
    final primary = rows.firstWhere(
      (row) => ['new', 'sold_out'].contains(text(row['action'])),
      orElse: () => rows.isNotEmpty ? rows.first : <String, dynamic>{},
    );
    return text(primary['ticker']);
  }

  String _initialTicker() {
    final preferred = widget.initialTicker.trim().toUpperCase();
    if (preferred.isNotEmpty) {
      final rows = guruTradeRows(widget.guru);
      final match = rows.any(
        (row) => text(row['ticker']).toUpperCase() == preferred,
      );
      if (match) return preferred;
    }
    return _defaultTicker();
  }

  Map<String, dynamic> get _selectedTrade {
    final rows = guruTradeRows(widget.guru);
    return rows.firstWhere(
      (row) => text(row['ticker']) == _selectedTicker,
      orElse: () => rows.isNotEmpty ? rows.first : <String, dynamic>{},
    );
  }

  bool get _usesWorkspaceModules {
    final type = text(widget.guru['type']);
    final sim = asMap(widget.guru['simulationTag']);
    return type == 'manager13f' ||
        (type == 'congress' && text(sim['tone']) != 'muted');
  }

  bool _isBacktestWarming(Map<String, dynamic>? payload) {
    if (payload == null) return false;
    return truthy(payload['historyWarming']) ||
        text(asMap(payload['cache'])['status']) == 'sqlite-fallback';
  }

  void _scheduleBacktestWarmupPoll(Map<String, dynamic> payload) {
    _backtestWarmupTimer?.cancel();
    if (!_isBacktestWarming(payload) || _backtestWarmupPolls >= 8) return;
    _backtestWarmupPolls += 1;
    _backtestWarmupTimer = Timer(const Duration(seconds: 6), () {
      if (mounted) {
        _loadBacktest(quiet: true, fullAttribution: _backtestFullAttribution);
      }
    });
  }

  Future<void> _loadBacktest({
    bool quiet = false,
    bool fullAttribution = false,
  }) async {
    final id = text(widget.guru['id']);
    final sim = asMap(widget.guru['simulationTag']);
    if (id.isEmpty || text(sim['tone']) == 'muted' || !_usesWorkspaceModules) {
      return;
    }
    if (!quiet || _backtestPayload == null) {
      setState(() {
        _backtestLoading = true;
        _backtestError = null;
      });
    }
    try {
      final detail = fullAttribution ? '?detail=full' : '';
      final payload = await widget.api.getJson(
        '/api/gurus/$id/backtest$detail',
      );
      if (!mounted || id != text(widget.guru['id'])) return;
      setState(() {
        _backtestPayload = payload;
        _backtestFullAttribution =
            fullAttribution ||
            text(asMap(payload['detail'])['attribution']) == 'full';
        if (!_isBacktestWarming(payload)) _backtestWarmupPolls = 0;
      });
      _scheduleBacktestWarmupPoll(payload);
    } catch (error) {
      if (!mounted || id != text(widget.guru['id'])) return;
      if (!quiet || _backtestPayload == null) {
        setState(() => _backtestError = error.toString());
      }
    } finally {
      if (mounted &&
          id == text(widget.guru['id']) &&
          (!quiet || _backtestPayload == null)) {
        setState(() => _backtestLoading = false);
      }
    }
  }

  void _selectModule(int value) {
    setState(() => _module = value);
    widget.onModuleChanged(value);
    if (_usesWorkspaceModules && value == 2 && !_backtestFullAttribution) {
      _loadBacktest(fullAttribution: true);
    }
  }

  Future<void> _loadContext(String ticker) async {
    final id = text(widget.guru['id']);
    if (id.isEmpty ||
        ticker.isEmpty ||
        text(widget.guru['type']) == 'profile') {
      return;
    }
    setState(() {
      _selectedTicker = ticker;
      _contextPayload = null;
      _contextError = null;
      _contextLoading = true;
    });
    widget.onTickerChanged(ticker);
    try {
      final encodedTicker = Uri.encodeQueryComponent(ticker);
      final payload = await widget.api.getJson(
        '/api/gurus/$id/context?ticker=$encodedTicker',
      );
      if (!mounted ||
          id != text(widget.guru['id']) ||
          ticker != _selectedTicker) {
        return;
      }
      setState(() => _contextPayload = payload);
    } catch (error) {
      if (!mounted ||
          id != text(widget.guru['id']) ||
          ticker != _selectedTicker) {
        return;
      }
      setState(() => _contextError = error.toString());
    } finally {
      if (mounted &&
          id == text(widget.guru['id']) &&
          ticker == _selectedTicker) {
        setState(() => _contextLoading = false);
      }
    }
  }

  void _selectTrade(Map<String, dynamic> row) {
    final ticker = text(row['ticker']);
    if (ticker.isEmpty || ticker == _selectedTicker) return;
    _loadContext(ticker);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.guru.isEmpty) {
      return Panel(
        palette: widget.palette,
        child: EmptyState(
          text: 'Select a guru to inspect.',
          palette: widget.palette,
        ),
      );
    }
    final type = text(widget.guru['type']);
    final usesWorkspaceModules = _usesWorkspaceModules;
    return Column(
      children: [
        GuruWorkspaceHeader(guru: widget.guru, palette: widget.palette),
        if (type == 'profile') ...[
          const SizedBox(height: 14),
          GuruProfileModule(guru: widget.guru, palette: widget.palette),
        ] else if (usesWorkspaceModules) ...[
          const SizedBox(height: 14),
          GuruModuleTabs(
            selected: _module,
            onChanged: _selectModule,
            palette: widget.palette,
          ),
          const SizedBox(height: 14),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: KeyedSubtree(
              key: ValueKey(_module),
              child: switch (_module) {
                0 => GuruSimulationModule(
                  payload: _backtestPayload,
                  loading: _backtestLoading,
                  error: _backtestError,
                  guru: widget.guru,
                  palette: widget.palette,
                  onRetry: () => _loadBacktest(),
                ),
                1 => GuruTradeModule(
                  guru: widget.guru,
                  selectedTicker: _selectedTicker,
                  selectedTrade: _selectedTrade,
                  contextPayload: _contextPayload,
                  loading: _contextLoading,
                  error: _contextError,
                  palette: widget.palette,
                  onSelect: _selectTrade,
                  onRetry: () => _loadContext(_selectedTicker),
                ),
                _ => GuruQuarterContributionModule(
                  payload: _backtestPayload,
                  loading: _backtestLoading,
                  error: _backtestError,
                  selectedQuarterId: _selectedQuarterId,
                  onSelectQuarter: (value) => setState(() {
                    _selectedQuarterId = value;
                    widget.onQuarterChanged(value);
                  }),
                  palette: widget.palette,
                  onRetry: () => _loadBacktest(fullAttribution: true),
                ),
              },
            ),
          ),
        ] else ...[
          const SizedBox(height: 14),
          GuruTradeModule(
            guru: widget.guru,
            selectedTicker: _selectedTicker,
            selectedTrade: _selectedTrade,
            contextPayload: _contextPayload,
            loading: _contextLoading,
            error: _contextError,
            palette: widget.palette,
            onSelect: _selectTrade,
            onRetry: () => _loadContext(_selectedTicker),
          ),
        ],
      ],
    );
  }
}

class GuruWorkspaceHeader extends StatelessWidget {
  const GuruWorkspaceHeader({
    super.key,
    required this.guru,
    required this.palette,
  });

  final Map<String, dynamic> guru;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final summary = asMap(guru['summary']);
    final type = text(guru['type']);
    final reportDate = text(summary['reportDate']);
    final latestQuarter = reportQuarterLabel(reportDate);
    final filing = formatDate(text(summary['filingDate']));
    final strategy = text(guru['thesisTag'], 'Concentrated');
    return Panel(
      palette: palette,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 760;
          final veryCompact = constraints.maxWidth < 420;
          final identity = Row(
            children: [
              Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.bottomCenter,
                children: [
                  GuruAvatar(
                    guru: guru,
                    palette: palette,
                    size: veryCompact ? 58 : 72,
                  ),
                  Positioned(
                    bottom: -8,
                    child: BadgeLabel(
                      text: disclosureLabel(type),
                      color: palette.accent,
                    ),
                  ),
                ],
              ),
              SizedBox(width: veryCompact ? 12 : 18),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      text(guru['name']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontSize: veryCompact ? 18 : 21,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      text(guru['entityName']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 7,
                      runSpacing: 7,
                      children: [
                        InfoChip(strategy, palette: palette),
                        InfoChip(
                          text(asMap(guru['simulationTag'])['label']),
                          palette: palette,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          );
          final metrics = type == 'manager13f'
              ? [
                  _GuruHeaderMetric(
                    label: 'AUM',
                    value: formatMoney(number(summary['totalValue'])),
                    sub: '13F market value',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Holdings',
                    value: formatNumber(number(summary['totalPositions'])),
                    sub: 'latest disclosed',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Latest Quarter',
                    value: latestQuarter,
                    sub: filing == '-' ? 'waiting filing' : 'filed $filing',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Filing Lag',
                    value: filingLagVerbose(summary),
                    sub: 'vs quarter end',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Strategy',
                    value: compactStrategy(strategy),
                    sub: text(guru['disclosureKind'], 'High Conviction'),
                    palette: palette,
                  ),
                ]
              : type == 'insider'
              ? [
                  _GuruHeaderMetric(
                    label: 'Stocks',
                    value: formatNumber(number(summary['trackedTickers'])),
                    sub: 'Form 4 tickers tracked',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Held shares',
                    value: formatNumber(
                      number(summary['totalLatestSharesOwned']),
                    ),
                    sub: 'latest post-transaction',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Cum sold',
                    value: formatMoney(number(summary['cumulativeSoldValue'])),
                    sub:
                        '${formatNumber(number(summary['cumulativeSoldShares']))} shares',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Latest',
                    value: formatDate(text(summary['reportDate'])),
                    sub: filing == '-' ? 'Form 4 trail' : 'filed $filing',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Focus',
                    value: text(
                      summary['latestTicker'],
                      text(guru['focusTicker'], '-'),
                    ),
                    sub: compactName(
                      text(summary['latestIssuer'], text(guru['focusIssuer'])),
                    ),
                    palette: palette,
                  ),
                ]
              : [
                  _GuruHeaderMetric(
                    label: 'Source',
                    value: disclosureLabel(type),
                    sub: text(guru['sourceLabel'], text(guru['profileUrl'])),
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Activity',
                    value: formatNumber(number(summary['recentTransactions'])),
                    sub:
                        '${formatNumber(number(summary['buys']))} buy / ${formatNumber(number(summary['sells']))} sell',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Latest',
                    value: formatDate(text(summary['reportDate'])),
                    sub: filing == '-' ? 'disclosure trail' : 'filed $filing',
                    palette: palette,
                  ),
                  _GuruHeaderMetric(
                    label: 'Focus',
                    value: text(
                      summary['latestTicker'],
                      text(guru['focusTicker'], '-'),
                    ),
                    sub: compactName(
                      text(summary['latestIssuer'], text(guru['focusIssuer'])),
                    ),
                    palette: palette,
                  ),
                ];
          final metricsRow = Expanded(
            child: IntrinsicHeight(
              child: Row(
                children: [
                  for (var i = 0; i < metrics.length; i += 1) ...[
                    Expanded(child: metrics[i]),
                    if (i != metrics.length - 1)
                      VerticalDivider(color: palette.border, width: 24),
                  ],
                ],
              ),
            ),
          );

          if (compact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                identity,
                const SizedBox(height: 18),
                GridWrap(minTileWidth: 130, spacing: 10, children: metrics),
              ],
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              SizedBox(
                width: math.min(360, constraints.maxWidth * .36),
                child: identity,
              ),
              const SizedBox(width: 18),
              metricsRow,
              const SizedBox(width: 10),
              StatusDot(status: text(guru['status']), palette: palette),
            ],
          );
        },
      ),
    );
  }
}

class _GuruHeaderMetric extends StatelessWidget {
  const _GuruHeaderMetric({
    required this.label,
    required this.value,
    required this.sub,
    required this.palette,
  });

  final String label;
  final String value;
  final String sub;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.muted,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.text,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.faint,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class GuruModuleTabs extends StatelessWidget {
  const GuruModuleTabs({
    super.key,
    required this.selected,
    required this.onChanged,
    required this.palette,
  });

  final int selected;
  final ValueChanged<int> onChanged;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final items = [
      (
        Icons.stacked_line_chart_rounded,
        context.tr('模拟', 'Simulation'),
        'Portfolio vs SPY',
      ),
      (
        Icons.swap_vert_rounded,
        context.tr('新买入/卖出', 'New Buys & Sells'),
        'New Buys & Sells',
      ),
      (
        Icons.calendar_month_rounded,
        context.tr('季度贡献', 'Quarterly Contribution'),
        'Quarterly Contribution',
      ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 560;
        return Container(
          width: double.infinity,
          height: compact ? 58 : 72,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: palette.panel,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: palette.border),
          ),
          child: Row(
            children: [
              for (var i = 0; i < items.length; i += 1)
                Expanded(
                  child: _ModuleTabButton(
                    icon: items[i].$1,
                    label: items[i].$2,
                    sublabel: compact ? '' : items[i].$3,
                    selected: selected == i,
                    palette: palette,
                    compact: compact,
                    onTap: () => onChanged(i),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _ModuleTabButton extends StatelessWidget {
  const _ModuleTabButton({
    required this.icon,
    required this.label,
    required this.sublabel,
    required this.selected,
    required this.palette,
    required this.compact,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String sublabel;
  final bool selected;
  final Palette palette;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        height: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.transparent,
          border: Border(
            bottom: BorderSide(
              color: selected ? palette.accent : Colors.transparent,
              width: 3,
            ),
          ),
        ),
        child: Row(
          mainAxisAlignment: compact
              ? MainAxisAlignment.center
              : MainAxisAlignment.start,
          children: [
            Icon(
              icon,
              size: 18,
              color: selected ? palette.accent : palette.muted,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: compact
                  ? Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: selected ? palette.accent : palette.muted,
                        fontWeight: FontWeight.w900,
                        fontSize: 13,
                      ),
                    )
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: selected ? palette.accent : palette.muted,
                            fontWeight: FontWeight.w900,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          sublabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.faint,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class GuruSimulationModule extends StatefulWidget {
  const GuruSimulationModule({
    super.key,
    required this.payload,
    required this.loading,
    required this.error,
    required this.guru,
    required this.palette,
    required this.onRetry,
  });

  final Map<String, dynamic>? payload;
  final bool loading;
  final String? error;
  final Map<String, dynamic> guru;
  final Palette palette;
  final VoidCallback onRetry;

  @override
  State<GuruSimulationModule> createState() => _GuruSimulationModuleState();
}

class GuruProfileModule extends StatelessWidget {
  const GuruProfileModule({
    super.key,
    required this.guru,
    required this.palette,
  });

  final Map<String, dynamic> guru;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final summary = asMap(guru['summary']);
    final rawNotes = guru['notes'];
    final noteTexts = rawNotes is List
        ? rawNotes.map(text).where((item) => item.isNotEmpty).toList()
        : text(rawNotes).isNotEmpty
        ? [text(guru['notes'])]
        : <String>[];
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.person_search_rounded,
            kicker: 'RESEARCH PROFILE',
            title: context.tr('资料卡', 'Profile Card'),
            palette: palette,
          ),
          const SizedBox(height: 12),
          Text(
            text(
              summary['message'],
              context.tr(
                '这个 profile 没有干净的独立 13F 或 Form 4 交易流，作为研究资料入口展示。',
                'This profile does not have a clean standalone 13F or Form 4 trading feed, so it is shown as a research profile.',
              ),
            ),
            style: TextStyle(color: palette.muted, height: 1.35),
          ),
          if (noteTexts.isNotEmpty) ...[
            const SizedBox(height: 14),
            for (final note in noteTexts)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.notes_rounded, color: palette.accent, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        note,
                        style: TextStyle(color: palette.muted, height: 1.35),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _GuruSimulationModuleState extends State<GuruSimulationModule> {
  RangeValues? _range;
  String _rangeSignature = '';

  void _syncRange(List<Map<String, dynamic>> equity) {
    final signature = equity.isEmpty
        ? 'empty'
        : '${equity.length}:${text(equity.first['date'])}:${text(equity.last['date'])}';
    if (_rangeSignature == signature) return;
    _rangeSignature = signature;
    final maxIndex = math.max(1, equity.length - 1).toDouble();
    _range = RangeValues(0, maxIndex);
  }

  void _selectTrailingWindow(List<Map<String, dynamic>> equity, int years) {
    if (equity.length < 3) return;
    final lastDate = DateTime.tryParse(text(equity.last['date']));
    if (lastDate == null) return;
    final target = DateTime(
      lastDate.year - years,
      lastDate.month,
      lastDate.day,
    );
    var start = 0;
    for (var i = 0; i < equity.length; i += 1) {
      final date = DateTime.tryParse(text(equity[i]['date']));
      if (date != null && !date.isBefore(target)) {
        start = i;
        break;
      }
    }
    setState(() => _range = RangeValues(start.toDouble(), equity.length - 1));
  }

  void _selectAll(List<Map<String, dynamic>> equity) {
    setState(
      () => _range = RangeValues(0, math.max(1, equity.length - 1).toDouble()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sim = asMap(widget.guru['simulationTag']);
    if (text(sim['tone']) == 'muted') {
      return Panel(
        palette: widget.palette,
        child: Text(
          text(
            sim['description'],
            'This profile is not suitable for proportional 13F copy trading.',
          ),
          style: TextStyle(color: widget.palette.muted),
        ),
      );
    }
    final equity = asList(widget.payload?['equity']);
    _syncRange(equity);
    final currentRange =
        _range ?? RangeValues(0, math.max(1, equity.length - 1).toDouble());
    final startIndex =
        currentRange.start.round().clamp(0, math.max(0, equity.length - 1))
            as int;
    final endIndex =
        currentRange.end.round().clamp(
              startIndex + 1,
              math.max(1, equity.length - 1),
            )
            as int;
    final visibleEquity = equity.length < 2
        ? equity
        : equity.sublist(startIndex, math.min(equity.length, endIndex + 1));
    final chartEquity = rebaseEquity(visibleEquity);
    final summary = simulationMetrics(chartEquity);
    final warming = truthy(widget.payload?['historyWarming']);
    final sampling = asMap(widget.payload?['equitySampling']);
    final samplingLabel = truthy(sampling['sampled'])
        ? context.tr(
            '图表抽样 ${formatNumber(number(sampling['returnedPoints']))}/${formatNumber(number(sampling['sourcePoints']))} 个交易日',
            'Chart sampled ${formatNumber(number(sampling['returnedPoints']))}/${formatNumber(number(sampling['sourcePoints']))} trading days',
          )
        : '';
    final allStart = equity.isEmpty
        ? ''
        : formatDate(text(equity.first['date']));
    final allEnd = equity.isEmpty ? '' : formatDate(text(equity.last['date']));
    final selectedStart = visibleEquity.isEmpty
        ? ''
        : formatDate(text(visibleEquity.first['date']));
    final selectedEnd = visibleEquity.isEmpty
        ? ''
        : formatDate(text(visibleEquity.last['date']));
    final isAll = startIndex <= 0 && endIndex >= math.max(0, equity.length - 1);
    return Panel(
      palette: widget.palette,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.stacked_line_chart_rounded,
            kicker: 'COPY SIMULATION',
            title: context.tr(
              '模拟：Portfolio vs SPY',
              'Simulation: Portfolio vs SPY',
            ),
            palette: widget.palette,
            trailing: _RetryIconButton(
              onPressed: widget.onRetry,
              palette: widget.palette,
            ),
          ),
          const SizedBox(height: 14),
          if (widget.loading && widget.payload == null)
            const SizedBox(
              height: 300,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (widget.error != null && widget.payload == null)
            EmptyState(text: widget.error!, palette: widget.palette)
          else if (text(widget.payload?['status']) != 'ready')
            EmptyState(
              text: text(
                asMap(widget.payload?['method'])['reason'],
                'Backtest is not ready.',
              ),
              palette: widget.palette,
            )
          else ...[
            LayoutBuilder(
              builder: (context, constraints) {
                final rangeControls = Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _RangePresetButton(
                      label: '1Y',
                      selected:
                          !isAll && trailingWindowSelected(equity, _range, 1),
                      palette: widget.palette,
                      onTap: () => _selectTrailingWindow(equity, 1),
                    ),
                    _RangePresetButton(
                      label: '3Y',
                      selected:
                          !isAll && trailingWindowSelected(equity, _range, 3),
                      palette: widget.palette,
                      onTap: () => _selectTrailingWindow(equity, 3),
                    ),
                    _RangePresetButton(
                      label: '5Y',
                      selected:
                          !isAll && trailingWindowSelected(equity, _range, 5),
                      palette: widget.palette,
                      onTap: () => _selectTrailingWindow(equity, 5),
                    ),
                    _RangePresetButton(
                      label: '10Y',
                      selected:
                          !isAll && trailingWindowSelected(equity, _range, 10),
                      palette: widget.palette,
                      onTap: () => _selectTrailingWindow(equity, 10),
                    ),
                    _RangePresetButton(
                      label: 'All',
                      selected: isAll,
                      palette: widget.palette,
                      onTap: () => _selectAll(equity),
                    ),
                  ],
                );
                final legend = Wrap(
                  spacing: 14,
                  runSpacing: 8,
                  children: [
                    _PerformanceLegendItem(
                      label:
                          '${compactName(text(widget.guru['name']))} Portfolio',
                      value: formatReturn(summary.totalReturn),
                      color: widget.palette.positive,
                      palette: widget.palette,
                    ),
                    _PerformanceLegendItem(
                      label: 'SPY',
                      value: formatReturn(summary.benchmarkReturn),
                      color: widget.palette.secondary,
                      palette: widget.palette,
                    ),
                    _PerformanceLegendItem(
                      label: 'Excess',
                      value: formatReturn(summary.excessReturn),
                      color: widget.palette.accent,
                      palette: widget.palette,
                    ),
                    _PerformanceLegendItem(
                      label: 'MDD',
                      value: formatReturn(summary.maxDrawdown),
                      color: widget.palette.negative,
                      palette: widget.palette,
                    ),
                  ],
                );
                if (constraints.maxWidth < 820) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      rangeControls,
                      const SizedBox(height: 12),
                      legend,
                    ],
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    rangeControls,
                    const Spacer(),
                    Flexible(child: legend),
                  ],
                );
              },
            ),
            const SizedBox(height: 12),
            if (warming) ...[
              Text(
                context.tr(
                  '正在后台扩展全历史；先显示已缓存区间。',
                  'Full history is still being expanded in the background; showing the cached window first.',
                ),
                style: TextStyle(
                  color: widget.palette.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
            ],
            if (samplingLabel.isNotEmpty) ...[
              Text(
                samplingLabel,
                style: TextStyle(
                  color: widget.palette.faint,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
            ],
            SimulationRangeBar(
              palette: widget.palette,
              range: currentRange,
              maxIndex: math.max(1, equity.length - 1).toDouble(),
              selectedStart: selectedStart,
              selectedEnd: selectedEnd,
              fullStart: allStart,
              fullEnd: allEnd,
              onChanged: equity.length < 3
                  ? null
                  : (value) {
                      final snapped = RangeValues(
                        value.start.roundToDouble(),
                        value.end.roundToDouble(),
                      );
                      if (snapped.end - snapped.start < 2) return;
                      setState(() => _range = snapped);
                    },
              onReset: () {
                setState(
                  () => _range = RangeValues(
                    0,
                    math.max(1, equity.length - 1).toDouble(),
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 360,
              child: EquityChart(equity: chartEquity, palette: widget.palette),
            ),
            LatestHoldingsList(guru: widget.guru, palette: widget.palette),
          ],
        ],
      ),
    );
  }
}

class _RangePresetButton extends StatelessWidget {
  const _RangePresetButton({
    required this.label,
    required this.selected,
    required this.palette,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(7),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        width: 46,
        height: 34,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected
              ? palette.accent.withValues(alpha: .18)
              : palette.card,
          borderRadius: BorderRadius.circular(7),
          border: Border.all(color: selected ? palette.accent : palette.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? palette.accent : palette.muted,
            fontWeight: FontWeight.w900,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

class _PerformanceLegendItem extends StatelessWidget {
  const _PerformanceLegendItem({
    required this.label,
    required this.value,
    required this.color,
    required this.palette,
  });

  final String label;
  final String value;
  final Color color;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 7),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                color: palette.muted,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class LatestHoldingsList extends StatefulWidget {
  const LatestHoldingsList({
    super.key,
    required this.guru,
    required this.palette,
  });

  final Map<String, dynamic> guru;
  final Palette palette;

  @override
  State<LatestHoldingsList> createState() => _LatestHoldingsListState();
}

class _LatestHoldingsListState extends State<LatestHoldingsList> {
  bool _expanded = false;

  @override
  void didUpdateWidget(covariant LatestHoldingsList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (text(oldWidget.guru['id']) != text(widget.guru['id'])) {
      _expanded = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = [...asList(widget.guru['holdings'])]
      ..sort(
        (left, right) =>
            number(right['value']).compareTo(number(left['value'])),
      );
    if (rows.isEmpty) return const SizedBox.shrink();

    final summary = asMap(widget.guru['summary']);
    final disclosedTotal = number(summary['totalValue']);
    final total = disclosedTotal > 0
        ? disclosedTotal
        : rows.fold<double>(0, (sum, row) => sum + number(row['value']));
    final reportDate = formatDate(text(summary['reportDate']));
    final visibleCount = _expanded ? rows.length : math.min(18, rows.length);
    final visibleRows = rows.take(visibleCount).toList();
    final headerActions = <Widget>[
      if (reportDate != '-')
        InfoChip(
          context.tr('报告期 $reportDate', 'Report $reportDate'),
          palette: widget.palette,
        ),
      InfoChip('$visibleCount / ${rows.length}', palette: widget.palette),
      if (rows.length > 18)
        TextButton.icon(
          onPressed: () => setState(() => _expanded = !_expanded),
          icon: Icon(
            _expanded
                ? Icons.keyboard_arrow_up_rounded
                : Icons.keyboard_arrow_down_rounded,
            size: 18,
          ),
          label: Text(
            _expanded ? context.tr('收起', 'Collapse') : context.tr('全部', 'All'),
          ),
          style: TextButton.styleFrom(
            foregroundColor: widget.palette.accent,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            minimumSize: const Size(58, 34),
          ),
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        Divider(height: 1, color: widget.palette.border),
        const SizedBox(height: 16),
        LayoutBuilder(
          builder: (context, constraints) {
            final title = Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.account_balance_wallet_rounded,
                  color: widget.palette.accent,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Text(
                  context.tr('最新持仓', 'Latest holdings'),
                  style: TextStyle(
                    color: widget.palette.text,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            );
            final actions = Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: headerActions,
            );
            if (constraints.maxWidth < 640) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [title, const SizedBox(height: 10), actions],
              );
            }
            return Row(children: [title, const Spacer(), actions]);
          },
        ),
        const SizedBox(height: 14),
        LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 760 || visibleRows.length < 8) {
              return Column(
                children: [
                  for (final holding in visibleRows)
                    HoldingRow(
                      holding: holding,
                      total: total,
                      palette: widget.palette,
                    ),
                ],
              );
            }
            final split = (visibleRows.length / 2).ceil();
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    children: [
                      for (final holding in visibleRows.take(split))
                        HoldingRow(
                          holding: holding,
                          total: total,
                          palette: widget.palette,
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 28),
                Expanded(
                  child: Column(
                    children: [
                      for (final holding in visibleRows.skip(split))
                        HoldingRow(
                          holding: holding,
                          total: total,
                          palette: widget.palette,
                        ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class SimulationRangeBar extends StatelessWidget {
  const SimulationRangeBar({
    super.key,
    required this.palette,
    required this.range,
    required this.maxIndex,
    required this.selectedStart,
    required this.selectedEnd,
    required this.fullStart,
    required this.fullEnd,
    required this.onChanged,
    required this.onReset,
  });

  final Palette palette;
  final RangeValues range;
  final double maxIndex;
  final String selectedStart;
  final String selectedEnd;
  final String fullStart;
  final String fullEnd;
  final ValueChanged<RangeValues>? onChanged;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Icon(Icons.date_range_rounded, color: palette.accent, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '$selectedStart - $selectedEnd',
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              TextButton.icon(
                onPressed: onReset,
                icon: const Icon(
                  Icons.keyboard_double_arrow_left_rounded,
                  size: 16,
                ),
                label: const Text('All'),
                style: TextButton.styleFrom(
                  foregroundColor: palette.accent,
                  minimumSize: const Size(58, 34),
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                ),
              ),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: palette.accent,
              inactiveTrackColor: palette.border,
              thumbColor: palette.accent,
              overlayColor: palette.accent.withValues(alpha: .14),
              rangeThumbShape: const RoundRangeSliderThumbShape(
                enabledThumbRadius: 7,
              ),
              rangeTrackShape: const RoundedRectRangeSliderTrackShape(),
              trackHeight: 5,
            ),
            child: RangeSlider(
              min: 0,
              max: maxIndex,
              divisions: math.min(maxIndex.round(), 520),
              values: RangeValues(
                range.start.clamp(0, maxIndex),
                range.end.clamp(0, maxIndex),
              ),
              onChanged: onChanged,
            ),
          ),
          Row(
            children: [
              Text(
                fullStart,
                style: TextStyle(
                  color: palette.faint,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              Text(
                fullEnd,
                style: TextStyle(
                  color: palette.faint,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class SimulationMetrics {
  const SimulationMetrics({
    required this.totalReturn,
    required this.benchmarkReturn,
    required this.excessReturn,
    required this.maxDrawdown,
  });

  final double totalReturn;
  final double benchmarkReturn;
  final double excessReturn;
  final double maxDrawdown;
}

List<Map<String, dynamic>> rebaseEquity(List<Map<String, dynamic>> equity) {
  if (equity.length < 2) return equity;
  final baseValue = number(equity.first['value']);
  final baseBenchmark = number(equity.first['benchmark']);
  if (baseValue <= 0 || baseBenchmark <= 0) return equity;
  return equity
      .map(
        (point) => {
          ...point,
          'value': number(point['value']) / baseValue,
          'benchmark': number(point['benchmark']) / baseBenchmark,
        },
      )
      .toList();
}

SimulationMetrics simulationMetrics(List<Map<String, dynamic>> equity) {
  if (equity.length < 2) {
    return const SimulationMetrics(
      totalReturn: 0,
      benchmarkReturn: 0,
      excessReturn: 0,
      maxDrawdown: 0,
    );
  }
  final first = equity.first;
  final last = equity.last;
  final startValue = number(first['value']);
  final endValue = number(last['value']);
  final startBenchmark = number(first['benchmark']);
  final endBenchmark = number(last['benchmark']);
  final totalReturn = startValue > 0 ? endValue / startValue - 1 : 0.0;
  final benchmarkReturn = startBenchmark > 0
      ? endBenchmark / startBenchmark - 1
      : 0.0;
  var peak = startValue;
  var drawdown = 0.0;
  for (final point in equity) {
    final value = number(point['value']);
    peak = math.max(peak, value);
    if (peak > 0) drawdown = math.min(drawdown, value / peak - 1);
  }
  return SimulationMetrics(
    totalReturn: totalReturn,
    benchmarkReturn: benchmarkReturn,
    excessReturn: totalReturn - benchmarkReturn,
    maxDrawdown: drawdown,
  );
}

class GuruTradeModule extends StatefulWidget {
  const GuruTradeModule({
    super.key,
    required this.guru,
    required this.selectedTicker,
    required this.selectedTrade,
    required this.contextPayload,
    required this.loading,
    required this.error,
    required this.palette,
    required this.onSelect,
    required this.onRetry,
  });

  final Map<String, dynamic> guru;
  final String selectedTicker;
  final Map<String, dynamic> selectedTrade;
  final Map<String, dynamic>? contextPayload;
  final bool loading;
  final String? error;
  final Palette palette;
  final ValueChanged<Map<String, dynamic>> onSelect;
  final VoidCallback onRetry;

  @override
  State<GuruTradeModule> createState() => _GuruTradeModuleState();
}

class _GuruTradeModuleState extends State<GuruTradeModule> {
  String _tickerQuery = '';
  final TextEditingController _tickerController = TextEditingController();

  @override
  void didUpdateWidget(covariant GuruTradeModule oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (text(oldWidget.guru['id']) != text(widget.guru['id'])) {
      _tickerQuery = '';
      _tickerController.clear();
    }
  }

  @override
  void dispose() {
    _tickerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final type = text(widget.guru['type']);
    final tradeWorkspace = type == 'manager13f' || type == 'congress';
    final rows = guruTradeRows(widget.guru);
    final query = _tickerQuery.trim().toLowerCase();
    final filteredRows = query.isEmpty
        ? rows
        : rows.where((row) {
            final ticker = text(row['ticker']).toLowerCase();
            final issuer = text(row['issuer']).toLowerCase();
            final action = actionLabel(
              text(row['action']),
              context.language,
            ).toLowerCase();
            return ticker.contains(query) ||
                issuer.contains(query) ||
                action.contains(query);
          }).toList();
    final selected = widget.selectedTrade.isNotEmpty
        ? widget.selectedTrade
        : (rows.isNotEmpty ? rows.first : <String, dynamic>{});
    final summary = asMap(widget.guru['summary']);
    final market = asMap(widget.contextPayload?['market']);
    final selectedMarket = asMap(market['selected']);
    final points = asList(selectedMarket['points']);
    final chartOperation = {
      ...selected,
      'date': text(
        selected['date'],
        text(selected['transactionDate'], text(summary['reportDate'])),
      ),
      'filingDate': text(
        selected['filingDate'],
        text(selected['reportDate'], text(summary['filingDate'])),
      ),
    };

    Widget buildList() {
      if (rows.isEmpty) {
        return EmptyState(
          text: tradeWorkspace
              ? 'No buy/sell rows available.'
              : 'No disclosure rows available.',
          palette: widget.palette,
        );
      }
      if (filteredRows.isEmpty) {
        return EmptyState(
          text: 'No ticker matched "$_tickerQuery".',
          palette: widget.palette,
        );
      }
      return ListView.separated(
        padding: EdgeInsets.zero,
        itemCount: filteredRows.length,
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final row = filteredRows[index];
          return GuruTradeRowButton(
            row: row,
            active: text(row['ticker']) == widget.selectedTicker,
            palette: widget.palette,
            onTap: () => widget.onSelect(row),
          );
        },
      );
    }

    Widget buildSearch() {
      return TextField(
        controller: _tickerController,
        onChanged: (value) => setState(() => _tickerQuery = value),
        decoration: InputDecoration(
          hintText: 'Search ticker / company',
          prefixIcon: const Icon(Icons.search_rounded),
          suffixIcon: _tickerQuery.isEmpty
              ? null
              : IconButton(
                  onPressed: () {
                    _tickerController.clear();
                    setState(() => _tickerQuery = '');
                  },
                  icon: const Icon(Icons.close_rounded),
                  tooltip: 'Clear',
                ),
          filled: true,
          fillColor: widget.palette.card,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(color: widget.palette.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(color: widget.palette.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(
              color: widget.palette.accent.withValues(alpha: .65),
            ),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 13,
          ),
        ),
      );
    }

    Widget buildChart() {
      if (widget.loading && widget.contextPayload == null) {
        return const SizedBox(
          height: 320,
          child: Center(child: CircularProgressIndicator()),
        );
      }
      if (widget.error != null && widget.contextPayload == null) {
        return EmptyState(text: widget.error!, palette: widget.palette);
      }
      if (points.length < 2) {
        return EmptyState(
          text: 'No price chart available for ${widget.selectedTicker}.',
          palette: widget.palette,
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              BadgeLabel(
                text: text(chartOperation['ticker']),
                color: tradeToneColor(
                  text(chartOperation['action']),
                  widget.palette,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  compactName(text(chartOperation['issuer'])),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: widget.palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                actionLabel(text(chartOperation['action']), context.language),
                style: TextStyle(
                  color: tradeToneColor(
                    text(chartOperation['action']),
                    widget.palette,
                  ),
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 310,
            child: PriceActionChart(
              points: points,
              operation: chartOperation,
              palette: widget.palette,
              language: context.language,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              InfoChip(
                formatMoney(tradeDisplayAmount(chartOperation)),
                palette: widget.palette,
              ),
              InfoChip(
                '${formatSignedNumber(tradeShareChange(chartOperation))} shares',
                palette: widget.palette,
              ),
              InfoChip(
                'Report ${formatDate(text(chartOperation['date']))}',
                palette: widget.palette,
              ),
              InfoChip(
                'Filed ${formatDate(text(chartOperation['filingDate']))}',
                palette: widget.palette,
              ),
            ],
          ),
        ],
      );
    }

    return Panel(
      palette: widget.palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.swap_vert_rounded,
            kicker: tradeWorkspace
                ? 'NEW / EXIT'
                : disclosureLabel(type).toUpperCase(),
            title: tradeWorkspace
                ? context.tr('新买入 / 卖出股票', 'New Buys / Sells')
                : context.tr('披露轨迹 / 股价走势', 'Disclosure Trail / Price Chart'),
            palette: widget.palette,
            trailing: _RetryIconButton(
              onPressed: widget.onRetry,
              palette: widget.palette,
            ),
          ),
          if (type == 'insider') ...[
            const SizedBox(height: 16),
            InsiderOwnershipSummary(guru: widget.guru, palette: widget.palette),
          ],
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 900;
              if (!wide) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    buildSearch(),
                    const SizedBox(height: 12),
                    SizedBox(height: 360, child: buildList()),
                    const SizedBox(height: 18),
                    buildChart(),
                  ],
                );
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 360,
                    child: Column(
                      children: [
                        buildSearch(),
                        const SizedBox(height: 12),
                        SizedBox(height: 560, child: buildList()),
                      ],
                    ),
                  ),
                  const SizedBox(width: 18),
                  Expanded(child: buildChart()),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class InsiderOwnershipSummary extends StatelessWidget {
  const InsiderOwnershipSummary({
    super.key,
    required this.guru,
    required this.palette,
  });

  final Map<String, dynamic> guru;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final summary = asMap(guru['summary']);
    final positions = asList(guru['insiderPositions']);
    if (positions.isEmpty) return const SizedBox.shrink();
    final windowStart = formatDate(text(summary['form4WindowStart']));
    final windowEnd = formatDate(text(summary['form4WindowEnd']));
    final windowLabel = windowStart == '-' && windowEnd == '-'
        ? '${formatNumber(number(summary['form4FilingsLoaded']))} filings'
        : '$windowStart - $windowEnd';
    final rows = positions.take(8).toList();
    final maxSold = rows
        .map((row) => number(asMap(row)['cumulativeSoldValue']))
        .fold<double>(0, math.max);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.account_balance_wallet_rounded,
                color: palette.accent,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr(
                        '高管持仓 / 累计卖出',
                        'Executive Holdings / Cumulative Sold',
                      ),
                      style: TextStyle(
                        color: palette.text,
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      context.tr(
                        '按 Form 4 已加载窗口统计 · $windowLabel',
                        'Based on the loaded Form 4 window · $windowLabel',
                      ),
                      style: TextStyle(color: palette.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          GridWrap(
            minTileWidth: 150,
            spacing: 10,
            children: [
              MiniMetric(
                'Tracked stocks',
                formatNumber(number(summary['trackedTickers'])),
                Icons.dataset_rounded,
                palette,
              ),
              MiniMetric(
                'Held shares',
                formatNumber(number(summary['totalLatestSharesOwned'])),
                Icons.pie_chart_rounded,
                palette,
              ),
              MiniMetric(
                'Cumulative sold',
                formatMoney(number(summary['cumulativeSoldValue'])),
                Icons.trending_down_rounded,
                palette,
              ),
              MiniMetric(
                'Sold shares',
                formatNumber(number(summary['cumulativeSoldShares'])),
                Icons.remove_circle_outline_rounded,
                palette,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Column(
            children: [
              for (final raw in rows)
                InsiderPositionRow(
                  row: asMap(raw),
                  maxSold: maxSold,
                  palette: palette,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class InsiderPositionRow extends StatelessWidget {
  const InsiderPositionRow({
    super.key,
    required this.row,
    required this.maxSold,
    required this.palette,
  });

  final Map<String, dynamic> row;
  final double maxSold;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final ticker = text(row['ticker']);
    final issuer = compactName(text(row['issuer']));
    final heldShares = number(row['latestSharesOwned']);
    final soldValue = number(row['cumulativeSoldValue']);
    final soldShares = number(row['cumulativeSoldShares']);
    final boughtShares = number(row['cumulativeBoughtShares']);
    final latestDate = formatDate(
      text(row['latestSharesDate'], text(row['lastTransactionDate'])),
    );
    final progress = maxSold <= 0
        ? 0.0
        : math.max(.04, soldValue / maxSold).clamp(0.0, 1.0);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 82,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ticker,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  latestDate,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.faint, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  issuer,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.muted, fontSize: 12),
                ),
                const SizedBox(height: 7),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: palette.border,
                    color: soldValue > 0 ? palette.negative : palette.accent,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 112,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${formatNumber(heldShares)} sh',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'sold ${formatMoney(soldValue)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.negative, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 96,
            child: Text(
              '${formatNumber(soldShares)} sold · ${formatNumber(boughtShares)} bought',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.end,
              style: TextStyle(color: palette.faint, fontSize: 11, height: 1.2),
            ),
          ),
        ],
      ),
    );
  }
}

class GuruTradeRowButton extends StatelessWidget {
  const GuruTradeRowButton({
    super.key,
    required this.row,
    required this.active,
    required this.palette,
    required this.onTap,
  });

  final Map<String, dynamic> row;
  final bool active;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final action = text(row['action']);
    final tone = tradeToneColor(action, palette);
    final amount = tradeDisplayAmount(row);
    final detail = amount > 0
        ? formatMoney(amount)
        : text(
            row['amountRange'],
            '${formatNumber(tradeShareChange(row).abs())} shares',
          );
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: active ? tone.withValues(alpha: .13) : palette.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: active ? tone.withValues(alpha: .48) : palette.border,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 5,
                height: 42,
                decoration: BoxDecoration(
                  color: tone,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      text(row['ticker'], compactName(text(row['issuer']))),
                      style: TextStyle(
                        color: palette.text,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      compactName(
                        text(
                          row['issuer'],
                          actionLabel(action, context.language),
                        ),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: palette.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    actionLabel(action, context.language),
                    style: TextStyle(color: tone, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    detail,
                    style: TextStyle(color: palette.faint, fontSize: 12),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PriceActionChart extends StatefulWidget {
  const PriceActionChart({
    super.key,
    required this.points,
    required this.operation,
    required this.palette,
    required this.language,
  });

  final List<Map<String, dynamic>> points;
  final Map<String, dynamic> operation;
  final Palette palette;
  final AppLanguage language;

  @override
  State<PriceActionChart> createState() => _PriceActionChartState();
}

class _PriceActionChartState extends State<PriceActionChart> {
  int? _hoverIndex;

  void _updateHover(Offset position, double width) {
    if (widget.points.length < 2 || width <= 0) return;
    final left = PriceActionPainter.horizontalInset;
    final right = math.max(
      left + 1,
      width - PriceActionPainter.horizontalInset,
    );
    final ratio = ((position.dx - left) / (right - left)).clamp(0.0, 1.0);
    final next = (ratio * (widget.points.length - 1)).round();
    if (next == _hoverIndex) return;
    setState(() => _hoverIndex = next);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return MouseRegion(
          cursor: SystemMouseCursors.precise,
          onHover: (event) =>
              _updateHover(event.localPosition, constraints.maxWidth),
          onExit: (_) {
            if (_hoverIndex != null) setState(() => _hoverIndex = null);
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (details) =>
                _updateHover(details.localPosition, constraints.maxWidth),
            onPanDown: (details) =>
                _updateHover(details.localPosition, constraints.maxWidth),
            onPanUpdate: (details) =>
                _updateHover(details.localPosition, constraints.maxWidth),
            child: CustomPaint(
              painter: PriceActionPainter(
                points: widget.points,
                operation: widget.operation,
                palette: widget.palette,
                language: widget.language,
                hoverIndex: _hoverIndex,
              ),
              size: Size.infinite,
            ),
          ),
        );
      },
    );
  }
}

class PriceActionPainter extends CustomPainter {
  PriceActionPainter({
    required this.points,
    required this.operation,
    required this.palette,
    required this.language,
    required this.hoverIndex,
  });

  static const horizontalInset = 8.0;
  static const topInset = 14.0;
  static const bottomInset = 24.0;

  final List<Map<String, dynamic>> points;
  final Map<String, dynamic> operation;
  final Palette palette;
  final AppLanguage language;
  final int? hoverIndex;

  @override
  void paint(Canvas canvas, Size size) {
    final left = horizontalInset;
    final right = size.width - horizontalInset;
    final top = topInset;
    final bottom = size.height - bottomInset;
    final closes = points
        .map((point) => number(point['close']))
        .where((value) => value > 0)
        .toList();
    if (closes.length < 2) return;
    final minValue = closes.reduce(math.min);
    final maxValue = closes.reduce(math.max);
    final span = math.max(.0001, maxValue - minValue);
    final tone = tradeToneColor(text(operation['action']), palette);

    double xForIndex(int index) =>
        left + (right - left) * index / math.max(1, points.length - 1);

    int indexForDate(String date) {
      if (date.isEmpty) return 0;
      for (var i = 0; i < points.length; i += 1) {
        if (text(points[i]['date']).compareTo(date) >= 0) return i;
      }
      return points.length - 1;
    }

    double yForClose(double close) =>
        bottom - ((close - minValue) / span) * (bottom - top);

    final rangeStart = text(operation['date']);
    final rangeEnd = text(operation['filingDate'], rangeStart);
    final startX = xForIndex(indexForDate(rangeStart));
    final endX = xForIndex(indexForDate(rangeEnd));
    final highlightLeft = math.min(startX, endX);
    final highlightRight = math.max(startX, endX);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(
          highlightLeft,
          top,
          math.max(highlightLeft + 8, highlightRight),
          bottom,
        ),
        const Radius.circular(8),
      ),
      Paint()..color = tone.withValues(alpha: .13),
    );

    final gridPaint = Paint()
      ..color = palette.border
      ..strokeWidth = 1;
    for (var i = 0; i < 4; i += 1) {
      final y = top + (bottom - top) * i / 3;
      canvas.drawLine(Offset(left, y), Offset(right, y), gridPaint);
    }

    final path = Path();
    var started = false;
    for (var i = 0; i < points.length; i += 1) {
      final close = number(points[i]['close']);
      if (close <= 0) continue;
      final x = xForIndex(i);
      final y = yForClose(close);
      if (!started) {
        path.moveTo(x, y);
        started = true;
      } else {
        path.lineTo(x, y);
      }
    }
    if (started) {
      canvas.drawPath(
        path,
        Paint()
          ..color = palette.accent
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
    }

    final markerPaint = Paint()
      ..color = tone
      ..strokeWidth = 2;
    canvas.drawLine(Offset(endX, top), Offset(endX, bottom), markerPaint);
    final markerIndex = indexForDate(rangeEnd);
    final markerClose = number(points[markerIndex]['close']);
    if (markerClose > 0) {
      canvas.drawCircle(
        Offset(endX, yForClose(markerClose)),
        5,
        Paint()..color = tone,
      );
    }

    final labelStyle = TextStyle(
      color: palette.faint,
      fontSize: 11,
      fontWeight: FontWeight.w700,
    );
    _drawText(
      canvas,
      formatDate(text(points.first['date'])),
      Offset(left, bottom + 8),
      labelStyle,
    );
    _drawText(
      canvas,
      formatDate(text(points.last['date'])),
      Offset(right - 78, bottom + 8),
      labelStyle,
    );
    _drawText(
      canvas,
      '${actionLabel(text(operation['action']), language)}${trFor(language, '区间', ' window')}',
      Offset(highlightLeft + 6, top + 7),
      labelStyle.copyWith(color: tone),
    );

    final selectedIndex = hoverIndex;
    if (selectedIndex != null &&
        selectedIndex >= 0 &&
        selectedIndex < points.length) {
      final point = points[selectedIndex];
      final close = number(point['close']);
      if (close > 0) {
        final x = xForIndex(selectedIndex);
        final y = yForClose(close);
        _drawHover(canvas, size, top, bottom, Offset(x, y), point, tone);
      }
    }
  }

  void _drawHover(
    Canvas canvas,
    Size size,
    double top,
    double bottom,
    Offset offset,
    Map<String, dynamic> point,
    Color tone,
  ) {
    canvas.drawLine(
      Offset(offset.dx, top),
      Offset(offset.dx, bottom),
      Paint()
        ..color = palette.muted.withValues(alpha: .34)
        ..strokeWidth = 1,
    );
    canvas.drawCircle(
      offset,
      7,
      Paint()..color = palette.accent.withValues(alpha: .16),
    );
    canvas.drawCircle(offset, 4.5, Paint()..color = palette.accent);
    canvas.drawCircle(
      offset,
      4.5,
      Paint()
        ..color = palette.panel
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2,
    );

    const tooltipWidth = 178.0;
    const tooltipHeight = 78.0;
    var tooltipLeft = offset.dx + 14;
    if (tooltipLeft + tooltipWidth > size.width - 6) {
      tooltipLeft = offset.dx - tooltipWidth - 14;
    }
    final maxLeft = math.max(6.0, size.width - tooltipWidth - 6);
    tooltipLeft = tooltipLeft.clamp(6.0, maxLeft).toDouble();
    var tooltipTop = offset.dy - tooltipHeight / 2;
    final maxTop = math.max(6.0, size.height - tooltipHeight - 6);
    tooltipTop = tooltipTop.clamp(6.0, maxTop).toDouble();

    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(tooltipLeft, tooltipTop, tooltipWidth, tooltipHeight),
      const Radius.circular(8),
    );
    canvas.drawRRect(
      rect,
      Paint()..color = palette.card.withValues(alpha: .96),
    );
    canvas.drawRRect(
      rect,
      Paint()
        ..color = palette.border
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    final date = formatDate(text(point['date']));
    final close = formatCurrencyValue(number(point['close']), 'USD');
    _drawText(
      canvas,
      date,
      Offset(tooltipLeft + 12, tooltipTop + 10),
      TextStyle(color: palette.text, fontSize: 12, fontWeight: FontWeight.w900),
      maxWidth: tooltipWidth - 24,
    );
    _drawTooltipText(
      canvas,
      tooltipLeft,
      tooltipTop + 34,
      'Close',
      close,
      palette.text,
    );
    _drawTooltipText(
      canvas,
      tooltipLeft,
      tooltipTop + 55,
      'Action',
      actionLabel(text(operation['action']), language),
      tone,
    );
  }

  void _drawTooltipText(
    Canvas canvas,
    double left,
    double top,
    String label,
    String value,
    Color valueColor,
  ) {
    _drawText(
      canvas,
      label,
      Offset(left + 12, top),
      TextStyle(
        color: palette.muted,
        fontSize: 11,
        fontWeight: FontWeight.w800,
      ),
      maxWidth: 68,
    );
    _drawText(
      canvas,
      value,
      Offset(left + 84, top),
      TextStyle(color: valueColor, fontSize: 11, fontWeight: FontWeight.w900),
      maxWidth: 82,
    );
  }

  void _drawText(
    Canvas canvas,
    String text,
    Offset offset,
    TextStyle style, {
    double maxWidth = 92,
  }) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: maxWidth);
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant PriceActionPainter oldDelegate) =>
      oldDelegate.points != points ||
      oldDelegate.operation != operation ||
      oldDelegate.hoverIndex != hoverIndex ||
      oldDelegate.palette.colorBlind != palette.colorBlind;
}

class GuruQuarterContributionModule extends StatelessWidget {
  const GuruQuarterContributionModule({
    super.key,
    required this.payload,
    required this.loading,
    required this.error,
    required this.selectedQuarterId,
    required this.onSelectQuarter,
    required this.palette,
    required this.onRetry,
  });

  final Map<String, dynamic>? payload;
  final bool loading;
  final String? error;
  final String selectedQuarterId;
  final ValueChanged<String> onSelectQuarter;
  final Palette palette;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final quarters = asList(payload?['quarterContributions']);
    final hasFullAttribution =
        text(asMap(payload?['detail'])['attribution']) == 'full';
    final selected = quarters.firstWhere(
      (quarter) => text(quarter['id']) == selectedQuarterId,
      orElse: () => quarters.isNotEmpty ? quarters.last : <String, dynamic>{},
    );
    final selectedId = text(selected['id']);
    final contributions = asList(selected['contributions'])
      ..sort(
        (left, right) => number(
          right['contributionPct'],
        ).compareTo(number(left['contributionPct'])),
      );
    final maxAbsContribution = contributions.fold<double>(
      0,
      (maxValue, row) =>
          math.max(maxValue, number(row['contributionPct']).abs()),
    );

    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.calendar_month_rounded,
            kicker: 'QUARTERLY ATTRIBUTION',
            title: context.tr('季度贡献', 'Quarterly Contribution'),
            palette: palette,
            trailing: _RetryIconButton(onPressed: onRetry, palette: palette),
          ),
          const SizedBox(height: 16),
          if (loading && (payload == null || !hasFullAttribution))
            const SizedBox(
              height: 300,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (error != null && payload == null)
            EmptyState(text: error!, palette: palette)
          else if (quarters.isEmpty)
            EmptyState(
              text: 'No quarterly attribution available.',
              palette: palette,
            )
          else ...[
            QuarterTimelineSelector(
              quarters: quarters,
              selectedId: selectedId,
              palette: palette,
              onSelectQuarter: onSelectQuarter,
            ),
            const SizedBox(height: 14),
            GridWrap(
              minTileWidth: 140,
              spacing: 10,
              children: [
                MiniMetric(
                  'Portfolio',
                  formatReturn(number(selected['portfolioReturn'])),
                  Icons.account_balance_wallet_rounded,
                  palette,
                ),
                MiniMetric(
                  'SPY',
                  formatReturn(number(selected['benchmarkReturn'])),
                  Icons.show_chart_rounded,
                  palette,
                ),
                MiniMetric(
                  'Coverage',
                  formatReturn(number(selected['coveragePct'])),
                  Icons.pie_chart_rounded,
                  palette,
                ),
                MiniMetric(
                  'Positions',
                  formatNumber(number(selected['selectedPositions'])),
                  Icons.view_list_rounded,
                  palette,
                ),
              ],
            ),
            const SizedBox(height: 18),
            for (final row in contributions)
              QuarterContributionRow(
                row: row,
                maxAbsContribution: maxAbsContribution,
                palette: palette,
              ),
          ],
        ],
      ),
    );
  }
}

class QuarterTimelineSelector extends StatelessWidget {
  const QuarterTimelineSelector({
    super.key,
    required this.quarters,
    required this.selectedId,
    required this.palette,
    required this.onSelectQuarter,
  });

  final List<Map<String, dynamic>> quarters;
  final String selectedId;
  final Palette palette;
  final ValueChanged<String> onSelectQuarter;

  @override
  Widget build(BuildContext context) {
    final rows = quarters.reversed.toList();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: .72),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.timeline_rounded, color: palette.accent, size: 18),
              const SizedBox(width: 8),
              Text(
                context.tr('历史季度', 'Historical Quarters'),
                style: TextStyle(
                  color: palette.text,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
              Text(
                '${quarters.length} quarters',
                style: TextStyle(
                  color: palette.faint,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final quarter in rows) ...[
                  QuarterTimelineChip(
                    quarter: quarter,
                    selected: text(quarter['id']) == selectedId,
                    palette: palette,
                    onTap: () => onSelectQuarter(text(quarter['id'])),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class QuarterTimelineChip extends StatelessWidget {
  const QuarterTimelineChip({
    super.key,
    required this.quarter,
    required this.selected,
    required this.palette,
    required this.onTap,
  });

  final Map<String, dynamic> quarter;
  final bool selected;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final portfolioReturn = number(quarter['portfolioReturn']);
    final tone = portfolioReturn >= 0 ? palette.positive : palette.negative;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 116,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          color: selected
              ? palette.accent.withValues(alpha: .16)
              : palette.panel,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected
                ? palette.accent.withValues(alpha: .6)
                : palette.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              text(quarter['label']),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: selected ? palette.accent : palette.text,
                fontWeight: FontWeight.w900,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              formatDate(text(quarter['executionDate'])),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.faint,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              formatReturn(portfolioReturn),
              style: TextStyle(
                color: tone,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class QuarterContributionRow extends StatelessWidget {
  const QuarterContributionRow({
    super.key,
    required this.row,
    required this.maxAbsContribution,
    required this.palette,
  });

  final Map<String, dynamic> row;
  final double maxAbsContribution;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final contribution = number(row['contributionPct']);
    final positive = contribution >= 0;
    final tone = positive ? palette.positive : palette.negative;
    final widthFactor = maxAbsContribution <= 0
        ? 0.0
        : (contribution.abs() / maxAbsContribution).clamp(.04, 1.0).toDouble();

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 720;
          final title = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text(row['ticker']),
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                compactName(text(row['issuer'])),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: palette.muted, fontSize: 12),
              ),
            ],
          );
          final bar = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 9,
                decoration: BoxDecoration(
                  color: palette.card,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: FractionallySizedBox(
                    widthFactor: widthFactor,
                    child: Container(
                      decoration: BoxDecoration(
                        color: tone,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 10,
                runSpacing: 6,
                children: [
                  _TinyStat(
                    'weight',
                    formatReturn(number(row['weight'])),
                    palette,
                  ),
                  _TinyStat(
                    'return',
                    formatReturn(number(row['returnPct'])),
                    palette,
                  ),
                  _TinyStat(
                    'contrib',
                    formatReturn(contribution),
                    palette,
                    color: tone,
                  ),
                ],
              ),
            ],
          );
          if (compact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [title, const SizedBox(height: 8), bar],
            );
          }
          return Row(
            children: [
              SizedBox(width: 180, child: title),
              const SizedBox(width: 14),
              Expanded(child: bar),
              const SizedBox(width: 14),
              SizedBox(
                width: 92,
                child: Text(
                  formatReturn(contribution),
                  textAlign: TextAlign.right,
                  style: TextStyle(color: tone, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _TinyStat extends StatelessWidget {
  const _TinyStat(this.label, this.value, this.palette, {this.color});

  final String label;
  final String value;
  final Palette palette;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      '$label $value',
      style: TextStyle(
        color: color ?? palette.muted,
        fontWeight: FontWeight.w800,
        fontSize: 12,
      ),
    );
  }
}

class _RetryIconButton extends StatelessWidget {
  const _RetryIconButton({required this.onPressed, required this.palette});

  final VoidCallback onPressed;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return IconButton.filledTonal(
      tooltip: 'Refresh',
      onPressed: onPressed,
      icon: const Icon(Icons.refresh_rounded),
      style: IconButton.styleFrom(
        backgroundColor: palette.card,
        foregroundColor: palette.accent,
      ),
    );
  }
}

class GuruRightRail extends StatelessWidget {
  const GuruRightRail({
    super.key,
    required this.gurus,
    required this.signals,
    required this.exposures,
    required this.activeGuruId,
    required this.palette,
    required this.onSelectGuru,
    this.deckHeight = 860,
    this.deckLimit = 16,
  });

  final List<Map<String, dynamic>> gurus;
  final List<SignalItem> signals;
  final List<ExposureItem> exposures;
  final String activeGuruId;
  final Palette palette;
  final ValueChanged<String> onSelectGuru;
  final double deckHeight;
  final int deckLimit;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        CompactSignalBoard(
          signals: signals,
          activeGuruId: activeGuruId,
          palette: palette,
          onSelectGuru: onSelectGuru,
        ),
        const SizedBox(height: 10),
        _CompactTickerDeck(
          gurus: gurus,
          exposures: exposures,
          palette: palette,
          height: deckHeight,
          itemLimit: deckLimit,
        ),
      ],
    );
  }
}

class QuickLinksPanel extends StatelessWidget {
  const QuickLinksPanel({
    super.key,
    required this.palette,
    required this.onMode,
  });

  final Palette palette;
  final ValueChanged<String> onMode;

  @override
  Widget build(BuildContext context) {
    final links = const [
      ('Ontology Intelligence', 'ontology', Icons.hub_rounded),
      ('Fair Value Matrix', 'valuation', Icons.query_stats_rounded),
    ];
    return Panel(
      palette: palette,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.link_rounded,
            kicker: 'QUICK LINKS',
            title: context.tr('快速入口', 'Quick Links'),
            palette: palette,
          ),
          const SizedBox(height: 12),
          for (final link in links)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => onMode(link.$2),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: palette.card,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: palette.border),
                  ),
                  child: Row(
                    children: [
                      Icon(link.$3, color: palette.muted, size: 18),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          link.$1,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.muted,
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                      ),
                      Icon(
                        Icons.chevron_right_rounded,
                        color: palette.faint,
                        size: 18,
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

class GuruOverviewStrip extends StatelessWidget {
  const GuruOverviewStrip({
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
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 1180;
        final overview = OverallSnapshotPanel(
          stats: stats,
          palette: palette,
          height: wide ? 328 : null,
        );
        final signalBoard = CompactSignalBoard(
          signals: signals,
          activeGuruId: activeGuruId,
          palette: palette,
          onSelectGuru: onSelectGuru,
          height: wide ? 328 : null,
        );
        final heatmap = CompactTickerHeatmap(
          exposures: exposures,
          palette: palette,
          height: wide ? 328 : null,
        );

        if (!wide) {
          return Column(
            children: [
              overview,
              const SizedBox(height: 12),
              signalBoard,
              const SizedBox(height: 12),
              heatmap,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: 3, child: overview),
            const SizedBox(width: 14),
            Expanded(flex: 4, child: signalBoard),
            const SizedBox(width: 14),
            Expanded(flex: 3, child: heatmap),
          ],
        );
      },
    );
  }
}

class OverallSnapshotPanel extends StatelessWidget {
  const OverallSnapshotPanel({
    super.key,
    required this.stats,
    required this.palette,
    this.height,
  });

  final ExecutiveStats stats;
  final Palette palette;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final items = [
      StatCardData('Coverage', '${stats.count}', 'gurus', Icons.radar_rounded),
      StatCardData(
        '13F AUM',
        formatMoney(stats.aum),
        'long equity',
        Icons.account_balance_wallet_rounded,
      ),
      StatCardData(
        'Signal spread',
        signedNumber(stats.netSignals),
        'buy minus sell',
        Icons.bolt_rounded,
      ),
      StatCardData(
        'Latest quarter',
        stats.latestQuarter,
        'disclosure window',
        Icons.calendar_month_rounded,
      ),
    ];
    final body = GridWrap(
      minTileWidth: 150,
      spacing: 10,
      children: [
        for (final item in items)
          OverviewMetricLine(data: item, palette: palette),
      ],
    );
    return SizedBox(
      height: height,
      child: Panel(
        palette: palette,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PanelTitle(
              icon: Icons.dashboard_customize_rounded,
              kicker: 'OVERVIEW',
              title: context.tr('总体情况', 'Overview'),
              palette: palette,
            ),
            const SizedBox(height: 14),
            if (height == null) body else Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

class OverviewMetricLine extends StatelessWidget {
  const OverviewMetricLine({
    super.key,
    required this.data,
    required this.palette,
  });

  final StatCardData data;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(data.icon, color: palette.accent, size: 18),
        const SizedBox(width: 9),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                data.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                data.value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.text,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                data.sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: palette.faint, fontSize: 11),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class CompactSignalBoard extends StatelessWidget {
  const CompactSignalBoard({
    super.key,
    required this.signals,
    required this.activeGuruId,
    required this.palette,
    required this.onSelectGuru,
    this.height,
  });

  final List<SignalItem> signals;
  final String activeGuruId;
  final Palette palette;
  final ValueChanged<String> onSelectGuru;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final body = Column(
      children: [
        for (final signal in signals)
          CompactSignalRow(
            signal: signal,
            active: signal.guruId == activeGuruId,
            palette: palette,
            onTap: () => onSelectGuru(signal.guruId),
          ),
      ],
    );
    return SizedBox(
      height: height,
      child: Panel(
        palette: palette,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PanelTitle(
              icon: Icons.timeline_rounded,
              kicker: 'SIGNAL BOARD',
              title: context.tr('最新信号', 'Latest Signals'),
              trailing: Text(
                '${signals.length} visible',
                style: TextStyle(color: palette.muted, fontSize: 12),
              ),
              palette: palette,
            ),
            const SizedBox(height: 14),
            if (signals.isEmpty)
              EmptyState(
                text: 'No fresh signals in the current local database.',
                palette: palette,
              )
            else if (height == null)
              body
            else
              Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

class CompactSignalRow extends StatelessWidget {
  const CompactSignalRow({
    super.key,
    required this.signal,
    required this.active,
    required this.palette,
    required this.onTap,
  });

  final SignalItem signal;
  final bool active;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = signal.tone == 'positive'
        ? palette.positive
        : signal.tone == 'negative'
        ? palette.negative
        : palette.muted;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: active
                ? palette.accent.withValues(alpha: .12)
                : palette.card,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: active
                  ? palette.accent.withValues(alpha: .55)
                  : palette.border,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 30,
                decoration: BoxDecoration(
                  color: tone,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${signal.ticker} · ${actionLabel(signal.actionLabel, context.language)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontWeight: FontWeight.w900,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      signal.guruName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: palette.muted, fontSize: 11),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                signal.value > 0 ? formatMoney(signal.value) : signal.detail,
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CompactTickerHeatmap extends StatelessWidget {
  const CompactTickerHeatmap({
    super.key,
    required this.exposures,
    required this.palette,
    this.height,
  });

  final List<ExposureItem> exposures;
  final Palette palette;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final maxValue = exposures.fold<double>(
      0,
      (max, item) => math.max(max, item.value),
    );
    final body = Column(
      children: [
        for (final item in exposures)
          CompactHeatmapRow(item: item, maxValue: maxValue, palette: palette),
      ],
    );
    return SizedBox(
      height: height,
      child: Panel(
        palette: palette,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PanelTitle(
              icon: Icons.grid_view_rounded,
              kicker: 'TICKER HEATMAP',
              title: context.tr('拥挤持仓', 'Crowded Holdings'),
              palette: palette,
            ),
            const SizedBox(height: 14),
            if (exposures.isEmpty)
              EmptyState(
                text: 'No external consensus exposure after filtering.',
                palette: palette,
              )
            else if (height == null)
              body
            else
              Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

class _CompactTickerDeck extends StatefulWidget {
  const _CompactTickerDeck({
    required this.gurus,
    required this.exposures,
    required this.palette,
    this.height = 860,
    this.itemLimit = 16,
  });

  final List<Map<String, dynamic>> gurus;
  final List<ExposureItem> exposures;
  final Palette palette;
  final double height;
  final int itemLimit;

  @override
  State<_CompactTickerDeck> createState() => _CompactTickerDeckState();
}

class _CompactTickerDeckState extends State<_CompactTickerDeck> {
  final PageController _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _go(int delta) {
    final next = (_page + delta) % 4;
    final normalized = next < 0 ? next + 4 : next;
    setState(() => _page = normalized);
    _controller.animateToPage(
      normalized,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _DeckPageSpec(
        icon: Icons.grid_view_rounded,
        kicker: 'TICKER HEATMAP',
        title: context.tr('拥挤持仓', 'Crowded Holdings'),
        body: _CrowdedHoldingsDeckPage(
          exposures: widget.exposures.take(widget.itemLimit).toList(),
          palette: widget.palette,
        ),
      ),
      _DeckPageSpec(
        icon: Icons.event_note_rounded,
        kicker: 'LATEST FILINGS',
        title: context.tr('最近财报', 'Latest Filings'),
        body: _RecentFilingDeckPage(
          filings: buildRecentFilingItems(
            widget.gurus,
          ).take(widget.itemLimit).toList(),
          palette: widget.palette,
        ),
      ),
      _DeckPageSpec(
        icon: Icons.trending_up_rounded,
        kicker: 'ADD RANKING',
        title: context.tr('加仓排名', 'Add Ranking'),
        body: _ActivityRankingDeckPage(
          items: buildActivityRankItems(
            widget.gurus,
            positive: true,
          ).take(widget.itemLimit).toList(),
          positive: true,
          palette: widget.palette,
        ),
      ),
      _DeckPageSpec(
        icon: Icons.trending_down_rounded,
        kicker: 'TRIM RANKING',
        title: context.tr('减仓排名', 'Trim Ranking'),
        body: _ActivityRankingDeckPage(
          items: buildActivityRankItems(
            widget.gurus,
            positive: false,
          ).take(widget.itemLimit).toList(),
          positive: false,
          palette: widget.palette,
        ),
      ),
    ];
    final current = pages[_page];

    return SizedBox(
      height: widget.height,
      child: Panel(
        palette: widget.palette,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PanelTitle(
              icon: current.icon,
              kicker: current.kicker,
              title: current.title,
              trailing: _DeckNavControls(
                page: _page,
                count: pages.length,
                palette: widget.palette,
                onPrevious: () => _go(-1),
                onNext: () => _go(1),
              ),
              palette: widget.palette,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: PageView(
                controller: _controller,
                onPageChanged: (value) => setState(() => _page = value),
                children: [
                  for (final page in pages)
                    _DeckPageFrame(page: page, palette: widget.palette),
                ],
              ),
            ),
            const SizedBox(height: 8),
            _DeckDots(
              page: _page,
              count: pages.length,
              palette: widget.palette,
            ),
          ],
        ),
      ),
    );
  }
}

class _DeckPageSpec {
  const _DeckPageSpec({
    required this.icon,
    required this.kicker,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String kicker;
  final String title;
  final Widget body;
}

class _DeckPageFrame extends StatelessWidget {
  const _DeckPageFrame({required this.page, required this.palette});

  final _DeckPageSpec page;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return page.body;
  }
}

class _DeckNavControls extends StatelessWidget {
  const _DeckNavControls({
    required this.page,
    required this.count,
    required this.palette,
    required this.onPrevious,
    required this.onNext,
  });

  final int page;
  final int count;
  final Palette palette;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _DeckNavButton(
          icon: Icons.chevron_left_rounded,
          tooltip: context.tr('上一张', 'Previous'),
          onTap: onPrevious,
          palette: palette,
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            '${page + 1}/$count',
            style: TextStyle(
              color: palette.faint,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        _DeckNavButton(
          icon: Icons.chevron_right_rounded,
          tooltip: context.tr('下一张', 'Next'),
          onTap: onNext,
          palette: palette,
        ),
      ],
    );
  }
}

class _DeckNavButton extends StatelessWidget {
  const _DeckNavButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    required this.palette,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(7),
        onTap: onTap,
        child: Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: palette.card,
            borderRadius: BorderRadius.circular(7),
            border: Border.all(color: palette.border),
          ),
          child: Icon(icon, color: palette.muted, size: 17),
        ),
      ),
    );
  }
}

class _DeckDots extends StatelessWidget {
  const _DeckDots({
    required this.page,
    required this.count,
    required this.palette,
  });

  final int page;
  final int count;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < count; i += 1)
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: i == page ? 18 : 5,
            height: 5,
            margin: const EdgeInsets.only(right: 5),
            decoration: BoxDecoration(
              color: i == page ? palette.accent : palette.border,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
      ],
    );
  }
}

class _CrowdedHoldingsDeckPage extends StatelessWidget {
  const _CrowdedHoldingsDeckPage({
    required this.exposures,
    required this.palette,
  });

  final List<ExposureItem> exposures;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    if (exposures.isEmpty) {
      return EmptyState(
        text: 'No external consensus exposure after filtering.',
        palette: palette,
      );
    }
    final maxValue = exposures.fold<double>(
      0,
      (max, item) => math.max(max, item.value),
    );
    return Column(
      children: [
        for (var index = 0; index < exposures.length; index += 1)
          _CrowdedHoldingDeckRow(
            rank: index + 1,
            item: exposures[index],
            maxValue: maxValue,
            palette: palette,
          ),
      ],
    );
  }
}

class _CrowdedHoldingDeckRow extends StatelessWidget {
  const _CrowdedHoldingDeckRow({
    required this.rank,
    required this.item,
    required this.maxValue,
    required this.palette,
  });

  final int rank;
  final ExposureItem item;
  final double maxValue;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final progress = maxValue <= 0
        ? 0.0
        : math.max(.05, item.value / maxValue).clamp(0.0, 1.0).toDouble();
    final guruNames = item.guruNames.take(3).join(', ');
    final suffix = item.guruCount > 3 ? ' +' : '';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        children: [
          Row(
            children: [
              SizedBox(
                width: 74,
                child: Row(
                  children: [
                    SizedBox(
                      width: 22,
                      child: Text(
                        '#$rank',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.faint,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        item.ticker,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: palette.border,
                    color: palette.accent,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 58,
                child: Text(
                  formatMoney(item.value),
                  textAlign: TextAlign.end,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              const SizedBox(width: 82),
              Expanded(
                child: Text(
                  '${item.guruCount} gurus · $guruNames$suffix',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.faint, fontSize: 10),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RecentFilingDeckPage extends StatelessWidget {
  const _RecentFilingDeckPage({required this.filings, required this.palette});

  final List<GuruFilingItem> filings;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    if (filings.isEmpty) {
      return EmptyState(
        text: 'No recent 13F filings in the current local database.',
        palette: palette,
      );
    }
    return Column(
      children: [
        for (final filing in filings)
          _DeckListRow(
            title: filing.guruName,
            subtitle:
                '${filing.quarter} · filed ${formatDate(filing.filingDate)}',
            value: filing.quarter,
            meta: formatMoney(filing.value),
            tone: palette.secondary,
            palette: palette,
          ),
      ],
    );
  }
}

class _ActivityRankingDeckPage extends StatelessWidget {
  const _ActivityRankingDeckPage({
    required this.items,
    required this.positive,
    required this.palette,
  });

  final List<GuruActivityRankItem> items;
  final bool positive;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return EmptyState(
        text: positive
            ? 'No add/new rows in the current local database.'
            : 'No reduce/sell-out rows in the current local database.',
        palette: palette,
      );
    }
    final maxAmount = items.fold<double>(
      0,
      (max, item) => math.max(max, item.amount),
    );
    final tone = positive ? palette.positive : palette.negative;
    return Column(
      children: [
        for (final item in items)
          Builder(
            builder: (context) {
              final titleLabel = positive
                  ? context.tr('加仓汇总', 'Add Summary')
                  : context.tr('减仓汇总', 'Trim Summary');
              return _DeckListRow(
                title: '${item.ticker} · $titleLabel',
                subtitle: activityRankSubtitle(item),
                meta: activityRankActionSummary(item, context.language),
                value: formatMoney(item.amount),
                tone: tone,
                progress: maxAmount <= 0
                    ? 0.0
                    : math
                          .max(.06, item.amount / maxAmount)
                          .clamp(0.0, 1.0)
                          .toDouble(),
                palette: palette,
              );
            },
          ),
      ],
    );
  }
}

class _DeckListRow extends StatelessWidget {
  const _DeckListRow({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.tone,
    required this.palette,
    this.meta,
    this.progress,
  });

  final String title;
  final String subtitle;
  final String value;
  final Color tone;
  final Palette palette;
  final String? meta;
  final double? progress;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 34,
            decoration: BoxDecoration(
              color: tone,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: palette.muted, fontSize: 10),
                      ),
                    ),
                    if (meta != null && meta!.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Text(
                        meta!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.faint,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                    if (progress != null) ...[
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 52,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: LinearProgressIndicator(
                            value: progress,
                            minHeight: 5,
                            backgroundColor: palette.border,
                            color: tone,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class CompactHeatmapRow extends StatelessWidget {
  const CompactHeatmapRow({
    super.key,
    required this.item,
    required this.maxValue,
    required this.palette,
  });

  final ExposureItem item;
  final double maxValue;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final progress = maxValue <= 0
        ? 0.0
        : math.max(.05, item.value / maxValue).clamp(0.0, 1.0).toDouble();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 54,
            child: Text(
              item.ticker,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
                fontSize: 13,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 8,
                backgroundColor: palette.border,
                color: palette.accent,
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 58,
            child: Text(
              formatMoney(item.value),
              textAlign: TextAlign.end,
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
                fontSize: 12,
              ),
            ),
          ),
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
                                '${signal.guruName} · ${signal.type} · ${actionLabel(signal.actionLabel, context.language)}',
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
                            context.tr(
                              '${item.guruCount} 位 · ${item.guruNames}',
                              '${item.guruCount} people · ${item.guruNames}',
                            ),
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

class EquityChart extends StatefulWidget {
  const EquityChart({super.key, required this.equity, required this.palette});

  final List<Map<String, dynamic>> equity;
  final Palette palette;

  @override
  State<EquityChart> createState() => _EquityChartState();
}

class _EquityChartState extends State<EquityChart> {
  int? _hoverIndex;

  @override
  void didUpdateWidget(covariant EquityChart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_hoverIndex != null && _hoverIndex! >= widget.equity.length) {
      _hoverIndex = null;
    }
  }

  void _updateHover(Offset position, double width) {
    if (widget.equity.length < 2 || width <= 0) return;
    final left = EquityPainter.horizontalInset;
    final right = math.max(left + 1, width - EquityPainter.horizontalInset);
    final ratio = ((position.dx - left) / (right - left)).clamp(0.0, 1.0);
    final next = (ratio * (widget.equity.length - 1)).round();
    if (next == _hoverIndex) return;
    setState(() => _hoverIndex = next);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.equity.length < 2) {
      return EmptyState(
        text: 'No equity curve available.',
        palette: widget.palette,
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        return MouseRegion(
          cursor: SystemMouseCursors.precise,
          onHover: (event) =>
              _updateHover(event.localPosition, constraints.maxWidth),
          onExit: (_) {
            if (_hoverIndex != null) setState(() => _hoverIndex = null);
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (details) =>
                _updateHover(details.localPosition, constraints.maxWidth),
            onPanDown: (details) =>
                _updateHover(details.localPosition, constraints.maxWidth),
            onPanUpdate: (details) =>
                _updateHover(details.localPosition, constraints.maxWidth),
            child: CustomPaint(
              painter: EquityPainter(
                equity: widget.equity,
                palette: widget.palette,
                hoverIndex: _hoverIndex,
              ),
              size: Size.infinite,
            ),
          ),
        );
      },
    );
  }
}

class EquityPainter extends CustomPainter {
  EquityPainter({
    required this.equity,
    required this.palette,
    required this.hoverIndex,
  });

  static const horizontalInset = 8.0;
  static const topInset = 12.0;
  static const bottomInset = 22.0;

  final List<Map<String, dynamic>> equity;
  final Palette palette;
  final int? hoverIndex;

  @override
  void paint(Canvas canvas, Size size) {
    final left = horizontalInset;
    final right = size.width - horizontalInset;
    final top = topInset;
    final bottom = size.height - bottomInset;
    final values = equity
        .expand<double>(
          (point) => [number(point['value']), number(point['benchmark'])],
        )
        .where((value) => value > 0)
        .toList();
    if (values.isEmpty) return;
    final minValue = values.reduce(math.min);
    final maxValue = values.reduce(math.max);
    final span = math.max(.0001, maxValue - minValue);

    double xForIndex(int index) =>
        left + (right - left) * index / (equity.length - 1);

    double yForValue(double value) =>
        bottom - ((value - minValue) / span) * (bottom - top);

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
        final x = xForIndex(i);
        final y = yForValue(number(equity[i][key]));
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

    final selectedIndex = hoverIndex;
    if (selectedIndex != null &&
        selectedIndex >= 0 &&
        selectedIndex < equity.length) {
      final point = equity[selectedIndex];
      final x = xForIndex(selectedIndex);
      final valueOffset = Offset(x, yForValue(number(point['value'])));
      final benchmarkOffset = Offset(x, yForValue(number(point['benchmark'])));
      _drawHover(
        canvas,
        size,
        top,
        bottom,
        valueOffset,
        benchmarkOffset,
        point,
      );
    }
  }

  void _drawHover(
    Canvas canvas,
    Size size,
    double top,
    double bottom,
    Offset valueOffset,
    Offset benchmarkOffset,
    Map<String, dynamic> point,
  ) {
    final crosshairPaint = Paint()
      ..color = palette.muted.withValues(alpha: .38)
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(valueOffset.dx, top),
      Offset(valueOffset.dx, bottom),
      crosshairPaint,
    );

    void marker(Offset offset, Color color) {
      canvas.drawCircle(
        offset,
        7,
        Paint()..color = color.withValues(alpha: .16),
      );
      canvas.drawCircle(offset, 4.5, Paint()..color = color);
      canvas.drawCircle(
        offset,
        4.5,
        Paint()
          ..color = palette.panel
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
    }

    marker(benchmarkOffset, palette.secondary);
    marker(valueOffset, palette.positive);

    const tooltipWidth = 184.0;
    const tooltipHeight = 96.0;
    var tooltipLeft = valueOffset.dx + 14;
    if (tooltipLeft + tooltipWidth > size.width - 6) {
      tooltipLeft = valueOffset.dx - tooltipWidth - 14;
    }
    final maxLeft = math.max(6.0, size.width - tooltipWidth - 6);
    tooltipLeft = tooltipLeft.clamp(6.0, maxLeft).toDouble();

    var tooltipTop = valueOffset.dy - tooltipHeight / 2;
    final maxTop = math.max(6.0, size.height - tooltipHeight - 6);
    tooltipTop = tooltipTop.clamp(6.0, maxTop).toDouble();

    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(tooltipLeft, tooltipTop, tooltipWidth, tooltipHeight),
      const Radius.circular(8),
    );
    canvas.drawRRect(
      rect,
      Paint()..color = palette.card.withValues(alpha: .96),
    );
    canvas.drawRRect(
      rect,
      Paint()
        ..color = palette.border
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );

    final date = formatDate(text(point['date']));
    final portfolioReturn = formatReturn(number(point['value']) - 1);
    final benchmarkReturn = formatReturn(number(point['benchmark']) - 1);
    final excessReturn = formatReturn(
      number(point['value']) - number(point['benchmark']),
    );
    final x = tooltipLeft + 12;
    final y = tooltipTop + 10;
    _drawText(
      canvas,
      date,
      Offset(x, y),
      TextStyle(color: palette.text, fontSize: 12, fontWeight: FontWeight.w900),
      TextAlign.left,
      maxWidth: tooltipWidth - 24,
    );
    _drawTooltipRow(canvas, tooltipLeft, y + 24, 'Portfolio', portfolioReturn);
    _drawTooltipRow(canvas, tooltipLeft, y + 46, 'SPY', benchmarkReturn);
    _drawTooltipRow(canvas, tooltipLeft, y + 68, 'Excess', excessReturn);
  }

  void _drawTooltipRow(
    Canvas canvas,
    double left,
    double top,
    String label,
    String value,
  ) {
    _drawText(
      canvas,
      label,
      Offset(left + 12, top),
      TextStyle(
        color: palette.muted,
        fontSize: 11,
        fontWeight: FontWeight.w800,
      ),
      TextAlign.left,
      maxWidth: 86,
    );
    _drawText(
      canvas,
      value,
      Offset(left + 98, top),
      TextStyle(color: palette.text, fontSize: 11, fontWeight: FontWeight.w900),
      TextAlign.right,
      maxWidth: 74,
    );
  }

  void _drawText(
    Canvas canvas,
    String text,
    Offset offset,
    TextStyle style,
    TextAlign align, {
    double maxWidth = 90,
  }) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      textAlign: align,
    )..layout(maxWidth: maxWidth);
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant EquityPainter oldDelegate) =>
      oldDelegate.equity != equity ||
      oldDelegate.hoverIndex != hoverIndex ||
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
                  actionLabel(action, context.language),
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
    required this.api,
    required this.data,
    required this.loading,
    required this.error,
    required this.palette,
    required this.onRefresh,
    required this.initialValuationTicker,
    required this.onValuationTickerChanged,
  });

  final String mode;
  final ApiClient api;
  final Map<String, dynamic>? data;
  final bool loading;
  final String? error;
  final Palette palette;
  final Future<void> Function() onRefresh;
  final String initialValuationTicker;
  final ValueChanged<String> onValuationTickerChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (loading)
            Panel(
              palette: palette,
              child: const SizedBox(
                height: 420,
                child: Center(child: CircularProgressIndicator()),
              ),
            )
          else if (data == null)
            Panel(
              palette: palette,
              child: error == null
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        EmptyState(
                          text: context.tr(
                            '当前页面数据还没有载入。',
                            'Data has not loaded yet.',
                          ),
                          palette: palette,
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed: () => unawaited(onRefresh()),
                          icon: const Icon(Icons.refresh_rounded),
                          label: Text(
                            context.tr('重新载入当前页面数据', 'Load current page data'),
                          ),
                        ),
                      ],
                    )
                  : ErrorCard(
                      message: error!.replaceFirst('Exception: ', ''),
                      onRetry: () => unawaited(onRefresh()),
                    ),
            )
          else
            switch (mode) {
              'ontology' => OntologyCompactDashboard(
                data: data!,
                palette: palette,
              ),
              'portfolio' => PortfolioDashboard(
                data: data!,
                api: api,
                palette: palette,
                onRefresh: onRefresh,
              ),
              'admin' => AdminPortfolioDashboard(
                data: data!,
                api: api,
                palette: palette,
                onRefresh: onRefresh,
              ),
              _ => ValuationCompactDashboard(
                data: data!,
                api: api,
                palette: palette,
                initialTicker: initialValuationTicker,
                onTickerChanged: onValuationTickerChanged,
              ),
            },
        ],
      ),
    );
  }
}

class SecondaryModeHeader extends StatelessWidget {
  const SecondaryModeHeader({
    super.key,
    required this.icon,
    required this.kicker,
    required this.title,
    required this.subtitle,
    required this.metrics,
    required this.palette,
    this.chips = const [],
  });

  final IconData icon;
  final String kicker;
  final String title;
  final String subtitle;
  final List<Widget> metrics;
  final List<String> chips;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Panel(
      palette: palette,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 820;
          final identity = Row(
            children: [
              Container(
                width: 58,
                height: 58,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: palette.accent.withValues(alpha: .16),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: palette.accent.withValues(alpha: .28),
                  ),
                ),
                child: Icon(icon, color: palette.accent, size: 28),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      kicker,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      title,
                      maxLines: compact ? 2 : 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontSize: compact ? 19 : 21,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (chips.isNotEmpty) ...[
                      const SizedBox(height: 9),
                      Wrap(
                        spacing: 7,
                        runSpacing: 7,
                        children: [
                          for (final chip in chips)
                            InfoChip(chip, palette: palette),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          );

          if (compact || metrics.isEmpty) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                identity,
                if (metrics.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  GridWrap(minTileWidth: 132, spacing: 10, children: metrics),
                ],
              ],
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              SizedBox(
                width: math.min(430, constraints.maxWidth * .34),
                child: identity,
              ),
              const SizedBox(width: 18),
              Expanded(
                child: IntrinsicHeight(
                  child: Row(
                    children: [
                      for (var i = 0; i < metrics.length; i += 1) ...[
                        Expanded(child: metrics[i]),
                        if (i != metrics.length - 1)
                          VerticalDivider(color: palette.border, width: 24),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class AdminPortfolioDashboard extends StatefulWidget {
  const AdminPortfolioDashboard({
    super.key,
    required this.data,
    required this.api,
    required this.palette,
    required this.onRefresh,
  });

  final Map<String, dynamic> data;
  final ApiClient api;
  final Palette palette;
  final Future<void> Function() onRefresh;

  @override
  State<AdminPortfolioDashboard> createState() =>
      _AdminPortfolioDashboardState();
}

class _AdminPortfolioDashboardState extends State<AdminPortfolioDashboard> {
  String _selectedHash = '';
  String _search = '';
  bool _loadingDetail = false;
  bool _loadingHealth = false;
  String? _detailError;
  String? _healthError;
  Map<String, dynamic>? _detail;
  Map<String, dynamic>? _health;

  List<Map<String, dynamic>> get _users => asList(widget.data['users']);

  @override
  void initState() {
    super.initState();
    unawaited(_loadHealth());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncSelection(force: true);
    });
  }

  @override
  void didUpdateWidget(covariant AdminPortfolioDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(widget.data, oldWidget.data)) {
      _syncSelection();
    }
  }

  void _syncSelection({bool force = false}) {
    final users = _users;
    if (users.isEmpty) {
      setState(() {
        _selectedHash = '';
        _detail = null;
        _detailError = null;
      });
      return;
    }
    final selectedExists = users.any(
      (user) => text(user['userHash']) == _selectedHash,
    );
    if (!force && selectedExists && _selectedHash.isNotEmpty) return;
    final nextHash = text(users.first['userHash']);
    if (nextHash.isEmpty || nextHash == _selectedHash) return;
    setState(() {
      _selectedHash = nextHash;
      _detail = null;
      _detailError = null;
    });
    unawaited(_loadDetail(nextHash));
  }

  Future<void> _loadDetail([String? hash, bool refresh = false]) async {
    final targetHash = hash ?? _selectedHash;
    if (targetHash.isEmpty) return;
    setState(() {
      _loadingDetail = true;
      _detailError = null;
    });
    try {
      final payload = await widget.api.getJson(
        '/api/admin/portfolio-users/$targetHash${refresh ? '?refresh=1' : ''}',
      );
      if (!mounted || targetHash != _selectedHash) return;
      setState(() => _detail = payload);
    } catch (error) {
      if (!mounted || targetHash != _selectedHash) return;
      setState(() => _detailError = error.toString());
    } finally {
      if (mounted && targetHash == _selectedHash) {
        setState(() => _loadingDetail = false);
      }
    }
  }

  Future<void> _loadHealth() async {
    setState(() {
      _loadingHealth = true;
      _healthError = null;
    });
    try {
      final payload = await widget.api.getJson('/api/admin/system-health');
      if (!mounted) return;
      setState(() => _health = payload);
    } catch (error) {
      if (!mounted) return;
      setState(() => _healthError = error.toString());
    } finally {
      if (mounted) setState(() => _loadingHealth = false);
    }
  }

  void _selectUser(String hash) {
    if (hash.isEmpty || hash == _selectedHash) return;
    setState(() {
      _selectedHash = hash;
      _detail = null;
      _detailError = null;
    });
    unawaited(_loadDetail(hash));
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    final summary = asMap(widget.data['summary']);
    final users = _users;
    final needle = _search.trim().toLowerCase();
    final filtered = needle.isEmpty
        ? users
        : users.where((user) {
            final haystack = [
              user['email'],
              user['name'],
              user['userHash'],
              asMap(user['connection'])['status'],
            ].map(text).join(' ').toLowerCase();
            return haystack.contains(needle);
          }).toList();

    return Column(
      children: [
        SecondaryModeHeader(
          icon: Icons.admin_panel_settings_rounded,
          kicker: 'OWNER ADMIN',
          title: 'Portfolio admin console',
          subtitle:
              'View all user-scoped IBKR/Yodlee portfolio databases in read-only mode.',
          chips: const [
            'owner only',
            'read-only detail',
            'encrypted tokens hidden',
          ],
          metrics: [
            _GuruHeaderMetric(
              label: 'Users',
              value: formatNumber(number(summary['users'])),
              sub: '${formatNumber(number(summary['linked']))} linked',
              palette: palette,
            ),
            _GuruHeaderMetric(
              label: 'Accounts',
              value: formatNumber(number(summary['accounts'])),
              sub: 'IBKR/Yodlee saved',
              palette: palette,
            ),
            _GuruHeaderMetric(
              label: 'Latest NAV',
              value: formatMoney(number(summary['latestNav'])),
              sub: 'sum of latest stored NAV',
              palette: palette,
            ),
            _GuruHeaderMetric(
              label: 'Errors',
              value: formatNumber(number(summary['errors'])),
              sub: 'sync or decrypt issues',
              palette: palette,
            ),
          ],
          palette: palette,
        ),
        const SizedBox(height: 10),
        _AdminSystemHealthPanel(
          data: _health,
          loading: _loadingHealth,
          error: _healthError,
          palette: palette,
          onRefresh: _loadHealth,
        ),
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 1180;
            final listPanel = _AdminUserListPanel(
              users: filtered,
              selectedHash: _selectedHash,
              search: _search,
              palette: palette,
              onSearch: (value) => setState(() => _search = value),
              onSelect: _selectUser,
              onRefresh: () async {
                await Future.wait([widget.onRefresh(), _loadHealth()]);
                _syncSelection(force: _selectedHash.isEmpty);
              },
            );
            final detailPanel = _AdminPortfolioDetailPanel(
              detail: _detail,
              loading: _loadingDetail,
              error: _detailError,
              selectedHash: _selectedHash,
              api: widget.api,
              palette: palette,
              onRefresh: () => _loadDetail(_selectedHash, true),
            );
            if (!wide) {
              return Column(
                children: [listPanel, const SizedBox(height: 10), detailPanel],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 360, child: listPanel),
                const SizedBox(width: 10),
                Expanded(child: detailPanel),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _AdminSystemHealthPanel extends StatelessWidget {
  const _AdminSystemHealthPanel({
    required this.data,
    required this.loading,
    required this.error,
    required this.palette,
    required this.onRefresh,
  });

  final Map<String, dynamic>? data;
  final bool loading;
  final String? error;
  final Palette palette;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final payload = data ?? const <String, dynamic>{};
    final status = text(payload['status'], loading ? 'running' : 'unknown');
    final database = asMap(payload['database']);
    final service = asMap(payload['service']);
    final auth = asMap(payload['auth']);
    final portfolio = asMap(payload['portfolio']);
    final portfolioSummary = asMap(portfolio['summary']);
    final jobs = asList(payload['jobs']);
    final issueCount = jobs
        .where(
          (job) =>
              {'failed', 'warning', 'unknown'}.contains(text(job['status'])),
        )
        .length;
    final statusColor = _adminHealthColor(status, palette);

    return Panel(
      palette: palette,
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.monitor_heart_rounded,
            kicker: 'SYSTEM HEALTH',
            title: context.tr('系统健康与数据任务', 'System Health'),
            palette: palette,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                BadgeLabel(text: _adminHealthLabel(status), color: statusColor),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: 'Refresh health',
                  onPressed: loading ? null : () => unawaited(onRefresh()),
                  icon: loading
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: palette.accent,
                          ),
                        )
                      : Icon(Icons.refresh_rounded, color: palette.accent),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (error != null && data == null)
            PortfolioDataNotice(
              icon: Icons.warning_amber_rounded,
              text: error!,
              palette: palette,
            )
          else ...[
            GridWrap(
              minTileWidth: 150,
              spacing: 10,
              children: [
                MiniMetric(
                  'API',
                  _adminHealthLabel(status),
                  Icons.cloud_done_rounded,
                  palette,
                ),
                MiniMetric(
                  'SQLite',
                  _formatBytes(number(database['sizeBytes'])),
                  Icons.storage_rounded,
                  palette,
                ),
                MiniMetric(
                  'Data jobs',
                  issueCount == 0 ? '${jobs.length} OK' : '$issueCount issue',
                  Icons.task_alt_rounded,
                  palette,
                ),
                MiniMetric(
                  'Users',
                  formatNumber(number(portfolioSummary['users'])),
                  Icons.people_alt_rounded,
                  palette,
                ),
                MiniMetric(
                  'Uptime',
                  _formatDuration(number(service['uptimeSeconds'])),
                  Icons.av_timer_rounded,
                  palette,
                ),
                MiniMetric(
                  'Origins',
                  formatNumber(number(auth['allowedOriginCount'])),
                  Icons.public_rounded,
                  palette,
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (text(database['updatedAt']).isNotEmpty)
              Text(
                'DB updated ${_formatAdminDateTime(text(database['updatedAt']))} · '
                '${text(service['environment'], 'env unknown')} · '
                '${text(auth['apiCorsConfigured']) == 'true' ? 'CORS ok' : 'check CORS'}',
                style: TextStyle(
                  color: palette.muted,
                  fontWeight: FontWeight.w800,
                ),
              ),
            const SizedBox(height: 12),
            if (jobs.isEmpty)
              EmptyState(
                text: loading
                    ? 'Loading system health...'
                    : 'No background jobs were reported yet.',
                palette: palette,
              )
            else
              GridWrap(
                minTileWidth: 260,
                spacing: 10,
                children: [
                  for (final job in jobs)
                    _AdminJobHealthTile(job: job, palette: palette),
                ],
              ),
          ],
        ],
      ),
    );
  }
}

class _AdminJobHealthTile extends StatelessWidget {
  const _AdminJobHealthTile({required this.job, required this.palette});

  final Map<String, dynamic> job;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final status = text(job['status'], 'unknown');
    final color = _adminHealthColor(status, palette);
    final details = asMap(job['details']);
    final detailPieces = <String>[
      if (number(details['rows']) > 0)
        '${formatNumber(number(details['rows']))} rows',
      if (number(details['tickerRows']) > 0)
        '${formatNumber(number(details['tickerRows']))} tickers',
      if (number(details['eventCount']) > 0)
        '${formatNumber(number(details['eventCount']))} events',
      if (number(details['holdings']) > 0)
        '${formatNumber(number(details['holdings']))} holdings',
      if (text(details['latestBacktestEndDate']).isNotEmpty)
        'through ${formatDate(text(details['latestBacktestEndDate']))}',
      if (text(details['maxExDate']).isNotEmpty)
        'through ${formatDate(text(details['maxExDate']))}',
      if (text(details['observedThrough']).isNotEmpty)
        'through ${formatDate(text(details['observedThrough']))}',
    ];
    final message = text(job['message']);
    final finishedAt = text(job['finishedAt']);

    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: .28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  text(job['label'], text(job['id'], 'Job')),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _AdminTinyChip(_adminHealthLabel(status), color, palette),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            finishedAt.isEmpty
                ? 'No completed run'
                : 'Last ${_formatAdminDateTime(finishedAt)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.muted,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
          if (detailPieces.isNotEmpty) ...[
            const SizedBox(height: 7),
            Text(
              detailPieces.take(3).join(' · '),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.secondary,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ],
          if (message.isNotEmpty) ...[
            const SizedBox(height: 7),
            Text(
              message,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: status == 'failed' ? palette.negative : palette.muted,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

Color _adminHealthColor(String status, Palette palette) {
  final normalized = status.toLowerCase();
  if (normalized == 'success' || normalized == 'ok') return palette.positive;
  if (normalized == 'running') return palette.accent;
  if (normalized == 'warning' || normalized == 'unknown') {
    return palette.secondary;
  }
  return palette.negative;
}

String _adminHealthLabel(String status) {
  final normalized = status.toLowerCase();
  if (normalized == 'success' || normalized == 'ok') return 'healthy';
  if (normalized == 'running') return 'running';
  if (normalized == 'warning') return 'watch';
  if (normalized == 'failed' || normalized == 'error') return 'failed';
  return 'unknown';
}

String _formatBytes(double bytes) {
  if (!bytes.isFinite || bytes <= 0) return '0 B';
  if (bytes >= 1e9) return '${(bytes / 1e9).toStringAsFixed(2)} GB';
  if (bytes >= 1e6) return '${(bytes / 1e6).toStringAsFixed(1)} MB';
  if (bytes >= 1e3) return '${(bytes / 1e3).toStringAsFixed(1)} KB';
  return '${bytes.toStringAsFixed(0)} B';
}

String _formatDuration(double seconds) {
  if (!seconds.isFinite || seconds <= 0) return '-';
  final duration = Duration(seconds: seconds.round());
  if (duration.inDays > 0) return '${duration.inDays}d';
  if (duration.inHours > 0) return '${duration.inHours}h';
  if (duration.inMinutes > 0) return '${duration.inMinutes}m';
  return '${duration.inSeconds}s';
}

String _formatAdminDateTime(String value) {
  final date = DateTime.tryParse(value);
  if (date == null) return formatDate(value);
  final local = date.toLocal();
  return '${formatDate(local.toIso8601String())} '
      '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

class _AdminUserListPanel extends StatelessWidget {
  const _AdminUserListPanel({
    required this.users,
    required this.selectedHash,
    required this.search,
    required this.palette,
    required this.onSearch,
    required this.onSelect,
    required this.onRefresh,
  });

  final List<Map<String, dynamic>> users;
  final String selectedHash;
  final String search;
  final Palette palette;
  final ValueChanged<String> onSearch;
  final ValueChanged<String> onSelect;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.people_alt_rounded,
            kicker: 'USER DATABASES',
            title: context.tr('所有账户组合', 'All Portfolios'),
            palette: palette,
            trailing: IconButton(
              tooltip: 'Refresh admin index',
              onPressed: () => unawaited(onRefresh()),
              icon: Icon(Icons.refresh_rounded, color: palette.accent),
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            initialValue: search,
            onChanged: onSearch,
            style: TextStyle(color: palette.text, fontWeight: FontWeight.w800),
            decoration: InputDecoration(
              prefixIcon: Icon(Icons.search_rounded, color: palette.muted),
              hintText: 'Search email / name / hash',
              hintStyle: TextStyle(color: palette.faint),
              filled: true,
              fillColor: palette.card,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: palette.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: palette.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: palette.accent),
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (users.isEmpty)
            EmptyState(text: 'No portfolio users found yet.', palette: palette)
          else ...[
            for (final user in users) ...[
              _AdminUserTile(
                user: user,
                selected: text(user['userHash']) == selectedHash,
                palette: palette,
                onTap: () => onSelect(text(user['userHash'])),
              ),
              const SizedBox(height: 8),
            ],
          ],
        ],
      ),
    );
  }
}

class _AdminUserTile extends StatelessWidget {
  const _AdminUserTile({
    required this.user,
    required this.selected,
    required this.palette,
    required this.onTap,
  });

  final Map<String, dynamic> user;
  final bool selected;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final connection = asMap(user['connection']);
    final nav = asMap(user['nav']);
    final status = text(connection['status'], 'not configured');
    final email = text(user['email']);
    final name = text(user['name'], email.isEmpty ? 'Unknown user' : email);
    final hash = text(user['userHash']);
    final tone = status == 'linked'
        ? palette.positive
        : status.contains('error')
        ? palette.negative
        : palette.secondary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected
              ? palette.accent.withValues(alpha: .13)
              : palette.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? palette.accent.withValues(alpha: .5)
                : palette.border,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: tone.withValues(alpha: .14),
                shape: BoxShape.circle,
                border: Border.all(color: tone.withValues(alpha: .36)),
              ),
              child: Icon(Icons.person_rounded, color: tone, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.text,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    email.isEmpty ? 'hash ${shortText(hash, 10)}' : email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _AdminTinyChip(status, tone, palette),
                      _AdminTinyChip(
                        '${formatNumber(number(connection['accountCount']))} accts',
                        palette.secondary,
                        palette,
                      ),
                      if (text(nav['latestDate']).isNotEmpty)
                        _AdminTinyChip(
                          formatDate(text(nav['latestDate'])),
                          palette.muted,
                          palette,
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              formatMoney(number(nav['latestValue'])),
              textAlign: TextAlign.right,
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdminTinyChip extends StatelessWidget {
  const _AdminTinyChip(this.label, this.color, this.palette);

  final String label;
  final Color color;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: .28)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color == palette.muted ? palette.muted : color,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _AdminPortfolioDetailPanel extends StatelessWidget {
  const _AdminPortfolioDetailPanel({
    required this.detail,
    required this.loading,
    required this.error,
    required this.selectedHash,
    required this.api,
    required this.palette,
    required this.onRefresh,
  });

  final Map<String, dynamic>? detail;
  final bool loading;
  final String? error;
  final String selectedHash;
  final ApiClient api;
  final Palette palette;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    if (selectedHash.isEmpty) {
      return Panel(
        palette: palette,
        child: EmptyState(
          text: 'Select a portfolio user to inspect.',
          palette: palette,
        ),
      );
    }
    if (loading && detail == null) {
      return Panel(
        palette: palette,
        child: const SizedBox(
          height: 420,
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    if (error != null && detail == null) {
      return ErrorCard(message: error!, onRetry: () => unawaited(onRefresh()));
    }
    if (detail == null) {
      return Panel(
        palette: palette,
        child: EmptyState(
          text: 'Portfolio detail has not loaded yet.',
          palette: palette,
        ),
      );
    }

    final user = asMap(detail!['user']);
    final portfolio = asMap(detail!['portfolio']);
    final summary = asMap(portfolio['summary']);
    final connection = asMap(user['connection']);
    final title = text(
      user['name'],
      text(user['email'], shortText(selectedHash, 10)),
    );
    return Column(
      children: [
        Panel(
          palette: palette,
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelTitle(
                icon: Icons.manage_accounts_rounded,
                kicker: 'SELECTED USER',
                title: title,
                palette: palette,
                trailing: FilledButton.icon(
                  onPressed: loading ? null : () => unawaited(onRefresh()),
                  icon: loading
                      ? const SizedBox(
                          width: 15,
                          height: 15,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Refresh detail'),
                ),
              ),
              const SizedBox(height: 12),
              GridWrap(
                minTileWidth: 150,
                spacing: 10,
                children: [
                  MiniMetric(
                    'Email',
                    text(user['email'], 'unknown'),
                    Icons.alternate_email_rounded,
                    palette,
                  ),
                  MiniMetric(
                    'Latest NAV',
                    formatMoney(number(summary['totalValue'])),
                    Icons.account_balance_wallet_rounded,
                    palette,
                  ),
                  MiniMetric(
                    'Holdings',
                    formatNumber(number(summary['holdings'])),
                    Icons.table_rows_rounded,
                    palette,
                  ),
                  MiniMetric(
                    'Status',
                    text(connection['status'], 'unknown'),
                    Icons.shield_rounded,
                    palette,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        PortfolioDashboard(
          data: portfolio,
          api: api,
          palette: palette,
          onRefresh: onRefresh,
          readOnly: true,
          readOnlyNotice:
              'Admin read-only view for ${text(user['email'], selectedHash)}. Credentials remain encrypted in that user database.',
        ),
      ],
    );
  }
}

class PortfolioDashboard extends StatelessWidget {
  const PortfolioDashboard({
    super.key,
    required this.data,
    required this.api,
    required this.palette,
    required this.onRefresh,
    this.readOnly = false,
    this.readOnlyNotice,
  });

  final Map<String, dynamic> data;
  final ApiClient api;
  final Palette palette;
  final Future<void> Function() onRefresh;
  final bool readOnly;
  final String? readOnlyNotice;

  @override
  Widget build(BuildContext context) {
    final summary = asMap(data['summary']);
    final connection = asMap(data['connection']);
    final accounts = asList(data['accounts']);
    final holdings = asList(data['holdings']);
    final sectors = asList(data['sectors']);
    final performance = asList(data['performance']);
    final performanceStatus = asMap(data['performanceStatus']);
    final dividends = asList(data['dividends']);
    final dividendStatus = asMap(data['dividendStatus']);
    final analytics = asMap(data['analytics']);
    final configured = truthy(connection['configured']);
    final registered = truthy(connection['registered']) || configured;
    final dayPnl = number(summary['dayPnl']);
    final unrealizedPnl = number(summary['unrealizedPnl']);
    final tone = dayPnl >= 0 ? palette.positive : palette.negative;
    final realPerformance = truthy(performanceStatus['real']);

    return Column(
      children: [
        SecondaryModeHeader(
          icon: Icons.account_balance_wallet_rounded,
          kicker: 'PORTFOLIO MANAGEMENT',
          title: 'Portfolio cockpit',
          subtitle: configured
              ? text(
                  connection['message'],
                  'IBKR holdings synced through Yodlee.',
                )
              : 'Yodlee / IBKR connector is ready; credentials are not configured yet.',
          chips: [
            text(connection['provider'], 'Yodlee'),
            text(connection['institution'], 'Interactive Brokers'),
            text(
              connection['status'],
              configured ? 'linked' : 'not configured',
            ),
          ],
          metrics: [
            _GuruHeaderMetric(
              label: 'Net liquidation',
              value: formatMoney(number(summary['totalValue'])),
              sub: '${formatNumber(number(summary['accounts']))} accounts',
              palette: palette,
            ),
            _GuruHeaderMetric(
              label: 'Day P/L',
              value: formatMoney(dayPnl),
              sub: formatReturn(number(summary['dayPnlPct'])),
              palette: palette,
            ),
            _GuruHeaderMetric(
              label: 'Unrealized',
              value: formatMoney(unrealizedPnl),
              sub: formatReturn(number(summary['unrealizedPnlPct'])),
              palette: palette,
            ),
            _GuruHeaderMetric(
              label: 'Cash',
              value: formatMoney(number(summary['cash'])),
              sub: '${formatNumber(number(summary['holdings']))} holdings',
              palette: palette,
            ),
            _GuruHeaderMetric(
              label: 'Top weight',
              value: formatReturn(
                number(summary['topWeight']),
              ).replaceFirst('+', ''),
              sub: 'concentration',
              palette: palette,
            ),
          ],
          palette: palette,
        ),
        const SizedBox(height: 10),
        if (readOnly)
          PortfolioAdminReadOnlyPanel(
            connection: connection,
            notice: readOnlyNotice,
            palette: palette,
          )
        else if (registered)
          PortfolioConnectionStatusPanel(
            connection: connection,
            api: api,
            palette: palette,
            onRefresh: onRefresh,
          )
        else
          PortfolioConnectionPanel(
            api: api,
            palette: palette,
            onConnected: onRefresh,
          ),
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 1040;
            final main = Column(
              children: [
                Panel(
                  palette: palette,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      PanelTitle(
                        icon: Icons.show_chart_rounded,
                        kicker: 'PERFORMANCE',
                        title: context.tr('组合净值走势', 'Portfolio NAV'),
                        palette: palette,
                        trailing: Text(
                          formatMoney(dayPnl),
                          style: TextStyle(
                            color: tone,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      SizedBox(
                        height: 280,
                        child: PortfolioPerformanceChart(
                          points: performance,
                          status: performanceStatus,
                          palette: palette,
                        ),
                      ),
                      if (!realPerformance) ...[
                        const SizedBox(height: 12),
                        PortfolioDataNotice(
                          icon: Icons.info_outline_rounded,
                          text: text(
                            performanceStatus['message'],
                            'IBKR did not return real portfolio NAV history for this query.',
                          ),
                          palette: palette,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                PortfolioAnalyticsPanel(analytics: analytics, palette: palette),
                const SizedBox(height: 10),
                PortfolioHoldingsTable(holdings: holdings, palette: palette),
                const SizedBox(height: 10),
                PortfolioDividendCalendarSection(
                  dividends: dividends,
                  holdings: holdings,
                  status: dividendStatus,
                  portfolioValue: number(summary['totalValue']),
                  baseCurrency: text(summary['currency'], 'USD'),
                  palette: palette,
                ),
              ],
            );
            final side = Column(
              children: [
                PortfolioAllocationPieCard(
                  holdings: holdings,
                  palette: palette,
                ),
                const SizedBox(height: 10),
                PortfolioAccountCard(accounts: accounts, palette: palette),
                const SizedBox(height: 10),
                PortfolioSectorCard(sectors: sectors, palette: palette),
                const SizedBox(height: 10),
                PortfolioRiskCard(holdings: holdings, palette: palette),
              ],
            );

            if (!wide) {
              return Column(children: [main, const SizedBox(height: 10), side]);
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: main),
                const SizedBox(width: 10),
                SizedBox(width: 340, child: side),
              ],
            );
          },
        ),
      ],
    );
  }
}

class PortfolioAdminReadOnlyPanel extends StatelessWidget {
  const PortfolioAdminReadOnlyPanel({
    super.key,
    required this.connection,
    required this.palette,
    this.notice,
  });

  final Map<String, dynamic> connection;
  final Palette palette;
  final String? notice;

  @override
  Widget build(BuildContext context) {
    final accounts = asList(connection['accounts']);
    final status = text(connection['status'], 'not configured');
    final failed =
        status == 'error' || text(connection['lastError']).isNotEmpty;
    return Panel(
      palette: palette,
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: failed
                ? Icons.warning_amber_rounded
                : Icons.visibility_rounded,
            kicker: 'ADMIN READ-ONLY',
            title: failed
                ? context.tr('用户连接有同步错误', 'User Sync Error')
                : context.tr('用户组合只读快照', 'Read-Only Portfolio Snapshot'),
            palette: palette,
            trailing: InfoChip(status, palette: palette),
          ),
          const SizedBox(height: 10),
          Text(
            notice ??
                'Admin view reads the selected user portfolio database without exposing saved credentials.',
            style: TextStyle(color: palette.muted, height: 1.35),
          ),
          const SizedBox(height: 12),
          if (accounts.isEmpty)
            EmptyState(
              text: 'No linked accounts are visible yet.',
              palette: palette,
            )
          else
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final account in accounts)
                  Container(
                    width: 260,
                    padding: const EdgeInsets.all(13),
                    decoration: BoxDecoration(
                      color: palette.card,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: palette.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.account_balance_rounded,
                              color: palette.secondary,
                              size: 17,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                text(account['label'], 'IBKR account'),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: palette.text,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          [
                            if (text(account['queryId']).isNotEmpty)
                              'Query ${text(account['queryId'])}',
                            if (text(account['tokenPreview']).isNotEmpty)
                              text(account['tokenPreview']),
                          ].join(' · '),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class PortfolioConnectionStatusPanel extends StatefulWidget {
  const PortfolioConnectionStatusPanel({
    super.key,
    required this.connection,
    required this.api,
    required this.palette,
    required this.onRefresh,
  });

  final Map<String, dynamic> connection;
  final ApiClient api;
  final Palette palette;
  final Future<void> Function() onRefresh;

  @override
  State<PortfolioConnectionStatusPanel> createState() =>
      _PortfolioConnectionStatusPanelState();
}

class _PortfolioConnectionStatusPanelState
    extends State<PortfolioConnectionStatusPanel> {
  bool _disconnecting = false;
  bool _updating = false;
  String? _error;
  String? _message;

  Future<void> _disconnect() async {
    setState(() {
      _disconnecting = true;
      _error = null;
      _message = null;
    });
    try {
      await widget.api.deleteJson('/api/portfolio/connection');
      await widget.onRefresh();
    } catch (error) {
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _disconnecting = false);
    }
  }

  Future<void> _updateData() async {
    setState(() {
      _updating = true;
      _error = null;
      _message = null;
    });
    try {
      final payload = await widget.api.postJson('/api/portfolio/sync', {});
      final summary = asMap(payload['summary']);
      final accountCount = number(summary['accounts']).round();
      final holdings = number(summary['holdings']).round();
      setState(() {
        _message = context.tr(
          '已从 IBKR/Yodlee 拉取并写入后端：$accountCount 个账户 · $holdings 个持仓',
          'Synced from IBKR/Yodlee into backend: $accountCount accounts · $holdings holdings',
        );
      });
      await widget.onRefresh();
    } catch (error) {
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _showAddAccount() async {
    await showDialog<void>(
      context: context,
      builder: (context) => PortfolioAddAccountDialog(
        api: widget.api,
        palette: widget.palette,
        onAdded: widget.onRefresh,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    final connection = widget.connection;
    final savedAccounts = asList(connection['accounts']);
    final status = text(connection['status'], 'linked');
    final failed =
        status == 'error' || text(connection['lastError']).isNotEmpty;
    final updatedAt = formatDate(text(connection['updatedAt']));
    final lastConnectedAt = formatDate(text(connection['lastConnectedAt']));
    final queryId = text(connection['queryId']);
    final tokenPreview = text(connection['tokenPreview']);
    final compactActions = MediaQuery.sizeOf(context).width < 760;
    final connectionRows = savedAccounts.isNotEmpty
        ? savedAccounts
        : [
            {
              'label': 'IBKR account 1',
              'tokenPreview': tokenPreview,
              'queryId': queryId,
            },
          ];

    return Panel(
      palette: palette,
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: failed
                ? Icons.warning_amber_rounded
                : Icons.verified_user_rounded,
            kicker: 'PRIVATE PORTFOLIO',
            title: failed
                ? context.tr(
                    '连接已保存，等待修复同步',
                    'Connection Saved; Sync Needs Attention',
                  )
                : context.tr('IBKR / Yodlee 已注册', 'IBKR / Yodlee Registered'),
            palette: palette,
            trailing: _statusActions(palette, compactActions: compactActions),
          ),
          const SizedBox(height: 10),
          Text(
            failed
                ? context.tr(
                    '你的连接记录仍然保留在后端加密用户库里，不需要重新注册。同步失败通常是 token 过期或 Query ID 权限变化；需要更换时先断开再重新注册。',
                    'Your connection is still encrypted in the per-user backend store. You do not need to register again. Sync failures usually mean the token expired or the Query ID permissions changed; disconnect first only if you need to replace credentials.',
                  )
                : context.tr(
                    '以后打开 Portfolio 会直接使用后端加密保存的连接；可以在右上角继续添加账户，或手动更新数据并写入今日 NAV。',
                    'Portfolio will use the encrypted backend connection automatically. You can add another account from the top right, or update data manually to write today’s NAV.',
                  ),
            style: TextStyle(color: palette.muted, height: 1.35),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 780;
              final rows = [
                for (final account in connectionRows)
                  _accountConnectionTile(
                    account: account,
                    palette: palette,
                    updatedAt: lastConnectedAt == '-'
                        ? updatedAt
                        : lastConnectedAt,
                  ),
              ];
              if (!wide) {
                return Column(
                  children: [
                    for (final row in rows) ...[
                      row,
                      if (row != rows.last) const SizedBox(height: 10),
                    ],
                  ],
                );
              }
              return GridWrap(minTileWidth: 230, spacing: 10, children: rows);
            },
          ),
          if (failed) ...[
            const SizedBox(height: 10),
            PortfolioDataNotice(
              icon: Icons.error_outline_rounded,
              text: text(
                connection['lastError'],
                text(connection['message'], 'Latest sync failed.'),
              ),
              palette: palette,
            ),
          ],
          if (_message != null) ...[
            const SizedBox(height: 10),
            PortfolioDataNotice(
              icon: Icons.cloud_done_rounded,
              text: _message!,
              palette: palette,
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            PortfolioDataNotice(
              icon: Icons.error_outline_rounded,
              text: _error!,
              palette: palette,
            ),
          ],
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              InfoChip(
                context.tr('独立用户数据库', 'Per-user database'),
                palette: palette,
              ),
              InfoChip(
                context.tr('后端加密保存', 'Encrypted backend storage'),
                palette: palette,
              ),
              InfoChip(
                context.tr('前端不回显密钥', 'No credential echo in browser'),
                palette: palette,
              ),
              OutlinedButton.icon(
                onPressed: _disconnecting ? null : _disconnect,
                icon: _disconnecting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.link_off_rounded),
                label: Text(
                  _disconnecting ? 'Disconnecting' : 'Disconnect all',
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: palette.muted,
                  side: BorderSide(color: palette.border),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statusActions(Palette palette, {required bool compactActions}) {
    if (compactActions) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: context.tr('添加账户', 'Add account'),
            onPressed: _showAddAccount,
            icon: Icon(Icons.add_rounded, color: palette.accent),
          ),
          IconButton(
            tooltip: context.tr('更新数据', 'Update data'),
            onPressed: _updating ? null : _updateData,
            icon: _updating
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(Icons.cloud_sync_rounded, color: palette.accent),
          ),
        ],
      );
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        OutlinedButton.icon(
          onPressed: _showAddAccount,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: Text(context.tr('添加账户', 'Add account')),
          style: OutlinedButton.styleFrom(
            foregroundColor: palette.accent,
            side: BorderSide(color: palette.border),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        FilledButton.icon(
          onPressed: _updating ? null : _updateData,
          icon: _updating
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.cloud_sync_rounded, size: 18),
          label: Text(
            _updating
                ? context.tr('更新中', 'Updating')
                : context.tr('更新数据', 'Update data'),
          ),
          style: FilledButton.styleFrom(
            backgroundColor: palette.accent,
            foregroundColor: palette.background,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
      ],
    );
  }

  Widget _accountConnectionTile({
    required Map<String, dynamic> account,
    required Palette palette,
    required String updatedAt,
  }) {
    final label = text(account['label'], 'IBKR account');
    final queryId = text(account['queryId'], 'saved');
    final tokenPreview = text(
      account['tokenPreview'],
      context.tr('已加密', 'encrypted'),
    );
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          Icon(
            Icons.account_balance_wallet_rounded,
            color: palette.secondary,
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '${context.tr('Query ID', 'Query ID')} $queryId · $tokenPreview',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.muted,
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${context.tr('上次同步', 'Last sync')} $updatedAt',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.faint, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class PortfolioAddAccountDialog extends StatefulWidget {
  const PortfolioAddAccountDialog({
    super.key,
    required this.api,
    required this.palette,
    required this.onAdded,
  });

  final ApiClient api;
  final Palette palette;
  final Future<void> Function() onAdded;

  @override
  State<PortfolioAddAccountDialog> createState() =>
      _PortfolioAddAccountDialogState();
}

class _PortfolioAddAccountDialogState extends State<PortfolioAddAccountDialog> {
  final _labelController = TextEditingController();
  final _tokenController = TextEditingController();
  final _queryController = TextEditingController();
  bool _saving = false;
  bool _showToken = false;
  String? _error;

  @override
  void dispose() {
    _labelController.dispose();
    _tokenController.dispose();
    _queryController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final token = _tokenController.text.trim();
    final queryId = _queryController.text.trim();
    if (token.isEmpty || queryId.isEmpty) {
      setState(() {
        _error = context.tr(
          'Token 和 Yodlee Query ID 都要填。',
          'Token and Yodlee Query ID are both required.',
        );
      });
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.postJson('/api/portfolio/accounts', {
        'label': _labelController.text.trim(),
        'ibkrFlexToken': token,
        'ibkrFlexQueryId': queryId,
      });
      await widget.onAdded();
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(18),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: panelDecoration(palette),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelTitle(
                icon: Icons.add_card_rounded,
                kicker: 'PORTFOLIO ACCOUNT',
                title: context.tr(
                  '添加 IBKR / Yodlee 账户',
                  'Add IBKR / Yodlee Account',
                ),
                palette: palette,
                trailing: IconButton(
                  tooltip: 'Close',
                  onPressed: _saving ? null : () => Navigator.of(context).pop(),
                  icon: Icon(Icons.close_rounded, color: palette.muted),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                context.tr(
                  '复制 IBKR Third-Party Services 里 Yodlee 那一行的 Token 和 Query ID。保存后会追加到你的后端用户库，并立即更新组合数据。',
                  'Copy the Token and Query ID from the Yodlee row in IBKR Third-Party Services. After saving, it will be added to your encrypted backend user store and immediately synced.',
                ),
                style: TextStyle(color: palette.muted, height: 1.35),
              ),
              const SizedBox(height: 14),
              _field(
                controller: _labelController,
                label: 'Account label',
                hint: context.tr(
                  '例如 IBKR main / Roth / Margin',
                  'Example: IBKR main / Roth / Margin',
                ),
                icon: Icons.badge_rounded,
              ),
              const SizedBox(height: 10),
              _field(
                controller: _tokenController,
                label: 'Yodlee Token',
                hint: context.tr(
                  '复制 Yodlee 行的 Token',
                  'Copy the Token from the Yodlee row',
                ),
                icon: Icons.key_rounded,
                obscure: !_showToken,
                suffix: IconButton(
                  tooltip: _showToken ? 'Hide token' : 'Show token',
                  onPressed: () => setState(() => _showToken = !_showToken),
                  icon: Icon(
                    _showToken
                        ? Icons.visibility_off_rounded
                        : Icons.visibility_rounded,
                    color: palette.muted,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _field(
                controller: _queryController,
                label: 'Yodlee Query ID',
                hint: context.tr(
                  '复制 Yodlee 行的 Query ID',
                  'Copy the Query ID from the Yodlee row',
                ),
                icon: Icons.tag_rounded,
                keyboardType: TextInputType.number,
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                PortfolioDataNotice(
                  icon: Icons.error_outline_rounded,
                  text: _error!,
                  palette: palette,
                ),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving
                          ? null
                          : () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: palette.muted,
                        side: BorderSide(color: palette.border),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _saving ? null : _save,
                      icon: _saving
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.cloud_upload_rounded),
                      label: Text(_saving ? 'Adding' : 'Add & update'),
                      style: FilledButton.styleFrom(
                        backgroundColor: palette.accent,
                        foregroundColor: palette.background,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    bool obscure = false,
    Widget? suffix,
    TextInputType? keyboardType,
  }) {
    final palette = widget.palette;
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      cursorColor: palette.accent,
      style: TextStyle(color: palette.text, fontWeight: FontWeight.w800),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        labelStyle: TextStyle(color: palette.muted),
        hintStyle: TextStyle(color: palette.faint),
        prefixIcon: Icon(icon, color: palette.muted),
        suffixIcon: suffix,
        filled: true,
        fillColor: palette.background.withValues(alpha: .52),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 14,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: palette.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: palette.accent),
        ),
      ),
    );
  }
}

class PortfolioConnectionPanel extends StatefulWidget {
  const PortfolioConnectionPanel({
    super.key,
    required this.api,
    required this.palette,
    required this.onConnected,
  });

  final ApiClient api;
  final Palette palette;
  final Future<void> Function() onConnected;

  @override
  State<PortfolioConnectionPanel> createState() =>
      _PortfolioConnectionPanelState();
}

class _PortfolioConnectionPanelState extends State<PortfolioConnectionPanel> {
  final _tokenController = TextEditingController();
  final _queryController = TextEditingController();
  bool _saving = false;
  bool _showToken = false;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _tokenController.dispose();
    _queryController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final token = _tokenController.text.trim();
    final queryId = _queryController.text.trim();
    if (token.isEmpty || queryId.isEmpty) {
      setState(() {
        _error = context.tr(
          'Token 和 Yodlee Query ID 都要填。',
          'Token and Yodlee Query ID are both required.',
        );
        _message = null;
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _message = null;
    });
    try {
      final payload = await widget.api.postJson('/api/portfolio/connection', {
        'provider': 'ibkr_flex',
        'ibkrFlexToken': token,
        'ibkrFlexQueryId': queryId,
      });
      final portfolio = asMap(payload['portfolio']);
      final connection = asMap(portfolio['connection']);
      setState(() {
        _message = text(
          connection['message'],
          context.tr(
            '连接已保存，正在载入你的 portfolio。',
            'Connection saved. Loading your portfolio.',
          ),
        );
      });
      await widget.onConnected();
    } catch (error) {
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    return Panel(
      palette: palette,
      padding: const EdgeInsets.all(18),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 760;
          final fields = [
            _connectionField(
              controller: _tokenController,
              label: 'Yodlee Token',
              hint: context.tr(
                '复制 Yodlee 行的 Token',
                'Copy the Token from the Yodlee row',
              ),
              icon: Icons.key_rounded,
              obscure: !_showToken,
              suffix: IconButton(
                tooltip: _showToken ? 'Hide token' : 'Show token',
                onPressed: () => setState(() => _showToken = !_showToken),
                icon: Icon(
                  _showToken
                      ? Icons.visibility_off_rounded
                      : Icons.visibility_rounded,
                  color: palette.muted,
                ),
              ),
            ),
            _connectionField(
              controller: _queryController,
              label: 'Yodlee Query ID',
              hint: context.tr(
                '复制 Yodlee 行的 Query ID',
                'Copy the Query ID from the Yodlee row',
              ),
              icon: Icons.tag_rounded,
              keyboardType: TextInputType.number,
            ),
          ];

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelTitle(
                icon: Icons.lock_person_rounded,
                kicker: 'PRIVATE PORTFOLIO',
                title: context.tr(
                  '首次连接 IBKR / Yodlee',
                  'Connect IBKR / Yodlee',
                ),
                palette: palette,
                trailing: InfoChip('per-user encrypted DB', palette: palette),
              ),
              const SizedBox(height: 8),
              Text(
                context.tr(
                  '这个表单只在还没有注册连接时出现。保存成功后，后端会为当前登录用户加密保存配置，之后不会再要求填写 token 或 Query ID。',
                  'This form only appears before a connection is registered. After saving, the backend encrypts the configuration for the current signed-in user, and you will not be asked for the token or Query ID again.',
                ),
                style: TextStyle(color: palette.muted, height: 1.35),
              ),
              const SizedBox(height: 14),
              _setupGuide(palette),
              const SizedBox(height: 14),
              if (compact)
                Column(
                  children: [
                    for (final field in fields) ...[
                      field,
                      const SizedBox(height: 10),
                    ],
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(child: fields[0]),
                    const SizedBox(width: 10),
                    Expanded(child: fields[1]),
                  ],
                ),
              if (_error != null || _message != null) ...[
                const SizedBox(height: 10),
                PortfolioDataNotice(
                  icon: _error == null
                      ? Icons.verified_user_rounded
                      : Icons.error_outline_rounded,
                  text: _error ?? _message!,
                  palette: palette,
                ),
              ],
              const SizedBox(height: 14),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.cloud_sync_rounded),
                    label: Text(_saving ? 'Connecting' : 'Save & sync'),
                    style: FilledButton.styleFrom(
                      backgroundColor: palette.accent,
                      foregroundColor: palette.background,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                  InfoChip('IBKR host allowlisted', palette: palette),
                  InfoChip('no browser token storage', palette: palette),
                  InfoChip('one-time setup', palette: palette),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _setupGuide(Palette palette) {
    final steps = [
      (
        '1',
        context.tr('打开 IBKR Client Portal', 'Open IBKR Client Portal'),
        context.tr(
          '进入 Performance & Reports，然后点 Third-Party Reports。',
          'Go to Performance & Reports, then open Third-Party Reports.',
        ),
      ),
      (
        '2',
        context.tr('复制 Yodlee 那一行', 'Copy the Yodlee row'),
        context.tr(
          '在 Third-Party Services 表格里勾选 Yodlee，只复制这一行显示出来的 Token 和 Query ID。',
          'Enable Yodlee in the Third-Party Services table, then copy only the Token and Query ID shown on that row.',
        ),
      ),
      (
        '3',
        context.tr('净值曲线自动积累', 'NAV history builds automatically'),
        context.tr(
          'IBKR 这里没有 NAV ID。系统会用同一个 Yodlee Query ID 拉组合，并每天把账户 NAV 存进你的用户库，数据够了自动画线。',
          'There is no NAV ID in IBKR. The system uses the same Yodlee Query ID to fetch the portfolio and stores daily account NAV in your user database; the chart appears once enough history exists.',
        ),
      ),
    ];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: .72),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.menu_book_rounded, color: palette.secondary, size: 18),
              const SizedBox(width: 8),
              Text(
                context.tr(
                  '在哪里找 Token / Query ID',
                  'Where to Find Token / Query ID',
                ),
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 720;
              final children = [
                for (final step in steps)
                  _setupStep(
                    number: step.$1,
                    title: step.$2,
                    body: step.$3,
                    palette: palette,
                  ),
              ];
              if (compact) {
                return Column(
                  children: [
                    for (final child in children) ...[
                      child,
                      if (child != children.last) const SizedBox(height: 10),
                    ],
                  ],
                );
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < children.length; i += 1) ...[
                    Expanded(child: children[i]),
                    if (i != children.length - 1) const SizedBox(width: 10),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _setupStep({
    required String number,
    required String title,
    required String body,
    required Palette palette,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: palette.accent.withValues(alpha: .16),
            shape: BoxShape.circle,
            border: Border.all(color: palette.accent.withValues(alpha: .35)),
          ),
          child: Text(
            number,
            style: TextStyle(
              color: palette.accent,
              fontWeight: FontWeight.w900,
              fontSize: 12,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w900,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                body,
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 12,
                  height: 1.32,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _connectionField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    bool obscure = false,
    Widget? suffix,
    TextInputType? keyboardType,
  }) {
    final palette = widget.palette;
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      cursorColor: palette.accent,
      style: TextStyle(color: palette.text, fontWeight: FontWeight.w800),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        labelStyle: TextStyle(color: palette.muted),
        hintStyle: TextStyle(color: palette.faint),
        prefixIcon: Icon(icon, color: palette.muted),
        suffixIcon: suffix,
        filled: true,
        fillColor: palette.background.withValues(alpha: .52),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 14,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: palette.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: palette.accent),
        ),
      ),
    );
  }
}

class PortfolioPerformanceChart extends StatelessWidget {
  const PortfolioPerformanceChart({
    super.key,
    required this.points,
    required this.status,
    required this.palette,
  });

  final List<Map<String, dynamic>> points;
  final Map<String, dynamic> status;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    if (points.length < 2) {
      return DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: palette.border),
          color: palette.card.withValues(alpha: .34),
        ),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.timeline_rounded, color: palette.muted, size: 30),
                const SizedBox(height: 10),
                Text(
                  context.tr('等待真实净值历史', 'Waiting for Real NAV History'),
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  text(
                    status['message'],
                    'Current IBKR report has fewer than two NAV points.',
                  ),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return CustomPaint(
      painter: PortfolioPerformancePainter(points: points, palette: palette),
      child: const SizedBox.expand(),
    );
  }
}

class PortfolioPerformancePainter extends CustomPainter {
  PortfolioPerformancePainter({required this.points, required this.palette});

  final List<Map<String, dynamic>> points;
  final Palette palette;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2 || size.width <= 0 || size.height <= 0) return;
    final values = points
        .map((point) => number(point['value']))
        .where((value) => value > 0)
        .toList();
    if (values.length < 2) return;
    final minValue = values.reduce(math.min);
    final maxValue = values.reduce(math.max);
    final range = math.max(1, maxValue - minValue);
    final left = 14.0;
    final right = size.width - 10;
    final top = 12.0;
    final bottom = size.height - 24;
    final gridPaint = Paint()
      ..color = palette.border
      ..strokeWidth = 1;
    for (var i = 0; i < 4; i += 1) {
      final y = top + (bottom - top) * i / 3;
      canvas.drawLine(Offset(left, y), Offset(right, y), gridPaint);
    }
    final path = Path();
    for (var i = 0; i < values.length; i += 1) {
      final x = left + (right - left) * i / (values.length - 1);
      final y = bottom - (bottom - top) * ((values[i] - minValue) / range);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    final stroke = Paint()
      ..color = palette.accent
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(path, stroke);
  }

  @override
  bool shouldRepaint(covariant PortfolioPerformancePainter oldDelegate) =>
      oldDelegate.points != points || oldDelegate.palette != palette;
}

class PortfolioDataNotice extends StatelessWidget {
  const PortfolioDataNotice({
    super.key,
    required this.icon,
    required this.text,
    required this.palette,
  });

  final IconData icon;
  final String text;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: .42),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: palette.secondary, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: palette.muted,
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PortfolioHoldingLogo extends StatelessWidget {
  const PortfolioHoldingLogo({
    super.key,
    required this.row,
    required this.palette,
    this.size = 28,
  });

  final Map<String, dynamic> row;
  final Palette palette;
  final double size;

  @override
  Widget build(BuildContext context) {
    final ticker = text(row['ticker'], 'N/A');
    final logoUrl = text(row['logoUrl']);
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: palette.accent.withValues(alpha: .16),
        shape: BoxShape.circle,
        border: Border.all(color: palette.accent.withValues(alpha: .28)),
      ),
      child: Text(
        ticker.isEmpty ? '?' : ticker.characters.first,
        style: TextStyle(
          color: palette.accent,
          fontWeight: FontWeight.w900,
          fontSize: math.max(11, size * .44),
        ),
      ),
    );

    if (logoUrl.isEmpty) return fallback;
    return ClipOval(
      child: Container(
        width: size,
        height: size,
        color: palette.text,
        child: Image.network(
          logoUrl,
          fit: BoxFit.cover,
          errorBuilder: (imageContext, error, stackTrace) => fallback,
        ),
      ),
    );
  }
}

class PortfolioAllocationPieCard extends StatelessWidget {
  const PortfolioAllocationPieCard({
    super.key,
    required this.holdings,
    required this.palette,
  });

  final List<Map<String, dynamic>> holdings;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final positiveHoldings = holdings
        .where(
          (row) =>
              number(row['value']) > 0 &&
              !text(row['ticker']).toUpperCase().startsWith('CASH'),
        )
        .toList();
    final total = positiveHoldings.fold<double>(
      0,
      (sum, row) => sum + number(row['value']),
    );
    final colors = [
      palette.accent,
      palette.secondary,
      const Color(0xFF69A7FF),
      const Color(0xFFE7B850),
      const Color(0xFFB889F6),
      const Color(0xFFFF7E72),
      const Color(0xFF8BD7D2),
      const Color(0xFF9AC46D),
    ];
    final visible = positiveHoldings.take(7).toList();
    final otherValue = positiveHoldings
        .skip(7)
        .fold<double>(0, (sum, row) => sum + number(row['value']));
    final slices = <Map<String, dynamic>>[
      for (var index = 0; index < visible.length; index += 1)
        {
          ...visible[index],
          'sliceValue': number(visible[index]['value']),
          'sliceColor': colors[index % colors.length],
        },
      if (otherValue > 0)
        {
          'ticker': 'Other',
          'name': 'Other holdings',
          'value': otherValue,
          'sliceValue': otherValue,
          'sliceColor': palette.muted,
        },
    ];

    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.pie_chart_rounded,
            kicker: 'HOLDING MIX',
            title: context.tr('持仓饼图', 'Holding Mix'),
            palette: palette,
            trailing: Text(
              '${positiveHoldings.length} names',
              style: TextStyle(color: palette.muted, fontSize: 12),
            ),
          ),
          const SizedBox(height: 16),
          if (slices.isEmpty || total <= 0)
            EmptyState(text: 'No positive holdings to chart.', palette: palette)
          else ...[
            SizedBox(
              height: 178,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  PortfolioPieChart(
                    slices: slices,
                    total: total,
                    palette: palette,
                  ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        formatMoney(total),
                        style: TextStyle(
                          color: palette.text,
                          fontWeight: FontWeight.w900,
                          fontSize: 20,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'positive MV',
                        style: TextStyle(color: palette.muted, fontSize: 11),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            for (var index = 0; index < visible.take(6).length; index += 1)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    PortfolioHoldingLogo(
                      row: visible[index],
                      palette: palette,
                      size: 24,
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 54,
                      child: Text(
                        text(visible[index]['ticker']),
                        style: TextStyle(
                          color: palette.text,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: total <= 0
                              ? 0
                              : math.max(
                                  .04,
                                  number(visible[index]['value']) / total,
                                ),
                          minHeight: 7,
                          backgroundColor: palette.border,
                          color: colors[index % colors.length],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 58,
                      child: Text(
                        formatReturn(
                          number(visible[index]['value']) / total,
                        ).replaceFirst('+', ''),
                        textAlign: TextAlign.end,
                        style: TextStyle(
                          color: palette.muted,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 74,
                      child: Text(
                        formatMoney(number(visible[index]['value'])),
                        textAlign: TextAlign.end,
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class PortfolioPieChart extends StatelessWidget {
  const PortfolioPieChart({
    super.key,
    required this.slices,
    required this.total,
    required this.palette,
  });

  final List<Map<String, dynamic>> slices;
  final double total;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: PortfolioPiePainter(
        slices: slices,
        total: total,
        palette: palette,
      ),
      child: const SizedBox.expand(),
    );
  }
}

class PortfolioPiePainter extends CustomPainter {
  PortfolioPiePainter({
    required this.slices,
    required this.total,
    required this.palette,
  });

  final List<Map<String, dynamic>> slices;
  final double total;
  final Palette palette;

  @override
  void paint(Canvas canvas, Size size) {
    if (total <= 0 || slices.isEmpty) return;
    final radius = math.min(size.width, size.height) * .38;
    final strokeWidth = math.max(22.0, radius * .34);
    final rect = Rect.fromCircle(
      center: Offset(size.width / 2, size.height / 2),
      radius: radius,
    );
    final background = Paint()
      ..color = palette.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;
    canvas.drawArc(rect, 0, math.pi * 2, false, background);

    var start = -math.pi / 2;
    for (final slice in slices) {
      final value = number(slice['sliceValue']);
      if (value <= 0) continue;
      final sweep = math.pi * 2 * (value / total);
      final paint = Paint()
        ..color = slice['sliceColor'] as Color? ?? palette.accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.butt;
      canvas.drawArc(rect, start, sweep, false, paint);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant PortfolioPiePainter oldDelegate) =>
      oldDelegate.slices != slices ||
      oldDelegate.total != total ||
      oldDelegate.palette != palette;
}

class PortfolioAnalyticsPanel extends StatelessWidget {
  const PortfolioAnalyticsPanel({
    super.key,
    required this.analytics,
    required this.palette,
  });

  final Map<String, dynamic> analytics;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final rows = asList(analytics['holdings']);
    final historical = asMap(analytics['historicalOneYear']);
    final forward = asMap(analytics['forwardOneYear']);
    final coverage = asMap(analytics['coverage']);
    final assumptions = asMap(analytics['assumptions']);
    final source = asMap(analytics['source']);
    final status = text(analytics['status']);
    if (analytics.isEmpty || status == 'error') {
      return Panel(
        palette: palette,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PanelTitle(
              icon: Icons.insights_rounded,
              kicker: 'PORTFOLIO ANALYTICS',
              title: context.tr('估值差距 / Sharpe', 'Valuation Gap / Sharpe'),
              palette: palette,
            ),
            const SizedBox(height: 14),
            PortfolioDataNotice(
              icon: Icons.info_outline_rounded,
              text: text(
                analytics['message'],
                'Portfolio analytics are not available yet.',
              ),
              palette: palette,
            ),
          ],
        ),
      );
    }

    final modelCoverage = number(coverage['valuationCoveredWeight']);
    final priceCoverage = number(coverage['priceCoveredWeight']);
    final riskFreeRate = number(assumptions['riskFreeRate']);
    final topRows = rows
        .where((row) => !text(row['ticker']).startsWith('CASH'))
        .take(10)
        .toList();

    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.analytics_rounded,
            kicker: 'PORTFOLIO ANALYTICS',
            title: context.tr('估值差距 / Sharpe', 'Valuation Gap / Sharpe'),
            palette: palette,
            trailing: Tooltip(
              message: text(
                source['methodology'],
                'Historical risk uses one-year daily returns; forward return is a model-implied scenario.',
              ),
              child: Icon(
                Icons.info_outline_rounded,
                color: palette.muted,
                size: 18,
              ),
            ),
          ),
          const SizedBox(height: 14),
          GridWrap(
            minTileWidth: 170,
            spacing: 10,
            children: [
              PortfolioAnalyticsMetricCard(
                label: context.tr('过去一年收益', 'Past 1Y Return'),
                value: formatReturn(number(historical['totalReturn'])),
                sub: 'Sharpe ${formatSharpe(number(historical['sharpe']))}',
                icon: Icons.history_rounded,
                tone: number(historical['totalReturn']),
                palette: palette,
              ),
              PortfolioAnalyticsMetricCard(
                label: context.tr('过去一年波动', 'Past 1Y Volatility'),
                value: formatReturn(
                  number(historical['volatility']),
                ).replaceFirst('+', ''),
                sub: 'current-weight backsolve',
                icon: Icons.show_chart_rounded,
                palette: palette,
              ),
              PortfolioAnalyticsMetricCard(
                label: context.tr('未来一年情景回报', 'Forward 1Y Scenario Return'),
                value: formatReturn(number(forward['expectedReturn'])),
                sub:
                    '${formatMoney(number(forward['potentialPnl']))} model P/L',
                icon: Icons.online_prediction_rounded,
                tone: number(forward['expectedReturn']),
                palette: palette,
              ),
              PortfolioAnalyticsMetricCard(
                label: context.tr('未来情景 Sharpe', 'Forward Scenario Sharpe'),
                value: formatSharpe(number(forward['sharpe'])),
                sub: 'rf ${formatReturn(riskFreeRate).replaceFirst('+', '')}',
                icon: Icons.speed_rounded,
                tone: number(forward['sharpe']) - 1,
                palette: palette,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              InfoChip(
                'FV coverage ${formatReturn(modelCoverage).replaceFirst('+', '')}',
                palette: palette,
              ),
              InfoChip(
                'price coverage ${formatReturn(priceCoverage).replaceFirst('+', '')}',
                palette: palette,
              ),
              InfoChip(
                'gap close ${formatReturn(number(assumptions['gapConvergenceOneYear'])).replaceFirst('+', '')}',
                palette: palette,
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (topRows.isEmpty)
            EmptyState(
              text:
                  'No portfolio holdings are available for valuation analysis.',
              palette: palette,
            )
          else
            PortfolioValuationGapList(rows: topRows, palette: palette),
        ],
      ),
    );
  }
}

class PortfolioAnalyticsMetricCard extends StatelessWidget {
  const PortfolioAnalyticsMetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.sub,
    required this.icon,
    required this.palette,
    this.tone,
  });

  final String label;
  final String value;
  final String sub;
  final IconData icon;
  final Palette palette;
  final double? tone;

  @override
  Widget build(BuildContext context) {
    final color = tone == null
        ? palette.secondary
        : tone! >= 0
        ? palette.positive
        : palette.negative;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 12),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.muted,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.text,
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: palette.faint, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class PortfolioValuationGapList extends StatelessWidget {
  const PortfolioValuationGapList({
    super.key,
    required this.rows,
    required this.palette,
  });

  final List<Map<String, dynamic>> rows;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 760;
        return Container(
          width: double.infinity,
          padding: EdgeInsets.all(compact ? 12 : 14),
          decoration: BoxDecoration(
            color: palette.card.withValues(alpha: .55),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
          ),
          child: Column(
            children: [
              if (!compact)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    children: [
                      _PortfolioAnalyticsHeader(
                        'Ticker',
                        width: 150,
                        palette: palette,
                      ),
                      Expanded(
                        child: _PortfolioAnalyticsHeader(
                          'FV gap',
                          palette: palette,
                        ),
                      ),
                      _PortfolioAnalyticsHeader(
                        '1Y / Vol',
                        width: 120,
                        alignEnd: true,
                        palette: palette,
                      ),
                      _PortfolioAnalyticsHeader(
                        'Forward',
                        width: 110,
                        alignEnd: true,
                        palette: palette,
                      ),
                      _PortfolioAnalyticsHeader(
                        'Weight',
                        width: 90,
                        alignEnd: true,
                        palette: palette,
                      ),
                    ],
                  ),
                ),
              for (final row in rows)
                PortfolioValuationGapRow(
                  row: row,
                  compact: compact,
                  palette: palette,
                ),
            ],
          ),
        );
      },
    );
  }
}

class _PortfolioAnalyticsHeader extends StatelessWidget {
  const _PortfolioAnalyticsHeader(
    this.label, {
    required this.palette,
    this.width,
    this.alignEnd = false,
  });

  final String label;
  final Palette palette;
  final double? width;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final child = Text(
      label,
      textAlign: alignEnd ? TextAlign.end : TextAlign.start,
      style: TextStyle(
        color: palette.faint,
        fontSize: 11,
        fontWeight: FontWeight.w900,
      ),
    );
    return width == null ? child : SizedBox(width: width, child: child);
  }
}

class PortfolioValuationGapRow extends StatelessWidget {
  const PortfolioValuationGapRow({
    super.key,
    required this.row,
    required this.compact,
    required this.palette,
  });

  final Map<String, dynamic> row;
  final bool compact;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final valuation = asMap(row['valuation']);
    final gap = nullableNumber(valuation['gap']);
    final gapAbs = gap?.abs().clamp(0.0, .8) ?? 0.0;
    final tone = portfolioValuationTone(valuation, palette);
    final ticker = text(row['ticker'], 'N/A');
    final logoRow = {
      'ticker': ticker,
      'name': text(row['name'], ticker),
      'logoUrl': text(row['logoUrl']),
    };
    final gapText = gap == null ? '-' : formatReturn(gap);
    final price = nullableNumber(valuation['latestPrice']);
    final fairValue = nullableNumber(valuation['fairValue']);
    final currency = text(valuation['currency'], 'USD');
    final priceText = price == null
        ? 'No model price'
        : '${formatCurrencyValue(price, currency)} price';
    final fairText = fairValue == null
        ? 'FV -'
        : 'FV ${formatCurrencyValue(fairValue, currency)}';
    final content = compact
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  PortfolioHoldingLogo(
                    row: logoRow,
                    palette: palette,
                    size: 28,
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      ticker,
                      style: TextStyle(
                        color: palette.text,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  PortfolioValuationChip(
                    valuation: valuation,
                    palette: palette,
                  ),
                ],
              ),
              const SizedBox(height: 9),
              _PortfolioGapBar(value: gapAbs, color: tone, palette: palette),
              const SizedBox(height: 7),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '$gapText · $fairText',
                      style: TextStyle(color: palette.muted, fontSize: 12),
                    ),
                  ),
                  Text(
                    '1Y ${formatNullableReturn(row['trailingReturn'])}',
                    style: TextStyle(color: palette.muted, fontSize: 12),
                  ),
                ],
              ),
            ],
          )
        : Row(
            children: [
              SizedBox(
                width: 150,
                child: Row(
                  children: [
                    PortfolioHoldingLogo(
                      row: logoRow,
                      palette: palette,
                      size: 26,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ticker,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.text,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Text(
                            formatReturn(
                              number(row['weight']),
                            ).replaceFirst('+', ''),
                            style: TextStyle(
                              color: palette.faint,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        SizedBox(
                          width: 74,
                          child: Text(
                            gapText,
                            style: TextStyle(
                              color: tone,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        Expanded(
                          child: _PortfolioGapBar(
                            value: gapAbs,
                            color: tone,
                            palette: palette,
                          ),
                        ),
                        const SizedBox(width: 10),
                        PortfolioValuationChip(
                          valuation: valuation,
                          palette: palette,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$priceText · $fairText',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: palette.faint, fontSize: 11),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 120,
                child: Text(
                  '${formatNullableReturn(row['trailingReturn'])} / ${formatNullableReturn(row['annualVolatility']).replaceFirst('+', '')}',
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              SizedBox(
                width: 110,
                child: Text(
                  formatNullableReturn(row['forwardExpectedReturn']),
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: nullableNumber(row['forwardExpectedReturn']) == null
                        ? palette.muted
                        : number(row['forwardExpectedReturn']) >= 0
                        ? palette.positive
                        : palette.negative,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              SizedBox(
                width: 90,
                child: Text(
                  formatReturn(number(row['weight'])).replaceFirst('+', ''),
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          );

    return Container(
      margin: const EdgeInsets.only(bottom: 9),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: palette.background.withValues(alpha: .24),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: palette.border.withValues(alpha: .72)),
      ),
      child: content,
    );
  }
}

class _PortfolioGapBar extends StatelessWidget {
  const _PortfolioGapBar({
    required this.value,
    required this.color,
    required this.palette,
  });

  final double value;
  final Color color;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: LinearProgressIndicator(
        value: math.max(.04, value / .8).clamp(0.0, 1.0),
        minHeight: 8,
        backgroundColor: palette.border,
        color: color,
      ),
    );
  }
}

class PortfolioValuationChip extends StatelessWidget {
  const PortfolioValuationChip({
    super.key,
    required this.valuation,
    required this.palette,
  });

  final Map<String, dynamic> valuation;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final color = portfolioValuationTone(valuation, palette);
    final label = context.isChinese
        ? text(valuation['labelZh'], text(valuation['label'], '无估值'))
        : text(valuation['label'], 'No valuation');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .13),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: .35)),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

Color portfolioValuationTone(Map<String, dynamic> valuation, Palette palette) {
  final tone = text(valuation['tone']).toLowerCase();
  if (tone == 'positive') return palette.positive;
  if (tone == 'negative') return palette.negative;
  final gap = nullableNumber(valuation['gap']);
  if (gap == null) return palette.muted;
  if (gap >= .18) return palette.positive;
  if (gap <= -.18) return palette.negative;
  return palette.secondary;
}

String formatNullableReturn(dynamic value) {
  final parsed = nullableNumber(value);
  if (parsed == null) return '-';
  return formatReturn(parsed);
}

String formatSharpe(double value) {
  if (!value.isFinite) return '-';
  return value.toStringAsFixed(2);
}

class PortfolioDividendCalendarSection extends StatefulWidget {
  const PortfolioDividendCalendarSection({
    super.key,
    required this.dividends,
    required this.holdings,
    required this.status,
    required this.portfolioValue,
    required this.baseCurrency,
    required this.palette,
  });

  final List<Map<String, dynamic>> dividends;
  final List<Map<String, dynamic>> holdings;
  final Map<String, dynamic> status;
  final double portfolioValue;
  final String baseCurrency;
  final Palette palette;

  @override
  State<PortfolioDividendCalendarSection> createState() =>
      _PortfolioDividendCalendarSectionState();
}

class _PortfolioDividendCalendarSectionState
    extends State<PortfolioDividendCalendarSection> {
  String _query = '';
  String _statusFilter = 'all';
  String _dateMode = 'auto';
  String _windowMode = 'forward';
  bool _calendarView = true;
  int _monthOffset = 0;

  int _offsetForMonth(DateTime target, DateTime windowStart) {
    final base = DateTime(windowStart.year, windowStart.month, 1);
    final offset = (target.year - base.year) * 12 + target.month - base.month;
    return offset.clamp(0, 11).toInt();
  }

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final window = dividendCalendarWindowForKey(_windowMode, today);
    final start = window.start;
    final end = window.end;
    final monthOffset = _monthOffset.clamp(0, 11).toInt();
    final visibleMonthStart = DateTime(
      start.year,
      start.month + monthOffset,
      1,
    );
    final baseCurrency = normalizeDividendCurrency(widget.baseCurrency);
    final allEvents = normalizeDividendDisplayEvents(
      widget.dividends,
      widget.holdings,
      dateMode: _dateMode,
      baseCurrency: baseCurrency,
    );
    bool matchesSearchAndStatus(DividendDisplayEvent event) {
      final statusMatches =
          _statusFilter == 'all' || event.status == _statusFilter;
      final query = _query.trim().toUpperCase();
      final queryMatches =
          query.isEmpty ||
          event.ticker.contains(query) ||
          event.name.toUpperCase().contains(query);
      return statusMatches && queryMatches;
    }

    final filtered =
        allEvents.where((event) {
          final matchesWindow =
              !event.date.isBefore(start) && !event.date.isAfter(end);
          return matchesWindow && matchesSearchAndStatus(event);
        }).toList()..sort((left, right) {
          final dateOrder = left.date.compareTo(right.date);
          if (dateOrder != 0) return dateOrder;
          return right.payoutBase.abs().compareTo(left.payoutBase.abs());
        });
    final comparisonEvents =
        allEvents
            .where(
              (event) =>
                  event.date.year >= 2025 &&
                  event.date.year <= 2026 &&
                  matchesSearchAndStatus(event),
            )
            .toList()
          ..sort((left, right) {
            final dateOrder = left.date.compareTo(right.date);
            if (dateOrder != 0) return dateOrder;
            return right.payoutBase.abs().compareTo(left.payoutBase.abs());
          });
    final buckets = dividendMonthBuckets(start, filtered);
    final comparisonBuckets = _windowMode == 'forward'
        ? const <DividendYearComparisonBucket>[]
        : dividendYearComparisonBuckets(const [2025, 2026], comparisonEvents);
    final calendarBucket = buckets.firstWhere(
      (bucket) =>
          bucket.monthStart.year == visibleMonthStart.year &&
          bucket.monthStart.month == visibleMonthStart.month,
      orElse: () => buckets.first,
    );
    final calendarStart = calendarBucket.monthStart;
    final monthEvents = [...calendarBucket.events]
      ..sort((left, right) {
        final dateOrder = left.date.compareTo(right.date);
        if (dateOrder != 0) return dateOrder;
        return right.payoutBase.abs().compareTo(left.payoutBase.abs());
      });
    final monthTotal = calendarBucket.total;
    final annualIncome = filtered.fold<double>(
      0,
      (sum, event) => sum + event.payoutBase.abs(),
    );
    final monthlyIncome = annualIncome / 12;
    final dailyIncome = annualIncome / 365;
    final yield = widget.portfolioValue > 0
        ? annualIncome / widget.portfolioValue
        : 0.0;
    final currency = baseCurrency;
    final nextDividendMonth = nextDividendMonthAfter(calendarStart, filtered);
    final isCompact = MediaQuery.sizeOf(context).width < 760;

    return Panel(
      palette: widget.palette,
      padding: EdgeInsets.all(isCompact ? 14 : 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.event_available_rounded,
            kicker: 'DIVIDENDS',
            title: 'Dividend calendar',
            palette: widget.palette,
            trailing: Text(
              '${filtered.length} events',
              style: TextStyle(color: widget.palette.muted, fontSize: 12),
            ),
          ),
          const SizedBox(height: 12),
          DividendCalendarToolbar(
            windowMode: _windowMode,
            query: _query,
            statusFilter: _statusFilter,
            dateMode: _dateMode,
            palette: widget.palette,
            onWindowChanged: (value) => setState(() {
              _windowMode = value;
              _monthOffset = 0;
            }),
            onQueryChanged: (value) => setState(() => _query = value),
            onStatusChanged: (value) => setState(() => _statusFilter = value),
            onDateModeChanged: (value) => setState(() => _dateMode = value),
          ),
          const SizedBox(height: 16),
          if (allEvents.isEmpty)
            PortfolioDataNotice(
              icon: Icons.calendar_month_rounded,
              text: text(
                widget.status['message'],
                'Current portfolio feed did not return dividend calendar events.',
              ),
              palette: widget.palette,
            )
          else ...[
            LayoutBuilder(
              builder: (context, constraints) {
                final wide = constraints.maxWidth >= 820;
                final summaryCard = DividendIncomeSummaryCard(
                  annualIncome: annualIncome,
                  monthlyIncome: monthlyIncome,
                  dailyIncome: dailyIncome,
                  yield: yield,
                  currency: currency,
                  palette: widget.palette,
                );
                final chartCard = DividendMonthlyChartCard(
                  buckets: buckets,
                  comparisonBuckets: comparisonBuckets,
                  comparisonYears: const [2025, 2026],
                  currency: currency,
                  palette: widget.palette,
                );
                if (!wide) {
                  return Column(
                    children: [
                      summaryCard,
                      const SizedBox(height: 10),
                      chartCard,
                    ],
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 310, child: summaryCard),
                    const SizedBox(width: 12),
                    Expanded(child: chartCard),
                  ],
                );
              },
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              crossAxisAlignment: WrapCrossAlignment.center,
              alignment: WrapAlignment.spaceBetween,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      onPressed: monthOffset <= 0
                          ? null
                          : () => setState(() => _monthOffset -= 1),
                      icon: const Icon(Icons.chevron_left_rounded),
                      color: widget.palette.muted,
                      tooltip: 'Previous month',
                    ),
                    Text(
                      dividendWindowTitle(calendarStart),
                      style: TextStyle(
                        color: widget.palette.text,
                        fontWeight: FontWeight.w900,
                        fontSize: 18,
                      ),
                    ),
                    IconButton(
                      onPressed: monthOffset >= 11
                          ? null
                          : () => setState(() => _monthOffset += 1),
                      icon: const Icon(Icons.chevron_right_rounded),
                      color: widget.palette.muted,
                      tooltip: 'Next month',
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: widget.palette.positive.withValues(alpha: .16),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '+${formatDividendMoney(monthTotal, currency)}',
                        style: TextStyle(
                          color: widget.palette.positive,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
                DividendViewToggle(
                  calendarView: _calendarView,
                  palette: widget.palette,
                  onChanged: (value) => setState(() => _calendarView = value),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (filtered.isEmpty)
              EmptyState(
                text: 'No dividend events match this filter.',
                palette: widget.palette,
              )
            else if (_calendarView)
              Column(
                children: [
                  if (monthEvents.isEmpty) ...[
                    DividendEmptyMonthNotice(
                      monthStart: calendarStart,
                      nextMonth: nextDividendMonth,
                      palette: widget.palette,
                      onJumpToNext: nextDividendMonth == null
                          ? null
                          : () => setState(
                              () => _monthOffset = _offsetForMonth(
                                nextDividendMonth,
                                start,
                              ),
                            ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  DividendMonthCalendarGrid(
                    monthStart: calendarStart,
                    events: monthEvents,
                    currency: currency,
                    portfolioValue: widget.portfolioValue,
                    palette: widget.palette,
                  ),
                ],
              )
            else if (monthEvents.isEmpty)
              DividendEmptyMonthNotice(
                monthStart: calendarStart,
                nextMonth: nextDividendMonth,
                palette: widget.palette,
                onJumpToNext: nextDividendMonth == null
                    ? null
                    : () => setState(
                        () => _monthOffset = _offsetForMonth(
                          nextDividendMonth,
                          start,
                        ),
                      ),
              )
            else
              DividendEventList(
                events: monthEvents,
                currency: currency,
                palette: widget.palette,
              ),
          ],
        ],
      ),
    );
  }
}

class DividendCalendarToolbar extends StatelessWidget {
  const DividendCalendarToolbar({
    super.key,
    required this.windowMode,
    required this.query,
    required this.statusFilter,
    required this.dateMode,
    required this.palette,
    required this.onWindowChanged,
    required this.onQueryChanged,
    required this.onStatusChanged,
    required this.onDateModeChanged,
  });

  final String windowMode;
  final String query;
  final String statusFilter;
  final String dateMode;
  final Palette palette;
  final ValueChanged<String> onWindowChanged;
  final ValueChanged<String> onQueryChanged;
  final ValueChanged<String> onStatusChanged;
  final ValueChanged<String> onDateModeChanged;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 760;
    final rangeControls = DividendWindowSelector(
      value: windowMode,
      palette: palette,
      onChanged: onWindowChanged,
    );

    final search = SizedBox(
      width: compact ? double.infinity : 220,
      child: TextField(
        onChanged: onQueryChanged,
        style: TextStyle(color: palette.text, fontWeight: FontWeight.w700),
        decoration: InputDecoration(
          isDense: true,
          hintText: 'Search ticker',
          hintStyle: TextStyle(color: palette.muted),
          prefixIcon: Icon(Icons.search_rounded, color: palette.muted),
          filled: true,
          fillColor: palette.card,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 11,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: palette.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: palette.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: palette.accent),
          ),
        ),
      ),
    );

    final filters = Wrap(
      spacing: 10,
      runSpacing: 10,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        DividendDropdown(
          value: statusFilter,
          items: const {
            'all': 'Status',
            'paid': 'Paid',
            'declared': 'Declared',
            'estimated': 'Estimated',
          },
          palette: palette,
          onChanged: onStatusChanged,
        ),
        DividendDropdown(
          value: dateMode,
          items: const {
            'auto': 'Payout type',
            'pay': 'Pay date',
            'ex': 'Ex-date',
          },
          palette: palette,
          onChanged: onDateModeChanged,
        ),
      ],
    );

    if (compact) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          rangeControls,
          const SizedBox(height: 10),
          search,
          const SizedBox(height: 10),
          filters,
        ],
      );
    }
    return Row(
      children: [
        rangeControls,
        const Spacer(),
        search,
        const SizedBox(width: 10),
        filters,
      ],
    );
  }
}

class DividendWindowSelector extends StatelessWidget {
  const DividendWindowSelector({
    super.key,
    required this.value,
    required this.palette,
    required this.onChanged,
  });

  final String value;
  final Palette palette;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 760;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Wrap(
        spacing: 4,
        runSpacing: 4,
        children: dividendCalendarWindowOptions.map((option) {
          final selected = value == option.key;
          return InkWell(
            onTap: () => onChanged(option.key),
            borderRadius: BorderRadius.circular(999),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              padding: EdgeInsets.symmetric(
                horizontal: compact ? 12 : 16,
                vertical: 8,
              ),
              decoration: BoxDecoration(
                color: selected
                    ? palette.text.withValues(alpha: .92)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                option.label,
                style: TextStyle(
                  color: selected ? palette.background : palette.muted,
                  fontWeight: FontWeight.w900,
                  fontSize: compact ? 12 : 13,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class DividendDropdown extends StatelessWidget {
  const DividendDropdown({
    super.key,
    required this.value,
    required this.items,
    required this.palette,
    required this.onChanged,
  });

  final String value;
  final Map<String, String> items;
  final Palette palette;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          dropdownColor: palette.card,
          iconEnabledColor: palette.muted,
          style: TextStyle(color: palette.text, fontWeight: FontWeight.w800),
          items: [
            for (final entry in items.entries)
              DropdownMenuItem(value: entry.key, child: Text(entry.value)),
          ],
          onChanged: (next) {
            if (next != null) onChanged(next);
          },
        ),
      ),
    );
  }
}

class DividendIncomeSummaryCard extends StatelessWidget {
  const DividendIncomeSummaryCard({
    super.key,
    required this.annualIncome,
    required this.monthlyIncome,
    required this.dailyIncome,
    required this.yield,
    required this.currency,
    required this.palette,
  });

  final double annualIncome;
  final double monthlyIncome;
  final double dailyIncome;
  final double yield;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 236),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Column(
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Annual income',
                      style: TextStyle(
                        color: palette.text.withValues(alpha: .82),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(
                      Icons.open_in_new_rounded,
                      color: palette.muted,
                      size: 12,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  formatDividendMoney(annualIncome, currency),
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                    fontSize: 28,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: palette.background.withValues(alpha: .34),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              children: [
                DividendSummaryStat(
                  icon: Icons.bar_chart_rounded,
                  label: 'Monthly',
                  value: formatDividendMoney(monthlyIncome, currency),
                  palette: palette,
                ),
                const SizedBox(height: 14),
                DividendSummaryStat(
                  icon: Icons.wb_twilight_rounded,
                  label: 'Daily',
                  value: formatDividendMoney(dailyIncome, currency),
                  palette: palette,
                ),
                const SizedBox(height: 14),
                DividendSummaryStat(
                  icon: Icons.percent_rounded,
                  label: 'Yield',
                  value: formatReturn(yield).replaceFirst('+', ''),
                  palette: palette,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class DividendSummaryStat extends StatelessWidget {
  const DividendSummaryStat({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.palette,
  });

  final IconData icon;
  final String label;
  final String value;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: const Color(0xFF54B8F6), size: 18),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: palette.text.withValues(alpha: .68),
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        Text(
          value,
          style: TextStyle(color: palette.text, fontWeight: FontWeight.w900),
        ),
      ],
    );
  }
}

class DividendMonthlyChartCard extends StatelessWidget {
  const DividendMonthlyChartCard({
    super.key,
    required this.buckets,
    required this.comparisonBuckets,
    required this.comparisonYears,
    required this.currency,
    required this.palette,
  });

  final List<DividendMonthBucket> buckets;
  final List<DividendYearComparisonBucket> comparisonBuckets;
  final List<int> comparisonYears;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final hasComparison = comparisonBuckets.isNotEmpty;
    return Container(
      constraints: const BoxConstraints(minHeight: 236),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 12),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        children: [
          SizedBox(
            height: 190,
            child: hasComparison
                ? PortfolioDividendYearComparisonChart(
                    buckets: comparisonBuckets,
                    years: comparisonYears,
                    currency: currency,
                    palette: palette,
                  )
                : PortfolioDividendBarChart(
                    buckets: buckets,
                    currency: currency,
                    palette: palette,
                  ),
          ),
          const SizedBox(height: 10),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 14,
            runSpacing: 8,
            children: hasComparison
                ? [
                    DividendLegendDot(
                      '2025 paid history',
                      dividend2025Color,
                      palette,
                    ),
                    DividendLegendDot(
                      '2026 paid + forecast',
                      dividend2026Color,
                      palette,
                    ),
                  ]
                : [
                    DividendLegendDot('Paid', dividendPaidColor, palette),
                    DividendLegendDot(
                      'Declared',
                      dividendDeclaredColor,
                      palette,
                    ),
                    DividendLegendDot(
                      'Estimated',
                      dividendEstimatedColor,
                      palette,
                    ),
                  ],
          ),
        ],
      ),
    );
  }
}

class DividendLegendDot extends StatelessWidget {
  const DividendLegendDot(this.label, this.color, this.palette, {super.key});

  final String label;
  final Color color;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: TextStyle(color: palette.muted, fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

class PortfolioDividendBarChart extends StatelessWidget {
  const PortfolioDividendBarChart({
    super.key,
    required this.buckets,
    required this.currency,
    required this.palette,
  });

  final List<DividendMonthBucket> buckets;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final maxTotal = buckets.fold<double>(
      0,
      (maxValue, bucket) => math.max(maxValue, bucket.total),
    );
    if (maxTotal <= 0) {
      return EmptyState(
        text: 'No payout bars for this window.',
        palette: palette,
      );
    }
    return CustomPaint(
      painter: DividendGridPainter(palette: palette),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final chartHeight = math.max(120.0, constraints.maxHeight - 42);
          final compact = constraints.maxWidth < 620;
          final shownBuckets = compact
              ? buckets.where((bucket) => bucket.total > 0).take(6).toList()
              : buckets;
          final visibleBuckets = shownBuckets.isEmpty
              ? buckets.take(compact ? 6 : buckets.length).toList()
              : shownBuckets;
          return Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final bucket in visibleBuckets)
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: compact ? 4 : 8,
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          SizedBox(
                            height: 22,
                            child: bucket.total > 0
                                ? Text(
                                    formatDividendMoney(
                                      bucket.total,
                                      currency,
                                      compact: true,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: palette.muted,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  )
                                : const SizedBox.shrink(),
                          ),
                          SizedBox(
                            height: chartHeight,
                            child: Align(
                              alignment: Alignment.bottomCenter,
                              child: Tooltip(
                                message: bucket.tooltip(currency),
                                child: DividendStackedBar(
                                  bucket: bucket,
                                  maxTotal: maxTotal,
                                  chartHeight: chartHeight,
                                  palette: palette,
                                ),
                              ),
                            ),
                          ),
                          Text(
                            bucket.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class PortfolioDividendYearComparisonChart extends StatelessWidget {
  const PortfolioDividendYearComparisonChart({
    super.key,
    required this.buckets,
    required this.years,
    required this.currency,
    required this.palette,
  });

  final List<DividendYearComparisonBucket> buckets;
  final List<int> years;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final maxTotal = buckets.fold<double>(
      0,
      (maxValue, bucket) => math.max(maxValue, bucket.maxTotal),
    );
    if (maxTotal <= 0) {
      return EmptyState(
        text: 'No 2025/2026 dividend history for this filter.',
        palette: palette,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 760;
        final chartWidth = compact ? 780.0 : constraints.maxWidth;
        return ScrollConfiguration(
          behavior: const ScrollBehavior().copyWith(scrollbars: false),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: chartWidth,
              child: CustomPaint(
                painter: DividendGridPainter(palette: palette),
                child: Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final bucket in buckets)
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                SizedBox(
                                  height: 24,
                                  child: Text(
                                    bucket.topLabel(currency),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: palette.muted,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                                SizedBox(
                                  height: math.max(
                                    120.0,
                                    constraints.maxHeight - 44,
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      for (final year in years) ...[
                                        DividendYearBar(
                                          bucket: bucket.bucketForYear(year),
                                          year: year,
                                          maxTotal: maxTotal,
                                          chartHeight: math.max(
                                            120.0,
                                            constraints.maxHeight - 44,
                                          ),
                                          currency: currency,
                                          palette: palette,
                                        ),
                                        if (year != years.last)
                                          const SizedBox(width: 5),
                                      ],
                                    ],
                                  ),
                                ),
                                Text(
                                  monthNamesShort[bucket.month - 1],
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: palette.muted,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class DividendYearBar extends StatelessWidget {
  const DividendYearBar({
    super.key,
    required this.bucket,
    required this.year,
    required this.maxTotal,
    required this.chartHeight,
    required this.currency,
    required this.palette,
  });

  final DividendMonthBucket bucket;
  final int year;
  final double maxTotal;
  final double chartHeight;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final color = dividendYearColor(year);
    final total = bucket.total;
    final height = total <= 0 || maxTotal <= 0
        ? 2.0
        : math.max(5.0, chartHeight * .82 * total / maxTotal);
    final width = MediaQuery.sizeOf(context).width < 760 ? 22.0 : 28.0;
    final bar = Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: total > 0 ? color : palette.border.withValues(alpha: .8),
        borderRadius: BorderRadius.circular(7),
        border: total > 0
            ? Border.all(color: color.withValues(alpha: .26))
            : null,
      ),
    );
    return Tooltip(
      message: bucket.tooltip(currency, titleYear: year),
      child: bar,
    );
  }
}

class DividendStackedBar extends StatelessWidget {
  const DividendStackedBar({
    super.key,
    required this.bucket,
    required this.maxTotal,
    required this.chartHeight,
    required this.palette,
  });

  final DividendMonthBucket bucket;
  final double maxTotal;
  final double chartHeight;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final height = bucket.total <= 0 || maxTotal <= 0
        ? 2.0
        : math.max(4.0, chartHeight * .82 * bucket.total / maxTotal);
    final width = MediaQuery.sizeOf(context).width < 760 ? 26.0 : 34.0;
    if (bucket.total <= 0) {
      return Container(
        width: width,
        height: 2,
        decoration: BoxDecoration(
          color: palette.border,
          borderRadius: BorderRadius.circular(8),
        ),
      );
    }
    double segmentHeight(double value) =>
        bucket.total <= 0 ? 0 : math.max(0, height * value / bucket.total);
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: SizedBox(
        width: width,
        height: height,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            DividendBarSegment(
              height: segmentHeight(bucket.estimated),
              color: dividendEstimatedColor,
            ),
            DividendBarSegment(
              height: segmentHeight(bucket.declared),
              color: dividendDeclaredColor,
            ),
            DividendBarSegment(
              height: segmentHeight(bucket.paid),
              color: dividendPaidColor,
            ),
          ],
        ),
      ),
    );
  }
}

class DividendBarSegment extends StatelessWidget {
  const DividendBarSegment({
    super.key,
    required this.height,
    required this.color,
  });

  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) {
    if (height <= 0) return const SizedBox.shrink();
    return Container(width: double.infinity, height: height, color: color);
  }
}

class DividendGridPainter extends CustomPainter {
  DividendGridPainter({required this.palette});

  final Palette palette;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = palette.muted.withValues(alpha: .18)
      ..strokeWidth = 1;
    for (var i = 1; i <= 4; i += 1) {
      final y = size.height * i / 5;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant DividendGridPainter oldDelegate) =>
      oldDelegate.palette != palette;
}

class DividendViewToggle extends StatelessWidget {
  const DividendViewToggle({
    super.key,
    required this.calendarView,
    required this.palette,
    required this.onChanged,
  });

  final bool calendarView;
  final Palette palette;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
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
          DividendToggleButton(
            active: calendarView,
            icon: Icons.calendar_month_rounded,
            label: 'Calendar',
            palette: palette,
            onTap: () => onChanged(true),
          ),
          DividendToggleButton(
            active: !calendarView,
            icon: Icons.list_rounded,
            label: 'List',
            palette: palette,
            onTap: () => onChanged(false),
          ),
        ],
      ),
    );
  }
}

class DividendToggleButton extends StatelessWidget {
  const DividendToggleButton({
    super.key,
    required this.active,
    required this.icon,
    required this.label,
    required this.palette,
    required this.onTap,
  });

  final bool active;
  final IconData icon;
  final String label;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? palette.text : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 16,
              color: active ? palette.background : palette.muted,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: active ? palette.background : palette.muted,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class DividendEmptyMonthNotice extends StatelessWidget {
  const DividendEmptyMonthNotice({
    super.key,
    required this.monthStart,
    required this.nextMonth,
    required this.palette,
    required this.onJumpToNext,
  });

  final DateTime monthStart;
  final DateTime? nextMonth;
  final Palette palette;
  final VoidCallback? onJumpToNext;

  @override
  Widget build(BuildContext context) {
    final next = nextMonth;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          Icon(Icons.calendar_month_rounded, color: palette.muted, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '${dividendWindowTitle(monthStart)} has no dividend events.',
              style: TextStyle(
                color: palette.muted,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          if (next != null)
            TextButton.icon(
              onPressed: onJumpToNext,
              icon: const Icon(Icons.arrow_forward_rounded, size: 16),
              label: Text('Next: ${dividendWindowTitle(next)}'),
              style: TextButton.styleFrom(
                foregroundColor: palette.accent,
                textStyle: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
        ],
      ),
    );
  }
}

class DividendMonthCalendarGrid extends StatelessWidget {
  const DividendMonthCalendarGrid({
    super.key,
    required this.monthStart,
    required this.events,
    required this.currency,
    required this.portfolioValue,
    required this.palette,
  });

  final DateTime monthStart;
  final List<DividendDisplayEvent> events;
  final String currency;
  final double portfolioValue;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final start = DateTime(monthStart.year, monthStart.month, 1);
    final today = DateTime.now();
    final normalizedToday = DateTime(today.year, today.month, today.day);
    final eventsByDay = <int, List<DividendDisplayEvent>>{};
    for (final event in events) {
      eventsByDay.putIfAbsent(event.date.day, () => []).add(event);
    }
    for (final dayEvents in eventsByDay.values) {
      dayEvents.sort(
        (left, right) => right.payoutBase.compareTo(left.payoutBase),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 760;
        if (compact) {
          return DividendMonthAgenda(
            monthStart: start,
            eventsByDay: eventsByDay,
            currency: currency,
            portfolioValue: portfolioValue,
            palette: palette,
          );
        }

        final leadingBlanks = start.weekday % 7;
        final dayCount = DateTime(start.year, start.month + 1, 0).day;
        final rowCount = ((leadingBlanks + dayCount) / 7).ceil();
        final cellHeight = constraints.maxWidth >= 1180 ? 132.0 : 120.0;
        final cells = rowCount * 7;

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
          decoration: BoxDecoration(
            color: palette.card.withValues(alpha: .72),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: palette.border),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  for (final dayName in dividendWeekdayLabels)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          dayName,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: palette.muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Column(
                  children: [
                    for (var row = 0; row < rowCount; row += 1)
                      Row(
                        children: [
                          for (var column = 0; column < 7; column += 1)
                            Expanded(
                              child: Builder(
                                builder: (context) {
                                  final index = row * 7 + column;
                                  final day = index - leadingBlanks + 1;
                                  final inMonth = day >= 1 && day <= dayCount;
                                  final date = inMonth
                                      ? DateTime(start.year, start.month, day)
                                      : null;
                                  return DividendCalendarDayCell(
                                    height: cellHeight,
                                    day: inMonth ? day : null,
                                    date: date,
                                    events: inMonth
                                        ? eventsByDay[day] ??
                                              const <DividendDisplayEvent>[]
                                        : const <DividendDisplayEvent>[],
                                    currency: currency,
                                    portfolioValue: portfolioValue,
                                    palette: palette,
                                    isToday: date == normalizedToday,
                                    showRightBorder: column < 6,
                                    showBottomBorder: index < cells - 7,
                                  );
                                },
                              ),
                            ),
                        ],
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class DividendCalendarDayCell extends StatelessWidget {
  const DividendCalendarDayCell({
    super.key,
    required this.height,
    required this.day,
    required this.date,
    required this.events,
    required this.currency,
    required this.portfolioValue,
    required this.palette,
    required this.isToday,
    required this.showRightBorder,
    required this.showBottomBorder,
  });

  final double height;
  final int? day;
  final DateTime? date;
  final List<DividendDisplayEvent> events;
  final String currency;
  final double portfolioValue;
  final Palette palette;
  final bool isToday;
  final bool showRightBorder;
  final bool showBottomBorder;

  @override
  Widget build(BuildContext context) {
    final inMonth = day != null && date != null;
    final total = events.fold<double>(
      0,
      (sum, event) => sum + event.payoutBase.abs(),
    );
    final dayColor = inMonth
        ? palette.text.withValues(alpha: .78)
        : palette.faint.withValues(alpha: .22);

    return Container(
      height: height,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: inMonth
            ? Colors.transparent
            : palette.muted.withValues(alpha: .09),
        border: Border(
          right: showRightBorder
              ? BorderSide(color: palette.border.withValues(alpha: .8))
              : BorderSide.none,
          bottom: showBottomBorder
              ? BorderSide(color: palette.border.withValues(alpha: .8))
              : BorderSide.none,
        ),
      ),
      child: inMonth
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (isToday)
                      Container(
                        width: 24,
                        height: 24,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: dividendDeclaredColor,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '$day',
                          style: TextStyle(
                            color: palette.text,
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      )
                    else
                      Text(
                        '$day',
                        style: TextStyle(
                          color: dayColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    const Spacer(),
                    if (total > 0)
                      Text(
                        '+${formatDividendMoney(total, currency, compact: true)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.positive,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                for (final event in events.take(1)) ...[
                  DividendCalendarEventChip(
                    event: event,
                    portfolioValue: portfolioValue,
                    palette: palette,
                  ),
                  const SizedBox(height: 6),
                ],
                if (events.length > 1)
                  Text(
                    '+${events.length - 1} more',
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
              ],
            )
          : const SizedBox.shrink(),
    );
  }
}

class DividendCalendarEventChip extends StatelessWidget {
  const DividendCalendarEventChip({
    super.key,
    required this.event,
    required this.portfolioValue,
    required this.palette,
  });

  final DividendDisplayEvent event;
  final double portfolioValue;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final statusColor = switch (event.status) {
      'paid' => dividendPaidColor,
      'declared' => dividendDeclaredColor,
      _ => dividendEstimatedColor,
    };
    final weight = portfolioValue > 0
        ? event.payoutBase.abs() / portfolioValue
        : 0.0;
    final tooltip = [
      '${event.ticker} ${event.statusLabel}',
      'Date: ${formatDate(event.isoDate)}',
      'Payout: ${formatDividendMoney(event.payout.abs(), event.currency)}',
      if (event.hasCurrencyConversion)
        'Base: ${formatDividendMoney(event.payoutBase.abs(), event.displayCurrency)} (${event.currency} x ${event.fxRateToBase.toStringAsFixed(4)})',
      if (event.quantity > 0) 'Shares: ${formatNumber(event.quantity)}',
    ].join('\n');

    return Tooltip(
      message: tooltip,
      child: Container(
        height: 50,
        decoration: BoxDecoration(
          color: palette.background.withValues(alpha: .42),
          borderRadius: BorderRadius.circular(7),
          border: Border.all(color: statusColor.withValues(alpha: .28)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              child: Container(width: 3, color: statusColor),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
              child: Column(
                children: [
                  Row(
                    children: [
                      PortfolioHoldingLogo(
                        row: event.logoRow,
                        palette: palette,
                        size: 22,
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          '${event.ticker} ${compactName(event.name)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.text.withValues(alpha: .9),
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  Row(
                    children: [
                      Text(
                        formatDividendMoney(
                          event.payoutBase.abs(),
                          event.displayCurrency,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: statusColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          formatReturn(weight).replaceFirst('+', ''),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class DividendMonthAgenda extends StatelessWidget {
  const DividendMonthAgenda({
    super.key,
    required this.monthStart,
    required this.eventsByDay,
    required this.currency,
    required this.portfolioValue,
    required this.palette,
  });

  final DateTime monthStart;
  final Map<int, List<DividendDisplayEvent>> eventsByDay;
  final String currency;
  final double portfolioValue;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final days = eventsByDay.keys.toList()..sort();
    if (days.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: palette.border),
        ),
        child: EmptyState(
          text: 'No dividend events in ${dividendWindowTitle(monthStart)}.',
          palette: palette,
        ),
      );
    }
    return Column(
      children: [
        for (final day in days)
          DividendAgendaDayCard(
            date: DateTime(monthStart.year, monthStart.month, day),
            events: eventsByDay[day] ?? const <DividendDisplayEvent>[],
            currency: currency,
            portfolioValue: portfolioValue,
            palette: palette,
          ),
      ],
    );
  }
}

class DividendAgendaDayCard extends StatelessWidget {
  const DividendAgendaDayCard({
    super.key,
    required this.date,
    required this.events,
    required this.currency,
    required this.portfolioValue,
    required this.palette,
  });

  final DateTime date;
  final List<DividendDisplayEvent> events;
  final String currency;
  final double portfolioValue;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final isoDate =
        '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    final total = events.fold<double>(
      0,
      (sum, event) => sum + event.payoutBase.abs(),
    );
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: dividendDeclaredColor.withValues(alpha: .16),
                  shape: BoxShape.circle,
                ),
                child: Text(
                  '${date.day}',
                  style: TextStyle(
                    color: dividendDeclaredColor,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  formatDate(isoDate),
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Text(
                '+${formatDividendMoney(total, currency)}',
                style: TextStyle(
                  color: palette.positive,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final event in events)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: DividendCalendarEventChip(
                event: event,
                portfolioValue: portfolioValue,
                palette: palette,
              ),
            ),
        ],
      ),
    );
  }
}

class DividendCalendarEventGroups extends StatelessWidget {
  const DividendCalendarEventGroups({
    super.key,
    required this.events,
    required this.currency,
    required this.palette,
  });

  final List<DividendDisplayEvent> events;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final byDate = <String, List<DividendDisplayEvent>>{};
    for (final event in events) {
      byDate.putIfAbsent(event.isoDate, () => []).add(event);
    }
    final entries = byDate.entries.take(10).toList();
    return Column(
      children: [
        for (final entry in entries)
          DividendDateGroupCard(
            date: entry.key,
            events: entry.value,
            currency: currency,
            palette: palette,
          ),
      ],
    );
  }
}

class DividendDateGroupCard extends StatelessWidget {
  const DividendDateGroupCard({
    super.key,
    required this.date,
    required this.events,
    required this.currency,
    required this.palette,
  });

  final String date;
  final List<DividendDisplayEvent> events;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final total = events.fold<double>(
      0,
      (sum, event) => sum + event.payoutBase.abs(),
    );
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Icon(
                Icons.calendar_today_rounded,
                color: palette.accent,
                size: 18,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  formatDate(date),
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: palette.positive.withValues(alpha: .14),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '+${formatDividendMoney(total, currency)}',
                  style: TextStyle(
                    color: palette.positive,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final event in events.take(5))
            DividendEventRow(event: event, palette: palette),
        ],
      ),
    );
  }
}

class DividendEventList extends StatelessWidget {
  const DividendEventList({
    super.key,
    required this.events,
    required this.currency,
    required this.palette,
  });

  final List<DividendDisplayEvent> events;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        children: [
          for (final event in events.take(18))
            DividendEventRow(event: event, palette: palette),
        ],
      ),
    );
  }
}

class DividendEventRow extends StatelessWidget {
  const DividendEventRow({
    super.key,
    required this.event,
    required this.palette,
  });

  final DividendDisplayEvent event;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    final statusColor = switch (event.status) {
      'paid' => dividendPaidColor,
      'declared' => dividendDeclaredColor,
      _ => dividendEstimatedColor,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          PortfolioHoldingLogo(row: event.logoRow, palette: palette, size: 28),
          const SizedBox(width: 10),
          SizedBox(
            width: compact ? 86 : 128,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.ticker,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  event.statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Text(
              compact ? formatDate(event.isoDate) : event.subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatDividendMoney(event.payout.abs(), event.currency),
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (!compact && event.hasCurrencyConversion)
                Text(
                  '${formatDividendMoney(event.payoutBase.abs(), event.displayCurrency)} base',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              if (!compact && event.quantity > 0)
                Text(
                  '${formatDividendMoney(event.amount.abs(), event.currency)} / sh',
                  style: TextStyle(color: palette.muted, fontSize: 11),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

const dividend2025Color = Color(0xFF8D6AF4);
const dividend2026Color = Color(0xFF54B8F6);
const dividendPaidColor = dividend2025Color;
const dividendDeclaredColor = Color(0xFF54B8F6);
const dividendEstimatedColor = Color(0xFF3F7EAA);

Color dividendYearColor(int year) => year == 2025
    ? dividend2025Color
    : year == 2026
    ? dividend2026Color
    : dividendEstimatedColor;

class DividendCalendarWindowOption {
  const DividendCalendarWindowOption(this.key, this.label);

  final String key;
  final String label;
}

class DividendCalendarWindow {
  const DividendCalendarWindow({
    required this.key,
    required this.label,
    required this.start,
    required this.end,
  });

  final String key;
  final String label;
  final DateTime start;
  final DateTime end;
}

const dividendCalendarWindowOptions = [
  DividendCalendarWindowOption('2025', '2025'),
  DividendCalendarWindowOption('2026', '2026'),
  DividendCalendarWindowOption('forward', 'One year ahead'),
];

DividendCalendarWindow dividendCalendarWindowForKey(
  String key,
  DateTime today,
) {
  final normalizedToday = DateTime(today.year, today.month, today.day);
  if (key == '2025' || key == '2026') {
    final year = int.parse(key);
    return DividendCalendarWindow(
      key: key,
      label: key,
      start: DateTime(year, 1, 1),
      end: DateTime(year, 12, 31),
    );
  }
  final start = DateTime(normalizedToday.year, normalizedToday.month, 1);
  return DividendCalendarWindow(
    key: 'forward',
    label: 'One year ahead',
    start: start,
    end: DateTime(start.year, start.month + 12, 0),
  );
}

class DividendDisplayEvent {
  DividendDisplayEvent({
    required this.ticker,
    required this.name,
    required this.date,
    required this.amount,
    required this.payout,
    required this.payoutBase,
    required this.quantity,
    required this.currency,
    required this.displayCurrency,
    required this.fxRateToBase,
    required this.status,
    required this.type,
    required this.logoUrl,
    required this.sourceLabel,
  });

  final String ticker;
  final String name;
  final DateTime date;
  final double amount;
  final double payout;
  final double payoutBase;
  final double quantity;
  final String currency;
  final String displayCurrency;
  final double fxRateToBase;
  final String status;
  final String type;
  final String logoUrl;
  final String sourceLabel;

  bool get hasCurrencyConversion =>
      normalizeDividendCurrency(currency) !=
      normalizeDividendCurrency(displayCurrency);

  String get isoDate =>
      '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  String get statusLabel => switch (status) {
    'paid' => 'Paid',
    'declared' => 'Declared',
    _ => 'Estimated',
  };

  String get subtitle {
    final quantityText = quantity > 0
        ? ' · ${formatNumber(quantity)} shares'
        : '';
    return '${compactName(name)} · ${formatDate(isoDate)}$quantityText';
  }

  Map<String, dynamic> get logoRow => {
    'ticker': ticker,
    'name': name,
    'logoUrl': logoUrl,
  };
}

class DividendMonthBucket {
  DividendMonthBucket(this.monthStart);

  final DateTime monthStart;
  final events = <DividendDisplayEvent>[];

  String get label => monthNamesShort[monthStart.month - 1];
  double get paid => _sum('paid');
  double get declared => _sum('declared');
  double get estimated => _sum('estimated');
  double get total =>
      events.fold<double>(0, (sum, event) => sum + event.payoutBase.abs());

  void add(DividendDisplayEvent event) => events.add(event);

  double _sum(String status) => events
      .where((event) => event.status == status)
      .fold<double>(0, (sum, event) => sum + event.payoutBase.abs());

  String tooltip(String currency, {int? titleYear}) {
    final byTicker = <String, double>{};
    for (final event in events) {
      byTicker[event.ticker] =
          (byTicker[event.ticker] ?? 0) + event.payoutBase.abs();
    }
    final contributors = byTicker.entries.toList()
      ..sort((left, right) => right.value.compareTo(left.value));
    final topContributors = contributors.take(6).map((entry) {
      return '${entry.key}: ${formatDividendMoney(entry.value, currency)}';
    });
    final title = titleYear == null
        ? monthNamesShort[monthStart.month - 1]
        : '${monthNamesShort[monthStart.month - 1]} $titleYear';
    return [
      '$title: ${formatDividendMoney(total, currency)}',
      'Paid: ${formatDividendMoney(paid, currency)}',
      'Declared: ${formatDividendMoney(declared, currency)}',
      'Estimated: ${formatDividendMoney(estimated, currency)}',
      if (contributors.isNotEmpty) 'Holdings:',
      ...topContributors,
      if (contributors.length > 6) '+${contributors.length - 6} more',
    ].join('\n');
  }
}

class DividendYearComparisonBucket {
  DividendYearComparisonBucket({required this.month, required List<int> years})
    : _byYear = {
        for (final year in years)
          year: DividendMonthBucket(DateTime(year, month, 1)),
      };

  final int month;
  final Map<int, DividendMonthBucket> _byYear;

  double get maxTotal => _byYear.values.fold<double>(
    0,
    (maxValue, bucket) => math.max(maxValue, bucket.total),
  );

  DividendMonthBucket bucketForYear(int year) =>
      _byYear[year] ?? DividendMonthBucket(DateTime(year, month, 1));

  void add(DividendDisplayEvent event) =>
      bucketForYear(event.date.year).add(event);

  String topLabel(String currency) {
    if (maxTotal <= 0) return '';
    return formatDividendMoney(maxTotal, currency, compact: true);
  }
}

List<DividendYearComparisonBucket> dividendYearComparisonBuckets(
  List<int> years,
  List<DividendDisplayEvent> events,
) {
  final normalizedYears = years.toSet();
  final buckets = [
    for (var month = 1; month <= 12; month += 1)
      DividendYearComparisonBucket(month: month, years: years),
  ];
  for (final event in events) {
    if (!normalizedYears.contains(event.date.year)) continue;
    buckets[event.date.month - 1].add(event);
  }
  return buckets;
}

const monthNamesShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const dividendWeekdayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

double dividendHoldingShareQuantity(Map<String, dynamic> holding) {
  final ticker = text(holding['ticker']).toUpperCase();
  final quantity =
      firstNumber([
        holding['quantity'],
        holding['shares'],
        holding['units'],
        holding['position'],
      ]) ??
      0;
  final rawPrice =
      firstNumber([
        holding['price'],
        holding['holdingPrice'],
        holding['markPrice'],
        holding['closePrice'],
        holding['reportDatePrice'],
      ]) ??
      0;
  final currency = normalizeDividendCurrency(text(holding['currency'], 'USD'));
  final fxRateToBase = math.max(
    .000001,
    firstNumber([holding['fxRateToBase'], holding['fxRate']]) ?? 1,
  );
  final value =
      firstNumber([
        holding['value'],
        holding['holdingValue'],
        holding['marketValue'],
        holding['positionValue'],
        holding['currentValue'],
      ]) ??
      0;
  var price = rawPrice;
  if (currency == 'GBP' && rawPrice > 100) {
    final pencePrice = rawPrice / 100;
    final canCompareValue = quantity > 0 && value > 0;
    if (canCompareValue) {
      final rawError =
          (quantity * rawPrice * fxRateToBase - value).abs() /
          math.max(1, value.abs());
      final penceError =
          (quantity * pencePrice * fxRateToBase - value).abs() /
          math.max(1, value.abs());
      if (penceError < rawError && (penceError < .35 || rawError > .5)) {
        price = pencePrice;
      }
    } else if (dividendTickerLooksLondon(ticker) && rawPrice >= 1000) {
      price = pencePrice;
    }
  }
  if (price <= 0 || value <= 0) return math.max(0, quantity);
  final priceInBase = price * fxRateToBase;
  final impliedQuantity = value / priceInBase;
  if (quantity <= 0) return math.max(0, impliedQuantity);
  final valueFromQuantity = quantity * priceInBase;
  final relativeValueError =
      (valueFromQuantity - value).abs() / math.max(1, value.abs());
  final quantityLooksLikeMarketValue =
      price > 1.01 &&
      value > 100 &&
      (quantity - value).abs() / math.max(1, value.abs()) < .03;
  final quantityIsImplausiblyHigh =
      price > 1.01 && quantity > impliedQuantity * 20;
  if (quantityLooksLikeMarketValue ||
      quantityIsImplausiblyHigh ||
      relativeValueError > .5) {
    return math.max(0, impliedQuantity);
  }
  return math.max(0, quantity);
}

bool dividendEventUsesPerShareAmount(
  Map<String, dynamic> event,
  String source,
) {
  final amountKind =
      '${text(event['amountKind'])} ${text(asMap(event['payload'])['amountKind'])}'
          .toLowerCase()
          .replaceAll('-', '_');
  if (amountKind.contains('total') ||
      amountKind.contains('cash') ||
      text(event['perShare']).toLowerCase() == 'false') {
    return false;
  }
  if (amountKind.contains('per_share') || truthy(event['perShare'])) {
    return true;
  }
  final status = text(event['status']).toLowerCase();
  return source.contains('yahoo') ||
      source.contains('nasdaq') ||
      source.contains('estimate') ||
      source.contains('calendar') ||
      status == 'estimated';
}

bool dividendCurrencyLooksPence(String currency) {
  final raw = currency.trim();
  final compact = raw.replaceAll(RegExp('[^A-Za-z]'), '').toUpperCase();
  return raw == 'GBp' ||
      compact == 'GBX' ||
      compact == 'GBPENCE' ||
      compact == 'PENCE' ||
      compact == 'PENNY';
}

bool dividendTickerLooksLondon(String ticker) {
  final normalized = ticker.toUpperCase();
  return normalized == 'AZN' ||
      normalized == 'LSEG' ||
      normalized == 'LSEGL' ||
      normalized == 'AZNL' ||
      normalized.endsWith('.L');
}

bool dividendAmountLooksPence({
  required String ticker,
  required String currency,
  required String source,
  required double amount,
}) {
  if (!amount.isFinite || amount.abs() < 5) return false;
  final sourceText = source.toLowerCase();
  final marketDataPenceSource =
      sourceText.contains('yahoo') ||
      sourceText.contains('lseg') ||
      sourceText.contains('market') ||
      sourceText.contains('history');
  return dividendCurrencyLooksPence(currency) ||
      ((dividendTickerLooksLondon(ticker) || sourceText.contains('london')) &&
          currency.toUpperCase() == 'GBP' &&
          marketDataPenceSource);
}

String normalizeDividendCurrency(String currency, [String fallback = 'USD']) {
  final raw = text(currency, fallback).trim();
  final compact = raw.replaceAll(RegExp('[^A-Za-z]'), '').toUpperCase();
  if (compact == 'GBX' ||
      compact == 'GBPENCE' ||
      compact == 'PENCE' ||
      compact == 'PENNY' ||
      raw == 'GBp') {
    return 'GBP';
  }
  return compact.isEmpty ? fallback.toUpperCase() : compact;
}

double fallbackDividendFxRate(String fromCurrency, String toCurrency) {
  final from = normalizeDividendCurrency(fromCurrency);
  final to = normalizeDividendCurrency(toCurrency);
  if (from == to) return 1;
  const usdRates = {
    'USD': 1.0,
    'GBP': 1.27,
    'EUR': 1.08,
    'CAD': .73,
    'JPY': .0064,
    'HKD': .128,
    'CHF': 1.12,
    'AUD': .66,
    'SGD': .74,
    'TWD': .031,
  };
  final fromUsd = usdRates[from];
  final toUsd = usdRates[to];
  if (fromUsd == null || toUsd == null || toUsd <= 0) return 1;
  return fromUsd / toUsd;
}

double dividendFxRateToBase({
  required Map<String, dynamic> event,
  required Map<String, dynamic> holding,
  required String currency,
  required String baseCurrency,
}) {
  final from = normalizeDividendCurrency(currency);
  final to = normalizeDividendCurrency(baseCurrency);
  if (from == to) return 1;
  final payload = asMap(event['payload']);
  final explicitRate = firstNumber([
    event['fxRateToBase'],
    event['fxRate'],
    payload['fxRateToBase'],
    payload['fxRate'],
    holding['fxRateToBase'],
    holding['fxRate'],
  ]);
  if (explicitRate != null &&
      explicitRate > 0 &&
      (explicitRate - 1).abs() > .0001) {
    return explicitRate;
  }
  return fallbackDividendFxRate(from, to);
}

List<DividendDisplayEvent> normalizeDividendDisplayEvents(
  List<Map<String, dynamic>> dividends,
  List<Map<String, dynamic>> holdings, {
  required String dateMode,
  required String baseCurrency,
}) {
  final holdingsByTicker = <String, Map<String, dynamic>>{};
  final quantityByTicker = <String, double>{};
  for (final holding in holdings) {
    final ticker = text(holding['ticker']).toUpperCase();
    if (ticker.isEmpty) continue;
    final assetClass =
        '${text(holding['sector'])} ${text(holding['assetCategory'])} ${text(holding['type'])}'
            .toLowerCase();
    if (assetClass.contains('option') ||
        assetClass == 'opt' ||
        assetClass.contains('future') ||
        assetClass.contains('cash')) {
      continue;
    }
    final shareQuantity = dividendHoldingShareQuantity(holding);
    if (shareQuantity <= 0) continue;
    holdingsByTicker.putIfAbsent(ticker, () => holding);
    quantityByTicker[ticker] = (quantityByTicker[ticker] ?? 0) + shareQuantity;
  }

  final events = <DividendDisplayEvent>[];
  for (final event in dividends) {
    final ticker = text(event['ticker']).toUpperCase();
    if (ticker.isEmpty) continue;
    final dateText = dividendEventDateForMode(event, dateMode);
    final date = parseDividendDate(dateText);
    if (date == null) continue;
    final source = '${text(event['source'])} ${text(event['sourceLabel'])}'
        .toLowerCase();
    final rawCurrency = text(event['currency'], 'USD');
    final rawAmount = number(event['amount']);
    if (rawAmount == 0) continue;
    final shouldNormalizePence = dividendAmountLooksPence(
      ticker: ticker,
      currency: rawCurrency,
      source: source,
      amount: rawAmount,
    );
    final amount = shouldNormalizePence ? rawAmount / 100 : rawAmount;
    final currency = shouldNormalizePence
        ? 'GBP'
        : normalizeDividendCurrency(rawCurrency);
    final amountMultiplier = rawAmount.abs() > 0 ? amount / rawAmount : 1.0;
    final holding = holdingsByTicker[ticker] ?? const <String, dynamic>{};
    final eventQuantity =
        firstNumber([
          event['quantity'],
          event['shares'],
          event['holdingQuantity'],
        ]) ??
        0;
    final fallbackQuantity = dividendHoldingShareQuantity({
      ...event,
      'quantity': eventQuantity,
    });
    final quantity = quantityByTicker[ticker] ?? fallbackQuantity;
    final perShare = dividendEventUsesPerShareAmount(event, source);
    final rawExplicitPayout = firstNumber([
      event['estimatedPayout'],
      event['payout'],
      event['totalPayout'],
      event['cashAmount'],
      event['totalAmount'],
    ]);
    final explicitPayout =
        shouldNormalizePence && perShare && rawExplicitPayout != null
        ? rawExplicitPayout * amountMultiplier
        : rawExplicitPayout;
    final payout = perShare
        ? (explicitPayout != null && explicitPayout.abs() > amount.abs()
              ? explicitPayout
              : amount * quantity)
        : (explicitPayout ?? amount);
    if (payout == 0) continue;
    final displayCurrency = normalizeDividendCurrency(baseCurrency);
    final fxRateToBase = dividendFxRateToBase(
      event: event,
      holding: holding,
      currency: currency,
      baseCurrency: displayCurrency,
    );
    final payoutBase = payout * fxRateToBase;
    final status = dividendStatusForEvent(event, date);
    events.add(
      DividendDisplayEvent(
        ticker: ticker,
        name: text(
          event['companyName'],
          text(event['name'], text(holding['name'], ticker)),
        ),
        date: date,
        amount: amount,
        payout: payout,
        payoutBase: payoutBase,
        quantity: quantity,
        currency: currency,
        displayCurrency: displayCurrency,
        fxRateToBase: fxRateToBase,
        status: status,
        type: text(event['type'], 'Dividend'),
        logoUrl: text(event['logoUrl'], text(holding['logoUrl'])),
        sourceLabel: text(event['sourceLabel'], text(event['source'])),
      ),
    );
  }
  return events;
}

List<DividendMonthBucket> dividendMonthBuckets(
  DateTime start,
  List<DividendDisplayEvent> events,
) {
  final buckets = [
    for (var index = 0; index < 12; index += 1)
      DividendMonthBucket(DateTime(start.year, start.month + index, 1)),
  ];
  for (final event in events) {
    for (final bucket in buckets) {
      if (event.date.year == bucket.monthStart.year &&
          event.date.month == bucket.monthStart.month) {
        bucket.add(event);
        break;
      }
    }
  }
  return buckets;
}

String dividendEventDateForMode(Map<String, dynamic> event, String dateMode) {
  final payDate = text(event['payDate']);
  final exDate = text(event['exDate']);
  final date = text(event['date']);
  if (dateMode == 'pay') return payDate.isNotEmpty ? payDate : date;
  if (dateMode == 'ex') return exDate.isNotEmpty ? exDate : date;
  return payDate.isNotEmpty
      ? payDate
      : exDate.isNotEmpty
      ? exDate
      : date;
}

DateTime? parseDividendDate(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return null;
  return DateTime(parsed.year, parsed.month, parsed.day);
}

String dividendStatusForEvent(Map<String, dynamic> event, DateTime date) {
  final raw = '${text(event['status'])} ${text(event['type'])}'.toLowerCase();
  if (raw.contains('paid')) return 'paid';
  if (raw.contains('declared')) return 'declared';
  if (raw.contains('estimated') || raw.contains('estimate')) return 'estimated';
  final today = DateTime.now();
  final normalizedToday = DateTime(today.year, today.month, today.day);
  return date.isBefore(normalizedToday) ? 'paid' : 'declared';
}

String dividendWindowTitle(DateTime start) =>
    '${monthNamesShort[start.month - 1]} ${start.year}';

DateTime? nextDividendMonthAfter(
  DateTime monthStart,
  List<DividendDisplayEvent> events,
) {
  final current = DateTime(monthStart.year, monthStart.month, 1);
  final months =
      events
          .map((event) => DateTime(event.date.year, event.date.month, 1))
          .where((month) => month.isAfter(current))
          .toSet()
          .toList()
        ..sort();
  return months.isEmpty ? null : months.first;
}

String formatDividendMoney(
  double value,
  String currency, {
  bool compact = false,
}) {
  if (!value.isFinite || value == 0) return '${currencySymbol(currency)}0';
  final abs = value.abs();
  final sign = value < 0 ? '-' : '';
  final symbol = currencySymbol(currency);
  if (compact) {
    if (abs >= 1e6) return '$sign$symbol${(abs / 1e6).toStringAsFixed(1)}M';
    if (abs >= 1e3) return '$sign$symbol${(abs / 1e3).toStringAsFixed(1)}K';
  }
  if (abs >= 1e9) return '$sign$symbol${(abs / 1e9).toStringAsFixed(2)}B';
  if (abs >= 1e6) return '$sign$symbol${(abs / 1e6).toStringAsFixed(2)}M';
  return '$sign$symbol${abs.toStringAsFixed(abs >= 1000 ? 0 : 2)}';
}

String dividendDateLabel(Map<String, dynamic> event) {
  final exDate = text(event['exDate']);
  final payDate = text(event['payDate']);
  final date = text(event['date']);
  if (exDate.isNotEmpty && payDate.isNotEmpty) {
    return 'Ex $exDate · Pay $payDate';
  }
  if (payDate.isNotEmpty) return 'Pay $payDate';
  if (exDate.isNotEmpty) return 'Ex $exDate';
  return date.isNotEmpty ? date : 'date pending';
}

class PortfolioAccountCard extends StatelessWidget {
  const PortfolioAccountCard({
    super.key,
    required this.accounts,
    required this.palette,
  });

  final List<Map<String, dynamic>> accounts;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.account_balance_rounded,
            kicker: 'ACCOUNTS',
            title: 'IBKR accounts',
            palette: palette,
          ),
          const SizedBox(height: 14),
          if (accounts.isEmpty)
            EmptyState(text: 'No linked accounts yet.', palette: palette)
          else
            for (final account in accounts)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Icon(
                      Icons.business_center_rounded,
                      color: palette.secondary,
                      size: 18,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            text(account['name'], 'Brokerage account'),
                            style: TextStyle(
                              color: palette.text,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${text(account['provider'], 'IBKR')} · ${text(account['accountType'])}',
                            style: TextStyle(
                              color: palette.muted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      formatMoney(number(account['value'])),
                      style: TextStyle(
                        color: palette.text,
                        fontWeight: FontWeight.w900,
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

class PortfolioSectorCard extends StatelessWidget {
  const PortfolioSectorCard({
    super.key,
    required this.sectors,
    required this.palette,
  });

  final List<Map<String, dynamic>> sectors;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final maxValue = sectors
        .map((sector) => number(sector['value']))
        .fold<double>(0, math.max);
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.donut_large_rounded,
            kicker: 'ALLOCATION',
            title: context.tr('资产配置', 'Allocation'),
            palette: palette,
          ),
          const SizedBox(height: 14),
          for (final sector in sectors.take(8))
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  SizedBox(
                    width: 110,
                    child: Text(
                      text(sector['sector'], 'Other'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: maxValue <= 0
                            ? 0
                            : math.max(.05, number(sector['value']) / maxValue),
                        minHeight: 8,
                        backgroundColor: palette.border,
                        color: palette.accent,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 56,
                    child: Text(
                      formatReturn(
                        number(sector['weight']),
                      ).replaceFirst('+', ''),
                      textAlign: TextAlign.end,
                      style: TextStyle(
                        color: palette.muted,
                        fontWeight: FontWeight.w800,
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

class PortfolioRiskCard extends StatelessWidget {
  const PortfolioRiskCard({
    super.key,
    required this.holdings,
    required this.palette,
  });

  final List<Map<String, dynamic>> holdings;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final top = holdings
        .take(5)
        .fold<double>(0, (sum, row) => sum + number(row['weight']));
    final cash = holdings
        .where((row) => text(row['ticker']) == 'CASH')
        .fold<double>(0, (sum, row) => sum + number(row['weight']));
    final pnl = holdings.fold<double>(
      0,
      (sum, row) => sum + number(row['unrealizedPnl']),
    );
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.shield_rounded,
            kicker: 'RISK',
            title: context.tr('组合体检', 'Portfolio Checkup'),
            palette: palette,
          ),
          const SizedBox(height: 14),
          MiniMetric(
            'Top 5 weight',
            formatReturn(top).replaceFirst('+', ''),
            Icons.filter_5_rounded,
            palette,
          ),
          const SizedBox(height: 10),
          MiniMetric(
            'Cash weight',
            formatReturn(cash).replaceFirst('+', ''),
            Icons.savings_rounded,
            palette,
          ),
          const SizedBox(height: 10),
          MiniMetric(
            'Unrealized P/L',
            formatMoney(pnl),
            Icons.trending_up_rounded,
            palette,
          ),
        ],
      ),
    );
  }
}

class PortfolioHoldingsTable extends StatelessWidget {
  const PortfolioHoldingsTable({
    super.key,
    required this.holdings,
    required this.palette,
  });

  final List<Map<String, dynamic>> holdings;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.table_rows_rounded,
            kicker: 'HOLDINGS',
            title: context.tr('最新持仓', 'Latest Holdings'),
            palette: palette,
          ),
          const SizedBox(height: 14),
          if (holdings.isEmpty)
            EmptyState(text: 'No holdings from Yodlee yet.', palette: palette)
          else
            for (final row in holdings.take(18))
              PortfolioHoldingRow(row: row, palette: palette),
        ],
      ),
    );
  }
}

class PortfolioHoldingRow extends StatelessWidget {
  const PortfolioHoldingRow({
    super.key,
    required this.row,
    required this.palette,
  });

  final Map<String, dynamic> row;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final pnl = number(row['unrealizedPnl']);
    final tone = pnl >= 0 ? palette.positive : palette.negative;
    final valuation = asMap(row['valuation']);
    final analytics = asMap(row['analytics']);
    final gap = nullableNumber(valuation['gap']);
    final gapText = gap == null ? '-' : formatReturn(gap);

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 720;
        if (compact) {
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: palette.card.withValues(alpha: .52),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: palette.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    PortfolioHoldingLogo(row: row, palette: palette, size: 30),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            text(row['ticker'], 'N/A'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.text,
                              fontWeight: FontWeight.w900,
                              fontSize: 16,
                            ),
                          ),
                          Text(
                            compactName(text(row['name'])),
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
                    PortfolioValuationChip(
                      valuation: valuation,
                      palette: palette,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _HoldingMiniLine(
                        label: 'Weight',
                        value: formatReturn(
                          number(row['weight']),
                        ).replaceFirst('+', ''),
                        palette: palette,
                      ),
                    ),
                    Expanded(
                      child: _HoldingMiniLine(
                        label: 'FV gap',
                        value: gapText,
                        palette: palette,
                      ),
                    ),
                    Expanded(
                      child: _HoldingMiniLine(
                        label: '1Y',
                        value: formatNullableReturn(
                          analytics['trailingReturn'],
                        ),
                        palette: palette,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        formatMoney(number(row['value'])),
                        style: TextStyle(
                          color: palette.text,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Text(
                      formatMoney(pnl),
                      style: TextStyle(
                        color: tone,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }

        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            children: [
              SizedBox(
                width: 132,
                child: Row(
                  children: [
                    PortfolioHoldingLogo(row: row, palette: palette, size: 26),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        text(row['ticker'], 'N/A'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Text(
                  compactName(text(row['name'])),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.muted),
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 88,
                child: PortfolioValuationChip(
                  valuation: valuation,
                  palette: palette,
                ),
              ),
              SizedBox(
                width: 78,
                child: Text(
                  gapText,
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: portfolioValuationTone(valuation, palette),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              SizedBox(
                width: 82,
                child: Text(
                  formatReturn(number(row['weight'])).replaceFirst('+', ''),
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              SizedBox(
                width: 100,
                child: Text(
                  formatMoney(number(row['value'])),
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              SizedBox(
                width: 100,
                child: Text(
                  formatMoney(pnl),
                  textAlign: TextAlign.end,
                  style: TextStyle(color: tone, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _HoldingMiniLine extends StatelessWidget {
  const _HoldingMiniLine({
    required this.label,
    required this.value,
    required this.palette,
  });

  final String label;
  final String value;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: palette.faint,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(color: palette.text, fontWeight: FontWeight.w900),
        ),
      ],
    );
  }
}

class OntologyCompactDashboard extends StatelessWidget {
  const OntologyCompactDashboard({
    super.key,
    required this.data,
    required this.palette,
  });

  final Map<String, dynamic> data;
  final Palette palette;

  Color _stateColor(String state) => switch (state) {
    'green_graph_confirmed' => palette.accent,
    'green_peer_capture' => palette.positive,
    _ => palette.secondary,
  };

  String _stateLabel(String state) => switch (state) {
    'green_graph_confirmed' => '图谱确认',
    'green_peer_capture' => '同行确认',
    _ => state.isEmpty ? '观察' : state,
  };

  Widget _signalRow(Map<String, dynamic> signal) {
    final state = text(signal['signal_state']);
    final color = _stateColor(state);
    return Container(
      constraints: const BoxConstraints(minHeight: 54),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: .68),
        border: Border(bottom: BorderSide(color: palette.border)),
      ),
      child: Row(
        children: [
          Container(width: 4, height: 32, color: color),
          const SizedBox(width: 10),
          SizedBox(
            width: 66,
            child: Text(
              text(signal['ticker']),
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  text(signal['name'], text(signal['industry'], '-')),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.muted, fontSize: 11),
                ),
                const SizedBox(height: 3),
                Text(
                  '${_stateLabel(state)} · ${text(signal['stage_name'], text(signal['sector'], '-'))}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: color,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                number(signal['ontology_score']).toStringAsFixed(2),
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                '${number(signal['context_position_multiplier']).toStringAsFixed(2)}x',
                style: TextStyle(color: palette.faint, fontSize: 9),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _holdingRow(Map<String, dynamic> holding) {
    final weight = number(holding['weight']);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 58,
            child: Text(
              text(holding['ticker']),
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: (weight / .12).clamp(0.0, 1.0).toDouble(),
                minHeight: 5,
                backgroundColor: palette.border,
                valueColor: AlwaysStoppedAnimation(palette.accent),
              ),
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 48,
            child: Text(
              formatReturn(weight),
              textAlign: TextAlign.end,
              style: TextStyle(
                color: palette.accent,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _performanceRow(String label, Map<String, dynamic> result) {
    final cagr = number(result['cagr']);
    final spyCagr = number(result['spy_cagr']);
    final excess = number(result['excess_cagr_vs_spy']);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: palette.border)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: TextStyle(
                color: palette.muted,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Expanded(
            child: Text(
              formatReturn(cagr),
              textAlign: TextAlign.end,
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Expanded(
            child: Text(
              formatReturn(spyCagr),
              textAlign: TextAlign.end,
              style: TextStyle(color: palette.muted),
            ),
          ),
          Expanded(
            child: Text(
              formatReturn(excess),
              textAlign: TextAlign.end,
              style: TextStyle(
                color: excess >= 0 ? palette.accent : palette.negative,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final stats = asMap(data['stats']);
    final signals = asList(data['current_signals']);
    final holdings = asList(data['holdings']);
    final performance = asMap(data['performance']);
    final development = asMap(performance['development']);
    final evaluation = asMap(performance['evaluation']);
    final asOf = text(stats['latest_information_date']).split('T').first;

    final header = SecondaryModeHeader(
      icon: Icons.hub_rounded,
      kicker: 'EVENT ONTOLOGY V2',
      title: 'Ontology Intelligence',
      subtitle:
          'PIT fundamentals, peer value capture, and graph-confirmed decisions.',
      chips: [
        'PIT as of ${formatDate(asOf)}',
        '${(number(stats['tickers'])).round()} companies',
      ],
      metrics: [
        _GuruHeaderMetric(
          label: 'Current Signals',
          value: '${signals.length}',
          sub: 'tradable candidates',
          palette: palette,
        ),
        _GuruHeaderMetric(
          label: 'Model Holdings',
          value: '${holdings.length}',
          sub: 'current 12M book',
          palette: palette,
        ),
        _GuruHeaderMetric(
          label: 'Evaluation CAGR',
          value: formatReturn(number(evaluation['cagr'])),
          sub: 'SPY ${formatReturn(number(evaluation['spy_cagr']))}',
          palette: palette,
        ),
        _GuruHeaderMetric(
          label: 'Max Drawdown',
          value: formatReturn(number(evaluation['max_drawdown'])),
          sub: 'evaluation period',
          palette: palette,
        ),
      ],
      palette: palette,
    );

    final signalPanel = Panel(
      palette: palette,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.bolt_rounded,
            kicker: 'DECISION BOARD',
            title: 'Latest PIT signals',
            trailing: Text(
              '${signals.length} candidates',
              style: TextStyle(
                color: palette.accent,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
            palette: palette,
          ),
          const SizedBox(height: 10),
          for (final signal in signals.take(12)) _signalRow(signal),
        ],
      ),
    );

    final rightRail = Column(
      children: [
        Panel(
          palette: palette,
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelTitle(
                icon: Icons.pie_chart_outline_rounded,
                kicker: 'CURRENT BOOK',
                title: 'Model holdings',
                palette: palette,
              ),
              const SizedBox(height: 8),
              for (final holding in holdings.take(10)) _holdingRow(holding),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Panel(
          palette: palette,
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelTitle(
                icon: Icons.query_stats_rounded,
                kicker: 'VALIDATION',
                title: 'Strategy vs SPY',
                palette: palette,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: Text(
                      'Period',
                      style: TextStyle(color: palette.faint, fontSize: 9),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'Model',
                      textAlign: TextAlign.end,
                      style: TextStyle(color: palette.faint, fontSize: 9),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'SPY',
                      textAlign: TextAlign.end,
                      style: TextStyle(color: palette.faint, fontSize: 9),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'Alpha',
                      textAlign: TextAlign.end,
                      style: TextStyle(color: palette.faint, fontSize: 9),
                    ),
                  ),
                ],
              ),
              _performanceRow('2010-2016', development),
              _performanceRow('2018-2026', evaluation),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => openBrowserPath('/ontology/'),
                  icon: const Icon(Icons.open_in_new_rounded),
                  label: Text(
                    context.tr('打开完整行业图谱', 'Open full ontology explorer'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        header,
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 1080) {
              return Column(
                children: [signalPanel, const SizedBox(height: 10), rightRail],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: signalPanel),
                const SizedBox(width: 10),
                SizedBox(width: 340, child: rightRail),
              ],
            );
          },
        ),
      ],
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
    final summary = asMap(data['summary']);
    final source = asMap(data['source']);
    final snapshots = asList(data['snapshots']);
    final latestSnapshot = snapshots.isNotEmpty
        ? asMap(snapshots.last)
        : const <String, dynamic>{};
    final exposureRows = asList(latestExposure['records']);
    final holdingRows = asList(latestSnapshot['holdings']);
    final assets = dbmfAssetsFromRows(
      exposureRows.isNotEmpty ? exposureRows : holdingRows,
      previousDate: text(latestExposure['previous_date']),
    );
    final visibleAssets = assets.take(18).toList();
    final maxAbsExposure = assets.fold<double>(
      0,
      (max, asset) => math.max(max, asset.exposure.abs()),
    );
    final longExposure = assets
        .where((asset) => asset.exposure > 0)
        .fold<double>(0, (sum, asset) => sum + asset.exposure);
    final shortExposure = assets
        .where((asset) => asset.exposure < 0)
        .fold<double>(0, (sum, asset) => sum + asset.exposure);
    final netExposure = longExposure + shortExposure;
    final grossExposure = assets.fold<double>(
      0,
      (sum, asset) => sum + asset.exposure.abs(),
    );
    final cashExposure = assets
        .where((asset) => asset.key == 'cash')
        .fold<double>(0, (sum, asset) => sum + asset.exposure);
    final grossNotional = assets.fold<double>(
      0,
      (sum, asset) => sum + asset.marketValue.abs(),
    );
    final largest = assets.isEmpty ? null : assets.first;
    final latestDate = dbmfLatestDate(latestExposure, latestSnapshot, summary);

    Widget exposureBook() => Panel(
      palette: palette,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.waves_rounded,
            kicker: 'MANAGED FUTURES',
            title: 'DBMF exposure book',
            trailing: SizedBox(
              width: 190,
              child: Text(
                text(source['officialLabel'], 'official holdings'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.end,
                style: TextStyle(color: palette.muted, fontSize: 12),
              ),
            ),
            palette: palette,
          ),
          const SizedBox(height: 14),
          if (visibleAssets.isEmpty)
            EmptyState(
              text: 'No DBMF holdings rows found in the backend response.',
              palette: palette,
            )
          else ...[
            DbmfExposureHeader(palette: palette),
            const SizedBox(height: 8),
            for (final asset in visibleAssets)
              DbmfExposureRow(
                asset: asset,
                maxAbsExposure: maxAbsExposure,
                palette: palette,
              ),
          ],
        ],
      ),
    );

    Widget rightRail() => Column(
      children: [
        Panel(
          palette: palette,
          padding: const EdgeInsets.all(14),
          child: DbmfPosture(
            longExposure: longExposure,
            shortExposure: shortExposure,
            netExposure: netExposure,
            grossExposure: grossExposure,
            palette: palette,
          ),
        ),
        const SizedBox(height: 10),
        Panel(
          palette: palette,
          padding: const EdgeInsets.all(14),
          child: DbmfSourceNote(
            latestDate: latestDate,
            source: source,
            snapshot: latestSnapshot,
            palette: palette,
          ),
        ),
      ],
    );

    final header = SecondaryModeHeader(
      icon: Icons.waves_rounded,
      kicker: 'MANAGED FUTURES',
      title: 'DBMF Exposure Book',
      subtitle: 'Official iMGP holdings normalized into futures sleeves.',
      chips: [
        'As of ${formatDate(latestDate)}',
        text(source['officialLabel'], 'official holdings'),
      ],
      metrics: [
        _GuruHeaderMetric(
          label: 'Net Exposure',
          value: formatDbmfPercent(netExposure),
          sub:
              '${formatDbmfPercent(longExposure)} long / ${formatDbmfPercent(shortExposure)} short',
          palette: palette,
        ),
        _GuruHeaderMetric(
          label: 'Gross Exposure',
          value: formatDbmfPercent(grossExposure),
          sub: '${assets.length} sleeves',
          palette: palette,
        ),
        _GuruHeaderMetric(
          label: 'Cash Sleeve',
          value: formatDbmfPercent(cashExposure),
          sub: 'T-Bills collateral',
          palette: palette,
        ),
        _GuruHeaderMetric(
          label: 'Gross Notional',
          value: formatMoney(grossNotional),
          sub: largest == null ? 'No current rows' : 'Largest ${largest.name}',
          palette: palette,
        ),
      ],
      palette: palette,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        header,
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 1180) {
              return Column(
                children: [
                  exposureBook(),
                  const SizedBox(height: 10),
                  rightRail(),
                ],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: exposureBook()),
                const SizedBox(width: 10),
                SizedBox(width: 310, child: rightRail()),
              ],
            );
          },
        ),
      ],
    );
  }
}

class DbmfMetricCard extends StatelessWidget {
  const DbmfMetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.sub,
    required this.icon,
    required this.tone,
    required this.palette,
  });

  final String label;
  final String value;
  final String sub;
  final IconData icon;
  final Color tone;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: palette.panel,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: tone, size: 20),
          const SizedBox(height: 12),
          Text(
            label,
            style: TextStyle(
              color: palette.muted,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.text,
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: palette.faint, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class DbmfExposureHeader extends StatelessWidget {
  const DbmfExposureHeader({super.key, required this.palette});

  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 780) return const SizedBox.shrink();
        final style = TextStyle(
          color: palette.faint,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        );
        return Row(
          children: [
            SizedBox(width: 230, child: Text('SLEEVE', style: style)),
            Expanded(child: Text('NET EXPOSURE', style: style)),
            SizedBox(
              width: 120,
              child: Text('NOTIONAL', textAlign: TextAlign.end, style: style),
            ),
            const SizedBox(width: 18),
            SizedBox(
              width: 92,
              child: Text('DIRECTION', textAlign: TextAlign.end, style: style),
            ),
          ],
        );
      },
    );
  }
}

class DbmfExposureRow extends StatelessWidget {
  const DbmfExposureRow({
    super.key,
    required this.asset,
    required this.maxAbsExposure,
    required this.palette,
  });

  final DbmfAsset asset;
  final double maxAbsExposure;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final color = asset.exposure < 0 ? palette.negative : palette.positive;
    final barValue = maxAbsExposure <= 0
        ? 0.0
        : math
              .max(.04, asset.exposure.abs() / maxAbsExposure)
              .clamp(0.0, 1.0)
              .toDouble();
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 780;
        final nameBlock = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              asset.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              asset.keyLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.faint, fontSize: 12),
            ),
          ],
        );
        final bar = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  formatDbmfPercent(asset.exposure),
                  style: TextStyle(color: color, fontWeight: FontWeight.w900),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DbmfExposureBar(
                    value: barValue,
                    color: color,
                    asset: asset,
                    maxAbsExposure: maxAbsExposure,
                    palette: palette,
                  ),
                ),
              ],
            ),
          ],
        );
        final amount = Text(
          formatMoney(asset.marketValue),
          textAlign: TextAlign.end,
          style: TextStyle(color: palette.text, fontWeight: FontWeight.w900),
        );
        final direction = DbmfDirectionChip(asset: asset, palette: palette);

        return Padding(
          padding: const EdgeInsets.only(bottom: 13),
          child: compact
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: nameBlock),
                        direction,
                      ],
                    ),
                    const SizedBox(height: 8),
                    bar,
                    const SizedBox(height: 7),
                    Align(alignment: Alignment.centerRight, child: amount),
                  ],
                )
              : Row(
                  children: [
                    SizedBox(width: 230, child: nameBlock),
                    Expanded(child: bar),
                    const SizedBox(width: 18),
                    SizedBox(width: 120, child: amount),
                    const SizedBox(width: 18),
                    SizedBox(width: 92, child: direction),
                  ],
                ),
        );
      },
    );
  }
}

class DbmfExposureBar extends StatelessWidget {
  const DbmfExposureBar({
    super.key,
    required this.value,
    required this.color,
    required this.asset,
    required this.maxAbsExposure,
    required this.palette,
  });

  final double value;
  final Color color;
  final DbmfAsset asset;
  final double maxAbsExposure;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final previous = asset.previousExposure;
    final hasPrevious =
        previous != null && previous.isFinite && maxAbsExposure > 0;
    final previousPosition = hasPrevious
        ? (previous.abs() / maxAbsExposure).clamp(0.0, 1.0).toDouble()
        : 0.0;
    final previousColor = previous == null
        ? palette.faint
        : previous < 0
        ? palette.negative
        : palette.positive;
    final tooltipDate = formatDate(asset.previousDate);
    final tooltip = asset.previousDate.isEmpty
        ? context.tr(
            '上一期头寸：${formatDbmfPercent(previous ?? 0)}',
            'Previous position: ${formatDbmfPercent(previous ?? 0)}',
          )
        : context.tr(
            '上一期 $tooltipDate：${formatDbmfPercent(previous ?? 0)}',
            'Previous $tooltipDate: ${formatDbmfPercent(previous ?? 0)}',
          );

    return SizedBox(
      height: 18,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final markerLeft = (constraints.maxWidth * previousPosition - 9)
              .clamp(0.0, math.max(0.0, constraints.maxWidth - 18))
              .toDouble();
          return Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.centerLeft,
            children: [
              Container(
                height: 8,
                decoration: BoxDecoration(
                  color: palette.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              FractionallySizedBox(
                widthFactor: value,
                alignment: Alignment.centerLeft,
                child: Container(
                  height: 8,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              if (hasPrevious)
                Positioned(
                  left: markerLeft,
                  top: 0,
                  child: Tooltip(
                    message: tooltip,
                    waitDuration: const Duration(milliseconds: 200),
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: Center(
                        child: Container(
                          width: 9,
                          height: 9,
                          decoration: BoxDecoration(
                            color: previousColor,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: palette.text.withValues(alpha: .92),
                              width: 1.5,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: .35),
                                blurRadius: 6,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class DbmfDirectionChip extends StatelessWidget {
  const DbmfDirectionChip({
    super.key,
    required this.asset,
    required this.palette,
  });

  final DbmfAsset asset;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final label = asset.exposure < -0.0001
        ? 'SHORT'
        : asset.key == 'cash'
        ? 'CASH'
        : 'LONG';
    final color = asset.exposure < -0.0001
        ? palette.negative
        : asset.key == 'cash'
        ? palette.secondary
        : palette.positive;
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: .35)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 11,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class DbmfPosture extends StatelessWidget {
  const DbmfPosture({
    super.key,
    required this.longExposure,
    required this.shortExposure,
    required this.netExposure,
    required this.grossExposure,
    required this.palette,
  });

  final double longExposure;
  final double shortExposure;
  final double netExposure;
  final double grossExposure;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final rows = [
      ('Long book', longExposure, palette.positive),
      ('Short book', shortExposure, palette.negative),
      (
        'Net book',
        netExposure,
        netExposure >= 0 ? palette.positive : palette.negative,
      ),
      ('Gross book', grossExposure, palette.accent),
    ];
    final maxAbs = rows.fold<double>(
      0,
      (max, row) => math.max(max, row.$2.abs()),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PanelTitle(
          icon: Icons.compass_calibration_rounded,
          kicker: 'POSTURE',
          title: 'Long / short balance',
          palette: palette,
        ),
        const SizedBox(height: 14),
        for (final row in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                SizedBox(
                  width: 86,
                  child: Text(
                    row.$1,
                    style: TextStyle(
                      color: palette.muted,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: maxAbs <= 0
                          ? 0
                          : math.max(.05, row.$2.abs() / maxAbs),
                      minHeight: 9,
                      backgroundColor: palette.border,
                      color: row.$3,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 82,
                  child: Text(
                    formatDbmfPercent(row.$2),
                    textAlign: TextAlign.end,
                    style: TextStyle(
                      color: row.$3,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class DbmfSourceNote extends StatelessWidget {
  const DbmfSourceNote({
    super.key,
    required this.latestDate,
    required this.source,
    required this.snapshot,
    required this.palette,
  });

  final String latestDate;
  final Map<String, dynamic> source;
  final Map<String, dynamic> snapshot;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final meta = asMap(snapshot['meta']);
    final totalNetAssets = firstNumber([meta['totalNetAssets'], meta['nav']]);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PanelTitle(
          icon: Icons.verified_rounded,
          kicker: 'SOURCE',
          title: 'Official holdings feed',
          palette: palette,
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            InfoChip('As of ${formatDate(latestDate)}', palette: palette),
            InfoChip(
              text(source['label'], 'Local DBMF database'),
              palette: palette,
            ),
            if (totalNetAssets != null)
              InfoChip('NAV ${formatMoney(totalNetAssets)}', palette: palette),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          'Official holdings normalized into futures sleeves, cash collateral, and the current net exposure book.',
          style: TextStyle(color: palette.muted, height: 1.35),
        ),
      ],
    );
  }
}

class ValuationCompactDashboard extends StatefulWidget {
  const ValuationCompactDashboard({
    super.key,
    required this.data,
    required this.api,
    required this.palette,
    required this.initialTicker,
    required this.onTickerChanged,
  });

  final Map<String, dynamic> data;
  final ApiClient api;
  final Palette palette;
  final String initialTicker;
  final ValueChanged<String> onTickerChanged;

  @override
  State<ValuationCompactDashboard> createState() =>
      _ValuationCompactDashboardState();
}

class _ValuationCompactDashboardState extends State<ValuationCompactDashboard> {
  String _selectedTicker = '';
  String _tickerSearch = '';
  final TextEditingController _tickerSearchController = TextEditingController();
  final Map<String, Map<String, dynamic>> _detailCache = {};
  Map<String, dynamic>? _localDashboard;
  Map<String, dynamic>? _detailPayload;
  bool _detailLoading = false;
  bool _importingTicker = false;
  String? _detailError;
  int _detailRequestSerial = 0;

  @override
  void initState() {
    super.initState();
    _selectedTicker = _defaultTicker(
      widget.data,
      preferred: widget.initialTicker,
    );
    if (_selectedTicker.isNotEmpty) {
      scheduleMicrotask(() => _loadTicker(_selectedTicker));
    }
  }

  @override
  void dispose() {
    _tickerSearchController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant ValuationCompactDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.data == widget.data) return;
    _localDashboard = null;
    final rows = valuationRowsFromTickers(
      asList(widget.data['tickers']).isNotEmpty
          ? asList(widget.data['tickers'])
          : asList(widget.data['stocks']),
    );
    final hasCurrent = rows.any((row) => row.ticker == _selectedTicker);
    final nextTicker = hasCurrent
        ? _selectedTicker
        : _defaultTicker(widget.data, preferred: widget.initialTicker);
    _detailCache.clear();
    setState(() {
      _selectedTicker = nextTicker;
      _detailPayload = null;
      _detailError = null;
      _detailLoading = false;
    });
    if (nextTicker.isNotEmpty) _loadTicker(nextTicker);
  }

  Map<String, dynamic> get _dashboardData => _localDashboard ?? widget.data;

  String _normalizeTickerInput(String value) =>
      value.trim().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9.-]'), '');

  String _defaultTicker(Map<String, dynamic> data, {String preferred = ''}) {
    final tickers = asList(data['tickers']).isNotEmpty
        ? asList(data['tickers'])
        : asList(data['stocks']);
    final rows = valuationRowsFromTickers(tickers);
    final normalizedPreferred = preferred.trim().toUpperCase();
    if (normalizedPreferred.isNotEmpty &&
        rows.any((row) => row.ticker == normalizedPreferred)) {
      return normalizedPreferred;
    }
    return rows.isEmpty ? '' : rows.first.ticker;
  }

  Future<void> _loadTicker(String ticker, {bool refresh = false}) async {
    if (ticker.isEmpty) return;
    final normalizedTicker = ticker.toUpperCase();
    final cachedPayload = refresh ? null : _detailCache[normalizedTicker];
    final requestId = ++_detailRequestSerial;
    setState(() {
      _selectedTicker = normalizedTicker;
      _detailPayload = cachedPayload;
      _detailError = null;
      _detailLoading = cachedPayload == null;
    });
    widget.onTickerChanged(normalizedTicker);
    if (cachedPayload != null) return;
    try {
      final encodedTicker = Uri.encodeComponent(normalizedTicker);
      final payload = await widget.api.getJson(
        '/api/valuation/$encodedTicker?pricePoints=900',
      );
      if (!mounted ||
          requestId != _detailRequestSerial ||
          normalizedTicker != _selectedTicker) {
        return;
      }
      _detailCache[normalizedTicker] = payload;
      setState(() => _detailPayload = payload);
    } catch (error) {
      if (!mounted ||
          requestId != _detailRequestSerial ||
          normalizedTicker != _selectedTicker) {
        return;
      }
      setState(() => _detailError = error.toString());
    } finally {
      if (mounted &&
          requestId == _detailRequestSerial &&
          normalizedTicker == _selectedTicker) {
        setState(() => _detailLoading = false);
      }
    }
  }

  Future<void> _importTicker(String ticker) async {
    final normalizedTicker = _normalizeTickerInput(ticker);
    if (normalizedTicker.isEmpty || _importingTicker) return;
    final requestId = ++_detailRequestSerial;
    setState(() {
      _selectedTicker = normalizedTicker;
      _detailPayload = null;
      _detailError = null;
      _detailLoading = true;
      _importingTicker = true;
    });
    widget.onTickerChanged(normalizedTicker);
    try {
      final encodedTicker = Uri.encodeComponent(normalizedTicker);
      final payload = await widget.api.postJson(
        '/api/valuation/$encodedTicker/import?pricePoints=900',
        {'pricePoints': 900},
      );
      final dashboard = await widget.api.getJson('/api/valuation');
      if (!mounted || requestId != _detailRequestSerial) return;
      final importedTicker = text(
        asMap(payload['ticker'])['ticker'],
        normalizedTicker,
      ).toUpperCase();
      _detailCache
        ..clear()
        ..[importedTicker] = payload;
      setState(() {
        _localDashboard = dashboard;
        _selectedTicker = importedTicker;
        _detailPayload = payload;
        _tickerSearch = importedTicker;
        _tickerSearchController.text = importedTicker;
      });
      widget.onTickerChanged(importedTicker);
    } catch (error) {
      if (!mounted || requestId != _detailRequestSerial) return;
      setState(() => _detailError = error.toString());
    } finally {
      if (mounted && requestId == _detailRequestSerial) {
        setState(() {
          _detailLoading = false;
          _importingTicker = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _dashboardData;
    final tickers = asList(data['tickers']).isNotEmpty
        ? asList(data['tickers'])
        : asList(data['stocks']);
    final summary = asMap(data['summary']);
    final source = asMap(data['source']);
    final rows = valuationRowsFromTickers(tickers);
    final selectedRow = rows.firstWhere(
      (row) => row.ticker == _selectedTicker,
      orElse: () => rows.isNotEmpty ? rows.first : ValuationRow.empty(),
    );
    final tickerQuery = _tickerSearch.trim().toUpperCase();
    final normalizedTickerQuery = _normalizeTickerInput(_tickerSearch);
    final filteredRows = tickerQuery.isEmpty
        ? rows
        : rows.where((row) {
            final haystack = '${row.ticker} ${row.name} ${row.sector}'
                .toUpperCase();
            return haystack.contains(tickerQuery);
          }).toList();
    final maxAbsUpside = rows.fold<double>(
      0,
      (max, row) => math.max(max, row.upside.abs()),
    );
    final positives = rows.where((row) => row.upside > 0).length;
    final negatives = rows.where((row) => row.upside < 0).length;
    final auditPass = rows.where((row) => row.auditStatus == 'pass').length;
    final consensusWatch = rows
        .where((row) => row.consensusStatus == 'watch')
        .length;
    final medianUpside = medianDouble(rows.map((row) => row.upside).toList());
    final averageUpside = rows.isEmpty
        ? 0.0
        : rows.fold<double>(0, (sum, row) => sum + row.upside) / rows.length;
    final best = rows.isEmpty ? null : rows.first;
    final worst = rows.isEmpty ? null : rows.last;
    final latestPriceDate = text(
      summary['latestPriceDate'],
      best?.latestPriceDate ?? '',
    );
    Widget buildTickerSearchField({
      String hintText = 'Search ticker',
    }) => TextField(
      controller: _tickerSearchController,
      cursorColor: widget.palette.accent,
      style: TextStyle(color: widget.palette.text, fontWeight: FontWeight.w800),
      onChanged: (value) {
        setState(() => _tickerSearch = value);
        final normalized = _normalizeTickerInput(value);
        final exactMatch = rows
            .where((row) => row.ticker == normalized)
            .toList();
        if (exactMatch.length == 1 &&
            exactMatch.first.ticker != _selectedTicker) {
          _loadTicker(exactMatch.first.ticker);
        }
      },
      onSubmitted: (_) {
        if (filteredRows.isNotEmpty) {
          _loadTicker(filteredRows.first.ticker);
        } else if (normalizedTickerQuery.isNotEmpty) {
          _importTicker(normalizedTickerQuery);
        }
      },
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: TextStyle(color: widget.palette.faint),
        prefixIcon: Icon(Icons.search_rounded, color: widget.palette.muted),
        suffixIcon: _tickerSearch.isEmpty
            ? null
            : IconButton(
                tooltip: 'Clear',
                onPressed: () {
                  _tickerSearchController.clear();
                  setState(() => _tickerSearch = '');
                },
                icon: Icon(Icons.close_rounded, color: widget.palette.muted),
              ),
        filled: true,
        fillColor: widget.palette.card,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 12,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: widget.palette.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: widget.palette.accent),
        ),
      ),
    );

    Widget buildImportPrompt() {
      final exactMatch = rows.any((row) => row.ticker == normalizedTickerQuery);
      if (normalizedTickerQuery.isEmpty || exactMatch) {
        return const SizedBox.shrink();
      }
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: widget.palette.panel,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: widget.palette.border),
        ),
        child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          runSpacing: 10,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$normalizedTickerQuery is not in the valuation library yet.',
                  style: TextStyle(
                    color: widget.palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Fetch SEC financials, price history, and rebuild the valuation snapshot.',
                  style: TextStyle(color: widget.palette.muted, fontSize: 12),
                ),
              ],
            ),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: widget.palette.accent,
                foregroundColor: widget.palette.background,
              ),
              onPressed: _importingTicker
                  ? null
                  : () => _importTicker(normalizedTickerQuery),
              icon: _importingTicker
                  ? SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: widget.palette.background,
                      ),
                    )
                  : const Icon(Icons.download_rounded),
              label: Text(_importingTicker ? 'Fetching' : 'Add & fetch'),
            ),
          ],
        ),
      );
    }

    Widget buildTickerPickerPanel() {
      final quickRows = filteredRows.take(16).toList();
      return Panel(
        palette: widget.palette,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PanelTitle(
              icon: Icons.manage_search_rounded,
              kicker: 'VALUATION SEARCH',
              title: 'Ticker selector',
              trailing: Text(
                tickerQuery.isEmpty
                    ? '${rows.length} names'
                    : '${filteredRows.length} matches',
                style: TextStyle(
                  color: widget.palette.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
              palette: widget.palette,
            ),
            const SizedBox(height: 12),
            buildTickerSearchField(hintText: 'Search ticker, company, sector'),
            const SizedBox(height: 12),
            if (quickRows.isEmpty)
              Column(
                children: [
                  EmptyState(
                    text: 'No matching tickers.',
                    palette: widget.palette,
                  ),
                  const SizedBox(height: 10),
                  buildImportPrompt(),
                ],
              )
            else
              SizedBox(
                height: 104,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: quickRows.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, index) {
                    final row = quickRows[index];
                    return ValuationTickerPickerCard(
                      row: row,
                      active: row.ticker == selectedRow.ticker,
                      palette: widget.palette,
                      onTap: () => _loadTicker(row.ticker),
                    );
                  },
                ),
              ),
          ],
        ),
      );
    }

    Widget buildMatrixPanel({
      bool showSearch = true,
      int rowLimit = 28,
      String title = 'Fair value matrix',
    }) {
      final visibleRows = filteredRows.take(rowLimit).toList();
      return Panel(
        palette: widget.palette,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PanelTitle(
              icon: Icons.query_stats_rounded,
              kicker: 'VALUATION',
              title: title,
              trailing: SizedBox(
                width: 190,
                child: Text(
                  latestPriceDate.isEmpty
                      ? 'latest price feed'
                      : 'prices ${formatDate(latestPriceDate)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                  style: TextStyle(color: widget.palette.muted, fontSize: 12),
                ),
              ),
              palette: widget.palette,
            ),
            if (showSearch) ...[
              const SizedBox(height: 14),
              buildTickerSearchField(),
            ],
            const SizedBox(height: 14),
            if (rows.isEmpty)
              EmptyState(
                text: 'No valuation rows found in the backend response.',
                palette: widget.palette,
              )
            else if (visibleRows.isEmpty)
              Column(
                children: [
                  EmptyState(
                    text: 'No matching tickers.',
                    palette: widget.palette,
                  ),
                  const SizedBox(height: 10),
                  buildImportPrompt(),
                ],
              )
            else ...[
              ValuationWatchlistHeader(palette: widget.palette),
              const SizedBox(height: 8),
              for (final row in visibleRows)
                ValuationWatchlistRow(
                  row: row,
                  maxAbsUpside: maxAbsUpside,
                  active: row.ticker == selectedRow.ticker,
                  palette: widget.palette,
                  onTap: () => _loadTicker(row.ticker),
                ),
            ],
          ],
        ),
      );
    }

    Widget buildDetailPanel() => ValuationTickerDetailPanel(
      api: widget.api,
      payload: _detailPayload,
      selectedRow: selectedRow,
      loading: _detailLoading,
      error: _detailError,
      palette: widget.palette,
      onRetry: () => _loadTicker(_selectedTicker, refresh: true),
    );

    Widget rightRail() => Column(
      children: [
        Panel(
          palette: widget.palette,
          padding: const EdgeInsets.all(14),
          child: ValuationDistribution(
            rows: rows,
            best: best,
            worst: worst,
            palette: widget.palette,
          ),
        ),
        const SizedBox(height: 10),
        Panel(
          palette: widget.palette,
          padding: const EdgeInsets.all(14),
          child: ValuationSourceNote(
            source: source,
            summary: summary,
            palette: widget.palette,
          ),
        ),
      ],
    );

    final header = SecondaryModeHeader(
      icon: Icons.query_stats_rounded,
      kicker: 'VALUATION',
      title: 'Fair Value Research Terminal',
      subtitle: 'Ticker-level fair value, price history, and model controls.',
      chips: [
        latestPriceDate.isEmpty
            ? 'latest price feed'
            : 'prices ${formatDate(latestPriceDate)}',
        text(source['upstreamLabel'], 'SEC + transcript model'),
      ],
      metrics: [
        _GuruHeaderMetric(
          label: 'Coverage',
          value: '${rows.length}',
          sub: '${formatNumber(number(summary['historyRows']))} value rows',
          palette: widget.palette,
        ),
        _GuruHeaderMetric(
          label: 'Median Upside',
          value: formatReturn(medianUpside),
          sub: '${formatReturn(averageUpside)} average',
          palette: widget.palette,
        ),
        _GuruHeaderMetric(
          label: 'Positive / Negative',
          value: '$positives / $negatives',
          sub: 'price vs fair value',
          palette: widget.palette,
        ),
        _GuruHeaderMetric(
          label: 'Audit Pass',
          value: '$auditPass/${rows.length}',
          sub: '$consensusWatch watch flags',
          palette: widget.palette,
        ),
      ],
      palette: widget.palette,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        header,
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 980) {
              return Column(
                children: [
                  buildTickerPickerPanel(),
                  const SizedBox(height: 10),
                  buildDetailPanel(),
                  const SizedBox(height: 10),
                  buildMatrixPanel(
                    showSearch: false,
                    rowLimit: constraints.maxWidth < 560 ? 14 : 22,
                    title: 'All valuation rows',
                  ),
                  const SizedBox(height: 10),
                  rightRail(),
                ],
              );
            }
            if (constraints.maxWidth < 1320) {
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 360, child: buildMatrixPanel()),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      children: [
                        buildDetailPanel(),
                        const SizedBox(height: 10),
                        rightRail(),
                      ],
                    ),
                  ),
                ],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 360, child: buildMatrixPanel()),
                const SizedBox(width: 10),
                Expanded(child: buildDetailPanel()),
                const SizedBox(width: 10),
                SizedBox(width: 300, child: rightRail()),
              ],
            );
          },
        ),
      ],
    );
  }
}

class ValuationWatchlistHeader extends StatelessWidget {
  const ValuationWatchlistHeader({super.key, required this.palette});

  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 900) return const SizedBox.shrink();
        final style = TextStyle(
          color: palette.faint,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        );
        return Row(
          children: [
            SizedBox(width: 260, child: Text('COMPANY', style: style)),
            Expanded(child: Text('UPSIDE / DOWNSIDE', style: style)),
            SizedBox(
              width: 120,
              child: Text('PRICE / FV', textAlign: TextAlign.end, style: style),
            ),
            const SizedBox(width: 18),
            SizedBox(
              width: 120,
              child: Text('3Y TARGET', textAlign: TextAlign.end, style: style),
            ),
            const SizedBox(width: 18),
            SizedBox(
              width: 112,
              child: Text('QUALITY', textAlign: TextAlign.end, style: style),
            ),
          ],
        );
      },
    );
  }
}

class ValuationTickerPickerCard extends StatelessWidget {
  const ValuationTickerPickerCard({
    super.key,
    required this.row,
    required this.active,
    required this.palette,
    required this.onTap,
  });

  final ValuationRow row;
  final bool active;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = valuationTone(row.upside, palette);
    return SizedBox(
      width: 176,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: active ? tone.withValues(alpha: .12) : palette.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: active ? tone.withValues(alpha: .45) : palette.border,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      row.ticker,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Text(
                    formatReturn(row.upside),
                    style: TextStyle(
                      color: tone,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                row.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'P ${formatCurrencyValue(row.latestPrice, row.currency)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: palette.faint, fontSize: 11),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'FV ${formatCurrencyValue(row.fairValue, row.currency)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.text,
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ValuationWatchlistRow extends StatelessWidget {
  const ValuationWatchlistRow({
    super.key,
    required this.row,
    required this.maxAbsUpside,
    required this.active,
    required this.palette,
    required this.onTap,
  });

  final ValuationRow row;
  final double maxAbsUpside;
  final bool active;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = valuationTone(row.upside, palette);
    final barValue = maxAbsUpside <= 0
        ? 0.0
        : math.max(.04, row.upside.abs() / maxAbsUpside).clamp(0.0, 1.0);

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 900;
        final company = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  row.ticker,
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(width: 8),
                ValuationQualityChip(
                  label: row.coverageLabel,
                  palette: palette,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              row.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.muted, fontSize: 12),
            ),
            const SizedBox(height: 2),
            Text(
              row.sector,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.faint, fontSize: 11),
            ),
          ],
        );
        final upside = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                SizedBox(
                  width: 72,
                  child: Text(
                    formatReturn(row.upside),
                    style: TextStyle(color: tone, fontWeight: FontWeight.w900),
                  ),
                ),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: barValue,
                      minHeight: 8,
                      backgroundColor: palette.border,
                      color: tone,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              row.consensusText,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.faint, fontSize: 11),
            ),
          ],
        );
        final price = Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              formatCurrencyValue(row.latestPrice, row.currency),
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'FV ${formatCurrencyValue(row.fairValue, row.currency)}',
              style: TextStyle(
                color: palette.faint,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        );
        final target = Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              formatCurrencyValue(row.targetPrice3Y, row.currency),
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${formatReturn(row.expectedReturn3Y)} IRR',
              style: TextStyle(color: palette.faint, fontSize: 12),
            ),
          ],
        );
        final quality = Align(
          alignment: Alignment.centerRight,
          child: ValuationQualityChip(
            label: row.auditLabel,
            palette: palette,
            strong: row.auditStatus == 'pass',
          ),
        );

        final content = compact
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: company),
                      quality,
                    ],
                  ),
                  const SizedBox(height: 9),
                  upside,
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      Expanded(child: price),
                      const SizedBox(width: 16),
                      Expanded(child: target),
                    ],
                  ),
                ],
              )
            : Row(
                children: [
                  SizedBox(width: 260, child: company),
                  Expanded(child: upside),
                  const SizedBox(width: 18),
                  SizedBox(width: 120, child: price),
                  const SizedBox(width: 18),
                  SizedBox(width: 120, child: target),
                  const SizedBox(width: 18),
                  SizedBox(width: 112, child: quality),
                ],
              );

        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: active
                    ? tone.withValues(alpha: .10)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: active
                      ? tone.withValues(alpha: .40)
                      : Colors.transparent,
                ),
              ),
              child: content,
            ),
          ),
        );
      },
    );
  }
}

class ValuationTickerDetailPanel extends StatelessWidget {
  const ValuationTickerDetailPanel({
    super.key,
    required this.api,
    required this.payload,
    required this.selectedRow,
    required this.loading,
    required this.error,
    required this.palette,
    required this.onRetry,
  });

  final ApiClient api;
  final Map<String, dynamic>? payload;
  final ValuationRow selectedRow;
  final bool loading;
  final String? error;
  final Palette palette;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final tickerPayload = asMap(payload?['ticker']);
    final ticker = text(tickerPayload['ticker'], selectedRow.ticker);
    final name = text(tickerPayload['name'], selectedRow.name);
    final sector = text(tickerPayload['sector'], selectedRow.sector);
    final currency = text(tickerPayload['currency'], selectedRow.currency);
    final latest = asMap(tickerPayload['latest']);
    final history = asList(tickerPayload['history']);
    final priceHistory = asList(tickerPayload['priceHistory']);
    final methodCards = asList(tickerPayload['methodCards']).take(3).toList();
    final podcastInsights = asList(tickerPayload['podcastInsights']);
    final latestPrice =
        firstNumber([latest['latestPrice'], selectedRow.latestPrice]) ?? 0;
    final fairValue =
        firstNumber([latest['baseFairValue'], selectedRow.fairValue]) ?? 0;
    final upside =
        firstNumber([latest['upsideToBase'], selectedRow.upside]) ?? 0;
    final target =
        firstNumber([latest['targetPrice3Y'], selectedRow.targetPrice3Y]) ?? 0;

    return Panel(
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PanelTitle(
            icon: Icons.insights_rounded,
            kicker: 'TICKER RESEARCH',
            title: ticker.isEmpty
                ? context.tr('单票历史估值', 'Ticker Valuation History')
                : context.tr(
                    '$ticker 历史估值 / 股价走势',
                    '$ticker Valuation / Price History',
                  ),
            trailing: _RetryIconButton(onPressed: onRetry, palette: palette),
            palette: palette,
          ),
          const SizedBox(height: 14),
          if (loading && payload == null)
            const SizedBox(
              height: 280,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (error != null && payload == null)
            EmptyState(text: error!, palette: palette)
          else if (ticker.isEmpty)
            EmptyState(
              text: 'Select a ticker from the matrix.',
              palette: palette,
            )
          else ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: palette.text,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        sector,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: palette.muted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                BadgeLabel(
                  text: selectedRow.coverageLabel,
                  color: palette.accent,
                ),
              ],
            ),
            const SizedBox(height: 14),
            GridWrap(
              minTileWidth: 140,
              spacing: 10,
              children: [
                MiniMetric(
                  'Price',
                  formatCurrencyValue(latestPrice, currency),
                  Icons.show_chart_rounded,
                  palette,
                ),
                MiniMetric(
                  'Fair value',
                  formatCurrencyValue(fairValue, currency),
                  Icons.balance_rounded,
                  palette,
                ),
                MiniMetric(
                  'Upside',
                  formatReturn(upside),
                  Icons.trending_up_rounded,
                  palette,
                ),
                MiniMetric(
                  '3Y target',
                  formatCurrencyValue(target, currency),
                  Icons.flag_rounded,
                  palette,
                ),
              ],
            ),
            ValuationTickerHistorySection(
              api: api,
              rows: history,
              priceHistory: priceHistory,
              fallbackMethodCards: methodCards,
              currency: currency,
              palette: palette,
            ),
            const SizedBox(height: 12),
            ValuationPodcastInsightsSection(
              ticker: ticker,
              insights: podcastInsights,
              palette: palette,
            ),
          ],
        ],
      ),
    );
  }
}

class ValuationTickerHistorySection extends StatefulWidget {
  const ValuationTickerHistorySection({
    super.key,
    required this.api,
    required this.rows,
    required this.priceHistory,
    required this.fallbackMethodCards,
    required this.currency,
    required this.palette,
  });

  final ApiClient api;
  final List<Map<String, dynamic>> rows;
  final List<Map<String, dynamic>> priceHistory;
  final List<Map<String, dynamic>> fallbackMethodCards;
  final String currency;
  final Palette palette;

  @override
  State<ValuationTickerHistorySection> createState() =>
      _ValuationTickerHistorySectionState();
}

class _ValuationTickerHistorySectionState
    extends State<ValuationTickerHistorySection> {
  String _selectedQuarterKey = '';

  @override
  void didUpdateWidget(covariant ValuationTickerHistorySection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rows == widget.rows) return;
    if (_selectedQuarterKey.isEmpty) return;
    final hasSelected = widget.rows.any(
      (row) => valuationQuarterKey(row) == _selectedQuarterKey,
    );
    if (!hasSelected) _selectedQuarterKey = '';
  }

  @override
  Widget build(BuildContext context) {
    final sortedRows = widget.rows.toList()
      ..sort((a, b) => text(b['asOfDate']).compareTo(text(a['asOfDate'])));
    final effectiveSelectedKey = _selectedQuarterKey.isNotEmpty
        ? _selectedQuarterKey
        : (sortedRows.isEmpty ? '' : valuationQuarterKey(sortedRows.first));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        if (widget.rows.length < 2 && widget.priceHistory.length < 2)
          EmptyState(
            text: 'No historical valuation or price series available.',
            palette: widget.palette,
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final chartHeight = constraints.maxWidth < 560 ? 250.0 : 320.0;
              return SizedBox(
                height: chartHeight,
                child: ValuationTrendChart(
                  history: widget.rows,
                  priceHistory: widget.priceHistory,
                  currency: widget.currency,
                  palette: widget.palette,
                  selectedQuarterKey: effectiveSelectedKey,
                ),
              );
            },
          ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            _ChartLegend(
              color: widget.palette.accent,
              label: 'Fair value',
              palette: widget.palette,
            ),
            _ChartLegend(
              color: widget.palette.secondary,
              label: 'Quarter price',
              palette: widget.palette,
            ),
            _ChartLegend(
              color: widget.palette.faint,
              label: 'Daily price',
              palette: widget.palette,
            ),
          ],
        ),
        const SizedBox(height: 18),
        ValuationQuarterResearchPanel(
          api: widget.api,
          rows: widget.rows,
          fallbackMethodCards: widget.fallbackMethodCards,
          currency: widget.currency,
          palette: widget.palette,
          selectedQuarterKey: effectiveSelectedKey,
          onSelectQuarter: (value) {
            setState(() => _selectedQuarterKey = value);
          },
        ),
      ],
    );
  }
}

class _ChartLegend extends StatelessWidget {
  const _ChartLegend({
    required this.color,
    required this.label,
    required this.palette,
  });

  final Color color;
  final String label;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 20,
          height: 4,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            color: palette.muted,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class ValuationTrendChart extends StatelessWidget {
  const ValuationTrendChart({
    super.key,
    required this.history,
    required this.priceHistory,
    required this.currency,
    required this.palette,
    required this.selectedQuarterKey,
  });

  final List<Map<String, dynamic>> history;
  final List<Map<String, dynamic>> priceHistory;
  final String currency;
  final Palette palette;
  final String selectedQuarterKey;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: ValuationTrendPainter(
        history: history,
        priceHistory: priceHistory,
        currency: currency,
        palette: palette,
        selectedQuarterKey: selectedQuarterKey,
      ),
      size: Size.infinite,
    );
  }
}

class ValuationTrendPainter extends CustomPainter {
  ValuationTrendPainter({
    required this.history,
    required this.priceHistory,
    required this.currency,
    required this.palette,
    required this.selectedQuarterKey,
  });

  final List<Map<String, dynamic>> history;
  final List<Map<String, dynamic>> priceHistory;
  final String currency;
  final Palette palette;
  final String selectedQuarterKey;

  @override
  void paint(Canvas canvas, Size size) {
    final left = 54.0;
    final right = size.width - 14;
    final top = 16.0;
    final bottom = size.height - 28;
    final pricePoints = priceHistory
        .where(
          (row) => text(row['date']).isNotEmpty && number(row['close']) > 0,
        )
        .toList();
    final valuationPoints =
        history.where((row) => text(row['asOfDate']).isNotEmpty).toList()
          ..sort((a, b) => text(a['asOfDate']).compareTo(text(b['asOfDate'])));
    final dateValues = <int>[
      for (final row in pricePoints)
        ?DateTime.tryParse(text(row['date']))?.millisecondsSinceEpoch,
      for (final row in valuationPoints)
        ?DateTime.tryParse(text(row['asOfDate']))?.millisecondsSinceEpoch,
    ];
    final values = <double>[
      for (final row in pricePoints) number(row['close']),
      for (final row in valuationPoints) ...[
        firstNumber([row['fairValue']]) ?? 0,
        firstNumber([row['priceAtDate'], row['currentPrice']]) ?? 0,
      ],
    ].where((value) => value > 0 && value.isFinite).toList();
    if (dateValues.length < 2 || values.length < 2) return;

    final minMs = dateValues.reduce(math.min);
    final maxMs = dateValues.reduce(math.max);
    final minValue = values.reduce(math.min);
    final maxValue = values.reduce(math.max);
    final dateSpan = math.max(1, maxMs - minMs).toDouble();
    final valueSpan = math.max(.0001, maxValue - minValue);

    double xForDate(String value) {
      final date = DateTime.tryParse(value);
      if (date == null) return left;
      return left +
          (right - left) * (date.millisecondsSinceEpoch - minMs) / dateSpan;
    }

    double yForValue(double value) =>
        bottom - ((value - minValue) / valueSpan) * (bottom - top);

    final gridPaint = Paint()
      ..color = palette.border
      ..strokeWidth = 1;
    final labelStyle = TextStyle(
      color: palette.faint,
      fontSize: 10,
      fontWeight: FontWeight.w700,
    );
    for (var i = 0; i < 4; i += 1) {
      final y = top + (bottom - top) * i / 3;
      canvas.drawLine(Offset(left, y), Offset(right, y), gridPaint);
      final labelValue = maxValue - valueSpan * i / 3;
      _drawText(
        canvas,
        formatCurrencyValue(labelValue, currency),
        Offset(0, y - 7),
        labelStyle,
      );
    }

    Path pathFromRows(
      List<Map<String, dynamic>> rows,
      String dateKey,
      List<String> valueKeys,
    ) {
      final path = Path();
      var started = false;
      for (final row in rows) {
        final value = firstNumber([for (final key in valueKeys) row[key]]);
        final date = text(row[dateKey]);
        if (value == null || value <= 0 || date.isEmpty) continue;
        final point = Offset(xForDate(date), yForValue(value));
        if (!started) {
          path.moveTo(point.dx, point.dy);
          started = true;
        } else {
          path.lineTo(point.dx, point.dy);
        }
      }
      return path;
    }

    canvas.drawPath(
      pathFromRows(pricePoints, 'date', const ['close']),
      Paint()
        ..color = palette.faint.withValues(alpha: .72)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.7,
    );
    canvas.drawPath(
      pathFromRows(valuationPoints, 'asOfDate', const [
        'priceAtDate',
        'currentPrice',
      ]),
      Paint()
        ..color = palette.secondary
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2,
    );
    canvas.drawPath(
      pathFromRows(valuationPoints, 'asOfDate', const ['fairValue']),
      Paint()
        ..color = palette.accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );

    for (final row in valuationPoints) {
      final x = xForDate(text(row['asOfDate']));
      final fairValue = firstNumber([row['fairValue']]);
      final price = firstNumber([row['priceAtDate'], row['currentPrice']]);
      final isSelected =
          selectedQuarterKey.isNotEmpty &&
          valuationQuarterKey(row) == selectedQuarterKey;
      if (price != null && price > 0) {
        final point = Offset(x, yForValue(price));
        if (isSelected) {
          canvas.drawCircle(
            point,
            8,
            Paint()..color = palette.secondary.withValues(alpha: .22),
          );
          canvas.drawCircle(
            point,
            5.4,
            Paint()
              ..color = palette.text.withValues(alpha: .70)
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1.7,
          );
        }
        canvas.drawCircle(
          point,
          isSelected ? 4.8 : 3.5,
          Paint()..color = palette.secondary,
        );
      }
      if (fairValue != null && fairValue > 0) {
        final point = Offset(x, yForValue(fairValue));
        if (isSelected) {
          canvas.drawCircle(
            point,
            10,
            Paint()..color = palette.accent.withValues(alpha: .24),
          );
          canvas.drawCircle(
            point,
            6.4,
            Paint()
              ..color = palette.text.withValues(alpha: .76)
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1.8,
          );
        }
        canvas.drawCircle(
          point,
          isSelected ? 5.8 : 4.5,
          Paint()..color = palette.accent,
        );
      }
    }

    final startDate = DateTime.fromMillisecondsSinceEpoch(
      minMs,
    ).toIso8601String();
    final endDate = DateTime.fromMillisecondsSinceEpoch(
      maxMs,
    ).toIso8601String();
    _drawText(
      canvas,
      formatDate(startDate),
      Offset(left, bottom + 9),
      labelStyle,
    );
    _drawText(
      canvas,
      formatDate(endDate),
      Offset(right - 70, bottom + 9),
      labelStyle,
    );
  }

  void _drawText(Canvas canvas, String text, Offset offset, TextStyle style) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: 72);
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant ValuationTrendPainter oldDelegate) =>
      oldDelegate.history != history ||
      oldDelegate.priceHistory != priceHistory ||
      oldDelegate.selectedQuarterKey != selectedQuarterKey ||
      oldDelegate.palette.colorBlind != palette.colorBlind;
}

class ValuationHistoryTable extends StatelessWidget {
  const ValuationHistoryTable({
    super.key,
    required this.rows,
    required this.currency,
    required this.palette,
  });

  final List<Map<String, dynamic>> rows;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final latestRows = rows.toList()
      ..sort((a, b) => text(b['asOfDate']).compareTo(text(a['asOfDate'])));
    final visible = latestRows.take(8).toList();
    if (visible.isEmpty) {
      return EmptyState(
        text: 'No quarterly valuation history.',
        palette: palette,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Recent quarterly valuation history',
          style: TextStyle(color: palette.text, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 10),
        for (final row in visible)
          ValuationHistoryLine(row: row, currency: currency, palette: palette),
      ],
    );
  }
}

class ValuationHistoryLine extends StatelessWidget {
  const ValuationHistoryLine({
    super.key,
    required this.row,
    required this.currency,
    required this.palette,
  });

  final Map<String, dynamic> row;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final price = firstNumber([row['priceAtDate'], row['currentPrice']]) ?? 0;
    final fairValue = firstNumber([row['fairValue']]) ?? 0;
    final upside =
        firstNumber([row['upsideDownside']]) ??
        (price > 0 && fairValue > 0 ? fairValue / price - 1 : 0);
    final tone = valuationTone(upside, palette);
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 560;
        if (compact) {
          return Container(
            margin: const EdgeInsets.only(bottom: 9),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              color: palette.card.withValues(alpha: .55),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: palette.border),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        text(row['label'], '-'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Text(
                      formatReturn(upside),
                      style: TextStyle(
                        color: tone,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        formatDate(text(row['asOfDate'])),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: palette.muted, fontSize: 12),
                      ),
                    ),
                    Text(
                      'Price ${formatCurrencyValue(price, currency)}',
                      style: TextStyle(
                        color: palette.faint,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      'FV ${formatCurrencyValue(fairValue, currency)}',
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.only(bottom: 9),
          child: Row(
            children: [
              SizedBox(
                width: 100,
                child: Text(
                  text(row['label'], '-'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  formatDate(text(row['asOfDate'])),
                  style: TextStyle(color: palette.muted, fontSize: 12),
                ),
              ),
              SizedBox(
                width: 96,
                child: Text(
                  formatCurrencyValue(price, currency),
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 96,
                child: Text(
                  formatCurrencyValue(fairValue, currency),
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 72,
                child: Text(
                  formatReturn(upside),
                  textAlign: TextAlign.end,
                  style: TextStyle(color: tone, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class ValuationQuarterResearchPanel extends StatefulWidget {
  const ValuationQuarterResearchPanel({
    super.key,
    required this.api,
    required this.rows,
    required this.fallbackMethodCards,
    required this.currency,
    required this.palette,
    required this.selectedQuarterKey,
    required this.onSelectQuarter,
  });

  final ApiClient api;
  final List<Map<String, dynamic>> rows;
  final List<Map<String, dynamic>> fallbackMethodCards;
  final String currency;
  final Palette palette;
  final String selectedQuarterKey;
  final ValueChanged<String> onSelectQuarter;

  @override
  State<ValuationQuarterResearchPanel> createState() =>
      _ValuationQuarterResearchPanelState();
}

class _ValuationQuarterResearchPanelState
    extends State<ValuationQuarterResearchPanel> {
  String _selectedKey = '';
  int? _expandedQaIndex;

  List<Map<String, dynamic>> get _sortedRows {
    final rows = widget.rows.toList()
      ..sort((a, b) => text(b['asOfDate']).compareTo(text(a['asOfDate'])));
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final rows = _sortedRows;
    if (rows.isEmpty) {
      return EmptyState(
        text: 'No quarterly valuation history.',
        palette: widget.palette,
      );
    }

    final selected = _selectedRow(rows);
    final selectedIndex = rows.indexOf(selected);
    final previous = selectedIndex >= 0 && selectedIndex + 1 < rows.length
        ? rows[selectedIndex + 1]
        : null;
    final selectedKey = _rowKey(selected, selectedIndex);
    final quarterCountLabel =
        '${formatNumber(rows.length.toDouble())} quarters';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: widget.palette.card.withValues(alpha: .42),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: widget.palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.event_note_rounded, color: widget.palette.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'QUARTERLY MODEL BOOK',
                      style: TextStyle(
                        color: widget.palette.muted,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      context.tr('季度研究卡', 'Quarterly Model Book'),
                      style: TextStyle(
                        color: widget.palette.text,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                quarterCountLabel,
                style: TextStyle(
                  color: widget.palette.faint,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var index = 0; index < rows.length; index += 1)
                  Padding(
                    padding: EdgeInsets.only(
                      right: index == rows.length - 1 ? 0 : 10,
                    ),
                    child: ValuationQuarterChip(
                      row: rows[index],
                      selected: _rowKey(rows[index], index) == selectedKey,
                      currency: widget.currency,
                      palette: widget.palette,
                      onTap: () {
                        setState(() {
                          _selectedKey = _rowKey(rows[index], index);
                          _expandedQaIndex = null;
                        });
                        widget.onSelectQuarter(_selectedKey);
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 780;
              final inputCard = ValuationInputResearchCard(
                row: selected,
                currency: widget.currency,
                palette: widget.palette,
              );
              final outputCard = ValuationOutputResearchCard(
                row: selected,
                fallbackMethodCards: widget.fallbackMethodCards,
                currency: widget.currency,
                palette: widget.palette,
              );
              if (compact) {
                return Column(
                  children: [inputCard, const SizedBox(height: 12), outputCard],
                );
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: inputCard),
                  const SizedBox(width: 12),
                  Expanded(child: outputCard),
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          ValuationQuarterQaList(
            api: widget.api,
            row: selected,
            previous: previous,
            currency: widget.currency,
            palette: widget.palette,
            expandedIndex: _expandedQaIndex,
            onToggle: (index) {
              setState(() {
                _expandedQaIndex = _expandedQaIndex == index ? null : index;
              });
            },
          ),
        ],
      ),
    );
  }

  Map<String, dynamic> _selectedRow(List<Map<String, dynamic>> rows) {
    if (widget.selectedQuarterKey.isNotEmpty) {
      for (var index = 0; index < rows.length; index += 1) {
        if (_rowKey(rows[index], index) == widget.selectedQuarterKey) {
          return rows[index];
        }
      }
    }
    if (_selectedKey.isNotEmpty) {
      for (var index = 0; index < rows.length; index += 1) {
        if (_rowKey(rows[index], index) == _selectedKey) return rows[index];
      }
    }
    return rows.first;
  }

  String _rowKey(Map<String, dynamic> row, int index) {
    final key = valuationQuarterKey(row);
    if (key.isNotEmpty) return key;
    return 'quarter-$index';
  }
}

String valuationQuarterKey(Map<String, dynamic> row) {
  final periodId = text(row['periodId']);
  if (periodId.isNotEmpty) return periodId;
  final asOfDate = text(row['asOfDate']);
  final label = text(row['label']);
  if (asOfDate.isNotEmpty || label.isNotEmpty) return '$label-$asOfDate';
  final fiscalYear = text(row['fiscalYear']);
  final fiscalQuarter = text(row['fiscalQuarter']);
  if (fiscalYear.isNotEmpty || fiscalQuarter.isNotEmpty) {
    return '$fiscalYear-$fiscalQuarter';
  }
  return '';
}

class ValuationQuarterChip extends StatelessWidget {
  const ValuationQuarterChip({
    super.key,
    required this.row,
    required this.selected,
    required this.currency,
    required this.palette,
    required this.onTap,
  });

  final Map<String, dynamic> row;
  final bool selected;
  final String currency;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final price = firstNumber([row['priceAtDate'], row['currentPrice']]) ?? 0;
    final fairValue = firstNumber([row['fairValue']]) ?? 0;
    final upside =
        firstNumber([row['upsideDownside']]) ??
        (price > 0 && fairValue > 0 ? fairValue / price - 1 : 0);
    final tone = valuationTone(upside, palette);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 150,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected
              ? palette.accent.withValues(alpha: .16)
              : palette.panel.withValues(alpha: .86),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? palette.accent : palette.border,
            width: selected ? 1.2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              text(row['label'], '-'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: selected ? palette.accent : palette.text,
                fontSize: 14,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              formatDate(text(row['asOfDate'])),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: selected ? palette.muted : palette.faint,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(
                    formatCurrencyValue(fairValue, currency),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.text,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Text(
                  formatReturn(upside),
                  style: TextStyle(color: tone, fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class ValuationInputResearchCard extends StatelessWidget {
  const ValuationInputResearchCard({
    super.key,
    required this.row,
    required this.currency,
    required this.palette,
  });

  final Map<String, dynamic> row;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final snapshot = asMap(row['dataSnapshot']);
    final selectedPeriod = asMap(snapshot['selectedFinancialPeriod']);
    final fiscal = asMap(snapshot['fiscalFinancials']);
    final ttm = asMap(snapshot['trailingTwelveMonths']);
    final semantics = asMap(snapshot['valuationSemantics']);
    final scoreInputs = asMap(semantics['scoreInputs']);
    final youtube = asMap(snapshot['youtubeEarnings']);
    final evidence = asList(youtube['evidence']);
    final revenue = firstNumber([
      fiscal['revenue_m'],
      ttm['revenue_m'],
      scoreInputs['ttmRevenue'],
    ]);
    final revenueGrowth = firstNumber([
      fiscal['revenue_growth_pct'],
      scoreInputs['revenueGrowth'],
    ]);
    final fcf = firstNumber([
      fiscal['fcf_after_capex_m'],
      ttm['fcf_after_capex_m'],
      scoreInputs['ttmFreeCashFlow'],
    ]);
    final operatingMargin = firstNumber([
      fiscal['operating_margin_pct'],
      ttm['operating_margin_pct'],
      scoreInputs['operatingMargin'],
    ]);
    final normalizedMargin = firstNumber([scoreInputs['normalizedMargin']]);
    final guidanceRevenue = firstNumber([
      scoreInputs['revenueGuidanceM'],
      youtube['revenueGuidanceM'],
    ]);
    final guidanceMargin = firstNumber([
      scoreInputs['guidanceOperatingMargin'],
      youtube['operatingMargin'],
    ]);
    final sourceQuality = text(
      snapshot['sourceQuality'],
      text(row['sourceType']),
    );

    return ValuationResearchCard(
      palette: palette,
      icon: Icons.dataset_rounded,
      kicker: 'MODEL INPUTS',
      title: context.tr('财务与指引数据', 'Financials & Guidance Inputs'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              InfoChip(
                text(selectedPeriod['periodEndDate']).isEmpty
                    ? text(row['label'], '-')
                    : 'Period end ${formatDate(text(selectedPeriod['periodEndDate']))}',
                palette: palette,
              ),
              InfoChip(sourceQuality, palette: palette),
              InfoChip(
                '${formatNumber(number(snapshot['financialPeriodCount']))} financial rows',
                palette: palette,
              ),
              if (number(snapshot['transcriptCandidateCount']) > 0)
                InfoChip(
                  '${formatNumber(number(snapshot['transcriptCandidateCount']))} transcript metrics',
                  palette: palette,
                ),
            ],
          ),
          const SizedBox(height: 12),
          GridWrap(
            minTileWidth: 132,
            spacing: 8,
            children: [
              ValuationResearchMetric(
                label: 'Revenue',
                value: formatMillions(revenue),
                palette: palette,
              ),
              ValuationResearchMetric(
                label: 'Revenue growth',
                value: formatPercentInput(revenueGrowth),
                palette: palette,
              ),
              ValuationResearchMetric(
                label: 'Operating margin',
                value: formatPercentInput(operatingMargin),
                palette: palette,
              ),
              ValuationResearchMetric(
                label: 'Normalized margin',
                value: formatPercentInput(normalizedMargin),
                palette: palette,
              ),
              ValuationResearchMetric(
                label: 'FCF after capex',
                value: formatMillions(fcf),
                palette: palette,
              ),
              ValuationResearchMetric(
                label: 'Shares',
                value: formatSharesMillions(
                  firstNumber([fiscal['shares_m'], scoreInputs['sharesM']]),
                ),
                palette: palette,
              ),
            ],
          ),
          if (guidanceRevenue != null || guidanceMargin != null) ...[
            const SizedBox(height: 12),
            Text(
              'Guidance used by model',
              style: TextStyle(
                color: palette.muted,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (guidanceRevenue != null)
                  InfoChip(
                    'Revenue guide ${formatMillions(guidanceRevenue)}',
                    palette: palette,
                  ),
                if (guidanceMargin != null)
                  InfoChip(
                    'Margin guide ${formatPercentInput(guidanceMargin)}',
                    palette: palette,
                  ),
                if (number(snapshot['guidanceCandidateCount']) > 0)
                  InfoChip(
                    '${formatNumber(number(snapshot['guidanceCandidateCount']))} guide signals',
                    palette: palette,
                  ),
              ],
            ),
          ],
          if (evidence.isNotEmpty) ...[
            const SizedBox(height: 12),
            ValuationEvidenceSnippet(
              evidence: evidence.first,
              palette: palette,
            ),
          ],
        ],
      ),
    );
  }
}

class ValuationOutputResearchCard extends StatelessWidget {
  const ValuationOutputResearchCard({
    super.key,
    required this.row,
    required this.fallbackMethodCards,
    required this.currency,
    required this.palette,
  });

  final Map<String, dynamic> row;
  final List<Map<String, dynamic>> fallbackMethodCards;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final snapshot = asMap(row['dataSnapshot']);
    final semantics = asMap(snapshot['valuationSemantics']);
    final scoreInputs = asMap(semantics['scoreInputs']);
    final weights = asMap(scoreInputs['methodWeights']);
    final methods = asList(row['methodOutputs']).isNotEmpty
        ? asList(row['methodOutputs'])
        : fallbackMethodCards;
    final visibleMethods = methods
        .where((item) => !text(item['key']).toLowerCase().contains('weight'))
        .take(5)
        .toList();
    final weightNotes = methods
        .where((item) => text(item['key']).toLowerCase().contains('weight'))
        .toList();
    final price = firstNumber([row['priceAtDate'], row['currentPrice']]) ?? 0;
    final fairValue = firstNumber([row['fairValue']]) ?? 0;
    final target = firstNumber([row['targetPrice3Y']]) ?? 0;
    final upside =
        firstNumber([row['upsideDownside']]) ??
        (price > 0 && fairValue > 0 ? fairValue / price - 1 : 0);

    return ValuationResearchCard(
      palette: palette,
      icon: Icons.functions_rounded,
      kicker: 'MODEL OUTPUT',
      title: context.tr('估值输出与权重', 'Valuation Output & Weights'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GridWrap(
            minTileWidth: 132,
            spacing: 8,
            children: [
              ValuationResearchMetric(
                label: 'Fair value',
                value: formatCurrencyValue(fairValue, currency),
                palette: palette,
                strong: true,
              ),
              ValuationResearchMetric(
                label: 'Price at date',
                value: formatCurrencyValue(price, currency),
                palette: palette,
              ),
              ValuationResearchMetric(
                label: 'Upside',
                value: formatReturn(upside),
                palette: palette,
                valueColor: valuationTone(upside, palette),
              ),
              ValuationResearchMetric(
                label: '3Y target',
                value: formatCurrencyValue(target, currency),
                palette: palette,
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final method in visibleMethods)
            ValuationMethodWeightRow(
              method: method,
              weight: firstNumber([weights[text(method['key'])]]),
              currency: currency,
              palette: palette,
            ),
          if (weightNotes.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              text(weightNotes.first['description']),
              style: TextStyle(
                color: palette.faint,
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ],
          if (text(semantics['fairValueFormula']).isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: palette.panel.withValues(alpha: .66),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: palette.border),
              ),
              child: Text(
                text(semantics['fairValueFormula']),
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class ValuationResearchCard extends StatelessWidget {
  const ValuationResearchCard({
    super.key,
    required this.palette,
    required this.icon,
    required this.kicker,
    required this.title,
    required this.child,
    this.trailing,
  });

  final Palette palette;
  final IconData icon;
  final String kicker;
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.panel.withValues(alpha: .84),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: palette.secondary, size: 18),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      kicker,
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      title,
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 10), trailing!],
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class ValuationResearchMetric extends StatelessWidget {
  const ValuationResearchMetric({
    super.key,
    required this.label,
    required this.value,
    required this.palette,
    this.valueColor,
    this.strong = false,
  });

  final String label;
  final String value;
  final Palette palette;
  final Color? valueColor;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: strong ? .92 : .62),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: strong
              ? palette.accent.withValues(alpha: .45)
              : palette.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.muted,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: valueColor ?? palette.text,
              fontSize: strong ? 16 : 14,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class ValuationMethodWeightRow extends StatelessWidget {
  const ValuationMethodWeightRow({
    super.key,
    required this.method,
    required this.weight,
    required this.currency,
    required this.palette,
  });

  final Map<String, dynamic> method;
  final double? weight;
  final String currency;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final normalizedWeight = weight == null
        ? null
        : weight!.abs() > 1
        ? weight! / 100
        : weight;
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  text(method['label'], text(method['key'], 'Method')),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                formatValuationMethodValue(method, currency),
                style: TextStyle(
                  color: palette.text,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (normalizedWeight != null) ...[
                const SizedBox(width: 10),
                Text(
                  formatReturn(normalizedWeight).replaceFirst('+', ''),
                  style: TextStyle(
                    color: palette.secondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 5),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: normalizedWeight == null
                  ? .08
                  : normalizedWeight.clamp(0, 1).toDouble(),
              minHeight: 5,
              backgroundColor: palette.border,
              color: normalizedWeight == null ? palette.faint : palette.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class ValuationEvidenceSnippet extends StatelessWidget {
  const ValuationEvidenceSnippet({
    super.key,
    required this.evidence,
    required this.palette,
  });

  final Map<String, dynamic> evidence;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final metric = text(evidence['metricName'], 'transcript');
    final date = formatDate(text(evidence['observedAt']));
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: palette.accent.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: palette.accent.withValues(alpha: .24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$metric evidence · $date',
            style: TextStyle(
              color: palette.accent,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            text(evidence['excerpt']),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: palette.muted, fontSize: 12, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class ValuationPodcastInsightsSection extends StatefulWidget {
  const ValuationPodcastInsightsSection({
    super.key,
    required this.ticker,
    required this.insights,
    required this.palette,
  });

  final String ticker;
  final List<Map<String, dynamic>> insights;
  final Palette palette;

  @override
  State<ValuationPodcastInsightsSection> createState() =>
      _ValuationPodcastInsightsSectionState();
}

class _ValuationPodcastInsightsSectionState
    extends State<ValuationPodcastInsightsSection> {
  int _expandedIndex = 0;

  @override
  void didUpdateWidget(covariant ValuationPodcastInsightsSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.ticker != widget.ticker) _expandedIndex = 0;
  }

  @override
  Widget build(BuildContext context) {
    final insights = widget.insights.take(8).toList();
    final channels = <String>{
      for (final item in insights)
        if (text(item['channel']).isNotEmpty) text(item['channel']),
    };
    final latestDate = insights
        .map((item) => text(item['observedAt']))
        .where((value) => value.isNotEmpty)
        .fold<String>(
          '',
          (latest, value) => value.compareTo(latest) > 0 ? value : latest,
        );

    return ValuationResearchCard(
      palette: widget.palette,
      icon: Icons.podcasts_rounded,
      kicker: 'PODCAST RADAR',
      title: context.tr('频道前瞻看点', 'Podcast Forward Views'),
      trailing: insights.isEmpty
          ? null
          : InfoChip('${insights.length} notes', palette: widget.palette),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              InfoChip('${channels.length} channels', palette: widget.palette),
              if (latestDate.isNotEmpty)
                InfoChip(
                  'latest ${formatDate(latestDate)}',
                  palette: widget.palette,
                ),
              InfoChip('not an FV input', palette: widget.palette),
            ],
          ),
          const SizedBox(height: 12),
          if (insights.isEmpty)
            EmptyState(
              text: context.tr(
                '还没有为 ${widget.ticker} 生成 podcast 前瞻看点。',
                'No podcast forward views have been generated for ${widget.ticker} yet.',
              ),
              palette: widget.palette,
            )
          else
            LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxWidth < 720;
                return Column(
                  children: [
                    for (var index = 0; index < insights.length; index += 1)
                      Padding(
                        padding: EdgeInsets.only(
                          bottom: index == insights.length - 1 ? 0 : 8,
                        ),
                        child: ValuationPodcastInsightCard(
                          insight: insights[index],
                          index: index,
                          compact: compact,
                          expanded: _expandedIndex == index,
                          palette: widget.palette,
                          onTap: () {
                            setState(() {
                              _expandedIndex = _expandedIndex == index
                                  ? -1
                                  : index;
                            });
                          },
                        ),
                      ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}

class ValuationPodcastInsightCard extends StatelessWidget {
  const ValuationPodcastInsightCard({
    super.key,
    required this.insight,
    required this.index,
    required this.compact,
    required this.expanded,
    required this.palette,
    required this.onTap,
  });

  final Map<String, dynamic> insight;
  final int index;
  final bool compact;
  final bool expanded;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final stance = text(insight['stance'], 'mixed');
    final tone = stanceTone(stance, palette);
    final confidence = number(insight['confidence']).clamp(0, 1).toDouble();
    final summary = context.isChinese
        ? text(
            insight['summaryZh'],
            text(insight['summary'], 'No summary available.'),
          )
        : text(insight['summary'], 'No summary available.');
    final theme = text(insight['theme'], 'Forward-looking debate');
    final channel = text(insight['channel'], 'Podcast');
    final speaker = text(insight['speaker'], channel);
    final observedAt = formatDate(text(insight['observedAt']));
    final videoTitle = text(insight['videoTitle']);
    final excerpt = text(insight['evidenceExcerpt']);

    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: expanded
              ? palette.accent.withValues(alpha: .08)
              : palette.card.withValues(alpha: .62),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: expanded
                ? palette.accent.withValues(alpha: .46)
                : palette.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                BadgeLabel(
                  text: stanceLabel(stance, context.language),
                  color: tone,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    theme,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Icon(
                  expanded
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  color: palette.muted,
                ),
              ],
            ),
            const SizedBox(height: 9),
            Text(
              context.tr('谁说：$speaker', 'Said by: $speaker'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.secondary,
                fontSize: 12,
                height: 1.25,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              summary,
              maxLines: expanded ? null : 3,
              overflow: expanded ? null : TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.text,
                fontSize: 13,
                height: 1.42,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            compact
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _PodcastSourceLine(
                        speaker: speaker,
                        channel: channel,
                        observedAt: observedAt,
                        title: videoTitle,
                        palette: palette,
                      ),
                      const SizedBox(height: 8),
                      _PodcastConfidenceBar(
                        confidence: confidence,
                        color: tone,
                        palette: palette,
                      ),
                    ],
                  )
                : Row(
                    children: [
                      Expanded(
                        child: _PodcastSourceLine(
                          channel: channel,
                          speaker: speaker,
                          observedAt: observedAt,
                          title: videoTitle,
                          palette: palette,
                        ),
                      ),
                      const SizedBox(width: 14),
                      SizedBox(
                        width: 180,
                        child: _PodcastConfidenceBar(
                          confidence: confidence,
                          color: tone,
                          palette: palette,
                        ),
                      ),
                    ],
                  ),
            if (expanded && excerpt.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: palette.panel.withValues(alpha: .70),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: palette.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr('原文证据', 'Source Evidence'),
                      style: TextStyle(
                        color: palette.secondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      excerpt,
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 12,
                        height: 1.38,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PodcastSourceLine extends StatelessWidget {
  const _PodcastSourceLine({
    required this.speaker,
    required this.channel,
    required this.observedAt,
    required this.title,
    required this.palette,
  });

  final String speaker;
  final String channel;
  final String observedAt;
  final String title;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if (speaker.isNotEmpty && speaker != channel) speaker,
      channel,
      if (observedAt.isNotEmpty) observedAt,
      if (title.isNotEmpty) title,
    ].join(' · ');
    return Text(
      subtitle,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: palette.faint,
        fontSize: 12,
        fontWeight: FontWeight.w800,
        height: 1.3,
      ),
    );
  }
}

class _PodcastConfidenceBar extends StatelessWidget {
  const _PodcastConfidenceBar({
    required this.confidence,
    required this.color,
    required this.palette,
  });

  final double confidence;
  final Color color;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: confidence <= 0 ? .08 : confidence,
                  minHeight: 6,
                  backgroundColor: palette.border,
                  color: color,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${(confidence * 100).round()}%',
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'evidence strength',
          style: TextStyle(
            color: palette.faint,
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

Color stanceTone(String stance, Palette palette) {
  final normalized = stance.toLowerCase();
  if (normalized.contains('risk') || normalized.contains('negative')) {
    return palette.negative;
  }
  if (normalized.contains('positive') || normalized.contains('bull')) {
    return palette.accent;
  }
  return palette.secondary;
}

String stanceLabel(String stance, [AppLanguage language = AppLanguage.en]) {
  final normalized = stance.toLowerCase();
  if (normalized.contains('risk') || normalized.contains('negative')) {
    return trFor(language, '风险', 'Risk');
  }
  if (normalized.contains('positive') || normalized.contains('bull')) {
    return trFor(language, '正面', 'Positive');
  }
  return trFor(language, '混合', 'Mixed');
}

class ValuationQuarterQaList extends StatefulWidget {
  const ValuationQuarterQaList({
    super.key,
    required this.api,
    required this.row,
    required this.previous,
    required this.currency,
    required this.palette,
    required this.expandedIndex,
    required this.onToggle,
  });

  final ApiClient api;
  final Map<String, dynamic> row;
  final Map<String, dynamic>? previous;
  final String currency;
  final Palette palette;
  final int? expandedIndex;
  final ValueChanged<int> onToggle;

  @override
  State<ValuationQuarterQaList> createState() => _ValuationQuarterQaListState();
}

class _ValuationQuarterQaListState extends State<ValuationQuarterQaList> {
  @override
  Widget build(BuildContext context) {
    final showChinese = context.isChinese;
    final items = valuationQaItems(
      widget.row,
      widget.previous,
      widget.currency,
    );
    return ValuationResearchCard(
      palette: widget.palette,
      icon: Icons.question_answer_rounded,
      kicker: 'CALL TRANSCRIPT Q&A',
      title: context.tr('电话会 Q&A', 'Call Transcript Q&A'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (items.isEmpty)
            EmptyState(
              text: valuationQaEmptyText(widget.row, showChinese),
              palette: widget.palette,
            )
          else ...[
            for (var index = 0; index < items.length; index += 1)
              ValuationQaAccordionItem(
                index: index,
                question: items[index].questionFor(showChinese),
                answer: items[index].answerFor(showChinese),
                metadata: showChinese
                    ? items[index].metadataZh
                    : items[index].metadata,
                answerLabel: context.tr('管理层回答', 'Management answer'),
                expanded: widget.expandedIndex == index,
                translating: false,
                isLast: index == items.length - 1,
                palette: widget.palette,
                onTap: () => widget.onToggle(index),
              ),
          ],
        ],
      ),
    );
  }
}

class ValuationQaAccordionItem extends StatelessWidget {
  const ValuationQaAccordionItem({
    super.key,
    required this.index,
    required this.question,
    required this.answer,
    required this.metadata,
    required this.answerLabel,
    required this.expanded,
    required this.translating,
    required this.isLast,
    required this.palette,
    required this.onTap,
  });

  final int index;
  final String question;
  final String answer;
  final String metadata;
  final String answerLabel;
  final bool expanded;
  final bool translating;
  final bool isLast;
  final Palette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: EdgeInsets.only(bottom: isLast ? 0 : 8),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: .62),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: expanded ? palette.accent : palette.border),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(11),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  BadgeLabel(text: 'Q${index + 1}', color: palette.accent),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      question,
                      maxLines: expanded ? null : 1,
                      overflow: expanded
                          ? TextOverflow.visible
                          : TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        height: 1.34,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  if (translating) ...[
                    const SizedBox(width: 8),
                    Text(
                      context.tr('翻译中', 'Translating'),
                      style: TextStyle(
                        color: palette.accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                  Icon(
                    expanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    color: palette.muted,
                  ),
                ],
              ),
              AnimatedCrossFade(
                firstChild: const SizedBox.shrink(),
                secondChild: Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (metadata.isNotEmpty) ...[
                        Text(
                          metadata,
                          style: TextStyle(
                            color: palette.faint,
                            height: 1.35,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      Text(
                        answerLabel,
                        style: TextStyle(
                          color: palette.secondary,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        answer,
                        style: TextStyle(
                          color: palette.muted,
                          height: 1.48,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                crossFadeState: expanded
                    ? CrossFadeState.showSecond
                    : CrossFadeState.showFirst,
                duration: const Duration(milliseconds: 160),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ValuationQaDatum {
  const ValuationQaDatum({
    required this.question,
    required this.answer,
    required this.questionZh,
    required this.answerZh,
    required this.metadata,
    required this.metadataZh,
  });

  final String question;
  final String answer;
  final String questionZh;
  final String answerZh;
  final String metadata;
  final String metadataZh;

  String questionFor(bool showChinese) =>
      showChinese && questionZh.isNotEmpty ? questionZh : question;

  String answerFor(bool showChinese) =>
      showChinese && answerZh.isNotEmpty ? answerZh : answer;
}

class ValuationQualityChip extends StatelessWidget {
  const ValuationQualityChip({
    super.key,
    required this.label,
    required this.palette,
    this.strong = false,
  });

  final String label;
  final Palette palette;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final normalized = label.toLowerCase();
    final color =
        strong ||
            normalized.contains('pass') ||
            normalized.contains('quarterly')
        ? palette.positive
        : normalized.contains('watch') || normalized.contains('partial')
        ? palette.secondary
        : palette.faint;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: .35)),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class ValuationDistribution extends StatelessWidget {
  const ValuationDistribution({
    super.key,
    required this.rows,
    required this.best,
    required this.worst,
    required this.palette,
  });

  final List<ValuationRow> rows;
  final ValuationRow? best;
  final ValuationRow? worst;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final deepValue = rows.where((row) => row.upside >= .25).length;
    final fair = rows
        .where((row) => row.upside > -.10 && row.upside < .25)
        .length;
    final expensive = rows.where((row) => row.upside <= -.10).length;
    final total = math.max(1, rows.length);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PanelTitle(
          icon: Icons.donut_large_rounded,
          kicker: 'DISTRIBUTION',
          title: 'Where the model sees value',
          palette: palette,
        ),
        const SizedBox(height: 14),
        ValuationBucketRow(
          label: 'Deep value',
          count: deepValue,
          total: total,
          color: palette.positive,
          palette: palette,
        ),
        ValuationBucketRow(
          label: 'Fair range',
          count: fair,
          total: total,
          color: palette.secondary,
          palette: palette,
        ),
        ValuationBucketRow(
          label: 'Expensive',
          count: expensive,
          total: total,
          color: palette.negative,
          palette: palette,
        ),
        const SizedBox(height: 10),
        if (best != null)
          Text(
            'Top discount: ${best!.ticker} at ${formatReturn(best!.upside)}.',
            style: TextStyle(color: palette.muted, height: 1.35),
          ),
        if (worst != null)
          Text(
            'Most stretched: ${worst!.ticker} at ${formatReturn(worst!.upside)}.',
            style: TextStyle(color: palette.muted, height: 1.35),
          ),
      ],
    );
  }
}

class ValuationBucketRow extends StatelessWidget {
  const ValuationBucketRow({
    super.key,
    required this.label,
    required this.count,
    required this.total,
    required this.color,
    required this.palette,
  });

  final String label;
  final int count;
  final int total;
  final Color color;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            child: Text(
              label,
              style: TextStyle(
                color: palette.muted,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: count / total,
                minHeight: 9,
                backgroundColor: palette.border,
                color: color,
              ),
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 46,
            child: Text(
              '$count',
              textAlign: TextAlign.end,
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ValuationSourceNote extends StatelessWidget {
  const ValuationSourceNote({
    super.key,
    required this.source,
    required this.summary,
    required this.palette,
  });

  final Map<String, dynamic> source;
  final Map<String, dynamic> summary;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PanelTitle(
          icon: Icons.rule_rounded,
          kicker: 'MODEL CONTROL',
          title: 'Price excluded from fair value',
          palette: palette,
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            InfoChip(
              text(source['upstreamLabel'], 'SEC + transcript model'),
              palette: palette,
            ),
            InfoChip(
              '${formatNumber(number(summary['modelInputAuditPassCount']))} input audits pass',
              palette: palette,
            ),
            InfoChip(
              '${formatNumber(number(summary['externalConsensusTickerCount']))} consensus checks',
              palette: palette,
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          text(
            source['modelInputPolicy'],
            'Fair value uses reported financials, normalized earnings/FCF assumptions, and transcript evidence. Market price is comparison only.',
          ),
          style: TextStyle(color: palette.muted, height: 1.35),
        ),
      ],
    );
  }
}

class ApiClient {
  ApiClient(this._accessTokenProvider);

  static const Duration _requestTimeout = Duration(seconds: 95);
  static const Duration _retryDelay = Duration(milliseconds: 450);

  final String Function() _accessTokenProvider;

  String get accessToken {
    if (_authConfigured && _supabaseReady) {
      final token = Supabase.instance.client.auth.currentSession?.accessToken;
      if (token != null && token.isNotEmpty) return token;
    }
    return _accessTokenProvider();
  }

  Map<String, String> _headersFor(String token) => {
    'authorization': 'Bearer $token',
    'content-type': 'application/json',
  };

  Future<http.Response> _sendWithAuthRetry(
    Future<http.Response> Function(String token) send, {
    bool retryTransient = false,
  }) async {
    var response = await _sendOnce(send, retryTransient: retryTransient);
    if (response.statusCode == 401 && await _refreshSession()) {
      response = await _sendOnce(send, retryTransient: retryTransient);
    }
    if (retryTransient && _isTransientStatus(response.statusCode)) {
      await Future<void>.delayed(_retryDelay);
      response = await _sendOnce(send, retryTransient: false);
    }
    return response;
  }

  Future<http.Response> _sendOnce(
    Future<http.Response> Function(String token) send, {
    required bool retryTransient,
  }) async {
    try {
      return await send(accessToken).timeout(_requestTimeout);
    } on TimeoutException {
      throw Exception(
        'API request timed out after ${_requestTimeout.inSeconds}s. Please retry.',
      );
    } on http.ClientException {
      if (!retryTransient) rethrow;
      await Future<void>.delayed(_retryDelay);
      return send(accessToken).timeout(_requestTimeout);
    }
  }

  bool _isTransientStatus(int statusCode) =>
      statusCode == 502 || statusCode == 503 || statusCode == 504;

  Future<bool> _refreshSession() async {
    if (!_authConfigured || !_supabaseReady) return false;
    try {
      final response = await Supabase.instance.client.auth.refreshSession();
      return response.session?.accessToken.isNotEmpty == true;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> getJson(String path) async {
    final uri = apiUri(path);
    final response = await _sendWithAuthRetry(
      (token) => http.get(uri, headers: {'authorization': 'Bearer $token'}),
      retryTransient: true,
    );
    return _decodeObject(response);
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _sendWithAuthRetry(
      (token) => http.post(
        apiUri(path),
        headers: _headersFor(token),
        body: jsonEncode(body),
      ),
    );
    return _decodeObject(response);
  }

  Future<Map<String, dynamic>> deleteJson(String path) async {
    final response = await _sendWithAuthRetry(
      (token) => http.delete(apiUri(path), headers: _headersFor(token)),
    );
    return _decodeObject(response);
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
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
    Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      final source = response.request?.url.toString() ?? 'unknown API URL';
      final contentType = response.headers['content-type'] ?? 'unknown type';
      throw Exception('API returned non-JSON from $source ($contentType)');
    }
    if (decoded is Map) {
      return decoded.map((key, value) => MapEntry('$key', value));
    }
    throw Exception('API returned a non-object payload');
  }
}

Uri apiUri(String path) {
  final base = apiBaseUrl();
  final normalized = path.startsWith('/') ? path : '/$path';
  if (base.isNotEmpty) {
    return Uri.parse('$base$normalized');
  }
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
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
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

class GuruFilingItem {
  const GuruFilingItem({
    required this.guruId,
    required this.guruName,
    required this.quarter,
    required this.reportDate,
    required this.filingDate,
    required this.value,
  });

  final String guruId;
  final String guruName;
  final String quarter;
  final String reportDate;
  final String filingDate;
  final double value;
}

class GuruActivityRankItem {
  const GuruActivityRankItem({
    required this.ticker,
    required this.actions,
    required this.guruNames,
    required this.reportDate,
    required this.amount,
  });

  final String ticker;
  final Map<String, int> actions;
  final Set<String> guruNames;
  final String reportDate;
  final double amount;

  int get guruCount => guruNames.length;

  String get primaryAction {
    if (actions.isEmpty) return '';
    final entries = actions.entries.toList()
      ..sort((a, b) {
        final countCompare = b.value.compareTo(a.value);
        return countCompare != 0 ? countCompare : a.key.compareTo(b.key);
      });
    return entries.first.key;
  }
}

class StatCardData {
  const StatCardData(this.label, this.value, this.sub, this.icon);

  final String label;
  final String value;
  final String sub;
  final IconData icon;
}

class DbmfAsset {
  const DbmfAsset({
    required this.name,
    required this.key,
    required this.marketValue,
    required this.exposure,
    required this.previousExposure,
    required this.previousDate,
    required this.componentCount,
  });

  final String name;
  final String key;
  final double marketValue;
  final double exposure;
  final double? previousExposure;
  final String previousDate;
  final int componentCount;

  String get keyLabel {
    if (key.isEmpty) {
      return componentCount > 0 ? '$componentCount lines' : 'DBMF';
    }
    final cleaned = key.replaceAll('_', ' ').toUpperCase();
    if (componentCount <= 1) return cleaned;
    return '$cleaned · $componentCount lines';
  }
}

class ValuationRow {
  const ValuationRow({
    required this.ticker,
    required this.name,
    required this.sector,
    required this.currency,
    required this.latestPrice,
    required this.fairValue,
    required this.upside,
    required this.targetPrice3Y,
    required this.expectedReturn3Y,
    required this.latestPriceDate,
    required this.coverageKind,
    required this.auditStatus,
    required this.consensusStatus,
    required this.consensusUpside,
  });

  static ValuationRow empty() => const ValuationRow(
    ticker: '',
    name: 'Company',
    sector: 'Unclassified',
    currency: 'USD',
    latestPrice: 0,
    fairValue: 0,
    upside: 0,
    targetPrice3Y: 0,
    expectedReturn3Y: 0,
    latestPriceDate: '',
    coverageKind: '',
    auditStatus: '',
    consensusStatus: '',
    consensusUpside: null,
  );

  final String ticker;
  final String name;
  final String sector;
  final String currency;
  final double latestPrice;
  final double fairValue;
  final double upside;
  final double targetPrice3Y;
  final double expectedReturn3Y;
  final String latestPriceDate;
  final String coverageKind;
  final String auditStatus;
  final String consensusStatus;
  final double? consensusUpside;

  String get coverageLabel {
    if (coverageKind.isEmpty) return 'model';
    return coverageKind.length <= 9
        ? coverageKind
        : coverageKind.substring(0, 9);
  }

  String get auditLabel => auditStatus.isEmpty ? 'audit' : auditStatus;

  String get consensusText {
    if (consensusUpside == null) {
      return consensusStatus.isEmpty
          ? 'no consensus guardrail'
          : consensusStatus;
    }
    final status = consensusStatus.isEmpty ? 'consensus' : consensusStatus;
    return '$status · street ${formatReturn(consensusUpside!)}';
  }
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

String? cleanRouteValue(String? value) {
  final cleaned = value?.trim() ?? '';
  return cleaned.isEmpty ? null : cleaned;
}

String shortText(String value, [int length = 10]) {
  final cleaned = value.trim();
  if (cleaned.length <= length) return cleaned;
  return cleaned.substring(0, length);
}

String normalizeRouteMode(String? value) {
  final mode = value?.trim().toLowerCase() ?? '';
  if (mode == 'dbmf') return 'ontology';
  return const {
        'guru',
        'ontology',
        'valuation',
        'portfolio',
        'admin',
      }.contains(mode)
      ? mode
      : 'guru';
}

int guruModuleIndex(String? value) {
  final module = value?.trim().toLowerCase() ?? '';
  return switch (module) {
    '1' || 'trade' || 'trades' || 'new' || 'new-exit' => 1,
    '2' || 'quarter' || 'quarters' || 'contribution' => 2,
    _ => 0,
  };
}

String guruModuleRouteName(int value) {
  return switch (value) {
    1 => 'trades',
    2 => 'contribution',
    _ => 'simulation',
  };
}

String? defaultGuruId(List<Map<String, dynamic>> gurus) {
  if (gurus.isEmpty) return null;
  final bill = gurus.firstWhere(
    (guru) => text(guru['id']) == 'bill-ackman',
    orElse: () => const <String, dynamic>{},
  );
  if (bill.isNotEmpty) return text(bill['id']);
  final manager = gurus.firstWhere(
    (guru) => text(guru['type']) == 'manager13f',
    orElse: () => const <String, dynamic>{},
  );
  if (manager.isNotEmpty) return text(manager['id']);
  return text(gurus.first['id']);
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
            actionLabel: action,
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
            actionLabel: action,
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
      final valueCompare = b.value.compareTo(a.value);
      return valueCompare != 0
          ? valueCompare
          : b.guruCount.compareTo(a.guruCount);
    });
  return rows;
}

List<GuruFilingItem> buildRecentFilingItems(List<Map<String, dynamic>> gurus) {
  final rows = <GuruFilingItem>[];
  for (final guru in gurus) {
    if (text(guru['type']) != 'manager13f') continue;
    final summary = asMap(guru['summary']);
    final reportDate = text(summary['reportDate']);
    final filingDate = text(summary['filingDate']);
    if (reportDate.isEmpty && filingDate.isEmpty) continue;
    rows.add(
      GuruFilingItem(
        guruId: text(guru['id']),
        guruName: text(guru['name']),
        quarter: reportQuarterLabel(reportDate),
        reportDate: reportDate,
        filingDate: filingDate.isEmpty ? reportDate : filingDate,
        value: number(summary['totalValue']),
      ),
    );
  }
  rows.sort((a, b) {
    final dateCompare = b.filingDate.compareTo(a.filingDate);
    return dateCompare != 0 ? dateCompare : b.value.compareTo(a.value);
  });
  return rows;
}

List<GuruActivityRankItem> buildActivityRankItems(
  List<Map<String, dynamic>> gurus, {
  required bool positive,
}) {
  final byTicker = <String, _ActivityRankAccumulator>{};
  final wanted = positive
      ? const {'new', 'increased'}
      : const {'reduced', 'sold_out'};
  for (final guru in gurus) {
    if (text(guru['type']) != 'manager13f') continue;
    final summary = asMap(guru['summary']);
    final guruName = text(guru['name']);
    final reportDate = text(summary['reportDate']);
    for (final activity in asList(guru['activity'])) {
      final action = text(activity['action']);
      if (!wanted.contains(action)) continue;
      final ticker = text(
        activity['ticker'],
        compactName(text(activity['issuer'])),
      ).toUpperCase();
      if (!RegExp(r'^[A-Z][A-Z0-9.-]{0,9}$').hasMatch(ticker)) continue;
      final amount = activityRankAmount(activity, positive: positive);
      if (amount <= 0) continue;
      final current = byTicker.putIfAbsent(
        ticker,
        () => _ActivityRankAccumulator(ticker),
      );
      current.amount += amount;
      current.guruNames.add(guruName);
      current.actions[action] = (current.actions[action] ?? 0) + 1;
      if (reportDate.compareTo(current.reportDate) > 0) {
        current.reportDate = reportDate;
      }
    }
  }
  final rows = byTicker.values
      .map(
        (item) => GuruActivityRankItem(
          ticker: item.ticker,
          actions: Map.unmodifiable(item.actions),
          guruNames: Set.unmodifiable(item.guruNames),
          reportDate: item.reportDate,
          amount: item.amount,
        ),
      )
      .toList();
  rows.sort((a, b) {
    final amountCompare = b.amount.compareTo(a.amount);
    return amountCompare != 0
        ? amountCompare
        : b.reportDate.compareTo(a.reportDate);
  });
  return rows;
}

class _ActivityRankAccumulator {
  _ActivityRankAccumulator(this.ticker);

  final String ticker;
  double amount = 0;
  String reportDate = '';
  final Set<String> guruNames = <String>{};
  final Map<String, int> actions = <String, int>{};
}

double activityRankAmount(
  Map<String, dynamic> activity, {
  required bool positive,
}) {
  final action = text(activity['action']);
  final value = number(activity['value']);
  final previousValue = number(activity['previousValue']);
  if (positive) {
    if (action == 'new') return value;
    final delta = value - previousValue;
    return delta > 0 ? delta : value;
  }
  if (action == 'sold_out') return previousValue > 0 ? previousValue : value;
  final delta = previousValue - value;
  if (delta > 0) return delta;
  return previousValue > 0 ? previousValue : value;
}

String activityRankSubtitle(GuruActivityRankItem item) {
  final names = item.guruNames.take(3).join(', ');
  final suffix = item.guruCount > 3 ? ' +' : '';
  final quarter = reportQuarterLabel(item.reportDate);
  final prefix = '${item.guruCount} gurus';
  final namePart = names.isEmpty ? '' : ' · $names$suffix';
  final quarterPart = quarter == '-' ? '' : ' · latest $quarter';
  return '$prefix$namePart$quarterPart';
}

String activityRankActionSummary(
  GuruActivityRankItem item, [
  AppLanguage language = AppLanguage.en,
]) {
  if (item.actions.isEmpty) return '';
  final parts = item.actions.entries.toList()
    ..sort((a, b) {
      final countCompare = b.value.compareTo(a.value);
      return countCompare != 0 ? countCompare : a.key.compareTo(b.key);
    });
  return parts
      .map((entry) => '${actionLabel(entry.key, language)}×${entry.value}')
      .take(2)
      .join(' / ');
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

String publicAssetUrl(dynamic value) {
  final raw = text(value);
  if (raw.isEmpty) return '';
  if (raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:')) {
    return raw;
  }
  return raw.startsWith('/') ? raw : '/$raw';
}

double number(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(text(value).replaceAll(',', '')) ?? 0;
}

double? nullableNumber(dynamic value) {
  if (value is num && value.isFinite) return value.toDouble();
  final raw = text(value);
  if (raw.isEmpty) return null;
  final parsed = double.tryParse(raw.replaceAll(',', ''));
  return parsed == null || !parsed.isFinite ? null : parsed;
}

double? firstNumber(List<dynamic> values) {
  for (final value in values) {
    final parsed = nullableNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
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

String actionLabel(String action, [AppLanguage language = AppLanguage.en]) =>
    switch (action) {
      'new' => trFor(language, '新增', 'New'),
      'increased' => trFor(language, '加仓', 'Add'),
      'reduced' => trFor(language, '减仓', 'Reduce'),
      'sold_out' => trFor(language, '清仓', 'Sold out'),
      'buy' => trFor(language, '买入', 'Buy'),
      'sell' => trFor(language, '卖出', 'Sell'),
      'award' => trFor(language, '授予', 'Award'),
      'option_exercise' => trFor(language, '行权', 'Option exercise'),
      'tax_withholding' => trFor(language, '税务扣缴', 'Tax withholding'),
      'gift' => trFor(language, '赠与', 'Gift'),
      _ => action.isEmpty ? trFor(language, '其他', 'Other') : action,
    };

List<Map<String, dynamic>> guruTradeRows(Map<String, dynamic> guru) {
  final manager = text(guru['type']) == 'manager13f';
  final rows = manager
      ? asList(guru['activity'])
            .where(
              (row) => {
                'new',
                'increased',
                'reduced',
                'sold_out',
              }.contains(text(row['action'])),
            )
            .toList()
      : asList(guru['transactions'])
            .where((row) => text(row['ticker']).isNotEmpty)
            .map(
              (row) => {
                ...row,
                'date': text(row['transactionDate'], text(row['reportDate'])),
                'value': tradeDisplayAmount(row),
                'changeShares': tradeShareChange(row),
              },
            )
            .toList();
  final priority = {
    'new': 0,
    'buy': 0,
    'sold_out': 1,
    'sell': 1,
    'increased': 2,
    'reduced': 3,
    'option_exercise': 4,
    'award': 5,
    'tax_withholding': 6,
    'gift': 7,
  };
  rows.sort((left, right) {
    if (!manager) {
      final dateCompare = text(
        right['date'],
        text(right['filingDate']),
      ).compareTo(text(left['date'], text(left['filingDate'])));
      if (dateCompare != 0) return dateCompare;
      return tradeDisplayAmount(right).compareTo(tradeDisplayAmount(left));
    }
    final leftPriority = priority[text(left['action'])] ?? 9;
    final rightPriority = priority[text(right['action'])] ?? 9;
    if (leftPriority != rightPriority) {
      return leftPriority.compareTo(rightPriority);
    }
    final leftValue = tradeDisplayAmount(left);
    final rightValue = tradeDisplayAmount(right);
    return rightValue.compareTo(leftValue);
  });
  return rows;
}

double tradeDisplayAmount(Map<String, dynamic> row) {
  final values = [
    number(row['value']),
    number(row['notional']),
    number(row['estimatedValue']),
    number(row['previousValue']),
  ].where((value) => value > 0).toList();
  if (values.isNotEmpty) return values.reduce(math.max);

  final shares = tradeShareChange(row).abs();
  final price = number(row['price']);
  if (shares > 0 && price > 0) return shares * price;
  return 0;
}

double tradeShareChange(Map<String, dynamic> row) {
  final change = number(row['changeShares']);
  if (change != 0) return change;
  final shares = number(row['shares']);
  if (shares == 0) return 0;
  final action = text(row['action']);
  if (action == 'sell' || action == 'reduced' || action == 'sold_out') {
    return -shares.abs();
  }
  return shares;
}

Color tradeToneColor(String action, Palette palette) {
  if (action == 'new' || action == 'increased' || action == 'buy') {
    return palette.positive;
  }
  if (action == 'reduced' || action == 'sold_out' || action == 'sell') {
    return palette.negative;
  }
  return palette.muted;
}

String formatSignedNumber(double value) {
  if (!value.isFinite || value == 0) return '0';
  final sign = value > 0 ? '+' : '';
  return '$sign${formatNumber(value)}';
}

String filingLag(Map<String, dynamic> summary) {
  final report = DateTime.tryParse(text(summary['reportDate']));
  final filing = DateTime.tryParse(text(summary['filingDate']));
  if (report == null || filing == null) return '13F';
  return '${filing.difference(report).inDays}d';
}

String filingLagVerbose(Map<String, dynamic> summary) {
  final report = DateTime.tryParse(text(summary['reportDate']));
  final filing = DateTime.tryParse(text(summary['filingDate']));
  if (report == null || filing == null) return '13F';
  return '${filing.difference(report).inDays} days';
}

String reportQuarterLabel(String value) {
  final date = DateTime.tryParse(value);
  if (date == null) return value.isEmpty ? '-' : value;
  final quarter = ((date.month - 1) ~/ 3) + 1;
  return '${date.year}/Q$quarter';
}

String compactStrategy(String value) {
  final cleaned = value
      .replaceAll(RegExp(r'\s+'), ' ')
      .replaceAll(RegExp(r'\bcompounders\b', caseSensitive: false), '')
      .replaceAll(RegExp(r'\bportfolio\b', caseSensitive: false), '')
      .trim();
  if (cleaned.isEmpty) return 'Focused';
  return cleaned.length <= 18 ? cleaned : cleaned.substring(0, 18).trim();
}

String toolbarDateLabel(String generatedAt) {
  final date = DateTime.tryParse(generatedAt)?.toLocal() ?? DateTime.now();
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  final day = weekdays[date.weekday - 1];
  return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')} ($day)';
}

String userInitials(String value) {
  final words = value
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();
  if (words.isEmpty) return 'YL';
  if (words.length == 1) {
    return words.first.characters.take(2).toString().toUpperCase();
  }
  return '${words.first.characters.first}${words.last.characters.first}'
      .toUpperCase();
}

bool trailingWindowSelected(
  List<Map<String, dynamic>> equity,
  RangeValues? range,
  int years,
) {
  if (range == null || equity.length < 3) return false;
  final lastDate = DateTime.tryParse(text(equity.last['date']));
  if (lastDate == null) return false;
  final target = DateTime(lastDate.year - years, lastDate.month, lastDate.day);
  var expected = 0;
  for (var i = 0; i < equity.length; i += 1) {
    final date = DateTime.tryParse(text(equity[i]['date']));
    if (date != null && !date.isBefore(target)) {
      expected = i;
      break;
    }
  }
  return (range.start.round() - expected).abs() <= 2 &&
      range.end.round() >= equity.length - 3;
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

String formatValuationMethodValue(Map<String, dynamic> card, String currency) {
  final rawValue = firstNumber([card['value'], card['amount'], card['score']]);
  if (rawValue == null) return '-';
  final format = text(card['format']).toLowerCase();
  if (format.contains('currency') || format.contains('price')) {
    return formatCurrencyValue(rawValue, text(card['currency'], currency));
  }
  if (format.contains('percent') || format.contains('ratio')) {
    final normalized = rawValue.abs() > 3 ? rawValue / 100 : rawValue;
    return formatReturn(normalized);
  }
  if (rawValue.abs() >= 1000) return formatNumber(rawValue);
  return rawValue.toStringAsFixed(rawValue.abs() >= 10 ? 1 : 2);
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

String formatMillions(double? value) {
  if (value == null || !value.isFinite) return '-';
  final abs = value.abs();
  final sign = value < 0 ? '-' : '';
  if (abs >= 1000) {
    final scaled = abs / 1000;
    return '$sign${scaled.toStringAsFixed(scaled >= 10 ? 1 : 2)}B';
  }
  return '$sign${abs.toStringAsFixed(abs >= 100 ? 0 : 1)}M';
}

String formatSharesMillions(double? value) {
  if (value == null || !value.isFinite) return '-';
  final abs = value.abs();
  final sign = value < 0 ? '-' : '';
  if (abs >= 1000) {
    final scaled = abs / 1000;
    return '$sign${scaled.toStringAsFixed(scaled >= 10 ? 1 : 2)}B sh';
  }
  return '$sign${abs.toStringAsFixed(abs >= 100 ? 0 : 1)}M sh';
}

String formatPercentInput(double? value) {
  if (value == null || !value.isFinite) return '-';
  final normalized = value.abs() <= 1.5 ? value * 100 : value;
  final sign = normalized > 0 ? '+' : '';
  return '$sign${normalized.toStringAsFixed(1)}%';
}

List<ValuationQaDatum> valuationQaItems(
  Map<String, dynamic> row,
  Map<String, dynamic>? previous,
  String currency,
) {
  final snapshot = asMap(row['dataSnapshot']);
  final youtube = asMap(snapshot['youtubeEarnings']);
  final qaRows = asList(youtube['qa']);
  return qaRows
      .map((item) {
        final question = text(item['question']);
        final answer = text(item['answer']);
        if (question.isEmpty) return null;
        final askedBy = text(item['askedBy'], text(item['speaker']));
        final askedByZh = text(item['askedByZh'], askedBy);
        final callDate = text(item['callDate']);
        final title = text(item['title']);
        final titleZh = text(item['titleZh'], title);
        final metadata = [
          if (askedBy.isNotEmpty) 'Asked by $askedBy',
          if (callDate.isNotEmpty) formatDate(callDate),
          if (title.isNotEmpty) title,
        ].join(' · ');
        final metadataZh = [
          if (askedByZh.isNotEmpty) '提问人 $askedByZh',
          if (callDate.isNotEmpty) formatDate(callDate),
          if (titleZh.isNotEmpty) titleZh,
        ].join(' · ');
        final body = answer.isNotEmpty
            ? answer
            : 'Management response context is not available in the structured transcript extract.';
        final bodyZh = text(item['answerZh']);
        return ValuationQaDatum(
          question: question,
          answer: body,
          questionZh: text(item['questionZh']),
          answerZh: bodyZh,
          metadata: metadata,
          metadataZh: metadataZh,
        );
      })
      .whereType<ValuationQaDatum>()
      .take(6)
      .toList();
}

String valuationQaEmptyText(Map<String, dynamic> row, bool showChinese) {
  final snapshot = asMap(row['dataSnapshot']);
  final youtube = asMap(snapshot['youtubeEarnings']);
  final coverage = asMap(youtube['qaCoverage']);
  final status = text(coverage['status']);
  final callDate = text(coverage['callDate']);
  final title = text(coverage['title']);
  final source = [
    if (callDate.isNotEmpty) formatDate(callDate),
    if (title.isNotEmpty) title,
  ].join(' · ');
  final suffix = source.isEmpty
      ? ''
      : (showChinese ? '\n来源：$source' : '\nSource: $source');

  if (showChinese) {
    switch (status) {
      case 'locked_preview':
        return '这个季度的电话会 transcript 在当前源里只有锁定预览，没有包含分析师 Q&A；已写入数据库并标记为待补抓。$suffix';
      case 'partial_transcript':
        return '这个季度的 transcript 太短，不足以抽取完整分析师问答；已记录为部分 transcript。$suffix';
      case 'no_segments':
        return '这个季度有电话会记录，但本地 transcript segments 为空；已记录为待重新同步。$suffix';
      case 'transcript_not_in_source':
        return '这个季度本地 transcript 库没有对应电话会，所以无法显示真实分析师问答；已记录为缺失源数据。$suffix';
      case 'qa_parse_miss':
        return '这个季度的 transcript 里有疑似问题文本，但没有可靠识别出“分析师提问 + 管理层回答”的配对；已标记为解析待修。$suffix';
      case 'has_qa':
        return '数据库标记这个季度应该有 Q&A，但前端没有收到可渲染的问题；请重新同步 valuation Q&A。$suffix';
      default:
        return '这个季度没有可用的结构化分析师问答；数据库会保留具体覆盖状态，等待补抓或重跑解析。$suffix';
    }
  }

  switch (status) {
    case 'locked_preview':
      return 'This quarter has only a locked transcript preview in the current source, so analyst Q&A is not available yet.$suffix';
    case 'partial_transcript':
      return 'The stored transcript is too short to extract a complete analyst Q&A section.$suffix';
    case 'no_segments':
      return 'The earnings-call record exists, but transcript segments are missing.$suffix';
    case 'transcript_not_in_source':
      return 'No matching earnings-call transcript is stored locally for this valuation quarter yet.$suffix';
    case 'qa_parse_miss':
      return 'The transcript contains question-like text, but the parser could not safely pair analyst questions with management answers.$suffix';
    case 'has_qa':
      return 'This quarter is marked as having Q&A, but no renderable question reached the client. Please resync valuation Q&A.$suffix';
    default:
      return 'No structured analyst Q&A is available for this quarter yet; the database keeps the coverage reason for follow-up.$suffix';
  }
}

String valuationWeightSummary(Map<String, dynamic> row) {
  final methods = asList(row['methodOutputs']);
  final snapshot = asMap(row['dataSnapshot']);
  final semantics = asMap(snapshot['valuationSemantics']);
  final scoreInputs = asMap(semantics['scoreInputs']);
  final weights = asMap(scoreInputs['methodWeights']);
  if (weights.isNotEmpty) {
    return weights.entries
        .take(4)
        .map((entry) {
          final key = entry.key;
          final label = valuationMethodLabel(methods, key);
          final value = firstNumber([entry.value]);
          return '$label ${formatPercentInput(value)}';
        })
        .join(' / ');
  }
  for (final method in methods) {
    if (text(method['key']).toLowerCase().contains('weight')) {
      return text(method['description'], text(method['label']));
    }
  }
  return 'no explicit method-weight map was returned for this quarter';
}

String valuationMethodLabel(List<Map<String, dynamic>> methods, String key) {
  for (final method in methods) {
    if (text(method['key']) == key) {
      final label = text(method['label'], key);
      return label.length <= 24 ? label : '${label.substring(0, 21)}...';
    }
  }
  return key.replaceAll('-', ' ');
}

List<DbmfAsset> dbmfAssetsFromRows(
  List<Map<String, dynamic>> rows, {
  String previousDate = '',
}) {
  return rows
      .map((row) {
        final name = text(
          row['asset_name'],
          text(
            row['assetName'],
            text(row['securityName'], text(row['ticker'], 'Unknown sleeve')),
          ),
        );
        final key = text(
          row['asset_key'],
          text(row['assetKey'], text(row['ticker'])),
        ).toLowerCase();
        final marketValue =
            firstNumber([row['market_value'], row['marketValue'], row['mv']]) ??
            0;
        final exposure = normalizeDbmfRatio(
          firstNumber([row['exposure'], row['weight'], row['pct']]) ?? 0,
        );
        final previousExposure = firstNumber([
          row['previous_exposure'],
          row['previousExposure'],
          row['previous_weight'],
          row['previousWeight'],
        ]);
        return DbmfAsset(
          name: name,
          key: key,
          marketValue: marketValue,
          exposure: exposure,
          previousExposure: previousExposure == null
              ? null
              : normalizeDbmfRatio(previousExposure),
          previousDate: text(
            row['previous_date'],
            text(row['previousDate'], previousDate),
          ),
          componentCount:
              firstNumber([
                row['component_count'],
                row['componentCount'],
              ])?.round() ??
              0,
        );
      })
      .where((asset) => asset.name.trim().isNotEmpty)
      .toList()
    ..sort((a, b) => b.exposure.abs().compareTo(a.exposure.abs()));
}

double normalizeDbmfRatio(double value) {
  if (!value.isFinite) return 0;
  return value.abs() > 3 ? value / 100 : value;
}

String formatDbmfPercent(double value) => formatReturn(value);

String dbmfLatestDate(
  Map<String, dynamic> latestExposure,
  Map<String, dynamic> latestSnapshot,
  Map<String, dynamic> summary,
) {
  return text(
    latestExposure['date'],
    text(
      latestExposure['asOfDate'],
      text(
        latestExposure['latest_date'],
        text(
          latestSnapshot['date'],
          text(summary['latestDate'], text(summary['asOfDate'])),
        ),
      ),
    ),
  );
}

List<ValuationRow> valuationRowsFromTickers(
  List<Map<String, dynamic>> tickers,
) {
  return tickers
      .map((ticker) {
        final latest = asMap(ticker['latest']);
        final quality = asMap(ticker['dataQuality']);
        final inputAudit = asMap(quality['modelInputAudit']);
        final unifiedAudit = asMap(quality['unifiedValuationAudit']);
        final consensus = asMap(unifiedAudit['externalConsensus']);
        final consensusCheck = asMap(unifiedAudit['externalConsensusCheck']);
        final currency = text(
          ticker['currency'],
          text(consensus['currency'], 'USD'),
        );
        final latestPrice =
            firstNumber([latest['latestPrice'], consensus['currentPrice']]) ??
            0;
        final fairValue =
            firstNumber([
              latest['baseFairValue'],
              asList(ticker['scenarios']).isNotEmpty
                  ? asList(ticker['scenarios']).first['fairValue']
                  : null,
            ]) ??
            0;
        final upside =
            firstNumber([latest['upsideToBase']]) ??
            (latestPrice > 0 && fairValue > 0
                ? fairValue / latestPrice - 1
                : 0);
        return ValuationRow(
          ticker: text(ticker['ticker'], text(ticker['symbol'])).toUpperCase(),
          name: text(
            ticker['companyName'],
            text(ticker['name'], text(ticker['description'], 'Company')),
          ),
          sector: compactValuationSector(
            text(ticker['sector'], 'Unclassified'),
          ),
          currency: currency,
          latestPrice: latestPrice,
          fairValue: fairValue,
          upside: upside,
          targetPrice3Y: firstNumber([latest['targetPrice3Y']]) ?? fairValue,
          expectedReturn3Y: firstNumber([latest['expectedReturn3Y']]) ?? 0,
          latestPriceDate: text(latest['latestPriceDate']),
          coverageKind: text(
            quality['valuationCoverageKind'],
            text(quality['coverageKind']),
          ),
          auditStatus: text(inputAudit['status'], text(unifiedAudit['status'])),
          consensusStatus: text(consensusCheck['status']),
          consensusUpside: nullableNumber(consensus['impliedUpside']),
        );
      })
      .where((row) => row.ticker.isNotEmpty)
      .toList()
    ..sort((a, b) => b.upside.compareTo(a.upside));
}

double medianDouble(List<double> values) {
  final finite = values.where((value) => value.isFinite).toList()..sort();
  if (finite.isEmpty) return 0;
  final middle = finite.length ~/ 2;
  if (finite.length.isOdd) return finite[middle];
  return (finite[middle - 1] + finite[middle]) / 2;
}

Color valuationTone(double upside, Palette palette) {
  if (upside >= .05) return palette.positive;
  if (upside <= -.05) return palette.negative;
  return palette.secondary;
}

String compactValuationSector(String value) {
  final cleaned = value.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (cleaned.length <= 42) return cleaned;
  final firstSegment = cleaned.split('/').first.trim();
  if (firstSegment.length >= 8 && firstSegment.length <= 42) {
    return firstSegment;
  }
  return '${cleaned.substring(0, 39).trim()}...';
}
