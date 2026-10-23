/**
 * A seeded pseudo-random generator for the places where "random" must still
 * reproduce: the same seed gives the same sequence on every call and every
 * machine.
 *
 * mulberry32, on 32-bit integers through Math.imul and unsigned shifts, so no
 * step depends on floating-point rounding. A float linear-congruential
 * generator looks equivalent and is not: its products lose low bits past 2^53
 * and the sequence degenerates.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

/** mulberry32: uniform on [0, 1), period 2^32, from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
