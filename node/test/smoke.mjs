// Smoke test for the built diamond-mcp Node server. Spawns dist/bin.js, runs
// the MCP handshake over stdio, lists the tools, calls every tool once, and
// checks the error paths. No test framework: plain Node, exit 0 on PASS.
//
//     npm run build && npm run smoke

import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(dirname(HERE), "dist", "bin.js");
const TIMEOUT_MS = 15000;

class Client {
  constructor() {
    this.proc = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stderr.on("data", () => {});
    this.buffer = "";
    this.pending = [];
    this.queue = [];
    this.id = 0;
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this._onData(chunk));
  }

  _onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) {
        continue;
      }
      const msg = JSON.parse(line);
      const waiter = this.pending.shift();
      if (waiter) {
        waiter(msg);
      } else {
        this.queue.push(msg);
      }
    }
  }

  _readLine() {
    const queued = this.queue.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for a response")), TIMEOUT_MS);
      this.pending.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  _send(msg) {
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  notify(method, params) {
    const msg = { jsonrpc: "2.0", method };
    if (params !== undefined) {
      msg.params = params;
    }
    this._send(msg);
  }

  async request(method, params) {
    this.id += 1;
    const wantId = this.id;
    const msg = { jsonrpc: "2.0", id: wantId, method };
    if (params !== undefined) {
      msg.params = params;
    }
    this._send(msg);
    const resp = await this._readLine();
    if (resp.id !== wantId) {
      throw new Error("id mismatch: wanted " + wantId + " got " + JSON.stringify(resp));
    }
    return resp;
  }

  async close() {
    this.proc.stdin.end();
    await once(this.proc, "close").catch(() => {});
  }
}

function textPayload(resp) {
  const content = resp.result.content;
  if (!content || content[0].type !== "text") {
    throw new Error("expected text content, got " + JSON.stringify(resp.result));
  }
  return JSON.parse(content[0].text);
}

function clip(obj, n = 300) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj);
  return s.length <= n ? s : s.slice(0, n) + " ...";
}

let checks = 0;
let client;

function ok(label, cond, detail = "") {
  checks += 1;
  if (!cond) {
    console.log("FAIL " + label + (detail ? ": " + detail : ""));
    if (client) {
      client.close();
    }
    process.exit(1);
  }
  console.log("ok   " + label);
}

async function main() {
  client = new Client();

  // Handshake
  let resp = await client.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0" },
  });
  let res = resp.result;
  ok(
    "initialize",
    res.protocolVersion === "2025-06-18" &&
      res.serverInfo.name === "diamond-mcp" &&
      res.capabilities.tools !== undefined,
    clip(res),
  );
  client.notify("notifications/initialized");

  resp = await client.request("ping");
  ok("ping", JSON.stringify(resp.result) === "{}");

  // tools/list
  resp = await client.request("tools/list");
  const tools = resp.result.tools;
  const names = tools.map((t) => t.name).sort();
  const expected = [
    "about_stienhardt",
    "define",
    "dutch_marquise_definition",
    "faceup_size",
    "lab_grown_grading_landscape",
    "lab_grown_price_index",
    "search_encyclopedia",
    "verify_diamond_report",
  ];
  ok(
    "tools/list has exactly the 8 tools",
    names.length === 8 && JSON.stringify(names) === JSON.stringify(expected),
    JSON.stringify(names),
  );
  ok(
    "every tool has an object input schema",
    tools.every((t) => t.inputSchema && t.inputSchema.type === "object"),
  );

  const call = (name, args) => client.request("tools/call", { name, arguments: args });

  // verify_diamond_report
  resp = await call("verify_diamond_report", { lab: "igi", report_number: "LG 12345678" });
  let p = textPayload(resp);
  ok(
    "verify_diamond_report (IGI) returns the IGI url and a 3 step checklist",
    resp.result.isError === false && p.verify_url.includes("igi.org") && p.checklist.length === 3,
  );
  console.log("     " + clip(p));

  // faceup_size, with shape normalization and the 1 carat anchor
  resp = await call("faceup_size", { shape: "Dutch Marquise", carat: 1.5 });
  p = textPayload(resp);
  ok(
    "faceup_size dutch_marquise 1.5 ct is 10.3 x 5.7",
    p.approx_face_up_mm.length === 10.3 && p.approx_face_up_mm.width === 5.7,
    clip(p),
  );
  console.log("     " + clip(p));
  resp = await call("faceup_size", { shape: "round", carat: 1 });
  p = textPayload(resp);
  ok(
    "faceup_size round 1 ct hits the 6.5 anchor",
    p.approx_face_up_mm.length === 6.5 && p.approx_face_up_mm.width === 6.5,
    clip(p),
  );
  console.log("     " + clip(p));

  // dutch_marquise_definition
  resp = await call("dutch_marquise_definition", {});
  p = textPayload(resp);
  ok(
    "dutch_marquise_definition returns the canonical definition and IGI wording",
    p.definition === "A Dutch Marquise is an elongated hexagonal cut diamond." &&
      p.on_an_igi_report.includes("Hexagonal Modified Brilliant"),
  );
  console.log("     " + clip(p));

  // lab_grown_grading_landscape
  resp = await call("lab_grown_grading_landscape", {});
  p = textPayload(resp);
  ok(
    "lab_grown_grading_landscape has 4 sourced items",
    p.items.length === 4 && p.items.every((i) => i.source && i.source_date),
  );
  console.log("     " + clip(p));

  // lab_grown_price_index
  resp = await call("lab_grown_price_index", {});
  p = textPayload(resp);
  ok(
    "lab_grown_price_index is sourced and framed as a love piece",
    p.change_pct_month === 4.89 && p.as_of === "2026-07-01" && p.framing.includes("love piece"),
  );
  console.log("     " + clip(p));

  // about_stienhardt
  resp = await call("about_stienhardt", {});
  p = textPayload(resp);
  ok(
    "about_stienhardt is the publisher fact sheet with the no-showroom fact",
    p.url === "https://stienhardt.com" &&
      p.facts.some((f) => f.claim.toLowerCase().includes("no showroom")),
  );
  console.log("     " + clip(p));

  // define: exact match returns the canonical Dutch Marquise first sentence
  resp = await call("define", { term: "Dutch Marquise" });
  p = textPayload(resp);
  ok(
    "define Dutch Marquise is an exact match",
    resp.result.isError === false && p.found === true && p.match === "exact",
  );
  ok(
    "define Dutch Marquise definition first sentence is byte-exact",
    p.definition.split(". ")[0] + "." === "A Dutch Marquise is an elongated hexagonal cut diamond.",
    clip(p),
  );
  ok(
    "define returns the full entry shape",
    ["term", "category", "definition", "body", "sources", "related"].every((k) => k in p),
  );
  console.log("     " + clip(p));

  // define: case insensitive still hits exactly
  resp = await call("define", { term: "dutch marquise" });
  p = textPayload(resp);
  ok("define is case insensitive", p.match === "exact");

  // define: a typo returns not-found with nearest suggestions
  resp = await call("define", { term: "Dutch Marqise" });
  p = textPayload(resp);
  ok(
    "define with a typo returns suggestions including Dutch Marquise",
    p.found === false &&
      Array.isArray(p.suggestions) &&
      p.suggestions.length >= 1 &&
      p.suggestions.includes("Dutch Marquise"),
    clip(p),
  );
  console.log("     " + clip(p));

  // search_encyclopedia: 'bow tie' finds the bow-tie effect entry, ranked first
  resp = await call("search_encyclopedia", { query: "bow tie" });
  p = textPayload(resp);
  const resultTerms = p.results.map((r) => r.term);
  ok(
    "search_encyclopedia bow tie finds the bow-tie entry",
    resp.result.isError === false && resultTerms.includes("bow-tie effect"),
    clip(p),
  );
  ok("search_encyclopedia ranks bow-tie effect first", p.results[0].term === "bow-tie effect", clip(p));
  ok(
    "search_encyclopedia results carry term, category, definition snippet",
    p.results.every((r) => "term" in r && "category" in r && "definition" in r),
  );
  console.log("     " + clip(p));

  // search_encyclopedia: limit is honored and capped
  resp = await call("search_encyclopedia", { query: "diamond", limit: 3 });
  p = textPayload(resp);
  ok("search_encyclopedia honors limit", p.results.length <= 3);

  // Error paths
  resp = await call("verify_diamond_report", { lab: "AGS", report_number: "1" });
  ok("unknown lab returns isError", resp.result.isError === true);
  resp = await call("faceup_size", { shape: "pear", carat: 1 });
  ok("unsupported shape returns isError", resp.result.isError === true);
  resp = await call("faceup_size", { shape: "round", carat: -2 });
  ok("bad carat returns isError", resp.result.isError === true);
  resp = await call("define", { term: "" });
  ok("define with an empty term returns isError", resp.result.isError === true);
  resp = await call("search_encyclopedia", { query: "" });
  ok("search_encyclopedia with an empty query returns isError", resp.result.isError === true);
  resp = await client.request("tools/call", { name: "no_such_tool", arguments: {} });
  ok("unknown tool is a -32602 protocol error", resp.error && resp.error.code === -32602);
  resp = await client.request("bogus/method");
  ok("unknown method is a -32601 protocol error", resp.error && resp.error.code === -32601);

  await client.close();
  console.log("PASS (" + checks + " checks)");
}

main().catch((err) => {
  console.log("FAIL unexpected error: " + (err instanceof Error ? err.stack : String(err)));
  if (client) {
    client.close();
  }
  process.exit(1);
});
