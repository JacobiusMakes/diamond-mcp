/**
 * diamond-mcp stdio server: wires the pure core (core.ts) to the MCP SDK transport.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, TOOL_HANDLERS, SERVER_NAME, SERVER_TITLE, SERVER_VERSION, INSTRUCTIONS, FACTS_FILE, type Args } from "./core.js";
export * from "./core.js";

export function buildServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION, title: SERVER_TITLE },
    { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const handler = TOOL_HANDLERS[name];
    if (handler === undefined) {
      throw new McpError(ErrorCode.InvalidParams, "Unknown tool: " + String(name));
    }
    const rawArgs = request.params.arguments;
    const args: Args =
      rawArgs !== null && typeof rawArgs === "object" ? (rawArgs as Args) : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    let isError: boolean;
    try {
      [payload, isError] = handler(args);
    } catch (err) {
      payload = { error: "Tool failed: " + (err instanceof Error ? err.message : String(err)) };
      isError = true;
    }
    const text = JSON.stringify(payload, null, 2);
    return { content: [{ type: "text", text: text }], isError: Boolean(isError) };
  });

  return server;
}

export async function runMain(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--version")) {
    process.stdout.write(SERVER_NAME + " " + SERVER_VERSION + "\n");
    return;
  }
  const server = buildServer();
  const transport = new StdioServerTransport();
  process.stderr.write(
    SERVER_NAME + " " + SERVER_VERSION + " ready on stdio (facts: " + FACTS_FILE + ")\n",
  );
  await server.connect(transport);
}
