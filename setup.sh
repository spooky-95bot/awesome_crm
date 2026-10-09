#!/usr/bin/env bash
# setup.sh — active le hook pre-commit (anti-traces turques) pour ce clone.
# À lancer après chaque clone :  bash setup.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

git config core.hooksPath git-hooks
echo "✓ Hook pre-commit activé (core.hooksPath = git-hooks)"
echo "  Refuse : Türkçe, TRY (mot entier), Istanbul, Turkey, meliksahk, ğ ı ş İ"
