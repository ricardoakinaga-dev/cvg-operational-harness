# Roadmap do programa após reauditoria — 30/09/2026

Entregar uma plataforma neutra, governada e operável: API, worker e console com execução durável, contexto, respostas fundamentadas, limites de consumo, policy, approval, handoff, conhecimento e integrações. O caminho até produção inclui qualificação do candidato, piloto limitado e decisão humana. **Estado de release: NO_GO.**

Este roadmap atualiza0363 após a AUD0592 e preserva o escopo: **52 cartões UP91,83 tasks de origem,13 gates e149 critérios originais**. O novo pedido acrescenta cinco entregas à barra, total 154. O [backlog0367](0367_program_backlog_reaudit_2026-09-30.md) é o proprietário do estado UP91; o [0356](0356_production_backlog_2026-09-26.md) conserva estado e aceitesPR. Este documento ordena marcos e decisões; a conclusão de relatório ou planejamento não conclui a implementação.

A baseline executável está na [auditoria0592](../04_audit/0592_repository_reaudit_2026-09-30.md) e no [manifesto de captura](../04_audit/evidence/AUD0592-REAUDIT-20260930/source-capture.json). Root compartilhado sobref8ccc845, com alterações concorrentes; snapshot privado limpo3085e865. Captura local não é commit integrado nem release. Resultados da execução anterior permanecem históricos em [0365](0365_up91_execution_baseline.md) e UP91-EXEC.

## Sequência por resultados e dependências

Os marcos podem ter frentes independentes em paralelo. A entrada de uma capacidade depende de seus insumos e do gate correspondente; não basta alcançar uma data ou obter uma média de notas.

| Marco | Resultado de saída                                  | Cartões     | Dependência e aceite de saída                                                                                                                                                                             |
| ----- | --------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0    | Base reproduzível e gates de engenharia confiáveis  | 001–006     | Captura/claims, Node22, instalação/build limpos; catálogo e workspace audit coerentes; dependências e alertas triados/resolvidos; certificação representa falhas e rejeita evidência stale                |
| M1    | Produto e escolhas concretas de consumidor/ambiente | 007–008     | Discovery/PRD pertinentes, decisõesWHAT, owner de dados e escolhas IdP/provider/canal/infra; preservar decisões existentes e G03 literal                                                                  |
| M2    | Núcleo cognitivo e contratos governados             | 009–018     | Contexto chega ao modelo; observações fundamentam resposta; reservaantes de calls; pisos policy; prompt aprovado; approval durável; knowledge tenant/provenance; re daction antes de sinks; guards de API |
| M3    | Plataforma neutra e fluxo vertical integrado        | 019–023     | Liberação/integraçãoPR-L04 e interfaces; request→worker PG→policy→approval/handoff→retomada→resposta→console; legacy isolado; hotspots decompostos; docs coerentes                                        |
| M4    | Identidade, segurança e dados completos             | 024–033     | Transportes/SSRF funcionais e restritos; OIDC/MFA e sessão PG no entrypoint; RLS/preflight semântico; replay/high-water/recovery; cofre; política de dados, purga, direitos; migration fora do serving    |
| M5    | Infraestrutura e operação qualificadas              | 034–037     | Ambientes/contas/roles separados; imagem por digest assinada; backup/PITR e RPO/RTO provados; alertas/runbooks/on-call e kill switch exercitados                                                          |
| M6    | Capacidades e experiência do operador               | 039–044     | Provider/canal/corpus escolhidos, aprovados e integrados; budget/prompt/knowledge/approval/recovery ativos; handoff/takeover; console acessível com sessão; evals e red team no caminho público           |
| M7    | Candidato qualificado e revisão externa             | 038,045–046 | Carga×3/soak24h com metas existentes; gates completos do candidato limpo; CI/atestações, SBOM/licenças; zero itens P0/P1 abertos em 0356; pentest/UAT/treinamento e auditoria independente                |
| M8    | Piloto avaliado e produção controlada decidida      | 047–050     | GO específico do piloto; período e limites aprovados; avaliação e correções; 13 gates atuais eD-15 hash-bound para produção                                                                               |
| M9    | Expansão e manutenção contínua                      | 051–052     | Onboarding por tenant, revisão30 dias; retirada do legado somente comDL-05, consumidores verificados e restauração                                                                                        |

**Caminho de convergência:** M0 eM1 abrem frentes sintéticas deM2/M3/M4; M5 exige decisões de ambiente; M6 usa os controles integrados; M7 consolida todos os aceites antes deM8. Carga/soak038 entra emM7 depois das capacidades, embora tenha insumos operacionais deM5. A retirada definitiva052 pode ser adiada por decisão explícita, preservando isolamento e gates vinculantes.

O G03 literal inclui tasks de piloto,expansão e pós-GA em0356. Isso exige **conciliação formal antes de qualquer promoção**, porque tarefas futuras dependem da própria liberação. UP91-007 encaminha o [pacote de opções já preparado](../04_audit/evidence/UP91-EXEC-20260930/product-packets/g03-decision-options.md) à decisão competente. Enquanto não houver satisfação do literal ou revisão humana expressa, a sequência M7→M8 permanece condicionada e NO_GO. O planejamento não resolve esse conflito por edição de wording.

## Primeiras iterações executáveis

| Iteração                              | Entregas e razão da prioridade                                                                                    | Pré-condição                                                                                                  | Prova de encerramento                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — confiança na base                 | 002/023: documentação atual e handoffs; 004/005/045:catálogo, advisories e parser; 024:hostname/bodyless/HEAD     | T1paths próprios; 0170/0174T3 pendentes; 0164 já aprovada condicional ao lock/claim; catálogo com seus owners | Ponteiros/links corretos; build independente; 0source_drift; feed aplicável resolvido; conformance de transporte; certificado FAIL válido quando gate falha |
| 2 — invariantes antes de capacidades  | 012/014:pisos/admissão durável; 009/010/011/013/015/016:contexto, resposta, budget, prompt, knowledge, re daction | Revisões humanas dos hashes congelados e insumos por módulo, claims livres                                    | Negativos recusados antes de gasto/efeito; requests e sinks da fixture observados; recovery PG/CAS sem redispatch; gates de regressão pertinentes verdes    |
| 3 — integração do primeiro consumidor | 019/020/025–028/043:composição neutra, sessão, tenant, replay e console                                           | PR-L04liberado; consumidor definido; contratos e identidade aprovados                                         | Mesmo candidato em API/worker/PG/browser; cross-tenant, restart, approval/handoff, retomada e expiração da sessão demonstrados                              |

Preparação T1 e recon independentes continuam enquanto BUILD dependente aguarda revisão; não iniciar a fatia bloqueada por inferência de aprovação. O primeiro incremento vertical deve ser sintético e usar contratos públicos, sem efeitos de consulta, finanças ou prontuário.

Os novos achados têm estado e aceites próprios no0367: [AUTH-01 emUP91-018](0367_program_backlog_reaudit_2026-09-30.md#up91-018) exige associação confiável e projeção limited/assigned; [STREAM-01 emUP91-028](0367_program_backlog_reaudit_2026-09-30.md#up91-028) limita recepção antes de bufferizar. A integração039 exige a saída de STREAM-01. Nenhum deles amplia SPEC congelada por inferência. AUTH-01 tem decisões humanas de fonte/escopo/conteúdo recebidas e [SPEC0176 proposta](../02_spec/0176_case_assignment_read_authorization.md); a sequência é revisão técnica/T3, liberação dos paths, schema e produtores confiáveis, readers/client e prova integrada. Preparação não conclui UP91-018.

Para010/015,seguir o [grafo de etapas](0367_program_backlog_reaudit_2026-09-30.md#grafo-de-etapas-010015):015-Ccontrato revisado/construído→010-Bmodular→015-Iintegrado→verificação conjunta010+015-V. O contrato015 é insumo pré-BUILD010;015 inteiro não é. Gates e claims permanecem por etapa e o aceite014 aplica-se à composição sensível.

## Arquitetura e resultados esperados

| Fronteira              | Mudança concreta a concluir                                    | Aceite público                                                                          |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Decisionmodel/contexto | GovernedContextBundle e versão/evidence chegam ao request      | Tenant/truncamento/fontes e contexto ausente provados no adapter                        |
| Resposta/grounding     | Observações do run e fontes aprovadas sustentam afirmações     | Resposta sem evidênciaabstém/handoff; revogação impede uso posterior                    |
| Orchestrator/budget    | Reserva e contabilização por tentativa, repair e fallback      | Chamada excedente bloqueada antes do gasto; usageUNKNOWN não vira0                      |
| Policy/approval        | Pisos anteriores aos grants; factory exige lifecycle durável   | ALLOW não remove confirmação; dispatch sem begin negado; UNKNOWN não gera retry cego    |
| Provider/canal/egress  | Prompt ligado aos bytes; DNS pinning e HTTP semantics corretos | DNSall/bodyless/HEAD, redirect eSSRF negativos; timeout apósPOST entra uncertainty      |
| API/identidade/dados   | Sessão corporativa PG, RBAC/tenant, preflight e roles          | Probes públicas sem lookup desnecessário; rotas protegidas recusam autoridade falsa     |
| Auditoria/telemetria   | Re dação antes do sink/SDK e refs ligadas ao run               | Canaries não vazam; digest/recovery/export/RLS verificados                              |
| Worker/operador        | Execução PG, handoff/takeover/kill switch e UX de sessão       | Restart não duplica efeito; parada impede novas ações; teclado/foco/expiração funcionam |
| Build/operação         | Serving mínimo, migration dedicada, digest e recuperação       | Clone limpo executável, provenance atual, PITR/SLO observados no ambiente autorizado    |

A [implementação capturada em 30/09](../architecture/CURRENT_IMPLEMENTATION_2026-09-30.md) descreve o que existe. Esta tabela descreve o que precisa ser concluído; interfaces opcionais e testes locais não provam composição produtiva.

## Autoridade, ownership e dependências externas

Aplicar a [constituição D-12](../07_agents/AGENTS.md) e a [coordenação](../08_runtime/agent_coordination.md) antes de cada edição. T1 é documental; T2 exige task/SPEC curta e gates; T3 exige revisão explícita da SPEC antes de BUILD; T4 exige pacote/candidato/decisão hash-bound. Nenhum owner sugerido recebe paths automaticamente.

| Dependência concreta                    | Situação na publicação                                                     | Próxima ação                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SPEC 0164                               | BUILD sintético aprovado no SHAe485c7d…; lock/pathsPR-L04 ainda reservados | Após liberação eclaim, aplicar escopo autorizado com feed atual e regressões; sem pedir de novo o mesmo aceite |
| Módulo012 em0167                        | Revisão T3 solicitada SHA7012a5d…; sem resposta registrada                 | Registrar decisão apenas quando chegar; implementar core se autorizado, sem dispensar014                       |
| Lote7 de0166/0167                       | Revisão T3 solicitada SHA312d5e5…; sem resposta registrada                 | Executar módulos por dependência eclaim após decisão correspondente                                            |
| SPEC 0170                               | Parser/binding; pedido T3SHA755f1cb… pendente                              | Implementar coleta vinculada e negativos após revisão                                                          |
| SPEC 0174                               | Node22/Response; pedido T3SHA9653ffb… pendente                             | Corrigir transporte com pisosSSRF preservados após revisão                                                     |
| PR-L04/PR-L08/PR-L09 e ledgers          | Claims de outroholder                                                      | Handoff exato, liberação por coordenação e integração restrita                                                 |
| IAM/dados/institucional/ambiente/piloto | Gates específicos de038–050 e decisões0357                                 | Preparar pacote concreto; operar conta real/piloto somente após autoridade pertinente                          |

## Estimativa e capacidade

Estimates por cartão permanecem no0367: S≈1–3, M≈4–8, L≈9–15 dias úteis de engenharia; XL deve ser decomposto antes deBUILD. São faixas de esforço com confiança baixa, **não datas prometidas**; excluem espera de aprovação, conta/infra, holder, pentest e piloto. Não somar tamanhos de52 unidades às 83 tasks de origem: o programa reutiliza trabalho existente e reúne integração/revalidação.

Planejar até três lanes com paths disjuntos, contratos estáveis e uma coordenação central; builder nunca autoaprovaDONE. Segurança/policy/lifecycle e autenticação acopladas avançam sequencialmente quando compartilham fronteira. Reservar crítica fresh e gates; I1 não substitui pentest externo ou aceite operacional.

## Indicadores para decidir progresso

- Cartões concluídos somente com aceite específico e autoridade; mostrar progresso parcial sem encerrar pais.
- Zero skips nos gates obrigatórios com PG; catálogo/source hashes coerentes; denominadores e exclusões explícitos. Cobertura global/critical e margem PR-007 preservadas.
- Zero itens P0/P1 abertos em 0356 no escopo de release conforme G03; sem remover findings ou mudar critérios para obter PASS.
- Typecheck, lint, build, unit, PG, E2E, evals, coverage, security, SBOM/licenças e CI ligados ao mesmo candidato; certificação recusa drift/stale.
- Contexto, prompt, grounding, budget, policy, lifecycle, tenant e re dação provados na fábrica/adapters públicos.
- RPO/RTO, p95/p99, carga×3/soak24h, alertas e piloto com observação operacional; restore sintético não substitui PITR.
- GO/NO_GO humano sempre ligado ao hash/digest/configuração/escopo aprovado; nota técnica alta não autoriza release.

## Continuidade e revisão

Atualizar0367 e evidência a cada fatia; 0356 somente pelo holder pertinente. Atualizarruntime/log/backlog compartilhados pelo [handoffAUD0592](../08_runtime/handoffs/aud0592_execution_20260930.md), mantendo integração pendente explícita. Reavaliar este sequenciamento após decisões, integrações e nova evidência; preservarIDs, aceites e histórico. O relatório0592 e os artefatos brutos indicam limites atuais; o plano só encerra quando o programa completo satisfizer seus critérios.
