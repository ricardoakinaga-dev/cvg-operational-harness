# AAA-41 Primary Demonstration

## Governed public path

The primary path is:

```text
explicit capability registration
  -> immutable exact-version registry
  -> internal capability-to-tool adapter
  -> createOperationalHarness
  -> Runtime tool resolution
  -> policy
  -> approval when required
  -> effect journal
  -> synthetic capability execution
  -> output validation
  -> audit and telemetry
```

The adapter is not exported by `@cvg/harness`; the package export map contains
only `.` and a child-process deep-import attempt returns
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

## Demonstrated scenarios

- Five declared origins (`core`, `skill`, `plugin`, `knowledge`, simulated
  `mcp`) traverse the same factory and Runtime path.
- Provider A and provider B use the same public factory and preserve the same
  policy/audit path while changing only synthetic provider identity/output.
- Twenty concurrent governed calls using one operation key result in one
  synthetic execution and one `CONFIRMED` journal record.
- Tenant A and tenant B use the same operation key without sharing journal
  identity. A valid call for each tenant preserves the Runtime, policy, audit,
  telemetry, and replay scope; a separate tenant-B payload that claims tenant A
  is rejected before provider execution and never reaches `CONFIRMED`.
- Missing, `latest`, unknown-version, unknown-id, invalid origin, invalid
  input/output/result, unauthorized profile, composition mismatch, and direct
  public bypass/deep-import attempts fail closed.

## Disposable PostgreSQL proof

`apps/worker/src/__tests__/operational-harness-capability-postgres.integration.test.ts`
uses the existing execution, effect, and approval tables, migrations, RLS, a
disposable schema, and a `NOBYPASSRLS` synthetic role. It proves:

1. tenant A executes once and reaches `CONFIRMED`;
2. a fresh pool and fresh public composition replay the same tenant/operation
   without a second capability execution;
3. tenant B may use the same operation key and receives a separate execution
   and journal record;
4. the real `OperationalExecutionWorker` and
   `PostgresOperationalExecutionStore` execute isolated tenant submissions
   through the public harness factory;
5. a PostgreSQL-backed approval remains `PENDING`, is approved durably, and
   executes after a fresh worker/pool composition; and
6. a synthetic crash after effect before confirmation persists `UNCERTAIN`,
   and a fresh composition rejects retry without executing again.

The focused disposable capability suite passes all 4 scenarios. The complete
disposable catalog is rerun for the final candidate. No real provider, network,
credential, patient data, or external effect was used.
