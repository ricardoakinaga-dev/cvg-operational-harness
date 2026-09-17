# Conversation quality rubric — AAA-4A

The frozen quality bar evaluates these axes from executed evidence, each on a
0–100 scale:

| Axis                  | Weighting focus                                             | Triple-A floor |
| --------------------- | ----------------------------------------------------------- | -------------: |
| Architecture          | Dependency direction, optionality and authority reuse       |             90 |
| Reliability           | Durable state, replay, claim and delivery recovery          |             90 |
| Grounding             | Source precedence, effect evidence and safe uncertainty     |             90 |
| Transaction integrity | CAS, idempotency, tenant/profile binding and leases         |             90 |
| Knowledge             | Approved source/version filtering and citation              |             90 |
| Security              | Adversarial rejection and no forbidden effect               |             90 |
| Naturalness           | Rules-first coverage, corrections, references and questions |             90 |
| Generality            | Independent profiles through one public API                 |             90 |

Scoring rule: a criterion gets credit only from current executable evidence
bound to the candidate. Static source inspection can support architecture
context but cannot replace a required runtime test. Any critical gap in
authority, false-success containment, durability or tenant isolation blocks a
full pass. A missing environment gate or fresh critic caps the result at
`CONDITIONAL_PASS`.

The current run records raw counts and skips in `evidence/ACCEPTANCE_STATUS.json`;
the final scores belong in `evidence/RESULT.json` after candidate freeze and
fresh review.
