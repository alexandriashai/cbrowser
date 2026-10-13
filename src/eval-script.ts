/**
 * Run a caller's script in a page and return its value: the one compiler behind
 * `cbrowser evaluate`, locally and through the daemon.
 *
 * People write four shapes, and the JavaScript parser - not a regex - tells them
 * apart. Deciding by regex dropped results whenever a function was involved
 * (reported 2026-10-13): a script starting with "function" or holding "=>"
 * anywhere was taken for one callable literal, and a "return" anywhere - even in
 * a nested function - switched off the last-expression value, so
 * `function t(){ return 1 }; t()` threw and `const t = function(){ return 1 }; t()`
 * gave undefined. The daemon path had its own wrapper with the same "return
 * anywhere" test and dropped an IIFE's value.
 *
 * 1. An expression: its value. If that value is the function literal the caller
 *    wrote (its source text is the script), it is called with the arguments, so
 *    `(sel, n) => ...` with --arg still works and `window.getComputedStyle` is
 *    returned, not invoked.
 * 2. Statements with no top-level return: the value of the last statement, as a
 *    REPL gives it, with `args` in scope.
 * 3. Statements with a top-level return: run as a function body (`args` in scope).
 *    A syntax error surfaces from here, which is the error the caller should see.
 *
 * Running the caller's code (new Function, eval) is this tool's purpose, not an
 * injection: it is a red-zone action, refused without force by
 * evaluateScriptRefusal (src/security/script-gate.ts) before this is reached.
 */
import type { Page } from "playwright";

export async function evaluateScript(page: Page, script: string, args: unknown[]): Promise<unknown> {
  return page.evaluate(
    (payload: { src: string; a: unknown[] }) => {
      const src = payload.src;
      type Compiled = (args: unknown[]) => unknown;

      // 1. An expression.
      let expression: Compiled | null = null;
      try {
        expression = new Function("args", `return (${src});`) as Compiled;
      } catch { /* not an expression */ }
      if (expression) {
        const value = expression(payload.a);
        if (typeof value === "function") {
          // Called only when it IS the literal the caller wrote; outer parentheses
          // and a trailing semicolon do not change that.
          const text = Function.prototype.toString.call(value);
          let bare = src.replace(/;\s*$/, "").trim();
          while (bare !== text && bare.startsWith("(") && bare.endsWith(")")) bare = bare.slice(1, -1).trim();
          if (bare === text) return (value as (...a: unknown[]) => unknown)(...payload.a);
        }
        return value;
      }

      // 2 or 3. Statements. A parse-only probe: inside a class static block a
      // top-level `return` is a syntax error and the rest of a script is legal.
      // The probe function is created, never called. The block is strict mode, so
      // sloppy-only code (`arguments`, `with`, `package` as a name) fails it
      // too; a script without the word "return" cannot have a top-level return,
      // so it takes the last-statement path either way.
      let noTopLevelReturn = !/\breturn\b/.test(src);
      if (!noTopLevelReturn) {
        try {
          new Function(`class __cbrowserProbe { static {\n${src}\n} }`);
          noTopLevelReturn = true;
        } catch { /* has a top-level return, or is not valid as plain statements */ }
      }
      if (noTopLevelReturn) {
        // Direct eval inside the function: the completion value of the last
        // statement, with `args` in scope.
        return (new Function("args", `return eval(${JSON.stringify(src)});`) as Compiled)(payload.a);
      }
      return (new Function("args", src) as Compiled)(payload.a);
    },
    { src: script.trim(), a: args },
  );
}
