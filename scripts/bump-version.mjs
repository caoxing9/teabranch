#!/usr/bin/env node
// Stamp a release version into every file that carries one. Run by @semantic-release/exec.
//
// package.json is semantic-release's version anchor; app-nsh/nsh.json is what `nsh package` puts in
// the bundle (the DMG is named after the tag). Neither is generated, so each is written explicitly.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("Usage: bump-version.mjs <version>");
  process.exit(1);
}

function bumpJson(path) {
  const original = readFileSync(path, "utf8");
  const trailing = original.endsWith("\n") ? "\n" : "";
  const data = JSON.parse(original);
  data.version = version;
  writeFileSync(path, JSON.stringify(data, null, 2) + trailing);
}

/** nsh.json carries a build number too, which must grow with every release: it follows the version. */
function bumpNshJson(path) {
  const original = readFileSync(path, "utf8");
  const trailing = original.endsWith("\n") ? "\n" : "";
  const data = JSON.parse(original);
  const [major, minor, patch] = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  data.version = version;
  data.build = major * 1_000_000 + minor * 1_000 + patch;
  writeFileSync(path, JSON.stringify(data, null, 2) + trailing);
}

bumpJson("package.json");
bumpNshJson("app-nsh/nsh.json");

console.log(`Bumped version to ${version}`);
