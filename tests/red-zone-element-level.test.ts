/**
 * Red-zone gate is element-level.
 *
 * The zone of a click is a property of the element the selector resolves to, not of the selector string.
 * The same "Delete account" button must be refused without --force whether it is addressed by its label,
 * aria-label, id, data-testid, a structural path, or a css:/aria: prefix; a benign neighbour addressed the
 * same ways must proceed; --force must still work; and smart_click must not retry a refused red with a
 * shorter alternative (the "Delete account" -> "Delete" bypass).
 *
 * The same gate covers every path that activates an element on a caller's behalf: hoverClick (also the
 * daemon's click path), click()'s Enter-key fallback, and Enter/Space through press_key
 * (classifyKeyActivation). A field's own content is data, not a label, and the black-zone words describe
 * instructions, not page controls.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-redzone-data-"));
process.env.CBROWSER_ARTIFACT_DIR ??= mkdtempSync(join(tmpdir(), "cb-redzone-art-"));

const { CBrowser } = await import("../src/browser.js");

const PAGE = `<!doctype html><html lang="en"><body>
<p>Press the button below to continue.</p>
<button id="draft" data-testid="row-delete" onclick="window.__c='DRAFT'">Delete draft</button>
<button id="delete-account" data-testid="danger-delete" onclick="window.__c='DELETE'">Delete account</button>
<button id="icon" aria-label="Delete account permanently" onclick="window.__c='ICON'"><svg width="10" height="10"></svg></button>
<form action="/account/close" onsubmit="window.__c='CLOSE';return false"><input type="submit" id="close-btn" value="Confirm"></form>
<a id="pay" href="#pay" onclick="window.__c='PAY';return false">Pay $49 now</a>
<a id="shop" href="#shop" onclick="window.__c='SHOP';return false">Continue shopping</a>
</body></html>`;

let b: InstanceType<typeof CBrowser>;
let page: any;
const fired = () => page.evaluate(() => { const v = (window as any).__c; (window as any).__c = null; return v ?? null; });
const reset = async () => { await page.setContent(PAGE); await fired(); };

beforeAll(async () => { b = new CBrowser({ headless: true }); page = await b.getPage(); });
afterAll(async () => { await b.close(); });

describe("red zone follows the element, not the selector form", () => {
  const dangerous: Array<[string, string]> = [
    ["label as text", "Delete account"],
    ["aria: prefix", "aria:button/Delete account"],
    ["id", "#delete-account"],
    ["css: id", "css:#delete-account"],
    ["data-testid", '[data-testid="danger-delete"]'],
    ["structural path", "body > button:nth-of-type(2)"],
    ["aria-label only, by id", "#icon"],
    ["submit whose form posts to /account/close", "#close-btn"],
    ["submit by its value", "Confirm"],
    ["pay link by id", "#pay"],
  ];
  for (const [how, sel] of dangerous) {
    test(`refused without force: ${how} (${sel})`, async () => {
      await reset();
      const r = await b.click(sel, {});
      expect(r.success).toBe(false);
      expect(r.zone).toBe("red");
      expect(r.message).toMatch(/^Red zone action requires --force/);
      expect(await fired()).toBeNull();
    });
  }

  const benign: Array<[string, string, string]> = [
    ["benign delete by id", "#draft", "DRAFT"],
    ["benign delete by testid", '[data-testid="row-delete"]', "DRAFT"],
    ["benign delete by text", "Delete draft", "DRAFT"],
    ["benign link by id", "#shop", "SHOP"],
  ];
  for (const [how, sel, marker] of benign) {
    test(`proceeds: ${how} (${sel})`, async () => {
      await reset();
      const r = await b.click(sel, {});
      expect(r.success).toBe(true);
      expect(r.zone).toBe("yellow");
      expect(await fired()).toBe(marker);
    });
  }

  test("force still clicks a red element addressed by id, and reports the zone", async () => {
    await reset();
    const r = await b.click("#delete-account", { force: true });
    expect(r.success).toBe(true);
    expect(r.zone).toBe("red");
    expect(r.target).toEqual({ tag: "button", label: "Delete account" });
    expect(await fired()).toBe("DELETE");
  });
});

describe("smart_click does not route around the gate", () => {
  test("refused red is not retried with a shorter alternative", async () => {
    await reset();
    const r = await b.smartClick("Delete account", { retryDelay: 10 });
    expect(r.success).toBe(false);
    expect(r.zone).toBe("red");
    expect(r.attempts.length).toBe(1);
    expect(r.healed).toBeUndefined();
    expect(await fired()).toBeNull();
  });
  test("refused red by id is not retried either", async () => {
    await reset();
    const r = await b.smartClick("#delete-account", { retryDelay: 10 });
    expect(r.success).toBe(false);
    expect(r.attempts.length).toBe(1);
    expect(await fired()).toBeNull();
  });
  test("benign healing still works", async () => {
    await reset();
    const r = await b.smartClick("Delete draft now", { retryDelay: 10 });
    expect(r.success).toBe(true);
    expect(r.healed).toBe(true);
    expect(await fired()).toBe("DRAFT");
  });
  test("force passes through smart_click", async () => {
    await reset();
    const r = await b.smartClick("#delete-account", { retryDelay: 10, force: true });
    expect(r.success).toBe(true);
    expect(await fired()).toBe("DELETE");
  });
});

describe("smart_click bypass and cache poisoning (live repro, 2026-10-08)", () => {
  const PAGE_ARIA = `<!doctype html><html lang="en"><body><h1>Account settings</h1>
<button id="draft" onclick="window.__c='DRAFT'">Delete draft</button>
<button aria-label="Delete account" onclick="window.__c='DELETE'">Delete</button></body></html>`;
  test("aria-label-only button: refused once, nothing fired, nothing healed", async () => {
    await page.setContent(PAGE_ARIA); await fired();
    const r = await b.smartClick("Delete account", { retryDelay: 10 });
    expect(r.success).toBe(false);
    expect(r.zone).toBe("red");
    expect(r.attempts.length).toBe(1);
    expect(await fired()).toBeNull();
  });
  test("a later forced smart_click still reaches the button it names (no poisoned heal)", async () => {
    // Regression guard for the heal cache: a refused attempt must leave nothing behind that steers a later
    // forced smart_click away from the button it names. (The bypass itself is the test above, which fails
    // on 19.1.7; this one also passes there on this page shape.)
    await page.setContent(PAGE_ARIA); await fired();
    await b.smartClick("Delete account", { retryDelay: 10 });
    await page.setContent(PAGE_ARIA); await fired();
    const r = await b.smartClick("Delete account", { retryDelay: 10, force: true });
    expect(r.success).toBe(true);
    expect(await fired()).toBe("DELETE");
  });
});

describe("hoverClick (and the daemon click path) is gated", () => {
  test("refused by id without force", async () => {
    await reset();
    const r = await b.hoverClick("#delete-account");
    expect(r.success).toBe(false);
    expect(r.zone).toBe("red");
    expect(r.target).toEqual({ tag: "button", label: "Delete account" });
    expect(await fired()).toBeNull();
  });
  test("refused by label text without force", async () => {
    await reset();
    const r = await b.hoverClick("Delete account");
    expect(r.success).toBe(false);
    expect(r.zone).toBe("red");
    expect(await fired()).toBeNull();
  });
  test("benign target proceeds", async () => {
    await reset();
    const r = await b.hoverClick("#draft");
    expect(r.success).toBe(true);
    expect(r.zone).toBe("yellow");
    expect(await fired()).toBe("DRAFT");
  });
  test("force clicks", async () => {
    await reset();
    const r = await b.hoverClick("#delete-account", { force: true });
    expect(r.success).toBe(true);
    expect(await fired()).toBe("DELETE");
  });
});

describe("click()'s Enter-key fallback is gated on the form it submits", () => {
  const formPage = (action: string, button: string, marker: string) => `<!doctype html><html lang="en"><body>
<form action="${action}" onsubmit="window.__c='${marker}';return false">
  <input id="field" name="field" aria-label="Field">
  <button type="submit">${button}</button>
</form>
<button id="send" style="visibility:hidden">Send</button></body></html>`;
  test("Enter in a card field of a /checkout form is refused", async () => {
    await page.setContent(formPage("/checkout", "Pay now", "PAID")); await fired();
    page.setDefaultTimeout(1500);
    try {
      await b.fill("#field", "4242424242424242");
      const r = await b.click("Send", {});
      expect(r.success).toBe(false);
      expect(r.zone).toBe("red");
      expect(await fired()).toBeNull();
    } finally { page.setDefaultTimeout(30000); }
  });
  test("Enter in a search form still submits", async () => {
    await page.setContent(formPage("/search", "Search", "SEARCHED")); await fired();
    page.setDefaultTimeout(1500);
    try {
      await b.fill("#field", "running shoes");
      const r = await b.click("Send", {});
      expect(r.success).toBe(true);
      expect(await fired()).toBe("SEARCHED");
    } finally { page.setDefaultTimeout(30000); }
  });
});

describe("press_key activation (classifyKeyActivation)", () => {
  test("Enter and Space on a focused red button are red; Tab is not an activation", async () => {
    await reset();
    await page.focus("#delete-account");
    expect((await b.classifyKeyActivation("Enter"))?.zone).toBe("red");
    expect((await b.classifyKeyActivation(" "))?.zone).toBe("red");
    expect((await b.classifyKeyActivation("Space"))?.zone).toBe("red");
    expect(await b.classifyKeyActivation("Tab")).toBeNull();
  });
  test("Enter in a field whose form posts to /checkout is red; a search form is not", async () => {
    await page.setContent(`<form action="/checkout"><input id="card"><button>Pay now</button></form>
<form action="/search"><input id="q"><button>Search</button></form>`);
    await page.focus("#card");
    expect((await b.classifyKeyActivation("Enter"))?.zone).toBe("red");
    await page.focus("#q");
    expect((await b.classifyKeyActivation("Enter"))?.zone).toBe("yellow");
  });
  test("Space in a text field is typing, not an activation", async () => {
    await page.setContent(`<form action="/account/close"><input id="why"><button>Close account</button></form>`);
    await page.fill("#why", "delete my account please");
    await page.focus("#why");
    expect(await b.classifyKeyActivation(" ")).toBeNull();
  });
  test("nothing focused: no activation", async () => {
    await page.setContent("<p>hello</p>");
    expect(await b.classifyKeyActivation("Enter")).toBeNull();
  });
});

describe("no false reds from field content or black-zone words", () => {
  test("clicking a search box that holds 'checkout now' proceeds", async () => {
    await page.setContent(`<input id="q" aria-label="Search" onclick="window.__c='Q'">`); await fired();
    await page.fill("#q", "checkout now");
    const r = await b.click("#q", {});
    expect(r.success).toBe(true);
    expect(r.zone).toBe("yellow");
  });
  test("clicking a select whose options read 'Pay with card' proceeds", async () => {
    await page.setContent(`<select id="plan" onclick="window.__c='S'"><option>Pay with card</option><option>Invoice</option></select>`); await fired();
    const r = await b.click("#plan", {});
    expect(r.success).toBe(true);
    expect(r.zone).toBe("yellow");
  });
  test("page text with a black-zone word is not a violation", async () => {
    await page.setContent(`<a id="course" href="#c" onclick="window.__c='COURSE';return false">SQL injection course</a>`); await fired();
    const r = await b.click("#course", {});
    expect(r.success).toBe(true);
    expect(r.zone).toBe("yellow");
    expect(await fired()).toBe("COURSE");
  });
  test("a red label next to a black-zone word is still red", async () => {
    await page.setContent(`<button id="combo" onclick="window.__c='BUY'">Buy now and bypass the queue</button>`); await fired();
    const r = await b.click("#combo", {});
    expect(r.success).toBe(false);
    expect(r.zone).toBe("red");
    expect(await fired()).toBeNull();
  });
});

describe("a container click is judged by the control it lands on", () => {
  const box = (inner: string) => `<!doctype html><html lang="en"><body>
<section id="plans" style="position:relative;width:600px;height:300px"><p style="position:absolute;top:0;margin:0">Simple, transparent pricing for teams of every size. Start free, upgrade when you need more runs, and top up credits whenever you like.</p><div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">${inner}</div></section>
</body></html>`;
  test("clicking a section whose centre is a Buy Credits button is refused", async () => {
    await page.setContent(box(`<button onclick="window.__c='BUY'">Buy Credits</button>`)); await fired();
    const r = await b.click("#plans", {});
    expect(r.success).toBe(false);
    expect(r.zone).toBe("red");
    expect(r.message).toMatch(/click lands on <button> "Buy Credits"/);
    expect(await fired()).toBeNull();
  });
  test("clicking a section whose centre is a benign button proceeds", async () => {
    await page.setContent(box(`<button onclick="window.__c='INFO'">Learn more</button>`)); await fired();
    const r = await b.click("#plans", {});
    expect(r.success).toBe(true);
    expect(r.zone).toBe("yellow");
    expect(await fired()).toBe("INFO");
  });
});

describe("typed text: a newline is Enter, a space is Space", () => {
  const CHECKOUT = `<form action="/checkout" onsubmit="window.__c='PAID';return false"><input id="card" aria-label="Card number"><button>Pay now</button></form>
<button id="del" onclick="window.__c='DELETE'">Delete account</button>`;
  test("a newline typed into a /checkout card field is refused; plain digits are not", async () => {
    await page.setContent(CHECKOUT); await page.focus("#card");
    expect(await b.keystrokeRedZone({ text: "4242424242424242\n" })).toMatch(/^Red zone action requires --force: a newline/);
    expect(await b.keystrokeRedZone({ text: "4242424242424242" })).toBeNull();
    expect(await b.keystrokeRedZone({ text: "4242\n" }, true)).toBeNull();
  });
  test("a space typed while a red button has focus is refused", async () => {
    await page.setContent(CHECKOUT); await page.focus("#del");
    expect(await b.keystrokeRedZone({ text: "x y" })).toMatch(/a space in the typed text would activate <button> "Delete account"/);
    expect(await b.keystrokeRedZone({ key: "Enter" })).toMatch(/Enter would activate <button> "Delete account"/);
  });
});

describe("a card or row is not judged by the controls inside it", () => {
  test("clicking a product card whose Buy button is off-centre proceeds", async () => {
    await page.setContent(`<div id="card" style="position:relative;width:400px;height:300px" onmousedown="window.__c='CARD'">
  <h3 style="margin:0">Grey jacket</h3><p>$49</p>
  <button style="position:absolute;right:0;bottom:0" onclick="window.__c='BUY'">Buy now</button></div>`); await fired();
    const r = await b.click("#card", {});
    expect(r.success).toBe(true);
    expect(r.zone).toBe("yellow");
    expect(await fired()).toBe("CARD");
  });
});
