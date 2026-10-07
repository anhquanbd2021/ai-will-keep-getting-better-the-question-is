// Launch Window — the domain model.
// Three engineers race across a 52-week horizon. Every week each of them
// either ships (skill compounds) or doesn't (skill stalls or rusts). The
// model tide — (1 + modelGainPerWeek) ** week — multiplies output for all
// three identically, so it can never rescue the engineer who started late.
// Zero dependencies, pure functions, no RNG, no clock, no network.

export const DEFAULT_PARAMS = {
  weeks: 52,
  modelGainPerWeek: 0.02,
  learnPerShip: 0.10,
  feedbackBonus: 0.03,
  rustPerIdleWeek: 0.01,
  waitWeeks: 16,
  learnOnlyDrift: 0.005,
};

export const STRATEGIES = [
  {
    id: 'ship-weekly',
    name: 'Ship Weekly',
    blurb: 'Ships one ugly rep every week from week 1. Feedback compounds.',
    shipsOn: () => true,
  },
  {
    id: 'learn-only',
    name: 'Learn Only',
    blurb: 'Reads every changelog, runs nothing. Skill drifts up slowly, feedback never arrives.',
    shipsOn: () => false,
  },
  {
    id: 'wait-perfect',
    name: 'Wait for Perfect',
    blurb: 'Idles through the "once it settles" window — rusting — then ships on the same weekly cadence.',
    shipsOn: (week, params) => week >= params.waitWeeks,
  },
];

export const STRATEGY_IDS = STRATEGIES.map(s => s.id);

export const FAILURE_STRATEGY = 'wait-perfect';

const STRATEGY_MAP = new Map(STRATEGIES.map(s => [s.id, s]));

function strategyFor(id) {
  const s = STRATEGY_MAP.get(id);
  if (!s) throw new Error(`unknown strategy: ${id}`);
  return s;
}

function mergedParams(params) {
  return { ...DEFAULT_PARAMS, ...params };
}

// The tide line: identical for every engineer, every week.
function tideLevel(week, params = {}) {
  const p = mergedParams(params);
  return Math.pow(1 + p.modelGainPerWeek, week);
}

export function createEngineer(id, params = {}) {
  strategyFor(id);
  return { id, week: 0, ships: 0, skill: 1, output: 0 };
}

// Advance one engineer one week. Returns the next state plus `event`
// ('ship' | 'idle' | 'study') and `gained` (output added this week).
export function stepWeek(engineer, params = {}) {
  const p = mergedParams(params);
  const strategy = strategyFor(engineer.id);
  const week = engineer.week; // 0-based index of the week being simulated
  let { ships, skill } = engineer;
  let event;

  if (strategy.shipsOn(week, p)) {
    // Feedback bonus arrives only once a previous ship has users —
    // the first rep earns learnPerShip alone.
    skill += p.learnPerShip + (ships > 0 ? p.feedbackBonus : 0);
    ships += 1;
    event = 'ship';
  } else if (engineer.id === 'learn-only') {
    skill += p.learnOnlyDrift; // reading drifts skill up a little, no rep
    event = 'study';
  } else {
    skill = Math.max(0, skill - p.rustPerIdleWeek); // idle weeks rust
    event = 'idle';
  }

  const gained = skill * tideLevel(week, p);
  return { ...engineer, week: week + 1, ships, skill, output: engineer.output + gained, event, gained };
}

// Run the full race. `strategies` is a list of ids (defaults to all three).
export function simulate(options = {}) {
  const { weeks = DEFAULT_PARAMS.weeks, strategies = STRATEGY_IDS, ...rest } = options;
  const params = mergedParams({ ...rest, weeks });
  const lanes = strategies.map(id => {
    const strategy = strategyFor(id);
    let engineer = createEngineer(id, params);
    const frames = [{ ...engineer, event: 'start', gained: 0 }];
    for (let i = 0; i < weeks; i += 1) {
      engineer = stepWeek(engineer, params);
      frames.push(engineer);
    }
    return {
      id,
      name: strategy.name,
      blurb: strategy.blurb,
      frames,
      totals: { ships: engineer.ships, skill: engineer.skill, output: engineer.output },
    };
  });
  const modelLevel = Array.from({ length: weeks + 1 }, (_, w) => tideLevel(w, params));
  return { weeks, lanes, modelLevel, params };
}

export function summarize(sim) {
  const ranked = [...sim.lanes].sort((a, b) => b.totals.output - a.totals.output);
  const winner = ranked[0];
  const runnerUp = ranked[1] ?? winner;
  return {
    winner: winner.id,
    finalSkill: winner.totals.skill,
    finalOutput: winner.totals.output,
    shipsDelta: winner.totals.ships - runnerUp.totals.ships,
  };
}

// First week (1-based, matching frame indices) where chaser's cumulative
// output reaches the leader's — or null if it never happens in the horizon.
export function catchUpWeek(sim, chaserId, leaderId) {
  const chaser = sim.lanes.find(l => l.id === chaserId);
  const leader = sim.lanes.find(l => l.id === leaderId);
  if (!chaser || !leader) return null;
  for (let w = 1; w <= sim.weeks; w += 1) {
    if (chaser.frames[w].output >= leader.frames[w].output) return w;
  }
  return null;
}

// The failure-mode evidence: what the wait-perfect lane did during its
// "waiting for it to settle" window, and the gap it never closes.
export function stallReport(sim) {
  const waiter = sim.lanes.find(l => l.id === FAILURE_STRATEGY);
  const leader = sim.lanes.reduce((a, b) => (b.totals.output > a.totals.output ? b : a));
  if (!waiter || !leader) return null;
  const waitEnd = Math.min(sim.params.waitWeeks, sim.weeks);
  const during = waiter.frames.slice(1, waitEnd + 1);
  const idleWeeks = during.filter(f => f.event === 'idle').length;
  const shipsDuringWait = during.filter(f => f.event === 'ship').length;
  const gapAt = w => leader.frames[w].output - waiter.frames[w].output;
  const gapAtStart = gapAt(waitEnd);
  const gapAtEnd = gapAt(sim.weeks);
  const catchUp = catchUpWeek(sim, FAILURE_STRATEGY, leader.id);
  return {
    id: FAILURE_STRATEGY,
    idleWeeks,
    shipsDuringWait,
    gapAtStart,
    gapAtEnd,
    verdict: catchUp === null ? 'never' : `week ${catchUp}`,
  };
}
