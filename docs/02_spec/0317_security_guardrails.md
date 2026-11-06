# SPEC 0317 — Identidade do solicitante e guardas de segurança

Status: `PROPOSED_FOR_HUMAN_T3_REVIEW`. Trilha **T3**. Data: 05/11/2026.
Task: `SPEC-GUARDRAILS-20261105`. Preparação documental concluída; BUILD não autorizado.

## 1. Escopo, autoridade e evidência

Pedido do usuário: conferir os seis achados e propor recon, regras, negativos e
critério de pronto, parando para revisão humana T3. A [constituição](../07_agents/AGENTS.md)
exige revisão explícita antes de alterar segurança, identidade, policy, approval
ou schema. A direção é a [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md).
OIDC de produção/Keycloak e sandbox PROCESS ([0316](0316_tool_runner_service.md))
estão fora do escopo. Nenhuma autorização de produção decorre desta SPEC.

Recon em `d394d71a4f8e1cfb031aeca1b3442132e8a6a833`, clone externo
`/tmp/cvg-codex-20261105/repo`, `npm ci` concluído com exit 0. Node local
22.23.3; `.nvmrc` exige 22.23.2. O probe usa código fonte, memória e HTTP em
loopback, apenas fixtures sintéticas. Não é certificação nem prova PostgreSQL.

- [Manifesto dos arquivos e hashes](../04_audit/evidence/SPEC-GUARDRAILS-20261105/source-manifest.json).
- [Reprodução executada](../04_audit/evidence/SPEC-GUARDRAILS-20261105/reproduction.mts.txt)
  com `node --import tsx guardrails-repro.mts`, exit 0, e [resultados](../04_audit/evidence/SPEC-GUARDRAILS-20261105/probe-result.json).
- Tentativas anteriores preservadas: [formato TS/CommonJS](../04_audit/evidence/SPEC-GUARDRAILS-20261105/probe-attempt1.log)
  e [fixture com enum incorreto](../04_audit/evidence/SPEC-GUARDRAILS-20261105/probe-attempt2.log),
  ambas exit 1. Corrigido somente o probe externo, sem mudar aplicação ou testes.
- [Inventário das flags](../04_audit/evidence/SPEC-GUARDRAILS-20261105/real-flags-inventory.log).
- Gates PostgreSQL/imagem da baseline: [retomada local e comparação CI](../08_runtime/audit-pg-run-20261105.md), PASS após liberar Docker, em Node 22.23.2. Os novos negativos desta SPEC continuam por implementar/executar.

| Item | Recon confirmado                                                                                             | Limite da evidência atual                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| G1   | Identidade humana não chega ao registro de execução/approval; engine aprova humano diferente do ID do agente | Probe do engine e rastreamento do caminho HTTP/worker; exploração HTTP com PostgreSQL ainda `NOT_RUN`                          |
| G2   | As três frases apontadas retornam `allowed`                                                                  | Reproduzido com `riskLevel=low`; `high/critical` em modo answer já são reescritos                                              |
| G3   | Matching de binding permite resposta fornecida pelo chamador sem resolvedor; rotas sempre registradas        | Reproduzido no laboratório em memória; não demonstra exposição anônima ou exploração em produção                               |
| G4   | Flags não controlam despacho/composição de ações                                                             | Inventário inclui também atribuições no smoke de imagem; alegação de que só aparecem em env/testes era literalmente incompleta |
| G5   | POST de criação exige `approval:view`                                                                        | HTTP sintético: Operator com grant cria, status 200; também há autenticação, autorização do caso e idempotência                |
| G6   | Produto aceita `?secret=` sem assinatura do corpo                                                            | HTTP loopback: sem segredo 401, query com corpo original/alterado 200; parser sintético retorna null, sem admitir mensagem     |

## 2. G1 — Separação entre solicitante humano e aprovador (P1, harness)

### Recon

[POST de execuções](../../apps/api/src/routes/register-executions.ts:49) autentica
com `conversation:update`, mas [submitExecutionWithCase](../../apps/api/src/case-authorization/case-routes.ts:545)
usa a identidade para autorização e não a persiste na submissão.
[ExecutionSubmission/Record](../../packages/harness/src/execution-spine.ts:58)
não têm submissor. O [kernel](../../packages/harness/src/kernel/controls.ts:516)
define `operatorId: input.agent.id`; o [engine](../../packages/approval-engine/src/engine.ts:277)
nega autoaprovação comparando esse campo ao aprovador humano.
[Approver](../../packages/shared/src/auth.ts:15) reúne `conversation:update` e
`approval:decide`. Grants do caso seguem necessários. A [unidade PostgreSQL](../../packages/persistence/src/runtime-approval-decision-postgres.ts:126)
também usa o operatorId do approval na transição intermediária. O
[teste existente](../../apps/api/src/__tests__/runtime-approval-unit-postgres.test.ts:601)
nega o ator com ID do agente, sem cobrir o humano que submeteu.
O probe reproduz APPROVED para `human.submitter.synthetic` quando operatorId
é `agent.synthetic`; isso demonstra a comparação insuficiente, sem substituir
o futuro teste HTTP/worker/PG completo.

### Regras propostas

1. Registrar um `submittedBy` imutável e tipado (`human` ou `system`, ID e tenant)
   na execução. Na API vem somente da identidade autenticada, nunca do corpo.
   Produtores internos precisam declarar principal de sistema verificável pela
   composição. Identidade ausente/desconhecida não autoriza approval sensível.
2. Propagar o principal pelo worker/restart até o approval, separando-o de
   `agentId` e do `operatorId` legado. Vincular executionRef, versão da proposta
   e principal persistidos; conferir ambos os registros na unidade de decisão.
   Não substituir silenciosamente a semântica de campos existentes.
3. Recusar APPROVED pelo próprio solicitante humano, inclusive Supervisor,
   antes de mutar approval, execução, journal ou emitir evento de decisão.
   Não permitir `allowSelfApproval` no host operacional. Rejeição e handoff
   conservam seus contratos, sem conceder capacidade de aprovação.
4. Persistir origem e decisão na unidade transacional existente. Retry,
   concorrência, restart e delegação conservam o solicitante original. Uma
   mudança de proposta exige novo vínculo com o proponente autenticado; não
   reutilizar approval de outra revisão. Replay de idempotency key por outro
   principal deve conflitar sem revelar registro nem trocar autoria.
5. Migration aditiva de execução/approval e contrato versionado: registros
   anteriores ficam com origem `unknown`; nunca inferir humano do ID do agente
   ou de log parcial. Approval pendente sem origem confiável exige recriação ou
   handoff. Definir hash/vínculo da nova versão sem revalidar propostas antigas
   como se já contivessem a nova autoria. Backfill não inventa identidades.

### Negativos e pronto

- HTTP autenticado: humano A com papel Approver e grant submete; worker chega
  a WAITING_APPROVAL; A tenta aprovar e recebe negação. Snapshot antes/depois:
  nenhum efeito, evento de aprovação, resume ou alteração intermediária persiste.
  B, com papel/grant válidos, aprova a mesma proposta como controle positivo.
- Tentar forjar `submittedBy`, usar mesmo ID em outro tenant, perder grant,
  trocar proposta/revisão, repetir sob concorrência ou após restart e usar
  registro legado sem origem. Tudo falha fechado conforme regra aplicável.
- Cobrir memória e PostgreSQL, caminho atômico e qualquer fallback suportado.
  Incluir o negativo HTTP/PG no comando efetivamente executado por
  `test:postgres`; o arquivo unitário citado não está na lista explícita atual.
- Pronto: autoria durável e auditável, migration/rollback sintéticos provados,
  negação sem efeito e aprovação por B demonstradas em Node 22.23.2.

## 3. G2 — Fronteira de saída além do vocabulário atual (P1, harness)

### Recon

[output-policy.ts](../../packages/platform/src/output-policy.ts) tem padrões de
diagnóstico, unidades, alguns medicamentos, pagamento e consulta/agendamento.
Com modo answer e risco low, passaram literalmente: “tome 2 comprimidos de
amoxicilina a cada 8 horas”, “pague o boleto por PIX”, “seu horário foi confirmado”.
Risco high/critical já reescreve answer; o problema inclui confiar numa
classificação low insuficiente, não ausência completa de política de saída.

### Regras propostas

1. Ampliar detecção normalizada para instrução de ingestão/frequência/unidade
   de comprimido, nomes de fármacos, imperativos financeiros e confirmação de
   horário/agenda. Usar corpus de variantes, preservando limites de tamanho,
   normalização Unicode, redação e texto de handoff controlado.
2. Risco efetivo vem da avaliação do servidor, nunca de rótulo escolhido pelo
   cliente/modelo. Conteúdo sensível ou risco desconhecido sai como handoff ou
   bloqueio com template controlado, inclusive em clarify e templates de usuário.
3. Para alegar conclusão de ação permitida, exigir evidência estruturada do
   kernel vinculada à operação, destinatário, versão e resultado. Texto de
   modelo ou regex não prova execução. Esta mudança não habilita consulta,
   prontuário ou pagamento real, que permanecem proibidos.
4. Regex é defesa complementar: não cobre paráfrase arbitrária, contexto,
   ironia, negação, outros idiomas, codificações novas ou instrução indireta.
   Fluxos sensíveis usam saída de vocabulário controlado e handoff por padrão;
   nenhum resultado do filtro deve ser apresentado como garantia semântica.

### Negativos e pronto

- As três frases, variações de caixa/acentos/confusáveis, “um comprimido duas
  vezes ao dia”, instruções sem unidade numérica e confirmação em outro tempo
  verbal não chegam ao usuário como orientação/conclusão de ação real.
- Testar resposta de modelo, fonte e template, todos os modos de saída, risco
  forjado/ausente e tentativa de fabricar evidência. Checar ausência do texto
  inseguro no payload de resposta e coerência de trace/audit.
- Controles: endereço institucional validado e handoff/refusal do kernel
  continuam utilizáveis; texto negado sobre pagamento não vira confirmação.
- Pronto: corpus parametrizado verde na fronteira final e integração, sem
  depender de classificador perfeito nem ampliar capacidades do programa.

## 4. G3 — Conhecimento e laboratório com autoridade do servidor (P1, harness)

### Recon

[Laboratório](../../apps/api/src/routes/register-test-lab.ts:64) e
[execução de capability approval](../../apps/api/src/routes/register-capability-approvals.ts:291)
repassam `body.approvedKnowledge` quando falta resolvedor.
[resolveKnowledge](../../packages/platform/src/test-lab.ts:597) confere binding
habilitado/source/version e usa answer livre. A [validação](../../packages/platform/src/contracts.ts:183)
exige `controlled://` e formato, sem provar aprovação institucional do conteúdo.
[server.ts](../../apps/api/src/server.ts:809) registra laboratório sempre;
as rotas exigem `test:run`, logo o achado não equivale a acesso anônimo.
O probe devolveu answer escolhido pelo cliente com binding correspondente.
Quando há resolvedor, o corpo já perde precedência; preservar essa propriedade.

### Regras propostas

1. Registrar rotas de laboratório somente em perfil explícito de teste,
   validado no bootstrap com NODE_ENV=test e composição sintética. Qualquer
   tentativa de habilitá-lo fora desse perfil deve falhar no bootstrap.
   Fora dele, todas as rotas do laboratório ficam ausentes (404).
2. Rejeitar `approvedKnowledge` de cliente nas rotas operacionais. Testes que
   precisam de fixtures devem injetá-las por porta interna da composição de
   teste, mantendo o request externo sem autoridade sobre conteúdo aprovado.
3. Sem resolvedor institucional composto, responder handoff/source_missing;
   não usar answer do cliente como fallback. Com resolvedor, conferir tenant,
   source/version aprovados e vigentes, proveniência e vínculo do trecho à
   resposta. Aprovação é consultada no servidor, não inferida do prefixo URI.
4. Aplicar a regra também a avaliações/suítes, execução controlada de
   capabilities e entrada de canal (`server-inbound.ts`), sem abrir um caminho
   alternativo. Falha, timeout, revogação e resposta inválida do resolvedor
   impedem answer; filtro G2 segue obrigatório depois da resolução.

### Negativos e pronto

- Perfil fora de teste: inventariar cada rota do laboratório (incluindo
  evaluate e suítes), confirmar ausência inclusive com Admin autenticado.
  Tentativa de habilitar por flag isolada não funciona.
- Forjar source/version/answer, usar binding válido com answer adulterado,
  fonte revogada/outro tenant, resolvedor ausente/lento/falhando: zero resposta
  institucional inventada, zero efeitos e audit sem conteúdo sensível.
- Com resolvedor e corpo forjado, nenhuma prevalência do corpo; fixture interna
  de teste continua funcionando sem ser aceita no contrato operacional.
- Pronto: contrato de fonte/proveniência e bootstrap fechados; inventário de
  entradas coberto; prova em memória e PostgreSQL sem fontes ou dados reais.

## 5. G4 — Flags com efeito verificável (P1, harness)

### Recon

[env.ts](../../packages/shared/src/env.ts:57) declara quatro ENABLE*REAL*\* e
[realWorldActionsDisabled](../../packages/shared/src/env.ts:123) só calcula um
booleano. O inventário não encontrou consumidor desse helper no runtime.
Há testes e atribuições no smoke de imagem; atribuir false no smoke não prova
que o despacho de ação consulta uma guarda. Isso não prova que os outros
controles de approval/policy/journal sejam inexistentes.

### Regras propostas

1. Ligar ENABLE_REAL_CHANNELS e ENABLE_REAL_RAG ao bootstrap e à fronteira
   final de cada adapter real do harness. False ou contexto de guarda ausente
   impede composição/despacho real; fixtures sintéticas são classificadas na
   composição, nunca pelo corpo, cabeçalho ou autodeclaração do plugin.
2. True é condição necessária, não autorização. Continuam obrigatórios fonte
   aprovada, policy, grant, approval, journal e decisão T4 correspondente.
   Mensagem/rede/env de cliente não altera a guarda de um processo vivo.
3. ENABLE_REAL_PAYMENTS e ENABLE_REAL_MEDICAL_RECORDS true devem causar erro
   de configuração: essas capacidades permanecem proibidas pelo programa.
   False não dispensa o bloqueio absoluto dessas categorias no despacho.
4. Substituir o helper agregado por guardas explícitas por capacidade; remover
   o helper sem consumidores após ligar as fronteiras. Publicar motivo seguro
   do bloqueio na observabilidade; nunca expor segredos ou confundir flag com GO.
   Não aplicar flags do harness ao produto por import inverso: o consumidor
   tem composição própria e G6/backlog próprios.

### Negativos e pronto

- Cada adapter real com flag false, sem guarda ou env inválido falha antes de
  qualquer I/O; spies/receptor sintético comprovam zero chamadas. True sem
  autorização/fonte/grant continua bloqueado; pagamentos/prontuário true nem
  iniciam o processo. Fixture sintética continua passando sem acesso externo.
- Testar tentativa de registrar plugin como sintético pelo request, execução
  no worker após restart e caminho de entrada/saída de canal e RAG.
- Pronto: matriz flag × capacidade × autorização exercita a fronteira final,
  incluindo smoke de imagem negativo; nenhum controle fica só declarado.

## 6. G5 — Permissão própria para criar approval (P2, harness)

### Recon

[POST /v1/approvals](../../apps/api/src/routes/register-approvals.ts:45) exige
`approval:view` antes de criar. O probe autenticou Operator, concedeu grant ao
caso e criou approval (200); esse papel possui view, sem decide. Não foi
demonstrado bypass de grant: o problema é a permissão de leitura autorizar uma
mutação. Exportação de evidência ainda exige `audit:view_full` adicional.

### Regras propostas

1. Introduzir `approval:create`, separada de view/decide/execute, e exigir na
   criação. Proposta para a matriz: Operator, Approver e Supervisor recebem
   create; Admin continua apenas view para approvals até decisão explícita
   distinta. Isso preserva submissão operacional e reduz o poder implícito de view.
2. Preservar grant do caso, isolamento de tenant, idempotência, auditoria e
   criação atômica. A aprovação especial de exportação continua exigindo
   também `audit:view_full`. Criar não concede decisão nem efeito.
3. Documentar alteração pública e atualizar clientes/contratos de permissões;
   não converter automaticamente qualquer concessão externa de view em create.

### Negativos e pronto

- Identidade com apenas view não cria, mesmo com grant; sem create/grant ou
  em outro tenant, negar antes de gravar recurso/audit de criação/receipt.
  Validar também com matriz de permissões injetada no teste, pois os papéis
  atuais combinam várias permissões e não há papel puro view-only.
- Create sem decide não aprova; create sem audit:view_full não cria export
  review; replay e revogação concorrente mantêm atomicidade e autorização.
- Pronto: GET permanece legível para view, POST exige create, contratos e
  matriz cobertos em HTTP/PG e decisão humana sobre os papéis registrada.

## 7. G6 — Webhook autenticado do Assistente de Plantão (P1, produto)

Item separado: `SEC-SHIFT-WEBHOOK-20261105`, no
[backlog do produto](../../products/shift-assistant/docs/backlog.md).
Não é correção nem gate de release do harness.

### Recon

[server.ts do produto](../../products/shift-assistant/src/server.ts:133) aceita
header ou query secret, comparando segredo estático com timingSafeEqual.
Esse comparador é adequado para igualdade, mas não autentica corpo, horário
ou replay. `parseWebhook` recebe payload/data, sem assinatura ou headers.
Probe HTTP: sem segredo 401; segredo apenas na query permite dois corpos
distintos sem HMAC, ambos 200. O parser de teste retornou null; a prova é de
autenticação/transporte, não entrega, admissão ou ação clínica.

### Regras propostas

1. Remover segredo da URL do contrato e dos exemplos do produto. Recusar query
   secret sem admiti-la como credencial e nunca registrá-la em logs/erros.
2. Verificar autenticidade sobre bytes originais do corpo antes de parse,
   journal, mídia ou fila. Para protocolo próprio: HMAC-SHA256 sobre timestamp,
   ID de entrega e corpo, envelope versionado, chave por provider/tenant,
   comparação constante e janela máxima de 5 minutos usando relógio confiável.
3. Verificação e janela não substituem replay durável: registrar ID/hash e
   reserva atomicamente antes de admitir; duplicata idêntica converge sem
   reaplicar, mesmo ID com outro hash é rejeitado. Reinício não perde a reserva.
4. Não inventar compatibilidade com providers: antes do BUILD selecionar o
   adapter/protocolo documentado pelo provider. Se não houver assinatura de
   corpo compatível, exigir ingresso autenticado dedicado que assine envelope
   interno e impeça bypass de rede; sem essa composição, canal real bloqueado.
   Suporte de gateway é decisão própria do produto, não import no núcleo.
5. Preservar limites de corpo/tempo/conexões, ACK após durabilidade, pausa e
   hardening. Rotação aceita chaves explícitas por janela limitada, sem fallback
   para query/header de segredo estático em ambiente operacional.

### Negativos e pronto

- Query/header estático isolado, HMAC ausente/inválido, timestamp futuro/velho,
  byte alterado, tenant/provider errado e chave revogada: zero parse/admissão,
  journal ou chamada externa. Requisição grande/lenta continua limitada.
- Assinatura válida é controle positivo sintético. Replay concorrente e após
  restart não duplica; mesmo ID com hash diferente não sobrescreve mensagem.
- Pronto: provider/protocolo escolhido e revisado, negativos HTTP no produto,
  recibo de durabilidade/replay e segredos ausentes dos logs; sem liberar piloto.

## 8. Sequência e gate para futuro BUILD

Proposta de ordem: G1 e G5 (identidade/permissões), G3 e G4 (composição e
autoridade), G2 (fronteira de saída). G6 segue task e validação próprias do
produto. Cada fatia começa com claim, task e baseline próprios, após aprovação
humana desta SPEC e das escolhas abaixo. Este documento não inicia BUILD.

Decisões a revisar: representação/migração da autoria G1, perfil exclusivo de
laboratório G3, ligação/negação das flags G4, matriz create de G5 e protocolo
de ingresso do produto G6. Autoria desconhecida/fonte ausente sempre bloqueiam.

Critério global: negativos por achado executados, typecheck, lint, npm test,
test:postgres e E2E em Node 22.23.2; imagem/smoke para mudanças de composição;
evidência própria por candidata e produto, sem copiar PASS da CI histórica.
Gates bloqueados ficam NOT_RUN. Atualizar contratos/documentação de operador,
runtime/log/backlogs e emitir certificação ao fim da rodada com código,
conforme a constituição. Nenhum resultado desses gates é alegado nesta SPEC.

## 9. Validação desta entrega documental

`npm run docs:check-links` passou sem modo sparse no checkout principal:
links, higiene de evidência e ledgers, exit 0. Formatação dos sete documentos
alterados e `git diff --check` passaram. Esses checks T1 validam a entrega da
SPEC e seus registros; não validam as correções futuras. A SPEC permanece
`PROPOSED_FOR_HUMAN_T3_REVIEW`; BUILD não autorizado e negativos de aceitação
ainda por executar.
