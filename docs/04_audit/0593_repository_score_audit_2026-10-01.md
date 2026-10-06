# AUD0593 — Auditoria do repositório com notas por item

Data: 01/10/2026. Objeto: CVG Operational Harness / Assistente de Plantão. Solicitante: Ricardo Akinaga. Auditor: Codex. Escopo: análise documental, inspeção do código e verificações sintéticas, sem alteração de produto.

## Parecer executivo

**Nota geral: 63/100**, arredondamento da média de **62,50/100** dos 24 itens abaixo. **Prontidão comprovada para o piloto: 51/100**, pela média dos sete itens aplicáveis da barra 0368. O parecer operacional permanece **NO_GO para uso real**, até resolver as falhas da fase 1 e comprovar os controles básicos do mesmo deploy. As notas são uma avaliação técnica explicada, não uma probabilidade de sucesso, certificação ou autorização de produção.

O repositório tem uma base técnica relevante: tipagem estrita, modularização, testes de fronteira, política determinística e uma composição do assistente que funciona de ponta a ponta com serviços simulados. Nesta auditoria, **2.357 testes passaram, 189 foram ignorados e nenhum falhou**. Os **37 testes específicos do assistente** passaram; eles estão incluídos na suíte geral e não devem ser somados novamente.

O principal problema está nos caminhos de falha e na passagem do rascunho da IA para uma obrigação operacional. Uma nota ainda não confirmada já gera lembrete; falhas de transcrição ou envio são marcadas como processadas; chamadas simultâneas do agendador duplicam lembretes; uma linha final incompleta impede a abertura do registro; e a pausa pode ficar atrás de uma chamada de rede pendente enquanto o health continua saudável. **Oito sondas sintéticas reproduziram essas situações e limitações de validação de valores/identidade.** Não medem a frequência de falhas no hospital, mas demonstram que os caminhos existem.

O avanço mais útil é corrigir esses pontos na fase 1 e completar backup, alerta e isolamento do deploy. Não há justificativa nesta auditoria para retomar a plataforma genérica, exigir a antiga certificação enterprise ou antecipar a integração com o HIS.

## 1. Critério vigente e alcance da leitura

A avaliação usa a [direção do programa](../CVG_DIRECAO_PROGRAMAS_E_PLANO_HARNESS_2026-09-30.md), a [ADR-009](../architecture/adrs/ADR-009-assistente-de-plantao.md), a [SPEC 0177](../02_spec/0177_assistente_plantao_fase1_caderno.md), a [barra 0368](../03_build/0368_barra_proporcional_assistente_de_plantao.md) e o [runbook da fase 1](../runbooks/assistente-plantao-fase1.md). O pedido atual do usuário autoriza esta auditoria específica, apesar da orientação anterior de aguardar o fim da fase 2.

**Fechamento manual com `feito` e persistência em arquivos são escolhas autorizadas para a fase 1.** Ausência de PostgreSQL, consulta ao HIS, passagem de plantão, escalonamento, painel do gestor ou OIDC corporativo não foi tratada como defeito do piloto. As fases 2–5 e os programas anteriores aparecem somente para distinguir escopo e histórico.

O inventário inicial abrange **5.118 arquivos em `docs/`, sendo 1.174 Markdown e 85.489.839 bytes**, incluindo a entrada de coordenação desta auditoria. Foram lidos os bytes para inventário e hashes e extraídos os títulos dos Markdown. Houve leitura crítica dos documentos normativos atuais, regras de agentes, estados correntes, arquitetura e histórico pertinente, além de inspeção do produto e testes. **Não houve revisão semântica linha a linha de todos os 85 MB de logs, provas históricas e arquivos binários.** Inventário integral não equivale a auditoria integral de cada evidência antiga.

Entre os documentos técnicos examinados estão `HARNESS_OVERVIEW.md`, `PACKAGE_MAP.md` e `CURRENT_IMPLEMENTATION_2026-09-30.md`. Este último é uma captura histórica: seus números e achados não foram promovidos a prova atual. Os três ledgers foram consultados quanto à continuidade; suas entradas atuais apontam para o sandbox local do assistente, enquanto partes anteriores mantêm o histórico dos programas genéricos.

Baseline: HEAD **`cc1402ff163a34352c10405e9e5c77c653596084`**, com **1.199 entradas de status**, incluindo muitos artefatos e alterações de outras rodadas. Portanto, a auditoria avalia **o checkout capturado**, não apenas o commit. A cópia isolada e o manifesto de 821 arquivos não documentais identificam o candidato testado. Dependências foram copiadas para a área própria; não foi feito `npm ci` limpo nesta rodada.

Evidência: [baseline](evidence/AUD0593-20261001/baseline.json), [inventário documental](evidence/AUD0593-20261001/docs-inventory.json), [hashes de fontes](evidence/AUD0593-20261001/source-baseline.json) e [manifesto final](evidence/AUD0593-20261001/audit-summary.json).

## 2. Método das notas

Cada item soma quatro componentes: **implementação/aderência (0–40), correção e falhas (0–30), evidência atual reproduzível (0–20) e operação/manutenção (0–10)**. Os componentes estão no [arquivo de notas](evidence/AUD0593-20261001/scores.json). Todos os 24 itens têm o mesmo peso na nota geral. São julgamentos ancorados em evidências; pequenas diferenças entre notas não devem ser interpretadas como precisão estatística.

Faixas: 90–100 representa implementação fortemente comprovada; 75–89, base sólida com limitações; 60–74, base útil com lacunas materiais; 40–59, implementação parcial ou falhas relevantes; 20–39, capacidade incipiente ou evidência operacional insuficiente; 0–19, capacidade ausente ou praticamente não comprovada. Ausência de evidência não prova que um controle inexiste fora do repositório, mas impede atribuir a ele uma nota alta nesta auditoria.

### Notas dos 24 itens

| #   | Item analisado                                 | Nota / 100 | Justificativa e evidência principal                                                                                                                                                                           |
| --- | ---------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Direção do produto e requisitos                |     **88** | ADR-009 e SPEC 0177 delimitam uma dor e uma fase realizáveis; falta validar uso real.                                                                                                                         |
| 2   | Consistência e navegação da documentação       |     **52** | Links passam, mas README e parte da navegação ainda promovem a missão e os gates antigos; há contradições sobre retenção e canal. F10.                                                                        |
| 3   | Arquitetura e separação de responsabilidades   |     **78** | Contratos, adapters e composição injetável são claros. O assistente simplifica o núcleo, mas implementa sua própria fila/journal sem todas as garantias existentes no harness genérico.                       |
| 4   | Núcleo genérico de orquestração/runtime        |     **81** | Existem budgets, recovery, ports e testes de fronteira. A suíte atual dá boa evidência sintética; integrações ignoradas e composições opcionais limitam a conclusão.                                          |
| 5   | Policy e aprovação do núcleo                   |     **86** | `ALLOW` passa novamente pelo piso obrigatório; `HIGH_RISK_WRITE`/`ADMIN` exigem aprovação. Isso não substitui a confirmação das notas no assistente.                                                          |
| 6   | Autorização de equipe e propriedade de tarefas |     **87** | Allowlist, segredo comparado com `timingSafeEqual`, rejeição de grupos e comandos por dono; casos negativos nos testes específicos. Homologação do canal real pendente.                                       |
| 7   | Validação de entrada e limites                 |     **70** | Limite HTTP de 25 MiB, schemas de saída e recusa de JSON inválido. Falta limite explícito de mídia baixada e controle de crescimento da fila/registro.                                                        |
| 8   | Integração WhatsApp                            |     **64** | WAHA e Evolution exercitados por HTTP sintético. Envio/download sem timeout explícito e sem outbox recuperável; compatibilidade com instância real não comprovada. F02/F05.                                   |
| 9   | Transcrição de áudio                           |     **62** | Adapter Whisper local e timeout de 120 s; teste usa respostas simuladas. Falha transitória pode encerrar o processamento sem nota; qualidade de áudio veterinário não medida. F02.                            |
| 10  | Extração estruturada e fidelidade dos valores  |     **60** | JSON validado e modelo sem ferramentas. A verificação compara presença de números, não sua associação correta a paciente, unidade ou campo. P07/F06.                                                          |
| 11  | Identificação e memória de pacientes           |     **48** | Há ID, nome, leito e perguntas de ambiguidade. Um ID não confirmado e sinalizado como duvidoso já entra na memória usada para futuras associações. P08/F06.                                                   |
| 12  | Confirmação e correção humana                  |     **40** | `ok` e `corrigir` existem, mas a confirmação não governa a ativação das tarefas. A correção cancela tarefas antigas, porém não desfaz um lembrete já enviado. P01/F01.                                        |
| 13  | Notas, mídia e retenção documental             |     **65** | Registro append-only, mídia local e ausência de descarte por prazo atendem a D4 no fluxo normal. Faltam robustez diante de cauda truncada e procedimento comprovado de arquivamento/restore. F03/F08.         |
| 14  | Pendências e comandos determinísticos          |     **74** | Dono, horário, estados, listagem, conclusão e adiamento funcionam. Limitações surgem na origem ainda não confirmada e na recuperação parcial.                                                                 |
| 15  | Agendamento e entrega de lembretes             |     **55** | Agenda, repetição e limite de quatro lembretes existem. Dois ticks simultâneos enviam a mesma obrigação duas vezes; transporte lento afeta pontualidade. P05/F04.                                             |
| 16  | Deduplicação e recuperação após falhas         |     **43** | O mesmo ID de entrada é recusado e mensagens não processadas retomam. Falhas capturadas são marcadas como processadas; os efeitos não têm transação única nem confirmação durável de entrega. P02/P03/F02.    |
| 17  | Observabilidade e detecção de falha            |     **43** | Logs sem conteúdo nas falhas usuais e health com contadores. Health retorna 200 durante bloqueio da fila; nenhum alerta recebido foi comprovado. P06/F05/F08.                                                 |
| 18  | Backup e restauração do produto atual          |     **25** | Runbook orienta incluir o volume em backup. Não foi encontrada/apresentada prova aplicável de restaurar `events.jsonl` e mídia do assistente em conjunto. Provas antigas de PostgreSQL não substituem isso.   |
| 19  | Pausa, retomada e desligamento operacional     |     **55** | Fluxo normal e persistência da pausa têm testes. O comando pode ficar atrás de envio pendente; um tick em andamento não é cancelado pela pausa. P06/F05.                                                      |
| 20  | Isolamento e configuração de deploy            |     **60** | Usuário não root, filesystem somente leitura, capacidades removidas e porta loopback. A imagem-base não demonstra ausência de shell e o compose não implementa filtro de saída de rede. F07.                  |
| 21  | Dependências e proteção de segredos            |     **62** | Exemplos sem credenciais reais, env e varredura configurada no CI. Audit atual acusa quatro pacotes; nenhum entrou no bundle observado. Sem varredura local integral de segredos ou imagem nesta rodada. F09. |
| 22  | Qualidade e abrangência dos testes             |     **80** | 2.357 testes aprovados e 37 específicos, com HTTP sintético e negações. Os 189 ignorados e oito lacunas reproduzidas impedem equiparar suíte verde a robustez operacional.                                    |
| 23  | CI e reprodutibilidade                         |     **60** | Actions fixadas por SHA e gates extensos. Pipeline mantém certificação antiga; novo Dockerfile não está qualificado por um build real nesta rodada, e dependências não foram reinstaladas do zero. F10.       |
| 24  | Usabilidade e comprovação do piloto            |     **62** | Comandos curtos, texto para colar e demo funcional. Não há medida atual de uso por turno, teste dos áudios reais de homologação ou demonstração de uso autônomo pelos plantonistas.                           |

**Cálculo:** 1.500 pontos ÷ 24 = 62,50; nota apresentada = 63/100. A nota do núcleo genérico não foi usada para atribuir ao assistente controles que sua composição não conecta.

## 3. Verificações executadas nesta rodada

Ambiente: cópia em `/tmp/cvg-aud0593-20261001/snapshot`, Node **22.23.2**, dados fictícios. O Node padrão da máquina era 24.20.0; os checks usaram a versão 22 exigida pelo projeto.

| Procedimento                                            | Resultado atual                              | Limite da evidência                                                                                                                          |
| ------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                     | **PASS**, exit 0                             | Tipagem; não prova comportamento.                                                                                                            |
| `npm run lint`                                          | **PASS**, exit 0                             | Regras estáticas configuradas.                                                                                                               |
| `npm run docs:check-links`                              | **PASS**, exit 0                             | Sem links quebrados reportados; 237 artefatos vazios catalogados e 1.234 JSON de evidência analisados. Não detecta contradição semântica.    |
| Testes específicos do assistente                        | **37/37 PASS**, 2 arquivos                   | 30 testes unitários e 7 de composição/HTTP com providers simulados.                                                                          |
| `npm test` completo                                     | **2.357 PASS; 189 SKIP; 0 FAIL**, exit 0     | 313 arquivos aprovados e 20 ignorados, de 333. Não é uma execução completa das integrações que dependem de serviços/configuração adicionais. |
| Bundle do entrypoint pelo comando esbuild do Dockerfile | **PASS**, exit 0; aproximadamente 582,7 KiB  | Não equivale a construir ou inspecionar a imagem Docker final.                                                                               |
| Demo com a composição real e servidores HTTP sintéticos | **PASS**, exit 0                             | Áudio simulado, organização, pendências, lembrete, conclusão e adiamento. Não valida reconhecimento de voz real.                             |
| `npm audit --json --ignore-scripts`                     | **FAIL do critério de dependências**, exit 1 | 3 pacotes HIGH e 1 MODERATE; sem pacote CRITICAL. Exploração não demonstrada.                                                                |
| Oito sondas adicionais de robustez                      | **8 limitações/falhas reproduzidas**         | O executor saiu 0 porque registrou os resultados; isso não significa que as invariantes passaram.                                            |

Logs e procedimentos: [verificações](evidence/AUD0593-20261001/checks.json), [suíte completa](evidence/AUD0593-20261001/full-tests.log), [testes específicos](evidence/AUD0593-20261001/shift-tests.log), [demo](evidence/AUD0593-20261001/demo.log), [audit de dependências](evidence/AUD0593-20261001/dependency-audit.json), [sondas e resultados](evidence/AUD0593-20261001/probe-results.json). O [script das sondas](evidence/AUD0593-20261001/probes.mts) preserva o procedimento e foi executado apenas na cópia isolada.

Não executados: deploy, WhatsApp real, Whisper real, modelo externo real, prova de restauração do volume, recebimento de alertas, inspeção da imagem, certificação antiga, E2E global de navegador, SBOM/licenças e qualificação PostgreSQL dedicada. Não foi consultado um run remoto de CI para este candidato. Nenhuma dessas ausências foi apresentada como aprovação.

## 4. Achados priorizados

Severidade **alta** indica risco relevante para a confiabilidade do piloto ou uma condição aprovada de segurança; **média** indica degradação operacional ou evidência insuficiente que exige tratamento proporcional. Confiança alta significa reprodução determinística ou caminho de código explícito; não significa alta frequência em produção. Todos os achados permanecem abertos nesta entrega de auditoria.

### F01 — A confirmação humana não antecede as pendências

**Alta; confiança alta; requisito: ciclo de confirmação da direção/ADR-009.** Em [assistant.ts](../../apps/worker/src/shift-assistant/assistant.ts), linhas 328–345, a criação da nota já cria tarefas abertas. `confirmed: false` é gravado nas linhas 357–368; `ok` só altera esse flag nas linhas 228–238. `tick()` não consulta a confirmação.

**Prova P01:** nota não confirmada, uma tarefa aberta, um lembrete enviado depois de avançar o relógio. Uma extração incorreta ou uma ambiguidade pode, portanto, virar cobrança antes de revisão. `corrigir` cancela as tarefas abertas da nota anterior, conforme linhas 259–287; essa correção já existe e não foi confundida com ausência total de correção.

**Fechamento:** rascunho e tarefas propostas permanecem inativos até confirmação inequívoca; teste exige zero lembretes antes do aceite e ativação única após ele. Ajustar a SPEC onde sua descrição operacional atual permite criação antecipada, mantendo o princípio da direção.

### F02 — Falhas transitórias são encerradas como processadas

**Alta; confiança alta; requisitos: recuperação e continuidade da fase 1.** Em `assistant.ts`, linhas 175–189, o catch tenta uma resposta de erro e depois registra `message_processed` mesmo quando a transcrição ou o envio falhou. A deduplicação impede aceitar novamente o mesmo ID; `resumePending()` só pega o que não foi marcado como processado.

**P02:** após falha do transcritor, o arquivo de áudio ficou em disco, não havia nota, havia zero mensagens pendentes após reinício e o mesmo ID foi recusado. **P03:** ambas as tentativas de envio falharam; nota e tarefa estavam persistidas, mas não havia pendência de entrega para retomar. Não houve apagamento comprovado da nota em P03: o defeito é a ausência de entrega recuperável.

**Fechamento:** distinguir recebido, processado com sucesso, falha recuperável e resposta entregue; criar retry limitado e estado inspecionável, com efeito idempotente. Testar indisponibilidade seguida de recuperação sem perder áudio, duplicar tarefa ou depender de o usuário reenviar o conteúdo.

### F03 — Cauda incompleta do JSONL impede o serviço de abrir

**Alta; confiança alta para a simulação.** [store.ts](../../apps/worker/src/shift-assistant/store.ts), linhas 39–48, faz `JSON.parse` de toda linha sem recuperação da última escrita parcial; `appendFileSync` não é acompanhado por uma estratégia explícita de flush/recuperação.

**P04:** uma linha final propositalmente incompleta após registros válidos causou `SyntaxError` ao reconstruir o store. Foi uma simulação de arquivo truncado, não um teste físico de queda de energia nem demonstração de perda total dos registros anteriores.

**Fechamento:** definir fronteira de commit/durabilidade do journal, detectar/quarentenar cauda incompleta e reconstruir o prefixo íntegro sem ocultar corrupção no meio do arquivo. Exercitar reinício abrupto e restore em área descartável. PostgreSQL não é a única solução necessária: um journal local robusto continua compatível com a SPEC.

### F04 — Ticks concorrentes duplicam lembrete

**Alta para confiabilidade; confiança alta.** `assistant.ts`, linhas 111–135, verifica o contador antes de aguardar `sendText`; o contador só é atualizado depois. [compose.ts](../../apps/worker/src/shift-assistant/compose.ts) dispara callbacks por `setInterval` sem impedir sobreposição.

**P05:** dois ticks concorrentes sobre uma única tarefa produziram duas tentativas e `remindedCount = 2`. Isso reproduz a janela que aparece quando uma chamada de transporte demora mais que o intervalo. Não foi uma carga real de produção.

**Fechamento:** um único tick em execução e reserva idempotente por tarefa/janela de lembrete; teste com transporte lento e ticks concorrentes deve produzir uma entrega. Preservar o limite de repetições e o adiamento.

### F05 — Pausa pode ficar na fila; health não detecta bloqueio

**Alta; confiança alta; barra 0368 itens 7 e 8.** A fila global é uma cadeia de promises em `assistant.ts:146–147`; o comando de pausa passa pela mesma fila. [whatsapp.ts](../../apps/worker/src/shift-assistant/whatsapp.ts) não define timeout explícito em envio/download, enquanto Whisper e organizador já possuem timeouts. [server.ts](../../apps/worker/src/shift-assistant/server.ts), linhas 64–71, responde sempre `ok: true` nesse endpoint.

**P06:** com um envio controladamente pendente, a pausa do gestor permaneceu aguardando e `/health` devolveu HTTP 200, `ok: true`, duas mensagens pendentes e `paused: false`. A promise foi liberada e o servidor próprio encerrado após a prova. Não se afirma que toda lentidão cause travamento permanente, mas o limite operacional hoje depende do transporte, não de um prazo explícito do produto.

**Fechamento:** timeout/cancelamento, comando de pausa fora da fila de trabalho demorado e health/readiness com idade da fila e última execução bem-sucedida. Demonstrar alerta recebido e pausa efetiva sob falha, além do caminho normal.

### F06 — Valores e IDs duvidosos podem ganhar confiança indevida

**Alta; confiança alta; limites da extração, não avaliação de conduta clínica.** [organizer.ts](../../apps/worker/src/shift-assistant/organizer.ts), função `unverifiedNumbers`, verifica se números existem em algum lugar do texto. Não vincula valor, unidade, paciente e campo. `store.ts:82–95` inclui notas não confirmadas e valores sinalizados no catálogo `knownPatients`.

**P07:** uma saída estruturada válida com os valores 1 e 2 trocados entre dois pacientes não produziu alerta, pois ambos existiam no texto. **P08:** o ID sintético `99999`, ausente na entrada, ficou sinalizado mas já foi retornado por `knownPatients` em nota não confirmada. A prova injeta respostas estruturadas para testar os controles; não estima taxa de alucinação de um modelo real.

**Fechamento:** IDs não confirmados/sinalizados não alimentam identificação automática; ambiguidades suspendem associação e ativação de tarefas. Para valores, revisão humana explícita com comparação ao original e testes que incluam troca de paciente/unidade, não apenas números novos. Nada deve ser promovido a prontuário definitivo automaticamente.

### F07 — O deploy não comprova todo o isolamento prometido

**Alta; confiança alta na análise estática; barra item 2.** O [Dockerfile do assistente](../../deploy/shift-assistant/Dockerfile) usa `node:22.23.2-bookworm-slim` também no estágio final. Criar usuário com shell `nologin` não demonstra que executáveis de shell e ferramentas tenham sido retirados da imagem. O [compose](../../deploy/shift-assistant/compose.yaml) aplica não root, somente leitura e redução de privilégios, mas não contém uma política de destinos de rede.

O código usa allowlist de origem e bloqueia redirecionamento nos adapters; isso é um controle útil de aplicação. Não equivale à saída de rede restrita no container exigida pela ADR. Não foi construída/inspecionada uma imagem final para transformar esta avaliação em prova de runtime.

**Fechamento:** ajustar imagem e restrição de rede ao contrato aprovado; verificar no mesmo deploy ausência de shell, identidade não root, volume gravável somente onde necessário e tentativa de saída para destino não permitido recusada.

### F08 — Backup, alerta e homologação ainda não têm prova aplicável

**Alta para liberação; confiança alta quanto à ausência de prova nesta rodada.** O runbook orienta backup do volume, mas isso não é restore. Healthcheck do Docker não é, por si só, alerta entregue. O teste de Whisper usa bytes sintéticos mapeados para texto; isso não demonstra os dez áudios veterinários exigidos por AP-008. Não foi apresentada evidência atual de contrato com o provedor externo ou uso por turno.

**Fechamento:** restaurar eventos e mídia em ambiente descartável, conferir notas/tarefas após restauração; provocar falha com recebimento de alerta; testar o canal e os áudios de homologação sem dados reais de pacientes; registrar os requisitos administrativos da barra. Medir o piloto somente depois desses requisitos e correções essenciais.

### F09 — Quatro pacotes com alertas, sem presença no bundle observado

**Média nesta exposição observada; confiança alta; severidade dos advisories preservada.** Audit atual encontrou `brace-expansion 5.0.9` e `undici 7.29.0` em dependências de desenvolvimento, `fast-uri 3.1.6/4.1.4` em dependências de runtime do repositório e `fastify 5.12.3`. Os três primeiros grupos têm severidade máxima HIGH; Fastify, MODERATE. O scanner informa correção disponível.

O [metafile de esbuild](evidence/AUD0593-20261001/bundle-metafile.json) não contém inputs desses quatro pacotes no bundle do assistente. Portanto, o alerta do monorepo não foi descrito como exploração comprovada do piloto. Isso também não atesta segurança da imagem-base, do `fetch` embutido no Node ou de serviços externos, que não foram abrangidos por essa inspeção.

**Fechamento:** atualização coordenada do lockfile, testes dos consumidores afetados e novo audit. Preservar a distinção entre desenvolvimento, API congelada e artefato realmente implantado; não usar a exclusão do bundle para ignorar manutenção do repositório inteiro.

### F10 — A mudança de missão está incompleta na navegação e no CI

**Média; confiança alta.** O [README principal](../../README.md) ainda apresenta a plataforma genérica e as 13 condições de GO como estado atual. A direção contém linhas antigas sobre exclusão automática e API oficial do WhatsApp, divergentes de D1/D4 na ADR-009. A captura arquitetural de 30/09 também preserva o antigo bug de `ALLOW`, já corrigido no código atual. Esses textos devem ser claramente históricos ou atualizados.

O [workflow Verify](../../.github/workflows/verify.yml) ainda executa a barra REM21 extensa, incluindo certificação encerrada pela nova missão. Testes da arquitetura antiga continuam úteis; o problema é apresentar essa máquina de certificação como condição atual e não qualificar explicitamente o artefato do assistente.

**Fechamento:** README e índice apontam para ADR-009/SPEC 0177/runbook/0368; exemplos de retenção e canal concordam com as decisões; CI do produto verifica seus testes, build e controles proporcionais. Não apagar histórico nem reabrir os antigos backlogs. Integrar a continuidade via holder dos ledgers compartilhados.

## 5. Barra 0368: nota e status de cada condição

As notas abaixo medem o grau de implementação/evidência de cada condição. **Uma média não compensa falha de segurança nem substitui prova no mesmo deploy.** O item HIS não é aplicável à fase 1, que não tem essa integração, e fica fora da média.

| Condição aprovada                            | Nota / 100 | Estado atual                                                                                                                          |
| -------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Só a equipe acessa                        |     **85** | Passa nos testes sintéticos; canal e deploy real ainda não homologados.                                                               |
| 2. Poder zero e isolamento                   |     **55** | Sem ferramentas de escrita no HIS; isolamento de imagem/rede incompletamente comprovado. F07.                                         |
| 3. HIS somente leitura                       |    **N/A** | Sem integração HIS nesta fase; reavaliar antes da fase 3.                                                                             |
| 4. Segredos fora do código e imagem          |     **75** | Configuração e CI de varredura presentes; imagem/scan atual não qualificados nesta auditoria.                                         |
| 5. Privacidade, transcrição local e retenção |     **40** | Arquitetura local para áudio e retenção documental presentes; contrato/registro administrativo e controles completos não comprovados. |
| 6. Backup restaurado e testado               |     **25** | Orientação no runbook; falta restore aplicável do volume do assistente.                                                               |
| 7. Alerta quando falha                       |     **25** | Logs/health existem; falta prova de detecção e recebimento, com health insuficiente para fila bloqueada.                              |
| 8. Desligar/retomar sem perder pendências    |     **55** | Caminho normal testado; falha sob envio bloqueado e recuperação parcial.                                                              |

**Prontidão:** 360 ÷ 7 = 51,43, apresentada como **51/100**. Critério de liberação: atender as condições aplicáveis com evidência atual; não simplesmente ultrapassar um número.

## 6. Ordem recomendada de tratamento

1. **Fechar a fronteira humana e de recuperação da fase 1:** F01, F02 e F06, com regressões derivadas de P01/P02/P03/P07/P08. Vincular às tasks AP-009–AP-013 existentes.
2. **Garantir lembrete, pausa e durabilidade:** F03–F05; testar concorrência, corrupção de cauda e transporte lento. Aplicar às capacidades AP-011/AP-013/AP-014 e barra 6–8, sem impor uma plataforma nova.
3. **Qualificar o deploy e preparar o piloto:** F07–F09, restore, alerta, canal/transcrição, guia e evidência administrativa; reconciliar F10 e depois medir AP-015/AP-016 por turno.

O sucesso dessas correções se mede pelo fechamento das reproduções e dos controles da barra, não pela quantidade de novos documentos. Esta entrega não cria um segundo backlog nem executa correções não solicitadas.

## 7. Limitações, revisão e preservação do trabalho

O parecer resulta de inspeção e verificações do auditor principal. Foram tentados dois scouts somente leitura; **não houve parecer independente final utilizável**. Um terminou com `stream disconnected before completion: ChatGPT stopped responding after the task started. Check the ChatGPT tab before continuing.`; o outro foi encerrado pelo Lead após assumir a cobertura restante. Não se atribui independência às próprias sondas ou à revisão final do relatório.

Três chamadas auxiliares foram bloqueadas pela plataforma com a mensagem `Esta chamada de ferramenta foi bloqueada pela OpenAI porque não foi possível determinar o status de segurança da solicitação.` Não há execução confirmada dessas chamadas. Os resultados da tabela de checks vêm de outras chamadas efetivamente executadas e encerradas; nenhum bloqueio foi inventado como erro de permissão do repositório.

Não houve dados reais, mensagem para equipe/tutor, acesso ao sandbox pré-existente nas portas 3400/3401, implantação ou escrita clínica/financeira. A avaliação da barra de privacidade é de evidência técnica e administrativa solicitada pelo projeto, não parecer jurídico. Não foi feito pentest independente.

O relatório, evidências e [handoff](../08_runtime/handoffs/aud0593_20261001.md) pertencem ao claim AUD0593. As entradas propostas para runtime/log/backlog ficam no handoff porque os ledgers estavam modificados por outras rodadas. A [comparação final de fontes](evidence/AUD0593-20261001/source-integrity.json) registra a preservação do produto. Sem commit ou push nesta entrega.
