# AAA-21 evidence graph

```text
PRE_FLIGHT + BASELINE
        |
        v
DISCOVERY -> PRD -> SPEC -> TASK/gate
        |
        v
execution-spine contract -----> harness contract tests
        |                              |
        v                              v
API 202/no-inline ---------> API integration tests
        |
        v
PostgreSQL adapter/migration -> typecheck/source review
        |
        v
worker lease/recovery -------> worker/harness tests
        |
        v
effect journal/crash --------> synthetic replay tests
        |
        v
full regression comparison -> baseline debt register
        |
        v
fresh critic + final sentinel -> Phase 2 result/report
```

The graph is deliberately layered: unit/contract proof does not stand in for
live PostgreSQL proof, and source inspection does not stand in for process
restart or fault-injected concurrency.
