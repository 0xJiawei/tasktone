function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function updateTopLevelNotifyToml(source, notifyCommandPath) {
  const text = source || "";
  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  const notifyLine = `notify = ["${escapeTomlString(notifyCommandPath)}"]`;

  let firstSectionIndex = -1;
  let replaced = false;
  let output = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const isSection = /^\[.+\]$/.test(trimmed);

    if (isSection && firstSectionIndex === -1) {
      firstSectionIndex = i;
    }

    if (!replaced && firstSectionIndex === -1 && /^notify\s*=/.test(trimmed)) {
      output.push(notifyLine);
      replaced = true;
      continue;
    }

    output.push(line);
  }

  if (!replaced) {
    if (firstSectionIndex === -1) {
      if (output.length > 0 && output[output.length - 1].trim() !== "") {
        output.push("");
      }
      output.push(notifyLine);
    } else {
      const head = output.slice(0, firstSectionIndex);
      const tail = output.slice(firstSectionIndex);
      if (head.length > 0 && head[head.length - 1].trim() !== "") {
        head.push("");
      }
      head.push(notifyLine);
      output = head.concat(tail);
    }
  }

  return `${output.join("\n").replace(/\n+$/g, "")}\n`;
}

module.exports = {
  updateTopLevelNotifyToml
};
