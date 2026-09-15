# Target de conversa natural

```mermaid
flowchart TD
  U[User] --> I[Conversation Interpreter]
  I --> D[Dialogue State]
  D --> O[Hybrid Orchestrator]
  O --> C[Conversational Path]
  O --> E[Evidence/Knowledge Path]
  O --> T[Governed Capability Path]
  C --> R[Response Composer]
  E --> R
  T --> R
  R --> V[Claim & Safety Validator]
  V --> U
  O --> S[Typed Stop / Pause]
```

## Contratos

- `DialogueState`: goal, slots, ambiguity, pending question, interruptions e owner.
- `EvidenceSet`: claim type, source, version, freshness, confidence e tenant.
- `ProposedAction`: capability, resource, args, expected evidence e idempotency.
- `Decision`: next step + rationale bounded para audit, sem chain-of-thought.
- `StopReason`: completed, needs_input, approval, takeover, insufficient_evidence, denied, exhausted ou failure.

Princípios: linguagem pode variar; claim verificável sem evidence é removida/clarificada; ação sem capability/policy/approval é negada; high-risk sempre handoff/approval; takeover suprime automação. O composer recebe resultados já sanitizados e nunca credentials/raw private payloads.

Evals: naturalidade, ambiguidade, interrupção, groundedness por claim, tool/action appropriateness, handoff e refusal; sempre sem efeitos reais.
