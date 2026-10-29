-- SPEC 0282 (AUD0625 F12c) — the earliest moment a released channel operation
-- may be reserved again (a 429 Retry-After). Additive and forward-only: one
-- nullable column, no existing row changes (NULL means "no wait"), no table is
-- rewritten and no published migration is touched. The migration runner owns
-- the transaction, advisory lock and checksum.
ALTER TABLE channel_effect_journal
  ADD COLUMN IF NOT EXISTS retry_not_before_ms bigint;

COMMENT ON COLUMN channel_effect_journal.retry_not_before_ms IS
  'SPEC0282 epoch milliseconds before which a released (PENDING, unleased) operation must not be reserved again; NULL = no wait.';
