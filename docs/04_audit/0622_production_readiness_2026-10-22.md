# 0622 — Auditoria de código e prontidão para produção — 22/10/2026

**Parecer: NO_GO para produção interna controlada. O programa tem remediações importantes integradas e CI verde, mas ainda há falhas de autorização, uma dependência funcional de identidade e aceites operacionais pendentes.** A auditoria foi concluída; isso não libera o software.

Fonte avaliada: main publicada `24cdb463faa1010da5fd78b6d923950ac2741713`, confirmada por `git ls-remote` e API do GitHub. O checkout compartilhado permanece em `3704e3f8`, nove commits atrás. Não foi atualizado, restaurado ou integrado nesta rodada. Os testes da fonte atual rodaram em snapshot próprio, com Node22.23.2 e dependências do lockfile dessa revisão.

## Resultado verificável

| Verificação                                                                            | Resultado                                                                | Limite                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Typecheck da fonte publicada                                                           | PASS, exit0                                                              | Sem emit                                                                                                |
| ESLint de apps/packages/legacy/products/scripts/tests e configs indicadas na evidência | PASS, exit0                                                              | Arquivos temporários da auditoria fora do escopo                                                        |
| Regressões focadas na fonte publicada                                                  | 241/241 PASS, zero skip                                                  | Runtime, orçamento, gateway/canais, autorização, tasks, sessão e produto; não substitui suíte integral  |
| Sondas públicas de orçamento/cancelamento                                              | 7/7 PASS                                                                 | Expectativas do comportamento corrigido; inclui dois controles bons                                     |
| Caracterização adversarial dos resíduos                                                | 4/4 observações confirmadas                                              | PASS da sonda significa defeito reproduzido, não aprovação do programa                                  |
| Dependências no registro em22/10                                                       | Produção:0; completo:3 moderate,0high/critical                           | Três nós da árvore de desenvolvimento associados a Vitest/mocker, não três falhas distintas de produção |
| Verify, Security e Product no GitHub                                                   | SUCCESS no SHA24cdb463f                                                  | Evidência do CI consultada; não executado novamente pelo auditor                                        |
| Proteção da main                                                                       | Ativa:5 checks obrigatórios e enforce_admins                             | Aprovação externa configurada em0, conforme decisão anterior do mantenedor                              |
| Integridade da inspeção                                                                | 1378 inputs da snapshot atual e1288 inputs do checkout antigo sem deriva | Código compartilhado e lockfiles preservados; só documentação/evidência própria escrita                 |

Resumo e arquivos brutos em [verification-summary.json](evidence/AUD-READINESS-20261022/verification-summary.json). Dados exclusivamente sintéticos. Sem deploy, push, commit, HIS, provedor, canal ou dado real. Não foi repetido certify, E2E, PostgreSQL ou smoke Docker nesta rodada.

## Achados de código que ainda afetam a fonte publicada

### R01 — P1 — Tasks e approvals não aplicam o escopo por caso

Fontes no SHA avaliado: `apps/api/src/server.ts:1736,1755,1802,1869,1914`. As listas verificam role e tenant, mas não o vínculo ao caso. O PATCH de task também não exige esse vínculo.

**Reprodução atual:** duas sessões trusted distintas do mesmo tenant, uma criadora e outra Operator sem atribuição. A segunda recebeu200 e o marcador privado sintético em `/v1/tasks` e `/v1/approvals`, e200 no PATCH da tarefa. Isso ocorreu tanto sem autoridade de principals configurada quanto com sua versão configurada. Como controle, o leitor de auditoria do caso recusou acesso com503/401. Nenhum bypass entre tenants foi demonstrado.

Impacto: conteúdo e alterações de outro caso do mesmo tenant ficam acessíveis à role sem atribuição. Já havia sido registrado como resíduo do F01; não é um novo defeito contado em duplicidade. Confiança alta, prova executável em [residual-probes.json](evidence/AUD-READINESS-20261022/residual-probes.json).

Encaminhamento: UP91-018/SPEC0251. O scout encontrou correção na candidata detached `1937337dd`, sob `/mnt/dados/cvg-work/cvg-d9ef-casescope-20261021`, com revisãoR2APPROVE. **Ainda não está na main24cdb463f.** Não foi integrada ou requalificada por esta auditoria; reutilizar a frente existente.

### R02 — P1 — Entry point trusted não fornece a autoridade de principals

Fontes: `apps/api/src/main.ts:51`, `apps/api/src/server.ts:769`, `apps/api/src/case-authorization/case-routes.ts:108`. A composição injeta o resolvedor de identidade, mas não `casePrincipalAuthority`; a versão fica null. O leitor recusa com503, inclusive para Supervisor/Admin, até existir a autoridade configurada e principals verificados.

É uma proteção que falha de forma fechada e impede o uso funcional dessas telas, não uma leitura indevida por si só. A sonda atual confirmou503 no caminho sem autoridade. Inspeção do entrypoint e revisão paralela confirmam a ausência da composição. Confiança alta.

Encaminhamento: UP91-025/SPEC0152, produtor verificado de `case_principals`, ligado à identidade/OIDC e à sua moeda de roles/ativação/revogação. Informar apenas uma string de versão não substitui esse produtor. Permanece também na candidata0251 inspecionada pelo scout.

### R03 — P2 — Criação de task/approval pode sobreviver à falha de auditoria

Fontes: `apps/api/src/server.ts:1696,1697,1816,1817`. Os POSTs salvam o recurso e depois chamam `audit.append`, sem a unidade atômica introduzida para o PATCH de status.

**Reprodução atual:** injetar falha sintética em `audit.append`. Cada POST respondeu500, mas permaneceu um recurso salvo. Impacto: cliente recebe resultado ambíguo e a trilha fica incompleta; não se demonstrou efeito externo. Confiança alta; duas sondas em [residual-probes.json](evidence/AUD-READINESS-20261022/residual-probes.json). Reprodução no adaptador em memória; o caminho SQL não foi executado nesta rodada.

Encaminhamento: resíduo UP91-018, contrato de criação e auditoria atômicas com idempotência e prova negativa. O PATCH corrigido passa suas regressões e não deve ser apresentado como ainda defeituoso.

### R04 — P2/residual — Limites de transporte ainda têm escopo incompleto

Fontes: `packages/shared/src/ssrf.ts:299` e `packages/model-gateway/src/providers/openai-compatible.ts:161`. A resolução DNS do guard compartilhado é aguardada sem receber o sinal/prazo que governa o transporte posterior. Backpressure, cabeçalhos, compressão e teto padrão também permanecem na HISO-011/D009/D011.

Evidência nesta rodada: inspeção de código e resíduo já reconhecido na integração0392; não foi feita nova sonda de DNS bloqueado. Confiança alta sobre a ausência do vínculo, sem extrapolar para incidente observado. A correção0248 já aplica limites importantes de corpo, custo e cancelamento, confirmados pelos testes atuais; este achado não os invalida.

## O que mudou desde a auditoria0621

O [PR13](https://github.com/ricardoakinaga-dev/cvg-operational-harness/pull/13) foi integrado em21/10/2026. As frentes0176,0179/0180,0248,0249,0250 e PISO008 estão na main publicada. A requalificação anterior registra que os26 defeitos originais não reproduzem na candidata integrada, preservando seus resíduos.

Esta rodada confirmou por execução a correção das sondas de orçamento e cancelamento, e executou241 regressões relevantes. Não se afirma uma reprodução nova de todos os26, de PostgreSQL ou da imagem. O código do produto foi comparado pelo scout à candidataPISO008: fontes/scripts/deploy coincidem; só o backlog difere.

As20 sondas antigas passaram contra o checkout3704, caracterizando seus defeitos. São comparação da revisão desatualizada; **não** são achados atuais da main publicada. Há um risco documental concreto: ledgers locais e recibos antigos dizem “não promovido” quando o código já entrou no remoto. A interpretação deve sempre conferir SHA e PR.

CI atual consultado no mesmo SHA:

- [Verify39576423638](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39576423638): barra, atestação, verificação independente e proveniência SUCCESS.
- [Security39576423677](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39576423677): codeql, imagem, segredos e supply-chain SUCCESS.
- [Product39576423737](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39576423737): barra do produto e build da imagem SUCCESS. A pendência antiga “build completo no CI não demonstrado” tem essa nova evidência; ainda falta vincular o artefato/digest ao deploy escolhido e verificar seu SBOM.

## Distância até uso real

Harness e Assistente de Plantão têm escopos e barras próprios pela ADR010. Os problemas de identidade da API não devem ser automaticamente atribuídos ao produto standalone, que possui allowlist e operação próprias. A barra0373 não libera o produto; a0368 não certifica o harness.

| Frente                      | Já existe                                                                                         | O que falta para o aceite                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness/API trusted         | Sessão, RLS, fencing, budgets, cancelamento e regressões integradas                               | Integrar/requalificar0251; produtor verificado de principals; resolver criação/audit e o perfil aplicável dos resíduos de transporte                    |
| Independência do harness    | Isolamento físico/documental e checker conservador                                                | HISO005/B6 e HISO014 sem aceite positivo. INCOMPLETE é ausência de prova, não contagem de bugs. Reparos de análise em candidatas não valem como release |
| Produto                     | Confirmação, retry, homônimos, revogação, lembretes, journal, imagem e ferramentas de recuperação | Recibo de preview/token de revisão e aceites remanescentes nos PISO; escopo funcional e piloto específico                                               |
| Organização clínica por IA  | NO_MODEL efetivamente impede chamada clínica                                                      | D2 continua aberta: decidir explicitamente o escopo; não contornar classificação/policy. Nota bruta não equivale a extração clínica automática pronta   |
| Ambiente hospitalar         | Runbooks, compose on-prem, Vault/Keycloak/túnel e backups previstos                               | Provisionar/verificar destino, segredos, firewall por destino, identidade, imagem/digest e restore no destino; monitor em outra máquina e receptor real |
| Canal/áudio e homologação   | Adapters e corpus sintético planejados                                                            | Exercitar WAHA/Evolution e Whisper local, corpus20 casos/10 áudios, guia e responsáveis; registros administrativos aplicáveis                           |
| Piloto e operação assistida | PISO010 define2 plantonistas/2 semanas                                                            | Pacote do candidato, evidências da0368 no mesmo deploy e decisão humana específica; só então acompanhar o piloto                                        |

Na0368 há8 condições; HIS é N/A na fase1 conforme PISO010. Para as7 aplicáveis, **não foi encontrada evidência suficiente do aceite conjunto no destino escolhido**. Isso não significa0% de implementação: há controles e provas locais para várias delas. Não houve acesso ao servidor nesta auditoria; a ausência é de comprovação disponível, não prova de que ninguém o provisionou.

Condições a demonstrar no mesmo deploy: equipe permitida, poder zero/rede efetiva, segredos, tratamento/retenção e transcrição no escopo acordado, restore, alerta recebido e desligamento/retomada. Preservar D1–D4; não solicitar novamente decisões já tomadas. D2 e aceite do candidato são pendências distintas.

## Estimativa de trabalho restante

Estimativa de planejamento, confiança baixa a média: **8–15 dias úteis para preparar e qualificar um candidato a piloto interno**, com engenharia e operação disponíveis, servidor/acessos prontos, reaproveitamento da0251 e decisões sem espera longa. Não é data prometida nem medição de velocidade da equipe.

| Pacote                                              | Esforço estimado | Dependência                                                                  |
| --------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| Integrar0251 e regressão conjunta                   | 1–3 dias         | Frente existente, revisão e CI na composição final                           |
| Produtor de principals/identidade trusted           | 3–7 dias         | Contrato de identidade e acesso ao IdP; pode crescer com topologia/revogação |
| Criação/audit e limites aplicáveis                  | 2–4 dias         | SPEC e gates dos contratos; execução em paralelo quando disjunta             |
| Destino, restore, alerta, canal/áudio e homologação | 3–7 dias         | Infra/acessos e responsáveis; parte pode correr em paralelo                  |
| Requalificação do candidato e pacote de aceite      | 1–2 dias         | Mesmo SHA/imagem/digest e evidências finais                                  |

As faixas não são somadas mecanicamente: há paralelismo e dependências. **Depois da autorização do piloto, o plano já prevê duas semanas de acompanhamento.** Um ciclo favorável até a decisão posterior ao piloto fica em cerca de4–5 semanas corridas. Sem servidor/IdP/canais disponíveis, decisãoD2 ou fechamento justificável da fronteiraB6, não há prazo confiável; essas dependências podem dominar o calendário. Esta estimativa não inclui concluir paridade integral com Codex/Claude, que é programa separado, nem garante produção irrestrita, vedada pela constituição.

Próxima ação executável: reconciliar a candidata0251 existente com a main24cdb463f, conferir seus aceites e planejar a composição do produtor de principals; registrar o candidato de release e, em paralelo, verificar a disponibilidade real do destino. Esta rodada solicita auditoria, portanto não executou a implementação ou o deploy.

## Método e continuidade

Engineering-framework e orchestrate em modo scout-assisted: dois scouts readonly, um para API/persistência e outro para produto/operação. Lead conferiu fontes, remoto, CI, dependências e execuções próprias. Depois da síntese, um revisor separado do autor conferiu relatório, contagens, resíduos, CI e limites: APPROVE_REPORT, zero obrigatórios. [Parecer](evidence/AUD-READINESS-20261022/report-review.json). Aprova a consistência do relatório, não concede GO de software, piloto ou produção.

As primeiras sondas de resíduos tiveram três erros de fixture: Supervisor sem `task:update` e chamada a `listAll` inexistente. A saída foi preservada em `residual-tests-fixture-attempt1.json`; só a fixture de auditoria foi ajustada, com dois Operators distintos e método `list`. A execução final confirmou4 observações. Nenhuma expectativa do programa foi relaxada.

Ledgers99/20/30 já estavam modificados por outra frente. A regra5 de coordenação impede sobrescrevê-los; [handoff próprio](../08_runtime/handoffs/aud_readiness_20261022.md) contém as entradas prontas para integração. Backlogs canônicos UP91/PISO/HISO preservados, sem criar nova fila concorrente. A auditoria não fecha os cartões de remediação nem presume aceite humano.
