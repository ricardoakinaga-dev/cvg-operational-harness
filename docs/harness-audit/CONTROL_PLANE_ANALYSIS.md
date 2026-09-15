# Control plane versus execution plane

## Separação implícita

Control plane em `packages/platform`: agents/versions/config, prompt/model/policy bindings, plugin/knowledge catalogs, test suites/traces e releases (`control-plane-store.ts:69-221`; `contracts.ts:298-319`). Execution plane: conversation/session/message, policy decision, model/tool calls, approvals, journals, outbox e results.

Pontos bons: publicação/versionamento e session pinning impedem rebinding silencioso. Ponto fraco: o mega-root API serve e compõe ambos; o worker conhece platform store e product configuration. Plugin catalog é metadata; executable registry é compilado com um único plugin controlado. Skill catalog não existe.

## Decisão alvo

O Harness deve possuir o execution plane e consumir um `RuntimeSnapshot` imutável/versionado fornecido pelo control plane. O produto pode manter UI, authoring, release workflow e tenancy administration. Um control-plane app genérico é `LATER`, não requisito do MVH.

Separar:

- Harness: contracts de snapshot, execução, evidence, policy/approval, capability, audit.
- Produto: authoring/UI, templates/skills/policies específicas e aprovação de publicação.
- Adapters: storage do snapshot, event delivery e external systems.

Estado: **PARTIAL**, com ownership ainda misto.
