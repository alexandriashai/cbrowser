"""
Study 3 redesign: simulated power for five designs, D0-D4, under stated assumptions.

Same machinery and assumptions as round 2 (../r2/power.py) unless stated: NASA-TLX
normal and unbounded; participant SD 12, residual SD 16; SD of true page means
sS = 8; stimulus residual SD su = sS sqrt(1 - r^2); one-sided alpha 0.05; r in
{0.3, 0.5, 0.7, 0.9}; 5 and 10 participants per subgroup; viewport scope; the
typical user (../r2/typical-user.ts) is the generic baseline.

ONE CHANGE FROM ROUND 2, needed by D1-D3: a COMMON slope. Every group's true page
mean responds to its own CTC with the same slope, beta = r sS / SD_ref(typical
CTC): controls to the typical user's CTC, a subgroup to its matched persona's
under "matched is right", or to the typical user's under the null. D1-D3 subtract
groups, which only means something if the groups share a scale. Round 2 scaled
each subgroup by its own persona's SD instead; D0 is reported both ways.

STIMULUS RESIDUAL across groups (4 subgroups + typical controls): for group k on
page x, r_kx = sqrt(share) u_x + sqrt(1 - share) v_kx, each part normal with the
variance su^2 split as shown; share in {0.25, 0.5, 0.75} (round 2 used 0.5).

DESIGNS
 D0  the current design. D0-A as the paper words it (Study 2's 30 banded pages,
     16 per participant, plus the 3 most divergent pages for everyone; REML mixed
     model y ~ generic + matched + (1|participant) + (1|stimulus), one-sided
     Satterthwaite test of matched - generic). D0-B the round-2 alternative: the
     same 16 divergent pages for every participant, OLS on page means (exactly the
     mixed model for complete data). Pooled (B): page and subgroup fixed effects
     plus the matched CTC (round 2's pooled test).
 D1  control difference. The 16 Study 3 pages join Study 2's pool (46 pages; 100
     typical participants rate 16 each, page counts balanced to within one, so
     about 34.8 control ratings per page; one fixed assignment plan, seeded). Per
     subgroup and page: D = subgroup mean TLX - control mean TLX (raw means);
     predictor Delta = matched - generic totalCTC; OLS D ~ 1 + Delta, one-sided
     slope test, df 14. Sensitivity: D ~ 1 + Delta + generic (protects against a
     subgroup that is simply more sensitive to generic demand), df 13. Two page
     sets: D0-B's 16 divergent pages, and 16 pages chosen to maximise the smallest
     across subgroups spread of Delta (exchange search on model scores only).
 D2  D1's outcome pooled over the four subgroups on the same pages: REML mixed
     model D ~ subgroup + Delta + (1|page) (the page intercept carries the control
     mean, common to the four differences on a page), one-sided Satterthwaite test.
 D3  constructed variant pairs: 8 reference pages, each with one variant that
     changes one raw quantity (raw-perturb.ts; candidates from pairs.ts, scored by
     the shipped chain). The 8 (page, variant) pairs maximise the smallest, across
     subgroups, sum of squared Delta_j = (matched_var - matched_orig) -
     (generic_var - generic_orig), distinct pages, exchange search on model scores
     only; a second set of 8 maximises what is left of that sum after projecting out
     the generic difference (for the protected analysis). Every participant rates
     all 16 screens; controls rate each pair as a
     unit (about 34.8 per pair). Outcome per pair = subgroup mean within-participant
     difference (variant - original) minus the same in controls; OLS through the
     origin on Delta (under the null both groups follow the generic CTC and the
     outcome's expectation is 0), df 7. Pair residual correlation rho in {0.5, 0.8,
     0.95}: the share of a page's unexplained workload its variant keeps. Pooled:
     mixed model D ~ 0 + Delta + (1|pair).
 D4  more pages, no other change: D0-B with 32 divergent pages rated by everyone,
     and with 48 divergent pages of which each participant rates 32 (balanced
     within the subgroup; mixed model with (1|participant) + (1|stimulus)). Pages
     chosen by round 2's criterion. Pooled: page and subgroup fixed effects plus
     matched CTC; for 48, REML with (1|participant) + (1|subgroup:page).

SIZE CHECKS (true effect absent): D0/D4 equal matched and generic slopes; D1-D3 a
subgroup that follows the generic CTC (exact null), and one that follows it with
1.5 or 0.5 times the slope ("amplified", "attenuated"). Neither is "matched is
right", but a difference design reads one of them as such whenever Delta correlates
with the generic CTC on the chosen set; the "+ generic covariate" variants (D1:
D ~ 1 + Delta + generic; D2: subgroup-specific generic slopes; D3: through the
origin on Delta and the generic difference) are the protected analyses.

SESSION LENGTH: Study 2's protocol is 16 pages in 30 minutes, 1.875 minutes per
page, fixed costs (consent, calibration) folded in.

Reps: closed-form designs 20,000 per cell, mixed-model designs 2,000 (1,000 for
D4's pooled 48-page model). RNG numpy PCG64, SeedSequence(20261024, spawn_key=cell).

Usage (as the tree's owner, worktree root): python3 -I research/paper-calcs/r3/redesign.py [--procs K] [--quick]

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import csv
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
R2 = os.path.join(HERE, "..", "r2")
sys.path[:0] = [HERE, R2]
sys.dont_write_bytecode = True
import power as pw  # noqa: E402
from lmm import CrossedLMM  # noqa: E402
from lmmk import RandomInterceptLMM, selftest as lmmk_selftest  # noqa: E402

SEED = 20261024
ALPHA = 0.05
SP, SE, SS = 12.0, 16.0, 8.0
RS = [0.3, 0.5, 0.7, 0.9]
PS = [5, 10]
SHARES = [0.25, 0.5, 0.75]
RHOS = [0.5, 0.8, 0.95]
SUB = pw.SUBGROUPS
N2, K2, POOL2 = 100, 16, 46          # Study 2 participants, pages each, pool with the 16 Study 3 pages
MIN_PER_PAGE = 30 / 16
CLOSED, LMMR, LMMR_BIG = 20000, 2000, 1000

CTX = {}


def seeded(cell):
    return np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=(cell,)))


def tcrit(df):
    return stats.t.ppf(1 - ALPHA, df)


# ── Inputs ──

def load():
    urls, arr, humans = pw.load("viewport")
    g = arr[pw.GENERIC]
    M = np.stack([arr[p] for p in SUB])
    idx = {u: i for i, u in enumerate(urls)}
    common, extra = [], []
    with open(os.path.join(R2, "study3-pages-viewport.csv"), newline="") as f:
        for r in csv.DictReader(f):
            (common if r["set"] == "B_common16" else extra).append(idx[r["url"]])
    spread = np.stack([arr[p] for p in humans]).std(axis=0, ddof=1)
    return urls, g, M, np.array(common), np.array(extra), pw.Pools(g, spread)


def load_candidates(urls):
    idx = {u: i for i, u in enumerate(urls)}
    rows = []
    with open(os.path.join(HERE, "candidates-viewport.csv"), newline="") as f:
        for r in csv.DictReader(f):
            if r["factor"] in ("target_size", "contrast"):
                continue
            go, gv = float(r["typical-user_total_orig"]), float(r["typical-user_total_var"])
            mo = [float(r[f"{p}_total_orig"]) for p in SUB]; mv = [float(r[f"{p}_total_var"]) for p in SUB]
            rows.append({"page": idx[r["url"]], "url": r["url"], "factor": r["factor"], "label": r["label"],
                         "metrics_changed": r["metrics_changed"], "g_o": go, "g_v": gv, "m_o": mo, "m_v": mv})
    return rows


def control_plan(rng):
    """One Study 2 assignment over the 46-page pool; Study 3 pages are the last 16. Returns (A: 16 x 100 averaging matrix, n per page)."""
    pid, sid = pw.assign(rng, N2, POOL2, K2)
    A = np.zeros((16, N2)); n = np.zeros(16)
    for p_, s_ in zip(pid, sid):
        if s_ >= POOL2 - 16:
            A[s_ - (POOL2 - 16), p_] += 1; n[s_ - (POOL2 - 16)] += 1
    return A / n[:, None], n


# ── Page selection ──

def exchange_sets(rng, n_items, S, crit, restarts=40, groups=None):
    """Minimise crit(sets: K x S) over S-subsets of n_items by best-swap exchange; groups[i] = item's page (distinct pages)."""
    best, best_val = None, np.inf
    items = np.arange(n_items)
    for _ in range(restarts):
        if groups is None:
            T = rng.choice(n_items, S, replace=False)
        else:
            T = []
            for i in rng.permutation(n_items):
                if groups[i] not in {groups[t] for t in T}:
                    T.append(i)
                if len(T) == S:
                    break
            T = np.array(T)
        cur = crit(T[None, :])[0]
        while True:
            out = np.setdiff1d(items, T)
            cand = np.repeat(T[None, :], S * len(out), axis=0)
            pos = np.repeat(np.arange(S), len(out))
            cand[np.arange(len(cand)), pos] = np.tile(out, S)
            if groups is not None:
                eq = groups[np.tile(out, S)][:, None] == groups[T][None, :]   # new item's page already in the set ...
                eq[np.arange(len(cand)), pos] = False                          # ... other than at the swapped position
                cand = cand[~eq.any(axis=1)]
            vals = crit(cand)
            k = int(np.argmin(vals))
            if vals[k] < cur - 1e-12 * max(1.0, abs(cur)):
                T, cur = np.sort(cand[k]), vals[k]
            else:
                break
        if cur < best_val:
            best, best_val = np.sort(T), cur
    return best, float(best_val)


# ── D0 / D4 within (complete) and pooled: round 2's closed forms ──

def within_complete(rng, zg, zm, b, su, P, reps, gen=(1.0, 0.0)):
    return pw.s3_within_complete(rng, zg, zm, b, su, P, reps, gen=gen)


# ── D0-A (paper as written) and D4-48 (incomplete within subgroup): mixed model per rep ──

def cell_within_incomplete(args):
    cid, design, gi, r, P, b_scale, reps, gen = args
    c = CTX
    rng = seeded(cid)
    g, m = c["g"], c["M"][gi]
    b, su = r * SS / b_scale, SS * np.sqrt(1 - r ** 2)
    hits = 0
    for _ in range(reps):
        if design == "D0-A":
            idx = np.concatenate([c["pools"].draw(rng, "specified", 30), c["extra"]])
            S = len(idx)
            pid30, sid30 = pw.assign(rng, P, 30, 16)
            pid = np.concatenate([pid30, np.repeat(np.arange(P), len(c["extra"]))])
            sid = np.concatenate([sid30, np.tile(np.arange(30, S), P)])
        else:  # D4-48: 48 divergent pages, 32 per participant
            idx = c["d4"][48]; S = len(idx)
            pid, sid = pw.assign(rng, P, S, 32)
        zg, zm = g[idx], m[idx]
        mean_true = gen[0] * b * zm + gen[1] * b * zg
        y = 50 + mean_true[sid] + rng.normal(0, su, S)[sid] + rng.normal(0, SP, P)[pid] + rng.normal(0, SE, len(pid))
        fit = CrossedLMM(pid, sid, P, S).fit(y, np.column_stack([np.ones(len(pid)), zg[sid], zm[sid]]))
        _, _, t, df = fit.contrast([0.0, -1.0, 1.0])
        hits += t > tcrit(df if np.isfinite(df) else S - 3)
    p = hits / reps
    return {"cid": cid, "power": p, "mc_se": float(np.sqrt(p * (1 - p) / reps)), "reps": reps}


def cell_d4_pooled48(args):
    cid, r, P, share, reps = args
    c = CTX
    rng = seeded(cid)
    idx = c["d4"][48]; S = len(idx); G = len(SUB)
    b, su = r * SS / c["sd_g"], SS * np.sqrt(1 - r ** 2)
    Mi = c["M"][:, idx]
    hits = 0
    for _ in range(reps):
        pid_l, sid_l, gid_l = [], [], []
        for gi in range(G):
            pid, sid = pw.assign(rng, P, S, 32)
            pid_l.append(pid + gi * P); sid_l.append(sid); gid_l.append(np.full(len(pid), gi))
        pid, sid, gid = np.concatenate(pid_l), np.concatenate(sid_l), np.concatenate(gid_l)
        u = rng.normal(0, su * np.sqrt(share), S)
        v = rng.normal(0, su * np.sqrt(1 - share), (G, S))
        y = 50 + b * Mi[gid, sid] + u[sid] + v[gid, sid] + rng.normal(0, SP, G * P)[pid] + rng.normal(0, SE, len(pid))
        X = np.column_stack([np.eye(G)[gid], np.eye(S)[sid][:, 1:], Mi[gid, sid]])
        fit = RandomInterceptLMM([(pid, G * P), (gid * S + sid, G * S)]).fit(y, X)
        cvec = np.zeros(X.shape[1]); cvec[-1] = 1
        _, _, t, df = fit.contrast(cvec)
        hits += t > tcrit(df if np.isfinite(df) else 10)
    p = hits / reps
    return {"cid": cid, "power": p, "mc_se": float(np.sqrt(p * (1 - p) / reps)), "reps": reps}


# ── D1 / D2: control difference ──

def d1_draws(rng, T, r, P, share, reps, gen):
    """D (reps x G x S) and Delta (G x S) for page set T, with shared controls."""
    c = CTX
    g, M = c["g"][T], c["M"][:, T]
    G, S = M.shape
    b, su = r * SS / c["sd_g"], SS * np.sqrt(1 - r ** 2)
    sub_mean = {"matched": b * M, "generic": b * np.repeat(g[None, :], G, axis=0),
                "amplified": 1.5 * b * np.repeat(g[None, :], G, axis=0),
                "attenuated": 0.5 * b * np.repeat(g[None, :], G, axis=0)}[gen]
    u = rng.normal(0, su * np.sqrt(share), (reps, 1, S))
    sub = sub_mean[None] + u + rng.normal(0, su * np.sqrt(1 - share), (reps, G, S)) + rng.normal(0, SE / np.sqrt(P), (reps, G, S))
    A, n = c["ctrl_A"], c["ctrl_n"]
    ctrl = (b * g)[None, None, :] + u + rng.normal(0, su * np.sqrt(1 - share), (reps, 1, S)) \
        + (rng.normal(0, SP, (reps, N2)) @ A.T)[:, None, :] + rng.normal(0, 1, (reps, 1, S)) * (SE / np.sqrt(n))[None, None, :]
    return sub - ctrl, M - g[None, :], g


def ols_t_batch(Y, X, c):
    """Row-wise OLS t of c'beta for Y (reps x n) on a fixed X (n x p)."""
    XtX_inv = np.linalg.inv(X.T @ X)
    B = Y @ (X @ XtX_inv)
    R = Y - B @ X.T
    df = X.shape[0] - X.shape[1]
    s2 = (R * R).sum(axis=1) / df
    return (B @ c) / np.sqrt(s2 * (c @ XtX_inv @ c)), df


def d1_within(rng, T, r, P, share, reps, gen="matched", covariate=False):
    D, Delta, g = d1_draws(rng, T, r, P, share, reps, gen)
    out = []
    for gi in range(len(SUB)):
        X = np.column_stack([np.ones(len(T)), Delta[gi]] + ([g] if covariate else []))
        c = np.zeros(X.shape[1]); c[1] = 1
        t, df = ols_t_batch(D[:, gi, :], X, c)
        out.append(float((t > tcrit(df)).mean()))
    return out


def cell_d2(args):
    cid, set_name, r, P, share, reps, gen, covariate = args
    rng = seeded(cid)
    T = CTX["sets"][set_name]
    D, Delta, g = d1_draws(rng, T, r, P, share, reps, gen)
    G, S = Delta.shape
    gid = np.repeat(np.arange(G), S); sid = np.tile(np.arange(S), G)
    cols = [np.eye(G)[gid]] + ([np.eye(G)[gid] * g[sid][:, None]] if covariate else []) + [Delta.reshape(-1)[:, None]]
    X = np.column_stack(cols)
    cvec = np.zeros(X.shape[1]); cvec[-1] = 1
    model = RandomInterceptLMM([(sid, S)])
    hits = 0
    for k in range(reps):
        fit = model.fit(D[k].reshape(-1), X)
        _, _, t, df = fit.contrast(cvec)
        hits += t > tcrit(df if np.isfinite(df) else G * S - G - 1)
    p = hits / reps
    return {"cid": cid, "power": p, "mc_se": float(np.sqrt(p * (1 - p) / reps)), "reps": reps}


# ── D3: variant pairs ──

def d3_noise(r, P, share, rho):
    su = SS * np.sqrt(1 - r ** 2)
    pair = (1 - share) * 2 * (1 - rho) * su ** 2          # one group's (variant - original) specific residual
    n_c = N2 * K2 / POOL2
    return pair + 2 * SE ** 2 / P, pair + 2 * SE ** 2 / n_c   # subgroup side, control side (shared across subgroups)


def d3_within(rng, Delta, gdiff, r, P, share, rho, reps, gen="matched", covariate=False):
    """Per subgroup: OLS through the origin of the pair outcome on Delta (and on the generic difference with covariate)."""
    b = r * SS / CTX["sd_g"]
    vs, vc = d3_noise(r, P, share, rho)
    out = []
    for gi in range(len(SUB)):
        x = Delta[gi]
        mean = {"matched": b * x, "generic": 0 * x, "amplified": 0.5 * b * gdiff, "attenuated": -0.5 * b * gdiff}[gen]
        Y = mean[None, :] + rng.normal(0, np.sqrt(vs + vc), (reps, len(x)))
        X = np.column_stack([x] + ([gdiff] if covariate else []))
        c = np.zeros(X.shape[1]); c[0] = 1
        t, df = ols_t_batch(Y, X, c)
        out.append(float((t > tcrit(df)).mean()))
    return out


def cell_d3_pooled(args):
    cid, set_name, r, P, share, rho, reps, gen = args
    rng = seeded(cid)
    Delta, gdiff = CTX["d3"][set_name]
    G, J = Delta.shape
    b = r * SS / CTX["sd_g"]
    vs, vc = d3_noise(r, P, share, rho)
    mean = {"matched": b * Delta, "generic": 0 * Delta, "amplified": 0.5 * b * np.repeat(gdiff[None, :], G, axis=0),
            "attenuated": -0.5 * b * np.repeat(gdiff[None, :], G, axis=0)}[gen]
    pid = np.tile(np.arange(J), G)
    X = Delta.reshape(-1)[:, None]
    model = RandomInterceptLMM([(pid, J)])
    hits = 0
    for _ in range(reps):
        y = (mean + rng.normal(0, np.sqrt(vc), (1, J)) + rng.normal(0, np.sqrt(vs), (G, J))).reshape(-1)
        fit = model.fit(y, X)
        _, _, t, df = fit.contrast([1.0])
        hits += t > tcrit(df if np.isfinite(df) else G * J - 1)
    p = hits / reps
    return {"cid": cid, "power": p, "mc_se": float(np.sqrt(p * (1 - p) / reps)), "reps": reps}


# ── Main ──

def main():
    args = sys.argv[1:]
    procs = int(args[args.index("--procs") + 1]) if "--procs" in args else max(1, (os.cpu_count() or 2) - 4)
    quick = "--quick" in args
    closed, lmmr, lmmbig = (2000, 60, 30) if quick else (CLOSED, LMMR, LMMR_BIG)
    t0 = time.time()
    urls, g, M, common, extra, pools = load()
    sd_g = float(g.std(ddof=1)); sd_m = M.std(axis=1, ddof=1)
    rng = seeded(10 ** 7)
    CTX.update({"g": g, "M": M, "extra": extra, "pools": pools, "sd_g": sd_g})
    selftest = lmmk_selftest(rng)
    ctrl_A, ctrl_n = control_plan(rng)
    CTX.update({"ctrl_A": ctrl_A, "ctrl_n": ctrl_n})

    # Page sets.
    def d1_crit(sets):
        """Minus the smallest, across subgroups, spread (Sxx) of Delta on the set: D1's information about the slope."""
        vals = []
        for gi in range(len(SUB)):
            x = M[gi][sets] - g[sets]
            vals.append(((x - x.mean(axis=1, keepdims=True)) ** 2).sum(axis=1))
        return -np.min(np.stack(vals), axis=0)
    d1opt, _ = exchange_sets(rng, len(g), 16, d1_crit)
    sets = {"divergent16": common, "delta16": d1opt}
    d4 = {S: pw.exchange(rng, S, g, list(M), sd_m)[0] for S in (32, 48)}
    CTX.update({"sets": sets, "d4": d4})

    cands = load_candidates(urls)
    cg = np.array([c["page"] for c in cands])
    cD = np.array([[(c["m_v"][k] - c["m_o"][k]) - (c["g_v"] - c["g_o"]) for k in range(len(SUB))] for c in cands]).T   # G x C
    cgd = np.array([c["g_v"] - c["g_o"] for c in cands])

    def d3_crit(sets):
        """Minus the smallest, across subgroups, sum of squared Delta: the unprotected analysis's information."""
        return -np.min((cD[:, sets] ** 2).sum(axis=2), axis=0)

    def d3_crit_orth(sets):
        """Minus the smallest, across subgroups, sum of squared Delta left after projecting out the generic difference."""
        x, z = cD[:, sets], cgd[sets][None]
        return -np.min((x ** 2).sum(axis=2) - (x * z).sum(axis=2) ** 2 / np.maximum((z ** 2).sum(axis=2), 1e-12), axis=0)
    pick, _ = exchange_sets(rng, len(cands), 8, d3_crit, groups=cg)
    pick_orth, _ = exchange_sets(rng, len(cands), 8, d3_crit_orth, groups=cg)
    d3sets = {"maxdelta": (cD[:, pick], cgd[pick]), "orthogonal": (cD[:, pick_orth], cgd[pick_orth])}
    CTX.update({"d3": d3sets})

    out = {"provenance": pw.provenance(), "seed": SEED, "alpha": ALPHA, "lmmk_selftest": selftest,
           "assumptions": {"sp": SP, "se": SE, "sS": SS, "slope": "common: beta = r sS / SD_ref(typical CTC), each group on its own CTC",
                           "shares": SHARES, "rhos": RHOS, "control_raters_per_page": float(ctrl_n.mean()),
                           "control_raters_range": [float(ctrl_n.min()), float(ctrl_n.max())],
                           "minutes_per_page": MIN_PER_PAGE, "reps": {"closed_form": closed, "mixed_model": lmmr, "d4_pooled48": lmmbig}},
           "sd_ref": {"typical-user": sd_g, **{p: float(s) for p, s in zip(SUB, sd_m)}}}
    corr = lambda a, b: float(np.corrcoef(a, b)[0, 1])
    out["sets"] = {
        name: {"pages": [urls[i] for i in T],
               "corr_matched_generic": {p: corr(M[k][T], g[T]) for k, p in enumerate(SUB)},
               "corr_delta_generic": {p: corr(M[k][T] - g[T], g[T]) for k, p in enumerate(SUB)},
               "sd_delta": {p: float((M[k][T] - g[T]).std(ddof=1)) for k, p in enumerate(SUB)}}
        for name, T in {**sets, "d4_32": d4[32], "d4_48": d4[48]}.items()}
    def describe(ix):
        md = np.array([[cands[i]["m_v"][k] - cands[i]["m_o"][k] for i in ix] for k in range(len(SUB))])
        gd = cgd[ix]
        sg = np.concatenate([[cands[i]["g_o"] for i in ix], [cands[i]["g_v"] for i in ix]])
        sm = [np.concatenate([[cands[i]["m_o"][k] for i in ix], [cands[i]["m_v"][k] for i in ix]]) for k in range(len(SUB))]
        return {
            "pairs": [{"url": cands[i]["url"], "factor": cands[i]["factor"], "label": cands[i]["label"], "metrics_changed": cands[i]["metrics_changed"],
                       "generic_diff": float(cgd[i]), **{f"{p}_matched_minus_generic": float(cD[k, i]) for k, p in enumerate(SUB)}} for i in ix],
            "corr_matched_diff_vs_generic_diff": {p: corr(md[k], gd) for k, p in enumerate(SUB)},
            "corr_delta_vs_generic_diff": {p: corr(cD[k, ix], gd) for k, p in enumerate(SUB)},
            "corr_matched_generic_over_16_screens": {p: corr(sm[k], sg) for k, p in enumerate(SUB)},
            "sum_sq_delta": {p: float((cD[k, ix] ** 2).sum()) for k, p in enumerate(SUB)}}
    out["d3_pairs"] = {"candidates": len(cands), "maxdelta": describe(pick), "orthogonal": describe(pick_orth)}

    rows = []

    def rec(design, variant, who, P, r, power, mc_se, reps, share=None, rho=None, **extra_):
        rows.append({"design": design, "variant": variant, "who": who, "P": P, "r": r, "share": share, "rho": rho,
                     "power": power, "mc_se": mc_se, "reps": reps, **extra_})

    # Closed-form cells.
    ccell = [0]

    def crng():
        ccell[0] += 1
        return seeded(10 ** 6 + ccell[0])
    for P in PS:
        for r in RS:
            su = SS * np.sqrt(1 - r ** 2)
            for k, p in enumerate(SUB):
                for scale_name, scale in (("common", sd_g), ("round2", sd_m[k])):
                    pv = within_complete(crng(), g[common], M[k][common], r * SS / scale, su, P, closed)
                    rec("D0-B", f"16 divergent, {scale_name} slope", p, P, r, pv, np.sqrt(pv * (1 - pv) / closed), closed)
                for S in (32,):
                    pv = within_complete(crng(), g[d4[S]], M[k][d4[S]], r * SS / sd_g, su, P, closed)
                    rec("D4", f"{S} divergent, all rated", p, P, r, pv, np.sqrt(pv * (1 - pv) / closed), closed)
            for share in SHARES:
                for set_name, T in sets.items():
                    for cov in (False, True):
                        pvs = d1_within(crng(), T, r, P, share, closed, covariate=cov)
                        for k, p in enumerate(SUB):
                            rec("D1", f"{set_name}{' + generic covariate' if cov else ''}", p, P, r, pvs[k], np.sqrt(pvs[k] * (1 - pvs[k]) / closed), closed, share=share)
                bg = np.full(len(SUB), r * SS / sd_g)
                pv = pw.s3_pooled(crng(), M[:, common], bg, su, P, closed // 4, share=share)
                rec("D0-B", "16 divergent, common slope", "pooled", P, r, pv, np.sqrt(pv * (1 - pv) / (closed // 4)), closed // 4, share=share)
                pv = pw.s3_pooled(crng(), M[:, d4[32]], bg, su, P, closed // 4, share=share)
                rec("D4", "32 divergent, all rated", "pooled", P, r, pv, np.sqrt(pv * (1 - pv) / (closed // 4)), closed // 4, share=share)
                for rho in RHOS:
                    for set_name, (dD, dg) in d3sets.items():
                        for cov in (False, True):
                            pvs = d3_within(crng(), dD, dg, r, P, share, rho, closed, covariate=cov)
                            for k, p in enumerate(SUB):
                                rec("D3", f"{set_name}{' + generic covariate' if cov else ''}", p, P, r, pvs[k], np.sqrt(pvs[k] * (1 - pvs[k]) / closed), closed, share=share, rho=rho)
    # Closed-form size checks.
    size = {}
    for P in PS:
        for set_name, T in sets.items():
            for gen in ("generic", "amplified", "attenuated"):
                for cov in (False, True):
                    pvs = d1_within(crng(), T, 0.7, P, 0.5, closed, gen=gen, covariate=cov)
                    size[f"D1 {set_name}{' +cov' if cov else ''} P{P} {gen}"] = dict(zip(SUB, pvs))
        for gen in ("generic", "amplified", "attenuated"):
            for set_name, (dD, dg) in d3sets.items():
                for cov in (False, True):
                    pvs = d3_within(crng(), dD, dg, 0.7, P, 0.5, 0.8, closed, gen=gen, covariate=cov)
                    size[f"D3 {set_name}{' +cov' if cov else ''} P{P} {gen}"] = dict(zip(SUB, pvs))
        for k, p in enumerate(SUB):
            su7 = SS * np.sqrt(1 - 0.49)
            size.setdefault(f"D0-B P{P} equal slopes", {})[p] = within_complete(crng(), g[common], M[k][common], 0.7 * SS / sd_g, su7, P, closed, gen=(0.5, 0.5))
            size.setdefault(f"D4-32 P{P} equal slopes", {})[p] = within_complete(crng(), g[d4[32]], M[k][d4[32]], 0.7 * SS / sd_g, su7, P, closed, gen=(0.5, 0.5))

    # Mixed-model cells, in a pool.
    jobs, meta = [], []

    def job(fn, args_, **m_):
        jobs.append((fn, (len(jobs) + 1,) + args_)); meta.append(m_)
    for P in PS:
        for r in RS:
            for k, p in enumerate(SUB):
                job(cell_within_incomplete, ("D0-A", k, r, P, sd_g, lmmr, (1.0, 0.0)), design="D0-A", variant="as written, common slope", who=p, P=P, r=r)
                job(cell_within_incomplete, ("D4-48", k, r, P, sd_g, lmmr, (1.0, 0.0)), design="D4", variant="48 divergent, 32 each", who=p, P=P, r=r)
            for share in SHARES:
                for set_name in sets:
                    job(cell_d2, (set_name, r, P, share, lmmr, "matched", False), design="D2", variant=set_name, who="pooled", P=P, r=r, share=share)
                    job(cell_d2, (set_name, r, P, share, lmmr, "matched", True), design="D2", variant=f"{set_name} + generic covariate", who="pooled", P=P, r=r, share=share)
                for rho in RHOS:
                    for set_name in d3sets:
                        job(cell_d3_pooled, (set_name, r, P, share, rho, lmmr, "matched"), design="D3", variant=set_name, who="pooled", P=P, r=r, share=share, rho=rho)
            job(cell_d4_pooled48, (r, P, 0.5, lmmbig), design="D4", variant="48 divergent, 32 each", who="pooled", P=P, r=r, share=0.5)
        for k, p in enumerate(SUB):
            job(cell_within_incomplete, ("D0-A", k, 0.7, P, sd_g, lmmr, (0.5, 0.5)), size=f"D0-A P{P} equal slopes", who=p)
            job(cell_within_incomplete, ("D4-48", k, 0.7, P, sd_g, lmmr, (0.5, 0.5)), size=f"D4-48 P{P} equal slopes", who=p)
        for set_name in sets:
            for gen in ("generic", "amplified", "attenuated"):
                for cov in (False, True):
                    job(cell_d2, (set_name, 0.7, P, 0.5, lmmr, gen, cov), size=f"D2 {set_name}{' +cov' if cov else ''} P{P} {gen}", who="pooled")
        for gen in ("generic", "amplified", "attenuated"):
            for set_name in d3sets:
                job(cell_d3_pooled, (set_name, 0.7, P, 0.5, 0.8, lmmr, gen), size=f"D3 {set_name} P{P} {gen}", who="pooled")
    print(f"{len(jobs)} mixed-model cells on {procs} processes ...", flush=True)
    with mp.get_context("fork").Pool(procs) as pool:
        res = pool.starmap(_run, [(fn, a) for fn, a in jobs], chunksize=1)
    for m_, r_ in zip(meta, res):
        if "size" in m_:
            size.setdefault(m_["size"], {})[m_["who"]] = r_["power"]
        else:
            rec(m_["design"], m_["variant"], m_["who"], m_["P"], m_["r"], r_["power"], r_["mc_se"], r_["reps"], share=m_.get("share"), rho=m_.get("rho"))
    out["size_checks"] = size
    out["session_minutes"] = {"D0-A": 19 * MIN_PER_PAGE, "D0-B": 16 * MIN_PER_PAGE, "D1/D2 subgroup": 16 * MIN_PER_PAGE,
                              "D1/D2/D3 controls (Study 2, unchanged)": 16 * MIN_PER_PAGE, "D3": 16 * MIN_PER_PAGE,
                              "D4 (32 or 48-of-32)": 32 * MIN_PER_PAGE}
    # Study 2 with 16 more pages in its pool: 30 pages now seen by ~34.8 raters, as a 30-page design with N = 65.
    s2 = pw.s2_cell((9 * 10 ** 6, "specified", 65, 30, 0.5, 8.0, lmmr, {"pools": pools, "ctc": g, "mu": float(g.mean()), "sd": sd_g}))
    out["study2_with_pool46"] = {"equivalent_N": 65, "power_r05": s2["power"], "mc_se": s2["mc_se"], "reps": s2["reps"]}
    out["rows"] = rows
    out["seconds"] = round(time.time() - t0, 1)
    suffix = "-quick" if quick else ""
    with open(os.path.join(HERE, f"redesign-viewport{suffix}.json"), "w") as f:
        json.dump(out, f, indent=1, default=float)
        f.write("\n")
    with open(os.path.join(HERE, f"redesign-viewport{suffix}.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["design", "variant", "who", "P", "r", "share", "rho", "power", "mc_se", "reps"])
        w.writeheader()
        for r_ in rows:
            w.writerow({k: (f"{v:.4f}" if isinstance(v, float) else v) for k, v in r_.items()})
    summary(out)


def _run(fn, a):
    return fn(a)


def summary(out):
    rows = out["rows"]
    pv = lambda **k: next((r["power"] for r in rows if all(r.get(a) == b for a, b in k.items())), None)
    print(f"git {out['provenance']['git_head'][:7]}; lmmk self-test {out['lmmk_selftest']}; control raters per page {out['assumptions']['control_raters_per_page']:.1f}")
    for name, s in out["sets"].items():
        print(f"  set {name}: corr(matched, generic) {', '.join(f'{v:.2f}' for v in s['corr_matched_generic'].values())}; "
              f"corr(Delta, generic) {', '.join(f'{v:.2f}' for v in s['corr_delta_generic'].values())}; sd(Delta) {', '.join(f'{v:.3f}' for v in s['sd_delta'].values())}")
    for name in ("maxdelta", "orthogonal"):
        d3 = out["d3_pairs"][name]
        print(f"  D3 {name} pairs: " + "; ".join(f"{p['url']} {p['label'][:24]}" for p in d3["pairs"]))
        print(f"    corr(matched diff, generic diff) {', '.join(f'{v:.2f}' for v in d3['corr_matched_diff_vs_generic_diff'].values())}; "
              f"corr(Delta, generic diff) {', '.join(f'{v:.2f}' for v in d3['corr_delta_vs_generic_diff'].values())}; "
              f"over 16 screens corr(matched, generic) {', '.join(f'{v:.2f}' for v in d3['corr_matched_generic_over_16_screens'].values())}")
    for P in PS:
        print(f"\nP = {P} per subgroup; columns r = {RS}; ADHD / dyslexic / low vision / elderly | pooled")
        lines = [("D0-A as written", dict(design="D0-A", variant="as written, common slope"), None),
                 ("D0-B 16 div (common)", dict(design="D0-B", variant="16 divergent, common slope"), dict(design="D0-B", variant="16 divergent, common slope", share=0.5)),
                 ("D0-B 16 div (round2)", dict(design="D0-B", variant="16 divergent, round2 slope"), None)]
        for set_name in ("divergent16", "delta16"):
            for sh in SHARES:
                lines.append((f"D1 {set_name} s{sh}", dict(design="D1", variant=set_name, share=sh), dict(design="D2", variant=set_name, share=sh)))
                lines.append((f"D1 {set_name} +cov s{sh}", dict(design="D1", variant=f"{set_name} + generic covariate", share=sh),
                              dict(design="D2", variant=f"{set_name} + generic covariate", share=sh)))
        for sh in SHARES:
            for rho in RHOS:
                for set_name in ("maxdelta", "orthogonal"):
                    lines.append((f"D3 {set_name[:4]} s{sh} rho{rho}", dict(design="D3", variant=set_name, share=sh, rho=rho), dict(design="D3", variant=set_name, share=sh, rho=rho)))
                    lines.append((f"D3 {set_name[:4]} +cov s{sh} r{rho}", dict(design="D3", variant=f"{set_name} + generic covariate", share=sh, rho=rho), None))
        lines.append(("D4 32 all", dict(design="D4", variant="32 divergent, all rated"), dict(design="D4", variant="32 divergent, all rated", share=0.5)))
        lines.append(("D4 48 of 32", dict(design="D4", variant="48 divergent, 32 each"), dict(design="D4", variant="48 divergent, 32 each", share=0.5)))
        for label, wk, pk in lines:
            cells = []
            for r in RS:
                subs = [pv(**wk, who=p, P=P, r=r) for p in SUB]
                pooled = pv(**pk, who="pooled", P=P, r=r) if pk else None
                cells.append("/".join("-" if x is None else f"{x:.2f}" for x in subs) + ("" if pooled is None else f"|{pooled:.2f}"))
            print(f"  {label:24s} " + "   ".join(cells))
    print("\nsize checks: " + json.dumps({k: {a: round(b, 3) for a, b in v.items()} for k, v in out["size_checks"].items()}))
    print(f"Study 2 with the 46-page pool (N-equivalent 65): power {out['study2_with_pool46']['power_r05']:.3f}")
    print(f"session minutes: {out['session_minutes']}")
    print(f"done in {out['seconds']} s")


if __name__ == "__main__":
    main()
