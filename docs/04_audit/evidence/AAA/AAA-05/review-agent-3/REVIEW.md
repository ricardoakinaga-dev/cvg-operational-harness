# AAA-05 independent review — agent-3 (data/channel contract)

- Verdict: `REJECT` for freezing this revision (two P1 contract defects). `APPROVE_IN_SUBSTANCE` for the rest.
- Reviewer: `agent-3`; did not author AAA-05.
- Observed artifact: `docs/02_spec/aaa_data_api_contract.md`, sha256 `8db1541f3f0428b64b47d5235c406cc4450b19ecc85eee75290837229dbf17e5`.
- Context: `docs/03_build/0327_aaa_round2_coordination.md`; AAA-03 revision 2 `9df1a05f…`.
- Evidence from this review: `review-agent-3/review.json`, `review-agent-3/hash-and-crosschecks.txt`.

## Required corrections before freeze

1. **`AAA05-R3-F01` (P1, binding semantics)** — §3.1 maps `payloadHash` ↔ `proposalHash` as "igualdade de conteúdo". The two hashes have different canonical coverage: AAA-05 hashes only the outbound projection (`conversationId, channel, recipient, body, correlationId, metadata`), AAA-03 hashes the whole proposal (tenant, operator, agent, versions, capability, action, resource, classification, payload). They cannot be compared for equality, and a divergence decision cannot be derived from comparing them. AAA-03 revision 2 R-ID-3 already states the correct rule: different coverage, identity is the key. Fix the table and state that cross-boundary binding is `idempotencyKey := operationKey`, each boundary compares only its own hash, and no code may compare `proposalHash` with `payloadHash`.
2. **`AAA05-R3-F02` (P1, state machine)** — `FAILED` is simultaneously terminal ("nova chave", §2/§7 row 7) and retryable with the same key (§5: `FAILED(retryable)` backoff → `PENDING`, dead-letter = `FAILED + attempts_exhausted`). Pick one: either `FAILED` is terminal and pre-effect failures use a non-terminal state that returns to `PENDING`, or retryable failures are explicit and dead-letter is a distinct terminal marker with max attempts. Align with AAA-03 E-1/E-2.

## Non-blocking observations

- `AAA05-R3-F03` (P2, freshness): §3.1 cites AAA-03 hash `db75899f…` (revision 1); current revision is `9df1a05f…`. Update or make the reference revision-agnostic with the manifest pointer.
- `AAA05-R3-F04` (P3, fencing): the implementation fences `complete`/`fail`/`markUncertain` with lease owner (verified in `effect-journal-file.ts`), but the contract text only names `complete`. State that every terminal transition requires lease token + revision CAS.
- SQL DDL and adapter are clearly labeled proposed/reserved (D05-1/D05-2) — PASS, no implementation claim.
- The stale AAA-03 note in §0 ("ausente no momento da redação") is historical; harmless but should be reconciled when the document is next edited.

## Limitations

- Static contract review; no execution. AAA-12's implementation was reviewed separately.
- REJECT applies to freezing this revision only; byte changes require a new review.
- Technical opinion only; not human signoff.
