"""
Round 2 power simulation for Studies 2 and 3 as now designed, under the
assumptions written here. It says what the designs could detect if these
assumptions held, not what the studies will find.

INPUT: ctc-scores.csv (typical-user.ts): the shipped model's totalCTC (a
percentile of the pooled reference) for the typical user and every built-in
human persona on each graded reference page. Viewport scope by default: Study 2
shows static screenshots of the first screen, so viewport is what participants
see; --scope full_page repeats everything.

COMMON ASSUMPTIONS
  - Outcome: a 0-100 NASA-TLX subset, normal and unbounded (no floor/ceiling).
  - Participant intercept SD sp = 12, residual SD se = 16 (total 20), as round 1:
    no published NASA-TLX variance components were found; the total is anchored
    on the raw global TLX interquartile ranges of Said et al. 2020 (J Med
    Internet Res 22(9):e19472), 27 and 31 points, i.e. SDs of about 20-23.
  - sS = SD of true page mean TLX over pages drawn from the reference
    distribution: 8 TLX points primary, 4 and 12 as sensitivity.
  - Effect size r (delta): the correlation, over pages drawn from the reference
    distribution, between the predictor CTC and a page's true mean TLX.
    The predictor's slope is b = r sS / SD_ref(CTC); the stimulus residual
    (what CTC does not explain) has SD sS sqrt(1 - r^2).
  - New pages behave like reference pages: a stimulus is drawn by drawing a
    reference page (with replacement, so S may exceed the pool) and giving it a
    fresh stimulus residual.
  - alpha 0.05; Study 2 two-sided, Study 3 one-sided (matched > generic is
    directional).

STUDY 2 (Section 5.2): 30 pages, each participant sees 16, assigned so every
page is seen by the same number of participants to within one (each participant
takes the 16 least-seen pages, ties broken at random). Predictor: the typical
user's totalCTC. Outcome model
    Y_ps = 50 + b z_s + u_s + p_p + e_ps.
Analysis (2a as specified): REML mixed model NASA_TLX ~ CTC + (1|participant) +
(1|stimulus), two-sided t-test of the CTC slope with Satterthwaite df (lmm.py;
checked against the balanced-design identity before anything runs).
Page selection:
  specified     the paper's bands on the typical user's totalCTC: 10 below 0.25,
                10 in [0.40, 0.60], 9 above 0.75, plus 1 page drawn from the
                decile of reference pages with the largest spread (SD) of
                totalCTC across the 25 personas;
  own-quantile  the same counts on the typical user's own quantiles over the
                reference pages (below its q25, q40-q60, above its q75);
  random        30 reference pages.
Reported: power at N = 100 (the paper's usable N), power over a grid of N, the
smallest N with 80% power (linear interpolation between grid points), the
asymptote as N -> infinity (page means known exactly: OLS on 30 true means,
df 28), and, at N = 100 and 16 per participant, power as the page count grows.

STUDY 3 (Section 5.3): 4 subgroups (cognitive-adhd, dyslexic-user,
low-vision-magnified, elderly-user) x 5 participants. Generic = typical user,
matched = the subgroup's persona, both on their native totalCTC scale in the
analysis (the coefficients are compared, so the scale must be common). Outcome
model within subgroup g:
    Y_gps = a_g + b_g m_gs + u_s + v_gs + p_gp + e_gps
with the scenario "matched is right": b_g = r sS / SD_ref(m_g), generic slope 0;
u_s shared across subgroups and v_gs subgroup-specific, each carrying half the
stimulus residual variance (only the pooled test depends on that split).
Designs:
  B, divergent 16  every participant rates the same 16 pages, chosen from the
                   reference pages by the model's own scores alone: the 16 that
                   minimise the largest, over the four subgroups, of
                   SD_ref(m_g)^2 x c'(X_g'X_g)^-1 c, c = (0, -1, 1),
                   X_g = [1, generic, matched_g] (i.e. maximise the smallest
                   noncentrality of the matched-minus-generic contrast), found
                   by an exchange search from 40 seeded random starts.
  B, random 16     16 reference pages at random, for comparison.
  B, own-16        each subgroup gets its own 16 pages by the same criterion for
                   that subgroup alone: an upper bound, not the protocol (the
                   protocol shows every participant the same captures).
  A, as written    Study 2's protocol (30 specified pages, 16 per participant)
                   plus the 3 pages with the largest sum over subgroups of the
                   squared standardised residual of matched on generic CTC, seen
                   by everyone: 19 ratings per participant.
Analyses: within each subgroup, NASA_TLX ~ matched + generic, one-sided test of
matched - generic > 0. For B (complete data) this is OLS on the 16 stimulus
means, df 13, exactly the mixed model with (1|stimulus) (+ (1|participant)) by
the identity lmm.py tests; for A (incomplete) the REML mixed model with
(1|participant) + (1|stimulus) and Satterthwaite df. Secondary, B only: the four
subgroups' stimulus means pooled, stimulus and subgroup fixed effects plus the
matched CTC, one-sided test of its slope (incremental validity of the matched
score; it also rejects when both slopes are positive).
Size checks: matched and generic slopes equal (contrast null) and generic only.

RNG: numpy Generator(PCG64); every cell gets its own stream from
SeedSequence(20261023, spawn_key=(cell,)), so a rerun reproduces every digit
regardless of how the pool schedules cells. Monte Carlo SE of a power p over R
reps is sqrt(p (1 - p) / R), reported per cell.

Usage (as the tree's owner, worktree root):
  python3 -I research/paper-calcs/r2/power.py [--scope viewport|full_page] [--reps 1000] [--procs K] [--quick]

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import csv
import json
import multiprocessing as mp
import os
import platform
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

# One BLAS thread per worker: the work is many small matrices, and a pool of
# multithreaded BLAS processes spends its time contending for cores.
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import numpy as np  # noqa: E402
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # lmm.py, alongside; -I keeps the script directory off sys.path
sys.dont_write_bytecode = True  # no __pycache__ in the tree
from lmm import CrossedLMM, lmm_selftest  # noqa: E402

SEED = 20261023
ALPHA = 0.05
SP, SE = 12.0, 16.0
GENERIC = "typical-user"
SUBGROUPS = ["cognitive-adhd", "dyslexic-user", "low-vision-magnified", "elderly-user"]
S2_PAGES, S2_PER, S2_N = 30, 16, 100
N_GRID = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200]
S_GRID = [30, 40, 50, 60, 80, 100, 120]
S3_PAGES, S3_P, S3_DIVERGENT_A = 16, 5, 3
S3_DELTAS = [0.3, 0.5, 0.7, 0.9]
S3_P_GRID = [5, 10, 20, 40]


def provenance():
    g = lambda *a: subprocess.run(["git", *a], cwd=HERE, capture_output=True, text=True, check=True).stdout.strip()
    return {"git_head": g("rev-parse", "HEAD"), "git_branch": g("rev-parse", "--abbrev-ref", "HEAD"),
            "src_tree": g("rev-parse", "HEAD:src"), "src_dirty": bool(g("status", "--porcelain", "--", ":/src")),
            "ran": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "runtime": f"python {platform.python_version()}, numpy {np.__version__}"}


# ── Inputs ──

def load(scope):
    by = defaultdict(dict)
    with open(os.path.join(HERE, "ctc-scores.csv"), newline="") as f:
        for r in csv.DictReader(f):
            if r["scope"] == scope:
                by[r["persona"]][r["url"]] = float(r["total_ctc"])
    urls = sorted(by[GENERIC])
    arr = {p: np.array([by[p][u] for u in urls]) for p in by}
    humans = [p for p in arr if not p.startswith("typical-user")]
    return urls, arr, humans


class Pools:
    """Page pools for Study 2's selections, over the reference pages."""

    def __init__(self, generic, spread):
        self.n = len(generic)
        q = np.quantile(generic, [0.25, 0.40, 0.60, 0.75])
        self.bands = {
            "specified": (np.where(generic < 0.25)[0], np.where((generic >= 0.40) & (generic <= 0.60))[0], np.where(generic > 0.75)[0]),
            "own-quantile": (np.where(generic < q[0])[0], np.where((generic >= q[1]) & (generic <= q[2]))[0], np.where(generic > q[3])[0]),
        }
        self.own_quantiles = q
        self.diff = np.where(spread >= np.quantile(spread, 0.9))[0]

    def draw(self, rng, selection, S):
        if selection == "random":
            return rng.integers(0, self.n, S)
        low, mid, high = self.bands[selection]
        nl = nm = int(round(S / 3))
        nh = S - nl - nm - 1
        return np.concatenate([rng.choice(low, nl), rng.choice(mid, nm), rng.choice(high, nh), rng.choice(self.diff, 1)])


def assign(rng, N, S, k):
    """Each participant takes the k least-seen pages, ties at random: page counts differ by at most one."""
    counts = np.zeros(S)
    rows = []
    for _ in range(N):
        pick = np.lexsort((rng.random(S), counts))[:k]
        counts[pick] += 1
        rows.append(pick)
    return np.repeat(np.arange(N), k), np.concatenate(rows)


# ── Study 2 ──

def s2_cell(args):
    cell, selection, N, S, delta, sS, reps, ctx = args
    rng = np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=(cell,)))
    pools, ctc, mu, sd = ctx["pools"], ctx["ctc"], ctx["mu"], ctx["sd"]
    b, su = delta * sS, sS * np.sqrt(1 - delta ** 2)
    hits, dfs, boundary, nonconv = 0, [], 0, 0
    for _ in range(reps):
        z = (ctc[pools.draw(rng, selection, S)] - mu) / sd
        pid, sid = assign(rng, N, S, S2_PER)
        y = 50 + b * z[sid] + rng.normal(0, su, S)[sid] + rng.normal(0, SP, N)[pid] + rng.normal(0, SE, len(pid))
        m = CrossedLMM(pid, sid, N, S).fit(y, np.column_stack([np.ones(len(pid)), z[sid]]))
        _, _, t, df = m.contrast([0.0, 1.0])
        if not np.isfinite(df):
            df = S - 2.0
        hits += abs(t) > stats.t.ppf(1 - ALPHA / 2, df)
        dfs.append(df)
        boundary += min(m.gamma) < 1e-6
        nonconv += not m.converged
    p = hits / reps
    return {"cell": cell, "selection": selection, "N": N, "S": S, "delta": delta, "sS": sS, "reps": reps,
            "power": p, "mc_se": float(np.sqrt(p * (1 - p) / reps)), "df_median": float(np.median(dfs)),
            "boundary_fits": int(boundary), "nonconverged": int(nonconv)}


def s2_asymptote(rng, pools, ctc, mu, sd, selection, S, delta, reps=20000):
    """N -> infinity: the 30 page means are known exactly; OLS t on S - 2 df."""
    hits = 0
    crit = stats.t.ppf(1 - ALPHA / 2, S - 2)
    for _ in range(reps):
        z = (ctc[pools.draw(rng, selection, S)] - mu) / sd
        y = delta * z + rng.normal(0, np.sqrt(1 - delta ** 2), S)
        zc = z - z.mean(); yc = y - y.mean()
        bh = (zc @ yc) / (zc @ zc)
        r = yc - bh * zc
        hits += abs(bh / np.sqrt((r @ r) / (S - 2) / (zc @ zc))) > crit
    return hits / reps


def fmt(x):
    return "-" if x is None else f"{x:.2f}"


def crossing(curve, xkey):
    """First x on the grid with power >= 0.8, linearly interpolated; None if never."""
    for a, b in zip(curve, curve[1:]):
        if a["power"] >= 0.8:
            return float(a[xkey])
        if b["power"] >= 0.8:
            return float(a[xkey] + (0.8 - a["power"]) * (b[xkey] - a[xkey]) / (b["power"] - a["power"]))
    return None


# ── Study 3 ──

def contrast_var_sets(sets, zg, Zm, sdm):
    """For K candidate page sets (K x S indices): SD_ref(m_g)^2 c'(X_g'X_g)^-1 c per subgroup (K x G)."""
    K, S = sets.shape
    out = np.empty((K, len(Zm)))
    ones = np.ones((K, S))
    for g, zm in enumerate(Zm):
        X = np.stack([ones, zg[sets], zm[sets]], axis=2)
        XtX = np.einsum("ksi,ksj->kij", X, X)
        inv = np.linalg.inv(XtX)
        out[:, g] = sdm[g] ** 2 * (inv[:, 1, 1] + inv[:, 2, 2] - 2 * inv[:, 1, 2])
    return out


def exchange(rng, S, zg, Zm, sdm, restarts=40):
    """Minimax exchange search: the S pages minimising the largest scaled contrast variance."""
    N = len(zg)
    best, best_val = None, np.inf
    for _ in range(restarts):
        T = rng.choice(N, S, replace=False)
        cur = contrast_var_sets(T[None, :], zg, Zm, sdm).max()
        while True:
            out = np.setdiff1d(np.arange(N), T)
            cand = np.repeat(T[None, :], S * len(out), axis=0)
            cand[np.arange(S * len(out)), np.repeat(np.arange(S), len(out))] = np.tile(out, S)
            vals = contrast_var_sets(cand, zg, Zm, sdm).max(axis=1)
            k = int(np.argmin(vals))
            if vals[k] < cur * (1 - 1e-12):
                T, cur = np.sort(cand[k]), vals[k]
            else:
                break
        if cur < best_val:
            best, best_val = np.sort(T), cur
    return best, float(best_val)


def residual_divergence(zg, Zm):
    """Per page: sum over subgroups of the squared standardised residual of matched on generic CTC."""
    D = np.zeros(len(zg))
    for zm in Zm:
        b = np.polyfit(zg, zm, 1)
        r = zm - np.polyval(b, zg)
        D += (r / r.std(ddof=1)) ** 2
    return D


def s3_within_complete(rng, zg, zm, b, su, P, reps, gen=(1.0, 0.0)):
    """Design B, one subgroup, complete data: OLS of S stimulus means on [1, generic, matched], one-sided contrast."""
    S = len(zg)
    X = np.column_stack([np.ones(S), zg, zm])
    XtX_inv = np.linalg.inv(X.T @ X)
    c = np.array([0.0, -1.0, 1.0])
    vc = c @ XtX_inv @ c
    mean_true = gen[0] * b * zm + gen[1] * b * zg
    noise = rng.normal(0, su, (reps, S)) + (rng.normal(0, SE / np.sqrt(P), (reps, S)) if np.isfinite(P) else 0.0)
    Y = mean_true[None, :] + noise
    beta = Y @ (X @ XtX_inv)            # reps x 3
    R = Y - beta @ X.T
    s2 = (R * R).sum(axis=1) / (S - 3)
    t = (beta @ c) / np.sqrt(s2 * vc)
    return float((t > stats.t.ppf(1 - ALPHA, S - 3)).mean())


def s3_pooled(rng, zm_sets, b_g, su, P, reps, share=0.5, gen_generic=None):
    """Design B pooled: G subgroups x S stimulus means, stimulus FE + subgroup FE + matched slope, one-sided."""
    G, S = zm_sets.shape
    df = G * S - S - (G - 1) - 1
    crit = stats.t.ppf(1 - ALPHA, df)

    def within(a):
        return a - a.mean(axis=-2, keepdims=True) - a.mean(axis=-1, keepdims=True) + a.mean(axis=(-2, -1), keepdims=True)

    xw = within(zm_sets)
    sxx = (xw * xw).sum()
    mean_true = (b_g[:, None] * zm_sets) if gen_generic is None else np.repeat(gen_generic[None, :], G, axis=0)
    u = rng.normal(0, su * np.sqrt(share), (reps, 1, S))
    v = rng.normal(0, su * np.sqrt(1 - share), (reps, G, S))
    e = rng.normal(0, SE / np.sqrt(P), (reps, G, S))
    Y = mean_true[None] + u + v + e + rng.normal(0, 5, (reps, G, 1))
    yw = within(Y)
    bh = (yw * xw[None]).sum(axis=(1, 2)) / sxx
    res = yw - bh[:, None, None] * xw[None]
    s2 = (res * res).sum(axis=(1, 2)) / df
    return float((bh / np.sqrt(s2 / sxx) > crit).mean())


def s3a_cell(args):
    """Design A (paper as written), one subgroup: incomplete data, REML mixed model, one-sided contrast."""
    cell, g, delta, sS, reps, ctx, gen = args
    rng = np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=(cell,)))
    pools, zg_all, zm_all, sd_m, extra = ctx["pools"], ctx["zg"], ctx["Zm"][g], ctx["sdm"][g], ctx["extra"]
    b, su = delta * sS / sd_m, sS * np.sqrt(1 - delta ** 2)
    S = S2_PAGES + len(extra)
    hits, nonconv = 0, 0
    for _ in range(reps):
        idx = np.concatenate([pools.draw(rng, "specified", S2_PAGES), extra])
        zg, zm = zg_all[idx], zm_all[idx]
        pid30, sid30 = assign(rng, S3_P, S2_PAGES, S2_PER)
        pid = np.concatenate([pid30, np.repeat(np.arange(S3_P), len(extra))])
        sid = np.concatenate([sid30, np.tile(np.arange(S2_PAGES, S), S3_P)])
        mean_true = gen[0] * b * zm + gen[1] * b * zg
        y = 50 + mean_true[sid] + rng.normal(0, su, S)[sid] + rng.normal(0, SP, S3_P)[pid] + rng.normal(0, SE, len(pid))
        m = CrossedLMM(pid, sid, S3_P, S).fit(y, np.column_stack([np.ones(len(pid)), zg[sid], zm[sid]]))
        _, _, t, df = m.contrast([0.0, -1.0, 1.0])
        if not np.isfinite(df):
            df = S - 3.0
        hits += t > stats.t.ppf(1 - ALPHA, df)
        nonconv += not m.converged
    p = hits / reps
    return {"cell": cell, "persona": SUBGROUPS[g], "delta": delta, "sS": sS, "reps": reps, "power": p,
            "mc_se": float(np.sqrt(p * (1 - p) / reps)), "nonconverged": int(nonconv), "gen": list(gen)}


# ── Main ──

def main():
    args = sys.argv[1:]
    scope = args[args.index("--scope") + 1] if "--scope" in args else "viewport"
    reps = int(args[args.index("--reps") + 1]) if "--reps" in args else 1000
    procs = int(args[args.index("--procs") + 1]) if "--procs" in args else max(1, (os.cpu_count() or 2) - 4)
    quick = "--quick" in args
    if quick:
        reps = 60
    t_start = time.time()
    urls, arr, humans = load(scope)
    generic = arr[GENERIC]
    spread = np.stack([arr[p] for p in humans]).std(axis=0, ddof=1)
    pools = Pools(generic, spread)
    mu, sd = float(generic.mean()), float(generic.std(ddof=1))
    rng = np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=(10 ** 6,)))
    selftest = lmm_selftest(rng)
    out = {"provenance": provenance(), "scope": scope, "reps_default": reps, "seed": SEED, "alpha": ALPHA,
           "assumptions": {"sp": SP, "se": SE, "sS_primary": 8.0, "sS_sensitivity": [4.0, 12.0],
                           "study2": {"pages": S2_PAGES, "per_participant": S2_PER, "N_paper": S2_N, "predictor": GENERIC,
                                      "analysis": "REML LMM y ~ CTC + (1|participant) + (1|stimulus), two-sided Satterthwaite t"},
                           "study3": {"pages_B": S3_PAGES, "per_subgroup": S3_P, "subgroups": SUBGROUPS, "generic": GENERIC,
                                      "stimulus_residual_shared_share": 0.5},
                           "anchor": "Said et al. 2020 J Med Internet Res 22(9):e19472, raw global TLX IQR 27 and 31 points"},
           "lmm_selftest": selftest}
    with open(os.path.join(HERE, "typical-user.json")) as f:
        out["scores_provenance"] = json.load(f)["provenance"]
    out["generic_ctc"] = {"pages": len(generic), "mean": mu, "sd": sd,
                          "quantiles": {f"q{q}": float(np.quantile(generic, q / 100)) for q in (0, 25, 40, 50, 60, 75, 100)}}
    out["study2_pools"] = {k: {"low": len(v[0]), "mid": len(v[1]), "high": len(v[2])} for k, v in pools.bands.items()}
    out["study2_pools"]["differentiation_decile"] = len(pools.diff)
    out["study2_pools"]["own_quantile_cutpoints"] = [float(x) for x in pools.own_quantiles]
    print(f"[{scope}] git {out['provenance']['git_head'][:7]} src {out['provenance']['src_tree'][:7]}; typical-user CTC over {len(generic)} pages: "
          f"mean {mu:.3f} sd {sd:.3f}; LMM self-test passes (max rel t err {selftest['max_rel_t_error']:.1e}, max df err {selftest['max_abs_df_error']:.3f})")
    print(f"  Study 2 pools: {out['study2_pools']}")

    ctx2 = {"pools": pools, "ctc": generic, "mu": mu, "sd": sd}
    cells, cid = [], 0

    def add(selection, N, S, delta, sS, r):
        nonlocal cid
        cells.append((cid, selection, N, S, delta, sS, r, ctx2)); cid += 1

    n_grid = [20, 100] if quick else N_GRID
    for selection in ("specified", "random"):
        for sS in (4.0, 8.0, 12.0):
            for delta in (0.3, 0.5):
                for N in n_grid:
                    add(selection, N, S2_PAGES, delta, sS, reps * (2 if (sS == 8.0 and delta == 0.5) else 1))
    for delta in (0.3, 0.5):
        for N in n_grid:
            add("own-quantile", N, S2_PAGES, delta, 8.0, reps)
    for selection in ("specified", "random"):
        for N in (20, 100):
            add(selection, N, S2_PAGES, 0.0, 8.0, reps * 2)   # size
    for selection in ("specified", "random"):
        for delta in (0.3, 0.5):
            for S in ([30, 60] if quick else S_GRID):
                if S != S2_PAGES:
                    add(selection, S2_N, S, delta, 8.0, reps)

    # Study 3 design A cells (paper as written), added to the same pool.
    Zm = [arr[p] for p in SUBGROUPS]
    sdm = np.array([z.std(ddof=1) for z in Zm])
    D = residual_divergence(generic, Zm)
    extra = np.argsort(-D)[:S3_DIVERGENT_A]
    ctx3 = {"pools": pools, "zg": generic, "Zm": Zm, "sdm": sdm, "extra": extra}
    a_cells = []
    for g in range(len(SUBGROUPS)):
        for delta in (0.5, 0.9):
            a_cells.append((10 ** 5 + len(a_cells), g, delta, 8.0, reps, ctx3, (1.0, 0.0)))
        a_cells.append((10 ** 5 + len(a_cells), g, 0.7, 8.0, reps, ctx3, (0.5, 0.5)))   # size: equal slopes

    print(f"  {len(cells)} Study 2 cells + {len(a_cells)} Study 3 design-A cells on {procs} processes ...", flush=True)
    with mp.get_context("fork").Pool(procs) as pool:
        res2 = pool.map(s2_cell, cells, chunksize=1)
        res3a = pool.map(s3a_cell, a_cells, chunksize=1)

    # ── Study 2 summaries ──
    s2 = {"cells": res2, "summary": []}
    for selection in ("specified", "own-quantile", "random"):
        for sS in (4.0, 8.0, 12.0):
            for delta in (0.3, 0.5):
                curve = sorted([r for r in res2 if r["selection"] == selection and r["sS"] == sS and r["delta"] == delta and r["S"] == S2_PAGES], key=lambda r: r["N"])
                if not curve:
                    continue
                at100 = next((r for r in curve if r["N"] == S2_N), None)
                asym = s2_asymptote(rng, pools, generic, mu, sd, selection, S2_PAGES, delta)
                s2["summary"].append({"selection": selection, "sS": sS, "delta": delta,
                                      "power_N100": at100["power"] if at100 else None, "mc_se_N100": at100["mc_se"] if at100 else None,
                                      "N_for_80": crossing(curve, "N"), "power_N_infinity": asym,
                                      "curve": [(r["N"], r["power"]) for r in curve]})
    for selection in ("specified", "random"):
        for delta in (0.3, 0.5):
            curve = sorted([r for r in res2 if r["selection"] == selection and r["sS"] == 8.0 and r["delta"] == delta and r["N"] == S2_N], key=lambda r: r["S"])
            s2.setdefault("pages_at_N100", []).append({"selection": selection, "delta": delta, "S_for_80": crossing(curve, "S"),
                                                       "curve": [(r["S"], r["power"]) for r in curve]})
    s2["size"] = [r for r in res2 if r["delta"] == 0.0]
    out["study2"] = s2

    # ── Study 3, design B (complete, closed-form per rep) ──
    sel_rng = np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=(10 ** 6 + 1,)))
    common, common_val = exchange(sel_rng, S3_PAGES, generic, Zm, sdm)
    own = {SUBGROUPS[g]: exchange(sel_rng, S3_PAGES, generic, [Zm[g]], sdm[[g]])[0] for g in range(len(SUBGROUPS))}
    s3 = {"selection_rule": "minimax exchange over the 4 subgroups' scaled matched-minus-generic contrast variance, 40 starts",
          "common_pages": [urls[i] for i in common], "common_criterion": common_val,
          "design_A_extra_pages": [urls[i] for i in extra], "personas": {}, "pooled": [], "size": {}}
    sS = 8.0
    for g, p in enumerate(SUBGROUPS):
        zm = Zm[g]
        info = {"corr_all_pages": float(np.corrcoef(generic, zm)[0, 1]), "sd_ref": float(sdm[g]),
                "corr_common16": float(np.corrcoef(generic[common], zm[common])[0, 1]),
                "corr_own16": float(np.corrcoef(generic[own[p]], zm[own[p]])[0, 1]), "rows": []}
        for delta in S3_DELTAS:
            b, su = delta * sS / sdm[g], sS * np.sqrt(1 - delta ** 2)
            row = {"delta": delta}
            row["B_divergent16"] = s3_within_complete(sel_rng, generic[common], zm[common], b, su, S3_P, reps * 10)
            row["B_own16"] = s3_within_complete(sel_rng, generic[own[p]], zm[own[p]], b, su, S3_P, reps * 10)
            rand = [s3_within_complete(sel_rng, generic[ix], zm[ix], b, su, S3_P, 20)
                    for ix in (sel_rng.choice(len(generic), S3_PAGES, replace=False) for _ in range(reps // 2))]
            row["B_random16"] = float(np.mean(rand))
            row["B_divergent16_by_P"] = {str(P): s3_within_complete(sel_rng, generic[common], zm[common], b, su, P, reps * 10)
                                         for P in [*S3_P_GRID, np.inf]}
            a = next(r for r in res3a if r["persona"] == p and r["delta"] == delta and r["gen"] == [1.0, 0.0]) if delta in (0.5, 0.9) else None
            row["A_as_written"] = a["power"] if a else None
            info["rows"].append(row)
        bm = 0.7 * sS / sdm[g]; su7 = sS * np.sqrt(1 - 0.49)
        s3["size"][p] = {"B_equal_slopes": s3_within_complete(sel_rng, generic[common], zm[common], bm, su7, S3_P, reps * 10, gen=(0.5, 0.5)),
                         "B_generic_only": s3_within_complete(sel_rng, generic[common], zm[common], 0.7 * sS / sd, su7, S3_P, reps * 10, gen=(0.0, 1.0)),
                         "A_equal_slopes": next(r["power"] for r in res3a if r["persona"] == p and r["gen"] == [0.5, 0.5])}
        s3["personas"][p] = info
    zm_common = np.stack([z[common] for z in Zm])
    for delta in S3_DELTAS:
        b_g = delta * sS / sdm
        s3["pooled"].append({"delta": delta, "B_divergent16": s3_pooled(sel_rng, zm_common, b_g, sS * np.sqrt(1 - delta ** 2), S3_P, reps * 4)})
    s3["size"]["pooled_generic_only"] = s3_pooled(sel_rng, zm_common, b_g, sS * np.sqrt(1 - 0.49), S3_P, reps * 4,
                                                  gen_generic=0.7 * sS / sd * generic[common])
    s3["design_A_cells"] = res3a
    out["study3"] = s3
    out["seconds"] = round(time.time() - t_start, 1)

    suffix = "-quick" if quick else ""
    with open(os.path.join(HERE, f"power-{scope}{suffix}.json"), "w") as f:
        json.dump(out, f, indent=1, default=float)
        f.write("\n")
    with open(os.path.join(HERE, f"power-study2-{scope}{suffix}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["selection", "N", "S", "delta", "sS", "reps", "power", "mc_se", "df_median", "boundary_fits", "nonconverged"])
        for r in sorted(res2, key=lambda r: (r["selection"], r["sS"], r["delta"], r["S"], r["N"])):
            w.writerow([r["selection"], r["N"], r["S"], r["delta"], r["sS"], r["reps"], f"{r['power']:.4f}", f"{r['mc_se']:.4f}",
                        f"{r['df_median']:.2f}", r["boundary_fits"], r["nonconverged"]])
    with open(os.path.join(HERE, f"power-study3-{scope}{suffix}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["persona", "corr_all_pages", "corr_common16", "corr_own16", "delta", "B_divergent16", "B_own16", "B_random16",
                    *[f"B_divergent16_P{P}" for P in [*S3_P_GRID, "inf"]], "A_as_written"])
        for p, info in s3["personas"].items():
            for r in info["rows"]:
                w.writerow([p, f"{info['corr_all_pages']:.4f}", f"{info['corr_common16']:.4f}", f"{info['corr_own16']:.4f}", r["delta"],
                            f"{r['B_divergent16']:.4f}", f"{r['B_own16']:.4f}", f"{r['B_random16']:.4f}",
                            *[f"{v:.4f}" for v in r["B_divergent16_by_P"].values()], "" if r["A_as_written"] is None else f"{r['A_as_written']:.4f}"])
    with open(os.path.join(HERE, f"study3-pages-{scope}{suffix}.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["set", "url", "typical_user_ctc", *[f"{p}_ctc" for p in SUBGROUPS]])
        for name, ix in (("B_common16", common), ("A_extra3", extra)):
            for i in ix:
                w.writerow([name, urls[i], f"{generic[i]:.6f}", *[f"{Zm[g][i]:.6f}" for g in range(len(SUBGROUPS))]])

    # ── Console summary ──
    print("\nStudy 2 (30 pages, 16 per participant): power at N = 100 | N for 80% | power as N -> inf")
    for r in out["study2"]["summary"]:
        print(f"  {r['selection']:12s} sS {r['sS']:4.0f} r {r['delta']:.1f}: {r['power_N100']:.3f} (MC SE {r['mc_se_N100']:.3f}) | "
              f"{'never' if r['N_for_80'] is None else round(r['N_for_80'])} | {r['power_N_infinity']:.3f}")
    for r in out["study2"]["pages_at_N100"]:
        print(f"  pages for 80% at N = 100, 16 each: {r['selection']} r {r['delta']}: {r['S_for_80']}  curve {r['curve']}")
    print("  size (r = 0): " + "  ".join(f"{r['selection']} N{r['N']}: {r['power']:.3f}" for r in out["study2"]["size"]))
    print(f"\nStudy 3 (5 per subgroup, sS 8): common divergent 16 = {len(common)} pages; design A extra 3 = {[urls[i] for i in extra]}")
    for p, info in s3["personas"].items():
        print(f"  {p:22s} r(matched, typical): all {info['corr_all_pages']:.3f}, common16 {info['corr_common16']:.3f}, own16 {info['corr_own16']:.3f}")
        for r in info["rows"]:
            print(f"    r {r['delta']:.1f}: B divergent {r['B_divergent16']:.2f}  own {r['B_own16']:.2f}  random {r['B_random16']:.2f}  "
                  f"by P {', '.join(f'{k}:{v:.2f}' for k, v in r['B_divergent16_by_P'].items())}  A {fmt(r['A_as_written'])}")
    print("  pooled: " + "  ".join(f"r {r['delta']}: {r['B_divergent16']:.2f}" for r in s3["pooled"]))
    print("  size: " + json.dumps(s3["size"]))
    print(f"\nwrote power-{scope}{suffix}.json, power-study2-{scope}{suffix}.csv, power-study3-{scope}{suffix}.csv, study3-pages-{scope}{suffix}.csv in {out['seconds']} s")


if __name__ == "__main__":
    main()
