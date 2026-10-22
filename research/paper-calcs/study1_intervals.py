"""
Calculation 1 (and the analysis half of 2): intervals for Study 1.

Reads a per_image.csv written by research/study1/run-study1-v20.ts (one row per
page x arm; columns image,arm,auc,nss,cc,cc_counts,kld,sim) and reports, per
arm and metric:
  - the mean over pages,
  - a 95% CI by percentile bootstrap over pages (10,000 resamples),
  - a 95% CI by Student t (mean +- t_{n-1,0.975} * sd / sqrt(n)),
and paired differences (bootstrap CI, t CI, t, two-sided p, Holm-adjusted p
within each metric, page wins/losses/ties) for:
  - every persona arm minus first-timer,
  - every persona arm minus CenterBias (the "model vs CenterBias" question).

Win means "better", so for KLD (lower is better) a win is a smaller value.

RNG: numpy.random.Generator(PCG64), seeded, so a rerun reproduces every digit.
Every interval is asserted to contain its point estimate; the script exits
non-zero if one does not.

Usage (as wyld-web, from the worktree root):
  python3 -I research/paper-calcs/study1_intervals.py <per_image.csv> <out_prefix> [--paired-with <per_image.csv> <label>]

--paired-with computes, per arm, the paired difference (this file minus the
other file) over the pages both files score: used for values-on minus
values-off, and for this tree minus the 20.0.1 file.

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import csv
import json
import sys

import numpy as np
from scipy import stats

METRICS = ["auc", "nss", "cc", "cc_counts", "kld", "sim"]
HIGHER_BETTER = {"auc": True, "nss": True, "cc": True, "cc_counts": True, "kld": False, "sim": True}
REF = "neurotypical (first-timer)"
CB = "CenterBias"
B = 10_000
SEED = 20261022


def load(path):
    data = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            data.setdefault(row["arm"], {})[row["image"]] = {m: float(row[m]) for m in METRICS}
    return data


def boot_idx(n, rng):
    return rng.integers(0, n, size=(B, n))


def mean_ci(v, rng):
    v = np.asarray(v, dtype=float)
    v = v[np.isfinite(v)]
    n = len(v)
    m = float(v.mean())
    sd = float(v.std(ddof=1))
    se = sd / np.sqrt(n)
    tq = float(stats.t.ppf(0.975, n - 1))
    bm = v[boot_idx(n, rng)].mean(axis=1)
    lo, hi = np.percentile(bm, [2.5, 97.5])
    out = {"n": n, "mean": m, "sd": sd, "boot_lo": float(lo), "boot_hi": float(hi),
           "t_lo": m - tq * se, "t_hi": m + tq * se}
    check(out, "mean")
    return out


def paired(a, b, metric, rng):
    """a - b over common pages; a, b are dicts image -> value."""
    keys = sorted(k for k in a if k in b and np.isfinite(a[k]) and np.isfinite(b[k]))
    x = np.array([a[k] for k in keys]); y = np.array([b[k] for k in keys])
    d = x - y
    n = len(d)
    m = float(d.mean()); sd = float(d.std(ddof=1)); se = sd / np.sqrt(n)
    tq = float(stats.t.ppf(0.975, n - 1))
    t = m / se if se > 0 else float("nan")
    p = float(2 * stats.t.sf(abs(t), n - 1)) if se > 0 else float("nan")
    bm = d[boot_idx(n, rng)].mean(axis=1)
    lo, hi = np.percentile(bm, [2.5, 97.5])
    better = d > 0 if HIGHER_BETTER[metric] else d < 0
    worse = d < 0 if HIGHER_BETTER[metric] else d > 0
    out = {"n": n, "mean": m, "sd": sd, "boot_lo": float(lo), "boot_hi": float(hi),
           "t_lo": m - tq * se, "t_hi": m + tq * se, "t": t, "df": n - 1, "p": p,
           "dz": m / sd if sd > 0 else float("nan"),
           "wins": int(better.sum()), "losses": int(worse.sum()), "ties": int(n - better.sum() - worse.sum())}
    check(out, "mean")
    return out


def check(o, key):
    m = o[key]
    for lo, hi in (("boot_lo", "boot_hi"), ("t_lo", "t_hi")):
        if not (o[lo] <= m <= o[hi]):
            raise SystemExit(f"interval [{o[lo]}, {o[hi]}] does not contain its estimate {m}")


def holm(ps):
    """Holm step-down adjusted p-values, same order as given."""
    order = np.argsort(ps)
    k = len(ps)
    adj = np.empty(k)
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (k - rank) * ps[i]))
        adj[i] = running
    return adj.tolist()


def main():
    args = sys.argv[1:]
    src, prefix = args[0], args[1]
    other = None
    if "--paired-with" in args:
        i = args.index("--paired-with")
        other, other_label = args[i + 1], args[i + 2]
    rng = np.random.default_rng(SEED)
    data = load(src)
    arms = list(data.keys())
    personas = [a for a in arms if a not in (CB, "Uniform")]
    out = {"source": src, "bootstrap_resamples": B, "seed": SEED, "rng": "numpy PCG64",
           "pages": {a: len(v) for a, v in data.items()}, "arms": {}, "vs_first_timer": {}, "vs_center_bias": {}}

    rows = []
    for a in arms:
        out["arms"][a] = {}
        for m in METRICS:
            vals = [v[m] for v in data[a].values()]
            if not any(np.isfinite(vals)):
                continue  # a metric this arm does not carry (the 24x32 ceiling arms have no CC/KLD/SIM)
            r = mean_ci(vals, rng)
            out["arms"][a][m] = r
            rows.append(["arm", a, "", m, r["n"], r["mean"], r["boot_lo"], r["boot_hi"], r["t_lo"], r["t_hi"], "", "", "", "", "", "", ""])

    for label, ref, targets in (("vs_first_timer", REF, [p for p in personas if p != REF]),
                                ("vs_center_bias", CB, personas)):
        if ref not in data or not targets:
            continue
        for m in METRICS:
            res = {a: paired({k: v[m] for k, v in data[a].items()}, {k: v[m] for k, v in data[ref].items()}, m, rng) for a in targets}
            adj = holm([res[a]["p"] for a in targets])
            for a, pa in zip(targets, adj):
                res[a]["p_holm"] = pa
                out[label].setdefault(a, {})[m] = res[a]
                r = res[a]
                rows.append([label, a, ref, m, r["n"], r["mean"], r["boot_lo"], r["boot_hi"], r["t_lo"], r["t_hi"],
                             r["t"], r["p"], pa, r["dz"], r["wins"], r["losses"], r["ties"]])

    if other:
        od = load(other)
        out["paired_with"] = {"other": other, "label": other_label, "arms": {}}
        for a in arms:
            if a not in od:
                continue
            for m in METRICS:
                r = paired({k: v[m] for k, v in data[a].items()}, {k: v[m] for k, v in od[a].items()}, m, rng)
                out["paired_with"]["arms"].setdefault(a, {})[m] = r
                rows.append([f"minus_{other_label}", a, other_label, m, r["n"], r["mean"], r["boot_lo"], r["boot_hi"],
                             r["t_lo"], r["t_hi"], r["t"], r["p"], "", r["dz"], r["wins"], r["losses"], r["ties"]])
        # Holm within each metric across arms for the paired-with family.
        for m in METRICS:
            ks = [a for a in out["paired_with"]["arms"] if m in out["paired_with"]["arms"][a]]
            ps = [out["paired_with"]["arms"][a][m]["p"] for a in ks]
            ps_clean = [p if np.isfinite(p) else 1.0 for p in ps]
            for a, pa in zip(ks, holm(ps_clean)):
                out["paired_with"]["arms"][a][m]["p_holm"] = pa
                for row in rows:
                    if row[0] == f"minus_{other_label}" and row[1] == a and row[3] == m:
                        row[12] = pa

    with open(prefix + ".json", "w") as f:
        json.dump(out, f, indent=1)
    with open(prefix + ".csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["family", "arm", "reference", "metric", "n", "mean", "boot_lo", "boot_hi", "t_lo", "t_hi",
                    "t", "p", "p_holm", "dz", "wins", "losses", "ties"])
        for r in rows:
            w.writerow([f"{x:.6g}" if isinstance(x, float) else x for x in r])
    print(f"wrote {prefix}.json and {prefix}.csv ({len(rows)} rows); every interval contains its estimate")


if __name__ == "__main__":
    main()
