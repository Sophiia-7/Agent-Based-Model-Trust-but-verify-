"""Рисунок сети: состояния студентов в начале, в конце проверок и в конце прогона
для контрольного сценария и сценария с проверками на одной и той же популяции (seed = 0)."""
import numpy as np
import networkx as nx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from model import params, init_population, step, SCENARIOS

SEED = 0
COLORS = {-1: "#6250d6", 0: "#1baf7a", 1: "#eb6834"}
LABELS = {-1: "−1: не доверяет", 0: "0: доверяет и проверяет", 1: "+1: доверяет без проверки"}


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
    pop, _ = snapshots("0. Контроль", SNAP)
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
    titles = {0: "t = 0 (начало)", SNAP[1]: f"t = {SNAP[1]} (конец проверок)", SNAP[2]: f"t = {SNAP[2]} (конец прогона)"}
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
    fig.suptitle("Сеть учебных групп: 6 групп по 25 студентов, одна и та же популяция в двух сценариях",
                 fontsize=10, x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0.05, 1, 0.97))
    fig.savefig("out/network.png", dpi=150)
    print("готово: out/network.png")
