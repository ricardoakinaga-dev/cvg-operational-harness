# REM21-018 — BUILD/AUDIT

Run: `run-rem21-018-final-1`  
Scoped candidate: `417b83f1f8366cd3de29287254c21a045cea86549ec994ed88053be2f56b8354`  
Runtime: Node `22.23.2` / npm `10.9.8`  
Scope: local synthetic disposable (`G21-1`)

## Implemented

- effect journal attempt IDs now use `node:crypto` UUIDs with a deterministic
  factory seam;
- PostgreSQL execution IDs now use `node:crypto` UUIDs with a deterministic
  factory seam and no weak fallback;
- journey idempotency keys now use the shared secure UUID helper;
- shared env parsing recognizes identity mode, keyring fields, durable inbound
  and bounded API/web ports, including blank optional schema handling;
- `.env.example` now covers active API, worker, homolog and web build profile
  keys and documents code-defined health/telemetry behavior and test-only vars;
- focused tests cover secure defaults, factories, journey key shape, example
  completeness, placeholders and synthetic profile failures.

## Evidence

| Gate | Result |
|---|---|
| Focused Vitest | `PASS`: 5 files, 16 pass, 2 governed skips |
| Weak identity scan | `PASS`: no scoped `Date.now + Math.random` identity pattern |
| Full Vitest | `PASS`: 301 files, 20 skips; 2,113 tests, 146 skips; zero failures |
| Typecheck | `PASS` |
| Lint | `PASS` |
| Format | `PASS` |
| Docs/link/hygiene | `PASS`: broken 0, unallowlisted absolute 0, empty 66/66, JSON 384 |
| Diff check | `PASS` |
| Secret/example check | `PASS`: placeholders only, real-action flags false |
| Critic I1 | `NOT_RUN`: no valid completed fresh review returned |

Raw compact command results are in `green-probe.log`; initial reproductions are
in `red-probe.log`; the frozen criteria are in `quality-bar.json`.

## Scope and limitations

No real data, real secret, external service, production process, provider,
channel, IdP or deployment was used. The existing dirty worktree and stale
`.gauntlet/` run were preserved. The local result does not close G21-5/G21-6,
does not authorize production and does not satisfy REM21-019 freeze or human
signoff requirements.

## Decision

Local deterministic bar: passed. Gauntlet final verdict: `CONDITIONAL_PASS`
because independent I1 critique was unavailable. Next task remains
`REM21-019`; final certification is deferred.
