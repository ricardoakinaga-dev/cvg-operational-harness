# REM21-018 — Discovery

Data: 2026-09-22  
Escopo: `G21-1`, local, sintético, descartável e sem serviços externos.

## Autorização e restrições

- Fonte: `docs/03_build/0338_codex_full_remediation_prompt.md`.
- Dependências concluídas: `REM21-003`, `REM21-006` e `REM21-011` locais.
- `G21-5` e `G21-6` permanecem fechados; produção permanece `NO_GO`.
- Nenhum dado real, segredo real, IdP, provider, canal, banco externo ou ação
  clínica/financeira/prontuário é permitido.
- O worktree já estava sujo. Alterações não relacionadas e evidências
  históricas hash-bound serão preservadas.
- O `.gauntlet/` existente é de outra rodada (`AUD20`) e não será sobrescrito;
  esta tarefa usa evidência própria em `REM21-018/`.

## Mapa reduzido

| Fronteira | Entrada pública | Estado descoberto |
|---|---|---|
| Journal de efeitos | `createJournaledToolRegistry` | `attemptId` usa timestamp + `Math.random`; não há factory de teste. |
| Execução PostgreSQL | `PostgresOperationalExecutionStore.submit` | fallback `Date.now + Math.random` alimenta IDs `exec_...`; opções não permitem factory. |
| Jornada web | `JourneysPanel` / `emptyKey` | chaves de idempotência usam timestamp + `Math.random`; são identidade de operação, não mero layout. |
| API env | `parseEnv`, `buildServerFromEnv` | schema compartilhado não expõe identidade explícita, outbox ou porta; guardas de produção estão espalhadas na composição. |
| Worker/homolog | `getWorkerStartupFailure`, `parseContinuousWorkerSettings`, `parseHomologConfig`, `parsePhase3*` | validadores fail-closed já existem, mas as entradas não estão no `.env.example` nem em uma matriz de cobertura. |
| Web build | `vite.config.mts`, `getDefaultWebIdentityMode` | flags `VITE_CVG_*` e `CVG_API_PORT` não estão no exemplo. |
| Health/telemetria/replay | `/live`, `/health`, `/ready`, JSONL/stdout e caches/replay | sem novas variáveis de exporter/timeout; o contrato deve documentar essa ausência em vez de inventar chaves. |

## Achados confirmados

### A21-F24

1. `packages/harness/src/effect-journal.ts:299` gera
   `attempt_${Date.now()}_${Math.random()...}`.
2. `packages/persistence/src/operational-execution-postgres.ts:1615`
   retorna ``${Date.now()}-${Math.random()}`` como fallback de `cryptoRandomUuid`.
3. A inspeção adicional encontrou `apps/web/src/features/journeys/index.tsx:17`
   gerando chaves de idempotência com o mesmo padrão. O jitter aleatório em
   `packages/model-gateway/src/gateway.ts` é backoff injetável, não identidade,
   e permanece fora deste slice.

### A21-F25

O `.env.example` anterior cobria API/persistência básicos, mas omitia identidade
trusted, keyrings, durable inbound, tuning e perfil do worker, arming de efeito
sintético, fault point, porta/API proxy e flags de identidade web. Também não
classificava as variáveis somente de teste/CI. Os validadores existentes foram
localizados e serão exercitados por perfil, sem duplicar a autoridade runtime:

- API: `parseEnv` e `buildServerFromEnv`;
- worker: `getWorkerStartupFailure` e `parseContinuousWorkerSettings`;
- homolog: `parseHomologConfig`;
- harness iterativo: `parsePhase3RuntimeProfile` e `parsePhase3Scenario`;
- web: `getDefaultWebIdentityMode` e flags do Vite.

## RED reproduzido

O probe completo está em `red-probe.log`. Resumo:

- busca dirigida encontrou os dois fallbacks A21-F24 e a chave web fraca;
- inventário contra o exemplo encontrou 19 chaves de runtime ausentes antes
  do BUILD, incluindo `CVG_IDENTITY_MODE`, keyrings, tuning worker, perfil,
  `PHASE2_FAULT_POINT` e `PORT`;
- não foi criado arquivo temporário, banco, processo, chamada de rede ou
  serviço externo.

## Limites visuais

REM21-018 não tem superfície visual nova nem requisito de layout. O slice web
é apenas a troca de geração de idempotency key por helper seguro; não há
redesign, screenshot ou gate visual a executar.

## Gate de saída da descoberta

Os dois achados foram reproduzidos, as fronteiras foram mapeadas e a mudança
pode seguir para PRD/SPEC. BUILD permanece bloqueado até a aprovação registrada
no ledger após os documentos seguintes.
