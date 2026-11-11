# Trust, but Verify — An Interactive Mesa Model

The application uses Mesa + Solara.

## Running in PyCharm

Open the built-in Terminal in the project directory containing `app.py`, `mesa_model.py`, `model.py`, `dashboard.js`, and `dashboard.css`.

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python run_all.py 200      
solara run app.py
```

Open the link shown in the terminal, usually http://localhost:8765.

## Controls

- **Start** — automatically advance from one round to the next until the simulation ends.
- **Pause** — stop automatic execution at the current round.
- **Step +1** and **Step +10** — advance manually.
- **Reset** — start over (with the selected parameters).
- **Speed** — the pause between consecutive rounds, in milliseconds.

Scenarios: **0 · Control** (no checks) and **1 · Teacher** (checks during rounds t_on–t_off).
Changing the scenario immediately starts a new simulation. Changes to other parameters take effect when you click “Apply” or “Reset,” or start a new run.

Parameters in the panel:
- **Parameters:** e (AI error), r (coverage), σ (strictness), a, b, γ, and λ (means of individual values), s (average student level), β (communication), p_out (friendships between groups).
- **Time and network:** T, t_on, t_off (automatically constrained to satisfy 0 ≤ t_on < t_off ≤ T), number of groups, group size, seed.

## Ensemble of Runs in the Application

After clicking “Apply” or “Reset,” or changing the scenario, the application automatically (if the checkbox under “Model Controls” is selected) runs the model R times with the current parameters (the “Ensemble” slider; 40 by default; approximately 3 seconds) and updates:
- the ensemble bands and summary table;
- the simulation points on the H1 plot (over a grid of e values, R/4 runs per point; error bars show the interval covering 95% of runs and the bootstrap interval);
- the percentages on the H2 heatmap (simulation, R/4 runs per cell; ± indicates the half-width of the bootstrap interval).

The “↻ Recalculate Ensemble” button triggers recalculation manually (for example, with a larger R).
The ensemble is computed using the fast NumPy version of the model (`model.py`), whose logic matches that of the Mesa version.

## Variation Across Runs (“Bootstrap”) in Experiments

`experiments.py` saves the metrics for every run of all experiments (`out/data/all_runs.csv`) and a summary (`out/data/bootstrap_summary.csv`): the mean, standard deviation (SD) across runs, the interval covering 95% of runs, and the 95% bootstrap confidence interval for the mean (1,000 resamples). Experiment B (`B_convergence.csv`, `B_variance.csv`, figure `B_bootstrap.png`) examines the convergence of the mean as the number of runs increases and decomposes variability into “between-population” variation (network, characteristics, initial states) and “within-population” variation (randomness in evaluations and communication).

The gray shaded region appears on the plots only in the scenario with checks.

## Architecture

- `model.py` — the main vectorized model for Variant 3 and its parameters (BASE, SCENARIOS), plus mean-field calculations.
- `mesa_model.py` — the same model implemented using the Mesa architecture (Student, TrustModel; methods for accessing states, group proportions, and the fixed layout).
- `ensemble.py` — ensembles of runs and bootstrapping (used by the experiments and the application).
- `app.py` — the Python → browser bridge: updates the model state in response to interface commands, computes the hypothesis plots on reset, and sends the experiment figures once.
- `dashboard.js` — the control panel and rendering of the network and plots on Canvas.
- `dashboard.css` — the interface styling.
- `experiments.py`, `figures.py`, `network_viz.py`, `run_all.py` — experiments and figures.

All state changes are performed through the Python `TrustModel` instance. JavaScript is responsible only for rendering and sequentially sending commands during automatic execution. Each subsequent step begins only after the previous one has been acknowledged, with no parallel calls to the model.
