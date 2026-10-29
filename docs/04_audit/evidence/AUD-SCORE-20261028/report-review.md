# 0625 — Auditoria documental e técnica com notas — 28/10/2026

**Nota técnica geral: 72/100. Prontidão operacional demonstrada: 45/100. Produção: NO_GO.**

O programa tem arquitetura reutilizável, contratos claros, controles de autorização e uma base ampla de testes. A qualificação da CI avançou: a main auditada concluiu sua barra e publicou imagem. Entretanto, as sondas desta auditoria demonstraram falhas nas fronteiras de sandbox, filesystem, prompt aprovado e auditoria de recursos. São requisitos obrigatórios que a média não compensa. A contenção de ferramentas é a prioridade técnica mais alta.

Este relatório entrega a auditoria solicitada. Não implementa correções, não aprova as frentes concorrentes e não concede aceite de produção.

## 1. Escopo, versão e método

- **Artefato principal:** main publicada `61e5cf8f41d15cc41ad524f8a57476d4f6080131`, confirmada pela API do GitHub. Toda referência de código abaixo pertence a esse SHA.
- **Checkout compartilhado:** `3704e3f853e45e9a967dfc07b366eb9c6acb51a5`, com trabalho documental e visual preexistente. Não foi atualizado para a main nem usado como se fosse a revisão publicada.
- **Fonte de expectativa:** constituição CVG, ADR-010/011, API pública, barra0373, SPECs de capabilities, sandbox, filesystem, approval, identidade e confiabilidade do consumidor. A direção de construção de 27/10 foi lida nos documentos vivos. PRDs e SPECs foram amostrados por requisito/fronteira; não se afirma leitura integral de todo o histórico.
- **Coordenação:** claims locais e GBrain consultados antes dos artefatos. PR29, PR30 e candidatas N1/K08/Q2 continuam frentes separadas. Implementação ou revisão privada não foi transportada para a nota da main.
- **Execução própria:** cópia isolada em `/mnt/dados/cvg-work/aud-score-20261028/source`, Node22.23.2; dependências instaladas com `npm ci --ignore-scripts`, sem alterar o lock. Apenas dados, providers, destinatários e arquivos sintéticos.
- **Revisão independente:** três críticos I1, mesma família de modelo com `fork_context:false`, lanes separadas e sem descendentes. Não receberam notas ou achados de auditorias anteriores. Seus apontamentos são inspeções estáticas, depois conferidas pelo Lead; quando indicado, houve reprodução própria. Pareceres brutos: [A](evidence/AUD-SCORE-20261028/critic-A.txt), [B](evidence/AUD-SCORE-20261028/critic-B.txt), [C](evidence/AUD-SCORE-20261028/critic-C.txt).
- **Preservação:** 1.791 arquivos originais da cópia e 1.187 arquivos de fonte do workspace compartilhado sem alteração na conferência PRE/POST. Builds, caches e três fixtures de sondagem foram criados apenas na cópia privada. [Sentinela e limites](evidence/AUD-SCORE-20261028/source-preservation.json).

O trabalho é AUDIT/T1 documental, com experimentos sintéticos descartáveis. Não houve correção do programa, commit, push, merge, deploy, banco ou contêiner próprio, operação sobre serviços de pares, dado real ou chamada de modelo/canal externo. A sonda PROCESS executou um subprocesso local real sob bubblewrap para ler exclusivamente uma sentinela sintética própria.

## 2. Como interpretar as notas

A rubrica foi registrada no claim antes das verificações: **0** ausente; **25** incipiente; **50** parcial ou com falha central; **75** implementado com lacunas materiais; **90** verificado no escopo; **100** completo e operacionalmente demonstrado. Os valores intermediários são julgamento técnico inteiro, não percentuais de código pronto nem probabilidade de segurança.

As 27 áreas detalham as dimensões congeladas no claim. A nota geral é a média aritmética sem pesos: **1.954 ÷ 27 = 72,37**, arredondada para **72**. A confiança varia conforme a evidência. A nota de prontidão45 é uma avaliação separada da qualificação operacional e não entra nessa média. Nenhuma dessas notas substitui os dez critérios obrigatórios da barra0373 ou as decisões próprias do produto.

## 3. Notas por item analisado

| ID | Item | Nota /100 | Fundamento e principal limite |
|---|---|---:|---|
| A01 | Requisitos, escopo e direção do programa | **80** | Direção harness/produto explícita; evolução e paridade ainda são programas abertos. Documentos de diferentes datas exigem reconciliação. |
| A02 | Arquitetura e modularidade | **82** | Portas, adapters e composição reutilizáveis. A API central concentra5.887 linhas; fronteiras de autoridade ainda têm falhas. |
| A03 | Isolamento entre harness e produto | **68** | Direção estática coerente e workflow próprio do consumidor. Prova positiva completa B6/isolamento continua pendente; não foi refeita nesta auditoria. |
| A04 | Contratos públicos e versionamento | **84** | Exports, schemas, fingerprints e validação presentes; normalização perde metadado de sandbox. |
| A05 | Kernel e orquestração | **72** | Caminhos compartilhados, policy e approval implementados; cancelamento e algumas esperas não têm garantia integral. |
| A06 | Sandbox e contenção de filesystem/processos | **40** | Quatro falhas distintas reproduzidas: perda do modo, leitura/ambiente do host, handle divergente e troca de diretório. F01–F04. |
| A07 | Ferramentas e integração MCP | **68** | FS/shell reais, limites e validação; autoridade de contenção incompleta. Origem `mcp` no catálogo não demonstra cliente MCP governado. |
| A08 | Sessões, durabilidade e contexto | **70** | Eventos, validação e stores presentes; SDK single-pass/contexto vazio e trabalho de ownership/reopen ainda não equivalem a memória conversacional durável integrada. |
| A09 | SDK e transporte stdio | **82** | Contratos TS/Python e validação forte;47 testes Python com processos reais passaram. Retomada/cancelamento remoto, outros transportes e plataformas permanecem limitados. |
| A10 | Identidade e autenticação | **80** | OIDC/PKCE/state/nonce/MFA e sessão opaca implementados e testados sinteticamente; configuração OIDC ainda recusa ambientes diferentes de test nesta main. |
| A11 | Autorização, tenant e revogação | **73** | RBAC, grants por caso e RLS; principal corrente não cobre uniformemente superfícies sensíveis e há janelas de revogação documentadas. |
| A12 | Policy, aprovação e idempotência | **80** | Binding, reservas, fencing e decisões governadas; emissão de approvals e trilha de decisão ainda têm lacunas transacionais. |
| A13 | Auditoria e causalidade | **64** | Cadeia, sanitização e dedupe; recursos podem sobreviver sem evento e a recuperação não cobre estados posteriores da aprovação. |
| A14 | Persistência, integridade e migrations | **78** | Transações, locks e CAS;338 testes PG remotos no SHA. Falta prova própria PG e há risco estático de falso positivo na migration0021. |
| A15 | Modelos e prompts aprovados | **66** | Gateway substancial; instrução B pode acompanhar hash aprovado de A. Classificação do registro não é propagada à rota. F06/F10. |
| A16 | Budgets, tokens e custos | **65** | Reservas e tetos presentes; usage ausente é convertido em zero, e saída inválida é examinada antes da medição. |
| A17 | RAG e fontes institucionais aprovadas | **58** | FAQ local com tenant/status e lifecycle administrativo de fontes. Catálogo metadata não prova busca/contexto/resposta institucional de ponta a ponta. |
| A18 | Canais, entrega e efeitos incertos | **70** | Deduplicação, journal e controles de transporte; HTTP503 permite nova tentativa da mesma operação sem retenção como UNCERTAIN. |
| A19 | Console web e acessibilidade | **78** | Fluxos, estados, labels e testes presentes; primeira página limita navegação por conversas/casos. Avaliação visual própria e testes com usuários não executados. |
| A20 | Assistente de Plantão | **64** | Isolamento, autoria, rascunhos e NO_MODEL; preview aceito e fidelidade paciente/campo/unidade ainda incompletos. Sem homologação ou piloto nesta auditoria. |
| A21 | Testes, cobertura e conformidade | **90** | 2.897 regressões próprias sem skips; CI com7.087 unitários e boa cobertura. Sondas novas revelam lacunas de cenários de fronteira, apesar dos verdes. |
| A22 | CI, proveniência e publicação | **88** | 35gates PASS/34seals/56hashes conferidos e imagem publicada/verificada no SHA. Varredura posterior de imagem falhou; CI não concede aceite operacional. |
| A23 | Dependências e supply chain | **78** | `npm audit` completo atual com zero; lock e actions pinadas. Scanner posterior reporta HIGH corrigível na base da imagem. |
| A24 | Deploy e hardening | **78** | Imagem distroless/non-root, read-only/cap_drop e papéis separados; ambiente de destino e composição integral não foram demonstrados nesta auditoria. |
| A25 | Observabilidade e resposta a falhas | **64** | Telemetria, heartbeat e alerta de worker; detector na API não demonstra detecção da queda do próprio host, e notificações de backup não estão conectadas no template publicado. |
| A26 | Backup e recuperação | **72** | Snapshot/âncoras, mirror verificado, retenção e restore em CI; sem restore próprio no destino, snapshot automatizado de Vault ou alerta operacional demonstrado. |
| A27 | Documentação, governança e rastreabilidade | **62** | Evidência e gates detalhados; README/ledgers têm estado antigo no topo, checkout diverge da main e relatos distribuídos dificultam localizar a situação atual. |

**Prontidão operacional demonstrada:45/100 — NO_GO.** Existem builds, CI e publicação comprovados, mas permanecem falhas técnicas obrigatórias e qualificação de ambiente, identidade, alertas e recuperação. Não se exige pentest externo, HA ou outros requisitos que a barra proporcional deliberadamente dispensou para seu escopo atual.

## 4. Evidências realmente verificadas

### Execução própria em61e5

| Procedimento | Resultado | Alcance |
|---|---|---|
| Instalação isolada sem scripts | exit0 | Lock preservado; cache privado. |
| Typecheck e lint | PASS/exit0 | Fonte original; executados antes da inclusão das fixtures descartáveis de auditoria. |
| Build padrão, runtime, SDK público e produto | PASS/exit0 | Código compilado; sem construir ou publicar imagem nesta rodada. Build web avisa chunk de633,62kB minificado. |
| Núcleo:106 arquivos selecionados | 1.403 PASS | Runtime, contratos, modelos, policy, approvals, canais, RAG e observabilidade. |
| API:76 arquivos selecionados | 737 PASS | Identidade, autorização, approvals e fronteiras HTTP; sem PostgreSQL próprio. |
| Web/produto:41 arquivos selecionados | 231 PASS | Console/clientes e consumidor; denominador de produto separado na discriminação. |
| SDK/shared/dados:43 arquivos selecionados | 382 PASS | Seleção sem dependência explícita de banco; não representa suíte PG. |
| Conformidade:4 arquivos | 97 PASS | Invariantes dos caminhos cobertos. |
| SDK Python, runner documentado | 47 PASS | Python3.12.3/Node22, stdio e filhos sintéticos reais. |
| Sondas de caracterização | 21 PASS |6 API/DNS +9 modelos/canais/reconciliação +6sandbox/FS/processo; incluem controles bons. PASS significa comportamento caracterizado, inclusive defeito confirmado. |
| `npm audit --json` | zero vulnerabilidades/exit0 | Resultado do registro no momento da consulta; não inclui pacotes do sistema operacional da imagem. |

São **2.897 regressões distintas**, sem falhas, pendências ou skips nas invocações próprias, mais **21 sondas**. Não se somam repetições ou números remotos a esse total. [Discriminação](evidence/AUD-SCORE-20261028/test-summary.json), [seletores exatos](evidence/AUD-SCORE-20261028/test-groups.json), [comando/API](evidence/AUD-SCORE-20261028/api-tests.json) e [sonda sandbox](evidence/AUD-SCORE-20261028/sandbox-characterizations-current.log).

As primeiras fixtures próprias tiveram erros de procedimento, preservados nos logs: dispatch sem o argumento `takeoverActive`, nome incorreto do método de fingerprint/campos do handle, ausência do journal obrigatório e `executionId` herdado da fixture sem store correspondente. Só as fixtures foram corrigidas após ler o contrato. Os logs anteriores continuam no pacote; não são regressões atribuídas ao programa nem execuções válidas dos cenários que não chegaram à fronteira. As fontes do programa permaneceram idênticas.

### Evidência remota conferida, sem reexecução local integral

O [Verify40059876282](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/40059876282) pertence à main61e5: **35gates PASS**, **34seals registrados**, **56 artefatos conferidos por tamanho/SHA256**. O ZIP baixado coincide com o digest informado pelo GitHub; cinco inputs centrais foram comparados com blobs do SHA. A conclusão hospedada da verificação independente de atestação foi consultada; a auditoria não repetiu sua verificação criptográfica. [Recibo de integridade](evidence/AUD-SCORE-20261028/main-ci-integrity.json).

- Unitário: **7.087 PASS**, zero failed/pending/todo; o denominador do core exclui `products/`.
- PostgreSQL: **338 PASS**, zero failed/pending/todo. Esse conjunto não é somado como independente dos unitários.
- E2E: **12 esperados**, zero unexpected/skipped/flaky.
- Cobertura agregada: **94,53% statements;91,23% branches;96,05% functions;95,36% lines**. É a cobertura da configuração publicada, que exclui, por exemplo, frontend e adapters PG da cobertura unitária e os verifica em gates próprios; não se anuncia cobertura de todo arquivo do repositório.
- Certificação emitida: **AAA_CONTROLLED/CONDITIONAL_GO**, com integrações externas e signoff pendentes, conforme seu próprio resultado.
- [Publicação40068353242](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/40068353242): build/scan/attest/push e verificação independente da imagem SUCCESS em24/10. Publicação em registry não significa deploy ou release operacional autorizado.
- [Security40297467983](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/40297467983), em26/10 no mesmo SHA: secret-scan, CodeQL e supply-chain SUCCESS; **image-scan FAILURE**. Não se usa o scan verde de24/10 para esconder a falha posterior.

Logs e resultados: [checks consultados](evidence/AUD-SCORE-20261028/main-checks.json), [resultado da certificação](evidence/AUD-SCORE-20261028/hosted-ci/gate-outputs/certify/certification/phase10-result.json), [scan posterior](evidence/AUD-SCORE-20261028/main-image-scan-raw.log).

## 5. Achados prioritários

P1 significa falha de alto impacto no perfil afetado; P2, lacuna material; P3, manutenção/clareza. Prioridade de execução e gravidade não são sinônimos. Não se demonstrou ataque não autenticado, vazamento de dados reais ou incidente de produção. Os cenários de filesystem exigem composição divergente ou possibilidade de alterar diretórios no workspace.

### F01 — P1: a fábrica pública perde a obrigação de sandbox

**Reproduzido.** O mesmo executor com `sandbox:WORKSPACE`, sem gate configurado, é recusado no caminho `tools` (`UNSAFE_REQUEST`,0execuções) e executado no caminho `capabilities` (`COMPLETED`,1execução). WORKSPACE e PROCESS também geram o mesmo fingerprint após normalização. [Sonda e controle](evidence/AUD-SCORE-20261028/audit0625-sandbox.test.ts.txt).

A [normalização](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/harness/src/capability-boundary.ts#L249) omite `sandbox`; o [pipeline](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/harness/src/kernel/pipeline.ts#L351) interpreta ausência como NONE. Não depende de executar comando perigoso.

**Fechamento recomendado:** preservar/validar modo e binding no registro, fingerprint e adapter; testar a fábrica pública com capability declarada e gate ausente/negado/permitido. Encaminhar ao integrador do núcleo/PAR-K e PAR-X, respeitando seus claims; não reconstruir candidatas alheias.

### F02 — P1: PROCESS permite ler fora do workspace e herda ambiente

**Reproduzido com bubblewrap real.** Subprocesso leu sentinela sintética fora do workspace e recebeu variável de ambiente sintética. Não se leu qualquer arquivo pessoal ou segredo. O [runner](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/sandbox/src/run.ts#L74) monta `/` como readonly e não define `env` no spawn. Readonly impede escrita, mas não proíbe leitura. Isso não satisfaz a restrição de leitura da SPEC0196.

**Fechamento:** filesystem mínimo, mounts autorizados e allowlist de ambiente; sentinela externa deve ser negada e controle interno deve passar. Rota canônica PAR-X01/X02; não alterar sysctl ou permissões do host para obter verde.

### F03 — P1: ferramenta FS não respeita o workspace do handle

**Reproduzido na fronteira da ferramenta.** Handle concedendo A foi entregue a `fs.read` configurado para B; a ferramenta leu a sentinela de B. A raiz capturada pela fábrica é usada sem conferir a autoridade do contexto. [Fonte](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/sandbox/src/fs-tools.ts#L270).

**Fechamento:** composição divergente deve falhar antes do acesso; usar a interseção autorizada ou exigir igualdade das identidades de raiz. A reprodução não afirma que todo host já compõe raízes divergentes.

### F04 — P1: troca de diretório redireciona escrita para fora da raiz

**Reproduzido.** Durante a espera legítima pelo journal, a sonda substituiu um subdiretório por symlink para outra pasta sintética própria. `fs.write` respondeu SUCCEEDED e escreveu nessa pasta externa. São dois diretórios criados/limpos pela auditoria. A [escrita por caminho nominal](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/sandbox/src/fs-tools.ts#L141) ocorre depois da [espera pelo journal](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/sandbox/src/fs-tools.ts#L349).

**Fechamento:** vincular as operações à identidade do diretório, com resolução que não atravesse symlinks/escapes, ou contenção equivalente; repetir a troca concorrente e um controle de escrita autorizada. Rename atômico do arquivo final, sozinho, não fecha a janela.

### F05 — P1/P2: cancelamento e prazo não cobrem todo o trabalho

**Inspeção estática; encerramento após cancelamento não reproduzido nesta rodada.** O [shell](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/sandbox/src/shell-tool.ts#L296) chama o runner sem `context.signal`; o runner usa timeout próprio. Assim, o kernel pode encerrar o turno antes do subprocesso. Log, avaliação do sandbox e algumas liquidações também contêm awaits sem limite global. Interfaces e esperas foram lidas; não se afirma medição de vazamento de processo nesta auditoria.

**Fechamento:** supervisor/prazo/cancelamento conectados a toda a árvore e portas, com prova de fim e estado incerto quando houver efeito tardio. Reusar a frente PAR-X/K08 existente; o material em revisão não é implementação aceita na main.

### F06 — P1: hash aprovado não prova a instrução enviada ao provider

**Reproduzido.** Registry aprovado com instruçãoA; request com systemB: o fake provider recebeu B junto do hash deA. Controle com prompt revogado bloqueou a chamada. O [gateway](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/model-gateway/src/gateway.ts#L350) encaminha `request.input` e `prompt.sha256` separadamente. [Sondas](evidence/AUD-SCORE-20261028/audit0625-boundaries.test.ts.txt).

**Fechamento:** renderer/material aprovado com vínculo verificável até a serialização do provider, preservando mensagens dinâmicas conforme contrato. Retomar UP91-015/SPEC0167 em vez de considerar hash de referência como prova do conteúdo executado.

### F07 — P1/P2: emissão de recurso e sua auditoria continuam separadas

**Task/approval reproduzidos em memória:** após injetar falha em `audit.append`, os POSTs respondem500, deixam1recurso novo e0eventos. Controles saudáveis geram recurso+evento e200. [Sonda](evidence/AUD-SCORE-20261028/audit0625-characterizations.test.ts.txt), [task](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/apps/api/src/server.ts#L1818), [approval](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/apps/api/src/server.ts#L1964).

**Emissão de capability approval: estático.** A [rota](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/apps/api/src/server.ts#L2159) também chama `issue` antes do audit; o repositório insere independentemente. Falha posterior pode deixar autorização emitida e repetição com nonce em conflito. O cenário PG não foi executado pelo auditor.

**Fechamento:** transação ou outbox durável para recurso+evento, com retry convergente e paridade memória/PG. Reusar UP91-018/U03/SPEC0257; os mecanismos atômicos de transição já existentes não encerram a emissão.

### F08 — P1: recuperação da decisão não cobre estados posteriores

**Reprodução parcial na função real + inspeção do SQL.** Reconciliador registra o evento para APPROVED, mas rejeita EXECUTED antes do append. A API libera a execução antes de gravar o evento; o [worker](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/apps/worker/src/homolog-worker.ts#L144) busca apenas APPROVED/REJECTED, e o [reconciliador](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/agent-core/src/approval-reconciliation.ts#L90) exige igualdade entre status atual e decisão.

Se houver crash nesse intervalo e avanço de execução, a recuperação inspecionada não recompõe o evento. O envelope persistido preserva informação, mas não substitui o evento ausente. Não foi executada campanha de crash PG nesta auditoria.

**Fechamento:** decisão+evidência durável atômicas ou replay pelo envelope imutável independente do estado de execução; provar corrida com worker, retry e crash. Rota UP91-018 e núcleo/persistência.

### F09 — P1 de qualificação: scan posterior da imagem falha

**Registro primário remoto observado.** O scanner de26/10 reporta `libssl3`, `CVE-2026-84782`, HIGH, instalado`3.0.20-1~deb12u2`, corrigido`3.0.22-1~deb12u2`, e termina com falha. Estes são os valores do log, sem alegação de exploração ou nova análise independente do CVE. O npm audit atual permanece zero porque mede outro universo de dependências.

**Fechamento:** selecionar/requalificar a base corrigida no programa de imagem existente e repetir scan/CI/proveniência da imagem resultante. Não dispensar o achado com o aceite antigo de vulnerabilidade então sem correção. Imagem/T3 continua com seu responsável.

### F10 — P2/contrato a esclarecer: classificação do registro não governa a rota

**Comportamento reproduzido.** Registry CLINICAL + request INTERNAL alcança fake provider de localização external; request CLINICAL é corretamente recusado antes dele. O [código](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/model-gateway/src/gateway.ts#L569) calcula a classificação mais restritiva, mas a rota recebe a classificação original do request.

**Limite semântico:** se classificação do prompt for apenas o teto de dados permitido para seu uso, e não a classe do próprio conteúdo, a aceitação tem interpretação distinta. Esta auditoria não trata a ambiguidade como vazamento clínico demonstrado. Fixar essa semântica no contrato e garantir que conteúdo realmente restrito nunca seja rebaixado por um rótulo do caller.

### F11 — P2: consumo desconhecido é representado como zero

**Reproduzido no adapter OpenAI-compatible com fetch falso:** resposta sem usage resulta em0/0tokens. [Fonte](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/model-gateway/src/providers/openai-compatible.ts#L239). Por leitura, o gateway também valida saída antes de registrar usage disponível.

**Fechamento:** distinguir desconhecido de zero e definir contabilização conservadora/reconciliação para chamadas executadas cuja saída é rejeitada. Não foi demonstrada cobrança real ou estouro financeiro.

### F12 — P1 condicionado ao contrato do destino: HTTP503 libera reenvio

**Reproduzido sem rede:** duas chamadas caller com a mesma operação e adapterEvolution retornando503 produziram2tentativas HTTP falsas; controle200 produziu1. O [adapter](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/channel-gateway/src/adapters/evolution.ts#L268) marca retryable sem `effectUnknown`; o journal é liberado. Chatwoot contém classificação equivalente por inspeção.

**Impacto:** se o destino aceitar antes de responder erro, o retry poderá duplicar. A auditoria não observou mensagem real duplicada. **Fechamento:** manter UNCERTAIN quando ausência de efeito não for comprovada, ou qualificar idempotência do destino; provar perda de ACK/erro após aceitação. Rota de canais/UP91 correspondente.

### F13 — P1 no perfil organizado do produto: preview e fidelidade não vinculam confirmação

**Estático.** O consumidor persiste o resultado antes de enviar o preview; falha de envio vira log e a seleção para confirmar não exige recibo da apresentação. A checagem numérica compara conjuntos, não paciente/campo/unidade. [Preview](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/products/shift-assistant/src/assistant.ts#L547), [confirmação](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/products/shift-assistant/src/assistant.ts#L697), [números](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/products/shift-assistant/src/organizer.ts#L199).

NO_MODEL contém a ativação normal da organização por modelo; não se remove esse bloqueio. **Fechamento:** SPEC0179/PISO-002/003/004, revisão e recibo de todas as partes do preview, confirmação exata e fidelidade de associação, com fontes sintéticas. O problema pertence ao produto e não autoriza ação clínica nem altera sua barra.

### F14 — P2: RAG, sessões, streaming e MCP não estão integralmente qualificados

**Inspeção e documentação.** FAQ com filtro não equivale a resposta institucional vinculada a conteúdo aprovado/revogado; metadata do catálogo não é ingestão. Eventos de sessão não demonstram continuidade conversacional entre processos. Um enum `origin:mcp` não prova adapter governado. As carteiras PAR/C100 já descrevem os trabalhos restantes.

**Fechamento:** seguir a direção atual do núcleo e seus aceites de conteúdo/retomada/streaming/MCP em candidatas identificadas. Não usar presença de tipos, captura de fonte ou testes de parser como aceite funcional e não criar outra carteira concorrente.

### F15 — P2: migration0021 pode bloquear eventos legítimos de outro formato

**Estático, SQL não executado.** O [pré-check](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/persistence/migrations/0021_approval_decision_audit_dedupe.sql#L32) agrupa `approval_decision` por approvalId/decision mesmo ausentes. Eventos de [atendimento](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/packages/persistence/src/attendance-approval.ts#L65) usam approvalRequestId/status. Dois desses eventos no mesmo tenant podem formar o grupo NULL/NULL e disparar duplicidade, embora o índice UNIQUE tenha semântica diferente para NULL.

**Fechamento:** campanha PG com histórico misto populado, alinhamento do pré-check com a população deduplicável e forward-fix conforme contrato de migrations. Não alterar banco ou migration histórica sem o gate correspondente.

### F16 — P2: revogação é desigual entre superfícies

**Estático/documentado.** Sessão válida preserva papel armazenado em rotas sensíveis fora de caso, enquanto rotas de caso consultam principal corrente. SPEC0254 reconhece janela até15min. A autorização de mutação por caso também pode terminar antes da escrita, condição permitida pela SPEC0251.

**Fechamento:** qualificar produtor/sessão/revogação do perfil aprovado, sem apresentar uma janela assumida como violação escondida do contrato. Reusar UP91-025/SPEC0262; não contornar com NODE_ENV=test em produção.

### F17 — P2: console não alcança conversas além da primeira página

**Estático.** [App](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/61e5cf8f41d15cc41ad524f8a57476d4f6080131/apps/web/src/App.tsx#L420) solicita25conversas com offset0; a navegação de aprovação limita casos às sessões carregadas. **Fechamento:** paginação/busca por caso e teste com mais de25conversas. Não houve teste visual próprio desse cenário.

### F18 — P2: extensão interna pode relaxar controle ou resultado

**Estático; superfície interna não suportada para consumidores.** Hooks internos recebem estado mutável e podem remover grant ou substituir resultado após controles. A ordem de execução não prova monotonicidade. **Fechamento:** estado privilegiado separado, recusas não relaxáveis e regressão interna. Não é apresentado como bypass exposto pela API pública suportada.

### F19 — P2: detecção de queda do host e recuperação no destino não demonstradas

O monitor publicado na API não demonstra alarme quando host/API caem juntos; `OnFailure` dos templates de backup/restore está comentado. Runbook descreve snapshot diário de Vault sem agendamento equivalente demonstrado. Restore e hardening de CI têm valor, mas não provam operação instalada no destino.

**Fechamento:** reusar SRV-01/03/04/05 e U13–U16, monitor externo e receptor existentes nas candidatas dos donos; demonstrar alerta recebido, falha de backup/Vault e restauração no ambiente autorizado. Esta auditoria não declara que o hospital não possui infraestrutura: ela não foi acessada.

### F20 — P2/P3: estado corrente difícil de recuperar

README e topos dos ledgers preservam integrações antigas como pendentes, embora a main tenha CI/publicação posteriores. A coordenação local contém milhares de linhas e a timelineGBrain supera2MB. Há muita evidência, mas o ponto de entrada não resume o estado vigente de maneira confiável. A SPEC do produto ainda descreve chamada direta ao provider enquanto o organizador já usa gateway.

**Fechamento:** integrador concilia um índice atual com SHA/candidata, capacidade entregue, revisada, aceita, pendência e próximo responsável. Preservar históricos e claims; incorporar deltas sem reescrever relatos de pares. Rota U01/HISO-008 e documentação do produto.

## 6. Ordem recomendada de remediação

| Ordem | Resultado necessário | Rota existente / responsável funcional | Evidência de fechamento |
|---|---|---|---|
| 1 | Preservar autoridade de sandbox em registro, tool e syscall/processo | Integrador do núcleo + donos PAR-X/FS/shell | Controles bons/negativos de F01–F05 pela fábrica pública; raiz/ambiente/cancelamento efetivos. |
| 2 | Vincular prompt e medição ao material realmente executado | Model gateway / UP91-015 / SPEC0167 | Instrução divergente recusada, classificação definida, usage desconhecido distinto de zero. |
| 3 | Tornar criação/emissão/decisão auditável recuperável | API/persistência / UP91-018 / U03 | Rollback/outbox, retry convergente, avanço/crash do worker e histórico misto PG. |
| 4 | Requalificar imagem e não repetir efeito incerto | Dono da imagem + dono de canais | Scan atual verde e proveniência nova; ACK perdido/503 preservando UNCERTAIN ou idempotência comprovada. |
| 5 | Concluir a candidata integrada do núcleo e seus aceites | Integrador L0 e titulares das lanes PAR/C100 | Mesmo SHA/configuração com sessões/contexto/streaming/MCP apenas no escopo aprovado; gates completos. |
| 6 | Qualificar ambiente e consumidor separadamente | Operação/SRV + dono PISO | Identidade/alertas/restore do destino e preview/fidelidade/homologação próprios do produto. |
| 7 | Consolidar estado e navegação | Integrador documental + frontend | Índice atual verificável e caso acessível após25conversas. |

As rotas são recomendações de triagem. Os responsáveis concretos precisam ser reconciliados nos claims; este relatório não toma suas reservas nem abre BUILD sem gate. Não se sugere eliminar testes, reduzir políticas, reabrir decisões já concedidas ou conceder produção por média.

## 7. Limitações e parecer

- Auditoria ampla por amostragem dirigida, não prova de ausência de outros defeitos. Notas são orientativas; severidades indicam perfil/precondições.
- Não houve suíte global/coverage/PG/E2E/certify local integral nesta rodada. Seus relatórios hospedados no SHA foram conferidos separadamente.
- Não se executaram providers reais, dados reais, integrações clínicas/financeiras, pentest externo, IdP de destino, navegador próprio, restauração de produção ou teste de usuários.
- Artefatos de PR29/30 e avanços privados do programa podem endereçar partes dos achados; precisam de integração e evidência própria. Não receberam desconto nem aceite automático.
- A preservação da fonte foi conferida pelos hashes dos arquivos originais; caches/builds/probes deliberados do Lead ficam fora dessa sentinela. Crítica I1 não equivale a autoridade humana I3.
- Os ledgers99/20/30 já estavam modificados por outros agentes. A regra5 impede edição concorrente; os três deltas solicitados estão no [handoff](../08_runtime/handoffs/aud_score_20261028.md), aguardando incorporação pelo integrador. Não se afirma atualização canônica que não ocorreu.

**Parecer:** a auditoria solicitada está entregue com evidência reproduzível e notas. O programa possui uma base útil e verificada, mas **falha em requisitos obrigatórios de contenção e integridade** no perfil inspecionado; produção permanece **NO_GO**. Próxima ação: o integrador reconciliar F01–F05 com os donos de sandbox/PAR-X e selecionar a menor correção autorizada, mantendo os controles sintéticos como aceites de regressão.
