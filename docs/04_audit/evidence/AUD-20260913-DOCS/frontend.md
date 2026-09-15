# Auditoria independente frontend — 2026-09-13

Escopo: aderência da superfície web aos requisitos operacionais de PRD e control plane, sem alterações no produto. Escala solicitada: 0 ausente, 25 scaffold, 50 parcial, 75 funcional local com lacunas, 90 evidência integrada forte, 100 integralmente comprovado. Notas heurísticas de aderência, não percentuais de testes nem autorização de release.

**Nota frontend aderência documental: 60/100**, média simples dos dez recortes abaixo, arredondada. **Qualidade visual shell: 78/100**, julgamento separado, confiança média. O console tem estrutura funcional real e bom reflow básico, mas a jornada não completa retomada/ambiguidade/handoff e foi reproduzida contaminação visual entre tenants. Não elegível a AAA/aprovação de produção.

## Documentos e instruções lidos

- AGENTS.md e docs/07_agents/AGENTS.md completos.
- docs/99_runtime_state.md, docs/20_master_execution_log.md, docs/30_backlog_master.md: leitura operacional solicitada retornou saída agregada truncada; conteúdo histórico não usado como evidência nem notas anteriores consultadas.
- docs/01_prd/0013_requisitos_funcionais.md; 0014_requisitos_nao_funcionais_produto.md completos.
- docs/01_prd/0010_casos_de_uso.md: UC01–UC09.
- docs/01_prd/0024_rem0539_r3_journeys.md completo.
- docs/platform/control-plane.md completo.
- docs/platform/06-platform-spec.md: requisitos de UI, interfaces mínimas, Test Lab, gates (970–1060), buscas localizadas de UI/admin/trace/catalog/lifecycle. docs/platform/05-platform-prd.md: busca localizada de requisitos de UI; não leitura integral.
- Skill design-director/SKILL.md e referências quality-rubric, anti-patterns, accessibility.

## Matriz requisito → implementação → observação → nota

| Recorte | Requisito | Código (relativo ao repositório) | Observação | Nota |
|---|---|---|---|---:|
| Conversas/histórico | RF080, RF005 | apps/web/src/App.tsx:184; features/conversations/index.tsx:50 | Lista real por client, seleção e timeline, estados vazio/loading/error. Busca sempre limit25/offset0, descarta pageInfo, não oferece próximo lote/filtro/refresh. Sem acompanhamento de novas mensagens observado no código; recarga depende de identidade/seleção. | 65 |
| Approvals/assunção | RF081, RF083, RF052 | features/approvals/index.tsx:63; App.tsx:740 | Botões reais aprovar/rejeitar/assumir, disabled por papel/ação, handlers de conflito no App. Proposta e risco visíveis, mas contexto/evidência de handoff não integrado à decisão. Não exercitado com API real nesta lane. | 75 |
| Tarefas | RF082, RF060–062 | features/tasks/index.tsx:55; features/journeys/index.tsx:210 | Lista/status e iniciar/concluir/cancelar; criação usa título/descrição fixos e não refresca fila parental. Não é editor operacional de tarefa com responsável/prazo/contexto. | 65 |
| Tutor/pet | UC03, RF-R3-01–04 | features/journeys/index.tsx:83,120,138,157,335 | Tutor suporta zero/um/vários e radio explícito. Pet mostra múltiplos matches apenas em spans, não permite seleção; link só aceita draft com um candidato. Proposta de escolha explícita não vira ação disponível. | 55 |
| Drafts/retomada | RF-R3-03,09 | features/journeys/index.tsx:27–59; api/client.ts:570,618,665 | Client possui listagem de drafts; painel não chama essas leituras. Drafts só useState e zerados na troca de identidade/reload. Persistência backend pode existir, mas operador não retoma pela UI. | 35 |
| Slots/agendamento bloqueado | RF040–043, RF-R3-05–06 | features/journeys/index.tsx:177–205 | Consulta slots sintéticos, seleção, criação appointment draft e copy clara de bloqueio real. Não exercitado end-to-end com backend nessa lane. | 75 |
| Handoff com resumo | RF084, UC07, RF-R3-08 | features/journeys/index.tsx:210,400; App.tsx:751 | Seção “Handoff e tarefa” oferece texto genérico e criação de tarefa. Não localizei leitura/display de resumo tutor/pet/intenção/risco/tools/pendências; assunção existe via approval, mas resumo consumível não. | 30 |
| Control Center/Test Lab | SPEC control plane lifecycle/clone/catalog/trace | features/platform/index.tsx:322,391,426,499,550,586,691,777,863,978–1784 | Implementação ampla, handlers e estados, agent scope stale guard, versões/clones, testes/suites, catálogos, ledger e traces. Editor longo com JSON e termos técnicos; coerente com admin controlado, distante de UX recepção. Sem integração real executada aqui. | 78 |
| Isolamento/identidade UI | RNF dados só perfis autorizados, tenant obrigatório R3 | features/journeys/index.tsx:47–59,71–98; App.tsx:646; api/client.ts:460 | **Falha reproduzida:** resposta de busca tenant A reaparece após troca para B. App/Platform protegem continuações mas Journey não. Headers autoafirmados são UI controlada, não login produção; não concluo bypass backend. | 45 |
| Estados/a11y/reflow | Uso operacional multiusuário; baseline skill acessível | App.tsx:631; styles.css:91,707–805; componentes | Shell renderizado 375/768/1440 sem overflow, sem pageerror, skip link move foco. Labels, roles status/alert, focus-visible e reduced-motion existem. Falta auditoria completa contraste/leitor de tela/estados carregados longos. | 80 |

Média: (65+75+65+55+35+75+30+78+45+80)/10 = 60,3, arredondada para 60/100.

## Achados prioritários

1. **Alta — UI-01: resposta assíncrona cruza mudança de escopo visual.** Browser real, API interceptada sintética. Iniciar `GET /v1/journeys/owners/search` com tenant_A, mudar campo Tenant ID para tenant_B, devolver resultado antigo. A UI exibe candidato privado sintético de A sob cabeçalho B. `useEffect` limpa estado, mas a continuação não verifica geração/tenant. Evidência /tmp/cvg-audit-ui/race.log, race.cjs, tenant-race.png. Não prova acesso não autorizado API; prova dados anteriormente autorizados reaparecendo sob outro escopo visual. Correção sugerida: identidade/geração capturada em toda continuação da jornada e cancelamento/invalidação ao mudar identidade e sessão.
2. **Alta — UI-02: RF-R3-09 não alcança operador web.** APIs de leitura de drafts estão no client, não conectadas ao painel. Reload perde referências e operador precisa recomeçar. Persistência em backend não substitui retomada visual.
3. **Alta — UI-03: RF084/UC07 não entrega resumo na UI.** Handoff é botão/ação e orientação genérica; contexto estruturado esperado no documento não aparece no painel.
4. **Média — UI-04: pet ambíguo não tem escolha.** Texto promete escolha explícita, JSX só lista nomes e desabilita link com mais de um candidateId.
5. **Média — UI-05: fila limita silenciosamente acesso a 25 conversas.** pageInfo descartado; nenhuma UI para navegar às seguintes. Contador representa lote, não fila total.
6. **Média — UI-06: ergonomia de console técnico.** Render contém Operator/Admin/locked/Tenant ID/fixtures; texto e campos em 10–13px, header toma ~500px no mobile antes das filas. Não impede shell, mas exige tradução/orientação e melhor prioridade para recepção; operação controlada explicitamente declarada reduz risco de interpretação como produto final.

## Evidência executada independente

Cópia de apps/web em /tmp/cvg-audit-ui/web; node_modules compartilhado só como dependência read-only. Vite localhost4398, cache próprio. Ajustados apenas paths/references do tsconfig da cópia porque localização mudou. Nenhuma mudança no produto ou repositório. Browser Playwright como fallback local disponível. APIs interceptadas apenas no cenário race; screenshots empty são shell sem identidade/API.

- `node /tmp/cvg-audit-ui/capture.cjs`: render de 1440,768,375; document.scrollWidth igual a viewport em todos; pageerrors=[].
- `node /tmp/cvg-audit-ui/race.cjs`: tenant=tenant_B, staleTenantCandidateVisible=true; skipFocus=true.
- Screenshots /tmp/cvg-audit-ui/empty-1440.png, empty-768.png, empty-375.png, tenant-race.png. Inspecionadas visualmente desktop/mobile/race via view_image; tablet mensurada, screenshot não inspecionada.
- Logs /tmp/cvg-audit-ui/render.log e race.log. server.log preserva erros iniciais de path da cópia, resolvidos antes da captura final; não são falhas do produto original.
- Testes existentes visual-shell.spec.ts e testes componente inspecionados; não reaproveitada evidência de execução histórica, nem executada suíte E2E completa nesta lane.

## Julgamento visual separado

78/100 heurístico, confiança MÉDIA: hierarquia/coerência 8/10, tipografia/densidade 7/10, reflow observado 8/10, estados acessíveis parciais 8/10, especificidade operacional 8/10. Cards e sombras consistentes; nenhuma decoração essencial falsa encontrada. O shell reduz adequadamente colunas no mobile, porém identidade domina primeira dobra e estado vazio ainda deixa a navegação operacional extensa. Não avaliado modo com centenas de linhas/admin completamente preenchido, leitor de tela, contraste automatizado ou recuperação real de rede. Isto não aprova visual completo nem funcionalidade de produto.

Limites: frontend apenas; backend/DB/idempotência real/canais/modelos/latência são lanes distintas. Interceptação prova comportamento de estado do browser, não integração. Nenhuma produção, dados reais ou efeitos externos. Esta avaliação não usa auditorias anteriores.
