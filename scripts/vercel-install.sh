#!/usr/bin/env bash
set -euo pipefail

flutter_version="${FLUTTER_VERSION:-3.44.1}"
flutter_root="${VERCEL_FLUTTER_ROOT:-$PWD/.vercel/flutter}"

npm ci --omit=dev

if command -v flutter >/dev/null 2>&1; then
  flutter --version
  exit 0
fi

case "$(uname -s)" in
  Linux) os="linux" ;;
  *)
    echo "Unsupported OS for Flutter bootstrap: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch="" ;;
  arm64|aarch64) arch="_arm64" ;;
  *)
    echo "Unsupported architecture for Flutter bootstrap: $(uname -m)" >&2
    exit 1
    ;;
esac

archive="flutter_${os}${arch}_${flutter_version}-stable.tar.xz"
url="https://storage.googleapis.com/flutter_infra_release/releases/stable/${os}/${archive}"

mkdir -p "$flutter_root"
if [ ! -x "$flutter_root/bin/flutter" ]; then
  tmp_archive="$(mktemp)"
  curl -fL "$url" -o "$tmp_archive"
  tar -xJf "$tmp_archive" -C "$flutter_root" --strip-components=1
  rm -f "$tmp_archive"
fi

export PATH="$flutter_root/bin:$PATH"
flutter --version
