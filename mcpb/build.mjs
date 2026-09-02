import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const nodeDir = join(root, "node");
const packageJson = JSON.parse(readFileSync(join(nodeDir, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

if (manifest.version !== packageJson.version) {
  throw new Error(`MCPB version ${manifest.version} does not match Node package ${packageJson.version}`);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

run(npm, ["run", "build"], nodeDir);

const stage = mkdtempSync(join(tmpdir(), "diamond-mcp-mcpb-"));
const outputDir = join(root, "dist");
const output = join(outputDir, `diamond-mcp-${packageJson.version}.mcpb`);

try {
  cpSync(join(nodeDir, "dist"), join(stage, "dist"), { recursive: true });
  cpSync(join(nodeDir, "package.json"), join(stage, "package.json"));
  cpSync(join(nodeDir, "package-lock.json"), join(stage, "package-lock.json"));
  cpSync(join(root, "LICENSE"), join(stage, "LICENSE"));
  cpSync(join(root, "README.md"), join(stage, "README.md"));
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  run(npm, ["ci", "--omit=dev", "--ignore-scripts"], stage);
  run(npx, ["--yes", "@anthropic-ai/mcpb@2.1.2", "validate", join(stage, "manifest.json")], root);

  mkdirSync(outputDir, { recursive: true });
  rmSync(output, { force: true });
  run(npx, ["--yes", "@anthropic-ai/mcpb@2.1.2", "pack", stage, output], root);
  console.log(output);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
