/**
 * Where a number came from: the commit, the src/ tree it was computed with, and
 * whether src/ had uncommitted changes. The src tree hash is the identifier that
 * matters for CTC numbers: a commit that touches only research/ leaves it unchanged.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

function git(args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd: import.meta.dir });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
}

export interface Provenance {
  git_head: string;
  git_branch: string;
  src_tree: string;
  src_dirty: boolean;
  ran: string;
  runtime: string;
}

export function provenance(): Provenance {
  return {
    git_head: git(["rev-parse", "HEAD"]),
    git_branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    src_tree: git(["rev-parse", "HEAD:src"]),
    src_dirty: git(["status", "--porcelain", "--", ":/src"]).length > 0,
    ran: new Date().toISOString(),
    runtime: `bun ${Bun.version}`,
  };
}
