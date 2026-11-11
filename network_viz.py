"""Network visualization: student states at the beginning, at the end of the verification period, and at the end of the simulation run
for the control scenario and the scenario with verification, using the same population (seed = 0)."""
import numpy as np
import networkx as nx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from model import params, init_population, step, SCENARIOS

SEED = 0
COLORS = {-1: "#6250d6", 0: "#1baf7a", 1: "#eb6834"}
LABELS = {-1: "−1: does not trust", 0: "0: trusts and verifies", 1: "+1: trusts without verification"}


def snapshots(scenario, snap):
    p = params(**SCENARIOS[scenario])
    pop = init_population(p, SEED)
    rng = np.random.default_rng([SEED, 1])
    cnt = dict(graded=0, to0=0, complacency=0, disappoint=0, missed_errors=0, social=0)
    S, out = pop["S0"].copy(), {0: pop["S0"].copy()}
    for t in range(p["T"]):
        S = step(S, t, p, pop, rng, cnt)
        if t + 1 in snap:
            out[t + 1] = S.copy()
    return pop, out


if __name__ == "__main__":
    p0 = params()
    SNAP = (0, p0["t_off"], p0["T"])
    pop, _ = snapshots("0. Control", SNAP)
    G = pop["G"]
    pos = {}
    for g in range(p0["N_groups"]):
        nodes = list(range(g * p0["group_size"], (g + 1) * p0["group_size"]))
        sub = nx.spring_layout(G.subgraph(nodes), seed=g, k=0.5)
        ang = 2 * np.pi * g / p0["N_groups"]
        cx, cy = 3.2 * np.cos(ang), 3.2 * np.sin(ang)
        for n in nodes:
            pos[n] = (cx + sub[n][0], cy + sub[n][1])

    fig, axes = plt.subplots(2, 3, figsize=(11, 7.2))
    titles = {0: "t = 0 (Start)", SNAP[1]: f"t = {SNAP[1]} (End of verification period)", SNAP[2]: f"t = {SNAP[2]} (End of simulation run)"}
    for row, scen in enumerate(SCENARIOS):
        _, snaps = snapshots(scen, SNAP)
        for col, t in enumerate(SNAP):
            ax = axes[row, col]
            S = snaps[t]
            nx.draw_networkx_edges(G, pos, ax=ax, edge_color="#d4d3cf", width=0.5)
            nx.draw_networkx_nodes(G, pos, ax=ax, node_size=28, node_color=[COLORS[s] for s in S],
                                   edgecolors="white", linewidths=0.6)
            ax.set_title(f"{scen} · {titles[t]}\nM = {(S == 0).mean():.2f}", fontsize=9, loc="left")
            ax.axis("off")
    handles = [Line2D([0], [0], marker="o", ls="", color=COLORS[s], label=LABELS[s], ms=7) for s in (-1, 0, 1)]
    fig.legend(handles=handles, loc="lower center", ncol=3, frameon=False, fontsize=9)
    fig.suptitle("Network of study groups: 6 groups of 25 students, with the same population in both scenarios.",
                 fontsize=10, x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0.05, 1, 0.97))
    fig.savefig("out/network.png", dpi=150)
    print("Done: out/network.png")
