const fs = require("fs");
const path = require("path");
const { ensureTaskToneDirectories } = require("../../core/config");
const { buildTasktoneNotifyScript } = require("../../utils/hook-command");

const CLAUDE_EVENT_TO_UNIFIED_EVENT = {
  Notification: "attention_required",
  Stop: "task_completed",
  StopFailure: "task_failed",
  failure: "task_failed"
};

function getClaudeSettingsPath(homeDir) {
  return path.join(homeDir, ".claude", "settings.json");
}

function mapClaudeRawEvent(rawEventName) {
  if (!rawEventName) {
    return null;
  }
  return CLAUDE_EVENT_TO_UNIFIED_EVENT[rawEventName] || null;
}

function ensureClaudeSettingsFile(homeDir) {
  const settingsPath = getClaudeSettingsPath(homeDir);
  const settingsDir = path.dirname(settingsPath);
  fs.mkdirSync(settingsDir, { recursive: true });

  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, "{}\n", "utf8");
  }

  return settingsPath;
}

function loadClaudeSettings(settingsPath) {
  const raw = fs.readFileSync(settingsPath, "utf8");
  const parsed = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("~/.claude/settings.json 不是 JSON 对象。");
  }
  return parsed;
}

function ensureHook(settings, eventName, commandPath) {
  if (!settings.hooks || typeof settings.hooks !== "object") {
    settings.hooks = {};
  }

  if (!Array.isArray(settings.hooks[eventName])) {
    settings.hooks[eventName] = [];
  }

  const matcherGroups = settings.hooks[eventName];
  const alreadyExists = matcherGroups.some((group) => {
    if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) {
      return false;
    }
    return group.hooks.some(
      (hook) =>
        hook &&
        typeof hook === "object" &&
        hook.type === "command" &&
        hook.command === commandPath
    );
  });

  if (alreadyExists) {
    return false;
  }

  matcherGroups.push({
    matcher: "*",
    hooks: [
      {
        type: "command",
        command: commandPath
      }
    ]
  });

  return true;
}

function createHookScript(scriptPath, tasktoneInvocation, eventName) {
  const commandArgs = `notify --event ${eventName} --adapter claude`;
  const content = ["#!/usr/bin/env bash", "set -euo pipefail", ""]
    .concat(buildTasktoneNotifyScript(tasktoneInvocation, commandArgs))
    .join("\n");

  fs.writeFileSync(scriptPath, `${content}\n`, { mode: 0o755 });
  fs.chmodSync(scriptPath, 0o755);
}

function installClaudeAdapter(options) {
  const homeDir = options.homeDir;
  const tasktoneInvocation = options.tasktoneInvocation;

  ensureTaskToneDirectories(homeDir);
  const hookDir = path.join(homeDir, ".tasktone", "hooks");

  const notificationHookPath = path.join(hookDir, "claude-notification.sh");
  const stopHookPath = path.join(hookDir, "claude-stop.sh");
  const stopFailureHookPath = path.join(hookDir, "claude-stop-failure.sh");

  createHookScript(notificationHookPath, tasktoneInvocation, "attention_required");
  createHookScript(stopHookPath, tasktoneInvocation, "task_completed");
  createHookScript(stopFailureHookPath, tasktoneInvocation, "task_failed");

  const settingsPath = ensureClaudeSettingsFile(homeDir);
  const settings = loadClaudeSettings(settingsPath);

  const changedEvents = [];
  if (ensureHook(settings, "Notification", notificationHookPath)) {
    changedEvents.push("Notification");
  }
  if (ensureHook(settings, "Stop", stopHookPath)) {
    changedEvents.push("Stop");
  }
  if (ensureHook(settings, "StopFailure", stopFailureHookPath)) {
    changedEvents.push("StopFailure");
  }

  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

  return {
    settingsPath,
    hookDir,
    changedEvents
  };
}

function isClaudeInstalled(homeDir) {
  const settingsPath = getClaudeSettingsPath(homeDir);
  if (!fs.existsSync(settingsPath)) {
    return false;
  }

  try {
    const parsed = loadClaudeSettings(settingsPath);
    const hooks = parsed.hooks || {};
    const notificationGroups = hooks.Notification || [];
    const stopGroups = hooks.Stop || [];
    return (
      Array.isArray(notificationGroups) &&
      notificationGroups.length > 0 &&
      Array.isArray(stopGroups) &&
      stopGroups.length > 0
    );
  } catch (_error) {
    return false;
  }
}

module.exports = {
  getClaudeSettingsPath,
  installClaudeAdapter,
  isClaudeInstalled,
  mapClaudeRawEvent
};
