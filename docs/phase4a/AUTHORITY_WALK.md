# Authority walk — AAA-4A

For a governed action, the authority path is:

1. The caller supplies the trusted tenant/session/profile envelope.
2. The interpreter extracts a request and the manager selects an exact
   profile descriptor.
3. The service creates a proposal hash and operation key, then persists the
   proposal before any effect.
4. The injected bridge builds a `RuntimeInput` with service-bound identities
   and bounded context.
5. The existing Operational Harness evaluates policy, approval, capability
   validation and the effect journal, while retaining audit and telemetry.
6. The service accepts only a result whose execution, proposal, operation,
   status, effect flag and evidence references agree.
7. The store persists the terminal outcome and the composer writes a grounded
   response; delivery is a separate idempotent step.

No arrow points from user text, model output, persona, knowledge content or
DialogueManager directly to a capability. Handoff and stop terminate the
conversation path. Corrections change the proposal binding before a resume.

The public Harness integration test is the executable authority walk. The
candidate evidence graph links each step to its source and test. The
controlled PostgreSQL integration additionally proves tenant RLS, durable
claim contention, stale lease recovery and delivery replay; real effects and
provider integrations remain out of scope.
