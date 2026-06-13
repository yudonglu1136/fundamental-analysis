#!/usr/bin/env bash
set -euo pipefail

flutter_root="${VERCEL_FLUTTER_ROOT:-$PWD/.vercel/flutter}"
if ! command -v flutter >/dev/null 2>&1 && [ -x "$flutter_root/bin/flutter" ]; then
  export PATH="$flutter_root/bin:$PATH"
fi

flutter --version
flutter pub get
npm run build
