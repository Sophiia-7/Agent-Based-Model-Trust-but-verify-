const palette = { "-1": "#7467df", "0": "#159b83", "1": "#ed9257" };
const accent = { strict: "#2f6fb0", band: "rgba(145, 152, 171, 0.14)", grid: "#edf0f5", axis: "#8a93a5" };

const parameters = [
  {name: "e", label: "Вероятность ошибки ИИ", symbol: "e", min: 0, max: 1, step: 0.05, value: 0.45},
  {name: "r", label: "Покрытие проверками", symbol: "r", min: 0, max: 0.5, step: 0.05, value: 0.2},
  {name: "sigma", label: "Строгость проверки", symbol: "σ", min: 0, max: 1, step: 0.05, value: 1.0},
  {name: "a", label: "Скептик пробует ИИ", symbol: "a", min: 0, max: 1, step: 0.05, value: 0.4},
  {name: "b", label: "Начинает проверять", symbol: "b", min: 0, max: 1, step: 0.05, value: 0.6},
  {name: "gamma", label: "Успех расслабляет (ср.)", symbol: "γ", min: 0, max: 0.5, step: 0.05, value: 0.15},
  {name: "lam", label: "Разочарование (ср.)", symbol: "λ", min: 0, max: 0.5, step: 0.05, value: 0.3},
  {name: "s", label: "Уровень студентов (ср.)", symbol: "s", min: 0.35, max: 0.65, step: 0.05, value: 0.65},
  {name: "beta", label: "Интенсивность общения", symbol: "β", min: 0, max: 1, step: 0.05, value: 0.5},
  {name: "p_out", label: "Дружба между группами", symbol: "p_out", min: 0, max: 0.1, step: 0.005, value: 0.01, digits: 3},
];

const intParameters = [
  {name: "T", label: "Число раундов", symbol: "T", min: 20, max: 200, step: 5, value: 60},
  {name: "t_on", label: "Начало проверок", symbol: "t_on", min: 0, max: 199, step: 1, value: 10},
  {name: "t_off", label: "Конец проверок", symbol: "t_off", min: 1, max: 200, step: 1, value: 40},
  {name: "N_groups", label: "Число учебных групп", symbol: "k", min: 2, max: 10, step: 1, value: 6},
  {name: "group_size", label: "Размер группы", symbol: "n", min: 10, max: 50, step: 5, value: 25},
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
  ctx.fillText("покрытие r", (plot.left + plot.right) / 2, plot.bottom + 23);
  ctx.save();
  ctx.translate(14, (plot.top + plot.bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("строгость σ", 0, 0);
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
    const colors = {"0. Контроль": [138, 147, 165], "1. Преподаватель": [47, 111, 176]};
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
    ctx.fillText("Ансамбль пересчитывается…", (f.plot.left + f.plot.right) / 2, f.plot.top + 24);
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
        <div><div class="td-kicker">АГЕНТНОЕ МОДЕЛИРОВАНИЕ · MESA</div>
          <h1>Доверяй, но проверяй</h1>
          <div class="td-subtitle">Как проверки преподавателя меняют отношение студентов к ИИ</div>
        </div>
      </div>
      <div class="td-top-right"><div class="td-run-status" data-status>Готово к запуску</div><div class="td-counter">Раунд <strong data-step>0</strong> <span data-limit>/ 60</span></div></div>
    </div>

    <div class="td-layout">
      <aside class="td-sidebar">
        <section class="td-card td-controls">
          <div class="td-card-head"><h2>Управление моделью</h2><p>Запуск, пауза и переходы по раундам</p></div>
          <div class="td-settings">
            <label class="td-label" for="td-scenario">Сценарий</label>
            <select id="td-scenario" data-scenario>
              <option value="0. Контроль">0 · Контроль</option>
              <option value="1. Преподаватель" selected>1 · Преподаватель (проверки)</option>
            </select>
            <div class="td-actions-primary"><button class="td-btn td-btn-primary" type="button" data-play>▶ Пуск</button><button class="td-btn td-btn-soft" type="button" data-reset>↺ Сброс</button></div>
            <div class="td-actions-secondary"><button class="td-btn td-btn-outline" type="button" data-step-one>Шаг +1</button><button class="td-btn td-btn-outline" type="button" data-step-ten>Шаг +10</button></div>
            <div class="td-speed"><div class="td-param-label"><span>Скорость воспроизведения</span><output data-speed-output>600 мс</output></div><input data-speed type="range" min="150" max="1800" step="50" value="600"></div>
            <div class="td-speed"><div class="td-param-label"><span>Ансамбль: прогонов на сценарий</span><output data-ens-r-output>40</output></div><input data-ens-r type="range" min="20" max="200" step="10" value="40">
              <label class="td-check"><input type="checkbox" data-ens-auto checked> Пересчитывать после «Применить» и «Сброс»</label>
              <button class="td-btn td-btn-outline td-btn-wide" type="button" data-ens-run>↻ Пересчитать ансамбль</button>
            </div>
          </div>
        </section>
        <section class="td-card td-params">
          <div class="td-card-head td-params-head"><h2>Параметры</h2><p>Изменения применяются при новом запуске</p></div>
          <div class="td-params-inner">${paramHTML}</div>
        </section>
        <section class="td-card td-params">
          <div class="td-card-head td-params-head"><h2>Время и сеть</h2><p>Раунды, период проверок, учебные группы</p></div>
          <div class="td-params-inner">${intParamHTML}
            <div class="td-seed"><label for="td-seed">Seed</label><input id="td-seed" type="number" data-seed min="0" max="99999" value="0"></div>
            <button class="td-btn td-btn-apply" type="button" data-apply disabled>Применить параметры</button>
          </div>
        </section>
      </aside>

      <main class="td-main">
        <div class="td-metrics">
          <div class="td-stat td-stat-a"><div class="td-stat-name">Не доверяют <span>L</span></div><strong data-metric-l>—</strong><div class="td-stat-tip">Не используют ИИ</div></div>
          <div class="td-stat td-stat-b"><div class="td-stat-name">Доверяют и проверяют <span>M</span></div><strong data-metric-m>—</strong><div class="td-stat-tip">Целевое состояние</div></div>
          <div class="td-stat td-stat-c"><div class="td-stat-name">Без проверки <span>H</span></div><strong data-metric-h>—</strong><div class="td-stat-tip">Используют без проверки</div></div>
          <div class="td-stat td-stat-d"><div class="td-stat-name">Разброс групп <span>sd</span></div><strong data-metric-sd>—</strong><div class="td-stat-tip">sd доли M между группами</div></div>
        </div>

        <div class="td-viz-grid">
          ${vizCard("Социальная сеть студентов", "<span data-net-sub>6 учебных групп · 150 агентов</span>", "data-network",
                    "Состояния студентов в социальной сети",
                    `<span>${dot(palette[-1])}Не доверяют</span><span>${dot(palette[0])}Проверяют</span><span>${dot(palette[1])}Без проверки</span>`)}
          ${vizCard("Динамика состояний", "Доля студентов в каждом состоянии по раундам", "data-chart",
                    "График долей состояний по раундам",
                    `<span>${dot(palette[-1])}L</span><span>${dot(palette[0])}M</span><span>${dot(palette[1])}H</span><span data-expected-legend>${dash(palette[0], "dotted")}Ожидание M</span><span data-band-legend><i class="td-band-key"></i>Период проверок</span>`)}
          ${vizCard("H3 · Проверяющие по учебным группам", "Каждая тонкая линия — одна группа текущего прогона", "data-groups",
                    "Доля проверяющих по учебным группам",
                    `<span>${dot("rgba(21,155,131,.6)")}Учебная группа</span><span>${dot("#1f3150")}Вся сеть</span><span data-band-legend><i class="td-band-key"></i>Период проверок</span>`)}
          ${vizCard("H1 · Проверяющие и надежность ИИ", "Равновесная доля M при постоянных проверках (расчет без общения)", "data-h1",
                    "Равновесная доля проверяющих в зависимости от ошибки ИИ",
                    `<span>${dot(palette[0])}<span data-h1-sigma>Текущая σ</span></span><span>${dash(accent.strict)}Строгая σ = 1</span><span>${dot("#ed9257")}Симуляция ± бутстрап</span><span>${dot("#1f3150")}Текущее e</span>`)}
          ${vizCard("H2 · Покрытие и строгость", "<span data-h2-sub>Ожидаемая доля M к концу проверок</span>", "data-h2",
                    "Ожидаемая доля проверяющих при разных покрытии и строгости",
                    `<span><i class="td-band-key" style="background:rgba(21,155,131,.75)"></i>Больше проверяющих</span><span><i class="td-band-key" style="background:#fff;border:2px solid #1f3150"></i>Текущие r и σ</span>`)}
          ${vizCard("Текущий прогон на фоне ансамбля", "<span data-ens-sub>Ансамбль пересчитывается…</span>", "data-ens",
                    "Текущий прогон и полосы ансамбля прогонов",
                    `<span>${dot(palette[0])}Текущий прогон (M)</span><span>${dot("#2f6fb0")}Проверки: среднее</span><span>${dot("#8a93a5")}Контроль: среднее</span><span><i class="td-band-key" style="background:rgba(47,111,176,.35)"></i>Бутстрап 95%</span><span><i class="td-band-key" style="background:rgba(47,111,176,.1)"></i>95% прогонов</span>`)}
          <section class="td-card td-viz-card">
            <div class="td-card-head"><h2>Сводка по ансамблю (бутстрап)</h2><p data-ens-table-sub>Среднее [95% бутстрап-интервал среднего] · sd между прогонами</p></div>
            <div class="td-table-wrap" data-ens-table></div>
          </section>
          <section class="td-card td-viz-card">
            <div class="td-card-head"><h2>Как читать графики</h2><p>Что проверяет каждая гипотеза</p></div>
            <div class="td-notes">
              <p><b>RQ.</b> Можно ли проверками увеличить долю студентов, которые пользуются ИИ и проверяют его (M)?</p>
              <p><b>H1.</b> Доля проверяющих зависит от надежности ИИ: при очень надежном ИИ студенты расслабляются и перестают проверять.</p>
              <p><b>H2.</b> Строгость σ задает, к какой доле M приходит популяция; покрытие r — как быстро. По строкам меняется предел, по столбцам — скорость.</p>
              <p><b>H3.</b> После окончания проверок доля M сохраняется, а различия между группами растут.</p>
              <p><b>Ансамбль.</b> Модель много раз прогоняется с теми же параметрами. Светлая полоса — где лежат 95% отдельных прогонов, темная — 95% бутстрап-интервал среднего.</p>
              <p class="td-notes-muted">Линии H1 и H2 — расчет по формулам; точки H1 и проценты H2 — симуляция ансамбля. Все пересчитывается для текущих параметров.</p>
            </div>
          </section>
        </div>
        <div class="td-footnote"><span data-explanation>Вмешательство включено для выбранного сценария.</span><span>Один раунд — одно синхронное обновление агентов</span></div>

        <section class="td-card td-results" data-results>
          <div class="td-card-head"><h2>Результаты экспериментов</h2><p>Рисунки из experiments.py → figures.py (усреднение по прогонам)</p></div>
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
        sub.textContent = ensembleRunning ? "Ансамбль пересчитывается…" : "Ансамбль не посчитан для текущих параметров";
        table.innerHTML = `<p class="td-notes-muted td-pad">${ensembleRunning ? "Считаю прогоны…" : "Нажмите «Пересчитать ансамбль»."}</p>`;
        $("[data-h2-src]") && ($("[data-h2-src]").textContent = "расчет по формулам");
        return;
      }
      const pct = snapshot ? percentileOfCurrent(snapshot, ensemble) : null;
      sub.textContent = `${ensemble.R} прогонов на сценарий · ${ensemble.seconds} с` +
        (pct === null ? "" : ` · текущий прогон выше, чем ${pct}% прогонов ансамбля на этом шаге`);
      $("[data-ens-table-sub]").textContent =
        `Среднее [95% бутстрап-интервал] · sd между прогонами · R = ${ensemble.R} (H1/H2: ${ensemble.R_grid} на точку)`;
      const metrics = [...new Set(ensemble.summary.map(r => r.metric))];
      const scen = ["0. Контроль", "1. Преподаватель"];
      const cell = row => {
        if (!row) return "<td class=\"td-muted\">—</td>";
        const pctMetric = !row.metric.startsWith("Разброс") && !row.metric.startsWith("Изменение");
        const f = v => (pctMetric ? fmtPct(v) : (v >= 0 ? "" : "−") + Math.abs(v).toFixed(3));
        return `<td><strong>${f(row.mean)}</strong> <span class="td-ci">[${f(row.ci_lo)}; ${f(row.ci_hi)}]</span><br><span class="td-sd">sd ${row.sd.toFixed(3)}</span></td>`;
      };
      table.innerHTML = `<table class="td-table"><thead><tr><th>Метрика</th><th>Контроль</th><th>Проверки</th></tr></thead><tbody>` +
        metrics.map(m => `<tr><th>${m}</th>${scen.map(sc => cell(ensemble.summary.find(r => r.metric === m && r.scenario === sc))).join("")}</tr>`).join("") +
        `</tbody></table>`;
      $("[data-h2-src]") && ($("[data-h2-src]").textContent = `симуляция, ${ensemble.R_grid} прогонов на клетку`);
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
      playButton.textContent = playing ? "❚❚ Пауза" : "▶ Пуск";
      playButton.classList.toggle("td-btn-playing", playing);
      const ended = snapshot && snapshot.step >= snapshot.limit;
      playButton.disabled = false;
      $("[data-step-one]").disabled = inFlight || Boolean(ended);
      $("[data-step-ten]").disabled = inFlight || Boolean(ended);
      applyButton.disabled = !dirty || inFlight;
      ensButton.disabled = inFlight;
      scenarioInput.disabled = inFlight;
      applyButton.textContent = dirty ? "Применить параметры *" : "Параметры применены";
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
      setStatus("На паузе");
      updateButtons();
    }

    function scheduleNext() {
      if (!playing || inFlight || disposed || !snapshot) return;
      if (snapshot.step >= snapshot.limit) {
        playing = false;
        setStatus("Моделирование завершено");
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
      setStatus(`Считаю ансамбль: ${ensRInput.value} прогонов…`, true);
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
      setStatus(playing ? "Запуск моделирования" : "Модель сбрасывается", playing);
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
      $("[data-net-sub]").textContent = `${snapshot.n_groups} учебных групп · ${snapshot.n_agents} агентов`;
      for (const node of $$("[data-band-legend]")) node.style.display = snapshot.intervention ? "inline-flex" : "none";
      $("[data-expected-legend]").style.display = snapshot.expected?.length ? "inline-flex" : "none";
      if (snapshot.h1) $("[data-h1-sigma]").textContent = `Текущая σ = ${snapshot.h1.sigma.toFixed(2)}`;
      if (snapshot.h2) $("[data-h2-sub]").innerHTML = `Доля M к раунду ${snapshot.h2.t_off} (конец проверок) · <span data-h2-src>расчет по формулам</span>`;
      $("[data-explanation]").textContent = snapshot.intervention
        ? `Период проверок: раунды ${snapshot.t_on}–${snapshot.t_off}.`
        : "Контрольная группа: без проверок и без затененной области.";
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
        setStatus("Воспроизведение", true);
        scheduleNext();
      } else if (snapshot.step >= snapshot.limit) {
        setStatus("Моделирование завершено");
      } else if (snapshot.step === 0) {
        setStatus("Готово к запуску");
      } else {
        setStatus("На паузе");
      }
      updateButtons();
    }

    function renderFigures() {
      const figures = model.get("figures") || [];
      const tabs = $("[data-tabs]"), holder = $("[data-figure]");
      if (!figures.length) {
        tabs.innerHTML = "";
        holder.innerHTML = `<p class="td-notes-muted">Рисунки появятся после запуска <code>python run_all.py</code>.</p>`;
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
      setStatus("Воспроизведение", true);
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
      $("[data-speed-output]").textContent = `${speedInput.value} мс`;
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
