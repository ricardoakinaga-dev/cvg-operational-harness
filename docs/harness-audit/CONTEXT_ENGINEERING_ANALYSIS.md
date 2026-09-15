# Context engineering

## Pipeline atual

```text
inbound validado
→ tenant/conversation/session/version pin
→ histórico redigido (últimos 20 + marcador lexical de risco antigo)
→ config e prompt blocks ordenados
→ knowledge aprovado, quando intent institucional
→ provider request
```

Evidência: `apps/api/src/server.ts:3253-3438`, `apps/worker/src/postgres-controlled.ts:294-408`, `packages/platform/src/prompt-composer.ts:8-22` e `packages/platform/src/test-lab.ts:191-253`.

| Elemento                        | Estado              | Observação                                                                |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| system prompt/profile           | PARTIAL             | blocks priorizados, snapshot/version/checksum                             |
| history                         | IMPLEMENTED/PARTIAL | redigido e bounded; strings achatadas, sem provenance por mensagem        |
| session/tenant/operator         | IMPLEMENTED         | escopo e pin de versão presentes                                          |
| retrieved knowledge             | PARTIAL             | uma resolução aprovada; não é inserida no prompt do modelo default        |
| tool results/previous decisions | ABSENT              | não retornam ao contexto cognitivo                                        |
| approvals/policies              | PARTIAL             | metadados governam execução, não compõem raciocínio iterativo             |
| summaries/compression           | ABSENT              | truncamento dos últimos 20 não é sumarização                              |
| token budgeting                 | ABSENT              | sem orçamento do conjunto de contexto                                     |
| provenance/versionamento        | PARTIAL             | prompt/config/knowledge têm versão; mensagens/evidence set não            |
| poisoning protection            | PARTIAL             | redaction/allowlists existem; não há isolamento de instrução RAG/contexto |

## Gaps confirmados

No runtime default, `promptWithHistory` inclui apenas prompt composto e histórico; a mensagem atual e o answer de knowledge não são adicionados (`packages/platform/src/test-lab.ts:321-335`). O provider determinístico devolve `fallbackText` (`packages/platform/src/model-provider.ts:36-43`), portanto não há raciocínio conversacional real.

No kernel, `modelMessages` vem pronto do caller. O Prompt Registry valida versão/hash, mas `ModelGateway` envia `request.input` e metadados/hash, não `PromptRecord.content` (`packages/model-gateway/src/gateway.ts:312-328`). Conteúdo do prompt é hoje prova de integridade, não contexto automaticamente aplicado.

## Avaliação

Score sugerido: **3/10**. A identidade e o pinning são úteis; montagem, provenance e budgeting ainda não formam um subsistema reutilizável.
