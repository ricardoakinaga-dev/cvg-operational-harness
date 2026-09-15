# AAA-21 performance baseline

No production performance claim is made.

## What was observed

The baseline and focused checks were run locally on Node 24.20.0 in a sandbox
with restricted loopback and no PostgreSQL. The captured evidence is about
correctness and gate completion, not a representative latency distribution.
The Phase 2 tests do not currently emit a stable benchmark artifact for HTTP
ingestion latency, queue wait, worker processing, runtime duration, or SQL
round trips.

## Required future measurement

Run on a disposable Node 22/PostgreSQL environment with a fixed synthetic
fixture and record raw samples for:

- POST ingestion latency through the actual API;
- time from `QUEUED` to `CLAIMED`;
- claim-to-terminal worker duration;
- harness runtime duration by stop reason;
- SQL round trips per submit, claim, heartbeat, transition, and recovery.

The measurement must include concurrency, retries, and cold/warm cases. Until
that run exists, performance is `NOT_PROVEN` and cannot affect a release
decision.
