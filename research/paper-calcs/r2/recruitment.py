"""
Study 2 power in recruits rather than completed datasets, under two loss rates.

power.py reports power against N = completed (usable) datasets. Recruitment
loses participants before they complete; this script asks how many must be
recruited for 80% power, and what the paper's planned recruitment (150) yields.

LOSS-RATE ASSUMPTIONS (each is an assumption; neither is measured for this study)
  33%  the paper's own figure (Section 5.2.1: 150 recruited to yield ~100 usable,
       "webcam calibration failure (~33% expected)"); the paper cites no source.
  61%  Yang & Krajbich 2021 (Judgment and Decision Making 16(6):1485-1505;
       jsPsych + WebGazer on MTurk): "125 subjects from Amazon MTurk
       participated in this study. Of these, 49 successfully passed the initial
       calibration + validation and completed the study", a loss of
       1 - 49/125 = 60.8%.
  70%  the same study's analysed count: "Thus, 38 subjects were included in
       total", 1 - 38/125 = 69.6%. This is the like-for-like comparison with
       the paper's 33%, which covers every exclusion (calibration, inattention,
       incomplete sessions), not calibration alone.
A recruit completes independently with probability 1 - loss, so the completed
count is Binomial(recruits, 1 - loss). Losses are assumed unrelated to the
outcome (missing completely at random).

METHOD. Everything else is power.py's Study 2 model and analysis (30 pages, 16
per participant, balanced; REML mixed model, two-sided Satterthwaite t; sp 12,
se 16; the stated sS and r). For each cell:
  - N80, the completed datasets for 80% power, read from power.py's N curve
    (linear interpolation between grid points);
  - recruits needed = ceil(N80 / (1 - loss)), then checked by direct simulation
    with the completed count drawn per simulated study from
    Binomial(recruits, 1 - loss);
  - the planned 150 recruits: power by direct simulation with the completed
    count drawn from Binomial(150, 1 - loss), and the expected completed count.
Monte Carlo SE sqrt(p (1 - p) / reps) is reported per figure.

Input: power-{scope}.json (power.py). Output: recruitment-{scope}.json.

Usage (as the tree's owner, worktree root):
  python3 -I research/paper-calcs/r2/recruitment.py [--scope viewport] [--reps 4000] [--procs K]

@copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
@license MIT
"""

import json
import math
import multiprocessing as mp
import os
import sys

for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import numpy as np  # noqa: E402
from scipy import stats  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import power as pw  # noqa: E402
from lmm import CrossedLMM  # noqa: E402

LOSSES = {"0.33": {"loss": 0.33, "source": "the paper's own figure (Section 5.2.1), unsourced"},
          "0.61": {"loss": 1 - 49 / 125,
                   "source": "Yang & Krajbich 2021, jsPsych + WebGazer on MTurk: 49 of 125 passed calibration + validation and completed"},
          "0.70": {"loss": 1 - 38 / 125,
                   "source": "Yang & Krajbich 2021, same study: 38 of 125 included in the analysis (every exclusion)"}}
PLANNED = 150
SEED = 20261023


def cell(args):
    """Power with the completed count drawn from Binomial(recruits, 1 - loss) per simulated study."""
    cid, selection, recruits, loss, delta, sS, reps, ctx = args
    rng = np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=(2 * 10 ** 6 + cid,)))
    pools, ctc, mu, sd = ctx["pools"], ctx["ctc"], ctx["mu"], ctx["sd"]
    b, su = delta * sS, sS * np.sqrt(1 - delta ** 2)
    S = pw.S2_PAGES
    hits, completed = 0, []
    for _ in range(reps):
        N = int(rng.binomial(recruits, 1 - loss))
        completed.append(N)
        if N < 2:
            continue
        z = (ctc[pools.draw(rng, selection, S)] - mu) / sd
        pid, sid = pw.assign(rng, N, S, pw.S2_PER)
        y = 50 + b * z[sid] + rng.normal(0, su, S)[sid] + rng.normal(0, pw.SP, N)[pid] + rng.normal(0, pw.SE, len(pid))
        m = CrossedLMM(pid, sid, N, S).fit(y, np.column_stack([np.ones(len(pid)), z[sid]]))
        _, _, t, df = m.contrast([0.0, 1.0])
        if not np.isfinite(df):
            df = S - 2.0
        hits += abs(t) > stats.t.ppf(1 - pw.ALPHA / 2, df)
    p = hits / reps
    return {"cid": cid, "selection": selection, "recruits": recruits, "loss": loss, "delta": delta, "sS": sS, "reps": reps,
            "power": p, "mc_se": float(np.sqrt(p * (1 - p) / reps)),
            "completed_mean": float(np.mean(completed)), "completed_sd": float(np.std(completed))}


def main():
    args = sys.argv[1:]
    scope = args[args.index("--scope") + 1] if "--scope" in args else "viewport"
    reps = int(args[args.index("--reps") + 1]) if "--reps" in args else 4000
    procs = int(args[args.index("--procs") + 1]) if "--procs" in args else max(1, (os.cpu_count() or 2) - 4)
    with open(os.path.join(HERE, f"power-{scope}.json")) as f:
        pj = json.load(f)
    urls, arr, humans = pw.load(scope)
    generic = arr[pw.GENERIC]
    spread = np.stack([arr[p] for p in humans]).std(axis=0, ddof=1)
    ctx = {"pools": pw.Pools(generic, spread), "ctc": generic, "mu": float(generic.mean()), "sd": float(generic.std(ddof=1))}

    plan, cells = [], []
    for s in pj["study2"]["summary"]:
        if s["sS"] != 8.0 or s["selection"] not in ("specified", "random"):
            continue
        for key, L in LOSSES.items():
            loss = L["loss"]
            need = None if s["N_for_80"] is None else math.ceil(s["N_for_80"] / (1 - loss))
            entry = {"selection": s["selection"], "delta": s["delta"], "sS": s["sS"], "loss": loss, "loss_key": key,
                     "loss_source": L["source"], "completed_for_80": s["N_for_80"],
                     "power_completed_N100": s["power_N100"], "power_N_infinity": s["power_N_infinity"],
                     "recruits_for_80": need, "planned_recruits": PLANNED,
                     "planned_expected_completed": PLANNED * (1 - loss)}
            plan.append(entry)
            cells.append((len(cells), s["selection"], PLANNED, loss, s["delta"], s["sS"], reps, ctx))
            entry["_planned_cell"] = cells[-1][0]
            if need is not None:
                cells.append((len(cells), s["selection"], need, loss, s["delta"], s["sS"], reps, ctx))
                entry["_need_cell"] = cells[-1][0]
    with mp.get_context("fork").Pool(procs) as pool:
        res = {r["cid"]: r for r in pool.map(cell, cells, chunksize=1)}
    for e in plan:
        r = res[e.pop("_planned_cell")]
        e["planned_power"], e["planned_mc_se"], e["planned_completed_sd"] = r["power"], r["mc_se"], r["completed_sd"]
        if "_need_cell" in e:
            r = res[e.pop("_need_cell")]
            e["recruits_for_80_check_power"], e["recruits_for_80_check_mc_se"] = r["power"], r["mc_se"]

    out = {"provenance": pw.provenance(), "power_provenance": pj["provenance"], "scope": scope, "reps": reps, "seed": SEED,
           "assumptions": {"losses": LOSSES, "planned_recruits": PLANNED,
                           "completion": "Binomial(recruits, 1 - loss), independent of the outcome"},
           "rows": plan}
    with open(os.path.join(HERE, f"recruitment-{scope}.json"), "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(f"[{scope}] git {out['provenance']['git_head'][:7]}; power curve from {pj['provenance']['git_head'][:7]}")
    for e in plan:
        n80 = "never" if e["completed_for_80"] is None else f"{e['completed_for_80']:.1f}"
        need = "none" if e["recruits_for_80"] is None else f"{e['recruits_for_80']} (check {e['recruits_for_80_check_power']:.3f})"
        print(f"  {e['selection']:9s} r {e['delta']:.1f} loss {e['loss']:.3f}: completed for 80% {n80}; recruits for 80% {need}; "
              f"150 recruited -> {e['planned_expected_completed']:.1f} completed, power {e['planned_power']:.3f} (MC SE {e['planned_mc_se']:.3f})")
    print(f"wrote recruitment-{scope}.json")


if __name__ == "__main__":
    main()
