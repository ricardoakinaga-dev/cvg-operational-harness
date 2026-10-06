# AUD0594 — Auditoria do repositório com notas de 0–100

Solicitação e início: 02/10/2026; conclusão: 03/10/2026, America/Sao_Paulo. Auditor: Codex. Task T1/AUDIT registrada na coordenação. Objeto: checkout do CVG Operational Harness e seu produto vigente, o Assistente de Plantão. Entrega documental, sem correção de produto.

**Nota geral: 61/100** — média de 61,04 nos 24 itens. **Prontidão comprovada para o piloto: 50/100. Parecer: NO_GO para uso real**, pelas lacunas da barra 0368 e pelos defeitos reproduzidos na fase 1. A média mede qualidade/evidência; não substitui o atendimento individual dos controles de liberação.

A base é funcional em testes sintéticos: tipagem estrita, contratos separados, policy determinística, integração HTTP simulada e comandos do assistente. As falhas mais relevantes estão na associação de pacientes, confirmação humana, recuperação, concorrência e desligamento. Doze sondas reproduziram violações ou limites; nenhuma mede a frequência de incidentes no hospital.

## Escopo documental e baseline

A direção vigente é a [ADR-009](../architecture/adrs/ADR-009-assistente-de-plantao.md), detalhada no [documento de direção](../CVG_DIRECAO_PROGRAMAS_E_PLANO_HARNESS_2026-09-30.md), na [SPEC 0177](../02_spec/0177_assistente_plantao_fase1_caderno.md), no [runbook](../runbooks/assistente-plantao-fase1.md) e na [barra 0368](../03_build/0368_barra_proporcional_assistente_de_plantao.md). O pedido atual autoriza esta auditoria específica. As fases futuras e a antiga certificação de plataforma não foram impostas como requisitos da fase 1.

O inventário abrange **5.151 arquivos em `docs/`, 87.527.204 bytes, 1.177 Markdown**; **607 Markdown ficam fora das pastas de evidências**. Todos os arquivos foram lidos para hashes/inventário, e os 607 documentos narrativos foram indexados por título, seções e abertura. Houve leitura crítica das fontes normativas atuais, constituição, coordenação, ledgers, instruções mestre, arquitetura, contratos públicos, classificação de pacotes, segurança das fases anteriores e auditorias pertinentes. **Não houve revisão semântica integral, linha a linha, de todos os documentos, logs e provas históricas.** O [índice de leitura](evidence/AUD0594-20261002/docs-reading-index.json) e o [inventário integral](evidence/AUD0594-20261002/docs-inventory.json) distinguem navegação da leitura crítica.

HEAD: `cc1402ff163a34352c10405e9e5c77c653596084`, com **1.232 entradas de status** na captura. Portanto, o objeto testado é o checkout copiado, incluindo alterações locais, identificado pelo [baseline](evidence/AUD0594-20261002/baseline.json) e [manifesto de fontes](evidence/AUD0594-20261002/source-baseline.json). A cópia própria fica em `/tmp/cvg-aud0594-20261002/snapshot`; Node 22.23.2. Dependências foram copiadas, sem `npm ci` limpo. Nenhum `.env` real foi copiado.

A [comparação com AUD0593](evidence/AUD0594-20261002/comparison-aud0593.json) encontra **821/821 arquivos não documentais idênticos**. Esta rodada reexecuta checks e amplia negativos; a redução de 63 para 61 representa evidência mais forte sobre a mesma implementação, **não uma regressão de código ocorrida entre as auditorias**.

Persistência em arquivos e fechamento manual com `feito` são escolhas da fase 1. Ausência de PostgreSQL no assistente, leitura do HIS, passagem de plantão, escalonamento, painel de gestão e IdP corporativo não foi contada como defeito desta fase. Controles do núcleo genérico só receberam crédito na composição onde estão conectados.

## Método das notas

Cada nota soma **implementação/aderência (0–40), correção/caminhos de falha (0–30), evidência atual (0–20) e operação/manutenção (0–10)**. Os componentes estão em [scores.json](evidence/AUD0594-20261002/scores.json). Os 24 itens têm o mesmo peso: **1.465 ÷ 24 = 61,04**, apresentado como 61/100.

Faixas: 90–100 fortemente comprovado; 75–89 sólido com limites; 60–74 útil com lacunas materiais; 40–59 parcial ou com falhas relevantes; 20–39 incipiente ou pouco comprovado; 0–19 ausente ou quase sem evidência. São julgamentos técnicos, não medidas estatísticas. Ausência de prova no repositório não demonstra que um controle externo inexiste.

| #   | Item analisado                          | Nota / 100 | Fundamentação                                                                                                                                  |
| --- | --------------------------------------- | ---------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Direção do produto e requisitos         |         88 | Dor, fases e limites claros em ADR-009/0177; falta validação pelos usuários.                                                                   |
| 2   | Consistência e navegação documental     |         52 | Links válidos, mas README/índices e instruções antigas promovem programa substituído; D1/D4 contraditos em trecho da direção. F13.             |
| 3   | Arquitetura e responsabilidades         |         78 | Ports, contratos e composição injetável; assistente tem fila/journal próprios com garantias menores que o núcleo.                              |
| 4   | Núcleo genérico de runtime/orquestração |         81 | Perfis, budgets, effect journal e recovery exercitados em testes; controles opcionais e integrações sem execução limitam a conclusão.          |
| 5   | Policy e aprovação do núcleo            |         86 | Regra ALLOW preserva pisos obrigatórios de risco; aprovação sensível continua fora do modelo. Não governa o aceite das notas.                  |
| 6   | Autorização de equipe e propriedade     |         87 | Allowlist, segredo com comparação constante, grupos ignorados e comandos por dono; canal real não homologado.                                  |
| 7   | Validação de entrada e limites          |         65 | Schema e limite HTTP presentes; download de mídia sem teto próprio, fila sem backpressure e limite do modelo aplicado após buffering. F14/P12. |
| 8   | Integração WhatsApp                     |         64 | WAHA/Evolution funcionam em HTTP sintético; falta timeout explícito e entrega recuperável no produto. F02/F05.                                 |
| 9   | Transcrição de áudio                    |         62 | Whisper local e timeout implementados; áudio simulado não mede qualidade, e falha transitória perde retomada. F02/P02.                         |
| 10  | Extração e fidelidade dos valores       |         60 | JSON validado, sem tools; números presentes podem ser trocados entre pacientes sem alerta. F06/P07.                                            |
| 11  | Identificação e memória de pacientes    |         40 | IDs duvidosos entram no histórico e duas ocorrências do mesmo nome podem vincular tarefa ao primeiro ID. F06/F07/P08/P09.                      |
| 12  | Confirmação e correção humana           |         40 | `ok` e correção existem; tarefas e lembretes ficam ativos antes do aceite. F01/P01.                                                            |
| 13  | Notas, mídia e retenção documental      |         65 | Append-only e sem expurgo por prazo; cauda parcial derruba abertura e restore aplicável não comprovado. F03/F11.                               |
| 14  | Pendências e comandos determinísticos   |         74 | Dono, estado, prazo, listagem, conclusão e adiamento funcionam; identidade e origem não confirmada têm riscos.                                 |
| 15  | Agendamento e lembretes                 |         55 | Horário, intervalo e limite funcionam no normal; ticks simultâneos enviam duplicados. F04/P05.                                                 |
| 16  | Deduplicação e recuperação              |         35 | ID repetido recusado; falhas são marcadas processadas e erro final do journal deixa a fila rejeitada. F02/F08/P11.                             |
| 17  | Observabilidade e detecção de falha     |         43 | Logs mínimos e health com contadores; health continua 200 durante fila bloqueada e alerta recebido não provado. F05/F11.                       |
| 18  | Backup e restauração do produto         |         25 | Orientação no runbook; sem restauração comprovada conjunta de eventos e mídia do assistente. F11.                                              |
| 19  | Pausa, retomada e desligamento          |         45 | Caminho normal testado; pausa enfileirada pode atrasar, e pausa já reconhecida não barra o próximo lembrete do tick. F05/F09/P10.              |
| 20  | Isolamento e configuração de deploy     |         60 | Não root, disco somente leitura e capacidades removidas; shell/rede não atendem integralmente ao contrato comprovado. F10.                     |
| 21  | Dependências e segredos                 |         62 | Env/exemplos e scanners CI presentes; audit acusa 3 pacotes HIGH/1 MODERATE, fora dos inputs do bundle observado. F12.                         |
| 22  | Qualidade e abrangência dos testes      |         76 | Suítes e composição simulada úteis; doze negativos demonstram invariantes ausentes das regressões atuais.                                      |
| 23  | CI e reprodutibilidade                  |         60 | Actions fixadas por SHA e gates extensos; workflow qualifica imagem genérica, sem gate explícito do Dockerfile do assistente. F13.             |
| 24  | Usabilidade e evidência do piloto       |         62 | Comandos curtos, demo e texto para copiar; sem evidência atual de uso por turno, compreensão do guia ou qualidade em áudios de homologação.    |

## Verificações atuais

Typecheck, lint, links/higiene, os **37 testes específicos do assistente**, demo e bundle do entrypoint passaram nesta rodada em Node 22. A suíte completa terminou com **2.357 testes aprovados, 189 ignorados e zero falhas** (313 arquivos aprovados e 20 ignorados, 333 no total; exit 0, duração 412,26 s). Os ignorados incluem integrações que exigem serviços/configuração adicionais; suíte verde não significa execução desses controles.

| Check executado                     | Resultado atual                                                       | Evidência                                  |
| ----------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `npm run typecheck`                 | PASS, exit 0                                                          | `typecheck.log`                            |
| `npm run lint`                      | PASS, exit 0                                                          | `lint.log`                                 |
| `npm run docs:check-links`          | PASS, exit 0; 237 artefatos vazios catalogados, 1.253 JSON analisados | `docs-links.log`                           |
| Testes específicos do assistente    | 37/37 PASS, exit 0                                                    | `shift-tests.log`                          |
| `npm test`                          | 2.357 PASS / 189 SKIP / 0 FAIL, exit 0                                | `full-tests.log`                           |
| Demo com HTTP simulado              | PASS, exit 0                                                          | `demo.log`                                 |
| Bundle do entrypoint                | PASS, exit 0                                                          | `bundle-summary.json`                      |
| `npm audit --json --ignore-scripts` | FAIL do critério de dependências, exit 1                              | `dependency-audit.json`                    |
| Sondas adicionais P01–P12           | 12 violações/limites reproduzidos; executores exit 0                  | `probe-results.json`, `receive-limit.json` |

Os testes específicos usam 2 arquivos, com fakes e HTTP loopback; incluem testes denominados E2E no diretório do produto, **não o gate global Playwright**. O áudio da demo é simulado.

O bundle tem **118 inputs, aproximadamente 582,7 KiB**, com manifesto em [bundle-summary.json](evidence/AUD0594-20261002/bundle-summary.json). A execução do comando de bundling do Dockerfile não equivale a construir ou inspecionar a imagem final.

O [audit atual](evidence/AUD0594-20261002/dependency-audit.json) saiu **1** e encontrou **3 pacotes HIGH e 1 MODERATE, 0 CRITICAL**. As [11 sondas de fluxo](evidence/AUD0594-20261002/probe-results.json) e a [sonda de recepção](evidence/AUD0594-20261002/receive-limit.json) reproduziram os resultados descritos abaixo. Seus executores saíram 0 porque registraram os resultados; isso **não significa PASS das invariantes**.

Resultado da suíte completa e registros finais de comando: [checks.json](evidence/AUD0594-20261002/checks.json) e [full-tests.log](evidence/AUD0594-20261002/full-tests.log). Os testes específicos são subconjunto da suíte e não devem ser somados a ela. Evidências históricas de PostgreSQL, browser e certificação não foram promovidas a checks atuais.

Não executados: PostgreSQL dedicado, coverage, Playwright global, certify, SBOM/licenças, reinstalação limpa, construção de imagem, pentest, WhatsApp/Whisper/modelo reais, deploy, restore do volume, alerta recebido e consulta ao CI remoto. As notas de capacidade genérica e de operação devem ser interpretadas com esses limites.

## Achados e critérios de correção

Severidade alta significa risco relevante ao piloto ou falha de controle aprovado; média, limitação de qualidade/manutenção ou prova incompleta. Confiança alta indica reprodução sintética ou caminho estático inequívoco, sem inferir frequência de produção. Todos permanecem abertos nesta auditoria.

### F01 — Pendências ativadas antes da confirmação

**Alta; confiança alta.** [assistant.ts](../../apps/worker/src/shift-assistant/assistant.ts:328) grava nota `confirmed: false` e cria tarefas abertas. `ok` altera só a confirmação; `tick()` não consulta esse flag. **P01:** uma nota não confirmada já gerou um lembrete. Requisito: humano confirma a transformação antes de ela ganhar efeito operacional, conforme direção/ADR. A SPEC/runbook descrevem criação antecipada, portanto o fechamento exige reconciliar também esse contrato.

**Aceite:** zero lembretes antes da confirmação; aceite inequívoco ativa tarefas uma única vez; correção invalida propostas anteriores. Não exigir escrita automática no HIS.

### F02 — Falha transitória encerrada como processada

**Alta; confiança alta.** O catch em [assistant.ts](../../apps/worker/src/shift-assistant/assistant.ts:175) termina com `message_processed` mesmo após erro. **P02:** áudio guardado, nenhuma nota, zero pendências de processamento após reabertura e mesmo ID recusado. **P03:** nota e tarefa persistidas, ambos os envios falharam, mas nenhuma entrega retomável. O áudio/nota não foi apagado; a perda é da recuperação automática prometida.

**Aceite:** separar processamento, falha recuperável e entrega; retry limitado, idempotente e inspecionável. Recuperação após indisponibilidade não pode duplicar tarefa ou depender de reenvio manual.

### F03 — Cauda JSONL truncada impede reinício

**Alta; confiança alta na simulação.** [store.ts](../../apps/worker/src/shift-assistant/store.ts:44) aplica `JSON.parse` em todas as linhas sem recuperação. **P04:** linha final incompleta gerou `SyntaxError` ao abrir store com prefixo válido. Não foi queda física de energia.

**Aceite:** definir durabilidade, detectar/quarentenar última escrita parcial e restaurar prefixo íntegro; corrupção no meio não pode ser silenciosamente ignorada. Exercitar interrupção/reabertura em área descartável. Arquivos continuam uma opção válida da fase 1.

### F04 — Ticks concorrentes duplicam lembrete

**Alta; confiança alta.** [tick](../../apps/worker/src/shift-assistant/assistant.ts:111) verifica estado antes de aguardar envio e só incrementa depois; [compose](../../apps/worker/src/shift-assistant/compose.ts:110) usa `setInterval` sem trava de sobreposição. **P05:** dois ticks sobre a mesma tarefa fizeram dois envios e contador 2.

**Aceite:** exclusão por tick e/ou reserva idempotente por tarefa/janela; transporte lento e concorrência produzem uma entrega, mantendo repetição e adiamento.

### F05 — Envio bloqueado atrasa pausa e health continua saudável

**Alta; confiança alta.** A fila global de promises inclui comandos de gestor. WhatsApp não define prazo explícito para envio/download; Whisper e modelo já têm timeout. [health](../../apps/worker/src/shift-assistant/server.ts:64) responde sempre `ok: true`. **P06:** pausa ficou atrás do envio pendente, `paused: false`, health 200 com duas mensagens aguardando. A promise foi liberada e o servidor fechado ao final.

**Aceite:** timeout/cancelamento, interrupção gerencial efetiva sob lentidão e health/readiness que detecte idade da fila e ausência de progresso; prova de alerta recebido. Barra 0368 itens 7–8.

### F06 — Valores trocados e IDs não confiáveis ganham aparência de certeza

**Alta; confiança alta.** [unverifiedNumbers](../../apps/worker/src/shift-assistant/organizer.ts:123) compara presença de números, sem associação paciente/campo/unidade. [knownPatients](../../apps/worker/src/shift-assistant/store.ts:86) inclui notas não confirmadas e IDs sinalizados. **P07:** valores 1 e 2 trocados entre dois pacientes, zero alerta. **P08:** ID `99999` não dito e não confirmado já retornou como memória.

**Aceite:** identidade não confirmada/sinalizada não vira associação automática; revisão explícita compara saída com fonte, com casos de troca de paciente/unidade. A prova injeta JSON válido, sem medir taxa de erro de modelo real.

### F07 — Pendência de paciente homônimo vinculada ao primeiro ID

**Alta; confiança alta.** `patientIdFor` em [assistant.ts](../../apps/worker/src/shift-assistant/assistant.ts:491) usa `find` pelo nome. A pendência do schema não tem campo próprio de ID. **P09:** dois Rex (`10101`, leito 1; `20202`, leito 2); descrição pediu rever o segundo, ID 20202; tarefa recebeu **patientId 10101**. Os testes atuais de homônimos usam uma única identificação por nota e não cobrem esta multiplicidade.

**Aceite:** vincular por identidade explícita validada ou pedir desambiguação; nunca escolher o primeiro candidato quando há mais de um. Texto exibido, ID e tarefa devem concordar. Vincular a AP-009/AP-010/AP-011.

### F08 — Erro final de gravação deixa a fila permanentemente rejeitada

**Alta; confiança alta no fault injection.** [enqueue](../../apps/worker/src/shift-assistant/assistant.ts:145) encadeia `.then` sem recuperar rejeição; o append de `message_processed` está fora do catch. **P11:** erro injetado nesse append; mensagem seguinte foi aceita/persistida, mas repetiu a rejeição anterior e não ganhou resposta; duas mensagens pendentes, uma resposta total.

**Aceite:** erro do journal interrompe com estado de indisponibilidade/recovery observável; mensagens seguintes voltam a progredir após resolução e restart/retry definido. Não mascarar falha de gravação como sucesso. Sonda simula erro de I/O, não disco fisicamente cheio.

### F09 — Pausa reconhecida permite outro lembrete no mesmo tick

**Alta; confiança alta.** `tick()` consulta pausa somente antes do loop. **P10:** primeiro envio ficou suspenso; gestor pausou e recebeu processamento do comando; após liberar o transporte, o segundo lembrete foi enviado, total 2. É diferente de F05: aqui a pausa já estava ativa.

**Aceite:** revalidar pausa antes de cada novo efeito e definir cancelamento para envio em andamento; após pausa reconhecida, o próximo lembrete não sai. Não prometer retirar mensagem já entregue ao canal.

### F10 — Isolamento de shell e rede não integralmente demonstrado

**Alta para liberação; confiança alta na inspeção estática.** [Dockerfile](../../deploy/shift-assistant/Dockerfile) usa `node:22.23.2-bookworm-slim` também no runtime. Shell `nologin` do usuário não retira shells da imagem. [Compose](../../deploy/shift-assistant/compose.yaml) aplica não root, read-only, `cap_drop` e loopback, mas não declara filtro de destinos de rede. Allowlist de aplicação/redirect manual existe e merece crédito; não equivale à restrição de rede do container da ADR/0368.

**Aceite:** construir/inspecionar a imagem final e demonstrar ausência de shell, UID não root, escrita restrita e saída recusada para destino fora da lista. Não foi demonstrada exploração ou escape.

### F11 — Backup, alerta e homologação sem prova do produto atual

**Alta para liberação; confiança alta sobre a lacuna examinada.** Runbook orienta backup, mas não apresenta restore de eventos/mídia. Healthcheck não prova alerta entregue. Não foram localizadas provas aplicáveis de dez áudios de 60 s com jargão (AP-008), contrato do provedor externo ou piloto por turno. Provas antigas de PostgreSQL não atendem ao store de arquivo atual.

**Aceite:** restore conjunto em ambiente descartável, notas/tarefas/mídia conferidas; provocar parada e registrar recebimento de alerta; homologar canal/transcrição com conteúdo fictício e registrar requisitos administrativos da barra. Nenhum parecer jurídico foi emitido.

### F12 — Dependências com advisories atuais

**Média na exposição observada; advisories preservam sua severidade própria.** `npm audit` atual: `brace-expansion` HIGH, `fast-uri` HIGH, `undici` HIGH e `fastify` MODERATE. Há correção disponível segundo o scanner. Versões afetadas e lista completa estão no JSON de evidência. Fontes consultadas: [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [fast-uri](https://github.com/advisories/GHSA-qw65-cvwx-89v3), [undici](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm), [Fastify](https://github.com/advisories/GHSA-4mh8-r7rc-xpvc).

**Nenhum desses quatro pacotes aparece entre os 118 inputs do bundle observado do assistente.** Isso limita a exposição deste artefato, mas não atesta imagem-base, Node/fetch embutido, serviços externos ou outros consumidores do monorepo. Exploração não demonstrada.

**Aceite:** atualização coordenada com claim de lockfile, regressão dos consumidores afetados e novo audit; distinguir desenvolvimento, API congelada e artefato efetivamente implantado.

### F13 — Navegação, instruções e CI continuam na missão substituída

**Média; confiança alta.** [README](../../README.md), [docs README](../README.md), [índice](../99_operational_index.md) e `CODEX_MASTER_INSTRUCTIONS.md` apresentam plataforma genérica/13 gates como missão corrente. Ledgers apontam no topo para sandbox, mas mantêm frentes antigas e claims ATIVO sem reconciliação completa de AP-002. No documento de direção, linhas 408–409 preservam apagamento automático/API oficial, contrários a D4/D1.

O workflow [Verify](../../.github/workflows/verify.yml) ainda certifica o programa anterior; seu gate image em [ci-bar](../../scripts/ci-bar.mjs:560) constrói o Dockerfile da raiz, sem qualificar explicitamente `deploy/shift-assistant/Dockerfile`. A captura arquitetural de 30/09 é histórica e ainda descreve falhas de ALLOW/transporte já corrigidas; não foi tratada como fonte atual.

**Aceite:** ponteiros correntes para ADR-009/0177/runbook/0368, histórico rotulado, AP-002 reconciliada e CI que qualifique o artefato do assistente. Preservar testes úteis e provas antigas; não reabrir programas congelados.

### F14 — Teto de resposta aplicado depois de receber tudo

**Média; confiança alta.** [transporte](../../packages/model-gateway/src/providers/ssrf-node.ts:167) acumula chunks e constrói Response; [provider](../../packages/model-gateway/src/providers/openai-compatible.ts:199) lê `response.text()` antes de `assertResponseSize`. **P12:** teto de 1.024 bytes, resposta loopback de 1.048.631 bytes, servidor terminou envio; só então ocorreu rejeição pelo teto. Inspeção confirma buffering completo. Não houve teste de OOM nem carga destrutiva.

**Aceite:** cortar recepção/cancelar transporte quando exceder orçamento de bytes, preservando erro controlado e fallback. O timeout existente continua útil, mas não é limite de memória. SPEC 0175 é uma proposta anterior, não implementação aprovada automaticamente por esta auditoria.

## Barra proporcional 0368

| Condição aplicável                           | Nota / 100 | Estado comprovado nesta rodada                                                                              |
| -------------------------------------------- | ---------: | ----------------------------------------------------------------------------------------------------------- |
| 1. Só a equipe acessa                        |         85 | Testes sintéticos aprovados; canal/deploy real pendente.                                                    |
| 2. Poder zero e isolamento                   |         55 | Sem ferramentas clínicas/escrita HIS; imagem e rede incompletamente comprovadas. F10.                       |
| 3. HIS somente leitura                       |        N/A | Integração fora da fase 1; verificar antes da fase 3.                                                       |
| 4. Segredos fora do código/imagem            |         75 | Configuração e scanners CI presentes; scan integral atual e imagem não qualificados.                        |
| 5. Privacidade, transcrição local e retenção |         40 | Arquitetura e D4 implementadas no normal; contrato/registro administrativo e controles completos sem prova. |
| 6. Backup restaurado/testado                 |         25 | Orientação documental; falta restore aplicável do assistente.                                               |
| 7. Alerta quando falha                       |         25 | Logs/health existem; falha de detecção e nenhum alerta recebido demonstrado.                                |
| 8. Desligar/retomar sem perder pendências    |         45 | Normal aprovado; falhas sob bloqueio e tick em andamento, recovery incompleto.                              |

**350 ÷ 7 = 50/100.** Item 3 excluído por não se aplicar à fase atual. Nenhuma nota alta compensa condição de liberação não atendida. Mantém-se **NO_GO** até evidência do mesmo deploy.

## Prioridades e continuidade

1. Corrigir confirmação, recuperação e identidade: F01/F02/F06/F07/F08, ligados a AP-009–AP-013. Regressões devem reproduzir os negativos atuais e exigir fechamento das invariantes.
2. Garantir agendamento, pausa e durabilidade: F03–F05/F09/F14, ligados a AP-011/AP-013 e barra 6–8; usar falhas controladas, sem dado real.
3. Qualificar AP-014 e preparar AP-015/AP-016: isolamento, restore, alerta, canal/transcrição, dependências, guia e continuidade documental. Medir uso por turno quando as condições do piloto estiverem satisfeitas.

São recomendações vinculadas ao backlog vigente; não foi criado um segundo programa nem executado BUILD. A próxima ação útil é fechar a fronteira confirmação/identidade/recuperação da fase 1 com testes derivados de P01/P02/P03/P08/P09/P11.

Auditoria conduzida diretamente pelo Lead; revisão final própria, sem parecer independente. Os ledgers compartilhados estavam modificados por outras rodadas e foram preservados conforme regra 5 da coordenação. Entradas de runtime state, execution log e backlog estão preparadas no [handoff próprio](../08_runtime/handoffs/aud0594_20261002.md). A [verificação final de integridade](evidence/AUD0594-20261002/source-integrity.json) confere os 821 arquivos do manifesto e o HEAD. Sem commit, push, deploy ou mudança de produto. Não foi acessado o sandbox existente nas portas 3400/3401.
