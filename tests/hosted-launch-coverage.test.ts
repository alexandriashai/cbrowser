/**
 * Every place src starts or attaches to a browser is known, and the two a
 * hosted call can reach take their proxy from openBrowserRoute.
 *
 * On the hosted server a browser reaches the network only through the egress
 * gate (src/egress-gate.ts), and it gets the gate from one function,
 * openBrowserRoute (src/proxy-forwarder.ts). That holds only while no other
 * code launches a browser of its own. The map of 2026-11-12 found two
 * launches outside CBrowser.launch that a hosted tool reaches, both in
 * src/visual/cross-browser.ts, and nothing would have said so when a third
 * was added.
 *
 * This reads src with the TypeScript compiler, types included, and lists
 * every use of a member named launch, launchPersistentContext, launchServer,
 * connect or connectOverCDP that is not CBrowser's own launch(): called or
 * only referenced, by name or by ["name"], on a Playwright type, on `any`,
 * or behind a cast. Each must be on ALLOWED below with the reason it is no
 * way around the gate, and the reasons are checked against the source too.
 *
 * It also lists every `proxy` that reaches the options of a launch, a
 * context or a page: written there, held in a variable, spread in (also
 * inside a condition), or put on with Object.assign or an assignment. In
 * chromium a proxy given to a context replaces the launch proxy for that
 * context, so one such line would take that context off the gate. The
 * review of 2026-11-12 (launch-wiring-4) added a launch through a member
 * typed Function, a conditional spread and an Object.assign to src and this
 * file still passed; those forms are in the fixture now, and so is a computed
 * key (`{ [k]: ... }`) whose type is "proxy", any string, any or unknown
 * (wiring-3, second review).
 *
 * And it lists every page.goto in src, which on the hosted server must go
 * through the gate's reading (gotoThroughGate in src/browser.ts) or be on
 * GOTO_EXCEPTIONS with a reason (wiring-1, second review).
 *
 * Named limits: a browser binary started with child_process is not seen
 * (there is none today), and neither is code outside this repository that
 * imports launchBrowserWithFallback or the Lightpanda functions from the
 * package. Options are followed through variables, spreads, conditions and
 * Object.assign in the same file; options built by a function call
 * (...makeOptions()) or passed in as a parameter are not. A proxy assigned
 * by a computed key after the object was made (`o[k] = ...`), Reflect.set,
 * Object.defineProperty and Object.fromEntries are not seen. For a goto it
 * checks that the call is handed to the gate's reading in its function, not
 * which page it runs on; a page.reload, goBack or goForward, and a click that
 * navigates, are not gotos and are not listed.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const MEMBERS = new Set(["launch", "launchPersistentContext", "launchServer", "connect", "connectOverCDP"]);
/** Members that take the options a proxy can be passed in. */
const TAKES_PROXY = new Set(["launch", "launchPersistentContext", "launchServer", "newContext", "newPage"]);

/**
 * A launch written the ways the scan must see, in a file that exists only for
 * this test. The engine goes by another name and two brackets are put in by
 * OPEN, so this file does not read as one that launches a browser to
 * tests/ci-runner-config.test.ts, which would take it out of the release gate.
 */
const FIXTURE = join(SRC, "__launch_coverage_fixture__.ts");
const OPEN = "(";
const FIXTURE_TEXT = `
import { chromium as engine, firefox } from "playwright";
import { CBrowser, gotoThroughGate } from "./browser.js";
export async function unlisted(): Promise<void> {
  const typed = await engine.launch();
  const untyped: any = firefox;
  await untyped.launch();
  await engine.launchPersistentContext${OPEN}"dir");
  await engine.launchServer();
  await engine.connectOverCDP("ws://fixture.test");
  await engine.connect("ws://fixture.test");
  await engine["launch"]();
  const { launch } = engine;
  void launch;
  const held = engine.launch;
  void held;
  await (engine as unknown as { launch: () => Promise<unknown> }).launch();
  const viaCBrowser = new CBrowser${OPEN}{});
  await viaCBrowser.launch();
  const timeouts = { connect: 5 };
  void timeouts.connect;
  await typed.newContext({ proxy: { server: "http://127.0.0.1:1" } });
  const options = { proxy: { server: "http://127.0.0.1:1" } };
  await typed.newPage(options);
  const later: { proxy?: unknown } = {};
  later.proxy = { server: "http://127.0.0.1:1" };
  const loose = engine as unknown as { launch: Function };
  await loose.launch({ headless: true });
  const own = Math.random() > 2 ? { server: "http://127.0.0.1:2" } : undefined;
  await typed.newContext({ ...(own ? { proxy: own } : {}) });
  const spread = { proxy: { server: "http://127.0.0.1:3" } };
  await typed.newPage({ viewport: null, ...spread });
  const assigned: Record<string, unknown> = {};
  Object.assign(assigned, { proxy: { server: "http://127.0.0.1:4" } });
  await typed.newPage(assigned);
  await typed.newContext(Object.assign({}, { "proxy": { server: "http://127.0.0.1:5" } }));
  const keyed: Record<string, unknown> = {};
  keyed["proxy"] = { server: "http://127.0.0.1:6" };
  const viaRoute = await openBrowserRouteStandIn();
  await typed.newContext({ ...(viaRoute.proxy ? { proxy: viaRoute.proxy } : {}) });
  const k = "proxy";
  await typed.newContext({ [k]: { server: "http://127.0.0.1:7" } });
  const someKey: string = String(Math.random());
  await typed.newPage({ [someKey]: { server: "http://127.0.0.1:8" } });
  const otherKey = "viewport";
  await typed.newPage({ [otherKey]: null });
  const pg = await typed.newPage();
  await pg.goto("http://fixture.test/bare");
  await gotoThroughGate(null, pg, "http://fixture.test/inline", () => pg.goto("http://fixture.test/inline"));
  const go = () => pg.goto("http://fixture.test/held");
  await viaCBrowser.gotoThroughGate(pg, "http://fixture.test/held", go);
  await go();
  await pg.goto("about:blank");
  const loose2: any = pg;
  await loose2.goto("http://fixture.test/any");
}
declare function openBrowserRouteStandIn(): Promise<{ proxy?: { server: string } }>;
`;

/** One use of a launch or connect member. */
interface Site { file: string; within: string; member: string; node: ts.Node }
/** A proxy handed to a browser or a context somewhere other than through the route. */
interface ProxyUse { file: string; within: string; text: string }

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

const files = sourceFiles(SRC);
const config = ts.parseJsonConfigFileContent(ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile).config, ts.sys, ROOT);
const options: ts.CompilerOptions = { ...config.options, noEmit: true };
const host = ts.createCompilerHost(options, true);
const realFileExists = host.fileExists.bind(host);
const realReadFile = host.readFile.bind(host);
host.fileExists = (name) => name === FIXTURE || realFileExists(name);
host.readFile = (name) => (name === FIXTURE ? FIXTURE_TEXT : realReadFile(name));
const program = ts.createProgram({ rootNames: [...files, FIXTURE], options, host });
const checker = program.getTypeChecker();

const rel = (file: string): string => file.slice(ROOT.length + 1);

/** The outermost named function or method a node sits in: "CBrowser.launch", "crossBrowserDiff", or "(module)". */
function within(node: ts.Node): string {
  let name = "(module)";
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) name = n.name.text;
    else if (ts.isMethodDeclaration(n) && ts.isClassDeclaration(n.parent) && n.parent.name) name = `${n.parent.name.text}.${n.name.getText()}`;
    else if (ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) && ts.isIdentifier(n.name) && ts.isSourceFile(n.parent.parent.parent)) name = n.name.text;
  }
  return name;
}

/** The function or method declaration a site's `within` names. */
function outermost(node: ts.Node): ts.Node {
  let found: ts.Node = node.getSourceFile();
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) && n.name) || (ts.isMethodDeclaration(n) && ts.isClassDeclaration(n.parent))) found = n;
  }
  return found;
}

/** Whether a member's symbol is CBrowser.launch itself, or belongs to the MCP SDK (a server or client connecting to a transport). */
function harmless(symbol: ts.Symbol | undefined): boolean {
  const declarations = symbol?.declarations ?? [];
  if (declarations.length === 0) return false;
  return declarations.every((d) => {
    const file = d.getSourceFile().fileName;
    if (file.includes("/node_modules/@modelcontextprotocol/")) return true;
    return file === join(SRC, "browser.ts") && ts.isMethodDeclaration(d) && ts.isClassDeclaration(d.parent) && d.parent.name?.text === "CBrowser" && d.name.getText() === "launch";
  });
}

/**
 * Could the value at `node` be called? Everything could, except a value whose
 * type is plainly a number, a string, a boolean, a bigint, a symbol, null or
 * undefined. Until 2026-11-12 this asked for a call signature, and a member
 * typed Function (or object, or {}) has none: a launch through
 * `engine as unknown as { launch: Function }` was not a site.
 */
function callable(node: ts.Node): boolean {
  const type = checker.getTypeAtLocation(node);
  const plain = ts.TypeFlags.NumberLike | ts.TypeFlags.StringLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never;
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((t) => (t.flags & plain) === 0);
}

function scan(): { sites: Site[]; proxyUses: ProxyUse[]; scanned: number } {
  const sites: Site[] = [];
  const proxyUses: ProxyUse[] = [];
  let scanned = 0;
  const isObjectAssign = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "assign" && node.expression.expression.getText() === "Object";
  /**
   * The key a property is written under. A computed key counts as "proxy"
   * when its type says it is, or says it could be: the literal "proxy", any
   * string, any or unknown (wiring-3, second review: `{ [k]: ... }` with
   * `const k = "proxy"` passed the scan).
   */
  const keyOf = (name: ts.PropertyName): string => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
    if (!ts.isComputedPropertyName(name)) return "";
    if (ts.isStringLiteralLike(name.expression)) return name.expression.text;
    const type = checker.getTypeAtLocation(name.expression);
    const parts = type.isUnion() ? type.types : [type];
    const couldBeProxy = parts.some((t) =>
      (t.isStringLiteral() && t.value === "proxy") ||
      (t.flags & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0);
    return couldBeProxy ? "proxy" : "";
  };
  /**
   * Every `proxy` property of the object an expression stands for: in the
   * literal itself, in what is spread into it, on either side of a condition,
   * in the variable it names (as that was made), and in what Object.assign
   * puts together. `seen` stops a variable that names itself.
   */
  const proxiesIn = (expression: ts.Expression, out: ts.Node[], seen = new Set<ts.Node>()): ts.Node[] => {
    if (seen.has(expression)) return out;
    seen.add(expression);
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isAwaitExpression(expression) || ts.isTypeAssertionExpression(expression)) {
      proxiesIn(expression.expression, out, seen);
    } else if (ts.isConditionalExpression(expression)) {
      proxiesIn(expression.whenTrue, out, seen);
      proxiesIn(expression.whenFalse, out, seen);
    } else if (ts.isBinaryExpression(expression) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.CommaToken].includes(expression.operatorToken.kind)) {
      proxiesIn(expression.left, out, seen);
      proxiesIn(expression.right, out, seen);
    } else if (ts.isObjectLiteralExpression(expression)) {
      for (const property of expression.properties) {
        if (ts.isSpreadAssignment(property)) proxiesIn(property.expression, out, seen);
        else if ((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && keyOf(property.name) === "proxy") out.push(property);
      }
    } else if (ts.isIdentifier(expression)) {
      const declaration = checker.getSymbolAtLocation(expression)?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) proxiesIn(declaration.initializer, out, seen);
    } else if (isObjectAssign(expression)) {
      for (const argument of expression.arguments) proxiesIn(argument, out, seen);
    }
    return out;
  };
  for (const sf of program.getSourceFiles()) {
    if (!sf.fileName.startsWith(SRC + "/") || sf.isDeclarationFile) continue;
    scanned++;
    const file = rel(sf.fileName);
    const add = (member: string, at: ts.Node, symbolAt: ts.Node, valueAt: ts.Node): void => {
      if (!MEMBERS.has(member) || !callable(valueAt) || harmless(checker.getSymbolAtLocation(symbolAt))) return;
      sites.push({ file, within: within(at), member, node: at });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) add(node.name.text, node, node.name, node);
      else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) add(node.argumentExpression.text, node, node.argumentExpression, node);
      else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
        const key = node.propertyName ?? node.name;
        if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) add(key.text, node, key, node.name);
      }
      // A proxy written into the options of a launch, a context or a page.
      if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))) {
        const member = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ts.isStringLiteralLike(node.expression.argumentExpression) ? node.expression.argumentExpression.text : "";
        if (TAKES_PROXY.has(member) && !(member === "launch" && harmless(checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression.argumentExpression)))) {
          for (const arg of node.arguments) {
            for (const property of proxiesIn(arg, [])) proxyUses.push({ file, within: within(node), text: property.getText() });
          }
        }
      }
      // A proxy put onto an object after it was made: with Object.assign as a
      // statement (as an argument it is read above), or assigned by .proxy or ["proxy"].
      if (isObjectAssign(node) && !(ts.isCallExpression(node.parent) && node.parent.arguments.includes(node))) {
        for (const source of node.arguments.slice(1)) {
          for (const property of proxiesIn(source, [])) proxyUses.push({ file, within: within(node), text: property.getText() });
        }
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && (
        (ts.isPropertyAccessExpression(node.left) && node.left.name.text === "proxy") ||
        (ts.isElementAccessExpression(node.left) && ts.isStringLiteralLike(node.left.argumentExpression) && node.left.argumentExpression.text === "proxy")
      )) {
        proxyUses.push({ file, within: within(node), text: node.getText() });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { sites, proxyUses, scanned };
}

const found = scan();
const FIXTURE_FILE = rel(FIXTURE);
const realSites = found.sites.filter((s) => s.file !== FIXTURE_FILE);

/**
 * One call of a member named goto on a Playwright page or frame, or on a
 * receiver written as any. "gate": the function holding it is handed to
 * gotoThroughGate (the one in src/browser.ts or CBrowser's method) where it
 * is written. "held": it is kept in a variable that is handed to
 * gotoThroughGate in the same function, and `direct` counts the calls of
 * that variable on its own. "about": it opens an about: page, which the gate
 * never sees. "bare": none of these.
 */
interface Goto { file: string; within: string; node: ts.CallExpression; kind: "gate" | "held" | "about" | "bare"; direct: number }

/** Whether a call is to gotoThroughGate as src/browser.ts declares it (the function, or CBrowser's method). */
function callsGateReading(call: ts.CallExpression): boolean {
  const callee = call.expression;
  const name = ts.isIdentifier(callee) ? callee : ts.isPropertyAccessExpression(callee) ? callee.name : undefined;
  if (!name || name.text !== "gotoThroughGate") return false;
  let symbol = checker.getSymbolAtLocation(name);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  const declarations = symbol?.declarations ?? [];
  return declarations.length > 0 && declarations.every((d) => d.getSourceFile().fileName === join(SRC, "browser.ts"));
}

function scanGotos(): Goto[] {
  const out: Goto[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!sf.fileName.startsWith(SRC + "/") || sf.isDeclarationFile) continue;
    const file = rel(sf.fileName);
    const visit = (node: ts.Node): void => {
      ts.forEachChild(node, visit);
      if (!ts.isCallExpression(node)) return;
      const callee = node.expression;
      const member = ts.isPropertyAccessExpression(callee) ? callee.name : ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression) ? callee.argumentExpression : undefined;
      if (!member || member.text !== "goto") return;
      // FluentCBrowser.goto is CBrowser.navigate: not a page's goto.
      const declarations = checker.getSymbolAtLocation(member)?.declarations ?? [];
      if (declarations.length > 0 && declarations.every((d) => d.getSourceFile().fileName.startsWith(SRC + "/"))) return;
      const first = node.arguments[0];
      if (first && ts.isStringLiteralLike(first) && /^about:/i.test(first.text)) {
        out.push({ file, within: within(node), node, kind: "about", direct: 0 });
        return;
      }
      let fn: ts.Node | undefined = node.parent;
      while (fn && !ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn) && !ts.isFunctionDeclaration(fn) && !ts.isMethodDeclaration(fn)) fn = fn.parent;
      let kind: Goto["kind"] = "bare";
      let direct = 0;
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        const parent = fn.parent;
        if (ts.isCallExpression(parent) && parent.arguments.includes(fn as ts.Expression) && callsGateReading(parent)) kind = "gate";
        else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          const held = checker.getSymbolAtLocation(parent.name);
          let handed = false;
          const look = (n: ts.Node): void => {
            if (ts.isIdentifier(n) && n !== parent.name && checker.getSymbolAtLocation(n) === held) {
              if (ts.isCallExpression(n.parent) && n.parent.arguments.includes(n) && callsGateReading(n.parent)) handed = true;
              else if (ts.isCallExpression(n.parent) && n.parent.expression === n) direct++;
            }
            ts.forEachChild(n, look);
          };
          look(outermost(node));
          if (handed) kind = "held";
          else direct = 0;
        }
      }
      out.push({ file, within: within(node), node, kind, direct });
    };
    visit(sf);
  }
  return out;
}

const gotos = scanGotos();
const realGotos = gotos.filter((g) => g.file !== FIXTURE_FILE);

/** Sites as "file | function" -> the members used there, in source order. */
function grouped(sites: Site[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of sites) (out[`${s.file} | ${s.within}`] ??= []).push(s.member);
  return out;
}

/**
 * Every launch or connect in src that is not CBrowser.launch() itself, and
 * why it is no way around the egress gate. A new one fails the test until it
 * is routed through openBrowserRoute or listed here with a reason that holds.
 */
const ALLOWED: Record<string, { members: string[]; reason: string }> = {
  // The start of CBrowser.launch(), which runs one of these at a time.
  "src/browser.ts | CBrowser.startBrowser": {
    members: ["launchPersistentContext", "launch"],
    reason: "the choke point: both take their proxy from openBrowserRoute (checked below)",
  },
  "src/visual/cross-browser.ts | crossBrowserDiff": {
    members: ["launch"],
    reason: "takes its proxy from openBrowserRoute (checked below)",
  },
  "src/visual/cross-browser.ts | checkBrowserAvailability": {
    members: ["launch"],
    reason: "launches each engine and closes it without a context or a page (checked below)",
  },
  "src/browser.ts | launchBrowserWithFallback": {
    members: ["launch", "launch"],
    reason: "no caller in src; exported for library users (checked below)",
  },
  "src/lightpanda.ts | checkLightpandaAvailability": {
    members: ["connectOverCDP"],
    reason: "Lightpanda is reached only from the CLI's --lightpanda (checked below)",
  },
  "src/lightpanda.ts | connectToLightpanda": {
    members: ["connectOverCDP"],
    reason: "Lightpanda is reached only from the CLI's --lightpanda (checked below)",
  },
  "src/lightpanda.ts | launchWithLightpandaFallback": {
    members: ["launch"],
    reason: "Lightpanda is reached only from the CLI's --lightpanda (checked below)",
  },
  "src/cli.ts | main": {
    members: ["launch"],
    reason: "the CLI's step-through mode: a CBrowser written as any, so it is CBrowser.launch (checked below)",
  },
  "src/mcp-server-remote.ts | startRemoteMcpServer": {
    members: ["connect"],
    reason: "an MCP server connecting to an in-memory transport, written behind a cast; not a browser (checked below)",
  },
};

/** The text of every non-test file in src, by path relative to the repository. */
const texts = new Map<string, string>();
for (const sf of program.getSourceFiles()) {
  if (sf.fileName.startsWith(SRC + "/") && !sf.isDeclarationFile && sf.fileName !== FIXTURE) texts.set(rel(sf.fileName), sf.text);
}
const filesMentioning = (pattern: RegExp): string[] => [...texts].filter(([, text]) => pattern.test(text)).map(([file]) => file).sort();

/** The one site in `key`, which must exist. */
function siteIn(key: string, member: string): Site[] {
  return realSites.filter((s) => `${s.file} | ${s.within}` === key && s.member === member);
}

/** The call a site's member is the callee of. */
function callOf(site: Site): ts.CallExpression {
  const parent = site.node.parent;
  if (!ts.isCallExpression(parent) || parent.expression !== site.node) throw new Error(`${site.file}: ${site.member} is not called where it is named`);
  return parent;
}

/** Every call to the function named `name` inside `root`. */
function callsTo(root: ts.Node, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

/**
 * What ties a gated function's launches to the route: the variable holding
 * openBrowserRoute's result, where it is made, and for each launch call the
 * `proxy` it is given, as source text.
 */
function routeUse(key: string, members: string[]): { routeAt: number; route: string; launches: { at: number; proxy: string[]; args: string }[]; guard: number } {
  const sites = members.flatMap((m) => siteIn(key, m));
  expect(sites.length).toBe(members.length);
  const fn = outermost(sites[0].node);
  const routes = callsTo(fn, "openBrowserRoute");
  expect(routes.length).toBe(1);
  // const <route> = await openBrowserRoute(...)
  const declaration = routes[0].parent.parent;
  if (!ts.isAwaitExpression(routes[0].parent) || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)) throw new Error(`${key}: the route is not kept in a variable`);
  const route = declaration.name.text;
  const launches = sites.map((site) => {
    const call = callOf(site);
    const proxy: string[] = [];
    const collect = (node: ts.Node): void => {
      if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name.getText() === "proxy") proxy.push(node.getText());
      // A spread of a variable: read what the variable was made from, one step.
      if (ts.isSpreadAssignment(node) && ts.isIdentifier(node.expression)) {
        const made = checker.getSymbolAtLocation(node.expression)?.valueDeclaration;
        if (made && ts.isVariableDeclaration(made) && made.initializer) collect(made.initializer);
      }
      ts.forEachChild(node, collect);
    };
    for (const arg of call.arguments) collect(arg);
    return { at: call.getStart(), proxy, args: call.arguments.map((a) => a.getText()).join(", ") };
  });
  return { routeAt: routes[0].getStart(), route, launches, guard: callsTo(fn, "webRtcGuard").length };
}

describe("the scan", () => {
  test("reads all of src and finds launches (it cannot pass by finding nothing)", () => {
    expect(found.scanned).toBeGreaterThan(200);
    expect(texts.size).toBe(found.scanned - 1);
    expect(realSites.length).toBeGreaterThanOrEqual(10);
    // The Playwright types resolved: without them every receiver is `any` and everything is a site.
    const typed = realSites.filter((s) => (checker.getSymbolAtLocation((s.node as ts.PropertyAccessExpression).name)?.declarations ?? []).some((d) => d.getSourceFile().fileName.includes("/node_modules/playwright-core/")));
    expect(typed.length).toBeGreaterThanOrEqual(8);
    // CBrowser's own launch() is called all over src and is not a site.
    expect(filesMentioning(/\bawait \w+\.launch\(\)/).length).toBeGreaterThan(15);
    expect(realSites.length).toBeLessThan(20);
  });

  test("sees a launch however it is written, and tells CBrowser.launch() from Playwright's (the fixture)", () => {
    const inFixture = found.sites.filter((s) => s.file === FIXTURE_FILE);
    expect(inFixture.every((s) => s.within === "unlisted")).toBe(true);
    expect(inFixture.map((s) => s.member)).toEqual([
      "launch", // called on Playwright's type
      "launch", // on any
      "launchPersistentContext",
      "launchServer",
      "connectOverCDP",
      "connect",
      "launch", // by ["launch"]
      "launch", // taken off the type by destructuring
      "launch", // held in a variable, not called
      "launch", // behind a cast
      "launch", // behind a cast to a member typed Function, which has no call signature
    ]);
    // viaCBrowser.launch() and the number named connect are not among them: eleven, not thirteen.
    expect(FIXTURE_TEXT).toContain("viaCBrowser.launch()");
    expect(FIXTURE_TEXT).toContain("timeouts.connect");
  });

  test("sees a proxy handed to a launch, a context or a page however it gets there (the fixture)", () => {
    expect(found.proxyUses.filter((p) => p.file === FIXTURE_FILE).map((p) => p.text)).toEqual([
      'proxy: { server: "http://127.0.0.1:1" }', // in newContext's own options
      'proxy: { server: "http://127.0.0.1:1" }', // in a variable passed to newPage
      'later.proxy = { server: "http://127.0.0.1:1" }',
      "proxy: own", // through a conditional spread
      'proxy: { server: "http://127.0.0.1:3" }', // through a spread of a variable
      'proxy: { server: "http://127.0.0.1:4" }', // put on with Object.assign, then passed
      '"proxy": { server: "http://127.0.0.1:5" }', // Object.assign as the argument itself, the key in quotes
      'keyed["proxy"] = { server: "http://127.0.0.1:6" }', // assigned by ["proxy"]
      "proxy: viaRoute.proxy", // the form the two real launches use: reported too, and allowed by name below
      '[k]: { server: "http://127.0.0.1:7" }', // a computed key whose type is the literal "proxy"
      '[someKey]: { server: "http://127.0.0.1:8" }', // a computed key typed string, which could be "proxy"
      // [otherKey] is typed "viewport" and is not reported.
    ]);
  });

  test("sees a page.goto however it is handed to the gate's reading, or not (the fixture)", () => {
    expect(gotos.filter((g) => g.file === FIXTURE_FILE).map((g) => `${g.kind} ${g.direct} ${g.node.arguments[0]?.getText()}`)).toEqual([
      'bare 0 "http://fixture.test/bare"',
      'gate 0 "http://fixture.test/inline"', // the exported gotoThroughGate, given the goto itself
      'held 1 "http://fixture.test/held"', // CBrowser.gotoThroughGate, given a variable that is also called on its own
      'about 0 "about:blank"',
      'bare 0 "http://fixture.test/any"', // on a page written as any
    ]);
  });
});

describe("every browser launch in src", () => {
  test("is on the list, and the list names nothing that is gone", () => {
    const listed = Object.fromEntries(Object.entries(ALLOWED).map(([key, entry]) => [key, entry.members]));
    expect(grouped(realSites)).toEqual(listed);
    for (const entry of Object.values(ALLOWED)) expect(entry.reason.length).toBeGreaterThan(20);
  });

  test("CBrowser.launch gives both of its launches the proxy openBrowserRoute returned, and nothing else", () => {
    const use = routeUse("src/browser.ts | CBrowser.startBrowser", ["launchPersistentContext", "launch"]);
    expect(use.launches.length).toBe(2);
    for (const launch of use.launches) {
      expect(launch.at).toBeGreaterThan(use.routeAt);
      expect(launch.proxy).toEqual([`proxy: ${use.route}.proxy`]);
    }
    expect(use.guard).toBe(1);
  });

  test("crossBrowserDiff gives its launch the proxy openBrowserRoute returned, and nothing else", () => {
    const use = routeUse("src/visual/cross-browser.ts | crossBrowserDiff", ["launch"]);
    expect(use.launches.length).toBe(1);
    expect(use.launches[0].at).toBeGreaterThan(use.routeAt);
    expect(use.launches[0].proxy).toEqual([`proxy: ${use.route}.proxy`]);
    expect(use.guard).toBe(1);
  });

  test("both apply the WebRTC settings webRtcGuard returned: its arguments, firefox's preference and the script", () => {
    for (const [key, members] of [["src/browser.ts | CBrowser.startBrowser", ["launchPersistentContext", "launch"]], ["src/visual/cross-browser.ts | crossBrowserDiff", ["launch"]]] as const) {
      const fn = outermost(siteIn(key, members[0])[0].node);
      const guards = callsTo(fn, "webRtcGuard");
      expect(guards.length).toBe(1);
      const declaration = guards[0].parent;
      if (!ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)) throw new Error(`${key}: the WebRTC settings are not kept in a variable`);
      const name = declaration.name.text;
      const text = fn.getText();
      expect(text).toContain(`${name}.args`);
      expect(text).toContain(`"media.peerconnection.ice.proxy_only": ${name}.firefoxProxyOnly`);
      expect(text.split(`addInitScript(${name}.initScript)`).length - 1).toBe(members.length);
      // Nothing in either still decides these from the configured proxy alone.
      expect(text).not.toContain("NO_WEBRTC_SCRIPT");
      expect(text).not.toContain("force-webrtc-ip-handling-policy");
    }
  });

  test("no launch, context or page is handed a proxy any other way", () => {
    const real = found.proxyUses.filter((p) => p.file !== FIXTURE_FILE).map((p) => `${p.file} | ${p.within} | ${p.text}`).sort();
    expect(real).toEqual([
      // The route's own proxy, once for each of CBrowser's two launches (both spread the same variable in) and once for crossBrowserDiff's.
      // That `route` and `launchRoute` are what openBrowserRoute returned is checked above.
      "src/browser.ts | CBrowser.startBrowser | proxy: route.proxy",
      "src/browser.ts | CBrowser.startBrowser | proxy: route.proxy",
      // Where a geo region becomes the config's proxy, before any browser exists: CBrowser.launch reads it through the route.
      "src/config.ts | mergeConfig | merged.proxy = geoRegionProxy(given.geoRegion)",
      "src/visual/cross-browser.ts | crossBrowserDiff | proxy: launchRoute.proxy",
    ]);
  });

  test("CBrowser.launch runs one start at a time, and close() and forceClose() wait for a start in flight", () => {
    const sf = program.getSourceFile(join(SRC, "browser.ts"))!;
    const methods = new Map<string, string>();
    const visit = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) && ts.isClassDeclaration(node.parent) && node.parent.name?.text === "CBrowser") methods.set(node.name.getText(), node.getText());
      ts.forEachChild(node, visit);
    };
    visit(sf);
    // launch() hands a second caller the launch in flight before it looks for a browser, and is the only caller of startBrowser.
    const launch = methods.get("launch")!;
    expect(launch.indexOf("if (this.launching) return this.launching;")).toBeGreaterThan(0);
    expect(launch.indexOf("if (this.launching) return this.launching;")).toBeLessThan(launch.indexOf("if (this.browser || this.context) return;"));
    expect(launch.indexOf("if (this.browser || this.context) return;")).toBeLessThan(launch.indexOf("this.startBrowser()"));
    expect(sf.text.split("this.startBrowser()").length - 1).toBe(1);
    // Both ways of closing wait before they look at what there is to close.
    for (const name of ["close", "forceClose"]) {
      const body = methods.get(name)!;
      const waits = body.indexOf("await this.startSettled();");
      expect(waits).toBeGreaterThan(0);
      expect(waits).toBeLessThan(body.indexOf("this.page"));
      expect(waits).toBeLessThan(body.indexOf("this.context"));
    }
    // What they wait for is cleared only by the start it belongs to.
    expect(methods.get("startSettled")!).toContain("while (this.starting) await this.starting.catch(");
  });

  test("only openBrowserRoute starts an egress gate or a forwarder", () => {
    const starters: string[] = [];
    for (const sf of program.getSourceFiles()) {
      if (!sf.fileName.startsWith(SRC + "/") || sf.isDeclarationFile || sf.fileName === FIXTURE) continue;
      for (const name of ["startEgressGate", "startProxyForwarder"]) {
        for (const call of callsTo(sf, name)) starters.push(`${rel(sf.fileName)} | ${within(call)} | ${name}`);
      }
    }
    expect(starters.sort()).toEqual([
      "src/proxy-forwarder.ts | openBrowserRoute | startEgressGate",
      "src/proxy-forwarder.ts | openBrowserRoute | startProxyForwarder",
    ]);
  });

  test("openBrowserRoute asks isHostedMode, and on the hosted server returns only the gate or a socks proxy without a bypass list", () => {
    const sf = program.getSourceFile(join(SRC, "proxy-forwarder.ts"))!;
    let fn: ts.FunctionDeclaration | undefined;
    ts.forEachChild(sf, (node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === "openBrowserRoute") fn = node; });
    const text = fn!.getText();
    const hostedPart = text.slice(text.indexOf("process.env[LOOPBACK_SWITCH]"));
    expect(text.indexOf("if (!isHostedMode()) {")).toBeGreaterThan(0);
    expect(text.indexOf("if (!isHostedMode()) {")).toBeLessThan(text.indexOf("process.env[LOOPBACK_SWITCH]"));
    expect(hostedPart).not.toContain("bypass");
    expect(hostedPart).not.toContain("startProxyForwarder");
    expect(hostedPart.split("return {").length - 1).toBe(2);
  });
});

/**
 * Every page.goto in src that can run without the gate's reading, and why
 * that is no way for a hosted caller to get the gate's answer back as a page.
 *
 * On the hosted server a page the gate does not carry reaches the browser as
 * a proxy's answer: over plain http a page holding the gate's refusal, over
 * https an engine's tunnel error. gotoThroughGate (src/browser.ts) turns both
 * into the plain sentence navigate gives. The second review of 2026-11-12
 * (wiring-1) found llms_txt_generate, structured_data_suggest, empathy_audit,
 * chaos_test, the cognitive journey, load_session and manage_tabs calling
 * page.goto on a CBrowser's page themselves, so over http they analysed the
 * gate's refusal as the site. A new goto fails this test until it is handed
 * to gotoThroughGate or listed here with a reason that holds.
 */
const GOTO_EXCEPTIONS: Record<string, { gotos: string[]; reason: string }> = {
  "src/analysis/agent-ready-audit.ts | runAgentReadyAudit": {
    gotos: ["held 1"],
    reason: "runs on its own only on Lightpanda's page, which only the CLI reaches (checked below)",
  },
  "src/analysis/accessibility-empathy.ts | simulateAccessibilityJourney": {
    gotos: ["held 1"],
    reason: "runs on its own only on a page the caller passed in (options.page), which no MCP tool passes (checked below)",
  },
  "src/browser/session-manager.ts | SessionManager.load": {
    gotos: ["held 1"],
    reason: "runs on its own only for a SessionManager used outside CBrowser; CBrowser.loadSession, its one caller in src, passes itself (checked below)",
  },
};

describe("every page.goto in src", () => {
  test("the scan finds them (it cannot pass by finding nothing)", () => {
    expect(realGotos.length).toBeGreaterThanOrEqual(15);
    expect(realGotos.filter((g) => g.kind === "gate").length).toBeGreaterThanOrEqual(10);
  });

  test("is handed to the gate's reading, opens an about: page, or is on the list", () => {
    const unread: Record<string, string[]> = {};
    for (const g of realGotos) {
      if (g.kind === "bare" || (g.kind === "held" && g.direct > 0)) (unread[`${g.file} | ${g.within}`] ??= []).push(`${g.kind} ${g.direct}`);
    }
    expect(unread).toEqual(Object.fromEntries(Object.entries(GOTO_EXCEPTIONS).map(([key, entry]) => [key, entry.gotos])));
    for (const entry of Object.values(GOTO_EXCEPTIONS)) expect(entry.reason.length).toBeGreaterThan(20);
  });

  test("the tools that open a page themselves are among those handed to it", () => {
    const read = new Set(realGotos.filter((g) => g.kind !== "bare" && g.kind !== "about").map((g) => `${g.file} | ${g.within}`));
    for (const key of [
      "src/remediation/llms-txt.ts | extractPageData",
      "src/remediation/structured-data.ts | extractPageSignals",
      "src/analysis/accessibility-empathy.ts | simulateAccessibilityJourney",
      "src/analysis/chaos-testing.ts | runChaosTest",
      "src/cognitive/index.ts | executeAction",
      "src/browser/session-manager.ts | SessionManager.load",
      "src/mcp-tools/base/browser-management-tools.ts | registerBrowserManagementTools",
      "src/browser.ts | CBrowser.navigate",
      "src/browser.ts | CBrowser.restoreSavedPage",
      "src/browser.ts | CBrowser.getPage",
      "src/browser.ts | CBrowser.recoverBrowser",
      "src/visual/cross-browser.ts | crossBrowserDiff",
      "src/analysis/agent-ready-audit.ts | runAgentReadyAudit",
    ]) expect(`${key}: ${read.has(key)}`).toBe(`${key}: true`);
  });

  test("the two listed run on their own only where the reason says", () => {
    const audit = texts.get("src/analysis/agent-ready-audit.ts")!;
    expect(audit.split("ownedCBrowser ? ownedCBrowser.gotoThroughGate(page, url, go) : go()").length - 1).toBe(1);
    // ownedCBrowser is set where the audit makes its own CBrowser, and the Lightpanda branch makes none.
    expect(audit.split("ownedCBrowser = cbrowser;").length - 1).toBe(1);
    const empathy = texts.get("src/analysis/accessibility-empathy.ts")!;
    expect(empathy.split("browser ? browser.gotoThroughGate(page, url, go) : go()").length - 1).toBe(1);
    // simulateAccessibilityJourney is given the CBrowser it made, or null for a page the caller passed in.
    expect(empathy).toContain("browser = new CBrowser");
    // No MCP tool passes a page of its own to runEmpathyAudit.
    const callers: string[] = [];
    for (const sf of program.getSourceFiles()) {
      if (!sf.fileName.startsWith(SRC + "/") || sf.isDeclarationFile || sf.fileName === FIXTURE) continue;
      for (const call of callsTo(sf, "runEmpathyAudit")) callers.push(`${rel(sf.fileName)} | ${/\bpage\b/.test(call.arguments.slice(1).map((a) => a.getText()).join(" "))}`);
    }
    expect(callers.sort()).toEqual(["src/cli.ts | false", "src/mcp-tools/base/audit-tools.ts | false"]);
    // SessionManager.load: one call in src, CBrowser.loadSession's, and it passes the CBrowser.
    const loads = filesMentioning(/sessionManager\.load\(/);
    expect(loads).toEqual(["src/browser.ts"]);
    const browserText = texts.get("src/browser.ts")!;
    expect(browserText.split("sessionManager.load(").length - 1).toBe(1);
    expect(browserText).toContain("this.sessionManager.load(name, page, this.context!, this);");
    expect(texts.get("src/browser/session-manager.ts")!.split("browser ? browser.gotoThroughGate(page, session.url, go) : go()").length - 1).toBe(1);
  });
});

describe("the reasons on the list hold", () => {
  test("checkBrowserAvailability opens no context and no page", () => {
    const site = siteIn("src/visual/cross-browser.ts | checkBrowserAvailability", "launch")[0];
    const body = outermost(site.node).getText();
    expect(body).toContain(".launch(");
    for (const opened of ["newPage", "newContext", "goto", "contexts(", "connect"]) expect(body).not.toContain(opened);
  });

  test("launchBrowserWithFallback is called nowhere in src", () => {
    const uses: string[] = [];
    for (const [file, text] of texts) {
      for (const line of text.split("\n")) if (/\blaunchBrowserWithFallback\b/.test(line)) uses.push(`${file}: ${line.trim().slice(0, 60)}`);
    }
    expect(uses.length).toBe(2);
    expect(uses.some((u) => u.startsWith("src/browser.ts: export async function launchBrowserWithFallback("))).toBe(true);
    expect(uses.some((u) => u.startsWith("src/index.ts: export {"))).toBe(true);
  });

  test("Lightpanda is reached only through useLightpanda, which only the CLI sets", () => {
    expect(filesMentioning(/\buseLightpanda\b/)).toEqual(["src/analysis/agent-ready-audit.ts", "src/cli.ts", "src/types.ts"]);
    expect(filesMentioning(/lightpanda/i).filter((f) => f.startsWith("src/mcp-tools/") || f.startsWith("src/mcp-server"))).toEqual([]);
    // The one caller outside lightpanda.ts, and it sits behind the option.
    expect(filesMentioning(/\b(launchWithLightpandaFallback|connectToLightpanda|checkLightpandaAvailability)\(/)).toEqual(["src/analysis/agent-ready-audit.ts", "src/lightpanda.ts"]);
    const audit = texts.get("src/analysis/agent-ready-audit.ts")!;
    expect(audit.split("launchWithLightpandaFallback(").length - 1).toBe(1);
    const branch = audit.lastIndexOf("} else if (", audit.indexOf("launchWithLightpandaFallback("));
    expect(audit.slice(branch, audit.indexOf("{", branch + 4) + 1)).toBe("} else if (options.useLightpanda && isLightpandaConfigured()) {");
  });

  test("the launch written on `any` in the CLI is a CBrowser's", () => {
    const site = siteIn("src/cli.ts | main", "launch")[0];
    const receiver = (site.node as ts.PropertyAccessExpression).expression.getText();
    expect(receiver).toBe("(stepBrowser as any)");
    expect(outermost(site.node).getText()).toContain(`const stepBrowser = new CBrowser${OPEN}{`);
    // The CLI never turns hosted mode on.
    expect(texts.get("src/cli.ts")!).not.toContain("setHostedMode");
  });

  test("the connect behind a cast is the MCP server's", () => {
    const site = siteIn("src/mcp-server-remote.ts | startRemoteMcpServer", "connect")[0];
    expect((site.node as ts.PropertyAccessExpression).expression.getText()).toBe("(tempServer as unknown as { connect: (t: unknown) => Promise<void> })");
  });
});
