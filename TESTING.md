# Testing Notes

## Test runner

Tests run under **Jest** (`ts-jest`, configured in `jest.config.js`). This
project previously used Vitest, which had an unresolved Windows/ESM collector
issue; it was migrated to Jest and that issue no longer applies.

```bash
npm test              # run the full suite
npm test -- --watch   # watch mode
```

As of this writing the suite has ~280 tests across ~30 files, all passing,
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
