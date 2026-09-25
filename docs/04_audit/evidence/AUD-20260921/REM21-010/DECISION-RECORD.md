# REM21-010 — Decision record

## Decision

Adopt `pg_dump` custom + `pg_restore` into an explicitly new disposable
PostgreSQL instance as the local backup/restore proof. Treat rollback as
restoration of a versioned pre-migration backup followed by the existing
checksum-guarded roll-forward runner.

## Rationale

The repository has additive migrations and no universal down-migration contract.
Inventing destructive down scripts would exceed this task's authority and could
hide ownership or data-loss semantics. A pre-migration backup is the honest
rollback boundary for this controlled proof and is directly testable twice.

The workload uses the tenant-scoped repository and controlled worker adapter,
not an in-memory substitute. RLS, roles/grants and journals are compared as
first-class state. Corruption is injected only into the disposable target and
must change a checksum before the gate can pass.

## Safety boundary

The runner owns only containers named with its process id and removes them in a
`finally` block. Credentials and tenants are synthetic constants. It never
connects to `TEST_DATABASE_URL`, a provider, an IdP, a real channel or a
production database. RPO/RTO fields are fail-closed to
`RPO_RTO_NOT_MEASURED_IN_PRODUCTION`.

## Residual decision

`VERIFIED_LOCAL / FINAL_CERT_DEFERRED`: the local implementation and proof are
accepted for the authorized build lane. Production remains `NO_GO` until the
independent review, complete candidate freeze and external/human gates are
handled under their separate authority.

