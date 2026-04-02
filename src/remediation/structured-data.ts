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

    // Publish date
    const publishDateEl = document.querySelector('time[datetime]') ||
      document.querySelector('meta[property="article:published_time"]');
    const publishDate = publishDateEl?.getAttribute("datetime") ||
      publishDateEl?.getAttribute("content") || "";

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
  const baseUrl = `${url.protocol}//${url.hostname}`;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: signals.title.split("|")[0].split("-")[0].trim(),
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
    headline: signals.title,
    description: signals.description || "", // Extracted or to be filled
    author: {
      "@type": "Person",
      name: signals.authorName || "", // Extracted or to be filled
    },
    datePublished: signals.publishDate || "", // Extracted or to be filled
    dateModified: signals.modifiedDate || signals.publishDate || "", // Extracted or to be filled
    publisher: {
      "@type": "Organization",
      name: "", // To be filled
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
    name: signals.title,
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
        name: signals.title,
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
