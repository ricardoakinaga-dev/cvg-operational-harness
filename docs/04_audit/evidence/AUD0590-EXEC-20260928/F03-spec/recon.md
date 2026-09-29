# AUD0590 F03 — recon e revisão documental da SPEC 0163

- Data: 29/09/2026; claim `AUD0590-F03-SPEC-001`; task `A59-03` / `PR-403` / `PR-604`.
- Estado: `SPEC_DRAFT_I2_REVISE_RESPONDED`; BUILD `NOT_AUTHORIZED`; [I1 Fermat](I1-review.md) `REVISE` (0 P0/4 P1/1 P2) e [I2 Ramanujan](I2-review.md) `REVISE` (0 P0/1 P1/2 P2), rechecagem independente `PENDING`; aprovação humana T3 `PENDING`; produção `NO_GO`.
- Base de leitura original: root `3859032a5b4ca45e5e45689bffda290997ba6176` com trabalho concorrente no diretório. Recon adicional da revisão I1 leu `packages/policy-engine/src/profile.ts` e `reference-profile.ts`, `packages/model-gateway/src/contracts.ts`, `packages/agent-runtime/src/contracts.ts` e `runtime.ts`, `apps/api/src/server.ts`, `apps/worker/src/worker-observability.ts`, `continuous-worker.ts`, `sweeps.ts`, `main.ts`, `homolog-worker.ts` e `packages/shared/src/lifecycle.ts`. Os hashes abaixo identificam **arquivos da leitura original**, não certificam o root integrado.
- SPEC anterior SHA-256 `d5fe42e1c2f4b729a47aa28f1aae8f747a7ae8a5c003615e6c2d4b587faa1d99`, commit `806a8901d9e1ab8f5c334f8416b8e16fb327eece`: histórica, alvo de I1, não aprovada.
- SPEC anterior SHA-256 `ca3b757d802dd5aeb3e0c84e2ff74116452bd2ead11f3c298c59457498d2311a`, commit `d7c79c644143580603d10da9de631654dfb98cbd`: histórica, alvo de I2, não aprovada.
- SPEC revisada I2 SHA-256 `4ac0aaae824bfe53b5e9290df02cf81e4600b6228b4ec427169cd76080844835`: minuta para nova crítica; sem aprovação T3.

| Fonte lida | SHA-256 | Observação relevante |
| --- | --- | --- |
| `packages/observability/src/otel.ts` | `0811b07301a1d7b2a8d72bb972c51b2d3c6bb749ba873ad61ea50f27e7bcb1d6` | `toOtelAttributes` copia todas as chaves; `startSpan`, `child`, `setAttribute` e métrica entregam atributos ao SDK; `end` passa `errorCode` ao status e fallback. |
| `packages/observability/src/telemetry.ts` | `e127f27bd16104353d799e2c8286fa6c464bcd85582ca89be4e5f54eab620b5b` | Fallback faz `String(value)` + redator de texto, mantém nome da chave; métrica valida chaves em allowlist antes do buffer. |
| `packages/observability/src/redaction.ts` | `50ea69a2a83fce8d131bc3cb83419e38da74d392656aade20c496bbac073a24fbc498e00c02441bda94` | `redactFields` reconhece algumas chaves sensíveis em objetos/logs; `redactAttributeValue` examina apenas o valor de texto. |
| `docs/04_audit/evidence/AUD0590-EXEC-20260928/quality-bar-v1.json` | `300a26dac390174b7fe2937ad8dcd5899fc87af4ad84ca820d2f4a8f65895004` | F03 P1 congelado: nenhum marcador sensível na entrada do SDK, filhos, métricas, logs e buffers; tracer/exporter falso. |

Recon adicional da resposta I1 (hash de arquivo lido, sem edição da fonte):

| Fonte | SHA-256 | Fato usado em `F03-C1` |
| --- | --- | --- |
| `packages/policy-engine/src/profile.ts` | `7d73eb7620f9e2a47834a21b1f2dba04bf41277d4ac5edf85f4d245932ac5f2e` | `Capability`/`AgentProfileName` são `string`; risco tem cinco literais. |
| `packages/policy-engine/src/reference-profile.ts` | `f647f4c36c29b56d99a8ed083380249f5c33b01e1e7348adc0f05fa37fd9502b` | 21 capabilities e cinco perfis apenas de referência. |
| `packages/model-gateway/src/contracts.ts` | `39136bad66e6dc5216ad4023eaa91d7915bd32e2eed9e756e0f4531d765198a3` | `providerId/model` são strings; saída do gateway não certifica valor de label. |
| `packages/agent-runtime/src/runtime.ts` | `e7076666a13d0bffe83459061b348b287ed925469bc79ea243f1d8e052167dce` | Root/filhos, IDs passados como atributos, métricas e nomes de estágio. |
| `apps/api/src/server.ts` | `76a588fbc40640638ede9a6c0f79b0926b7750557a06e9f36659150482fc38fa` | HTTP buckets, `RuntimeLogEntry` e literais/ternárias de log. |
| `apps/worker/src/worker-observability.ts` | `07471d746e6e88031943a878d57c436bd5d36fdf71235e58e9d4893bdb25ef16` | `CompositeTelemetry`, JSON worker e adapter injetável. |
| `apps/worker/src/continuous-worker.ts` | `9ecfbf200c52f070d46c1db0b8069fc89d9ad31dff3a03a3d652fb8b200765bf` | Métricas, logs, campos e interpolação de status do outbox. |
| `apps/worker/src/sweeps.ts` | `dd97b64f2263ebcbaa18826eb4e242979d3f2a95b192f2814b8ecf877089b515` | Métricas e logs de sweep com campos numéricos. |
| `packages/observability/src/operational.ts` | `f6688ee83234a2f66aff3bf941a9170e2d7d27b16a60306570b6242ac0b48d44` | Fan-out hoje compartilha `safeObservation`; sinks diretos e campos do DTO. |
| `packages/observability/src/trace-context.ts` | `da65f1727e0060827c52ed6551edbe4ff33bec0fa66c1331e9c893bcf4b367d2` | `TraceContext` estrutural não atesta origem da correlação. |

Fontes adicionais lidas: `packages/observability/src/operational.ts`, `trace-context.ts`, testes em `packages/observability/src/__tests__/observability.test.ts`, `packages/agent-runtime/src/runtime.ts`, `apps/api/src/server.ts`, `apps/worker/src/worker-observability.ts`, [sonda original](../../AUD0590-DEEP-20260928/probes.json), [finding F03](../../../0590_deep_system_audit_2026-09-28.md) e [backlog A59-03](../../../../03_build/0361_aud0590_remediation_backlog.md). Não houve execução de teste funcional nesta rodada de SPEC; a sonda é evidência histórica, não reteste.

Recon I2 na fonte já inventariada: `continuous-worker.ts` inicializa `counters.lag = null` e inclui o valor em `worker.outbox.summary`, `worker.stopped` e `worker.idle_backoff`; `otel.ts` usa `otelTrace.setSpan(otelContext.active(), this.#span)` ao criar filho. O `ObservationExporter.emit` público não carrega proveniência confiável de perfil. Estes fatos motivam omissão de `lag: null` antes da validação, contexto OTel filho limpo e omissão de `capability`/`agentProfile` em todos os destinos. Nenhuma fonte foi alterada.

## Revisão própria contra F03

| Critério | Cobertura na SPEC | Estado |
| --- | --- | --- |
| Ameaça e fronteira anterior ao SDK | §§1–2, com destinos e cópia sanitizada antes da primeira chamada | `SPECIFIED`, não implementado |
| Schema exato de chave/valor e fontes aceitas | §§2.1–2.2 e §3: `F03-C1` fixo por produtor, nomes, valores, códigos, campos e destinos; `capability`/`agentProfile` omitidos | `SPECIFIED`, I2 recheck pending |
| Contexto interno, root/filho e inert | §§2.3–2.5: contexto separado, sem IDs nos atributos, filho OTel com contexto limpo e inert com IDs locais | `SPECIFIED`, não testado |
| DTO público e fan-out | §§2.6–2.7: todos os campos, omissão nullable de `lag`, sinks diretos, cópia por exporter | `SPECIFIED`, não testado |
| Fail-closed sem contaminar negócio/erro | §2.4 e §4, com injeção de falha | `SPECIFIED`, não testado |
| Negativos com marcador e SDK falso na entrada | §4 | `PLANNED`, não executado |
| Rollout/rollback, T3, NO_GO | §5–6 | `SPECIFIED`, decisão humana pendente |

**Limitação material:** `F03-C1` mantém as capacidades e perfis de referência como inventário, sem autorizá-los como dimensões exportáveis. Perfis de produto, providers/modelos e nomes novos não são aceitos automaticamente; qualquer expansão exige nova revisão da SPEC. `CompositeTelemetry` é o entrypoint API padrão observado na auditoria, e nenhuma exportação OTel externa foi observada. A política proposta remove `capability`/`agentProfile`, reduz outras dimensões e campos hoje visíveis e muda a semântica de `MetricAttributeError`; isso exige revisão T3 dos consumidores e teste de compatibilidade.

**Próxima ação:** submeter o hash revisado da SPEC 0163 a crítica independente fresca; depois, se os findings forem resolvidos, pedir revisão humana T3. Somente aprovação explícita da revisão vigente autoriza BUILD sintético. Este recon não é crítica independente, aprovação, teste de implementação nem fechamento de F03.
