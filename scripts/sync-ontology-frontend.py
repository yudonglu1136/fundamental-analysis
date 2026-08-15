#!/usr/bin/env python3
"""Sync the standalone Ontology UI into Guru's Flutter web assets."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


SOURCE_FETCH = """async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}"""

AUTHENTICATED_FETCH = """const supabaseProjectRef = "__GURU_SUPABASE_PROJECT_REF__";
const authRetryKey = "guru-ontology-auth-retry";
const authRetryWindowMs = 10_000;
let authRedirectStarted = false;

function ontologyReturnPath() {
  const path = `${location.pathname}${location.search}${location.hash}`;
  return path.startsWith("/ontology") ? path : "/ontology/";
}

function redirectToGuruAuth() {
  const previousAttempt = Number(sessionStorage.getItem(authRetryKey) || 0);
  if (authRedirectStarted || Date.now() - previousAttempt < authRetryWindowMs) return false;
  authRedirectStarted = true;
  sessionStorage.setItem(authRetryKey, String(Date.now()));
  const loginUrl = new URL("/", location.origin);
  loginUrl.searchParams.set("returnTo", ontologyReturnPath());
  location.replace(loginUrl.toString());
  return true;
}

async function getJson(url) {
  const accessToken = readSupabaseAccessToken();
  if (!accessToken) {
    redirectToGuruAuth();
    throw new Error("正在验证登录状态…");
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.ok) {
    sessionStorage.removeItem(authRetryKey);
    return response.json();
  }
  if (response.status === 401 && redirectToGuruAuth()) {
    throw new Error("登录已过期，正在重新验证…");
  }
  const payload = await response.json().catch(() => ({}));
  const message = response.status === 401
    ? "登录验证失败，请返回 Guru 重新登录"
    : (payload.message || payload.error || response.statusText);
  throw new Error(`${response.status} ${message}`);
}

function readSupabaseAccessToken() {
  const findToken = (value, depth = 0) => {
    if (!value || depth > 4) return "";
    if (typeof value === "object" && typeof value.access_token === "string") {
      return value.access_token;
    }
    if (typeof value !== "object") return "";
    for (const child of Object.values(value)) {
      const token = findToken(child, depth + 1);
      if (token) return token;
    }
    return "";
  };
  if (!/^[a-z0-9]+$/i.test(supabaseProjectRef)) return "";
  const storageKey = `sb-${supabaseProjectRef}-auth-token`;
  try {
    return findToken(JSON.parse(localStorage.getItem(storageKey) || "null"));
  } catch {
    return "";
  }
}"""

BACK_LINK_CSS = """

.guru-back-link {
  flex: 0 0 auto;
  margin-left: 8px;
  padding-left: 14px;
  border-left: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
}

.guru-back-link:hover,
.guru-back-link:focus-visible {
  color: var(--accent);
}
"""


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=str(
            Path.home()
            / "Documents"
            / "jansen_us_firm_replication"
            / "ai_ontology"
            / "frontend"
        ),
    )
    parser.add_argument("--destination", default="web/ontology")
    args = parser.parse_args()
    source = Path(args.source).expanduser().resolve()
    destination = Path(args.destination).expanduser().resolve()
    required = ["index.html", "app.js", "styles.css", "favicon.svg"]
    missing = [name for name in required if not (source / name).is_file()]
    if missing:
        raise SystemExit(f"Ontology frontend is incomplete: {', '.join(missing)}")

    destination.mkdir(parents=True, exist_ok=True)
    for name in required:
        shutil.copyfile(source / name, destination / name)

    index_path = destination / "index.html"
    index = index_path.read_text(encoding="utf-8")
    redirect_start = index.find("    <script>\n      if (window.location.protocol")
    if redirect_start >= 0:
        redirect_end = index.find("    </script>\n", redirect_start)
        if redirect_end >= 0:
            index = index[:redirect_start] + index[redirect_end + len("    </script>\n") :]
    index = index.replace('href="/static/favicon.svg"', 'href="./favicon.svg"')
    index = index.replace('href="/static/styles.css?v=7"', 'href="./styles.css?v=4"')
    index = index.replace('src="/static/app.js?v=7"', 'src="./app.js?v=4"')
    anchor = '          <p id="data-status">正在连接本地 Sharadar 数据库…</p>\n        </div>'
    replacement = anchor + '\n        <a class="guru-back-link" href="/" title="返回 Guru Intelligence">← Guru</a>'
    if anchor not in index:
        raise SystemExit("Could not locate the Ontology brand block in index.html")
    index_path.write_text(index.replace(anchor, replacement, 1), encoding="utf-8")

    app_path = destination / "app.js"
    app = app_path.read_text(encoding="utf-8")
    if SOURCE_FETCH not in app:
        raise SystemExit("Could not locate getJson() in the source Ontology app")
    app_path.write_text(app.replace(SOURCE_FETCH, AUTHENTICATED_FETCH, 1), encoding="utf-8")

    styles_path = destination / "styles.css"
    styles = styles_path.read_text(encoding="utf-8")
    styles_path.write_text(styles.rstrip() + BACK_LINK_CSS, encoding="utf-8")

    manifest = {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "source": "jansen_us_firm_replication/ai_ontology/frontend",
        "source_sha256": {name: sha256(source / name) for name in required},
    }
    (destination / "source-version.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
