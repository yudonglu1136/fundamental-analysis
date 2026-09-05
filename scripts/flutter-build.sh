#!/usr/bin/env bash
set -euo pipefail

load_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    if [ -z "$line" ] || [[ "$line" == \#* ]] || [[ "$line" != *=* ]]; then
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"

    if [ -n "$key" ] && [ -n "$value" ] && [ -z "${!key+x}" ]; then
      export "$key=$value"
    fi
  done < "$file"
}

load_env_file ".env.production.local"
load_env_file ".vercel/.env.production.local"

defines=()

add_define() {
  local key="$1"
  local value="$2"
  if [ -n "$value" ]; then
    defines+=("--dart-define=$key=$value")
  fi
}

add_define "SUPABASE_URL" "${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
add_define "SUPABASE_ANON_KEY" "${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}"
add_define "AUTH_DEV_BYPASS" "${AUTH_DEV_BYPASS:-${VITE_AUTH_DEV_BYPASS:-false}}"

resolved_auth_bypass="${AUTH_DEV_BYPASS:-${VITE_AUTH_DEV_BYPASS:-false}}"
resolved_supabase_url="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
resolved_supabase_key="${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}"

if [ "${resolved_auth_bypass}" != "true" ]; then
  if [ -z "$resolved_supabase_url" ] || [ -z "$resolved_supabase_key" ]; then
    echo "Missing production Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY, or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." >&2
    exit 1
  fi
fi

node scripts/build-public-research.mjs --check
rm -rf dist
flutter build web --release --base-href / --output dist --no-wasm-dry-run "${defines[@]}"

if [ -f "dist/ontology/app.js" ]; then
  ontology_project_ref=""
  if [ -n "$resolved_supabase_url" ]; then
    ontology_project_ref="$(python3 - "$resolved_supabase_url" <<'PY'
import sys
from urllib.parse import urlparse

host = urlparse(sys.argv[1]).hostname or ""
print(host.split(".", 1)[0])
PY
)"
  fi
  ONTOLOGY_PROJECT_REF="$ontology_project_ref" ONTOLOGY_AUTH_DEV_BYPASS="$resolved_auth_bypass" python3 - <<'PY'
import os
from pathlib import Path

path = Path("dist/ontology/app.js")
source = path.read_text(encoding="utf-8")
markers = {
    "__GURU_SUPABASE_PROJECT_REF__": os.environ["ONTOLOGY_PROJECT_REF"],
    "__GURU_AUTH_DEV_BYPASS__": os.environ["ONTOLOGY_AUTH_DEV_BYPASS"],
}
for marker, value in markers.items():
    if marker not in source:
        raise SystemExit(f"Ontology build marker is missing: {marker}")
    source = source.replace(marker, value)
path.write_text(source, encoding="utf-8")
PY
fi
