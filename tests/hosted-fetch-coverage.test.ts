/**
 * No server-side request to a caller's URL leaves a hosted server through
 * the runtime's fetch (P-10, ISC-19).
 *
 * hostedFetch (src/hosted-fetch.ts) is the one place that checks the address
 * a request connects to. This file parses every .ts under src with the
 * TypeScript compiler and collects each use of the global fetch: a call
 * (fetch(...), globalThis.fetch(...)) and any other read of it as a value
 * (const f = fetch, deps.fetch ?? fetch), since a read is a call under
 * another name. Every use must be in ALLOWED, a list of files whose requests
 * go to a destination the operator fixed, with the number of uses in each.
 * A fetch added anywhere else, or one more in a listed file, fails with the
 * file and line, and the answer is hostedFetch unless the destination is
 * one the caller cannot influence.
 *
 * Since the review of 2026-11-12 the scan also looks through what changes a
 * type and not a value (a cast, parentheses, satisfies, a non-null mark),
 * follows other names given to the global object or to hostedFetch, and
 * sees fetch taken out of the global object by destructuring or by
 * Reflect.get. Seventeen such spellings counted as no use at all before.
 * The second review of that day found more, now seen as well: the global
 * object reached through itself (globalThis.globalThis), picked by ?? || &&
 * or ?:, or kept on an object ({ g: globalThis }), and hostedFetch called
 * through a namespace import, .call, .apply or Reflect.apply.
 *
 * What this does not see: a request made without fetch (node:http, node:net,
 * a new dependency), a key put together at run time
 * (globalThis["fe" + "tch"]), an alias destructured out of an object that
 * keeps one (const { g } = o), one returned by a function, and the calls of
 * a bound hostedFetch (the .bind itself is reported). None exists for a caller's URL at the time of
 * writing; the egress gate covers the browser, and proxy-forwarder.ts
 * connects only to a proxy that was pinned.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const SRC = join(import.meta.dir, "..", "src");
const CMS = "the operator's CMS (CMS_URL, else localhost:3200)";

/** Files that may use the runtime's fetch, how many times, and why the destination is not the caller's. */
const ALLOWED: Record<string, { uses: number; reason: string }> = {
  "hosted-fetch.ts": { uses: 2, reason: "hostedFetch itself, on the path taken when hosted mode is off" },
  "mcp-server-remote.ts": { uses: 8, reason: `${CMS}: the credit deduct and the default of the key-validation test seam; validate-key, login and key creation for /authorize and for /token (two each). No Auth0 call since 3840998: a JWT bearer is refused, not looked up` },
  "help-client.ts": { uses: 1, reason: "the operator's help service: CMS_URL, localhost:3200, then cbrowser.ai or CBROWSER_HELP_URL" },
  "mcp-tools/tier-gate.ts": { uses: 1, reason: `${CMS}: usage log` },
  "mcp-tools/credit-refund.ts": { uses: 1, reason: `${CMS}: credit refund` },
  "mcp-tools/account-personas.ts": { uses: 1, reason: `${CMS}: the account's personas` },
  "mcp-tools/persona-lifecycle-tools.ts": { uses: 1, reason: `${CMS}: one persona by its sanitised slug` },
  "mcp-tools/persona-creation-tools.ts": { uses: 1, reason: `${CMS}: save a persona` },
  "mcp-tools/screenshot-utils.ts": { uses: 1, reason: `${CMS}: media upload` },
  "mcp-tools/tool-result-saver.ts": { uses: 1, reason: `${CMS}: tool results` },
  "mcp-tools/visual-report-saver.ts": { uses: 1, reason: `${CMS}: visual reports` },
  "mcp-tools/base/cognitive-tools.ts": { uses: 1, reason: `${CMS}: the account's personas` },
  "mcp-tools/base/chain-values.ts": { uses: 1, reason: `${CMS}: the account's personas` },
  "mcp-tools/base/audit-tools.ts": { uses: 1, reason: `${CMS}: the account's personas` },
  "mcp-tools/base/visual-testing-tools.ts": { uses: 1, reason: `${CMS}: the account's personas` },
  "mcp-tools/base/security-tools.ts": { uses: 1, reason: "security_audit's scan of this server itself at localhost:PORT, taken only when no mcp_url is given" },
  "daemon.ts": { uses: 3, reason: "CLI only: the local daemon on 127.0.0.1" },
  "webhooks.ts": { uses: 1, reason: "CLI only: a webhook URL the operator stored, sent with redirect: error" },
  "cli/commands/testing.ts": { uses: 1, reason: "CLI only: the webhook test" },
  "oauth-signup.ts": { uses: 2, reason: `${CMS}: sign-up while connecting (send-code, verify-code, register)` },
};

/** Where the inventory of 2026-11-12 found a request to a caller's URL, and how many times each file now names hostedFetch for it. */
const MIGRATED: Record<string, number> = {
  "url-resolution.ts": 1,
  "analysis/agent-ready-audit.ts": 2,
  "analysis/webmcp-readiness.ts": 11,
  "llms-txt/validator.ts": 2,
  "llms-txt/diff.ts": 1,
  "mcp-tools/base/security-tools.ts": 2,
  "testing/coverage.ts": 1,
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const GLOBAL_OBJECTS = ["globalThis", "window", "self", "global"];

/** An expression without what changes its type and not its value: a cast, parentheses, satisfies, a non-null mark. */
function unwrap(node: ts.Expression): ts.Expression {
  let e = node;
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
  return e;
}

/** The name of a member read: x.name, x["name"]. Null for anything else, and for a key computed from something else. */
function memberName(e: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e)) {
    const key = unwrap(e.argumentExpression);
    return ts.isStringLiteralLike(key) ? key.text : null;
  }
  return null;
}

const isMember = (e: ts.Expression): e is ts.PropertyAccessExpression | ts.ElementAccessExpression =>
  ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e);

const PICKS = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken]);

/**
 * Every name in a file that stands for one of `roots`: the roots themselves
 * and each variable, parameter or assignment target that is given one of
 * them, to any depth (and an import under another name, when `imports`).
 * Names are taken for the whole file with no regard to scope: one use too
 * many gets read by a person, one too few is never looked at.
 *
 * `stands` says whether an expression is one of them. Besides those names it
 * takes either side of ?? || && and either branch of ?:, and a member read
 * whose name was given one of them anywhere in the file ({ g: globalThis },
 * o.g = globalThis), on whatever object, since an alias can be kept on an
 * object as well as in a variable. A member named after a root is one when
 * `member` is "any" (ns.hostedFetch, through a namespace import), and when
 * it is "chained" only on an object that is one itself (globalThis.globalThis,
 * and not dom.window).
 */
function aliasesOf(sf: ts.SourceFile, roots: readonly string[], imports: boolean, member: "any" | "chained"): { names: Set<string>; stands: (e: ts.Expression) => boolean } {
  const names = new Set(roots);
  const props = new Set<string>();
  const stands = (e: ts.Expression): boolean => {
    const x = unwrap(e);
    if (ts.isIdentifier(x)) return names.has(x.text);
    if (ts.isBinaryExpression(x)) {
      if (PICKS.has(x.operatorToken.kind)) return stands(x.left) || stands(x.right);
      if (x.operatorToken.kind === ts.SyntaxKind.CommaToken) return stands(x.right);
      return false;
    }
    if (ts.isConditionalExpression(x)) return stands(x.whenTrue) || stands(x.whenFalse);
    if (isMember(x)) {
      const name = memberName(x);
      if (name === null) return false;
      if (props.has(name)) return true;
      if (roots.includes(name)) return member === "any" || stands(x.expression);
    }
    return false;
  };
  for (let grew = true; grew; ) {
    grew = false;
    const take = (name: ts.Node): void => {
      if (ts.isIdentifier(name) && !names.has(name.text)) {
        names.add(name.text);
        grew = true;
      }
    };
    const keep = (key: string | null): void => {
      if (key !== null && !props.has(key)) {
        props.add(key);
        grew = true;
      }
    };
    const visit = (node: ts.Node): void => {
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && node.initializer && stands(node.initializer)) take(node.name);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && stands(node.right)) {
        const left = unwrap(node.left);
        if (isMember(left)) keep(memberName(left));
        else take(node.left);
      }
      if (ts.isPropertyAssignment(node) && stands(node.initializer)) keep(keyText(node.name));
      if (ts.isShorthandPropertyAssignment(node) && names.has(node.name.text)) keep(node.name.text);
      if (imports && ts.isImportSpecifier(node) && node.propertyName && names.has(node.propertyName.text)) take(node.name);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { names, stands };
}

/** True when `node` is the name being declared or labelled by its parent, not a read of a value. */
function isName(node: ts.Identifier): boolean {
  const p = node.parent as ts.Node & { name?: ts.Node; propertyName?: ts.Node };
  if (ts.isShorthandPropertyAssignment(p)) return false;
  return p.name === node || p.propertyName === node;
}

/** The text of a property key that is written as a literal: fetch, "fetch", ["fetch"]. Null for a key that is computed from something else. */
function keyText(name: ts.Node | undefined): string | null {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const key = unwrap(name.expression);
    return ts.isStringLiteralLike(key) ? key.text : null;
  }
  return null;
}

/** Every use of the global fetch in one source text: calls, and reads of it as a value. */
export function bareFetchUses(file: string, source: string): Array<{ line: number; kind: "call" | "value" }> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Array<{ line: number; kind: "call" | "value" }> = [];
  const add = (node: ts.Node, called: boolean): void => {
    found.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind: called ? "call" : "value" });
  };
  const globals = aliasesOf(sf, GLOBAL_OBJECTS, false, "chained");
  /** globalThis, or one of its other names, under any cast or parentheses. */
  const isGlobal = (e: ts.Expression | undefined): boolean => e !== undefined && globals.stands(e);
  const isCalled = (node: ts.Node): boolean => ts.isCallExpression(node.parent) && node.parent.expression === node;
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return; // typeof fetch in a type names it, nothing is read
    if (ts.isIdentifier(node) && node.text === "fetch") {
      const p = node.parent;
      if (ts.isPropertyAccessExpression(p) && p.name === node) {
        // x.fetch is some object's own method, unless x is the global object.
        if (isGlobal(p.expression)) add(node, isCalled(p));
      } else if (!isName(node)) {
        add(node, ts.isCallExpression(p) && p.expression === node);
      }
    }
    if (ts.isElementAccessExpression(node) && isGlobal(node.expression)) {
      const key = unwrap(node.argumentExpression);
      if (ts.isStringLiteralLike(key) && key.text === "fetch") add(node, isCalled(node));
    }
    // const { fetch: go } = globalThis, and the same as a parameter's default.
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && keyText(node.propertyName ?? node.name) === "fetch") {
      const owner = node.parent.parent;
      if ((ts.isVariableDeclaration(owner) || ts.isParameter(owner)) && isGlobal(owner.initializer)) add(node, false);
    }
    // ({ fetch: go } = globalThis). The short form, ({ fetch } = globalThis), is counted above as a use of the name.
    if (ts.isPropertyAssignment(node) && keyText(node.name) === "fetch" && ts.isObjectLiteralExpression(node.parent)) {
      let target: ts.Node = node.parent;
      while (ts.isParenthesizedExpression(target.parent)) target = target.parent;
      const assign = target.parent;
      if (ts.isBinaryExpression(assign) && assign.operatorToken.kind === ts.SyntaxKind.EqualsToken && assign.left === target && isGlobal(assign.right)) add(node, false);
    }
    // Reflect.get(globalThis, "fetch")
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "Reflect" && node.expression.name.text === "get" && node.arguments.length >= 2 && isGlobal(node.arguments[0])) {
      const key = unwrap(node.arguments[1]);
      if (ts.isStringLiteralLike(key) && key.text === "fetch") add(node, isCalled(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * Each hostedFetch call that passes an option only a test may pass, or whose
 * options cannot be read. hostedFetch is seen under another name, as a
 * member (a namespace import), and called through .call, .apply or
 * Reflect.apply, where the options are the argument after the URL. A .bind of
 * it is reported as it stands: the calls of what it returns are not followed.
 */
export function testOnlyOptions(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: string[] = [];
  // hostedFetch under another name is still hostedFetch: const hf = hostedFetch, a parameter that defaults to it, an import as.
  const { stands } = aliasesOf(sf, ["hostedFetch"], true, "any");
  const options = (line: number, given: ts.Expression | undefined): void => {
    if (!given) return;
    const arg = unwrap(given);
    if (!ts.isObjectLiteralExpression(arg)) {
      found.push(`${file}:${line} options are not written out`);
      return;
    }
    for (const prop of arg.properties) {
      if (ts.isSpreadAssignment(prop)) found.push(`${file}:${line} options are spread from elsewhere`);
      else {
        const key = keyText(prop.name);
        if (key === null) found.push(`${file}:${line} options have a key that is computed`);
        else if (key === "ca" || key === "policy") found.push(`${file}:${line} passes ${key}`);
      }
    }
  };
  /** The argument list of an apply: the options are its second item. */
  const listed = (line: number, given: ts.Expression | undefined): void => {
    if (!given) return;
    const list = unwrap(given);
    if (!ts.isArrayLiteralExpression(list)) found.push(`${file}:${line} arguments are not written out`);
    else if (list.elements.slice(0, 2).some((e) => ts.isSpreadElement(e))) found.push(`${file}:${line} arguments are spread from elsewhere`);
    else options(line, list.elements[1]);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const callee = unwrap(node.expression);
      if (stands(callee)) options(line, node.arguments[1]);
      else if (isMember(callee) && stands(callee.expression)) {
        const how = memberName(callee);
        if (how === "call") options(line, node.arguments[2]);
        else if (how === "apply") listed(line, node.arguments[1]);
        else if (how === "bind") found.push(`${file}:${line} hostedFetch is bound, and calls of the bound function are not followed`);
      } else if (isMember(callee) && memberName(callee) === "apply" && ts.isIdentifier(unwrap(callee.expression))
        && (unwrap(callee.expression) as ts.Identifier).text === "Reflect" && node.arguments[0] && stands(node.arguments[0])) {
        listed(line, node.arguments[2]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const files = sources(SRC).map((path) => ({ file: relative(SRC, path).split(sep).join("/"), source: readFileSync(path, "utf8") }));

/** The scan's verdict over a set of files: one line per file whose uses differ from ALLOWED. */
function problems(set: Array<{ file: string; source: string }>): string[] {
  const out: string[] = [];
  for (const { file, source } of set) {
    const uses = bareFetchUses(file, source);
    const allowed = ALLOWED[file]?.uses ?? 0;
    if (uses.length !== allowed) {
      out.push(`${file}: ${uses.length} use(s) of the runtime's fetch, ${allowed} allowed: ${uses.map((u) => `${file}:${u.line} (${u.kind})`).join(", ")}`);
    }
  }
  return out;
}

describe("server-side requests on a hosted server (ISC-19)", () => {
  test("the walk reads the source tree and finds the fetches it is meant to allow", () => {
    // Guards against a vacuous pass: an empty walk has no bare fetch either.
    expect(files.length).toBeGreaterThan(100);
    const total = files.reduce((n, f) => n + bareFetchUses(f.file, f.source).length, 0);
    expect(total).toBe(Object.values(ALLOWED).reduce((n, a) => n + a.uses, 0));
    expect(total).toBeGreaterThan(20);
    expect(bareFetchUses("mcp-server-remote.ts", files.find((f) => f.file === "mcp-server-remote.ts")?.source ?? "").some((u) => u.kind === "value")).toBe(true);
    // A listed file that moved or lost its fetch is a stale entry, not a pass.
    const present = new Set(files.map((f) => f.file));
    expect(Object.keys(ALLOWED).filter((file) => !present.has(file))).toEqual([]);
    for (const entry of Object.values(ALLOWED)) expect(entry.reason.length).toBeGreaterThan(10);
  });

  test("every use of the runtime's fetch in src is in a listed file, the listed number of times", () => {
    expect(problems(files)).toEqual([]);
  });

  test("every request the inventory found going to a caller's URL names hostedFetch", () => {
    const counts: Record<string, number> = {};
    for (const { file, source } of files) {
      if (!(file in MIGRATED)) continue;
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
      let n = 0;
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && node.text === "hostedFetch" && !ts.isImportSpecifier(node.parent)) n++;
        ts.forEachChild(node, visit);
      };
      visit(sf);
      counts[file] = n;
    }
    expect(counts).toEqual(MIGRATED);
  });

  test("no call in src passes hostedFetch an option that is for tests (ca, policy)", () => {
    const offenders = files.filter((f) => f.file !== "hosted-fetch.ts").flatMap((f) => testOnlyOptions(f.file, f.source));
    expect(offenders).toEqual([]);
    expect(files.filter((f) => /\bhostedFetch\(/.test(f.source)).length).toBeGreaterThanOrEqual(6);
  });
});

describe("the scan goes red when it should (absence tests of the test)", () => {
  const clean = files.find((f) => f.file === "llms-txt/diff.ts");
  const listed = files.find((f) => f.file === "mcp-tools/credit-refund.ts");
  if (!clean || !listed) throw new Error("the files the absence tests tamper with are gone");

  // Every file in src is a module, and only in a module is a top-level
  // "await (x as any).fetch(u)" an await: in a script the compiler reads it
  // as a call of a function named await. The samples are parsed as src is.
  const asModule = (code: string): string => `${code}\nexport {};`;

  test("a fetch put back in a migrated file is reported with its file and line", () => {
    expect(bareFetchUses(clean.file, clean.source)).toEqual([]);
    const marker = "const response = await hostedFetch(fetchUrl);";
    expect(clean.source).toContain(marker);
    const tampered = clean.source.replace(marker, "const response = await fetch(fetchUrl);");
    const line = clean.source.slice(0, clean.source.indexOf(marker)).split("\n").length;
    const found = problems([{ file: clean.file, source: tampered }]);
    expect(found).toEqual([`llms-txt/diff.ts: 1 use(s) of the runtime's fetch, 0 allowed: llms-txt/diff.ts:${line} (call)`]);
  });

  test("one more fetch in a listed file is reported too", () => {
    expect(problems([listed])).toEqual([]);
    const found = problems([{ file: listed.file, source: `${listed.source}\nexport const extra = () => fetch("http://caller.test/");\n` }]);
    expect(found.length).toBe(1);
    expect(found[0]).toContain("mcp-tools/credit-refund.ts: 2 use(s) of the runtime's fetch, 1 allowed");
  });

  test("the other spellings are seen: the global object, an index, an alias, a default, a shorthand, a cast, a destructuring, another name for the global object", () => {
    const spellings = [
      "await globalThis.fetch(u);",
      'await globalThis["fetch"](u);',
      "const go = fetch; await go(u);",
      "const go = deps.fetch ?? fetch;",
      "function f(impl: typeof fetch = fetch) { return impl; }",
      "const deps = { fetch };",
      "const deps = { doFetch: fetch };",
      "void window.fetch;",
      // Reached through something that changes the type and not the value.
      "await (globalThis as any).fetch(u);",
      "await (globalThis).fetch(u);",
      "await (globalThis satisfies object).fetch(u);",
      "await globalThis!.fetch(u);",
      'await (globalThis as any)["fetch"](u);',
      'await globalThis[("fetch")](u);',
      // Taken out of the global object by destructuring.
      "const { fetch: go } = globalThis; await go(u);",
      "const { fetch: go } = globalThis as any; await go(u);",
      'const { ["fetch"]: go } = globalThis; await go(u);',
      "let go; ({ fetch: go } = globalThis); await go(u);",
      "function f({ fetch: go } = globalThis) { return go; }",
      // Through another name for the global object.
      "const g = globalThis; await g.fetch(u);",
      "const g = globalThis as any; const h = g; await h.fetch(u);",
      "let g; g = window; await g.fetch(u);",
      'const g = globalThis; await g["fetch"](u);',
      "const g = globalThis; const { fetch: go } = g; await go(u);",
      // The other name is given further down the file than the place that passes it on.
      "function f() { const h = g; return h.fetch(u); }\nconst g = globalThis;",
      'await Reflect.get(globalThis, "fetch")(u);',
      // Fix review of 2026-11-12 (fetch-2): the global object reached through
      // itself, through ?? || && and ?:, and kept on an object.
      "await globalThis.globalThis.fetch(u);",
      "await window.self.fetch(u);",
      'await globalThis["globalThis"].fetch(u);',
      "const g = globalThis ?? null; await g.fetch(u);",
      "const g = other || globalThis; await g.fetch(u);",
      "const g = ok && globalThis; await g.fetch(u);",
      "const g = cond ? globalThis : other; await g.fetch(u);",
      "await (cond ? other : globalThis).fetch(u);",
      "await (globalThis ?? other).fetch(u);",
      "const o = { g: globalThis }; await o.g.fetch(u);",
      'const o = { "g": globalThis }; await o["g"].fetch(u);',
      "const o = { globalThis }; await o.globalThis.fetch(u);",
      "const o: any = {}; o.g = globalThis; await o.g.fetch(u);",
      "const o = { inner: { g: globalThis } }; await o.inner.g.fetch(u);",
    ];
    // Every spelling that is not seen once, so that a failure lists them all.
    expect(spellings.filter((code) => bareFetchUses("x.ts", asModule(code)).length !== 1)).toEqual([]);
    // Destructured under its own name it is two uses: the read out of the global object, and the call.
    expect(bareFetchUses("x.ts", "const { fetch } = globalThis; await fetch(u);").map((u) => u.kind)).toEqual(["value", "call"]);
    expect(bareFetchUses("x.ts", "let fetch; ({ fetch } = globalThis);").length).toBe(1);
  });

  test("what is not the runtime's fetch is left alone", () => {
    const harmless = [
      "await client.fetch(u);",
      "await this.fetch(u);",
      "type F = typeof fetch;",
      "interface Deps { fetch?: typeof fetch }",
      "const deps = { fetch: other };",
      "class A { fetch(u: string) { return u; } }",
      'const text = "await fetch(url)"; // fetch(url)',
      "await hostedFetch(u);",
      "import { fetch as f } from './x.js';",
      // The same spellings on an object that is not the global one.
      "await (client as any).fetch(u);",
      "await client!.fetch(u);",
      'await (client as any)["fetch"](u);',
      "const { fetch: go } = client; await go(u);",
      "let go; ({ fetch: go } = client); await go(u);",
      "function f({ fetch: go } = client) { return go; }",
      "const g = client; await g.fetch(u);",
      'await Reflect.get(client, "fetch")(u);',
      'await Reflect.get(globalThis, "location");',
      "const g = globalThis; void g.location; void g.fetcher;",
      // A property of some other object that happens to share a global object's name.
      "await dom.window.fetch(u);",
      "await other.globalThis.fetch(u);",
      "const g = other ?? client; await g.fetch(u);",
      "const o = { g: client }; await o.g.fetch(u);",
    ];
    expect(harmless.filter((code) => bareFetchUses("x.ts", asModule(code)).length !== 0)).toEqual([]);
  });

  test("a test-only option at a call site is reported, and written-out options without one are not", () => {
    expect(testOnlyOptions("x.ts", "await hostedFetch(u, { method: 'HEAD', ca: pem });")).toEqual(["x.ts:1 passes ca"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch(u, { policy: { allow: () => true } } as RequestInit);")).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch(u, { ...options });")).toEqual(["x.ts:1 options are spread from elsewhere"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch(u, options);")).toEqual(["x.ts:1 options are not written out"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch(u, { method: 'POST', headers, body, signal: controller.signal });\nawait hostedFetch(u);")).toEqual([]);
  });

  test("a test-only option is seen under a computed key, and when hostedFetch goes by another name", () => {
    expect(testOnlyOptions("x.ts", 'await hostedFetch(u, { ["policy"]: p });')).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch(u, { [`ca`]: pem });")).toEqual(["x.ts:1 passes ca"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch(u, { [key]: p });")).toEqual(["x.ts:1 options have a key that is computed"]);
    expect(testOnlyOptions("x.ts", "const hf = hostedFetch; await hf(u, { policy: p });")).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", "const hf = hostedFetch as typeof fetch;\nconst again = hf;\nawait again(u, { ca: pem });")).toEqual(["x.ts:3 passes ca"]);
    expect(testOnlyOptions("x.ts", "let hf; hf = hostedFetch; await hf(u, options);")).toEqual(["x.ts:1 options are not written out"]);
    expect(testOnlyOptions("x.ts", "import { hostedFetch as hf } from './hosted-fetch.js';\nawait hf(u, { ca: pem });")).toEqual(["x.ts:2 passes ca"]);
    expect(testOnlyOptions("x.ts", "async function f(impl = hostedFetch) { return impl(u, { policy: p }); }")).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", asModule("await (hostedFetch as any)(u, { policy: p });"))).toEqual(["x.ts:1 passes policy"]);
    // Another function under those names, and written-out options with no test-only key, are left alone.
    expect(testOnlyOptions("x.ts", "const hf = other; await hf(u, { policy: p });")).toEqual([]);
    expect(testOnlyOptions("x.ts", "const hf = hostedFetch; await hf(u, { method: 'HEAD', ['redirect']: 'manual' });")).toEqual([]);
  });

  test("a test-only option is seen through a namespace import, .call, .apply, Reflect.apply, and an alias kept on an object", () => {
    // Fix review of 2026-11-12 (fetch-2): each of these returned nothing before.
    expect(testOnlyOptions("x.ts", "import * as hf from './hosted-fetch.js';\nawait hf.hostedFetch(u, { policy: p });")).toEqual(["x.ts:2 passes policy"]);
    expect(testOnlyOptions("x.ts", 'await hf["hostedFetch"](u, { ca: pem });')).toEqual(["x.ts:1 passes ca"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch.call(null, u, { policy: p });")).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", "await hf.hostedFetch.call(undefined, u, { ca: pem });")).toEqual(["x.ts:1 passes ca"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch.apply(null, [u, { ca: pem }]);")).toEqual(["x.ts:1 passes ca"]);
    expect(testOnlyOptions("x.ts", 'await hostedFetch["apply"](null, [u, { policy: p }]);')).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", "await Reflect.apply(hostedFetch, null, [u, { policy: p }]);")).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch.call(null, u, options);")).toEqual(["x.ts:1 options are not written out"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch.apply(null, args);")).toEqual(["x.ts:1 arguments are not written out"]);
    expect(testOnlyOptions("x.ts", "await hostedFetch.apply(null, [...args]);")).toEqual(["x.ts:1 arguments are spread from elsewhere"]);
    expect(testOnlyOptions("x.ts", "await Reflect.apply(hostedFetch, null, args);")).toEqual(["x.ts:1 arguments are not written out"]);
    expect(testOnlyOptions("x.ts", "const bound = hostedFetch.bind(null);")).toEqual(["x.ts:1 hostedFetch is bound, and calls of the bound function are not followed"]);
    expect(testOnlyOptions("x.ts", "const o = { hf: hostedFetch }; await o.hf(u, { policy: p });")).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", "const hf = cond ? hostedFetch : other; await hf(u, { policy: p });")).toEqual(["x.ts:1 passes policy"]);
    expect(testOnlyOptions("x.ts", "const hf = ns.hostedFetch; await hf(u, { ca: pem });")).toEqual(["x.ts:1 passes ca"]);
    // The same calls with no test-only option, and .call or .apply of something else, are left alone.
    expect(testOnlyOptions("x.ts", "await hf.hostedFetch(u, { method: 'HEAD' });\nawait hostedFetch.call(null, u);\nawait hostedFetch.apply(null, [u, { redirect: 'manual' }]);\nawait hostedFetch.apply(null, [u]);")).toEqual([]);
    expect(testOnlyOptions("x.ts", "await other.call(null, u, { policy: p });\nawait other.apply(null, [u, { ca: pem }]);\nawait Reflect.apply(other, null, [u, { policy: p }]);")).toEqual([]);
  });
});
