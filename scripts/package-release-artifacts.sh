#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="release-artifacts"
DIST_ZIP="${OUT_DIR}/workflow-editor-${VERSION}-dist.zip"

if [ ! -d dist ]; then
  echo "dist/ is missing; run npm run build first" >&2
  exit 1
fi

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

npm pack --pack-destination "${OUT_DIR}"

zip -qr "${DIST_ZIP}" \
  dist \
  schemas \
  package.json \
  README.md \
  LICENSE \
  CHANGELOG.md

echo "Created release artifacts:"
find "${OUT_DIR}" -maxdepth 1 -type f -print | sort
