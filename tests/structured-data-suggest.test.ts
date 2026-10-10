/**
 * structured_data_suggest must not claim a type it barely detected, must read
 * the schema the page already has, and must not offer what is already there
 * or what contradicts it.
 *
 * Measured 2026-10-10 on cbrowser.ai/pricing (report item B34): the tool
 * answered `pageType: "article"`, `confidence: "20%"`, reasoning "Has author
 * attribution" -- the site-wide <meta name="author"> -- with
 * `existingSchema: "None detected"` although the page declares Organization,
 * SoftwareApplication, WebPage and WebSite in one JSON-LD @graph. It then
 * offered a full Article with headline "CBrowser | Pricing | CBrowser" and
 * publisher.name "".
 *
 * Everything here is pure (no browser): the extraction's browser half is
 * covered by tests/structured-data-suggest-browser.test.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect } from "bun:test";
// Namespace import: on the base commit several of these exports do not exist,
// and a named import of a missing export fails the whole file at link time
// instead of failing the tests that use it.
import * as sd from "../src/remediation/structured-data.js";
import type { PageSignals } from "../src/remediation/structured-data.js";

const signals = (over: Partial<PageSignals> = {}): PageSignals => ({
  url: "https://cbrowser.ai/pricing/",
  title: "CBrowser | Pricing | CBrowser",
  hasArticleTag: false,
  hasProductSchema: false,
  hasPrice: false,
  hasAddToCart: false,
  hasPublishDate: false,
  hasAuthor: false,
  hasFaqSection: false,
  hasStepsList: false,
  hasEventDate: false,
  hasAddress: false,
  hasPhone: false,
  isHomepage: false,
  existingSchema: [],
  ...over,
});

/** The @graph cbrowser.ai ships on every page, trimmed to what matters. */
const CBROWSER_GRAPH = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://cbrowser.ai/#organization",
      name: "CBrowser",
      url: "https://cbrowser.ai",
      founder: { "@type": "Person", name: "Alexandria Eden" },
    },
    { "@type": "SoftwareApplication", name: "CBrowser" },
    { "@type": "WebPage", name: "Pricing" },
    { "@type": "WebSite", name: "CBrowser" },
  ],
});
const CBROWSER_TYPES = ["Organization", "SoftwareApplication", "WebPage", "WebSite"];

describe("one weak signal is not a page type", () => {
  test("a page whose only signal is an author is unknown, with article as the candidate", () => {
    // Base: article at 0.2, because any score above the 0.1 unknown floor won.
    const r = sd.detectPageType(signals({ hasAuthor: true }));
    expect(r.type).toBe("unknown");
    expect(r.candidates?.[0]).toEqual({ type: "article", confidence: 0.2 });
  });

  test("a price alone, or a date alone, is not enough either", () => {
    expect(sd.detectPageType(signals({ hasPrice: true })).type).toBe("unknown");
    expect(sd.detectPageType(signals({ hasPublishDate: true })).type).toBe("unknown");
  });

  test("one strong signal still claims a type", () => {
    expect(sd.detectPageType(signals({ hasArticleTag: true })).type).toBe("article");
    expect(sd.detectPageType(signals({ isHomepage: true })).type).toBe("homepage");
    expect(sd.detectPageType(signals({ hasPublishDate: true, hasAuthor: true })).type).toBe("article");
  });
});

describe("the schema the page already declares is read", () => {
  test("@graph members are existing types, and the Organization's name is kept", () => {
    const r = sd.parseExistingSchema([CBROWSER_GRAPH]);
    expect(r.types).toEqual(CBROWSER_TYPES);
    expect(r.organizationName).toBe("CBrowser");
    // A nested value is not the page's own type.
    expect(r.types).not.toContain("Person");
  });

  test("top-level objects, arrays and array @types are all read; invalid JSON is skipped", () => {
    const r = sd.parseExistingSchema([
      JSON.stringify({ "@type": "BreadcrumbList" }),
      JSON.stringify([{ "@type": "FAQPage" }, { "@type": ["Organization", "LocalBusiness"], name: "Shop" }]),
      "{ not json",
    ]);
    expect(r.types).toEqual(["BreadcrumbList", "FAQPage", "Organization", "LocalBusiness"]);
    expect(r.organizationName).toBe("Shop");
  });
});

describe("nothing is suggested that clashes with existing schema", () => {
  test("cbrowser.ai/pricing: unknown, and no schema, because it already declares WebPage", () => {
    const r = sd.buildSuggestion(signals({ existingSchema: CBROWSER_TYPES }));
    expect(r.pageType).toBe("unknown");
    expect(r.existingSchema).toEqual(CBROWSER_TYPES);
    expect(r.suggestedSchema).toBeNull();
    expect(r.suggestedSchemaString).toBe("");
    expect(r.reasoning).toContain("already declares WebPage");
  });

  test("an unknown page with no schema gets only a generic WebPage, never a typed one", () => {
    const r = sd.buildSuggestion(signals({ hasAuthor: true, ogTitle: "CBrowser Pricing | Free vs Pro" }));
    expect(r.pageType).toBe("unknown");
    expect((r.suggestedSchema as Record<string, unknown>)["@type"]).toBe("WebPage");
    expect((r.suggestedSchema as Record<string, unknown>).name).toBe("CBrowser Pricing | Free vs Pro");
    expect(r.reasoning).toContain("article at 20%");
  });

  test("an Article is not suggested over an existing BlogPosting, nor over a Product", () => {
    const article = { hasArticleTag: true, hasPublishDate: true };
    const dup = sd.buildSuggestion(signals({ ...article, existingSchema: ["BlogPosting"] }));
    expect(dup.pageType).toBe("article");
    expect(dup.suggestedSchema).toBeNull();
    expect(dup.reasoning).toContain("already declares BlogPosting");

    const conflict = sd.buildSuggestion(signals({ ...article, existingSchema: ["Product"] }));
    expect(conflict.suggestedSchema).toBeNull();
    expect(conflict.reasoning).toContain("contradict");
  });

  test("a Product is not suggested beside a SoftwareApplication", () => {
    const r = sd.buildSuggestion(signals({ hasPrice: true, hasAddToCart: true, existingSchema: ["SoftwareApplication"] }));
    expect(r.pageType).toBe("product");
    expect(r.suggestedSchema).toBeNull();
  });

  test("a site-wide SoftwareApplication does not block an Article on a blog post", () => {
    // cbrowser.ai declares SoftwareApplication on its blog posts too.
    const r = sd.buildSuggestion(signals({
      url: "https://cbrowser.ai/blog/a-post/",
      hasArticleTag: true, hasPublishDate: true, ogType: "article",
      existingSchema: CBROWSER_TYPES, existingOrganizationName: "CBrowser",
    }));
    expect(r.pageType).toBe("article");
    expect((r.suggestedSchema as Record<string, unknown>)["@type"]).toBe("Article");
  });
});

describe("Article fields come from the page, not the raw <title>", () => {
  const article = (over: Partial<PageSignals>) =>
    sd.generateStructuredData(signals({ url: "https://cbrowser.ai/blog/a-post/", ...over }), "article") as {
      headline: string; publisher: { name: string }; datePublished: string; dateModified: string;
    };

  test("headline is og:title, else the h1", () => {
    expect(article({ title: "Post | CBrowser Blog", ogTitle: "We Beat Two Models" }).headline).toBe("We Beat Two Models");
    expect(article({ title: "Post | CBrowser Blog", h1: "We Beat Two Models With Arithmetic" }).headline)
      .toBe("We Beat Two Models With Arithmetic");
  });

  test("publisher is the page's own Organization, else og:site_name", () => {
    expect(article({ existingOrganizationName: "CBrowser", ogSiteName: "Other" }).publisher.name).toBe("CBrowser");
    expect(article({ ogSiteName: "CBrowser" }).publisher.name).toBe("CBrowser");
  });

  test("dates are ISO 8601, and a date with no time stays a date", () => {
    const a = article({ publishDate: "Aug 4, 2026" });
    expect(a.datePublished).toBe("2026-08-04");
    expect(a.dateModified).toBe("2026-08-04");
    expect(article({ publishDate: "2026-08-04T10:00:00Z" }).datePublished).toBe("2026-08-04T10:00:00Z");
    expect(article({ publishDate: "Tue, 04 Aug 2026 16:00:00 GMT" }).datePublished).toBe("2026-08-04T16:00:00.000Z");
    // cbrowser.ai's own article:published_time. No zone, so none is invented:
    // the result must not depend on the machine running the audit.
    expect(article({ publishDate: "2026-08-04 17:47:17" }).datePublished).toBe("2026-08-04T17:47:17");
    expect(article({ publishDate: "last Tuesday" }).datePublished).toBe("");
  });
});
