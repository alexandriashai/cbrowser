"""
Calculation 4: stated-assumption power simulation for the planned Studies 2 and 3.

This is a simulation under assumptions written down here, not a claim about
reality. Every number it prints is conditional on them.

INPUT: research/paper-calcs/ctc-reference-scores.csv (ctc-reference-scores.ts):
the shipped model's totalCTC (a percentile, 0-1) for each built-in persona on
each of the 111 graded pages of the shipped reference set, viewport scope by
default (cognitive_effort's default).

STUDY 2. 16 stimuli, ~100 participants, every participant rates every stimulus
(fully crossed, complete; assumed). Outcome: a 0-100 NASA-TLX subset.
  Y_ps = mu + b * z_s + u_s + p_p + e_ps
  z_s = first-timer CTC of stimulus s, standardised by the reference set's mean
        and SD (so b is "TLX points per reference SD of CTC")
  u_s ~ N(0, su^2)   stimulus-level residual (what CTC does not explain)
  p_p ~ N(0, sp^2)   participant random intercept
  e_ps ~ N(0, se^2)  residual (includes participant x stimulus)
Effect: delta = b / sS, where sS^2 = b^2 + su^2 is the variance of true
stimulus means over pages drawn from the reference distribution. delta is the
correlation between CTC and a page's true mean TLX, "delta SD of the stimulus
means per SD of CTC". su is then sS * sqrt(1 - delta^2); sS is gridded.
Analysis: OLS of the 16 stimulus means on CTC, t-test of the slope, df = S - 2,
two-sided alpha 0.05. For a complete balanced crossed design this IS the mixed
model NASA_TLX ~ CTC + (1|participant) + (1|stimulus): the participant
intercepts average to a constant that the intercept absorbs, the GLS slope
equals the OLS slope on stimulus means, and the correct error term (expected
mean square se^2 + P su^2) is the stimulus-residual mean square, so the mixed
model F with Kenward-Roger/Satterthwaite df equals the means-regression t^2
with df S - 2 (Westfall, Kenny & Judd 2014). The script checks that identity
numerically on full participant-level simulated data (an ANOVA decomposition of
the P x S table against the means regression) before it runs anything else.
Stimulus selection, three ways, all from the reference set's empirical CTC
distribution: random (with replacement, so S may exceed 111), quantile-stratified
(one draw per 1/S of the empirical CDF), extremes (half below the 25th
percentile, half above the 75th).

STUDY 3. 4 subgroups (cognitive-adhd, dyslexic-user, low-vision-magnified,
elderly-user) x 5 participants, every participant rates the same S stimuli
(S = 16 assumed). Within subgroup g:
  Y_gps = a_g + bg * zg_s + bm * zm_gs + u_s + v_gs + p_gp + e_gps
  zg = first-timer (generic) CTC, zm = the subgroup's matched-persona CTC, both
       divided by the first-timer reference SD (one common scale).
  u_s shared across subgroups, v_gs subgroup-specific; each carries half of the
  stimulus residual variance su^2 = sS^2 (1 - delta^2).
Scenario "matched is right": bm = delta * sS, bg = 0.
Primary analysis (the one specified): within each subgroup, OLS of the 16
stimulus means (5 participants each) on [1, zg, zm], test of bm - bg > 0,
one-sided alpha 0.05, df = S - 3. Equivalent to NASA_TLX ~ matched_CTC +
generic_CTC + (1|stimulus) (+ (1|participant)) for complete balanced data, by
the argument above.
Secondary: all four subgroups pooled, stimulus means on stimulus fixed effects +
subgroup fixed effects + zm; one-sided test of the zm slope. Stimulus fixed
effects absorb everything about a page that does not change with the persona,
generic CTC included, so a positive slope means the matched CTC explains how
the subgroups differ on the same page. df = 4S - S - 3 - 1.
The matched-generic CTC difference per page is the model's own, on real pages;
its spread (and the correlation of zm with zg) is what drives power. Two
stimulus selections: random 16 of the 111 pages, and "divergent": the 16 pages
with the largest |residual| of zm on zg for that persona (8 most positive, 8
most negative), which maximises the information that separates the two
predictors.

VARIANCE ASSUMPTIONS. No published NASA-TLX variance-components estimate was
found (searched 2026-10-22; Said et al. 2020, J Med Internet Res 22(9):e19472,
fit the right mixed model to 1,160 raw TLX questionnaires but report no random
effects). Anchor used: their raw global TLX interquartile ranges, 27 and 31
points, which under normality imply a total between-rating SD of about
27/1.349 = 20 to 31/1.349 = 23 points. Assumed: sp = 12, se = 16
(sqrt(12^2 + 16^2) = 20). Study 2's test is invariant to sp and nearly invariant
to se (se^2 / 100 is small beside su^2); a sensitivity block shows it. Study
3 is not: its stimulus means average 5 people, so se^2 / 5 competes with su^2.

RNG: numpy Generator(PCG64), seed 20261022. Monte Carlo SE of a power p over R
reps is sqrt(p (1 - p) / R), at most 0.008 at R = 4000.

Usage (as wyld-web, worktree root):
  python3 -I research/paper-calcs/power.py [--scope viewport|full_page] [--reps 4000]

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import csv
import json
import sys
from collections import defaultdict

import numpy as np
from scipy import stats

SEED = 20261022
ALPHA = 0.05
SP, SE = 12.0, 16.0
P2 = 100                       # Study 2 participants
P3 = 5                         # Study 3 participants per subgroup
DELTAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
S_SIGMAS = [4.0, 8.0, 12.0]    # SD of true stimulus means, TLX points
S_GRID = [8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 256, 320, 400, 512, 640, 800, 1000]
SUBGROUPS = ["cognitive-adhd", "dyslexic-user", "low-vision-magnified", "elderly-user"]


def load(path, scope):
    by = defaultdict(dict)
    for r in csv.DictReader(open(path, newline="")):
        if r["scope"] == scope:
            by[r["persona"]][r["url"]] = float(r["total_ctc"])
    return by


# ── Study 2 ──

def draw_ctc(rng, sorted_ctc, strategy, S, reps):
    n = len(sorted_ctc)
    if strategy == "random":
        return sorted_ctc[rng.integers(0, n, size=(reps, S))]
    if strategy == "stratified":
        u = (np.arange(S)[None, :] + rng.random((reps, S))) / S
    elif strategy == "extremes":
        h = S // 2
        u = np.concatenate([rng.random((reps, h)) * 0.25, 0.75 + rng.random((reps, S - h)) * 0.25], axis=1)
    else:
        raise ValueError(strategy)
    # Inverse of the empirical CDF (type 7 quantile, numpy default).
    return np.quantile(sorted_ctc, u)


def slope_t(x, y):
    """Row-wise OLS slope t statistic of y on x (both reps x S)."""
    S = x.shape[1]
    xc = x - x.mean(axis=1, keepdims=True)
    yc = y - y.mean(axis=1, keepdims=True)
    sxx = (xc * xc).sum(axis=1)
    b = (xc * yc).sum(axis=1) / sxx
    resid = yc - b[:, None] * xc
    s2 = (resid * resid).sum(axis=1) / (S - 2)
    return b / np.sqrt(s2 / sxx)


def power2(rng, ctc, mu, sd, strategy, S, delta, sS, reps, sp=SP, se=SE, P=P2):
    z = (draw_ctc(rng, ctc, strategy, S, reps) - mu) / sd
    b = delta * sS
    su = sS * np.sqrt(1 - delta ** 2)
    # Stimulus means of a complete P x S table: the participant mean is common to
    # every stimulus (it shifts the intercept only) and the residual mean has
    # variance se^2 / P.
    pbar = rng.normal(0, sp / np.sqrt(P), size=(reps, 1))
    y = 50 + b * z + rng.normal(0, su, size=(reps, S)) + pbar + rng.normal(0, se / np.sqrt(P), size=(reps, S))
    t = slope_t(z, y)
    return float((np.abs(t) > stats.t.ppf(1 - ALPHA / 2, S - 2)).mean())


def check_mixed_equivalence(rng, ctc, mu, sd):
    """Full participant-level data: crossed-ANOVA F for the stimulus-level slope vs the means-regression t^2."""
    worst = 0.0
    for _ in range(50):
        S, P = 16, 100
        z = (ctc[rng.integers(0, len(ctc), S)] - mu) / sd
        Y = (50 + 4 * z[None, :] + rng.normal(0, 7, S)[None, :] + rng.normal(0, SP, P)[:, None]
             + rng.normal(0, SE, (P, S)))
        m = Y.mean(axis=0)
        # ANOVA: stimulus SS split into the regression on z (1 df) and the rest (S - 2 df);
        # E[MS_stim_resid] = se^2 + P su^2, the error term for a stimulus-level predictor.
        zc = z - z.mean()
        b = (zc * (m - m.mean())).sum() / (zc * zc).sum()
        ss_reg = P * b * b * (zc * zc).sum()
        ss_stim = P * ((m - m.mean()) ** 2).sum()
        F = ss_reg / ((ss_stim - ss_reg) / (S - 2))
        t = slope_t(z[None, :], m[None, :])[0]
        worst = max(worst, abs(F - t * t) / (t * t))
    if worst > 1e-9:
        raise SystemExit(f"mixed-model / means-regression identity failed: relative error {worst}")
    return worst


def fisher_power(rho, n):
    """Normal-approximation power of a two-sided correlation test (sanity check for the random strategy)."""
    zr = np.arctanh(rho) * np.sqrt(n - 3)
    c = stats.norm.ppf(1 - ALPHA / 2)
    return float(stats.norm.sf(c - zr) + stats.norm.cdf(-c - zr))


def needed_S(curve):
    """Smallest S on the grid with power >= 0.80, and a linear interpolation between grid points."""
    for (s0, p0), (s1, p1) in zip(curve, curve[1:]):
        if p0 >= 0.8:
            return s0, float(s0)
        if p1 >= 0.8:
            return s1, float(s0 + (0.8 - p0) * (s1 - s0) / (p1 - p0))
    return None, None


# ── Study 3 ──

def study3(rng, ft, persona, ref_sd, S, delta, sS, reps, selection, share=0.5):
    urls = sorted(ft)
    zg_all = np.array([ft[u] for u in urls]) / ref_sd
    zm_all = np.array([persona[u] for u in urls]) / ref_sd
    if selection == "random":
        idx = np.argsort(rng.random((reps, len(urls))), axis=1)[:, :S]
    else:
        # Largest |residual| of zm on zg: the pages where the persona and the generic
        # model disagree most, beyond their shared trend.
        bb = np.polyfit(zg_all, zm_all, 1)
        r = zm_all - np.polyval(bb, zg_all)
        order = np.argsort(r)
        pick = np.concatenate([order[: S // 2], order[-(S - S // 2):]])
        idx = np.tile(pick, (reps, 1))
    zg, zm = zg_all[idx], zm_all[idx]
    return zg, zm


def within_subgroup_power(rng, zg, zm, delta, sS, P=P3, se=SE, bm_frac=1.0, bg_frac=0.0):
    reps, S = zg.shape
    b = delta * sS
    su = sS * np.sqrt(1 - delta ** 2)
    y = (bm_frac * b * zm + bg_frac * b * zg + rng.normal(0, su, size=(reps, S)) + rng.normal(0, se / np.sqrt(P), size=(reps, S)))
    X = np.stack([np.ones_like(zg), zg, zm], axis=2)            # reps x S x 3
    XtX = np.einsum("rsi,rsj->rij", X, X)
    XtX_inv = np.linalg.inv(XtX)
    beta = np.einsum("rij,rsj,rs->ri", XtX_inv, X, y)
    resid = y - np.einsum("rsi,ri->rs", X, beta)
    s2 = (resid ** 2).sum(axis=1) / (S - 3)
    c = np.array([0.0, -1.0, 1.0])
    var_c = s2 * np.einsum("i,rij,j->r", c, XtX_inv, c)
    t = (beta @ c) / np.sqrt(var_c)
    crit = stats.t.ppf(1 - ALPHA, S - 3)
    corr = np.array([np.corrcoef(zg[i], zm[i])[0, 1] for i in range(min(reps, 500))])
    return float((t > crit).mean()), float(np.median(corr))


def pooled_power(rng, ft, personas, ref_sd, S, delta, sS, reps, selection, share=0.5, P=P3, se=SE, bm_frac=1.0, bg_frac=0.0):
    """Stimulus means for 4 subgroups on the SAME S pages; stimulus FE + subgroup FE + zm; one-sided test of zm."""
    urls = sorted(ft)
    G = len(personas)
    zg_all = np.array([ft[u] for u in urls]) / ref_sd
    zm_all = np.stack([np.array([p[u] for u in urls]) / ref_sd for p in personas])   # G x N
    if selection == "random":
        idx = np.argsort(rng.random((reps, len(urls))), axis=1)[:, :S]
    else:
        # The test uses how the four matched CTCs differ from each other on a page,
        # each net of its persona's own average: pick the S pages where that spread
        # is largest.
        c = zm_all - zm_all.mean(axis=1, keepdims=True)
        pick = np.argsort(-c.var(axis=0))[:S]
        idx = np.tile(pick, (reps, 1))
    b = delta * sS
    su = sS * np.sqrt(1 - delta ** 2)
    hits = 0
    df = G * S - S - (G - 1) - 1
    crit = stats.t.ppf(1 - ALPHA, df)
    for r in range(reps):
        zm = zm_all[:, idx[r]]                                   # G x S
        zg = zg_all[idx[r]]
        u = rng.normal(0, su * np.sqrt(share), S)
        y = (bm_frac * b * zm + bg_frac * b * zg[None, :] + u[None, :] + rng.normal(0, su * np.sqrt(1 - share), (G, S))
             + rng.normal(0, se / np.sqrt(P), (G, S)) + rng.normal(0, 5, (G, 1)))
        # Two-way within transform (balanced): removes stimulus and subgroup effects, zg included.
        def within(a):
            return a - a.mean(axis=0, keepdims=True) - a.mean(axis=1, keepdims=True) + a.mean()
        xw, yw = within(zm), within(y)
        sxx = (xw * xw).sum()
        if sxx <= 1e-12:
            continue
        bh = (xw * yw).sum() / sxx
        res = yw - bh * xw
        s2 = (res * res).sum() / df
        if bh / np.sqrt(s2 / sxx) > crit:
            hits += 1
    return hits / reps


def main():
    args = sys.argv[1:]
    scope = args[args.index("--scope") + 1] if "--scope" in args else "viewport"
    reps = int(args[args.index("--reps") + 1]) if "--reps" in args else 4000
    here = __file__.rsplit("/", 1)[0]
    by = load(f"{here}/ctc-reference-scores.csv", scope)
    ft = by["first-timer"]
    ctc = np.sort(np.array(list(ft.values())))
    mu, sd = float(ctc.mean()), float(ctc.std(ddof=1))
    rng = np.random.default_rng(SEED)
    out = {"scope": scope, "reps": reps, "seed": SEED, "alpha": ALPHA, "assumptions": {
        "sp": SP, "se": SE, "participants_study2": P2, "participants_per_subgroup_study3": P3,
        "anchor": "Said et al. 2020 J Med Internet Res 22(9):e19472, raw global TLX IQR 27 and 31 points -> total SD ~20-23",
        "effect": "delta = b / sS, the correlation of CTC with a page's true mean TLX over the reference distribution",
    }}
    out["mixed_model_identity_max_rel_error"] = check_mixed_equivalence(rng, ctc, mu, sd)
    out["first_timer_ctc"] = {"pages": len(ctc), "mean": mu, "sd": sd,
                              "quantiles": {f"q{q}": float(np.quantile(ctc, q / 100)) for q in (0, 5, 25, 50, 75, 95, 100)}}
    print(f"[{scope}] first-timer CTC over {len(ctc)} reference pages: mean {mu:.3f} sd {sd:.3f}; mixed-model identity holds (max rel err {out['mixed_model_identity_max_rel_error']:.1e})")

    # Study 2: power at S = 16, and the S needed for 80%.
    s2_rows = []
    for strategy in ("random", "stratified", "extremes"):
        for sS in S_SIGMAS:
            for d in DELTAS:
                p16 = power2(rng, ctc, mu, sd, strategy, 16, d, sS, reps)
                curve = [(S, power2(rng, ctc, mu, sd, strategy, S, d, sS, max(1000, reps // 2))) for S in S_GRID]
                s_grid, s_interp = needed_S(curve)
                rho_eff = d * sS / np.sqrt(sS ** 2 + SE ** 2 / P2)
                row = {"strategy": strategy, "sS": sS, "delta": d, "power_S16": p16,
                       "mc_se": float(np.sqrt(p16 * (1 - p16) / reps)),
                       "fisher_approx_S16": fisher_power(rho_eff, 16) if strategy == "random" else None,
                       "S_needed_grid": s_grid, "S_needed_interp": s_interp, "curve": curve}
                s2_rows.append(row)
    out["study2"] = s2_rows
    sens = []
    for sp in (0.0, 12.0, 20.0):
        for se in (10.0, 16.0, 22.0):
            sens.append({"sp": sp, "se": se, "delta": 0.5, "sS": 8.0, "strategy": "random",
                         "power_S16": power2(rng, ctc, mu, sd, "random", 16, 0.5, 8.0, reps, sp=sp, se=se)})
    out["study2_variance_sensitivity"] = sens

    print("\nStudy 2, 16 stimuli, 100 participants, alpha .05 two-sided: power (S needed for 80%, interpolated)")
    for strategy in ("random", "stratified", "extremes"):
        for sS in S_SIGMAS:
            rs = [r for r in s2_rows if r["strategy"] == strategy and r["sS"] == sS]
            print(f"  {strategy:10s} sS={sS:4.0f}  " + "  ".join(
                f"d{r['delta']:.1f}:{r['power_S16']:.2f}({'>' + str(S_GRID[-1]) if r['S_needed_interp'] is None else round(r['S_needed_interp'])})" for r in rs))
    print("  random-strategy Fisher-z check at S=16, sS=8: " + "  ".join(
        f"d{r['delta']:.1f} sim {r['power_S16']:.3f} approx {r['fisher_approx_S16']:.3f}" for r in s2_rows if r["strategy"] == "random" and r["sS"] == 8.0))
    print("  variance sensitivity (delta .5, sS 8, random): " + "  ".join(f"sp{r['sp']:.0f}/se{r['se']:.0f}:{r['power_S16']:.3f}" for r in sens))

    # Study 3.
    ref_sd = sd
    s3 = []
    for persona in SUBGROUPS:
        pm = by[persona]
        urls = sorted(ft)
        zg_all = np.array([ft[u] for u in urls]); zm_all = np.array([pm[u] for u in urls])
        diff = zm_all - zg_all
        info = {"persona": persona, "corr_with_generic_all_pages": float(np.corrcoef(zg_all, zm_all)[0, 1]),
                "diff_mean": float(diff.mean()), "diff_sd": float(diff.std(ddof=1)),
                "diff_q": {f"q{q}": float(np.quantile(diff, q / 100)) for q in (5, 25, 50, 75, 95)}}
        for selection in ("random", "divergent"):
            for d in (0.3, 0.5, 0.7, 0.9):
                for sS in (8.0,):
                    zg, zm = study3(rng, ft, pm, ref_sd, 16, d, sS, reps, selection)
                    p, corr = within_subgroup_power(rng, zg, zm, d, sS)
                    curve = []
                    if selection == "random":
                        for S in (16, 24, 32, 48, 64, 80, 96, 111):
                            zg2, zm2 = study3(rng, ft, pm, ref_sd, S, d, sS, max(1000, reps // 2), selection)
                            curve.append((S, within_subgroup_power(rng, zg2, zm2, d, sS)[0]))
                    s_grid, s_interp = needed_S(curve) if curve else (None, None)
                    s3.append({**info, "selection": selection, "delta": d, "sS": sS, "power_S16": p,
                               "mc_se": float(np.sqrt(p * (1 - p) / reps)), "median_corr_zg_zm_in_sample": corr,
                               "S_needed_grid_max111": s_grid, "curve": curve})
    pooled = []
    for selection in ("random", "divergent"):
        for d in (0.3, 0.5, 0.7, 0.9):
            pooled.append({"selection": selection, "delta": d, "sS": 8.0,
                           "power_S16": pooled_power(rng, ft, [by[p] for p in SUBGROUPS], ref_sd, 16, d, 8.0, min(reps, 2000), selection)})
    out["study3"] = s3
    with open(f"{here}/study3-ctc-differences-{scope}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["url", "first_timer_ctc"] + [f"{p}_ctc" for p in SUBGROUPS] + [f"{p}_minus_first_timer" for p in SUBGROUPS])
        for u in sorted(ft):
            w.writerow([u, f"{ft[u]:.6f}"] + [f"{by[p][u]:.6f}" for p in SUBGROUPS] + [f"{by[p][u] - ft[u]:+.6f}" for p in SUBGROUPS])
    out["study3_pooled_within_stimulus"] = pooled
    # Size checks: rejection rates where the tested hypothesis is false by construction.
    size = {}
    for persona in SUBGROUPS:
        zg, zm = study3(rng, ft, by[persona], ref_sd, 16, 0.7, 8.0, reps, "random")
        size[f"within_{persona}_bm_eq_bg"] = within_subgroup_power(rng, zg, zm, 0.7, 8.0, bm_frac=0.5, bg_frac=0.5)[0]
        size[f"within_{persona}_generic_only"] = within_subgroup_power(rng, zg, zm, 0.7, 8.0, bm_frac=0.0, bg_frac=1.0)[0]
    size["pooled_generic_only"] = pooled_power(rng, ft, [by[p] for p in SUBGROUPS], ref_sd, 16, 0.7, 8.0, min(reps, 2000), "random", bm_frac=0.0, bg_frac=1.0)
    out["study3_size_checks"] = size

    print("\nStudy 3, 5 participants per subgroup, 16 stimuli, sS 8, one-sided alpha .05: power of matched > generic")
    for persona in SUBGROUPS:
        rs = [r for r in s3 if r["persona"] == persona]
        print(f"  {persona:22s} corr(matched,generic) {rs[0]['corr_with_generic_all_pages']:.3f}  diff mean {rs[0]['diff_mean']:+.3f} sd {rs[0]['diff_sd']:.3f}")
        for sel in ("random", "divergent"):
            print(f"    {sel:9s} " + "  ".join(f"d{r['delta']:.1f}:{r['power_S16']:.2f}" + (f"(S80 {r['S_needed_grid_max111']})" if sel == "random" else "")
                                       for r in rs if r["selection"] == sel))
    print("  pooled within-stimulus test (all 4 subgroups, same 16 pages): " + "  ".join(
        f"{r['selection']} d{r['delta']:.1f}:{r['power_S16']:.2f}" for r in pooled))
    print("  size checks (should be ~0.05 where bm = bg, below it where generic only): " + "  ".join(f"{k} {v:.3f}" for k, v in size.items()))

    with open(f"{here}/power-{scope}.json", "w") as f:
        json.dump(out, f, indent=1)
    with open(f"{here}/power-study2-{scope}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["strategy", "sS", "delta", "power_S16", "mc_se", "fisher_approx_S16", "S_needed_grid", "S_needed_interp"])
        for r in s2_rows:
            w.writerow([r["strategy"], r["sS"], r["delta"], f"{r['power_S16']:.4f}", f"{r['mc_se']:.4f}",
                        "" if r["fisher_approx_S16"] is None else f"{r['fisher_approx_S16']:.4f}",
                        r["S_needed_grid"] or f">{S_GRID[-1]}", "" if r["S_needed_interp"] is None else f"{r['S_needed_interp']:.1f}"])
    with open(f"{here}/power-study3-{scope}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["persona", "corr_with_generic", "diff_mean", "diff_sd", "selection", "delta", "sS", "power_S16", "mc_se", "median_corr_in_sample", "S_needed_max111"])
        for r in s3:
            w.writerow([r["persona"], f"{r['corr_with_generic_all_pages']:.4f}", f"{r['diff_mean']:.4f}", f"{r['diff_sd']:.4f}",
                        r["selection"], r["delta"], r["sS"], f"{r['power_S16']:.4f}", f"{r['mc_se']:.4f}",
                        f"{r['median_corr_zg_zm_in_sample']:.4f}",
                        "" if r["selection"] != "random" else (r["S_needed_grid_max111"] or ">111")])
    print(f"\nwrote power-{scope}.json, power-study2-{scope}.csv, power-study3-{scope}.csv")


if __name__ == "__main__":
    main()
