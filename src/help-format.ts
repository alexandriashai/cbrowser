/**
 * help-format.ts — turn a help answer into text a terminal can show.
 *
 * The help service (help-client.ts) answers in markdown with site-relative
 * links, because question_answer hands the same answer to MCP clients that
 * render markdown. `cbrowser ask` printed it verbatim, so a terminal showed
 * `**bold**`, backticks and paths like /docs/tool-screenshot that nobody can
 * open from a shell. This strips the markup, keeps the words, and makes every
 * site path a full https://cbrowser.ai link.
 *
 * A path is treated as a site page only when it is a link target, appears in
 * the answer's own sources, or sits under /docs/ or /blog/. Anything else that
 * starts with a slash (a file path such as /tmp/shot.png) is left alone.
 */

export const DOCS_ORIGIN = "https://cbrowser.ai";

/** Site sections a bare path may name without appearing in the sources. */
const SITE_SECTIONS = /^\/(docs|blog)(\/|$)/;

/** A token that looks like a site path: letters, digits, dashes, slashes, an anchor. */
const PATH_TOKEN = /^\/[A-Za-z0-9][\w\-/]*(#[\w-]*)?$/;

/**
 * A full link for a site path. Absolute URLs and other schemes pass through.
 * cbrowser.ai serves its pages with a trailing slash and 301s without one, so
 * a path whose last segment has no extension gets one.
 */
export function absoluteSiteUrl(url: string, origin = DOCS_ORIGIN): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (!url.startsWith("/")) return url;
  const m = /^([^?#]*)([?#].*)?$/.exec(url);
  let path = m?.[1] ?? url;
  const rest = m?.[2] ?? "";
  const last = path.split("/").pop() ?? "";
  if (path !== "/" && !path.endsWith("/") && !/\.[A-Za-z0-9]+$/.test(last)) path += "/";
  return origin + path + rest;
}

/** The page path a source names, or null: "[/docs/x — full]: snippet" gives "/docs/x". */
export function sourcePath(source: string): string | null {
  const labelled = /^\[\s*(\S+)\s+[—-][^\]]*\]/.exec(source.trim());
  // The home page's label is a bare "/". Only a label can name it: a lone
  // slash in prose ("gif / webp") is never read as a page.
  if (labelled?.[1] === "/") return "/";
  const first = labelled?.[1] ?? source.trim().split(/\s/)[0] ?? "";
  if (/^https?:\/\//i.test(first)) return first;
  return PATH_TOKEN.test(first) ? first : null;
}

/** One full link per distinct source page, in order; a source with no page keeps its first line. */
export function sourceLines(sources: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    const p = sourcePath(s);
    const line = p ? absoluteSiteUrl(p) : s.split("\n")[0].slice(0, 120);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** The full links of the sources that name a page (for --json). */
export function sourceUrls(sources: readonly string[]): string[] {
  return [...new Set(sources.map(sourcePath).filter((p): p is string => p !== null).map((p) => absoluteSiteUrl(p)))];
}

function isSitePath(token: string, known: ReadonlySet<string>): boolean {
  if (!PATH_TOKEN.test(token)) return false;
  const bare = token.replace(/#.*$/, "").replace(/\/$/, "");
  return SITE_SECTIONS.test(token) || known.has(bare);
}

/** Inline markup: code spans, links, emphasis, bare site paths. */
function inline(text: string, known: ReadonlySet<string>): string {
  // Code spans first, so nothing inside them is read as emphasis or a link.
  // They wait behind private-use placeholders (U+E000), which no answer contains.
  const codes: string[] = [];
  let s = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    codes.push(code);
    return `\uE000${codes.length - 1}\uE000`;
  });
  // [text](url) and ![alt](url): the words, then the full link.
  s = s.replace(/!?\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (_, label: string, url: string) => {
    const full = absoluteSiteUrl(url);
    const words = label.trim();
    return !words || words === url || absoluteSiteUrl(words) === full ? full : `${words} (${full})`;
  });
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, "$1");
  // Emphasis. Underscores are only stripped in pairs of two, so an identifier
  // such as _browserToken keeps its leading underscore.
  s = s.replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "$1").replace(/__(\S(?:.*?\S)?)__/g, "$1");
  s = s.replace(/(^|[^\w*])\*(\S(?:[^*\n]*?\S)?)\*(?![\w*])/g, "$1$2");
  s = s.replace(/~~(\S(?:.*?\S)?)~~/g, "$1");
  // Bare site paths, where a word starts (never inside a URL).
  s = s.replace(/(^|[\s(["'])(\/[A-Za-z0-9][\w\-/]*(?:#[\w-]*)?)/g, (m, before: string, path: string) =>
    isSitePath(path, known) ? before + absoluteSiteUrl(path) : m,
  );
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, "$1");
  return s.replace(/\uE000(\d+)\uE000/g, (_, i: string) => {
    const code = codes[Number(i)];
    return isSitePath(code, known) ? absoluteSiteUrl(code) : code;
  });
}

/**
 * Markdown to plain terminal text. Headings, bold and code markers go; list
 * items keep a dash; code blocks are indented; links become "words (url)";
 * site paths become full links. `knownPaths` are the pages the answer's
 * sources name, so a bare mention of one of them is linked too.
 */
export function formatAnswerForTerminal(markdown: string, knownPaths: readonly string[] = []): string {
  const known = new Set(knownPaths.map((p) => p.replace(/#.*$/, "").replace(/\/$/, "")));
  const out: string[] = [];
  let inFence = false;
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) { out.push(`    ${raw}`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) { out.push(""); continue; }
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(raw)) continue;
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
    if (heading) { out.push(inline(heading[1], known)); continue; }
    const line = raw
      .replace(/^(\s*)>\s?/, "$1  ")
      .replace(/^(\s*)[-*+]\s+/, "$1  - ")
      .replace(/^(\s*)(\d+)[.)]\s+/, "$1  $2. ");
    out.push(inline(line, known));
  }
  // Blank lines go from the ends; a first line's indent (a list item) stays.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "");
}
