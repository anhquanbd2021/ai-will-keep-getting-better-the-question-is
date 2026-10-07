import { DEFAULT_PARAMS, FAILURE_STRATEGY, simulate, summarize, catchUpWeek, stallReport } from './lab.mjs';

const $ = sel => document.querySelector(sel);
const SVGNS = 'http://www.w3.org/2000/svg';
const WEEKS = DEFAULT_PARAMS.weeks;

// Chart geometry inside the 720x320 viewBox.
const M = { left: 52, right: 96, top: 18, bottom: 34 };
const PLOT_W = 720 - M.left - M.right;
const PLOT_H = 320 - M.top - M.bottom;

let cursor = 0; // weeks elapsed — step mode drives this

function params() {
  return {
    waitWeeks: Number($('#wait-weeks').value),
    learnPerShip: Number($('#learn-per-ship').value),
    modelGainPerWeek: Number($('#model-gain').value),
  };
}

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function fmt(n) {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1);
}

function renderLegend(sim) {
  const legend = $('#lane-legend');
  legend.innerHTML = '';
  for (const lane of sim.lanes) {
    const li = document.createElement('li');
    li.className = `legend-item lane-${lane.id}`;
    li.innerHTML = `<span class="swatch" aria-hidden="true"></span><span><strong>${lane.name}</strong><span class="muted"> ${lane.blurb}</span></span>`;
    legend.appendChild(li);
  }
  const tide = document.createElement('li');
  tide.className = 'legend-item lane-tide';
  tide.innerHTML = '<span class="swatch" aria-hidden="true"></span><span><strong>Model tide</strong><span class="muted"> the multiplier — identical for every lane.</span></span>';
  legend.appendChild(tide);
}

function renderChart(sim, full) {
  const gGrid = $('#chart-grid');
  const gWait = $('#chart-wait');
  const gTide = $('#chart-tide');
  const gLanes = $('#chart-lanes');
  const gLabels = $('#chart-labels');
  for (const g of [gGrid, gWait, gTide, gLanes, gLabels]) g.innerHTML = '';

  const maxOut = Math.max(1, ...full.lanes.map(l => l.totals.output));
  const x = w => M.left + (w / WEEKS) * PLOT_W;
  const y = v => M.top + PLOT_H - (v / maxOut) * PLOT_H;

  // Grid: verticals every 13 weeks, horizontals at output quartiles.
  for (let w = 0; w <= WEEKS; w += 13) {
    el('line', { x1: x(w), y1: M.top, x2: x(w), y2: M.top + PLOT_H, class: 'grid-line' }, gGrid);
    const t = el('text', { x: x(w), y: 320 - 12, class: 'axis-label', 'text-anchor': 'middle' }, gGrid);
    t.textContent = `W${String(w).padStart(2, '0')}`;
  }
  for (let i = 1; i <= 4; i += 1) {
    const v = (maxOut / 4) * i;
    el('line', { x1: M.left, y1: y(v), x2: M.left + PLOT_W, y2: y(v), class: 'grid-line' }, gGrid);
    const t = el('text', { x: M.left - 8, y: y(v) + 4, class: 'axis-label', 'text-anchor': 'end' }, gGrid);
    t.textContent = fmt(v);
  }

  // On-pad hatching for the waiter's idle window.
  const wait = sim.params.waitWeeks;
  if (wait > 0) {
    el('rect', {
      x: x(0), y: M.top, width: x(Math.min(wait, sim.weeks)) - x(0), height: PLOT_H,
      class: 'pad-hatch',
    }, gWait);
    const t = el('text', { x: x(Math.min(wait, sim.weeks) / 2), y: M.top + 16, class: 'hatch-label', 'text-anchor': 'middle' }, gWait);
    t.textContent = 'ON PAD';
  }

  // The tide line, on its own scale pinned to ~35% of plot height.
  const maxTide = full.modelLevel[full.weeks];
  const tideY = lvl => M.top + PLOT_H - (lvl / maxTide) * PLOT_H * 0.35;
  const tidePts = sim.modelLevel.map((lvl, w) => `${x(w)},${tideY(lvl)}`).join(' ');
  el('polyline', { points: tidePts, class: 'trace trace-tide' }, gTide);
  const tideLabel = el('text', { x: M.left + PLOT_W + 8, y: tideY(sim.modelLevel[sim.weeks]) + 4, class: 'lane-label tide-label' }, gTide);
  tideLabel.textContent = `tide ×${sim.modelLevel[sim.weeks].toFixed(2)}`;

  // Lane trajectories + end labels.
  for (const lane of sim.lanes) {
    const pts = lane.frames.map((f, w) => `${x(w)},${y(f.output)}`).join(' ');
    el('polyline', { points: pts, class: `trace trace-${lane.id}` }, gLanes);
    const last = lane.frames[lane.frames.length - 1];
    el('circle', { cx: x(lane.frames.length - 1), cy: y(last.output), r: 4, class: `trace-dot dot-${lane.id}` }, gLanes);
    const label = el('text', { x: M.left + PLOT_W + 8, y: y(last.output) + 4, class: `lane-label label-${lane.id}` }, gLabels);
    label.textContent = `${lane.name.split(' ')[0].toLowerCase()} ${fmt(last.output)}`;
  }
}

function renderTelemetry(sim) {
  $('#met-clock').textContent = `T+${String(sim.weeks).padStart(2, '0')}`;

  const catchUp = catchUpWeek(sim, FAILURE_STRATEGY, 'ship-weekly');
  const stamp = $('#catch-up');
  stamp.textContent = catchUp === null ? 'CATCH-UP: NEVER' : `CATCH-UP: WEEK ${String(catchUp).padStart(2, '0')}`;
  stamp.className = `badge ${catchUp === null ? 'fail' : 'warn'}`;

  const stall = stallReport(sim);
  if (stall) {
    $('#stall-idle').textContent = `${stall.idleWeeks} wk`;
    $('#stall-ships').textContent = String(stall.shipsDuringWait);
    $('#stall-gap-start').textContent = fmt(stall.gapAtStart);
    $('#stall-gap-end').textContent = fmt(stall.gapAtEnd);
  }

  const totals = $('#totals');
  totals.innerHTML = '';
  const { winner } = summarize(sim);
  for (const lane of sim.lanes) {
    const li = document.createElement('li');
    li.className = `total lane-${lane.id}${lane.id === winner ? ' winner' : ''}`;
    li.innerHTML = `<span class="swatch" aria-hidden="true"></span>` +
      `<strong>${lane.name}</strong>` +
      `<span class="mono">${lane.totals.ships} ships · skill ${lane.totals.skill.toFixed(2)} · output ${fmt(lane.totals.output)}</span>`;
    totals.appendChild(li);
  }
}

function render() {
  const p = params();
  const sim = simulate({ weeks: cursor, ...p });
  const full = simulate({ weeks: WEEKS, ...p }); // stable scale + full tide
  renderChart(sim, full);
  renderTelemetry(sim);
}

function updateOutputs() {
  $('#wait-weeks-out').textContent = `${$('#wait-weeks').value} wk`;
  $('#learn-per-ship-out').textContent = Number($('#learn-per-ship').value).toFixed(2);
  $('#model-gain-out').textContent = Number($('#model-gain').value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0');
}

for (const id of ['wait-weeks', 'learn-per-ship', 'model-gain']) {
  const input = $(`#${id}`);
  input.addEventListener('input', updateOutputs);
  input.addEventListener('change', render); // re-run committed params at same week
}

$('#run-all').addEventListener('click', () => { cursor = WEEKS; render(); });
$('#step-week').addEventListener('click', () => { cursor = Math.min(WEEKS, cursor + 1); render(); });

updateOutputs();
renderLegend(simulate({ weeks: 0, ...params() }));
render();
