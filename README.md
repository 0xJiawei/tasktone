# TaskTone

TaskTone is a lightweight notification layer for AI coding agents.

Core value: **Your AI tells you when it needs you.**

## Why this exists

If you use agentic coding tools, you already know the pain:

- You must keep watching the terminal to catch completion/errors.
- You miss "needs your input" moments while multitasking.
- Different tools emit different lifecycle signals.

TaskTone solves this with one tiny CLI layer that maps tool-specific signals
into a unified event model and plays sound/desktop notifications.

## What TaskTone does

- Unified events:
  - `attention_required`
  - `task_completed`
  - `task_failed`
- Notification channels:
  - Sound (`afplay`) required on macOS
  - Desktop notification (`osascript`) optional
  - Debounce to avoid notification spam
- Tool adapters (MVP):
  - Claude Code hooks
  - Codex notify hook (best-effort) + wrapper fallback

## Install (Beginner Friendly)

### Prerequisites

- macOS (MVP target)
- Node.js + npm installed

### 1) Global install

```bash
npm install -g tasktone
```

### 2) Verify command works

```bash
tasktone --help
```

If command is not found, restart your terminal and try again.

## 3-minute setup

### 1) Initialize TaskTone

```bash
tasktone init
```

This creates:

- `~/.tasktone/config.json`
- `~/.tasktone/hooks/`
- `~/.tasktone/sounds/`

### 2) Connect Claude Code

```bash
tasktone install claude
```

This writes hook scripts and updates `~/.claude/settings.json`.

### 3) Connect Codex

```bash
tasktone install codex
```

This tries to configure `notify` in `~/.codex/config.toml`.
If notify is not stable in your Codex build, use wrapper mode:

```bash
tasktone run codex ...
```

## Daily usage

After setup, keep using Claude/Codex normally.
TaskTone runs through installed hooks in the background.

You can also trigger notifications manually:

```bash
tasktone notify --event task_completed
```

## Command reference

```bash
tasktone init
tasktone install claude
tasktone install codex
tasktone run codex ...
tasktone notify --event <attention_required|task_completed|task_failed>
tasktone doctor
tasktone doctor --test-notify
tasktone test
tasktone status
```

## Debugging and troubleshooting

TaskTone includes a built-in doctor command:

```bash
tasktone doctor
```

This checks:

- config presence + JSON validity
- sound/desktop notifier dependencies
- hook files and executable permissions
- Codex and Claude integration wiring
- PATH visibility for `tasktone`/`codex`

To send a real diagnostic notification during doctor:

```bash
tasktone doctor --test-notify
```

### Common issues

1. No sound:
   - Run `tasktone doctor`
   - Ensure `afplay` exists and system output volume is not muted
   - Use absolute system sounds in config for stronger signals
2. Codex finished but no alert:
   - Confirm `notify` exists in `~/.codex/config.toml`
   - Re-run `tasktone install codex`
   - If notify is not emitted by your build, use `tasktone run codex ...`
3. Claude hooks not firing:
   - Re-run `tasktone install claude`
   - Check `~/.claude/settings.json` hooks block

## Configuration

Path: `~/.tasktone/config.json`

```json
{
  "sound": {
    "attention_required": "sounds/attention.wav",
    "task_completed": "sounds/done.wav",
    "task_failed": "sounds/error.wav"
  },
  "desktopNotification": true,
  "debounceMs": 3000
}
```

Notes:

- Relative paths are resolved from `~/.tasktone/`
- Missing custom sound files automatically fallback to macOS system sounds

## Architecture

```text
src/
  core/
    event-bus.js
    config.js
    notifier.js
    runtime.js
  adapters/
    claude/
      index.js
    codex/
      index.js
```

Design rule: core stays tool-agnostic, tool-specific logic lives in adapters.

## Limitations (MVP)

- macOS-first
- No GUI
- No cloud services
- No database
- Codex `attention_required` is best-effort depending on upstream notify events

## CI and release

- CI runs smoke tests on GitHub Actions
- Release guide: [RELEASING.md](./RELEASING.md)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## License

MIT
