# PROD-14 — pacote de decisões revisável

13/09/2026. Autoridade: preparação documental solicitada na reauditoria; nenhuma decisão humana presumida. Referência completa: [decision brief](../01_prd/aaa_decision_brief.md). As propostas abaixo não são resultados medidos nem permissões de produção.

| Decisão | Proposta concreta para revisão                                                                                                                               | Informação/autoridade necessária                                                                                                                       | O que libera após registro e SPEC                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| D01     | C: LangGraph coordena workflow, kernel vigente mantém identidade, policy, approval, idempotência, persistência e efeito. Alternativas A/B e custos no brief. | Produto + responsável técnico: escolher A/B/C e justificar; A exige alterar RF-011.                                                                    | AAA-06: ADR e fronteira; depois PROD-04 e AAA-21: ApprovalStore durável e composição sem bypass. Não libera canais reais. |
| D02     | Manter draft como intenção sem efeito real nesta fase. Para ampliar, fornecer lista fechada de campos, TTL e auditoria.                                      | Produto + segurança/operação: confirmar escopo e campos/retenção.                                                                                      | Aceite semântico AAA-08 e contrato da retomada PROD-07; não autoriza confirmar/reagendar consulta real.                   |
| D03     | Revisar propostas existentes: persistência p95≤2s, ack≤10s, rampa 10k→100k eventos, soak 24h, disponibilidade 99,9%, RPO≤5min/RTO≤30min.                     | Operação + dono: CPU/RAM/storage, concorrência, tamanho/evento, janela de observação, orçamento e metas aprovadas.                                     | AAA-31/32: ensaio comparável e restore físico. Pode-se medir baseline sintético antes; não emitir aceite de SLO.          |
| D04     | Homologação separada, com corpus sintético e efeitos controlados; escolher cada integração separadamente.                                                    | Donos + segurança: IdP/protocolo/audience/tenant mapping; modelo/retenção/custo; canal/limites; corpus/owner/versão/revogação; allowlist/janela/abort. | AAA-37/39 no ambiente e escopo aprovados; cada endpoint e fonte precisam de registro.                                     |
| D05-3/4 | Revisar retenção provisória de 30 dias, TTL inbound e tratamento UNCERTAIN sem expiração automática; exigir provider idempotente ou consultável.             | Operação/segurança/integrações: dias/TTL aprovados, capacidade de consulta/reconciliação.                                                              | Aceite AAA-24 e reconciliação externa sob D04; nenhum descarte automático incerto.                                        |
| D05-SIG | Adiar signoff até candidato requalificado, risco residual e evidências completos.                                                                            | Autoridade identificada: aceitar/rejeitar exceções individualmente com prazo e escopo; assinar candidato/hash e ambiente.                              | AAA-38/41/42 e G_RELEASE apenas quando todos os demais gates fecharem.                                                    |

## Registro a preencher pela autoridade

```text
decision_id:
status: PENDING | APPROVED | REJECTED
selected_option / approved_parameters:
authority_name_and_role:
decided_at:
reference_artifact_and_sha256:
environment_and_effect_scope:
justification:
valid_until / review_trigger:
constraints_and_revocation:
```

## Registros emitidos

### D01 — APPROVED (opção C) — 2026-09-13

```text
decision_id: D01
status: APPROVED
selected_option / approved_parameters: C — convivência com fronteira explícita: LangGraph coordena a composição de workflow atrás de adapter/fronteira; o kernel governado vigente mantém autoridade de identidade, policy, approval, idempotência, persistência e efeito; nenhum caminho LangGraph alcança efeito sem a cadeia de governança.
authority_name_and_role: solicitante humano da sessão (resposta explícita à consulta de decisão); nome/cargo formal não informado — ratificação nominal pelo responsável designado permanece recomendada.
decided_at: 2026-09-13T15:53:14.359Z
reference_artifact_and_sha256: docs/02_spec/prod20260913_decision_packet.md sha256 3ba82555bbf805fce2135f535abff566060acac14fddffedee3f5c6543a2acde; docs/01_prd/aaa_decision_brief.md sha256 f30a5c6aa02865fc0e07daf34652ed8600198e8ad2f9a300f423ded7a8212df6 (hashes no momento do registro; o texto do brief foi atualizado depois para refletir o registro).
environment_and_effect_scope: escolha de runtime canônico do programa PROD-20260913, em ambiente local controlado/sintético; não aprova D02–D05, canais/providers/IdP reais, efeitos reais, dados reais, homologação, deploy ou produção.
justification: mantém RF-011 atendido por execução real de workflow com menor custo e sem reconstruir a cadeia de governança; não-bypass garantido por contrato de fronteira e regressões (ver §2.3 do brief).
valid_until / review_trigger: revisar se o contrato de fronteira não comprovar não-bypass, se B for exigido, ou na próxima mudança material do runtime.
constraints_and_revocation: sem segundo caminho de autoridade/efeito; fronteira falha fechada; revogação por decisão equivalente da autoridade.
```

D02–D05 permanecem **PENDING**; este registro não os aprova.

### D02 — APPROVED (opção A) — 2026-09-13T17:00:13.688Z

```text
decision_id: D02
status: APPROVED
selected_option / approved_parameters: A — congelar draft-only; campos atuais do draft (tutor: telefone/nome; pet: nome/espécie; candidatos; vínculo), TTL 24h; confirmação/reagendamento/cancelamento reais permanecem negados.
authority_name_and_role: solicitante humano da sessão (resposta explícita); nome/cargo formal não informado — ratificação nominal recomendada.
decided_at: 2026-09-13T17:00:13.688Z
reference_artifact_and_sha256: packet fc858d8dfc02dad1f201965094d63eba28f0bcfac79675c12b59c1f9ee2de406; brief c437faecf68511587703927aaf0f4435052b2250e35d558996bd944ebbf17bd1 (hashes antes deste registro)
environment_and_effect_scope: escopo controlado/sintético; PROD-07 pode contratar a retomada de drafts; nenhum efeito real.
justification: menor risco; preserva invariantes do contrato AAA-03/AAA-08.
valid_until / review_trigger: revisar antes de qualquer ampliação de campos/efeito real (D04).
constraints_and_revocation: sem ação real; ampliação exige nova decisão.
```

### D03 — APPROVED (opção A) — 2026-09-13T17:00:13.688Z

```text
decision_id: D03
status: APPROVED
selected_option / approved_parameters: A — alvos de laboratório aprovados: p95 persistência ≤2s; ack ≤10s; rampa 10k→100k eventos; soak 24h; disponibilidade 99,9%; RPO ≤5min; RTO ≤30min. Hardware/janela finais do ambiente alvo continuam a cargo de Operação; aceite de produção só após medição no ambiente autorizado.
authority_name_and_role: solicitante humano da sessão (resposta explícita); nome/cargo formal não informado.
decided_at: 2026-09-13T17:00:13.688Z
reference_artifact_and_sha256: packet fc858d8dfc02dad1f201965094d63eba28f0bcfac79675c12b59c1f9ee2de406
environment_and_effect_scope: medições locais/sintéticas como baseline; nenhuma promessa de produção. Destrava AAA-31/32 em laboratório.
justification: alvos propostos revisados no pacote; permitem ensaios comparáveis sem inventar SLO de produção.
valid_until / review_trigger: revisar após primeiras medições; qualquer mudança de hardware/escopo reabre.
constraints_and_revocation: produção continua condicionada a medição e signoff.
```

### D04 — APPROVED (opção A) — 2026-09-13T17:00:13.688Z

```text
decision_id: D04
status: APPROVED
selected_option / approved_parameters: A — manter todas as integrações reais (IdP, provider, canal, fonte institucional, egress) bloqueadas; preparar briefing de homologação com escopo/limites, sem executar. Nenhuma credencial/endpoint/janela criada.
authority_name_and_role: solicitante humano da sessão (resposta explícita); nome/cargo formal não informado.
decided_at: 2026-09-13T17:00:13.688Z
reference_artifact_and_sha256: packet fc858d8dfc02dad1f201965094d63eba28f0bcfac79675c12b59c1f9ee2de406
environment_and_effect_scope: fixtures/simuladores locais apenas; AAA-37/38/39 permanecem bloqueados.
justification: evita homologação sem donos/credenciais/janela; mantém NO-GO externo.
valid_until / review_trigger: nova decisão explícita por integração.
constraints_and_revocation: nenhum egress/custo/participante.
```

### D05-3/4 — APPROVED (opção A) — 2026-09-13T17:00:13.688Z

```text
decision_id: D05-3/4
status: APPROVED
selected_option / approved_parameters: A — retenção do journal/deduplicação 30 dias; TTL inbound 30 dias; UNCERTAIN nunca expira automaticamente; homologação deve exigir provider idempotente/consultável (quando D04 autorizar).
authority_name_and_role: solicitante humano da sessão (resposta explícita); nome/cargo formal não informado.
decided_at: 2026-09-13T17:00:13.688Z
reference_artifact_and_sha256: packet fc858d8dfc02dad1f201965094d63eba28f0bcfac79675c12b59c1f9ee2de406
environment_and_effect_scope: aceite AAA-24 no escopo controlado; nenhum descarte destrutivo.
justification: valores já registrados como provisórios no contrato de dados; agora aprovados como política da fase.
valid_until / review_trigger: revisar com D04/operação.
constraints_and_revocation: UNCERTAIN preservado; purga nunca permite duplicação.
```

### D05-SIG — APPROVED (opção A) — 2026-09-13T17:00:13.688Z

```text
decision_id: D05-SIG
status: APPROVED
selected_option / approved_parameters: A — adiar o signoff até candidato requalificado, risco residual e evidências completos; nenhuma exceção de vulnerabilidade/licença concedida agora.
authority_name_and_role: solicitante humano da sessão (resposta explícita); nome/cargo formal não informado.
decided_at: 2026-09-13T17:00:13.688Z
reference_artifact_and_sha256: packet fc858d8dfc02dad1f201965094d63eba28f0bcfac79675c12b59c1f9ee2de406
environment_and_effect_scope: AAA-38/41/42/G_RELEASE permanecem condicionados.
justification: não usar exceção para encerrar gate; signoff exige candidato/hash/ambiente.
valid_until / review_trigger: reavaliar no gate de release.
constraints_and_revocation: nenhuma assinatura implícita.
```

D01–D05 estão agora registradas ou explicitamente resolvidas; D04=A mantém AAA-37/38/39 bloqueados.

Campo ausente mantém PENDING; a escolha D01 não aprova automaticamente D02–D05. Nenhum segredo deve ser escrito neste registro. Depois da decisão, atualizar o brief/ledger, avaliar dependências, congelar SPEC e registrar task antes do BUILD.

## Ordem executável

1. Encerrar a reauditoria M1: readiness, sessão/formulário, tarefa/auditoria/replay, limpeza SQL e preflight, com regressões e revisão independente.
2. Registrar D01 e produzir ADR/contrato; implementar PROD-04/AAA-21 conforme a opção escolhida.
3. Contratar PROD-07/08/09 (retomada de drafts, handoff real observável no fluxo controlado e paginação de conversas), usando D02 onde aplicável.
4. Qualificar candidato Node22, empacotamento, OTel composto, segurança, mutações e holdout; executar carga/restore conforme D03 e homologação conforme D04.
5. Reauditar integralmente as 20 áreas sob a barra congelada; somente depois submeter candidato identificado ao signoff D05.

Estado desta entrega: pacote preparado; decisões humanas PENDING, PROD-14 não VERIFIED. Produção NO-GO.
