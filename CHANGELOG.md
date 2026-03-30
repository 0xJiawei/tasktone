# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Codex signal mapping is now more tolerant to schema changes and unknown notify payloads:
  - still maps explicit failures to `task_failed`
  - best-effort maps unknown payload objects to `attention_required`

## [0.1.2] - 2026-03-30

### Added
- New `tasktone doctor` command for automatic environment and integration diagnostics.
- `tasktone doctor --test-notify` to emit a real diagnostic notification.

### Changed
- README rewritten in English with clearer pain points, beginner-friendly setup, and debugging guide.

## [0.1.1] - 2026-03-26

### Added
- `RELEASING.md` with a repeatable publish checklist.
- GitHub Actions smoke workflow at `.github/workflows/ci.yml`.
- `scripts/smoke.sh` for local/CI CLI smoke validation.

### Changed
- Hook scripts now use a portable invocation strategy:
  - prefer `tasktone notify ...`
  - fallback to `node <entry> notify ...` if `tasktone` is unavailable in `PATH`
- Release scripts now pin npm cache to `./.npm-cache` to avoid host cache permission issues.

## [0.1.0] - 2026-03-26

### Added
- Initial TaskTone MVP CLI with commands:
  - `init`
  - `install claude`
  - `install codex`
  - `run codex ...`
  - `notify --event ...`
  - `test`
  - `status`
- Unified event model:
  - `attention_required`
  - `task_completed`
  - `task_failed`
- Core runtime modules:
  - event bus
  - config loader
  - notifier with debounce
- Claude adapter:
  - writes hooks to `~/.tasktone/hooks/`
  - updates `~/.claude/settings.json`
  - maps `Notification`, `Stop`, `StopFailure`
- Codex adapter:
  - attempts notify-hook setup in `~/.codex/config.toml`
  - wrapper mode for process-exit based completion/failure
- macOS notifications:
  - sound playback via `afplay`
  - optional desktop notifications via `osascript`
- GitHub Actions smoke CI
- Release scripts:
  - `npm run release:check`
  - `npm run release:publish`

### Changed
- Hook scripts now prefer calling `tasktone` directly for better portability.
- Hook scripts fall back to `node <entry>` if `tasktone` is unavailable in `PATH`.
