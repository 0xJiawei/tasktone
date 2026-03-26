const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const {
  getConfigPath,
  getTaskToneDir,
  initializeConfig,
  loadConfig,
  ensureTaskToneDirectories
} = require("./core/config");
const { createRuntime } = require("./core/runtime");
const { isUnifiedEvent } = require("./core/events");
const {
  installClaudeAdapter,
  isClaudeInstalled,
  getClaudeSettingsPath,
  mapClaudeRawEvent
} = require("./adapters/claude");
const {
  installCodexAdapter,
  isCodexInstalled,
  getCodexConfigPath,
  mapCodexSignal
} = require("./adapters/codex");

const HOME_DIR = process.env.HOME;

function getTasktoneInvocation() {
  const projectRoot = path.resolve(__dirname, "..");
  return {
    nodePath: process.execPath,
    entryPath: path.join(projectRoot, "bin", "tasktone.js")
  };
}

function printHelp() {
  console.log(`TaskTone - lightweight notification layer for AI coding agents

Usage:
  tasktone init
  tasktone install claude
  tasktone install codex
  tasktone run codex [args...]
  tasktone notify --event <attention_required|task_completed|task_failed>
  tasktone doctor [--test-notify]
  tasktone test
  tasktone status
`);
}

function readArgValue(args, index, flag) {
  if (index + 1 >= args.length) {
    throw new Error(`缺少参数值: ${flag}`);
  }
  return args[index + 1];
}

function parseNotifyArgs(args) {
  const parsed = {
    event: null,
    adapter: null,
    rawEvent: null,
    rawJson: null,
    title: null,
    message: null,
    positional: []
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--event") {
      parsed.event = readArgValue(args, i, "--event");
      i += 1;
      continue;
    }
    if (token === "--adapter") {
      parsed.adapter = readArgValue(args, i, "--adapter");
      i += 1;
      continue;
    }
    if (token === "--raw-event") {
      parsed.rawEvent = readArgValue(args, i, "--raw-event");
      i += 1;
      continue;
    }
    if (token === "--raw-json") {
      parsed.rawJson = readArgValue(args, i, "--raw-json");
      i += 1;
      continue;
    }
    if (token === "--title") {
      parsed.title = readArgValue(args, i, "--title");
      i += 1;
      continue;
    }
    if (token === "--message") {
      parsed.message = readArgValue(args, i, "--message");
      i += 1;
      continue;
    }
    parsed.positional.push(token);
  }

  return parsed;
}

function resolveEventFromAdapter(parsed) {
  if (parsed.adapter === "claude") {
    if (parsed.event) {
      return parsed.event;
    }
    const fromRaw = mapClaudeRawEvent(parsed.rawEvent);
    return fromRaw || null;
  }

  if (parsed.adapter === "codex") {
    if (parsed.event) {
      return parsed.event;
    }

    const candidate = parsed.rawJson || parsed.positional[0];
    if (!candidate) {
      return null;
    }

    try {
      const payload = JSON.parse(candidate);
      return mapCodexSignal(payload);
    } catch (_error) {
      return null;
    }
  }

  if (parsed.event) {
    return parsed.event;
  }

  const firstPositional = parsed.positional[0];
  if (firstPositional && isUnifiedEvent(firstPositional)) {
    return firstPositional;
  }

  return null;
}

async function commandInit() {
  const result = initializeConfig(HOME_DIR);
  if (result.created) {
    console.log(`已创建配置: ${result.configPath}`);
  } else {
    console.log(`配置已存在: ${result.configPath}`);
  }
}

async function commandInstall(args) {
  const target = args[0];
  if (!target) {
    throw new Error("请指定安装目标: claude 或 codex");
  }

  ensureTaskToneDirectories(HOME_DIR);
  const tasktoneInvocation = getTasktoneInvocation();

  if (target === "claude") {
    const result = installClaudeAdapter({
      homeDir: HOME_DIR,
      tasktoneInvocation
    });

    console.log("Claude 集成安装完成。");
    console.log(`- Hooks 目录: ${result.hookDir}`);
    console.log(`- Settings 文件: ${result.settingsPath}`);
    console.log(
      `- 注册事件: ${
        result.changedEvents.length > 0 ? result.changedEvents.join(", ") : "已存在，无需重复写入"
      }`
    );
    return;
  }

  if (target === "codex") {
    const result = installCodexAdapter({
      homeDir: HOME_DIR,
      tasktoneInvocation
    });

    console.log("Codex 集成安装完成。");
    console.log(`- Hook 脚本: ${result.codexHookPath}`);
    if (result.configured) {
      console.log(`- Codex 配置: ${result.codexConfigPath}`);
      console.log("已尝试写入 notify hook。");
    } else {
      console.log("- 未检测到可配置的 Codex notify 环境，已回退到 wrapper 指引。");
    }
    console.log("若 notify 未生效，请使用: tasktone run codex ...");
    return;
  }

  throw new Error(`不支持的安装目标: ${target}`);
}

function waitProcessExit(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function commandRun(args) {
  const target = args[0];
  const targetArgs = args.slice(1);

  if (target !== "codex") {
    throw new Error("MVP 仅支持: tasktone run codex ...");
  }

  const runtime = createRuntime({ homeDir: HOME_DIR });
  const child = spawn("codex", targetArgs, {
    stdio: "inherit"
  });

  const { code, signal } = await waitProcessExit(child);
  const eventName = code === 0 ? "task_completed" : "task_failed";
  runtime.emit(eventName, {
    title: eventName === "task_completed" ? "Codex Finished" : "Codex Failed",
    message:
      eventName === "task_completed"
        ? "Codex 进程已退出（exit code 0）"
        : `Codex 进程异常退出（code=${code}, signal=${signal || "none"}）`
  });

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
}

async function commandNotify(args) {
  const parsed = parseNotifyArgs(args);
  const eventName = resolveEventFromAdapter(parsed);

  if (!eventName || !isUnifiedEvent(eventName)) {
    throw new Error(
      "notify 需要有效事件。支持: attention_required, task_completed, task_failed"
    );
  }

  const runtime = createRuntime({ homeDir: HOME_DIR });
  const result = runtime.emit(eventName, {
    title: parsed.title || null,
    message: parsed.message || null
  });

  if (result && result.reason === "debounced") {
    console.log(`已忽略重复事件（debounce）: ${eventName}`);
    return;
  }
  console.log(`已发送通知: ${eventName}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function commandTest() {
  const runtime = createRuntime({ homeDir: HOME_DIR });
  const { config } = loadConfig(HOME_DIR);

  console.log("发送测试事件: attention_required");
  runtime.emit("attention_required", { message: "TaskTone test: attention" });
  await delay(Math.min(config.debounceMs, 1000));

  console.log("发送测试事件: task_completed");
  runtime.emit("task_completed", { message: "TaskTone test: completed" });
  await delay(Math.min(config.debounceMs, 1000));

  console.log("发送测试事件: task_failed");
  runtime.emit("task_failed", { message: "TaskTone test: failed" });
}

function soundExists(configPath, value) {
  const absolute = path.isAbsolute(value)
    ? value
    : path.resolve(path.dirname(configPath), value);
  return fs.existsSync(absolute);
}

async function commandStatus() {
  const configPath = getConfigPath(HOME_DIR);
  const { config, exists } = loadConfig(HOME_DIR);

  console.log("TaskTone 状态:");
  console.log(`- config: ${configPath} ${exists ? "(found)" : "(missing)"}`);
  console.log(`- desktopNotification: ${String(config.desktopNotification)}`);
  console.log(`- debounceMs: ${config.debounceMs}`);
  console.log(
    `- sound.attention_required: ${config.sound.attention_required} (${soundExists(
      configPath,
      config.sound.attention_required
    )})`
  );
  console.log(
    `- sound.task_completed: ${config.sound.task_completed} (${soundExists(
      configPath,
      config.sound.task_completed
    )})`
  );
  console.log(
    `- sound.task_failed: ${config.sound.task_failed} (${soundExists(
      configPath,
      config.sound.task_failed
    )})`
  );
  console.log(
    `- Claude integration: ${isClaudeInstalled(HOME_DIR)} (${getClaudeSettingsPath(
      HOME_DIR
    )})`
  );
  console.log(
    `- Codex integration: ${isCodexInstalled(HOME_DIR)} (${getCodexConfigPath(
      HOME_DIR
    )})`
  );
}

function commandExists(commandName) {
  const result = spawnSync("which", [commandName], { encoding: "utf8" });
  if (result.status === 0) {
    return result.stdout.trim();
  }
  return null;
}

function isExecutableFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch (_error) {
    return false;
  }
}

function resolveSoundAbsolute(configPath, soundPath) {
  return path.isAbsolute(soundPath)
    ? soundPath
    : path.resolve(path.dirname(configPath), soundPath);
}

function printDoctorCheck(status, title, detail, fix) {
  const marker = {
    pass: "[PASS]",
    warn: "[WARN]",
    fail: "[FAIL]"
  }[status];

  console.log(`${marker} ${title}`);
  if (detail) {
    console.log(`  - ${detail}`);
  }
  if (fix) {
    console.log(`  - Fix: ${fix}`);
  }
}

async function commandDoctor(args) {
  const testNotify = args.includes("--test-notify");
  const checks = [];
  const homeDir = HOME_DIR;
  const tasktoneDir = getTaskToneDir(homeDir);
  const configPath = getConfigPath(homeDir);
  const hookDir = path.join(tasktoneDir, "hooks");
  const codexHookPath = path.join(hookDir, "codex-notify.sh");
  const claudeHookPath = path.join(hookDir, "claude-stop.sh");
  const codexConfigPath = getCodexConfigPath(homeDir);
  const claudeSettingsPath = getClaudeSettingsPath(homeDir);

  function add(status, title, detail, fix) {
    checks.push({ status, title, detail, fix });
  }

  if (os.platform() === "darwin") {
    add("pass", "Operating system", "macOS detected");
  } else {
    add(
      "warn",
      "Operating system",
      `Current platform is ${os.platform()} (TaskTone MVP is macOS-first)`,
      "Use macOS for full sound + desktop notification support."
    );
  }

  if (fs.existsSync(configPath)) {
    add("pass", "TaskTone config", `Found ${configPath}`);
  } else {
    add(
      "warn",
      "TaskTone config",
      `Missing ${configPath}`,
      "Run: tasktone init"
    );
  }

  let config;
  try {
    config = loadConfig(homeDir).config;
    add("pass", "Config JSON parsing", "config.json is readable and valid");
  } catch (error) {
    add(
      "fail",
      "Config JSON parsing",
      String(error.message || error),
      "Fix ~/.tasktone/config.json JSON syntax, then rerun tasktone doctor."
    );
  }

  if (fs.existsSync(hookDir)) {
    add("pass", "Hook directory", `Found ${hookDir}`);
  } else {
    add("warn", "Hook directory", `Missing ${hookDir}`, "Run: tasktone init");
  }

  const tasktoneBinary = commandExists("tasktone");
  if (tasktoneBinary) {
    add("pass", "TaskTone CLI in PATH", tasktoneBinary);
  } else {
    add(
      "warn",
      "TaskTone CLI in PATH",
      "tasktone command not found in current shell PATH",
      "Run: npm install -g tasktone (or use node /path/to/bin/tasktone.js)"
    );
  }

  const afplayPath = commandExists("afplay");
  if (afplayPath) {
    add("pass", "afplay availability", afplayPath);
  } else if (os.platform() === "darwin") {
    add(
      "fail",
      "afplay availability",
      "afplay not found; sound playback will fail",
      "Ensure /usr/bin/afplay exists and macOS audio tools are intact."
    );
  } else {
    add("warn", "afplay availability", "afplay not found (non-macOS expected)");
  }

  if (config && config.desktopNotification) {
    const osascriptPath = commandExists("osascript");
    if (osascriptPath) {
      add("pass", "Desktop notification binary", osascriptPath);
    } else if (os.platform() === "darwin") {
      add(
        "fail",
        "Desktop notification binary",
        "osascript not found while desktopNotification=true",
        "Set desktopNotification=false in config, or restore osascript."
      );
    } else {
      add(
        "warn",
        "Desktop notification binary",
        "osascript not found (desktop notifications disabled on this platform)"
      );
    }
  }

  if (config) {
    for (const eventName of ["attention_required", "task_completed", "task_failed"]) {
      const configured = config.sound[eventName];
      const absolute = resolveSoundAbsolute(configPath, configured);
      if (fs.existsSync(absolute)) {
        add("pass", `Sound file (${eventName})`, absolute);
      } else {
        add(
          "warn",
          `Sound file (${eventName})`,
          `Configured path not found: ${absolute}`,
          "TaskTone will fallback to macOS system sounds."
        );
      }
    }
  }

  if (fs.existsSync(codexConfigPath)) {
    add("pass", "Codex config", `Found ${codexConfigPath}`);
    const codexConfigRaw = fs.readFileSync(codexConfigPath, "utf8");
    if (/^\s*notify\s*=.*/m.test(codexConfigRaw)) {
      add("pass", "Codex notify setting", "notify is configured");
    } else {
      add(
        "warn",
        "Codex notify setting",
        "notify is missing in ~/.codex/config.toml",
        "Run: tasktone install codex"
      );
    }
  } else {
    add(
      "warn",
      "Codex config",
      `Missing ${codexConfigPath}`,
      "Run: tasktone install codex"
    );
  }

  if (isExecutableFile(codexHookPath)) {
    add("pass", "Codex hook script", codexHookPath);
  } else {
    add(
      "warn",
      "Codex hook script",
      `Missing or non-executable: ${codexHookPath}`,
      "Run: tasktone install codex"
    );
  }

  const codexBinary = commandExists("codex");
  if (codexBinary) {
    add("pass", "Codex binary in PATH", codexBinary);
  } else {
    add(
      "warn",
      "Codex binary in PATH",
      "codex command not found",
      "For wrapper mode, ensure codex is in PATH or use full binary path."
    );
  }

  if (fs.existsSync(claudeSettingsPath)) {
    add("pass", "Claude settings", `Found ${claudeSettingsPath}`);
    try {
      const parsed = JSON.parse(fs.readFileSync(claudeSettingsPath, "utf8") || "{}");
      const hooks = parsed.hooks || {};
      const hasNotification =
        Array.isArray(hooks.Notification) && hooks.Notification.length > 0;
      const hasStop = Array.isArray(hooks.Stop) && hooks.Stop.length > 0;
      if (hasNotification && hasStop) {
        add("pass", "Claude hook mapping", "Notification + Stop hooks are configured");
      } else {
        add(
          "warn",
          "Claude hook mapping",
          "Notification/Stop hooks are incomplete",
          "Run: tasktone install claude"
        );
      }
    } catch (error) {
      add(
        "fail",
        "Claude settings JSON parsing",
        String(error.message || error),
        "Fix ~/.claude/settings.json JSON syntax, then rerun tasktone doctor."
      );
    }
  } else {
    add(
      "warn",
      "Claude settings",
      `Missing ${claudeSettingsPath}`,
      "Run: tasktone install claude"
    );
  }

  if (isExecutableFile(claudeHookPath)) {
    add("pass", "Claude hook script", claudeHookPath);
  } else {
    add(
      "warn",
      "Claude hook script",
      `Missing or non-executable: ${claudeHookPath}`,
      "Run: tasktone install claude"
    );
  }

  if (testNotify) {
    try {
      const runtime = createRuntime({ homeDir });
      runtime.emit("attention_required", {
        title: "TaskTone doctor",
        message: "This is a doctor test notification."
      });
      add("pass", "Doctor notification probe", "Sent attention_required test event");
    } catch (error) {
      add(
        "fail",
        "Doctor notification probe",
        String(error.message || error),
        "Run: tasktone notify --event attention_required to inspect runtime errors."
      );
    }
  }

  console.log("TaskTone Doctor");
  console.log(`- Home: ${homeDir}`);
  console.log(`- Config: ${configPath}`);
  console.log("");

  for (const check of checks) {
    printDoctorCheck(check.status, check.title, check.detail, check.fix);
  }

  const failCount = checks.filter((item) => item.status === "fail").length;
  const warnCount = checks.filter((item) => item.status === "warn").length;
  const passCount = checks.filter((item) => item.status === "pass").length;

  console.log("");
  console.log(
    `Summary: ${passCount} passed, ${warnCount} warnings, ${failCount} failures`
  );

  if (failCount > 0) {
    process.exitCode = 1;
    console.log("Result: issues found. Fix [FAIL] items first.");
  } else if (warnCount > 0) {
    console.log("Result: usable, but review [WARN] items for better reliability.");
  } else {
    console.log("Result: healthy.");
  }
}

async function runCli(argv) {
  const args = argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "init") {
    await commandInit();
    return;
  }

  if (command === "install") {
    await commandInstall(args.slice(1));
    return;
  }

  if (command === "run") {
    await commandRun(args.slice(1));
    return;
  }

  if (command === "notify") {
    await commandNotify(args.slice(1));
    return;
  }

  if (command === "test") {
    await commandTest();
    return;
  }

  if (command === "doctor") {
    await commandDoctor(args.slice(1));
    return;
  }

  if (command === "status") {
    await commandStatus();
    return;
  }

  throw new Error(`未知命令: ${command}`);
}

module.exports = {
  runCli
};
