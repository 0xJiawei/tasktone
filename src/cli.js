const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  getConfigPath,
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

  if (command === "status") {
    await commandStatus();
    return;
  }

  throw new Error(`未知命令: ${command}`);
}

module.exports = {
  runCli
};
