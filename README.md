# Trust, but Verify — An Interactive Mesa Model
The application uses [Mesa](https://github.com/mesa/mesa?ysclid=mwfeakarx3112063774) and [Solara](https://github.com/widgetti/solara?ysclid=mwfebic4lg60649934).
## About the Model
With the development of large language models (LLMs), artificial intelligence (AI) assistants have become an everyday tool for students. Therefore, universities face an important challenge: how to organize the use of AI in education. The project authors suggest that universities should encourage students to both trust and critically evaluate AI results. They argue that a complete ban on AI assistants would only lead students to use them secretly. 

We propose an agent-based model to explore how the structure of students' social networks and teachers' assessment practices affect the proportion of students who both trust AI and check its answers. The model also helps to understand how teachers' checks influence students' attitudes towards AI.

The model includes students as agents, where $i = 1, \ldots, N$ and $N = nk$. Here, $k$ is the number of study groups, and $n$ is the number of students in each group. In the basic configuration, $k = 6$, $n = 25$, and $N = 150$.

The environment includes a network of friendships, an AI tool with a fixed probability of making errors, and a teacher who checks students' work. The teacher and AI are not separate agents because their behavior is defined by fixed model parameters.

Each student can be in one of three states:

| State | Description |
|---|---|
| -1 | Does not trust or use AI |
| 0 | Trusts AI and checks its answers |
| +1 | Trusts AI without checking its answers |

The model uses the following parameters.

### Individual Student Parameters

| Parameter | Description |
|---|---|
| Knowledge level | Probability of completing a task correctly without AI or detecting an AI error |
| Conformity | How strongly a student is influenced by friends |
| Tendency to relax | Probability of stopping AI checks after receiving a good grade |
| Sensitivity to AI failure | Probability of rejecting AI after receiving a bad grade |

### Main Model Parameters

| Parameter | Default value | Description |
|---|---|---|
| AI error probability | 0.45 | Probability that AI gives an incorrect answer |
| Check coverage | 0.20 | Proportion of student assignments checked by the teacher |
| Check strictness | 1.00 | Probability that the teacher detects an actual error |
| Reaction to a bad grade (-1) | 0.40 | Probability that a student who does not use AI starts using it with verification |
| Reaction to a bad grade (+1) | 0.60 | Probability that a student who blindly trusts AI starts checking its answers |
| Average tendency to relax | 0.15 | Average probability of stopping verification after a good grade |
| Average sensitivity to AI failure | 0.30 | Average probability of rejecting AI after a bad grade |
| Average knowledge level | 0.65 | Average level of students' ability |
| Social influence | 0.50 | Intensity of discussions about AI between friends |
| Study groups | 6 | Number of student groups |
| Students per group | 25 | Number of students in each group |
| Friendship probability (within groups) | 0.25 | Probability of a friendship between students in the same group |
| Friendship probability (between groups) | 0.01 | Probability of a friendship between students from different groups |
| Simulation rounds | 60 | Total number of rounds |
| Teacher checks | Rounds 10–39 | Period when teachers check assignments |

The initial proportions of students in states -1, 0, and +1 are 0.30, 0.20, and 0.50, respectively.

## About the Research

It is important to note that the we do not experiment with the network structure in their main study. Instead, we use default values that roughly represent the organization of student groups at HSE University, where a study program may include around 150 students. These values are assumptions rather than estimates based on real data.

We conduct experiments with different settings for teacher checks. Their results show that teacher checks can increase the proportion of students who both trust AI and verify its answers. In the basic configuration, this proportion increases from approximately 19% to 50%.

However, the effect depends on how carefully teachers check assignments and how reliable AI is. The results suggest that it is better for teachers to carefully check fewer assignments than to check more assignments without paying enough attention to errors.

In your own research, you can use this model to conduct new experiments with different parameters and obtain your own results. In particular, it would be interesting to explore how changes in the students' social network affect their attitudes towards AI.

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

## Terms of Use

When using this model or the results of this research, please cite the authors:

- **Viktoriia Beliavskaia** — HSE University
- **Sofia Buyanova** — HSE University
- **Karina Galimnurova** — HSE University

## Acknowledgements

We would also like to express our gratitude to **Andrey S. Akhremenko**, Professor at the Faculty of Social Sciences, HSE University, for reviewing our research and model.
