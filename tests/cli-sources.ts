/**
 * The CLI's source files, for tests that read the CLI's code as text.
 *
 * src/cli.ts was split by command group on 2026-11-20: it is now the entry
 * point only, and the code it held lives under src/cli/ (main.ts, the shared
 * helpers, and one module per command group in src/cli/commands/). A test that
 * read src/cli.ts alone would now read almost nothing, and an assertion that
 * something is ABSENT from it would pass without checking anything.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(import.meta.dir, "..", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** Absolute paths: src/cli.ts, then every .ts file under src/cli/. */
export function cliSourceFiles(): string[] {
  return [join(SRC, "cli.ts"), ...walk(join(SRC, "cli"))];
}

/** Every CLI source file's text, joined with newlines. */
export function cliSourceText(): string {
  return cliSourceFiles().map((f) => readFileSync(f, "utf8")).join("\n");
}
