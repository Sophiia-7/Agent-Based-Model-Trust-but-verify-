"""
Mesa-реализация модели «Доверяй, но проверяй».

Логика та же, что в model.py:
  - состояния -1 / 0 / +1; индивидуальные характеристики s, c, gamma, lam;
  - проверки преподавателя (покрытие r, строгость sigma) только в раунды [t_on, t_off);
  - влияние друга: шаг на одну позицию к случайному соседу с вероятностью beta·c;
  - один раунд = одно синхронное обновление по снимку S(t) (фазы step / advance).
"""
import networkx as nx
import numpy as np
import mesa
from mesa.space import NetworkGrid
from mesa.datacollection import DataCollector

from model import BASE, SCENARIOS

DEFAULT_SCENARIO = "1. Преподаватель"
INT_KEYS = ("T", "t_on", "t_off", "N_groups", "group_size")


class Student(mesa.Agent):
    def __init__(self, model, state, group, c, s, gamma, lam):
        super().__init__(model)
        self.state = state
        self.next_state = state
        self.group = group          
        self.c = c                 
        self.s = s 
        self.gamma = gamma  
        self.lam = lam 

    def quality(self):
        e = self.model.p["e"]
        return {-1: self.s, 0: 1 - e * (1 - self.s), 1: 1 - e}[self.state]

    def teacher_proposal(self):
        m, p, s = self.model, self.model.p, self.state
        if m.rng.random() >= m.r_t:
            return None
        true_good = m.rng.random() < self.quality()
        noticed = m.rng.random() < p["sigma"]       
        bad = (not true_good) and noticed
        x = m.rng.random()
        if s == -1 and bad and x < p["a"]:
            return 0
        if s == 1 and bad and x < p["b"]:
            return 0
        if s == 0 and not bad and x < self.gamma:
            m.counts["complacency"] += 1
            return 1
        if s == 0 and bad and x < self.lam:
            m.counts["disappoint"] += 1
            return -1
        return None

    def social_proposal(self):
        m, p = self.model, self.model.p
        neighbors = m.grid.get_neighbors(self.pos, include_center=False)
        if not neighbors:
            return None
        j = neighbors[m.rng.integers(len(neighbors))]
        diff = j.state - self.state
        if abs(diff) == 1 and m.rng.random() < p["beta"] * self.c:
            return self.state + int(np.sign(diff))   
        return None

    def step(self):
        for mech in (self.teacher_proposal, self.social_proposal):
            new = mech()
            if new is not None:
                self.next_state = new
                return
        self.next_state = self.state

    def advance(self):
        self.state = self.next_state


class TrustModel(mesa.Model):
    def __init__(self, scenario_name=DEFAULT_SCENARIO, scenario=None, seed=0, **overrides):
        super().__init__(rng=seed)

        if scenario_name is None and isinstance(scenario, str):
            scenario_name = scenario
        if hasattr(scenario, "name") and not isinstance(scenario, str):
            scenario_name = getattr(scenario, "name", scenario_name)
        if scenario_name not in SCENARIOS:
            scenario_name = DEFAULT_SCENARIO

        self.scenario_name = scenario_name
        self.seed = seed
        self.p = dict(BASE)
        self.p.update(SCENARIOS[scenario_name])
        self.p.update(overrides)
        p = self.p
        for key in INT_KEYS:
            p[key] = int(p[key])
        self.t = 0
        self.counts = dict(complacency=0, disappoint=0)

        k, n = p["N_groups"], p["group_size"]
        probs = [[p["p_in"] if i == j else p["p_out"] for j in range(k)] for i in range(k)]
        self.G = nx.stochastic_block_model([n] * k, probs, seed=int(self.rng.integers(2**31)))
        self.grid = NetworkGrid(self.G)

        for node in self.G.nodes:
            state = int(self.rng.choice([-1, 0, 1], p=[p["L0"], p["M0"], p["H0"]]))
            a = Student(
                self, state, group=node // n,
                c=self.rng.uniform(),
                s=float(np.clip(self.rng.uniform(p["s"] - p["s_spread"], p["s"] + p["s_spread"]), 0, 1)),
                gamma=float(np.clip(self.rng.uniform(0, 2 * p["gamma"]), 0, 1)),
                lam=float(np.clip(self.rng.uniform(0, 2 * p["lam"]), 0, 1)),
            )
            self.grid.place_agent(a, node)

        self.pos = self._build_layout()

        self.datacollector = DataCollector(model_reporters={
            "L": lambda m: m.share(-1),
            "M": lambda m: m.share(0),
            "H": lambda m: m.share(1),
            "M_groups": lambda m: m.group_shares(),
        })
        self.datacollector.collect(self)

    def _build_layout(self):
        p = self.p
        G = nx.Graph(self.G)
        pos = {}
        for g in range(p["N_groups"]):
            nodes = list(range(g * p["group_size"], (g + 1) * p["group_size"]))
            sub = nx.spring_layout(G.subgraph(nodes), seed=g, k=0.5)
            ang = 2 * np.pi * g / p["N_groups"]
            cx, cy = 3.2 * np.cos(ang), 3.2 * np.sin(ang)
            for n in nodes:
                pos[n] = (cx + sub[n][0], cy + sub[n][1])
        return pos

    def share(self, s):
        states = [a.state for a in self.agents]
        return states.count(s) / len(states)

    def group_shares(self, s=0):
        """Доля студентов в состоянии s в каждой учебной группе."""
        counts = np.zeros(self.p["N_groups"])
        for a in self.agents:
            counts[a.group] += a.state == s
        return [float(x) for x in counts / self.p["group_size"]]

    def state_by_node(self):
        return {int(a.pos): int(a.state) for a in self.agents}

    def history_df(self):
        return self.datacollector.get_model_vars_dataframe().reset_index(drop=True)

    @property
    def active(self):
        return self.p["t_on"] <= self.t < self.p["t_off"]

    @property
    def r_t(self):
        return self.p["r"] if (self.active and self.p["teacher"]) else 0.0

    def step(self):
        self.agents.do("step")
        self.agents.do("advance")
        self.t += 1
        self.datacollector.collect(self)

    def run(self):
        for _ in range(self.p["T"] - self.t):
            self.step()
        return self.history_df()


if __name__ == "__main__":
    for name in SCENARIOS:
        df = TrustModel(scenario_name=name, seed=0).run()
        print(f"{name:18s}  M(40) = {df.M.iloc[40]:.2f}   M(60) = {df.M.iloc[60]:.2f}   H(60) = {df.H.iloc[60]:.2f}")
