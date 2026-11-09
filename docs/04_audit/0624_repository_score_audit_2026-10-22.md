# 0624 — Auditoria do repositório com notas — 22–23/10/2026

**Nota geral: 78/100. Prontidão demonstrada para implantação do harness: 55/100. Parecer de produção: NO_GO.**

O repositório tem uma base técnica consistente: contratos explícitos, execução governada, controles de aprovação, testes de falha e builds funcionais. As maiores lacunas estão na qualificação da identidade trusted para produção, na atomicidade de criação/auditoria, na comprovação do isolamento e na operação do ambiente de destino. A média não compensa um requisito obrigatório pendente. Durante a auditoria, a main incorporou OIDC/principals e uma atualização de dependências; o relatório foi revisto para não apresentar as lacunas antigas como capacidades ausentes na revisão final.

## 1. O que foi auditado

- **Fonte final:** `main` publicada em `1e96e36578c308cb1437c14fad2e72653f830a9f`, conferida pelo remoto e pela API do GitHub. A primeira baseline foi `420b97b3373389f30ac82c4d4078a21b2363fdf9`; a main avançou durante o trabalho, com OIDC0254/fatiaA e lock atualizado. Checks e testes novos foram obtidos na revisão final. Avanços posteriores não recebem estas notas automaticamente.
- **Checkout compartilhado:** `3704e3f853e45e9a967dfc07b366eb9c6acb51a5`, preservado e atrás das duas revisões. Defeitos exclusivos desse checkout antigo não foram usados para reduzir a nota da fonte publicada.
- **Método:** inspeção dirigida de arquitetura, caminhos executáveis, testes, contratos, deploy, backlog e CI; testes próprios com falhas sintéticas. Não houve revisão linha a linha de todos os arquivos.
- **Ambiente:** snapshots privados `/tmp/cvg-aud-score-20261022/source` e `source-current`, Node 22.23.2, CPython 3.12.3/Linux; `npm ci --ignore-scripts` em cada lockfile. `TMPDIR` próprio nos builds de runtime e verificações posteriores.
- **Manifesto:** 2.529 arquivos da revisão final; excluído o grosso de `docs/04_audit/evidence/**`, aproximadamente 3,83 GB na baseline. Os 26 inputs exatos da política Gitleaks foram hidratados em cada snapshot para revalidar a configuração com seus vínculos reais. A omissão restante limita testes documentais integrais. Inventário final dos quatro diretórios de código: 361 arquivos fora dos testes/dist e 115.852 linhas. Esses números descrevem o inventário, não linhas individualmente revisadas.
- **Separação de escopo:** harness conforme ADR010/barra0373; Assistente de Plantão como consumidor conforme barra0368 e backlog PISO. Não foram usados dados reais, providers, canais externos, banco ou serviços de outros agentes.

Manifestos e comandos: [fonte final](evidence/AUD-SCORE-20261022/source-manifest.json), [comparação de revisões](evidence/AUD-SCORE-20261022/revision-comparison.json), [inventário final](evidence/AUD-SCORE-20261022/current-code-inventory.json), [resumo verificável](evidence/AUD-SCORE-20261022/verification-summary.json).

## 2. Como interpretar as notas

São avaliações de engenharia, com julgamento explícito; não representam porcentagem de requisitos cumpridos, probabilidade de falha ou certificação. A rubrica foi registrada antes dos resultados:

| Componente               | Máximo | O que recebe crédito                                    |
| ------------------------ | -----: | ------------------------------------------------------- |
| Implementação e contrato |     40 | Caminho conectado, comportamento e limites definidos    |
| Verificação atual        |     30 | Execução própria e evidência remota identificada no SHA |
| Controles de falha       |     20 | Recusa segura, isolamento, consistência e recuperação   |
| Operação e documentação  |     10 | Composição, procedimentos e rastreabilidade utilizáveis |

0–19: ausente/não utilizável;20–39: incipiente;40–59: parcial;60–74: funcional com limitações materiais;75–89: bom com resíduos;90–100: fortemente demonstrado no escopo. A precisão unitária organiza a comparação; diferenças de poucos pontos não demonstram regressão.

As 24 áreas têm pesos iguais. Soma 1.875; média 78,125, apresentada como78. Componentes de cada nota em [scores.json](evidence/AUD-SCORE-20261022/scores.json); critérios e limites em [quality-bar.json](evidence/AUD-SCORE-20261022/quality-bar.json). A pontuação de prontidão é separada e não entra nessa média.

## 3. Notas por item

| ID  | Item analisado                             | Nota /100 | Evidência favorável e principal desconto                                                                                                                                                                                               |
| --- | ------------------------------------------ | --------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Arquitetura e modularidade                 |    **82** | Contratos, composição pública e portas separam responsabilidades; builds do harness e runtime funcionam. Permanecem múltiplos caminhos de runtime e dependências legadas no host.                                                      |
| A02 | Isolamento harness/produto                 |    **67** | Produto, build e workflow têm fronteiras próprias; SDK compila por exports públicos. HISO005/HISO014 continuam sem aceite positivo; testes do analisador não substituem prova da raiz sem o produto. S08.                              |
| A03 | Contratos públicos e SDK                   |    **86** | 124 testes TS do SDK,47 Python e compilação por exports públicos. Python permanece experimental/local, sem distribuição ou equivalência ampla a outros SDKs.                                                                           |
| A04 | Qualidade e manutenibilidade do código     |    **75** | Typecheck e ESLint passam; tipos e erros explícitos. `server.ts` tem5.887 linhas, o runtime iterativo1.996 e o console de plataforma1.739: concentração encarece revisão e mudanças. S11.                                              |
| A05 | Autenticação e sessões                     |    **87** | Tokens, replay, sessão HttpOnly e OIDC com produtor verificado exercitados;316 testes de identidade/bootstrap na revisão final. OIDC desta fatia é exclusivo de NODE_ENV=test; produção não está qualificada. S01.                     |
| A06 | Autorização por caso e tenant              |    **80** | SPEC0251 e produtor de principals integrados; listas, grants, matriz de roles e revogação têm provas atuais. Falta perfil operacional de identidade; checagem de grant e escrita ainda têm fronteiras distintas. S01.                  |
| A07 | Policy, approvals e efeitos sensíveis      |    **90** | 109 testes de approval-engine,29 dos pacotes policy e97 de conformidade; precedência de negação, binding e uso único exercitados. Não equivale a autorização para efeito real.                                                         |
| A08 | Segurança HTTP, rede e entradas            |    **80** | Validação, sessão, controles de origem, limites e SSRF têm regressões. DNS não participa integralmente do cancelamento e egress de infraestrutura tem pendências. S03/S04.                                                             |
| A09 | Privacidade e redação                      |    **76** | Redação central limita profundidade/tamanho e trata chaves sensíveis; projeções restringem leituras. Não houve comprovação de todos os sinks, retenção e acessos no destino real.                                                      |
| A10 | Persistência, atomicidade e auditoria      |    **71** | Transições de status/decisão têm CAS e auditoria atômica; testes atuais de repositório e gate PG remoto da baseline. POSTs de criação ainda persistem antes do append de auditoria. S02.                                               |
| A11 | Idempotência, concorrência e recuperação   |    **82** | Outbox, fencing, journal e estados incertos têm controles exercitados; incerteza não autoriza replay cego. Provider real e todas as combinações de reinício não foram reexecutados.                                                    |
| A12 | Runtime, budgets e cancelamento            |    **87** | 550 testes do harness,23 do orchestrator e conformidade; regressões0248 verificam orçamento e cancelamento. O limite ponta a ponta também depende das portas de transporte. S03.                                                       |
| A13 | Modelos e transportes                      |    **76** | 143 testes do model-gateway; corpo limitado, medição de custo e cancelamento corrigidos. Lookup DNS pendente continua aguardado; nenhum modelo externo foi qualificado nesta rodada. S03.                                              |
| A14 | RAG e fontes institucionais                |    **79** | Fonte/versionamento, publicação, revogação, tenant e handoff exercitados em11 testes; catálogos/resolvedores também inspecionados. Não há validação semântica ampla nem acervo institucional real aprovado demonstrado aqui.           |
| A15 | Integrações e canais                       |    **73** | Normalização, deduplicação, journal e contenção de respostas têm testes atuais. WAHA/Evolution/Whisper e recibos externos não foram homologados ao vivo por esta auditoria.                                                            |
| A16 | Console web e acessibilidade               |    **78** | 99 testes atuais de console/clientes; build web passa; etapa remota de navegador trusted/acessibilidade aprovada na baseline420. Faltam avaliação visual própria, uso no destino e testes com usuários.                                |
| A17 | Assistente de Plantão                      |    **72** | 132 testes do consumidor e build próprio; confirmação, homônimos, falhas e recuperação melhoraram. Preview com recibo/token de revisão, journal/lock, homologação e piloto continuam pendentes nos PISO; D2 mantém NO_MODEL. S09.      |
| A18 | Testes automatizados e cobertura           |    **88** | Suítes próprias finais amplas sem skips, sondas negativas e SDK entre processos; baseline420 tem etapas remotas unit/coverage/PG/E2E aprovadas. Não houve suíte integral local, nova cobertura global ou certificação final concluída. |
| A19 | CI e governança de release                 |    **76** | Cinco checks obrigatórios, proteção, actions pinadas e atestações. CI final ainda em execução na consulta; a baseline anterior excedeu3h durante certify. Release completo não demonstrado nesta rodada. S06.                          |
| A20 | Dependências e supply chain                |    **86** | Lockfile, instalação sem scripts, scans e bases principais pinadas. Audit final completo/produção:zero; Fastify agora5.12.7 encerra o LOW da baseline. Imagens auxiliares ainda têm pendências de pin. S07/S04.                        |
| A21 | Deploy e hardening                         |    **77** | Receita distroless/non-root, read-only/cap_drop, papéis e volumes explícitos; runtime compila e etapa remota de imagem passa. Servidor alvo ainda planejado, rede/segredos/digest final sem aceite conjunto. S04.                      |
| A22 | Observabilidade e resposta a falhas        |    **66** | Telemetria, correlação e monitor de worker pela API;27 testes diretos de observabilidade. Monitor externo do núcleo e notificações de backup faltam; cair junto com o host elimina o detector local. S04/S05.                          |
| A23 | Backup e recuperação operacional           |    **72** | Cadeia auditável, restore do núcleo, scripts/timers e backup/restore do produto; testes locais e etapa PG remota. Não foi feito restore no destino; alerta de falha e snapshot automatizado do Vault estão abertos. S04/S05.           |
| A24 | Documentação, governança e rastreabilidade |    **69** | ADRs, especificações, claims e evidência versionada permitem rastrear decisões. README e entradas de estado ainda descrevem integrações como pendentes após o merge; checkout e remoto divergem. S10.                                  |

Os testes por pacote estão discriminados em [test-breakdown.json](evidence/AUD-SCORE-20261022/test-breakdown.json). Contagens de uma área podem sustentar outras áreas; não são somadas repetidamente como testes distintos.

## 4. O que foi realmente verificado

| Procedimento                                   | Resultado                                        | Alcance                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Typecheck e ESLint                             | PASS, exit0                                      | Snapshot da revisão fixada; sem evidence histórico omitido                                                                   |
| Build padrão                                   | PASS, exit0                                      | Tipos, harness e console web                                                                                                 |
| Build runtime                                  | PASS, exit0                                      | 20 workspaces; contexto compilado próprio, sem fontes TS no contexto final                                                   |
| Build produto                                  | PASS, exit0                                      | Consumidor e fechamento por exports públicos; não é build de imagem                                                          |
| Build público do SDK                           | PASS, exit0                                      | Sem aliases de fonte; dependências públicas compiladas                                                                       |
| Suíte focada principal                         | 1.525/1.525 PASS;136 arquivos; zero skips        | Harness, SDK, modelos, policy, RAG, observabilidade, API, console, produto e conformidade                                    |
| Suíte dados/canais/runtime                     | 540/540 PASS;49 arquivos; zero skips             | Runtime governado, canal, repositórios em memória, restore e catálogo de conhecimento                                        |
| SDK Python, runner documentado                 | 47/47 PASS; zero skips                           | Python3.12.3, Node22, stdio real entre processos, apenas fixtures sintéticas                                                 |
| OIDC/principals e bootstrap final              | 316/316 PASS;9 arquivos; zero skips              | IdP sintético local, claims, MFA, sessão, produtor, configuração e recusas; sem PostgreSQL nesta execução                    |
| Sondas adversariais próprias                   | 6/6 caracterizações confirmadas                  | Dois controles bons de criação; dois recursos sobrevivem ao erro de auditoria; DNS pendente após abort e controle bom de DNS |
| Governança/release/scanner final               | 328/328 PASS;6 arquivos; zero skips              | Contratos de release/workflow e política/configuração Gitleaks; não é execução do scanner nativo                             |
| Fronteira B6 na baseline420                    | 98/98 fixtures PASS                              | Engine0247; evidência anterior preservada, não repetida na raiz final nem prova positiva de isolamento                       |
| `npm audit --json` e `--omit=dev --json` final | Zero vulnerabilidades reportadas; exit0 em ambos | Fastify 5.12.7; resultado do registro naquele momento, sem garantia universal de segurança                                   |
| CI remoto final                                | Verify em execução na consulta                   | Produto/barra e imagem, CodeQL, secret-scan, supply-chain e image-scan SUCCESS; não reexecutados pelo auditor                |

Na revisão final, foram **2.756 testes de regressão distintos aprovados, zero falhas/skips**, mais **6 sondas próprias de caracterização**. A execução avulsa de3 testes da configuração de segurança está contida nos328 de governança e não foi somada de novo. Os98 casos B6 da baseline também não entram no total final.

Falhas iniciais foram preservadas: a primeira sonda de task usou Supervisor, que não tem `task:update`, e foi recusada corretamente com403; corrigiu-se a fixture para Operator com grant, sem mudar código ou expectativas de atomicidade. A primeira chamada Python usou discovery genérico, sem o runner e o Node confiável exigidos, gerando erros de harness/cache. O runner documentado foi executado depois, com47 PASS. Na baseline de governança,425/426 passaram; uma verificação da configuração Gitleaks falhou porque seus inputs hash-bound tinham sido omitidos com o diretório de evidências. Hidrataram-se os26 arquivos exatos de cada revisão, sem mudar política, hashes ou testes: na fonte final, configuração3/3 e suíte de governança328/328 passaram. São falhas de procedimento/recorte da auditoria, não regressões demonstradas do produto. Logs originais e corrigidos permanecem no pacote.

### CI: baseline com timeout confirmado; nova revisão ainda em qualificação

Na baseline420, o [Verify39841233351](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39841233351) aprovou etapas de unit, cobertura/critical, mutação, PostgreSQL, restore, observabilidade, fases2/3/4A, chaos/evals/load, docs, E2E, browser/acessibilidade, skip, imagem, SBOM, licenças e audit. **São conclusões das etapas consultadas nessa revisão anterior, não reexecução própria ou aprovação integral da revisão final.**

O job iniciou19:35:20UTC e terminou22:36:43UTC. A anotação do GitHub informa excesso do prazo máximo de3h. A certificação começou21:57:51UTC e foi cancelada22:36:34UTC. A instalação do navegador consumiu43min49s; unit37min46s e cobertura40min04s. Há evidência concreta para diagnosticar o custo do pipeline antes de mudar limites; não se recomenda remover gates.

A etapa de proveniência dessa baseline recusou `VERIFY_RESULT=cancelled`, com attest/provenance skipped. CodeQL, secret-scan, supply-chain e image-scan ficaram SUCCESS naquela fonte. Na revisão final1e96e365, a [barra Verify39892419864](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39892419864) estava em execução na consulta final; CodeQL, produto/barra e imagem, secret-scan, supply-chain e image-scan já haviam aprovado. Não se transportou o FAIL antigo nem um PASS inexistente para o novo SHA.

A proteção da main exige os cinco checks e `enforce_admins`;0 aprovações externas permanece configuração deliberada anteriormente aprovada, não vulnerabilidade por si só. Um job Release gate SUCCESS significa que o gate executou, não que uma imagem foi publicada: build/push e verificação independente foram skipped nas execuções consultadas.

Provas: [job/etapas baseline](evidence/AUD-SCORE-20261022/ci-bar-job.json), [anotações](evidence/AUD-SCORE-20261022/ci-bar-annotations.json), [proveniência baseline](evidence/AUD-SCORE-20261022/ci-provenance.log), [checks finais](evidence/AUD-SCORE-20261022/final-remote-checks.json), [proteção](evidence/AUD-SCORE-20261022/remote-protection.json).

## 5. Achados e encaminhamento

P1 indica bloqueio alto no perfil afetado; P2, lacuna material; P3, prioridade menor. Gravidade e prioridade de execução não são a mesma coisa. Não foi demonstrado P0. Itens conhecidos são revalidados e vinculados à carteira existente, sem criar outra fila de status.

### S01 — P1 de qualificação — Identidade/principals entregue no perfil sintético, produção ainda vedada

**Mudança durante a auditoria:** a baseline420 não compunha o produtor. O PR20, integrado em1e96e365, entregou OIDC0254/fatiaA, produtor verificado e composição de login.316 testes atuais de OIDC/bootstrap passaram, incluindo login com senha/TOTP, cookie e leitura de tenant com Supervisor e IdP HTTPS sintético. Portanto, **o produtor não deve mais ser descrito como inexistente**.

**Resíduo real:** configuração e composição dessa fatia recusam OIDC fora de `NODE_ENV=test`. Sem o perfil qualificado, trusted sem autoridade continua recusando por503. É uma restrição explícita de escopo/segurança; não se propõe removê-la para liberar produção. Não foi demonstrado bypass. Fontes finais: [configuração](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/apps/api/src/oidc-config.ts#L284), [composição](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/apps/api/src/production-bootstrap.ts#L202), [produtor](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/apps/api/src/case-principal-producer.ts). Confiança alta sobre código/testes sintéticos; PostgreSQL/IdP de destino NOT_RUN.

**Encaminhamento:** continuidade UP91-025/SPEC0254 e qualificação do perfil de destino, preservando0251 e a restrição do ambiente sintético. Reusar o produtor entregue; demonstrar IdP, principals, ativação/revogação, sessão e leitura autorizada no ambiente autorizado. Residual de autorização já documentado: grant e escrita ainda precisam da unidade transacional apropriada, sem confiar apenas em leitura anterior. Não preencher uma string nem operar produção em NODE_ENV=test para contornar o gate.

### S02 — P2 — Criação de task/approval pode sobreviver ao erro de auditoria

**Reprodução atual:** falhar `audit.append` depois de preparar sessão sintética autorizada. Nos dois POSTs, resposta500, incremento1 no recurso persistido e nenhum novo evento de auditoria. Os dois controles sem falha retornam200 e incrementam recurso/auditoria. Prova no adaptador em memória; o caminho SQL não foi executado pelo auditor.

**Fonte:** [criação de task](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/apps/api/src/server.ts#L1818), [criação de approval](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/apps/api/src/server.ts#L1964). Confiança alta. Não houve efeito externo.

**Encaminhamento:** resíduo UP91-018/0250/0251, reconhecido na0622-R03. Contratar criação+auditoria/idempotência como unidade, com falha antes/depois do commit, retry convergente e paridade memória/PG. As decisões de approval e PATCH de status já usam operações atômicas e não foram classificados como ainda defeituosos.

### S03 — P2 — Cancelamento não encerra lookup DNS pendente

**Reprodução atual:** `fetchWithSsrfGuard` recebe signal, DNS injetado permanece pendente, abort é emitido e a operação continua aguardando após80ms. Liberar o lookup permite finalizar. Controle com DNS imediato completa. Não houve DNS ou HTTP externo;80ms é a janela observada, não benchmark de rede ou prova de duração infinita.

**Fonte:** [guard/resolução](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/packages/shared/src/ssrf.ts#L273). Confiança alta no vínculo de cancelamento ausente.

**Encaminhamento:** HISO-011/D009/D011, resíduo0622-R04. Fechar com prazo absoluto/sinal cobrindo resolução e redirecionamentos, recusa antes de dispatch e cleanup comprovado. Manter os limites de corpo/custo da0248; a existência deste resíduo não invalida as correções aprovadas.

### S04 — P1/P2 por subitem — Ambiente e observação externa ainda não qualificados

**Observado estaticamente e no backlog:** SRV-01 monitor externo do núcleo, SRV-03 snapshot/política do Vault, SRV-04 egress por contêiner e SRV-05 pins de imagens auxiliares permanecem abertos. O monitor atual roda dentro da API; não demonstra detecção da queda do próprio host/API. O servidor ainda é descrito como não adquirido/instalado no0393. Não se presumiu acesso ou inexistência de infraestrutura além dessa declaração.

**Fontes:** [monitor](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/apps/api/src/stop-alert-monitor.ts#L14), [plano0374](../03_build/0374_plano_producao_harness.md), [roteiro0393](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/docs/03_build/0393_servidor_hospital_requisitos_e_instalacao.md). Confiança alta sobre o estado documental/código; funcionamento no destino é UNKNOWN.

**Encaminhamento:** reusar SRV-01/03/04/05 e condições C do0374; não atribuir a falta de ambiente a erro novo de código. Fechar com desligamento induzido e recibo externo, restore de Vault descartável, negativos de egress por origem e imagens/digests conferidos no destino. SRV-06 conserva o limite de reprodutibilidade byte a byte, distinto da identidade por digest do CI.

### S05 — P1 operacional — Backup sem notificação automática de falha configurada

**Observado:** unidades de backup e restore têm `OnFailure` comentado; a unidade notificadora correspondente não existe nessa receita. Timers/scripts não bastam para demonstrar que o responsável será avisado da falha.

**Fonte fixada:** [unidade de backup](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/1e96e36578c308cb1437c14fad2e72653f830a9f/deploy/harness/backup/systemd/cvg-harness-backup.service). Confiança alta; nenhuma falha de backup real foi induzida.

**Encaminhamento:** SRV-02, já registrado. Fechar com falha sintética do backup e do ensaio de restore, notificação recebida com unidade/horário e ausência de segredos; recuperação/sucesso não deve gerar alerta falso. Configuração no destino exige sua autoridade própria.

### S06 — P2 — Barra de CI excede o orçamento do job

**Observado na baseline420:** limite3h confirmado pela anotação do GitHub; certificação e finalize não concluídos. Proveniência recusou a composição incompleta. Na revisão final1e96e365, Verify ainda estava em execução: não se afirma nova falha por timeout antes de seu resultado. O custo anterior é um risco verificável, não reprovação demonstrada da lógica de aplicação nem autorização para herdar certificado de outro SHA.

**Encaminhamento:** governança CI/UP91-035/UP91-045, sem abrir nova fila paralela. Medir etapas, downloads e repetição dentro de certify, otimizar com proveniência preservada e executar a barra inteira no mesmo candidato. Fecho: check principal, atestações, provenance e verificação independente SUCCESS no mesmo SHA; release pela receita e gates vigentes.

### S07 — P3 histórico, ENCERRADO NA REVISÃO FINAL — Advisory LOW do Fastify

**Baseline420:** audit completo/produção reportaram Fastify 5.12.5 afetado por GHSA-389g-gv7q-r4x8, CVSS3,7, faixa>=5.12.2<5.12.6. O advisory oficial informa correção em5.12.6. O problema envolve restrições de nomes de headers via `propertyNames`; não se demonstrou exploração na aplicação. [Advisory do mantenedor](https://github.com/fastify/fastify/security/advisories/GHSA-389g-gv7q-r4x8).

**Revalidação final:**1e96e365 instala Fastify 5.12.7; audit completo e produção retornaram exit0/zero vulnerabilidades reportadas, com novas regressões HTTP/identidade nesta rodada. O registro foi encerrado para esse advisory, sem sugerir correção já feita nem declarar segurança universal. As duas consultas antigas contavam a mesma dependência, uma vez. Nenhum lockfile foi alterado pelo auditor.

### S08 — P2 de comprovação — Isolamento ainda sem aceite positivo

Builds e fronteiras documentais existem; a última medição versionada do BUILD0247 continua INCOMPLETE,11.723 diagnósticos, zero provas/violações na sua raiz de referência. Esse número é **histórico**, não medição nova de1e96e365, nem11.723 bugs de aplicação. [Relatório original preservado](evidence/AUD-SCORE-20261022/boundary-historical-report.txt).

**Encaminhamento:** HISO005/HISO014 e recon AnnexB já existentes. Fechar limitações do analisador com negativos conhecidos e emitir prova reproduzível do núcleo sem produto, variáveis ou processo consumidor. Regrediu-se a família0247 em fixtures nesta auditoria; isso não encerra o aceite da raiz. Confiança alta sobre a ausência de aceite encontrado; checker integral da raiz NOT_RUN.

### S09 — P2 de completude — Consumidor não concluiu os aceites de uso

132 testes e build são atuais, mas o backlog preserva recibo de preview/token de revisão, evidência por campo dependente de D2, journal V2/lock, recibos de provider, monitor em outra máquina, homologação e piloto. Algumas correções estão implementadas mesmo com cartões pais abertos; TODO/IN_PROGRESS não significa ausência de toda a capacidade.

**Encaminhamento:** PISO001–010 no [backlog canônico](../../products/shift-assistant/docs/backlog.md), sem copiar status para o harness. Preservar NO_MODEL/D2 até decisão específica. Aceitar o candidato conforme0368 e a homologação/piloto próprios; aprovação do harness não os substitui. Confiança alta sobre testes/código documental; operação com pessoas/provider é NOT_RUN.

### S10 — P2 de rastreabilidade — Estado publicado e narrativas operacionais divergem

O topo do runtime publicado ainda coloca0251 como READY_FOR_REVIEW e pede merge do PR, embora `d0623da4f` já seja ancestral de1e96e365. README ainda apresenta uma candidata de17/10 como referência de fronteira e afirma que seu código não foi integrado automaticamente; o texto não explica as integrações posteriores. O checkout local adiciona outra referência antiga. O risco é repetir trabalho ou usar uma evidência para bytes diferentes.

**Encaminhamento:** reconciliação documental T1 no estado corrente, preservando entradas históricas e seus hashes; referenciar SHA/PR para distinguir proposto, integrado, verificado e liberado. Por regra5 de coordenação, os ledgers locais premodificados não foram editados; deltas desta auditoria estão no handoff. Confiança alta, por comparação direta de Git e documentos.

### S11 — P2 de manutenção — Orquestração/rotas concentram responsabilidades

O tamanho dos arquivos não prova defeito, mas a combinação de muitas rotas, autorização, erros, persistência e composição em `server.ts` aumenta a superfície de revisão e facilita tratamento inconsistente entre operações, como o resíduo S02. O inventário identifica também runtimes e console extensos.

**Encaminhamento:** refatoração posterior orientada pelos contratos, após lacunas de correção/identidade prioritárias; extrair unidades com proprietário e invariantes preservadas. Não abrir refatoração ampla para melhorar a nota. Fechar com mesmos contratos públicos, negativos de autorização/atomicidade e regressão apropriada. Confiança média sobre custo de manutenção; não há medição de produtividade da equipe.

## 6. Prontidão do harness: 55/100

A barra0373 exige condições simultâneas no mesmo commit/imagem. A tabela seguinte avalia **maturidade da evidência disponível**, de 0 a 10 por condição; não afirma que55% dos gates estejam aprovados. Todos os obrigatórios continuam necessários.

| Condição da0373         | Pontos /10 | Base da avaliação                                                            |
| ----------------------- | ---------: | ---------------------------------------------------------------------------- |
| Conformidade I1–I12     |          9 | 97 testes atuais; faltam cenários no destino                                 |
| Suítes/análise estática |          6 | Suítes próprias e etapas remotas aprovadas; certificação integral incompleta |
| Pilha em modo produção  |          4 | Receita e evidências controladas; destino sem aceite                         |
| Operadores funcionais   |          4 | OIDC/principals sintéticos funcionam; perfil de produção ainda vedado        |
| CI integral no SHA      |          2 | Nova barra em execução; baseline anterior cancelada/proveniência FAIL        |
| Segredos/dependências   |          9 | Scans consultados e audit final completo/produção com zero reportado         |
| Imagem endurecida       |          7 | Receita e etapa remota de imagem; não reexecutada no destino                 |
| Backup/restore          |          5 | Testes e etapa remota; destino/Vault/notificação pendentes                   |
| Alerta efetivo          |          3 | Worker observado pela API; host/API precisam monitor externo                 |
| Pausa/retomada          |          6 | Controles e testes; ensaio conjunto no destino pendente                      |
| **Total**               |     **55** | **NO_GO**                                                                    |

O produto recebe72/100 em qualidade/completude na A17; essa nota não é prontidão de piloto. Não se concedeu release a nenhum dos dois.

## 7. Ordem recomendada

1. **Qualificar a identidade no perfil de destino:** dar continuidade à UP91-025/0254, reusando OIDC e principals entregues na fatia sintética; preservar recusa segura e0251.
2. **Fechar integridade e prazo:** criação+auditoria atômicas e DNS sob cancelamento/prazo; reusar UP91-018 e HISO-011.
3. **Requalificar a composição no CI:** resolver o custo que excedeu3h sem retirar provas; obter conclusão integral e proveniência no SHA candidato.
4. **Preparar operação verificável:** SRV-01/02/03/04/05 e aceite do destino, com restore, alertas recebidos e imagem/digest corretos.
5. **Concluir isolamento e produto nas suas filas:** HISO005/HISO014 e PISO, sem equiparar testes parciais ou média de notas a release.
6. **Manutenção curta:** reconciliação documental e atualização contínua de dependências; Fastify já corrigido na revisão final. Refatoração estrutural depois dos bloqueios de correção/uso.

## 8. Limites e fechamento

Auditoria de um único agente, com auto-revisão posterior; não há aprovação independente nesta rodada. Sem pentest, navegação visual própria, banco/containers próprios, E2E local, nova cobertura global, certificação, SBOM/licenças gerados novamente ou acesso ao servidor alvo. A API do GitHub forneceu evidência de etapas, não uma execução do auditor. Nenhum incidente real foi investigado ou presumido.

Fontes de aplicação, lockfile, índice e checkout dos pares foram preservados. Apenas relatório/evidências, handoff e seção própria do claim foram escritos. Estado, execução e backlog estão preparados no [handoff da rodada](../08_runtime/handoffs/aud_score_20261022.md), pois os três ledgers já estavam modificados por outros trabalhos. A auditoria solicitada está concluída; achados de implementação/operação permanecem abertos nas carteiras indicadas.
