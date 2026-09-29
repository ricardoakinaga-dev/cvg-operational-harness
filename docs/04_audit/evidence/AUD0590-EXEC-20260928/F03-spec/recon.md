# AUD0590 F03 — recon e revisão documental da SPEC 0163

- Data: 29/09/2026; claim `AUD0590-F03-SPEC-001`; task `A59-03` / `PR-403` / `PR-604`.
- Estado: `SPEC_DRAFT_READY_FOR_REVIEW`; BUILD `NOT_AUTHORIZED`; crítica independente `NOT_RUN`; aprovação humana T3 `PENDING`; produção `NO_GO`.
- Base de leitura: root `3859032a5b4ca45e5e45689bffda290997ba6176` com trabalho concorrente no diretório. Os hashes abaixo identificam **arquivos**, não certificam o root integrado.

| Fonte lida | SHA-256 | Observação relevante |
| --- | --- | --- |
| `packages/observability/src/otel.ts` | `0811b07301a1d7b2a8d72bb972c51b2d3c6bb749ba873ad61ea50f27e7bcb1d6` | `toOtelAttributes` copia todas as chaves; `startSpan`, `child`, `setAttribute` e métrica entregam atributos ao SDK; `end` passa `errorCode` ao status e fallback. |
| `packages/observability/src/telemetry.ts` | `e127f27bd16104353d799e2c8286fa6c464bcd85582ca89be4e5f54eab620b5b` | Fallback faz `String(value)` + redator de texto, mantém nome da chave; métrica valida chaves em allowlist antes do buffer. |
| `packages/observability/src/redaction.ts` | `50ea69a2a83fce8d131bc3cb83419e38da74d392656aade20c496bbac073a24fbc498e00c02441bda94` | `redactFields` reconhece algumas chaves sensíveis em objetos/logs; `redactAttributeValue` examina apenas o valor de texto. |
| `docs/04_audit/evidence/AUD0590-EXEC-20260928/quality-bar-v1.json` | `300a26dac390174b7fe2937ad8dcd5899fc87af4ad84ca820d2f4a8f65895004` | F03 P1 congelado: nenhum marcador sensível na entrada do SDK, filhos, métricas, logs e buffers; tracer/exporter falso. |

Fontes adicionais lidas: `packages/observability/src/operational.ts`, `trace-context.ts`, testes em `packages/observability/src/__tests__/observability.test.ts`, `packages/agent-runtime/src/runtime.ts`, `apps/api/src/server.ts`, `apps/worker/src/worker-observability.ts`, [sonda original](../../AUD0590-DEEP-20260928/probes.json), [finding F03](../../../0590_deep_system_audit_2026-09-28.md) e [backlog A59-03](../../../../03_build/0361_aud0590_remediation_backlog.md). Não houve execução de teste funcional nesta rodada de SPEC; a sonda é evidência histórica, não reteste.

## Revisão própria contra F03

| Critério | Cobertura na SPEC | Estado |
| --- | --- | --- |
| Ameaça e fronteira anterior ao SDK | §§1–2, com destinos e cópia sanitizada antes da primeira chamada | `SPECIFIED`, não implementado |
| Schema exato de chave/valor e fontes aceitas | §2.1 e §3: conjunto fechado, valores finitos por catálogo, IDs e campos proibidos | `SPECIFIED`, catálogo concreto pendente de revisão |
| Root, filhos, mutação, evento, status, métricas, logs, buffers e fan-out | §2.3 | `SPECIFIED`, não testado |
| Fail-closed sem contaminar negócio/erro | §2.2 | `SPECIFIED`, não testado |
| Negativos com marcador e SDK falso na entrada | §4 | `PLANNED`, não executado |
| Rollout/rollback, T3, NO_GO | §5–6 | `SPECIFIED`, decisão humana pendente |

**Limitação material:** o catálogo finito de `provider/model/capability` precisa de inventário de valores concretos dos produtores durante BUILD. A SPEC fixa que valor não cadastrado é omitido e que nenhuma configuração dinâmica amplia o catálogo; a lista final de literais deve ser anexada à revisão da implementação. `CompositeTelemetry` é o entrypoint padrão observado na auditoria, e nenhuma exportação OTel externa foi observada. A política proposta pode reduzir dimensões e campos hoje visíveis; isso é mudança T3 de contrato e exige revisão dos consumidores.

**Próxima ação:** submeter o hash da SPEC 0163 a crítica independente e revisão humana T3. Somente aprovação explícita da revisão vigente autoriza BUILD sintético. Este recon não é crítica independente, aprovação, teste de implementação nem fechamento de F03.
