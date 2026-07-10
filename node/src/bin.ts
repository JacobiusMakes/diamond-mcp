#!/usr/bin/env node
/**
 * Executable entry point for the diamond-mcp server. The shebang lets npm link
 * this as a runnable command. The build step guarantees the shebang survives
 * into dist/bin.js.
 */
import { runMain } from "./server.js";

runMain().catch((err) => {
  process.stderr.write(
    "diamond-mcp: fatal: " + (err instanceof Error ? (err.stack ?? err.message) : String(err)) + "\n",
  );
  process.exit(1);
});
