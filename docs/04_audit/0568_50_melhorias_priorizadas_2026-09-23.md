# 50 melhorias priorizadas — 23/09/2026

## Base e limite

Lista proposta a partir da avaliação `0567`, do estado mestre, do backlog
`0337`, do dossiê `REM21-019`, do pacote offline `REM21-009`, do PRD/SPEC e da
análise de extração do Harness. **Prioridade não é autorização de execução.**
O candidato local segue `CONDITIONAL_PASS / FINAL_CERT_DEFERRED`; `A21-F05` e
`A21-F06` permanecem bloqueados externamente, `A21-F20` exige I1 aceito,
`G21-5`/`G21-6` estão fechados e produção é `NO_GO`. Itens externos abaixo
dependem de autoridade humana, ambiente e dados aprovados. Nenhum controle
local já verificado é declarado ausente por esta lista.

As propostas são mutuamente distinguíveis por entrega: algumas são decisões
de autoridade, outras qualificações técnicas e outras melhorias de produto.
Cada uma precisa passar pelo pipeline `DISCOVERY -> PRD -> SPEC -> BUILD ->
AUDIT` aplicável antes de implementação.

## Alta prioridade — 20

1. **H01 — Fechar a revisão I1 do candidato.** Obter parecer independente
   aceito e sentinel final para `REM21-019`, preservando as condições externas.
2. **H02 — Produzir um snapshot de release reproduzível.** Fixar commit,
   manifesto, artefatos e instruções de reprodução em uma composição limpa
   antes de qualquer decisão sobre promoção.
3. **H03 — Decidir explicitamente o gate `G21-5`.** Submeter o pacote
   `REM21-009` à autoridade humana; registrar escopo, janela e condições de
   recusa antes de qualquer qualificação externa.
4. **H04 — Nomear owners e approvers externos.** Preencher os sete slots de
   identidade, provider, canal, fonte, egress, privacidade e rollback com
   responsáveis reais e evidência de aceitação.
5. **H05 — Qualificar o IdP real.** Provar issuer, audience, claims, papel,
   tenant, revogação, expiração e troca de usuário em ambiente aprovado.
6. **H06 — Qualificar a sessão de operador distribuída.** Provar cookies,
   proteção CSRF, expiração, logout e revogação entre réplicas e reinícios.
7. **H07 — Qualificar o worker produtivo como perfil separado.** Exigir
   preflight, permissões mínimas, readiness, drain, recuperação e bloqueio de
   efeito sensível até aprovação própria.
8. **H08 — Qualificar um provider de modelo real.** Definir contrato de dados,
   região, classificação, timeout, limite de custo, fallback e desligamento.
9. **H09 — Qualificar o canal real.** Provar autenticidade do webhook,
   idempotência, deduplicação, receipt, handoff e parada de dispatch.
10. **H10 — Aprovar fontes institucionais.** Atribuir owner, versão, validade,
    revisão e revogação a cada fonte antes de qualquer resposta RAG real.
11. **H11 — Formalizar autoridade de agenda e autonomia.** Aprovar matriz de
    cargos, níveis de autonomia e regras de confirmação, cancelamento e
    reagendamento; manter essas ações reais bloqueadas até decisão separada.
12. **H12 — Provar o bloqueio de ações sensíveis no ambiente alvo.** Testar
    negação e handoff para atos clínicos, financeiros, prontuário e consultas
    reais, inclusive falha de policy ou approval.
13. **H13 — Aprovar privacidade e retenção.** Definir finalidade, minimização,
    acesso, residência, prazo, exclusão e resposta a incidentes antes de usar
    dados reais.
14. **H14 — Gerir secrets e rotação fora do repositório.** Qualificar secret
    manager, segregação de papéis, renovação e revogação de credenciais.
15. **H15 — Medir RPO/RTO no ambiente aprovado.** Ensaiar backup, restore,
    rollback e leitura da aplicação após falha, com critérios mensuráveis.
16. **H16 — Qualificar egress externo.** Aprovar proxy/allowlist, DNS,
    certificados, TLS, redirects e resposta à mudança de destino.
17. **H17 — Operar alertas e SLOs fora do processo local.** Configurar
    exportação, retenção, dashboards, paging e teste de alerta até um operador.
18. **H18 — Provar auditoria durável ponta a ponta.** Vincular request,
    decisão humana, policy, tool, worker e resposta ao mesmo trace após
    reinício e restore, com controle de acesso aos registros.
19. **H19 — Preparar piloto assistido com parada imediata.** Definir critérios
    de entrada/saída, kill switch, rollback, fila humana e observação, apenas
    após `G21-5` e sem ações sensíveis automáticas.
20. **H20 — Submeter a decisão `G21-6` separadamente.** Exigir candidato,
    evidência externa, I1 aceito, sentinel e signoffs técnicos e de negócio;
    manter produção `NO_GO` até deliberação explícita.

## Média prioridade — 20

21. **M01 — Reconciliar os índices operacionais.** Concluir
    `AUD22-DOC-001`, alinhando `0300`–`0302`, `0337` e índice `99` aos ledgers.
22. **M02 — Dividir o composition root da API.** Extrair grupos de rotas e
    wiring de `apps/api/src/server.ts` sem alterar autoridade ou contratos.
23. **M03 — Dividir o adapter PostgreSQL.** Separar repositórios, transações e
    preflight de `packages/persistence/src/postgres.ts` por responsabilidade.
24. **M04 — Reduzir o tamanho do runtime iterativo.** Isolar decisão, execução,
    budgets, journal e conclusão com contratos de estado explícitos.
25. **M05 — Demonstrar a composição pública canônica do Harness.** Exercitar
    HTTP → PostgreSQL → worker → kernel com o mesmo contrato observado pelos
    consumidores, preservando os caminhos legados necessários.
26. **M06 — Demonstrar um segundo consumidor não clínico.** Compor um cliente
    sintético usando somente APIs públicas do Harness, sem editar seu core.
27. **M07 — Tornar dependências de packages verificáveis.** Conferir imports,
    exports, manifests e direção do grafo em builds isolados.
28. **M08 — Unificar o contrato de capabilities.** Dar a tools nativas e
    plugins o mesmo schema de input/output, efeito, autorização, timeout e
    auditoria.
29. **M09 — Consolidar os domínios de approval.** Explicitar ownership,
    autorização do approver e recuperação entre os motores existentes.
30. **M10 — Acrescentar proveniência por afirmação à resposta RAG.** Ligar
    trecho, versão e validade da fonte a cada afirmação, com handoff quando
    a evidência for insuficiente.
31. **M11 — Modelar ambiguidade e estado de diálogo.** Persistir perguntas em
    aberto, dados confirmados e correções do tutor antes de sugerir jornada.
32. **M12 — Avaliar o runtime integrado, além das fixtures determinísticas.**
    Usar corpus sintético revisado por humanos e medir erro, handoff, latência
    e custo no caminho completo.
33. **M13 — Provar modo degradado de integrações.** Exercitar falhas e retorno
    de HIS, Desk e CIP com adapters sintéticos, sem perder conversa ou tarefa.
34. **M14 — Exercitar carga com múltiplas réplicas.** Medir concorrência,
    leases, replay e backpressure com PostgreSQL descartável e workers duplos.
35. **M15 — Definir limites de fila e justiça entre tenants.** Controlar
    quotas, prioridade, retry e dead letter sem starvation ou perda de evento.
36. **M16 — Tornar a trilha operacional pesquisável.** Expor trace e
    correlation id entre API, worker, approval e handoff no painel com
    redaction e escopo de tenant.
37. **M17 — Melhorar a decisão humana no painel.** Mostrar contexto,
    fundamento de policy, impacto, expiração e resultado da decisão antes do
    clique de approval.
38. **M18 — Otimizar consultas e paginação por evidência.** Medir listagens
    de conversas, tarefas e auditoria com volumes sintéticos e índices
    apropriados, respeitando limites atuais.
39. **M19 — Validar UX com operadores em ambiente aprovado.** Observar
    compreensão de handoff, tarefas, erro, foco e troca de tenant, mantendo
    dados sintéticos até gate específico.
40. **M20 — Provar compatibilidade de versões e rollback do runtime.** Cobrir
    API/worker/schema mistos, approvals pendentes e reexecução após upgrade.

## Baixa prioridade — 10

41. **L01 — Criar um guia curto de início.** Documentar perfis local e
    homolog, comandos e pontos de bloqueio sem copiar regras canônicas.
42. **L02 — Padronizar o glossário.** Definir o uso de `approval`, handoff,
    release candidate, gate e estados em português e inglês.
43. **L03 — Gerar navegação documental derivada.** Atualizar índices a partir
    dos ledgers após a reconciliação manual de `M01`.
44. **L04 — Reduzir repetição nos ledgers extensos.** Manter histórico intacto
    e produzir visões resumidas derivadas para leitura humana.
45. **L05 — Ampliar exemplos sintéticos.** Mostrar atendimento, aprovação,
    fonte ausente, falha de canal e restore sem dado real.
46. **L06 — Refinar textos de estados vazios e erros no painel.** Explicar
    expiração de sessão, falta de permissão e handoff ao operador.
47. **L07 — Desenhar mapas pequenos dos fluxos críticos.** Ilustrar approval,
    outbox, recovery e release junto aos contratos existentes.
48. **L08 — Uniformizar nomes de métricas e eventos.** Usar um catálogo com
    descrição, unidade e cardinalidade permitida.
49. **L09 — Documentar APIs públicas por consumidor.** Dar exemplos de
    composição do Harness sem imports internos nem dependência do produto.
50. **L10 — Revisar periodicamente links e evidências históricas.** Manter
    catálogo de artefatos vazios, portabilidade e validade das referências.

## Ordem de decisão sugerida

Primeiro `M01` (correção documental já proposta) e `H01`/`H02` no escopo
local. Os preparativos e decisões de `H04`, `H11` e `H13` alimentam o pacote
humano de `H03`. Somente após decisão explícita sobre `G21-5` podem começar as
qualificações externas de `H05`–`H10`, `H12` e `H14`–`H19`. `H20` vem após as
evidências pertinentes; nenhuma proposta acima concede produção, dados reais,
dispatch ou ação sensível.
