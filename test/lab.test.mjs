import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARAMS, STRATEGIES, STRATEGY_IDS, FAILURE_STRATEGY,
  createEngineer, stepWeek, simulate, summarize, catchUpWeek, stallReport,
} from '../public/lab.mjs';

test('DEFAULT_PARAMS carries the documented knobs', () => {
  assert.equal(DEFAULT_PARAMS.weeks, 52);
  assert.equal(DEFAULT_PARAMS.modelGainPerWeek, 0.02);
  assert.equal(DEFAULT_PARAMS.learnPerShip, 0.10);
  assert.equal(DEFAULT_PARAMS.feedbackBonus, 0.03);
  assert.equal(DEFAULT_PARAMS.rustPerIdleWeek, 0.01);
  assert.equal(DEFAULT_PARAMS.waitWeeks, 16);
  assert.equal(DEFAULT_PARAMS.learnOnlyDrift, 0.005);
});

test('strategy catalog is ordered and the failure lane is wait-perfect', () => {
  assert.deepEqual(STRATEGY_IDS, ['ship-weekly', 'learn-only', 'wait-perfect']);
  assert.equal(STRATEGIES.length, 3);
  assert.equal(FAILURE_STRATEGY, 'wait-perfect');
  for (const s of STRATEGIES) {
    assert.equal(typeof s.shipsOn, 'function');
    assert.ok(s.blurb.length > 0);
  }
});

test('createEngineer starts everyone identical at T+00', () => {
  assert.deepEqual(createEngineer('ship-weekly'), { id: 'ship-weekly', week: 0, ships: 0, skill: 1, output: 0 });
  assert.throws(() => createEngineer('nope'), /unknown strategy/);
});

test('stepWeek: ship week adds learnPerShip, tide multiplies output', () => {
  const w1 = stepWeek(createEngineer('ship-weekly'));
  assert.equal(w1.event, 'ship');
  assert.equal(w1.ships, 1);
  assert.equal(w1.skill, 1.10);
  assert.equal(w1.week, 1);
  assert.ok(Math.abs(w1.output - 1.10) < 1e-9); // tide at week 0 is 1.0
});

test('stepWeek: feedback bonus arrives only from the second ship', () => {
  const w2 = stepWeek(stepWeek(createEngineer('ship-weekly')));
  assert.equal(w2.ships, 2);
  assert.ok(Math.abs(w2.skill - 1.23) < 1e-9); // 1.10 + 0.10 + 0.03
  // gained = 1.23 * 1.02
  assert.ok(Math.abs(w2.output - (1.10 + 1.23 * 1.02)) < 1e-9);
});

test('stepWeek: learn-only drifts up slowly and never ships', () => {
  let e = createEngineer('learn-only');
  for (let i = 0; i < 10; i += 1) e = stepWeek(e);
  assert.equal(e.ships, 0);
  assert.ok(Math.abs(e.skill - 1.05) < 1e-9); // 10 * 0.005
  assert.equal(e.event, 'study');
});

test('stepWeek: wait-perfect rusts through the wait window, then ships', () => {
  let e = createEngineer('wait-perfect');
  for (let i = 0; i < 16; i += 1) e = stepWeek(e);
  assert.equal(e.ships, 0);
  assert.equal(e.event, 'idle');
  assert.ok(Math.abs(e.skill - 0.84) < 1e-9); // 1 - 16 * 0.01
  const liftoff = stepWeek(e);
  assert.equal(liftoff.event, 'ship');
  assert.equal(liftoff.ships, 1);
});

test('stepWeek: skill is floored at zero under a very long wait', () => {
  let e = createEngineer('wait-perfect');
  for (let i = 0; i < 150; i += 1) e = stepWeek(e, { waitWeeks: 999 });
  assert.equal(e.skill, 0);
});

test('simulate returns frames and a tide line; output is deterministic', () => {
  const sim = simulate();
  assert.equal(sim.weeks, 52);
  assert.equal(sim.lanes.length, 3);
  for (const lane of sim.lanes) {
    assert.equal(lane.frames.length, 53); // start frame + 52 weeks
    assert.equal(lane.frames[0].event, 'start');
  }
  assert.equal(sim.modelLevel.length, 53);
  assert.equal(sim.modelLevel[0], 1);
  assert.deepEqual(sim, simulate()); // same inputs, same race
});

test('summarize picks the output leader', () => {
  const s = summarize(simulate());
  assert.equal(s.winner, 'ship-weekly');
  assert.ok(s.finalSkill > 1);
  assert.ok(s.finalOutput > 0);
  assert.equal(s.shipsDelta, 52 - 36); // ship-weekly 52, wait-perfect 36
});

test('catchUpWeek returns a week when the chaser can actually close', () => {
  // wait=0 makes wait-perfect identical to ship-weekly — level from week 1.
  const sim = simulate({ waitWeeks: 0 });
  assert.equal(catchUpWeek(sim, 'wait-perfect', 'ship-weekly'), 1);
});

test('the tide lifts all lanes and widens the absolute gap', () => {
  const calm = stallReport(simulate({ modelGainPerWeek: 0.01 }));
  const stormy = stallReport(simulate({ modelGainPerWeek: 0.05 }));
  assert.ok(stormy.gapAtEnd > calm.gapAtEnd);
});
