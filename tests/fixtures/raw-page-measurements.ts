/**
 * Hand-built RawPageMeasurement records, one per script family, for testing
 * deriveMetrics without a browser.
 *
 * Each sits where every derivation-stage pageMetrics constant can move an
 * output: a choice count just above the cap, unique words below the
 * type-token window, words and fragments AT each length threshold (so scaling
 * the threshold by 1.1 or 0.9 changes what counts), running animations and a
 * carousel, a full_page area for the text-density unit. Real pages are
 * covered by tests/page-metrics-raw.test.ts, which derives from what
 * measurePageRaw returns on the golden fixture pages.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { RawPageMeasurement, RawText } from "../../src/visual/cognitive-transport.js";

function raw(text: RawText, scope: "viewport" | "full_page" = "full_page"): RawPageMeasurement {
  return {
    format: 1,
    scope,
    viewportWidth: 1280,
    viewportHeight: 800,
    documentHeight: 3200,
    pageScreens: 4,
    scrollY: 0,
    textChars: 12000,
    interactiveElements: 120,
    links: 105,
    selectOptions: 3,
    runningAnimations: 2,
    autoplayElements: 1,
    carousel: true,
    breadcrumbLinks: 3,
    colours: 20,
    visibleElements: 300,
    images: 15,
    text,
    kinds: ["a", "button", "nav"],
    boxes: [0, 10, 20, 100, 24, 1, 200, 20, 80, 32],
    choiceGroups: [2, 12],
    choiceGroupCount: 1,
    textBlocks: [120, 20, 0, 2, 16, 24, 640, 48],
    textBlockCount: 1,
  };
}

/** Latin prose: words of every length from 0 (punctuation only) to 14, fragments at 9 to 11 around the threshold of 10. */
export const RAW_LATIN: RawPageMeasurement = raw({
  script: "alphabetic",
  wordLengths: [[0, 4], [1, 10], [2, 30], [3, 40], [4, 50], [5, 40], [6, 30], [7, 30], [8, 20], [9, 15], [10, 12], [11, 8], [12, 5], [14, 6]],
  abjadWordLengths: [],
  cjkChars: 0,
  cjkRunLengths: [],
  uniqueWords: 80,
  fragmentLengths: [[0, 2], [4, 3], [9, 2], [10, 3], [11, 4], [25, 10], [32, 5]],
  lengthBins: 32,
});

/** CJK prose: runs from 1 to the overflow bin, Latin words at 7 to 9 around cjk.latinTechWordMin (8), fragments at 3 and 4. */
export const RAW_CJK: RawPageMeasurement = raw({
  script: "cjk",
  wordLengths: [[3, 4], [5, 6], [7, 3], [8, 2], [9, 2]],
  abjadWordLengths: [],
  cjkChars: 900,
  cjkRunLengths: [[1, 20], [2, 40], [3, 30], [4, 20], [5, 10], [12, 4], [32, 2]],
  uniqueWords: 200,
  fragmentLengths: [[0, 1], [2, 3], [3, 4], [4, 5], [20, 30], [32, 8]],
  lengthBins: 32,
}, "viewport");

/** Abjad prose: abjad words of 2 to 9 letters, some Latin words, fragments at 5 and 6 around abjad.sentenceLengthAbove (5). */
export const RAW_ABJAD: RawPageMeasurement = raw({
  script: "abjad",
  wordLengths: [[3, 5], [7, 4], [10, 3]],
  abjadWordLengths: [[2, 20], [3, 40], [4, 50], [5, 30], [6, 20], [7, 10], [9, 5]],
  cjkChars: 0,
  cjkRunLengths: [],
  uniqueWords: 90,
  fragmentLengths: [[0, 2], [4, 2], [5, 3], [6, 3], [30, 12], [32, 4]],
  lengthBins: 32,
});

export const RAW_FIXTURES: Record<string, RawPageMeasurement> = { latin: RAW_LATIN, cjk: RAW_CJK, abjad: RAW_ABJAD };
