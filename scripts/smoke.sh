#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_HOME="$(mktemp -d)"
TMP_BIN="$TMP_HOME/bin"

cleanup() {
  rm -rf "$TMP_HOME"
}
trap cleanup EXIT

mkdir -p "$TMP_BIN"
export HOME="$TMP_HOME"
export PATH="$TMP_BIN:$PATH"

cat > "$TMP_BIN/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--version" ]]; then
  echo "codex-cli fake-0.0.0"
  exit 0
fi

if [[ "${1:-}" == "--fail" ]]; then
  echo "fake codex failed" >&2
  exit 2
fi

echo "fake codex $*"
exit 0
EOF
chmod +x "$TMP_BIN/codex"

run() {
  node "$ROOT_DIR/bin/tasktone.js" "$@"
}

run init

cat > "$HOME/.tasktone/config.json" <<'EOF'
{
  "sound": {
    "attention_required": "sounds/attention.wav",
    "task_completed": "sounds/done.wav",
    "task_failed": "sounds/error.wav"
  },
  "desktopNotification": false,
  "debounceMs": 0
}
EOF

run install claude
run install codex
run doctor >/dev/null

grep -q '"Notification"' "$HOME/.claude/settings.json"
grep -q '"Stop"' "$HOME/.claude/settings.json"
grep -q 'notify = ' "$HOME/.codex/config.toml"
grep -q 'command -v tasktone' "$HOME/.tasktone/hooks/codex-notify.sh"

run notify --event task_completed | grep -q '已发送通知'
run run codex --version >/dev/null

if run run codex --fail >/dev/null 2>&1; then
  echo "expected run codex --fail to return non-zero" >&2
  exit 1
fi

echo "smoke tests passed"
