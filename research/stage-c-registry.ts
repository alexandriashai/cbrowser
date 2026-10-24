/**
 * Registry counts as the tree TREE (default: this tree) builds them: the chain
 * registry by status, and the whole MODEL_PROVENANCE by prefix and status.
 *
 *   TREE=/path/to/worktree bun research/stage-c-registry.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const TREE = process.env.TREE ?? `${import.meta.dir}/..`;
const { MODEL_PROVENANCE } = await import(`${TREE}/src/visual/model-provenance.ts`);
const { CHAIN_PROVENANCE } = await import(`${TREE}/src/visual/provenance/chain.ts`);
const count = (entries: Array<{ status: string }>) => {
  const by: Record<string, number> = {};
  for (const e of entries) by[e.status] = (by[e.status] ?? 0) + 1;
  return by;
};
const all = Object.values(MODEL_PROVENANCE) as Array<{ id: string; status: string }>;
const byPrefix: Record<string, Record<string, number>> = {};
for (const e of all) {
  const p = e.id.split(".")[0];
  byPrefix[p] ??= {};
  byPrefix[p][e.status] = (byPrefix[p][e.status] ?? 0) + 1;
}
console.log(JSON.stringify({ chain: { total: CHAIN_PROVENANCE.length, ...count(CHAIN_PROVENANCE) }, all: { total: all.length, ...count(all) }, byPrefix }));
