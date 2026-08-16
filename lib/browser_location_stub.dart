Map<String, String> readBrowserQuery() => Uri.base.queryParameters;

String readBrowserPath() => Uri.base.path;

void replaceBrowserQuery(Map<String, String?> updates) {}

void openBrowserPath(String path) {}
