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

import { chromium, type Page, type Browser } from "playwright";
import { launchBrowserWithFallback } from "../browser.js";

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
}

/**
 * Structured data suggestion
 */
export interface StructuredDataSuggestion {
  pageType: PageType;
  confidence: number; // 0-1
  existingSchema: string[];
  suggestedSchema: object;
  suggestedSchemaString: string;
  reasoning: string;
}

/**
 * Options for structured data suggestion
 */
export interface StructuredDataOptions {
  url: string;
  headless?: boolean;
}

/**
 * Extract signals from a page for type detection
 */
async function extractPageSignals(page: Page, url: string): Promise<PageSignals> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  const signals = await page.evaluate(() => {
    const title =
      document.querySelector("title")?.textContent?.trim() || "";

    // Check for article indicators
    const hasArticleTag = !!document.querySelector("article");
    const hasPublishDate = !!(
      document.querySelector('time[datetime], [class*="publish"], [class*="date"], meta[property="article:published_time"]')
    );
    const hasAuthor = !!(
      document.querySelector('[rel="author"], [class*="author"], [class*="byline"], meta[name="author"]')
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
    const hasProductSchema = !!(
      document.querySelector('script[type="application/ld+json"]')?.textContent?.includes('"@type":"Product"') ||
      document.querySelector('[itemtype*="Product"]')
    );

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

    // Check for existing schema
    const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
    const existingSchema: string[] = [];
    schemaScripts.forEach((script) => {
      try {
        const json = JSON.parse(script.textContent || "{}");
        if (json["@type"]) {
          existingSchema.push(json["@type"]);
        } else if (Array.isArray(json)) {
          json.forEach((item) => {
            if (item["@type"]) existingSchema.push(item["@type"]);
          });
        }
      } catch {
        // Ignore parse errors
      }
    });

    // Check if homepage
    const isHomepage = window.location.pathname === "/" || window.location.pathname === "";

    return {
      title,
      hasArticleTag,
      hasProductSchema,
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
      existingSchema,
    };
  });

  return { ...signals, url };
}

/**
 * Detect page type from signals
 */
export function detectPageType(signals: PageSignals): { type: PageType; confidence: number } {
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
    unknown: 0.1, // Base score for unknown
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

  // Find highest scoring type
  let maxScore = 0;
  let detectedType: PageType = "unknown";

  for (const [type, score] of Object.entries(scores) as [PageType, number][]) {
    if (score > maxScore) {
      maxScore = score;
      detectedType = type;
    }
  }

  // Normalize confidence
  const confidence = Math.min(1, maxScore);

  return { type: detectedType, confidence };
}

/**
 * Generate Organization schema
 */
function generateOrganizationSchema(signals: PageSignals): object {
  const url = new URL(signals.url);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: signals.title.split("|")[0].split("-")[0].trim(),
    url: `${url.protocol}//${url.hostname}`,
    description: "", // To be filled
    logo: "", // To be filled
    sameAs: [], // Social links to be added
  };
}

/**
 * Generate Article schema
 */
function generateArticleSchema(signals: PageSignals): object {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: signals.title,
    description: "", // To be filled
    author: {
      "@type": "Person",
      name: "", // To be filled
    },
    datePublished: "", // To be filled from time[datetime]
    dateModified: "", // To be filled
    publisher: {
      "@type": "Organization",
      name: "", // To be filled
      logo: {
        "@type": "ImageObject",
        url: "", // To be filled
      },
    },
    image: "", // To be filled
  };
}

/**
 * Generate Product schema
 */
function generateProductSchema(signals: PageSignals): object {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: signals.title,
    description: "", // To be filled
    image: "", // To be filled
    brand: {
      "@type": "Brand",
      name: "", // To be filled
    },
    offers: {
      "@type": "Offer",
      price: "", // To be filled
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: signals.url,
    },
  };
}

/**
 * Generate FAQ schema
 */
function generateFaqSchema(_signals: PageSignals): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Question 1?", // To be filled from FAQ content
        acceptedAnswer: {
          "@type": "Answer",
          text: "Answer 1", // To be filled
        },
      },
      // Add more Q&A pairs
    ],
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
    address: {
      "@type": "PostalAddress",
      streetAddress: "", // To be filled
      addressLocality: "", // To be filled
      addressRegion: "", // To be filled
      postalCode: "", // To be filled
      addressCountry: "", // To be filled
    },
    telephone: "", // To be filled
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
        name: signals.title,
        url: signals.url,
        description: "", // To be filled
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

  const confidenceText = confidence > 0.7 ? "High" : confidence > 0.4 ? "Medium" : "Low";
  return `${confidenceText} confidence. ${reasons.join(". ")}.`;
}

/**
 * Suggest structured data for a URL
 */
export async function suggestStructuredData(
  options: StructuredDataOptions
): Promise<StructuredDataSuggestion> {
  const { url, headless = true } = options;

  let browser: Browser | null = null;
  try {
    browser = await launchBrowserWithFallback(chromium, { headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    const signals = await extractPageSignals(page, url);

    await browser.close();
    browser = null;

    const { type, confidence } = detectPageType(signals);
    const suggestedSchema = generateStructuredData(signals, type);
    const reasoning = getReasoningForType(type, signals, confidence);

    return {
      pageType: type,
      confidence,
      existingSchema: signals.existingSchema,
      suggestedSchema,
      suggestedSchemaString: JSON.stringify(suggestedSchema, null, 2),
      reasoning,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
