"""
Study 3's pooled confirmatory test (D2, protected) under three test procedures
and three control counts.

Same tree and harness as round 3 (../r3/redesign.py, src tree 48c8304): the
typical-user baseline, the 16 divergent screens (../r2/study3-pages-viewport.csv),
the common slope beta = r sS / SD_ref(typical CTC), sS 8, participant SD 12,
residual SD 16, stimulus residual shared across groups with share 0.5, one-sided
alpha 0.05. D2 (protected): per screen s and subgroup g,
    D_gs = subgroup g's mean TLX on s  -  the controls' raw mean TLX on s,
fitted as D ~ subgroup intercepts + subgroup-specific generic slopes + Delta +
(1 | screen), Delta = matched - typical-user totalCTC, generic = typical-user
totalCTC; the test is on the Delta coefficient. n = 4 x 16 = 64.

THE THREE TESTS, on the same simulated data:
  Satterthwaite   REML fit, Satterthwaite df (../r3/lmmk.py), as round 3.
  Kenward-Roger   the same REML fit; covariance of beta adjusted (Phi_A) and the
                  denominator df and scaling lambda of Kenward & Roger (1997),
                  as pbkrtest computes them, here for q = 1 and a covariance
                  linear in its two parameters (screen and residual variance),
                  so the second-derivative term R is 0. Checked by kr_selftest():
                  on complete balanced data with a screen-level predictor it
                  must give df = S - 2, lambda = 1 and the means-regression t.
  Permutation     Freedman & Lane (1983): fit the reduced model (the nuisance
                  terms, no Delta) by OLS, permute its residuals BY SCREEN (each
                  screen's four subgroup residuals move together, which keeps the
                  shared control noise and screen effect intact), add them back to
                  the reduced fit, refit the full model, and compare the OLS t of
                  Delta with its permutation distribution (999 permutations,
                  one-sided p = (1 + #{t* >= t}) / 1000). Permuting Delta within
                  condition would be invalid here: Delta correlates with the
                  generic CTC (-0.30 to -0.88 on these screens), so shuffling it
                  breaks that correlation and the null distribution comes out too
                  narrow. Sign-flipping needs errors symmetric about a known mean,
                  which the subgroup intercepts and slopes rule out.

CONTROLS. Study 2 completers, minus those who report a screened condition
(ADHD, dyslexia, visual impairment needing assistive technology, motor
impairment, age 65+). Completed counts 100, 59 and 46 (Section 5.2.1's three
loss rates). EXCLUDED SHARE 15%: a HYPOTHESIS (no source for the joint share of
the five screened conditions among Prolific desktop completers was found), so
85, 50 and 39 controls. Each rates 16 of the 46-screen pool (Study 2's 30 plus
Study 3's 16), page counts balanced to within one; one seeded assignment per
control count.

NULLS (r = 0.7 sets the slope on the generic CTC): generic (the subgroup follows
the generic CTC), amplified (1.5 times that slope), attenuated (0.5 times).
Power at r = 0.5 and 0.9; 5 and 10 participants per subgroup.

Reps: 10,000 simulated studies per null cell (MC SE about 0.002 at 0.05), 2,000 per power cell. RNG numpy
PCG64, SeedSequence(20261025, spawn_key=cell); the 999 screen permutations are
one fixed seeded set.

Usage (as the tree's owner, worktree root): python3 -I research/paper-calcs/r4/d2_tests.py [--procs K] [--quick]

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import json
import multiprocessing as mp
import os
import sys
import time

for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import numpy as np  # noqa: E402
from scipy import stats  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "r3"), os.path.join(HERE, "..", "r2")]
sys.dont_write_bytecode = True
import power as pw  # noqa: E402
import redesign as rd  # noqa: E402
from lmmk import RandomInterceptLMM  # noqa: E402

SEED = 20261025
ALPHA = 0.05
SP, SE, SS, SHARE = 12.0, 16.0, 8.0, 0.5
POOL, PER = 46, 16
COMPLETED = [100, 59, 46]
EXCLUDED = 0.15
B = 999
CTX = {}


def seeded(cell):
    return np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=(cell,)))


# ── Kenward-Roger for one random-intercept factor plus residual (V = t1 ZZ' + t2 I) ──

def kenward_roger(y, X, Z, t1, t2, c):
    """One-sided KR test of c'beta: returns (t_KR, df). REML variance estimates t1 (factor), t2 (residual)."""
    n, p = X.shape
    G = [Z @ Z.T, np.eye(n)]
    theta = [t1, t2]
    free = [i for i in range(2) if theta[i] > 1e-10]
    V = theta[0] * G[0] + theta[1] * G[1]
    Vi = np.linalg.inv(V)
    XtVi = X.T @ Vi
    Phi = np.linalg.inv(XtVi @ X)
    beta = Phi @ (XtVi @ y)
    Pi = Vi - XtVi.T @ Phi @ XtVi                      # REML projection
    Gs = [G[i] for i in free]
    Pm = [-(XtVi @ Gi @ XtVi.T) for Gi in Gs]           # KR P_i = X' dV^-1/dtheta_i X
    ViG = [Vi @ Gi for Gi in Gs]
    r = len(Gs)
    info = np.empty((r, r))
    PG = [Pi @ Gi for Gi in Gs]
    for i in range(r):
        for j in range(r):
            info[i, j] = 0.5 * np.trace(PG[i] @ PG[j])
    W = np.linalg.inv(info)
    Lam = np.zeros((p, p))
    for i in range(r):
        for j in range(r):
            Q = XtVi @ Gs[i] @ ViG[j] @ XtVi.T           # X' V^-1 G_i V^-1 G_j V^-1 X
            Lam += W[i, j] * (Q - Pm[i] @ Phi @ Pm[j])
    PhiA = Phi + 2 * Phi @ Lam @ Phi
    c = np.asarray(c, float)[:, None]
    q = 1
    Theta = c @ np.linalg.inv(c.T @ Phi @ c) @ c.T
    TP = [Theta @ Phi @ Pm[i] @ Phi for i in range(r)]
    A1 = sum(W[i, j] * np.trace(TP[i]) * np.trace(TP[j]) for i in range(r) for j in range(r))
    A2 = sum(W[i, j] * np.trace(TP[i] @ TP[j]) for i in range(r) for j in range(r))
    Bk = (A1 + 6 * A2) / (2 * q)
    g = ((q + 1) * A1 - (q + 4) * A2) / ((q + 2) * A2)
    den = 3 * q + 2 * (1 - g)
    c1, c2, c3 = g / den, (q - g) / den, (q + 2 - g) / den
    Estar = 1 / (1 - A2 / q)
    Vstar = (2 / q) * (1 + c1 * Bk) / ((1 - c2 * Bk) ** 2 * (1 - c3 * Bk))
    rho = Vstar / (2 * Estar ** 2)
    m = 4 + (q + 2) / (q * rho - 1) if q * rho > 1 else np.inf
    lam = m / (Estar * (m - 2)) if np.isfinite(m) else 1 / Estar
    est = float(c[:, 0] @ beta)
    t = np.sign(est) * np.sqrt(lam * est * est / (c.T @ PhiA @ c).item())
    return float(t), float(m)


def kr_selftest(rng, reps=20, G=4, S=16):
    """Complete balanced data, screen-level predictor: KR df = S - 2, lambda = 1, t = means-regression t."""
    sid = np.tile(np.arange(S), G)
    Z = np.eye(S)[sid]
    worst_t = worst_df = 0.0
    for _ in range(reps):
        z = rng.normal(size=S)
        y = 3 * z[sid] + rng.normal(0, 5, S)[sid] + rng.normal(0, 8, G * S)
        X = np.column_stack([np.ones(G * S), z[sid]])
        fit = RandomInterceptLMM([(sid, S)]).fit(y, X)
        if fit.gamma[0] < 1e-4:
            continue
        t, df = kenward_roger(y, X, Z, fit.var_components[0], fit.s2, [0, 1])
        means = np.bincount(sid, y) / G
        tm, dfm = rd.ols_t_batch(means[None, :], np.column_stack([np.ones(S), z]), np.array([0.0, 1.0]))
        worst_t = max(worst_t, abs(t - tm[0]) / abs(tm[0])); worst_df = max(worst_df, abs(df - dfm))
    if worst_t > 1e-4 or worst_df > 0.05:
        raise SystemExit(f"KR self-test failed: max rel t err {worst_t:.2e}, max df err {worst_df:.3f}")
    return {"max_rel_t_error": worst_t, "max_abs_df_error": worst_df}


# ── Simulation ──

def control_plan(rng, n_ctrl):
    pid, sid = pw.assign(rng, n_ctrl, POOL, PER)
    A = np.zeros((16, n_ctrl)); n = np.zeros(16)
    for p_, s_ in zip(pid, sid):
        if s_ >= POOL - 16:
            A[s_ - (POOL - 16), p_] += 1; n[s_ - (POOL - 16)] += 1
    return A / n[:, None], n


def draw(rng, T, r, P, gen, plan):
    g, M = CTX["g"][T], CTX["M"][:, T]
    Gn, S = M.shape
    b, su = r * SS / CTX["sd_g"], SS * np.sqrt(1 - r ** 2)
    sub_mean = {"matched": b * M, "generic": b * g[None, :].repeat(Gn, 0), "amplified": 1.5 * b * g[None, :].repeat(Gn, 0),
                "attenuated": 0.5 * b * g[None, :].repeat(Gn, 0)}[gen]
    A, n = plan
    u = rng.normal(0, su * np.sqrt(SHARE), S)
    sub = sub_mean + u + rng.normal(0, su * np.sqrt(1 - SHARE), (Gn, S)) + rng.normal(0, SE / np.sqrt(P), (Gn, S))
    ctrl = b * g + u + rng.normal(0, su * np.sqrt(1 - SHARE), S) + rng.normal(0, SP, A.shape[1]) @ A.T + rng.normal(0, 1, S) * SE / np.sqrt(n)
    return (sub - ctrl[None, :]), M - g[None, :], g


def design(Delta, g):
    Gn, S = Delta.shape
    gid = np.repeat(np.arange(Gn), S); sid = np.tile(np.arange(S), Gn)
    D_sub = np.eye(Gn)[gid]
    X0 = np.column_stack([D_sub, D_sub * g[sid][:, None]])
    X = np.column_stack([X0, Delta.reshape(-1)])
    return gid, sid, X0, X


def cell(args):
    cid, n_completed, P, r, gen, reps = args
    rng = seeded(cid)
    n_ctrl = int(round(n_completed * (1 - EXCLUDED)))
    plan = control_plan(seeded(10 ** 6 + n_completed), n_ctrl)
    T = CTX["T"]
    S = len(T)
    perms = CTX["perms"]                                          # B x S screen permutations
    _, Delta0, g0 = draw(rng, T, 0.5, P, "generic", plan)          # fixed design pieces
    gid, sid, X0, X = design(Delta0, g0)
    Z = np.eye(S)[sid]
    n, p = X.shape
    c = np.zeros(p); c[-1] = 1
    XtX_inv = np.linalg.inv(X.T @ X)
    H = XtX_inv @ X.T
    H0 = np.linalg.pinv(X0)
    # Permuted cell index: cell (g, s) takes the reduced residual of cell (g, perm[s]).
    perm_idx = gid[None, :] * S + perms[:, sid]
    model = RandomInterceptLMM([(sid, S)])
    crit_sat, hits = {}, {"satterthwaite": 0, "kenward_roger": 0, "permutation": 0}
    dfs = {"satterthwaite": [], "kenward_roger": []}
    for _ in range(reps):
        Dm, _, _ = draw(rng, T, r, P, gen, plan)
        y = Dm.reshape(-1)
        fit = model.fit(y, X)
        _, _, t_s, df_s = fit.contrast(c)
        df_s = df_s if np.isfinite(df_s) else n - p
        hits["satterthwaite"] += t_s > stats.t.ppf(1 - ALPHA, df_s)
        t_k, df_k = kenward_roger(y, X, Z, fit.var_components[0], fit.s2, c)
        df_k = df_k if np.isfinite(df_k) and df_k > 0 else n - p
        hits["kenward_roger"] += t_k > stats.t.ppf(1 - ALPHA, df_k)
        dfs["satterthwaite"].append(df_s); dfs["kenward_roger"].append(df_k)
        # Freedman-Lane: reduced fit, residuals permuted by screen, full OLS t of Delta.
        f0 = X0 @ (H0 @ y)
        r0 = y - f0
        Ys = f0[None, :] + r0[perm_idx]
        bs = Ys @ H.T
        Rs = Ys - bs @ X.T
        ts = bs[:, -1] / np.sqrt((Rs * Rs).sum(axis=1) / (n - p) * XtX_inv[-1, -1])
        b_obs = H @ y
        r_obs = y - X @ b_obs
        t_obs = b_obs[-1] / np.sqrt(r_obs @ r_obs / (n - p) * XtX_inv[-1, -1])
        hits["permutation"] += (1 + (ts >= t_obs).sum()) / (len(ts) + 1) <= ALPHA
    return {"cid": cid, "completed": n_completed, "controls": n_ctrl, "raters_per_screen": float(plan[1].mean()), "P": P, "r": r, "gen": gen,
            "reps": reps, **{k: v / reps for k, v in hits.items()},
            "df_median": {k: float(np.median(v)) for k, v in dfs.items()}}


def main():
    args = sys.argv[1:]
    procs = int(args[args.index("--procs") + 1]) if "--procs" in args else max(1, (os.cpu_count() or 2) - 4)
    quick = "--quick" in args
    t0 = time.time()
    urls, g, M, common, extra, pools = rd.load()
    CTX.update({"g": g, "M": M, "sd_g": float(g.std(ddof=1)), "T": common})
    prng = seeded(10 ** 7)
    CTX["perms"] = np.stack([prng.permutation(len(common)) for _ in range(B)])
    selftest = kr_selftest(seeded(10 ** 7 + 1))
    null_reps, power_reps = (200, 100) if quick else (10000, 2000)
    jobs = []
    for n_completed in COMPLETED:
        for P in (5, 10):
            for gen in ("generic", "amplified", "attenuated"):
                jobs.append((len(jobs) + 1, n_completed, P, 0.7, gen, null_reps))
            for r in (0.5, 0.9):
                jobs.append((len(jobs) + 1, n_completed, P, r, "matched", power_reps))
    with mp.get_context("fork").Pool(procs) as pool:
        res = pool.map(cell, jobs, chunksize=1)
    out = {"provenance": pw.provenance(), "tree_note": "round-3 harness, src tree 48c8304 (pre-21.0 chain and reference)",
           "assumptions": {"share": SHARE, "sp": SP, "se": SE, "sS": SS, "excluded_share": EXCLUDED,
                           "excluded_share_status": "hypothesis: no source found for the joint share of the five screened conditions among Prolific desktop completers",
                           "completed": COMPLETED, "permutations": B, "screens": [urls[i] for i in common]},
           "kr_selftest": selftest, "cells": res, "seconds": round(time.time() - t0, 1)}
    name = "d2-tests" + ("-quick" if quick else "")
    with open(os.path.join(HERE, f"{name}.json"), "w") as f:
        json.dump(out, f, indent=1, default=float)
        f.write("\n")
    print(f"git {out['provenance']['git_head'][:7]} src {out['provenance']['src_tree'][:7]}; KR self-test {selftest}")
    for n_completed in COMPLETED:
        for P in (5, 10):
            rows = [x for x in res if x["completed"] == n_completed and x["P"] == P]
            nulls = {x["gen"]: x for x in rows if x["gen"] != "matched"}
            pows = {x["r"]: x for x in rows if x["gen"] == "matched"}
            for test in ("satterthwaite", "kenward_roger", "permutation"):
                print(f"  completed {n_completed:3d} (controls {rows[0]['controls']}, {rows[0]['raters_per_screen']:.1f}/screen) P{P:2d} {test:14s} "
                      f"size generic {nulls['generic'][test]:.3f} amplified {nulls['amplified'][test]:.3f} attenuated {nulls['attenuated'][test]:.3f} | "
                      f"power r0.5 {pows[0.5][test]:.3f} r0.9 {pows[0.9][test]:.3f}")
    print(f"wrote {name}.json in {out['seconds']} s")


if __name__ == "__main__":
    main()
