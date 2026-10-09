/**
 * find_element_by_intent reports `zone` as the click gate's own verdict on the element it found, so the zone
 * an agent checks before clicking is the zone the click is held to - including for a data-testid selector
 * that carries no words, and for a text field whose label sounds dangerous but whose click does nothing.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-zone-gate-data-"));
process.env.CBROWSER_ARTIFACT_DIR ??= mkdtempSync(join(tmpdir(), "cb-zone-gate-art-"));

const { CBrowser } = await import("../src/browser.js");
const { findElementByIntent } = await import("../src/analysis/natural-language.js");

let b: InstanceType<typeof CBrowser>;
let page: any;
beforeAll(async () => { b = new CBrowser({ headless: true }); page = await b.getPage(); });
afterAll(async () => { await b.close(); });

describe("find_element_by_intent zone == click gate verdict", () => {
  test("a red button found by intent reports red, and clicking its selector is refused", async () => {
    await page.setContent(`<!doctype html><html lang="en"><body><main><button data-testid="danger-delete" onclick="window.__c='DEL'">Delete account</button></main></body></html>`);
    const r = await findElementByIntent(b, "delete account button");
    expect(r?.selector).toBeTruthy();
    expect(r?.zone).toBe("red");
    const c = await b.click(r!.selector, {});
    expect(c.success).toBe(false);
    expect(c.zone).toBe("red");
  });
  test("a text field whose label mentions closing an account reports yellow, as the gate judges it", async () => {
    await page.setContent(`<!doctype html><html lang="en"><body><main><label for="why">Reason you want to close account</label><input id="why"></main></body></html>`);
    const r = await findElementByIntent(b, "reason you want to close account field");
    expect(r?.selector).toBeTruthy();
    expect(r?.zone).toBe("yellow");
  });
  test("a benign link reports yellow", async () => {
    await page.setContent(`<!doctype html><html lang="en"><body><nav><a href="/pricing">Pricing</a></nav></body></html>`);
    const r = await findElementByIntent(b, "pricing link");
    expect(r?.zone).toBe("yellow");
  });
});
