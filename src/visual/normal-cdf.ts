/**
 * The standard normal CDF, on its own so a module can use it without
 * importing cognitive-models.ts (and through it model-provenance.ts); see the
 * note where cognitive-models.ts re-exports it as _normalCDF.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

/**
 * Standard normal CDF (cumulative distribution function).
 * Abramowitz and Stegun approximation (7.1.26), error < 7.5e-8.
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1 + sign * y);
}
