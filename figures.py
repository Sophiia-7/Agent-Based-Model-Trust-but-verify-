"""
Figures of results based on data.

Run: python3 figures.py
"""
import os
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
from matplotlib.figure import Figure
from model import BASE
from ensemble import boot_ci

DATA, FIG = "out/data", "out"
STATE = {-1: "#6250d6", 0: "#1baf7a", 1: "#eb6834"}          
SCEN = {"0. Control": "#8a8984", "1. Teacher": "#2a78d6"}
SIG = {1.0: "#2a78d6", 0.5: "#eb6834"}
RC = {"font.size": 9, "axes.spines.top": False, "axes.spines.right": False,
      "axes.edgecolor": "#8a8984", "axes.grid": True, "grid.color": "#e6e5e1",
      "grid.linewidth": 0.6, "lines.linewidth": 2, "legend.frameon": False}
matplotlib.rcParams.update(RC)


def have_data():
    return os.path.exists(f"{DATA}/E1_scenarios.csv")


def band(ax, y, label, color, ls="-", ci=True):
    """Line — mean across runs; light band — 95% interval of individual runs;
    dark band — 95% bootstrap confidence interval for the mean."""
    m, lo, hi = y.mean(0), np.percentile(y, 2.5, 0), np.percentile(y, 97.5, 0)
    x = range(len(m))
    ax.fill_between(x, lo, hi, color=color, alpha=0.10, lw=0)
    if ci:
        clo, chi = boot_ci(y, B=500)
        ax.fill_between(x, clo, chi, color=color, alpha=0.35, lw=0)
    ax.plot(m, label=label, color=color, ls=ls, lw=1.6)


def shade(ax, t_on=BASE["t_on"], t_off=BASE["t_off"]):
    ax.axvspan(t_on, t_off, color="#8a8984", alpha=0.08, lw=0)


def fig_e1():
    """RQ: proportions of the three states in the control and verification scenarios."""
    d = np.load(f"{DATA}/E1_traj.npz")
    names = list(d["names"])
    fig = Figure(figsize=(11, 3.2))
    ax = fig.subplots(1, 3, sharex=True, sharey=True)
    for col, (s, title) in enumerate(((0, "Verify (0)"), (1, "Without verification (+1)"),
                                      (-1, "Do not trust (−1)"))):
        k = {-1: 0, 0: 1, 1: 2}[s]
        for i, name in enumerate(names):
            band(ax[col], d[f"h{i}"][:, :, k], name, SCEN[name])
        if s == 0:
            ax[col].plot(d["meanfield"][:, 1], color="#1d1c1a", lw=1, ls="--",
                         label="mean-field calculation")
        shade(ax[col]); ax[col].set_title(title, loc="left"); ax[col].set_xlabel("round")
    ax[0].set_ylabel("proportion of students"); ax[0].set_ylim(0, 1)
    ax[0].legend(fontsize=7, loc="upper left")
    R = d["h0"].shape[0]
    fig.suptitle(f"RQ. Control and teacher verification (R = {R}; light band — 95% interval of runs, "
                 "dark band — 95% bootstrap confidence interval for the mean)", x=0.01, ha="left", fontsize=10)
    fig.tight_layout()
    return fig


def fig_groups():
    """H3: proportion of centrists by group in one run and variation between groups."""
    d = np.load(f"{DATA}/E1_traj.npz")
    names = list(d["names"])
    fig = Figure(figsize=(11, 3.2))
    ax = fig.subplots(1, 3)
    for i, name in enumerate(names):
        g = d[f"g{i}"][0]                                        
        for j in range(g.shape[1]):
            ax[i].plot(g[:, j], lw=1.3, color=SCEN[name], alpha=0.35 + 0.1 * j)
        shade(ax[i]); ax[i].set_ylim(0, 1)
        ax[i].set_title(f"{name}: M across 6 groups (seed 0)", loc="left")
        ax[i].set_xlabel("round")
        sd = d[f"g{i}"].std(axis=2)
        band(ax[2], sd, name, SCEN[name])
    ax[0].set_ylabel("proportion of centrists in a group")
    shade(ax[2]); ax[2].set_title("Variation in M between groups (sd)", loc="left")
    ax[2].set_xlabel("round"); ax[2].legend(fontsize=7)
    fig.tight_layout()
    return fig


def fig_h1():
    """H1: proportion of centrists as a function of AI error rate e."""
    h = pd.read_csv(f"{DATA}/H1_error_rate.csv")
    fig = Figure(figsize=(9, 3.3))
    ax = fig.subplots(1, 2)
    for sig, g in h.groupby("sigma"):
        c = SIG[sig]
        ax[0].errorbar(g.e, g.M_during, yerr=[g.M_during - g.M_lo, g.M_hi - g.M_during],
                       fmt="o-", color=c, ms=4, capsize=2, lw=1.5, elinewidth=0.8, alpha=0.9,
                       label=f"simulation, σ = {sig:g} (error bars — 95% interval of runs)")
        ax[0].fill_between(g.e, g.M_ci_lo, g.M_ci_hi, color=c, alpha=0.3, lw=0)
        ax[0].plot(g.e, g.M_star, ls="--", color=c, lw=1.2, label=f"equilibrium, σ = {sig:g}")
    ax[0].set_xlabel("AI error probability e"); ax[0].set_ylabel("proportion of centrists M")
    ax[0].set_title("H1. Centrists and AI reliability", loc="left"); ax[0].legend(fontsize=7)
    g = h[h.sigma == 1.0]
    ax[1].stackplot(g.e, g.L_during, g.M_during, g.H_during,
                    colors=[STATE[-1], STATE[0], STATE[1]], alpha=0.85,
                    labels=["do not trust", "verify", "without verification"])
    ax[1].set_xlim(g.e.min(), g.e.max()); ax[1].set_ylim(0, 1)
    ax[1].set_xlabel("AI error probability e"); ax[1].set_ylabel("proportion (end of verification period)")
    ax[1].set_title("Population composition, σ = 1", loc="left"); ax[1].legend(fontsize=7, loc="upper right")
    fig.tight_layout()
    return fig


def _heat(ax, piv, title, cmap, fmt="{:.2f}", half=None):
    im = ax.imshow(piv.values, origin="lower", cmap=cmap, vmin=0, vmax=0.7, aspect="auto")
    ax.set_xticks(range(len(piv.columns)), [f"{c:g}" for c in piv.columns])
    ax.set_yticks(range(len(piv.index)), [f"{i:g}" for i in piv.index])
    ax.set_xlabel("coverage r"); ax.set_ylabel("strictness σ"); ax.grid(False)
    for (i, j), v in np.ndenumerate(piv.values):
        txt = fmt.format(v) + (f"\n±{half.values[i, j]:.2f}" if half is not None else "")
        ax.text(j, i, txt, ha="center", va="center", fontsize=6.5, linespacing=1.1,
                color="white" if v > 0.45 else "#1d1c1a")
    ax.set_title(title, loc="left")
    return im


def fig_h2():
    """H2: coverage × strictness and long runs (speed vs. final outcome)."""
    h = pd.read_csv(f"{DATA}/H2_coverage_strictness.csv")
    long = np.load(f"{DATA}/H2_long.npz")
    fig = Figure(figsize=(12, 3.5))
    ax = fig.subplots(1, 3)
    h = h.assign(M_half=(h.M_ci_hi - h.M_ci_lo) / 2, H_half=(h.H_ci_hi - h.H_ci_lo) / 2)
    _heat(ax[0], h.pivot(index="sigma", columns="r", values="M_during"),
          "H2. Centrists M (± 95% bootstrap interval)", "Greens",
          half=h.pivot(index="sigma", columns="r", values="M_half"))
    _heat(ax[1], h.pivot(index="sigma", columns="r", values="H_during"),
          "Without verification H (initially 0.50)", "Oranges",
          half=h.pivot(index="sigma", columns="r", values="H_half"))
    for key, c, ls in (("sig1.0_r0.1", "#2a78d6", ":"), ("sig1.0_r0.4", "#2a78d6", "-"),
                       ("sig0.25_r0.1", "#eb6834", ":"), ("sig0.25_r0.4", "#eb6834", "-")):
        sig, r = key[3:].split("_r")
        y = long[key][:, :, 1]
        lo, hi = boot_ci(y, B=500)
        ax[2].fill_between(range(y.shape[1]), lo, hi, color=c, alpha=0.2, lw=0)
        ax[2].plot(y.mean(0), color=c, ls=ls, lw=1.6, label=f"σ = {sig}, r = {r}")
    ax[2].set_ylim(0, 0.7); ax[2].set_xlabel("round (verification throughout)")
    ax[2].set_ylabel("proportion of centrists M"); ax[2].legend(fontsize=7)
    ax[2].set_title("r changes the speed, σ — the level", loc="left")
    fig.tight_layout()
    return fig


def fig_h3():
    """H3: persistence after the end of verification at different strengths of communication β."""
    h = pd.read_csv(f"{DATA}/H3_persistence.csv")
    fig = Figure(figsize=(9, 3.2))
    ax = fig.subplots(1, 2)
    betas = sorted(h.beta.unique()); x = np.arange(len(betas)); w = 0.38
    for k, (name, c) in enumerate(SCEN.items()):
        g = h[h.scenario == name].set_index("beta").loc[betas]
        ax[0].bar(x + (k - 0.5) * w, g.M_during, w * 0.9, color=c, alpha=0.45)
        ax[0].bar(x + (k - 0.5) * w, g.M_after, w * 0.45, color=c, label=name)
        ax[0].errorbar(x + (k - 0.5) * w, g.M_after, fmt="none", ecolor="#1d1c1a", elinewidth=0.8,
                       capsize=2, yerr=[g.Persist - g.Persist_ci_lo, g.Persist_ci_hi - g.Persist])
        ax[1].plot(betas, g.sd_groups_off, "o--", color=c, lw=1.2, ms=4)
        ax[1].plot(betas, g.sd_groups_end, "o-", color=c, lw=1.6, ms=4, label=name)
    ax[0].set_xticks(x, [f"{b:g}" for b in betas]); ax[0].set_xlabel("communication strength β")
    ax[0].set_ylabel("M: wide bar — end of verification period,\nnarrow bar — end of simulation", fontsize=8)
    ax[0].set_title("H3. Does the effect persist? (error bars — 95% bootstrap interval for the change in M)", loc="left", fontsize=8.5)
    ax[0].legend(fontsize=7)
    ax[1].set_xlabel("communication strength β"); ax[1].set_ylabel("sd of the proportion of centrists between groups")
    ax[1].set_title("Between-group variation: dashed t = 40, solid t = 60", loc="left")
    ax[1].legend(fontsize=7)
    fig.tight_layout()
    return fig


def fig_sensitivity():
    s = pd.read_csv(f"{DATA}/S_sensitivity.csv")
    s = s.assign(span=(s.plus50 - s.minus50).abs()).sort_values("span")
    names = {"a": "a", "b": "b", "gamma": "γ (mean)", "lam": "λ (mean)",
             "beta": "β", "s": "s (mean ability level)"}
    fig = Figure(figsize=(5.5, 3))
    ax = fig.subplots()
    yl = [names[p] for p in s.param]
    ax.barh(yl, s.minus50, color="#2a78d6", label="−50%", height=0.6,
            xerr=[s.minus50 - s.minus50_ci_lo, s.minus50_ci_hi - s.minus50], ecolor="#1d1c1a", capsize=2)
    ax.barh(yl, s.plus50, color="#eb6834", label="+50%", height=0.6,
            xerr=[s.plus50 - s.plus50_ci_lo, s.plus50_ci_hi - s.plus50], ecolor="#1d1c1a", capsize=2)
    ax.axvline(0, color="#52514e", lw=0.8)
    ax.set_xlabel(f"Δ M at the end of verification (baseline {s.base.iloc[0]:.2f})")
    ax.set_title("Sensitivity (error bars — 95% bootstrap interval, paired runs)", loc="left", fontsize=8.5)
    ax.legend(fontsize=7)
    fig.tight_layout()
    return fig


def fig_bootstrap():
    """B: how much the result varies across repeated runs with identical parameters."""
    d = np.load(f"{DATA}/B_runs.npz")
    conv = pd.read_csv(f"{DATA}/B_convergence.csv")
    var = pd.read_csv(f"{DATA}/B_variance.csv")
    names = list(d["names"])
    fig = Figure(figsize=(12, 3.4))
    ax = fig.subplots(1, 3)
    bins = np.linspace(0, 0.8, 33)
    for k, name in enumerate(names):
        x = d[f"s{k}"]; c = SCEN[name]
        ax[0].hist(x, bins=bins, color=c, alpha=0.55, label=f"{name} (R = {len(x)})")
        lo, hi = boot_ci(x)
        ax[0].axvspan(lo, hi, color=c, alpha=0.35, lw=0)
        ax[0].axvline(x.mean(), color=c, lw=1.5)
        g = conv[conv.scenario == name]
        ax[1].fill_between(g.R, g.ci_lo, g.ci_hi, color=c, alpha=0.25, lw=0)
        ax[1].plot(g.R, g["mean"], "o-", color=c, ms=3.5, lw=1.5, label=name)
    ax[0].set_xlabel("M at the end of verification (one run)"); ax[0].set_ylabel("number of runs")
    ax[0].set_title("Variation across individual runs", loc="left"); ax[0].legend(fontsize=7)
    ax[1].set_xscale("log"); ax[1].set_xlabel("number of runs R (log scale)")
    ax[1].set_ylabel("mean M ± 95% bootstrap interval"); ax[1].set_ylim(0, 0.7)
    ax[1].set_title("Convergence of the mean", loc="left"); ax[1].legend(fontsize=7)
    x = np.arange(len(var)); w = 0.38
    ax[2].bar(x - w / 2, var.sd_within_population, w, color="#8a8984", label="same population, different random outcomes")
    ax[2].bar(x + w / 2, var.sd_between_populations, w, color="#1d1c1a", label="between populations (network, characteristics)")
    ax[2].set_xticks(x, var.scenario); ax[2].set_ylabel("sd of the proportion M at the end of verification")
    for i, row in var.iterrows():
        ax[2].text(i, max(row.sd_within_population, row.sd_between_populations) + 0.004,
                   f"population share {row.share_between:.0%}", ha="center", fontsize=7)
    ax[2].set_title("Sources of variation", loc="left"); ax[2].legend(fontsize=7, loc="upper right")
    ax[2].set_ylim(0, max(var.sd_within_population.max(), var.sd_between_populations.max()) * 1.45)
    fig.tight_layout()
    return fig


ALL = {"E1_scenarios": fig_e1, "E1_groups": fig_groups, "H1_error_rate": fig_h1,
       "H2_coverage_strictness": fig_h2, "H3_persistence": fig_h3, "S_sensitivity": fig_sensitivity,
       "B_bootstrap": fig_bootstrap}

if __name__ == "__main__":
    os.makedirs(FIG, exist_ok=True)
    for name, f in ALL.items():
        f().savefig(f"{FIG}/{name}.png", dpi=150)
        print(f"done: out/{name}.png")
