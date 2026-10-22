"""
Share of the achievable gain over CenterBias that the model captures, with a
page bootstrap CI.

  share = mean_p(model_p - CB_p) / mean_p(ceiling_p - CB_halfB_p)

The numerator is scored against all of a page's viewers (Study 1's ground
truth); the denominator against half B of them (the ceiling's ground truth),
each with CenterBias scored against the same ground truth as the term it is
subtracted from. Both means are taken over the same resampled pages in every
bootstrap draw, so the interval carries their correlation.

Not like for like in one respect, stated in the README: the model is scored
against about 10 viewers per page, the ceiling against about 5, and a target
with fewer viewers is noisier, which lowers the ceiling. The share is
therefore an upper estimate of the fraction captured.

Usage (as wyld-web, worktree root):
  python3 -I research/paper-calcs/headroom.py <study1 per_image.csv> <ceiling-per-image.csv> <out.json>

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import csv
import json
import sys

import numpy as np

B = 10_000
SEED = 20261022
MODEL = "neurotypical (first-timer)"
PAIRS = [  # (metric, ceiling arm, ceiling CenterBias arm)
    ("auc", "legacy32_logsplit", "CenterBias32_halfB"),
    ("nss", "legacy32_logsplit", "CenterBias32_halfB"),
    ("auc", "model_s1", "CenterBias_halfB"),
    ("nss", "model_s1", "CenterBias_halfB"),
    ("cc", "model_s1", "CenterBias_halfB"),
    ("sim", "model_s1", "CenterBias_halfB"),
    ("auc", "model_s32eq", "CenterBias_halfB"),
    ("cc", "model_s32eq", "CenterBias_halfB"),
    ("sim", "model_s32eq", "CenterBias_halfB"),
]


def load(path):
    d = {}
    for r in csv.DictReader(open(path, newline="")):
        d.setdefault(r["arm"], {})[r["image"]] = {k: float(v) for k, v in r.items() if k not in ("image", "arm")}
    return d


def main():
    s1, ce, out_path = sys.argv[1:4]
    a, c = load(s1), load(ce)
    rng = np.random.default_rng(SEED)
    out = {"study1": s1, "ceiling": ce, "model_arm": MODEL, "resamples": B, "seed": SEED, "rows": []}
    for m, carm, cbarm in PAIRS:
        keys = sorted(k for k in a[MODEL] if k in c[carm] and k in c[cbarm]
                      and all(np.isfinite(x) for x in (a[MODEL][k][m], a["CenterBias"][k][m], c[carm][k][m], c[cbarm][k][m])))
        num = np.array([a[MODEL][k][m] - a["CenterBias"][k][m] for k in keys])
        den = np.array([c[carm][k][m] - c[cbarm][k][m] for k in keys])
        share = num.mean() / den.mean()
        idx = rng.integers(0, len(keys), size=(B, len(keys)))
        bs = num[idx].mean(axis=1) / den[idx].mean(axis=1)
        lo, hi = np.percentile(bs, [2.5, 97.5])
        if not (lo <= share <= hi):
            raise SystemExit(f"{m}/{carm}: interval [{lo}, {hi}] does not contain {share}")
        row = {"metric": m, "ceiling_arm": carm, "pages": len(keys),
               "model_minus_cb": float(num.mean()), "ceiling_minus_cb": float(den.mean()),
               "share": float(share), "boot_lo": float(lo), "boot_hi": float(hi)}
        out["rows"].append(row)
        print(f"{m:4s} {carm:18s} n={len(keys)} model-CB {num.mean():+.4f} ceiling-CB {den.mean():+.4f} share {share:.3f} [{lo:.3f}, {hi:.3f}]")
    json.dump(out, open(out_path, "w"), indent=1)


if __name__ == "__main__":
    main()
