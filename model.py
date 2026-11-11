"""
Agent-based model "Trust, but Verify"

Student states:
    -1  does not trust AI and does not use it
     0  trusts and verifies — target state (centrist)
    +1  trusts without verification

Individual (micro-level) characteristics of student i:
    s_i      own ability level: probability of producing good work independently
             and probability of detecting an AI error during verification;  s_i ~ U(s - s_spread, s + s_spread)
    c_i      conformity;                                                c_i ~ U(0, 1)
    gamma_i  tendency to relax after success (0 -> +1);                 gamma_i ~ U(0, 2*gamma)
    lam_i    sensitivity to AI failure (0 -> -1);                       lam_i ~ U(0, 2*lam)

Macro-level parameters: e (AI error rate), r (coverage), sigma (strictness), a, b, beta, network, time.

True quality of work (probability that the work is good):
    q_{-1,i} = s_i,   q_{0,i} = 1 - e (1 - s_i),   q_{+1} = 1 - e.
The teacher detects an actual error with probability sigma; an undetected error = "good".

One round = one update based on the snapshot S(t); an agent can change state at most once per round;
priority: teacher's assessment > peer influence.
"""
import numpy as np
import networkx as nx

BASE = dict(
    # network
    N_groups=6, group_size=25, p_in=0.25, p_out=0.01,
    # initial proportions (-1, 0, +1)
    L0=0.3, M0=0.2, H0=0.5,
    # time: verification takes place during rounds [t_on, t_off)
    T=60, t_on=10, t_off=40,
    # scenario
    teacher=True,
    # environment
    e=0.45,
    # university intervention parameters
    r=0.2, sigma=1.0,
    # responses to assessment (a, b — macro-level; gamma, lam — means of individual values)
    a=0.4, b=0.6, gamma=0.15, lam=0.3,
    # student's own ability level: mean and half-width of the uniform distribution
    s=0.65, s_spread=0.35,
    # communication
    beta=0.5,
)

SCENARIOS = {
    "0. Control": dict(teacher=False),
    "1. Teacher": dict(teacher=True),
}


def params(**over):
    p = dict(BASE)
    p.update(over)
    return p


def draw_traits(p, rng, N):
    """Individual characteristics (the order of calls is fixed for reproducibility)."""
    c = rng.uniform(0, 1, N)
    s = np.clip(rng.uniform(p["s"] - p["s_spread"], p["s"] + p["s_spread"], N), 0, 1)
    gamma = np.clip(rng.uniform(0, 2 * p["gamma"], N), 0, 1)
    lam = np.clip(rng.uniform(0, 2 * p["lam"], N), 0, 1)
    return c, s, gamma, lam


def init_population(p, seed):
    """Network, characteristics, and initial states. These depend only on the seed and
    population parameters, so with the same seed, both scenarios are compared using the same population."""
    rng = np.random.default_rng([seed, 0])
    k, n = p["N_groups"], p["group_size"]
    probs = [[p["p_in"] if i == j else p["p_out"] for j in range(k)] for i in range(k)]
    G = nx.stochastic_block_model([n] * k, probs, seed=int(rng.integers(2**31)))
    N = k * n
    indptr = np.zeros(N + 1, dtype=int)
    nbrs = []
    for i in range(N):
        nb = sorted(G.neighbors(i))
        nbrs.extend(nb)
        indptr[i + 1] = indptr[i] + len(nb)
    indices = np.array(nbrs, dtype=int)
    c, s, gamma, lam = draw_traits(p, rng, N)
    S0 = rng.choice([-1, 0, 1], size=N, p=[p["L0"], p["M0"], p["H0"]])
    group = np.arange(N) // n
    return dict(G=G, indptr=indptr, indices=indices, c=c, s=s, gamma=gamma, lam=lam,
                S0=S0, N=N, group=group)


def step(S, t, p, pop, rng, cnt):
    """One update S(t) -> S(t+1) based on the snapshot S(t)."""
    N = pop["N"]
    active = p["teacher"] and (p["t_on"] <= t < p["t_off"])
    new = S.copy()
    changed = np.zeros(N, dtype=bool)

    s_i, e, sig = pop["s"], p["e"], p["sigma"]
    q = np.where(S == -1, s_i, np.where(S == 0, 1 - e * (1 - s_i), 1 - e))  
    Z = rng.random(N) < (p["r"] if active else 0.0)  
    true_good = rng.random(N) < q
    noticed = rng.random(N) < sig                        
    bad = ~true_good & noticed                             
    x = rng.random(N)
    m1 = Z & (S == -1) & bad & (x < p["a"])     
    p1 = Z & (S == 1) & bad & (x < p["b"])       
    c0 = Z & (S == 0) & ~bad & (x < pop["gamma"])  
    d0 = Z & (S == 0) & bad & (x < pop["lam"])
    new[m1 | p1] = 0
    new[c0] = 1
    new[d0] = -1
    changed |= m1 | p1 | c0 | d0
    cnt["graded"] += int(Z.sum())
    cnt["to0"] += int((m1 | p1).sum())
    cnt["complacency"] += int(c0.sum())
    cnt["disappoint"] += int(d0.sum())
    cnt["missed_errors"] += int((Z & ~true_good & ~noticed).sum())

    deg = np.diff(pop["indptr"])
    has = deg > 0
    off = np.floor(rng.random(N) * np.maximum(deg, 1)).astype(int)
    idx = np.minimum(pop["indptr"][:-1] + off, max(len(pop["indices"]) - 1, 0))
    j = np.where(has, pop["indices"][idx] if len(pop["indices"]) else 0, np.arange(N))
    diff = S[j] - S
    prob = p["beta"] * pop["c"] * (np.abs(diff) == 1)
    succ = ~changed & has & (rng.random(N) < prob)
    new[succ] = S[succ] + np.sign(diff[succ])
    cnt["social"] += int(succ.sum())
    return new


def shares(S):
    return [(S == -1).mean(), (S == 0).mean(), (S == 1).mean()]


def run(over=None, seed=0, groups=False, pop_seed=None):
    """One simulation run. hist: (T+1) × 3 proportions (L, M, H); with groups=True,
    also the proportion of centrists in each group: (T+1) × N_groups.

    seed     — random seed for the dynamics (assessments, friend selection);
    pop_seed — random seed for the network, characteristics, and initial states (default = seed).
    Separate seeds allow the variation "between populations" to be distinguished
    from the variation in dynamics."""
    p = params(**(over or {}))
    pop = init_population(p, seed if pop_seed is None else pop_seed)
    rng = np.random.default_rng([seed, 1])
    S = pop["S0"].copy()
    cnt = dict(graded=0, to0=0, complacency=0, disappoint=0, missed_errors=0, social=0)
    k = p["N_groups"]
    hist = np.zeros((p["T"] + 1, 3))
    hist[0] = shares(S)
    gM = np.zeros((p["T"] + 1, k))
    gM[0] = np.bincount(pop["group"], weights=(S == 0), minlength=k) / p["group_size"]
    for t in range(p["T"]):
        S = step(S, t, p, pop, rng, cnt)
        hist[t + 1] = shares(S)
        gM[t + 1] = np.bincount(pop["group"], weights=(S == 0), minlength=k) / p["group_size"]
    return (hist, cnt, gM) if groups else (hist, cnt)


def metrics(hist, over=None, gM=None):
    p = params(**(over or {}))
    L, M, H = hist[:, 0], hist[:, 1], hist[:, 2]
    w = 10
    dur = slice(p["t_off"] - w + 1, p["t_off"] + 1)      
    aft = slice(p["T"] - w + 1, p["T"] + 1)            
    out = dict(M_during=M[dur].mean(), H_during=H[dur].mean(), L_during=L[dur].mean(),
               M_after=M[aft].mean(), H_after=H[aft].mean(), L_after=L[aft].mean())
    out["Persist"] = out["M_after"] - out["M_during"]
    if gM is not None:
        out["sd_groups_off"] = gM[p["t_off"]].std()
        out["sd_groups_end"] = gM[p["T"]].std()
    return out

def _agent_rates(p, s, gamma, lam, r=1.0):
    """Transition probabilities per round for each agent at coverage r."""
    e, sig = p["e"], p["sigma"]
    up_L = r * (1 - s) * sig * p["a"] 
    dn_L = r * e * (1 - s) * sig * lam  
    up_H = r * (1 - e * (1 - s) * sig) * gamma 
    dn_H = r * e * sig * p["b"] 
    return up_L, dn_L, up_H, dn_H


def sample_traits(p, n=20000, seed=123):
    rng = np.random.default_rng(seed)
    _, s, gamma, lam = draw_traits(p, rng, n)
    return s, gamma, lam


def equilibrium(over=None, n=20000):
    """Equilibrium under continuous verification: each student independently transitions
    between three states, and the overall proportion is the average of the
    stationary distributions across students.
    The equilibrium does not depend on coverage r."""
    p = params(**(over or {}))
    s, g, l = sample_traits(p, n)
    upL, dnL, upH, dnH = _agent_rates(p, s, g, l)
    tiny = 1e-12
    LM = dnL / np.maximum(upL, tiny)
    HM = upH / np.maximum(dnH, tiny)
    M = 1 / (1 + LM + HM)
    return dict(L=float((LM * M).mean()), M=float(M.mean()), H=float((HM * M).mean()))


def meanfield_traj(over=None, n=5000):
    """Expected dynamics of proportions without communication
    (communication does not change the proportions on average)."""
    p = params(**(over or {}))
    s, g, l = sample_traits(p, n)
    P = np.tile([p["L0"], p["M0"], p["H0"]], (n, 1)).astype(float)
    out = np.zeros((p["T"] + 1, 3))
    out[0] = P.mean(0)
    for t in range(p["T"]):
        active = p["teacher"] and (p["t_on"] <= t < p["t_off"])
        if active:
            upL, dnL, upH, dnH = _agent_rates(p, s, g, l, r=p["r"])
            L, M, H = P[:, 0], P[:, 1], P[:, 2]
            P = np.column_stack([L - upL * L + dnL * M,
                                 M + upL * L + dnH * H - (dnL + upH) * M,
                                 H - dnH * H + upH * M])
        out[t + 1] = P.mean(0)
    return out
