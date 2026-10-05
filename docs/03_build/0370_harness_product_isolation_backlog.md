# 0370 — Backlog de isolamento do Operational Harness

> Estado atual GREEN — checkpoint 31: CI R6 integrado só no candidato privado: 298 regressões, tipos/lint PASS, 7.811 inputs MATCH e 43 caminhos novos, 371 registros originais intactos. Crítica CI R6 válida REJECT: dois P1/dois P2 de build-info público, simetria Pg/casos e taxas eval; BUILD R7 isolado ativo. C1 R5 válido REJECT estático (1 P1/2 P2), supplied crítico em harness compatível, não Vitest nativo. C1 R6 privado corrige os casos e passa 485 regressões nativas (253 originais +232 estáticos), tipos/lint PASS; crítica nova ativa, sem integração Main. Último scanner R5 instalado INCOMPLETE/1.706, não reexecutado no R6. OPS R8 e gateway R10 conservam aceites limitados. Últimas completas continuam integrado 4.358 PASS/1 timeout e neutro 3.754 PASS/44 FAIL, sem cobertura final nessas falhas; nova composição completa ainda não executada. Global FAIL/produção NO_GO, 24 critérios intactos, zero novo DONE/provider/promoção/push. [Evidência](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-31-ci-producer-parity-and-static-wrappers.json).

> Continuidade GREEN em 04/10/2026: revisões locais de CI e operações terminaram REJECT, com findings concretos preservados. CI-R3 e OPS-R4 corrigem os mecanismos em cópias disjuntas. A suíte completa atual teve 3.504 PASS/um FAIL; o neutro, 2.993 PASS/um FAIL. A falha comum da contagem de testes novos foi corrigida e os 164 controles focados passaram em cada variante; os três defeitos documentais anteriores foram resolvidos. Nova suíte completa está em execução. As imagens atuais passaram controles locais; o bootstrap de sessões em produção e a segurança têm emendas T3 pendentes. Global **FAIL**, produção **NO_GO**, zero chamadas OpenAI; 24 cartões preservados, sem novo DONE. [Checkpoint 15](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-15-cross-context-receipts-and-ci-validation.json).

> Fechamento R2 em 04/10/2026: GLOBAL_FAIL. C1 revisão única FAIL por 11 novos falsos PASS; 14 históricos recusados não comprovam isolamento. Checker Root conserva aviso REJECTED, novo candidato não promovido. Produto 13 PV PASS/PV10 FAIL; promoção condicional negada. Os 24 critérios/status permanecem; sessão semanal é o próximo gate. [Execução e provas](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/r2-actions/final-status.md).

> Rodada 2 autorizada em 03/10/2026: C1 tem um ciclo e uma crítica posterior; produto tem correção limitada em scratch e promoção local condicionada. O checker vigente está REJECTED: seu PASS não comprova HISO-005. D009/D011 aguardam HISO-005 aceito. [Plano e decisões](../08_runtime/handoffs/harness_isolation_audit_actions_r2_20261003.md). Os 24 critérios continuam exigidos; status ainda sem aceite novo.

Data: 03/10/2026. Task documental: `HARNESS-ISO-PLAN`. Direção: [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md). Sequência: [roadmap 0369](0369_harness_product_isolation_roadmap.md). Origem dos defeitos: [AUD0594](../04_audit/0594_repository_score_audit_2026-10-02.md).

**Execução integral iniciada em 03/10/2026 por pedido explícito do usuário.** Estado e evidências da rodada HARNESS-ISO-EXEC estão no handoff próprio; critérios originais preservados. São 14 tarefas do harness (HISO) e dez do consumidor (PISO). `READY` significa próxima tarefa documental executável; `TODO` significa pendente das dependências e gates. A autorização do usuário confirma a implementação local do plano; não constitui revisão de uma SPEC T3 futura ou autorização de uso real.

Este é o backlog canônico do harness. AP-001–AP-016 continuam como origem de requisitos do produto; seus critérios não são apagados ou marcados concluídos por este plano. Os dez cartões PISO foram transferidos atomicamente para o backlog do consumidor: aqui ficam apenas ponteiros, sem dois status concorrentes. A [matriz AP–PISO–HISO](../../products/shift-assistant/docs/requisitos-ap.md) mantém a correspondência. Programas antigos não são reabertos.

Execução atual 03/10/2026: as SPECs 0179/0180 emendadas foram aprovadas separadamente para BUILD local sintético pelos hashes do [recibo](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/human-t3-approval.json). C1 corrigiu os sete negativos históricos, mas a única revisão posterior autorizada por B1 terminou **REJECT**: dois P1 e sete falsos PASS novos. [Encaminhamento semanal](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/c1-weekly-handoff.md); nenhuma nova correção/revisão de C1 autorizada. Gates executados no candidato congelado: 17 arquivados/78 focais, typecheck/lint/builds, 288 PG e 12 E2E PASS/MATCH; cobertura de execução de 2.680 casos descobertos (2.679 na rodada completa e um PG complementar, sem somar suítes sobrepostas). Estes resultados não aceitam o gate de fronteira. PISO-004 tem fundação 40 PASS preservada em candidato privado; fluxo antigo 27 PASS/10 FAIL, sem promoção. Primeira fatia vertical do produto: R1 independente REJECT por quatro defeitos; rework privado com 194 testes integrados PASS, suíte completa PostgreSQL 2.837 PASS/340 arquivos/zero skips, PG dedicado 288 PASS e E2E 12 PASS/zero retries, tipos/lint/build público PASS. R2 específica encerrada REJECT: novo P1 de ID explícito substituído pelo histórico (PV07/PV09), assertions originais reduzidas (PV13 FAIL) e restart do processamento não demonstrado (PV10 BLOCKED). [Encaminhamento do produto](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/product-weekly-handoff.md); não promover ou iniciar terceira revisão antes da sessão semanal; nenhum aceite ou promoção inferido. NO_MODEL e D2 aberta, 24 critérios preservados; global **FAIL**, segurança/integração/CI remoto pendentes.

Os donos abaixo são **papéis propostos**, não claims de arquivos ou atribuição automática a outro agente. Cada executor deve registrar paths e recursos antes de escrever. Prioridade P1: fronteira/defeito que bloqueia a entrega correspondente; P2: consolidação e preparação. Nenhuma prioridade autoriza execução fora do pipeline. Esforço/prazos só serão estimados após SPEC e disponibilidade dos owners.

## Harness — identidade, fronteira e independência

### HISO-001 — Congelar baseline e donos da fronteira

- Estado: `DONE`. Prioridade: P1. Dono: engenharia do harness. Risco/gate: T1 / G0. Dependências: nenhuma.
- WHAT/WHERE/HOW: inventariar fontes, manifestos, aliases, imports, env, portas, volumes, deploy, scripts e claims de `packages`, `apps` e do assistente. Partir dos 17 arquivos observados em `apps/worker/src/shift-assistant`; capturar hashes/HEAD/dirty state e identificar dependências transitivas antes de qualquer extração.
- Aceite: cada componente tem dono core/host/consumidor/legado; caminhos e recursos da primeira fatia estão livres ou coordenados. Registrar testes existentes, consumidores de APIs públicas e contratos persistidos sintéticos. Confirmar AP-001–AP-016 pendentes/concluídos a partir da evidência vigente, sem inferir conclusão pela presença de código.
- Evidência: manifesto de baseline e mapa de fronteiras/claims, com diferenças futuras comparáveis. O inventário documental desta rodada é entrada, não aceite completo deste cartão.

- Execução 03/10/2026: baseline/frontier AP-001–016, 20 moves/inventário de ownership e claims em `HARNESS-ISO-EXEC-20261003`; gate de grafo atual com 580 fontes/26 workspaces. Links/formato de planejamento já validados; APs incompletos preservados como tais.

### HISO-002 — Reconciliar a missão e os ponteiros vigentes

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: mantenedor da documentação do harness. Risco/gate: T1 / G0. Dependências: HISO-001.
- WHAT/WHERE/HOW: atualizar README raiz, `docs/README.md`, índice, AGENTS/direção e ledgers quando os claims permitirem. Usar ADR-010 para identificar este repositório com o Operational Harness e classificar o Assistente de Plantão como consumidor.
- Aceite: nenhuma instrução vigente aplica automaticamente a barra 0368 ao core ou confunde os dois produtos. Preservar D1–D4, SPEC 0177, barra 0368 e histórico da ADR-009 como contratos do assistente. Não reinstalar o antigo programa enterprise/UP91 por mudar a identidade.
- Evidência: diff documental e links verificados; entradas de runtime/log/backlog integradas pelo owner, sem sobrescrever alterações de outro agente. Encaminha F13.

### HISO-003 — Especificar a extração sem mudança de comportamento

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do harness, com revisão do owner do consumidor. Risco/gate: T1 para escrever SPEC; implementação alvo T2 / G1. Dependências: HISO-001, HISO-002.
- WHAT/WHERE/HOW: SPEC curta em `docs/02_spec` para `products/shift-assistant/`, workspace privado, dependências/exportações, mapa antigo→novo, scripts, testes, deploy e docs. Registrar no pipeline DISCOVERY/PRD a direção e os requisitos já existentes, sem inventar novos requisitos clínicos.
- Aceite: tamanho da fatia, paths, contratos, comandos de verificação e recuperação definidos. Campos/eventos JSONL, confirmação, repetição, snooze e D1–D4 preservados na extração. Mudança pública/segurança/schema é separada como T3, com revisão antes de BUILD. Não presumir aprovação do layout proposto nesta rodada.
- Evidência: SPEC/task/gate registrado e matriz de regressões. Definir interfaces suportadas de modelo e a revisão em HISO-009; não impor runtime autônomo de tools ao organizador JSON.

### HISO-004 — Extrair o consumidor para um workspace privado

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T2 / G1, conforme HISO-003. Dependências: HISO-003.
- WHAT/WHERE/HOW: mover a fatia de fontes/testes/simuladores para `products/shift-assistant`, com `package.json`, entrypoint e scripts próprios. Ajustar workspace/lockfile na mesma fatia sob claim exclusivo. O nome do package é fixado na SPEC; não publicar pacote ou abrir outro repositório implicitamente.
- Aceite: comandos do consumidor partem do novo workspace; os 37 testes específicos e demos existentes continuam reconhecidos/passando. Kernel/API/worker não importam o produto; não deixar wrapper no worker que o reintroduza. Nenhuma alteração de conteúdo/efeito ou de dados persistidos acompanhando a movimentação.
- Evidência: diff de moves, manifesto de dependências, hashes de fixtures/eventos e checks Node 22 de G1 em snapshot próprio. Mudanças simultâneas de lockfile ficam sequenciadas.

### HISO-005 — Tornar a fronteira verificável

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do harness. Risco/gate: T2 / G2. Dependências: HISO-004.
- WHAT/WHERE/HOW: gate de dependências para `packages` e hosts genéricos, incluindo imports relativos, aliases, exports, imports dinâmicos identificáveis e caminhos transitivos. Tratar resolução não verificável explicitamente na SPEC; simples busca de texto não comprova isolamento.
- Aceite: tentativa sintética de importar domínio/entrypoint do consumidor a partir do core falha no gate, também por intermediário. Consumo público permitido do harness pelo produto passa. `SHIFT_*`, prompts e regras de paciente não entram no core; exceptions têm alvo e justificativa restritos.
- Evidência: grafo resolvido e execução positiva/negativa do gate. Fixtures da sonda não entram no artefato de produção.

### HISO-006 — Separar descoberta, build, testes e coverage

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia de tooling do harness. Risco/gate: T2 / G1–G2; alteração de barra vira T3. Dependências: HISO-004.
- WHAT/WHERE/HOW: revisar `package.json`, lockfile, tsconfigs, Vitest, política de workspace e scripts de build para descobrir `products/*`. Expor comandos core e consumidor sem perder a regressão agregada existente.
- Aceite: suites e denominadores são listados por dono e comparados ao baseline; nenhum teste vira omitido/skip apenas para passar. Build do harness não exige fonte/configuração do consumidor. Definir variante sem consumidor com manifesto e lockfile coerentes, utilizável em snapshot limpo; `npm ci` com lock incompatível não é prova válida.
- Evidência: inventários antes/depois, typecheck/lint/suites e coverage por escopo. PostgreSQL/E2E conforme G1, com SKIP distinguido de integração efetivamente executada.

### HISO-007 — Separar artefatos e deploy do consumidor

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: operação do consumidor. Risco/gate: T2 / G1–G2; hardening fica em PISO-007. Dependências: HISO-004, HISO-006.
- WHAT/WHERE/HOW: mover `deploy/shift-assistant` para `products/shift-assistant/deploy` e ajustar Dockerfile/compose/env/scripts. Definir contexto de build, processo e paths relativos sem depender do diretório de trabalho incidental.
- Aceite: imagens e comandos distintos, env/volumes/portas identificados e sem compartilhamento automático. O artefato do harness exclui fontes, configs, credenciais e dados do consumidor. Não mover/apagar volumes existentes; primeiro deploy separado utiliza dados sintéticos.
- Evidência: build e smoke da imagem real com serviços sintéticos e recursos próprios. Bundle em Node prova compilação, não prova usuário/capabilities/rede da imagem.

- Continuação03/10/2026: imagem root target runtime construída sem alterações do Dockerfile;11.008arquivos/28symlinks em `/app`, sem consumidor/fontes/env/dados/link. Jornada pública e API live/ready200 passaram com networknone, readonly, UID10001. [Prova de separação dos dois artefatos](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/artifact-separation-r3.json): imagens/comandos/portas/env/volumes distintos. Subcritério executável comprovado pelo Lead/I0; integração e aceites das dependências continuam pendentes, sem terceira crítica ou aceite global.

### HISO-008 — Transferir docs e backlog do produto

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: mantenedor documental de cada projeto. Risco/gate: T1 / G0; mudança do checker é T2. Dependências: HISO-004, HISO-007.
- WHAT/WHERE/HOW: estabelecer docs e backlog em `products/shift-assistant/docs`; transferir os cartões PISO com IDs, requisitos AP e histórico. Manter no harness links de integração, contratos e estado de isolamento. Atualizar mapa restrito de paths históricos quando necessário para links.
- Aceite: cada cartão tem um status canônico; AP/PISO têm matriz de correspondência, não duas filas independentes. Evidências e relatórios históricos continuam íntegros. Barra 0368 e decisões D1–D4 são produto; fontes antigas com caminhos movidos são resolvidas por mapeamento explícito, sem allowlist genérica de links quebrados.
- Evidência: mapa de transferência e checks de links/IDs/hashes históricos. Encaminha F13; não alterar textos de auditoria para aparentar achados fechados.

### HISO-009 — Validar consumo por interfaces públicas suportadas

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: mantenedor de contratos/adapters do harness. Risco/gate: T1 para decisão; T2 para regressão existente; T3 / G3 se mudar execução pública. Dependências: HISO-003, HISO-005, HISO-006.
- WHAT/WHERE/HOW: revisar consumo atual de `OpenAICompatibleProvider.execute` pelo `ModelOrganizer`. O assistente hoje não compõe `createOperationalHarness` nem `ModelGateway.complete`; registrar quais exports são suportados e como budgets/telemetria da ADR-004 se aplicam.
- Aceite: consumidor compila e roda contra exports de pacotes construídos, sem atravessar fontes privadas por aliases. Decisão explícita sobre adapter/gateway; qualquer migração que altere timeout/budget/telemetria/comportamento precisa de SPEC/revisão apropriada. Um exemplo de consumidor neutro prova reutilização sem WhatsApp ou domínio de paciente.
- Evidência: decisão de contrato e smoke dos exports efetivos em ambiente isolado. Preservar forma da saída estruturada do organizador.

### HISO-010 — Definir CI e barras por artefato

- Estado: `TODO`. Prioridade: P1. Dono: engenharia de CI do harness, com revisão humana. Risco/gate: T3 / G3. Dependências: HISO-005, HISO-006, HISO-007, HISO-009.
- WHAT/WHERE/HOW: SPEC e implementação de jobs distintos para core e consumidor, contratos entre ambos e regressão agregada de transição. Vincular artefato, commit/dirty inputs, suite e dono ao resultado.
- Aceite: CI constrói a imagem específica do consumidor e a variante independente do harness; mantém gates aplicáveis de segurança, PG, E2E e coverage. Falha de tarefa do produto não falsifica certificação do core nem desaparece do relatório. Não reintroduzir automaticamente os antigos 16 gates ou declarar GO com artefatos genéricos.
- Evidência: SPEC aprovada, matriz gate→artefato e execução real de CI no candidato. Encaminha F13. Alterar o contrato de evidência requer revisão antes do BUILD, não aprovação retroativa.

## Harness — correções compartilhadas

### HISO-011 — Limitar recepção do transporte de modelo

- Estado: `TODO`. Prioridade: P1. Dono: mantenedor de `packages/model-gateway`. Risco/gate: T3 / G3. Dependências: HISO-005, HISO-006.
- WHAT/WHERE/HOW: SPEC e correção em `ssrf-transport`/adapter responsável para limitar bytes durante a leitura, interromper stream/conexão e liberar recursos. Definir semântica para descompressão, Content-Length ausente/falso, timeout e error compatibility.
- Aceite: P12 não recebe/buffereia corpo inteiro acima do teto antes de rejeitar. Respostas chunked, oversized e interrompidas são limitadas; resposta válida continua correta. Consumo e tempo medidos contra limite documentado, com orçamento de request preservado.
- Evidência: servidor sintético e regressão positiva/negativa reproduzível. Fecha F14 no compartilhado; transportes WhatsApp têm tarefa própria, sem expandir escopo automaticamente.

### HISO-012 — Tratar advisories conforme exposição

- Estado: `TODO`. Prioridade: P1. Dono: mantenedor de dependências do harness. Risco/gate: T3 / G3 para manutenção de segurança, com claim exclusivo do lockfile. Dependências: HISO-001, HISO-006.
- WHAT/WHERE/HOW: revalidar os advisories observados de `brace-expansion`, `fast-uri`, `undici` e `fastify`, mapear cada consumidor/runtime/dev e corrigir versões compatíveis. Não tratar ausência no bundle do assistente como ausência no repositório.
- Aceite: fixes disponíveis aplicados sem regressão nos consumidores afetados; zero HIGH aplicável ou exceção residual explícita, revisada, com exposição/prazo/dono. Uma exceção não transforma vulnerabilidade pendente em corrigida. Lock/workspaces coerentes após extração.
- Evidência: audit antes/depois, diff do lock, testes por consumidor e inventário do artefato. SBOM/licenses somente com claim específico. Encaminha F12.

### HISO-013 — Regressão governada do núcleo independente

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do harness. Risco/gate: T2 / G1–G2; novo comportamento precisa de T3. Dependências: HISO-009, HISO-010, HISO-011, HISO-012.
- WHAT/WHERE/HOW: verificar no artefato neutro contracts, policy, approval, isolamento de identidade/tenant, budget, effect journal e recovery. Executar suites existentes e integração PostgreSQL pertinente com dados sintéticos.
- Aceite: ALLOW não dispensa approval de risco alto; approval é vinculada à ação/identidade e de uso único; recovery não duplica efeitos governados. Nenhum consumidor requer import privado. Classificar skips e lacunas, sem retomar automaticamente o antigo programa UP91.
- Evidência: resumo de regressão por escopo e negativos dos contratos governados, vinculados ao candidato. Falhas bloqueiam o aceite do núcleo correspondente.

- Baseline independente03/10/2026: [990 testes/92arquivos, PG efetivo, zero skips](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/neutral-governance-summary-r1.json) PASS em variante sem produto.319TS canônicos de pacotes/hosts iguais ao root; sentinelMATCH. É verificação I0 da baseline existente, sem terceiro crítico, alteração de contrato ou aceite antecipado das dependências T3/CI.

### HISO-014 — Aceitar a independência do harness

- Estado: `TODO`. Prioridade: P1. Dono: responsável pelo Operational Harness. Risco/gate: T2 / G2, com aceite documental; release separado. Dependências: HISO-005, HISO-007, HISO-008, HISO-010, HISO-013.
- WHAT/WHERE/HOW: executar variante limpa sem fontes/env/volumes do consumidor e uma jornada neutra por exports públicos. Consolidar docs, gates, imagens/processos e resultados de fronteira.
- Aceite: build, teste e inicialização/parada do harness independem do programa; gate reprova imports diretos/transitivos proibidos; processo e dados são separados. Consumidor permanece compilável/testável por seu próprio comando. Relatório do core tem escopo/denominador próprio, sem reutilizar a nota combinada 61/100.
- Evidência: manifesto da variante, logs de smoke/gates e aceite de isolamento. **Não depende do piloto PISO-010** e não concede release de produção.

## Consumidor isolado — integração com o backlog próprio

Os dez cartões foram transferidos atomicamente, preservando seu conteúdo, para o [backlog canônico do consumidor](../../products/shift-assistant/docs/backlog.md). Status e aceite do produto são atualizados somente lá. Os ponteiros abaixo mantêm rastreabilidade; o harness não aplica automaticamente a barra do produto ao core.

### PISO-001 — Ativar tarefas somente após confirmação humana

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-001--ativar-tarefas-somente-após-confirmação-humana) — status e critérios somente no backlog do produto.

### PISO-002 — Preservar fidelidade e identidade do paciente

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-002--preservar-fidelidade-e-identidade-do-paciente) — status e critérios somente no backlog do produto.

### PISO-003 — Recuperar processamento e envio com estado durável

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-003--recuperar-processamento-e-envio-com-estado-durável) — status e critérios somente no backlog do produto.

### PISO-004 — Recuperar journal truncado sem perder histórico válido

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-004--recuperar-journal-truncado-sem-perder-histórico-válido) — status e critérios somente no backlog do produto.

### PISO-005 — Serializar disparos de lembretes

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-005--serializar-disparos-de-lembretes) — status e critérios somente no backlog do produto.

### PISO-006 — Fazer pausa e saúde responderem a falhas de transporte

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-006--fazer-pausa-e-saúde-responderem-a-falhas-de-transporte) — status e critérios somente no backlog do produto.

### PISO-007 — Comprovar hardening do artefato do consumidor

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-007--comprovar-hardening-do-artefato-do-consumidor) — status e critérios somente no backlog do produto.

### PISO-008 — Comprovar backup, restore e recebimento de alerta

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-008--comprovar-backup-restore-e-recebimento-de-alerta) — status e critérios somente no backlog do produto.

### PISO-009 — Preparar guia e homologação do produto

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-009--preparar-guia-e-homologação-do-produto) — status e critérios somente no backlog do produto.

### PISO-010 — Decidir e acompanhar o piloto específico do consumidor

[Cartão canônico no consumidor](../../products/shift-assistant/docs/backlog.md#piso-010--decidir-e-acompanhar-o-piloto-específico-do-consumidor) — status e critérios somente no backlog do produto.

## Rastreabilidade da auditoria

| Achado | Responsabilidade e cartões                                     | Prova de encerramento                                   |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| F01    | Consumidor: PISO-001                                           | P01 e confirmação antes de efeitos.                     |
| F02    | Consumidor: PISO-003                                           | P02/P03, recuperação sem perda/duplicação local.        |
| F03    | Consumidor: PISO-004, PISO-008                                 | P04, prefixo íntegro e restore executado.               |
| F04    | Consumidor: PISO-005                                           | P05 e concorrência/replay.                              |
| F05    | Consumidor: PISO-006, PISO-008                                 | P06, pausa/saúde responsivas e alerta recebido.         |
| F06    | Consumidor: PISO-002                                           | P07/P08, associação fiel e memória confirmada.          |
| F07    | Consumidor: PISO-002                                           | P09, homônimos sem escolha silenciosa.                  |
| F08    | Consumidor: PISO-003                                           | P11, append falho não inutiliza a fila.                 |
| F09    | Consumidor: PISO-006                                           | P10, pausa revalidada antes do efeito.                  |
| F10    | Consumidor: PISO-007                                           | Imagem/rede efetivas, não apenas config.                |
| F11    | Consumidor: PISO-008, PISO-009, PISO-010                       | Restore/alerta, áudios e decisão administrativa/piloto. |
| F12    | Compartilhado: HISO-012                                        | Advisories e exposição revalidados por artefato.        |
| F13    | Harness: HISO-002, HISO-008, HISO-010; consumidor: PISO-009    | Missão/docs/CI por dono e guia do produto.              |
| F14    | Compartilhado: HISO-011; consumidor adapta limites em PISO-006 | P12 limitado durante leitura.                           |

## Regra de encerramento e próximo trabalho

Cada cartão só passa a DONE com claim/task, SPEC/gate proporcional, diff próprio e evidência de seus aceites. Regressão/skip/pendência humana material mantém o cartão aberto. No fechamento de cada rodada, atualizar runtime/log/backlog e evidências; se ledgers estiverem modificados por outro agente, preparar handoff como nesta rodada, conforme regra 5 de coordenação.

Próxima ação em execução: finalizar gates/revisão da fatia T2 HISO-004–008; SPEC 0178 registrada antes do BUILD. HISO-002 permanece parcial pela regra 5 de coordenação. A extração física começa em **HISO-004**, após a SPEC. A independência do harness encerra em **HISO-014**; liberação do assistente permanece uma decisão separada em **PISO-010**. Continuidade documental: [handoff desta rodada](../08_runtime/handoffs/harness_isolation_plan_20261003.md).

## NEXT-D1/NEXT-D2 — ciclo local autorizado de 04/10/2026

O usuário concedeu um ciclo em cópia isolada e uma revisão nova por frente, preservando NO_MODEL e a promoção condicional R2-D3. A fonte C1 ficou congelada após 151 testes e 116 controles conhecidos passarem. A revisão nova declarou INVALID por desvios do procedimento e REJECT técnico: dez cargas sintéticas do produto e dois casos de resolução desconhecida receberam falso PASS. O Lead reproduziu os doze casos com o mesmo checker congelado. HISO-005 permanece aberto; nenhum código C1 foi promovido ao checkout compartilhado. Não há orçamento concedido para corrigir os novos contraexemplos neste ciclo.

A frente PV10 do consumidor ficou congelada após 290 testes em nove arquivos passarem; a revisão única terminou INVALID por escrita de cache fora da área autorizada, embora os 14 comportamentos PV01–PV14 tenham sido observados PASS. Resultado consolidado no [handoff NEXT](../08_runtime/handoffs/harness_isolation_next_execution_20261004.md). O veredito global continua FAIL e os 24 cartões preservam seus aceites: somente HISO-001 está DONE. Gates de integração não substituem a aprovação da fronteira nem o aceite do produto. A preservação da baseline continua pendente para quatro arquivos de outros agentes, com 23 testes, e impede promoção enquanto não houver coordenação de autoria.

Atualização GREEN/R9 (04/10/2026): a suíte completa com PostgreSQL passou com 3.505 testes em 372 arquivos, zero failures/skips, cobertura S91,81/B87,20/F94,88/L92,86 e gate crítico PASS. Essa execução antecede a integração OPS-R4 e não certifica o novo candidato. Seis arquivos de identidade histórica de recibos foram integrados por SHA; Builder registrou 600 testes distintos PASS e controles de bundle rejeitando callbacks de outra conta/provider sem evento novo. Crítica nova I1 em execução, CI-R3 corrige seis validators; inventário mantém 371 arquivos originais, nove novos e 276 paths canônicos. Gauntlet formal tem duas rodadas, FIX_RETEST, evidência global não qualificada; vinte e quatro critérios e NO_GO preservados. Segurança e bootstrap de produção aguardam revisão explícita das emendas concretas; zero chamadas de modelo. Evidência própria: checkpoint-16-full-suite-pass-and-receipt-integration.json. Ledgers 99/20/30 alheios permanecem preservados, integração pendente.

Atualização GREEN/R10 (04/10/2026): crítica OPS-R4 I1 readonly rejeitou dois HIGH: receipt antecipado expirado ganha autoridade sem callback novo; receipt de tentativa incerta confirma outra outbox/sourceTransitionId dentro do TTL. São 1.003 testes únicos (999 PASS, quatro FAIL, zero skips), com freeze completo de 953 fontes, 17.444 dependências e 48 links MATCH. Builder OPS-R6 corrige causalidade/expiração em cópia própria. Compatibilidade de receipt tardio após timeout (R5) passou em 609 testes/37 arquivos e typecheck/lint, mas continua sem integração ou review aceita; não resolve sozinha os HIGH. C1-R5 tem 204 testes PASS, conserva 191 originais, elimina seis falsos diagnósticos nativos usando Node isBuiltin; 442 diagnósticos restantes continuam INCOMPLETE e passed:false. SBOM/licenças do lock próprio PASS. CI-R3 continua corrigindo seis findings. Global NO_GO, vinte e quatro critérios e zero chamadas reais de modelo preservados; segurança/bootstrap dependem das emendas humanas pendentes. Evidência: checkpoint-17-pending-receipt-authority-and-native-modules.json. Ledgers compartilhados permanecem dirty alheios e sem integração declarada.

### Continuidade GREEN — checkpoint 18 — 04/10/2026

As duas emendas T3 receberam aprovação humana para BUILD local: segurança0159 (SHA9cc15c17d4c86dd165f4a2ba876046343f16146a557192f07558edead9470477) e bootstrap de sessões (SHA2559fec7558358dc03d28fd8eabf8d5c3416f31c217088641988375a5cee6b45). Recibos individuais e `checkpoint-18.json` permanecem na evidência própria green. Estados pending nos documentos imutáveis descrevem sua preparação, não a autoridade atual. Bootstrap Builder ativo em cópia completa; API server/hooks/SQL alheios readonly.

OPS-R6 incorporado ao Main privado por hashes, incluindo as regressões R5/R6, sem promoção Root: Builder 1.029 casos/probes únicos PASS; tipos/lint gerais do Main PASS. CI-R3 integrado teve 211 testes PASS, mas a nova crítica foi INVALID por falta de módulo no packet do Lead e encontrou defeito real de classificação. Gateway-R7 corrige o piso da classificação aprovada; 42 novos negativos PASS. A fixture positiva original que exigia CLINICAL foi alinhada a PUBLIC→INTERNAL, conservando título/asserção de sucesso e original por hash; nova crítica readonly ativa deve examinar esse delta. O foco integrado produziu 650 PASS e uma falha original de sockets observados após 2ms em execução paralela, ainda aberta.

C1 tem 221 casos PASS (191 anteriores +30), nativos Node oficiais, inventário core vazio recusado e separação de AST puramente de tipos sem isentar imports. Installed permanece INCOMPLETE com 302 diagnósticos; não há aceite HISO-005. Segurança local já tem 284 testes PASS e typecheck PASS; testes mais amplos revelaram fixtures próprias de URL acima do limite SSRF existente, um timeout e um skip de preparação: falhas preservadas, fixtures/setup corrigidos e novos gates em andamento. Scan estrito com regras padrão sem allowlists encontrou 6.574 generic-api-key, diferente dos 100 da configuração existente; nenhuma exceção foi aceita e nenhuma regra foi desligada.

Status IN_PROGRESS; produção NO_GO; zero chamadas OpenAI, sem promoção/push/deploy. Próxima ação: concluir BUILD bootstrap/segurança, provar orçamento autenticado PostgreSQL, concluir reviews novas e reexecutar gates finais sobre os bytes integrados. Ledgers99/20/30 dirty de outro owner continuam preservados; entradas desta continuidade ficam no handoff para integração pela regra5 de coordenação. Evidência executável dura em `/home/ricardo/.cache/cvg-harness-green-20261004`, sem dependência de `/tmp`.

Continuidade checkpoint 19: bootstrap revisão Node22 REJECT por dependência indevida de webhook à saúde auth, R3 ativo; gateway R8 integrado e crítico novo ativo; segurança guard27 PASS e scanner6574 disposições I0, revisão pendente. HISO-005 installed INCOMPLETE302; gates completos/neutral/E2E/imagens finais pendentes. IN_PROGRESS/globalFAIL/produçãoNO_GO, sem promoção Root ou provider real. Evidência e detalhes no handoff GREEN.

Continuidade checkpoint 20: segurança27paths e bootstrapR3 trêspaths integrados somente no Main privado; types/lint/format PASS. Foco gateway1208 PASS0skip, mas nova crítica REJECT dois P1 (política mutável e chave de prompt ambígua), R9 ativo. Bootstrap182 testes +10 verificações compiladas PASS e novo crítico ativo. Gitleaks integrado6574 disposições individuais I0, revisão pendente; CodeQL ativo só dois avisos API mantidos, com prova real de orçamento PG em dois processos/sessão durável. Inventário371originais23novos/279coverage (275 originais+4 adicionados). Suíte completa PG+cobertura em curso. Status IN_PROGRESS, global FAIL/produção NO_GO; nenhum runtimeRoot promovido/chamadaOpenAI/push/deploy. Ledgers alheios preservados, integração pelo owner pendente.
