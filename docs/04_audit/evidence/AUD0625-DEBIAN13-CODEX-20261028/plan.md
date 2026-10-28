# ExecPlan — AUD0625 Debian13

Goal: qualify the approved base migration locally and return evidence to Opus.
Authority: user receipt14ea + SPECd2fa + explicit assignment8494. No publication.

1. Acquire official checked tools; verify immutable base signature before use.
2. Change only two approved paths; preserve baseline source/lock/Node pin.
3. Build runtime <=600s; hardening, ABI/Node roots/system CA and real API/worker/TLS probes <=60s each.
4. Same Trivy0.70 DB: new-image policy and informational inventories; old-image known-bad negative; full coverage checks.
5. Current Node22 types/lint/format/unit/ownPG/E2E and fresh independent review (max2rounds). Any code/path expansion requires reconciliation.
6. Seal evidence and handoff branch/SHA/results to Opus; cleanup owned containers by ID, retain images explicitly. Resume GBrain monitoring.

Failures are preserved. No retry just to obtain green, no copying old libs, policy relaxation or silent base pin change.
