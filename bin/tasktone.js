#!/usr/bin/env node

const { runCli } = require("../src/cli");

runCli(process.argv).catch((error) => {
  const message = error && error.message ? error.message : String(error);
  console.error(`[tasktone] ${message}`);
  process.exit(1);
});
