// The same HTTP request written for curl, JavaScript and Python, for the code tabs in the docs.
// Made from an endpoint's method, URL and example body (api-reference.ts), never typed by hand.
import type { Endpoint } from "@/lib/api-reference";

export type CodeTab = { label: string; code: string };

/** Example values for the {placeholders} in endpoint paths and their query parameters. */
const EXAMPLE_VALUES: Record<string, string> = { tag: "ada", id: "89mwch33sp", currency: "NGN" };

/** An endpoint's example URL, with its path and query filled in. */
export function exampleUrl(base: string, e: Endpoint): string {
  const path = e.path.replace(/\{(\w+)\}/g, (m, k: string) => EXAMPLE_VALUES[k] ?? m);
  const query = (e.query ?? [])
    .filter((q) => EXAMPLE_VALUES[q.name])
    .map((q) => `${q.name}=${encodeURIComponent(EXAMPLE_VALUES[q.name])}`)
    .join("&");
  return base + path + (query ? `?${query}` : "");
}

/** A Python literal for JSON-like data (True/False/None instead of true/false/null). */
function py(v: unknown, indent = ""): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number" || typeof v === "string") return JSON.stringify(v);
  const next = indent + "    ";
  if (Array.isArray(v)) return `[${v.map((x) => py(x, indent)).join(", ")}]`;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${py(x, next)},`).join("\n")}\n${indent}}`;
}

/** The request as curl, JavaScript (fetch) and Python (requests). */
export function requestTabs(method: "GET" | "POST", url: string, body?: unknown): CodeTab[] {
  if (method === "GET") {
    return [
      { label: "curl", code: `curl ${url}` },
      { label: "JavaScript", code: `const res = await fetch("${url}");\nconst data = await res.json();` },
      { label: "Python", code: `import requests\n\ndata = requests.get("${url}").json()` },
    ];
  }
  const json = JSON.stringify(body ?? {});
  const jsBody = JSON.stringify(body ?? {}, null, 2).replace(/\n/g, "\n  ");
  return [
    {
      label: "curl",
      code: `curl -X POST ${url} \\\n  -H 'content-type: application/json' \\\n  -d '${json.replace(/'/g, "'\\''")}'`,
    },
    {
      label: "JavaScript",
      code: `const res = await fetch("${url}", {\n  method: "POST",\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify(${jsBody}),\n});\nconst data = await res.json();`,
    },
    { label: "Python", code: `import requests\n\ndata = requests.post(\n    "${url}",\n    json=${py(body ?? {}, "    ")},\n).json()` },
  ];
}
