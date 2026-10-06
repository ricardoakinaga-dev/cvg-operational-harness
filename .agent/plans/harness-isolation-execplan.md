# Implementação integral do isolamento do Operational Harness — ExecPlan

<!-- engineering-framework: active_action_id=HISO-005:WEEKLY_DECISION_REQUIRED -->

## Purpose / Big Picture

Implementar todo roadmap0369/backlog0370 solicitado pelo usuário: harness reutilizável independente, consumidor com seu próprio domínio/build/testes/deploy/docs/backlog, 14 achados tratados no dono correto e aceite/piloto distintos. Sucesso global exige todos os 24 critérios originais e julgamento final válido; etapas humanas e externas continuam exigidas, não são reclassificadas como opcionais.

## Progress

- [x] (2026-10-03) Recuperação: código atual/claims/estado conferidos; direção ADR-010 e pedido de execução registrados. Baseline 6.180 arquivos / 979 não documentais; HEAD cc1402ff163a34352c10405e9e5c77c653596084.
- [x] HISO-001: inventário de fronteira, contratos persistidos e AP-001–016 com baseline/frontier; nenhum AP inferido completo apenas por código.
- [ ] M0/M1: 17 fontes e três deploys movidos, workspace privado e exports construídos. Agregado final2650PASS/335arquivos sem skips; primeira crítica levou a correções, mas a segunda reproduziu sete novos falsos PASS. HISO005 não aceito. HISO002 continua parcial pela regra5.
- [ ] M2/M3/M4: contrato público/CI, limites/dependências e correções governadas do consumidor após gate T3.
- [ ] M5: independência integrada, preparação de guia/áudios e eventual piloto real de duas semanas com dois plantonistas sob decisão humana.

## Surprises & Discoveries

- Controllers `.agent/state.json` e journals ainda apontam para AUD0592/UP91; claims/ledgers dirty antigos estão preservados. Esta execução usa este plano, backlog0370 e handoff/evidências próprios sem sobrescrever o controller alheio.
- O programa só importa model-gateway/zod/Node; não monta a factory do harness. Isolamento físico não comprova alinhamento com ADR-004; HISO-009 revisa esse contrato.
- Regra de workspace antiga aceita exatamente três globs; incluir products exige atualizar discovery/checker coerentemente, sem reaproveitar aprovação hash-bound antiga para um candidato novo.

## Decision Log

- 03/10/2026, Codex: duas críticas T2 concluídas, última FAIL com sete falsos PASS. Regra de trabalho do documento de direção aplica-se a todos os repositórios: “Uma revisão por mudança, no máximo duas. Se a segunda revisão ainda achar problema, a mudança vai para a sessão semanal.” Não corrigir indefinidamente nem fabricar uma terceira aprovação; HISO005 encaminhado para decisão semanal. Pendência T3 é independente e já foi apresentada em packet concreto.

- 03/10/2026, Codex: autorização local confirmada pelo pedido de implementação integral; SPECs T3 futuras precisam de revisão concreta. Não transferir aprovações antigas/externas.
- 03/10/2026, Codex: dois Builders T1 disjuntos (0179 consumidor / 0180 compartilhado), máximo três children simultâneos com reserva para crítico I1, profundidade um, modelo herdado, fresh context explícito false. Lead faz o caminho crítico de extração/tooling. Nenhum child escreve estado/ledgers.
- 03/10/2026, Codex: HISO-002 integração dos ponteiros dirty fica parcial; direção congelada em documentos livres permite SPEC/extração conforme0178. Critério global de reconciliação preservado; não fingir DONE.

## Outcomes & Retrospective

Baseline governada independente03/10/2026: neutral sem produto/link/workspace efetivo passou990testes/92arquivos com PGtmpfs e zero skips, source319TS canônicos MATCH. Pacotes78/857 e hosts14/133 em escopos disjuntos; resultados sobrepõem a suíte original2650, não são novos testes distintos. Nenhum contrato/security/código T3 mudou; HISO013TODO e globalFAIL preservados. Auditoria inicial de impasse foi corrigida ao encontrar essa verificação, sem atualizar o goal como bloqueado antes da execução.

Continuação de corpus03/10/2026: preparação T1 independente de PISO009 avançou sem antecipar BUILD T3. Builder Jason entregou20casos JSON; Lead sintetizou10WAVs locais (três vozes,26–34s), integrou/validou anchors/hashes/datas/formatos e schema V1.192trechos fonte,67campos e11tarefas draft conferidos; controles ruins da integridade reprovam como esperado. Nenhum output do produto/Whisper executado, nenhum piloto/qualificação humana inferido; SPECs/produção byte-imutáveis. PISO009 permanece TODO com preparação parcial documentada.

Continuação03/10/2026: prova independente do artefato HISO007 executada pelo Lead/I0, sem alterar código. Root Dockerfile build target runtime PASS/MATCH; inventário11.008arquivos/28symlinks sem consumidor; exports públicos e API real health/ready200 PASS em container UID10001/networknone/readonly. Comparação com imagem do consumidor distingue comandos/env/portas/volumes. Próximo maior gap permanece HISO005, com encaminhamento semanal e pergunta concreta de exceção à regra apresentada ao usuário; T3SPECs ainda pendentes.

Execução em andamento; não há resultado global aprovado. AUD0594 é baseline histórico. Build/imagem/smoke/demo do produto,288PG/12E2E e variante sem produto (instalação offline, exports, typecheck,369testes/27arquivos, smoke real) passaram. Primeira agregada7FAIL preservada: Git ausente na cópia, expectativa de workspaces, flag do PG descartável e oracle de shutdown preexistente foram diagnosticados; segunda agregada2614PASS com sentinel MATCH; terceira com coverage2650PASS, saída XML gerada classificada separadamente. Worker de produção permaneceu byte-preservado.

Crítico T2 R1 fresh-context rejeitou dois escapes de fronteira e gaps documentais. Fix da primeira revisão visita intermediários/declarations fora das raízes, reconhece loaders/aliases ancorados e inclui docs do produto no comando canônico. Segunda crítica independente I1 FAIL: runtime escondido por declaration e aliases de loader/resolve ainda aceitos; sete negativos reproduzidos. Matriz AP–PISO–HISO documental acrescentada depois da revisão, sem reaprovação técnica. Não iniciar terceira revisão nem nova alteração desta fatia antes da sessão de decisão prevista na regra vigente. Coverage elegível257/257sources e thresholds/excludes preservados. Medição final: core/hosts234 fontes, statements92,67%; legado9 fontes93,75%; consumidor14 fontes73,95%. Agregado91,82% statements/87,32% branches/94,63% functions/92,88% lines PASS. Captura bruta DRIFT preservada e classificada: somente XML gerado pelo E2E concorrente mudou, demais inputs MATCH.

SPEC0179/0180 tiveram duas críticas independentes REJECT, preservadas, e refinamentos documentais. Últimas lacunas: entrega AP011, budget durável e classificação/D2. Packet humano com hashes/decisão concreta apresentado; resposta pendente. Não há terceiro PASS inventado nem BUILD T3. Dez cartões PISO transferidos byte a byte ao backlog do produto; formato posterior conserva sequência de palavras/IDs/aceites e status único. CI remoto e piloto seguem ausentes.

## Context and Orientation

Raiz compartilhada `/home/ricardo/Área de trabalho/cvg-operational-harness`. Produto inicial `apps/worker/src/shift-assistant`; alvo `products/shift-assistant`. Fontes de direção0369/0370/ADR010; contratos produto0177/ADR009/0368. Evidências de execução `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003`; snapshot `/tmp/cvg-harness-iso-exec-20261003/snapshot`. Continuar a partir de baseline/task/evidência, não do controller superseded.

## Scope and Constraints

- Escopo integral: HISO001–014 e PISO001–010, preservando seus critérios/14 achados.
- Instruções: AGENTS raiz, docs07AGENTS e coordenação; D-12 proporcional, sem dados reais, consulta automática, ação clínica/financeira/prontuário ou produção irrestrita.
- T2 inicial é relocação/refatoração sem efeitos externos; T3 de segurança/contratos/estado requer SPEC concreta revisada; T4 real/candidato/piloto exige decisão humana vinculada ao artefato.
- Preservar dirty files/claims alheios; push/deploy/mensagens reais não autorizados por esta execução local.

## Architecture and Interfaces

Dependência unidirecional consumidor→exports suportados. Core não importa produto/SHIFTenv/prompt/paciente; testes/builds separados com regressão agregada. Produto tem processo/env/dados/deploy/docs próprios. Extração preserva bytes/eventos; confirmação/identidade/journal/transportes são fatias T3 subsequentes. Interface atual provider.execute não é factory/governed gateway; decisão pública em HISO009/0180.

## Milestones

M0 fronteira/SPEC: manifesto completo e contratos congelados. M1 workspace: 17 moves, todos os testes, gate positivo/negativo e build público. M2 operação: imagem e documentação/backlog próprios, contrato de CI revisado. M3 compartilhado: recepção limitada/dependências/regressão governada. M4 consumidor: P01–P11 corrigidos, pausa/restore/alerta/imagem comprovados. M5 aceite: variante sem produto e julgamento final; guia/áudios/administrativo/piloto do consumidor com seus próprios gates. Nenhum milestone substitui outro.

## Plan of Work

Lead congela baseline/bar, executa0178 e integra writers disjuntos apenas após critérios de readiness. SPECs0179/0180 produzidas em paralelo reduzem incerteza do contrato T3; não permitem código antecipado. Construir/executar a primeira fatia, obter crítico fresh-context readonly e retestar o blast radius. Depois atacar gaps obrigatórios pela severidade e dependências do backlog. Não repetir tentativas sem hipótese/evidência nova; não reduzir suites/pisos para obter verde.

## Concrete Steps

1. [HISO-001:BASELINE] Capturar manifesto e mapa AP/fontes/imports/env/deploy/claims; preparar snapshot e freeze bar original dos24cartões antes do BUILD.
2. Registrar0178 e baseline da suíte específica; mover fontes e conectar package/tooling/deploy na fatia T2. Executar checks Node22 no snapshot.
3. Rever SPECs0179/0180 concretas e preparar pedido de revisão T3, enquanto continuam tarefas T1/T2 independentes e permitidas.
4. Criticar/retestar/integrar; atualizar backlog/handoff/estado por evidência. Retomar todos os cartões restantes sem substituir o objetivo por uma extração parcial.

## Validation and Acceptance

Bar congelada em `quality-bar.json` de evidências: cada cartão requerido preserva seu Aceite/Evidência original. Gates transversais: G1 typecheck/lint/unit/PG/E2E Node22, G2 import proibido e variante sem produto, G3 revisão específica antes de mudança sensível, G4 candidato/piloto autoridade vinculada. Provas técnicas em snapshots/serviços sintéticos; limites de ambiente nunca viram PASS. Final Critic distinto dos builders e críticos anteriores, não herdando histórico nem conclusões.

## Risks and Human Decisions

Estado da execução local: WAITING_HUMAN_APPROVAL. Imagem independente, corpus sintético e baseline neutral990/92comPG completados. Audit de impasse revalidado após executar a última ação independente; próximos gates são a decisão T2weekly e reviewconcretaT3. Goalcom24critérios/globalFAIL preservado; nenhum processo/child próprio permanece vivo.

Ledgers dirty bloqueiam escrita compartilhada: handoff prepara integração pelo owner. SPECs T3 concretas0179/0180 e packet de decisão existem; revisão explícita do usuário ainda pendente. Não atribuir aprovação a silêncio. Piloto/contrato de provedor/guia lido por humanos e duas semanas de uso dependem dos responsáveis; não simular essas provas. Docker/PG/navegador foram exercitados com recursos próprios; Whisper real/áudios ainda não foram qualificados.

## Idempotence and Recovery

Revalidar instruções, claim, hashes atuais e último resultado antes de continuar. Nenhum efeito externo é repetido por ausência de log. Snapshot é descartável e recursos próprios; rollback somente patch/commits próprios, dados alheios preservados. Gauntlet state manager inicializa run exclusivo após freeze, e valida/rebaseline mudanças materiais sem aceitar drift silencioso. Backlog canônico permanece0370 até transferência atômica PISO.

## Artifacts and Evidence

- Baseline/status: evidências HARNESS-ISO-EXEC, não sobrescrever fontes históricas.
- SPEC0178 estrutural;0179/0180 sensíveis pendentes de revisão.
- Plano/claim/backlog são índices; logs e hashes do candidato provam execução.
- Handoff `docs/08_runtime/handoffs/harness_isolation_execution_20261003.md` reúne continuidade e entradas prontas para ledgers.

Revisão inicial03/10/2026: implementa a direção atual com controles proporcionais; não reabre o programa superseded nem reduz o objetivo completo.
