# AUD-0591 — Auditoria documental e do repositório — 30/09/2026

## 1. Parecer

**Maturidade técnica: 67/100. Prontidão de produção: 31/100. Parecer: NO_GO.**

O repositório tem uma fundação de execução governada consistente, testes extensos, isolamento tenant com PostgreSQL, approvals duráveis e um console que passou nos cenários sintéticos executados. A maior distância até produção está na composição publicada, na validade da certificação, na governança cognitiva e nas provas operacionais. Cobertura alta não demonstrou os invariantes de contexto, orçamento, policy e prompt examinados nesta rodada.

Reproduções locais confirmaram: contexto importante não enviado pelo HybridOrchestrator; observações ausentes na composição da resposta; duas chamadas ao modelo apesar de limite configurado de uma; uma regra ALLOW contornando exigência de approval em perfil customizado; conteúdo enviado ao provider sem vínculo com o hash do prompt aprovado; chaves sensíveis preservadas pelo sanitizador de auditoria; marcador sensível chegando à fronteira de SDK de telemetria. Todas usaram dados fictícios e dependências locais/falsas. Não houve chamada a modelo real, ação clínica, financeira, alteração de prontuário, consulta real ou demonstração de incidente produtivo.

O replay tardio anteriormente reproduzido em AUD-0590 não se repetiu: resultado atual `[true,false,false]`. O preflight semântico de replay está integrado e a suíte PostgreSQL passou. Esses avanços não encerram reconciliação, relógio durável, integração de branches, IdP/MFA, retenção, PITR e homologação externa.

Esta auditoria não concede gate de BUILD nem autorização de produção. P1 abaixo significa correção ou prova necessária antes do uso pretendido; P1-R significa bloqueador de qualificação de release. Não foi demonstrado um exploit P0 em produção.

## 2. Baseline, método e alcance da leitura

- Task: AUD-0591; trilha T1 documental/auditoria, registrada no claim de coordenação antes das escritas próprias.
- Baseline local: branch `aud0578-remediation-20260926`, HEAD `f8ccc845e6f177959bc5d40e0cec59c71e595b5b`, capturada em `2026-09-30T03:34:20.872387+00:00`. O checkout já tinha modificações e arquivos não rastreados. O objeto auditado é o **snapshot do worktree**, não somente esse commit.
- Manifesto: 5.104 arquivos capturados com SHA-256. Inventário inicial de `docs`: 4.151 arquivos, 59.606.880 bytes; 1.116 Markdown; 4.128 arquivos decodificados como texto UTF-8; 23 binários. Esses números precedem os novos artefatos desta auditoria.
- Leitura prioritária: constituição CVG, runtime state, execution log, backlog e coordenação; depois discovery, PRD, SPEC, arquitetura, build, auditorias, runtime, plataforma, runbooks e fases históricas. O inventário textual cobriu a árvore inteira, com títulos, estados e hashes. A leitura orientada a decisões cruzou os documentos com o código e provas atuais.
- Especialistas somente leitura: lane documental/produto, 189 Markdown/15.035 linhas em discovery, PRD, SPEC, arquitetura, harness-audit, refoundation e documentos raiz; lane segurança/dados/operação, 159 Markdown, com leitura integral dos conjuntos pequenos e amostragem declarada das histórias extensas. O líder fez leitura estruturada de 266 documentos adicionais ou sobrepostos. **As contagens têm sobreposição e não devem ser somadas.**
- Há 573 Markdown narrativos fora das árvores de evidence. Indexar todos os textos não equivale a revisão semântica integral de cada linha de logs históricos. Não se certifica inspeção visual de cada PNG, ZIP, GZ ou WEBM. A auditoria concentrou a revisão semântica nos contratos, estados vigentes, implementação e evidências relevantes.
- Escopo de código: 25 workspaces; 557 arquivos TS/TSX em apps/packages/legacy, dos quais 288 de teste e 269 de implementação, aproximadamente 86.140 linhas. Esse recorte não é o total do repo: scripts, SQL e testes JS externos também foram examinados quando pertinentes.
- Execução: snapshot exclusivo em `/tmp/cvg-aud0591-20260930/repo`; Node 22.23.2; PostgreSQL 16 descartável em loopback 55591; navegador em 3251/4251; apenas dados sintéticos. Container próprio removido e portas fechadas ao final.
- GitHub: consulta somente leitura a branch, Actions, proteção e alertas; nenhuma publicação. Estado remoto observado deve ser tratado como fotografia, separado do snapshot local.

As dimensões do escopo foram registradas antes das verificações. As notas são julgamento de maturidade sustentado pelas provas disponíveis. Não são percentual de requisitos atendidos, probabilidade de segurança ou certificação independente de release. Critério local demonstrado recebe nota distinta da qualificação do ambiente real.

### Correções do ambiente de auditoria

A primeira rodada de unitários foi interrompida por timeout do harness; quatro testes de finalização de CI precisavam de metadados Git ausentes na cópia. Preparou-se um índice Git isolado, sem checkout ou alteração no root, e repetiu-se a suíte completa com timeout adequado. O reteste focado passou 4/4; a rodada válida passou 2.481/2.481. Os logs iniciais permanecem como evidência de execução inválida/interrompida, não como falha definitiva do produto.

O builder de runtime usa caminhos temporários globais. Somente a cópia do script no snapshot foi adaptada para caminhos exclusivos; o patch de isolamento está preservado. Os E2E derivaram das configurações padrão, com bootstrap equivalente restrito a loopback, retries zero e store de sessão em memória da fixture. As fontes de aplicação originais não foram corrigidas. Portanto build/E2E comprovam esse recorte local, não uma imagem implantada, um IdP corporativo, sessão durável do ambiente alvo ou release assinado.

## 3. Critério das notas

| Nota de referência | Interpretação                                          |
| ------------------ | ------------------------------------------------------ |
| 0                  | Ausência de prova pertinente ou capacidade ausente     |
| 25                 | Plano, intenção ou artefato preliminar                 |
| 50                 | Implementação parcial ou lacuna material               |
| 75                 | Funcionamento demonstrado localmente, com limites      |
| 90                 | Evidência robusta no escopo controlado                 |
| 100                | Capacidade completa e qualificada para o uso declarado |

Média técnica simples dos 42 critérios: `2.814 / 42 = 67,00`. Nenhuma nota positiva compensa um gate obrigatório de produção aberto. A auditoria AUD-0590 usou 37 dimensões; comparar diretamente sua média com esta seria metodologicamente incorreto.

### Documentação e governança

| ID  | Item analisado                         | Nota / 100 | Fundamentação                                                                                         |
| --- | -------------------------------------- | ---------: | ----------------------------------------------------------------------------------------------------- |
| C01 | Governança CVG e segurança do processo |         88 | Constituição, claims e gates T1–T4 explícitos; ledgers concorrentes e estados de revisão divergentes. |
| C02 | Discovery e delimitação de escopo      |         80 | Problema/plataforma definidos; primeiro consumidor, SLA e contexto real pendentes.                    |
| C03 | PRD e aceites de produto               |         78 | Fundação neutra implementada; requisitos históricos e alvo de plataforma coexistem.                   |
| C04 | SPEC e aderência da composição         |         70 | Contratos detalhados; partes aprovadas em branches isolados ainda não integradas.                     |
| C05 | Consistência e atualização documental  |         65 | Guia atual por SHA melhora navegação; gate 0190 cita hash antigo de 0162.                             |
| C06 | Rastreabilidade e evidências           |         82 | Manifestos, raw logs e negativos fortes; parte da evidência não pertence ao candidato atual.          |
| C07 | Preservação do histórico e honestidade |         80 | NO_GO explícito e limitações preservadas; histórico volumoso dificulta achar estado vigente.          |

### Arquitetura e manutenção

| ID  | Item analisado                            | Nota / 100 | Fundamentação                                                                                    |
| --- | ----------------------------------------- | ---------: | ------------------------------------------------------------------------------------------------ |
| C08 | Separação runtime, orchestrator e produto |         85 | Portas e autoridade separadas no núcleo; configuração decide composição ativa.                   |
| C09 | Neutralidade e isolamento do legado       |         70 | Núcleo neutro; API/web/build/proxy ainda referenciam Secretary.                                  |
| C10 | Modularidade e manutenção                 |         62 | server.ts 5.531 linhas, runtime antigo 2.636 e hotspots frontend; acoplamento concentrado.       |
| C11 | Contratos públicos e compatibilidade      |         72 | Factory e contratos tipados; PUBLIC_API descreve recorte antigo e approval.execution é opcional. |
| C12 | Configuração e construção reproduzível    |         64 | Node22 pinado e guards; shell inicia em Node24, bootstrap produtivo/composição pendentes.        |

### Runtime e governança cognitiva

| ID  | Item analisado                             | Nota / 100 | Fundamentação                                                                                          |
| --- | ------------------------------------------ | ---------: | ------------------------------------------------------------------------------------------------------ |
| C13 | Execução durável, leases e checkpoints     |         90 | PG, reinício e fencing cobertos; resultados sintéticos não certificam destino externo.                 |
| C14 | Orquestração e limites de consumo          |         58 | Loop com budgets; repair interno fez duas chamadas apesar de maxModelCalls=1.                          |
| C15 | Engenharia e transporte de contexto        |         42 | Context engine existe; objective/instructions/contextItems ausentes no request do HybridOrchestrator.  |
| C16 | Resposta fundamentada e uso de evidências  |         45 | composeResponse omite observações; claimExtractor opcional permite validação sem claims.               |
| C17 | Approval, pausa, retomada e efeito incerto |         85 | Bindings/consumo/reconciliação robustos no caminho durável; contrato compatível pode omitir lifecycle. |
| C18 | Policy e piso de segurança reutilizável    |         55 | Regra ALLOW de profile customizado mudou HIGH_RISK_WRITE de REQUIRE_APPROVAL para ALLOW.               |

### Segurança

| ID  | Item analisado                                     | Nota / 100 | Fundamentação                                                                                     |
| --- | -------------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------------- |
| C19 | Borda HTTP, origem, input e SSRF                   |         86 | Validação, CORS e hardening testados; alertas regex ativos exigem adjudicação.                    |
| C20 | Sessão, OIDC/MFA e composição publicada            |         50 | Sessão sintética e stores presentes; entrypoint corporativo durável não qualificado.              |
| C21 | RBAC e isolamento de autoridade                    |         88 | Negativos de sessão/tenant e permissões; não extrapolar fixtures para IAM corporativo.            |
| C22 | HMAC, replay e relógio                             |         75 | Retenção tardia corrigida/reproduzida; high-water/reconciliador e integração final pendentes.     |
| C23 | Isolamento tenant e RLS                            |         90 | PG ativo com negativos e roles; ambiente operacional alvo não demonstrado.                        |
| C24 | Segredos, cofre e rotação                          |         50 | Referências/guards e scan CI presentes; cofre e rotação operacional sem prova atual.              |
| C25 | Dependências e segurança da cadeia de fornecimento |         40 | npm audit três pacotes high; fast-uri no audit produtivo; 15 CodeQL high remotos não adjudicados. |

### Dados

| ID  | Item analisado                               | Nota / 100 | Fundamentação                                                                            |
| --- | -------------------------------------------- | ---------: | ---------------------------------------------------------------------------------------- |
| C26 | Schema, migrations e preflights              |         88 | F02 semantic preflight integrado e negativos PG; outras checagens têm limites.           |
| C27 | Atomicidade e integridade transacional       |         90 | Outbox, approval e tenant bindings exercitados com PG; efeito externo incerto separado.  |
| C28 | Recuperação de execução e concorrência       |         85 | SIGKILL/restart/leases em cenário sintético; exatamente uma vez externo não demonstrado. |
| C29 | Retenção, eliminação e direitos operacionais |         30 | Inventário e pacote DP01–06 existem; decisões/purge/backups não executados.              |

### Qualidade e release

| ID  | Item analisado                                      | Nota / 100 | Fundamentação                                                                              |
| --- | --------------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------ |
| C30 | Suíte automatizada e integração PostgreSQL          |         95 | 2.481 testes e 328 arquivos PASS sem skips; negativos novos expõem lacunas semânticas.     |
| C31 | Cobertura e denominador                             |         85 | Pisos globais/críticos; web, entrypoints e parte dos adapters PG excluídos do denominador. |
| C32 | Governança de skips e dependências entre workspaces |         40 | Três hashes drift; 11 findings TEST_ONLY; baseline do auditor STALE.                       |
| C33 | Certificação e vínculo ao candidato                 |         30 | Root verifier FAIL CANDIDATE_DRIFT e evidências/closures incoerentes.                      |
| C34 | CI remoto, atestação e proteção de branch           |         40 | Verify verde histórico em outro SHA; main sem proteção; Security scheduled FAIL.           |

### Console e experiência operacional

| ID  | Item analisado                            | Nota / 100 | Fundamentação                                                                                     |
| --- | ----------------------------------------- | ---------: | ------------------------------------------------------------------------------------------------- |
| C35 | Fluxos, estados de erro e responsividade  |         86 | Simulação12/12 e trusted15/15; fluxos incluem domínio legado e bootstrap sintético.               |
| C36 | Acessibilidade e teclado                  |         90 | Axe, foco, reduced motion e 375/768/1440 verificados em três browsers; sem leitor de tela humano. |
| C37 | Login e continuidade da sessão no produto |         65 | Bootstrap trusted funciona em fixture; recarga cookie-only/OIDC corporativo integrado faltam.     |

### Integrações

| ID  | Item analisado                                     | Nota / 100 | Fundamentação                                                                                                   |
| --- | -------------------------------------------------- | ---------: | --------------------------------------------------------------------------------------------------------------- |
| C38 | Providers, canais e efeitos externos               |         45 | Adapters e gateways presentes; sem homologação real autorizada/deduplicação do destino.                         |
| C39 | Conhecimento institucional e governança de prompts |         45 | Versão/approval/revogação disponíveis; hash de prompt não vincula conteúdo enviado, tenant knowledge implícito. |

### Operação

| ID  | Item analisado                                   | Nota / 100 | Fundamentação                                                                                    |
| --- | ------------------------------------------------ | ---------: | ------------------------------------------------------------------------------------------------ |
| C40 | Logs, métricas e observabilidade                 |         60 | Instrumentação/exporters locais; marcador sensível alcança 4/8 chamadas SDK falso.               |
| C41 | Performance, capacidade e SLOs                   |         55 | Budgets/benchmarks sintéticos; sem carga representativa PostgreSQL+modelo, soak/SLO medido.      |
| C42 | Backup, PITR, incidentes e prontidão operacional |         35 | Runbook atual e provas sintéticas; PITR/cofre/on-call/pentest/piloto sem qualificação integrada. |

## 4. Verificações executadas e resultados

| Verificação                                    | Resultado atual                                                     | Evidência no pacote                                     |
| ---------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| Preflight Node 22                              | PASS                                                                | preflight.log.gz                                        |
| Typecheck                                      | PASS                                                                | typecheck.log                                           |
| ESLint                                         | PASS                                                                | lint.log                                                |
| Unitários/integração com flags PG obrigatórias | 328 arquivos; 2.481 testes PASS; sem skips                          | unit-postgres.log                                       |
| Rodada de cobertura                            | PASS; 328 arquivos/2.481 testes                                     | coverage.log, coverage-summary.json                     |
| Gate PostgreSQL específico                     | 35 arquivos; 288 testes PASS; sem skips                             | postgres-gate.log                                       |
| Coverage crítico                               | PASS em todos os grupos declarados                                  | critical-coverage.log                                   |
| Build web/typecheck                            | PASS                                                                | build.log                                               |
| Build runtime                                  | PASS, caminhos temporários isolados                                 | build-runtime.log, runtime-builder-isolation.patch      |
| Worker startup/controlado                      | PASS                                                                | worker-startup.log                                      |
| Contrato CI bar                                | PASS                                                                | ci-contract.log                                         |
| Reteste CI finalizer após preparar Git isolado | 4/4 PASS                                                            | ci-finalizer-retest.log                                 |
| E2E simulação                                  | 12/12 Chromium; sem skips, retries ou flaky                         | browser-simulation-raw.json                             |
| E2E trusted                                    | 15/15: 5 Chromium, 5 Firefox, 5 WebKit; sem skips, retries ou flaky | browser-trusted-raw.json                                |
| Docs links/higiene inicial                     | PASS                                                                | docs-links.log                                          |
| npm audit completo, pelo lockfile              | FAIL: 3 pacotes HIGH                                                | npm-audit.log                                           |
| npm audit produtivo, omitindo dev              | FAIL: fast-uri HIGH                                                 | production-audit.log                                    |
| Skip governance                                | FAIL: 3 hashes de fontes divergentes                                | skip-governance.log                                     |
| Workspace boundaries                           | FAIL: 11 findings TEST_ONLY; baseline STALE                         | workspace-boundaries.log, root-workspace-boundaries.log |
| Certification verify no root                   | FAIL: 17 inconsistências reportadas                                 | root-certification-verify.log                           |
| Format check global no root                    | FAIL: 3 documentos                                                  | root-format-check.log                                   |

Os 288 testes PostgreSQL são uma rodada específica sobre testes já incluídos na suíte completa, não 288 testes únicos adicionais. Tampouco se somam os testes repetidos na cobertura ou no reteste focado. A execução E2E de uma matriz não satisfaz, por si só, exigência operacional de duas rodadas no mesmo candidato ou binding de certificado.

### Cobertura com denominador explícito

| Métrica V8            | Cobertos / total | Percentual publicado |
| --------------------- | ---------------: | -------------------: |
| Instruções/statements |  14.863 / 16.055 |               92,57% |
| Ramos/branches        |  11.730 / 13.364 |               87,77% |
| Funções               |    2.823 / 2.968 |               95,11% |
| Linhas                |  14.126 / 15.090 |               93,61% |

O relatório crítico arredonda statements para 92,58%; o JSON V8 publica 92,57%. São os mesmos numeradores/denominadores, sem discrepância de execução. Os pisos globais são 90% em statements/linhas/funções e 85% em branches; os grupos críticos cumpriram seus pisos configurados.

`vitest.config.mts` exclui todo `apps/web/src`, entrypoints `main.ts/main.tsx`, vários adapters PostgreSQL e repositories específicos. Esses caminhos têm testes dedicados, mas **não estão contabilizados nessa cobertura**. Não se afirma 92,57% de todo o repositório nem cobertura de 100% das rotas. O inventário regex de 38 registros de rota é apenas um índice parcial, não prova de exercício de todos os handlers. A auditoria histórica AUD-0588 também não substitui cobertura HTTP comportamental.

Os testes trusted abrangem bootstrap, autorização, tenant, estados do console, foco/teclado, reduced motion, viewports 375/768/1440 e checks axe. Alguns cenários usam interceptação/mocks de rede, além do bootstrap sintético; não representam homologação de todos os serviços. Não houve violação bloqueante nos cenários aprovados. Não se executou avaliação humana com leitor de tela nem teste de IdP/MFA corporativo.

## 5. Achados, evidência, impacto e fechamento

Cada prioridade abaixo vale para a baseline descrita. Confiança alta significa leitura de caminho e/ou reprodução local; confiança média marca risco de composição ou operação sem demonstração ponta a ponta. As soluções são propostas para backlog e gate próprio, sem BUILD nesta rodada.

### A91-01 — Dependências vulneráveis — P1 — confiança alta

O audit completo identifica `brace-expansion`, `fast-uri` e `undici` como HIGH; o audit omitindo dev mantém `fast-uri`. São três pacotes afetados, não necessariamente três CVEs únicos. Fonte: lockfile e `npm-audit.log`/`production-audit.log`. Não foi demonstrado exploit na configuração ativa.

**Impacto:** exposição potencial e gate de cadeia de fornecimento reprovado. **Fechamento:** adjudicar advisories e alcançabilidade, atualizar por claim de lockfile com autorização/gate pertinente, executar testes e audit no candidato final. Não selecionar versão segura apenas por uma advisory: consultar o conjunto vigente. Referências primárias: [fast-uri GHSA](https://github.com/advisories/GHSA-qw65-cvwx-89v3), [brace-expansion GHSA](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). Vincular a PR-010/011 e às tasks de dependências do backlog canônico.

### A91-02 — Certificação não corresponde ao candidato — P1-R — confiança alta

`npm run certification:verify` no root reporta 17 falhas, incluindo `CANDIDATE_DRIFT`, findings/closures desatualizados, métricas de cobertura incoerentes com artefatos registrados, binding de E2E ausente/inválido e hashes divergentes. O digest registrado inicia `b41f`; o atual observado inicia `b539`. O próprio verificador ainda lê decisões históricas `CONDITIONAL_GO`/`AAA_CONTROLLED`; isso não valida o candidato atual.

**Impacto:** impossível apoiar promoção no certificado herdado. **Fechamento:** congelar candidato/configuração, gerar evidências e atestação correspondentes, verificar closures e repetir o verificador. Uma nova certificação deve ter claim próprio; não foi executada nesta auditoria. Mudanças de aplicação e evidência já existiam antes da auditoria; não atribuir todo drift aos novos documentos.

### A91-03 — Contexto não chega ao modelo de decisão — P1 — confiança alta

Em `packages/orchestrator/src/hybrid-orchestrator.ts:69`, `buildDecisionPrompt` inclui goal, state, capabilities e observations, mas não transporta os campos examinados de objective, instructions e contextItems. O context engine produz material que não está ligado a esse request. A prova `cognitive-probes.json` inseriu três marcadores distintos; nenhum chegou ao modelo falso.

**Impacto:** decisões podem ignorar a configuração e conhecimento de contexto esperado. **Fechamento:** especificar a composição canônica e regras de confiança, conectar os campos minimizados, testar transporte e resistência a instruções em conteúdo não confiável. A reprodução foi direta no HybridOrchestrator; não se mostrou decisão errada de modelo real.

### A91-04 — Resposta final não recebe observações coletadas — P1 — confiança alta

`packages/harness/src/iterative-dispatch.ts:970` instrui o modelo a usar observações estruturadas, mas envia a mensagem do usuário e `run.input.context`, sem as observações acumuladas do run. A prova criou uma observação e confirmou que seu marcador estava ausente do request (`responseEvidence.observationSent=false`).

**Impacto:** respostas podem carecer de resultados de tools/RAG/efeitos que justificariam sua composição. **Fechamento:** transportar observações com proveniência e validação apropriadas; demonstrar resposta fundamentada, fonte revogada e ausência de falsa confirmação de efeito. A prova verifica omissão, não taxa de alucinação ou resposta incorreta real.

### A91-05 — Repair excede budget de chamadas — P1 — confiança alta

`packages/orchestrator/src/hybrid-orchestrator.ts:160` faz repair interno sem limitar a próxima chamada pelo uso acumulado; `packages/harness/src/iterative-runtime.ts:764` contabiliza somente após retorno. Com `maxModelCalls=1`, resposta inicial inválida e repair válido, ocorreram duas chamadas, reportadas como duas (`cognitive-probes.json`). Erro final do orchestrator também exige examinar contabilização de uso consumido antes do throw.

**Impacto:** o limite deixa de impedir consumo antes da execução; eventual stop posterior não desfaz a segunda chamada. **Fechamento:** reserva/contabilidade anterior a cada chamada e preservação do consumo em erro/timeout; negativos para repair, retries, tokens, custo e duração. Não houve cobrança real nem prova de bypass pelo worker completo.

### A91-06 — Policy ALLOW reduz piso de segurança — P1 — confiança alta

`packages/policy-engine/src/engine.ts:191` decide regra vencedora antes dos pisos em `#fromGrant`. Em perfil customizado válido, uma capacidade HIGH_RISK_WRITE com `requiresMedicalOperator=true`, operador não médico e grant allow recebeu REQUIRE_APPROVAL sem regra e ALLOW com regra válida registrada (`policy-prompt-probes.json`).

**Impacto:** a extensão por perfil pode tornar uma regra ALLOW mais forte que invariantes sensíveis anunciados pelo engine. **Fechamento:** definir pisos não redutíveis, aplicar após combinar rules/grants e testar emergência/exceções explicitamente. Não foi executada ação sensível, nem demonstrado que os perfis de referência permitem esse caminho real.

### A91-07 — Hash aprovado não vincula conteúdo enviado — P1 — confiança alta

`packages/model-gateway/src/gateway.ts:313` envia `request.input` ao provider juntamente com o hash do prompt localizado no registry. A prova aprovou conteúdo A e forneceu conteúdo B; somente B chegou ao provider determinístico, enquanto o hash reportado era de A.

**Impacto:** metadados de approval/versionamento não demonstram qual instrução de sistema foi executada. **Fechamento:** definir renderização canônica do prompt aprovado e a separação dos dados dinâmicos do usuário; registrar digest do material renderizado, validar referências e revogação. Não se exige que toda mensagem dinâmica tenha hash igual ao template; a lacuna é o vínculo do conteúdo governado. Não houve provider externo nem alteração não autorizada real.

### A91-08 — Redação de auditoria deixa chaves de segredo passar — P1 — confiança alta

`packages/shared/src/audit-governance.ts:45` usa listas de chaves/fragmentos que não cobrem os casos examinados. `sanitizeAuditEvidencePayload` preservou `api_key`, `credential`, `privatekey` e `nested.api_key`; removeu authorization. A persistência de auditoria chama esse sanitizador em `packages/persistence/src/postgres-audit.ts:90`.

**Impacto:** metadados com essas chaves podem alcançar o sink sem redação. **Fechamento:** preferir allowlist de payloads operacionais, normalizar nomes e testar valores opacos/aninhados antes de escrita e export. O marcador era fictício; a prova não escreveu em banco nem demonstrou vazamento de segredo real.

### A91-09 — Telemetria exporta marcador antes da redação — P1 — confiança alta

Reexecução da prova F03 contra o SDK falso registrou marcador sensível em 4 de 8 chamadas à fronteira SDK: startSpan inicial, setAttribute, startSpan filho e counter.add. Dois spans locais e métrica local também retiveram o marcador (`otel-probe.json`).

**Impacto:** a existência de sanitização posterior/local não garante proteção na fronteira de exportação. **Fechamento:** fechar SPEC 0163/gate aplicável e garantir redação antes de toda chamada SDK/sink, com negativos reais de adapters controlados. Não houve exportação a backend externo; F03 permanece aberto no recorte demonstrado.

### A91-10 — Entrypoint trusted sem sessão corporativa durável demonstrada — P1-R — confiança alta

`apps/api/src/main.ts:18` injeta identity resolver e telemetry; não compõe explicitamente store durável/OIDC. O store habilita o hook/bootstrap de sessão; rotas OIDC start/callback não estão registradas na composição auditada. Construção trusted sem store retorna 503 em `/v1/session`, sem rotas start/callback (`boundary-probes.json`). A composição automática em memória está restrita à fixture test-only em `server.ts:5184`.

**Impacto:** o comportamento fail-closed é correto, mas o fluxo corporativo publicado está incompleto/não qualificado. **Fechamento:** composição explícita de store durável e authority corporativa, bootstrap HTTPS, MFA e cookies por ambiente, com prova no entrypoint e candidato publicados. A prova usou buildServer diretamente, não implantou main/IdP real. Relacionar PR-301/302, SPEC 0150/0152 e trabalho isolado de sessão; não fechar com o E2E em memória.

### A91-11 — Replay, processamento e commit têm janela incerta — P1 — confiança média

No caminho root de webhook, ingresso em `apps/api/src/server.ts:1458` e commit de replay em `server.ts:1583` não são uma única transação; erro pode liberar reserva no caminho `server.ts:1605`. High-water do store em memória, em `webhook-security.ts:167`, é local ao processo; não se atribui esse mecanismo ao store PostgreSQL. Há propostas/builds isolados de inbox/fencing/reconciliador, ainda separados da composição auditada.

**Impacto:** crash após início de efeito e antes do commit pode deixar resultado incerto e reentrada. **Fechamento:** integrar a fatia aprovada de inbox durável, fencing e reconciliação; aprovar relógio durável sob SPEC 0162; testar crash/restore/skew/concorrência. Não foi reproduzido efeito externo duplicado; não reabrir o defeito específico de retenção tardia já corrigido.

### A91-12 — Substituição de sessão não usa operação atômica existente — P1 — confiança média

`apps/api/src/server.ts:807` cria sessão e `:825` revoga a antiga; compensação existe para erro capturado. O store PostgreSQL dispõe de operação de substituição, mas a composição examinada não a usa nesse caminho. Crash entre create e revoke é distinto de erro capturado.

**Impacto:** duas sessões podem permanecer válidas após interrupção nessa janela. **Fechamento:** ligar replace atômico ou demonstrar protocolo equivalente, com SIGKILL entre fases, revalidação e teste de cookie antigo. Achado estático de composição; não foi medido crash nesse fluxo nesta rodada.

### A91-13 — Contrato opcional de lifecycle de approval — P1 condicional — confiança alta

`packages/contracts/src/contracts.ts:332` permite `approvals.execution` ausente; `iterative-dispatch.ts:506` chama begin apenas se a porta existir. Isso sustenta compatibilidade, mas não torna lifecycle/journal obrigatório em toda composição sensível.

**Impacto:** consumidor novo pode passar pelos contratos sem a garantia durável esperada. **Fechamento:** diferenciar composição sintética/compatível de produtiva, validar portas obrigatórias e falhar fechado para efeito sensível. O worker auditado usa adapter durável; não se afirma que seu caminho corrente omite journal.

### A91-14 — Grounding e tenant dependem de composição implícita — P1 condicional — confiança alta

`packages/harness/src/iterative-runtime.ts:1011` retorna validação positiva se não houver claimExtractor. A validação padrão de referências não prova verdade semântica. `KnowledgeSearchRequest` em `packages/contracts/src/execution-v2.ts:654` não exige tenant; um adapter pode estar previamente vinculado, mas isso não está imposto pelo contrato.

**Impacto:** antes de ativar RAG institucional ou adapter compartilhado, o consumidor precisa provar fonte aprovada, binding tenant e rejeição de claim sem apoio. **Fechamento:** especificar contratos obrigatórios por profile e negar a composição não qualificada. Não foi provada resposta clínica sem fonte nem leitura entre tenants. A opcionalidade pode ser válida para agentes sem conhecimento institucional.

### A91-15 — Credencial de migration participa do serving — P1-R — confiança alta

`apps/api/src/server.ts:5267` constrói migrationPool no processo de aplicação; caminhos seguintes usam a credencial para preflight/migrations. As roles são separadas e guardadas. A credencial de migration participa do boot e permanece no processo; executar migrations é opt-in, condicionado a `POSTGRES_AUTO_MIGRATE=true` em `server.ts:5319`.

**Impacto:** maior privilégio e responsabilidade no processo exposto, com separação operacional incompleta. **Fechamento:** job de migration/preflight governado, credenciais e roles com donos, serving de mínimo privilégio e negativos no ambiente alvo. Não houve uso indevido de credencial real.

### A91-16 — Retenção declarada não equivale a purge — P1-R — confiança alta

O pacote DP-01 a DP-06 e a SPEC 0149 documentam decisões de retenção/eliminação. Expiração impede acesso, mas não elimina todas as cópias; decisões de controlador/DPO, implementação e política para backup/restore permanecem pendentes no recorte.

**Impacto:** não há prova suficiente de ciclo de vida de dados reais. **Fechamento:** aprovar durações/classes, implementar purge sob gate, testar direitos e reexpurgo após restore. Esta é avaliação de prontidão baseada nos contratos do próprio repo, não parecer jurídico ou certificação de conformidade.

### A91-17 — Restore sintético não qualifica PITR — P1-R — confiança alta

`packages/persistence/src/restore.ts` e o script de restore trabalham com snapshot em memória. `docs/runbooks/staging-incident-response.md` explicita a falta do procedimento de infraestrutura, RPO/RTO aprovados, on-call e drill integrado.

**Impacto:** recuperação de banco/ambiente real não demonstrada. **Fechamento:** procedimento de backup/WAL/PITR em infraestrutura descartável equivalente ao alvo, recuperação cronometrada, validação tenant/outbox/sessão/retention e aprovação dos objetivos. O runbook atualizado melhora a orientação, mas não encerra F15/PR-406/605.

### A91-18 — CI remoto e proteção não qualificam este worktree — P1-R — confiança alta

Consulta read-only: main remoto `02f586b221fc6582f23385c1736cce8e10438ea6`; Verify e Security de PR verdes em `8ee6fa272072efe05fd63b7d708ba9b077280149`, SHA distinto da baseline local; Security scheduled de 28/09 falhou. A API de proteção retornou 404 `Branch not protected`; a consulta de rulesets do repositório retornou lista vazia (HTTP 200). Foram encontrados 15 alertas CodeQL HIGH abertos: 8 caminhos ativos e 7 cópias históricas.

**Impacto:** checks antigos não atestam o candidato presente, e os alertas precisam disposição explícita. **Fechamento:** adjudicar cada alerta, remediar no gate próprio, vincular checks e proteção ao SHA exato. Alerta estático não é prova de exploração; sete cópias históricas não devem ser contadas como sete falhas produtivas independentes. [Security scheduled observado](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36406943814), [Verify observado](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36309111340); JSON bruto em remote-readonly.json.

### A91-19 — Gates de governança desatualizados — P2 — confiança alta

Skip governance falha em hashes de três fontes: testes postgres-persistence-mode, webhook-security e operational-harness-homolog. A suíte executada não teve skips. Workspace boundaries reporta 11 findings, todos TEST_ONLY, e baseline STALE/inventoryComplete=false; não são automaticamente 11 violações de dependência produtiva. O format global sinaliza PRD 0010, AUD-0590 e coordenação; esta última é compartilhada e contém também o novo claim.

**Impacto:** gates reprovados e sinal ruidoso dificultam diferenciar risco de produto e dívida de catálogo. **Fechamento:** atualizar inventários/baselines de forma revisada, classificar dependências de teste e corrigir formatação sob claims próprios. Não mascarar esses FAIL como PASS nem tratar hashes divergentes como testes efetivamente pulados.

### A91-20 — Documentos vigentes e históricos divergem — P2 — confiança alta

Gate 0190 ainda cita aceite I11/hash `c334...` de SPEC 0162; o snapshot contém revisões posteriores e outro hash (`ff5a24604a929b3e333ccaf0976035ba028d08c4e609b2102abe567d0e5862a1`). O bloqueio de BUILD/T3 continua explícito. PUBLIC_API descreve um recorte antigo, enquanto CURRENT_IMPLEMENTATION_2026-09-29 fornece mapa atual por SHA. A SPEC conversacional admite mudança de objetivo terminal em recorte que precisa conciliação com CONVERSATION_STATE_MODEL. Requisitos históricos como LangGraph não devem ser confundidos com o seam atual da plataforma.

**Impacto:** leitor pode escolher a revisão errada ou atribuir integração concluída a um build isolado. **Fechamento:** índice de estado canônico por candidato, atualização dos gates e mapa requisito/contrato/implementação/evidência. Não se demonstrou BUILD sem gate nem falsificação de aceite.

### A91-21 — Hotspots de manutenção e legado integrado — P2 — confiança alta

`apps/api/src/server.ts` tem 5.531 linhas; runtime antigo 2.636; platform repository 2.119; console platform 1.739; client 1.581; App 1.056, no recorte medido. O núcleo neutro convive com referências Secretary em API/web/build/proxy.

**Impacto:** revisão, ownership e regressão tornam-se mais caros; separação de runtime/orchestrator no núcleo não elimina acoplamento do produto. **Fechamento:** decompor por domínio/porta com invariantes e regressões relevantes; completar isolamento do legado na tarefa PR-L04 coordenada. Não fazer refactor amplo apenas para reduzir linhas.

### A91-22 — Preflight de rate limit tem checagens nominais — P2 — confiança média

`apps/api/src/tenant-preflight.ts:938` e checks de índices seguintes incluem namespace/nome nas verificações de rate limit. O endurecimento semântico de F02 foi aplicado ao recorte de replay; não qualifica automaticamente todos os preflights.

**Impacto:** schema divergente pode passar verificações nominais sem assegurar a semântica pretendida. **Fechamento:** definir inventário semântico das invariantes de rate limit e testar constraints-isca, índices divergentes e operação negativa na relação correta. Não foi feita mutação DDL adversarial de rate limit nesta rodada.

### A91-23 — Providers, SLO e piloto sem qualificação integrada — P1-R — confiança alta

Há adapters, gateways, homolog sintética, budgets e load/evals históricos. Faltam prova atual de destino externo, deduplicação no destino externo quando houver efeito ou reconciliação explícita de resultado incerto, carga PostgreSQL+modelo representativa, soak, SLO/alertas com dono e piloto do primeiro consumidor. Provas locais não devem herdar alcance de infraestrutura/canal real.

**Impacto:** capacidade, latência, recuperação e efeitos reais continuam incertos. **Fechamento:** plano de homologação limitado sob autorização, métricas e aceites do consumidor, falhas controladas, reconciliador e runbooks exercitados. Nenhuma integração real foi acionada nesta auditoria.

## 6. Aderência a discovery, PRD e SPEC

A descoberta e PRD de plataforma sustentam runtime neutro, autoridade separada, portas de modelo/conhecimento/tools e separação runtime/orchestrator/produto. O núcleo implementa grande parte dessa fundação e os testes dão evidência forte para execução durável, lease, checkpoint, approval, fencing e tenant. Por isso os critérios C08/C13/C17/C23/C26–28 têm notas altas.

O contrato de execução iterativa também promete contexto, consumo governado, observações e grounding. A91-03–07 demonstram distância entre a existência dos tipos/registries e o material efetivamente usado na chamada ao modelo ou policy. Esses achados justificam notas menores em C14–16/C18/C39, mesmo com cobertura alta.

A publicação corporativa, IdP/MFA, cross-origin, purga, observabilidade e reconciliação aparecem em SPECs e backlog com gates específicos. Alguns builds têm provas em commits isolados. Os commits `737e9c1`, `85c2c7d`, `ed012a4`, `7ef74e7`, `aad04d9` e `ac47f6b` não eram ancestrais do HEAD auditado. Isso não invalida suas provas locais; impede atribuí-las automaticamente à aplicação root. SPEC aprovada, build isolado aprovado e candidato integrado qualificado são estados distintos.

Os documentos históricos do secretário contêm objetivos de domínio que não são o mesmo escopo do harness reutilizável atual. Foram usados para verificar isolamento e rastrear decisões, sem exigir automaticamente que toda intenção histórica se torne requisito ativo. A documentação recente e os NO_GO explícitos são pontos positivos; falta um mapa atualizado que reduza a ambiguidade para novos consumidores.

## 7. Condições de liberação, avaliadas separadamente

A média abaixo é apenas indicador de evidência, `405 / 13 = 31,15`, arredondada para 31/100. **Todos os gates permanecem não qualificados para release integrado.** Nota zero significa prova obrigatória ausente no escopo, não inexistência de todo trabalho relacionado.

| Gate | Condição                                        | Nota / 100 | Estado          |
| ---- | ----------------------------------------------- | ---------: | --------------- |
| G01  | Legado isolado e guarda de regressão            |         60 | Não qualificado |
| G02  | Capacidades produtivas definidas e rastreadas   |         60 | Não qualificado |
| G03  | Zero P0/P1 abertos                              |         10 | Não qualificado |
| G04  | CI, zero skips e certificado no mesmo candidato |         35 | Não qualificado |
| G05  | IdP/MFA/RBAC por tenant                         |         40 | Não qualificado |
| G06  | Cofre e rotação testada                         |         20 | Não qualificado |
| G07  | RLS e roles separadas no ambiente alvo          |         80 | Não qualificado |
| G08  | Retenção e direitos operacionais                |         30 | Não qualificado |
| G09  | PITR/restore e RPO/RTO aprovados                |         30 | Não qualificado |
| G10  | SLOs/alertas/on-call com dono                   |         40 | Não qualificado |
| G11  | Pentest externo qualificado                     |          0 | Não qualificado |
| G12  | Piloto do primeiro consumidor                   |          0 | Não qualificado |
| G13  | Autorização humana do candidato de release      |          0 | Não qualificado |

A pontuação técnica não libera produção. Em especial, não há proof de zero P0/P1 no candidato, IdP/cofre/PITR/pentest/piloto qualificados e autorização humana de release. Esta auditoria encerra uma tarefa documental, não esses gates.

## 8. Sequência recomendada de correção

| Ordem | Trabalho                       | Dependência e aceite                                                                                                                                      |
| ----- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Tornar a baseline confiável    | Coordenar integração das branches, adjudicar dependências/CodeQL, inventários e candidato; CI no mesmo SHA; preservar trabalho concorrente                |
| 2     | Fechar invariantes cognitivos  | SPEC curta para A91-03–07; transporte de contexto/observações, budget antes de chamada, piso de policy e prompt renderizado; negativos com modelos falsos |
| 3     | Fechar fronteiras de dados     | A91-08/09, tenant/grounding obrigatório onde aplicável; redação antes de sink, sem payload bruto ou segredo em prova                                      |
| 4     | Compor a aplicação corporativa | Sessão/OIDC durável, replace atômico, job de migration, inbox/fencing/clock/reconciliador; testes do entrypoint integrado com PG                          |
| 5     | Exercitar operação limitada    | Decisões DP01–06, purge/restore, cofre/rotação, PITR/RPO/RTO, incidentes/on-call, carga e SLO; dados fictícios até gate próprio                           |
| 6     | Qualificar release/piloto      | E2E matriz exigida no mesmo digest, CI/certificado coerentes, pentest e primeiro consumidor; decisão humana de promoção                                   |

Usar o [backlog canônico 0356](../03_build/0356_production_backlog_2026-09-26.md) e o [backlog complementar 0361](../03_build/0361_aud0590_remediation_backlog.md). Achados novos de contexto, budget, policy, prompt e redação devem receber task própria antes de BUILD; o handoff fornece cartões propostos, sem inventar aprovação. Critério de fechamento deve conter positivo, negativo e falha/crash quando houver fronteira durável, sempre vinculados ao candidato avaliado.

## 9. Evidências e fechamento da rodada

Pacote: [AUD0591-REPOSITORY-20260930](evidence/AUD0591-REPOSITORY-20260930/README.md). Inclui baseline e source-manifest, inventário de docs, leitura estruturada, métricas, scorecard, comandos/exit codes, logs brutos, cobertura, JSON Playwright, provas sintéticas, fontes auxiliares, patch exclusivo do builder, consulta remota, verificação de preservação de fontes e limpeza de recursos. O manifesto final associa arquivos e hashes; não é atestação criptográfica de release.

[Handoff documental](../08_runtime/handoffs/aud0591_20260930.md) contém entradas prontas para runtime state, execution log e backlog. Esses três ledgers já estavam sob edição concorrente; a rodada preservou seus conteúdos e entregou a atualização por handoff coordenado, como registrado no claim. O claim próprio foi encerrado; não houve commit, push, deploy ou correção de código de produto.

Não foram executados nesta rodada: novo certify, SBOM/licenses, full CI bar remoto, imagem Docker de runtime publicada, PITR de infraestrutura, soak representativo, pentest independente, IdP/MFA corporativo, integração ou efeito externo real, teste humano de acessibilidade e auditoria jurídica. A decisão NO_GO decorre de evidências locais concretas e desses gates obrigatórios ainda sem qualificação, não de suposição de incidente real.

A revisão cruzada dos dois especialistas e a revisão final do líder ajudam a reduzir erros de escopo; não constituem uma certificação independente de segurança/release. O relatório pode orientar a próxima rodada de SPEC e correção, mantendo os gates do pipeline CVG.
