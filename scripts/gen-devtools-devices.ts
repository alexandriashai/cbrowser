/**
 * Generate src/device-presets-devtools.ts from Chrome DevTools' device list.
 *
 *   bun scripts/gen-devtools-devices.ts          # fetch the pinned commit
 *   bun scripts/gen-devtools-devices.ts <file>   # use a local copy of it
 *
 * The source is parsed with the TypeScript parser and read as data; nothing in
 * it is executed. To move to a newer list, change SOURCE_COMMIT and
 * SOURCE_SHA256 together and rerun: a file that does not match the pinned hash
 * is refused, so the generated presets always name the exact source they came
 * from.
 *
 * Sizes follow cbrowser's convention (src/devices.ts): the full screen in CSS
 * pixels, which is what DevTools' `screen` records. A device whose default
 * orientation is portrait also gets a "<key>-landscape" entry. "%s" in a user
 * agent is DevTools' placeholder for the Chrome version; it becomes the
 * Chromium version the installed Playwright runs.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { normalizeDeviceName } from "../src/device-names.ts";

const SOURCE_COMMIT = "4c3993d1d327de80acc0b2f12d954c47472c1552";
const SOURCE_SHA256 = "8b4f3c0040758ef09b419162508e40e0a3af06ca214209ea180ba4cd45c7d41c";
const SOURCE_URL = `https://raw.githubusercontent.com/ChromeDevTools/devtools-frontend/${SOURCE_COMMIT}/front_end/models/emulation/EmulatedDevices.ts`;
const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "src", "device-presets-devtools.ts");

type Value = string | number | boolean | Value[] | { [key: string]: Value } | undefined;

/**
 * The file's UIStrings table. Some titles are written
 * `i18nLazyString(UIStrings.laptopWithTouch)` rather than as a literal; the
 * string is read from this table, not by running the call.
 */
const uiStrings = new Map<string, string>();

/** A literal's value; anything that is not a plain literal reads as undefined. */
function valueOf(node: ts.Node): Value {
  if (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "i18nLazyString" &&
    node.arguments.length === 1 && ts.isPropertyAccessExpression(node.arguments[0]) &&
    ts.isIdentifier(node.arguments[0].expression) && node.arguments[0].expression.text === "UIStrings"
  ) {
    return uiStrings.get(node.arguments[0].name.text);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isParenthesizedExpression(node)) return valueOf(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = valueOf(node.left);
    const right = valueOf(node.right);
    return typeof left === "string" && typeof right === "string" ? left + right : undefined;
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(valueOf);
  if (ts.isObjectLiteralExpression(node)) {
    const out: { [key: string]: Value } = {};
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      if (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name)) out[p.name.text] = valueOf(p.initializer);
    }
    return out;
  }
  return undefined;
}

interface Size { width: number; height: number }
const isSize = (v: Value): v is { width: number; height: number } =>
  typeof v === "object" && !Array.isArray(v) && typeof v.width === "number" && typeof v.height === "number" && v.width > 0 && v.height > 0;

async function main(): Promise<void> {
  const localPath = process.argv[2];
  const text = localPath
    ? readFileSync(localPath, "utf8")
    : await (await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30_000) })).text();
  const sha = createHash("sha256").update(text).digest("hex");
  if (sha !== SOURCE_SHA256) {
    throw new Error(`source sha256 ${sha} does not match the pin ${SOURCE_SHA256} (commit ${SOURCE_COMMIT})`);
  }

  const browsers = JSON.parse(readFileSync(join(ROOT, "node_modules", "playwright-core", "browsers.json"), "utf8"));
  const chromium: string = browsers.browsers.find((b: { name: string }) => b.name === "chromium").browserVersion;

  const sf = ts.createSourceFile("EmulatedDevices.ts", text, ts.ScriptTarget.Latest, true);
  const readUiStrings = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "UIStrings" && node.initializer) {
      let init: ts.Expression = node.initializer;
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      const table = valueOf(init);
      if (typeof table === "object" && !Array.isArray(table)) {
        for (const [k, v] of Object.entries(table)) if (typeof v === "string") uiStrings.set(k, v);
      }
    }
    ts.forEachChild(node, readUiStrings);
  };
  readUiStrings(sf);

  // Device objects are the object literals with a screen and capabilities; the
  // per-orientation "modes" objects have a title but no screen. One whose title
  // cannot be read stops the run: a device skipped here would be a name that
  // silently stops resolving.
  const found: { [key: string]: Value }[] = [];
  const unreadable: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const v = valueOf(node) as { [key: string]: Value };
      if (typeof v.screen === "object" && Array.isArray(v.capabilities)) {
        if (typeof v.title === "string" && v.title) found.push(v);
        else unreadable.push(`line ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (unreadable.length > 0) throw new Error(`device entries with no readable title at ${unreadable.join(", ")}`);

  const presets: Record<string, { name: string; userAgent: string; viewport: Size; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean }> = {};
  const add = (key: string, preset: (typeof presets)[string]): void => {
    if (!key) throw new Error(`empty key for "${preset.name}"`);
    if (presets[key]) throw new Error(`two DevTools devices normalise to "${key}"`);
    presets[key] = preset;
  };
  const swap = (s: Size): Size => ({ width: s.height, height: s.width });

  for (const d of found) {
    const title = d.title as string;
    const screen = d.screen as { [key: string]: Value };
    const dpr = screen["device-pixel-ratio"];
    const vertical = isSize(screen.vertical) ? { width: screen.vertical.width, height: screen.vertical.height } : undefined;
    const horizontal = isSize(screen.horizontal) ? { width: screen.horizontal.width, height: screen.horizontal.height } : undefined;
    if (typeof dpr !== "number" || dpr <= 0 || (!vertical && !horizontal)) {
      throw new Error(`"${title}": no usable screen size or pixel ratio`);
    }
    const caps = (d.capabilities as Value[]).filter((c): c is string => typeof c === "string");
    const modes = Array.isArray(d.modes) ? (d.modes as { [key: string]: Value }[]) : [];
    const orientations = new Set(modes.map((m) => m?.orientation));
    const main = modes[0]?.orientation === "horizontal" ? "horizontal" : "vertical";
    const portrait = vertical ?? swap(horizontal!);
    const landscape = horizontal ?? swap(vertical!);
    const base = {
      userAgent: (typeof d["user-agent"] === "string" ? d["user-agent"] : "").replaceAll("%s", chromium),
      deviceScaleFactor: dpr,
      isMobile: caps.includes("mobile"),
      hasTouch: caps.includes("touch"),
    };
    const key = normalizeDeviceName(title);
    add(key, { name: title, ...base, viewport: main === "horizontal" ? landscape : portrait });
    if (main === "vertical" && orientations.has("horizontal")) {
      add(`${key}-landscape`, { name: `${title} landscape`, ...base, viewport: landscape });
    }
  }

  const header = [
    "// GENERATED by scripts/gen-devtools-devices.ts - do not edit by hand.",
    "//",
    "// Source: Chrome DevTools' device list, front_end/models/emulation/EmulatedDevices.ts",
    `// at ChromeDevTools/devtools-frontend@${SOURCE_COMMIT} (sha256 ${SOURCE_SHA256}).`,
    `// "%s" in user agents filled with Chromium ${chromium}, the version the installed Playwright runs.`,
    "// Device data (c) The Chromium Authors, BSD-3-Clause; see THIRD_PARTY_LICENSES.md.",
    "",
    'import type { DeviceDescriptor } from "./types.js";',
    "",
    `export const DEVTOOLS_DEVICES: Record<string, DeviceDescriptor> = ${JSON.stringify(presets, null, 2)};`,
    "",
  ].join("\n");
  writeFileSync(OUT, header);
  console.log(`${Object.keys(presets).length} presets from ${found.length} DevTools devices -> ${OUT}`);
}

await main();
