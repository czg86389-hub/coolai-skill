#!/usr/bin/env bash
# COOL AI skill installer (macOS / Linux / Git Bash).
#   bash install.sh            install for every supported tool found on this machine
#   bash install.sh claude     only one: claude | codex | workbuddy | dsh | agents
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)/skills/coolai"
[ -f "$SRC/SKILL.md" ] || { echo "skills/coolai/SKILL.md not found next to install.sh"; exit 1; }
declare -A DIRS=(
  [claude]="$HOME/.claude/skills"
  [codex]="${CODEX_HOME:-$HOME/.codex}/skills"
  [workbuddy]="$HOME/.workbuddy/skills"
  [dsh]="${DSH_HOME:-$HOME/.dsh}/skills"
  [agents]="$HOME/.agents/skills"
)
install_one() {
  local dst="${DIRS[$1]}/coolai"
  mkdir -p "$dst"
  rm -rf "$dst/scripts" "$dst/references" "$dst/SKILL.md"
  cp -R "$SRC/." "$dst/"
  echo "已安装 / installed: $dst"
}
if [ $# -gt 0 ]; then
  for t in "$@"; do
    [ -n "${DIRS[$t]:-}" ] || { echo "unknown tool: $t (use claude | codex | workbuddy | dsh | agents)"; exit 1; }
    install_one "$t"
  done
else
  n=0
  for t in claude codex workbuddy dsh; do
    if [ -d "$(dirname "${DIRS[$t]}")" ]; then install_one "$t"; n=$((n+1)); fi
  done
  [ $n -gt 0 ] || { echo "没找到支持的工具，请指定一个 / No supported tool found, name one: bash install.sh claude   (codex / workbuddy / dsh)"; exit 1; }
fi
command -v node >/dev/null 2>&1 || echo "注意：需要 Node.js 18 或以上 / Note: Node.js 18+ is required: https://nodejs.org"
echo "安装完成。重启工具后说：「用 COOL AI 做一条产品视频」"
echo "Done. Restart the tool, then say: \"use COOL AI to make a product video\""
