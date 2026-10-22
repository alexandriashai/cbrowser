/**
 * Provenance entries for the page-metric extractor's constants
 * (extractPageMetrics in cognitive-transport.ts). See ../model-provenance.ts
 * for the statuses.
 *
 * These turn raw page counts (characters of text, colours, images, links,
 * running animations, word and sentence lengths) into the 0-1 page features
 * the cognitive transport chain reads as demand. Every midpoint, weight,
 * threshold and cap was set by hand, so each is a `hypothesis`. The data that
 * would set most of them is the same: the distribution of the raw count across
 * a reference set of real pages (a crawl stratified by site type and script),
 * with a midpoint placed where it would sit on that distribution (for a
 * value/(value + midpoint) curve, the median makes 0.5 the typical page). The
 * script-family detection and word-length thresholds would be set against
 * hand-labelled pages and tokenised corpora per script. The only `definition`
 * is the area unit text density is expressed in.
 *
 * extractPageMetrics is measurePageRaw then deriveMetrics (cognitive-transport.ts).
 * The ids in PAGE_METRICS_MEASURE_IDS decide what is counted at all, so
 * measurePageRaw reads them in Node and hands them to the page (the browser
 * side cannot call param()); a stored raw measurement cannot be re-derived
 * under another value of one of them. Every other id is applied by
 * deriveMetrics to the raw counts and length histograms, so a stored
 * measurement (the CTC reference set) re-derives under a changed value.
 * tests/page-metrics-no-literals.test.ts fails on any other numeric literal in
 * those functions, and tests/page-metrics-golden.test.ts proves the outputs did
 * not move when the literals became entries, nor when the extractor was split.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `pageMetrics.${id}`, value, status: "hypothesis", source });
const d = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `pageMetrics.${id}`, value, status: "definition", source });

// What would place a value/(value + midpoint) midpoint.
const MIDPOINT = (raw: string, feature: string) =>
  `Hand-set midpoint at which ${feature} reads 0.5 (value / (value + midpoint)). The distribution of ${raw} across a reference set of real pages would set it; at its median, 0.5 means a typical page.`;

const SCRIPT = (what: string) =>
  `Hand-set ${what}. Agreement with hand-labelled script families on a set of real pages in Latin, CJK and abjad scripts (including partly translated ones) would set it.`;

const TOKENS = (what: string, script: string) =>
  `Hand-set ${what} for ${script} text. Word-length and sentence-length distributions of a tokenised ${script} corpus of web text, set against reading difficulty ratings, would place it.`;

export const PAGE_METRICS_PROVENANCE: ProvenanceEntry[] = [
  // ── Lazy-load walk (full_page scope) ──
  h("walk.maxSteps", 5, "Hand-set number of screens scrolled before a full_page measurement, to trigger lazy content. The share of lazily loaded elements that appear after each additional step, across a reference set of long pages, would set it."),
  h("walk.settleMs", 300, "Hand-set wait after each scroll step (and after returning to the top) for lazy content to load. The time to the last lazy insertion after a scroll, across a reference set of pages, would set it."),

  // ── Density and complexity ──
  h("text.nestedShare", 0.4, "Hand-set share kept of the summed innerText of every text element, because nested elements count the same text more than once. The ratio of de-duplicated visible text (leaf text nodes) to that sum, across a reference set of real pages, would set it."),
  h("informationDensity.midpoint", 5000, MIDPOINT("de-duplicated visible characters per measured area", "informationDensity")),
  h("visual.colourWeight", 3, "Hand-set weight of each distinct colour in the visual-complexity count (colours x 3 + images x 2 + visible elements x 0.5). Regressing rated visual complexity of a reference set of pages on the three counts would fit it."),
  h("visual.imageWeight", 2, "Hand-set weight of each image in the visual-complexity count. The same regression of rated visual complexity on the three counts would fit it."),
  h("visual.elementWeight", 0.5, "Hand-set weight of each visible element in the visual-complexity count. The same regression of rated visual complexity on the three counts would fit it."),
  h("visual.colourSample", 50, "Hand-set number of visible elements (in document order) whose colours are sampled, bounding the getComputedStyle cost. The distinct-colour count as a function of sample size, across a reference set of pages, would show where it saturates."),
  h("visual.midpoint", 200, MIDPOINT("the weighted colour-image-element count", "visualComplexity")),
  d("textDensity.areaUnit", 0.001, "Expresses the measured area in thousands of square pixels, so text density is characters per 1,000 px^2; a choice of units."),
  h("textDensity.midpoint", 3, MIDPOINT("characters per 1,000 px^2", "textDensity")),
  h("animation.carouselCount", 3, "Hand-set number of running animations a carousel counts as. Rated distraction (or measured reading slowdown) on pages with a carousel against pages with n running animations would set it."),
  h("animation.saturation", 10, "Hand-set animation count at which animationLevel reaches 1 (a linear ramp, capped). Rated distraction against running-animation count across a reference set of pages would set the ramp."),
  h("choiceCap", 100, "Hand-set cap on choiceCount for the demand math, which saturates well before it (choices/(choices + 10) is 0.91 at 100); the raw count is reported beside it. The distribution of choice counts across a reference set of real pages would show how often it binds (it does on the CU Denver homepage at full_page)."),

  // ── Readability: which text counts ──
  h("prose.lengthAbove", 5, "Hand-set: a prose element counts only when its text is longer than this many characters, to skip labels and stray glyphs. The share of such short elements that are labels rather than prose, on a hand-labelled reference set, would set it."),

  // ── Script detection ──
  h("script.minChars", 5, SCRIPT("minimum count of CJK (or abjad) characters before a page can be classed as that script, so a stray glyph or emoji does not flip it")),
  h("script.textShare", 0.3, SCRIPT("share of visible characters in the script above which the page is classed as that script")),
  h("script.keyShare", 0.2, SCRIPT("share of the h1 and nav characters in the script above which the page is classed as that script (catches partial translation)")),

  // ── Abjad (Arabic, Hebrew, Persian, Urdu) ──
  h("abjad.lengthScale", 1.6, TOKENS("multiplier that maps an abjad word's character count to a Latin-equivalent length (short root-based stems carry more per character)", "abjad")),
  h("abjad.longWordMin", 5, TOKENS("character count from which an abjad word is long (read as 8+ Latin characters)", "abjad")),
  h("abjad.techWordMin", 6, TOKENS("character count from which an abjad word counts as technical", "abjad")),
  h("abjad.sentenceLengthAbove", 5, TOKENS("character length a split abjad fragment must exceed to count as a sentence", "abjad")),

  // ── Latin (alphabetic pages, and Latin words on abjad pages) ──
  h("latin.longWordMin", 7, TOKENS("letter count from which a word is long", "Latin-script")),
  h("latin.techWordMin", 10, TOKENS("letter count from which a word counts as technical or compound", "Latin-script")),
  h("alphabetic.sentenceLengthAbove", 10, TOKENS("character length a split fragment must exceed to count as a sentence", "alphabetic")),

  // ── CJK ──
  h("cjk.charsPerWord", 1.8, TOKENS("characters per word used to estimate a CJK word count (Chinese about 1.5, Japanese and Korean about 2)", "CJK")),
  h("cjk.latinEquivalentLength", 6, TOKENS("Latin-equivalent length assigned to each estimated CJK word", "CJK")),
  h("cjk.longRunMin", 3, TOKENS("run of CJK characters from which a compound counts as a long word", "CJK")),
  h("cjk.techRunMin", 4, TOKENS("run of CJK characters from which a compound counts as technical", "CJK")),
  h("cjk.latinTechWordMin", 8, TOKENS("length from which a Latin word inside CJK text counts as technical", "CJK")),
  h("cjk.sentenceLengthAbove", 3, TOKENS("character length a split CJK fragment must exceed to count as a sentence", "CJK")),

  // ── Normalisation to 0-1 ──
  h("wordLength.offset", 3, "Hand-set average word length (in Latin-equivalent characters) that maps to 0 (avgWordLength = (length - 3) / 7.5, so 4 -> 0.13, 6 -> 0.4, 10.5 -> 1). The distribution of average word length across a reference set of real pages, against rated reading difficulty, would set it."),
  h("wordLength.span", 7.5, "Hand-set span of average word length over which avgWordLength rises from 0 to 1. The same word-length distribution and difficulty ratings would set it."),
  h("sentenceLength.saturation", 40, "Hand-set average words per sentence at which avgSentenceLength reaches 1 (a linear ramp, capped). The distribution of sentence length across a reference set of real pages, against rated reading difficulty, would set it."),
  h("lexicalDiversity.window", 100, "Hand-set word count the type-token ratio is computed over at most (unique words / min(words, 100)), since the raw ratio falls with text length. The type-token curve of a reference corpus of web text would set the window."),

  // ── Storage bounds of a raw measurement (measurePageRaw) ──
  // No PageMetrics field reads these; they bound what a RawPageMeasurement
  // keeps, and the uncapped totals are kept beside each list.
  d("raw.lengthBins", 32, "Resolution of the run-length and sentence-fragment-length histograms in a raw page measurement: lengths at or above it share one bin. A storage choice, not a model claim; a sentence or run threshold must sit below it for deriveMetrics to re-derive a stored measurement, and it refuses otherwise."),
  d("raw.maxBoxes", 300, "Interactive elements whose box a raw page measurement keeps, in document order (the count is kept uncapped). A storage bound, not a model claim: it covers the 95th percentile at viewport scope (139) and about the 90th at full_page (300) on the 2026-10-22 reference crawl."),
  d("raw.maxTextBlocks", 128, "Prose blocks whose size and typography a raw page measurement keeps, in document order (the count is kept uncapped). A storage bound, not a model claim."),
  d("raw.maxChoiceGroups", 64, "Choice groups (nav lists, selects, radio and checkbox groups, menus) a raw page measurement keeps, in document order (the count is kept uncapped). A storage bound, not a model claim."),
];

/**
 * The ids measurePageRaw applies while measuring: they decide what is counted
 * (the lazy-load walk, the colour sample, the prose filter, script detection)
 * or what a raw record keeps. A stored measurement carries their effect and
 * cannot be re-derived under another value; everything else in
 * PAGE_METRICS_PROVENANCE is applied by deriveMetrics.
 */
export const PAGE_METRICS_MEASURE_IDS: readonly string[] = Object.freeze([
  "pageMetrics.walk.maxSteps",
  "pageMetrics.walk.settleMs",
  "pageMetrics.visual.colourSample",
  "pageMetrics.prose.lengthAbove",
  "pageMetrics.script.minChars",
  "pageMetrics.script.textShare",
  "pageMetrics.script.keyShare",
  "pageMetrics.raw.lengthBins",
  "pageMetrics.raw.maxBoxes",
  "pageMetrics.raw.maxTextBlocks",
  "pageMetrics.raw.maxChoiceGroups",
]);
