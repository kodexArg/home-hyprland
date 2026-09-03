#!/usr/bin/env bash
# Fast catalog vs this host. Exit 0 match, 2 mismatch, 1 missing repo.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${HOME}/home-hyprland"
VER="${SKILL_DIR}/VERSION"

fail_missing() { echo "k-hyprland: $1" >&2; exit 1; }
[[ -f "$VER" ]] || fail_missing "no VERSION at $VER"
[[ -d "$REPO/.git" ]] || fail_missing "no git repo at $REPO"

repo_head=$(git -C "$REPO" rev-parse --short HEAD)
stamped=$(awk -F= '/^repo_head=/{print $2}' "$VER")
hypr_tag=$(hyprctl version 2>/dev/null | awk '/^Hyprland /{print $2; exit}' || true)
stamped_hypr=$(awk -F= '/^hyprland_tag=/{print $2}' "$VER" | sed 's/^v//')

echo "k-hyprland catalog repo_head=${stamped} live=${repo_head}"
echo "k-hyprland catalog hyprland_tag=${stamped_hypr:-?} live=${hypr_tag:-offline}"

mismatch=0
[[ "$repo_head" == "$stamped" ]] || mismatch=1
if [[ -n "$hypr_tag" && -n "$stamped_hypr" && "$hypr_tag" != "$stamped_hypr" ]]; then
  mismatch=1
fi
if [[ "$mismatch" -eq 1 ]]; then
  echo "k-hyprland: MISMATCH — refresh catalog (wiki + repo), then continue if that fails"
  exit 2
fi
echo "k-hyprland: MATCH"
exit 0
