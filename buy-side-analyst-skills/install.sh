#!/usr/bin/env bash
set -euo pipefail
DEST="${HOME}/.agents/skills"
mkdir -p "$DEST"
for d in bs-*; do
  if [ -d "$d" ]; then
    rm -rf "$DEST/$d"
    cp -R "$d" "$DEST/"
    echo "Installed $d -> $DEST/$d"
  fi
done
echo "Done. Restart Codex if the skills do not appear. Use /skills or type $ to invoke."
