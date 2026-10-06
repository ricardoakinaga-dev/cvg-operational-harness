# AUD-0590 — Auditoria profunda do CVG Operational Harness

**Data:** 28/09/2026, America/Sao_Paulo. **Resultado:** maturidade geral **68/100**; prontidão para liberação **30/100**; produção **NO_GO**.

**Pedido:** analisar a pasta `docs`, confrontar a documentação com o sistema e atribuir notas de 0–100 a cada dimensão analisada.

**Baseline:** `eff8e0d8974f2c3222eb4602e4a37ff73c708245`, branch observada `aud0578-remediation-20260926`, acrescida das alterações locais registradas no inventário. Captura em 28/09/2026 às 21:44:57 BRT. Esta avaliação corresponde a um checkout de desenvolvimento com trabalho simultâneo, não a uma release limpa.

**Pacote de evidências:** [índice e escopo](evidence/AUD0590-DEEP-20260928/audit-contract.md), [baseline](evidence/AUD0590-DEEP-20260928/baseline.json), [notas estruturadas](evidence/AUD0590-DEEP-20260928/scorecard.json), [comandos e resultados](evidence/AUD0590-DEEP-20260928/checks.json).

## 1. Parecer executivo

O projeto possui um núcleo de execução governada substancialmente implementado. Há separação entre decisão, autorização, aprovação e efeito; execução iterativa com limites; persistência de estado; recuperação; controle de tenant; e uma suíte relevante de testes. Na cópia congelada, **2.403 testes passaram, sem skips**, com PostgreSQL disponível. O gate específico de PostgreSQL também passou **258/258**, e os builds de runtime e interface foram concluídos.

A principal insuficiência está na composição integrada e na qualificação do candidato. O entrypoint principal ainda não conecta a sessão durável necessária ao operador confiável. O certificado presente não corresponde ao checkout. A suíte de navegadores confiáveis falhou em um dos quinze casos. A consulta atual de dependências trouxe alertas que não aparecem como resolvidos no lockfile avaliado. Além disso, esta auditoria reproduziu falhas de replay temporal, de validação de schema e de redação no adaptador OpenTelemetry.

**O sistema está adequado para continuar desenvolvimento e homologação sintética controlada. As evidências não sustentam liberá-lo para operação real neste estado.** A nota geral é uma média de maturidade de componentes; não substitui os requisitos de liberação do plano executivo.

O caminho de maior retorno é fechar uma composição única e verificável: identidade e sessão conectadas, invariantes de replay e schema corrigidas, dependências atualizadas, matriz de navegadores estável e todos os artefatos produzidos pelo mesmo candidato. Expandir funcionalidades antes dessa integração aumenta a quantidade de caminhos que precisarão ser requalificados.

## 2. Método, cobertura e limites de interpretação

### 2.1 O que foi efetivamente analisado

Foi produzido um inventário por caminho, tamanho e SHA-256 de **3.899 arquivos de documentação**, somando **55.141.386 bytes**. O acervo contém 1.035 arquivos Markdown, 1.212 logs, 694 JSON e outros formatos. Grande parte corresponde a evidências e revisões históricas. O [inventário integral](evidence/AUD0590-DEEP-20260928/docs-inventory.json) registra esse universo.

A leitura crítica concentrou-se nas instruções operacionais, nos três ledgers de estado, no plano/backlog de produção, nos contratos e documentos de arquitetura, nas fases 3/4A, no modelo de ameaças, nos runbooks e no inventário de dados. Esses documentos foram confrontados com entrypoints, composição, contratos, runtime, policy, approvals, sessão, webhook, persistência, RAG, modelos, observabilidade, interface e configurações de teste/build.

**Inventário completo não significa revisão semântica de cada linha dos 55 MB.** Logs repetidos e pacotes históricos foram usados como referências auxiliares. Conclusões sobre o checkout atual foram priorizadas a partir do código congelado e de execuções desta rodada. Um relatório antigo de aprovação de uma worktree não foi tratado como comprovação de integração no root.

A contagem estática, limitada a arquivos de código/SQL em `apps`, `packages` e `legacy`, encontrou **297 arquivos de implementação, com 89.236 linhas**, e **288 arquivos de testes, com 94.807 linhas**. Essa contagem exclui testes e scripts situados fora desses diretórios; por isso não deve ser confundida com os 327 arquivos executados pelo Vitest. Ver [métricas de código](evidence/AUD0590-DEEP-20260928/code-metrics.json).

### 2.2 Ambiente de verificação

Os testes foram executados em `/tmp/cvg-aud0590-20260928`, cópia isolada dos bytes do checkout, com dependências próprias, **Node 22.23.2** e PostgreSQL 16.15 descartável, identificado como `cvg-aud0590-pg`, acessível somente por loopback na porta 55590. Os testes de navegador usaram portas 3259/4199. O shell original estava em Node 24, enquanto o projeto exige Node 22; o ambiente de avaliação corrigiu essa diferença sem alterar a instalação do usuário.

Os testes usaram dados sintéticos. Não foram acessados bancos de produção, contas reais de canais, providers reais, credenciais operacionais ou dados de pacientes. A verificação de certificado também foi executada, em modo de leitura, no root original para distinguir falhas reais do candidato de artefatos ignorados pelo Git que não acompanhavam a cópia.

Houve tentativa de revisão auxiliar, bloqueada pela ferramenta antes de criar um agente. O relatório passou por autorrevisão, mas **não representa auditoria independente, pentest externo nem certificação de conformidade**. Não houve execução de toda a barra remota de CI, novo certificado de release, ensaio prolongado de carga ou restore de um ambiente operacional.

### 2.3 Rubrica congelada

| Faixa  | Interpretação                                              |
| ------ | ---------------------------------------------------------- |
| 0–19   | Ausente ou não demonstrado no escopo.                      |
| 20–39  | Desenho, preparação ou controles iniciais.                 |
| 40–59  | Implementação parcial ou lacunas críticas para o objetivo. |
| 60–74  | Funcional localmente, com limitações relevantes.           |
| 75–89  | Bem sustentado por implementação e testes no escopo.       |
| 90–100 | Completo e fortemente verificado na fronteira avaliada.    |

Cada nota combina implementação, integração e força da evidência. As notas são julgamento de maturidade, não probabilidade de segurança nem percentual de requisitos cumpridos. A confiança indica a força da observação, não a qualidade do componente.

O índice geral é a **média aritmética, com pesos iguais, das 37 dimensões**: `2.521 / 37 = 68,135…`, arredondado para **68**. O índice de prontidão é calculado separadamente sobre as treze condições do plano 0354: `390 / 13 = 30`. Um bloqueio obrigatório mantém `NO_GO`, independentemente da média. Não se presume comparabilidade direta com notas de auditorias anteriores que usaram outros critérios.

## 3. Notas por dimensão

| ID  | Dimensão                                    | Nota | Confiança  | Fundamentação principal e limite                                                                                             |
| --- | ------------------------------------------- | ---: | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 01  | Escopo, requisitos e direção do produto     |   75 | Alta       | PRD e plano distinguem plataforma e produto; piloto e decisões de integração ainda incompletos.                              |
| 02  | Validação com primeiro consumidor           |   25 | Alta       | Discovery sem consumidor, tenant, volume ou SLA definidos; piloto não demonstrado.                                           |
| 03  | Contratos públicos e neutralidade do núcleo |   90 | Alta       | Factory injeta portas; capabilities possuem fronteiras e fingerprint. Migração completa do legado permanece separada.        |
| 04  | Isolamento do legado                        |   58 | Alta       | Há pacotes em `legacy`, mas API, build e proxy ainda dependem da composição Secretary.                                       |
| 05  | Modularidade e manutenção                   |   62 | Alta       | Concentração de 5.531 linhas na API e 2.636 no runtime antigo; alterações cruzam arquivos extensos.                          |
| 06  | Tipagem e análise estática                  |   88 | Alta       | Typecheck e lint passam; TypeScript estrito. Lint ainda sem análise orientada por tipos.                                     |
| 07  | Runtime de uma etapa                        |   90 | Alta       | Budget, policy, approval, execução e parada explícita com testes atuais fortes.                                              |
| 08  | Runtime iterativo e orquestração            |   87 | Alta       | Loop limitado, decisões validadas, ciclos detectados, checkpoints e retomada; provider/carga reais não qualificados.         |
| 09  | Contexto, estado e memória de execução      |   84 | Média-alta | Proveniência e estado durável separados; estimativa de tokens aproximada e orçamento de contexto suave.                      |
| 10  | Motor de autorização e políticas            |   92 | Alta       | Negação por contexto, tenant, grant e ação; precedência determinística e cobertura crítica forte.                            |
| 11  | Aprovações e controle humano                |   92 | Alta       | Payload vinculado, consumo único, expiração, bloqueio de autoaprovação e reconciliação. Identidade produtiva ainda pendente. |
| 12  | Capabilities e fronteira de ferramentas     |   80 | Alta       | Schemas, catálogo, fingerprint e journal; política geral de destino externo ainda requer prova integrada.                    |
| 13  | Gateway de modelos e custos                 |   80 | Média-alta | Roteamento, prompts, retry, timeout, breaker e budget; classificação declarada e quota operacional exigem validação.         |
| 14  | Integrações reais ponta a ponta             |   30 | Alta       | Adapters existem; runtime controlado usa provider determinístico. Provider/canal/efeito reais não qualificados.              |
| 15  | Conhecimento institucional e RAG            |   65 | Alta       | Publicação/revogação e isolamento locais; aprovação de conteúdo, hash e autoria não comprovados no fluxo real.               |
| 16  | Conversa, handoff e retomada                |   84 | Média-alta | Estado, correções, claims e entrega separados da execução; operação humana/destino real ainda dependem do consumidor.        |
| 17  | Multitenancy e RLS                          |   88 | Alta       | RLS obrigatório no boot produtivo e papéis separados; isolamento testado com PostgreSQL. Staging não qualificado.            |
| 18  | Persistência e transações                   |   85 | Alta       | Atomicidade e limpeza de contexto da conexão verificadas; escopo de prova é descartável.                                     |
| 19  | Migrations e validação de schema            |   72 | Alta       | Migrations e concorrência passam; preflight de fencing aceita constraint incorreta.                                          |
| 20  | Outbox, idempotência e recuperação          |   85 | Média-alta | Journal, leases e recuperação testados; deduplicação/reconciliação externas continuam necessárias.                           |
| 21  | Autenticação integrada e sessão web         |   42 | Alta       | Componentes existem; entrypoint não injeta sessão durável, bootstrap sem store retorna 503 e web exige token.                |
| 22  | Webhook, replay e relógio                   |   45 | Alta       | HMAC e bloqueio imediato funcionam; replay tardio com timestamp futuro foi reproduzido.                                      |
| 23  | Borda HTTP e autorização de rotas           |   82 | Média-alta | Modo confiável, validação, limites e isolamento testados; configuração final e pentest pendentes.                            |
| 24  | Privacidade, retenção e descarte            |   45 | Alta       | Inventário útil, ainda rascunho; expiração lógica não comprova expurgo ou ciclo de backups.                                  |
| 25  | Funcionalidade do console                   |   80 | Média-alta | Build e jornadas locais passam; sessão produtiva e recarga confiável incompletas.                                            |
| 26  | Acessibilidade e navegadores                |   74 | Média-alta | Firefox 5/5, WebKit 5/5, Chromium 4/5; um timeout com tela branca bloqueou a matriz.                                         |
| 27  | Testes automatizados e regressões           |   88 | Alta       | 2.403 testes com PostgreSQL e zero skips; gate PG 258/258. Provas adicionais revelaram lacunas.                              |
| 28  | Abrangência da cobertura                    |   76 | Alta       | 92,58% de instruções e grupos críticos aprovados; interface e módulos PG importantes fora do denominador.                    |
| 29  | Certificado do candidato atual              |   30 | Alta       | Root falha por drift e inconsistência de achados/artefatos; certificado anterior não qualifica o checkout.                   |
| 30  | CI, proveniência e supply chain de release  |   55 | Média      | Workflows possuem controles e actions fixadas; sucesso remoto/atestação do candidato não demonstrados nesta rodada.          |
| 31  | Segurança das dependências                  |   45 | Alta       | `fast-uri` 3.1.6 com severidade alta e `undici` 7.29.0 moderada, sem atualização no lockfile auditado.                       |
| 32  | Observabilidade e redação de dados          |   62 | Alta       | Sinais e JSON estruturado existem; adaptador OTel aceita atributos sensíveis antes da exportação.                            |
| 33  | Backup, restore e desastre                  |   45 | Média      | Testes locais de integridade/restore; PITR e restauração operacional com RPO/RTO não demonstrados.                           |
| 34  | Desempenho, carga e capacidade              |   55 | Média      | Budgets e benchmark sintético; ausência de medição representativa com provider, banco e concorrência reais.                  |
| 35  | Deploy e configuração operacional           |   48 | Alta       | Builds passam; API produtiva ainda recebe credencial de migração e composição final não certificada.                         |
| 36  | Documentação e rastreabilidade              |   72 | Alta       | Acervo rastreável e links válidos; navegação e arquitetura inicial não refletem integralmente o estado atual.                |
| 37  | Governança e coordenação                    |   65 | Alta       | Claims e gates preservam escopo; ledgers extensos e evidências fragmentadas dificultam integração do candidato.              |

## 4. Verificações executadas

| Verificação                                      | Resultado                                                                       | Evidência                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Instalação isolada com `npm ci --ignore-scripts` | Concluída; 329 pacotes                                                          | Ambiente descrito em `baseline.json`; registro de execução no pacote.                                       |
| Preflight Node                                   | PASS, Node 22.23.2                                                              | [node-preflight.log](evidence/AUD0590-DEEP-20260928/node-preflight.log)                                     |
| `npm run typecheck`                              | PASS                                                                            | [typecheck.log](evidence/AUD0590-DEEP-20260928/typecheck.log)                                               |
| `npm run lint`                                   | PASS                                                                            | [lint.log](evidence/AUD0590-DEEP-20260928/lint.log)                                                         |
| `npm run docs:check-links`                       | PASS                                                                            | [docs-links.log](evidence/AUD0590-DEEP-20260928/docs-links.log)                                             |
| `npm run test:coverage`, com PostgreSQL          | **327 arquivos; 2.403 testes PASS; zero skips**                                 | [full-coverage-postgres.log](evidence/AUD0590-DEEP-20260928/full-coverage-postgres.log)                     |
| `npm run test:postgres`                          | **35 arquivos; 258 testes PASS**                                                | [postgres-gate.log](evidence/AUD0590-DEEP-20260928/postgres-gate.log)                                       |
| `npm run coverage:critical`                      | PASS nos seis grupos                                                            | [coverage-critical.log](evidence/AUD0590-DEEP-20260928/coverage-critical.log)                               |
| `npm run build:runtime`                          | PASS                                                                            | [build-runtime.log](evidence/AUD0590-DEEP-20260928/build-runtime.log)                                       |
| `npm run build:web`                              | PASS                                                                            | [build-web.log](evidence/AUD0590-DEEP-20260928/build-web.log)                                               |
| E2E de simulação                                 | **12/12 PASS**, Chromium                                                        | [e2e-simulation-report.json](evidence/AUD0590-DEEP-20260928/e2e-simulation-report.json)                     |
| Navegadores em sessão confiável sintética        | **14/15; FAIL**: Chromium 4/5, Firefox 5/5, WebKit 5/5                          | [browser-trusted-report.json](evidence/AUD0590-DEEP-20260928/browser-trusted-report.json)                   |
| Reteste focal do caso que falhou em Chromium     | **1/1 PASS**, diagnóstico; não substitui a matriz completa                      | [browser-targeted-recheck-report.json](evidence/AUD0590-DEEP-20260928/browser-targeted-recheck-report.json) |
| Consulta atual `npm audit --json`                | **FAIL**: dois pacotes afetados, um alto e um moderado                          | [dependency-audit.log](evidence/AUD0590-DEEP-20260928/dependency-audit.log)                                 |
| Certificado presente no root                     | **FAIL** por drift e artefatos incoerentes                                      | [certification-live-root.log](evidence/AUD0590-DEEP-20260928/certification-live-root.log)                   |
| Governança de skips                              | **FAIL** por hash de fonte desatualizado                                        | [skip-governance.log](evidence/AUD0590-DEEP-20260928/skip-governance.log)                                   |
| Quatro verificações focadas de auditoria         | Reprodução de replay, sessão indisponível, atributos OTel e preflight incorreto | [probes.json](evidence/AUD0590-DEEP-20260928/probes.json)                                                   |

Os 258 testes PostgreSQL se sobrepõem à suíte geral: **não somar 2.403 + 258 como testes únicos**. O relatório de navegador confiável desta rodada é diagnóstico local, com `candidateId: null`; não é um certificado de candidato. A ausência de violações no axe aplica-se às verificações concluídas e não converte o teste interrompido em aprovação.

### Cobertura e denominador

O JSON nativo do V8 registra **92,58% de instruções**, **93,60% de linhas**, **95,13% de funções** e **87,71% de ramificações**. O agregador do gate crítico arredonda funções/ramificações para 95,14%/87,72%; ambos os arquivos foram preservados. Aqui se usam os valores nativos, evitando misturar métodos de arredondamento.

As ramificações dos grupos críticos ficaram em: kernel 95,82%; approval 98,59%; policy 99,07%; journal 97,76%; canal 95,07%; RLS 95,93%. Esses indicadores são positivos, mas o [vitest.config.mts](../../vitest.config.mts) exclui todo `apps/web/src/**`, entrypoints e diferentes implementações PostgreSQL da cobertura global. Testar um arquivo e medi-lo na cobertura são condições distintas.

Fonte dos números: [coverage-summary.json](evidence/AUD0590-DEEP-20260928/coverage-summary.json) e [relatório crítico](evidence/AUD0590-DEEP-20260928/coverage-critical.log).

## 5. Achados prioritários e critérios de fechamento

**Prioridades:** P0-R indica impedimento de promoção segundo a barra de release; não significa vulnerabilidade crítica explorada. P1 exige correção ou composição antes de habilitar a superfície afetada. P2 indica dívida de robustez, manutenção ou evidência. Nenhuma ocorrência abaixo comprova incidente com dados reais.

### F01 — Replay tardio de webhook com timestamp futuro — P1

**Expectativa:** um evento autenticado e já consumido deve permanecer bloqueado durante toda a janela na qual sua assinatura ainda é aceita.

**Observado:** o verificador aceita timestamp até a tolerância no futuro, mas expira a reserva em `agora + tolerância`. Com tolerância de 300 segundos e timestamp 299 segundos no futuro, a primeira chamada passa, a repetição imediata falha e a reapresentação após avanço de 301 segundos passa novamente. O atacante ainda precisaria dispor de um evento com assinatura válida; a prova não fabrica uma assinatura de terceiro.

**Evidência:** [webhook-security.ts](../../apps/api/src/webhook-security.ts), região das linhas 339–364; `futureTimestampReplay` em [probes.json](evidence/AUD0590-DEEP-20260928/probes.json). Resultado observado: `[true, false, true]`; a última aceitação deveria ser falsa.

**Impacto:** o mecanismo de replay perde o bloqueio antes do fim da validade da assinatura. Não foi demonstrado efeito externo duplicado; deduplicação posterior pode limitar consequências, mas não corrige a propriedade violada na borda.

**Fechamento:** aplicar a SPEC vigente de relógio/replay aprovada, vincular retenção à validade efetiva, validar os limites temporais e repetir os casos com store em memória, PostgreSQL, reinício e divergência de relógios. Não encerrar apenas com o caso de replay imediato.

### F02 — Preflight aceita constraint de tabela errada ou `CHECK(true)` — P1

**Expectativa:** o boot deve provar que a tabela de replay possui a restrição correta, aplicada e validada.

**Observado:** `assertWebhookReplaySchema` pesquisa nomes de constraints no namespace, sem vincular a consulta à relação correta e à definição efetiva. No banco descartável, a restrição real ausente foi rejeitada; uma restrição de mesmo nome em uma tabela-isca foi aceita. Depois, uma restrição de mesmo nome com `CHECK(true)` também foi aceita.

**Evidência:** [tenant-preflight.ts](../../apps/api/src/tenant-preflight.ts), linhas 621–694; `fencingPreflight` em [probes.json](evidence/AUD0590-DEEP-20260928/probes.json). A montagem sintética ocorreu em transação revertida; o schema de prova não permaneceu no banco.

**Impacto:** o check de prontidão pode anunciar proteção instalada em um schema incorreto ou degradado. A alteração do schema na prova exigiu privilégio DDL; **não se demonstrou escalada de privilégio de um usuário comum**.

**Fechamento:** validar `conrelid`, tipo, expressão, estado validado e propriedades relevantes de índices/colunas. Rejeitar tabela-isca, tautologia, constraint não validada e semântica divergente; validar a aplicação real da restrição com operação negativa.

### F03 — Atributos sensíveis chegam sem redação ao adaptador OTel — P1 antes de ativar exportação externa

**Expectativa:** todas as saídas de observabilidade apliquem a mesma política de minimização e redação antes da entrega ao SDK/exporter.

**Observado:** `OpenTelemetryTelemetry.startSpan`, `setAttribute` e a conversão de atributos encaminham valores diretamente ao tracer. Um marcador sintético sob as chaves `authorization` e `api_key` chegou inalterado ao tracer falso. O buffer local da prova também preservou esses marcadores; não há evidência de que ele neutralize automaticamente o risco.

**Evidência:** [otel.ts](../../packages/observability/src/otel.ts), regiões de `startSpan`, `setAttribute` e `toOtelAttributes`; `otelBoundary` em [probes.json](evidence/AUD0590-DEEP-20260928/probes.json).

**Impacto:** uma composição que injete esse adaptador poderá transmitir atributos sensíveis. O entrypoint padrão avaliado usa `CompositeTelemetry` e JSON lines; **não foi observado vazamento para um coletor externo no sistema em execução**.

**Fechamento:** sanitizar por chave e valor antes de spans, atributos posteriores, spans filhos e métricas; usar o mesmo contrato nos sinks. Testes devem inspecionar o dado recebido pelo SDK, não apenas o log ou buffer resultante.

### F04 — Sessão durável não conectada ao entrypoint principal — P1 de integração

**Expectativa:** um operador autenticado deve iniciar, recuperar por cookie, usar e encerrar uma sessão confiável entre requisições/réplicas.

**Observado:** existem stores PostgreSQL e componentes de identidade, mas `apps/api/src/main.ts` injeta resolver e telemetria, sem compor o store durável. `buildServerFromEnv` cria store temporário somente no caminho de teste/memória. A composição confiável sem store retorna **503 `configuration_error`** no bootstrap. A web em `auth/session.ts` exige token novo antes de consultar a sessão e não tenta primeiro a recuperação apenas pelo cookie.

**Evidência:** [main.ts](../../apps/api/src/main.ts), [server.ts](../../apps/api/src/server.ts) nas regiões 749, 4478 e 5102–5425; [session.ts](../../apps/web/src/auth/session.ts), linhas 55–70; `missingSessionStore` em [probes.json](evidence/AUD0590-DEEP-20260928/probes.json).

**Impacto:** componentes aprovados isoladamente não tornam o console operável no caminho principal de produção. O comportamento observado falha fechado, o que preserva a fronteira de autorização, mas impede o fluxo esperado.

**Fechamento:** integrar o trabalho de identidade/sessão no mesmo candidato, exercitar entrypoint real, duas instâncias, recarga por cookie, logout, revogação, expiração e indisponibilidade. A prova deve iniciar o produto pelo caminho publicado, sem injeção especial que esconda dependências ausentes.

### F05 — Dependência produtiva com advisory alto; dependência de teste moderada — P1/P2

**Observado:** `npm audit --json` encontrou **dois pacotes afetados e três advisories**. `fast-uri` 3.1.6 aparece na árvore produtiva de Fastify/AJV, com dois advisories de severidade alta. `undici` 7.29.0 vem de `jsdom` na árvore de desenvolvimento e tem um advisory moderado.

As referências oficiais são `GHSA-qw65-cvwx-89v3` e `GHSA-58mr-gqgx-xq4g`, que incluem correção na linha 3.1.7 de `fast-uri`; e `GHSA-3wwx-pv8p-q78v`, corrigido na linha 7.29.1 de `undici`. A consulta foi feita nesta rodada. Um relatório histórico com zero alertas não substitui essa consulta atual.

**Evidência local:** [dependency-audit.log](evidence/AUD0590-DEEP-20260928/dependency-audit.log); versões e caminhos confirmados por `npm ls fast-uri undici --all`. **Fontes primárias:** [advisory de serialização](https://github.com/advisories/GHSA-qw65-cvwx-89v3), [advisory de autoridade URI](https://github.com/advisories/GHSA-58mr-gqgx-xq4g), [advisory Undici](https://github.com/advisories/GHSA-3wwx-pv8p-q78v).

**Impacto e limite:** a instalação afetada foi confirmada; a exploração dos vetores dentro deste produto não foi demonstrada. O alerta de `undici` nesse caminho não autoriza inferir que o `fetch` embutido do Node seja a mesma dependência.

**Fechamento:** atualizar a resolução sob claim próprio de lockfile, preservar compatibilidade, repetir auditoria e regressões de validação/URI. Tratar `fast-uri` como P1 de supply chain e o caminho de teste `undici` como P2, salvo evidência de exposição adicional.

### F06 — Certificado presente não qualifica o checkout — P0-R

**Observado no root original:** verificador com exit 1 por `CANDIDATE_DRIFT`, achados desatualizados, identificação incompatível da closure, métricas de cobertura divergentes, prova E2E ausente/inválida e hashes de artefatos incompatíveis. O certificado registra candidato `b41f1e2e…`; os arquivos atuais resultam em `8a0b52f1…`.

**Evidência:** [certification-live-root.log](evidence/AUD0590-DEEP-20260928/certification-live-root.log). O resultado do snapshot também foi preservado, mas suas ausências adicionais de arquivos ignorados pelo Git **não** foram usadas para acusar o root de ausência desses mesmos arquivos.

**Impacto:** não existe evidência de aprovação que cubra conjuntamente os bytes atuais, os achados encerrados e os resultados publicados. O verificador rejeitar a divergência é comportamento correto; a falha está na prontidão do candidato e na integração das evidências.

**Fechamento:** concluir uma baseline integrada, executar a barra aplicável no mesmo candidato, produzir relatórios e closures vinculados, verificar novamente e obter autorização explícita do escopo. Preservar proveniência externa quando exigida, além de hashes locais. Esta auditoria não emitiu novo certificado nem aprovou release.

### F07 — Gate confiável de navegador falhou com tela branca — P1 de qualificação

**Observado:** na matriz de três motores, o teste de teclado/foco/contraste/responsividade em Chromium não encontrou o heading esperado ao abrir o console. O timeout ocorreu em `openTrustedConsole`, linha 77, antes de concluir os checks seguintes. A captura visual mostrou tela branca. Firefox e WebKit passaram cinco testes cada.

**Evidência:** [resultado consolidado](evidence/AUD0590-DEEP-20260928/browser-trusted-report.json), [relatório bruto](evidence/AUD0590-DEEP-20260928/browser-trusted-raw.json), [captura da falha](evidence/AUD0590-DEEP-20260928/browser-failure-test-failed-1.png) e [teste](../../tests/e2e/rem21-014-qualification.spec.ts).

**Interpretação:** o sintoma foi observado na execução registrada, mas o reteste focal do mesmo caso passou **1/1**, sem alterações no código, em 5,07 segundos de comando. Há evidência de instabilidade, sem causa raiz estabelecida. Não se deve classificá-lo automaticamente como defeito de contraste ou autorização. Um teste que não chegou à tela não comprova acessibilidade dessa tela.

**Fechamento:** identificar a causa de montagem/carregamento, corrigir ou estabilizar o cenário e repetir a matriz completa sem skips ou retries que escondam a primeira falha. O reteste focal fica registrado no pacote como diagnóstico e não substitui o resultado agregado de 14/15.

### F08 — Catálogo de skips desatualizado — P2, bloqueante para a barra que o exige

**Observado:** o verificador reporta `skip_catalog_source_drift` em `apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts`.

**Evidência:** [skip-governance.log](evidence/AUD0590-DEEP-20260928/skip-governance.log). A suíte completa desta rodada executou todos os 2.403 testes; portanto este achado é sobre **rastreabilidade do catálogo**, e não sobre testes PostgreSQL omitidos nesta execução.

**Fechamento:** atualizar o registro a partir da fonte integrada, preservar a justificativa de cada skip permitido e revalidar o catálogo. Não remover o controle para tornar a barra verde.

### F09 — Cobertura alta com exclusões estruturais — P2

**Observado:** todo o frontend e várias implementações PostgreSQL/entrypoints estão excluídos do cálculo global. A cobertura crítica usa um manifesto selecionado de seis grupos.

**Impacto:** os percentuais podem ser interpretados indevidamente como cobertura de todo o sistema. As falhas adicionais de replay, preflight e OTel mostram que 2.403 testes verdes não esgotam os invariantes de segurança.

**Evidência:** [vitest.config.mts](../../vitest.config.mts), [coverage-summary.json](evidence/AUD0590-DEEP-20260928/coverage-summary.json), [critical-coverage.log](evidence/AUD0590-DEEP-20260928/coverage-critical.log).

**Fechamento:** publicar denominadores por camada; incorporar cobertura de banco e interface conforme viável; priorizar testes negativos sobre invariantes, sem inflar contagem com testes que apenas repetem a implementação.

### F10 — Credencial de migração permanece na composição de serviço — P1 antes da operação real

**Observado:** no modo produtivo com RLS, `buildServerFromEnv` exige `DATABASE_MIGRATION_URL`, cria pool de migração e permite auto-migrate quando configurado. Os papéis são distintos e existem checks de privilégio; isso é melhor que usar uma única role poderosa, mas a credencial DDL continua disponível ao processo que atende requisições.

**Evidência:** [server.ts](../../apps/api/src/server.ts), regiões 5245–5355. Este achado não diz que RLS esteja ausente: o root atual exige explicitamente sua ativação em produção.

**Fechamento:** integrar a separação operacional de migração e serving prevista no programa; iniciar a API com apenas credenciais de runtime, provar recusa de DDL pela role de serviço e documentar atualização/rollback por job controlado.

### F11 — Documentação vigente mistura estados de evolução — P2

**Observado:** os documentos introdutórios em `docs/architecture` descrevem a fundação single-pass, enquanto `createOperationalHarness` já oferece composição iterativa, step store e capabilities. As fases 3/4A explicam o caminho atual, mas não substituem de forma inequívoca toda a navegação inicial. O índice de auditorias e os ledgers também acumulam estados de candidatos e worktrees distintos.

**Evidência:** [API pública documentada](../architecture/PUBLIC_API.md), [mapa atual versus alvo](../architecture/CURRENT_VS_TARGET.md), [factory real](../../packages/harness/src/createOperationalHarness.ts), [arquitetura V2](../phase3/RUNTIME_V2_ARCHITECTURE.md), [arquitetura de conversa](../phase4a/CONVERSATIONAL_INTELLIGENCE_ARCHITECTURE.md).

**Impacto:** um novo consumidor pode integrar pelo retrato antigo ou concluir que um componente aprovado em isolamento está publicado no root. Os documentos de fase são válidos como históricos; o problema é sua posição como guia atual sem status de substituição suficientemente claro.

**Fechamento:** criar uma entrada canônica de arquitetura vigente, com versão e commit; marcar textos superados; separar estado integrado, branch de implementação e decisão pendente; rotacionar ledgers preservando links históricos.

### F12 — Separação do legado e manutenção incompletas — P2

**Observado:** `server.ts` ainda registra rotas Secretary e mistura composição com centenas de responsabilidades de API. `build-runtime.mjs` ainda inclui pacotes legados. O proxy web mantém upstream `secretary-api`. Existem extrações e diretório `legacy`, mas não isolamento integral do produto anterior.

**Evidência:** [server.ts](../../apps/api/src/server.ts), [build-runtime.mjs](../../scripts/build-runtime.mjs), [nginx.web.conf](../../deploy/nginx.web.conf), [métricas](evidence/AUD0590-DEEP-20260928/code-metrics.json).

**Impacto:** maior superfície de regressão, dificuldade de testar composição neutra e ambiguidade na implantação. Contagem de linhas e nome de upstream, isoladamente, não demonstram vulnerabilidade.

**Fechamento:** concluir as fatias PR-L com contratos neutros, mover composição de produto à sua fronteira e medir regressões nos fluxos de referência. Extrair módulos por responsabilidade e efeito, não apenas dividir arquivos grandes em partes arbitrárias.

### F13 — Conhecimento e integrações ainda são capacidades controladas — P1 antes de ativação real

**Observado:** o provider publicado de plataforma permanece `fake/deterministic-v1`. O catálogo RAG local tem tenant, versão e estado de publicação, mas não registra hash de conteúdo e identidade de aprovação no mesmo contrato. O gateway de modelos aplica classificação declarada; ela não equivale a minimização automática de texto livre. A entrega externa exige contrato de deduplicação no destino.

**Evidência:** [model-provider.ts](../../packages/platform/src/model-provider.ts), [institutional-rag.ts](../../packages/rag/src/institutional-rag.ts), [router.ts](../../packages/model-gateway/src/router.ts), [matriz de falhas de conversa](../phase4a/CRASH_MATRIX.md), [modelo de ameaças](../10_phase10/PHASE10_THREAT_MODEL.md).

**Fechamento:** definir provider, canal, aprovador de conhecimento e consumidor; vincular conteúdo, versão, validade e aprovação; testar revogação, ausência de fonte, prompt injection, minimização, limites e reconciliação em staging. Manter respostas sem fonte e efeitos incertos dentro das regras de handoff/approval.

### F14 — Ciclo de vida dos dados ainda não exercitado operacionalmente — P1 antes de dados reais

**Observado:** o inventário técnico está em `DRAFT_TECHNICAL / DPO_REVIEW_PENDING`. Existem prazos e estados de expiração, mas isso não comprova remoção física, purge de autenticação, tratamento de backups ou fluxo operacional de direitos. A própria documentação identifica essas pendências.

**Evidência:** [inventário de dados pessoais](../platform/09-personal-data-inventory.md), [modelo de RIPD](../platform/10-ripd-template.md), [plano executivo](../03_build/0354_production_executive_plan_2026-09-26.md).

**Fechamento:** responsáveis aprovam finalidade e retenção por categoria; implementar descarte verificável, exceções de preservação e propagação aos destinos; testar eliminação e recuperação com dados fictícios. Esta é uma constatação de engenharia e governança, não um parecer jurídico de conformidade.

### F15 — Operação, recuperação e validação de produto incompletas — P0-R

**Observado:** há testes de restauração/integridade e runbooks locais, mas esta rodada não demonstrou PITR operacional, RPO/RTO exercitados, alerta com dono, on-call, pentest externo nem piloto de consumidor. O benchmark de fase 3 mede overhead em memória com decisões programadas e zero chamadas de modelo.

**Evidência:** [performance baseline](../phase3/PERFORMANCE_BASELINE.md), [runbook de observabilidade](../runbooks/homolog-observability.md), [discovery do consumidor](../00_discovery/0019_platform_first_consumer_pilot.md), [condições de produção](../03_build/0354_production_executive_plan_2026-09-26.md).

**Impacto:** ainda não há demonstração de que o conjunto opere sob volume, falhas, horários e dependências representativos de um usuário real. Não se deve converter latências de overhead sem modelo em promessa de tempo de resposta do agente.

**Fechamento:** escolher consumidor e critérios de sucesso, definir capacidade/SLOs, implantar staging limitado, exercitar incidente/restore/pausa, realizar avaliação externa e executar piloto com critérios de saída. Registrar autorização vinculada ao digest somente após os gates obrigatórios.

## 6. Qualidades comprovadas que devem ser preservadas

### Núcleo governado e separação de responsabilidades

A [factory pública](../../packages/harness/src/createOperationalHarness.ts) oferece um ponto de composição com portas explícitas. O worker reclama trabalho durável; o runtime conduz a execução; o orquestrador propõe a próxima etapa; policy e approval decidem a autorização; o journal registra o efeito. Uma decisão do modelo não fornece, por si, autorização de ferramenta.

O [runtime iterativo](../../packages/harness/src/iterative-runtime.ts) já possui trajetória, checkpoints, retomada e controle de orçamento. A [avaliação de conclusão](../../packages/harness/src/completion.ts) exige evidência de efeito confirmado para sustentar uma declaração de ação concluída. Uma leitura bem-sucedida não deve ser confundida com uma escrita concluída.

### Política e aprovação com força de evidência acima da média do projeto

O [motor de policy](../../packages/policy-engine/src/engine.ts) valida contexto, tenant, recurso, grant e correspondência entre ação e capability. O [motor de approval](../../packages/approval-engine/src/engine.ts) possui vínculo de payload, consumo único, expiração e estados de execução incerta/reconciliação. Esses componentes tiveram cobertura crítica elevada e testes reais nesta rodada.

Os problemas de sessão e integração precisam ser resolvidos preservando essas propriedades. Contornar o store ausente com identidade de simulação no caminho produtivo eliminaria uma proteção atualmente correta.

### Persistência e recuperação com testes reais de banco

Os testes com PostgreSQL exercitaram migrations, isolamento, aprovações, efeitos, outbox e reinício de composições. A [camada tenant-scoped](../../packages/persistence/src/tenant-scoped-postgres.ts) define contexto por conexão, limpa esse estado ao devolver a conexão e descarta conexões quando a limpeza falha. Algumas operações usam contexto de sessão, e não `SET LOCAL` em toda consulta; por isso a correção da limpeza é relevante.

A [matriz de crashes de conversa](../phase4a/CRASH_MATRIX.md) distingue execução de entrega. O desenho não deve prometer exactly-once para um serviço externo sem deduplicação no destino. Registrar incerteza e reconciliar é uma propriedade importante a manter.

### Evidências e testes permitem corrigir com precisão

TypeScript estrito, testes de fronteira e relatórios por hash oferecem uma base útil para evolução. O verificador de certificado recusar os bytes atuais também é um controle positivo. O problema é obter um candidato integrado que satisfaça o controle, não enfraquecer o controle para aceitar artefatos antigos.

## 7. Prontidão para produção: treze condições obrigatórias

As condições abaixo vêm do [plano executivo 0354](../03_build/0354_production_executive_plan_2026-09-26.md). A nota indica maturidade da evidência relacionada a cada condição; **não significa cumprimento parcial que autorize liberação**. Todas precisam ser satisfeitas para o mesmo digest e configuração.

| Condição                                               | Nota | Estado observado                                                |
| ------------------------------------------------------ | ---: | --------------------------------------------------------------- |
| G01 — Legado isolado e guarda de regressão             |   55 | Isolamento parcial; dependências de produto ainda presentes.    |
| G02 — Capacidades produtivas definidas e rastreadas    |   60 | Direção definida; consumidor e integrações ainda incompletos.   |
| G03 — Zero P0/P1 abertos                               |   10 | Achados e bloqueios permanecem abertos.                         |
| G04 — CI completo, sem skips, certificado reproduzível |   30 | Testes locais fortes; certificado e matriz de navegador falham. |
| G05 — IdP/MFA e RBAC por tenant                        |   40 | Componentes e provas locais; composição principal incompleta.   |
| G06 — Cofre e rotação de segredos exercitada           |   20 | Não demonstrado no ambiente-alvo.                               |
| G07 — RLS obrigatório e papéis separados               |   80 | Forte prova local; ambiente produtivo não qualificado.          |
| G08 — Inventário, retenção e direitos operacionais     |   30 | Inventário rascunho; execução do ciclo de vida pendente.        |
| G09 — PITR e restore em staging com RPO/RTO            |   30 | Prova operacional pendente.                                     |
| G10 — Telemetria, SLOs, alertas e on-call com donos    |   35 | Instrumentação local; operação integrada pendente.              |
| G11 — Pentest externo sem crítico/alto aberto          |    0 | Evidência não demonstrada.                                      |
| G12 — Piloto do primeiro consumidor concluído          |    0 | Ainda sem consumidor definido/documentado.                      |
| G13 — Autorização humana do candidato e escopo         |    0 | Não registrada para este candidato.                             |

**Média: 30/100. Veredito: NO_GO.** Notas zero nas três últimas condições significam ausência da evidência necessária para esses gates, não ausência de valor técnico no projeto.

## 8. Plano de correção priorizado

| Ordem | Trabalho                                                             | Responsável sugerido                        | Critério objetivo de saída                                                                           |
| ----- | -------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1     | Integrar uma baseline única, preservando claims e correções isoladas | Responsável técnico + donos das frentes     | Candidato identificável, alterações revisadas e fontes/artefatos consistentes.                       |
| 2     | Corrigir replay temporal e preflight de schema                       | Backend/segurança                           | Provas F01/F02 passam como regressões negativas, incluindo PostgreSQL e relógio/falhas.              |
| 3     | Redigir atributos antes do SDK OTel e atualizar dependências         | Observabilidade + supply chain              | Marcadores sintéticos não chegam aos sinks; alertas aplicáveis resolvidos e regressão verde.         |
| 4     | Conectar identidade, sessão durável e migração separada              | Identidade + plataforma                     | Entry point real opera entre réplicas; reload/logout/expiração testados; serving sem credencial DDL. |
| 5     | Resolver falha de navegador, catálogo de skips e certificação        | Frontend + qualidade/release                | Matriz completa passa; catálogo atualizado; certificado verificável do mesmo candidato.              |
| 6     | Consolidar documentação e fronteiras do legado                       | Arquitetura + documentação                  | Guia atual único, contratos claros e fluxo neutro verificável.                                       |
| 7     | Definir consumidor e integrações, fechar ciclo de dados              | Produto + responsáveis por dados/integração | Requisitos e decisões aprovados, fonte institucional rastreável e retenção implementada.             |
| 8     | Exercitar operação, recuperar de falhas e executar piloto            | Operação + segurança + dono do consumidor   | Restore/SLO/alertas/pausa/pentest/piloto comprovados e autorização humana registrada.                |

As ordens representam dependências e redução de risco; frentes independentes podem avançar em paralelo sob claims. Este relatório não atribui prazo em semanas sem dados de capacidade e velocidade. As correções de produto devem seguir os gates já previstos, aproveitando SPECs e trabalhos existentes no [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md).

## 9. Rastreabilidade, reprodução e continuidade

O [manifesto de fontes](evidence/AUD0590-DEEP-20260928/source-manifest.json) vincula os bytes copiados. [baseline.json](evidence/AUD0590-DEEP-20260928/baseline.json) preserva branch, HEAD e alterações preexistentes. Os arquivos de comandos registram argumentos, saída, duração e exit code. O [roteiro das provas](evidence/AUD0590-DEEP-20260928/probes.mts) importa a cópia auditada e usa apenas marcadores e banco descartáveis; seus caminhos absolutos devem ser ajustados ao reproduzir em outra máquina.

A primeira tentativa da prova de webhook usou nome incorreto do header e foi rejeitada antes de autenticar. Após conferir a constante no código, o roteiro foi corrigido para `x-cvg-webhook-id`; a reprodução válida está em `probes.json`. O registro inicial foi preservado para não ocultar a correção do instrumento de auditoria.

Para reproduzir, usar os bytes do manifesto e Node 22, instalar dependências isoladas, disponibilizar PostgreSQL sintético, executar os comandos registrados e verificar seus exit codes. Nunca apontar os testes destrutivos de banco para ambiente com dados reais. Rerodar apenas o verificador contra um certificado antigo não gera nova certificação.

Os ledgers compartilhados já possuíam alterações de outros agentes. As entradas de continuidade foram preparadas em [ledger-handoff.md](evidence/AUD0590-DEEP-20260928/ledger-handoff.md), para integração coordenada sem sobrescrever trabalho concorrente. A presente auditoria registra achados e evidências; não encerra automaticamente tarefas de correção, não altera código de produto e não concede autorização de deploy.

O [registro de fechamento](evidence/AUD0590-DEEP-20260928/final-verification.json) informa o reteste focal do navegador, a estabilidade das fontes em relação ao snapshot, a validação documental e a limpeza dos recursos próprios. Os resultados do reteste devem ser lidos junto com a primeira matriz completa, preservada como `FAIL`.

Na comparação final, **952 arquivos não documentais capturados no manifesto permaneceram idênticos**, sem drift de código observado durante a auditoria. O HEAD também permaneceu `eff8e0d…`. A [comparação de fontes](evidence/AUD0590-DEEP-20260928/final-source-comparison.json) e a [autorrevisão](evidence/AUD0590-DEEP-20260928/self-review.json) registram essa verificação e os limites das conclusões.
