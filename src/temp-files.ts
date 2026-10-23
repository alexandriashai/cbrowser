/**
 * File names and temp directories that no other call shares.
 *
 * Files were named by the clock alone (`attn-${Date.now()}.png` in the shared
 * temp dir, `current-${Date.now()}.png` beside an account's captures). Two
 * calls in the same millisecond got the same name, and the hosted servers run
 * many requests, for many accounts, in one process: one call wrote over, read
 * or deleted the other's file, so a score could be computed on another
 * request's screenshot. Two shapes replace that:
 *
 *   makeTempDir / withTempDir  a file written and read within one call and
 *                              then discarded: a fresh directory (mkdtemp,
 *                              mode 0700, so not readable by other local
 *                              users as a file in the shared /tmp is), fixed
 *                              names inside, removed in a finally.
 *   uniqueStamp                a file that outlives the call (a returned path,
 *                              a stored capture): the time, kept so the name
 *                              still sorts and reads, plus 48 random bits.
 *
 * tests/no-clock-named-paths.test.ts fails on a file name built from the clock
 * alone, and on any temp dir taken from os.tmpdir() outside this file.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 48 random bits as 12 hex characters: the part of a name no other call shares. */
export function randomPart(): string {
  return randomBytes(6).toString("hex");
}

/** `<epoch ms>-<12 hex>`: the time for whoever reads the name, and 48 random bits so no two calls share it. */
export function uniqueStamp(): string {
  return `${Date.now()}-${randomPart()}`;
}

export interface CallTempDir {
  /** The directory: created empty, mode 0700, this call's alone. */
  readonly path: string;
  /** A file in it. `name` must be one plain path component. */
  file(name: string): string;
  /** Remove the directory and everything in it. Never throws; safe to call twice. */
  remove(): Promise<void>;
}

const PLAIN_LABEL = /^[a-z0-9][a-z0-9-]*$/;
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * A fresh private directory, `cbrowser-<label>-XXXXXX` under os.tmpdir().
 * The caller removes it in a finally; withTempDir does that for you.
 */
export async function makeTempDir(label: string): Promise<CallTempDir> {
  if (!PLAIN_LABEL.test(label)) throw new Error(`makeTempDir: label "${label}" must be lowercase letters, digits and -`);
  const path = await mkdtemp(join(tmpdir(), `cbrowser-${label}-`));
  return {
    path,
    file(name: string): string {
      if (!PLAIN_NAME.test(name) || name.includes("..")) throw new Error(`makeTempDir: "${name}" is not a plain file name`);
      return join(path, name);
    },
    async remove(): Promise<void> {
      await rm(path, { recursive: true, force: true }).catch(() => { /* best effort */ });
    },
  };
}

/** Run `fn` with a fresh temp directory, removed however `fn` ends. */
export async function withTempDir<T>(label: string, fn: (dir: CallTempDir) => Promise<T>): Promise<T> {
  const dir = await makeTempDir(label);
  try {
    return await fn(dir);
  } finally {
    await dir.remove();
  }
}
