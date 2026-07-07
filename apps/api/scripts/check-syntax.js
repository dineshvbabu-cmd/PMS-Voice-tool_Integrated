"use strict";

const { readdirSync, statSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

function collectJavaScriptFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return collectJavaScriptFiles(fullPath);
    }

    return entry.endsWith(".js") ? [fullPath] : [];
  });
}

const files = collectJavaScriptFiles(join(__dirname, "..", "src"));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
