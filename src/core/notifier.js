const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const EVENT_LABELS = {
  attention_required: "Attention Required",
  task_completed: "Task Completed",
  task_failed: "Task Failed"
};

const DEFAULT_MESSAGES = {
  attention_required: "Your AI agent is waiting for your input.",
  task_completed: "Your AI agent finished the task.",
  task_failed: "Your AI agent reported a failure."
};

const FALLBACK_SOUND_BY_EVENT = {
  attention_required: "/System/Library/Sounds/Glass.aiff",
  task_completed: "/System/Library/Sounds/Hero.aiff",
  task_failed: "/System/Library/Sounds/Basso.aiff"
};

function runDetached(command, args) {
  const child = spawn(command, args, {
    stdio: "ignore",
    detached: true
  });
  child.unref();
}

function escapeAppleScriptString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

class Notifier {
  constructor(options) {
    this.config = options.config;
    this.configPath = options.configPath;
    this.lastEventAt = new Map();
  }

  resolveSoundPath(eventName) {
    const configured = this.config.sound[eventName];
    if (configured) {
      const absolute = path.isAbsolute(configured)
        ? configured
        : path.resolve(path.dirname(this.configPath), configured);
      if (fs.existsSync(absolute)) {
        return absolute;
      }
    }

    const fallback = FALLBACK_SOUND_BY_EVENT[eventName];
    if (fallback && fs.existsSync(fallback)) {
      return fallback;
    }

    return null;
  }

  isDebounced(eventName) {
    const now = Date.now();
    const last = this.lastEventAt.get(eventName);
    if (typeof last === "number" && now - last < this.config.debounceMs) {
      return true;
    }
    this.lastEventAt.set(eventName, now);
    return false;
  }

  playSound(eventName) {
    const soundPath = this.resolveSoundPath(eventName);
    if (!soundPath) {
      return false;
    }

    try {
      runDetached("afplay", [soundPath]);
      return true;
    } catch (_error) {
      return false;
    }
  }

  showDesktopNotification(eventName, payload) {
    if (!this.config.desktopNotification) {
      return false;
    }

    const title = payload && payload.title ? payload.title : EVENT_LABELS[eventName];
    const message =
      payload && payload.message ? payload.message : DEFAULT_MESSAGES[eventName];

    const script = `display notification "${escapeAppleScriptString(
      message
    )}" with title "${escapeAppleScriptString(title)}"`;

    try {
      runDetached("osascript", ["-e", script]);
      return true;
    } catch (_error) {
      return false;
    }
  }

  notify(eventName, payload = {}) {
    if (this.isDebounced(eventName)) {
      return {
        delivered: false,
        reason: "debounced"
      };
    }

    const soundPlayed = this.playSound(eventName);
    const desktopShown = this.showDesktopNotification(eventName, payload);

    return {
      delivered: true,
      soundPlayed,
      desktopShown
    };
  }
}

module.exports = {
  Notifier
};
