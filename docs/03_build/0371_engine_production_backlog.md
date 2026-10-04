# 0371 — Carteira do motor para produção

Data: 04/10/2026. Task: `ENGINE-PROD-20261004` (Claude Code). Direção:
[ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md). Relação
com o [backlog 0370](0370_harness_product_isolation_backlog.md): 0370 trata do
isolamento harness/produto; esta carteira trata da correção do **motor**
(`packages/harness`, `packages/agent-runtime`, `packages/harness-orchestrator`,
`packages/contracts` e adapters de modelo). Onde um item já existe em 0370, aqui
fica só o ponteiro.

Produção do motor: `NO_GO`. Nenhum item abaixo autoriza dado real, provider
externo, release, push ou deploy.

## Correção integral — `ENGINE-PROD-FIX-20261004`

Autorizada pelo usuário em 04/10/2026 (“pode corrigir tudo, preciso que esse
programa fique pronto para produção”), inclusive os itens T3 abaixo. Feita no
checkout compartilhado, sem commit, preservando as alterações do Codex.

| Item    | Estado       | O que mudou                                                                                                                                                                                                                                  |
| ------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENG-001 | `DONE_LOCAL` | Reserva de aprovação liberada quando a ferramenta não chega a rodar; auditoria com janela mínima própria no single-pass.                                                                                                                     |
| ENG-002 | `DONE_LOCAL` | Os dois runtimes recusam (`INSUFFICIENT_EVIDENCE`) efeito aprovado sem porta de execução de uso único; fixture em memória ganhou porta single-use real.                                                                                      |
| ENG-003 | `DONE_LOCAL` | `signal?: AbortSignal` opcional em `ModelRequest` e `IterativeOrchestratorInput`; runtimes abortam no prazo; `HybridOrchestrator` repassa o sinal e não repara após cancelamento.                                                            |
| ENG-004 | `DONE_LOCAL` | Exposição de ferramentas negada por padrão: lista vazia não expõe nada; `'*'` (`ALL_AGENT_TOOLS`) expõe o registry. O iterativo também filtra as capacidades mostradas ao orquestrador.                                                      |
| ENG-005 | Codex        | Recepção limitada em frente GREEN/D011 aprovada e ativa do Codex.                                                                                                                                                                            |
| ENG-006 | `DONE_LOCAL` | `fastify` 5.12.5, `fast-uri` 3.1.8/4.2.1, `undici` 7.30.0, `brace-expansion` 5.0.12; `npm audit` sem vulnerabilidades.                                                                                                                       |
| ENG-007 | `DECISION`   | Mantidas as duas pilhas: `packages/harness` (single-pass/iterativo, composição pública) e `packages/agent-runtime` (kernel governado durável do worker). Consolidar exige SPEC própria após a extração do Codex em `agent-runtime` assentar. |
| ENG-008 | `DONE_LOCAL` | Auditoria do iterativo sempre fail-closed, com a mesma janela mínima do single-pass.                                                                                                                                                         |
| ENG-009 | `DEFERRED`   | Os `.js` em `src` são gitignored e todos os imports usam extensão `.ts` explícita; sem risco de sombra observado. Limpeza fica para a frente de tooling.                                                                                     |
| ENG-010 | `DONE_LOCAL` | Orquestrador: tipo de decisão fora do permitido entra no ciclo de reparo; 7 testes de contrato novos (de 6 para 13).                                                                                                                         |
| ENG-011 | `PARTIAL`    | Suíte completa e pilha real com PostgreSQL nesta rodada; CI por artefato (HISO-010) e jornada neutra limpa (HISO-014) seguem no 0370.                                                                                                        |
| ENG-012 | `DONE_LOCAL` | Replay de aprovação executada só depois de todas as checagens de vínculo; outro recurso/agente/classificação é negado.                                                                                                                       |
| ENG-013 | `DONE_LOCAL` | Worker `kernel` grava cada registro do ledger do turno em `audit_events` (ledgerId, sequência, hashes); falha propaga e o replay idempotente regrava. Histórico em memória limitado a 1.000 itens; ledger rotaciona em 10.000.               |
| ENG-014 | Codex        | Bootstrap de sessão (`main.ts` + `production-bootstrap.ts`) em frente aprovada do Codex.                                                                                                                                                     |
| ENG-015 | `DONE_LOCAL` | Worker PostgreSQL roda em `production` só com `CVG_WORKER_PRODUCTION_ENABLED=true`, modo contínuo e runtime `kernel`; RLS e modo controlado continuam obrigatórios; memória/homolog seguem proibidos.                                        |
| ENG-016 | `DONE_LOCAL` | `NonRetryableOutboxError`: envelope inválido e evento sem identificadores vão direto para dead-letter (requeue manual continua possível).                                                                                                    |
| ENG-017 | `DONE_LOCAL` | `status`/`runtimeStatus`/`reason` do outbox visíveis só para o vocabulário fechado de desfechos e códigos do runtime; texto livre continua mascarado.                                                                                        |
| ENG-018 | `DONE_LOCAL` | `OPENAI_API_KEY` opcional (placeholder configurado continua recusado em produção); recusa de cliente (4xx) logada como `warn`, falha de servidor como `error`.                                                                               |

### Validação real após a correção — 04/10/2026

Banco limpo `cvg_live` (PostgreSQL 16 descartável, papéis de migração e
runtime separados, RLS), API e worker com `NODE_ENV=production`, sem
`OPENAI_API_KEY`:

- Worker em produção sem opt-in: recusado
  (`production_controlled_worker_forbidden`); com opt-in + contínuo + `kernel`:
  preflight aprovado e pronto.
- Envelope inválido: dead-letter na 1ª tentativa. Leitura: `completed`
  visível no banco. Escrita: `approval_required` → aprovação por supervisor →
  `completed`, 1 efeito `CONFIRMED`, aprovação `EXECUTED`.
- Mesma aprovação no `draft-2`: `denied / resource_mismatch`. Replay no
  `draft-1`: idempotente, journal continua com 1 efeito.
- Auditoria do motor durável em `audit_events`; cadeia verificada por SQL: 0
  elos quebrados, gênese correta. Webhook com assinatura falsa: 401 logado como
  `warn`.
- Achado e corrigido durante a validação: o sanitizador de auditoria tratava o
  hash de gênese (64 zeros) como telefone. Hashes passaram a ser gravados como
  `sha256-<hex>`, formato preservado byte a byte (teste próprio).

Mudanças visíveis para consumidores: perfis de agente precisam listar as
ferramentas (ou `'*'`); composições com aprovação precisam da porta de execução
(todos os hosts atuais já usam `DurableApprovalEngineAdapter`); o worker em
produção exige o opt-in acima.

## Baseline medida em 04/10/2026

- Node 22.23.2, worktree sujo com trabalho do Codex (HARNESS-ISO e extração
  não commitada de `packages/agent-runtime/src/runtime.ts`).
- Typecheck raiz PASS. Pacotes do motor: 52 arquivos / 700 testes PASS.
- Motor + consumidores (`harness`, `agent-runtime`, `orchestrator`,
  `conversation`, `persistence`, `apps/worker`, `apps/api`) após ENG-001:
  147 arquivos / 1.168 PASS, 170 testes SKIP por exigirem PostgreSQL (não
  executados nesta rodada).
- `npm audit --omit=dev`: 1 HIGH (`fast-uri`), 1 MODERATE (`fastify <5.12.5`).

## Execução real local — 04/10/2026

Pilha subida do checkout atual (Node 22.23.2), dados sintéticos, só loopback,
PostgreSQL 16.15 descartável próprio (removido ao final). Banco provisionado como
produção: papel de migração dono do schema, papel de runtime sem
SUPERUSER/BYPASSRLS, migrations aplicadas pelo papel de migração, RLS ligado.

- Suíte com PostgreSQL real (`TEST_DATABASE_URL`): motor + consumidores
  165 arquivos / 1.337 PASS / 1 SKIP; worker durável homolog
  (`AUD19_PG_REQUIRED=1`) 3/3 PASS.
- API com `NODE_ENV=production`, identidade `trusted`, keyrings aleatórios,
  HTTPS via proxy confiável: `/live` e `/ready` 200 (processo, pool, inbound
  durável, banco); HTTP puro 426. Webhook: assinado 200; replay, assinatura
  falsa, timestamp velho/futuro e sem cabeçalhos 401; replay continua 401
  **após reiniciar a API** (anti-replay durável no PostgreSQL). Shutdown por
  SIGTERM gracioso. Papel de runtime sem contexto de tenant vê 0 linhas (RLS).
- Worker contínuo `kernel` (em `development`; ver ENG-015) consumiu o inbox
  real: leitura executada; escritas fora da política negadas.
- Ciclo de aprovação contra PostgreSQL (runtime `kernel`, mesma composição do
  worker, em processo): pedido → `approval_required` gravado; autoaprovação
  recusada; aprovação por outro operador; execução única com 1 linha no
  effect journal; reuso sem efeito duplicado, inclusive por nova instância.
  Falha: ENG-012.

## ENG-012 — Aprovação consumida aceita outro recurso e responde `executed`

- Estado: `TODO`. Prioridade: P1. Risco/gate: T3 (governança de aprovação).
  Arquivo: `packages/agent-runtime/src/runtime.ts` — **com alterações não
  commitadas do Codex**; não editado nesta rodada.
- Reproduzido: aprovação de `record.update` em `record_draft/draft-1`,
  executada; o mesmo `approvalId` apresentado com `draft-2` retorna
  `outcome: executed` sem nenhum efeito em `draft-2` (journal continua com 1
  linha). Falso sucesso sobre recurso nunca aprovado.
- Causa: o desvio `record.status === 'EXECUTED'` → `replayConfirmedEffect`
  roda antes das checagens `action_mismatch`/`resource_mismatch`/
  `proposal_mismatch` (HEAD: linha 1106 antes de 1124/1131). Existe no HEAD.
- Correção proposta: validar vínculo (tenant, ação, recurso, agente,
  capability, classificação) antes de qualquer replay; teste com PostgreSQL.
  Roteiro de reprodução preservado pelo executor (script sintético).

## ENG-013 — Auditoria e telemetria do worker `kernel` só em memória

- Estado: `TODO`. Prioridade: P1. Risco/gate: T3.
- `createPostgresKernelRuntime` (apps/worker) usa `HashChainedAuditLedger` e
  `InMemoryTelemetry`: decisões de política/aprovação/execução do motor se
  perdem ao reiniciar o processo. Exigir ledger de auditoria durável.

## ENG-014 — Host API em modo `trusted` responde 503 em toda rota protegida

- Estado: `TODO` (frente bootstrap do Codex: `main.ts` +
  `production-bootstrap.ts`). Prioridade: P1.
- `main.ts` não compõe o store de sessão de operador; com
  `CVG_IDENTITY_MODE=trusted` (obrigatório em produção) toda rota protegida
  devolve `503 configuration_error: Operator session store is required`.
  Falha fechada, mas o host não atende operadores.

## ENG-015 — Worker recusa `NODE_ENV=production`

- Estado: `TODO` / decisão humana. Gate deliberado
  (`production_controlled_worker_forbidden`): o motor não processa nada em
  perfil de produção até a liberação dos gates externos.

## ENG-016 — Erro permanente reprocessado até dead-letter

- Estado: `TODO`. Prioridade: P2. Risco/gate: T2.
- Envelope inválido (`kernel_turn_envelope_invalid`) é erro determinístico,
  mas é tentado 5 vezes (~18 s) antes de dead-letter. Classificar erros de
  validação como não-retentáveis.

## ENG-017 — Desfecho de governança invisível para operação

- Estado: `TODO`. Prioridade: P2.
- Em log, `outbox_effects` e `audit_events` o `status`/`runtimeStatus`/`reason`
  ficam `[redacted-outbox-text]`. Os enums de desfecho (`executed`,
  `approval_required`, `denied`, código do motivo) não são dado sensível e
  deveriam ser observáveis para alertas e suporte.

## ENG-018 — Ajustes menores de produção

- Estado: `TODO`. P3. Produção exige `OPENAI_API_KEY` mesmo sem provider de
  modelo (acoplamento indevido no núcleo neutro); replay de webhook recusado é
  logado como `error` (ruído); em `development` o anti-replay fica em memória
  (por desenho, documentar).

## ENG-001 — Ciclo de vida de aprovação e auditoria sob prazo esgotado

- Estado: `DONE_LOCAL` (sem commit). Risco/gate: T2 — restabelece invariantes já
  documentados, sem mudar contrato público.
- Defeitos corrigidos:
  1. Single-pass e iterativo: com a reserva de aprovação já feita (`begin`), se
     o prazo esgotava antes de a ferramenta começar, a execução parava sem
     `fail`, deixando a aprovação presa. Agora a reserva é liberada com
     `evidenceRef …:tool_not_started`; no iterativo, o passo TOOL que ficava
     `RUNNING` passa a `FAILED/deadline`.
  2. Single-pass: quando o orçamento esgotava durante um efeito bem-sucedido, a
     auditoria era pulada (o runtime só auditava com tempo restante > 0) e o
     resultado virava `INSUFFICIENT_EVIDENCE`, sem registro do efeito. Agora a
     auditoria tem janela mínima própria de 200 ms, como o iterativo já tinha;
     se mesmo assim falhar, o resultado continua `INSUFFICIENT_EVIDENCE`.
- Mudança visível: orçamento `maxDurationMs: 0` agora é auditado e retorna
  `MAX_DURATION` (antes: “audit recording failed”). A asserção antiga em
  `runtime.test.ts` foi atualizada.
- Evidência: `packages/harness/src/__tests__/engine-prod-lifecycle.test.ts`,
  três casos que falham no código anterior e passam no corrigido.

## ENG-002 — Aprovação de uso único sem porta de execução

- Estado: `TODO`. Risco/gate: T3 (política de aprovação).
- Problema: `ApprovalEngine.execution` é opcional. Sem ela, os dois runtimes
  executam a ferramenta com uma aprovação `APPROVED` sem consumi-la, e a mesma
  aprovação pode ser reapresentada. Contraria o aceite de HISO-013 (“approval…
  de uso único”).
- Proposta: `createOperationalHarness` recusa composição sem porta de execução,
  salvo opção explícita só para fixtures; runtimes falham fechados quando a
  aprovação exigida não puder ser consumida.

## ENG-003 — Cancelamento real da chamada de modelo no prazo

- Estado: `TODO`. Risco/gate: T3 (contrato público `ModelRequest`).
- Problema: `ModelRequest` não tem `signal`. Quando o prazo vence, o runtime
  devolve `MAX_DURATION`, mas a requisição ao provider continua em curso,
  consumindo conexão e custo.
- Proposta: `signal?: AbortSignal` opcional em `ModelRequest`, propagado por
  gateway e providers; teste de cancelamento efetivo.

## ENG-004 — Allowlist de ferramentas vazia libera todas

- Estado: `TODO`. Risco/gate: T3 (política).
- Problema: `agent.tools = []` expõe todas as ferramentas do registry nos dois
  runtimes (fail-open).
- Proposta: negação por padrão em perfis de produção, com opção explícita para
  perfis de compatibilidade e testes.

## ENG-005 — Limite de bytes durante a recepção do modelo

- Ponteiro: HISO-011 / [SPEC 0175](../02_spec/0175_stream_response_receive_limit.md),
  `HUMAN_T3_PENDING`. Confirmado em 04/10/2026: `openai-compatible.ts` e
  `ollama.ts` ainda fazem `response.text()` e só depois verificam o tamanho.

## ENG-006 — Advisories de dependências

- Ponteiro: HISO-012. `fast-uri` (HIGH) e `fastify` (MODERATE) com correção
  disponível; exige claim exclusivo do lockfile.

## ENG-007 — Duas pilhas de execução e de effect journal

- Estado: `TODO`. Risco/gate: T1 para decisão; T2/T3 para consolidar.
- Problema: `packages/harness` (single-pass/iterativo/execution-spine, journal
  próprio) e `packages/agent-runtime` (runtime de turnos, journal e recovery
  próprios, usado pelo worker e pela persistência PostgreSQL) coexistem com
  conceitos duplicados. Para produção é preciso definir qual é canônico e qual
  fronteira cada host usa.
- Dependência: a extração do Codex em `packages/agent-runtime` (SPECs
  0165/0171/0172, ainda não commitada) deve assentar antes.

## ENG-008 — Auditoria inconsistente entre runtimes

- Estado: `TODO`. Risco/gate: T3.
- Problema: no iterativo, quando a parada é por orçamento e a auditoria falha,
  o resultado é devolvido sem marcação; no single-pass, vira
  `INSUFFICIENT_EVIDENCE`. Alinhar à regra fail-closed.

## ENG-009 — Artefatos compilados dentro de `src`

- Estado: `TODO`. Risco/gate: T2 (tooling).
- Problema: 232 arquivos `.js`/`.d.ts`/`.js.map` gitignored em
  `packages/*/src`, gerados por builds antigos. Uma resolução de módulo que
  prefira `.js` pode carregar código obsoleto.
- Proposta: limpar, fixar `outDir` fora de `src` e adicionar checagem.

## ENG-010 — Orquestrador com cobertura mínima

- Estado: `TODO`. Risco/gate: T2.
- Problema: `packages/orchestrator` tem 383 linhas e um arquivo de teste; o
  `HybridOrchestrator` é a peça que decide o próximo passo em produção.
- Proposta: testes de contrato para entradas hostis/malformadas e limites de
  reparo de decisão.

## ENG-011 — Prova de produção do motor neutro

- Ponteiros: HISO-010 (CI por artefato), HISO-013 (regressão governada com
  PostgreSQL), HISO-014 (jornada neutra limpa). Os 170 testes PostgreSQL
  precisam rodar no SHA final.
