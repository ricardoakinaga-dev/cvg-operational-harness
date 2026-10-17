# 0375 — Plano de pareamento com o motor DeepSeek Harness (roadmap e backlog)

- Data: 11/10/2026. Task: `PARE-DSH-20261011` (OpenCode). Gate: T1.
- Pedido do usuário: criar plano com roadmap e backlog e executar o planejamento
  sobre sete pontos de convergência com o motor
  [DeepSeek Harness](https://github.com/ricardoakinaga-dev/deepseek-harness)
  (`dsh` 0.2.1-alpha.2, MIT, "everything is a plugin" sobre Cordis).
- Direção que manda neste plano: [ADR-011](../architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md)
  (kernel de plugins por padrão copiado do dsh, **código nunca copiado**) e
  [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md)
  (motor reutilizável, produtos isolados).
- Relação com planos existentes: o [0372](0372_kernel_plugins_roadmap.md)
  continua sendo o roteiro do kernel e é a Onda 1 deste plano; o
  [0371](0371_engine_production_backlog.md) e o
  [0370](0370_harness_product_isolation_backlog.md) seguem com seus cartões —
  este plano **não duplica cartões**, cria os cartões `PDSH-*` faltantes e
  aponta os existentes. O [0374](0374_plano_producao_harness.md) (produção,
  Fase C) permanece independente e **não é bloqueado nem autorizado por este
  plano**.
- Produção: `NO_GO`. Nada aqui autoriza dado real, provider externo, canal,
  push, deploy ou release. A ordem dos cartões é obrigatória; cada passo
  termina com a suíte do motor e a suíte de conformidade verdes.

## 1. Contexto — de onde partimos

Análise de pareamento de 11/10/2026 (repositório local em `4dfbb1d` × clone
profundo do fork `deepseek-harness`), com produção em `NO_GO` e o motor em
transição L3 → L4 (motor isolado com API pública → kernel de plugins único).

| #   | Dimensão                                  | Baseline | Meta deste plano    |
| --- | ----------------------------------------- | -------- | ------------------- |
| 1   | Filosofia de composição                   | 50       | 75                  |
| 2   | Pipeline único de execução                | 40       | 85                  |
| 3   | Controles (policy/approval/journal/audit) | 75       | 85                  |
| 4   | Sessão / estado / persistência            | 45       | 70                  |
| 5   | Camada de modelo                          | 70       | 80                  |
| 6   | Ferramentas / execução real               | 25       | 60                  |
| 7   | SDK / API para integradores               | 35       | 65                  |
| 8   | UI / apps                                 | 30       | 30 (fora de escopo) |
| 9   | Engenharia (testes, gates, docs)          | 65       | 85                  |
| 10  | Segurança / sandbox / supply-chain        | 40       | 70                  |
|     | **Pareamento ponderado**                  | **~50**  | **~70**             |

Os sete pontos pedidos pelo usuário cobrem as dimensões 1, 2, 4, 5, 6, 7, 9 e
parte da 10. A dimensão 8 (UI) fica fora: o dsh investe em client web de 63
pacotes e desktop Electron; o CVG mantém um console pequeno e isso é decisão
consciente de escopo.

### Diagnóstico condensado do baseline

1. **Motor fragmentado (maior desvio).** O pipeline de governança está
   escrito à mão em três runtimes: `packages/harness/src/runtime.ts` virou
   fachada de 52 linhas sobre o kernel, mas `packages/harness/src/iterative-runtime.ts`
   (1.684 linhas) + `iterative-dispatch.ts` (1.141) e
   `packages/agent-runtime/src/runtime.ts` (1.630) ainda carregam spines
   próprios. KPLG-004 (Parte B, `GovernedAgentRuntime` sobre o pipeline do
   kernel) está `IN_PROGRESS`; o [0372](0372_kernel_plugins_roadmap.md) já
   mapeia esse trabalho.
2. **Sem runtime de ferramentas real.** Não existe seam de sandbox nem tools
   de fs/shell de produção; capabilities são majoritariamente sintéticas.
   Agentes hospitalares de upload/baixa de exames e tarefas de arquivo não
   têm como ser construídos com contenção hoje.
3. **Sem catálogo de skills/ferramentas.** `SkillDefinition` (ADR-003) existe
   só em `packages/contracts`; não há carregador, manifesto nem catálogo
   gerado com drift-check (o dsh publica `tool-catalog` e
   `capability-seams` gerados).
4. **Sem formato de eventos de sessão.** A persistência é repositórios e
   outbox em PostgreSQL com migrações SQL; não há log append-only de sessão,
   vocabulário de eventos versionado nem catálogo com fingerprints SHA-256
   (o dsh tem `SESSION_FORMAT_VERSION = 4`, migrações adjacentes imutáveis e
   catálogo com fingerprints).
5. **Sem SDK de integrador.** O consumo é HTTP API + exports de workspace
   (`PUBLIC_API.md`); não há protocolo de agente out-of-process (o dsh tem
   SDK JSON-RPC TS/Python e perfil `sdk-minimal`).
6. **Sem compactação/pruning nem token meter.** Budgets existem
   (`packages/model-gateway/src/budget.ts`), mas não há medição de tokens por
   request/turno nem controle de compactação para conversas longas de plantão.
7. **Barra de coverage e snapshots abaixo do dsh.** Thresholds 90/85/90/90
   (não 100% per-file), exclusões amplas, e não há infra de snapshot tests com
   replay determinístico (o dsh roda 227 cenários de snapshot com replay de
   sessão gravada).

## 2. Princípios e invariantes do plano

1. **Padrão do dsh, código do CVG.** MIT permite copiar; a ADR-011 optou por
   copiar o padrão (serviços por chave, dependência declarada, registro
   reversível, eventos tipados, guardas monôtonas). Nenhum arquivo do dsh é
   importado, vendorizado ou adaptado. Sempre que este plano cita o dsh é
   como referência de desenho, não como dependência.
2. **Um só pipeline.** Depois da Onda 1, qualquer controle novo entra por um
   único ponto de interceptação; criar uma segunda cópia do spine é regressão
   arquitetural com teste próprio.
3. **Controles obrigatórios e fail-closed.** Invariantes da ADR-011: o kernel
   não inicia sem os controles do perfil; controles não são descarregados nem
   reordenados; aprovação é de uso único; efeito aprovado sem porta de
   execução é `INSUFFICIENT_EVIDENCE`.
4. **Ordem do pipeline CVG.** Todo cartão T3 deste plano depende de SPEC
   curta revisada pelo usuário antes do BUILD (regra de transição da
   constituição). Este documento é o plano (fase de direção); não é a SPEC.
5. **Sem regressão de produto.** Os 37 testes do Assistente de Plantão, a
   barra 0368 e o isolamento da ADR-010 permanecem; o núcleo nunca importa
   `products/**` (gate `boundary:products`).
6. **Sem liberar produção.** Os gates da Fase C do 0374 continuam sendo a
   única porta para GO. Este plano eleva a qualidade do motor em dev/teste
   sintético.
7. **Sandbox é contenção de engenharia, não parede de segurança única.**
   O dsh é explícito no SAFETY.md: sandbox reduz risco, não garante
   isolamento. O CVG mantém em produção as camadas que já tem (distroless,
   non-root, RLS, egress controlado, aprovação) e o sandbox é camada adicional.

## 3. Roadmap — quatro ondas

Onda ≈ 3–5 sprints de trabalho focado (mesma unidade do plano 0374). As ondas
têm dependência obrigatória na ordem: o kernel único (Onda 1) é o pré-requisito
dos pontos de interceptação que ferramentas, sessão e compactação usam. A
auditoria de coverage (PDSH-030) pode começar em paralelo desde o dia 1.

```text
Onda 1 — Motor único (W1)          Marcos: MP1
        │  fecha ENG-007 / KPLG-004 Parte B
        ▼
Onda 2 — Ferramentas com contenção (W2)   Marcos: MP2
        │  seam sandbox + fs/shell + catálogo
        ▼
Onda 3 — Sessão, SDK e contexto (W3)      Marcos: MP3
        │  formato de sessão + SDK + compactação
        ▼
Onda 4 — Barra de qualidade (W4)          Marcos: MP4
         100% per-file no núcleo + snapshots + CI
```

| Onda | Foco                                                  | Cartões       | Sprints | Marco | Critério de saída da onda                                                                                     |
| ---- | ----------------------------------------------------- | ------------- | ------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| W1   | Fechar o kernel único (ponto 1)                       | PDSH-001..004 | 3–5     | MP1   | Uma única implementação do pipeline; conformidade I1–I12 100% nos três perfis; uma policy engine              |
| W2   | Runtime de ferramentas real + catálogo (pontos 2 e 3) | PDSH-010..016 | 4–6     | MP2   | fs/shell sandboxadas com journal e aprovação; catálogo gerado com drift-check verde                           |
| W3   | Sessão versionada, SDK e contexto (pontos 4, 5 e 6)   | PDSH-020..026 | 4–6     | MP3   | Log de sessão append-only com fingerprints; SDK JSON-RPC com consumidor de exemplo; token meter + compactação |
| W4   | Barra de qualidade (ponto 7)                          | PDSH-030..033 | 2–3     | MP4   | 100% per-file justificado no núcleo; snapshots com replay; gates novos no CI bar                              |

### Marcos de verificação

| Marco | Quando        | Pareamento esperado | O que o usuário recebe                                                      |
| ----- | ------------- | ------------------- | --------------------------------------------------------------------------- |
| MP1   | fim da Onda 1 | ~56                 | Motor com um só spine; risco de defeito duplicado eliminado                 |
| MP2   | fim da Onda 2 | ~62                 | Agentes podem ler/escrever arquivos de exame com contenção e auditoria      |
| MP3   | fim da Onda 3 | ~68                 | Conversas longas de plantão sobrevivem; produtos consomem o motor por SDK   |
| MP4   | fim da Onda 4 | ~70                 | Barra de qualidade comparável ao dsh no núcleo; evidência para o próximo GO |

## 4. Backlog — cartões `PDSH-*`

Estados: `TODO` (nenhum iniciado nesta rodada), `IN_PROGRESS`, `DONE_LOCAL`,
`DONE`, `BLOCKED`, `DEFERRED`. Trilha (constituição, governança proporcional):
T2 = refatoração sem mudança de contrato público; T3 = contrato público,
schema/migration, segurança, identidade, policy ou approval (exige SPEC
revisada pelo usuário antes do BUILD).

### Onda 1 — Motor único de execução

| ID        | Estado | Trilha | O que                                                                                                                                        | Onde (existente)                                                                                                                        | Dependências                                               |
| --------- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| PDSH-001  | DONE   | T3     | Unificar `GovernedAgentRuntime` no pipeline do kernel (fecha KPLG-004 Parte B e ENG-007)                                                     | `packages/agent-runtime/src/runtime.ts`, `runtime-effect-recovery.ts`, `runtime-execution-context.ts`, `packages/harness/src/kernel/**` | Coordenação com Codex (extração já commitada em `4dfbb1d`) |
| PDSH-002  | DONE   | T3     | Consolidar `packages/policy` e `packages/policy-engine` em uma engine; a segunda vira perfil/referência                                      | `packages/policy/**`, `packages/policy-engine/**`, ADRs, `PUBLIC_API.md`                                                                | PDSH-001                                                   |
| PDSH-003  | DONE   | T2     | Reubicar `agent-core` como comandos/perfis sobre o kernel, ou justificar manutenção por SPEC                                                 | `packages/agent-core/**`                                                                                                                | PDSH-001                                                   |
| PDSH-004  | DONE   | T2     | Checagem única de orçamento no ponto "antes do modelo"; remover as ~20 duplicações do single-pass                                            | `packages/harness/**` (spine), `packages/model-gateway/src/budget.ts`                                                                   | PDSH-001                                                   |
| PDSH-003b | TODO   | T3     | Unificar o `CONTROLLED_RUNTIME` (`executeConfiguredAgent`, platform/test-lab) com o kernel governado, ou justificar perfil distinto por SPEC | `packages/platform/src/test-lab.ts`, `packages/agent-core/src/commands/execute-published-agent.ts`, `packages/harness/src/kernel/**`    | PDSH-003 (SPEC 0194); SPEC 0195 antes do BUILD             |

**Critérios de pronto da Onda 1 (MP1):**

- PDSH-001: os três perfis (`single_pass`, `iterativo`, kernel durável do
  worker) executam o mesmo `kernel/pipeline.ts`; suíte de conformidade
  `tests/conformance/**` 100% PASS (hoje 51 PASS + lacunas fechadas); teste
  arquitetural novo que falha se surgir uma segunda cópina do spine de
  governança; suíte do motor e `test:postgres` verdes.
- PDSH-002: um único `PolicyEngine` exportado; ADR-005 intacta; `PUBLIC_API.md`
  atualizado no mesmo commit; nenhum import quebrado em `apps/**` e
  `products/**`. **Cerrado (11/10/2026)** — motor canônico `@cvg/policy-engine`
  (`class PolicyEngine`); `@cvg/policy` vira camada legada de
  autonomia/approval do `agent-core` (semântica intocada, fail-closed);
  `PUBLIC_API.md` L29/L153/L163 atualizado; ADR-005 intacta; artefatos
  órfãos de `src/` (`.d.ts`/`.js` dos antigos `capabilities`/`grants`) e
  `index.d.ts` sombreado do `agent-runtime` removidos; SPEC
  [0193](../02_spec/0193_pdsh002_policy_engine_consolidation.md). Verdes:
  45 files / 608 tests; prettier; lint; `tsc`; `docs:check-links`.
- PDSH-003: `agent-core` sem pipeline próprio; comandos do worker passam pelo
  kernel. **Cerrado (11/10/2026)** — `@cvg/agent-core` investigado e confirmado
  como camada de comandos/queries (sem loop, orçamento, dispatch ou gate
  próprios); o único "turno" próprio (`run-agent-turn.ts`) é fachada legada,
  agora `@deprecated` e fora de produção; o caminho publicado
  (`executePublishedAgent`) delega ao `CONTROLLED_RUNTIME` do `@cvg/platform`
  (pipeline distinto do kernel governado). Justificativa de manutenção +
  escopo do remanescente em SPEC
  [0194](../02_spec/0194_pdsh003_agent_core_relocation.md). Unificação do
  `CONTROLLED_RUNTIME` com o kernel governado registrado como **PDSH-003b
  (SPEC 0195)**, fora desta onda. Verdes: `vitest packages/agent-core
packages/agent-runtime packages/harness tests/conformance
tests/architecture` PASS; prettier; lint; `tsc`; `docs:check-links`.
- PDSH-004: uma só chamada de orçamento por turno, com guarda de regressão
  (teste que falha ao reintroduzir checagem no loop).

### Onda 2 — Ferramentas reais com contenção (fs/shell sandboxadas)

| ID       | Estado     | Trilha | O que                                                                                                     | Onde (novo/existente)                                                                                     | Dependências                 |
| -------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| PDSH-010 | DONE       | T3     | Seam de sandbox (SPEC curta antes do BUILD): modo, enforcement, fail-closed                               | novo `packages/sandbox/**` (ou módulo em `packages/harness`), contratos em `packages/contracts`           | PDSH-001                     |
| PDSH-011 | DONE       | T3     | Sandbox local Linux: bubblewrap + Landlock; fallback `partial` explícito quando indisponível              | `packages/sandbox/**`, `Dockerfile`, CI                                                                   | PDSH-010                     |
| PDSH-012 | DONE       | T3     | Tool `fs` (leitura livre em workspace do tenant; escrita/edit com gate de intenção, journal e auditoria)  | `packages/sandbox` + capabilities em `packages/harness`, journal existente                                | PDSH-010, PDSH-011           |
| PDSH-013 | DONE       | T3     | Tool `shell` limitada (sem shell de login, sem interporlação, timeout, política por perfil, aprovação)    | idem; política no perfil do agente                                                                        | PDSH-011                     |
| PDSH-014 | DONE       | T2     | Catálogo gerado de ferramentas e skills com drift-check (padrão dsh `tool-catalog`)                       | `scripts/gen-tool-catalog.mjs`, `docs/architecture/TOOL_CATALOG.md`, gate no `verify` e no CI bar         | PDSH-012, PDSH-013, PDSH-015 |
| PDSH-015 | DONE       | T2     | Skills filesystem versionadas: manifesto, carregador e registro (implementa `SkillDefinition` da ADR-003) | novo diretório `skills/` (ex.: `skills/exam-intake/`), carregador em `packages/harness` ou pacote próprio | PDSH-001                     |
| PDSH-016 | DONE_LOCAL | T3     | Egress de exames: upload/download de arquivos por canal aprovado, com SSRF, aprovação e journal           | `packages/channel-gateway/**` (SSRF e journal já existem), `packages/shared/src/ssrf.ts`                  | PDSH-012                     |

**Critérios de pronto da Onda 2 (MP2):**

**Checkpoint local MP2 — 12/10/2026:** 010..015 DONE e 016 DONE_LOCAL;
[SPEC 0201](../02_spec/0201_pdsh016_exam_egress.md) e
[evidência](../04_audit/evidence/PDSH-016-20261012/summary.md).
376 arquivos/3180 PASS (1 skip) com PG próprio; `test:postgres` 37/302 PASS
zero skips; fronteira, typecheck, lint, formato e catálogo local verdes.
Catálogo agora lista 7 ferramentas. Fix de compatibilidade PDSH-001 comprovado
no PG; BLOCKED histórico de PG foi superado nesta rodada. MP2 é construção
local, sem certificação/release: gates de catálogo no CI ainda pertencem a
PDSH-033, Dockerfile sandbox continua diferido de PDSH-011 e HISO-005 depende
de aceite independente. Corrigido drift da linha PDSH-010 (TODO antigo).

- Modos de sandbox fechados por perfil (leitura / workspace do tenant /
  proibido); sem modo `full-access` em produção; enforcement relatado
  (`full`/`partial`) e **fail-closed** quando `partial` é exigido pelo perfil.
- fs/shell só operam sob workspace por tenant; escrita fora do workspace negada
  por construção; cada escrita gera intenção no journal e evento de auditoria.
- Catálogo gerado por script, verificado no CI (`--check`), com a tabela de
  capabilities e skills que existem de fato no registro.
- Testes negativos: escape de path (`../`), symlink para fora do workspace,
  comando com rede negado, aprovação expirada, journal cheio.

### Onda 3 — Sessão versionada, SDK e contexto

| ID       | Estado     | Trilha | O que                                                                                                      | Onde (novo/existente)                                                                                                                                            | Dependências       |
| -------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| PDSH-020 | DONE       | T3     | SPEC do formato de eventos de sessão: envelope, vocabulário fechado, imutabilidade, versão, RLS            | SPEC [0202](../02_spec/0202_pdsh020_session_event_format.md); vocabulário derivado do pipeline unificado                                                         | PDSH-001           |
| PDSH-021 | DONE_LOCAL | T3     | Store append-only `session_events` (seq monotônica, RLS por tenant) + catálogo com fingerprints SHA-256    | migração0028 opt-in em schema dedicado, store em `packages/persistence`, `scripts/gen-session-catalog.mjs` e adapter KernelLog                                   | PDSH-020           |
| PDSH-022 | DONE_LOCAL | T3     | Migrações adjacentes de formato de sessão (vN→vN+1 imutáveis, gerações nunca renomeadas)                   | `packages/harness/src/session/format-migration.ts` (registry neutro), SPEC [0203](../02_spec/0203_pdsh022_session_format_evolution.md); runbook na SPEC          | PDSH-021           |
| PDSH-023 | DONE_LOCAL | T3     | SDK de integrador: JSON-RPC versionado, cliente TS, composições `sdk`/`sdk-minimal`, exemplo de consumidor | novo `packages/sdk/**` (`@cvg/sdk`), SPEC [0204](../02_spec/0204_pdsh023_sdk.md), `PUBLIC_API.md`, `examples/consumers/sdk-session/**`                           | PDSH-001           |
| PDSH-024 | DONE_LOCAL | T2     | Token meter no model-gateway: prompt/completion por request e agregado por turno, exposto no resultado     | `packages/model-gateway/src/token-meter.ts`, SPEC [0205](../02_spec/0205_pdsh024_token_meter.md), evento/`Result` aditivos                                       | nenhuma            |
| PDSH-025 | DONE_LOCAL | T3     | Compactação/pruning de contexto: plugin de controle no ponto "antes do modelo", determinístico e testável  | `packages/harness/src/compaction.ts`, SPEC [0206](../02_spec/0206_pdsh025_compaction.md); `context/compacted` no log de sessão (021)                             | PDSH-020, PDSH-024 |
| PDSH-026 | DEFERRED   | T3     | Assistente de Plantão sobre sessão + compactação (conversas longas de plantão)                             | `products/shift-assistant/**` (cartões PISO, coordenar com o Codex) — **diferido**: produto é consumidor isolado (ADR-010), sem coordenação do dono nesta sessão | PDSH-021, PDSH-025 |

**Critérios de pronto da Onda 3 (MP3):**

Checkpoint026 — 12/10/2026: PDSH-026 `DEFERRED` com razão registrada.
`products/shift-assistant/**` pertence ao consumidor isolado (ADR-010) e o
plano já previa coordenação com o dono do produto (Codex); não há claim do
dono nesta sessão e a Constituição proíbe tocar `products/**` sem isso.
Cartão não é executado nem aceito por inércia: deve voltar como tarefa do
produto (conversas longas de plantão sobre a sessão/compactação do harness)
quando o dono registrar claim. Nenhuma outra pendência da Onda 3 fica aberta.
Checkpoint025 — 12/10/2026: PDSH-025 DONE_LOCAL; compactação determinística no
`model/before-call` (engine puro, resumo com digest canônico, controle com
fail-closed de auditoria) e evento `context/compacted` validado pelo catálogo
no store de sessão. [SPEC0206](../02_spec/0206_pdsh025_compaction.md),
[evidência](../04_audit/evidence/PDSH-025-20261012/summary.md). Node22:
385 arquivos/3261 PASS +1 skip; PG37/302 e +sessão38/311 sem skips; E2E12/12;
fronteira/types/lint/formato/catálogos PASS. Próximo026 (produto, coordenar)
e W4.
Checkpoint024 — 12/10/2026: PDSH-024 DONE_LOCAL (T2 aditivo); `TokenMeter`
com snapshot congelado, meter opcional no gateway, tokens no
`model.call.completed` e guarda `provider_malformed_response` para usage
inválida. [SPEC0205](../02_spec/0205_pdsh024_token_meter.md),
[evidência](../04_audit/evidence/PDSH-024-20261012/summary.md). Node22:
384 arquivos/3252 PASS +1 skip; PG37/302 e +sessão38/311 sem skips; E2E12/12;
fronteira/types/lint/formato/catálogos PASS. Próximo025 (compactação), depois026.
Checkpoint023 — 12/10/2026: PDSH-023 DONE_LOCAL; `@cvg/sdk` com JSON-RPC
v1 (`sdk.hello`/`session.open`/`turn.send`/`session.events`), servidor
fail-closed, cliente TS e composições completa/mínima; exemplo neutro por
exports públicos. [SPEC0204](../02_spec/0204_pdsh023_sdk.md),
[evidência](../04_audit/evidence/PDSH-023-20261012/summary.md). Node22:
383 arquivos/3245 PASS +1 skip; PG37/302 e +sessão38/311 sem skips; E2E12/12;
fronteira/types/lint/formato/catálogos PASS. Sem transporte de rede nem
provider real; próximo024 (token meter), depois025/026.
Checkpoint022 — 12/10/2026: PDSH-022 DONE_LOCAL; registry boot-validado de
passos adjacentes vN→vN+1, migração como visão derivada (origem nunca mutada),
definição v1 real e v2/v3 sintéticas de teste. [SPEC0203](../02_spec/0203_pdsh022_session_format_evolution.md),
[evidência](../04_audit/evidence/PDSH-022-20261012/summary.md). Node22:
381 arquivos/3234 PASS +1 skip; PG37/302 e +guarda de sessão 38/311 sem skips;
E2E12/12; fronteira/types/lint/formato/catálogos PASS. Nenhum schema v2 real
publicado nem backfill; geração v1 conservada (triggers0028 intactos).
Checkpoint021 — 12/10/2026: PDSH-020 DONE documental, PDSH-021 DONE_LOCAL sob
trilha T3 por schema/contrato (a classificação T2 anterior foi corrigida).
[SPEC0202](../02_spec/0202_pdsh020_session_event_format.md) e
[evidência](../04_audit/evidence/PDSH-021-20261012/summary.md). Node22:
380 arquivos/3226 PASS +1 skip; PG38/311 sem skips; E2E12/12;
build público do consumidor, fronteira, types/lint/formato/catálogos verdes.
Canonical puro está em contracts, shared reexporta sem algoritmo paralelo.
Migração é dedicada/opt-in para preservar host legado; CI do catálogo fica033,
certificação/cobertura da onda e SDK/contexto continuam pendentes. Próximo022.

- Eventos de sessão imutáveis: nenhuma atualização/deleção; leitura deriva o
  visível ao modelo; o catálogo falha o CI em drift (tipo novo sem entrada,
  entrada sem fingerprint).
- SDK: um programa fora deste monorepo abre sessão, envia turno e observa
  eventos, usando só exports públicos (mesmo critério do
  `examples/consumers/reception-agent`); sem provider real (gateway
  determinístico).
- Compactação: conversa sintética de plantão acima do teto de contexto é
  resumida de forma determinística; o resumo é um evento de sessão auditável;
  nada de efeito externo.
- Token meter: `ModelResult` carrega contagem por request e o turno expõe o
  total; o orçamento passa a ser medido, não estimado.

### Onda 4 — Barra de qualidade (coverage 100% per-file e snapshots)

| ID       | Estado      | Trilha | O que                                                                                                         | Onde (novo/existente)                                                                                                                                                                                                                                                                                                                | Dependências                           |
| -------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| PDSH-030 | DONE        | T1     | Auditoria baseline: ranking de arquivos do núcleo abaixo de 100% per-file, com justificativas                 | relatório [0607](../04_audit/0607_pdsh030_core_coverage_baseline_2026-10-12.md) + evidência própria do coverage-summary                                                                                                                                                                                                              | nenhuma (paralela)                     |
| PDSH-031 | IN_PROGRESS | T2     | 100% per-file em `packages/{contracts,harness,orchestrator,agent-runtime}/src` com justificativas registradas | fatias 1–4 DONE + gate per-file DONE (**31 arquivos de produção em 100%**, gate no `vitest.config.mts` com [justificativas](../04_audit/0610_pdsh031_per_file_justifications_2026-10-12.md), evidência [031](../04_audit/evidence/PDSH-031-20261012/summary.md)); falta o fechamento do cartão (suíte completa + PG + E2E + ledgers) | PDSH-030                               |
| PDSH-032 | TODO        | T2     | Infra de snapshot tests com replay determinístico (fixtures de turnos gravadas; padrão dsh)                   | `vitest.snapshot.config.ts` novo, `snapshots/**`, `ScriptedModelGateway` já existente                                                                                                                                                                                                                                                | PDSH-001                               |
| PDSH-033 | TODO        | T2     | Novos gates no CI bar: catálogo de ferramentas/skills, catálogo de sessão, per-file, snapshot replay          | `.github/workflows/verify.yml`, `scripts/ci-bar*.mjs`                                                                                                                                                                                                                                                                                | PDSH-014, PDSH-021, PDSH-031, PDSH-032 |

**Critérios de pronto da Onda 4 (MP4):**

Checkpoint031r — 12/10/2026: gate per-file DONE — `CVG_COVERAGE_PER_FILE=1`
no `vitest.config.mts` (globs 100% per-file para contracts/harness/orchestrator/
agent-runtime), script `npm run test:coverage:per-file`, exclusão documentada
dos 3 arquivos de suporte, `vitest` adicionado a `packages/contracts`.
Run completo: **0 erros de threshold** (404 arquivos, 3249 testes passed;
globais S 90.27/B 86.75/F 92.32/L 91.07). Documento
[0610](../04_audit/0610_pdsh031_per_file_justifications_2026-10-12.md) com
gate, exclusões e 47 regiões de supressão. Falta o fechamento do cartão
(suíte completa + PG + E2E + ledgers). [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031q — 12/10/2026: fatia 4 DONE — `contracts/execution-v2.ts`
100% per-file com 5 testes do validador (último arquivo de produção do
baseline). **Decisão registrada**: os 3 arquivos de suporte (evals/fixtures)
ficam excluídos da obrigação de 100% per-file, com justificativa no documento
versionado do gate. Todos os arquivos de produção do baseline fechados;
coverage sem regressão; suíte dos pacotes 59/766 PASS; boundary PASS.
Falta o gate per-file + justificativas e o fechamento do cartão.
[Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031p — 12/10/2026: fatia 3e-ii DONE — `runtime.ts` 100%
per-file (região durável: deadline na leitura de aprovação, pausas antes da
reserva/antes do corpo/no último guard, journal/approval por outcome) com 4
testes novos. **Fatia 3 completa — 31/35** arquivos fechados; coverage sem
regressão nos 30 anteriores; suíte dos pacotes 59/761 PASS; boundary PASS.
[Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031o — 12/10/2026: fatia 3e-i DONE — `runtime.ts` com a região
≤1010 sem gaps (7 testes novos: pausas no gate/após modelo/no guard, política
que lança, orçamento de modelo, deadlines e cancelamentos de modelo/tool,
cancelamento tardio). **Defeito real corrigido no núcleo**: `raceInvoked`
abandonava a promise da operação sem handler quando o orçamento expirava antes
do race (unhandled rejection). Restam 34 stmts/40 branches na região durável
(>1010) para a 3e-ii. Coverage sem regressão nos arquivos fechados; suíte dos
pacotes 59/757 PASS; boundary PASS. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031n — 12/10/2026: fatia 3d DONE — `runtime-kernel-bridge`
100% per-file com 6 testes (gates de modelo/tool com relógio roteirizado,
timeout real do `withDeadline`, pausa ausente/falsa/verdadeira/lançando,
mapeamento de stop codes e outcomes). Simplificações mínimas (timer definido,
dispose direto, readPause/verdict sem fallback inalcançável); 5 supressões novas
(mapeamento defensivo do switch de tool, resultado de modelo e request/signal
sempre presentes) — 23 no cartão. Coverage focado 100%, sem regressão nos 29
fechados; suíte dos pacotes 58/750 PASS; boundary PASS. **30/35** fechados.
[Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031m — 12/10/2026: fatia 3c DONE — `composition` 100% per-file
com 5 testes (resolução de coordinator, mapping de envelope, composição com/sem
opcionais e gatilhos fail-closed de portas/durabilidade); coverage focado 100%
na primeira tentativa, sem regressão nos 28 fechados; suíte dos pacotes 57/744
PASS; boundary PASS; sem mudança de produção. **29/35** fechados.
[Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031l — 12/10/2026: fatia 3b DONE — `runtime-effect-recovery`
100% per-file com 4 testes diretos (falha crua de tool, replay sem
journal/hash, replay keyless com operation key recomputada, reserva sem
journal/hash). Coverage focado 100%, sem regressão nos 27 fechados; suíte dos
pacotes 56/739 PASS; boundary PASS; uma supressão nova (hash guardado por
todos os chamadores) — 18 no cartão. **28/35** fechados.
[Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031k — 12/10/2026: fatia 3a DONE — `runtime-approval-request`
(caminhos cru e sem ids), `proposal` (payload hostil) e `effect-journal`
(agent-runtime: locks stale/symlink/poll) em 100% per-file com 8 testes novos.
**Defeito real corrigido**: lock stale não-removível girava para sempre sem
checar o deadline (agora verificado após a tentativa de remoção; guarda no
teste de diretório stale). Coverage focado 100%, sem regressão nos 24 fechados;
suíte dos pacotes 55/735 PASS; boundary PASS. **27/35** arquivos fechados.
[Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031j — 12/10/2026: fatia 2d-3c DONE — `iterative-runtime` em
100% per-file com 22 testes novos (helpers, bloqueios de loop/orçamento,
deadlines com relógio congelado, decisões de conhecimento/verify/replan/replan
bound, threshold idempotente, HANDOFF/STOP, claims com itens válidos e hostis,
fechamento de passo pendente em 4 outcomes, auditoria pendurada, falha crua);
simplificações mínimas (guarda de pergunta, threshold, withDeadline, finalize,
avaliação de revisão); supressões `v8 ignore` no cartão: 17 (justificadas no
local). Coverage focado 100%, sem regressão nos 23 fechados; suíte dos pacotes
38/441 PASS; boundary PASS. **Fatia 2d completa — 24/35** arquivos fechados.
[Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031i — 12/10/2026: fatia 2d-3b DONE — `iterative-dispatch`
(15 funções de dispatch testadas por ctx stub + host fake: validação, resumes,
orçamentos, pausas/handoffs/approvals, cancelamento/deadline com e sem reserva,
failed/threw, knowledge, verificação, compose e evaluate) em 100% per-file com
21 testes novos; coverage focado 100%, sem regressão nos 22 fechados; suíte
dos pacotes 37/419 PASS; boundary PASS; duas simplificações mínimas.
**23/35** arquivos fechados. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031h — 12/10/2026: fatia 2d-3a DONE — `execution-spine` em
100% per-file com 12 testes novos (claim/retry, rejeições idempotentes,
resume durável pelo worker com journal options, heartbeats únicos/em falha,
lease perdido, config não-Error, conflito de fingerprint). **Defeito real
corrigido**: `WAITING_APPROVAL -> FAILED_TERMINAL` faltava na máquina de
transições (`resolveApproval(REJECTED)` sempre lançava); PG compartilha o
helper — `test:postgres` obrigatório no fechamento. Coverage focado 100%, sem
regressão nos 21 fechados; suíte dos pacotes 36/398 PASS; boundary PASS.
**22/35** arquivos fechados. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031g — 12/10/2026: fatia 2d-2 DONE — `effect-journal`
(transições, fencing, re-reserva de FAILED, mismatch de attempt, falhas sem
erro, incerteza) e `capability-boundary` (validações de descriptor/governança,
resolução, sort, input hostil por autoridade/profundidade/nós/bytes, execução
e outputs hostis) em 100% per-file com 16 testes novos; coverage focado 100%,
sem regressão nos 19 fechados; suíte dos pacotes 35/386 PASS; comparador
`sorted` simplificado (desempate por providerId era inalcançável); boundary
PASS. **21/35** arquivos fechados. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031f — 12/10/2026: fatia 2d-1b DONE — `kernel/kernel-runtime`
(boot falho com resposta default/custom, dispose, gate de entrada, cancelamento
pré/em planejamento/modelo/tool — com e sem reserva de aprovação —, orçamento
esgotado, falhas de planner, fallbacks de decisão, turn/end lançando e
fechamento de turno perdido) em 100% per-file com 15 testes novos; coverage
focado 100%, sem regressão nos 18 fechados; suíte dos pacotes 34/370 PASS;
boundary PASS; sem mudança de produção. **19/35** arquivos fechados.
[Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031e — 12/10/2026: fatia 2d-1a DONE — `kernel/pipeline`
(race/raceInvoked/cancelamento do modelo e do dispatch, listeners e guards
lançando, snapshot não clonável, sandbox host-integrity, hook de checkpoint,
pós-execute rebaixando sucesso, ledger com falha) e `createOperationalHarness`
(composição iterativa com todos os opcionais, capabilities+journal, alias
`run`, conflito de fingerprint) em 100% per-file com 14 testes novos; coverage
focado 100% nos 2, sem regressão nos 16 fechados; suíte dos pacotes 33/355
PASS; simplificação mínima em `pipeline.ts` (atribuição definitiva do abort);
boundary PASS. **18/35** arquivos fechados. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031d — 12/10/2026: fatia 2c DONE — `session/events` (validador
JSON estrito: orçamento de nós/profundidade, descritores de array/objeto,
enum/string/número, cap de 1 MiB por registro e a regra de `context/compacted`)
e `kernel/controls` (stops de duração no orçamento/avaliação/reserva de
aprovação, `approval_unbound`, settle de todos os outcomes com port falhando,
defaults de audit/telemetria, limites do log/ledger) em 100% per-file com 18
testes novos; coverage focado 100% nos 2, sem regressão nos 14 já fechados;
suíte dos pacotes 32/341 PASS; boundary PASS (0 diagnósticos) com pins de
sessão/canonical re-assinados. **16/35** arquivos fechados; supressões
`v8 ignore` justificadas: **5**. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031c — 12/10/2026: fatia 2b DONE — `kernel/host` (boot/sealing/
disposers/wrap não-Error; duas simplificações mínimas sem mudança de semântica)
e `context-engine` em 100% per-file com 9 testes novos; coverage focado 100%
nos 2; suíte dos pacotes 30/323 PASS. **14/35** arquivos fechados no cartão;
supressões `v8 ignore` seguem em 2. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031b — 12/10/2026: fatia 2a DONE — `trajectory`, `completion`
(refatoração mínima do predicado de efeito, sem mudança de semântica) e
`step-store` em 100% per-file com 16 testes novos; coverage focado 100% nos 3;
suíte dos pacotes 29/315 PASS. **12/35** arquivos fechados no cartão. Duas
supressões `v8 ignore` justificadas no total. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Checkpoint031a — 12/10/2026: PDSH-031 `IN_PROGRESS`, **fatia 1 DONE** —
9 dos 35 arquivos do baseline em 100% per-file (canonical neutro,
compaction, sessão kernel-log/format-migration/memory, skills
assert/loader, orquestradores scripted/hybrid) via 19 testes novos;
coverage focado dos três pacotes 100% nos 9 arquivos; suíte dos pacotes
28/299 PASS; uma supressão `v8 ignore` justificada no `default`
inalcançável do canonical. [Evidência](../04_audit/evidence/PDSH-031-20261012/summary.md).
Faltam fatias 2–4 (spine/kernel, agent-runtime, `execution-v2.ts` e
fixtures/evals) e o gate per-file. Sem commit/push.
Checkpoint030 — 12/10/2026: PDSH-030 DONE (T1). Baseline medido com
`npm run test:coverage` em Node22 sem PG (23 arquivos skip declarados):
**35 de 53** arquivos do núcleo abaixo de 100% per-file — contracts 2/5,
orchestrator 2/4, harness 24/33, agent-runtime 7/11; totais globais
S 88.46/B 83.92/F 91.09/L 89.47 (global falha sem PG; re-medir com PG no
fechamento). Relatório [0607](../04_audit/0607_pdsh030_core_coverage_baseline_2026-10-12.md)
com ranking completo, classificação e plano por fatias para a 031. Nenhum
código/config alterado. Próximo: PDSH-031 em fatias (gaps pequenos →
spine/kernel → `execution-v2.ts`), depois 032/033.

- Per-file 100% ou exceção justificada em documento versionado (padrão: só
  bootstraps de processo e adaptadores PG, que já têm gates próprios).
- Snapshot replay roda sem chave de provider e falha em regressão visual de
  contrato do turno.
- CI bar verde com os quatro gates novos; nenhum gate novo é silenciosamente
  opcional.

## 5. Relação com cartões existentes (sem duplicação)

| Cartão existente                                                                                | Relação com este plano                                                              |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| KPLG-004 (Parte B) em [0372](0372_kernel_plugins_roadmap.md)                                    | é o conteúdo de PDSH-001; este plano só o posiciona na Onda 1 e fixa o critério MP1 |
| KPLG-005 (modelo/canais como plugins de capacidade)                                             | adjacente e continua; PDSH-004 faz a ponte do orçamento no ponto "antes do modelo"  |
| KPLG-006 (Assistente como plugins)                                                              | executa depois de MP1/MP2; PDSH-026 é o consumo do produto sobre sessão+compaction  |
| ENG-007 em [0371](0371_engine_production_backlog.md)                                            | fecha com PDSH-001 (uma só pilha)                                                   |
| HISO-009/010 em [0370](0370_harness_product_isolation_backlog.md)                               | PDSH-023 deve estender `PUBLIC_API.md`/teste de regressão no mesmo padrão           |
| Barra [0373](0373_barra_producao_harness.md) e Fase C do [0374](0374_plano_producao_harness.md) | independentes; este plano não altera critérios de GO de produção                    |
| Cartões PISO do produto                                                                         | PDSH-026 coordenar com o dono do produto (Codex)                                    |

## 6. Métricas de acompanhamento

| Métrica                                                 | Baseline (11/10)                 | Meta (MP4)                                  |
| ------------------------------------------------------- | -------------------------------- | ------------------------------------------- |
| Implementações distintas do pipeline de governança      | 3 (fachada + iterativo + worker) | 1 (`kernel/pipeline.ts`)                    |
| Lacunas da suíte de conformidade I1–I12                 | 4 (histórico; 51 PASS)           | 0                                           |
| Policy engines distintos                                | 2                                | 1                                           |
| Tools fs/shell de produção                              | 0                                | 2 (com sandbox e journal)                   |
| Catálogos gerados com drift-check (ferramentas, sessão) | 0                                | 2                                           |
| Formato de sessão versionado                            | não (migrações SQL só)           | v1 com fingerprints                         |
| SDK out-of-process                                      | não                              | JSON-RPC + exemplo de consumidor            |
| Token meter / compactação                               | não / não                        | sim / sim                                   |
| Coverage per-file no núcleo                             | thresholds globais 90/85/90/90   | 100% per-file (ou justificativa versionada) |
| Snapshot tests com replay                               | não                              | infra + ≥10 fixtures de turno               |
| Pareamento ponderado com o dsh                          | ~50                              | ~70                                         |

## 7. Riscos e mitigações

| Risco                                                         | Mitigação                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Sandbox indisponível em CI/Docker (bwrap/Landlock restritos)  | Fallback `partial` explícito + gate que prova o fallback; perfis de produção exigindo `full` falham alto e fechado |
| Unificação quebra comportamento do worker durável             | PDSH-001 sem mudança de contrato externo; conformidade e suíte PG obrigatórias antes/depois no mesmo commit        |
| Volume de coverage per-file gera teste "de volume" sem valor  | PDSH-030 primeiro (ranking + justificativas); só o que é ramo de governança entra no piso 100% obrigatório         |
| SDK concorre com a HTTP API do console                        | HTTP continua canônico para o console; SDK é para agentes/produtos; protocolo versionado e documentado             |
| Sobreposição com trabalho do Codex (`products/**`, extrações) | Claims na coordenação; PDSH-026 só após coordenação; nada em `products/**` sem claim do dono                       |
| Derrapar para "copiar o dsh"                                  | Invariante 1; qualquer dúvida de desenho cita o padrão e implementa em TypeScript próprio, com revisão T3          |

## 8. Não-escopo

- Cordis como dependência do CVG; vendorizar código do dsh; replicar 340
  pacotes, browser-use, computer-use, desktop Electron, site de documentação.
- UI/web do dsh; i18n EN/ZH; release npm público do motor nesta fase.
- Dado real, provider externo, canal real, deploy, push e produção: seguem
  vedados pelos planos 0373/0374 e pela constituição.
- Sandbox em Windows/macOS no primeiro ciclo (o dsh tem; o CVG foca Linux,
  que é o alvo de deploy — `deploy/harness/`).
- Qualquer efeito clínico: diagnóstico e prescrição continuam vedados
  (ADR-009; guarda de saída prevista na ADR-011).

## 9. Próximos passos e decisões humanas

1. **Usuário aprova este plano** (direção e ordem das ondas) e, se concordar,
   autoriza a SPEC do primeiro cartão T3 (PDSH-001) para iniciar a Onda 1.
2. Coordenar com o Codex (na coordenação de agentes): PDSH-001 toca
   `packages/agent-runtime` (extração dele) e PDSH-026 toca `products/**`.
3. Cartões T3 entram na fila de SPEC da série 019x um a um; nenhum BUILD de
   T3 começa sem a revisão registrada.
4. Este plano não altera a Fase C do 0374: as decisões de destino, cofre,
   IdP e alerta continuam pendentes e permanecem a porta para GO de produção.

## 10. Rastreabilidade

| Artefato                        | Caminho                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| ADR de direção do kernel        | `docs/architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md` |
| Roteiro do kernel               | `docs/03_build/0372_kernel_plugins_roadmap.md`                                   |
| Carteira do motor               | `docs/03_build/0371_engine_production_backlog.md`                                |
| Isolamento motor/produto        | `docs/03_build/0370_harness_product_isolation_backlog.md`                        |
| Plano de produção               | `docs/03_build/0374_plano_producao_harness.md`                                   |
| Auditoria que motivou o ADR-011 | `docs/04_audit/0596_auditoria_motor_direcao_plugins_2026-10-06.md`               |
| Public API suportada            | `docs/architecture/PUBLIC_API.md`                                                |
| Claim desta rodada              | `docs/08_runtime/agent_coordination.md` (seção `PARE-DSH-20261011`)              |
