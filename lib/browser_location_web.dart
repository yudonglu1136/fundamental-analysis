import 'package:web/web.dart' as web;

// Only a display preference is persisted, never portfolio values or credentials.
bool readPortfolioPrivacyPreference() {
  try {
    return web.window.localStorage.getItem(
          'thesisforge.portfolio.privacy.v1',
        ) ==
        'on';
  } catch (_) {
    return true; // Do not reveal amounts when a saved preference cannot be read.
  }
}

bool writePortfolioPrivacyPreference(bool hidden) {
  try {
    web.window.localStorage.setItem(
      'thesisforge.portfolio.privacy.v1',
      hidden ? 'on' : 'off',
    );
    return true;
  } catch (_) {
    return false;
  }
}

Map<String, String> readBrowserQuery() => Uri.base.queryParameters;

String readBrowserPath() => Uri.base.path;

void replaceBrowserQuery(
  Map<String, String?> updates, {
  bool replaceCurrent = false,
}) {
  final current = Uri.base;
  final nextParams = Map<String, String>.from(current.queryParameters);
  for (final entry in updates.entries) {
    final value = entry.value?.trim() ?? '';
    if (value.isEmpty) {
      nextParams.remove(entry.key);
    } else {
      nextParams[entry.key] = value;
    }
  }

  final path = current.path.isEmpty ? '/' : current.path;
  final next = Uri(
    path: path,
    queryParameters: nextParams.isEmpty ? null : nextParams,
    fragment: current.fragment.isEmpty ? null : current.fragment,
  ).toString();

  final currentRelative =
      '$path${current.hasQuery ? '?${current.query}' : ''}${current.hasFragment ? '#${current.fragment}' : ''}';
  if (next == currentRelative) return;
  if (replaceCurrent) {
    web.window.history.replaceState(null, web.document.title, next);
  } else {
    web.window.history.pushState(null, web.document.title, next);
  }
}

void openBrowserPath(String path) {
  web.window.location.href = path;
}
