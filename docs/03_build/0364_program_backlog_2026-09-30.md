# Backlog atualizado do programa — UP91 — 30/09/2026

> Revisão histórica preservada. Após AUD0592, a versão corrente é [0367_program_backlog_reaudit_2026-09-30.md](0367_program_backlog_reaudit_2026-09-30.md).0367 possui o estado UP91;0356 conserva PR. Os resultados e cartões abaixo retratam a revisão anterior, sem reclassificação de aceite.

## Contrato e fonte de verdade

**Programa:** CVG Operational Harness como plataforma, escopo definido em 0354/0357 e atualizado pela AUD-0591. **Entrega desta rodada:** planejamento T1 `AUD0591-PLAN-001`, concluído documentalmente; planejamento original preservado; execução UP91-EXEC iniciada em rodada posterior sob claim próprio. **Release:** NO_GO.

Este backlog registra **52 unidades novas de execução UP91**, incluindo deltas, integração, revalidação e qualificação. Elas **não são52 defeitos novos nem83+52 tarefas de código independentes**. A execução reaproveita o trabalho das 83 tasks PR-\* existentes e incorpora os 23 achados,42 critérios e13 gates da AUD-0591. IDs originais não foram renumerados e correções já comprovadas não foram reabertas.

**Ownership canônico:**0356 mantém status/aceite dos IDs PR-_;0364 é a fonte de status, dependências e próximo trabalho dos IDs UP91-_;0363 ordena fases e resultados; PRD/SPEC/decision packets mantêm autoridade WHAT/HOW e gates. A tabela83 é uma fotografia de encaminhamento, não um segundo registro mutável de statusPR. Atualizar cada dono de estado apenas sob claim próprio. O JSON AUD0591-PLAN é a fotografia imutável do planejamento original. A projeção corrente de execução é regenerada por checkpoint em UP91-EXEC, derivada deste backlog; não é fonte concorrente de estado.

Fontes: [auditoria0591](../04_audit/0591_repository_audit_2026-09-30.md), [roadmap atualizado](0363_program_roadmap_2026-09-30.md), [backlog de origem 0356](0356_production_backlog_2026-09-26.md), [decisões0357](0357_production_decision_packet_2026-09-26.md), [correções anteriores0361](0361_aud0590_remediation_backlog.md), [baseline anterior0362](0362_aud0590_execution_baseline.md).

## Leitura dos cartões

- Estado inicial publicado de todos os cartõesUP91: **PROPOSED**. Consulte os cartões para estado corrente; a fotografia histórica permanece intacta. Significa trabalho registrado, não BUILD autorizado. Prontidão do próximo passo é indicada pelo gate e dependências.
- P0-R bloqueia qualificação/promoção; P1 exige resolução/prova antes do uso afetado; P2 é melhoria posterior somente se não contrariar critério obrigatório original. Não são classes de incidente em produção.
- T1 permite documentação e preparação; T2 exige task/SPEC curta e gates; T3 exige revisão explícita do usuário para contrato/schema/segurança/policy/approval; T4 exige pacote/candidato/decisão hash-bound. `T3/T4` separa implementação sintética sob T3 e qualificação/efeito/ambiente sob T4.
- Dono é **papel sugerido**, exceto holder já declarado na coordenação. Codex/Claude não ganham paths só por aparecer aqui. Conferir claims antes de toda edição.
- Dependências significam prova/insumo de saída exigido para executar ou encerrar o uso correspondente; recon e rascunho independente podem avançar antes, sem ação dependente nem falsa conclusão. Números maiores podem ser dependências quando a infraestrutura precisa anteceder a capacidade.
- TamanhoS≈1–3,M≈4–8,L≈9–15 dias úteis de engenharia; confiança baixa, sem incluir espera de decisão/infra/revisão. XL exige decomposição em fatias antes de BUILD; os subcontratos entram no próprio cartão sem criar outro backlog canônico.
- Prova esperada por cartão: manifesto de fontes/SHA/config/digest quando aplicável, comando/exitcode/ambiente, logs minimizados, positivos/negativos/falha e limitações. Caminho proposto `docs/04_audit/evidence/UP91-<ID>-<DATA>/`; ainda não criado. Nada nesta seção afirma teste futuro executado.

## Barra comum de pronto

Task com código só encerra com gate de sua trilha, evidência do candidato certo e regressão adequada: Node22, typecheck, lint, unitários, PG obrigatório e E2E conforme constituição; coverage/global+critical/evals quando pertinentes. Zero skips nos gates obrigatórios, sem baixar pisos nem remover negativos para ficar verde. Toda mudança de contrato recebe teste de consumidor; schema/durabilidade inclui crash/restart/concorrência e rollback/roll-forward pertinente. Efeitos externos, dados e configuração de conta permanecem atrás de gate específico; sensíveis exigem approval/handoff. Atualizar cartão/0356quando pertinente, evidência/log/runtime via holder, e claim. Prova isolada não encerra release.

## Visão de execução

| ID                    | Fase | Trabalho                                                          | Prioridade | Trilha | Tamanho | Dependências                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ---- | ----------------------------------------------------------------- | ---------- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [UP91-001](#up91-001) | M0   | Reconciliar baseline, claims e fatias disponíveis                 | P0-R       | T1     | S       | —                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [UP91-002](#up91-002) | M0   | Atualizar o índice operacional e integrar os handoffs documentais | P1         | T1     | S       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-003](#up91-003) | M0   | Garantir clone limpo, Node22 e builds com recursos exclusivos     | P1         | T2     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-004](#up91-004) | M0   | Reconciliar catálogo de skips, dependências de teste e cobertura  | P1         | T2     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-005](#up91-005) | M0   | Eliminar advisories aplicáveis e manter o lockfile verificável    | P1         | T3     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-006](#up91-006) | M0   | Adjudicar CodeQL e preservar a eficácia do secret scan            | P1         | T3     | L       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-007](#up91-007) | M1   | Consolidar discovery e PRD da plataforma                          | P0-R       | T1     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-008](#up91-008) | M1   | Preparar e registrar decisões de consumidor e ambiente            | P0-R       | T1     | M       | UP91-007                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-009](#up91-009) | M2   | Ligar contexto governado ao modelo de decisão                     | P1         | T3     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-010](#up91-010) | M2   | Compor resposta com observações do run                            | P1         | T3     | M       | UP91-009                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-011](#up91-011) | M2   | Reservar e contabilizar budget por tentativa                      | P1         | T3     | L       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-012](#up91-012) | M2   | Impor pisos não redutíveis de policy                              | P1         | T3     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-013](#up91-013) | M2   | Vincular prompt aprovado ao conteúdo renderizado                  | P1         | T3     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-014](#up91-014) | M2   | Exigir lifecycle durável para approvals sensíveis                 | P1         | T3     | M       | UP91-012                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-015](#up91-015) | M2   | Tornar grounding e tenant explícitos no conhecimento              | P1         | T3     | L       | UP91-010, UP91-013                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-016](#up91-016) | M2   | Redigir segredos antes do sink de auditoria                       | P1         | T3     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-017](#up91-017) | M2   | Redigir telemetria antes de SDK e exporters                       | P1         | T3     | M       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-018](#up91-018) | M2   | Publicar contrato de API e guards por operação                    | P1         | T3     | L       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-019](#up91-019) | M3   | Concluir e integrar isolamento do domínio legado                  | P0-R       | T3     | L       | UP91-001                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-020](#up91-020) | M3   | Exercitar consumidor neutro pelo contrato público                 | P0-R       | T3     | L       | UP91-007, UP91-009, UP91-010, UP91-011, UP91-012, UP91-014, UP91-015, UP91-019                                                                                                                                                                                                                                                                                                                                                     |
| [UP91-021](#up91-021) | M3   | Decompor hotspots por fatias com invariantes                      | P1         | T2     | L       | UP91-018, UP91-019                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-022](#up91-022) | M3   | Remover dependências órfãs e guardar fronteira do legado          | P1         | T3     | M       | UP91-003, UP91-004, UP91-019, UP91-020                                                                                                                                                                                                                                                                                                                                                                                             |
| [UP91-023](#up91-023) | M3   | Atualizar documentação pública e instruções de plataforma         | P1         | T1     | M       | UP91-002, UP91-007, UP91-019                                                                                                                                                                                                                                                                                                                                                                                                       |
| [UP91-024](#up91-024) | M3   | Revisar threat model e decisões de risco por capacidade           | P1         | T1     | M       | UP91-007, UP91-018                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-025](#up91-025) | M4   | Integrar OIDC/MFA e store durável no entrypoint                   | P0-R       | T3     | L       | UP91-003, UP91-018, UP91-019                                                                                                                                                                                                                                                                                                                                                                                                       |
| [UP91-026](#up91-026) | M4   | Substituir sessão atomicamente e validar autoridade/RLS           | P1         | T3     | M       | UP91-025                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-027](#up91-027) | M4   | Integrar inbox, relógio, fencing e reconciliação do webhook       | P1         | T3     | XL      | UP91-019                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-028](#up91-028) | M4   | Endurecer rate limit, TLS, CORS e superfície externa              | P1         | T3/T4  | L       | UP91-018, UP91-025, UP91-026, UP91-027                                                                                                                                                                                                                                                                                                                                                                                             |
| [UP91-029](#up91-029) | M4   | Integrar cofre e exercitar rotação por segredo                    | P0-R       | T4     | L       | UP91-008, UP91-034                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-030](#up91-030) | M4   | Fechar inventário de dados, DP01–06 e responsabilidades           | P0-R       | T1     | M       | UP91-007, UP91-008                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-031](#up91-031) | M4   | Implementar purga e retenção físicas com recuperação segura       | P0-R       | T3     | L       | UP91-026, UP91-030                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-032](#up91-032) | M4   | Implementar fluxo operacional de direitos do titular              | P1         | T3     | L       | UP91-030, UP91-031                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-033](#up91-033) | M4   | Separar migration job de serving e proteger upgrades              | P1         | T3     | L       | UP91-019, UP91-026                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-034](#up91-034) | M5   | Provisionar ambientes isolados e reproduzíveis                    | P0-R       | T4     | XL      | UP91-008, UP91-030                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-035](#up91-035) | M5   | Promover imagem por digest com assinatura e proveniência          | P0-R       | T4     | L       | UP91-003, UP91-005, UP91-006, UP91-034                                                                                                                                                                                                                                                                                                                                                                                             |
| [UP91-036](#up91-036) | M5   | Qualificar backup, PITR e recuperação de desastre                 | P0-R       | T4     | L       | UP91-029, UP91-031, UP91-033, UP91-034                                                                                                                                                                                                                                                                                                                                                                                             |
| [UP91-037](#up91-037) | M5   | Operar métricas, alertas e runbooks com responsáveis              | P0-R       | T4     | L       | UP91-017, UP91-029, UP91-034                                                                                                                                                                                                                                                                                                                                                                                                       |
| [UP91-038](#up91-038) | M7   | Medir capacidade, carga e soak representativos                    | P1         | T4     | L       | UP91-011, UP91-020, UP91-036, UP91-037, UP91-039, UP91-041, UP91-043, UP91-044                                                                                                                                                                                                                                                                                                                                                     |
| [UP91-039](#up91-039) | M6   | Compor provider escolhido com budget e fallback                   | P0-R       | T4     | L       | UP91-007, UP91-008, UP91-011, UP91-013, UP91-016, UP91-029, UP91-034                                                                                                                                                                                                                                                                                                                                                               |
| [UP91-040](#up91-040) | M6   | Publicar conhecimento institucional aprovado e revogável          | P1         | T4     | L       | UP91-008, UP91-015, UP91-016, UP91-030, UP91-039                                                                                                                                                                                                                                                                                                                                                                                   |
| [UP91-041](#up91-041) | M6   | Ligar canal e efeitos externos governados                         | P0-R       | T4     | XL      | UP91-008, UP91-014, UP91-024, UP91-027, UP91-029, UP91-030, UP91-034                                                                                                                                                                                                                                                                                                                                                               |
| [UP91-042](#up91-042) | M6   | Disponibilizar handoff, takeover e kill switch                    | P0-R       | T3/T4  | L       | UP91-020, UP91-025, UP91-037                                                                                                                                                                                                                                                                                                                                                                                                       |
| [UP91-043](#up91-043) | M6   | Qualificar console acessível com sessão corporativa               | P1         | T3     | L       | UP91-018, UP91-020, UP91-025, UP91-026, UP91-042                                                                                                                                                                                                                                                                                                                                                                                   |
| [UP91-044](#up91-044) | M6   | Fechar evals semânticos e red team de capacidades                 | P0-R       | T4     | L       | UP91-039, UP91-040, UP91-041, UP91-042                                                                                                                                                                                                                                                                                                                                                                                             |
| [UP91-045](#up91-045) | M7   | Congelar candidato e executar barra integrada de release          | P0-R       | T4     | L       | UP91-002, UP91-003, UP91-004, UP91-005, UP91-006, UP91-007, UP91-008, UP91-009, UP91-010, UP91-011, UP91-012, UP91-013, UP91-014, UP91-015, UP91-016, UP91-017, UP91-018, UP91-019, UP91-020, UP91-021, UP91-022, UP91-023, UP91-024, UP91-025, UP91-026, UP91-027, UP91-028, UP91-029, UP91-030, UP91-031, UP91-032, UP91-033, UP91-035, UP91-036, UP91-037, UP91-038, UP91-039, UP91-040, UP91-041, UP91-042, UP91-043, UP91-044 |
| [UP91-046](#up91-046) | M7   | Executar pentest, UAT, treinamento e auditoria independente       | P0-R       | T4     | L       | UP91-045                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-047](#up91-047) | M8   | Preparar pacote e obter GO/NO_GO do piloto                        | P0-R       | T4     | S       | UP91-045, UP91-046                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-048](#up91-048) | M8   | Conduzir piloto limitado com hypercare                            | P0-R       | T4     | L       | UP91-047                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-049](#up91-049) | M8   | Avaliar piloto e replanejar correções                             | P0-R       | T4     | M       | UP91-048                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-050](#up91-050) | M8   | Obter GO/NO_GO de produção controlada                             | P0-R       | T4     | S       | UP91-046, UP91-049                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [UP91-051](#up91-051) | M9   | Expandir por tenant e revisar qualidade em30dias                  | P1         | T4     | L       | UP91-050                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [UP91-052](#up91-052) | M9   | Retirar legado isolado somente após decisãoDL-05                  | P1         | T3/T4  | L       | UP91-020, UP91-022, UP91-030, UP91-036                                                                                                                                                                                                                                                                                                                                                                                             |

## Cartões executáveis

<a id="up91-001"></a>

### UP91-001 — Reconciliar baseline, claims e fatias disponíveis

- **Estado/prioridade/fase:** `COMPLETED` · P0-R · M0; trilha T1; tamanho S.
- **Responsável sugerido:** Coordenação/Codex.
- **O quê/onde:** Git, claims, worktrees e manifestos de evidência.
- **Como:** Identificar holders de PR-L04/clock/telemetria, revisar HEAD e hashes; separar commit, bytes locais e branches isolados; listar integrações candidatas sem mover ou limpar trabalho alheio.
- **Dependências:** —.
- **Gate/autoridade:** Gate documental T1; decisão humana separada quando o cartão a exigir.
- **Próxima ação:** Ler coordenação e inventariar worktrees somente leitura; registrar holder, HEAD, hash de SPEC e autorização por fatia, sem parar/limpar recursos de outros agentes.
- **Pronto/prova específica:** Manifesto da baseline atual e tabela de autoridade/ownership por fatia; próximo caminho livre conhecido; nenhum aceite transferido para outro hash.
- **Rastreio:** tasks de origem PR-001; achados A91-02, A91-20; critérios C01, C06, C07; gates de produção G04.

<a id="up91-002"></a>

- **Execução30/09:** recon concluída; [baseline0365](0365_up91_execution_baseline.md) e [manifesto](../04_audit/evidence/UP91-EXEC-20260930/baseline.json). Worktrees ausentes preservados; caminho T2 livre conhecido. Não promove PR-001 no ledger0356 nem libera T3/T4.

### UP91-002 — Atualizar o índice operacional e integrar os handoffs documentais

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M0; trilha T1; tamanho S.
- **Responsável sugerido:** Documentação/holder dos ledgers.
- **O quê/onde:** README, CURRENT_IMPLEMENTATION, 0190, ledgers e handoffs.
- **Como:** Sob claim do holder, integrar AUD0591 e este plano; corrigir ponteiros stale e estados da SPEC0162/0163; preservar históricos/hash e decisões D-12/D-13.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Gate documental T1; decisão humana separada quando o cartão a exigir.
- **Próxima ação:** Conferir os handoffs AUD0591 e deste plano com os holders; preparar a integração no topo dos ledgers e a correção de ponteiros stale sob claim documental.
- **Pronto/prova específica:** Estado corrente navegável por candidato; runtime/log/backlog refletem resultados sem apagar histórico; links/higiene/formato PASS.
- **Rastreio:** tasks de origem PR-004, PR-005, PR-006, PR-108, PR-109; achados A91-19, A91-20; critérios C01, C04, C05, C06, C07; gates de produção G04.

<a id="up91-003"></a>

- **Subfatia T1 UP91-002-NAV — VERIFY:** índicesdocsREADME/99operational apontam roadmap/backlog/execuçãoUP91 e preservam navegação antiga como histórica. Sem promover ledgers0190/99/20/30 ou aprovações. Cartão principal permanece aberto para integração coordenada dos handoffs e gates alheios.

- **Subfatia T1 UP91-002-HYG — DONE somente documental:** cinco rawlogs próprios vazios com metadata explícita no catálogo central; registros alheios e bytes selados preservados. Cópias históricas de sete documentos classificadas como rawfontes .md.txt com mapa/hash/contexto original, sem alterar documentos vigentes ou checker. Links globais0quebrados e higiene236/236/zeroerro após primeiras falhas arquivadas. Parent002 permanece aberto pelos handoffs/ledgers concorrentes.

### UP91-003 — Garantir clone limpo, Node22 e builds com recursos exclusivos

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M0; trilha T2; tamanho M.
- **Responsável sugerido:** Build/CI.
- **O quê/onde:** Scripts de build/startup, tsconfig, Dockerfiles e documentação de toolchain.
- **Como:** Revalidar fixes já integrados; remover dependência de dist antigo; desenhar saída configurável para builder temporário sem colisão e verificar clean install em cópia própria.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Aguardar a revisão explícita já solicitada da SPEC0170 (hash755f1cb…); depois implementar a coleta vinculada e provar emissão FAIL válida, sem alterar0157. Clean clone/builder exclusivo continua dependente de coordenação dos pathsPR-L04.
- **Pronto/prova específica:** Clone/cópia limpa compila API/worker/web e smoke; Node major incorreto recusa; builds não sobrescrevem recurso global de outro agente.
- **Rastreio:** tasks de origem PR-002, PR-008, PR-012; achados—; critérios C12, C30; gates de produção G04.

<a id="up91-004"></a>

- **Preparação UP91-003-CERT-PARSER — REVIEW_PENDING T3:** [SPEC0170](../02_spec/0170_certifier_metrics_parser_binding.md), bug reproduzido no certifier: ANSI em resumoVitest geraunit:null e aborta emissão do resultadoFAIL. Sem BUILDaté revisão explícita; não altera0157/headbinding ou decisão globalNO_GO.

### UP91-004 — Reconciliar catálogo de skips, dependências de teste e cobertura

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M0; trilha T2; tamanho M.
- **Responsável sugerido:** Qualidade/CI.
- **O quê/onde:** skip-catalog, workspace audit, package manifests e coverage config.
- **Como:** Adjudicar 3 hashes e 11 TEST_ONLY; declarar imports ou mover testes cruzados para tests/; atualizar baseline do auditor sem ocultar findings; documentar gates dos caminhos excluídos da cobertura.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Adjudicar os três source_drift e as contagens de skip-catalog contra fontes atuais sob coordenação de suas entradas; concluir a governança e o workspace audit. UP91-004-R2 continuaVERIFY: testes passam, mas unit adjudicadoFAIL e certificado não emitido.
- **Progresso parcial:** a investigação UP91-004-R4/SPEC0173 revelou falhas reais de transporte antes de criar testes: callback Node22 incompatível com all=true e Response204/205/304 com body inválido; HEAD também mantém body não nulo. [Provas](../04_audit/evidence/UP91-EXEC-20260930/transport-boundary-r4/baseline-conformance.json) e [SPEC0174 T3 proposta](../02_spec/0174_bound_transport_node22_compatibility.md). Nenhuma implementação corretiva ou teste novo nesta subfatia; retomar somente após gate próprio, sem enfraquecer catálogo/pisos.
- **Pronto/prova específica:** Zero skips com PostgreSQL obrigatório, skip governance e workspace audit PASS; sem ciclo artificial api-worker; denominadores/exclusões explícitos; formato sob claims próprios. Caminhos excluídos têm gate comportamental e denominador próprio; requisito da PR-007 atendido ou exceção explicitamente aprovada; nenhuma redução de piso.
- **Rastreio:** tasks de origem PR-007, PR-208; achados A91-19; critérios C30, C31, C32, C06; gates de produção G04.

<a id="up91-005"></a>

- **Subfatia UP91-004-R1 — VERIFY:** [SPEC0169](../02_spec/0169_runtime_extraction_coverage_boundary.md), incluir os quatro módulos internos extraídos no denominador kernel crítico, preservando piso95 e paths existentes; critério não pode ficar verde pela saída de controles do arquivo original.

- **Subfatia UP91-004-R2 — VERIFY:** [SPEC0171](../02_spec/0171_runtime_proposal_boundary_regressions.md), testes pela entrada pública de payload transformado não canônico antes de approval/efeito; implementação/contratos não alterados, piso preservado. Parent004 permanece aberto. Rodada2: cinco casos públicos PASS e Rawls I1 APPROVE_TEST_ONLY; candidato6646a560… executou unit2.486/PG288/E2E12, kernel505/526branches=96,01%, mutation10/10. Certificação globalFAIL sem emissão por formato/security e parserANSI; [evidência corrente](../04_audit/evidence/UP91-EXEC-20260930/round2-report.md). Subfatia segueVERIFY, sem encerrar parent004.

- **Subfatia UP91-004-R3 — VERIFY T2 somente testes:** [SPEC0172](../02_spec/0172_runtime_recovery_boundary_regressions.md); oito regressões públicas legacy/ausência EXECUTING/duas leituras e corrida de rearm, sem mudança de produto. Foco8/8 e corpus278/14arquivoszero skips, scopedtypecheck/lint/formatPASS; [I1 APPROVE_TEST_ONLY](../04_audit/evidence/UP91-EXEC-20260930/recovery-boundary-review.json) no SHA71ac93…. Certificação atual terminalFAIL no candidato867485b8…: unit2.494/330arquivos,PG288/35,E2E12zero skips/typecheck/lint/buildPASS como observações; kernel511/526branches97,15%, globalbranches87,84%aindasemmargem88.14/16comandosexit0, masunitadjudicadoFAILpor3source_drift; formato/security/parser abortam emissão. [34artefatos](../04_audit/evidence/UP91-EXEC-20260930/round3-native-certification/manifest.json) arquivados; [I1 integrado REJECT / Gauntlet3FAIL](../04_audit/evidence/UP91-EXEC-20260930/gauntlet-round3-record.json), fingerprint86da…pre/postigual. Não há certificado novo nem fechamento parent004. [Proposta de catálogo](../04_audit/evidence/UP91-EXEC-20260930/catalog-reconciliation/README.md) tem I1aceitedocumental, não adjudicação/BUILD.

### UP91-005 — Eliminar advisories aplicáveis e manter o lockfile verificável

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M0; trilha T3; tamanho M.
- **Responsável sugerido:** Segurança/dependências.
- **O quê/onde:** package manifests, lockfile e supply-chain checks.
- **Como:** Triar brace-expansion/fast-uri/undici e conjunto vigente de advisories; atualizar apenas dependências justificadas sob claim de lockfile; provar negativos/regressões pertinentes.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Rever os reports de audit da0591 e advisories vigentes; propor a menor atualização de dependências, registrar SPEC e conferir claim de lockfile antes de BUILD.
- **Pronto/prova específica:** Audits completo/produtivo da fatia corrigida sem HIGH/CRITICAL aplicável não adjudicado; inventário da fatia coerente e instalação reproduzível. SBOM e audit finais da release são reemitidos/validados em UP91-035/045; não são pré-condição de encerramento local desta correção.
- **Rastreio:** tasks de origem PR-010, PR-205, PR-305; achados A91-01; critérios C25; gates de produção G03, G04.

<a id="up91-006"></a>

### UP91-006 — Adjudicar CodeQL e preservar a eficácia do secret scan

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M0; trilha T3; tamanho L.
- **Responsável sugerido:** Segurança/CI.
- **O quê/onde:** SPEC0159, fontes ativas, security.yml e exclusions.
- **Como:** Separar 8 alertas ativos de 7 históricos observados; reconsultar alertas ao executar; corrigir regex/alias/rate-limit conforme gate, revisar allowlists sem enfraquecer scan.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Ler SPEC0159 e separar alertas atuais/históricos; vincular cada remediação a fonte/teste e gate T3; planejar os checks locais sem prometer fechamento remoto.
- **Pronto/prova específica:** Remediações e disposições locais dos alertas justificadas na fatia corrigida; negativos de secret scan continuam detectando credencial fictícia; testes/checks de segurança locais PASS. Fechamento remoto de alertas e Security verde no candidato integrado pertencem a UP91-035/045; o cartão não afirma closure remoto antecipado.
- **Rastreio:** tasks de origem PR-011, PR-011-CODEQL; achados A91-18; critérios C19, C25, C34; gates de produção G03, G04.

<a id="up91-007"></a>

### UP91-007 — Consolidar discovery e PRD da plataforma

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M1; trilha T1; tamanho M.
- **Responsável sugerido:** Produto/engenharia + usuário.
- **O quê/onde:** Discovery0019, PRD plataforma, validações0090 e contratos existentes.
- **Como:** Preservar D-03 núcleo completo; separar plataforma do secretário; fechar WHAT/capacidades, métricas, não objetivos e recorte primeiro consumidor; preparar validações na sequência CVG. Conciliar formalmente G03 do 0354 (zeroP0/P1 abertos em 0356) com tasks de piloto/pós-GA; preparar proposta de baseline/critério se houver conflito, sem alterá-lo silenciosamente. Mudança depende de decisão explícita registrada no pacote original pelo holder.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Gate documental T1; decisão humana separada quando o cartão a exigir.
- **Próxima ação:** Revisar a consolidação Discovery0097/PRD0014 e o pacoteG03 já preparado com parecer I1 favorável; obter aceite dos deltasWHAT pertinentes e definir discovery do consumidor. Preservar0354 literal até decisão explícita.
- **Pronto/prova específica:** Discovery e PRD pertinentes validados; decisões pendentes identificadas; correções de contrato existente não dependem de inventar consumidor. A interpretação/versão do gate G03 permanece a original até eventual decisão humana expressa; programação pós-GA não cria dispensa tácita de P1.
- **Rastreio:** tasks de origem PR-101, PR-102, PR-108; achados A91-20; critérios C02, C03, C04; gates de produção G02.

<a id="up91-008"></a>

- **Preparação T1 UP91-007-DOC — REVIEW_PENDING_DOCUMENTAL:** reconciliação Discovery/PRD das fontes aprovadas e pacoteG03 formal. Não é aprovação de novoPRD nem revisão da definição0354; cartão só encerra com seu critério/autoridade.

### UP91-008 — Preparar e registrar decisões de consumidor e ambiente

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M1; trilha T1; tamanho M.
- **Responsável sugerido:** Produto/segurança/operação + usuário.
- **O quê/onde:** Pacote0357 e discovery do primeiro consumidor.
- **Como:** Preparar opções concretas para consumidor/tenant/volume/SLA, provider/canal/fontes, nuvem/região/orçamento e destino de pacotes; reaproveitar D-09 decidido, sem escolher fornecedor ou produto silenciosamente.
- **Dependências:** UP91-007.
- **Gate/autoridade:** Gate documental T1; decisão humana separada quando o cartão a exigir.
- **Próxima ação:** Preparar pacote de opções/parâmetros ainda ausentes a partir de0357/discovery; obter decisões específicas somente sobre escolhas concretas, preservando as anteriores.
- **Pronto/prova específica:** Decisões por ID/hash e parâmetros operacionais registradas; indefinidos permanecem explícitos; contratos e gates sensíveis não presumidos.
- **Rastreio:** tasks de origem PR-103, PR-104, PR-105, PR-106, PR-107, PR-206; achados A91-23; critérios C02, C03, C38, C39; gates de produção G02, G06, G10, G12.

<a id="up91-009"></a>

### UP91-009 — Ligar contexto governado ao modelo de decisão

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho M.
- **Responsável sugerido:** Runtime/orquestração.
- **O quê/onde:** Context engine e hybrid-orchestrator.
- **Como:** Especificar composição canônica de objective/instructions/contextItems, proveniência/minimização e hierarquia de confiança; testar request ao modelo em composição completa.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Revisar explicitamente o módulo009 da SPEC0166 no hash modular086d39f6… (I1 readiness favorável); depois registrar claim/BUILD sintético e provar a conexão no modelo. Nenhuma autorização foi registrada.
- **Pronto/prova específica:** Marcadores autorizados chegam à chamada correta; conteúdo não confiável não eleva autoridade; omissões são detectadas; regressão de decisões determinísticas preservada.
- **Rastreio:** tasks de origem—; achados A91-03; critérios C15; gates de produção G02, G03.

<a id="up91-010"></a>

### UP91-010 — Compor resposta com observações do run

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho M.
- **Responsável sugerido:** Runtime/conhecimento.
- **O quê/onde:** iterative-dispatch, observações e ModelRequest.
- **Como:** Transportar fatos/efeitos/proveniência com limites de contexto, sem payload sensível bruto; validar efeitos incertos e fonte ausente.
- **Dependências:** UP91-009.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Revisar explicitamente o módulo010 da SPEC0166 no hash modular27a34f27… (HOW direto/intent/compose aceito pelo I1); depois integrar com009/014/015 conforme seus gates e executar positivos/negativos públicos.
- **Pronto/prova específica:** Resposta recebe observações necessárias, cita fonte quando aplicável e não confirma efeito incerto; provas com provider falso e caminho HTTP/worker.
- **Rastreio:** tasks de origem—; achados A91-04; critérios C16; gates de produção G02, G03.

<a id="up91-011"></a>

### UP91-011 — Reservar e contabilizar budget por tentativa

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho L.
- **Responsável sugerido:** Runtime/model gateway.
- **O quê/onde:** HybridOrchestrator, iterative-runtime e retries do gateway.
- **Como:** Definir dono da reserva e uso em repair/retry/erro/timeout; impedir próxima chamada além de modelCalls/tokens/custo/duração; persistir consumo no caminho durável.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Revisar explicitamente o módulo011 da SPEC0166 no hash modularb177c531… (I1 readiness favorável); depois implementar reserva por tentativa e provar preço/modelo/usageUNKNOWN/cancelamento, com recursos próprios.
- **Pronto/prova específica:** maxModelCalls=1 produz no máximo uma tentativa consumidora; erro e crash não apagam uso; concorrência, retries e deadline têm negativos significativos.
- **Rastreio:** tasks de origem—; achados A91-05; critérios C14, C30, C41; gates de produção G03.

<a id="up91-012"></a>

### UP91-012 — Impor pisos não redutíveis de policy

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho M.
- **Responsável sugerido:** Policy/segurança.
- **O quê/onde:** policy-engine, grants e profiles.
- **Como:** Combinar rule/grant/risk e restrição medical de forma explícita; registrar exceções aprovadas, se houver; preservar mecanismo sem domínio de produto.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Responder à revisão T3 já solicitada do selected_payload012 no hash modular7012a5d…; se aprovada, registrar autoridade e BUILD sintético do core. Integração final014 continua obrigatória; nenhuma decisão inferida de silêncio.
- **Pronto/prova específica:** ALLOW não reduz piso de HIGH_RISK_WRITE/ADMIN ou requisito de approval; custom profiles, emergência e conflitos exercitados.
- **Rastreio:** tasks de origem—; achados A91-06; critérios C18, C21; gates de produção G03.

<a id="up91-013"></a>

### UP91-013 — Vincular prompt aprovado ao conteúdo renderizado

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho M.
- **Responsável sugerido:** Model gateway/governança.
- **O quê/onde:** PromptRegistry, gateway e adapters.
- **Como:** Distinguir template/instrução governada de entrada dinâmica; definir renderização/digests e revogação; comparar o material exato entregue ao provider.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Revisar explicitamente o módulo013 da SPEC0167 no hash modularba2ff754… (I1 readiness favorável); depois implementar binding dos bytes/prompt aprovados e provar requests reais dos adapters sintéticos.
- **Pronto/prova específica:** Conteúdo B não executa usando aprovação de A; digest renderizado e registry version coerentes; usuário dinâmico continua permitido conforme contrato.
- **Rastreio:** tasks de origem—; achados A91-07; critérios C39; gates de produção G02, G03.

<a id="up91-014"></a>

### UP91-014 — Exigir lifecycle durável para approvals sensíveis

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho M.
- **Responsável sugerido:** Approvals/runtime.
- **O quê/onde:** ApprovalExecutionPort, dispatch e composição do worker.
- **Como:** Definir perfis de compatibilidade/sintéticos e produtivos; exigir porta durável antes de efeito sensível; não duplicar adapter já presente no worker.
- **Dependências:** UP91-012.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Revisar explicitamente o módulo014 da SPEC0167 no hash modular5886b9ca… (HOW durável aceito pelo I1); depois implementar admissão/receipt/result digest no journal existente e provar PG/CAS/recovery sem redispatch.
- **Pronto/prova específica:** Composição sensível sem lifecycle falha fechada; pausa/retomada/crash/reconciliação não reutilizam approval; journal vinculado ao efeito.
- **Rastreio:** tasks de origem PR-505; achados A91-13; critérios C11, C13, C17, C28; gates de produção G03.

<a id="up91-015"></a>

### UP91-015 — Tornar grounding e tenant explícitos no conhecimento

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho L.
- **Responsável sugerido:** Conhecimento/contratos.
- **O quê/onde:** KnowledgeSearchRequest, claim validation e profiles.
- **Como:** Exigir binding tenant por request ou adapter comprovadamente vinculado; definir claimExtractor obrigatório no uso institucional e proveniência/revogação.
- **Dependências:** UP91-010, UP91-013.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Revisar explicitamente o módulo015 da SPEC0167 no hash modular719d5561… (I1 readiness favorável); depois implementar tenant/source/coverage dos bytes e prova de revogação no caminho público, sem fonte real não aprovada.
- **Pronto/prova específica:** Tenant errado nunca lê fonte; claim sem suporte não passa por ausência de extractor; agente sem RAG preserva composição válida explícita.
- **Rastreio:** tasks de origem PR-504; achados A91-14; critérios C11, C16, C23, C39; gates de produção G03, G07.

<a id="up91-016"></a>

### UP91-016 — Redigir segredos antes do sink de auditoria

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho M.
- **Responsável sugerido:** Segurança/dados.
- **O quê/onde:** shared/audit-governance e postgres-audit.
- **Como:** Especificar allowlist de evidências, normalização de chaves e valores opacos; testar api_key/credential/privatekey e variantes antes de escrita/leitura/export.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Revisar explicitamente o módulo016 da SPEC0167 no hash modular3aff5dbd… (HOW audit/checkpoint aceito pelo I1); depois implementar sinks/read/export/refsV2 e provar adulteração/recovery/RLS no candidato correto.
- **Pronto/prova específica:** Marcadores sensíveis ausentes do sink PG e export; evento operacional mantém campos mínimos úteis; nenhum segredo real em prova.
- **Rastreio:** tasks de origem PR-403; achados A91-08; critérios C24, C29, C40; gates de produção G03.

<a id="up91-017"></a>

### UP91-017 — Redigir telemetria antes de SDK e exporters

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho M.
- **Responsável sugerido:** Observabilidade/segurança.
- **O quê/onde:** SPEC0163, spans/metrics e adapters OTel.
- **Como:** Conferir revisão atual e T3 antes de BUILD; aplicar redaction em startSpan, atributos, children e counter.add; manter teste de SDK e sink controlado.
- **Dependências:** UP91-001.
- **Gate/autoridade:** SPEC0163 tem revisão/decision packet em andamento; revalidar hash, crítico e T3 exatos, sem transferir aprovação antiga.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** A sonda F03 não retém marcador em nenhuma fronteira; positivos de diagnóstico preservados; logs/metrics/traces exercitados sem PII.
- **Rastreio:** tasks de origem PR-403, PR-604; achados A91-09; critérios C40; gates de produção G03, G10.

<a id="up91-018"></a>

### UP91-018 — Publicar contrato de API e guards por operação

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M2; trilha T3; tamanho L.
- **Responsável sugerido:** API/contratos.
- **O quê/onde:** Schemas/rotas, OpenAPI, PUBLIC_API e permissões.
- **Como:** Inventariar rotas da instância ativa e config; gerar/publicar contrato por operação/tenant/role, sem inferir autoridade pelo prefixo; teste de quebra não versionada.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Rotas protegidas e probes públicas têm positivos/negativos executados; contrato cobre input/trajectory/approval/session e estados de erro reais.
- **Rastreio:** tasks de origem PR-207; achados A91-20; critérios C11, C19, C21; gates de produção G02, G03.

<a id="up91-019"></a>

### UP91-019 — Concluir e integrar isolamento do domínio legado

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M3; trilha T3; tamanho L.
- **Responsável sugerido:** Claude Code/holder PR-L04.
- **O quê/onde:** legacy packages, API/web composition e testes de jornada.
- **Como:** Preservar fatias concluídas; coordenar liberação web/E2E/server; integrar apenas arquivos/commits pertencentes às fatias e revalidar fronteira no candidato.
- **Dependências:** UP91-001.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** API/worker/web neutros não dependem do domínio secretário; legado entra somente por composição isolada autorizada; regressões PG/E2E verdes.
- **Rastreio:** tasks de origem PR-L01, PR-L02, PR-L03, PR-L04, PR-L05, PR-L06; achados A91-21; critérios C08, C09; gates de produção G01.

<a id="up91-020"></a>

### UP91-020 — Exercitar consumidor neutro pelo contrato público

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M3; trilha T3; tamanho L.
- **Responsável sugerido:** Harness/produto de referência.
- **O quê/onde:** Exemplo neutro, runtime/worker/API e console.
- **Como:** Criar solicitação operacional sintética com coleta, tool, approval, efeito em rascunho e handoff; consumir factories/ports públicas; usar fake provider e destino de efeito controlado.
- **Dependências:** UP91-007, UP91-009, UP91-010, UP91-011, UP91-012, UP91-014, UP91-015, UP91-019.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Um fluxo vertical API→worker→PG→approval/handoff→resposta funciona sem legacy; crash/resume e tenant negativo comprovados; não substituir aprovação institucional por fixture.
- **Rastreio:** tasks de origem PR-L07, PR-701; achados A91-21; critérios C08, C09, C13, C17; gates de produção G01, G02.

<a id="up91-021"></a>

### UP91-021 — Decompor hotspots por fatias com invariantes

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M3; trilha T2; tamanho L.
- **Responsável sugerido:** Backend/frontend por módulo.
- **O quê/onde:** server.ts, runtimes e repositories/client/frontend.
- **Como:** Priorizar boundaries de ownership e mudança; preservar extrações já integradas; uma fatia/SPEC com AST ou equivalência relevante e regressões, sem alteração pública implícita.
- **Dependências:** UP91-018, UP91-019.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** Manter extraçõesR1/R2 emVERIFY e corrigir qualificação pela trilha aplicável; continuar demais hotspots/contratos de PR-201/202/203 após insumos018/019 e claims. Runtime1498linhas não encerra server5531 ou o cartão integral.
- **Pronto/prova específica:** Módulos com responsabilidade única, limites de tamanho da PR-201 atendidos ou desvio aprovado; sem queda de cobertura/contrato/performance; runtime antigo e iterativo têm mapa claro. Não adiar PR-201/202/203 por rótulo de prioridade novo; qualquer alteração de aceite original exige disposição individual e aprovação competente registrada.
- **Rastreio:** tasks de origem PR-201, PR-202, PR-203; achados A91-21; critérios C08, C10; gates de produção G01.

<a id="up91-022"></a>

- **Subfatia UP91-021-R1 — VERIFY:** extração interna da recuperação de efeitos sob [SPEC0165](../02_spec/0165_runtime_effect_recovery_extraction.md), T2. Só esta organização interna iniciou BUILD. Cartão principal aberto até todos os hotspots e dependências serem satisfeitos; sem redução de contratos/segurança ou encerramento por contagem de linhas parcial. Próxima ação: verificar AST, runtime público, gates T2 e crítico fresco.

- **Subfatia UP91-021-R2 — VERIFY:** extração interna da solicitação de approval sob [SPEC0168](../02_spec/0168_runtime_approval_request_extraction.md), sem alterar sua semântica; mesma barreira T2 e aceite separado.

- **Gate do cartão principal:** permanece PROPOSED até as dependências018/019; R1/R2 são tasks registradas independentes T2 em execução. Trabalho nas subfatias não autoriza BUILD integral do cartão dependente.

### UP91-022 — Remover dependências órfãs e guardar fronteira do legado

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M3; trilha T3; tamanho M.
- **Responsável sugerido:** Arquitetura/build + holder legado.
- **O quê/onde:** Manifests/lockfile, nomes de imagem/env/advisory lock e residue guard.
- **Como:** Confirmar consumidores atuais antes de remover pino/dotenv/drizzle ou duplicações citadas historicamente; nomes com compatibilidade; allowlist de HISTORY com revisão explícita.
- **Dependências:** UP91-003, UP91-004, UP91-019, UP91-020.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** npm ls/SBOM coerentes; guard detecta novo resíduo; SQL advisory lock mantém exclusão mútua durante transição; domínio só em legacy/history permitido.
- **Rastreio:** tasks de origem PR-205, PR-L10, PR-L12; achados A91-21; critérios C09, C10, C12, C25, C32; gates de produção G01.

<a id="up91-023"></a>

### UP91-023 — Atualizar documentação pública e instruções de plataforma

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M3; trilha T1; tamanho M.
- **Responsável sugerido:** Documentação + usuário para constituição.
- **O quê/onde:** Docs de produto, legacy/docs, AGENTS, CURRENT_IMPLEMENTATION e PUBLIC_API.
- **Como:** Separar docs de produto de contratos ativos; manter evidência hash-bound no lugar; conciliar estados conversacionais/goal terminal; nova constituição com autoridade preservada.
- **Dependências:** UP91-002, UP91-007, UP91-019.
- **Gate/autoridade:** Gate documental T1; decisão humana separada quando o cartão a exigir.
- **Próxima ação:** integrar o guia PUBLIC_API atualizado à documentação de plataforma quando os holders liberarem os caminhos; concluir documentação de produto/constituição e dependências002/007/019. A subfatia documental UP91-023-API possui exemplo sintético typechecked/executado e crítica I1 `ACCEPT_DOCUMENTAL_SCOPE`, com [provas próprias](../04_audit/evidence/UP91-EXEC-20260930/public-api-doc/I1-review.json); não encerra este cartão nem aprova a constituição.
- **Pronto/prova específica:** Docs vigentes descrevem o harness; histórico navegável; links/higiene verdes; nova constituição explicitamente aprovada; guia permite usar exemplo neutro.
- **Rastreio:** tasks de origem PR-L08, PR-L09, PR-005; achados A91-20; critérios C01, C03, C05, C07, C11; gates de produção G01, G02.

<a id="up91-024"></a>

### UP91-024 — Revisar threat model e decisões de risco por capacidade

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M3; trilha T1; tamanho M.
- **Responsável sugerido:** Segurança/arquitetura.
- **O quê/onde:** Threat model, ADRs de runtime/policy/identity e inventário de egress.
- **Como:** Mapear fronteiras tenant/approval/provider/channel/knowledge, capacidades e destinos; registrar residuals e aceites condicionais sem tratar relatório estático como pentest.
- **Dependências:** UP91-007, UP91-018.
- **Gate/autoridade:** Gate documental T1; decisão humana separada quando o cartão a exigir.
- **Próxima ação:** revisar a SPEC0174 no hash exato após crítica independente e obter T3 antes de corrigir os dois transportes connect-bound; completar threat model/decisões das demais capacidades separadamente. A sonda do adaptador de canal com guard real e transporte default converteu resposta204 do fixture em send_failed/effectUnknown; diagnóstico sintético não autoriza provider/canal real nem encerra este cartão.
- **Pronto/prova específica:** Ameaças ligadas a controle, negativo e dono; escrita sensível exige draft/approval, fonte institucional aprovada e egress autorizado; UNKNOWN vira handoff/reconciliação.
- **Rastreio:** tasks de origem PR-306; achados A91-11, A91-13, A91-14, A91-18, A91-23; critérios C04, C19, C21, C38; gates de produção G02, G03.

<a id="up91-025"></a>

### UP91-025 — Integrar OIDC/MFA e store durável no entrypoint

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M4; trilha T3; tamanho L.
- **Responsável sugerido:** API/identidade + holder integração.
- **O quê/onde:** main/server composition, SPEC0150/0152 e store PG.
- **Como:** Reaproveitar builds OIDC/HTTPS isolados aprovados após revisão de hash/escopo; ligar authority/store no main real e configuração única; fixture não vira modo produtivo.
- **Dependências:** UP91-003, UP91-018, UP91-019.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** IdP local HTTPS/MFA sintético autentica pelo entrypoint e hosts distintos; cookie-only reload, CSRF, sessão revogada, role/tenant e store ausente testados com PG; configuração inválida recusa.
- **Rastreio:** tasks de origem PR-301, PR-302, PR-204; achados A91-10; critérios C12, C20, C21, C37; gates de produção G05.

<a id="up91-026"></a>

### UP91-026 — Substituir sessão atomicamente e validar autoridade/RLS

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M4; trilha T3; tamanho M.
- **Responsável sugerido:** Identidade/persistência.
- **O quê/onde:** Session replace PG, sessão HTTP e tenant preflights.
- **Como:** Usar replace atômico ou protocolo equivalente; testar SIGKILL create/revoke e rollback; validar roles sem superuser/bypassrls e tenant spoof sem penalizar probes públicas.
- **Dependências:** UP91-025.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Cookie antigo recusado após troca e crash; novo vínculo correto; negativos de role/RLS passam; não existir sessão dupla indevida em falha entre fases.
- **Rastreio:** tasks de origem PR-301, PR-405; achados A91-12; critérios C17, C20, C21, C23, C27, C28; gates de produção G05, G07.

<a id="up91-027"></a>

### UP91-027 — Integrar inbox, relógio, fencing e reconciliação do webhook

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M4; trilha T3; tamanho XL.
- **Responsável sugerido:** Webhook/persistência + holder clock.
- **O quê/onde:** SPEC0160/0161/0162, migrations, ingress/outbox e replay store.
- **Como:** Preservar window fix/F02 já PASS; integrar fatias aprovadas; submeter hash atual0162; cobrir pending reconciler e UNKNOWN_COMMIT sem duplicar efeito em retry.
- **Dependências:** UP91-019.
- **Gate/autoridade:** 0160/0161 têm BUILD sintético registrado; 0162 passou revisões posteriores ao hash c334 e aguarda crítica/T3 corrente. Claim antigo não autoriza hash novo; resolver ownership antes de qualquer mutation.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Assinatura aceita uma vez na janela inteira; crash/restart/clock regressivo/lease takeover/commit ambíguo exercitados em HTTP+PG; schema semântico negativo; dedup externa só declarada com prova do destino.
- **Rastreio:** tasks de origem PR-301-WEBHOOK-REPLAY, PR-301-FENCING-CONSTRAINT-PREFLIGHT; achados A91-11; critérios C13, C22, C26, C27, C28; gates de produção G03, G07.

<a id="up91-028"></a>

### UP91-028 — Endurecer rate limit, TLS, CORS e superfície externa

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M4; trilha T3/T4; tamanho L.
- **Responsável sugerido:** Segurança/API/operação.
- **O quê/onde:** Rate-limit preflight, TLS/proxies/CORS/payload e egress.
- **Como:** Aplicar preflight semântico de rate limit com constraint/index isca e operação negativa; validar limites autenticados; hardened config/testes locais antes de qualificação staging.
- **Dependências:** UP91-018, UP91-025, UP91-026, UP91-027.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Boot recusa schema divergente; rate limit não depende só de nome; CORS/TLS/proxy/header spoofs/payload excessivo/SSRF recusados nos modos alvo.
- **Rastreio:** tasks de origem PR-304, PR-405, PR-011-CODEQL; achados A91-22; critérios C19, C21, C23, C26; gates de produção G03, G05, G07.

<a id="up91-029"></a>

### UP91-029 — Integrar cofre e exercitar rotação por segredo

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M4; trilha T4; tamanho L.
- **Responsável sugerido:** Segurança/infraestrutura.
- **O quê/onde:** Keyrings identidade/rate limit/webhook, DB e provider.
- **Como:** Selecionar integração após decisão de ambiente; secret references em vez de valores em imagem/arquivo; rotação/revogação com janela de sobreposição explícita e responsáveis.
- **Dependências:** UP91-008, UP91-034.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Segredos não aparecem em imagem/log; cada família rota em staging autorizado sem perder binding; comprometimento tem revogação/drill/runbook comprovados.
- **Rastreio:** tasks de origem PR-303; achados—; critérios C24; gates de produção G06.

<a id="up91-030"></a>

### UP91-030 — Fechar inventário de dados, DP01–06 e responsabilidades

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M4; trilha T1; tamanho M.
- **Responsável sugerido:** Dados/privacidade + usuário/controlador.
- **O quê/onde:** Inventário09, RIPD10, decision packet DP01–06 e contratos.
- **Como:** Atualizar categorias a partir do schema atual, nomear responsáveis, decidir prazos/finalidades/direitos/backup/reaquisição de sessões; preparar contratos com fornecedores escolhidos.
- **Dependências:** UP91-007, UP91-008.
- **Gate/autoridade:** Gate documental T1; decisão humana separada quando o cartão a exigir.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Decisões humanas por classe/tenant e política versão/hash; controlador/DPO e canal de atendimento definidos; ausência de decisão não vira retenção infinita ou consentimento presumido.
- **Rastreio:** tasks de origem PR-401, PR-407; achados A91-16; critérios C29; gates de produção G08.

<a id="up91-031"></a>

### UP91-031 — Implementar purga e retenção físicas com recuperação segura

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M4; trilha T3; tamanho L.
- **Responsável sugerido:** Dados/persistência.
- **O quê/onde:** SPEC0149, migrations/jobs isolated e audit sinks.
- **Como:** Aplicar política decidida; privilégios mínimos; TTL lógico separado de purge; cobrir states/famílias/sessões, auditoria e cópias com métricas minimizadas.
- **Dependências:** UP91-026, UP91-030.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Política/job/migration e privilégios implementados; dados expirados eliminados no prazo; corrida/session/bootstrap segura e idempotência demonstrada. Prova funcional local reintroduz dados sintéticos e testa reexpurgo/bloqueio de sessão (não PITR de infraestrutura). Essa saída implementada libera UP91-036, que possui a qualificação completa de backup/PITR/restauração; não exigir036 concluído para encerrar a fatia funcional031.
- **Rastreio:** tasks de origem PR-402; achados A91-16; critérios C26, C29; gates de produção G08.

<a id="up91-032"></a>

### UP91-032 — Implementar fluxo operacional de direitos do titular

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M4; trilha T3; tamanho L.
- **Responsável sugerido:** Dados/API/operação.
- **O quê/onde:** APIs/jobs/export e trilha de solicitação por titular/tenant.
- **Como:** Definir autenticação de solicitação, escopo de busca, prazo e restrições de backup conforme política; implantar execução revisável e minimizada.
- **Dependências:** UP91-030, UP91-031.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Acesso/correção/eliminação comprovados com identidade sintética; tenant negativo; auditoria registra finalidade/resultado sem replicar dado sensível; restore respeita pedido.
- **Rastreio:** tasks de origem PR-404; achados A91-16; critérios C29; gates de produção G08.

<a id="up91-033"></a>

### UP91-033 — Separar migration job de serving e proteger upgrades

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M4; trilha T3; tamanho L.
- **Responsável sugerido:** Persistência/DevOps.
- **O quê/onde:** migration runner, serving composition e preflights.
- **Como:** Job dedicado com role DDL, credencial fora do processo exposto; serving mínimo privilégio e POSTGRES_AUTO_MIGRATE off no alvo; testar expand/contract, failure e compatibilidade.
- **Dependências:** UP91-019, UP91-026.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Serving sobe sem credencial de migration e recusa schema inválido; job serializado; upgrade/rollback ou roll-forward documentados e ensaiados; tenant boundaries preservadas.
- **Rastreio:** tasks de origem PR-603, PR-405; achados A91-15; critérios C12, C23, C26, C27; gates de produção G07.

<a id="up91-034"></a>

### UP91-034 — Provisionar ambientes isolados e reproduzíveis

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M5; trilha T4; tamanho XL.
- **Responsável sugerido:** Infraestrutura/operação.
- **O quê/onde:** IaC, rede, PG, registry, IdP e observabilidade.
- **Como:** Após escolher ambiente, criar dev/staging/alvo separados por IaC revisado; nenhuma alteração em conta real sem autoridade específica; recursos sintéticos/controlados primeiro.
- **Dependências:** UP91-008, UP91-030.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Plano IaC revisável, ambientes reconstruíveis, rede/roles/quotas/donos separados; inventário de configuração e política de dados ligados ao candidato.
- **Rastreio:** tasks de origem PR-601, PR-107; achados A91-23; critérios C12, C42; gates de produção G06, G09, G10.

<a id="up91-035"></a>

### UP91-035 — Promover imagem por digest com assinatura e proveniência

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M5; trilha T4; tamanho L.
- **Responsável sugerido:** Release/CI/DevOps.
- **O quê/onde:** Build images, ci-bar, attestation verification e deploy.
- **Como:** Integrar runId/candidateId/executionId/JUnit existentes; OIDC/attestation externa; secret scan e SBOM/licenses com claim; construir uma vez e promover mesmo digest.
- **Dependências:** UP91-003, UP91-005, UP91-006, UP91-034.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Imagem assinada e manifestos ligados a SHA/config/run; main protegida com checks; deploy recusa assinatura/digest inválidos; rollback ensaiado sem recompilar candidato.
- **Rastreio:** tasks de origem PR-003, PR-008, PR-009, PR-009-PROV, PR-010, PR-305, PR-602; achados A91-02, A91-18; critérios C06, C12, C25, C33, C34; gates de produção G04.

<a id="up91-036"></a>

### UP91-036 — Qualificar backup, PITR e recuperação de desastre

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M5; trilha T4; tamanho L.
- **Responsável sugerido:** Dados/infraestrutura.
- **O quê/onde:** PG backup/WAL, restore environment e runbooks.
- **Como:** Implementar procedimento de infraestrutura, não usar snapshot em memória como PITR; aprovar RPO/RTO e clock/retention recovery; drill de perda de banco/região em staging isolado. Input de031 é política/job aprovados e prova funcional de dados reintroduzidos;036 qualifica recuperação real de infraestrutura, sem devolver dependência de conclusão para031.
- **Dependências:** UP91-029, UP91-031, UP91-033, UP91-034.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Ponto de recuperação e tempo medidos dentro das metas aprovadas; consistência/tenant/outbox/effects uncertain/sessões/purge revalidados; serving bloqueado até prova.
- **Rastreio:** tasks de origem PR-406, PR-607; achados A91-17; critérios C28, C29, C42; gates de produção G08, G09.

<a id="up91-037"></a>

### UP91-037 — Operar métricas, alertas e runbooks com responsáveis

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M5; trilha T4; tamanho L.
- **Responsável sugerido:** Observabilidade/operação.
- **O quê/onde:** OTel sink, dashboards, alertas, runbooks, on-call e status.
- **Como:** Instrumentar API/worker/outbox/provider/canal/custo com atributos mínimos; registrar SLO e escala; exercitar alerta e resposta, rotação, vazamento, provider/canal fora e recuperação.
- **Dependências:** UP91-017, UP91-029, UP91-034.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Alertas chegam ao responsável autorizado e drill tem timeline; runbooks executáveis; nenhum marcador sensível exportado; suporte/status/ comunicação definidos sem enviar mensagens nesta rodada.
- **Rastreio:** tasks de origem PR-604, PR-605, PR-608; achados A91-09, A91-17, A91-23; critérios C40, C42; gates de produção G10.

<a id="up91-038"></a>

### UP91-038 — Medir capacidade, carga e soak representativos

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M7; trilha T4; tamanho L.
- **Responsável sugerido:** Performance/qualidade/operação.
- **O quê/onde:** Staging, PG/worker/API, provider/canal e orçamento.
- **Como:** Definir perfil do piloto com metas aprovadas; testar carga×3 e soak24h, falhas/concorrência/restart, memória, backlog e custo; fake benchmarks separados de medição representativa.
- **Dependências:** UP91-011, UP91-020, UP91-036, UP91-037, UP91-039, UP91-041, UP91-043, UP91-044.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** p95/p99/throughput/erro/handoff/custo e limites de capacidade registrados; 24h dentro do SLO escolhido; dados fictícios e orçamento autorizado; regressões investigadas.
- **Rastreio:** tasks de origem PR-606; achados A91-23; critérios C14, C30, C41; gates de produção G10.

<a id="up91-039"></a>

### UP91-039 — Compor provider escolhido com budget e fallback

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M6; trilha T4; tamanho L.
- **Responsável sugerido:** Model gateway/worker.
- **O quê/onde:** kernel-composition, provider profile, flags e contracts.
- **Como:** Usar provider aprovado atrás de flag; prompts canônicos, circuit breaker/timeout/retries e minimização; primeiro prova local fake, depois homologação sintética autorizada.
- **Dependências:** UP91-007, UP91-008, UP91-011, UP91-013, UP91-016, UP91-029, UP91-034.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Entrypoint usa adapter escolhido; falhas viram handoff seguro; custo/latência medidos; modelo não autoriza efeito; sem provider real antes do gate específico.
- **Rastreio:** tasks de origem PR-501, PR-104; achados A91-23; critérios C14, C38; gates de produção G02, G03.

<a id="up91-040"></a>

### UP91-040 — Publicar conhecimento institucional aprovado e revogável

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M6; trilha T4; tamanho L.
- **Responsável sugerido:** Conhecimento + dono das fontes.
- **O quê/onde:** RAG publication/retrieval, governance e consumer bindings.
- **Como:** Dono publica conteúdo com versão/hash/revisão/validade; ligar adapter ao worker e tenant; negar fonte revogada ou ausente e aplicar minimização.
- **Dependências:** UP91-008, UP91-015, UP91-016, UP91-030, UP91-039.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Resposta institucional somente com fonte aprovada/citada; revogação efetiva; ausência vira handoff; tenant/source/version/hash e approval testados no fluxo real autorizado.
- **Rastreio:** tasks de origem PR-504, PR-106, PR-206; achados A91-14; critérios C16, C39; gates de produção G02, G03, G08.

<a id="up91-041"></a>

### UP91-041 — Ligar canal e efeitos externos governados

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M6; trilha T4; tamanho XL.
- **Responsável sugerido:** Canal/capabilities + dono do consumidor.
- **O quê/onde:** Channel adapter, webhooks, effect journal e egress.
- **Como:** Canal escolhido atrás de flag; destinos/contatos permitidos por tenant; leitura autorizada, escrita em rascunho/approval; idempotência do destino ou reconciliação de uncertainty explícitas.
- **Dependências:** UP91-008, UP91-014, UP91-024, UP91-027, UP91-029, UP91-030, UP91-034.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** E2E com contato/número de teste, replay/crash/reentrega e timeout sem efeito sensível indevido; nenhum compromisso exatamente-uma-vez sem prova no destino.
- **Rastreio:** tasks de origem PR-503, PR-505, PR-105; achados A91-11, A91-23; critérios C17, C27, C28, C38; gates de produção G02, G03.

<a id="up91-042"></a>

### UP91-042 — Disponibilizar handoff, takeover e kill switch

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M6; trilha T3/T4; tamanho L.
- **Responsável sugerido:** Runtime/console/operação.
- **O quê/onde:** Fila de handoff, UI, flags e controles operacionais.
- **Como:** Definir SLA/escalonamento humano, recuperação ao agente e controles global/tenant/capacidade com autoridade; drill primeiro sintético, staging sob T4.
- **Dependências:** UP91-020, UP91-025, UP91-037.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Fila operável com tempos medidos; takeover bloqueia automação indevida; kill switch atua em menos de 1 min sem deploy, drena/reconcilia in-flight e permite retomada aprovada.
- **Rastreio:** tasks de origem PR-506, PR-507; achados A91-23; critérios C17, C28, C35, C42; gates de produção G02, G03, G10.

<a id="up91-043"></a>

### UP91-043 — Qualificar console acessível com sessão corporativa

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M6; trilha T3; tamanho L.
- **Responsável sugerido:** Frontend/UX/qualidade.
- **O quê/onde:** Web login, cookie continuity, forms, states e Playwright.
- **Como:** Conectar console ao entrypoint PG/OIDC; fluxo neutro, approval/handoff/trajectory; testar loading/error/empty/offline, foco/teclado/reduced motion e layout com rede real controlada.
- **Dependências:** UP91-018, UP91-020, UP91-025, UP91-026, UP91-042.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Chromium/Firefox/WebKit em375/768/1440 passam repetição exigida no mesmo digest, sem skip/flaky; axe sem bloqueante, revisão humana de teclado/leitor de tela; recarga cookie-only segura.
- **Rastreio:** tasks de origem PR-302, PR-701, PR-702; achados A91-10; critérios C21, C35, C36, C37; gates de produção G05.

<a id="up91-044"></a>

### UP91-044 — Fechar evals semânticos e red team de capacidades

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M6; trilha T4; tamanho L.
- **Responsável sugerido:** Qualidade/segurança + produto.
- **O quê/onde:** Golden sets neutros/consumer, model profile e eval gates.
- **Como:** Congelar barra na SPEC: fonte/claim, instrução hostil, ação proibida, missing context, approval e budget; rodar determinísticos e provider aprovado sem confundir resultados.
- **Dependências:** UP91-039, UP91-040, UP91-041, UP91-042.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Evals acima da barra aprovada; falsos efeitos, fontes revogadas, tenant e injection recusados; mudança de modelo/prompt exige regressão ligada à config.
- **Rastreio:** tasks de origem PR-502; achados A91-03, A91-04, A91-05, A91-06, A91-07, A91-13, A91-14, A91-23; critérios C14, C15, C16, C17, C18, C30; gates de produção G02, G03.

<a id="up91-045"></a>

### UP91-045 — Congelar candidato e executar barra integrada de release

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M7; trilha T4; tamanho L.
- **Responsável sugerido:** Release/CI/qualidade.
- **O quê/onde:** Candidato fonte/config/imagem, finding closures, certify/CI e attestation.
- **Como:** Resolver paths por coordenação, congelar hash/digest/config após integrações; certificado novo com claim exclusivo e nenhum arquivo alheio sujo; verificar bindings HEAD/candidate/run/evidence.
- **Dependências:** UP91-002, UP91-003, UP91-004, UP91-005, UP91-006, UP91-007, UP91-008, UP91-009, UP91-010, UP91-011, UP91-012, UP91-013, UP91-014, UP91-015, UP91-016, UP91-017, UP91-018, UP91-019, UP91-020, UP91-021, UP91-022, UP91-023, UP91-024, UP91-025, UP91-026, UP91-027, UP91-028, UP91-029, UP91-030, UP91-031, UP91-032, UP91-033, UP91-035, UP91-036, UP91-037, UP91-038, UP91-039, UP91-040, UP91-041, UP91-042, UP91-043, UP91-044.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Typecheck/lint/format/tests/PG/coverage/global+critical/evals/E2E/build/security/SBOM/licenses/attestation PASS no candidato; zero skips; findings P0/P1 fechados no escopo; verifier recusa drift negativo.
- **Rastreio:** tasks de origem PR-003, PR-007, PR-009, PR-009-PROV, PR-010, PR-011, PR-012, PR-701; achados A91-02, A91-18, A91-19; critérios C06, C30, C31, C32, C33, C34; gates de produção G03, G04.

<a id="up91-046"></a>

### UP91-046 — Executar pentest, UAT, treinamento e auditoria independente

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M7; trilha T4; tamanho L.
- **Responsável sugerido:** Revisor independente/segurança + operadores.
- **O quê/onde:** Staging completo, auditorias, roteiro UAT e manual console.
- **Como:** Qualificar fornecedor/revisor, escopo e evidência; pentest externo e UAT com identidades sintéticas; operadores exercitam approval/handoff/incidente; qualquer correção reabre gates do candidato.
- **Dependências:** UP91-045.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Sem crítico/alto aberto, médios tratados com dono/plano; UAT aprovado e operadores treinados; aderência PRD/SPEC/dados comprovada por revisão independente.
- **Rastreio:** tasks de origem PR-307, PR-702, PR-703; achados A91-23; critérios C06, C19, C35, C36, C42; gates de produção G03, G11.

<a id="up91-047"></a>

### UP91-047 — Preparar pacote e obter GO/NO_GO do piloto

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M8; trilha T4; tamanho S.
- **Responsável sugerido:** Release/produto + usuário.
- **O quê/onde:** Pacote de decisãoD-14, config/escopo/digest e evidência13 gates.
- **Como:** Revalidar provas após pentest/correções e integrar o certificado final; apresentar consumidor/tenant/contatos/horário/SLA/teto de custo e rollback; não usar média de nota como autorização.
- **Dependências:** UP91-045, UP91-046.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Decisão humana explícita hash-bound do piloto e de cada capacidade/dado/efeito pertinente; escopo limitado e condições registradas; sem decisão permanece NO_GO.
- **Rastreio:** tasks de origem PR-704; achados A91-02; critérios C06, C33; gates de produção G12, G13.

<a id="up91-048"></a>

### UP91-048 — Conduzir piloto limitado com hypercare

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M8; trilha T4; tamanho L.
- **Responsável sugerido:** Produto/operação + dono do consumidor.
- **O quê/onde:** Tenant/contatos liberados, observabilidade, console e operadores.
- **Como:** Uma tenant/unidade definida, humano no horário e100%approval nas ações sensíveis; acompanhar diário, limites e rollback; somente dados/efeitos autorizados no pacote47.
- **Dependências:** UP91-047.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Ao menos duas semanas sob critérios de saída aprovados; incidentes e custo/SLO/qualidade mensurados; kill switch/handoff disponíveis e nenhum alargamento silencioso de escopo.
- **Rastreio:** tasks de origem PR-705; achados A91-23; critérios C35, C38, C40, C41, C42; gates de produção G10, G12.

<a id="up91-049"></a>

### UP91-049 — Avaliar piloto e replanejar correções

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M8; trilha T4; tamanho M.
- **Responsável sugerido:** Auditoria/produto/operação.
- **O quê/onde:** Métricas, feedback, incidentes e backlog de release.
- **Como:** Comparar critérios do piloto com resultados; registrar perdas/efeitos incertos/feedback; priorizar correções com SPEC e novos gates quando mudarem candidato/config.
- **Dependências:** UP91-048.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Relatório de avaliação com evidência atual; pendências P0/P1 fechadas antes de promoção; plano de expansão e riscos residuais apresentados ao dono.
- **Rastreio:** tasks de origem PR-706; achados A91-23; critérios C02, C03, C30, C40, C41, C42; gates de produção G12.

<a id="up91-050"></a>

### UP91-050 — Obter GO/NO_GO de produção controlada

- **Estado/prioridade/fase:** `PROPOSED` · P0-R · M8; trilha T4; tamanho S.
- **Responsável sugerido:** Release + usuário/dono responsável.
- **O quê/onde:** PacoteD-15, 13 gates, digest/configuração e rollback.
- **Como:** Reexecutar qualificação sobre candidato/config efetivamente promovidos se mudaram; registrar aceites válidos e prova de G01–G13; promover apenas após decisão específica.
- **Dependências:** UP91-046, UP91-049.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Todos os gates obrigatórios qualificados, decisão humana com hash, janela e autoridade; produto continua controlado, sem liberar agenda/ação clínica/financeira automática. G03 exige literalmente zero itensP0/P1 abertos em 0356 no gate vigente; se tasks pós-GA impedirem satisfazê-lo, submeter a conciliação proposta em007 a decisão humana, sem promover por conta própria.
- **Rastreio:** tasks de origem PR-707; achados A91-02; critérios C33, C34, C42; gates de produção G13.

<a id="up91-051"></a>

### UP91-051 — Expandir por tenant e revisar qualidade em30dias

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M9; trilha T4; tamanho L.
- **Responsável sugerido:** Produto/plataforma/operação.
- **O quê/onde:** Onboarding, suporte/status, auditoria e perfis de modelo.
- **Como:** Onboarding/RIPD/config por tenant, janela de hypercare e caps; revisão30dias de SLO/custo/incidentes/UX; melhorias justificadas por dados e regressão modelo/prompt.
- **Dependências:** UP91-050.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Cada tenant tem gate e isolamento comprovados; auditoria30dias publicada; roadmap seguinte mede efeito das melhorias e preserva versão/rollback.
- **Rastreio:** tasks de origem PR-708, PR-709, PR-608; achados A91-23; critérios C02, C03, C06, C30, C35, C38, C40, C41, C42; gates de produção G10, G12, G13.

<a id="up91-052"></a>

### UP91-052 — Retirar legado isolado somente após decisãoDL-05

- **Estado/prioridade/fase:** `PROPOSED` · P1 · M9; trilha T3/T4; tamanho L.
- **Responsável sugerido:** Holder legado/dados + usuário.
- **O quê/onde:** legacy/packages e tabelas/migrations de jornada.
- **Como:** Registrar opçãoDL-05 e impacto; backup/restauração comprovados, expand/contract e janela de compatibilidade; remover apenas componente sem consumidor confirmado.
- **Dependências:** UP91-020, UP91-022, UP91-030, UP91-036.
- **Gate/autoridade:** Conferir SPEC/decisão existente no hash e escopo atuais; preparar delta e obter gate adicional quando necessário. Nenhuma aprovação nova é inferida deste plano.
- **Próxima ação:** recon somente leitura da superfície e dependências; confirmar holder, comportamento atual e gate. Preparar SPEC/decisão ou documentação própria antes da implementação aplicável.
- **Pronto/prova específica:** Sem package/tabela indevidamente consumido; restore verificado e suites/imagem/certificado coerentes; histórico/docs/inventário preservados. Pode ficar adiado por decisão explícita.
- **Rastreio:** tasks de origem PR-L11; achados A91-21; critérios C09, C26, C29; gates de produção G01.

## Encaminhamento integral das 83 tasks de origem

Captura de30/09/2026. A fonte0356 foi preservada por edição concorrente. A disposição abaixo é observação histórica, não reclassificação de aprovação/aceite. PRs concluídas continuam preservadas; cartõesUP91 podem requerer regressão/integrar evidência no novo candidato sem refazer o código entregue. Caso uma taskPR esteja sem mapeamento, o plano está incompleto.

| ID de origem                        | Objeto registrado em 0356                                                                                  | Trabalho atualizado          | Disposição observada                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| PR-001                              | Resolver o worktree sujo (RA26-01) · P0 · DOC                                                              | UP91-001                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-002                              | Fixar a toolchain em Node 22 · P0 · SPEC+BUILD                                                             | UP91-003                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-003                              | Certificado reproduzível (RA26-02) · P0 · SPEC+BUILD                                                       | UP91-035, UP91-045           | Verificador root FAIL na AUD0591; candidato/certificação não qualificados.                                       |
| PR-301-FENCING-CONSTRAINT-PREFLIGHT | catálogo do webhook · P1 · SPEC+BUILD                                                                      | UP91-027                     | Registro0356 anterior ao fix; AUD0591 observou preflight semântico integrado/PG PASS; não reconstruir o reparo.  |
| PR-004                              | Tirar o estado Gauntlet do versionamento · P0 · HUMAN + DOC                                                | UP91-002                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-005                              | Rotacionar ledgers e reescrever o README (RA26-03/04/06) · P1 · DOC                                        | UP91-002, UP91-023           | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-006                              | Reconciliar arquivos vazios versionados · P2 · DOC                                                         | UP91-002                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-007                              | Cobertura com denominador completo e lint type-aware (RA26-15) · P1 · SPEC+BUILD                           | UP91-004, UP91-045           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-008                              | Imagem web fixada e nome de imagem corrente · P2 · SPEC+BUILD                                              | UP91-003, UP91-035           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-009                              | Coerência do E2E e JUnit (RA26-16) · P2 · SPEC+BUILD                                                       | UP91-035, UP91-045           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-009-PROV                         | Âncora externa da prova do ci-bar · P0 para promoção · SPEC T3                                             | UP91-035, UP91-045           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-010                              | Fazer o CI rodar no GitHub · P0 · SPEC+BUILD                                                               | UP91-005, UP91-035, UP91-045 | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-011                              | Triagem do Gitleaks · P0 · SPEC+BUILD                                                                      | UP91-006, UP91-045           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-011-CODEQL                       | Triagem de alerta alto no CI · P1 · SPEC T3 + BUILD                                                        | UP91-006, UP91-028           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-012                              | Testes de processo sobre código compilado antigo · P0 · SPEC+BUILD                                         | UP91-003, UP91-045           | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-L01                              | Inventário e classificação do legado · P0 · DOC                                                            | UP91-019                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-L02                              | Apagar pacotes sem consumidor (DL-02) · P0 · SPEC+BUILD                                                    | UP91-019                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-L03                              | Estrutura de `legacy/` e regra de dependência · P0 · SPEC+BUILD                                            | UP91-019                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-L04                              | Isolar o domínio de jornadas (tutor, pet, consulta) (DL-01) · P0 · SPEC+BUILD                              | UP91-019                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-L05                              | Isolar o perfil da secretária (DL-01) · P0 · SPEC+BUILD                                                    | UP91-019                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-L06                              | Isolar os datasets de evals da secretária (DL-01) · P1 · SPEC+BUILD                                        | UP91-019                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-L07                              | Fluxo de referência neutro · P0 · SPEC+BUILD                                                               | UP91-020                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-L08                              | Mover a documentação de produto para `legacy/docs` (DL-03) · P1 · DOC                                      | UP91-023                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-L09                              | Constituição e instruções de agente do harness · P0 · DOC                                                  | UP91-023                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-L10                              | Resíduos de nome · P2 · SPEC+BUILD                                                                         | UP91-022                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-L11                              | Apagar o legado isolado (DL-05) · P1 · SPEC+BUILD                                                          | UP91-052                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-L12                              | Guarda de CI contra resíduo do legado · P1 · SPEC+BUILD                                                    | UP91-022                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-101                              | Discovery de plataforma · P0 · DISC                                                                        | UP91-007                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-102                              | PRD adendo de plataforma (D-03) · P0 · PRD                                                                 | UP91-007                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-103                              | Primeiro consumidor, tenant piloto e níveis de serviço (D-04) · P0 · HUMAN                                 | UP91-008                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-104                              | Provider de LLM (D-05) · P0 · HUMAN                                                                        | UP91-008, UP91-039           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-105                              | Canal (D-06) · P0 · HUMAN                                                                                  | UP91-008, UP91-041           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-106                              | Fontes de conhecimento aprovadas (D-07) · P1 · HUMAN                                                       | UP91-008, UP91-040           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-107                              | Nuvem, região e orçamento (D-08) · P0 · HUMAN                                                              | UP91-008, UP91-034           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-108                              | Governança proporcional (D-12) · P0 · HUMAN + DOC                                                          | UP91-002, UP91-007           | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-109                              | Encerrar M07-S1/C1M (RA26-17) · P0 · HUMAN                                                                 | UP91-002                     | Conclusão histórica declarada; preservar e revalidar integração quando pertinente.                               |
| PR-201                              | Decompor `apps/api/src/server.ts` (RA26-11) · P1 · SPEC+BUILD                                              | UP91-021                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-202                              | Decompor `runTurn` em `packages/agent-runtime/src/runtime.ts` · P1 · SPEC+BUILD                            | UP91-021                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-203                              | Fatias 3 e 4 de `postgres.ts` (RA25-07) · P1 · SPEC+BUILD                                                  | UP91-021                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-204                              | Configuração única validada no boot (RA26-08) · P0 · SPEC+BUILD                                            | UP91-025                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-205                              | Dependências e duplicações (RA26-12/14) · P2 · SPEC+BUILD                                                  | UP91-005, UP91-022           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-206                              | Destino de `conversation`, `rag`, `channel-gateway` e Drizzle (RA26-12/13, D-11) · P1 · HUMAN + SPEC+BUILD | UP91-008, UP91-040           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-207                              | Contrato de API publicado e versionado · P2 · SPEC+BUILD                                                   | UP91-018                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-208                              | Declarar as dependências de teste da M07-S1 · P2 · SPEC+BUILD                                              | UP91-004                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-301                              | Autenticação de operador por OIDC com MFA na API (D-09) · P0 · SPEC+BUILD                                  | UP91-025, UP91-026           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-302                              | Login web por OIDC · P0 · SPEC+BUILD                                                                       | UP91-025, UP91-043           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-303                              | Cofre de segredos e rotação · P0 · OPS + SPEC+BUILD                                                        | UP91-029                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-301-WEBHOOK-REPLAY               | janela e lease do webhook · P1 · SPEC T3 + BUILD                                                           | UP91-027                     | Window fix demonstrado; inbox/clock/reconciliador e integração continuam pendentes; não reabrir retenção tardia. |
| PR-304                              | Borda endurecida · P1 · OPS                                                                                | UP91-028                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-305                              | Supply chain de release · P1 · SPEC+BUILD                                                                  | UP91-005, UP91-035           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-306                              | Threat model para integrações reais · P1 · DOC                                                             | UP91-024                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-307                              | Pentest externo · P0 · OPS                                                                                 | UP91-046                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-401                              | Inventário de dados pessoais da plataforma (D-10) · P0 · DOC + HUMAN                                       | UP91-030                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-402                              | Retenção e descarte aplicados · P0 · SPEC+BUILD                                                            | UP91-031                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-403                              | Minimização antes do provider e nos logs · P0 · SPEC+BUILD                                                 | UP91-016, UP91-017           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-404                              | Direitos do titular · P1 · SPEC+BUILD                                                                      | UP91-032                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-405                              | RLS obrigatório e roles separadas · P0 · SPEC+BUILD                                                        | UP91-026, UP91-028, UP91-033 | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-406                              | Backup, PITR, RPO e RTO · P0 · OPS                                                                         | UP91-036                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-407                              | Contratos, DPO e plano de incidente · P0 · HUMAN + DOC                                                     | UP91-030                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-501                              | Provider de LLM real no worker · P0 · PRD + SPEC+BUILD                                                     | UP91-039                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-502                              | Evals de produção e red team · P0 · SPEC+BUILD                                                             | UP91-044                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-503                              | Canal real no worker (RA26-09) · P0 · PRD + SPEC+BUILD                                                     | UP91-041                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-504                              | Conhecimento com fonte aprovada (RA26-10) · P1 · PRD + SPEC+BUILD                                          | UP91-015, UP91-040           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-505                              | Efeito externo genérico com rascunho e approval · P1 · PRD + SPEC+BUILD                                    | UP91-014, UP91-041           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-506                              | Handoff humano operacional · P0 · SPEC+BUILD                                                               | UP91-042                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-507                              | Kill switch e modo degradado · P0 · SPEC+BUILD                                                             | UP91-042                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-601                              | Infraestrutura como código (D-08) · P0 · OPS                                                               | UP91-034                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-602                              | Entrega contínua por digest · P0 · OPS                                                                     | UP91-035                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-603                              | Migrações no pipeline · P1 · OPS                                                                           | UP91-033                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-604                              | Observabilidade de produção · P0 · OPS + SPEC+BUILD                                                        | UP91-017, UP91-037           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-605                              | Runbooks e on-call · P0 · DOC + OPS                                                                        | UP91-037                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-606                              | Carga e soak em staging · P1 · OPS                                                                         | UP91-038                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-607                              | Drill de DR · P1 · OPS                                                                                     | UP91-036                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-608                              | Suporte e comunicação · P2 · DOC                                                                           | UP91-037, UP91-051           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-701                              | Staging completo com E2E da jornada de referência · P0 · OPS + SPEC+BUILD                                  | UP91-020, UP91-043, UP91-045 | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-702                              | UAT e treinamento de operadores · P0 · HUMAN                                                               | UP91-043, UP91-046           | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-703                              | Auditoria independente pré-piloto · P0 · AUDIT                                                             | UP91-046                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-704                              | Go/no-go do piloto (D-14) · P0 · HUMAN                                                                     | UP91-047                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-705                              | Piloto controlado · P0 · OPS                                                                               | UP91-048                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-706                              | Avaliação do piloto · P0 · AUDIT                                                                           | UP91-049                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-707                              | Go/no-go da produção controlada (D-15) · P0 · HUMAN                                                        | UP91-050                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-708                              | Expansão gradual por tenant · P1 · OPS                                                                     | UP91-051                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |
| PR-709                              | Auditoria de 30 dias pós-GA · P1 · AUDIT                                                                   | UP91-051                     | Trabalho aberto/parcial ou sem conclusão explícita; conferir evidência/autoridade na fonte.                      |

## Matriz de cobertura dos achados

| Achado0591 | Cartões de correção/integração/qualificação                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A91-01     | UP91-005                                                                                                                         |
| A91-02     | UP91-001, UP91-035, UP91-045, UP91-047, UP91-050                                                                                 |
| A91-03     | UP91-009, UP91-044                                                                                                               |
| A91-04     | UP91-010, UP91-044                                                                                                               |
| A91-05     | UP91-011, UP91-044                                                                                                               |
| A91-06     | UP91-012, UP91-044                                                                                                               |
| A91-07     | UP91-013, UP91-044                                                                                                               |
| A91-08     | UP91-016                                                                                                                         |
| A91-09     | UP91-017, UP91-037                                                                                                               |
| A91-10     | UP91-025, UP91-043                                                                                                               |
| A91-11     | UP91-024, UP91-027, UP91-041                                                                                                     |
| A91-12     | UP91-026                                                                                                                         |
| A91-13     | UP91-014, UP91-024, UP91-044                                                                                                     |
| A91-14     | UP91-015, UP91-024, UP91-040, UP91-044                                                                                           |
| A91-15     | UP91-033                                                                                                                         |
| A91-16     | UP91-030, UP91-031, UP91-032                                                                                                     |
| A91-17     | UP91-036, UP91-037                                                                                                               |
| A91-18     | UP91-006, UP91-024, UP91-035, UP91-045                                                                                           |
| A91-19     | UP91-002, UP91-004, UP91-045                                                                                                     |
| A91-20     | UP91-001, UP91-002, UP91-007, UP91-018, UP91-023                                                                                 |
| A91-21     | UP91-019, UP91-020, UP91-021, UP91-022, UP91-052                                                                                 |
| A91-22     | UP91-028                                                                                                                         |
| A91-23     | UP91-008, UP91-024, UP91-034, UP91-037, UP91-038, UP91-039, UP91-041, UP91-042, UP91-044, UP91-046, UP91-048, UP91-049, UP91-051 |

## Primeiro lote e recuperação

**Atualização de execução em 30/09:** UP91-001 já possui evidência documental concluída. Não repetir a baseline como próximo trabalho por este ponteiro histórico. As entregas parciais e os resultados da última rodada com código estão no [relatório da rodada3](../04_audit/evidence/UP91-EXEC-20260930/round3-report.md); os estados dos cartões e as dependências acima continuam sendo a referência de aceite do programa.

| Ordem | Trabalho a encaminhar                                                                                            | Pré-condição para implementar                                                                                             | Resultado verificável                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | 002/023: integrar handoffs e concluir documentação de plataforma                                                 | Paths livres e claim T1; constituição possui sua decisão própria                                                          | Índice e estado coerentes com evidências; guia público utilizável; sem sobrescrever ledgers de outro agente                  |
| 2     | 004/005/006/045: resolver os gates de qualificação reprovados                                                    | Owners do catálogo/formatação; SPEC0170 com revisão T3; dependências sob autoridade0164 existente e liberação do lockfile | Catálogo vinculado às fontes, parser ligado ao run, dependências e formatação aprovados; certificado reemitido após correção |
| 3     | 009–016: executar contratos de contexto, observações, budget, policy, prompt, approval, conhecimento e redaction | Revisões humanas T3 dos módulos exatos e caminhos livres                                                                  | Positivos e negativos nos contratos públicos; limites e autoridade preservados; regressão obrigatória verde                  |
| 4     | 019/020/025–028/043: integrar o primeiro fluxo vertical neutro                                                   | Liberação PR-L04; gates próprios de identidade, dados e contratos; consumidor definido quando exigido                     | Entrada sintética → worker/PG → approval ou handoff → retomada → resposta e console; isolamento e recuperação demonstrados   |
| 5     | 030/034–038: preparar e qualificar dados, infraestrutura e operação                                              | Donos, metas, políticas e ambientes autorizados                                                                           | Retenção e direitos definidos; ambiente reproduzível; restore/PITR, alertas e capacidade medidos                             |
| 6     | 039–052: integrações, auditoria, piloto e expansão                                                               | Saídas do DAG, decisões humanas e gates T4 pertinentes                                                                    | Candidato único com provas atuais; piloto avaliado; GO vinculado ao escopo; revisão pós-GA e expansão controlada             |

As linhas indicam encaminhamento, não autorização nova nem tarefas encerradas. A SPEC0164 já aprovada não precisa de outra aprovação para o mesmo escopo; falta cumprir a condição de ownership. As revisões T3 pendentes não podem ser substituídas pelo aceite técnico de um revisor. O fluxo neutro020 fecha o primeiro resultado vertical da plataforma antes de homologar provider/canal real.

Se interromper: ler AGENTS/runtime/log/backlog/coordenação,0363 e o cartão ativo; comparar hashes/claims; não reusar PASS de outro candidato; identificar efeito parcial e reconciliação antes de retry; atualizar próximo passo num só cartão. Reabrir explicitamente a unidade se contrato/ambiente/aceite mudar. Não reiniciar todo o programa quando apenas uma fatia invalida seu gate.

[Handoff da rodada](../08_runtime/handoffs/aud0591_plan_20260930.md) fornece entradas para ledgers concorrentes; [pacote de planejamento](../04_audit/evidence/AUD0591-PLAN-20260930/README.md) prova cobertura e ausência de ciclos, não funcionamento futuro.
