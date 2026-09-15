# AAA-10 runtime ports — limitations

- `InMemoryEffectJournal` is explicitly ephemeral: atomic only within one Node
  event loop and not durable across restarts. It must not be used in production.
- `FileEffectJournal` is durable for a single host sharing one directory. It is
  **not** safe on shared/network filesystems or across hosts; the multi-host
  durable path is `PostgresEffectJournal` (migration `0013_runtime_effect_journal`).
- `FileEffectJournal.releaseExpired` scans the journal directory; cost grows with
  the number of records. It never executes an effect and never touches terminal
  (`CONFIRMED`, `EFFECT_FAILED`) or `UNCERTAIN` records.
- `PostgresEffectJournal.releaseExpired` runs under the session tenant context
  (forced RLS). A single call sweeps exactly one tenant; multi-tenant sweeps must
  iterate tenants or call it through `withTenantContext`.
- The PostgreSQL adapters require one checked-out connection: they issue
  `BEGIN`/`COMMIT` and a `pg.Pool` may route statements to different connections.
- `EFFECT_FAILED` and `ABANDONED` records are re-armed by `reserve` with the same
  `operationKey` (normative retry path AAA-03 E-1). `CONFIRMED` always replays and
  transition methods refuse to mutate terminal records (`invalid_transition`).
- `runtime.ts` composition (approval reserve -> journal reserve -> tool ->
  journal confirm -> outbox) is intentionally not implemented in this lane.
- All identifiers, hashes and evidence are synthetic; no real patient, clinical,
  financial or operational data was used.
