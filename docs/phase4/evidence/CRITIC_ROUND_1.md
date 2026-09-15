# AAA-41 Fresh Critic — Round 1

This is the read-only critic record for the pre-repair candidate. It is kept as
historical evidence; it is not the final approval record.

## Verdict

`BLOCKED` for finalization.

## Findings

- `P4-C11`: the tenant-isolation test used a cooperative provider and did not
  technically reject an input payload whose `tenantId` claimed another tenant.
- `P4-C04`/`P4-C10`: the PostgreSQL evidence used the direct public factory but
  did not yet execute the capability through the durable
  `OperationalExecutionWorker`/`PostgresOperationalExecutionStore` path, nor
  prove durable approval recovery for that composed path.
- `P4-C06`: registry ordering used locale-sensitive `localeCompare`, without a
  cross-runtime ordering proof.
- `P4-C13`: published package deep imports were denied, but the internal source
  module still named the adapter export. This remains a documented public
  surface limitation; arbitrary malicious in-process sandboxing is out of
  scope.
- `P4-C15`: the evidence bundle was bound to an earlier candidate and lacked
  the final critic/sentinel artifacts.
- Mechanical certification was `NO_GO` solely because the repository-wide
  `format` gate reported existing brownfield drift; all other captured gates
  passed. Production remained `NO_GO`.

## Repair disposition

The source now rejects recursive authority-field mismatches before provider
validation/execution, uses locale-independent code-unit ordering, and adds
four controlled PostgreSQL scenarios covering the durable worker and durable
approval paths. The repaired evidence and bounded final-critic outcome are
recorded alongside this historical round.
