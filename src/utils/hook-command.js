const { shellQuote } = require("./shell");

function buildTasktoneNotifyScript(tasktoneInvocation, argsExpression) {
  const fallback = `${shellQuote(tasktoneInvocation.nodePath)} ${shellQuote(
    tasktoneInvocation.entryPath
  )} ${argsExpression}`;

  return [
    "if command -v tasktone >/dev/null 2>&1; then",
    `  tasktone ${argsExpression} >/dev/null 2>&1 || true`,
    "else",
    `  ${fallback} >/dev/null 2>&1 || true`,
    "fi"
  ];
}

module.exports = {
  buildTasktoneNotifyScript
};
