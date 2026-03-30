const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ensureTaskToneDirectories } = require("../../core/config");
const { updateTopLevelNotifyToml } = require("../../utils/toml-edit");
const { buildTasktoneNotifyScript } = require("../../utils/hook-command");

function getCodexConfigPath(homeDir) {
  return path.join(homeDir, ".codex", "config.toml");
}

function mapCodexSignal(rawSignal) {
  if (!rawSignal || typeof rawSignal !== "object") {
    return null;
  }

  if (rawSignal.type === "agent-turn-complete") {
    return "attention_required";
  }

  const signalText = [
    rawSignal.type,
    rawSignal.event,
    rawSignal.name,
    rawSignal.status,
    rawSignal.title,
    rawSignal.message
  ]
    .filter((value) => typeof value === "string")
    .join(" ");

  if (/(error|fail|failed|exception|panic)/i.test(signalText)) {
    return "task_failed";
  }

  if (
    /(notify|notification|attention|required|input|required|confirm|approval|agent-turn-complete)/i.test(
      signalText
    )
  ) {
    return "attention_required";
  }

  // Best-effort fallback for Codex notify payloads that do not expose a stable schema yet.
  if (Object.keys(rawSignal).length > 0) {
    return "attention_required";
  }

  return null;
}

function codexSupportsNotify(homeDir) {
  if (fs.existsSync(getCodexConfigPath(homeDir))) {
    return true;
  }
  const probe = spawnSync("codex", ["--version"], { stdio: "ignore" });
  if (probe.error && probe.error.code === "ENOENT") {
    return false;
  }
  return true;
}

function createCodexNotifyScript(scriptPath, tasktoneInvocation) {
  const commandArgs = 'notify --adapter codex --raw-json "$JSON_PAYLOAD"';
  const content = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'JSON_PAYLOAD="${1:-}"'
  ]
    .concat(buildTasktoneNotifyScript(tasktoneInvocation, commandArgs))
    .join("\n");

  fs.writeFileSync(scriptPath, `${content}\n`, { mode: 0o755 });
  fs.chmodSync(scriptPath, 0o755);
}

function installCodexAdapter(options) {
  const homeDir = options.homeDir;
  const tasktoneInvocation = options.tasktoneInvocation;

  ensureTaskToneDirectories(homeDir);

  const supported = codexSupportsNotify(homeDir);
  const codexConfigPath = getCodexConfigPath(homeDir);

  const hookDir = path.join(homeDir, ".tasktone", "hooks");
  const codexHookPath = path.join(hookDir, "codex-notify.sh");
  createCodexNotifyScript(codexHookPath, tasktoneInvocation);

  if (!supported) {
    return {
      codexConfigPath,
      codexHookPath,
      configured: false
    };
  }

  const codexConfigDir = path.dirname(codexConfigPath);
  fs.mkdirSync(codexConfigDir, { recursive: true });

  const existing = fs.existsSync(codexConfigPath)
    ? fs.readFileSync(codexConfigPath, "utf8")
    : "";
  const updated = updateTopLevelNotifyToml(existing, codexHookPath);
  fs.writeFileSync(codexConfigPath, updated, "utf8");

  return {
    codexConfigPath,
    codexHookPath,
    configured: true
  };
}

function isCodexInstalled(homeDir) {
  const codexConfigPath = getCodexConfigPath(homeDir);
  if (!fs.existsSync(codexConfigPath)) {
    return false;
  }

  const text = fs.readFileSync(codexConfigPath, "utf8");
  return /^\s*notify\s*=.*/m.test(text);
}

module.exports = {
  codexSupportsNotify,
  getCodexConfigPath,
  installCodexAdapter,
  isCodexInstalled,
  mapCodexSignal
};
