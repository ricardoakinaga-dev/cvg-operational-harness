# Contrato de composição do runtime — AAA-06 (D01 opção C)

- Task: `AAA-06` — "Especificar composição, produto e evolução do runtime". Gate: `G_D01`.
- Revisão: v2 (2026-09-13) após revisão independente `APPROVE_WITH_CONDITIONS`; condições C1–C4 do parecer fechadas (§10). **Status: `FROZEN` por hash no registro da rodada; qualquer mudança material exige nova revisão.**
- Decisão que autoriza: `D01 = C — convivência com fronteira`, registrada em 2026-09-13 no [pacote de decisões](prod20260913_decision_packet.md) (§Registros emitidos). O registro veio de resposta explícita do solicitante humano da sessão; nome/cargo formal não informado — ratificação nominal pelo responsável designado permanece recomendada. Este contrato implementa a decisão; não amplia autoridade de efeitos, canais, dados ou produção.
- Dependências verificadas: `AAA-02` (brief/pacote), `AAA-03` (contrato de execução), `AAA-05` (contrato de dados/APIs).
- Escopo documental (SPEC): fronteira LangGraph↔kernel, invariantes de não-bypass, contratos de consumidor/redaction/rollout e plano de verificação. O código da fronteira é `AAA-21`; o `ApprovalStore` durável é `PROD-04`; o consumidor contínuo é `AAA-19`; a identidade confiável é `AAA-20`.
- Fixtures sintéticas apenas; nenhuma fonte institucional, canal, provider ou IdP reais.

## 1. ADR-001 — runtime canônico com fronteira de workflow

**Contexto.** O RF-011 pede execução de workflow LangGraph. O kernel governado (`GovernedAgentRuntime`) já concentra identidade-para-decisão→policy→approval→journal→efeito→audit com testes. A opção B (migrar tudo) exigiria reconstruir e requalificar essa cadeia; a opção A deixaria o RF-011 apenas formalmente alterado.

**Decisão (D01=C).** LangGraph passa a poder coordenar a composição do workflow (etapas, transições, retomada de fluxo) **atrás de uma fronteira contratual**. O kernel governado permanece a autoridade de decisão vinculada à identidade (tenant/papel/escopo), policy, proposta imutável, aprovação, idempotência, journal de efeito, persistência, auditoria e execução; a produção de claims confiáveis de identidade pertence ao resolver de `AAA-20`. Nenhum nó LangGraph executa efeito, chama o executor de ferramenta, enfileira outbox ou grava estado diretamente.

**Consequências (alvo, não estado atual).**

- O RF-011 **será atendido** quando `AAA-21` entregar a execução real de workflow na fronteira, sem segundo caminho de autoridade.
- Toda etapa de workflow é convertida em `GovernedTurnInput` pela composição e passa por policy antes de qualquer efeito.
- A fronteira falha fechada: `langgraph-frontier` selecionado sem adapter → rejeição `frontier_not_configured`; env ausente → `governed-kernel`; valor desconhecido → falha no startup.
- LangGraph é dependência opcional e bloqueada por supply-chain (`AAA-14`) quando adicionada; a ausência dele mantém o caminho atual (`governed-kernel`).

**Gatilhos de revisão.** Falha comprovada de não-bypass; necessidade de B por decisão formal; mudança material no kernel ou no contrato de journal.

## 2. Cadeia inviolável e invariantes de não-bypass

Cadeia canônica (inalterada): `identidade → policy → proposta imutável → aprovação/reserva → journal → adapter autorizado → efeito → confirmação/UNCERTAIN → audit/timeline`. Toda etapa carrega `tenantId`, identidade da operação (derivada pelo kernel; ver §3) e `correlationId`.

| #   | Invariante                                                                                                                                                                                                       | Verificação                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Nenhum caminho de workflow alcança `toolExecutor`, outbox ou adapter de efeito fora do kernel; a fronteira só produz `WorkflowPlan`/`WorkflowStep`, convertidos pela composição em `GovernedTurnInput`.          | Checagem de imports dos módulos de fronteira/grafo (proibido importar `toolExecutor`/outbox/adapters); teste negativo: passo que tenta invocar efeito fora do kernel é `denied`. |
| N2  | O payload executado é idêntico ao `proposalHash` aprovado; divergência falha fechado.                                                                                                                            | Regressões F01/F02/T-16/T-19 reexecutadas no caminho composto.                                                                                                                   |
| N3  | A aprovação é durável e vinculada à operação (`operationKey`), com CAS/fencing entre gerações.                                                                                                                   | `PROD-04`: restart mantém proposta/reserva; duas conexões/gerações não reutilizam token.                                                                                         |
| N4  | Efeito **real** (`real_authorized` ou high-risk/ADMIN) exige journal durável; sem journal a composição falha fechado. `controlled_fake` pode executar sem journal, conforme o kernel já permite.                 | Teste de composição sem `effectJournal`: high-risk nega; `real_authorized` negado sem entrada explícita.                                                                         |
| N5  | `real_authorized` continua negado sem autorização registrada; capabilities high-risk sem declaração recebem `DENY` antes do executor.                                                                            | Matriz de capabilities (T-13/F15) no caminho composto.                                                                                                                           |
| N6  | Resultado incerto nunca reexecuta automaticamente; vira `UNCERTAIN` com reconciliação explícita.                                                                                                                 | Crash entre efeito e confirmação → `UNCERTAIN`; nenhum novo efeito no replay.                                                                                                    |
| N7  | O caminho de produção compõe o journal/inbound durável explicitamente; configuração ausente falha fechado (AAA12-R3-F02).                                                                                        | Bootstrap de API/worker com env incompleto → startup rejeitado; gate em `AAA-21`.                                                                                                |
| N8  | Minimização por construção: payloads do kernel não carregam conteúdo clínico/financeiro real; superfícies de saída (outbox/audit/logs) usam `sanitizeAuditEvidencePayload`/`redactSensitiveText` onde aplicável. | Testes de redaction nos pontos de saída e no payload persistido; revisão do ledger.                                                                                              |

## 3. Contrato da fronteira de workflow

```ts
/** Emitido somente pelo coordenador de workflow. Nunca executa efeito. */
export interface WorkflowPlan {
  planId: string
  tenantId: string
  conversationId: string
  sessionId?: string
  correlationId: string
  steps: WorkflowStep[]
}

export interface WorkflowStep {
  stepId: string
  /** Capacidade declarada em policy; o kernel decide se executa, pede aprovação ou nega. */
  capability: Capability
  action: string
  resource: GovernedResource
  dataClassification: DataClassification
  /** Chave estável da etapa quando o coordenador tiver uma; vira `idempotencyKey`. */
  idempotencyKey?: string
  /** Entrada de modelo para a etapa; nunca é o payload executado. */
  modelMessages?: ModelInput
  structuredOutput?: StructuredOutputContract
}

/** Porta implementada pela composição atrás da fronteira. O grafo não vê o kernel. */
export interface WorkflowCoordinatorPort {
  planStep(input: {
    tenantId: string
    conversationId: string
    correlationId: string
    state: unknown
  }): Promise<WorkflowPlan>
}
```

**Mapeamento normativo (substitui o termo informal `KernelCommand`).** A composição expõe `toGovernedTurnInput(plan, step, envelope)` e mapeia 1:1:

| WorkflowStep                                                | GovernedTurnInput                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capability` / `action` / `resource` / `dataClassification` | mesmos campos                                                                                                                                        |
| `idempotencyKey`                                            | `idempotencyKey` (identidade da operação derivada pelo kernel, `runtime.ts`; sem chave, o kernel usa tenant/capability/action/resource/proposalHash) |
| `modelMessages` / `structuredOutput`                        | `modelMessages` / `structuredOutput`                                                                                                                 |
| `plan.tenantId` / `plan.correlationId`                      | mesmos campos                                                                                                                                        |
| `plan.conversationId` / `sessionId`                         | mesmos campos                                                                                                                                        |
| envelope (agente/versão/perfil/prompt/modelo/limites)       | campos correspondentes                                                                                                                               |

Regras: (a) o payload executado vem exclusivamente da proposta imutável aprovada (`proposalPayload`/`modelResult`), nunca de `WorkflowStep`; (b) `operationKey` não é campo da fronteira — quando persistido em aprovação/journal, é o derivado/`idempotencyKey` do kernel; (c) o grafo não recebe `toolExecutor`, outbox, journals, repositórios ou credenciais; injeção é feita na composição; (d) modo controlado usa coordenador fake/determinístico; modo real só sob `D04`; (e) seleção por ambiente: `WORKFLOW_COORDINATOR=governed-kernel | langgraph-frontier` — env ausente → `governed-kernel`; `langgraph-frontier` sem adapter → `frontier_not_configured`; valor desconhecido → falha fechada no startup; (f) `AAA12-R3-F02`: a composição não-teste injeta journal durável explicitamente; sem configuração, envio automático falha fechado (sem `inMemory` silencioso).

## 4. Contratos de consumidor, redaction e rollout

| Consumidor | Porta existente                       | Fronteira C                                                                                    | Estado neste contrato                                                                             |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Identidade | `OperatorIdentityResolver` (`AAA-20`) | claims confiáveis separados de headers de simulação; audience/expiração/replay                 | implementado no escopo controlado; IdP real sob `D04`                                             |
| Modelo     | `ModelGateway`                        | provider fake/determinístico por padrão; provider real só sob `D04`                            | controlado                                                                                        |
| Canal      | `ChannelGateway` + adapters           | outbound suprimido no caminho controlado; envio real sob `D04`                                 | controlado; cadeia `Evolution→Gateway→Connect Desk→Secretary` preservada sem Chatwoot obrigatório |
| RAG        | catálogo/`ApprovedKnowledgeResolver`  | corpus sintético marcado; sem fonte institucional real até `D04`; ausência/revogação → handoff | controlado                                                                                        |
| UI         | painel de jornadas/handoff            | consome apenas a API pública com identidade/sessão; não cria autoridade                        | contratos de PROD-07/08/09                                                                        |

Redaction: minimização por construção no kernel; `sanitizeAuditEvidencePayload`/`redactSensitiveText` aplicados nas superfícies de persistência de saída que os usam hoje; `AAA-21` deve adicionar os testes de saída do caminho composto. Nenhum payload clínico/financeiro real em nenhum caso.

Rollout por capacidade: `appointment_draft` (draft-only) habilitado no controlado; `appointment.confirm/reschedule` negados; `appointment.cancel` somente `controlled_fake` com aprovação; qualquer `real_authorized` negado sem registro (D02/D04).

## 5. Composição de entrypoints (alvo AAA-21)

- API: `buildServerFromEnv` mantém preflight de papel/RLS, migrações e probes; injeta o coordenador conforme env; requisições carregam tenant/identidade/correlação confiáveis.
- Worker: consumer contínuo supervisionado (`AAA-19`) com backoff, lease/heartbeat, DLQ, shutdown e preflight de papel; handlers sintéticos; sweep de aprovações cabeado quando `AAA-21` compuser (hoje intencionalmente desabilitado).
- O caminho composto deve atravessar `HTTP → persistência → worker → runtime canônico → policy/approval/journal → efeito falso → audit` com restart/replay seguros (`AAA-21`).
- Sem caminhos paralelos: o runtime legado determinístico permanece apenas como modo controlado explícito; nenhuma autoridade concorrente.

## 6. Aprovações duráveis (SPEC de PROD-04)

**Decisão de interface (rota A).** `ApprovalEngine` e `ApprovalStore` passam a assíncronos (`Promise`) para suportar o adapter PostgreSQL, preservando a mesma máquina de estados; a conversão é mecânica e as chamadas já são aguardadas no runtime, mas os testes do pacote exigem revisão. Alternativa descartada: manter o engine síncrono com um segundo motor assíncrono (duplicaria autoridade de decisão).

- **Porta persistente** (`DurableApprovalStorePort`, renomeada para não colidir com `ApprovalStore`): operações de **persistência apenas** — `insert`, `get`, `update` (CAS por `status`/`revision`/`reservationId`/`reservationGeneration`), `list`, `listExpiringBefore`, `getByOperationKey` (retorna candidatos; a chave **não** é globalmente única) e `listPending`. As transições continuam no `ApprovalEngine`; nenhuma regra de decisão é duplicada.
- **Migração**: nova, `0015_runtime_approval_store` (tabela `runtime_approvals`), aditiva após `0014_journeys`, registrada em `defaultPostgresMigrations`; não reutiliza `0012/0013/0014`.
- **Autoridades existentes**: `platform_capability_approvals` (migration `0002`, `PostgresCapabilityApprovalRepository`) e `approval_requests` (migration `0000`, `repositories/approval-repository.ts`) permanecem distintas e não são duplicadas.
- **Payload**: `proposal_payload` persiste em jsonb com `data_classification`, necessário à revalidação de execução no restart; dados reais/efeitos seguem bloqueados (D02/D05). `executionRef`/`resultDigest` permanecem no journal de efeito (`0013`), não na aprovação.
- **RLS**: tabela com `ENABLE/FORCE ROW LEVEL SECURITY`, policy de tenant única e `REVOKE ALL FROM PUBLIC`, seguindo `0012`–`0014`; cada mutação em uma conexão checkada (`withTenantTransaction`).
- **Aceite** (inalterado): restart mantém aprovação/proposta/reserva; falha antes do efeito libera com evidência `no_effect`; efeito incerto não reexecuta e nunca expira automaticamente; duas conexões e múltiplas gerações não reutilizam token; testes SQL + reinício de processo + crash nas transições; F01–F05/F15/T-19 e canto multigeração P2-8 reexecutados.

## 7. Verificação (obrigatória)

1. Testes de import/estrutura: módulos de grafo não importam executor/outbox/adapters; neutralizar a guarda deve fazer o teste falhar.
2. Probes F01–F05/F15/T-19 reexecutados no caminho composto, com banco descartável.
3. Restart real de processo com proposta/reserva; matriz de crash do contrato AAA-03; neutralização das guardas de hash/fencing deve falhar o teste.
4. Duas conexões concorrentes e múltiplas gerações não reutilizam token; replay não duplica efeito.
5. Equivalência `governed-kernel` × `langgraph-frontier` em cenários sintéticos: comparar decisão de policy, estado de aprovação, contagem/digest de efeitos e correlationId.
6. Redaction/payload e não-exposição de segredos; readiness/live do caminho composto.
7. Evidência por hash em `docs/04_audit/evidence/PROD-20260913/AAA-21/manifest.json`; crítico fresco independente; sem autoaprovação.

## 8. Rollback e limites

- Reverter a fronteira = `WORKFLOW_COORDINATOR=governed-kernel` (caminho atual preservado) ou remover o adapter; nenhuma migração destrutiva.
- LangGraph não é adicionado por este contrato; se adicionado em `AAA-21`, passa por `AAA-14` (audit/licenças/SBOM) e lockfile em janela exclusiva.
- Estado atual honesto: LangGraph não existe no repositório; o coordenador, `frontier_not_configured` e a injeção são alvo de `AAA-21`. Não demonstrado por este contrato: efeito real, canal/provider/IdP/fonte reais, homologação, SLO, RPO/RTO, produção. D02–D05 permanecem pendentes.

## 9. Critérios de aceite — AAA-06

- D01 resolvida (registro acima) com ADR e fronteira explícitos.
- Contratos de consumidor, redaction e rollout por capacidade registrados.
- Fonte institucional permanece fictícia/rotulada; nenhuma integração real liberada.
- Próximas tasks (`AAA-19`, `AAA-20`, `PROD-04`, `AAA-21`) com interfaces e invariantes definidos; BUILD sujeito a SPEC própria e gate.

## 10. Fechamento das condições da revisão independente (v2)

| Condição                                                                                 | Origem   | Fechamento                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 — tipo `KernelCommand` indefinido e mapeamento opaco                                  | F1/F2    | Termo substituído pelo mapeamento normativo `toGovernedTurnInput` (§3); `operationKey`/`proposalInput` deixaram de ser campos da fronteira.                                                       |
| C2 — claims em tempo presente e N4/N8 além do código                                     | F3/F4/F6 | §1/§8 recastados como alvo (`AAA-21`); N4 restrito a efeito real/high-risk; N8 como minimização por construção + sanitização onde aplicável.                                                      |
| C3 — colisão `ApprovalStorePort` e autoridades SQL imprecisas                            | F5/F7    | Porta renomeada para `DurableApprovalStorePort` (persistência apenas); autoridades `platform_capability_approvals` (0002) e `approval_requests` (0000) nomeadas e não duplicadas.                 |
| C4 — artefato/falsificabilidade, `frontier_not_configured`, identidade, bloco de revisão | F8–F11   | §3(e) separa os casos de configuração; §7 exige neutralização, artefato `AAA-21/manifest.json` e cenários de equivalência; §1 atribui claims confiáveis a `AAA-20`; cabeçalho com revisão/status. |
