# Pacote de decisões — programa PROD-20260926

- Status: DL-01 a DL-04, D-02, D-03, D-09, D-12 e D-13 `DECIDED` pelo usuário;
  D-04 teve o encaminhamento para discovery decidido, mas o consumidor e o
  contexto do piloto seguem `WAITING_HUMAN_APPROVAL`. As demais decisões
  permanecem pendentes. As recomendações são do agente e não valem como decisão.
- Plano: [0354](0354_production_executive_plan_2026-09-26.md). Backlog:
  [0356](0356_production_backlog_2026-09-26.md).
- Como decidir: responder por ID com a opção escolhida (ou texto livre). O
  agente registra a resposta, a data e o SHA-256 deste arquivo em
  `docs/99_runtime_state.md` e no log. Uma decisão só vale para a versão do
  pacote cujo hash foi registrado.

## Decisões já tomadas — legado

Respostas do usuário em 26/09/2026, dadas em sessão, sobre o legado
Esmeralda V2 (`cvg-agent-secretary-v2`). O usuário também pediu que a
limpeza, a organização, o isolamento e a remoção do legado entrem como
melhoria do programa (frente FL), para evitar confusão com resquícios.

| ID    | Pergunta                                                | Decisão                                                                                                                  |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| DL-01 | O que fazer com o domínio da secretária no código vivo  | Isolar em `legacy/`, fatia a fatia, com testes verdes em cada fatia (PR-L03 a PR-L06)                                    |
| DL-02 | Pacotes sem consumidor (`workflows`, `tools`, `memory`) | Apagar; o histórico continua no git (PR-L02)                                                                             |
| DL-03 | Documentação da Esmeralda                               | Mover docs de produto para `legacy/docs`; histórico de auditoria vinculado por hash fica no lugar, identificado (PR-L08) |
| DL-04 | Alvo de produção                                        | O harness como plataforma; nenhum produto específico no plano                                                            |

## Decisões já tomadas — F0 e governança

Respostas do usuário em 26/09/2026 sobre a versão deste pacote com SHA-256
`efb683bcdd8691b8f463bf15597b5dd8ce78ade8145dd84a03fec9d742695cfb` (commit `001fc6f`).

| ID   | Decisão                                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-02 | Opção A: parar de versionar `.gauntlet*` sem reescrever histórico; manifesto de hashes versionado (PR-004)                                                                               |
| D-12 | Opção A: governança proporcional, incorporada à constituição em [`07_agents/AGENTS.md`](../07_agents/AGENTS.md) (PR-108)                                                                 |
| D-13 | Opção B: M07-S1 reclassificada `ACCEPTED_WITH_RISK`; os 11 findings de dependência viram a PR-208; a política de workspaces pode aceitar `legacy/packages/*` em versão revisada (PR-109) |

Respostas do usuário em 27/09/2026 sobre a versão deste pacote com SHA-256
`2fa24de3c115b32dba39c19740fe93212d135139276b88d304ae2ddc816aacf1`:

| ID   | Decisão                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-03 | Opção A: núcleo governado completo para o primeiro piloto; provider e canal continuam atrás de flags, sujeitos a seus próprios gates.                         |
| D-04 | Definir o primeiro produto consumidor e o contexto do piloto no discovery de plataforma (PR-101). Nenhum produto, tenant ou SLA foi escolhido nesta resposta. |

### DL-05 — Quando apagar o legado isolado

- Pendente. Opções:
  - **A (recomendada):** apagar `legacy/packages` e as tabelas de jornada
    assim que o fluxo de referência neutro (PR-L07) estiver verde em CI.
  - **B:** manter isolado até o primeiro produto consumidor entrar em
    piloto, como referência de migração.

## Resumo das decisões pendentes

| ID   | Tema                                              | Recomendação do agente                                   | Bloqueia |
| ---- | ------------------------------------------------- | -------------------------------------------------------- | -------- |
| D-01 | Worktree sujo                                     | Encerrada por `f9f84c9`; só confirmar gates              | F0       |
| D-02 | Estado Gauntlet no git                            | A — parar de versionar, sem reescrever histórico         | F0       |
| D-03 | Capacidades de plataforma em produção             | A — decidido em 27/09/2026                               | F1       |
| D-04 | Primeiro consumidor e piloto                      | Discovery decidido; identificação ainda pendente         | F1, F7   |
| D-05 | Provider de LLM                                   | A — provider comercial com DPA e retenção zero           | F5       |
| D-06 | Canal                                             | Depende do primeiro consumidor; preferir canal oficial   | F5       |
| D-07 | Fontes de conhecimento                            | Dono no produto consumidor; publicação com dupla revisão | F5       |
| D-08 | Nuvem e região                                    | Nuvem gerenciada com região no Brasil                    | F6       |
| D-09 | IdP e MFA                                         | IdP corporativo existente, OIDC, MFA obrigatório         | F3       |
| D-10 | Encarregado de dados (DPO)                        | Nomear antes de F4                                       | F4, F7   |
| D-11 | `conversation`, `rag`, `channel-gateway`, Drizzle | Ver tabela própria                                       | F2       |
| D-12 | Governança proporcional                           | A — gate por release e por capacidade sensível           | Todas    |
| D-13 | M07-S1 / C1M                                      | B — reclassificar com riscos aceitos                     | F0/F1    |
| D-14 | Go/no-go do piloto                                | Só depois de PR-703                                      | F7       |
| D-15 | Go/no-go da produção controlada                   | Só depois de PR-706                                      | F7       |

## D-01 — Worktree sujo

- Fato: o commit `f9f84c9` absorveu `postgres.ts` e `postgres-audit.ts`
  durante a rodada de 26/09; o worktree ficou limpo.
- Pedido: confirmar que o commit foi intencional. Os gates sobre ele ainda
  precisam rodar (PR-001).

## D-02 — Estado Gauntlet no versionamento

- Fato: 102 arquivos versionados em `.gauntlet*`, com 102 664 474 bytes, dos
  quais 17 `state.json` de ~6 MB. Inventário com SHA-256 de cada arquivo em
  [gauntlet-state-manifest.json](../04_audit/evidence/AUD-20260926/gauntlet-state-manifest.json).
- Opções:
  - **A (recomendada):** `git rm --cached` dos diretórios, entrada no
    `.gitignore`, cópia dos arquivos para armazenamento de artefatos e
    manifesto versionado. O histórico git continua com os arquivos.
  - **B:** A + reescrita do histórico (`git filter-repo`). Exige force push e
    reclonagem; invalida hashes de commit citados em evidências. Não
    recomendado.
  - **C:** manter como está.
- Impacto em evidências: os scripts de certificação já excluem `.gauntlet*`
  do candidato (`scripts/ci-bar.mjs`, `scripts/phase10-verify.mjs`,
  `scripts/mutation-guard.mjs`, `scripts/lib/certification-rules.mjs`).
- Os 11 arquivos vazios fora do catálogo de evidências são `artifacts.jsonl`
  destes diretórios; a opção A resolve também a PR-006.

## D-03 — Capacidades de plataforma em produção

- Decisão do usuário: **A — núcleo governado completo** para o primeiro
  piloto. A escolha define o escopo pretendido, sem liberar provider, canal,
  conhecimento, dados reais, efeito externo ou produção. Cada capacidade
  sensível mantém seu gate T4; o PRD e a SPEC ainda precisam ser validados.
- Opções:
  - **A (recomendada):** núcleo governado completo — runtime single-pass e
    iterativo, orquestrador, approvals, policy, handoff, auditoria, outbox
    durável, console de operação, provider de LLM e canal atrás de flags.
  - **B:** núcleo mínimo — runtime single-pass, approvals, handoff e
    auditoria, sem loop iterativo nem conhecimento no primeiro piloto.

## D-04 — Primeiro produto consumidor e piloto

- Encaminhamento do usuário: **definir em discovery** (PR-101). O produto,
  tenant, volumes, horário com humano e SLA de handoff seguem pendentes. Em
  27/09/2026, o usuário informou que ainda está **sem candidatos definidos**.
- O plano não escolhe produto. O discovery de plataforma (PR-101) deve
  indicar o primeiro consumidor, o tenant piloto, o horário de operação com
  humano, o SLA de handoff e o volume esperado.

## D-05 — Provider de LLM

- Critérios: DPA assinado; sem uso dos dados para treino; retenção de entrada
  zero ou mínima; região conhecida; endpoint compatível com o gateway
  `openai-compatible`; custo por turno; latência p95.
- Opções: **A (recomendada)** provider comercial com contrato empresarial e
  DPA; **B** modelo aberto auto-hospedado (gateway `ollama`), com GPU e
  operação próprias.

## D-06 — Canal

- Depende do primeiro consumidor. Recomendação geral: canal oficial do
  fornecedor (por exemplo, WhatsApp Business Platform/Cloud API) em vez de
  integração não oficial, por risco de bloqueio e de violação de termos. Os
  adapters Evolution e Chatwoot existentes em `packages/channel-gateway`
  continuam disponíveis como opção declarada.

## D-07 — Fontes de conhecimento

- Proposta: o produto consumidor é dono das fontes; a plataforma oferece
  publicação com dupla revisão, validade máxima e revogação imediata.

## D-08 — Nuvem, região e orçamento

- Proposta: provedor gerenciado com região no Brasil, PostgreSQL gerenciado
  com PITR, cofre de segredos nativo, registro de contêiner com assinatura e
  observabilidade gerenciada; contas separadas para staging e produção.

## D-09 — IdP e MFA

- Decisão do usuário em 27/09/2026: IdP via OIDC com MFA obrigatório para
  operadores e administradores; grupos do IdP mapeados para papéis e tenants;
  revogação em até 15 minutos. Para desenvolvimento e homologação, usar **IdP
  OIDC local com MFA** e identidades sintéticas. Não criar login local próprio
  por usuário/senha. O issuer corporativo, client, redirects e claims serão
  informados depois; a configuração local não autoriza produção irrestrita.

## D-10 — Encarregado de dados

- Proposta: nomear o encarregado antes de F4; ele aprova o inventário da
  plataforma (PR-401) e o modelo de RIPD para produtos consumidores.

## D-11 — `conversation`, `rag`, `channel-gateway` e Drizzle

| Item                   | Opções                       | Recomendação                                   |
| ---------------------- | ---------------------------- | ---------------------------------------------- |
| `@cvg/conversation`    | WIRED / SPEC_ONLY / ARCHIVED | WIRED se D-03 = A (camada Phase 4A do harness) |
| `@cvg/rag`             | WIRED / SPEC_ONLY            | WIRED junto com PR-504                         |
| `@cvg/channel-gateway` | WIRED / SPEC_ONLY            | WIRED junto com PR-503                         |
| `drizzle-orm`          | remover / migrar             | Remover; SQL parametrizada é o padrão de fato  |

`workflows`, `tools` e `memory` saíram deste item: são legado (DL-02).

## D-12 — Governança proporcional

- Opções: **A (recomendada)** gate hash-bound por release candidate e por
  capacidade sensível, SPEC curta + CI + revisão para refatorações sem efeito
  externo, baselines de gate só com os inputs daquele gate; **B** adotar só a
  exclusão de documentos não-input das baselines; **C** manter o processo
  atual.

## D-13 — M07-S1 / C1M

- Fato: M07-S1 está `FAIL / OPEN` desde 24/09; C1L parou por drift de um
  documento fora do escopo; C1J passou 2 137 testes e falhou por
  indisponibilidade de revisores; o packet C1M tem 3 de ~8 arquivos.
- Opções:
  - **A:** completar C1M com baseline rederivada e executar o gate.
  - **B (recomendada):** reclassificar M07-S1 como `ACCEPTED_WITH_RISK`,
    registrando os 11 findings de dependência como itens de F2, e seguir.
    Parte desses findings desaparece com PR-L02 (pacotes mortos).
  - **C:** manter bloqueado.

## D-14 e D-15 — Go/no-go

- Não decidir agora. Critérios no roadmap
  [0355](0355_production_roadmap_2026-09-26.md). O agente prepara pacote
  próprio, com hash do candidato, quando PR-703 (D-14) e PR-706 (D-15)
  estiverem concluídas.
