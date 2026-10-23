"""
Face validity of the CTC against a typical user, on the real-page reference.

For every built-in human persona and each baseline (typical-user, its two
sensitivity variants, and first-timer for comparison with round 1), over the
graded reference pages at each scope:
  - the paired difference persona minus baseline, per page, in totalCTC (the
    percentile) and in rawCTC (layer-cost units): mean, median, and the share of
    pages where the persona is costlier;
  - 95% CIs for each by percentile bootstrap over pages (10,000 resamples);
  - the correlation of persona and baseline totalCTC over pages (what Study 3's
    within-subgroup test has to work against).

The CTC is deterministic given a page, so the only sampling variation is which
pages were measured: the CIs say how much the statistic would move if another
set of pages like these (one per site, from the sites that admit an automated
browser) had been measured. They say nothing about whether the personas are
right about people.

Input: ctc-scores.csv (typical-user.ts). Output: face-validity.csv and
face-validity.json (with the provenance of both this run and the scores).

RNG: numpy Generator(PCG64), seed 20261023. Every interval is checked to
contain its estimate; the script exits non-zero if one does not.

Usage (as the tree's owner, worktree root): python3 -I research/paper-calcs/r2/face_validity.py

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import csv
import json
import os
import platform
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
B = 10_000
SEED = 20261023
BASELINES = ["typical-user", "typical-user-bridged", "typical-user-roster-median", "first-timer"]
TYPICAL = {"typical-user", "typical-user-bridged", "typical-user-roster-median"}
ROUND1 = os.path.join(HERE, "..", "ctc-reference-scores.csv")


def provenance():
    g = lambda *a: subprocess.run(["git", *a], cwd=HERE, capture_output=True, text=True, check=True).stdout.strip()
    return {"git_head": g("rev-parse", "HEAD"), "git_branch": g("rev-parse", "--abbrev-ref", "HEAD"),
            "src_tree": g("rev-parse", "HEAD:src"), "src_dirty": bool(g("status", "--porcelain", "--", ":/src")),
            "ran": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "runtime": f"python {platform.python_version()}, numpy {np.__version__}"}


def load(path):
    by = defaultdict(lambda: defaultdict(dict))  # scope -> persona -> url -> row
    layers = None
    with open(path, newline="") as f:
        rd = csv.DictReader(f)
        layers = [c for c in rd.fieldnames if c.startswith("layer_")]
        for r in rd:
            by[r["scope"]][r["persona"]][r["url"]] = {"raw": float(r["raw_ctc"]), "total": float(r["total_ctc"]),
                                                       "layers": [float(r[c]) for c in layers]}
    return by, layers


def ci(stat_of_idx, est, idx):
    vals = stat_of_idx(idx)
    lo, hi = np.percentile(vals, [2.5, 97.5])
    if not (lo - 1e-12 <= est <= hi + 1e-12):
        raise SystemExit(f"interval [{lo}, {hi}] does not contain its estimate {est}")
    return float(lo), float(hi)


def paired(x, g, idx):
    d = x - g
    out = {}
    out["mean"] = float(d.mean())
    out["mean_ci"] = ci(lambda I: d[I].mean(axis=1), out["mean"], idx)
    out["median"] = float(np.median(d))
    out["median_ci"] = ci(lambda I: np.median(d[I], axis=1), out["median"], idx)
    out["share_costlier"] = float((d > 0).mean())
    out["share_costlier_ci"] = ci(lambda I: (d[I] > 0).mean(axis=1), out["share_costlier"], idx)
    out["ties"] = int((d == 0).sum())
    out["sd"] = float(d.std(ddof=1))
    return out


def main():
    by, layer_cols = load(os.path.join(HERE, "ctc-scores.csv"))
    with open(os.path.join(HERE, "typical-user.json")) as f:
        scores_meta = json.load(f)
    personas = scores_meta["personas_scored"]
    rng = np.random.default_rng(SEED)
    out = {"provenance": provenance(), "scores_provenance": scores_meta["provenance"],
           "reference": scores_meta["reference"]["id"], "bootstrap_resamples": B, "seed": SEED, "rng": "numpy PCG64",
           "interval": "95% percentile bootstrap over pages", "results": {}, "baseline_distribution": {}}
    rows = []
    for scope in ("viewport", "full_page"):
        urls = sorted(by[scope]["typical-user"])
        n = len(urls)
        idx = rng.integers(0, n, size=(B, n))   # one resample set per scope, shared by every comparison
        out["results"][scope] = {}
        out["baseline_distribution"][scope] = {}
        for base in BASELINES:
            gt = np.array([by[scope][base][u]["total"] for u in urls])
            gr = np.array([by[scope][base][u]["raw"] for u in urls])
            gl = np.array([by[scope][base][u]["layers"] for u in urls])
            out["baseline_distribution"][scope][base] = {
                "total_median": float(np.median(gt)), "total_q25": float(np.quantile(gt, 0.25)),
                "total_q75": float(np.quantile(gt, 0.75)), "total_mean": float(gt.mean()), "total_sd": float(gt.std(ddof=1)),
                "raw_median": float(np.median(gr))}
            res = {}
            for p in personas:
                if p == base:
                    continue
                xt = np.array([by[scope][p][u]["total"] for u in urls])
                xr = np.array([by[scope][p][u]["raw"] for u in urls])
                xl = np.array([by[scope][p][u]["layers"] for u in urls])
                r = {"pages": n, "total": paired(xt, gt, idx), "raw": paired(xr, gr, idx),
                     "corr_total": float(np.corrcoef(xt, gt)[0, 1]),
                     "median_layer_diff_raw": {c[6:]: float(np.median(xl[:, j] - gl[:, j])) for j, c in enumerate(layer_cols)}}
                res[p] = r
                rows.append([scope, base, p, n,
                             r["total"]["mean"], *r["total"]["mean_ci"], r["total"]["median"], *r["total"]["median_ci"],
                             r["total"]["share_costlier"], *r["total"]["share_costlier_ci"],
                             r["raw"]["mean"], *r["raw"]["mean_ci"], r["raw"]["median"], *r["raw"]["median_ci"],
                             r["raw"]["share_costlier"], *r["raw"]["share_costlier_ci"], r["corr_total"]])
            out["results"][scope][base] = res

    # Round 1 reproduction: first-timer totals on the same pages from the round-1 scorer.
    if os.path.exists(ROUND1):
        r1 = defaultdict(dict)
        with open(ROUND1, newline="") as f:
            for r in csv.DictReader(f):
                r1[(r["scope"], r["persona"])][r["url"]] = float(r["total_ctc"])
        worst = 0.0
        for scope in ("viewport", "full_page"):
            for p in personas:
                for u, v in r1.get((scope, p), {}).items():
                    worst = max(worst, abs(v - by[scope][p][u]["total"]))
        out["round1_max_abs_total_difference"] = worst

    with open(os.path.join(HERE, "face-validity.json"), "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    hdr = ["scope", "baseline", "persona", "pages",
           "total_mean", "total_mean_lo", "total_mean_hi", "total_median", "total_median_lo", "total_median_hi",
           "total_share_costlier", "total_share_lo", "total_share_hi",
           "raw_mean", "raw_mean_lo", "raw_mean_hi", "raw_median", "raw_median_lo", "raw_median_hi",
           "raw_share_costlier", "raw_share_lo", "raw_share_hi", "corr_total"]
    with open(os.path.join(HERE, "face-validity.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(hdr)
        for r in rows:
            w.writerow([f"{x:.6f}" if isinstance(x, float) else x for x in r])

    pv = out["provenance"]
    print(f"git {pv['git_head'][:7]} src tree {pv['src_tree'][:7]}{' DIRTY' if pv['src_dirty'] else ''}; scores from {out['scores_provenance']['git_head'][:7]}; reference {out['reference']}")
    if "round1_max_abs_total_difference" in out:
        print(f"round-1 scorer vs this scorer, totalCTC on shared rows: max |difference| {out['round1_max_abs_total_difference']:.2e}")
    for scope in ("viewport", "full_page"):
        for base in ("typical-user", "first-timer"):
            d = out["baseline_distribution"][scope][base]
            print(f"\n[{scope}] persona minus {base} (baseline totalCTC median {d['total_median']:.3f}, IQR {d['total_q25']:.3f}-{d['total_q75']:.3f}); mean [95% CI], share of pages costlier")
            for p, r in sorted(out["results"][scope][base].items(), key=lambda kv: kv[1]["total"]["mean"]):
                t, w = r["total"], r["raw"]
                print(f"  {p:26s} total {t['mean']:+.3f} [{t['mean_ci'][0]:+.3f}, {t['mean_ci'][1]:+.3f}]  costlier {t['share_costlier']:.2f}"
                      f"  raw {w['mean']:+.3f} [{w['mean_ci'][0]:+.3f}, {w['mean_ci'][1]:+.3f}]  r {r['corr_total']:.3f}")
    print("\nwrote face-validity.json, face-validity.csv; every interval contains its estimate")


if __name__ == "__main__":
    sys.exit(main())
