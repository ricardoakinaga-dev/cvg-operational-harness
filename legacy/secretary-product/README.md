# Secretary product residue

This directory documents the inherited `cvg-agent-secretary-v2` product
boundary. It is retained for compatibility and provenance; it is not imported
by `@cvg/harness-contracts`, `@cvg/harness-orchestrator`, or `@cvg/harness`.

The product owns Secretary workflows, domain policy, channel integration, and
legacy runtime composition until separately migrated. Do not move files here or
delete the source packages as part of the Phase 0/1 refoundation.

## Update — 2026-09-26 — PROD-20260926 front FL

The user identified the Secretary product (Esmeralda V2,
`cvg-agent-secretary-v2`) as the legacy program and decided (DL-01 to DL-04)
that every legacy residue must be isolated under `legacy/` or deleted when it
is not vital. The Phase 0/1 restriction above is superseded for the tasks of
front FL (PR-L01 to PR-L12) in
[`docs/03_build/0356_production_backlog_2026-09-26.md`](../../docs/03_build/0356_production_backlog_2026-09-26.md).
Each move or deletion still requires its own short SPEC and green gates.
