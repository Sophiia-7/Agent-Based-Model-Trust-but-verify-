
const palette = { "-1": "#7467df", "0": "#159b83", "1": "#ed9257" };
const accent = { strict: "#2f6fb0", band: "rgba(145, 152, 171, 0.14)", grid: "#edf0f5", axis: "#8a93a5" };

const parameters = [
  {name: "e", label: "AI error probability", symbol: "e", min: 0, max: 1, step: 0.05, value: 0.45},
  {name: "r", label: "Verification coverage", symbol: "r", min: 0, max: 0.5, step: 0.05, value: 0.2},
  {name: "sigma", label: "Verification strictness", symbol: "σ", min: 0, max: 1, step: 0.05, value: 1.0},
  {name: "a", label: "Skeptic tries AI", symbol: "a", min: 0, max: 1, step: 0.05, value: 0.4},
  {name: "b", label: "Starts verifying", symbol: "b", min: 0, max: 1, step: 0.05, value: 0.6},
  {name: "gamma", label: "Tendency to relax after success (mean)", symbol: "γ", min: 0, max: 0.5, step: 0.05, value: 0.15},
  {name: "lam", label: "Sensitivity to AI failure (mean)", symbol: "λ", min: 0, max: 0.5, step: 0.05, value: 0.3},
  {name: "s", label: "Student ability level (mean)", symbol: "s", min: 0.35, max: 0.65, step: 0.05, value: 0.65},
  {name: "beta", label: "Communication intensity", symbol: "β", min: 0, max: 1, step: 0.05, value: 0.5},
  {name: "p_out", label: "Friendships between groups", symbol: "p_out", min: 0, max: 0.1, step: 0.005, value: 0.01, digits: 3},
];

const intParameters = [
  {name: "T", label: "Number of rounds", symbol: "T", min: 20, max: 200, step: 5, value: 60},
  {name: "t_on", label: "Start of verification", symbol: "t_on", min: 0, max: 199, step: 1, value: 10},
  {name: "t_off", label: "End of verification", symbol: "t_off", min: 1, max: 200, step: 1, value: 40},
  {name: "N_groups", label: "Number of study groups", symbol: "k", min: 2, max: 10, step: 1, value: 6},
  {name: "group_size", label: "Group size", symbol: "n", min: 10, max: 50, step: 5, value: 25},
];

function canvasSize(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const box = canvas.getBoundingClientRect();
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const realWidth = Math.round(w * ratio);
  const realHeight = Math.round(h * ratio);

  if (canvas.width !== realWidth || canvas.height !== realHeight) {
    canvas.width = realWidth;
    canvas.height = realHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return {ctx, w, h};
}

function fillCircle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function font(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function niceStep(limit) {
  for (const s of [5, 10, 20, 25, 50]) if (limit / s <= 8) return s;
  return 100;
}

function frame(ctx, w, h, opts) {
  const plot = {left: 48, top: 19, right: w - 16, bottom: h - 34};
  const pw = Math.max(1, plot.right - plot.left);
  const ph = Math.max(1, plot.bottom - plot.top);
  const X = v => plot.left + ((v - opts.xmin) / (opts.xmax - opts.xmin)) * pw;
  const Y = v => plot.bottom - v * ph;
  ctx.lineWidth = 1;
  font(ctx, 11);
  for (let j = 0; j <= 5; j++) {
    const v = j / 5, y = Y(v);
    ctx.beginPath();
    ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y);
    ctx.strokeStyle = accent.grid;
    ctx.stroke();
    ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillStyle = accent.axis;
    ctx.fillText(`${Math.round(v * 100)}%`, plot.left - 9, y);
  }
  for (const t of opts.xticks) {
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = accent.axis;
    ctx.fillText(opts.xfmt ? opts.xfmt(t) : String(t), X(t), plot.bottom + 10);
  }
  return {plot, pw, ph, X, Y};
}

function timeTicks(limit) {
  const step = niceStep(limit), ticks = [];
  for (let t = 0; t <= limit; t += step) ticks.push(t);
  return ticks;
}

function shadeIntervention(ctx, snap, f) {
  if (!snap.intervention) return;
  ctx.fillStyle = accent.band;
  ctx.fillRect(f.X(snap.t_on), f.plot.top, f.X(snap.t_off) - f.X(snap.t_on), f.ph);
}

function cursor(ctx, snap, f) {
  ctx.beginPath();
  ctx.moveTo(f.X(snap.step), f.plot.top);
  ctx.lineTo(f.X(snap.step), f.plot.bottom);
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(106, 116, 135, 0.55)";
  ctx.stroke();
  ctx.setLineDash([]);
}

function polyline(ctx, xs, ys, X, Y, color, width = 2.7, dash = []) {
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    const x = X(xs[i]), y = Y(ys[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = width; ctx.strokeStyle = color;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}

function networkDraw(canvas, snap) {
  if (!snap || !snap.positions?.length) return;
  const {ctx, w, h} = canvasSize(canvas);
  ctx.clearRect(0, 0, w, h);

  const margin = {left: 20, right: 20, top: 12, bottom: 17};
  const coords = snap.positions;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [x, y] of coords) {
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  const dw = Math.max(0.001, xmax - xmin);
  const dh = Math.max(0.001, ymax - ymin);
  const scale = Math.min((w - margin.left - margin.right) / dw, (h - margin.top - margin.bottom) / dh);
  const offX = (w - dw * scale) / 2;
  const offY = (h - dh * scale) / 2;
  const points = coords.map(([x, y]) => [offX + (x - xmin) * scale, h - offY - (y - ymin) * scale]);
  const radius = points.length > 250 ? 2.8 : 3.65;

  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(139, 150, 175, 0.26)";
  ctx.beginPath();
  for (const [a, b] of snap.edges) {
    if (!points[a] || !points[b]) continue;
    ctx.moveTo(points[a][0], points[a][1]);
    ctx.lineTo(points[b][0], points[b][1]);
  }
  ctx.stroke();
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    fillCircle(ctx, x, y, radius, palette[String(snap.states[i])] ?? "#a3a3a3");
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
  }
}

function chartDraw(canvas, snap) {
  if (!snap || !snap.history?.length) return;
  const {ctx, w, h} = canvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  const limit = Math.max(1, snap.limit);
  const f = frame(ctx, w, h, {xmin: 0, xmax: limit, xticks: timeTicks(limit)});
  shadeIntervention(ctx, snap, f);
  cursor(ctx, snap, f);

  if (snap.expected?.length) {
    const xs = snap.expected.map((_, t) => t);
    polyline(ctx, xs, snap.expected, f.X, f.Y, palette["0"], 1.3, [2, 4]);
  }
  const ts = snap.history.map((_, t) => t);
  for (let series = 0; series < 3; series++) {
    polyline(ctx, ts, snap.history.map(row => row[series]), f.X, f.Y, palette[String(series - 1)]);
    const last = snap.history[snap.history.length - 1][series];
    fillCircle(ctx, f.X(snap.step), f.Y(last), 4.3, palette[String(series - 1)]);
  }
}

function groupsDraw(canvas, snap) {
  if (!snap || !snap.groups?.length) return;
  const {ctx, w, h} = canvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  const limit = Math.max(1, snap.limit);
  const f = frame(ctx, w, h, {xmin: 0, xmax: limit, xticks: timeTicks(limit)});
  shadeIntervention(ctx, snap, f);
  cursor(ctx, snap, f);
  const k = snap.groups[0].length;
  const ts = snap.groups.map((_, t) => t);
  for (let g = 0; g < k; g++) {
    const alpha = 0.28 + 0.55 * g / Math.max(1, k - 1);
    polyline(ctx, ts, snap.groups.map(row => row[g]), f.X, f.Y, `rgba(21, 155, 131, ${alpha.toFixed(2)})`, 1.6);
  }
  polyline(ctx, ts, snap.history.map(row => row[1]), f.X, f.Y, "#1f3150", 2.7);
  fillCircle(ctx, f.X(snap.step), f.Y(snap.shares[1]), 4.3, "#1f3150");
}

function h1Draw(canvas, snap, ens) {
  const d = snap?.h1;
  if (!d) return;
  const {ctx, w, h} = canvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  const f = frame(ctx, w, h, {xmin: 0, xmax: 1, xticks: [0, 0.2, 0.4, 0.6, 0.8, 1], xfmt: v => v.toFixed(1)});
  polyline(ctx, d.grid, d.strict, f.X, f.Y, accent.strict, 1.6, [6, 4]);
  polyline(ctx, d.grid, d.current, f.X, f.Y, palette["0"], 2.7);

  const sim = ens?.h1;
  if (sim) {
    sim.e.forEach((e, i) => {
      const x = f.X(e);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(237, 146, 87, 0.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, f.Y(sim.run_lo[i])); ctx.lineTo(x, f.Y(sim.run_hi[i])); ctx.stroke();
      ctx.strokeStyle = "#c86a2e"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, f.Y(sim.ci_lo[i])); ctx.lineTo(x, f.Y(sim.ci_hi[i])); ctx.stroke();
      fillCircle(ctx, x, f.Y(sim.mean[i]), 3.6, "#ed9257");
    });
  }
  fillCircle(ctx, f.X(d.e), f.Y(d.M_e), 5, "#1f3150");
  font(ctx, 11, 650);
  ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillStyle = "#1f3150";
  const lx = Math.min(f.X(d.e) + 8, f.plot.right - 60);
  ctx.fillText(`${Math.round(d.M_e * 100)}%`, lx, f.Y(d.M_e) - 6);
}

function h2Draw(canvas, snap, ens) {
  const base = snap?.h2;
  if (!base) return;
  const d = ens?.h2 ? {...base, values: ens.h2.values, ci_half: ens.h2.ci_half} : base;
  const {ctx, w, h} = canvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  const plot = {left: 58, top: 14, right: w - 16, bottom: h - 40};
  const nc = d.r.length, nr = d.sigma.length;
  const cw = (plot.right - plot.left) / nc, ch = (plot.bottom - plot.top) / nr;
  font(ctx, 11);
  for (let i = 0; i < nr; i++) {
    for (let j = 0; j < nc; j++) {
      const v = d.values[i][j];
      const x = plot.left + j * cw, y = plot.bottom - (i + 1) * ch;
      const t = Math.min(1, v / 0.7);
      ctx.fillStyle = `rgba(21, 155, 131, ${(0.08 + 0.85 * t).toFixed(3)})`;
      ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
      ctx.fillStyle = t > 0.62 ? "#fff" : "#24334b";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (d.ci_half) {
        font(ctx, 11, 650);
        ctx.fillText(`${Math.round(v * 100)}%`, x + cw / 2, y + ch / 2 - 6);
        font(ctx, 9);
        ctx.fillText(`±${Math.round(d.ci_half[i][j] * 100)}`, x + cw / 2, y + ch / 2 + 8);
        font(ctx, 11);
      } else {
        ctx.fillText(`${Math.round(v * 100)}%`, x + cw / 2, y + ch / 2);
      }
    }
  }

  ctx.lineWidth = 2; ctx.strokeStyle = "#1f3150";
  ctx.strokeRect(plot.left + d.cur_r * cw + 1, plot.bottom - (d.cur_sigma + 1) * ch + 1, cw - 2, ch - 2);
  ctx.fillStyle = accent.axis;
  for (let j = 0; j < nc; j++) {
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(String(d.r[j]), plot.left + (j + 0.5) * cw, plot.bottom + 8);
  }
  for (let i = 0; i < nr; i++) {
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(String(d.sigma[i]), plot.left - 9, plot.bottom - (i + 0.5) * ch);
  }
  font(ctx, 10, 650);
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText("coverage r", (plot.left + plot.right) / 2, plot.bottom + 23);
  ctx.save();
  ctx.translate(14, (plot.top + plot.bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("strictness σ", 0, 0);
  ctx.restore();
}

function ensembleDraw(canvas, snap, ens) {
  const {ctx, w, h} = canvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!snap) return;
  const limit = Math.max(1, snap.limit);
  const f = frame(ctx, w, h, {xmin: 0, xmax: limit, xticks: timeTicks(limit)});
  shadeIntervention(ctx, snap, f);
  if (ens?.bands) {
    const colors = {"0. Control": [138, 147, 165], "1. Teacher": [47, 111, 176]};
    for (const [name, b] of Object.entries(ens.bands)) {
      const [r, g, bl] = colors[name] || [120, 120, 120];
      const xs = b.mean.map((_, t) => t);
      const area = (lo, hi, alpha) => {
        ctx.beginPath();
        xs.forEach((t, i) => (i ? ctx.lineTo(f.X(t), f.Y(hi[i])) : ctx.moveTo(f.X(t), f.Y(hi[i]))));
        for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(f.X(xs[i]), f.Y(lo[i]));
        ctx.closePath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${alpha})`;
        ctx.fill();
      };
      area(b.run_lo, b.run_hi, 0.10);
      area(b.ci_lo, b.ci_hi, 0.35);
      polyline(ctx, xs, b.mean, f.X, f.Y, `rgb(${r}, ${g}, ${bl})`, 1.6);
    }
  }
  cursor(ctx, snap, f);
  const ts = snap.history.map((_, t) => t);
  polyline(ctx, ts, snap.history.map(row => row[1]), f.X, f.Y, palette["0"], 2.7);
  fillCircle(ctx, f.X(snap.step), f.Y(snap.shares[1]), 4.3, palette["0"]);
  if (!ens?.bands) {
    font(ctx, 12, 650);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#8a93a5";
    ctx.fillText("Recalculating ensemble…", (f.plot.left + f.plot.right) / 2, f.plot.top + 24);
  }
}

function percentileOfCurrent(snap, ens) {
  if (!ens?.runsM || ens.scenario !== snap.scenario) return null;
  const t = Math.min(snap.step, ens.runsM[0].length - 1);
  const values = ens.runsM.map(run => run[t]);
  const below = values.filter(v => v < snap.shares[1] - 1e-9).length;
  const equal = values.filter(v => Math.abs(v - snap.shares[1]) <= 1e-9).length;
  return Math.round(100 * (below + equal / 2) / values.length);
}

function paramBlock(p, digits) {
  return `
  <div class="td-param">
    <div class="td-param-label"><span><span class="td-symbol">${p.symbol}</span> ${p.label}</span><output data-output="${p.name}">${p.value.toFixed(digits)}</output></div>
    <input type="range" data-param="${p.name}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" aria-label="${p.label}">
  </div>`;
}
const paramHTML = parameters.map(p => paramBlock(p, p.digits ?? 2)).join("");
const intParamHTML = intParameters.map(p => paramBlock(p, 0)).join("");

function vizCard(title, subtitle, dataAttr, aria, legend) {
  return `
          <section class="td-card td-viz-card">
            <div class="td-card-head"><h2>${title}</h2><p>${subtitle}</p></div>
            <div class="td-canvas-frame"><canvas ${dataAttr} aria-label="${aria}"></canvas></div>
            <div class="td-legend">${legend}</div>
          </section>`;
}

function template() {
  const dot = c => `<i style="background:${c}"></i>`;
  const dash = (c, style = "dashed") => `<i class="td-line-key" style="border-top:2px ${style} ${c}"></i>`;
  return `
  <div class="td-app">
    <div class="td-topbar">
      <div class="td-brand">
        <div class="td-logo">◈</div>
        <div><div class="td-kicker">AGENT-BASED MODELING · MESA</div>
          <h1>Trust, but Verify</h1>
          <div class="td-subtitle">How teacher verification changes students’ attitudes toward AI</div>
        </div>
      </div>
      <div class="td-top-right"><div class="td-run-status" data-status>Ready to start</div><div class="td-counter">Round <strong data-step>0</strong> <span data-limit>/ 60</span></div></div>
    </div>

    <div class="td-layout">
      <aside class="td-sidebar">
        <section class="td-card td-controls">
          <div class="td-card-head"><h2>Model Controls</h2><p>Start, pause, and navigate through rounds</p></div>
          <div class="td-settings">
            <label class="td-label" for="td-scenario">Scenario</label>
            <select id="td-scenario" data-scenario>
              <option value="0. Control">0 · Control</option>
              <option value="1. Teacher" selected>1 · Teacher (verification)</option>
            </select>
            <div class="td-actions-primary"><button class="td-btn td-btn-primary" type="button" data-play>▶ Start</button><button class="td-btn td-btn-soft" type="button" data-reset>↺ Reset</button></div>
            <div class="td-actions-secondary"><button class="td-btn td-btn-outline" type="button" data-step-one>Step +1</button><button class="td-btn td-btn-outline" type="button" data-step-ten>Step +10</button></div>
            <div class="td-speed"><div class="td-param-label"><span>Playback speed</span><output data-speed-output>600 ms</output></div><input data-speed type="range" min="150" max="1800" step="50" value="600"></div>
            <div class="td-speed"><div class="td-param-label"><span>Ensemble: runs per scenario</span><output data-ens-r-output>40</output></div><input data-ens-r type="range" min="20" max="200" step="10" value="40">
              <label class="td-check"><input type="checkbox" data-ens-auto checked> Recalculate after "Apply" and "Reset"</label>
              <button class="td-btn td-btn-outline td-btn-wide" type="button" data-ens-run>↻ Recalculate Ensemble</button>
            </div>
          </div>
        </section>
        <section class="td-card td-params">
          <div class="td-card-head td-params-head"><h2>Parameters</h2><p>Changes take effect on a new run</p></div>
          <div class="td-params-inner">${paramHTML}</div>
        </section>
        <section class="td-card td-params">
          <div class="td-card-head td-params-head"><h2>Time and Network</h2><p>Rounds, verification period, study groups</p></div>
          <div class="td-params-inner">${intParamHTML}
            <div class="td-seed"><label for="td-seed">Seed</label><input id="td-seed" type="number" data-seed min="0" max="99999" value="0"></div>
            <button class="td-btn td-btn-apply" type="button" data-apply disabled>Apply Parameters</button>
          </div>
        </section>
      </aside>

      <main class="td-main">
        <div class="td-metrics">
          <div class="td-stat td-stat-a"><div class="td-stat-name">Do Not Trust <span>L</span></div><strong data-metric-l>—</strong><div class="td-stat-tip">Do not use AI</div></div>
          <div class="td-stat td-stat-b"><div class="td-stat-name">Trust and Verify <span>M</span></div><strong data-metric-m>—</strong><div class="td-stat-tip">Target state</div></div>
          <div class="td-stat td-stat-c"><div class="td-stat-name">Without Verification <span>H</span></div><strong data-metric-h>—</strong><div class="td-stat-tip">Use AI without verification</div></div>
          <div class="td-stat td-stat-d"><div class="td-stat-name">Variation Across Groups <span>sd</span></div><strong data-metric-sd>—</strong><div class="td-stat-tip">SD of M proportions across groups</div></div>
        </div>

        <div class="td-viz-grid">
          ${vizCard("Student Social Network", "<span data-net-sub>6 study groups · 150 agents</span>", "data-network",
                    "Student states in the social network",
                    `<span>${dot(palette[-1])}Do Not Trust</span><span>${dot(palette[0])}Verify</span><span>${dot(palette[1])}Without Verification</span>`)}
          ${vizCard("State Dynamics", "Proportion of students in each state by round", "data-chart",
                    "Chart of state proportions by round",
                    `<span>${dot(palette[-1])}L</span><span>${dot(palette[0])}M</span><span>${dot(palette[1])}H</span><span data-expected-legend>${dash(palette[0], "dotted")}Expected M</span><span data-band-legend><i class="td-band-key"></i>Verification period</span>`)}
          ${vizCard("H3 · Verifying Students by Study Group", "Each thin line represents one group in the current run", "data-groups",
                    "Proportion of verifying students by study group",
                    `<span>${dot("rgba(21,155,131,.6)")}Study group</span><span>${dot("#1f3150")}Entire network</span><span data-band-legend><i class="td-band-key"></i>Verification period</span>`)}
          ${vizCard("H1 · Verifying Students and AI Reliability", "Equilibrium proportion M under continuous verification (calculated without communication)", "data-h1",
                    "Equilibrium proportion of verifying students as a function of AI error probability",
                    `<span>${dot(palette[0])}<span data-h1-sigma>Current σ</span></span><span>${dash(accent.strict)}Strict σ = 1</span><span>${dot("#ed9257")}Simulation ± bootstrap</span><span>${dot("#1f3150")}Current e</span>`)}
          ${vizCard("H2 · Coverage and Strictness", "<span data-h2-sub>Expected proportion M at the end of verification</span>", "data-h2",
                    "Expected proportion of verifying students at different coverage and strictness levels",
                    `<span><i class="td-band-key" style="background:rgba(21,155,131,.75)"></i>More verifying students</span><span><i class="td-band-key" style="background:#fff;border:2px solid #1f3150"></i>Current r and σ</span>`)}
          ${vizCard("Current Run Compared with the Ensemble", "<span data-ens-sub>Recalculating ensemble…</span>", "data-ens",
                    "Current run and ensemble bands",
                    `<span>${dot(palette[0])}Current run (M)</span><span>${dot("#2f6fb0")}Verification: mean</span><span>${dot("#8a93a5")}Control: mean</span><span><i class="td-band-key" style="background:rgba(47,111,176,.35)"></i>95% bootstrap CI</span><span><i class="td-band-key" style="background:rgba(47,111,176,.1)"></i>95% of runs</span>`)}
          <section class="td-card td-viz-card">
            <div class="td-card-head"><h2>Ensemble Summary (Bootstrap)</h2><p data-ens-table-sub>Mean [95% bootstrap CI for the mean] · SD across runs</p></div>
            <div class="td-table-wrap" data-ens-table></div>
          </section>
          <section class="td-card td-viz-card">
            <div class="td-card-head"><h2>How to Read the Charts</h2><p>What each hypothesis tests</p></div>
            <div class="td-notes">
              <p><b>RQ.</b> Can verification increase the proportion of students who use AI and verify its output (M)?</p>
              <p><b>H1.</b> The proportion of verifying students depends on AI reliability: when AI is very reliable, students relax and stop verifying.</p>
              <p><b>H2.</b> Strictness σ determines the proportion M toward which the population converges; coverage r determines how quickly. Rows change the limiting level, while columns change the speed.</p>
              <p><b>H3.</b> After verification ends, the proportion M persists, while differences between groups increase.</p>
              <p><b>Ensemble.</b> The model is run repeatedly with the same parameters. The lighter band contains 95% of individual runs; the darker band is the 95% bootstrap confidence interval for the mean.</p>
              <p class="td-notes-muted">H1 and H2 lines are formula-based calculations; H1 points and H2 percentages come from ensemble simulations. Everything is recalculated for the current parameters.</p>
            </div>
          </section>
        </div>
        <div class="td-footnote"><span data-explanation>The intervention is enabled for the selected scenario.</span><span>One round is one synchronous update of all agents</span></div>

        <section class="td-card td-results" data-results>
          <div class="td-card-head"><h2>Experiment Results</h2><p>Figures from experiments.py → figures.py (averaged across runs)</p></div>
          <div class="td-tabs" data-tabs></div>
          <div class="td-figure" data-figure></div>
        </section>
      </main>
    </div>
  </div>`;
}

export default {
  render({model, el}) {
    el.innerHTML = template();
    const $ = selector => el.querySelector(selector);
    const $$ = selector => Array.from(el.querySelectorAll(selector));
    const canvases = {
      network: [$("[data-network]"), networkDraw],
      chart: [$("[data-chart]"), chartDraw],
      groups: [$("[data-groups]"), groupsDraw],
      h1: [$("[data-h1]"), h1Draw],
      h2: [$("[data-h2]"), h2Draw],
      ens: [$("[data-ens]"), ensembleDraw],
    };
    const ensRInput = $("[data-ens-r]");
    const ensAuto = $("[data-ens-auto]");
    const ensButton = $("[data-ens-run]");
    const scenarioInput = $("[data-scenario]");
    const playButton = $("[data-play]");
    const applyButton = $("[data-apply]");
    const speedInput = $("[data-speed]");
    const root = $(".td-app");

    let snapshot = model.get("snapshot") || null;
    let playing = false;
    let inFlight = false;
    let commandSeq = Number(snapshot?.ack || 0);
    let currentCommand = 0;
    let dirty = false;
    let timer = null;
    let disposed = false;
    let drawPending = false;
    let ensemble = model.get("ensemble") || {};
    let needEnsemble = !ensemble.R;
    let ensembleRunning = false;

    function draw() {
      drawPending = false;
      if (disposed || !snapshot) return;
      for (const [canvas, fn] of Object.values(canvases)) fn(canvas, snapshot, ensemble.R ? ensemble : null);
    }

    function fmtPct(v) { return `${Math.round(v * 100)}%`; }
    function renderEnsembleInfo() {
      const sub = $("[data-ens-sub]"), table = $("[data-ens-table]");
      if (!ensemble.R) {
        sub.textContent = ensembleRunning ? "Recalculating ensemble…" : "The ensemble has not been calculated for the current parameters";
        table.innerHTML = `<p class="td-notes-muted td-pad">${ensembleRunning ? "Calculating runs…" : "Click ‘Recalculate Ensemble’."}</p>`;
        $("[data-h2-src]") && ($("[data-h2-src]").textContent = "formula-based calculation");
        return;
      }
      const pct = snapshot ? percentileOfCurrent(snapshot, ensemble) : null;
      sub.textContent = `${ensemble.R} runs per scenario · ${ensemble.seconds} s` +
        (pct === null ? "" : ` · current run is higher than ${pct}% of ensemble runs at this step`);
      $("[data-ens-table-sub]").textContent =
        `Mean [95% bootstrap CI] · SD across runs · R = ${ensemble.R} (H1/H2: ${ensemble.R_grid} per point)`;
      const metrics = [...new Set(ensemble.summary.map(r => r.metric))];
      const metricLabels = {
        "M at the end of verification": "M at the end of verification",
        "M at the end of the simulation": "M at the end of the simulation",
        "H at the end of verification": "H at the end of verification",
        "Change in M after verification (H3)": "Change in M after verification (H3)",
        "Variation across groups at the end of verification": "Variation across groups at the end of verification",
        "Variation across groups at the end of the simulation": "Variation across groups at the end of the simulation"
      };
      const scen = ["0. Control", "1. Teacher"];
      const cell = row => {
        if (!row) return "<td class=\"td-muted\">—</td>";
        const pctMetric = !row.metric.startsWith("Variation") && !row.metric.startsWith("Change");
        const f = v => (pctMetric ? fmtPct(v) : (v >= 0 ? "" : "−") + Math.abs(v).toFixed(3));
        return `<td><strong>${f(row.mean)}</strong> <span class="td-ci">[${f(row.ci_lo)}; ${f(row.ci_hi)}]</span><br><span class="td-sd">sd ${row.sd.toFixed(3)}</span></td>`;
      };
      table.innerHTML = `<table class="td-table"><thead><tr><th>Metric</th><th>Control</th><th>Verification</th></tr></thead><tbody>` +
        metrics.map(m => `<tr><th>${metricLabels[m] || m}</th>${scen.map(sc => cell(ensemble.summary.find(r => r.metric === m && r.scenario === sc))).join("")}</tr>`).join("") +
        `</tbody></table>`;
      $("[data-h2-src]") && ($("[data-h2-src]").textContent = `simulation, ${ensemble.R_grid} runs per cell`);
    }

    function requestDraw() {
      if (drawPending || disposed) return;
      drawPending = true;
      requestAnimationFrame(draw);
    }

    function setStatus(message, active = false) {
      const node = $("[data-status]");
      node.textContent = message;
      node.classList.toggle("td-status-active", active);
    }

    function updateButtons() {
      playButton.textContent = playing ? "❚❚ Pause" : "▶ Start";
      playButton.classList.toggle("td-btn-playing", playing);
      const ended = snapshot && snapshot.step >= snapshot.limit;
      playButton.disabled = false;
      $("[data-step-one]").disabled = inFlight || Boolean(ended);
      $("[data-step-ten]").disabled = inFlight || Boolean(ended);
      applyButton.disabled = !dirty || inFlight;
      ensButton.disabled = inFlight;
      scenarioInput.disabled = inFlight;
      applyButton.textContent = dirty ? "Apply Parameters *" : "Parameters applied";
    }

    function readSettings() {
      const parsed = {scenario: scenarioInput.value, seed: Number($("[data-seed]").value || 0)};
      for (const p of [...parameters, ...intParameters]) parsed[p.name] = Number($(`[data-param="${p.name}"]`).value);
      return parsed;
    }

    function publish(action, extras = {}) {
      if (disposed || inFlight) return false;
      inFlight = true;
      currentCommand = ++commandSeq;
      model.set("command", {id: currentCommand, action, ...extras});
      model.save_changes();
      updateButtons();
      return true;
    }

    function clearPlaybackTimer() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }

    function pause() {
      playing = false;
      clearPlaybackTimer();
      setStatus("Paused");
      updateButtons();
    }

    function scheduleNext() {
      if (!playing || inFlight || disposed || !snapshot) return;
      if (snapshot.step >= snapshot.limit) {
        playing = false;
        setStatus("Simulation completed");
        updateButtons();
        return;
      }
      clearPlaybackTimer();
      timer = setTimeout(() => {
        timer = null;
        if (playing && !inFlight) publish("step");
      }, Number(speedInput.value));
    }

    function runEnsemble() {
      if (inFlight) return false;
      needEnsemble = false;
      ensembleRunning = true;
      ensemble = {};
      const ok = publish("ensemble", {R: Number(ensRInput.value)});
      setStatus(`Calculating ensemble: ${ensRInput.value} runs…`, true);
      renderEnsembleInfo();
      requestDraw();
      return ok;
    }

    function restart(keepPlaying = false) {
      if (inFlight) return;
      clearPlaybackTimer();
      playing = Boolean(keepPlaying);
      dirty = false;
      needEnsemble = true;
      publish("reset", {settings: readSettings()});
      setStatus(playing ? "Starting simulation" : "Resetting model", playing);
      updateButtons();
    }

    function updateSnapshot() {
      if (disposed) return;
      const latest = model.get("snapshot");
      if (!latest || typeof latest.ack !== "number") return;
      snapshot = latest;
      if (inFlight && latest.ack === currentCommand) inFlight = false;
      $("[data-step]").textContent = String(snapshot.step);
      $("[data-limit]").textContent = `/ ${snapshot.limit}`;
      $("[data-metric-l]").textContent = `${Math.round(snapshot.shares[0] * 100)}%`;
      $("[data-metric-m]").textContent = `${Math.round(snapshot.shares[1] * 100)}%`;
      $("[data-metric-h]").textContent = `${Math.round(snapshot.shares[2] * 100)}%`;
      $("[data-metric-sd]").textContent = (snapshot.group_sd ?? 0).toFixed(2);
      $("[data-net-sub]").textContent = `${snapshot.n_groups} study groups · ${snapshot.n_agents} agents`;
      for (const node of $$("[data-band-legend]")) node.style.display = snapshot.intervention ? "inline-flex" : "none";
      $("[data-expected-legend]").style.display = snapshot.expected?.length ? "inline-flex" : "none";
      if (snapshot.h1) $("[data-h1-sigma]").textContent = `Current σ = ${snapshot.h1.sigma.toFixed(2)}`;
      if (snapshot.h2) $("[data-h2-sub]").innerHTML = `Proportion M by round ${snapshot.h2.t_off} (end of verification) · <span data-h2-src>formula-based calculation</span>`;
      $("[data-explanation]").textContent = snapshot.intervention
        ? `Verification period: rounds ${snapshot.t_on}–${snapshot.t_off}.`
        : "Control group: no verification and no shaded area.";
      scenarioInput.value = snapshot.scenario;
      ensemble = model.get("ensemble") || {};
      if (ensemble.R) ensembleRunning = false;
      renderEnsembleInfo();
      requestDraw();
      if (!inFlight && needEnsemble && ensAuto.checked) {
        runEnsemble();
        updateButtons();
        return;
      }
      if (playing) {
        setStatus("Playing", true);
        scheduleNext();
      } else if (snapshot.step >= snapshot.limit) {
        setStatus("Simulation completed");
      } else if (snapshot.step === 0) {
        setStatus("Ready to start");
      } else {
        setStatus("Paused");
      }
      updateButtons();
    }

    function renderFigures() {
      const figures = model.get("figures") || [];
      const tabs = $("[data-tabs]"), holder = $("[data-figure]");
      if (!figures.length) {
        tabs.innerHTML = "";
        holder.innerHTML = `<p class="td-notes-muted">Figures will appear after running <code>python run_all.py</code>.</p>`;
        return;
      }
      tabs.innerHTML = figures.map((f, i) =>
        `<button type="button" class="td-tab${i === 0 ? " td-tab-active" : ""}" data-tab="${i}">${f.title}</button>`).join("");
      const show = i => {
        holder.innerHTML = `<img alt="${figures[i].title}" src="${figures[i].src}">`;
        for (const b of $$("[data-tab]")) b.classList.toggle("td-tab-active", Number(b.dataset.tab) === i);
      };
      for (const b of $$("[data-tab]")) b.addEventListener("click", () => show(Number(b.dataset.tab)));
      show(0);
    }

    function markDirty() {
      dirty = true;
      updateButtons();
    }

    playButton.addEventListener("click", () => {
      if (playing) {
        pause();
        return;
      }
      if (dirty || (snapshot && snapshot.step >= snapshot.limit)) {
        restart(true);
        return;
      }
      playing = true;
      setStatus("Playing", true);
      updateButtons();
      scheduleNext();
    });
    $("[data-reset]").addEventListener("click", () => restart(false));
    $("[data-step-one]").addEventListener("click", () => {
      pause();
      if (dirty) restart(false);
      else publish("step");
    });
    $("[data-step-ten]").addEventListener("click", () => {
      pause();
      if (dirty) restart(false);
      else publish("step10");
    });
    applyButton.addEventListener("click", () => restart(false));
    scenarioInput.addEventListener("change", () => {
      pause();
      restart(false);
    });
    $("[data-seed]").addEventListener("change", markDirty);
    for (const p of parameters) {
      const slider = $(`[data-param="${p.name}"]`);
      const output = $(`[data-output="${p.name}"]`);
      slider.addEventListener("input", () => { output.textContent = Number(slider.value).toFixed(p.digits ?? 2); markDirty(); });
    }
    for (const p of intParameters) {
      const slider = $(`[data-param="${p.name}"]`);
      const output = $(`[data-output="${p.name}"]`);
      slider.addEventListener("input", () => { output.textContent = String(Math.round(Number(slider.value))); markDirty(); });
    }
    ensRInput.addEventListener("input", () => { $("[data-ens-r-output]").textContent = ensRInput.value; });
    ensButton.addEventListener("click", () => { pause(); runEnsemble(); });
    speedInput.addEventListener("input", () => {
      $("[data-speed-output]").textContent = `${speedInput.value} ms`;
      if (playing && !inFlight) scheduleNext();
    });

    const resizeObserver = new ResizeObserver(() => requestDraw());
    for (const [canvas] of Object.values(canvases)) resizeObserver.observe(canvas);
    const onSnapshot = () => updateSnapshot();
    const onFigures = () => renderFigures();
    const onEnsemble = () => { ensemble = model.get("ensemble") || {}; renderEnsembleInfo(); requestDraw(); };
    model.on("change:snapshot", onSnapshot);
    model.on("change:figures", onFigures);
    model.on("change:ensemble", onEnsemble);
    renderFigures();
    updateSnapshot();

    return () => {
      disposed = true;
      playing = false;
      clearPlaybackTimer();
      resizeObserver.disconnect();
      model.off("change:snapshot", onSnapshot);
      model.off("change:figures", onFigures);
      model.off("change:ensemble", onEnsemble);
      root.replaceChildren();
    };
  },
};
