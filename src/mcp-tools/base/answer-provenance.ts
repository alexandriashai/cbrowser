/**
 * A tool answer recorded whole.
 *
 * The tools that report a cognitive transport score attach `modelProvenance`:
 * every registered constant the answer read. Through 21.0 they could record
 * only a synchronous slice of the answer (the demand and chain run), because
 * the recorder was module state and an await inside it would have let a
 * concurrent request's reads land in the block. The page measurement before
 * that slice and the verdict after it were not counted.
 *
 * recordedAnswer runs a handler inside its own withProvenanceAsync, so every
 * read anywhere in the handler, across every await, lands in that answer's
 * recording and nowhere else. The handler reports it with activeProvenance()
 * as its last step before serialising.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { withProvenanceAsync } from "../../visual/model-provenance.js";

/**
 * Where a recordedAnswer wrapper keeps the handler it wraps. Code that reads a
 * handler's own parameter list (tests/mcp-manifest-vs-handler.test.ts checks it
 * against the declared schema) reads it here: the wrapper's own parameters are
 * a rest argument and name nothing.
 */
export const WRAPPED_HANDLER = Symbol.for("cbrowser.recordedAnswer.handler");

/** Wrap a tool handler so its whole run is one provenance recording. Same signature in and out. */
export function recordedAnswer<A extends unknown[], R>(handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  const wrapped = async (...args: A) => (await withProvenanceAsync(() => handler(...args))).result;
  return Object.assign(wrapped, { [WRAPPED_HANDLER]: handler });
}
