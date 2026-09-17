# Phase 4A security review — AAA-4A

## Controlled result

The local adversarial suite exercises malformed model output, prompt
injection, correction invalidation, ordinal selection, pronoun ambiguity,
side-question preservation, natural-language approval safety and 20-way
concurrent action contention. The public Harness integration also proves that
the existing policy/capability/effect-journal composition is the execution
path.

The controls support a **controlled synthetic security pass** for the in-memory
and disposable PostgreSQL paths. The controlled PostgreSQL run exercised RLS,
cross-tenant isolation, durable contention, stale lease recovery and fencing.
There is no claim of production security approval, real provider isolation,
arbitrary code sandboxing or unrestricted autonomy.

## Review checklist

- [x] Model output is schema-validated and cannot include approval authority.
- [x] Unknown capabilities fail closed.
- [x] User, tool and knowledge text are bounded and treated as data.
- [x] Natural assent does not approve an action.
- [x] Corrections invalidate affected proposal and approval state.
- [x] Harness result identity and effect evidence are checked.
- [x] New claims prove the accepted state version or exact active proposal;
      a second lease/state fence immediately before Harness entry turns a
      correction race into a safe bounded response.
- [x] Handoff excludes raw transcript, credentials and hidden reasoning.
- [x] Response delivery is separated from execution.
- [x] Profile capability and knowledge allowlists come from a frozen trusted
      `ConversationProfileAuthority`, not the transport descriptor.
- [x] Memory store binds tenant and profile/version.
- [x] Disposable PostgreSQL RLS, durable contention, stale lease recovery and
      old-worker fencing executed in this local environment.
- [x] The bridge checks the trusted composition-root runtime agent id/version,
      and committed execution turns persist the execution identity.

The run is still bounded to a disposable synthetic database. Real identity,
provider, channel and approval integrations remain outside this review. The
PostgreSQL delivery adapter has an explicit at-least-once crash window; an
external sink must deduplicate `deliveryKey` for production use.
