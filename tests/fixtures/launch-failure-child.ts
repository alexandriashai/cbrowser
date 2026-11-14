/**
 * Child process for tests/hosted-launch-no-install.test.ts: one browser launch
 * that fails, through CBrowser.launch (argv[2] "class") or through
 * launchBrowserWithFallback (argv[2] "standalone"), on the hosted server
 * (argv[3] "hosted") or not. Prints the error message as JSON on stdout.
 *
 * A separate process because Playwright reads PLAYWRIGHT_BROWSERS_PATH once,
 * when it loads, and the test points it at an empty directory so the launch
 * fails without touching the real browser cache.
 */
const { CBrowser, launchBrowserWithFallback } = await import("../../src/browser.js");
const { setHostedMode } = await import("../../src/mcp-tools/hosted-inputs.js");
const { chromium } = await import("playwright");

const [, , via, mode] = process.argv;
if (mode === "hosted") setHostedMode(true);

let message = "launched (unexpected)";
try {
  if (via === "standalone") {
    const b = await launchBrowserWithFallback(chromium, { headless: true });
    await b.close();
  } else {
    const cb = new CBrowser({ headless: true, persistent: false });
    await cb.launch();
    await cb.close();
  }
} catch (e) {
  message = e instanceof Error ? e.message : String(e);
}
process.stdout.write(JSON.stringify({ message }));
