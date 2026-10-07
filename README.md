# Launch Window — companion demo

Interactive lab for the article *The Model Improves for Everyone. Only
Shipping Compounds.* Three identical engineers race across a 52-week
horizon; they differ only in when their reps start.

Zero dependencies — Node 24+ only. The domain model is one ES module,
`public/lab.mjs`, shared by the browser UI, the CLI, the `/api/simulate`
endpoint, and the test suite.

## What it proves

Skill and output compound **per shipped iteration**. The model tide —
`(1 + modelGainPerWeek) ** week` — multiplies everyone's output
identically, so it can never rescue the engineer who starts late.

| Lane | Behavior | Trajectory |
|---|---|---|
| Ship Weekly | ships every week; `learnPerShip` + `feedbackBonus` per rep | compounding winner |
| Learn Only | reads, never ships; `learnOnlyDrift` per week | shallow drift, no feedback |
| Wait for Perfect | idles `waitWeeks` (rusting), then ships weekly | same cadence, unclosable gap |

Under default parameters `catchUpWeek(sim, 'wait-perfect', 'ship-weekly')`
returns `null` — the UI stamps **CATCH-UP: NEVER**. Raise the model-gain
slider and every lane climbs, but the absolute gap *widens*: the tide is a
multiplier, and a multiplier needs a base.

## Run it

```text
npm start        # serve the lab on http://localhost:3000
npm test         # unit tests + end-to-end server suite
npm run race     # CLI: weekly table + stall report
npm run check    # npm test
```

`node scripts/race.mjs --wait=24 --gain=0.05` deepens the stall and raises
the tide — the gap grows faster, not slower.

## Layout

- `public/lab.mjs` — the domain model: `simulate`, `stepWeek`,
  `catchUpWeek`, `stallReport`
- `public/app.js` — plain-JS wiring: sliders, SVG trajectory chart, step mode
- `app/server.js` — zero-dep static host plus `/health`, `/version`,
  `/api/simulate`
- `examples/` — readable presets: `early-shipper.mjs`,
  `perfect-moment-waiter.mjs`
- `scripts/race.mjs` — the CLI race table
- `test/` — `node --test "test/*.test.mjs"`

## Honest limits

- Skill gain is linear per rep; real learning curves bend both ways.
- The tide is a smooth exponential; real model releases arrive in jumps.
- Output is cumulative with no market noise, luck, or distribution effects.
- Three stylized lanes stand in for real careers — the mechanism is the
  point, not the magnitudes.

This is an educational demo, not production infrastructure.

Source: [github.com/anhquanbd2021/ai-will-keep-getting-better-the-question-is](https://github.com/anhquanbd2021/ai-will-keep-getting-better-the-question-is)
