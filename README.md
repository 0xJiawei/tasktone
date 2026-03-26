# TaskTone

TaskTone 是一个开源 CLI：给 AI 编码代理加上轻量通知层。  
核心目标是让你不用盯着终端，也能在关键任务节点及时收到提醒。

核心价值：**Your AI tells you when it needs you.**

## 功能（MVP）

- 统一事件模型：
  - `attention_required`
  - `task_completed`
  - `task_failed`
- 通知能力：
  - 声音通知（必选，macOS `afplay`）
  - 桌面通知（可选，`osascript`）
  - 事件防抖（默认 3000ms）
- 适配器：
  - Claude Code（官方 hooks）
  - Codex（优先 `notify`，回退 wrapper）

## 安装

```bash
npm install -g tasktone
```

如果你在本地开发：

```bash
npm link
```

## 快速开始

### 1) 初始化

```bash
tasktone init
```

会生成：

- `~/.tasktone/config.json`
- `~/.tasktone/hooks/`
- `~/.tasktone/sounds/`

默认配置示例见 [example.config.json](./example.config.json)。

### 2) 安装 Claude 集成

```bash
tasktone install claude
```

该命令会：

1. 在 `~/.tasktone/hooks/` 创建 hook 脚本
2. 修改 `~/.claude/settings.json`
3. 注册 hooks 映射：
   - `Notification` -> `tasktone notify --event attention_required`
   - `Stop` -> `tasktone notify --event task_completed`
   - `StopFailure` -> `tasktone notify --event task_failed`

### 3) 安装 Codex 集成

```bash
tasktone install codex
```

该命令会尝试配置 `~/.codex/config.toml` 的 `notify` 钩子，指向 TaskTone hook 脚本。

如果你的 Codex 版本没有稳定触发 notify，使用 wrapper 模式：

```bash
tasktone run codex ...
```

`tasktone run codex` 会透传 stdout/stderr，并在进程退出时触发：

- `exit code 0` -> `task_completed`
- `non-zero` -> `task_failed`

## 常用命令

```bash
# 初始化
tasktone init

# 安装集成
tasktone install claude
tasktone install codex

# Wrapper 模式
tasktone run codex ...

# 手动触发
tasktone notify --event task_completed

# 通知测试
tasktone test

# 状态检查
tasktone status
```

## 配置文件

路径：`~/.tasktone/config.json`

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

说明：

- 相对路径会相对于 `~/.tasktone/` 解析
- 如果配置的声音文件不存在，TaskTone 会回退到 macOS 系统声音

## 架构

```text
src/
  core/
    event-bus.js      # 统一事件总线
    config.js         # 配置加载与初始化
    notifier.js       # 声音/桌面通知 + 防抖
    runtime.js        # core 组装
  adapters/
    claude/
      index.js        # Claude 信号 -> 统一事件
    codex/
      index.js        # Codex 信号 -> 统一事件
```

设计原则：**core 不掺杂工具特定逻辑，工具差异都放在 adapter。**  
这样未来可扩展 OpenCode、Cursor 等其它 agent CLI。

## 限制（MVP）

- macOS 优先（通知依赖 `afplay` 与 `osascript`）
- 无 GUI
- 无云服务
- 无数据库
- Codex `attention_required` 目前是 best-effort（受上游 notify 能力影响）

## 许可证

MIT
