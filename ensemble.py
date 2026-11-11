"""
Ensembles of simulation runs and bootstrap: how much the results vary when the
model is run repeatedly with the same parameters.

For each quantity, the following are calculated:
  mean           — mean across R runs;
  sd             — standard deviation across runs (variation in individual runs);
  run_lo, run_hi — 2.5th and 97.5th percentiles of the runs: the range containing
                   95% of individual runs;
  ci_lo, ci_hi   — 95% bootstrap confidence interval for the MEAN
                   (B resamples of runs with replacement):
                   how precisely the mean is estimated for a given R.

This module is used by experiments.py and app.py.
"""
import time
import numpy as np
import pandas as pd
from model import run, metrics, params, SCENARIOS

B_DEFAULT = 1000


def boot_mean(x, B=B_DEFAULT, seed=0):
    """Bootstrap distribution of the mean along axis 0."""
    x = np.asarray(x, dtype=float)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, x.shape[0], size=(B, x.shape[0]))
    return x[idx].mean(axis=1)


def boot_ci(x, B=B_DEFAULT, seed=0, level=95):
    bm = boot_mean(x, B, seed)
    a = (100 - level) / 2
    return np.percentile(bm, a, axis=0), np.percentile(bm, 100 - a, axis=0)


def summarize(x, B=B_DEFAULT, seed=0):
    x = np.asarray(x, dtype=float)
    lo, hi = boot_ci(x, B, seed)
    return dict(R=len(x), mean=float(x.mean()), sd=float(x.std(ddof=1)) if len(x) > 1 else 0.0,
                run_lo=float(np.percentile(x, 2.5)), run_hi=float(np.percentile(x, 97.5)),
                ci_lo=float(lo), ci_hi=float(hi))


def simulate(over, R, seed0=0):
    """R runs with seeds seed0..seed0+R-1 (the same populations for all conditions).
    Returns trajectories (R, T+1, 3), proportions of M by group (R, T+1, k),
    metrics, and counters."""
    hs, gs, ms, cs = [], [], [], []
    for s in range(seed0, seed0 + R):
        h, c, g = run(over, seed=s, groups=True)
        hs.append(h); gs.append(g); cs.append(c); ms.append(metrics(h, over, g))
    return np.array(hs), np.array(gs), pd.DataFrame(ms), pd.DataFrame(cs)


def traj_bands(y, B=B_DEFAULT):
    """Bands for trajectory y: (R, T+1)."""
    lo, hi = boot_ci(y, B)
    return dict(mean=y.mean(0).tolist(), ci_lo=lo.tolist(), ci_hi=hi.tolist(),
                run_lo=np.percentile(y, 2.5, 0).tolist(), run_hi=np.percentile(y, 97.5, 0).tolist())

METRIC_LABELS = {
    "M_during": "M at the end of verification",
    "M_after": "M at the end of the simulation",
    "H_during": "H at the end of verification",
    "Persist": "Change in M after verification (H3)",
    "sd_groups_off": "Variation between groups at the end of verification",
    "sd_groups_end": "Variation between groups at the end of the simulation",
}
H1_E = (0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9)
H2_R = (0.05, 0.1, 0.2, 0.3, 0.5)
H2_SIGMA = (0.1, 0.25, 0.5, 0.75, 1.0)


def app_ensemble(p, scenario_name, R=40, B=500):
    """Ensemble for the current application parameters:
    - control and verification scenarios: M(t) bands, summary of metrics with bootstrap;
    - M trajectories of all runs in the current scenario (to determine the position
      of the current run);
    - H1: M at the end of verification across a grid of e values
      (simulation, R_h runs per point);
    - H2: M at the end of verification across a grid of r × σ values
      (simulation, R_h runs per cell)."""
    t0 = time.time()
    p = params(**p)
    base = {k: v for k, v in p.items() if k != "teacher"}
    R_h = max(8, R // 4)
    out = dict(R=R, R_grid=R_h, bands={}, groups_sd={}, summary=[])
    runsM = None
    for name, sc in SCENARIOS.items():
        over = {**base, **sc}
        hs, gs, ms, _ = simulate(over, R)
        out["bands"][name] = traj_bands(hs[:, :, 1], B)
        out["groups_sd"][name] = traj_bands(gs.std(axis=2), B)
        if name == scenario_name:
            runsM = np.round(hs[:, :, 1], 4).tolist()
        for key, label in METRIC_LABELS.items():
            if key in ("Persist",) and not sc["teacher"]:
                continue
            out["summary"].append(dict(scenario=name, metric=label, **summarize(ms[key], B)))
    out["runsM"] = runsM

    teach = {**base, **SCENARIOS["1. Teacher"]}
    h1 = dict(e=list(H1_E), mean=[], ci_lo=[], ci_hi=[], run_lo=[], run_hi=[])
    for e in H1_E:
        _, _, ms, _ = simulate({**teach, "e": e}, R_h, seed0=1000)
        s = summarize(ms.M_during, B)
        for k in ("mean", "ci_lo", "ci_hi", "run_lo", "run_hi"):
            h1[k].append(s[k])
    out["h1"] = h1

    vals, half = [], []
    for sg in H2_SIGMA:
        row, hrow = [], []
        for r in H2_R:
            _, _, ms, _ = simulate({**teach, "r": r, "sigma": sg}, R_h, seed0=2000)
            s = summarize(ms.M_during, B)
            row.append(s["mean"]); hrow.append((s["ci_hi"] - s["ci_lo"]) / 2)
        vals.append(row); half.append(hrow)
    out["h2"] = dict(r=list(H2_R), sigma=list(H2_SIGMA), values=vals, ci_half=half)
    out["seconds"] = round(time.time() - t0, 1)
    return out
