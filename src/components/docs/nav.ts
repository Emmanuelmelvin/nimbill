// The docs' navigation: the three areas (tabs), their sidebar groups and pages, in reading order.
// The sidebar, the "Next/Previous" links, the search box and the old-anchor redirects are all made
// from this list. Endpoint and tool entries come from api-reference.ts and mcp-data.ts, so a new
// endpoint or tool shows up here on its own. Shared by the server and the browser.
import { ENDPOINTS, type Endpoint } from "@/lib/api-reference";
import { TOOLS, TOOL_CATEGORIES } from "./mcp-data";

export type DocTabKey = "docs" | "ai" | "mcp";

/** A heading on a page, for search: [anchor id, text]. */
export type DocHeading = [id: string, title: string];

export type DocPage = {
  href: string;
  title: string;
  /** A method badge in the sidebar, for API endpoints. */
  method?: Endpoint["method"];
  /** Listed but not written yet. */
  soon?: boolean;
  headings?: DocHeading[];
  /** More words the search box should match (an endpoint's path, for example). */
  keywords?: string;
};

export type DocGroup = { title: string; pages: DocPage[] };
export type DocTab = { key: DocTabKey; label: string; href: string; groups: DocGroup[] };

/** `getBoard` → `get-board`, for endpoint page URLs. */
export const endpointSlug = (id: string) => id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const endpointHref = (id: string) => `/docs/api/${endpointSlug(id)}`;

/** Anchor ids for the tool categories on /mcp/tools. */
export const categoryId = (c: string) => c.toLowerCase().replace(/[^a-z]+/g, "-");

export const DOC_TABS: DocTab[] = [
  {
    key: "docs",
    label: "Developers",
    href: "/docs",
    groups: [
      {
        title: "Get started",
        pages: [
          {
            href: "/docs",
            title: "Introduction",
            headings: [
              ["works-with", "Works with"],
              ["why", "Why use it"],
              ["no-setup", "What you don't need"],
              ["next", "Where to go next"],
            ],
          },
          {
            href: "/docs/quick-start",
            title: "Quick start",
            headings: [
              ["curl", "Buy a product with curl"],
              ["javascript", "The same in JavaScript"],
            ],
          },
          {
            href: "/docs/how-it-works",
            title: "How payments work",
            headings: [
              ["steps", "Five calls, one blockchain check"],
              ["verify", "Why a separate verify step?"],
              ["two-ways", "Two ways to pay"],
            ],
          },
        ],
      },
      {
        title: "Board API",
        pages: [
          {
            href: "/docs/api",
            title: "Overview",
            headings: [
              ["base-url", "Base URL"],
              ["errors", "Errors"],
              ["endpoints", "Endpoints"],
              ["machine-readable", "Machine-readable"],
            ],
          },
          ...ENDPOINTS.map(
            (e): DocPage => ({
              href: endpointHref(e.id),
              title: e.summary,
              method: e.method,
              keywords: `${e.method} ${e.path} ${e.id}`,
              headings: [
                ...(e.params ? [["path", "Path parameters"] as DocHeading] : []),
                ...(e.query ? [["query", "Query parameters"] as DocHeading] : []),
                ...(e.body ? [["body", "Body"] as DocHeading] : []),
                ["request", "Request"],
                ["response", "Response"],
                ["errors", "When it goes wrong"],
              ],
            }),
          ),
        ],
      },
      {
        title: "Guides",
        pages: [
          {
            href: "/docs/sending",
            title: "Sending the payment",
            headings: [
              ["nim", "NIM (Nimiq)"],
              ["usdt", "USDT (Polygon)"],
              ["timing", "Send before the quote runs out"],
            ],
          },
          {
            href: "/docs/safety",
            title: "Safety and limits",
            headings: [
              ["agents", "For anyone building an agent"],
              ["limits", "Limits and guarantees"],
            ],
          },
        ],
      },
      {
        title: "Pay with NimBill",
        pages: [{ href: "/docs/webhooks", title: "Webhooks", soon: true }],
      },
    ],
  },
  {
    key: "ai",
    label: "AI assistants",
    href: "/ai",
    groups: [
      {
        title: "Overview",
        pages: [
          {
            href: "/ai",
            title: "How an AI pays with NimBill",
            headings: [
              ["works-with", "Works with"],
              ["two-ways", "Two ways to pay"],
              ["steps", "What the assistant does"],
              ["setup", "Set up your AI"],
              ["files", "Files for agents"],
            ],
          },
        ],
      },
      {
        title: "Set up your AI",
        pages: [
          { href: "/ai/claude", title: "Claude", headings: [["install", "Install the skill"], ["skill-file", "SKILL.md"]] },
          { href: "/ai/chatgpt", title: "ChatGPT", headings: [["custom-gpt", "Make a custom GPT"], ["instructions", "Instructions"]] },
          { href: "/ai/cursor", title: "Cursor", headings: [["rule", "Add a project rule"]] },
          {
            href: "/ai/other",
            title: "Grok, Gemini and others",
            headings: [["instructions", "Instructions"], ["browsing", "Assistants that browse"]],
          },
          { href: "/ai/own-agent", title: "Your own agent or code", headings: [["files", "Point it at a file"], ["mcp", "Give it a wallet"]] },
        ],
      },
    ],
  },
  {
    key: "mcp",
    label: "MCP server",
    href: "/mcp",
    groups: [
      {
        title: "Get started",
        pages: [
          {
            href: "/mcp",
            title: "MCP Agent Wallet",
            headings: [
              ["install", "Run it with npx"],
              ["hosts", "Compatible hosts"],
              ["what-it-does", "What it does"],
              ["prompts", "Example prompts"],
            ],
          },
          {
            href: "/mcp/connect",
            title: "Connect your AI",
            headings: [
              ["agent-install", "Let your agent install it"],
              ["claude-desktop", "Claude Desktop"],
              ["claude-code", "Claude Code (CLI)"],
              ["cursor", "Cursor"],
              ["other-clients", "Antigravity, Windsurf and other clients"],
              ["env", "Environment variables"],
            ],
          },
          { href: "/mcp/funding", title: "Fund your agent", headings: [["ways", "Three ways to fund it"]] },
        ],
      },
      {
        title: "Reference",
        pages: [
          {
            href: "/mcp/tools",
            title: `All ${TOOLS.length} tools`,
            headings: [
              ["resource", "nimbill://wallet resource"],
              ...TOOL_CATEGORIES.map((c): DocHeading => [categoryId(c), c]),
              ...TOOLS.map((t): DocHeading => [`tool-${t.name}`, t.name]),
            ],
          },
          {
            href: "/mcp/security",
            title: "Under the hood and security",
            headings: [
              ["architecture", "How it works under the hood"],
              ["security", "Security and custody"],
              ["test", "Test it locally"],
            ],
          },
        ],
      },
    ],
  },
];

export type DocLocation = { tab: DocTab; group: DocGroup; page: DocPage };

const ALL: DocLocation[] = DOC_TABS.flatMap((tab) => tab.groups.flatMap((group) => group.pages.map((page) => ({ tab, group, page }))));

/** Where a path sits in the docs, or undefined for a path that isn't a docs page. */
export function locate(path: string): DocLocation | undefined {
  const clean = path.replace(/\/+$/, "") || "/";
  return ALL.find((l) => l.page.href === clean);
}

/** The tab a path belongs to, by its first segment (also for paths that aren't listed). */
export function tabFor(path: string): DocTab {
  return locate(path)?.tab ?? DOC_TABS.find((t) => path.startsWith(t.href)) ?? DOC_TABS[0];
}

/** The pages before and after this one within its tab. */
export function neighbours(path: string): { prev?: DocPage; next?: DocPage } {
  const here = locate(path);
  if (!here) return {};
  const pages = here.tab.groups.flatMap((g) => g.pages);
  const i = pages.indexOf(here.page);
  return { prev: pages[i - 1], next: pages[i + 1] };
}

export type SearchEntry = { href: string; title: string; context: string; tab: string; keywords?: string };

/** Every page and heading, for the search box. */
export const SEARCH_INDEX: SearchEntry[] = ALL.flatMap(({ tab, group, page }) => [
  { href: page.href, title: page.title, context: `${tab.label} › ${group.title}`, tab: tab.label, keywords: page.keywords },
  ...(page.headings ?? []).map(([id, title]) => ({
    href: `${page.href}#${id}`,
    title,
    context: `${group.title} › ${page.title}`,
    tab: tab.label,
  })),
]);

/**
 * Anchors from when /docs and /mcp were single long pages, so old links still land on the right
 * section. A hash never reaches the server, so the shell checks these in the browser.
 */
export const LEGACY_HASHES: Record<string, Record<string, string>> = {
  "/docs": {
    how: "/docs/how-it-works",
    "two-ways": "/ai#two-ways",
    "quick-start": "/docs/quick-start",
    sending: "/docs/sending",
    reference: "/docs/api",
    setup: "/ai#setup",
    safety: "/docs/safety",
    ...Object.fromEntries(ENDPOINTS.map((e) => [e.id, endpointHref(e.id)])),
  },
  "/mcp": {
    connect: "/mcp/connect",
    funding: "/mcp/funding",
    tools: "/mcp/tools",
    architecture: "/mcp/security#architecture",
    security: "/mcp/security#security",
    ...Object.fromEntries(TOOLS.map((t) => [`tool-${t.name}`, `/mcp/tools#tool-${t.name}`])),
  },
};
