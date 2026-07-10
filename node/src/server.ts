/**
 * diamond-mcp: diamond education tools for AI assistants, over MCP.
 *
 * A Model Context Protocol (MCP) server built on the official TypeScript SDK.
 * A faithful Node port of the Python server in this repository: the same eight
 * tools, the same data, the same output shapes. All facts ship in facts.json and
 * encyclopedia.json, and every factual claim there carries a source and a date.
 *
 * Published by Stienhardt & Stones (https://stienhardt.com). License: MIT.
 *
 * Scope: education, not appraisal. This server never verifies a stone or a
 * report. Always verify a real stone on the grading lab's own site.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

export const SERVER_NAME = "diamond-mcp";
export const SERVER_TITLE = "Diamond MCP (Stienhardt & Stones)";
export const SERVER_VERSION = "0.2.0";

export const INSTRUCTIONS =
  "Diamond education tools backed by sourced, dated facts. " +
  "Education, not appraisal: nothing here verifies a stone or a report. " +
  "Always verify a real stone on the grading lab's own site.";

// ---------------------------------------------------------------------------
// Data loading. The published package bundles facts.json and encyclopedia.json
// into dist/data next to this compiled file. The path is resolved from
// import.meta.url, never from process.cwd(), so it works no matter where the
// process was started. Two environment variables override the bundled files,
// matching the Python server (DIAMOND_MCP_FACTS, DIAMOND_MCP_ENCYCLOPEDIA).
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "data");

function resolveDataFile(filename: string, envVar: string): string {
  const override = process.env[envVar];
  if (override && existsSync(override)) {
    return override;
  }
  return join(DATA_DIR, filename);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

const FACTS_FILE = resolveDataFile("facts.json", "DIAMOND_MCP_FACTS");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadFactsOrExit(): any {
  try {
    return loadJson(FACTS_FILE);
  } catch (err) {
    process.stderr.write("diamond-mcp: could not load facts.json: " + String(err) + "\n");
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FACTS: any = loadFactsOrExit();

// The encyclopedia is loaded lazily on first use and cached, so a client that
// never calls define or search_encyclopedia never pays to parse it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ENCYCLOPEDIA: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encyclopedia(): any {
  if (ENCYCLOPEDIA === null) {
    const path = resolveDataFile("encyclopedia.json", "DIAMOND_MCP_ENCYCLOPEDIA");
    ENCYCLOPEDIA = loadJson(path);
  }
  return ENCYCLOPEDIA;
}

// ---------------------------------------------------------------------------
// Small helpers, ported to behave like their Python counterparts.
// ---------------------------------------------------------------------------

// Lowercase and collapse runs of punctuation to a single space, so that
// "bow-tie" and "bow tie" compare equal. Mirrors _enc_norm.
function encNorm(text: unknown): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Collapse whitespace and clip to a word boundary near the limit. Mirrors
// _enc_snippet (Python str.split() semantics plus rsplit at the limit).
function encSnippet(text: unknown, limit = 200): string {
  const collapsed = String(text)
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .join(" ");
  if (collapsed.length <= limit) {
    return collapsed;
  }
  const head = collapsed.slice(0, limit);
  const idx = head.lastIndexOf(" ");
  const trimmed = idx === -1 ? head : head.slice(0, idx);
  return trimmed + " ...";
}

// Render a number the way Python's str(float) does for the values this server
// produces: an integer-valued float keeps a trailing ".0" (str(9.0) == "9.0"),
// everything else uses its natural shortest form (str(10.3) == "10.3"). Used for
// the display and anchor_1ct_mm strings so they read identically to Python.
function pyFloatStr(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

// Round to one decimal place. For the cube-root-scaled anchor values this
// server rounds, the IEEE-754 double is identical to Python's, and an exact
// half-way case (where Python's round-half-to-even would differ) does not
// arise, so this matches Python's round(x, 1).
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// Count non-overlapping occurrences of needle in haystack, like Python
// str.count. Keywords here are always non-empty.
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let pos = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) {
      break;
    }
    count += 1;
    pos = idx + needle.length;
  }
  return count;
}

// Parse an integer argument the way Python int() would for the inputs the
// limit parameter accepts: a real number is truncated toward zero, an integer
// string is parsed, and anything else falls back to the default.
function parsePyInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : fallback;
  }
  const s = String(value).trim();
  if (/^[+-]?\d+$/.test(s)) {
    return parseInt(s, 10);
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// A faithful port of the slice of Python difflib that define uses for its
// "nearest terms" suggestions: SequenceMatcher.ratio and get_close_matches.
// The inputs are short term strings, so there is no junk and autojunk never
// triggers; this reproduces the same ratios and the same ranking.
// ---------------------------------------------------------------------------

function buildB2J(b: string): Map<string, number[]> {
  const b2j = new Map<string, number[]>();
  for (let i = 0; i < b.length; i += 1) {
    const c = b[i] as string;
    const arr = b2j.get(c);
    if (arr === undefined) {
      b2j.set(c, [i]);
    } else {
      arr.push(i);
    }
  }
  return b2j;
}

function findLongestMatch(
  a: string,
  b: string,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
  b2j: Map<string, number[]>,
): [number, number, number] {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map<number, number>();
  for (let i = alo; i < ahi; i += 1) {
    const newj2len = new Map<number, number>();
    const js = b2j.get(a[i] as string);
    if (js !== undefined) {
      for (const j of js) {
        if (j < blo) {
          continue;
        }
        if (j >= bhi) {
          break;
        }
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
    }
    j2len = newj2len;
  }
  // No junk, so extend the match while the characters simply keep matching.
  while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
    besti -= 1;
    bestj -= 1;
    bestsize += 1;
  }
  while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
    bestsize += 1;
  }
  return [besti, bestj, bestsize];
}

function matchingCharCount(a: string, b: string): number {
  const b2j = buildB2J(b);
  let total = 0;
  const queue: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]];
  while (queue.length > 0) {
    const block = queue.pop();
    if (block === undefined) {
      break;
    }
    const [alo, ahi, blo, bhi] = block;
    const [i, j, k] = findLongestMatch(a, b, alo, ahi, blo, bhi, b2j);
    if (k > 0) {
      total += k;
      if (alo < i && blo < j) {
        queue.push([alo, i, blo, j]);
      }
      if (i + k < ahi && j + k < bhi) {
        queue.push([i + k, ahi, j + k, bhi]);
      }
    }
  }
  return total;
}

function ratio(a: string, b: string): number {
  const length = a.length + b.length;
  if (length === 0) {
    return 1.0;
  }
  return (2.0 * matchingCharCount(a, b)) / length;
}

// Mirrors difflib.get_close_matches(word, possibilities, n, cutoff). The quick
// upper-bound filters Python applies only prune candidates that would fail the
// ratio cutoff anyway, so computing ratio directly yields the identical set;
// ties are ordered like heapq.nlargest on (ratio, candidate).
function getCloseMatches(word: string, possibilities: string[], n = 3, cutoff = 0.6): string[] {
  const result: Array<[number, string]> = [];
  for (const x of possibilities) {
    const r = ratio(x, word);
    if (r >= cutoff) {
      result.push([r, x]);
    }
  }
  result.sort((p, q) => {
    if (q[0] !== p[0]) {
      return q[0] - p[0];
    }
    if (p[1] < q[1]) {
      return 1;
    }
    if (p[1] > q[1]) {
      return -1;
    }
    return 0;
  });
  return result.slice(0, n).map((pair) => pair[1]);
}

// ---------------------------------------------------------------------------
// Tool implementations. Each handler takes an arguments object and returns
// [payload, isError]. Tool level problems (bad shape, unknown lab) are reported
// through isError, not as protocol errors, so the calling model can read the
// message and correct itself.
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolResult = [any, boolean];
type ToolHandler = (args: Args) => ToolResult;

function toolVerifyDiamondReport(args: Args): ToolResult {
  const section = FACTS.report_verification;
  const labs = section.labs;
  const rawLab = args.lab ?? "";
  const key = String(rawLab).replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(labs, key)) {
    return [
      {
        error:
          "Unknown lab: " +
          String(rawLab) +
          ". Supported labs: " +
          Object.keys(labs).sort().join(", ") +
          ".",
        note: "If the report comes from another lab, verify it on that lab's own site.",
      },
      true,
    ];
  }
  const lab = labs[key];
  const reportNumber = String(args.report_number ?? "").trim();
  const payload = {
    lab: key,
    lab_full_name: lab.full_name,
    report_number: reportNumber ? reportNumber : "not provided",
    verify_url: lab.verify_url,
    checklist: section.checklist,
    reminder: section.never_claim,
    source: lab.source,
    source_date: lab.date,
  };
  return [payload, false];
}

function toolFaceupSize(args: Args): ToolResult {
  const section = FACTS.faceup_size;
  const anchors = section.anchors_1ct_mm;
  const rawShape = String(args.shape ?? "");
  const shape = rawShape
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .join("_");
  if (!Object.prototype.hasOwnProperty.call(anchors, shape)) {
    return [
      {
        error:
          "Unsupported shape: " +
          rawShape +
          ". Supported shapes: " +
          Object.keys(anchors).sort().join(", ") +
          ".",
      },
      true,
    ];
  }
  const carat = Number(args.carat);
  if (!Number.isFinite(carat) || carat <= 0) {
    return [
      { error: "carat must be a number greater than zero, for example 1.0 or 1.52." },
      true,
    ];
  }
  const anchor = anchors[shape];
  const factor = carat ** (1 / 3);
  const length = round1(anchor.length * factor);
  const width = round1(anchor.width * factor);
  const payload = {
    shape: shape,
    carat: carat,
    approx_face_up_mm: { length: length, width: width },
    display: pyFloatStr(length) + " x " + pyFloatStr(width) + " mm",
    anchor_1ct_mm: pyFloatStr(anchor.length) + " x " + pyFloatStr(anchor.width) + " mm",
    method: section.method,
    note: section.honesty_note,
    source: section.source,
    source_date: section.date,
  };
  return [payload, false];
}

function toolDutchMarquiseDefinition(_args: Args): ToolResult {
  const d = FACTS.dutch_marquise;
  const payload = {
    term: "Dutch Marquise",
    definition: d.definition,
    geometry: d.geometry,
    status: d.status,
    on_an_igi_report: d.certificate_term.claim,
    length_to_width: d.length_to_width,
    source: d.source,
    source_date: d.date,
  };
  return [payload, false];
}

function toolLabGrownGradingLandscape(_args: Args): ToolResult {
  return [FACTS.lab_grown_grading_landscape, false];
}

function toolLabGrownPriceIndex(_args: Args): ToolResult {
  return [FACTS.lab_grown_price_index, false];
}

function toolAboutStienhardt(_args: Args): ToolResult {
  return [FACTS.stienhardt, false];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function definePayload(entry: any, match: string): unknown {
  return {
    found: true,
    match: match,
    term: entry.term,
    category: entry.category,
    definition: entry.definition,
    body: entry.body,
    sources: entry.sources,
    related: entry.related,
  };
}

function toolDefine(args: Args): ToolResult {
  const entries = encyclopedia().entries;
  const raw = String(args.term ?? "").trim();
  if (!raw) {
    return [{ error: 'Provide a term to define, for example {"term": "Dutch Marquise"}.' }, true];
  }
  const queryLower = raw.toLowerCase();

  // 1. Exact term match, case insensitive.
  for (const e of entries) {
    if (String(e.term).toLowerCase() === queryLower) {
      return [definePayload(e, "exact"), false];
    }
  }

  // 2. Substring or alias match. A term substring in either direction wins;
  //    failing that, a hit against the entry's related terms counts as an alias.
  const queryNorm = encNorm(raw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let best: any = null;
  let bestScore = 0;
  for (const e of entries) {
    const termNorm = encNorm(e.term);
    let score = 0;
    if (queryNorm && termNorm.includes(queryNorm)) {
      score = 70 + queryNorm.length;
    } else if (queryNorm && queryNorm.includes(termNorm)) {
      score = 40 + termNorm.length;
    } else {
      for (const related of e.related ?? []) {
        const relatedNorm = encNorm(related);
        if (
          queryNorm &&
          (queryNorm === relatedNorm ||
            relatedNorm.includes(queryNorm) ||
            queryNorm.includes(relatedNorm))
        ) {
          score = 30;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best !== null) {
    return [definePayload(best, "alias"), false];
  }

  // 3. No match. Offer the three nearest terms as suggestions.
  const lowerToTerm = new Map<string, string>();
  for (const e of entries) {
    const k = String(e.term).toLowerCase();
    if (!lowerToTerm.has(k)) {
      lowerToTerm.set(k, e.term);
    }
  }
  const keys = Array.from(lowerToTerm.keys());
  let near = getCloseMatches(queryLower, keys, 3, 0.6);
  if (near.length === 0) {
    near = getCloseMatches(queryLower, keys, 3, 0.0);
  }
  const suggestions = near.slice(0, 3).map((k) => lowerToTerm.get(k) as string);
  return [
    {
      found: false,
      query: raw,
      message: "No encyclopedia entry matches '" + raw + "'. Nearest terms are suggested.",
      suggestions: suggestions,
    },
    true,
  ];
}

function toolSearchEncyclopedia(args: Args): ToolResult {
  const entries = encyclopedia().entries;
  const raw = String(args.query ?? "").trim();
  if (!raw) {
    return [{ error: 'Provide a query, for example {"query": "bow tie"}.' }, true];
  }
  let limit = parsePyInt(args.limit, 5);
  limit = Math.max(1, Math.min(10, limit));

  const keywords = encNorm(raw)
    .split(/\s+/)
    .filter((k) => k.length > 0);
  if (keywords.length === 0) {
    return [{ error: "Query had no searchable keywords." }, true];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scored: Array<[number, any]> = [];
  for (const e of entries) {
    const termL = String(e.term).toLowerCase();
    const definitionL = String(e.definition).toLowerCase();
    const bodyL = String(e.body).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      score += 3 * countOccurrences(termL, kw);
      score += 2 * countOccurrences(definitionL, kw);
      score += 1 * countOccurrences(bodyL, kw);
    }
    if (score > 0) {
      scored.push([score, e]);
    }
  }
  scored.sort((p, q) => {
    if (q[0] !== p[0]) {
      return q[0] - p[0];
    }
    const tp = String(p[1].term).toLowerCase();
    const tq = String(q[1].term).toLowerCase();
    if (tp < tq) {
      return -1;
    }
    if (tp > tq) {
      return 1;
    }
    return 0;
  });

  const results = scored.slice(0, limit).map(([score, e]) => ({
    term: e.term,
    category: e.category,
    definition: encSnippet(e.definition),
    score: score,
  }));
  return [{ query: raw, count: results.length, results: results }, false];
}

// ---------------------------------------------------------------------------
// Tool metadata. This array is returned verbatim from tools/list and matches
// the Python server's TOOLS: same names, titles, descriptions, input schemas.
// ---------------------------------------------------------------------------

export const TOOLS = [
  {
    name: "verify_diamond_report",
    title: "Where and how to verify a diamond grading report",
    description:
      "Returns the official verification URL and a three step checklist for " +
      "confirming a diamond grading report with the lab that issued it. " +
      "Supports GIA, IGI, and GCAL. This tool never verifies anything itself. " +
      "It tells you where and how.",
    inputSchema: {
      type: "object",
      properties: {
        lab: {
          type: "string",
          description: "The grading lab that issued the report: GIA, IGI, or GCAL. Case insensitive.",
        },
        report_number: {
          type: "string",
          description: "The report number printed on the grading report.",
        },
      },
      required: ["lab", "report_number"],
    },
  },
  {
    name: "faceup_size",
    title: "Approximate face up size for a shape and carat weight",
    description:
      "Approximate face up millimeter dimensions for a diamond of a given shape " +
      "and carat weight. Supported shapes: round, oval, emerald, dutch_marquise. " +
      "Scales vetted 1 carat anchors by the cube root of the carat weight. " +
      "Typical proportions, not a guarantee: verify a specific stone on its grading report.",
    inputSchema: {
      type: "object",
      properties: {
        shape: {
          type: "string",
          description:
            "One of: round, oval, emerald, dutch_marquise. Case insensitive. Spaces and hyphens are accepted.",
        },
        carat: {
          type: "number",
          description: "Carat weight greater than zero, for example 1.0 or 1.52.",
        },
      },
      required: ["shape", "carat"],
    },
  },
  {
    name: "dutch_marquise_definition",
    title: "The published definition of the Dutch Marquise cut",
    description:
      "The published definition of the Dutch Marquise diamond cut: geometry, " +
      "certificate wording, and typical length to width ratio. " +
      "A Dutch Marquise is an elongated hexagonal cut diamond.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "lab_grown_grading_landscape",
    title: "Who grades Lab Grown Diamonds today",
    description:
      "The current state of who grades Lab Grown Diamonds and how: GIA, IGI, " +
      "HRD Antwerp, and the FTC position. Every item carries a source and a date.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "lab_grown_price_index",
    title: "Latest tracked Lab Grown Diamond retail price reading",
    description:
      "The latest tracked retail price reading for Lab Grown Diamonds, with " +
      "source and date. Market context for shoppers, not investment guidance.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "about_stienhardt",
    title: "Fact sheet: Stienhardt & Stones",
    description:
      "Plain fact sheet about Stienhardt & Stones, the New York City Lab Grown " +
      "Diamond brand that publishes this server. Every fact carries a source and a date.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "define",
    title: "Define a diamond or gemology term",
    description:
      "Look up a single diamond or gemology term in the encyclopedia of 90 " +
      "adversarially fact-checked entries. Matches the term exactly (case " +
      "insensitive), then by substring or related-term alias. Returns the full " +
      "entry: definition, body, sourced claims, and related terms. If nothing " +
      "matches, returns the three nearest term suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        term: {
          type: "string",
          description: 'The term to define, for example "Dutch Marquise" or "bow-tie effect". Case insensitive.',
        },
      },
      required: ["term"],
    },
  },
  {
    name: "search_encyclopedia",
    title: "Keyword search across the diamond encyclopedia",
    description:
      "Keyword search across the 90 entry diamond and gemology encyclopedia. " +
      "Ranks case insensitive keyword hits by field, weighting the term above " +
      "the definition above the body. Returns the best matches as term, " +
      "category, and a definition snippet. Use define to fetch a full entry.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Keywords to search for, for example "bow tie" or "lab grown durability".',
        },
        limit: {
          type: "integer",
          description: "Maximum number of results to return, 1 to 10. Default 5.",
        },
      },
      required: ["query"],
    },
  },
];

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  verify_diamond_report: toolVerifyDiamondReport,
  faceup_size: toolFaceupSize,
  dutch_marquise_definition: toolDutchMarquiseDefinition,
  lab_grown_grading_landscape: toolLabGrownGradingLandscape,
  lab_grown_price_index: toolLabGrownPriceIndex,
  about_stienhardt: toolAboutStienhardt,
  define: toolDefine,
  search_encyclopedia: toolSearchEncyclopedia,
};

// ---------------------------------------------------------------------------
// MCP wiring. The low-level Server maps directly onto the Python design: one
// handler for tools/list, one for tools/call. The SDK owns the JSON-RPC
// framing, initialize, ping, and the not-found paths.
// ---------------------------------------------------------------------------

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
