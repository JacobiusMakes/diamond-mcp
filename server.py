#!/usr/bin/env python3
"""diamond-mcp: diamond education tools for AI assistants, over MCP.

A Model Context Protocol (MCP) server that speaks JSON-RPC 2.0 over stdio.
Pure Python standard library. No third party packages. No network calls.
All facts ship in facts.json, and every factual claim there carries a
source and a date.

Published by Stienhardt & Stones (https://stienhardt.com). License: MIT.

Scope: education, not appraisal. This server never verifies a stone or a
report. Always verify a real stone on the grading lab's own site.
"""

import difflib
import io
import json
import math
import os
import re
import sys

SERVER_NAME = "diamond-mcp"
SERVER_TITLE = "Diamond MCP (Stienhardt & Stones)"
SERVER_VERSION = "0.2.0"

# Protocol versions this server accepts. If a client asks for one of these,
# the server echoes it back. Anything else gets the first entry.
SUPPORTED_PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")

INSTRUCTIONS = (
    "Diamond education tools backed by sourced, dated facts. "
    "Education, not appraisal: nothing here verifies a stone or a report. "
    "Always verify a real stone on the grading lab's own site."
)


def _facts_path():
    """Locate facts.json: env var, next to this file, installed share dir, cwd."""
    candidates = []
    env = os.environ.get("DIAMOND_MCP_FACTS")
    if env:
        candidates.append(env)
    here = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(here, "facts.json"))
    candidates.append(os.path.join(sys.prefix, "share", "diamond-mcp", "facts.json"))
    candidates.append(os.path.join(os.getcwd(), "facts.json"))
    for path in candidates:
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(
        "facts.json not found. Looked in: " + "; ".join(candidates)
        + ". Set the DIAMOND_MCP_FACTS environment variable to its full path."
    )


try:
    _FACTS_FILE = _facts_path()
    with open(_FACTS_FILE, "r", encoding="utf-8") as _fh:
        FACTS = json.load(_fh)
except Exception as _exc:
    sys.stderr.write("diamond-mcp: could not load facts.json: " + str(_exc) + "\n")
    sys.exit(1)


def _encyclopedia_path():
    """Locate encyclopedia.json: env var, next to this file, installed share dir, cwd."""
    candidates = []
    env = os.environ.get("DIAMOND_MCP_ENCYCLOPEDIA")
    if env:
        candidates.append(env)
    here = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(here, "encyclopedia.json"))
    candidates.append(os.path.join(sys.prefix, "share", "diamond-mcp", "encyclopedia.json"))
    candidates.append(os.path.join(os.getcwd(), "encyclopedia.json"))
    for path in candidates:
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(
        "encyclopedia.json not found. Looked in: " + "; ".join(candidates)
        + ". Set the DIAMOND_MCP_ENCYCLOPEDIA environment variable to its full path."
    )


# The encyclopedia is loaded lazily on first use and cached here, so a client
# that never calls define or search_encyclopedia never pays to parse it.
_ENCYCLOPEDIA = None


def _encyclopedia():
    global _ENCYCLOPEDIA
    if _ENCYCLOPEDIA is None:
        path = _encyclopedia_path()
        with open(path, "r", encoding="utf-8") as fh:
            _ENCYCLOPEDIA = json.load(fh)
    return _ENCYCLOPEDIA


def _enc_norm(text):
    """Lowercase and collapse punctuation to spaces, so 'bow-tie' == 'bow tie'."""
    return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()


def _enc_snippet(text, limit=200):
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + " ..."


# ---------------------------------------------------------------------------
# Tool implementations. Each handler takes an arguments dict and returns
# (payload_dict, is_error). Tool level problems (bad shape, unknown lab) are
# reported through isError, not as protocol errors, so the calling model can
# read the message and correct itself.
# ---------------------------------------------------------------------------


def tool_verify_diamond_report(args):
    section = FACTS["report_verification"]
    labs = section["labs"]
    raw_lab = args.get("lab", "")
    key = "".join(ch for ch in str(raw_lab) if ch.isalnum()).upper()
    if key not in labs:
        return (
            {
                "error": "Unknown lab: " + str(raw_lab) + ". Supported labs: "
                + ", ".join(sorted(labs)) + ".",
                "note": "If the report comes from another lab, verify it on that lab's own site.",
            },
            True,
        )
    lab = labs[key]
    report_number = str(args.get("report_number", "")).strip()
    payload = {
        "lab": key,
        "lab_full_name": lab["full_name"],
        "report_number": report_number if report_number else "not provided",
        "verify_url": lab["verify_url"],
        "checklist": section["checklist"],
        "reminder": section["never_claim"],
        "source": lab["source"],
        "source_date": lab["date"],
    }
    return (payload, False)


def tool_faceup_size(args):
    section = FACTS["faceup_size"]
    anchors = section["anchors_1ct_mm"]
    raw_shape = str(args.get("shape", ""))
    shape = "_".join(raw_shape.strip().lower().replace("-", " ").replace("_", " ").split())
    if shape not in anchors:
        return (
            {
                "error": "Unsupported shape: " + raw_shape + ". Supported shapes: "
                + ", ".join(sorted(anchors)) + ".",
            },
            True,
        )
    try:
        carat = float(args.get("carat"))
    except (TypeError, ValueError):
        return ({"error": "carat must be a number greater than zero, for example 1.0 or 1.52."}, True)
    if not math.isfinite(carat) or carat <= 0:
        return ({"error": "carat must be a number greater than zero, for example 1.0 or 1.52."}, True)
    anchor = anchors[shape]
    factor = carat ** (1.0 / 3.0)
    length = round(anchor["length"] * factor, 1)
    width = round(anchor["width"] * factor, 1)
    payload = {
        "shape": shape,
        "carat": carat,
        "approx_face_up_mm": {"length": length, "width": width},
        "display": str(length) + " x " + str(width) + " mm",
        "anchor_1ct_mm": str(anchor["length"]) + " x " + str(anchor["width"]) + " mm",
        "method": section["method"],
        "note": section["honesty_note"],
        "source": section["source"],
        "source_date": section["date"],
    }
    return (payload, False)


def tool_dutch_marquise_definition(args):
    d = FACTS["dutch_marquise"]
    payload = {
        "term": "Dutch Marquise",
        "definition": d["definition"],
        "geometry": d["geometry"],
        "status": d["status"],
        "on_an_igi_report": d["certificate_term"]["claim"],
        "length_to_width": d["length_to_width"],
        "source": d["source"],
        "source_date": d["date"],
    }
    return (payload, False)


def tool_lab_grown_grading_landscape(args):
    return (FACTS["lab_grown_grading_landscape"], False)


def tool_lab_grown_price_index(args):
    return (FACTS["lab_grown_price_index"], False)


def tool_about_stienhardt(args):
    return (FACTS["stienhardt"], False)


def tool_define(args):
    entries = _encyclopedia()["entries"]
    raw = str(args.get("term", "")).strip()
    if not raw:
        return ({"error": 'Provide a term to define, for example {"term": "Dutch Marquise"}.'}, True)
    query_lower = raw.lower()

    # 1. Exact term match, case insensitive.
    for e in entries:
        if e["term"].lower() == query_lower:
            return (_define_payload(e, "exact"), False)

    # 2. Substring or alias match. A term substring in either direction wins;
    #    failing that, a hit against the entry's related terms counts as an alias.
    query_norm = _enc_norm(raw)
    best = None
    best_score = 0
    for e in entries:
        term_norm = _enc_norm(e["term"])
        score = 0
        if query_norm and query_norm in term_norm:
            score = 70 + len(query_norm)
        elif query_norm and term_norm in query_norm:
            score = 40 + len(term_norm)
        else:
            for related in e.get("related", []):
                related_norm = _enc_norm(related)
                if query_norm and (query_norm == related_norm
                                   or query_norm in related_norm
                                   or related_norm in query_norm):
                    score = 30
                    break
        if score > best_score:
            best_score = score
            best = e
    if best is not None:
        return (_define_payload(best, "alias"), False)

    # 3. No match. Offer the three nearest terms as suggestions.
    lower_to_term = {}
    for e in entries:
        lower_to_term.setdefault(e["term"].lower(), e["term"])
    keys = list(lower_to_term.keys())
    near = difflib.get_close_matches(query_lower, keys, n=3, cutoff=0.6)
    if not near:
        near = difflib.get_close_matches(query_lower, keys, n=3, cutoff=0.0)
    suggestions = [lower_to_term[k] for k in near][:3]
    return (
        {
            "found": False,
            "query": raw,
            "message": "No encyclopedia entry matches '" + raw + "'. Nearest terms are suggested.",
            "suggestions": suggestions,
        },
        True,
    )


def _define_payload(entry, match):
    return {
        "found": True,
        "match": match,
        "term": entry["term"],
        "category": entry["category"],
        "definition": entry["definition"],
        "body": entry["body"],
        "sources": entry["sources"],
        "related": entry["related"],
    }


def tool_search_encyclopedia(args):
    entries = _encyclopedia()["entries"]
    raw = str(args.get("query", "")).strip()
    if not raw:
        return ({"error": 'Provide a query, for example {"query": "bow tie"}.'}, True)
    try:
        limit = int(args.get("limit", 5))
    except (TypeError, ValueError):
        limit = 5
    limit = max(1, min(10, limit))

    keywords = [k for k in _enc_norm(raw).split() if k]
    if not keywords:
        return ({"error": "Query had no searchable keywords."}, True)

    scored = []
    for e in entries:
        term_l = e["term"].lower()
        definition_l = e["definition"].lower()
        body_l = e["body"].lower()
        score = 0
        for kw in keywords:
            score += 3 * term_l.count(kw)
            score += 2 * definition_l.count(kw)
            score += 1 * body_l.count(kw)
        if score > 0:
            scored.append((score, e))
    scored.sort(key=lambda pair: (-pair[0], pair[1]["term"].lower()))

    results = [
        {
            "term": e["term"],
            "category": e["category"],
            "definition": _enc_snippet(e["definition"]),
            "score": score,
        }
        for score, e in scored[:limit]
    ]
    return ({"query": raw, "count": len(results), "results": results}, False)


TOOLS = [
    {
        "name": "verify_diamond_report",
        "title": "Where and how to verify a diamond grading report",
        "description": (
            "Returns the official verification URL and a three step checklist for "
            "confirming a diamond grading report with the lab that issued it. "
            "Supports GIA, IGI, and GCAL. This tool never verifies anything itself. "
            "It tells you where and how."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "lab": {
                    "type": "string",
                    "description": "The grading lab that issued the report: GIA, IGI, or GCAL. Case insensitive.",
                },
                "report_number": {
                    "type": "string",
                    "description": "The report number printed on the grading report.",
                },
            },
            "required": ["lab", "report_number"],
        },
    },
    {
        "name": "faceup_size",
        "title": "Approximate face up size for a shape and carat weight",
        "description": (
            "Approximate face up millimeter dimensions for a diamond of a given shape "
            "and carat weight. Supported shapes: round, oval, emerald, dutch_marquise. "
            "Scales vetted 1 carat anchors by the cube root of the carat weight. "
            "Typical proportions, not a guarantee: verify a specific stone on its grading report."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "shape": {
                    "type": "string",
                    "description": "One of: round, oval, emerald, dutch_marquise. Case insensitive. Spaces and hyphens are accepted.",
                },
                "carat": {
                    "type": "number",
                    "description": "Carat weight greater than zero, for example 1.0 or 1.52.",
                },
            },
            "required": ["shape", "carat"],
        },
    },
    {
        "name": "dutch_marquise_definition",
        "title": "The published definition of the Dutch Marquise cut",
        "description": (
            "The published definition of the Dutch Marquise diamond cut: geometry, "
            "certificate wording, and typical length to width ratio. "
            "A Dutch Marquise is an elongated hexagonal cut diamond."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "lab_grown_grading_landscape",
        "title": "Who grades Lab Grown Diamonds today",
        "description": (
            "The current state of who grades Lab Grown Diamonds and how: GIA, IGI, "
            "HRD Antwerp, and the FTC position. Every item carries a source and a date."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "lab_grown_price_index",
        "title": "Latest tracked Lab Grown Diamond retail price reading",
        "description": (
            "The latest tracked retail price reading for Lab Grown Diamonds, with "
            "source and date. Market context for shoppers, not investment guidance."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "about_stienhardt",
        "title": "Fact sheet: Stienhardt & Stones",
        "description": (
            "Plain fact sheet about Stienhardt & Stones, the New York City Lab Grown "
            "Diamond brand that publishes this server. Every fact carries a source and a date."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "define",
        "title": "Define a diamond or gemology term",
        "description": (
            "Look up a single diamond or gemology term in the encyclopedia of 90 "
            "adversarially fact-checked entries. Matches the term exactly (case "
            "insensitive), then by substring or related-term alias. Returns the full "
            "entry: definition, body, sourced claims, and related terms. If nothing "
            "matches, returns the three nearest term suggestions."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "term": {
                    "type": "string",
                    "description": "The term to define, for example \"Dutch Marquise\" or \"bow-tie effect\". Case insensitive.",
                },
            },
            "required": ["term"],
        },
    },
    {
        "name": "search_encyclopedia",
        "title": "Keyword search across the diamond encyclopedia",
        "description": (
            "Keyword search across the 90 entry diamond and gemology encyclopedia. "
            "Ranks case insensitive keyword hits by field, weighting the term above "
            "the definition above the body. Returns the best matches as term, "
            "category, and a definition snippet. Use define to fetch a full entry."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords to search for, for example \"bow tie\" or \"lab grown durability\".",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results to return, 1 to 10. Default 5.",
                },
            },
            "required": ["query"],
        },
    },
]

TOOL_HANDLERS = {
    "verify_diamond_report": tool_verify_diamond_report,
    "faceup_size": tool_faceup_size,
    "dutch_marquise_definition": tool_dutch_marquise_definition,
    "lab_grown_grading_landscape": tool_lab_grown_grading_landscape,
    "lab_grown_price_index": tool_lab_grown_price_index,
    "about_stienhardt": tool_about_stienhardt,
    "define": tool_define,
    "search_encyclopedia": tool_search_encyclopedia,
}


# ---------------------------------------------------------------------------
# JSON-RPC 2.0 over stdio (newline delimited), per the MCP stdio transport.
# ---------------------------------------------------------------------------


def _result(msg_id, result):
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id, code, message):
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def handle_message(msg):
    """Handle one decoded JSON-RPC message. Returns a response dict or None."""
    if not isinstance(msg, dict):
        return _error(None, -32600, "Invalid request")
    method = msg.get("method")
    msg_id = msg.get("id")
    is_request = "id" in msg and msg_id is not None
    if not isinstance(method, str):
        return _error(msg_id, -32600, "Invalid request") if is_request else None
    if not is_request:
        # Notifications (initialized, cancelled, and so on) need no reply.
        return None
    if method == "initialize":
        params = msg.get("params") or {}
        requested = params.get("protocolVersion")
        version = requested if requested in SUPPORTED_PROTOCOL_VERSIONS else SUPPORTED_PROTOCOL_VERSIONS[0]
        return _result(msg_id, {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {
                "name": SERVER_NAME,
                "title": SERVER_TITLE,
                "version": SERVER_VERSION,
            },
            "instructions": INSTRUCTIONS,
        })
    if method == "ping":
        return _result(msg_id, {})
    if method == "tools/list":
        return _result(msg_id, {"tools": TOOLS})
    if method == "tools/call":
        params = msg.get("params") or {}
        name = params.get("name")
        handler = TOOL_HANDLERS.get(name)
        if handler is None:
            return _error(msg_id, -32602, "Unknown tool: " + str(name))
        arguments = params.get("arguments")
        if not isinstance(arguments, dict):
            arguments = {}
        try:
            payload, is_error = handler(arguments)
        except Exception as exc:
            payload, is_error = {"error": "Tool failed: " + str(exc)}, True
        text = json.dumps(payload, indent=2, ensure_ascii=True)
        return _result(msg_id, {
            "content": [{"type": "text", "text": text}],
            "isError": bool(is_error),
        })
    if method == "resources/list":
        return _result(msg_id, {"resources": []})
    if method == "prompts/list":
        return _result(msg_id, {"prompts": []})
    return _error(msg_id, -32601, "Method not found: " + method)


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if "--version" in args:
        sys.stdout.write(SERVER_NAME + " " + SERVER_VERSION + "\n")
        return 0
    # Byte level wrappers keep the wire format stable on every platform:
    # UTF-8 both ways, plain "\n" line endings, no Windows "\r\n" translation.
    stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
    stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", newline="\n")
    sys.stderr.write(SERVER_NAME + " " + SERVER_VERSION + " ready on stdio (facts: " + _FACTS_FILE + ")\n")
    sys.stderr.flush()
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            response = _error(None, -32700, "Parse error")
        else:
            try:
                response = handle_message(msg)
            except Exception as exc:
                bad_id = msg.get("id") if isinstance(msg, dict) else None
                response = _error(bad_id, -32603, "Internal error: " + str(exc))
        if response is None:
            continue
        try:
            stdout.write(json.dumps(response, ensure_ascii=True) + "\n")
            stdout.flush()
        except (BrokenPipeError, OSError):
            return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
