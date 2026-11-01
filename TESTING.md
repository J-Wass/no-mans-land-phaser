# Testing Notes

## Test runner

Tests run under **Jest** (`ts-jest`, configured in `jest.config.js`). This
project previously used Vitest, which had an unresolved Windows/ESM collector
issue; it was migrated to Jest and that issue no longer applies.

```bash
npm test              # run the full suite
npm test -- --watch   # watch mode
```

As of this writing the suite has ~320 tests across ~33 files, all passing,
plus a clean `tsc --noEmit` and `npm run lint`.

## What's covered

Simulation/rules code (entities, systems, commands) has real unit and
integration test coverage — movement costs, pathfinding, combat resolution,
morale, diplomacy, production, research, save/load round-trips, and so on.

## What's not covered

Anything that requires a running Phaser `Game` instance or a browser DOM has
**no automated tests**: `src/scenes/*.ts` (camera, selection, custom paths,
minimap, HUD) and `src/ui/**` (DOM modals). `jest.config.js` uses
`testEnvironment: 'node'`, and importing `phaser` under Node throws
(`ReferenceError: navigator is not defined`) — Phaser assumes browser globals.
Adding coverage there would need either a `jsdom` test environment (the
`jest-environment-jsdom` package isn't currently installed) with enough of the
`navigator`/`canvas` surface mocked out, or a real browser-driven test (e.g.
Playwright) for smoke-testing launch → play → save → reload flows.

## Automated playtesting (`/playtest`)

The game has a dev-only test seam for driving the real game from a browser:
open the Vite dev server with `?test=1` (e.g.
`http://localhost:3000/?test=1&autostart=1&seed=42&difficulty=medium`) and
`window.__TEST__` appears. It holds simulation time so a tester can advance it
explicitly, exposes a fog-respecting text view of the game (`state()`, an ASCII
`map()`), records every event, player command and runtime error, checks game
invariants as time advances, round-trips save/load, and writes screenshots,
saves and logs into `qa-reports/` (gitignored) through a dev-server endpoint.

- Harness: `src/testing/TestHarness.ts` (loaded only by `main.ts` in dev with
  `?test=1`; not in production bundles). Scenes reach it only through the
  dependency-free `src/testing/testHooks.ts`.
- Invariants: `src/testing/invariants.ts` — pure, Jest-tested; also usable
  from any future headless simulation.
- Player view / ASCII map: `src/testing/playerView.ts` — pure, Jest-tested.
- Test sessions save to separate localStorage keys, so real save slots are
  never touched.

The `/playtest` Claude Code skill (`.claude/skills/playtest/`) uses this seam:
an agent plays a game in Chrome at 1280×720 as a persona (newcomer,
strategist, rule-lawyer, chaos-monkey, annoyance-hunter, scenario-runner) and
writes an evidence-backed report to `qa-reports/<session>/report.md`. It
needs the Claude in Chrome extension connected.
