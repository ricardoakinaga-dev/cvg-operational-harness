# AAA-12 SQL adapters — limitations

- `PostgresChannelEffectJournal` and `PostgresEffectJournal` are the multi-host
  durable paths. `FileEffectJournal` (AAA-10) remains single-host only.
- Both SQL adapters require a single checked-out connection (they issue
  `BEGIN`/`COMMIT`; a `pg.Pool` could route statements to different connections)
  and the session tenant context `cvg.tenant_id` for forced RLS.
- `releaseExpired` (runtime adapter) is scoped by RLS to the session tenant; a
  multi-tenant sweep must iterate tenants. The channel interface has no sweep:
  expiry is resolved on `reserve` (safe takeover or UNCERTAIN).
- The channel adapter imports `ChannelEffectJournal` **types only** from
  `@cvg/channel-gateway` to avoid a runtime dependency cycle; the reserve state
  machine is reimplemented locally with the same constants and transitions.
  Cross-adapter behavioral parity for the gateway remains owned by AAA-12.
- Invalid or malformed persisted `hash_version` fails closed:
  `reserve` returns `version_mismatch` (gateway maps to
  `hash_algorithm_mismatch`) and transitions throw `hash_algorithm_mismatch`.
- Terminal `CONFIRMED`/`FAILED` channel rows are never overwritten; stale
  `lease_owner` transitions return `lease_lost`.
- Migrations are additive (`CREATE TABLE IF NOT EXISTS`, `NOT VALID` checks) and
  checksummed by the existing runner. No applied migration was edited.
- `packages/persistence/src/outbox.ts` was not modified; `postgres.ts` only
  registers the two new migrations in the default ordered list.
- All tests use synthetic identifiers and hashes and a disposable PostgreSQL
  fixture on 127.0.0.1:55432. No operational database, provider or canal real was
  touched. Skips are only used when `TEST_DATABASE_URL` is unset; the local
  `test:postgres` gate ran them with the fixture.
