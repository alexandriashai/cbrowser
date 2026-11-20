/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Page analysis and test generation
 *
 * analyzePage and the tests generated from it.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type {
  ActionZone,
  PageElement,
  PageAnalysis,
  FormAnalysis,
  GeneratedTest,
  TestStep,
  TestGenerationResult,
} from "../types.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Tier 5: AI Test Generation (v5.0.0)
// =========================================================================

export async function generateTests(this: CBrowser, url?: string): Promise<TestGenerationResult> {
  if (url) {
    await this.navigate(url);
  }

  const page = await this.getPage();
  const analysis = await this.analyzePage();
  const tests = this.generateTestScenarios(analysis, await this.clickTargetZones(analysis));

  return {
    url: page.url(),
    analysis,
    tests,
    cbrowserScript: this.generateCBrowserScript(tests, page.url()),
    playwrightCode: this.generatePlaywrightCode(tests, page.url()),
  };
}

export async function clickTargetZones(this: CBrowser, analysis: PageAnalysis): Promise<Map<string, ActionZone>> {
  const zones = new Map<string, ActionZone>();
  const candidates = [
    ...analysis.buttons,
    ...analysis.links,
    ...analysis.forms.map(f => f.submitButton).filter((b): b is PageElement => !!b),
  ].filter(el => !el.hidden && !el.inPage);
  for (const el of candidates) {
    // ignoreBlack throughout: the gate refuses red only, and black words describe an instruction, not a
    // control (the classifyElement rule), so a black match must not mask a red one.
    let zone: ActionZone = zones.get(el.selector) ?? "yellow";
    for (const name of [el.selector, el.text, el.ariaLabel]) {
      if (name) zone = this.maxZone(zone, this.classifyAction("click", name, { ignoreBlack: true }));
    }
    if (!zones.has(el.selector)) {
      const judged = await this.elementZone(el.selector).catch(() => null);
      if (judged) zone = this.maxZone(zone, judged.zone);
    }
    zones.set(el.selector, zone);
  }
  return zones;
}

export async function analyzePage(this: CBrowser): Promise<PageAnalysis> {
  const page = await this.getPage();

  const analysis = await page.evaluate(() => {
    // Values are escaped before they enter a selector. Raw interpolation broke
    // on ids a framework generated rather than a human wrote: `#:r0:` (React 18
    // useId) and `#2fa-code` throw DOMException, and `#a.b` silently matches
    // nothing at all. Priority is ARIA-first to match find_element_by_intent
    // and the documented behaviour; an explicit test hook outranks a generated
    // id, and aria-label outranks both. (2026-07-29)
    const q = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const getSelector = (el: Element): string => {
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return `[aria-label="${q(ariaLabel)}"]`;
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${q(testId)}"]`;
      if (el.id) return `#${CSS.escape(el.id)}`;
      if (el.getAttribute("name")) return `[name="${q(el.getAttribute("name")!)}"]`;
      // Was substring(0, 30) — the same truncation removed from aria-label and
      // visible text elsewhere, still cutting the SELECTOR here, so a generated
      // step said text="Sign up for Pro and get 500 bo" and matched nothing.
      // A selector has to be the whole string to resolve. (2026-07-29)
      const text = el.textContent?.trim().substring(0, 200);
      if (text) return `text="${text}"`;
      return el.tagName.toLowerCase();
    };

    // What a user cannot see, flagged so generate_tests makes no step of it: no box at all (display:none
    // here or on an ancestor, <input type=hidden>), visibility:hidden, a 1-2px box (sr-only), parked
    // off-screen (left:-9999px, top:-40px, translateY(-100%)), or clipped the sr-only way. The clip and
    // class rules are empathy_audit's target exemptions (accessibility-empathy.ts). The generator turned
    // a skip link into "Click Skip to content". (v8 b39, 2026-10-10)
    const srOnly = (el: Element, style: CSSStyleDeclaration): boolean =>
      ((style.position === "absolute" || style.position === "fixed") &&
        (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clip === "rect(1px, 1px, 1px, 1px)" || style.clipPath === "inset(50%)")) ||
      el.classList.contains("sr-only") || el.classList.contains("visually-hidden") || el.classList.contains("screen-reader-text");
    const hiddenFromView = (el: Element): boolean => {
      if (el.getClientRects().length === 0) return true;
      // opacity:0 here or on an ancestor, and content-visibility:hidden, where the engine can say so.
      if (typeof el.checkVisibility === "function" && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return true;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.visibility === "collapse") return true;
      if (style.opacity === "0") return true;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) return true;
      if (rect.right + window.scrollX <= 0 || rect.bottom + window.scrollY <= 0) return true;
      if (srOnly(el, style)) return true;
      // A wrapper hides what it holds: a link inside an sr-only div keeps its own full-size box, and became
      // `click text="Hidden child link"` plus a url assertion; a button at opacity:0 was clicked. So every
      // ancestor is judged too: sr-only (clipped or classed), opacity:0 (for engines without
      // checkVisibility), or a 1-2px box that clips its overflow. display:contents has no box to measure.
      // (v8 b39, 2026-10-10)
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.display === "contents") continue;
        if (srOnly(p, s) || s.opacity === "0") return true;
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const r = p.getBoundingClientRect();
          if (r.width <= 2 || r.height <= 2) return true;
        }
      }
      return false;
    };
    // A link to a fragment of this same page ("#main", "#") scrolls or moves focus; it never navigates.
    const inPageLink = (el: Element): boolean => {
      if (!(el.getAttribute("href") || "").includes("#")) return false;
      try {
        const u = new URL((el as HTMLAnchorElement).href);
        return u.origin + u.pathname + u.search === location.origin + location.pathname + location.search;
      } catch { return false; }
    };
    const visibility = (el: Element) => (hiddenFromView(el) ? { hidden: true } : {});

    // Analyze forms
    const forms: FormAnalysis[] = Array.from(document.querySelectorAll("form")).map(form => {
      const fields: PageElement[] = Array.from(form.querySelectorAll("input, select, textarea")).map(el => ({
        ...visibility(el),
        type: el.tagName.toLowerCase() as PageElement["type"],
        selector: getSelector(el),
        name: el.getAttribute("name") || undefined,
        id: el.id || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        inputType: (el as HTMLInputElement).type || undefined,
        required: (el as HTMLInputElement).required || false,
        ariaLabel: el.getAttribute("aria-label") || undefined,
      }));

      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const submitButton = submitBtn ? {
        ...visibility(submitBtn),
        type: "button" as const,
        selector: getSelector(submitBtn),
        text: submitBtn.textContent?.trim(),
      } : undefined;

      // v11.9.0: Enhanced form purpose detection (issue #89)
      // v14.2.4: Added newsletter, subscription, booking, comment form detection
      let purpose: FormAnalysis["purpose"] = "unknown";
      const formHtml = form.innerHTML.toLowerCase();
      const formClass = (form.className || '').toLowerCase();
      const formId = (form.id || '').toLowerCase();
      const hasPasswordField = !!form.querySelector('input[type="password"]');
      const hasEmailField = !!form.querySelector('input[type="email"]');
      const hasUsernameField = !!form.querySelector('[name*="user" i], [name*="login" i], [placeholder*="user" i], [placeholder*="login" i]');
      const hasSearchField = !!form.querySelector('input[type="search"], [name*="search" i], [placeholder*="search" i], [role="search"]');

      // Login: has password field + (email OR username field) + few fields
      if (hasPasswordField && (hasEmailField || hasUsernameField || formHtml.includes("sign in") || formHtml.includes("log in"))) {
        purpose = fields.length <= 4 ? "login" : "signup";
      } else if (hasPasswordField && formHtml.includes("password") && !formHtml.includes("confirm")) {
        // Single password field with no confirm = likely login
        purpose = fields.length <= 3 ? "login" : "signup";
      } else if (hasSearchField || formHtml.includes("search")) {
        purpose = "search";
      } else if (formHtml.includes("contact") || formHtml.includes("message") || formHtml.includes("feedback") || formHtml.includes("inquiry")) {
        purpose = "contact";
      } else if (formHtml.includes("card") || formHtml.includes("payment") || formHtml.includes("checkout") || formHtml.includes("billing")) {
        purpose = "checkout";
      } else if (formHtml.includes("register") || formHtml.includes("sign up") || formHtml.includes("create account")) {
        purpose = "signup";
      } else if (
        // v14.2.4: Newsletter/subscription detection
        formHtml.includes("newsletter") || formHtml.includes("subscribe") || formHtml.includes("subscription") ||
        formHtml.includes("mailing list") || formHtml.includes("email updates") || formHtml.includes("stay updated") ||
        formClass.includes("newsletter") || formClass.includes("subscribe") ||
        formId.includes("newsletter") || formId.includes("subscribe")
      ) {
        purpose = "newsletter" as FormAnalysis["purpose"];
      } else if (
        // v14.2.4: Comment form detection
        formHtml.includes("comment") || formHtml.includes("reply") || formHtml.includes("leave a comment") ||
        formClass.includes("comment") || formId.includes("comment")
      ) {
        purpose = "comment" as FormAnalysis["purpose"];
      } else if (
        // v14.2.4: Booking/reservation detection
        formHtml.includes("book") || formHtml.includes("reservation") || formHtml.includes("schedule") ||
        formHtml.includes("appointment") || formHtml.includes("check-in") || formHtml.includes("check-out") ||
        form.querySelector('input[type="date"]')
      ) {
        purpose = "booking" as FormAnalysis["purpose"];
      } else if (
        // v14.2.4: Profile/settings form detection
        formHtml.includes("profile") || formHtml.includes("settings") || formHtml.includes("preferences") ||
        formHtml.includes("update your") || formHtml.includes("edit your")
      ) {
        purpose = "profile" as FormAnalysis["purpose"];
      } else if (hasEmailField && fields.length <= 2) {
        // Single email field form is likely newsletter
        purpose = "newsletter" as FormAnalysis["purpose"];
      }

      return {
        action: form.action || undefined,
        method: form.method || undefined,
        fields,
        submitButton,
        purpose,
      };
    });

    // Analyze buttons
    //
    // Capped at 20, and the cap used to be invisible: `buttons: 20` on a page
    // with hundreds is indistinguishable from a page that has exactly 20.
    // /academics reported 20 links against a real 229, and 20 buttons against
    // a real 20 -- the coincidence is what disguised it. Totals are emitted
    // below. (2026-08-03, BUG-16)
    const buttonsTotal = document.querySelectorAll('button, [role="button"], input[type="button"]').length;
    const buttons: PageElement[] = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"]'))
      .slice(0, 20)
      .map(el => ({
        ...visibility(el),
        type: "button" as const,
        selector: getSelector(el),
        text: el.textContent?.trim(),
        id: el.id || undefined,
        ariaLabel: el.getAttribute("aria-label") || undefined,
        dangerStyled: /(^|[^a-z])(destructive|danger)([^a-z]|$)/i.test(
          [el.getAttribute("class"), el.getAttribute("data-variant"), el.getAttribute("data-testid")].filter(Boolean).join(" "),
        ) || undefined,
      }));

    // Analyze links
    const linksTotal = document.querySelectorAll("a[href]").length;
    const links: PageElement[] = Array.from(document.querySelectorAll("a[href]"))
      .slice(0, 20)
      .map(el => ({
        ...visibility(el),
        ...(inPageLink(el) ? { inPage: true } : {}),
        type: "link" as const,
        selector: getSelector(el),
        text: el.textContent?.trim(),
        href: (el as HTMLAnchorElement).href,
      }));

    // Analyze standalone inputs
    const inputs: PageElement[] = Array.from(document.querySelectorAll("input:not(form input), textarea:not(form textarea)"))
      .slice(0, 10)
      .map(el => ({
        type: "input" as const,
        selector: getSelector(el),
        name: el.getAttribute("name") || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        inputType: (el as HTMLInputElement).type || undefined,
      }));

    // Analyze selects
    const selects: PageElement[] = Array.from(document.querySelectorAll("select"))
      .slice(0, 10)
      .map(el => ({
        type: "select" as const,
        selector: getSelector(el),
        name: el.getAttribute("name") || undefined,
        id: el.id || undefined,
      }));

    return {
      url: window.location.href,
      title: document.title,
      forms,
      buttons,
      links,
      // What is really on the page, beside what was returned. Without these a
      // truncated list reads as a measurement. (BUG-16)
      buttonsTotal,
      linksTotal,
      buttonsTruncated: buttonsTotal > buttons.length,
      linksTruncated: linksTotal > links.length,
      inputs,
      selects,
      hasLogin: forms.some(f => f.purpose === "login"),
      hasSearch: forms.some(f => f.purpose === "search") ||
          inputs.some(i => i.inputType === "search") ||
          !!document.querySelector('[role="search"]') ||
          !!document.querySelector('input[placeholder*="search" i], input[placeholder*="Search" i]') ||
          !!document.querySelector('input[aria-label*="search" i], input[aria-label*="Search" i]'),
      hasNavigation: links.filter(l => l.href?.startsWith(window.location.origin)).length > 3,
    };
  });

  return analysis;
}

export function generateTestScenarios(this: CBrowser, analysis: PageAnalysis, zones: Map<string, ActionZone> = new Map()): GeneratedTest[] {
  const tests: GeneratedTest[] = [];
  const isRed = (target: string) =>
    (zones.get(target) ?? this.classifyAction("click", target, { ignoreBlack: true })) === "red";
  const REFUSED = "the click gate refuses it without force: true, and NL test steps never pass force";
  const clickStep = (target: string, description: string): TestStep =>
    isRed(target)
      ? { action: "click", target, description: `${description} (red zone: ${REFUSED})`, zone: "red" }
      : { action: "click", target, description };
  // The first n elements that are not red; each red one passed over is named in notes.
  const notRed = (els: PageElement[], n: number, notes: string[]): PageElement[] => {
    const picked: PageElement[] = [];
    for (const el of els) {
      if (picked.length >= n) break;
      if (el.dangerStyled && !isRed(el.selector)) {
        const note = `Not clicked: "${el.text || el.ariaLabel || el.selector}" (${el.selector}) is styled as a destructive or danger action; confirm it is harmless before adding a click.`;
        notes.push(note.replace(/\s+/g, " "));
        continue;
      }
      if (isRed(el.selector)) {
        // One line: a note is emitted as a comment, and a newline from textContent would end the comment
        // and leave the rest as a script step or as Playwright code.
        const note = `Not clicked: "${el.text || el.ariaLabel || el.selector}" (${el.selector}) is a red-zone control; ${REFUSED}.`;
        notes.push(note.replace(/\s+/g, " "));
        continue;
      }
      picked.push(el);
    }
    return picked;
  };
  // Notes ride on the test they explain; when every candidate was red there is no such test, and they
  // ride on the smoke test instead, so the caller still learns the control exists.
  const unplaced: string[] = [];
  const withNotes = (test: GeneratedTest, notes: string[]): GeneratedTest => (notes.length ? { ...test, notes } : test);
  // A form's submit click, or none. A submit hidden from view is no target: falling back to the bare word
  // made `click Search` and `page.locator('Search')`, which resolve to nothing (6fbeda6 clicked the hidden
  // button itself). The NL dialect has no key press ("press Enter" parses as a click on "Enter"), so there
  // is no Enter step to offer instead: the click is left out and a note says why. A form with no submit
  // button at all keeps the word fallback it had before. (v8 b39, 2026-10-10)
  const submitSteps = (form: FormAnalysis, fallback: string, description: string): TestStep[] =>
    form.submitButton?.hidden ? [] : [clickStep(form.submitButton?.selector || fallback, description)];
  const submitNotes = (form: FormAnalysis): string[] => {
    const btn = form.submitButton;
    if (!btn?.hidden) return [];
    const note = `Not clicked: the form's submit "${btn.text || btn.selector}" (${btn.selector}) is hidden from view, and NL test steps have no key press; submit it by pressing Enter in the last field.`;
    return [note.replace(/\s+/g, " ")];
  };

  // Generate form tests
  for (const form of analysis.forms) {
    // A form whose every field is hidden (a collapsed search drawer) is not one a user can fill.
    const fields = form.fields.filter(f => !f.hidden);
    if (form.fields.length > 0 && fields.length === 0) continue;
    const formNotes = submitNotes(form);

    if (form.purpose === "login") {
      tests.push(withNotes({
        name: "Login Form Submission",
        description: "Test the login form with valid credentials",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to page" },
          ...fields.filter(f => f.inputType !== "submit").map(f => ({
            action: "fill" as const,
            target: f.selector,
            value: f.inputType === "email" ? "test@example.com" : f.inputType === "password" ? "TestPassword123" : "test value",
            description: `Fill ${f.name || f.placeholder || "field"}`,
          })),
          ...submitSteps(form, "Submit", "Submit form"),
          { action: "wait", value: "1000", description: "Wait for response" },
        ],
        assertions: ["url contains '/dashboard' OR url contains '/home'", "page does not contain 'error'"],
      }, formNotes));

      tests.push(withNotes({
        name: "Login Form Validation",
        description: "Test login form with invalid credentials",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to page" },
          { action: "fill", target: fields.find(f => f.inputType === "email")?.selector || "", value: "invalid", description: "Enter invalid email" },
          ...submitSteps(form, "Submit", "Submit form"),
        ],
        assertions: ["page contains 'error' OR page contains 'invalid'"],
      }, formNotes));
    }

    if (form.purpose === "search") {
      tests.push(withNotes({
        name: "Search Functionality",
        description: "Test search with a query",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to page" },
          { action: "fill", target: fields[0]?.selector || "[type='search']", value: "test query", description: "Enter search term" },
          ...submitSteps(form, "Search", "Submit search"),
        ],
        assertions: ["url contains 'search' OR url contains 'q='", "page contains 'result'"],
      }, formNotes));
    }
  }

  // Generate navigation tests
  if (analysis.hasNavigation) {
    // Not a skip link or any other "#fragment" link (it never navigates), nothing a user cannot see, and
    // no red control.
    const navNotes: string[] = [];
    const navLinks = notRed(analysis.links.filter(l =>
      l.href?.startsWith(analysis.url.split("/").slice(0, 3).join("/")) && !l.hidden && !l.inPage), 5, navNotes);
    // Each pass starts again from the page under test, which is "home" only when it is the site root: a
    // page at /account/settings said "Start from home" for every link. (v8 b39, 2026-10-10)
    let startPath = analysis.url;
    try { const u = new URL(analysis.url); startPath = u.pathname + u.search; } catch { /* keep the url */ }
    const startDescription = startPath === "/" ? "Start from home" : `Start from ${startPath}`;
    if (navLinks.length > 0) {
      tests.push(withNotes({
        name: "Navigation Links",
        description: "Test main navigation links work",
        // A same-page link has pathname "/", and `assert url contains '/'` is
        // true of every URL ever produced — a step that always passes is worse
        // than no step, because it reads in the report as verified navigation.
        // Emit the assertion only when the path can actually distinguish the
        // destination from the origin. (2026-07-29)
        steps: navLinks.flatMap(link => {
          let path = "";
          try { path = new URL(link.href || "", analysis.url).pathname; } catch { path = ""; }
          const discriminating = path.length > 1 && path !== new URL(analysis.url).pathname;
          return [
            { action: "navigate" as const, target: analysis.url, description: startDescription },
            { action: "click" as const, target: link.selector, description: `Click ${link.text || "link"}` },
            ...(discriminating
              ? [{ action: "assert" as const, target: `url contains '${path}'`, description: "Verify navigation" }]
              : []),
          ];
        }),
        assertions: ["no console errors"],
      }, navNotes));
    } else {
      unplaced.push(...navNotes);
    }
  }

  // Generate button interaction tests
  const buttonNotes: string[] = [];
  const actionButtons = notRed(analysis.buttons.filter(b =>
    b.text && !b.text.toLowerCase().includes("submit") && b.text.length < 30 && !b.hidden
  ), 3, buttonNotes);
  if (actionButtons.length > 0) {
    tests.push(withNotes({
      name: "Button Interactions",
      description: "Test clickable buttons respond correctly",
      steps: [
        { action: "navigate", target: analysis.url, description: "Navigate to page" },
        ...actionButtons.map(btn => ({
          action: "click" as const,
          target: btn.selector,
          description: `Click "${btn.text}"`,
        })),
      ],
      assertions: ["no console errors", "page is interactive"],
    }, buttonNotes));
  } else {
    unplaced.push(...buttonNotes);
  }

  // Default smoke test
  tests.push(withNotes({
    name: "Page Load Smoke Test",
    description: "Verify page loads without errors",
    steps: [
      { action: "navigate", target: analysis.url, description: "Navigate to page" },
      { action: "assert", target: `title contains '${analysis.title.split(" ")[0]}'`, description: "Verify title" },
    ],
    assertions: ["page loads successfully", "no console errors"],
  }, unplaced));

  return tests;
}

export function generateCBrowserScript(this: CBrowser, tests: GeneratedTest[], url: string): string {
  let script = `# CBrowser Test Script\n# Generated for: ${url}\n# Date: ${new Date().toISOString()}\n\n`;

  for (const test of tests) {
    script += `# ${test.name}\n`;
    script += `# ${test.description}\n`;
    // `//`, not `#`: parseNLTestSuite drops `//` lines, but reads every `#` line as a new test header,
    // so a `#` note would rename the test or split it in two. (v8 b39, 2026-10-10)
    for (const note of test.notes ?? []) {
      script += `// note: ${note}\n`;
    }

    // This must be the dialect src/testing/nl-test-suite.ts PARSES, because the
    // MCP tool tells callers to paste it straight into nl_test_inline. It used
    // to emit a `verb "quoted-arg"` form of its own invention, and every line
    // came back action:"unknown" — `navigate "url"` is not a rule (the rule is
    // `go to <url>`), and wrapping a selector in quotes leaves literal quote
    // characters inside the target, which then nests against selectors like
    // [data-testid="x"]. (2026-07-29)
    for (const step of test.steps) {
      switch (step.action) {
        case "navigate":
          script += `go to ${step.target}\n`;
          break;
        case "click":
          if (step.zone === "red") {
            script += `// red zone: the next click is refused without force: true, and NL test steps never pass force\n`;
          }
          // Unquoted: the parser takes the rest of the line as the target.
          script += `click ${step.target}\n`;
          break;
        case "fill":
          // The parser wants the VALUE quoted and the field bare.
          script += `fill ${step.target} with "${step.value}"\n`;
          break;
        case "assert":
          // step.target is already a predicate, e.g. url contains '/docs/'.
          script += `assert ${step.target}\n`;
          break;
        case "wait":
          script += `wait ${Math.max(1, Math.round(Number(step.value ?? 1000) / 1000))} seconds\n`;
          break;
      }
    }

    // test.assertions are intentions, not executable steps — "no console
    // errors" has no rule, and the grammar has no OR. Emitting them as steps
    // produced unparseable lines, so they ship as comments.
    for (const assertion of test.assertions) {
      script += `# expected: ${assertion}\n`;
    }

    script += "\n";
  }

  return script;
}

export function generatePlaywrightCode(this: CBrowser, tests: GeneratedTest[], url: string): string {
  let code = `// Playwright Test Code\n// Generated for: ${url}\n// Date: ${new Date().toISOString()}\n\n`;
  code += `import { test, expect } from '@playwright/test';\n\n`;

  for (const testDef of tests) {
    const _testName = testDef.name.toLowerCase().replace(/\s+/g, "-");
    code += `test('${testDef.name}', async ({ page }) => {\n`;
    code += `  // ${testDef.description}\n`;
    for (const note of testDef.notes ?? []) {
      code += `  // note: ${note}\n`;
    }
    code += `\n`;

    for (const step of testDef.steps) {
      switch (step.action) {
        case "navigate":
          code += `  await page.goto('${step.target}');\n`;
          break;
        case "click": {
          const click = step.target?.startsWith("text=")
            ? `await page.getByText('${step.target.replace("text=", "").replace(/"/g, "")}').click();`
            : `await page.locator('${step.target}').click();`;
          // Playwright has no zone gate: an exported red click would simply run. It ships commented out.
          // (v8 b39, 2026-10-10)
          code += step.zone === "red"
            ? `  // red zone: cbrowser refuses this click without force; left commented out so this test cannot run it.\n  // ${click}\n`
            : `  ${click}\n`;
          break;
        }
        case "fill":
          code += `  await page.locator('${step.target}').fill('${step.value}');\n`;
          break;
        case "assert":
          if (step.target?.includes("url contains")) {
            const match = step.target.match(/url contains '([^']+)'/);
            if (match) {
              code += `  await expect(page).toHaveURL(/${match[1]}/);\n`;
            }
          } else if (step.target?.includes("title contains")) {
            const match = step.target.match(/title contains '([^']+)'/);
            if (match) {
              code += `  await expect(page).toHaveTitle(/${match[1]}/);\n`;
            }
          }
          break;
        case "wait":
          code += `  await page.waitForTimeout(${step.value});\n`;
          break;
      }
    }

    code += `});\n\n`;
  }

  return code;
}
