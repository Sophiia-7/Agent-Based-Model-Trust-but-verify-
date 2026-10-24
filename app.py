"""Интерактивный Mesa дашборд.

Запуск:
    python -m pip install -r requirements.txt
    solara run app.py
"""
import base64
from pathlib import Path

import anywidget
import numpy as np
import traitlets

from mesa_model import TrustModel, DEFAULT_SCENARIO
from model import BASE, SCENARIOS, equilibrium, meanfield_traj
from ensemble import app_ensemble

HERE = Path(__file__).resolve().parent

PARAMETER_BOUNDS = {
    "e": (0.0, 1.0),
    "r": (0.0, 0.5),
    "sigma": (0.0, 1.0),
    "a": (0.0, 1.0),
    "b": (0.0, 1.0),
    "gamma": (0.0, 0.5),
    "lam": (0.0, 0.5),
    "s": (0.35, 0.65),
    "beta": (0.0, 1.0),
    "p_out": (0.0, 0.1),
}

INT_BOUNDS = {
    "T": (20, 200),
    "t_on": (0, 199),
    "t_off": (1, 200),
    "N_groups": (2, 10),
    "group_size": (10, 50),
}

EXPERIMENT_FIGURES = (
    ("RQ · Контроль и проверки", "E1_scenarios.png"),
    ("H1 · Надежность ИИ", "H1_error_rate.png"),
    ("H2 · Покрытие и строгость", "H2_coverage_strictness.png"),
    ("H3 · Устойчивость", "H3_persistence.png"),
    ("Чувствительность", "S_sensitivity.png"),
    ("Разброс прогонов (бутстрап)", "B_bootstrap.png"),
    ("Сеть (seed 0)", "network.png"),
)
H2_R = (0.05, 0.1, 0.2, 0.3, 0.5)
H2_SIGMA = (0.1, 0.25, 0.5, 0.75, 1.0)


def _safe_settings(raw):
    raw = raw if isinstance(raw, dict) else {}
    scenario = raw.get("scenario", DEFAULT_SCENARIO)
    if scenario not in SCENARIOS:
        scenario = DEFAULT_SCENARIO

    try:
        seed = max(0, min(99999, int(raw.get("seed", 0))))
    except (TypeError, ValueError):
        seed = 0

    overrides = {}
    for name, (lower, upper) in PARAMETER_BOUNDS.items():
        try:
            value = float(raw.get(name, BASE[name]))
            if not (lower <= value <= upper):
                value = float(BASE[name])
        except (TypeError, ValueError):
            value = float(BASE[name])
        overrides[name] = value
    for name, (lower, upper) in INT_BOUNDS.items():
        try:
            value = int(raw.get(name, BASE[name]))
            if not (lower <= value <= upper):
                value = int(BASE[name])
        except (TypeError, ValueError):
            value = int(BASE[name])
        overrides[name] = value
    overrides["t_off"] = min(overrides["t_off"], overrides["T"])
    overrides["t_on"] = min(overrides["t_on"], overrides["t_off"] - 1)

    return scenario, seed, overrides


def _hypothesis_panels(p):
    """Графики гипотез для текущих параметров (среднеполевой расчет, без общения)."""
    grid = [round(x, 3) for x in np.linspace(0.05, 0.95, 19)]
    h1 = {
        "grid": grid,
        "current": [equilibrium({**p, "e": e}, n=4000)["M"] for e in grid],
        "strict": [equilibrium({**p, "e": e, "sigma": 1.0}, n=4000)["M"] for e in grid],
        "e": float(p["e"]),
        "M_e": equilibrium(p, n=4000)["M"],
        "sigma": float(p["sigma"]),
    }
    values = [[float(meanfield_traj({**p, "teacher": True, "r": r, "sigma": sg}, n=1500)[p["t_off"], 1])
               for r in H2_R] for sg in H2_SIGMA]
    h2 = {
        "r": list(H2_R), "sigma": list(H2_SIGMA), "values": values,
        "cur_r": int(np.argmin([abs(r - p["r"]) for r in H2_R])),
        "cur_sigma": int(np.argmin([abs(s - p["sigma"]) for s in H2_SIGMA])),
        "t_off": int(p["t_off"]),
    }
    expected = meanfield_traj(p, n=3000)[:, 1].tolist()
    return h1, h2, expected


def _load_figures():
    figures = []
    for title, filename in EXPERIMENT_FIGURES:
        path = HERE / "out" / filename
        if path.exists():
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            figures.append({"title": title, "src": f"data:image/png;base64,{data}"})
    return figures


class TrustDashboard(anywidget.AnyWidget):
    _esm = HERE / "dashboard.js"
    _css = HERE / "dashboard.css"

    snapshot = traitlets.Dict(default_value={}).tag(sync=True)
    command = traitlets.Dict(default_value={}).tag(sync=True)
    figures = traitlets.List(default_value=[]).tag(sync=True)
    ensemble = traitlets.Dict(default_value={}).tag(sync=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._last_command_id = 0
        self._scenario = DEFAULT_SCENARIO
        self._seed = 0
        self._overrides = {name: float(BASE[name]) for name in PARAMETER_BOUNDS}
        self._overrides.update({name: int(BASE[name]) for name in INT_BOUNDS})
        self._model = self._create_model()
        self.figures = _load_figures()      
        self.snapshot = self._get_snapshot()
        self.observe(self._handle_command, names="command")

    def _create_model(self):
        model = TrustModel(
            scenario_name=self._scenario,
            seed=self._seed,
            **self._overrides,
        )
        self._h1, self._h2, self._expected = _hypothesis_panels(model.p)
        return model

    def _get_snapshot(self):
        model = self._model
        history = model.history_df()
        states = model.state_by_node()
        groups = [list(row) for row in history["M_groups"]]
        intervention = bool(model.p["teacher"])
        return {
            "ack": self._last_command_id,
            "step": int(model.t),
            "limit": int(model.p["T"]),
            "scenario": model.scenario_name,
            "intervention": intervention,
            "t_on": int(model.p["t_on"]),
            "t_off": int(model.p["t_off"]),
            "n_groups": int(model.p["N_groups"]),
            "n_agents": int(model.p["N_groups"] * model.p["group_size"]),
            "shares": [float(history[key].iloc[-1]) for key in ("L", "M", "H")],
            "history": [[float(x) for x in row] for row in history[["L", "M", "H"]].to_numpy()],
            "groups": groups,
            "group_sd": float(np.std(groups[-1])),
            "expected": self._expected if intervention else [],
            "h1": self._h1,
            "h2": self._h2,
            "states": [states[node] for node in sorted(model.G.nodes)],
            "positions": [[float(model.pos[n][0]), float(model.pos[n][1])] for n in sorted(model.G.nodes)],
            "edges": [[int(a), int(b)] for a, b in model.G.edges()],
        }

    def _handle_command(self, event):
        payload = event["new"]
        if not isinstance(payload, dict):
            return

        try:
            command_id = int(payload.get("id", 0))
        except (ValueError, TypeError):
            return
        if command_id <= self._last_command_id:
            return
        self._last_command_id = command_id

        action = payload.get("action")
        if action == "reset":
            self._scenario, self._seed, self._overrides = _safe_settings(payload.get("settings"))
            self._model = self._create_model()
            self.ensemble = {}                       
        elif action == "ensemble":
            try:
                R = max(10, min(300, int(payload.get("R", 40))))
            except (TypeError, ValueError):
                R = 40
            data = app_ensemble(self._model.p, self._model.scenario_name, R=R)
            data["scenario"] = self._model.scenario_name
            self.ensemble = data
        elif action in ("step", "step10"):
            n = 1 if action == "step" else 10
            for _ in range(n):
                if self._model.t >= self._model.p["T"]:
                    break
                self._model.step()
        else:
            return

        self.snapshot = self._get_snapshot()

page = TrustDashboard()
