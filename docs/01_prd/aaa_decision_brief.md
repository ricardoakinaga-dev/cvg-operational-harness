# aaa_decision_brief — Decisões D01–D05 (material de decisão, sem aprovação)

- Task: `AAA-02` — "Preparar decisões de produto, RF-011 e fronteiras humanas". Programa: `AAA-20260912`.
- Data: 2026-09-12; atualizado em 2026-09-13. Status deste relatório: `D01_D02_D03_D04_D05_3_4_REGISTERED_OPTION_A_SIGNOFF_DEFERRED`. As decisões foram registradas explicitamente em 2026-09-13 pelo solicitante humano da sessão (respostas explícitas à consulta de decisão): D01=C; D02=A (draft-only); D03=A (alvos de laboratório); D04=A (integrações reais bloqueadas, briefing de homologação); D05-3/4=A (provisórios aprovados); D05-SIG=A (signoff adiado). Nome/cargo formal não informado — ratificação nominal recomendada.
- Fonte canônica de status: [aaa_program_backlog.json](../03_build/tracking/aaa_program_backlog.json) (entrada `AAA-02`) e ledger vivo [aaa_execution_ledger.json](../03_build/tracking/aaa_execution_ledger.json) (`coordinatorDecisions`).
- Autoridade desta rodada: a solicitação atual autoriza preparar material de decisão, revisar dependências e coordenar agentes. Não aprova `D01`/RF-011, ação real, integração externa, egress, homologação, custo real, deploy ou produção.
- Regra de leitura: `PENDING` significa que a decisão **não foi emitida** pela autoridade competente. Silêncio, tempo decorrido, teste verde, nota ou recomendação técnica não constituem aprovação (ver §8).
- Nenhum nome de responsável, prazo, credencial, orçamento ou participante de homologação foi inventado neste documento. Onde a decisão exigir esses dados, o campo permanece explicitamente pendente.

Referências normativas do programa: [0324 — plano executivo](../03_build/0324_aaa_executive_plan.md) §3–§4, [0327 — coordenação da rodada 2](../03_build/0327_aaa_round2_coordination.md), [aaa_execution_contract](../02_spec/aaa_execution_contract.md), [aaa_data_api_contract](../02_spec/aaa_data_api_contract.md), [aaa_quality_contract](../02_spec/aaa_quality_contract.md), [0013 — requisitos funcionais](0013_requisitos_funcionais.md) (RF-011) e [99_runtime_state.md](../99_runtime_state.md).

## 1. Como usar este brief

1. Cada seção D01–D05 registra: autoridade necessária, opções, estado atual, impacto e tasks bloqueadas/não bloqueadas.
2. O lead registra a resposta da autoridade e desbloqueia **somente** as tasks afetadas; a decisão deve referenciar este artefato e o hash vigente.
3. Sem resposta registrada, o estado permanece `PENDING` e as tasks dependentes permanecem bloqueadas no gate correspondente; as tasks não dependentes continuam executáveis.
4. Este brief não é SPEC, não congela contrato, não substitui revisão independente nem aprovação humana.

## 2. D01 — runtime canônico / RF-011 (LangGraph)

**Contexto.** O RF-011 histórico pede "executar workflow LangGraph correspondente" ([0013](0013_requisitos_funcionais.md)). A SPEC histórica também cita workflows modelados como máquinas de estado orquestradas por LangGraph ([0100](../02_spec/0100_spec_readiness_review.md), [0101](../02_spec/0101_visao_arquitetural.md), [0103](../02_spec/0103_mapa_de_modulos.md)). O runtime atual é o kernel governado do monólito modular, com identidade→policy→approval→runtime→persistência→canal falso implementados e testados como bibliotecas; o caminho público (API/worker→`executePublishedAgent`→platform) ainda usa provider fake/determinístico e **não** compõe essa cadeia até o efeito — a composição é alvo, não estado atual ([auditoria 0560](../04_audit/0560_docs_implementation_audit_2026-09-13.md), D13-03). A decisão é cumprir o requisito, alterá-lo formalmente ou definir convivência, selecionando o runtime canônico. O plano executivo exige preservar o monólito modular enquanto suficiente e não introduzir framework apenas para obter rótulo de qualidade ([0324](../03_build/0324_aaa_executive_plan.md) §1 e §3).

### 2.1 Opções

| Opção                                       | Descrição                                                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — runtime atual canônico**              | Manter o kernel governado atual como único runtime canônico; RF-011 seria atendido por alteração formal do requisito (adendo de produto) ou por desvio aceito e registrado.                        |
| **B — migrar para LangGraph**               | Tornar o grafo LangGraph o runtime canônico; a cadeia de governança migraria verticalmente para o novo runtime antes de qualquer efeito.                                                           |
| **C — convivência com fronteira explícita** | Manter o runtime governado como canônico para autoridade/efeito e usar LangGraph apenas para composição de workflow, atrás de um adapter/fronteira contratual, sem bypass da cadeia de governança. |

### 2.2 Comparação objetiva

| Critério                     | A — runtime atual                                                                   | B — LangGraph canônico                                                     | C — convivência com fronteira                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Controle e não-bypass        | Máximo em bibliotecas: contratos testados; composição pública ainda não demonstrada | Precisa ser reconstruído e reprovado no novo runtime                       | Médio-alto: não-bypass depende de contrato de fronteira e regressões       |
| Approval/idempotência        | Contratos vigentes já vinculados                                                    | Contratos precisam ser religados; risco de caminho paralelo                | Contratos vigentes permanecem autoritativos; fronteira deve falhar fechada |
| Custo                        | Menor incremental; sem nova dependência                                             | Alto: dependência, lockfile, supply chain, imagem, evals e operação        | Médio: contrato de fronteira, testes e ADR comparativo                     |
| Contratos/testes existentes  | Compatível com o que existe                                                         | Invalida/reabre contratos e evidências do runtime atual                    | Aditivo: preserva testes atuais; exige novos testes de fronteira           |
| Risco de migração            | Nulo para o runtime; deixa RF-011 aberto                                            | Maior: migração sem recuperação é proibida; exige equivalência demonstrada | Menor se a fronteira for estrita; maior se houver escopo duplicado         |
| Atendimento formal ao RF-011 | Requer alteração formal do requisito                                                | Atende literalmente                                                        | Atende se o workflow LangGraph realmente executar na fronteira definida    |

### 2.3 Recomendação técnica (não é aprovação)

Recomendação do preparador: **opção C**, condicionada a contrato de fronteira explícito, invariante de não-bypass (nenhum caminho LangGraph alcança efeito sem identidade→policy→approval→runtime→persistência→canal) e ADR comparativo congelado. A opção B não é recomendada no escopo controlado sem ADR comparativo e plano de migração/recuperação; a opção A é viável apenas se a autoridade de produto alterar formalmente o RF-011. Esta recomendação pode ser aceita, alterada ou rejeitada pela autoridade; **não é decisão**.

### 2.4 Estado e impacto

- Autoridade necessária: **Produto + responsável técnico humano**.
- Status: **APPROVED — opção C (convivência com fronteira)**, registrada em 2026-09-13 pelo solicitante humano da sessão (resposta explícita à consulta de decisão); nome/cargo formal não informado, ratificação nominal recomendada. Referências e escopo no [pacote de decisões](../02_spec/prod20260913_decision_packet.md) (§Registros emitidos). Este registro **não** aprova D02–D05, canais/providers reais, efeitos, homologação, deploy ou produção.
- Bloqueadas por D01: `AAA-06` (gate `G_D01`; depende de `AAA-02`) e `AAA-21` (gate `G_D01_SPEC`; depende de `AAA-06`).
- **Não** bloqueadas por D01: `AAA-07`–`AAA-11` (correções locais de approval/policy/runtime; gate aplicável é `G_SPEC` e as dependências não incluem `AAA-02`/`AAA-06`). Conforme [0324](../03_build/0324_aaa_executive_plan.md) §3: "D01 não precisa paralisar F01–F05".

## 3. D02 — semântica de draft versus ação sensível/real

**Contexto.** É preciso decidir o que `draft` significa frente a confirmação/alteração real, quais campos podem mudar e qual retenção se aplica. A decisão não pode ser interpretada como permissão implícita de ação real ([0324](../03_build/0324_aaa_executive_plan.md) §3).

### 3.1 Estado já implementado (contrato vigente)

| Elemento                             | Estado vigente no `aaa_execution_contract`                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appointment.confirm`                | `HIGH_RISK_WRITE`; **sem grant em nenhum perfil → `DENY`** sem ferramenta; alvo da matriz T-13.                                                                             |
| `appointment.reschedule`             | `HIGH_RISK_WRITE`; **sem grant em nenhum perfil → `DENY`** sem ferramenta; alvo da matriz T-13.                                                                             |
| `appointment.modify`                 | Permitido **somente** sobre `resource.type = appointment_draft`; `appointment` real não obtém `ALLOW` silencioso (reprodução F15 corrigida).                                |
| `appointment.cancel`                 | Mantém `require_approval`; executável **somente** contra adapter controlado/falso (`controlled_fake`) no escopo atual.                                                      |
| Efeito real                          | `effectScope: 'real_authorized'` é negado sem registro explícito de autorização (AAA-21 + decisão humana); tentativa real retorna `real_effect_not_authorized` sem chamada. |
| `resource.type` ausente/desconhecido | `DENY` (`resource_type_required`/`resource_type_not_allowed`).                                                                                                              |

Fonte: [aaa_execution_contract](../02_spec/aaa_execution_contract.md) tabela de capabilities e condições `Q2`/T-13; parecer [AAA-03 REVIEW](../04_audit/evidence/AAA/AAA-03/review-agent-3/REVIEW.md).

### 3.2 Opções de decisão

| Opção                                              | Descrição                                                                                                                                   | Consequência                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **A — congelar o estado draft-only**               | Formalizar a semântica atual: draft é intenção editável sem efeito real; toda ação real permanece negada; decidir apenas campos e retenção. | Menor risco; preserva invariantes; não atende eventual necessidade de produto por ação real.       |
| **B — ampliar capabilities de draft por contrato** | Definir explicitamente campos alteráveis, versionamento, TTL e auditoria do draft, mantendo confirm/reschedule/cancel reais negados.        | Aditivo, porém exige revisão de `AAA-03`/`AAA-08` e nova evidência; não amplia autoridade real.    |
| **C — conceder qualquer ação real**                | Autorizar `confirm`/`reschedule`/`cancel` reais contra adapter real.                                                                        | Fora do escopo controlado: exige D04, AAA-21 e autorização humana específica; não habilitada aqui. |

### 3.3 Pontos de decisão humana remanescentes

1. Campos permitidos em `appointment.modify` sobre `appointment_draft` (lista fechada e defaults).
2. Retenção/TTL de drafts e trilha de auditoria correspondente (interface direta com D05-3).
3. Se `appointment.cancel` real pode existir algum dia, sob quais capabilities, approval e adapter autorizado (exige D04 + AAA-21).
4. Classificação de dados e redaction do draft no journal/outbox.

### 3.4 Estado e impacto

- Autoridade necessária: **Produto + segurança/operação**.
- Status: **APPROVED — opção A (draft-only)** em 2026-09-13: campos atuais do draft, TTL 24h, confirmação/reagendamento/cancelamento reais negados; ampliação de campos/efeito real exige nova decisão.
- Nenhuma task do JSON canônico carrega gate `D02`; a decisão afeta o aceite de `AAA-08`, o escopo de efeitos reais em `AAA-12`/`AAA-21` e a retenção de D05-3.
- `AAA-07`–`AAA-11` (correções locais) seguem executáveis no escopo controlado; **nenhuma** ação real é liberada por esta seção.

## 4. D03 — perfil de carga, SLO, disponibilidade, retenção, RPO/RTO

**Contexto.** Alvos operacionais são propostas históricas ou de diagnóstico; a aprovação é humana e pertence a Operação + dono do serviço. O plano executivo ([0324](../03_build/0324_aaa_executive_plan.md) §5) e a barra congelada `AAA-04 v2` §9.1 registram explicitamente que bounds de performance permanecem **propostos e não aprovados, pendentes de D03**.

### 4.1 Proposto versus aprovado

| Alvo                                     | Valor proposto                | Origem                                                        | Status                        |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------- | ----------------------------- |
| p95 de persistência                      | ≤2 s                          | SPEC 0113 / [0324](../03_build/0324_aaa_executive_plan.md) §5 | **PROPOSTO — não aprovado**   |
| Ack                                      | ≤10 s                         | SPEC 0113 / [0324](../03_build/0324_aaa_executive_plan.md) §5 | **PROPOSTO — não aprovado**   |
| Rampa de carga                           | 10k→100k eventos              | [0324](../03_build/0324_aaa_executive_plan.md) §5             | **PROPOSTO — não aprovado**   |
| Soak                                     | 24 h em laboratório (inicial) | [0324](../03_build/0324_aaa_executive_plan.md) §5             | **PROPOSTO — não aprovado**   |
| Disponibilidade                          | 99,9%                         | proposta histórica Phase 10                                   | **PROPOSTO — não aprovado**   |
| RPO                                      | ≤5 min                        | proposta histórica Phase 10                                   | **PROPOSTO — não aprovado**   |
| RTO                                      | ≤30 min                       | proposta histórica Phase 10                                   | **PROPOSTO — não aprovado**   |
| Janela/amostra de observação operacional | não definida                  | —                                                             | **PENDENTE (depende de D03)** |
| Perfil de hardware/concorrência/tamanho  | não definido                  | —                                                             | **PENDENTE (depende de D03)** |

Referência direta: [aaa_quality_contract v2](../02_spec/aaa_quality_contract.md) §9.1 — pisos de coverage/mutação estão **congelados** na v2; bounds de performance permanecem **propostos e não aprovados**, e "nenhum bound proposto pode ser apresentado como meta aprovada ou resultado medido".

### 4.2 Estado e impacto

- Autoridade necessária: **Operação + dono do serviço**.
- Status: **APPROVED — opção A (laboratório)** em 2026-09-13: p95≤2s, ack≤10s, rampa 10k→100k, soak 24h, disponibilidade 99,9%, RPO≤5min/RTO≤30min como metas de ensaio; aceite de produção só após medição no ambiente autorizado e signoff (D05-SIG).
- Bloqueadas por D03: `AAA-32` (gate `G_D03_SPEC`, exige metas humanas D03 para medir RPO/RTO) e o aceite de `AAA-31` (exige "perfil aprovado").
- Preparação permitida antes da decisão: medir baseline/laboratório permanece possível **desde que** o alvo seja registrado como proposto, sem alegar aceite operacional ([0324](../03_build/0324_aaa_executive_plan.md) §4, `G_D03_SPEC`).
- Impacto final: critérios de A20 (`Q-A20-01`/`Q-A20-02`/`Q-A20-04`) e a qualificação operacional não podem ser satisfeitos sem D03 aprovada.

## 5. D04 — IdP, provider, canal, fonte institucional, egress e homologação

**Contexto.** Todas as integrações externas são decisões de donos das integrações/dados + segurança. No escopo atual existem **simuladores locais** (gateway de modelo com fakes, adapters de canal locais controlados, corpus sintético `phase10-core-v1`), e **nenhuma integração real está autorizada**. Simuladores locais não substituem D04 nem homologação.

| Item                           | Opções                                                      | Autoridade                              | Status  | Impacto / tasks                                                                                |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| IdP / identidade real          | qual provedor, protocolo, audience, rotação, tenant mapping | Donos de identidade + segurança         | PENDING | `AAA-20` pode preparar composição local; identidade real exige D04; `AAA-37` é o gate externo. |
| Provider de modelo             | qual provider, contrato, custos, retenção, fallback         | Donos de integrações + segurança        | PENDING | `AAA-26` local controlado não substitui D04; egress real bloqueado.                            |
| Canal (mensageria)             | qual canal, credenciais, limites, opt-in                    | Donos de integrações + segurança        | PENDING | Adapters locais são sintéticos; nenhum envio externo autorizado (`NO-GO`).                     |
| Fonte institucional (RAG)      | qual acervo, versionamento, owner, revogação                | Donos dos dados + segurança             | PENDING | `AAA-25` usa `G_SPEC_SOURCE_FIXTURE` (corpus sintético marcado) e **não** substitui D04.       |
| Egress / allowlist / orçamento | destinos permitidos, budget, aprovação de rede              | Segurança + operação                    | PENDING | SSRF/egress testados localmente; nenhum egress real autorizado.                                |
| Homologação externa            | participantes, janela, dados sintéticos, condições de abort | Donos das integrações/dados + segurança | PENDING | `AAA-37` (`G_EXTERNAL`), `AAA-38` (`G_HUMAN`) e `AAA-39` (`G_EXTERNAL_HUMAN`) bloqueadas.      |

### 5.1 Estado e impacto

- Status: **APPROVED — opção A (bloqueio mantido + briefing)** em 2026-09-13: nenhuma integração real autorizada; briefing de homologação a preparar sem executar; AAA-37/38/39 permanecem bloqueados. Nenhuma credencial, endpoint, custo, owner ou janela foi inventado.
- Preparação local permitida: adapters/simuladores, contratos, threat model e briefing de homologação, sem efeito externo ([0324](../03_build/0324_aaa_executive_plan.md) §3–§4).
- Bloqueio explícito: `AAA-37`, `AAA-38` e `AAA-39`; integrações reais seguem `NO-GO`, sem exceção por conveniência.

## 6. D05 — vulnerabilidade/licença, risco residual e signoff

### 6.1 Já decidido — coordenação técnica (não é gate humano)

Decisões registradas no ledger `coordinatorDecisions` em `2026-09-12T21:06:44Z`, com autoridade "lead coordination decision (technical ownership)":

| ID         | Decisão                                                                                                                                                                                               | Efeito                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `D05-1`    | Migrations reservadas: `0012_channel_effect_journal` (canal, AAA-12) e `0013_runtime_effect_journal` (runtime, AAA-10); somente o Agente 2 escreve migrations.                                        | **DECIDIDA**; reserva de planejamento, **não autoriza BUILD**.                     |
| `D05-2`    | Ownership dos adapters SQL: canal + `0012` = Agente 2; runtime + `0013` especificado pelo Agente 1 (AAA-10) e implementado pelo Agente 2 sob handoff; `outbox.ts`/`postgres.ts` exclusivos de AAA-10. | **DECIDIDA**; início exige task/escopo e gate aplicável; AAA-17 não é autorização. |
| `D05-COMP` | Composição `idempotencyKey := operationKey` para efeitos governados pelo runtime; §3.1 do `aaa_data_api_contract` deve referenciar `AAA-03` rev2 antes do congelamento.                               | **DECIDIDA**; pendência documental do autor; não é aprovação de BUILD.             |

Referência de aplicação: [aaa_data_api_contract](../02_spec/aaa_data_api_contract.md) §0/§3/§10/§14 e adendo [v3 SQL handoff](../04_audit/evidence/AAA/AAA-05/addendum-agent2-v3-sql-handoff.md). Essas decisões são de **coordenação técnica/ownership**: não equivalem a aprovação humana de negócio, segurança, operação ou produção, e não congelam SPEC.

### 6.2 Pendente — autoridade humana/operacional

| ID             | Decisão                                                           | Autoridade                        | Status  | Impacto                                                                                                                 |
| -------------- | ----------------------------------------------------------------- | --------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `D05-3`        | Retenção aprovada do journal (dias) e TTL de deduplicação inbound | Operação + segurança              | PENDING | Contrato usa provisório (30 dias; `UNCERTAIN` nunca expira automaticamente); `AAA-24` depende.                          |
| `D05-4`        | Provider/canal idempotente ou consultável em homologação          | Integrações + segurança           | PENDING | Reconciliação externa permanece bloqueada; interface com D04.                                                           |
| Exceções       | Exceções de vulnerabilidade moderada e licenças desconhecidas     | Autoridade técnica + segurança    | PENDING | `AAA-14` aceita "exceção explícita com prazo" somente com autoridade; nenhuma exceção criada.                           |
| Risco residual | Aceite formal do risco residual do candidato                      | Autoridades técnicas/operacionais | PENDING | Sem aceite, não há signoff; `AAA-38`/`AAA-41`/`AAA-42`.                                                                 |
| Signoff        | Signoff humano do candidato e do cenário operacional              | Autoridade identificada           | PENDING | `AAA-38` (`G_HUMAN`); signoff não inferido de silêncio, tempo ou nota ([0326](../03_build/0326_aaa_backlog.md) AAA-38). |

Referência de retenção provisória: [aaa_data_api_contract](../02_spec/aaa_data_api_contract.md) §10; referência de exceções: [aaa_quality_contract](../02_spec/aaa_quality_contract.md) §6 ("Exceções de vulnerabilidade/licença ficam pendentes até autoridade humana; nenhuma exceção é criada por este contrato").

### 6.3 Estado consolidado de D05

- `D05-1`/`D05-2`/`D05-COMP`: **DECIDIDAS** em coordenação técnica (planejamento/ownership).
- `D05-3`/`D05-4`: **APPROVED — opção A** em 2026-09-13 (retenção/deduplicação 30 dias; TTL inbound 30 dias; UNCERTAIN nunca expira automaticamente; provider idempotente/consultável exigido quando D04 autorizar). Exceções, risco residual e signoff: **adiados por D05-SIG=A** até candidato requalificado; nenhuma exceção concedida.

## 7. Quadro consolidado de decisões

| ID        | Autoridade necessária                   | Status       | Opções (resumo)                                                         | Impacto principal                                                   | Bloqueadas                                      | Não bloqueadas                                  |
| --------- | --------------------------------------- | ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `D01`     | Produto + responsável técnico humano    | **APPROVED (C)** em 2026-09-13 | A runtime atual; B LangGraph; C convivência com fronteira               | Runtime canônico, RF-011, não-bypass e contratos de composição      | `AAA-06` (`G_D01`); `AAA-21` (`G_D01_SPEC`)     | `AAA-07`–`AAA-11` (correções locais, `G_SPEC`)  |
| `D02`     | Produto + segurança/operação            | **APPROVED (A)** | A draft-only; B ampliar draft; C ação real                              | Semântica de draft, campos permitidos, retenção e fronteira do real | Nenhuma por gate próprio; afeta aceite `AAA-08` | `AAA-07`–`AAA-11`; preparação de contrato       |
| `D03`     | Operação + dono do serviço              | **APPROVED (A)** | Aprovar/ajustar/rejeitar alvos propostos e definir perfil/janela        | SLO, disponibilidade, RPO/RTO, retenção e critérios A20             | `AAA-32` (`G_D03_SPEC`); aceite de `AAA-31`     | Medição de baseline como proposta               |
| `D04`     | Donos das integrações/dados + segurança | **APPROVED (A)** | Escolher IdP/provider/canal/fonte/egress/homologação                    | Egress, credenciais, fonte institucional e homologação              | `AAA-37`; `AAA-38`; `AAA-39`                    | Simuladores locais, contratos e briefing        |
| `D05-1`   | Coordenação/lead (técnica)              | **DECIDIDA** | Reserva `0012`/`0013`, escrita de migrations pelo Agente 2              | Planejamento de migrations; não autoriza BUILD                      | —                                               | Planejamento/handoff SQL (com task/escopo/gate) |
| `D05-2`   | Coordenação/lead (técnica)              | **DECIDIDA** | Ownership dos adapters SQL e handoff                                    | Quem especifica/implementa persistência durável                     | —                                               | Planejamento/handoff SQL (com task/escopo/gate) |
| `D05-3`   | Operação + segurança                    | **APPROVED (A)** | Definir dias de retenção e TTL de deduplicação                          | Retenção do journal e higiene de deduplicação                       | Nenhuma por gate próprio; afeta `AAA-24`        | Uso provisório (30 dias) registrado no contrato |
| `D05-4`   | Integrações + segurança                 | **APPROVED (A)** | Exigir provider idempotente/consultável ou aceitar reconciliação manual | Reconciliação externa de efeito incerto                             | Reconciliação externa de `AAA-12`/`AAA-21`      | Testes locais com fixtures                      |
| `D05-SIG` | Autoridades técnicas/operacionais       | **DEFERRED (A)** | Exceções, risco residual e signoff                                      | Promoção do candidato e aceite de exceções                          | `AAA-38`; fechamento de `AAA-42` (`G_FINAL`)    | Preparação de dossiê de exceções/risco          |

## 8. Não aprovar por silêncio

- Decisão só existe quando **registrada pela autoridade competente** com: identificação da autoridade, escopo, artefato/hash de referência, data e, quando aplicável, expiração.
- **Ausência de resposta, silêncio, tempo decorrido, resultado verde, nota, volume de testes ou recomendação do builder não constituem aceite.** Campo vazio nunca é aprovação.
- Nenhum nome de responsável, prazo contratual, orçamento, credencial ou participante de homologação pode ser inventado; onde não houver dado real, o campo permanece `PENDING`.
- `NOT_RUN`, `SKIPPED`, `UNKNOWN` e `BLOCKED` nunca satisfazem critério obrigatório; a ausência de PostgreSQL ou de integração externa não torna o critério "não aplicável" ([aaa_quality_contract](../02_spec/aaa_quality_contract.md) §1/§9).
- D01 (C), D02 (A), D03 (A), D04 (A), D05-3/4 (A) foram registradas em 2026-09-13; D05-SIG foi adiada por decisão explícita; o lead desbloqueia apenas as tasks afetadas por cada decisão. D04=A mantém AAA-37/38/39 bloqueados.
- Produção, dados reais, ações sensíveis, integrações externas, egress e homologação permanecem `NO-GO`.

## 9. Evidência e verificação

- Manifesto: [manifest.json](../04_audit/evidence/AAA/AAA-02/builder/manifest.json) (arquivos, `sha256`, `observedAt`, comandos de verificação documental e resultados).
- Nota de verificação: [verification-note.md](../04_audit/evidence/AAA/AAA-02/builder/verification-note.md) (links resolvem; nenhuma afirmação contradiz os contratos e decisões vigentes).
- Este documento é o artefato proprietário de `AAA-02` (`ownedPaths`), sem alteração de código, de runtime state, do log mestre, do backlog canônico ou de PRDs históricos.

## 10. Limitações

1. Material de decisão: não substitui SPEC, revisão independente nem aprovação humana; não congela contratos.
2. Os números citados são propostas ou estados observados em documentos/evidências existentes; nenhuma medição nova de runtime foi executada nesta task.
3. `D05-1`/`D05-2` são decisões técnicas de coordenação; não equivalem a aprovação de negócio, segurança, operação ou produção.
4. Qualquer alteração de fonte/contrato/ledger exige revalidação deste brief, novo hash e nova revisão independente.
