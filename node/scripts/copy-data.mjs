// Build step: bundle the shared data into the package so the published tarball
// is self-contained. Copies the repo-root facts.json and encyclopedia.json (the
// single source of truth) into dist/data, where the compiled server loads them
// via a path resolved from import.meta.url. Also guarantees the compiled bin
// carries a node shebang and is executable, which tsc does not add on its own.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // node/scripts
const nodeRoot = dirname(here); // node
const repoRoot = dirname(nodeRoot); // repo root (holds facts.json, encyclopedia.json)
const distDir = join(nodeRoot, "dist");
const dataDir = join(distDir, "data");

if (!existsSync(distDir)) {
  console.error("copy-data: dist/ does not exist. Run tsc before this script (npm run build does).");
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });

for (const file of ["facts.json", "encyclopedia.json"]) {
  const src = join(repoRoot, file);
  if (!existsSync(src)) {
    console.error("copy-data: source not found: " + src);
    process.exit(1);
  }
  const dest = join(dataDir, file);
  copyFileSync(src, dest);
  console.log("copy-data: " + file + " -> dist/data/" + file);
}

// tsc may or may not preserve the shebang from src/bin.ts; make it certain.
const binPath = join(distDir, "bin.js");
if (existsSync(binPath)) {
  const shebang = "#!/usr/bin/env node\n";
  const contents = readFileSync(binPath, "utf8");
  if (!contents.startsWith("#!")) {
    writeFileSync(binPath, shebang + contents);
    console.log("copy-data: prepended node shebang to dist/bin.js");
  } else {
    console.log("copy-data: dist/bin.js already has a shebang");
  }
  try {
    chmodSync(binPath, 0o755);
  } catch {
    // chmod is a no-op on Windows; npm handles the executable bit at pack time.
  }
}
