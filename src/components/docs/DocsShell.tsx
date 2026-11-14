"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { LinkButton, Logo, cx } from "../ui";
import { MethodBadge } from "./MethodBadge";
import { DOC_TABS, LEGACY_HASHES, SEARCH_INDEX, locate, neighbours, tabFor, type DocPage, type DocTab, type SearchEntry } from "./nav";

// The docs frame shared by /docs, /ai and /mcp, laid out like Mintlify docs: a top bar with the
// three areas as tabs and a search box, the area's pages in a sidebar on the left (a drawer on
// phones), the page in the middle, "On this page" on the right, and Previous/Next at the bottom.

export function DocsShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const here = locate(path);
  const tab = tabFor(path);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useLegacyHashes(path);

  // Ctrl/Cmd+K or "/" opens search, like most docs sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="bleed">
      <header className="sticky top-0 z-30 border-b border-ink bg-paper">
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4 sm:px-6">
          <Logo />
          <span className="border border-ink px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider uppercase">Docs</span>
          <SearchButton onClick={() => setSearchOpen(true)} className="ml-auto hidden w-64 md:flex lg:ml-8" />
          <nav aria-label="Docs links" className="ml-auto hidden items-center gap-4 text-sm lg:flex">
            {[
              ["/llms.txt", "llms.txt"],
              ["/openapi.json", "openapi.json"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="font-mono text-xs text-muted transition-colors hover:text-ink">
                {label}
              </a>
            ))}
            <LinkButton href="/" size="sm">
              Get your tag
            </LinkButton>
          </nav>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search the docs"
            className="ml-auto flex h-10 w-10 items-center justify-center border border-ink md:hidden"
          >
            <SearchIcon />
          </button>
        </div>
        {/* The three areas, as tabs (wide screens). */}
        <nav aria-label="Docs areas" className="hidden border-t border-line lg:block">
          <ul className="mx-auto flex h-11 max-w-[90rem] items-stretch gap-6 px-6">
            {DOC_TABS.map((t) => (
              <li key={t.key} className="flex">
                <Link
                  href={t.href}
                  aria-current={t.key === tab.key ? "page" : undefined}
                  className={cx(
                    "-mb-px flex items-center border-b-2 text-sm font-semibold transition-colors",
                    t.key === tab.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {/* Phones: where you are, and the button that opens the menu. */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open the docs menu"
          aria-expanded={menuOpen}
          className="flex h-11 w-full items-center gap-3 border-t border-line px-4 text-left text-sm sm:px-6 lg:hidden"
        >
          <MenuIcon />
          <span className="min-w-0 truncate">
            <span className="text-muted">{here ? here.group.title : tab.label}</span>
            {here && (
              <>
                <span className="px-1.5 text-muted">›</span>
                <span className="font-semibold">{here.page.title}</span>
              </>
            )}
          </span>
        </button>
      </header>

      <div className="mx-auto grid max-w-[90rem] grid-cols-[minmax(0,1fr)] lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        <aside
          aria-label="Docs pages"
          className="sticky top-[6.25rem] hidden h-[calc(100dvh-6.25rem)] overflow-y-auto border-r border-line py-8 pr-4 pl-6 lg:block"
        >
          <SideNav tab={tab} path={path} />
        </aside>

        <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_15rem]">
          <main className="min-w-0 px-4 pt-8 pb-16 sm:px-8 lg:px-12 lg:pt-10">
            <div className="mx-auto max-w-3xl">
              <Toc path={path} variant="inline" />
              {here && <p className="mb-2 font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{here.group.title}</p>}
              <div id="docs-content">{children}</div>
              <Pager path={path} />
            </div>
          </main>
          <aside aria-label="On this page" className="sticky top-[6.25rem] hidden h-[calc(100dvh-6.25rem)] overflow-y-auto py-10 pr-6 xl:block">
            <Toc path={path} variant="side" />
          </aside>
        </div>
      </div>

      {menuOpen && <Drawer tab={tab} path={path} onClose={() => setMenuOpen(false)} />}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────────────────

function SideNav({ tab, path, onNavigate }: { tab: DocTab; path: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-7">
      {tab.groups.map((g) => (
        <div key={g.title}>
          <p className="mb-2 font-mono text-[11px] font-semibold tracking-wider uppercase">{g.title}</p>
          <ul className="border-l border-line">
            {g.pages.map((p) => (
              <li key={p.href}>
                <NavItem page={p} on={path === p.href} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function NavItem({ page, on, onNavigate }: { page: DocPage; on: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={page.href}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      className={cx(
        "-ml-px flex items-center gap-2 border-l py-1.5 pr-2 pl-3 text-sm transition-colors",
        on ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:border-edge hover:text-ink",
      )}
    >
      {page.method && <MethodBadge method={page.method} small />}
      <span className="min-w-0 flex-1">{page.title}</span>
      {page.soon && (
        <span className="shrink-0 border border-line px-1 font-mono text-[9px] font-semibold tracking-wider text-muted uppercase">
          Coming soon
        </span>
      )}
    </Link>
  );
}

/** The menu on phones: the three areas, then this area's pages. */
function Drawer({ tab, path, onClose }: { tab: DocTab; path: string; onClose: () => void }) {
  const [shown, setShown] = useState(tab.key);
  const shownTab = DOC_TABS.find((t) => t.key === shown) ?? tab;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Docs menu">
      <button type="button" aria-label="Close the menu" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div
        ref={panel}
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col border-r border-ink bg-paper outline-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink px-4">
          <Logo />
          <button type="button" onClick={onClose} aria-label="Close the menu" className="flex h-10 w-10 items-center justify-center border border-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
        <div role="tablist" aria-label="Docs areas" className="grid shrink-0 grid-cols-3 border-b border-ink">
          {DOC_TABS.map((t, i) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === shown}
              onClick={() => setShown(t.key)}
              className={cx(
                "h-11 px-1 text-xs font-semibold transition-colors",
                i > 0 && "border-l border-line",
                t.key === shown ? "bg-ink text-paper" : "text-ink hover:bg-subtle",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <SideNav tab={shownTab} path={path} onNavigate={onClose} />
          <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6 font-mono text-xs">
            {["/llms.txt", "/openapi.json", "/skill.md"].map((href) => (
              <a key={href} href={href} className="border border-line px-2 py-1 text-muted hover:border-ink hover:text-ink">
                {href.slice(1)}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── On this page ────────────────────────────────────────────────────────────────────────

type TocItem = { id: string; text: string; level: 2 | 3 };

/** The page's h2/h3 headings (those with an id), read from the page itself so they never go stale. */
function useHeadings(path: string): TocItem[] {
  const [items, setItems] = useState<TocItem[]>([]);
  useEffect(() => {
    const root = document.getElementById("docs-content");
    if (!root) return;
    let key = "";
    const read = () => {
      const found = [...root.querySelectorAll<HTMLElement>("h2[id], h3[id]")].map(
        (h): TocItem => ({ id: h.id, text: h.textContent?.trim() ?? "", level: h.tagName === "H3" ? 3 : 2 }),
      );
      const next = JSON.stringify(found);
      if (next !== key) {
        key = next;
        setItems(found);
      }
    };
    const frame = requestAnimationFrame(read);
    const watch = new MutationObserver(read);
    watch.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, [path]);
  return items;
}

/** The heading the reader is at: the last one above the top fifth of the screen. */
function useActiveHeading(items: TocItem[]): string | undefined {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.2 + 100;
      let current = items[0]?.id;
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= line) current = it.id;
      }
      // At the very bottom, the last heading may never reach the line: count it as read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = items[items.length - 1]?.id;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);
  return active;
}

function Toc({ path, variant }: { path: string; variant: "side" | "inline" }) {
  const items = useHeadings(path);
  const active = useActiveHeading(variant === "side" ? items : []);
  if (items.length === 0) return null;

  const list = (
    <ul className={cx(variant === "side" && "border-l border-line")}>
      {items.map((it) => (
        <li key={it.id}>
          <a
            href={`#${it.id}`}
            className={cx(
              "-ml-px block border-l py-1 text-sm transition-colors",
              it.level === 3 ? "pl-6" : "pl-3",
              variant === "inline" && "border-transparent",
              variant === "side" && (active === it.id ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink"),
              variant === "inline" && "text-muted hover:text-ink",
            )}
          >
            {it.text}
          </a>
        </li>
      ))}
    </ul>
  );

  if (variant === "side") {
    return (
      <nav aria-label="On this page">
        <p className="mb-3 font-mono text-[11px] font-semibold tracking-wider uppercase">On this page</p>
        {list}
      </nav>
    );
  }
  return (
    <details key={path} className="group mb-8 border border-line xl:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-mono text-[11px] font-semibold tracking-wider uppercase">
        On this page
        <span aria-hidden className="font-mono text-base transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <nav aria-label="On this page" className="border-t border-line px-2 py-2">
        {list}
      </nav>
    </details>
  );
}

// ── Previous / Next ─────────────────────────────────────────────────────────────────────

function Pager({ path }: { path: string }) {
  const { prev, next } = neighbours(path);
  if (!prev && !next) return null;
  return (
    <nav aria-label="Previous and next page" className="mt-16 grid gap-4 border-t border-line pt-8 sm:grid-cols-2">
      {prev ? <PagerLink page={prev} dir="prev" /> : <span className="hidden sm:block" />}
      {next && <PagerLink page={next} dir="next" />}
    </nav>
  );
}

function PagerLink({ page, dir }: { page: DocPage; dir: "prev" | "next" }) {
  return (
    <Link
      href={page.href}
      className={cx(
        "group block border border-ink p-4 transition-colors hover:bg-ink hover:text-paper",
        dir === "next" && "sm:col-start-2 sm:text-right",
      )}
    >
      <span className="block font-mono text-[11px] tracking-wider text-muted uppercase group-hover:text-paper/70">
        {dir === "prev" ? "← Previous" : "Next →"}
      </span>
      <span className="mt-1 block font-semibold">{page.title}</span>
    </Link>
  );
}

// ── Search ──────────────────────────────────────────────────────────────────────────────

function SearchButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("h-9 items-center gap-2 border border-edge px-3 text-sm text-muted transition-colors hover:border-ink hover:text-ink", className)}
    >
      <SearchIcon />
      <span className="flex-1 text-left">Search the docs…</span>
      <kbd className="border border-line px-1 font-mono text-[10px]">Ctrl K</kbd>
    </button>
  );
}

/** Page titles first, then headings; every word has to match somewhere. */
function search(query: string): SearchEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return SEARCH_INDEX.filter((e) => !e.href.includes("#")).slice(0, 12);
  const scored = SEARCH_INDEX.map((e) => {
    const title = e.title.toLowerCase();
    const hay = `${title} ${e.context} ${e.keywords ?? ""}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return null;
    let score = words.reduce((s, w) => s + (title.startsWith(w) ? 4 : title.includes(w) ? 2 : 0), 0);
    if (!e.href.includes("#")) score += 1;
    return { e, score };
  }).filter((x): x is { e: SearchEntry; score: number } => x !== null);
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((x) => x.e);
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const results = useMemo(() => search(query), [query]);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const at = Math.min(cursor, Math.max(0, results.length - 1));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search the docs">
      <button type="button" aria-label="Close search" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div className="relative mx-auto mt-[10vh] flex max-h-[75vh] w-[calc(100%-2rem)] max-w-xl flex-col border border-ink bg-paper">
        <div className="flex items-center gap-3 border-b border-ink px-4">
          <SearchIcon />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor(Math.min(at + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor(Math.max(at - 1, 0));
              } else if (e.key === "Enter" && results[at]) {
                e.preventDefault();
                go(results[at].href);
              }
            }}
            placeholder="Search pages, endpoints, tools…"
            aria-label="Search the docs"
            aria-controls={listId}
            aria-activedescendant={results[at] ? `${listId}-${at}` : undefined}
            role="combobox"
            aria-expanded
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          <kbd className="hidden border border-line px-1 font-mono text-[10px] text-muted sm:block">Esc</kbd>
        </div>
        <ul ref={list} id={listId} role="listbox" className="overflow-y-auto py-2">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nothing matches “{query}”.</li>}
          {results.map((r, i) => (
            <li key={r.href} id={`${listId}-${i}`} role="option" aria-selected={i === at} data-i={i}>
              <button
                type="button"
                onClick={() => go(r.href)}
                onMouseMove={() => i !== at && setCursor(i)}
                className={cx("flex w-full flex-col items-start px-4 py-2 text-left", i === at && "bg-ink text-paper")}
              >
                <span className="text-sm font-semibold">
                  {r.href.includes("#") && <span className="mr-1.5 font-mono opacity-60">#</span>}
                  {r.title}
                </span>
                <span className={cx("text-xs", i === at ? "text-paper/70" : "text-muted")}>{r.context}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 font-mono text-[10px] tracking-wider text-muted uppercase">
          ↑ ↓ to move · Enter to open · Esc to close
        </p>
      </div>
    </div>
  );
}

// ── Old links ───────────────────────────────────────────────────────────────────────────

/** Sends /docs#setup and the like (from when these were single pages) to where that section lives now. */
function useLegacyHashes(path: string) {
  const router = useRouter();
  useEffect(() => {
    const map = LEGACY_HASHES[path];
    if (!map) return;
    const check = () => {
      const target = map[decodeURIComponent(window.location.hash.slice(1))];
      if (target) router.replace(target);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [path, router]);
}

// ── Icons ───────────────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
