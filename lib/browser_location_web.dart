import 'package:web/web.dart' as web;

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
