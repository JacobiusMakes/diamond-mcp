// Renders the browsable encyclopedia/ Markdown mirror from encyclopedia.json (the source of truth).
// Usage: node node/scripts/build-encyclopedia-md.mjs [outDir]   (default: <repo>/encyclopedia)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const outDir = process.argv[2] ? resolve(process.argv[2]) : join(root, "encyclopedia");
const data = JSON.parse(readFileSync(join(root, "encyclopedia.json"), "utf8"));
const entries = data.entries;
const CATEGORY_ORDER = ["Cuts and shapes", "The 4Cs and grading", "Diamond anatomy", "Light and optics",
  "Materials and simulants", "Lab Grown Diamonds", "Settings and metals", "Care and buying", "History and myths"];

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const byLower = new Map(entries.map((e) => [e.term.toLowerCase(), e]));
const sortTerms = (a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase(), "en");

function sourceLine(s) {
  const cite = [s.source, s.date].filter(Boolean).join(", ");
  const url = s.url ? " " + s.url : "";
  return `- ${s.claim} (Source: ${cite}.${url})`;
}
function relatedLine(related) {
  return related.map((r) => {
    const e = byLower.get(String(r).toLowerCase());
    return e ? `[${r}](${slug(e.term)}.md)` : r;
  }).join(", ");
}
function render(e) {
  const parts = [`# ${e.term}`, "", `*${e.category}*`, "", `**${e.definition}**`, "", e.body.trim(), ""];
  if (e.sources && e.sources.length) parts.push("## Sources", "", ...e.sources.map(sourceLine), "");
  if (e.related && e.related.length) parts.push("## Related", "", relatedLine(e.related), "");
  return parts.join("\n");
}

mkdirSync(outDir, { recursive: true });
for (const e of entries) writeFileSync(join(outDir, slug(e.term) + ".md"), render(e), "utf8");

const cats = [...CATEGORY_ORDER, ...[...new Set(entries.map((e) => e.category))].filter((c) => !CATEGORY_ORDER.includes(c))];
const index = [
  "# Diamond & Gemology Encyclopedia", "",
  `${entries.length} fact-checked and sourced entries across ${cats.filter((c) => entries.some((e) => e.category === c)).length} domains. Every historical or numeric claim carries a source and a date.`, "",
  "Machine-readable copy: [`../encyclopedia.json`](../encyclopedia.json). Queryable in the MCP server via the `define` and `search_encyclopedia` tools.", "",
  `Updated ${data.updated}. Maintained by ${data.maintainer || "Stienhardt"}. License: ${data.license || "MIT"}.`, "",
];
for (const c of cats) {
  const list = entries.filter((e) => e.category === c).sort(sortTerms);
  if (!list.length) continue;
  index.push(`## ${c} (${list.length})`, "", ...list.map((e) => `- [${e.term}](${slug(e.term)}.md)`), "");
}
writeFileSync(join(outDir, "README.md"), index.join("\n"), "utf8");
console.log(`encyclopedia markdown: ${entries.length} entries + index written to ${outDir}`);
