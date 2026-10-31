#!/usr/bin/env python3
"""Mutation campaign for the PAR-S02 repair (F01, F02, F03). Run at the repo root; restores every file."""
import json, os, subprocess, sys
PG = dict(os.environ, TEST_DATABASE_URL='postgres://postgres:pars01@127.0.0.1:55873/postgres', PAR_S01_PG_REQUIRED='1')
SP = 'packages/persistence/src/session-persistence.ts'
PC = 'packages/harness/src/session/projection-cache.ts'
T = 'packages/persistence/src/__tests__/'
ABORT, WRITER, FAULTS = T+'par-s02-repair-abort.test.ts', T+'par-s02-repair-writer.test.ts', T+'par-s02-repair-writer-faults.test.ts'
MALF, SHAPE = T+'par-s02-repair-malformed.test.ts', 'tests/par-s02-repair-projection-shape.test.ts'
M = [
 ('F01-1 no admission hop', SP, "    await Promise.resolve()\n    if (signal?.aborted) throw abortError()\n    const schema", "    const schema", [ABORT]),
 ('F01-2 hop without the check', SP, "    await Promise.resolve()\n    if (signal?.aborted) throw abortError()\n    const schema", "    await Promise.resolve()\n    const schema", [ABORT]),
 ('F01-3 no check before the origin work', SP, "      // the work of every origin is admitted the same way: no origin answers an aborted call\n      if (signal?.aborted) throw abortError()\n", "", [ABORT]),
 ('F03-1 contention not isolated', SP, "if (derived && isContention(error))", "if (false && isContention(error))", [WRITER, FAULTS]),
 ('F03-2 checkpoint not marked derived', SP, "    }, true)\n  }\n\n  /**\n   * The bridge primitive", "    })\n  }\n\n  /**\n   * The bridge primitive", [WRITER, FAULTS]),
 ('F03-3 every write derived', SP, "    derived = false\n  ): Promise<T> {", "    derived = true\n  ): Promise<T> {", [FAULTS]),
 ('F03-4 any 57 code isolated', SP, "return code === '57014' || code === '55P03'", "return typeof code === 'string' && (code.startsWith('57') || code === '55P03')", [FAULTS]),
 ('F03-5 any error isolated', SP, "if (derived && isContention(error))", "if (derived)", [FAULTS]),
 ('F03-6 only 57014', SP, "return code === '57014' || code === '55P03'", "return code === '57014'", [FAULTS]),
 ('F02-1 open only a record', PC, "(state.open === undefined || isOpenGroup(state.open))", "(state.open === undefined || isRecord(state.open))", [SHAPE, MALF]),
 ('F02-2 stops.total one kind', PC, "FINAL_STOPS.every((kind) => isCount(totals[kind]))", "isCount(totals.approval_required)", [SHAPE]),
 ('F02-3 stop kind any', PC, "FINAL_STOPS.includes(v.kind as string) &&", "isText(v.kind) &&", [SHAPE]),
 ('F02-4 pair length', PC, "pair.length === 2 &&", "", [SHAPE]),
 ('F02-5 closed.broken', PC, "typeof closed.broken === 'boolean' &&", "", [SHAPE]),
 ('F02-6 turn state', PC, "TURN_STATES.includes(v.state as string) &&", "isText(v.state) &&", [SHAPE]),
 ('F02-7 compaction count', PC, "isCount(compaction.count))", "true)", [SHAPE]),
 ('F02-8 open hasUser', PC, "typeof v.hasUser === 'boolean' &&", "", [SHAPE]),
 ('F02-9 call ref sequence', PC, "isCount(v.sequence) &&\n  isText(v.eventId)\nconst isOpenCalls", "isText(v.eventId)\nconst isOpenCalls", [SHAPE]),
 ('F02-10 lastTurn unchecked', PC, "(state.lastTurn === undefined || isTurnReport(state.lastTurn))", "true", [SHAPE]),
]
results = []
for name, path, old, new, tests in M:
    src = open(path).read()
    if src.count(old) != 1:
        results.append({'mutant': name, 'status': 'PATTERN_MISMATCH', 'count': src.count(old)}); continue
    open(path, 'w').write(src.replace(old, new))
    try:
        r = subprocess.run(['npx', 'vitest', 'run', *tests, '--no-file-parallelism', '--testTimeout=60000'], env=PG, capture_output=True, text=True, timeout=300)
        out = r.stdout + r.stderr
        status = 'KILLED' if r.returncode != 0 else 'SURVIVED'
        results.append({'mutant': name, 'status': status, 'detail': [l.strip() for l in out.splitlines() if l.strip().startswith('Tests ')][:1]})
    finally:
        open(path, 'w').write(src)
    print(results[-1], flush=True)
json.dump(results, open('mutations-s02-repair.json', 'w'), indent=2)
print('killed', sum(r['status'] == 'KILLED' for r in results), 'of', len(results))
