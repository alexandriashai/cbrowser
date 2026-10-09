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

describe("cross-vendor audit findings (Forge, 2026-10-08)", () => {
  const H = (body: string) => `<!doctype html><html lang="en"><body>${body}<script>
document.addEventListener('submit', e => { window.__c = 'SUBMIT'; e.preventDefault(); }, true);
</script></body></html>`;
  const refused = async (html: string, sel = "#x") => {
    await page.setContent(html); await fired();
    const r = await b.click(sel, {});
    return { success: r.success, zone: r.zone, fired: await fired(), label: r.target?.label };
  };
  test("F3: icon button named by its svg aria-label is refused", async () => {
    const r = await refused(H(`<button id="x" onclick="window.__c='FIRED'"><svg aria-label="Delete account" role="img" width="16" height="16"><rect width="16" height="16"/></svg></button>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("F3: icon button named by an svg <title> is refused", async () => {
    const r = await refused(H(`<button id="x" onclick="window.__c='FIRED'"><svg width="16" height="16"><title>Delete account</title><rect width="16" height="16"/></svg></button>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("F3: an image input named by alt is refused", async () => {
    const r = await refused(H(`<form action="/process"><input id="x" type="image" alt="Place order" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="80" height="30"></form>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("F3: a custom element whose label is in its open shadow root is refused", async () => {
    const r = await refused(H(`<del-btn id="x" style="display:inline-block"></del-btn><script>
customElements.define('del-btn', class extends HTMLElement { connectedCallback() { const s = this.attachShadow({mode:'open'});
s.innerHTML = '<button>Delete account</button>'; s.querySelector('button').onclick = () => { window.__c = 'FIRED'; }; } });</script>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("a checkbox is choosing a value: its label does not make the click red (the submit is judged)", async () => {
    const r = await refused(H(`<input id="x" type="checkbox" onclick="window.__c='FIRED'"><label for="x">Delete all my data</label>`));
    expect(r).toMatchObject({ success: true, zone: "yellow", fired: "FIRED" });
  });
  test("F4: a submit button's formaction overrides a benign form action", async () => {
    const r = await refused(H(`<form action="/settings"><button id="x" formaction="/account/delete">Save</button></form>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("F7: a long div-button with no role is judged by its opening text", async () => {
    const r = await refused(H(`<div id="x" style="cursor:pointer;padding:8px" onmouseup="window.__c='FIRED'">Delete account - this permanently removes your profile, reviews, saved searches and billing history, and it cannot be undone once you confirm it here.</div>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("F2: a container taller than the viewport is judged at the point the click lands", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const r = await refused(H(`<section id="plans" style="height:2400px;position:relative"><p style="margin:0;padding:8px">Plans and pricing for teams of every size, with credits you can top up whenever you need more runs.</p>
<div style="position:absolute;top:300px;left:0;right:0"><button style="width:100%;height:200px" onclick="window.__c='BUY'">Buy now</button></div></section>`), "#plans");
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("F2: a tall benign container still clicks, at the point that was judged", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const r = await refused(H(`<section id="plans" style="height:2400px;position:relative" onclick="window.__c='SECTION'"><p style="margin:0;padding:8px">Plans and pricing for teams of every size, with credits you can top up whenever you need more runs.</p>
<div style="position:absolute;top:1800px;left:0;right:0"><button style="width:100%;height:200px" onclick="event.stopPropagation();window.__c='BUY'">Buy now</button></div></section>`), "#plans");
    expect(r).toMatchObject({ success: true, zone: "yellow", fired: "SECTION" });
  });
  test("F2: a container whose centre is a red button inside a custom element's shadow root is refused", async () => {
    const r = await refused(H(`<section id="plans" style="position:relative;width:600px;height:300px"><p style="margin:0">Simple, transparent pricing for teams of every size. Start free, upgrade when you need more runs, top up whenever.</p>
<buy-btn style="position:absolute;left:200px;top:100px;width:200px;height:100px;display:block"></buy-btn></section><script>
customElements.define('buy-btn', class extends HTMLElement { connectedCallback() { const s = this.attachShadow({mode:'open'});
s.innerHTML = '<button style="width:200px;height:100px">Buy credits</button>'; s.querySelector('button').onclick = () => { window.__c = 'BUY'; }; } });</script>`), "#plans");
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("F5: dragging a red control onto itself is refused; onto something else is not a click", async () => {
    await page.setContent(`<button id="delete-account" onclick="window.__c='DELETE'">Delete account</button><p id="p">elsewhere</p>`);
    expect(await b.dragRedZone("#delete-account", "#delete-account")).toMatch(/^Red zone action requires --force: dragging/);
    expect(await b.dragRedZone("#delete-account", "#p")).toBeNull();
    expect(await b.dragRedZone("#delete-account", "#delete-account", true)).toBeNull();
  });
  test("F1: a coordinate click on a red control is refused; on empty space it is not", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(`<body style="margin:0"><button style="position:absolute;left:0;top:0;width:400px;height:300px" onclick="window.__c='DELETE'">Delete account</button></body>`);
    expect(await b.pointRedZone(200, 150)).toMatch(/click at 200,150 lands on <button> "Delete account"/);
    expect(await b.pointRedZone(900, 600)).toBeNull();
  });
});

describe("F1: the NL test runner's 'click at X, Y' is gated", () => {
  test("a coordinate click on Delete account fails the step and fires nothing", async () => {
    const { parseNLTestSuite, runNLTestSuite } = await import("../src/testing/index.js");
    const hits: string[] = [];
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/fired") { hits.push(u.searchParams.get("what") ?? "?"); return new Response("ok"); }
      return new Response(`<!doctype html><html lang="en"><body style="margin:0"><button style="position:absolute;left:0;top:0;width:400px;height:300px" onclick="fetch('/fired?what=DELETE')">Delete account</button></body></html>`, { headers: { "content-type": "text/html" } });
    } });
    try {
      const suite = parseNLTestSuite(`# coordinate\ngo to http://127.0.0.1:${server.port}/\nclick at 200, 150\nwait 1 second\n`, "coordinate");
      const r: any = await runNLTestSuite(suite, { headless: true, screenshotOnFailure: false });
      const t = r.testResults?.[0] ?? r.tests?.[0];
      expect(t?.passed).toBe(false);
      expect(hits).toEqual([]);
    } finally { server.stop(true); }
  }, 60000);
});

describe("a clickable row is labelled by its own text, not its nested controls", () => {
  test("clicking a row with onclick that contains a Delete account link proceeds", async () => {
    await page.setContent(`<div id="row" onclick="window.__c='ROW'" style="padding:8px;width:600px">Order #1042, shipped March 3 <a href="#" style="margin-left:400px" onclick="event.stopPropagation();window.__c='DEL';return false">Delete account</a></div>`); await fired();
    const r = await b.click("#row", {});
    expect(r.success).toBe(true);
    expect(r.zone).toBe("yellow");
    expect(await fired()).toBe("ROW");
  });
});

describe("cross-vendor re-audit findings (Forge round 5)", () => {
  const H = (body: string, bodyStyle = "margin:0") => `<!doctype html><html lang="en"><body style="${bodyStyle}">${body}</body></html>`;
  const LONG = "Simple, transparent pricing for teams of every size. Start free, upgrade when you need more runs, and top up credits whenever you like.";
  const run = async (html: string, sel = "#x") => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(html); await page.waitForTimeout(50); await fired();
    const r = await b.click(sel, {});
    await page.waitForTimeout(50);
    return { success: r.success, zone: r.zone, fired: await fired() };
  };
  const XBTN = `<script>customElements.define('x-btn', class extends HTMLElement { connectedCallback() { const s = this.attachShadow({mode:'open'});
s.innerHTML = '<button style="width:200px;height:100px"><slot></slot></button>'; s.querySelector('button').onclick = () => { window.__c = 'DELETE'; }; } });</script>`;
  test("W1: a container whose centre is a slotted design-system button is refused", async () => {
    const r = await run(H(`<section id="x" style="position:relative;width:600px;height:300px"><p style="margin:0">${LONG}</p>
<x-btn style="position:absolute;left:200px;top:100px;width:200px;height:100px;display:block">Delete account</x-btn></section>${XBTN}`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("W1: a container whose centre is under a fixed cookie bar is judged beneath the bar", async () => {
    const r = await run(H(`<div style="position:fixed;left:0;top:300px;width:1280px;height:200px;background:#eee;z-index:10">Newsletter: sign up for updates.</div>
<section id="x" style="position:absolute;top:250px;left:0;width:600px;height:300px"><p style="margin:0">${LONG}</p>
<button style="position:absolute;left:200px;top:100px;width:200px;height:100px" onclick="window.__c='BUY'">Buy credits</button></section>`, "margin:0;height:3000px"));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("W1: a container whose centre is a same-origin iframe holding Pay now is refused", async () => {
    const r = await run(H(`<section id="x" style="position:relative;width:600px;height:300px"><p style="margin:0">${LONG}</p>
<iframe style="position:absolute;left:100px;top:50px;width:400px;height:200px;border:0" srcdoc="<body style='margin:0'><button style='width:400px;height:200px' onclick='parent.__c=&quot;PAY&quot;'>Pay now</button></body>"></iframe></section>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("W2: Enter with focus on a red button inside an app shell's shadow root is refused", async () => {
    await page.setContent(H(`<app-root></app-root><script>customElements.define('app-root', class extends HTMLElement { connectedCallback() { const s = this.attachShadow({mode:'open'});
s.innerHTML = '<nav>' + 'Home Products Pricing Docs Blog Careers Support Status Community Partners Changelog Security Privacy Terms Contact '.repeat(2) + '</nav><button id="del">Delete account</button>'; } });</script>`));
    await page.waitForTimeout(50);
    await page.evaluate(() => (document.querySelector("app-root") as any).shadowRoot.querySelector("#del").focus());
    const a = await b.classifyKeyActivation("Enter");
    expect(a?.zone).toBe("red");
    expect(a?.label).toBe("Delete account");
  });
  test("W3: a coordinate click on a red button inside a same-origin iframe is refused", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(H(`<iframe style="position:absolute;left:0;top:0;width:600px;height:400px;border:0" srcdoc="<body style='margin:0'><button style='width:600px;height:400px'>Delete account</button></body>"></iframe>`));
    await page.waitForTimeout(100);
    expect(await b.pointRedZone(200, 150)).toMatch(/lands on <button> "Delete account"/);
  });
  test("W4: dragging a container onto itself whose centre is a red button is refused", async () => {
    await page.setContent(H(`<section id="plans" style="position:relative;width:600px;height:300px"><p style="margin:0">${LONG}</p>
<button style="position:absolute;left:200px;top:100px;width:200px;height:100px">Buy credits</button></section>`));
    expect(await b.dragRedZone("#plans", "#plans")).toMatch(/clicks <button> "Buy credits"/);
  });
  test("W5: a clickable row is not labelled by an icon button inside it", async () => {
    const r = await run(H(`<div id="x" onclick="window.__c='ROW'" style="padding:8px;width:600px">jane@example.com, member since 2021
<button style="margin-left:400px" aria-label="Delete account" onclick="event.stopPropagation();window.__c='DEL'"><svg width="12" height="12"></svg></button></div>`));
    expect(r).toMatchObject({ success: true, zone: "yellow", fired: "ROW" });
  });
  test("W6: clicking a text field is not judged by its label", async () => {
    for (const html of [
      `<label for="x">Purchase order number</label><input id="x" onfocus="window.__c='FOCUS'">`,
      `<label for="x">Buyer email</label><input id="x" type="email" onfocus="window.__c='FOCUS'">`,
      `<input id="x" aria-label="Reason you want to close account" onfocus="window.__c='FOCUS'">`,
    ]) {
      const r = await run(H(html));
      expect(r).toMatchObject({ success: true, zone: "yellow", fired: "FOCUS" });
    }
  });
  test("W7: Space on a focused terms checkbox is choosing a value, not refused", async () => {
    await page.setContent(H(`<input id="tos" type="checkbox"><label for="tos">I agree to the Terms of Service</label>`));
    await page.focus("#tos");
    expect(await b.keystrokeRedZone({ key: " " })).toBeNull();
  });
  test("L1: a <button type=bogus> (an invalid type is a submit button) in a /checkout form is refused", async () => {
    const r = await run(H(`<form action="/checkout" onsubmit="window.__c='PAID';return false"><button id="x" type="bogus">Continue</button></form>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("the resolved element as a leaf is judged by its text even with no affordance: <h1>Checkout</h1> by id is refused", async () => {
    // Deliberate (Forge round 6): refusing an inert heading costs one force retry; missing a listener-only
    // "Delete account" div (React delegates onClick to the root) cannot be undone.
    const r = await run(H(`<h1 id="x">Checkout</h1>`));
    expect(r).toMatchObject({ success: false, zone: "red" });
  });
});

describe("cross-vendor re-audit findings (Forge round 6)", () => {
  const H = (body: string, bodyStyle = "margin:0") => `<!doctype html><html lang="en"><body style="${bodyStyle}">${body}<script>
document.addEventListener('submit', e => { window.__c = 'SUBMIT ' + (e.submitter?.getAttribute('formaction') || e.target.getAttribute('action')); e.preventDefault(); }, true);
</script></body></html>`;
  const LONG = "Simple, transparent pricing for teams of every size. Start free, upgrade when you need more runs, and top up credits whenever you like.";
  const run = async (html: string, sel = "#x") => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(html); await page.waitForTimeout(50); await fired();
    const r = await b.click(sel, {});
    await page.waitForTimeout(50);
    return { success: r.success, zone: r.zone, fired: await fired() };
  };
  test("1: '\\n', '\\r' and 'Shift+\\n' are Enter (Playwright maps them to Enter)", async () => {
    await page.setContent(H(`<button id="del" onclick="window.__c='DELETE'">Delete account</button>
<form action="/checkout"><input id="card" aria-label="Card number"><button>Pay now</button></form>`));
    await page.focus("#del");
    expect((await b.classifyKeyActivation("\n"))?.zone).toBe("red");
    expect((await b.classifyKeyActivation("\r"))?.zone).toBe("red");
    expect(await b.keystrokeRedZone({ key: "\n" })).toMatch(/^Red zone action requires --force/);
    await page.focus("#card");
    expect((await b.classifyKeyActivation("Shift+\n"))?.zone).toBe("red");
  });
  test("2: a container inside an open shadow root is hit-tested in that root", async () => {
    const r = await run(H(`<plans-root id="host"></plans-root><script>customElements.define('plans-root', class extends HTMLElement { connectedCallback() {
const s = this.attachShadow({mode:'open'}); s.innerHTML = '<section id="plans" style="position:relative;width:600px;height:300px"><p style="margin:0">${LONG}</p>'
+ '<button style="position:absolute;left:200px;top:100px;width:200px;height:100px">Buy credits</button></section>';
s.querySelector('button').onclick = () => { window.__c = 'BUY'; }; } });</script>`), "#plans");
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("3: dragging a red button taller than the viewport onto itself is refused", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(H(`<button id="tall" style="height:3000px;width:600px">Delete account</button>`));
    expect(await b.dragRedZone("#tall", "#tall")).toMatch(/^Red zone action requires --force: dragging/);
  });
  test("3: dragging a tall container onto itself whose visible centre is a red button is refused", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(H(`<section id="plans" style="position:relative;width:600px;height:3000px"><p style="margin:0">${LONG}</p>
<button style="position:absolute;left:200px;top:300px;width:200px;height:200px">Buy credits</button></section>`));
    expect(await b.dragRedZone("#plans", "#plans")).toMatch(/clicks <button> "Buy credits"/);
  });
  test("4: role=option is a command, not a choice: a palette's Delete account and Buy annual plan are refused", async () => {
    let r = await run(H(`<div role="listbox"><div role="option" id="x" onclick="window.__c='DELETE'">Delete account</div></div>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
    r = await run(H(`<div role="listbox"><div role="option" id="x" onclick="window.__c='PAID'">Buy annual plan</div></div>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("5: listener-only elements (delegated handler, no affordance) are judged by their own text", async () => {
    const DELEGATE = `<script>document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t) window.__c = t.dataset.act; });</script>`;
    let r = await run(H(`<div id="x" data-act="DELETE">Delete account</div>${DELEGATE}`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
    r = await run(H(`<div data-testid="danger-zone-confirm" data-act="DELETE">Delete account</div>${DELEGATE}`), '[data-testid="danger-zone-confirm"]');
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
    r = await run(H(`<div><span data-act="PAID">Pay now</span></div>${DELEGATE}`), "body > div > span");
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("6: Enter on a combobox follows aria-activedescendant to the highlighted command", async () => {
    await page.setContent(H(`<input id="cmd" role="combobox" aria-activedescendant="opt-del" aria-label="Search commands">
<div role="listbox"><div role="option" id="opt-new">New project</div><div role="option" id="opt-del">Delete account</div></div>`));
    await page.focus("#cmd");
    const a = await b.classifyKeyActivation("Enter");
    expect(a?.zone).toBe("red");
    expect(a?.label).toBe("Delete account");
  });
  test("9: a submitter's formaction replaces the form action: Save draft in a /checkout form proceeds", async () => {
    const r = await run(H(`<form action="/checkout"><button id="x" formaction="/save-draft">Save draft</button></form>`));
    expect(r).toMatchObject({ success: true, zone: "yellow", fired: "SUBMIT /save-draft" });
  });
});

describe("cross-vendor re-audit findings (Forge round 7)", () => {
  const H = (body: string) => `<!doctype html><html lang="en"><body style="margin:0">${body}<script>
document.addEventListener('submit', e => { window.__c = 'SUBMIT ' + e.target.getAttribute('action'); e.preventDefault(); }, true);
document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[data-act]'); if (t) window.__c = t.dataset.act; });
</script></body></html>`;
  const run = async (html: string, sel = "#x") => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(html); await page.waitForTimeout(50); await fired();
    const r = await b.click(sel, {});
    await page.waitForTimeout(50);
    return { success: r.success, zone: r.zone, fired: await fired() };
  };
  test("M1: Enter in a /checkout combobox is judged on the form submit even with an active descendant", async () => {
    await page.setContent(H(`<form action="/checkout"><input id="addr" role="combobox" aria-activedescendant="o1" aria-label="Address">
<ul role="listbox" hidden><li role="option" id="o1">123 Main St</li></ul><button>Place order</button></form>`));
    await page.focus("#addr");
    expect((await b.classifyKeyActivation("Enter"))?.zone).toBe("red");
    expect(await b.keystrokeRedZone({ text: "\n" })).toMatch(/^Red zone action requires --force/);
  });
  test("M1/X2: the active descendant is looked up in the field's own root, never a same-id element elsewhere", async () => {
    await page.setContent(H(`<div id="o1" data-act="DELETE">Delete account</div><cmd-box></cmd-box><script>
customElements.define('cmd-box', class extends HTMLElement { connectedCallback() { const s = this.attachShadow({mode:'open'});
s.innerHTML = '<input id="q" role="combobox" aria-activedescendant="o1" aria-label="Search"><div role="listbox"><div role="option" id="o1">Rename project</div></div>'; } });</script>`));
    await page.waitForTimeout(50);
    await page.evaluate(() => (document.querySelector("cmd-box") as any).shadowRoot.querySelector("#q").focus());
    const a = await b.classifyKeyActivation("Enter");
    expect(a?.zone).not.toBe("red");
  });
  test("M2: <label for> names a button and a submit input", async () => {
    let r = await run(H(`<label for="x">Delete account</label><button id="x" data-act="DELETE"><svg width="12" height="12"></svg></button>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
    r = await run(H(`<form action="/pay"><label for="x">Pay now</label><input id="x" type="submit" value=""></form>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("M3: a clickable row holding a nested control is judged by its own text", async () => {
    let r = await run(H(`<div data-testid="row" data-act="DELETE" style="cursor:pointer;padding:8px"><span>Delete account</span> <button aria-label="More info" onclick="event.stopPropagation()">i</button></div>`), '[data-testid="row"]');
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
    r = await run(H(`<div id="x" data-act="DELETE" style="padding:8px">Delete account <a href="#help" onclick="event.stopPropagation();return false">Help</a></div>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("M4: pointer paths reach a pointer-cursor menu item through its icon, and a listener-only item", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(H(`<div id="item" data-act="DELETE" style="position:absolute;left:0;top:0;width:400px;height:60px;cursor:pointer;display:flex;align-items:center">
<svg id="icon" width="40" height="40"><rect width="40" height="40"/></svg><span>Delete account</span></div>`));
    expect(await b.pointRedZone(20, 30)).toMatch(/^Red zone action requires --force/);
    expect(await b.dragRedZone("#icon", "#icon")).toMatch(/^Red zone action requires --force/);
    const r = await run(H(`<section id="x" style="position:relative;width:600px;height:300px"><p style="margin:0">Account settings and preferences for your workspace, including notifications, billing contacts and profile details.</p>
<div data-act="DELETE" style="position:absolute;left:200px;top:100px;width:200px;height:100px">Delete account</div></section>`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("L1: a contenteditable editor is a text field: clicking or typing into it is not refused", async () => {
    const r = await run(H(`<div id="x" contenteditable="true" style="min-height:40px">Buy milk, eggs and bread</div>`));
    expect(r.success).toBe(true);
    await page.focus("#x");
    expect(await b.keystrokeRedZone({ text: "x\ny" })).toBeNull();
  });
  test("L3: an <img> clicked directly is named by its alt", async () => {
    const r = await run(H(`<img id="x" data-act="DELETE" alt="Delete account" width="40" height="40" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`));
    expect(r).toMatchObject({ success: false, zone: "red", fired: null });
  });
  test("L4: a drag presses the first line of a wrapped inline control", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(H(`<p style="width:200px;margin:0">Some lead-in text before the <span id="w" role="button" data-act="DELETE">Delete account now please</span> and after.</p>`));
    expect(await b.dragRedZone("#w", "#w")).toMatch(/^Red zone action requires --force/);
  });
  test("L6: Enter is not refused when the form's only submit button is disabled", async () => {
    await page.setContent(H(`<form action="/checkout"><input id="card" aria-label="Card"><button disabled>Pay now</button></form>`));
    await page.focus("#card");
    expect((await b.classifyKeyActivation("Enter"))?.zone).not.toBe("red");
  });
});
