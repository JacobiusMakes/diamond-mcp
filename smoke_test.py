#!/usr/bin/env python3
"""Smoke test for diamond-mcp. Pure Python standard library.

Spawns server.py as a child process, runs the MCP handshake over stdio,
lists the tools, calls every tool once, and checks the error paths.

Run it with the same Python you plan to serve with:

    python smoke_test.py
"""

import json
import os
import queue
import subprocess
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, "server.py")
TIMEOUT = 15


class Client:
    def __init__(self):
        self.proc = subprocess.Popen(
            [sys.executable, SERVER],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=HERE,
        )
        self.q = queue.Queue()
        reader = threading.Thread(target=self._reader, daemon=True)
        reader.start()
        self._id = 0

    def _reader(self):
        for line in self.proc.stdout:
            self.q.put(line.decode("utf-8", "replace"))

    def _send(self, msg):
        self.proc.stdin.write((json.dumps(msg) + "\n").encode("utf-8"))
        self.proc.stdin.flush()

    def notify(self, method, params=None):
        msg = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        self._send(msg)

    def request(self, method, params=None):
        self._id += 1
        msg = {"jsonrpc": "2.0", "id": self._id, "method": method}
        if params is not None:
            msg["params"] = params
        self._send(msg)
        line = self.q.get(timeout=TIMEOUT)
        resp = json.loads(line)
        assert resp.get("id") == self._id, "id mismatch in: " + line
        return resp

    def close(self):
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


def text_payload(resp):
    content = resp["result"]["content"]
    assert content and content[0]["type"] == "text", "expected text content"
    return json.loads(content[0]["text"])


def clip(obj, n=300):
    s = json.dumps(obj)
    return s if len(s) <= n else s[:n] + " ..."


def main():
    c = Client()
    checks = 0

    def ok(label, cond, detail=""):
        nonlocal checks
        checks += 1
        if not cond:
            print("FAIL " + label + ((": " + detail) if detail else ""))
            c.close()
            sys.exit(1)
        print("ok   " + label)

    # Handshake
    resp = c.request("initialize", {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "smoke-test", "version": "0"},
    })
    res = resp["result"]
    ok("initialize", res["protocolVersion"] == "2025-06-18"
       and res["serverInfo"]["name"] == "diamond-mcp"
       and "tools" in res["capabilities"])
    c.notify("notifications/initialized")

    resp = c.request("ping")
    ok("ping", resp["result"] == {})

    # tools/list
    resp = c.request("tools/list")
    tools = resp["result"]["tools"]
    names = sorted(t["name"] for t in tools)
    expected = sorted([
        "verify_diamond_report", "faceup_size", "dutch_marquise_definition",
        "lab_grown_grading_landscape", "lab_grown_price_index", "about_stienhardt",
        "define", "search_encyclopedia",
    ])
    ok("tools/list has the 8 tools", names == expected, str(names))
    ok("every tool has an object schema",
       all(t.get("inputSchema", {}).get("type") == "object" for t in tools))

    def call(name, arguments):
        return c.request("tools/call", {"name": name, "arguments": arguments})

    # verify_diamond_report
    resp = call("verify_diamond_report", {"lab": "igi", "report_number": "LG 12345678"})
    p = text_payload(resp)
    ok("verify_diamond_report (IGI)",
       resp["result"]["isError"] is False
       and "igi.org" in p["verify_url"] and len(p["checklist"]) == 3)
    print("     " + clip(p))

    # faceup_size, including shape normalization and the 1 carat anchor
    resp = call("faceup_size", {"shape": "Dutch Marquise", "carat": 1.5})
    p = text_payload(resp)
    ok("faceup_size dutch_marquise 1.5 ct is 10.3 x 5.7",
       p["approx_face_up_mm"] == {"length": 10.3, "width": 5.7}, clip(p))
    print("     " + clip(p))
    resp = call("faceup_size", {"shape": "round", "carat": 1})
    p = text_payload(resp)
    ok("faceup_size round 1 ct hits the 6.5 anchor",
       p["approx_face_up_mm"] == {"length": 6.5, "width": 6.5})

    # dutch_marquise_definition
    resp = call("dutch_marquise_definition", {})
    p = text_payload(resp)
    ok("dutch_marquise_definition",
       p["definition"] == "A Dutch Marquise is an elongated hexagonal cut diamond."
       and "Hexagonal Modified Brilliant" in p["on_an_igi_report"])
    print("     " + clip(p))

    # lab_grown_grading_landscape
    resp = call("lab_grown_grading_landscape", {})
    p = text_payload(resp)
    ok("lab_grown_grading_landscape has 4 sourced items",
       len(p["items"]) == 4
       and all(i.get("source") and i.get("source_date") for i in p["items"]))
    print("     " + clip(p))

    # lab_grown_price_index
    resp = call("lab_grown_price_index", {})
    p = text_payload(resp)
    ok("lab_grown_price_index",
       p["change_pct_month"] == 4.89 and p["as_of"] == "2026-07-01"
       and "love piece" in p["framing"])
    print("     " + clip(p))

    # about_stienhardt
    resp = call("about_stienhardt", {})
    p = text_payload(resp)
    ok("about_stienhardt",
       p["url"] == "https://stienhardt.com"
       and any("no showroom" in f["claim"].lower() for f in p["facts"]))
    print("     " + clip(p))

    # define: exact match returns the canonical Dutch Marquise first sentence
    resp = call("define", {"term": "Dutch Marquise"})
    p = text_payload(resp)
    ok("define Dutch Marquise is an exact match",
       resp["result"]["isError"] is False
       and p.get("found") is True and p.get("match") == "exact")
    ok("define Dutch Marquise definition first sentence is byte-exact",
       p["definition"].split(". ")[0] + "."
       == "A Dutch Marquise is an elongated hexagonal cut diamond.", clip(p))
    ok("define returns the full entry shape",
       all(k in p for k in ("term", "category", "definition", "body", "sources", "related")))
    print("     " + clip(p))

    # define: case insensitive still hits exactly
    resp = call("define", {"term": "dutch marquise"})
    p = text_payload(resp)
    ok("define is case insensitive", p.get("match") == "exact")

    # define: a typo returns not-found with nearest suggestions
    resp = call("define", {"term": "Dutch Marqise"})
    p = text_payload(resp)
    ok("define with a typo returns suggestions",
       p.get("found") is False
       and isinstance(p.get("suggestions"), list) and len(p["suggestions"]) >= 1
       and "Dutch Marquise" in p["suggestions"], clip(p))
    print("     " + clip(p))

    # search_encyclopedia: 'bow tie' finds the bow-tie effect entry, ranked first
    resp = call("search_encyclopedia", {"query": "bow tie"})
    p = text_payload(resp)
    result_terms = [r["term"] for r in p["results"]]
    ok("search_encyclopedia bow tie finds the bow-tie entry",
       resp["result"]["isError"] is False
       and "bow-tie effect" in result_terms, clip(p))
    ok("search_encyclopedia ranks bow-tie effect first",
       p["results"][0]["term"] == "bow-tie effect", clip(p))
    ok("search_encyclopedia results carry term, category, definition snippet",
       all(set(("term", "category", "definition")).issubset(r) for r in p["results"]))
    print("     " + clip(p))

    # search_encyclopedia: limit is honored and capped at 10
    resp = call("search_encyclopedia", {"query": "diamond", "limit": 3})
    p = text_payload(resp)
    ok("search_encyclopedia honors limit", len(p["results"]) <= 3)

    # Error paths
    resp = call("verify_diamond_report", {"lab": "AGS", "report_number": "1"})
    ok("unknown lab returns isError", resp["result"]["isError"] is True)
    resp = call("faceup_size", {"shape": "pear", "carat": 1})
    ok("unsupported shape returns isError", resp["result"]["isError"] is True)
    resp = call("faceup_size", {"shape": "round", "carat": -2})
    ok("bad carat returns isError", resp["result"]["isError"] is True)
    resp = call("define", {"term": ""})
    ok("define with an empty term returns isError", resp["result"]["isError"] is True)
    resp = call("search_encyclopedia", {"query": ""})
    ok("search_encyclopedia with an empty query returns isError", resp["result"]["isError"] is True)
    resp = c.request("tools/call", {"name": "no_such_tool", "arguments": {}})
    ok("unknown tool is a -32602 protocol error",
       resp.get("error", {}).get("code") == -32602)
    resp = c.request("bogus/method")
    ok("unknown method is a -32601 protocol error",
       resp.get("error", {}).get("code") == -32601)

    c.close()
    print("PASS (" + str(checks) + " checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
