/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Finding, measuring and killing the processes of one hosted browser session.
 *
 * WHY THIS EXISTS
 *
 * The hosted server's per-session memory limit and its force-kill of a browser
 * whose close() hangs both read the Chromium pid through browser.process(),
 * which a Playwright Browser does not have (only BrowserServer and
 * ElectronApplication do, measured on 1.64.1). So the limit never fired and
 * the kill never ran (audit F-22, leaks-live-3, leaks-live-6). The reapers that
 * tried to make up for it killed by process NAME, host-wide, which took other
 * sessions' and other programs' browsers with them.
 *
 * HOW A SESSION'S PROCESSES ARE FOUND
 *
 * 1. The main pid comes from Playwright's in-process connection: the client
 *    Browser maps to the server-side object, whose launch options hold the
 *    spawned ChildProcess. This is the same route Playwright's own
 *    ElectronApplication.process() takes (connection.toImpl). It is internal,
 *    so every read is guarded and a missing piece yields undefined; the browser
 *    test for this file fails if a Playwright upgrade removes it.
 * 2. The pid is only trusted when /proc says it is a DIRECT CHILD of this
 *    process. Its --user-data-dir (a fresh temporary directory per launch) is
 *    then recorded as the session's identity, so a pid reused later by an
 *    unrelated program can never match.
 * 3. A session's tree is: every direct child of this process whose command
 *    line names one of the session's recorded user-data-dirs, plus all their
 *    descendants. Renderers, the GPU process and the zygotes do not carry the
 *    user-data-dir, so they are found through their parents.
 *
 * Nothing here ever selects a process by name, and nothing outside this
 * process's own children (and their descendants) can be reached, so another
 * session, another server or another user's browser is never touched.
 *
 * Linux only (/proc). Elsewhere every function returns empty results, and the
 * callers treat that as "unknown", which is the old behaviour.
 */

import { readdirSync, readFileSync } from "node:fs";

export interface ProcEntry {
  pid: number;
  ppid: number;
  /** The state letter from stat: R, S, D, T (stopped), Z (zombie), ... */
  state: string;
  /** The command line with NUL separators turned into spaces. Chromium rewrites its own argv (setproctitle), so it cannot be split reliably. */
  cmdline: string;
}

/** One reading of /proc: pid -> parent and command line. Processes that vanish while reading are skipped. */
export function readProcTable(procRoot = "/proc"): Map<number, ProcEntry> {
  const table = new Map<number, ProcEntry>();
  let names: string[];
  try {
    names = readdirSync(procRoot);
  } catch {
    return table;
  }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`${procRoot}/${name}/stat`, "utf8");
      // comm sits in parentheses and may itself hold spaces or parentheses,
      // so the fields are read from after the LAST closing parenthesis.
      const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const state = rest[0];
      const ppid = Number(rest[1]);
      const cmdline = readFileSync(`${procRoot}/${name}/cmdline`, "utf8").replace(/\0/g, " ").trim();
      table.set(Number(name), { pid: Number(name), ppid, state, cmdline });
    } catch {
      // exited between readdir and read
    }
  }
  return table;
}

/** The value of --user-data-dir in a command line, or undefined. */
export function userDataDirOf(cmdline: string): string | undefined {
  const m = cmdline.match(/(?:^|\s)--user-data-dir=(\S+)/);
  return m ? m[1] : undefined;
}

type Impl = { options?: { browserProcess?: { process?: { pid?: number } } }; _browser?: Impl };
type WithConnection = { _connection?: { toImpl?: (x: unknown) => unknown } };

function implOf(obj: unknown): Impl | undefined {
  try {
    const conn = (obj as WithConnection | null)?._connection;
    const impl = conn?.toImpl?.(obj);
    return impl && typeof impl === "object" ? impl as Impl : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The pid of the Chromium main process behind a CBrowser, or undefined when it
 * has not launched, has closed, or Playwright no longer exposes the handle.
 * Works for a launched browser and for a persistent context.
 */
export function browserMainPid(cbrowser: unknown): number | undefined {
  try {
    const inner = cbrowser as { browser?: unknown; context?: unknown } | null;
    if (inner?.browser) {
      const pid = implOf(inner.browser)?.options?.browserProcess?.process?.pid;
      if (typeof pid === "number") return pid;
    }
    if (inner?.context) {
      const pid = implOf(inner.context)?._browser?.options?.browserProcess?.process?.pid;
      if (typeof pid === "number") return pid;
    }
  } catch {
    // fall through: unknown
  }
  return undefined;
}

/** True when the CBrowser currently holds a launched browser or context. */
export function hasLaunched(cbrowser: unknown): boolean {
  const inner = cbrowser as { browser?: unknown; context?: unknown } | null;
  return Boolean(inner?.browser || inner?.context);
}

/**
 * The user-data-dir of `cbrowser`'s main process, only when that process is a
 * direct child of `ownerPid`. This is the identity a session records.
 */
export function browserIdentity(
  cbrowser: unknown,
  table: Map<number, ProcEntry>,
  ownerPid: number = process.pid,
): string | undefined {
  const pid = browserMainPid(cbrowser);
  if (pid === undefined) return undefined;
  const entry = table.get(pid);
  if (!entry || entry.ppid !== ownerPid) return undefined;
  return userDataDirOf(entry.cmdline);
}

function cmdlineNamesDir(cmdline: string, dirs: ReadonlySet<string>): boolean {
  const dir = userDataDirOf(cmdline);
  return dir !== undefined && dirs.has(dir);
}

/**
 * Every process of a session: the direct children of `ownerPid` whose
 * user-data-dir is one of `dirs`, and all of their descendants. Main
 * processes first. Zombies are left out: they have already exited and only
 * wait for their parent to collect them, so there is nothing left to kill.
 */
export function sessionTreePids(
  dirs: ReadonlySet<string>,
  table: Map<number, ProcEntry>,
  ownerPid: number = process.pid,
): number[] {
  if (dirs.size === 0) return [];
  const children = new Map<number, number[]>();
  for (const e of table.values()) {
    const list = children.get(e.ppid);
    if (list) list.push(e.pid); else children.set(e.ppid, [e.pid]);
  }
  const mains = (children.get(ownerPid) ?? []).filter((pid) => cmdlineNamesDir(table.get(pid)!.cmdline, dirs));
  const out: number[] = [];
  const seen = new Set<number>();
  const queue = [...mains];
  while (queue.length) {
    const pid = queue.shift()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    if (table.get(pid)?.state !== "Z") out.push(pid);
    for (const c of children.get(pid) ?? []) queue.push(c);
  }
  return out;
}

/**
 * Memory of a set of processes in MB: the sum of their Pss (shared pages split
 * between the processes that map them, so a tree's total is not inflated by
 * the shared Chromium binary), falling back to VmRSS where smaps_rollup cannot
 * be read. null when none of them could be read.
 */
export function treeMemoryMB(pids: readonly number[], procRoot = "/proc"): number | null {
  let kb = 0;
  let read = 0;
  for (const pid of pids) {
    try {
      const m = readFileSync(`${procRoot}/${pid}/smaps_rollup`, "utf8").match(/^Pss:\s+(\d+)\s+kB/m);
      if (m) { kb += Number(m[1]); read++; continue; }
    } catch {
      // try status below
    }
    try {
      const m = readFileSync(`${procRoot}/${pid}/status`, "utf8").match(/^VmRSS:\s+(\d+)\s+kB/m);
      if (m) { kb += Number(m[1]); read++; }
    } catch {
      // gone
    }
  }
  return read === 0 ? null : Math.round(kb / 1024);
}

/** SIGKILL each pid. Returns how many signals were delivered. A stopped process dies on SIGKILL too. */
export function killPids(pids: readonly number[]): number {
  let killed = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
      killed++;
    } catch {
      // already gone
    }
  }
  return killed;
}

function exited(pid: number, procRoot: string): boolean {
  try {
    const stat = readFileSync(`${procRoot}/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2)[0] === "Z";
  } catch {
    return true;
  }
}

/**
 * Wait until every pid has exited (gone, or a zombie), up to `ms`. SIGKILL is
 * delivered at once but a process with many threads takes a moment to go, and
 * a session must not stop counting against the limits while its memory is
 * still held. True when all have exited.
 */
export async function waitForExit(pids: readonly number[], ms: number, procRoot = "/proc"): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    if (pids.every((pid) => exited(pid, procRoot))) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
}
