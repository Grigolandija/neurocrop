#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "Klaida: kompiuteryje nerasta git komanda."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Klaida: kompiuteryje nerasta pnpm komanda."
  echo "Pirmiausia įdiekite Node.js ir pnpm."
  exit 1
fi

echo "1/3 Gaunami naujausi GitHub pakeitimai..."
git pull --ff-only

echo "2/3 Tikrinamos projekto priklausomybės..."
pnpm install --frozen-lockfile

echo "3/3 Kuriama production versija..."
pnpm build

echo
echo "Atnaujinimas paruoštas."
echo "Įkelkite visą dist/ katalogo turinį į hostingo public_html katalogą."
