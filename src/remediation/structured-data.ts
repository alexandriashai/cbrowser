/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Structured Data Suggester
 *
 * Recommends Schema.org JSON-LD structured data based on detected page content.
 * Helps sites become more machine-readable for AI agents.
 *
 * @since 17.0.0
 */

import { type Page } from "playwright";
import { CBrowser } from "../browser.js";
import { navigationError } from "../navigation-errors.js";

/**
 * Detected page type
 */
export type PageType =
  | "homepage"
  | "article"
  | "product"
  | "organization"
  | "person"
  | "event"
  | "faq"
  | "howto"
  | "recipe"
  | "local-business"
  | "unknown";

/**
 * Page signals used for type detection
 */
export interface PageSignals {
  url: string;
  title: string;
  hasArticleTag: boolean;
  hasProductSchema: boolean;
  hasPrice: boolean;
  hasAddToCart: boolean;
  hasPublishDate: boolean;
  hasAuthor: boolean;
  hasFaqSection: boolean;
  hasStepsList: boolean;
  hasEventDate: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  isHomepage: boolean;
  ogType?: string;
  existingSchema: string[];
  // Extracted values (v18.22.0)
  description?: string;
  authorName?: string;
  publishDate?: string;
  modifiedDate?: string;
  price?: string;
  priceCurrency?: string;
  imageUrl?: string;
  logoUrl?: string;
  phone?: string;
  faqItems?: Array<{ question: string; answer: string }>;
  // Better names than the raw <title> (2026-10-10, B34)
  ogTitle?: string;
  ogSiteName?: string;
  h1?: string;
  /** `name` of an Organization the page's own JSON-LD already declares. */
  existingOrganizationName?: string;
}

/**
 * Structured data suggestion
 */
export interface StructuredDataSuggestion {
  pageType: PageType;
  confidence: number; // 0-1
  existingSchema: string[];
  /**
   * null when there is nothing safe to add: the page already declares this
   * type, or declares one it conflicts with. (2026-10-10, B34)
   */
  suggestedSchema: object | null;
  suggestedSchemaString: string;
  reasoning: string;
  /** Every type that scored, best first. Shown so a low-confidence "unknown" says what it nearly was. */
  candidates: Array<{ type: PageType; confidence: number }>;
}

/**
 * Options for structured data suggestion
 */
export interface StructuredDataOptions {
  url: string;
  headless?: boolean;
}

/**
 * Below this, no type is claimed. Any score above the 0.1 floor used to win,
 * so one weak signal produced a full schema: cbrowser.ai/pricing became an
 * Article at 20% (meta author alone). One strong signal (<article>, the site
 * root) still reaches it; one weak one (a date, a price, an address) does not.
 * (2026-10-10, B34)
 */
export const MIN_TYPE_CONFIDENCE = 0.4;

const ORGANIZATION_TYPES = ["Organization", "Corporation", "NGO", "EducationalOrganization", "GovernmentOrganization", "OnlineBusiness"];
const ARTICLE_TYPES = ["Article", "BlogPosting", "NewsArticle", "TechArticle", "ScholarlyArticle", "Report", "LiveBlogPosting", "SocialMediaPosting"];
const PRODUCT_TYPES = ["Product", "ProductGroup", "ProductModel", "IndividualProduct"];
const SOFTWARE_TYPES = ["SoftwareApplication", "WebApplication", "MobileApplication"];
const LOCAL_BUSINESS_TYPES = ["LocalBusiness", "Store", "Restaurant", "FoodEstablishment", "ProfessionalService", "MedicalBusiness"];
const EVENT_TYPES = ["Event", "BusinessEvent", "EducationEvent", "Festival", "MusicEvent", "SocialEvent", "SportsEvent", "TheaterEvent"];
const WEBPAGE_TYPES = ["WebPage", "AboutPage", "CollectionPage", "ContactPage", "FAQPage", "ItemPage", "ProfilePage", "QAPage", "SearchResultsPage", "CheckoutPage"];

/** Existing types that already describe what a suggested @type would add. */
const ALREADY_DESCRIBED: Record<string, string[]> = {
  Organization: [...ORGANIZATION_TYPES, ...LOCAL_BUSINESS_TYPES],
  Article: ARTICLE_TYPES,
  // A SaaS page's offering is a SoftwareApplication; a Product beside it
  // describes the same thing twice.
  Product: [...PRODUCT_TYPES, ...SOFTWARE_TYPES],
  FAQPage: ["FAQPage"],
  LocalBusiness: LOCAL_BUSINESS_TYPES,
  WebPage: WEBPAGE_TYPES,
};

/**
 * A page has one main subject, so these exclude each other. SoftwareApplication
 * is deliberately absent: cbrowser.ai declares it site-wide, on its blog posts
 * too, where an Article is right. (Measured 2026-10-10.)
 */
const MAIN_SUBJECT: Record<string, string[]> = {
  Article: ARTICLE_TYPES,
  Product: PRODUCT_TYPES,
  Event: EVENT_TYPES,
  Recipe: ["Recipe"],
};

/**
 * Does suggesting `suggestedType` clash with what the page already declares?
 * A duplicate (the page has it) or a conflict (the page declares a different
 * main subject). Never suggest either. (2026-10-10, B34)
 */
export function schemaClash(
  suggestedType: string,
  existing: string[],
): { kind: "duplicate" | "conflict"; existingType: string } | null {
  const dup = existing.find((t) => (ALREADY_DESCRIBED[suggestedType] ?? [suggestedType]).includes(t));
  if (dup) return { kind: "duplicate", existingType: dup };
  if (MAIN_SUBJECT[suggestedType]) {
    for (const [subject, types] of Object.entries(MAIN_SUBJECT)) {
      if (subject === suggestedType) continue;
      const other = existing.find((t) => types.includes(t));
      if (other) return { kind: "conflict", existingType: other };
    }
  }
  return null;
}

/** og:title, else the page's h1, else <title>. (2026-10-10, B34) */
function pageHeadline(signals: PageSignals): string {
  return signals.ogTitle || signals.h1 || signals.title;
}

/**
 * Extract signals from a page for type detection
 */
async function extractPageSignals(page: Page, url: string): Promise<PageSignals> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    .catch((e: unknown) => { throw navigationError(e, url); });

  const signals = await page.evaluate(() => {
    const title =
      document.querySelector("title")?.textContent?.trim() || "";

    // Check for article indicators
    const hasArticleTag = !!document.querySelector("article");
    const hasPublishDate = !!(
      document.querySelector('time[datetime], [class*="publish"], [class*="date"], meta[property="article:published_time"]')
    );
    // Not meta[name="author"]: sites set it once in the layout, so it is on
    // every page. It made cbrowser.ai/pricing an Article at 20% on the
    // strength of "Has author attribution" alone. A byline is on the page.
    // (2026-10-10, B34)
    const hasAuthor = !!(
      document.querySelector('[rel="author"], [class*="author"], [class*="byline"]')
    );

    // Check for product indicators
    const hasPrice = !!(
      document.querySelector('[class*="price"], [itemprop="price"], .price')
    );
    // Check for add-to-cart buttons using class selectors and text content matching
    const hasAddToCart = !!(
      document.querySelector('[class*="add-to-cart"], [class*="addtocart"], [class*="add_to_cart"], [data-action="add-to-cart"]') ||
      Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).some(
        el => /add to cart|buy now|purchase|add to bag/i.test(el.textContent || '')
      )
    );
    // JSON-LD Product is decided from the parsed types (parseExistingSchema):
    // this read only the FIRST script, as a raw substring. (2026-10-10, B34)
    const hasProductMicrodata = !!document.querySelector('[itemtype*="Product"]');

    // Check for FAQ indicators
    const hasFaqSection = !!(
      document.querySelector('[class*="faq"], details, [itemtype*="FAQPage"]') ||
      document.querySelector("h2, h3")?.textContent?.toLowerCase().includes("faq")
    );

    // Check for how-to/steps
    const hasStepsList = !!(
      document.querySelector('[class*="step"], ol li, [itemtype*="HowTo"]')
    );

    // Check for event indicators
    const hasEventDate = !!(
      document.querySelector('[class*="event-date"], [itemtype*="Event"], time[datetime]')?.closest('[class*="event"]')
    );

    // Check for local business indicators
    const hasAddress = !!(
      document.querySelector('[class*="address"], address, [itemprop="address"]')
    );
    const hasPhone = !!(
      document.querySelector('a[href^="tel:"], [itemprop="telephone"]')
    );

    // Get og:type
    const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute("content") || undefined;

    // Existing schema: the raw JSON-LD blocks, parsed in Node by
    // parseExistingSchema so the parser is testable. (2026-10-10, B34)
    const ldTexts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => script.textContent || "");

    // Check if homepage
    const isHomepage = window.location.pathname === "/" || window.location.pathname === "";

    // ========== EXTRACT VALUES (v18.22.0) ==========

    // Description: meta description or og:description
    const description = (
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      ""
    ).trim();

    // Author name
    const authorName = (
      document.querySelector('meta[name="author"]')?.getAttribute("content") ||
      document.querySelector('[rel="author"]')?.textContent ||
      document.querySelector('[class*="author"] a, [class*="byline"] a, .author, .byline')?.textContent ||
      ""
    ).trim();

    // Publish date. The page-level meta first: the first <time datetime> in
    // the document can belong to a sidebar or a related-posts card.
    // Normalised to ISO 8601 by the generator (toIsoDate). (2026-10-10, B34)
    const publishDate = (
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ||
      document.querySelector('time[datetime]')?.getAttribute("datetime") ||
      ""
    ).trim();

    // Modified date
    const modifiedDate = (
      document.querySelector('meta[property="article:modified_time"]')?.getAttribute("content") ||
      ""
    );

    // Price extraction
    const priceEl = document.querySelector('[itemprop="price"], [class*="price"]:not([class*="original"]):not([class*="old"])');
    const priceText = priceEl?.textContent?.trim() || "";
    const priceMatch = priceText.match(/[\d,.]+/);
    const price = priceMatch ? priceMatch[0].replace(/,/g, "") : "";

    // Currency detection
    const currencyEl = document.querySelector('[itemprop="priceCurrency"]');
    let priceCurrency = currencyEl?.getAttribute("content") || "";
    if (!priceCurrency && priceText) {
      if (priceText.includes("$")) priceCurrency = "USD";
      else if (priceText.includes("€")) priceCurrency = "EUR";
      else if (priceText.includes("£")) priceCurrency = "GBP";
      else if (priceText.includes("¥")) priceCurrency = "JPY";
    }

    // Image URL
    const imageUrl = (
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
      document.querySelector('[itemprop="image"]')?.getAttribute("src") ||
      document.querySelector('article img')?.getAttribute("src") ||
      ""
    );

    // Logo URL
    const logoUrl = (
      document.querySelector('[itemprop="logo"]')?.getAttribute("src") ||
      document.querySelector('a[href="/"] img, header img, .logo img')?.getAttribute("src") ||
      ""
    );

    // Phone number
    const phoneEl = document.querySelector('a[href^="tel:"]');
    const phone = phoneEl ? phoneEl.getAttribute("href")?.replace("tel:", "") || "" : (
      document.querySelector('[itemprop="telephone"]')?.textContent?.trim() || ""
    );

    // Names better than the raw <title>, which carries the site suffix
    // ("CBrowser | Pricing | CBrowser"). (2026-10-10, B34)
    const ogTitle = (document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "").trim();
    const ogSiteName = (document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || "").trim();
    const h1 = (document.querySelector("h1")?.textContent || "").replace(/\s+/g, " ").trim();

    // FAQ items extraction
    const faqItems: Array<{ question: string; answer: string }> = [];

    // Try <details> elements
    document.querySelectorAll("details").forEach((detail) => {
      const summary = detail.querySelector("summary");
      if (summary) {
        const question = summary.textContent?.trim() || "";
        const answerParts: string[] = [];
        detail.childNodes.forEach((node) => {
          if (node !== summary && node.textContent?.trim()) {
            answerParts.push(node.textContent.trim());
          }
        });
        const answer = answerParts.join(" ").trim();
        if (question && answer) {
          faqItems.push({ question, answer });
        }
      }
    });

    // Try FAQ class patterns if no details found
    if (faqItems.length === 0) {
      document.querySelectorAll('[class*="faq-item"], [class*="accordion-item"]').forEach((item) => {
        const questionEl = item.querySelector('[class*="question"], [class*="header"], h3, h4');
        const answerEl = item.querySelector('[class*="answer"], [class*="content"], [class*="body"], p');
        if (questionEl && answerEl) {
          const question = questionEl.textContent?.trim() || "";
          const answer = answerEl.textContent?.trim() || "";
          if (question && answer) {
            faqItems.push({ question, answer });
          }
        }
      });
    }

    return {
      title,
      hasArticleTag,
      hasProductMicrodata,
      hasPrice,
      hasAddToCart,
      hasPublishDate,
      hasAuthor,
      hasFaqSection,
      hasStepsList,
      hasEventDate,
      hasAddress,
      hasPhone,
      isHomepage,
      ogType,
      ldTexts,
      ogTitle,
      ogSiteName,
      h1,
      // Extracted values (v18.22.0)
      description,
      authorName,
      publishDate,
      modifiedDate,
      price,
      priceCurrency,
      imageUrl,
      logoUrl,
      phone,
      faqItems: faqItems.length > 0 ? faqItems : undefined,
    };
  });

  const { ldTexts, hasProductMicrodata, ...rest } = signals;
  const existing = parseExistingSchema(ldTexts);
  return {
    ...rest,
    url,
    hasProductSchema: hasProductMicrodata || existing.types.includes("Product"),
    existingSchema: existing.types,
    existingOrganizationName: existing.organizationName,
  };
}

/**
 * The @types a page's JSON-LD already declares, plus its Organization's name.
 *
 * Read top-level objects and arrays only, so cbrowser.ai, which declares
 * Organization, SoftwareApplication, WebPage and WebSite in one @graph,
 * reported "None detected" and was offered a fresh Article. Now @graph is
 * read, and an array @type (["Organization", "LocalBusiness"]) gives every
 * entry. Nested values (an Organization's founder Person) are not the page's
 * own types and are not read. (2026-10-10, B34)
 */
export function parseExistingSchema(ldTexts: string[]): { types: string[]; organizationName?: string } {
  const types: string[] = [];
  let organizationName: string | undefined;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const declared = ([] as unknown[]).concat(obj["@type"] ?? []).filter((t): t is string => typeof t === "string");
    for (const t of declared) if (!types.includes(t)) types.push(t);
    if (!organizationName && declared.some((t) => ORGANIZATION_TYPES.includes(t)) && typeof obj.name === "string" && obj.name.trim()) {
      organizationName = obj.name.trim();
    }
    if (obj["@graph"]) visit(obj["@graph"]);
  };
  for (const text of ldTexts) {
    try { visit(JSON.parse(text || "{}")); } catch { /* invalid JSON-LD is not schema */ }
  }
  return { types, organizationName };
}

/**
 * ISO 8601, or "" when the value is not a date. Schema.org's datePublished
 * and dateModified are ISO 8601; this passed the page's text through, so a
 * <time datetime="Aug 4, 2026"> shipped verbatim, and cbrowser.ai's
 * article:published_time "2026-08-04 17:47:17" would have too.
 *
 * Nothing is invented: a date with no time stays a date, and a time with no
 * zone stays a local time ("2026-08-04T17:47:17"). Converting either to UTC
 * would read it in THIS machine's zone, which says nothing about the page's.
 * Only a value that names its zone becomes an instant. (2026-10-10, B34)
 */
export function toIsoDate(raw: string | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return s;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  const ymd = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  if (!/\d{1,2}:\d{2}/.test(s)) return ymd;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(s) || /\b(?:GMT|UTC)\b/i.test(s)) return d.toISOString();
  return `${ymd}T${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/**
 * Detect page type from signals
 */
export function detectPageType(signals: PageSignals): {
  type: PageType;
  confidence: number;
  candidates: Array<{ type: PageType; confidence: number }>;
} {
  // Score each type based on signals
  const scores: Record<PageType, number> = {
    homepage: 0,
    article: 0,
    product: 0,
    organization: 0,
    person: 0,
    event: 0,
    faq: 0,
    howto: 0,
    recipe: 0,
    "local-business": 0,
    unknown: 0,
  };

  // Homepage detection
  if (signals.isHomepage) {
    scores.homepage += 0.6;
    scores.organization += 0.3;
  }

  // Article detection
  if (signals.hasArticleTag) scores.article += 0.4;
  if (signals.hasPublishDate) scores.article += 0.3;
  if (signals.hasAuthor) scores.article += 0.2;
  if (signals.ogType === "article") scores.article += 0.3;

  // Product detection
  if (signals.hasProductSchema) scores.product += 0.5;
  if (signals.hasPrice) scores.product += 0.3;
  if (signals.hasAddToCart) scores.product += 0.4;

  // FAQ detection
  if (signals.hasFaqSection) scores.faq += 0.7;

  // HowTo detection
  if (signals.hasStepsList && !signals.hasFaqSection) scores.howto += 0.5;

  // Event detection
  if (signals.hasEventDate) scores.event += 0.6;

  // Local business detection
  if (signals.hasAddress && signals.hasPhone) scores["local-business"] += 0.6;
  if (signals.hasAddress && !signals.hasPhone) scores["local-business"] += 0.3;

  const candidates = (Object.entries(scores) as [PageType, number][])
    .filter(([type, score]) => type !== "unknown" && score > 0)
    .map(([type, score]) => ({ type, confidence: Math.round(Math.min(1, score) * 100) / 100 }))
    .sort((a, b) => b.confidence - a.confidence);

  // The best candidate is a claim only at MIN_TYPE_CONFIDENCE. Below it the
  // answer is "unknown", with the candidates, and its confidence is the best
  // candidate's, so "unknown at 20%" reads as "nearly an article, at 20%".
  // (2026-10-10, B34)
  const best = candidates[0];
  if (!best || best.confidence < MIN_TYPE_CONFIDENCE) {
    return { type: "unknown", confidence: best?.confidence ?? 0, candidates };
  }
  return { type: best.type, confidence: best.confidence, candidates };
}

/**
 * Generate Organization schema
 */
function generateOrganizationSchema(signals: PageSignals): object {
  const url = new URL(signals.url);
  const baseUrl = `${url.protocol}//${url.hostname}`;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: signals.ogSiteName || signals.title.split("|")[0].split("-")[0].trim(),
    url: baseUrl,
    description: signals.description || "", // Extracted or to be filled
    logo: signals.logoUrl ? new URL(signals.logoUrl, baseUrl).href : "", // Extracted or to be filled
    sameAs: [], // Social links to be added
  };
}

/**
 * Generate Article schema
 */
function generateArticleSchema(signals: PageSignals): object {
  const url = new URL(signals.url);
  const baseUrl = `${url.protocol}//${url.hostname}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    // Was the raw <title>, site suffix and all. (2026-10-10, B34)
    headline: pageHeadline(signals),
    description: signals.description || "", // Extracted or to be filled
    author: {
      "@type": "Person",
      name: signals.authorName || "", // Extracted or to be filled
    },
    // ISO 8601 or "", never the page's own wording. (2026-10-10, B34)
    datePublished: toIsoDate(signals.publishDate), // Extracted or to be filled
    dateModified: toIsoDate(signals.modifiedDate || signals.publishDate), // Extracted or to be filled
    publisher: {
      "@type": "Organization",
      // Was always "". The page's own Organization, else og:site_name.
      // (2026-10-10, B34)
      name: signals.existingOrganizationName || signals.ogSiteName || "",
      logo: {
        "@type": "ImageObject",
        url: signals.logoUrl ? new URL(signals.logoUrl, baseUrl).href : "", // Extracted or to be filled
      },
    },
    image: signals.imageUrl ? new URL(signals.imageUrl, baseUrl).href : "", // Extracted or to be filled
  };
}

/**
 * Generate Product schema
 */
function generateProductSchema(signals: PageSignals): object {
  const url = new URL(signals.url);
  const baseUrl = `${url.protocol}//${url.hostname}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: pageHeadline(signals),
    description: signals.description || "", // Extracted or to be filled
    image: signals.imageUrl ? new URL(signals.imageUrl, baseUrl).href : "", // Extracted or to be filled
    brand: {
      "@type": "Brand",
      name: "", // To be filled
    },
    offers: {
      "@type": "Offer",
      price: signals.price || "", // Extracted or to be filled
      priceCurrency: signals.priceCurrency || "USD", // Extracted or default USD
      availability: "https://schema.org/InStock",
      url: signals.url,
    },
  };
}

/**
 * Generate FAQ schema
 */
function generateFaqSchema(signals: PageSignals): object {
  // Use extracted FAQ items if available
  const mainEntity = signals.faqItems && signals.faqItems.length > 0
    ? signals.faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      }))
    : [
        {
          "@type": "Question",
          name: "Question 1?", // To be filled from FAQ content
          acceptedAnswer: {
            "@type": "Answer",
            text: "Answer 1", // To be filled
          },
        },
        // Add more Q&A pairs
      ];

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };
}

/**
 * Generate LocalBusiness schema
 */
function generateLocalBusinessSchema(signals: PageSignals): object {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: signals.title.split("|")[0].split("-")[0].trim(),
    url: signals.url,
    description: signals.description || "", // Extracted or to be filled
    address: {
      "@type": "PostalAddress",
      streetAddress: "", // To be filled
      addressLocality: "", // To be filled
      addressRegion: "", // To be filled
      postalCode: "", // To be filled
      addressCountry: "", // To be filled
    },
    telephone: signals.phone || "", // Extracted or to be filled
    openingHours: "", // To be filled
  };
}

/**
 * Generate structured data based on detected page type
 */
export function generateStructuredData(
  signals: PageSignals,
  pageType: PageType
): object {
  switch (pageType) {
    case "homepage":
    case "organization":
      return generateOrganizationSchema(signals);
    case "article":
      return generateArticleSchema(signals);
    case "product":
      return generateProductSchema(signals);
    case "faq":
      return generateFaqSchema(signals);
    case "local-business":
      return generateLocalBusinessSchema(signals);
    default:
      // Default to WebPage
      return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: pageHeadline(signals),
        url: signals.url,
        description: signals.description || "", // Extracted or to be filled
      };
  }
}

/**
 * Get reasoning for the suggested schema
 */
function getReasoningForType(
  pageType: PageType,
  signals: PageSignals,
  confidence: number
): string {
  const confidenceText = confidence > 0.7 ? "High" : confidence >= MIN_TYPE_CONFIDENCE ? "Medium" : "Low";
  return `${confidenceText} confidence. ${reasonsFor(pageType, signals).join(". ")}.`;
}

/** The signals behind a type, as short phrases. */
function reasonsFor(pageType: PageType, signals: PageSignals): string[] {
  const reasons: string[] = [];

  switch (pageType) {
    case "homepage":
      reasons.push("Page is the site root (/)");
      break;
    case "article":
      if (signals.hasArticleTag) reasons.push("Has <article> tag");
      if (signals.hasPublishDate) reasons.push("Has publish date");
      if (signals.hasAuthor) reasons.push("Has author attribution");
      break;
    case "product":
      if (signals.hasPrice) reasons.push("Has price display");
      if (signals.hasAddToCart) reasons.push("Has add-to-cart button");
      break;
    case "faq":
      reasons.push("Has FAQ section or Q&A structure");
      break;
    case "local-business":
      if (signals.hasAddress) reasons.push("Has physical address");
      if (signals.hasPhone) reasons.push("Has phone number");
      break;
    default:
      reasons.push("No specific page type detected");
  }
  return reasons;
}

/**
 * Detect, generate, and refuse what would clash: the whole suggestion from the
 * page's signals, with no browser, so every branch is testable.
 *
 * Below MIN_TYPE_CONFIDENCE the type is "unknown" and only a generic WebPage
 * is offered (name, url, description), never a typed schema built on one weak
 * signal. And nothing is offered that the page already declares or that
 * conflicts with what it declares: cbrowser.ai/pricing, which declares
 * WebPage in its @graph, now gets no schema and says why. (2026-10-10, B34)
 */
export function buildSuggestion(signals: PageSignals): StructuredDataSuggestion {
  const { type, confidence, candidates } = detectPageType(signals);
  const generated = generateStructuredData(signals, type) as Record<string, unknown>;
  const suggestedType = String(generated["@type"]);
  const clash = schemaClash(suggestedType, signals.existingSchema);

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  let reasoning: string;
  if (type === "unknown") {
    const best = candidates[0];
    reasoning = best
      ? `Low confidence. No page type reached ${pct(MIN_TYPE_CONFIDENCE)}; the best candidate is ${best.type} at ${pct(best.confidence)} (${reasonsFor(best.type, signals).join(", ").toLowerCase()}), too weak to claim, so no typed schema is suggested.`
      : "No specific page type detected.";
  } else {
    reasoning = getReasoningForType(type, signals, confidence);
  }
  if (clash) {
    reasoning += clash.kind === "duplicate"
      ? ` The page already declares ${clash.existingType}, so ${suggestedType} is not suggested again.`
      : ` The page declares ${clash.existingType} as its subject, which a ${suggestedType} would contradict, so none is suggested.`;
  }

  const suggestedSchema = clash ? null : generated;
  return {
    pageType: type,
    confidence,
    existingSchema: signals.existingSchema,
    suggestedSchema,
    suggestedSchemaString: suggestedSchema ? JSON.stringify(suggestedSchema, null, 2) : "",
    reasoning,
    candidates,
  };
}

/**
 * Suggest structured data for a URL
 */
export async function suggestStructuredData(
  options: StructuredDataOptions
): Promise<StructuredDataSuggestion> {
  const { url, headless = true } = options;

  let browser: CBrowser | null = null;
  try {
    browser = new CBrowser({ headless, persistent: false });
    await browser.launch();
    const page = await browser.getPage();

    const signals = await extractPageSignals(page, url);

    await browser.close();
    browser = null;

    return buildSuggestion(signals);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
