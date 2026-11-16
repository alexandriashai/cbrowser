/**
 * Release the handles Playwright creates for a console message's arguments.
 *
 * Measured 2026-11-15 on Playwright 1.64.1: with any page.on("console")
 * listener, a page logging a 512 KB string every 20 ms grew the Node heap
 * 475 -> 944 MB in 20 s, because each message's argument JSHandles stay alive
 * for the life of the page; disposing them in the listener held it at about
 * 300 MB, the same as no listener. Nothing in cbrowser reads msg.args(), so
 * every console listener calls this after reading what it needs (text,
 * type, location are not handles and stay readable).
 */
export function releaseConsoleArgs(msg: unknown): void {
  try {
    const args = (msg as { args?: () => Array<{ dispose: () => Promise<void> }> }).args?.() ?? [];
    for (const handle of args) handle.dispose().catch(() => { /* page or context already gone */ });
  } catch { /* a message from a closed page */ }
}
