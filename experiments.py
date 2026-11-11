"""
Computational experiments.

  E1 — control vs teacher: trajectories, group-level proportions, persistence (RQ, H3);
  H1 — AI error rate e × strictness σ ∈ {1, 0.5};
  H2 — coverage r × strictness σ; plus long runs (speed vs final outcome);
  H3 — persistence after verification ends at different levels of communication strength β;
  S  — sensitivity to parameters (±50%);
  B  — variation across runs with identical parameters ("bootstrap"):
       convergence of the mean as R increases and decomposition of variation
       into "population" and "dynamics".

For ALL experiments, metrics from each individual run are saved (out/data/all_runs.csv),
along with their summary (out/data/bootstrap_summary.csv): mean, standard deviation
across runs, 95% interval of individual runs, and 95% bootstrap confidence interval
for the mean.

Run: python3 experiments.py [R]     (R — runs per scenario, default 200)
"""
import os
import sys
import numpy as np
import pandas as pd
from model import run, metrics, equilibrium, meanfield_traj, SCENARIOS, BASE
from ensemble import simulate, summarize, traj_bands, boot_ci

DATA = "out/data"
ALL_RUNS = []          
METRICS = ["M_during", "H_during", "L_during", "M_after", "H_after", "L_after",
           "Persist", "sd_groups_off", "sd_groups_end"]


def many(over, R, experiment, condition, seed0=0):
    """R runs + recording the metrics of each run in a shared log."""
    hs, gs, ms, cs = simulate(over, R, seed0)
    rec = ms.copy()
    rec.insert(0, "seed", range(seed0, seed0 + R))
    rec.insert(0, "condition", condition)
    rec.insert(0, "experiment", experiment)
    ALL_RUNS.append(rec)
    return hs, gs, ms, cs


def e1(R):
    rows, keep = [], {}
    for k, (name, sc) in enumerate(SCENARIOS.items()):
        hs, gs, ms, cs = many(sc, R, "E1", name)
        keep[f"h{k}"], keep[f"g{k}"] = hs, gs
        for j, s in enumerate("LMH"):
            lo, hi = boot_ci(hs[:, :, j])
            keep[f"ci{k}_{s}"] = np.stack([lo, hi])
        row = dict(scenario=name)
        for col in METRICS:
            s = summarize(ms[col])
            row.update({col: s["mean"], col + "_sd": s["sd"], col + "_ci_lo": s["ci_lo"],
                        col + "_ci_hi": s["ci_hi"], col + "_run_lo": s["run_lo"], col + "_run_hi": s["run_hi"]})
        for col in cs.columns:
            row["n_" + col] = cs[col].mean()
        rows.append(row)
    keep["meanfield"] = meanfield_traj(SCENARIOS["1. Teacher"])
    pd.DataFrame(rows).to_csv(f"{DATA}/E1_scenarios.csv", index=False)
    np.savez_compressed(f"{DATA}/E1_traj.npz", names=np.array(list(SCENARIOS)), **keep)


def h1(R):
    rows = []
    for sig in (1.0, 0.5):
        for e in (0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9):
            over = dict(teacher=True, e=e, sigma=sig)
            _, _, ms, _ = many(over, R, "H1", f"sigma={sig}, e={e}")
            s = summarize(ms.M_during)
            eq = equilibrium(over)
            rows.append(dict(sigma=sig, e=e, M_during=s["mean"], M_sd=s["sd"],
                             M_lo=s["run_lo"], M_hi=s["run_hi"], M_ci_lo=s["ci_lo"], M_ci_hi=s["ci_hi"],
                             H_during=ms.H_during.mean(), L_during=ms.L_during.mean(),
                             M_star=eq["M"], H_star=eq["H"], L_star=eq["L"],
                             M_meanfield_toff=meanfield_traj(over)[BASE["t_off"]][1]))
    pd.DataFrame(rows).to_csv(f"{DATA}/H1_error_rate.csv", index=False)


def h2(R):
    rows = []
    for sig in (0.1, 0.25, 0.5, 0.75, 1.0):
        for r in (0.05, 0.1, 0.2, 0.3, 0.5):
            over = dict(teacher=True, r=r, sigma=sig)
            _, _, ms, _ = many(over, R, "H2", f"sigma={sig}, r={r}")
            sM, sH = summarize(ms.M_during), summarize(ms.H_during)
            eq = equilibrium(over)
            rows.append(dict(sigma=sig, r=r, M_during=sM["mean"], M_sd=sM["sd"],
                             M_ci_lo=sM["ci_lo"], M_ci_hi=sM["ci_hi"],
                             H_during=sH["mean"], H_sd=sH["sd"], H_ci_lo=sH["ci_lo"], H_ci_hi=sH["ci_hi"],
                             L_during=ms.L_during.mean(), M_star=eq["M"], H_star=eq["H"]))
    pd.DataFrame(rows).to_csv(f"{DATA}/H2_coverage_strictness.csv", index=False)

    keep = {}
    for sig in (1.0, 0.25):
        for r in (0.1, 0.4):
            over = dict(teacher=True, r=r, sigma=sig, T=200, t_on=0, t_off=200)
            hs, _, _, _ = simulate(over, max(30, R // 3))
            keep[f"sig{sig}_r{r}"] = hs
    np.savez_compressed(f"{DATA}/H2_long.npz", **keep)


def h3(R):
    rows = []
    for beta in (0.0, 0.25, 0.5, 1.0):
        for name, sc in SCENARIOS.items():
            over = {**sc, "beta": beta}
            _, _, ms, _ = many(over, R, "H3", f"beta={beta}, {name}")
            sP = summarize(ms.Persist)
            rows.append(dict(beta=beta, scenario=name, M_during=ms.M_during.mean(),
                             M_after=ms.M_after.mean(), Persist=sP["mean"], Persist_sd=sP["sd"],
                             Persist_lo=sP["run_lo"], Persist_hi=sP["run_hi"],
                             Persist_ci_lo=sP["ci_lo"], Persist_ci_hi=sP["ci_hi"],
                             sd_groups_off=ms.sd_groups_off.mean(),
                             sd_groups_end=ms.sd_groups_end.mean(),
                             sd_groups_diff_ci_lo=boot_ci(ms.sd_groups_end - ms.sd_groups_off)[0],
                             sd_groups_diff_ci_hi=boot_ci(ms.sd_groups_end - ms.sd_groups_off)[1]))
    pd.DataFrame(rows).to_csv(f"{DATA}/H3_persistence.csv", index=False)


def sensitivity(R):
    teach = SCENARIOS["1. Teacher"]
    _, _, ms0, _ = many(teach, R, "S", "baseline")
    base = ms0.M_during.mean()
    rows = []
    for par in ["a", "b", "gamma", "lam", "beta", "s"]:
        res = {}
        for f, lab in ((0.5, "minus50"), (1.5, "plus50")):
            v = BASE[par] * f
            v = min(v, 0.5) if par in ("gamma", "lam") else min(v, 1.0)
            if par == "s":
                v = min(v, 1 - BASE["s_spread"] / 2)
            _, _, ms, _ = many({**teach, par: v}, R, "S", f"{par}={v:g}")
            d = ms.M_during.values - ms0.M_during.values      
            lo, hi = boot_ci(d)
            res[lab], res[lab + "_ci_lo"], res[lab + "_ci_hi"] = d.mean(), lo, hi
        rows.append(dict(param=par, base=base, **res))
    pd.DataFrame(rows).to_csv(f"{DATA}/S_sensitivity.csv", index=False)


def variability(R_conv=500, n_pop=20, n_dyn=20):
    """B. Variation across runs with identical parameters.
    (1) Convergence: how the mean and its bootstrap confidence interval change
        as the number of runs R increases.
    (2) Decomposition: n_pop populations (network + characteristics + initial states)
        × n_dyn repetitions of the dynamics for each population. The share of
        variation "between populations" and "within populations"
        (same network, different randomness in assessments and communication)."""
    conv, keep = [], {}
    for name, sc in SCENARIOS.items():
        _, _, ms, _ = many(sc, R_conv, "B", f"сходимость, {name}", seed0=10000)
        keep[name] = ms.M_during.values
        for R in (5, 10, 20, 50, 100, 200, 300, 500):
            if R > R_conv:
                continue
            x = ms.M_during.values[:R]
            s = summarize(x)
            conv.append(dict(scenario=name, **s))
    pd.DataFrame(conv).to_csv(f"{DATA}/B_convergence.csv", index=False)
    np.savez_compressed(f"{DATA}/B_runs.npz", **{f"s{k}": v for k, v in enumerate(keep.values())},
                        names=np.array(list(keep)))

    rows = []
    for name, sc in SCENARIOS.items():
        Y = np.zeros((n_pop, n_dyn))
        for i in range(n_pop):
            for j in range(n_dyn):
                h, _ = run(sc, seed=50000 + j, pop_seed=20000 + i)
                Y[i, j] = metrics(h, sc)["M_during"]
        within = Y.var(axis=1, ddof=1).mean()          
        between = max(Y.mean(axis=1).var(ddof=1) - within / n_dyn, 0.0)  
        total = Y.var(ddof=1)
        rows.append(dict(scenario=name, mean=Y.mean(), sd_total=np.sqrt(total),
                         sd_within_population=np.sqrt(within), sd_between_populations=np.sqrt(between),
                         share_between=between / (between + within) if between + within > 0 else 0.0))
        rec = pd.DataFrame(dict(experiment="B", condition=f"decomposition, {name}",
                                seed=np.tile(np.arange(n_dyn), n_pop),
                                pop_seed=np.repeat(np.arange(n_pop), n_dyn), M_during=Y.ravel()))
        ALL_RUNS.append(rec)
    pd.DataFrame(rows).to_csv(f"{DATA}/B_variance.csv", index=False)


def bootstrap_summary():
    """Summary across all experiments: for each condition and metric — mean,
    standard deviation across runs, 95% interval of individual runs,
    and 95% bootstrap confidence interval for the mean."""
    allr = pd.concat(ALL_RUNS, ignore_index=True)
    allr.to_csv(f"{DATA}/all_runs.csv", index=False)
    rows = []
    for (exp, cond), g in allr.groupby(["experiment", "condition"], sort=False):
        for m in ("M_during", "H_during", "M_after", "Persist", "sd_groups_off", "sd_groups_end"):
            if m in g and g[m].notna().all():
                rows.append(dict(experiment=exp, condition=cond, metric=m, **summarize(g[m])))
    s = pd.DataFrame(rows)
    s["ci_halfwidth"] = (s.ci_hi - s.ci_lo) / 2
    s.to_csv(f"{DATA}/bootstrap_summary.csv", index=False)
    return s


if __name__ == "__main__":
    R = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    R_grid = max(30, R // 2)
    os.makedirs(DATA, exist_ok=True)
    for name, f in [("E1", lambda: e1(R)), ("H1", lambda: h1(R_grid)), ("H2", lambda: h2(R_grid)),
                    ("H3", lambda: h3(R_grid)), ("S", lambda: sensitivity(R_grid)),
                    ("B", lambda: variability(R_conv=max(R, 100) * 5 // 2))]:
        f()
        print(f"Done: {name}")
    s = bootstrap_summary()
    print(f"\nВсего прогонов: {sum(len(x) for x in ALL_RUNS)}")
    pd.set_option("display.width", 200)
    for fn in ("E1_scenarios.csv", "B_convergence.csv", "B_variance.csv", "S_sensitivity.csv"):
        print(f"\n===== {fn} =====\n{pd.read_csv(f'{DATA}/{fn}').round(3).to_string()}")
    print("\n===== bootstrap_summary (M_during, by experiment) =====")
    print(s[s.metric == "M_during"].groupby("experiment")[["sd", "ci_halfwidth"]].describe().round(3).to_string())
