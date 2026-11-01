# Findings & report format

## Finding schema (`findings.json` = array of these)

```jsonc
{
  "id": "F-001",
  "kind": "bug | rule-mismatch | ux-annoyance | fun-pacing | balance | observation",
  "severity": "crash | major | minor | polish",
  "status": "new | known",            // known = already in wiki/Known-Quirks.md or todo.md
  "title": "Unit stays locked after reloading mid territory battle",
  "area": "save/load | combat | diplomacy | economy | research | production | movement | AI | UI/HUD | modals | menu | tutorial | scenario | performance",
  "evidence": {
    "tick": 1240,
    "screenshots": ["shots/1240-unit-locked.png"],
    "save": "saves/1240-unit-locked.json",
    "violation": "engaged-without-battle: Unit u7 is flagged ...",
    "errors": [],
    "stateExcerpt": "{...small relevant part of state()/tile()/ui()...}"
  },
  "repro": {
    "seed": 42, "setup": { "difficulty": "medium", "opponents": 1, "mode": "skirmish" },
    "steps": ["Move u7 onto enemy tile (14,11)", "advance until territory battle starts", "saveAndReload()"]
  },
  "expected": "Unit resumes the territory battle or is released.",
  "actual": "Unit shows inCombat forever; no battle record exists.",
  "playerImpact": "Player permanently loses the unit with no explanation.",
  "suggestion": "Optional: what might fix or improve it."
}
```

Rules:
- **Evidence is mandatory** for every kind except `observation`. Paths are relative to the session dir.
- **Repro steps** should be runnable by someone else from the seed. For UI findings, say what you clicked.
- **One issue per finding.** If the same root cause shows up in several places, one finding with all
  the places listed.
- `fun-pacing` / `balance` findings name the **moment** (tick range) and what the player lacked
  (a decision, information, a goal, feedback) — never just "this is boring".
- Don't file `known` issues as new; do add new evidence to them if you have it.

## Severity rubric

| Severity | Meaning | Examples |
|---|---|---|
| **crash** | Game stops working or state is corrupted. | Uncaught exception, frozen game, save that won't load, invariant `error` that persists. |
| **major** | Wrong rule outcome, lost progress, or a blocker for a normal player. | Allies fighting, unit stuck forever, victory not triggering, a core task the newcomer couldn't figure out. |
| **minor** | Wrong but recoverable; misleading information; noticeable friction. | Tooltip lies about a cost, failure with no reason shown, a common task taking 2× the clicks it should. |
| **polish** | Cosmetic or small quality-of-life. | Overlapping text at 720p, alert wording, a missing hover hint. |

## `report.md` template

```markdown
# Playtest — <persona> — <date>

**Setup:** seed <n> · <difficulty> · <opponents> opponent(s) · <mode>[/<scenario>] · viewport <w>×<h>
**Mission:** <primary mission> (+ <secondary>)
**Outcome:** <won/lost/ended at tick N/unfinished> after <turns> decisions, <ticks> ticks
**Evidence folder:** qa-reports/<session>/

## Summary
<3–5 sentences: how the session went, the most important problems, overall impression from this persona's point of view.>

## Findings
| ID | Severity | Kind | Title |
|---|---|---|---|
| F-001 | major | bug | ... |

### F-001 — <title>
- **Where/when:** tick <n>, <area>
- **Expected:** ...
- **Actual:** ...
- **Player impact:** ...
- **Evidence:** shots/..., saves/..., <violation/error text>
- **Repro:** seed <n>; 1. ... 2. ...
- **Suggestion:** ...

## Friction & fun notes
<Measured, not opinion: task table from metrics().tasks (task, clicks, commands, failed, ticks), command
failure reasons with counts, dead-time stretches and what you were waiting for, first contact/war/combat
ticks. Then 2–5 concrete suggestions, each tied to a moment above.>

## Coverage
<What you exercised (systems, modals, save/reload points) and what you didn't get to — so the next
session knows where to go.>

## Instrument summary
- Invariant violations: <n> (<rules>) · Runtime errors: <n> · Warnings: <n>
- saveAndReload: <n> runs, <n> with differences
```
