/**
 * The Dockerfiles install the current cbrowser major on a Playwright base inside
 * the range cbrowser resolves, and install browsers with cbrowser's own
 * Playwright. An outside review (2026-11-21) found Dockerfile on cbrowser@20 and
 * Dockerfile.mcp-demo on a 1.51.1 base, cbrowser@latest, a 16.16.0 version
 * label and `npx playwright install`. Pure: reads files, builds nothing.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string; dependencies: Record<string, string>; files: string[] };
const major = pkg.version.split(".")[0];

describe.each(["Dockerfile", "Dockerfile.mcp-demo"])("%s", (name) => {
  const text = readFileSync(join(ROOT, name), "utf8");

  test("the Playwright base is inside cbrowser's Playwright range", () => {
    const base = /^FROM mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-/m.exec(text);
    expect(base).toBeTruthy();
    expect(Bun.semver.satisfies(base![1], pkg.dependencies.playwright)).toBe(true);
  });

  test("it installs the current major, pinned", () => {
    expect(text).toContain(`npm install -g cbrowser@${major} `);
    expect(text).not.toMatch(/cbrowser@latest/);
  });

  test("browsers come from cbrowser's Playwright, not npx", () => {
    expect(text).not.toMatch(/npx playwright/);
    expect(text).toContain("cbrowser/scripts/install-browsers.cjs");
    expect(pkg.files).toContain("scripts/install-browsers.cjs");
  });

  test("no image version label that disagrees with the package", () => {
    for (const m of text.matchAll(/image\.version="([^"]*)"/g)) expect(m[1]).toBe(pkg.version);
  });
});

test("postinstall uses the same script", () => {
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts as Record<string, string>;
  expect(scripts.postinstall).toContain("scripts/install-browsers.cjs");
  expect(scripts.postinstall).not.toMatch(/npx/);
});
