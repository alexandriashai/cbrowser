/**
 * structured_data_suggest, end to end through a real browser: the page-side
 * half of report item B34 (2026-10-10).
 *
 * The fixtures are served from 127.0.0.1 and shaped like cbrowser.ai: a
 * site-wide <meta name="author"> and one JSON-LD @graph declaring
 * Organization, SoftwareApplication, WebPage and WebSite. Measured that day on
 * cbrowser.ai/pricing, the tool answered "article" at 20% from the meta author
 * alone, reported the @graph as "None detected", and offered an Article.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { suggestStructuredData } from "../src/remediation/structured-data.js";

const GRAPH = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "/#organization", name: "CBrowser", founder: { "@type": "Person", name: "Alexandria Eden" } },
    { "@type": "SoftwareApplication", name: "CBrowser" },
    { "@type": "WebPage", name: "Page" },
    { "@type": "WebSite", name: "CBrowser" },
  ],
});

const head = (title: string, extra = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<meta name="author" content="Alexandria Eden">
<meta property="og:site_name" content="CBrowser">
${extra}
<script type="application/ld+json">${GRAPH}</script></head>`;

const PRICING = `${head("CBrowser | Pricing | CBrowser", `<meta property="og:title" content="CBrowser Pricing | Free vs Pro">`)}
<body><header><nav><a href="/">Home</a> <a href="/blog/">Blog</a></nav></header>
<main><h1>Simple, transparent pricing</h1><p>Start free. Upgrade when you need more.</p></main></body></html>`;

// A related-posts card with its own <time> comes BEFORE the article in the
// document, as sidebars often do.
const POST = `${head("We Beat Two Models | CBrowser Blog", `<meta property="og:type" content="article">
<meta property="og:title" content="We Beat Two Frontier Vision Models With Arithmetic">
<meta property="article:published_time" content="2026-08-04T15:00:00Z">`)}
<body><aside><a href="/blog/older/">An older post</a> <time datetime="2025-01-01">Jan 1, 2025</time></aside>
<main><article><h1>We Beat Two Frontier Vision Models With Arithmetic</h1>
<p class="byline">By Alexandria Eden</p><p>Three unglamorous fixes did it.</p></article></main></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let base = "";

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      const html = path === "/pricing/" ? PRICING : path === "/blog/a-post/" ? POST : null;
      return html
        ? new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
        : new Response("not found", { status: 404 });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => { server?.stop(true); });

describe("structured_data_suggest on a cbrowser.ai-shaped site", () => {
  test("the pricing page: @graph read, no type claimed, nothing offered over its WebPage", async () => {
    const r = await suggestStructuredData({ url: `${base}/pricing/`, headless: true });
    expect(r.existingSchema).toEqual(["Organization", "SoftwareApplication", "WebPage", "WebSite"]);
    // The meta author is not an author attribution on this page.
    expect(r.pageType).toBe("unknown");
    expect(r.suggestedSchema).toBeNull();
    expect(r.reasoning).toContain("already declares WebPage");
  }, 90_000);

  test("a blog post: Article, headline from og:title, publisher from the @graph, date from the page's meta", async () => {
    const r = await suggestStructuredData({ url: `${base}/blog/a-post/`, headless: true });
    expect(r.pageType).toBe("article");
    const a = r.suggestedSchema as {
      "@type": string; headline: string; publisher: { name: string }; datePublished: string;
    };
    expect(a["@type"]).toBe("Article");
    expect(a.headline).toBe("We Beat Two Frontier Vision Models With Arithmetic");
    expect(a.publisher.name).toBe("CBrowser");
    // Not the sidebar's <time datetime="2025-01-01">.
    expect(a.datePublished).toBe("2026-08-04T15:00:00Z");
  }, 90_000);
});
