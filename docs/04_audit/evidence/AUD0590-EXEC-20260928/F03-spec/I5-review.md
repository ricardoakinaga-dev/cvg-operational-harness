# F03 / SPEC 0163 — crítica independente I5

**Entrada:** commit `53d4054ae15c963d626b0c4432b7712ee01484c0`, SPEC SHA-256 `6d9ea34dbab457e32678a411c9ac21298e51772342c1b86869154c86ff670672`. Revisão de fonte somente leitura; sem testes ou alteração de produto.

**Veredito:** `REVISE` — 0 P0, 3 P1, 1 P2. Os achados I4 sobre `WorkerTelemetry` injetado nos dois construtores e eventos `approval.handoff_assumed`/`approval.decided` foram resolvidos na SPEC. `createPostgresContinuousWorker` repassa seu sink ao construtor coberto pela facade proposta.

| Severidade | Achado | Exigência para I6 |
| --- | --- | --- |
| P1 | `GovernedAgentRuntimeOptions.telemetry` é injeção pública estrutural; `runtime.ts` chama `startSpan` diretamente. O terceiro argumento proposto na SPEC levaria IDs internos ao objeto injetado antes do adapter. | Manter contexto de negócio fora do contrato de telemetria injetável ou definir uma admissão antes da chamada, com negativo que captura argumentos na entrada. |
| P1 | `OpenTelemetryTelemetry.recordLocalSpan` aceita `RecordedSpan` público e repassa campos a fallback injetável sem regra própria. | Tornar o ingresso privado ou validar antes do fallback; testar marcador direto nesse método. |
| P1 | `apps/worker/src/main.ts` escreve `workerId` no stdout e erro livre no stderr. `redactStartupErrorMessage` aplica padrão de valor e deixa marcador sintético simples passar. | Inventariar stdout/stderr dos entrypoints e provar saída segura com negativos diretos. |
| P2 | O allowlist de nome de exporter em serving não inclui `api-json-lines`, usado em `apps/api/src/main.ts`. | Admitir esse nome exato ou migrar o entrypoint, com prova do caminho real. |

**Fontes inspecionadas:** `docs/02_spec/0163_otel_redaction_boundary.md` §§2.3, 2.5–2.7; `packages/agent-runtime/src/contracts.ts`, `runtime.ts`; `packages/observability/src/otel.ts`; `apps/worker/src/main.ts`, `startup-error.ts`, `postgres-controlled.ts`; `apps/api/src/main.ts`. Nenhum BUILD T3 fica autorizado por este parecer.
