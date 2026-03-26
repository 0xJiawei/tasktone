const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_CONFIG = {
  sound: {
    attention_required: "sounds/attention.wav",
    task_completed: "sounds/done.wav",
    task_failed: "sounds/error.wav"
  },
  desktopNotification: true,
  debounceMs: 3000
};

function resolveHomeDir(homeDir) {
  return homeDir || process.env.HOME || os.homedir();
}

function getTaskToneDir(homeDir) {
  return path.join(resolveHomeDir(homeDir), ".tasktone");
}

function getConfigPath(homeDir) {
  return path.join(getTaskToneDir(homeDir), "config.json");
}

function ensureTaskToneDirectories(homeDir) {
  const baseDir = getTaskToneDir(homeDir);
  fs.mkdirSync(baseDir, { recursive: true });
  fs.mkdirSync(path.join(baseDir, "hooks"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "sounds"), { recursive: true });
  return baseDir;
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function mergeConfig(input) {
  const candidate = input && typeof input === "object" ? input : {};
  const sound = Object.assign({}, DEFAULT_CONFIG.sound, candidate.sound || {});

  return {
    sound,
    desktopNotification:
      typeof candidate.desktopNotification === "boolean"
        ? candidate.desktopNotification
        : DEFAULT_CONFIG.desktopNotification,
    debounceMs:
      Number.isFinite(candidate.debounceMs) && candidate.debounceMs >= 0
        ? Number(candidate.debounceMs)
        : DEFAULT_CONFIG.debounceMs
  };
}

function initializeConfig(homeDir) {
  const baseDir = ensureTaskToneDirectories(homeDir);
  const configPath = getConfigPath(homeDir);

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`,
      "utf8"
    );
    return { created: true, configPath, baseDir };
  }

  return { created: false, configPath, baseDir };
}

function loadConfig(homeDir) {
  const configPath = getConfigPath(homeDir);
  if (!fs.existsSync(configPath)) {
    return { config: mergeConfig(DEFAULT_CONFIG), configPath, exists: false };
  }

  const parsed = readJsonFile(configPath);
  return { config: mergeConfig(parsed), configPath, exists: true };
}

module.exports = {
  DEFAULT_CONFIG,
  ensureTaskToneDirectories,
  getConfigPath,
  getTaskToneDir,
  initializeConfig,
  loadConfig,
  mergeConfig
};
