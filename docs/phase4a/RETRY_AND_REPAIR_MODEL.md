# Retry and repair model — AAA-4A

## Turn acceptance

The store first reserves a message/idempotency key. A duplicate with the same
body returns the stored turn; a conflicting body for the same key is a state
conflict. Processing commits with optimistic state-version CAS and a bounded
retry loop. A fresh snapshot is merged only through validated working-memory
state.

## Execution

The service creates one stable execution identity and claims the proposal's
operation key before crossing the Harness. Claims return `EXECUTE`, `REPLAY`,
`WAITING_APPROVAL`, `IN_FLIGHT` or `WAITING`. An in-flight request waits for a
bounded interval and then reports the in-flight state. A terminal journal or
execution result is replayed; it is never rerun to repair prose.

If the Harness throws or returns an invalid identity, status, output, effect
flag, evidence list or approval binding, the service records `UNCERTAIN` with
bounded evidence. It does not convert an exception into success. A state
commit failure after a confirmed external effect is surfaced as uncertainty;
the existing effect journal remains the recovery authority.

## Delivery and composition

The response is committed before delivery. Delivery has a stable response id,
delivery key, payload hash, attempt count and, in PostgreSQL, a lease token.
Stale leases can be reclaimed by the delivery adapter. Retry updates delivery
status only. Composer verification failure uses a safe repair draft with a
system-state reference. A repair never changes the execution outcome.

These controls provide bounded local recovery evidence. They do not establish
production RPO/RTO, cross-process exactly-once delivery, or recovery from an
OS kill unless the corresponding disposable test is actually executed.
