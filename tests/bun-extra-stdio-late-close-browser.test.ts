/**
 * A closed browser cannot cut the next browser's CDP pipe.
 *
 * The same Bun bug as tests/bun-extra-stdio-late-close.test.ts, one step
 * closer to the suite's long-process browser hangs: Playwright speaks CDP to
 * chromium over pipes 3 and 4, and the next launch gets the same two fd
 * numbers the last one freed. On Bun before 1.4.0, a GC that finalizes the
 * first browser's ChildProcess closes them again, so the second browser stops
 * answering and newPage() never returns. Without the test preload this fails
 * every time on 1.3.8.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { chromium } from "playwright";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One browser, used and closed, with nothing left pointing at it. */
async function closedBrowser(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<p>first</p>");
  await browser.close();
}

describe("Bun's second close of a dead browser's pipes", () => {
  test("the next browser still answers after a GC", async () => {
    await closedBrowser();
    const browser = await chromium.launch();
    try {
      for (let i = 0; i < 5; i++) {
        Bun.gc(true);
        await sleep(50);
      }
      const answered = await Promise.race([
        browser.newPage().then(async (page) => {
          await page.setContent("<p>second</p>");
          return page.textContent("p");
        }),
        sleep(15_000).then(() => "no answer in 15 s"),
      ]);
      expect(answered).toBe("second");
    } finally {
      await Promise.race([browser.close(), sleep(5_000)]);
    }
  }, 60_000);
});
