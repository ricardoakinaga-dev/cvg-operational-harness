# AAA-12 actor-alignment — limitations

- **Actor is validated but not persisted.** `ChannelEffectRecord` has no metadata
  field and migration `0012_channel_effect_journal.sql` has no actor/reason
  column. Per task scope, no column/field was added, so `actorId`/`reason` are
  enforced but not written to the record or any audit table. Durable audited
  actor provenance requires a future schema change under its own task/gate.
- **PostgreSQL adapter error class.** The PostgreSQL implementation throws
  `PostgresChannelEffectError` with `code: 'reconciliation_required'` and
  `retryable: false` (the adapter's established pattern) instead of importing
  `ChannelError` at runtime. This preserves the type-only import and avoids an
  undeclared runtime dependency (`@cvg/persistence` does not depend on
  `@cvg/channel-gateway` and `package.json` was not to be touched). The stable
  code and retryability match the channel contract; only the concrete class
  differs.
- **Test stub signature.** `ReplayOnlyJournal` in
  `channel-coverage-gateway-journal-paths.test.ts` keeps its zero-argument
  `resolveUncertain` stub; TypeScript allows narrower method arity and the stub
  always throws "not used", so it is not a call site and was left unchanged.
- **RED depth.** The in-memory/file RED was executed against the unmodified
  adapters. The PostgreSQL RED was captured with the validation line temporarily
  disabled in a disposable mutant; the adapter was restored byte-for-byte
  (sha256 `5317684178a7…` re-verified with `sha256sum -c`) before the GREEN run.
- **Skip accounting.** `npm test` without `TEST_DATABASE_URL` reports 1154
  passed / 57 skipped vs the 1148/56 baseline: +6 new memory/file tests pass and
  +1 skip is the new PostgreSQL `itWithPostgres` test. With the fixture URL the
  PostgreSQL file runs 12/12.
- **Out of scope (unchanged):** contract documents, migrations, `package.json`,
  shared tracking files, other packages, production wiring, provider
  reconciliation integration, commit/push/deploy.
