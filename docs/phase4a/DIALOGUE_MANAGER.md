# Dialogue manager contract — AAA-4A

`DefaultDialogueManager` accepts a typed interpretation, a bounded snapshot,
the profile descriptor and the current time. It returns one data-only
`DialoguePlan`:

| Plan               | Meaning                                                             | External action                    |
| ------------------ | ------------------------------------------------------------------- | ---------------------------------- |
| `ANSWER`           | Compose an informational or status response                         | None                               |
| `ASK_USER`         | Request one or a bounded group of missing fields                    | None                               |
| `PROPOSE_ACTION`   | Show a complete governed action before approval                     | None                               |
| `WAIT_APPROVAL`    | Preserve a proposal while approval is pending                       | None                               |
| `EXECUTE_ACTION`   | Permit the service to submit one exact proposal to the Harness port | Service boundary only              |
| `SEARCH_KNOWLEDGE` | Search an approved source set                                       | Knowledge provider outside manager |
| `HANDOFF`          | Stop and create a bounded handoff packet                            | Handoff sink outside manager       |
| `STOP`             | Cancel the conversational goal                                      | None                               |

The manager does not receive a runtime, capability implementation, policy
engine, approval engine, effect journal, SQL client, provider credential or
delivery sink. It cannot execute a plan. Capability selection is by exact
profile descriptor and requested action; an unknown or mismatched capability
fails closed.

Corrections are reduced before planning. A changed date, time, room or
reservation reference marks the previous fact as corrected or stale and
invalidates draft/pending-approval proposals. A completed proposal remains a
historical execution record and cannot be silently rewritten. Ordinal and
pronoun references use only one eligible bounded option/entity; ambiguity
returns a question. Side questions preserve a primary goal up to the profile
stack limit.

The service is responsible for the transaction around this pure planning
step. The manager's behavior is covered by state, integration, adversarial
and golden tests listed in `CRITICAL_TEST_CATALOG.md`.
