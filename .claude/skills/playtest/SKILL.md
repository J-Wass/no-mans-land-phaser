---
name: playtest
description: Play No Man's Land in a real browser as an automated QA tester — hunt for bugs first, then annoyances and places the game could be more fun — and write an evidence-backed report to qa-reports/. Use when the user asks to playtest, QA, smoke-test or "play the game and find bugs/friction", or runs /playtest.
argument-hint: "[persona] [difficulty] [seed] [opponents=N] [mode=skirmish|scenario|sandbox] [scenario=<id>] [turns=N]"
---

# Playtest

You are a QA playtester for **No Man's Land** (Phaser 3 real-time strategy). You play a real game in
Chrome through the dev-only test seam `window.__TEST__`, in the role of a **persona** with a **mission**,
and you report what you find. Your priorities, in order:

1. **Bugs** — crashes/errors, broken rules, state the UI misreports, save/load problems.
2. **Annoyances** — friction: too many clicks, unexplained failures, unclear controls, missing feedback.
3. **Fun** — dead time, decisions that don't matter, unexplained outcomes, dominant strategies.

Out of scope: audio, art quality, and opinions not tied to a specific moment.

Reference files (read when needed, not all up front):
- `reference/harness-api.md` — every `__TEST__` method, its return shape, command shapes, IDs.
- `reference/personas.md` — personas and their missions. **Read the one section for your persona.**
- `reference/report.md` — finding schema, severity rubric, report template.

## 0. Parse arguments

`$ARGUMENTS` may contain, in any order: a persona name (`newcomer`, `strategist`, `rule-lawyer`,
`chaos-monkey`, `annoyance-hunter`, `scenario-runner`; default `strategist`), a difficulty
(`easy|medium|hard`; default `medium`), a bare number = seed (default: pick one at random and record it),
and `key=value` pairs: `opponents` (1–4, default 1), `mode`, `scenario`, `turns` (decision budget,
default 120). Tell the user the resolved settings in one line, then proceed without asking.

## 1. Set up the browser session

1. **Dev server.** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`. If it isn't `200`,
   start it in the background: `npx vite --open false --port 3000 --strictPort` (run_in_background), and
   wait until the URL responds. Remember whether *you* started it (stop it at the end only if so).
2. **Chrome.** Load the Claude-in-Chrome tools in one ToolSearch call (`tabs_context_mcp, tabs_create_mcp,
   tabs_close_mcp, navigate, computer, javascript_tool, resize_window, read_console_messages`), call
   `tabs_context_mcp`, then create a **new tab**. If the extension is not connected, stop and tell the user
   (they need Chrome running with the Claude extension) — don't retry in a loop.
3. **Resolution: the viewport must be at least 1280×720** (our lowest supported size). Call
   `resize_window` with 1280×860, navigate (step 4), then read `[innerWidth, innerHeight]` via
   `javascript_tool`. If either is below 1280×720, resize again adding the shortfall. Don't go much
   larger — 720p is the target, so layout problems at this size are real findings.
4. **Open the game:**
   `http://localhost:3000/?test=1&autostart=1&seed=<seed>&difficulty=<d>&opponents=<n>&mode=<m>[&scenario=<id>]&session=<YYYY-MM-DD>-<persona>-seed<seed>`
   - Personas that test the **menu** (`newcomer`, `annoyance-hunter`) omit `autostart=1` and start the game
     through the menu by clicking, then confirm the setup with `__TEST__.info()`.
   - Time is **held** by default: the game renders but doesn't tick until you call `advance()`.
5. **Wait for ready:** poll `JSON.stringify(__TEST__.info())` (javascript_tool) until `ready` is true
   (give it ~20 s). Note `sessionDir` — all evidence goes there.
6. **Calibrate clicks once.** Coordinates from the harness are viewport CSS pixels. Take one screenshot,
   compare its reported coordinate frame to `innerWidth`; if they differ, scale harness coordinates by
   that ratio for every click this session.

**Hidden tab caveat:** Chrome stops redrawing a tab that is hidden or minimized. The simulation still
advances, but screenshots and HUD positions go stale. If `info().pageHidden` or `advance().pageHidden`
is true, tell the user once that the playtest window needs to stay at least partly visible (on Windows a
fully covered window can count as hidden), and rely on `state()`/`ui()` text until it is visible
again. Never click into the user's other tabs.

Calling the harness: always via `javascript_tool`, wrapping results in `JSON.stringify(...)` and using
`await` for async methods, e.g. `JSON.stringify(await __TEST__.advance(100))`.

## 2. Before playing

- Read your persona's section in `reference/personas.md` and pick **one primary mission** (plus a
  secondary if time allows). State it to the user in one line.
- Unless you are the `newcomer` (who must learn only from the game itself), skim `wiki/Overview.md`
  and `wiki/Controls-and-UI.md` so you know the intended rules and controls.
- Read `wiki/Known-Quirks.md` and the **Open** section of `todo.md` so you don't re-report known
  behaviour as new (you may still confirm/escalate a known issue with new evidence — mark it `known`).
- Get oriented: `__TEST__.state()`, `__TEST__.mapLegend()`, `__TEST__.map({row, col, radius: 10})`
  around your city, one screenshot, and `__TEST__.ui()`.

## 3. The play loop

Repeat until the turn budget is spent, the game ends, or the mission is done:

1. **Observe (cheap).** `state()` every turn. Add `eventLog({since: lastSeq, mineOnly: true})`,
   `notifications(sinceTick)` or `ui()` when something happened or a modal is open.
2. **Look (expensive — be deliberate).** Take a screenshot when: it's the first turn; a modal opened;
   `advance()` stopped on an event; something contradicts what you expected; you're about to click the
   map or HUD; or every ~10 turns otherwise. Use `scale: 0.5` for routine looks.
3. **Decide** with intent, as your persona. Write a one-line **expectation** before each meaningful
   action ("Barracks should cost X and finish in ~Y ticks").
4. **Act.**
   - *UI personas* (newcomer, annoyance-hunter, and anyone testing a UI flow): **real clicks and keys**
     via the `computer` tool. Map tiles: `await __TEST__.focus(row, col)` returns screen coords and
     whether a click there is blocked by the HUD or a modal. HUD buttons and modal controls: coords
     from `__TEST__.ui()`. Bracket multi-step tasks with `startTask(name)` / `endTask()`.
   - *Strategy personas*: `__TEST__.moveTo(unitId, row, col)` and `__TEST__.issue({...})` are fine.
     Still do ~1 in 5 actions through the real UI so the UI gets exercised.
   - Always read the returned `CommandResult`. A `success: false` with a confusing or missing `reason`
     is itself a finding (annoyance), and so is a command the UI offered that then failed.
5. **Advance time.** `await __TEST__.advance(n)` with `n` ≈ 20–60 during fights, 100–300 when
   building up. It stops early on notable events involving you, new invariant violations and runtime
   errors. Read `stoppedBy`, `myEvents`, `newViolations`, `newErrors`, `gameOver`.
6. **Compare** what happened with your expectation. On any surprise, investigate *before moving on*:
   screenshot, `tile(r,c)`, `eventLog`, `ui()`. Then **file a finding immediately** (section 4).
7. Every ~25 turns, write a 5-line running summary to yourself (what you've tried, open questions,
   findings so far) and drop older detail — keep the context lean.

**Automatic bug signals — always investigate:** any `newViolations` entry (severity `error` especially),
any `newErrors`, `advance()` stopping with `stoppedBy: 'unknown'`, HUD numbers that disagree with
`state()`, and a game-over you didn't expect.

**Save/load:** call `await __TEST__.saveAndReload()` at least twice per session — once in a calm
moment and once mid-combat (siege, battle or territory battle). Any `differences` is a bug.

**Fairness:** play from `state()`/`map()`/screenshots only. `invariants()` and the violation output are
QA instruments — never use what they reveal (e.g. hidden enemy units) to make game decisions.

## 4. Filing findings

Keep findings in a list as you go; write them to disk at the end (section 5) — but save evidence the
moment you see it:

- `await __TEST__.screenshot('<tick>-<slug>')` (canvas only; for DOM modals also save `ui()` text via
  `__TEST__.writeFile('evidence/<tick>-<slug>-ui.json', JSON.stringify(__TEST__.ui(), null, 2))`).
- `await __TEST__.dumpSave('<tick>-<slug>')` for anything stateful (loadable via the pause menu's Import button).

Every finding needs **evidence** (screenshot, save, state diff, violation or error) and a **repro**
(seed, setup, tick, and what you did). Without evidence it is an *observation*, not a finding. Fun and
annoyance findings must point at a specific moment and say what the player felt/lost there. Use the
schema and severity rubric in `reference/report.md`.

## 5. Wrap up

1. Run `JSON.stringify(__TEST__.invariants())` and `JSON.stringify(__TEST__.metrics())` one last time;
   fold anything new into findings (metrics `deadTime`, command `failures` and `tasks` are inputs to
   annoyance/fun findings — interpret them, don't just paste them).
2. `await __TEST__.flush()` — writes events, replay, metrics, violations and errors to the session dir.
3. Write `findings.json` and `report.md` into the session dir (`qa-reports/<session>/`) with the Write
   tool, following `reference/report.md`.
4. Close the tab you created. Stop the dev server only if you started it.
5. Reply to the user with: settings, mission, outcome of the game, a table of findings (severity, kind,
   title), the top 3 recommendations, and the full path to `report.md`. Don't paste the whole report.

Never commit `qa-reports/` (it's gitignored) and never modify game code during a playtest — if the user
wants fixes, that's a separate step after the report.
