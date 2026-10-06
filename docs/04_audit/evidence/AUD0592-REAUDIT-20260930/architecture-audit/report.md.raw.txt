# AUD0592 — arquitetura e autoridade (I1, C01–C21)

Fonte selada: `/tmp/cvg-aud0592-20260930/repo`. HEAD da captura `3085e865a1e467c7fcc6489c1772b2818dc7f4f9`; HEAD original do contrato `f8ccc845e6f177959bc5d40e0cec59c71e595b5b`. Contrato SHA-256 `bf07b6f1e4046956bfde263c4b6e4a9afbd5ee7f57e96f3f2a9801464b249968`. Manifesto de fontes SHA-256 `52fff07f7ff9b7fb86d5942172a912db52ab5db62142560052100e72c0b98cc0`.

Veredito: **remediação necessária, julgamento provisório, sem gate PASS e sem liberação de produção**. Média simples da lane: **61.14/100**. Achados: **0 P0 observados, 9 P1 e 4 P2**. A média não compensa falha de autoridade ou requisito obrigatório.

## Método, independência e limites

Auditor I1 fresh-context, mesma família conforme delegação, depth1, zero descendentes. Leitura de código, configuração, contratos normativos e fontes de testes; nenhuma execução de código do produto. Não houve build, npm, certificação, rede, serviço, banco ou dados reais. Somente os três arquivos deste diretório foram escritos. O claim AUD0592 foi fornecido pelo Lead e confirmado na coordenação. As tarefas/aceites UP91 não foram reduzidos, aprovados ou encerrados.

AGENTS, constituição, coordenação e ledgers99/20/30 foram lidos para limites operacionais. Esses arquivos e documentos normativos têm narrativas históricas incidentais; elas foram desconsideradas. Não foram seguidos links a auditorias/pareceres anteriores, certificados, história .gauntlet ou evidências UP91-EXEC para formar notas. A correspondência UP91 foi consultada por IDs/títulos no backlog de controle depois de identificar os caminhos. Propostas normativas são obrigações futuras, não autoridade inferida nem prova de implementação.

A qualificação é estática: os cenários abaixo descrevem controle de fluxo e provas propostas, **não reproduções executadas**. A nota82 em governança avalia regras e bloqueios visíveis, não execução integral de gates. Nenhuma nota95–100 foi atribuída. Desconhecido não é PASS. A lane cobre integralmente C01–C21; C22–C42, certificação e os13gates ficam com as demais lanes/Lead. Não houve comparação com fontes vivas concorrentes do produto.

## Caminho público confrontado

1. Biblioteca: package root `@cvg/harness` exporta `createOperationalHarness`; a factory exige tools ou capabilities, obriga journal para capabilities, calcula/confere fingerprint e seleciona single_pass/iterative. Configuração iterative incompleta devolve STATE_CONFLICT. As classes também são exports de suporte, não prova de integração produtiva.
2. HTTP: `server.ts:887` autentica, resolve tenant, valida submission e grava em operationalExecution; polling/resume usam registro durável.
3. Worker: `OperationalExecutionWorker` claim/heartbeat e buffers de sinks → `execution-spine.ts:1377` chama a factory com executionId/resume derivado do registro. Composição PG oferece authority/journal/step-store; worker operacional recusa NODE_ENV=production e defaults são sintéticos.
4. Invariantes positivos: policy vem antes da aprovação/tool, pending approval pausa, tenant/fingerprint/resume são vinculados, checkpoint é validado, ALLOW ausente/erro tende a stop e fontes sem provider não fazem busca. Esses controles não suprem pisos/lifecycle opcionais.
5. Contraexemplos na mesma factory: approval APPROVED sem execution atravessa até tool; ALLOW/descriptor permissivo não é elevado por risk; HybridOrchestrator pode reparar antes de prestar contas; contextItems não chegam à decisão; compose não recebe observações e extractor ausente valida tudo.
6. Artefato publicado: Dockerfile:29 executa main da API; esse main injeta resolver HMAC/telemetry, sem store/OIDC. Adapters OIDC/PG isolados não equivalem ao boot real. Sessão trusted no caminho default falha fechada/indisponível.

## Notas por critério

| Critério | Título | Nota |
| --- | --- | --- |
| C01 | Governança CVG e segurança do processo | 82/100 |
| C02 | Discovery e delimitação de escopo | 62/100 |
| C03 | PRD e aceites de produto | 66/100 |
| C04 | SPEC e aderência da composição | 69/100 |
| C05 | Consistência e atualização documental | 70/100 |
| C06 | Rastreabilidade e evidências | 74/100 |
| C07 | Preservação do histórico e honestidade | 78/100 |
| C08 | Separação runtime, orchestrator e produto | 79/100 |
| C09 | Neutralidade e isolamento do legado | 76/100 |
| C10 | Modularidade e manutenção | 57/100 |
| C11 | Contratos públicos e compatibilidade | 64/100 |
| C12 | Configuração e construção reproduzível | 69/100 |
| C13 | Execução durável, leases e checkpoints | 75/100 |
| C14 | Orquestração e limites de consumo | 43/100 |
| C15 | Engenharia e transporte de contexto | 41/100 |
| C16 | Resposta fundamentada e uso de evidências | 38/100 |
| C17 | Approval, pausa, retomada e efeito incerto | 48/100 |
| C18 | Policy e piso de segurança reutilizável | 39/100 |
| C19 | Borda HTTP, origem, input e SSRF | 67/100 |
| C20 | Sessão, OIDC/MFA e composição publicada | 38/100 |
| C21 | RBAC e isolamento de autoridade | 49/100 |

### C01 — Governança CVG e segurança do processo: 82/100

Constituição explicita pipeline, gates por risco, aprovação humana e proibições permanentes. O worker operacional recusa produção por construção. Há governança normativa consistente; esta lane não autentica decisões humanas históricas nem a execução de todos os gates.

Fontes seladas: `AGENTS.md:5`; `docs/07_agents/AGENTS.md:33`; `docs/07_agents/AGENTS.md:103`; `docs/08_runtime/agent_coordination.md:8`; `apps/worker/src/operational-harness-worker.ts:211`.

Gaps/limitações: Leitura estática; logs de auditorias anteriores não serviram de prova. Continuidade dos ledgers fica com o Lead; escrita desta lane limitada à saída.

### C02 — Discovery e delimitação de escopo: 62/100

Discovery separa fundação neutra e consumidor real; o gate do primeiro consumidor declara NOT_VALIDATED. O problema técnico está definido, mas fluxo, responsável, população, volume e SLA do consumidor continuam sem decisão; não presumir que Secretary é o piloto.

Fontes seladas: `docs/00_discovery/0090_discovery_validation.md:3`; `docs/00_discovery/0019_platform_first_consumer_pilot.md:8`; `docs/01_prd/0027_harness_refoundation.md:9`.

Gaps/limitações: Não houve pesquisa com consumidor nem evidência de valor operacional real. Limite legítimo de escopo, não autorização para inventar negócio.

### C03 — PRD e aceites de produto: 66/100

PRD0027 oferece aceites concretos para contratos/factory/governança e delimita Phase0/1. A consolidação de WHAT contém positivos e negativos úteis, mas é candidata; aceites de núcleo completo, identidade e consumer não estão todos satisfeitos pela composição atual.

Fontes seladas: `docs/01_prd/0027_harness_refoundation.md:15`; `docs/01_prd/0027_harness_refoundation.md:32`; `docs/01_prd/0014_up91_platform_prd_reconciliation.md:17`; `packages/harness/src/createOperationalHarness.ts:70`.

Gaps/limitações: Aceites novos/propostos não tratados como aprovados. Sem UAT, decisão de consumidor ou exercício público nesta lane.

### C04 — SPEC e aderência da composição: 69/100

A fábrica é neutra e o worker chama createOperationalHarness após claim, fornecendo executionId/resume. O HTTP persiste a solicitação. Aderência da fundação existe; contratos corretivos0166 estão PROPOSED e a autoridade corporativa exigida em0152 não está ligada ao main selado.

Fontes seladas: `docs/02_spec/0127_harness_refoundation.md:37`; `apps/api/src/server.ts:887`; `packages/harness/src/execution-spine.ts:1349`; `docs/02_spec/0166_governed_context_response_budget.md:3`; `docs/02_spec/0152_corporate_oidc_authority_contract.md:11`.

Gaps/limitações: Sem comprovar paridade integral entre neutral harness e kernel turn-oriented. SPEC0127 é histórica da Phase0/1; não interpretar extensões posteriores automaticamente como violação.

### C05 — Consistência e atualização documental: 70/100

PUBLIC_API descreve a seleção atual de perfis e distingue ports neutros do kernel. README e overview/package map ainda orientam principalmente Phase0/1; SPEC0107 não documenta o contrato operacional de executions/session e suas autoridades. O leitor precisa reconciliar documentos de horizontes diferentes.

Fontes seladas: `docs/architecture/PUBLIC_API.md:3`; `docs/architecture/PUBLIC_API.md:14`; `docs/architecture/HARNESS_OVERVIEW.md:31`; `docs/architecture/PACKAGE_MAP.md:9`; `docs/02_spec/0107_contratos_de_api.md:36`; `README.md:7`.

Gaps/limitações: Links para relatórios anteriores não foram seguidos. Não se fez varredura de links/formatação de todo o repositório. Gap I1-F10.

### C06 — Rastreabilidade e evidências: 74/100

IDs e tasks normativas ligam requisitos aos ports; execution-spine bufferiza auditoria por execução, step-store sela/valida checkpoint e há fontes de testes de restart pela fábrica. Evidência é rastreável no código, mas existência de teste/artefato não demonstra seu resultado atual.

Fontes seladas: `docs/02_spec/0127_harness_refoundation.md:61`; `packages/harness/src/execution-spine.ts:1355`; `packages/harness/src/iterative-runtime.ts:1223`; `packages/persistence/src/operational-step-postgres.ts:302`; `apps/worker/src/__tests__/operational-harness-process-restart.integration.test.ts:235`.

Gaps/limitações: Certificados, contagens e PASS históricos não aceitos. Auditoria não comprova atomicidade/durabilidade de toda trilha nem execução dos testes.

### C07 — Preservação do histórico e honestidade: 78/100

Documentos distinguem contratos atuais, propostas e implementação sintética; PUBLIC_API avisa que a factory não prova requisitos produtivos. Nesta revisão todas as fontes ficaram readonly e as referências estão vinculadas por hash. Honestidade documental é positiva, mas não é possível comprovar preservação histórica integral sem inspecionar história excluída.

Fontes seladas: `docs/architecture/PUBLIC_API.md:7`; `docs/architecture/PUBLIC_API.md:38`; `docs/02_spec/0166_governed_context_response_budget.md:11`; `AGENTS.md:31`.

Gaps/limitações: História git, .gauntlet, UP91-EXEC e auditorias anteriores não foram consultados como evidência de julgamento. Preservação integral histórica permanece UNKNOWN; nenhuma alegação de certificação herdada.

### C08 — Separação runtime, orchestrator e produto: 79/100

Manifestos do núcleo limitam dependências a contracts/orchestrator, e a factory escolhe runtimes governados sem DB/provider/domain imports. O orchestrator decide; os dispatchers avaliam policy/approval antes de tool. As duas famílias de runtime têm contratos distintos que exigem adapters explícitos.

Fontes seladas: `packages/contracts/package.json:8`; `packages/orchestrator/package.json:15`; `packages/harness/package.json:15`; `packages/harness/src/createOperationalHarness.ts:79`; `packages/harness/src/iterative-dispatch.ts:285`; `docs/architecture/PUBLIC_API.md:14`.

Gaps/limitações: Separação de responsabilidade não garante pisos de segurança nem lifecycle obrigatório. Guardas de imports lidas, não executadas; sem prova de consumidor compilado por exports dist.

### C09 — Neutralidade e isolamento do legado: 76/100

O núcleo neutro não importa produto e composição legada é explicitamente concentrada em legacy-composition; workspaces do legado possuem paths separados. API compartilhada ainda monta jornadas e desenvolvimento publica preset Secretary, portanto o deploy atual continua misto e não é consumidor neutro completo.

Fontes seladas: `apps/api/src/legacy-composition.ts:1`; `apps/api/src/server.ts:1690`; `apps/api/src/server.ts:5191`; `package.json:6`; `tests/architecture/dependency-direction.test.ts:22`.

Gaps/limitações: Sem validar remoção/cutover/rollback do legado. Inventário de cada dependência legada não reavaliado; compatibilidade pode ser intencional.

### C10 — Modularidade e manutenção: 57/100

Ports e extrações internas melhoram a composição, mas server.ts tem5531linhas, control-plane-store1438, runtime do kernel1498 e iterative-runtime1488. Server concentra HTTP, sessão, autorização, persistência e plataforma; manutenção e revisão exigem atravessar muitos invariantes numa mesma unidade.

Fontes seladas: `apps/api/src/server.ts:333`; `apps/api/src/server.ts:5102`; `packages/platform/src/control-plane-store.ts:1`; `packages/agent-runtime/src/runtime.ts:1`; `packages/harness/src/iterative-runtime.ts:1`; `docs/02_spec/0168_runtime_approval_request_extraction.md:13`.

Gaps/limitações: Tamanho é indicador, não defeito funcional isolado. Sem análise dinâmica de complexidade ou mudança; I1-F11 especifica preservar comportamento.

### C11 — Contratos públicos e compatibilidade: 64/100

Exports root, tipos branded e validação de fingerprint dão contrato claro de construção. Persistem ports permissivos para lifecycle sensível, knowledge sem tenant explícito e mistura de documentação HTTP antiga/nova; private workspace não equivale a distribuição externa versionada ou compatibilidade provada.

Fontes seladas: `packages/harness/package.json:8`; `packages/harness/src/createOperationalHarness.ts:128`; `packages/contracts/src/contracts.ts:329`; `packages/contracts/src/execution-v2.ts:654`; `docs/architecture/PUBLIC_API.md:48`; `docs/02_spec/0107_contratos_de_api.md:89`.

Gaps/limitações: Nenhum build/import do dist foi executado; compatibility smoke somente inspecionado em fonte. Endurecer optional ou campos obrigatórios requer revisão T3; não fazer mudança silenciosa.

### C12 — Configuração e construção reproduzível: 69/100

Root exige Node22, lockfile e imagem com digest fixo; builder produz configuração TypeScript estrita e imagem API por dist. Entretanto generatedConfigRoot é global em /tmp e apagado a cada build; contextDir padrão também é compartilhado, vulnerável a interferência entre builds paralelos.

Fontes seladas: `package.json:103`; `Dockerfile:7`; `Dockerfile:16`; `Dockerfile:29`; `scripts/build-runtime.mjs:30`; `scripts/build-runtime.mjs:59`; `scripts/build-runtime.mjs:98`.

Gaps/limitações: Sem npm/install/build/Docker nesta lane; não atestada reprodução de clone limpo. Imagem examinada é API; não concluir packaging produtivo do worker. I1-F12.

### C13 — Execução durável, leases e checkpoints: 75/100

Caminho HTTP→store→worker→factory existe em código: claim transacional SKIP LOCKED, fence por attempt/owner/expiry e checkpoint tenant/execution validado. Worker injeta executionId/resume a partir do registro. Está implementado no controlado; produção operacional é expressamente recusada.

Fontes seladas: `apps/api/src/server.ts:896`; `packages/persistence/src/operational-execution-postgres.ts:450`; `packages/persistence/src/operational-execution-postgres.ts:1234`; `packages/harness/src/execution-spine.ts:1377`; `packages/persistence/src/operational-step-postgres.ts:347`; `apps/worker/src/operational-harness-worker.ts:211`.

Gaps/limitações: Sem DB/restart/crash/concorrência executados; adequação de todas as transições não é PASS. Consistência transacional e recuperação geral pertencem à lane C22–42; não pontuadas aqui.

### C14 — Orquestração e limites de consumo: 43/100

Há stops de steps/model/tools/tokens/cost/duração e loop detection. Porém HybridOrchestrator faz repair dentro de decide usando o mesmo budget; runtime só contabiliza turn após retorno, e exceção não entrega uso parcial. maxModelCalls1 pode originar segunda tentativa antes da verificação de excesso.

Fontes seladas: `packages/harness/src/iterative-runtime.ts:706`; `packages/harness/src/iterative-runtime.ts:751`; `packages/orchestrator/src/hybrid-orchestrator.ts:160`; `packages/orchestrator/src/hybrid-orchestrator.ts:175`; `packages/orchestrator/src/hybrid-orchestrator.ts:193`; `packages/harness/src/iterative-dispatch.ts:996`.

Gaps/limitações: Sequência inferida diretamente do controle de fluxo; não reproduzida nesta lane. Timeout não comprova ausência de custo externo; há lacuna de reserva por tentativa. I1-F03.

### C15 — Engenharia e transporte de contexto: 41/100

ContextEngine monta objective/instructions/contextItems, prioridades e marcas de trust. HybridOrchestrator serializa goal/state/summary/capabilities, mas não transporta objective/instructions/contextItems; snapshot enviado tem somente goal. Trimming permite mandatory acima do teto e prompt usa observações não aparadas.

Fontes seladas: `packages/harness/src/context-engine.ts:83`; `packages/harness/src/context-engine.ts:151`; `packages/harness/src/context-engine.ts:290`; `packages/orchestrator/src/hybrid-orchestrator.ts:69`; `packages/orchestrator/src/hybrid-orchestrator.ts:175`; `packages/harness/src/createOperationalHarness.ts:91`.

Gaps/limitações: Composições scripted podem aparentar sucesso sem testar transporte ao modelo. Nenhum marcador/model spy executado; segurança semântica de injection não comprovada. I1-F04.

### C16 — Resposta fundamentada e uso de evidências: 38/100

Runtime registra observações e evaluator checa ACTION_CONFIRMED, mas composeResponse não envia essas observações; modelo recebe intenção/user/context original. Sem claimExtractor validateClaims retorna valid=true; responseText pode saltar compose. Knowledge result não exige elegibilidade institucional/tenant no contrato neutro.

Fontes seladas: `packages/harness/src/iterative-dispatch.ts:948`; `packages/harness/src/iterative-dispatch.ts:863`; `packages/harness/src/iterative-runtime.ts:1009`; `packages/harness/src/completion.ts:176`; `packages/harness/src/completion.ts:287`; `packages/contracts/src/execution-v2.ts:654`.

Gaps/limitações: Não afirmar ocorrência de alucinação em usuário real; ausência de garantia é observável estaticamente. Fontes institucionais, providers e implantação não exercitados; I1-F05/F06.

### C17 — Approval, pausa, retomada e efeito incerto: 48/100

Pausa/resume, IDs/binding e tratamento de unknown_effect existem; adapter PG e journal são conectados pelo worker. A factory pública aceita ApprovalEngine sem execution, e ambos runtimes seguem ao execute quando APPROVED existe sem port de reserva/consumo; journal no compatibility tools também é opcional.

Fontes seladas: `packages/contracts/src/contracts.ts:329`; `packages/harness/src/createOperationalHarness.ts:40`; `packages/harness/src/createOperationalHarness.ts:210`; `packages/harness/src/runtime.ts:829`; `packages/harness/src/runtime.ts:902`; `packages/harness/src/iterative-dispatch.ts:506`; `packages/harness/src/iterative-dispatch.ts:545`; `apps/worker/src/operational-harness-worker.ts:253`.

Gaps/limitações: Adapter durável numa composição específica não fecha todas as composições públicas. Sem demonstrar crash/replay real ou exactly-once; I1-F01.

### C18 — Policy e piso de segurança reutilizável: 39/100

Mecanismo de policy valida schema, tenant, resource, ação, grants e papel. O piso high-risk/ADMIN e condição medical ficam em fromGrant, mas uma regra ALLOW vencedora retorna antes dessa rotina. Runtime neutro também confia em policy.outcome/tool.requiresApproval, sem piso derivado de risk próprio.

Fontes seladas: `packages/policy-engine/src/engine.ts:82`; `packages/policy-engine/src/engine.ts:158`; `packages/policy-engine/src/engine.ts:188`; `packages/policy-engine/src/engine.ts:222`; `packages/policy-engine/src/engine.ts:251`; `packages/harness/src/runtime.ts:674`; `packages/harness/src/iterative-dispatch.ts:385`.

Gaps/limitações: Necessita perfil/grant/rule compatíveis criados por composição confiável; não provado ataque remoto por texto. Default reference e worker sintético restritos não provam invariável para perfil customizado. I1-F02.

### C19 — Borda HTTP, origem, input e SSRF: 67/100

Borda HTTP instala bodylimit/target/error/CORS/TLS; produção exige origin allowlist e HTTPS. SSRF valida URL/DNS e transporte conecta IP aprovado mantendo Host/SNI. A resposta de provider é limitada apenas depois de bufferizar o corpo; limite lógico não limita alocação durante recepção.

Fontes seladas: `apps/api/src/http-request-boundary.ts:1`; `apps/api/src/server.ts:482`; `apps/api/src/http-security.ts:183`; `apps/api/src/http-security.ts:247`; `packages/shared/src/ssrf.ts:151`; `packages/model-gateway/src/providers/ssrf-node.ts:34`; `packages/model-gateway/src/providers/ssrf-node.ts:158`; `packages/model-gateway/src/providers/openai-compatible.ts:197`.

Gaps/limitações: Nenhum HTTP/socket/DNS/network realizado; comportamento em Node22 e topologia proxy não comprovados. Guardas não são pentest; ingresso/egress real excluídos. I1-F13.

### C20 — Sessão, OIDC/MFA e composição publicada: 38/100

Existem mapper OIDC/MFA, store PG e hook para cookie. Docker executa main que só compõe resolver HMAC e telemetry; não injeta store nem OIDC. Trusted routes exigem store e bootstrap retorna503. Além disso, rotação de sessão usa create+revoke, deixando replace atômico disponível sem uso.

Fontes seladas: `Dockerfile:29`; `apps/api/src/main.ts:11`; `apps/api/src/operator-identity.ts:243`; `apps/api/src/server.ts:744`; `apps/api/src/server.ts:4467`; `apps/api/src/operator-session-postgres.ts:118`; `apps/api/src/server.ts:807`; `docs/02_spec/0152_corporate_oidc_authority_contract.md:11`.

Gaps/limitações: Concluir indisponibilidade/falta de ligação, não bypass de autenticação em produção. Sem issuer real, navegador, DB ou processo publicado executado. I1-F07/F08.

### C21 — RBAC e isolamento de autoridade: 49/100

RBAC fecha por papel e tenant; headers divergentes são rejeitados. Contudo audit sessions permite audit:view_limited e busca só por tenant/session, sem associação do operador exigida em0107. conversation:view_assigned também é usado sem vínculo de caso na chamada de timeline; autorização nominal é mais estreita que filtro efetivo.

Fontes seladas: `packages/shared/src/auth.ts:4`; `packages/shared/src/auth.ts:50`; `apps/api/src/server.ts:2236`; `apps/api/src/server.ts:1667`; `packages/persistence/src/repositories/conversation-repository.ts:391`; `apps/api/src/server.ts:4380`; `docs/02_spec/0107_contratos_de_api.md:83`; `docs/02_spec/0111_permissoes_governanca_e_auditoria.md:60`.

Gaps/limitações: Sem exercício HTTP de dois operadores; não observado vazamento real. RLS cross-tenant não avaliado aqui e não substitui autorização entre casos do mesmo tenant. I1-F09.

## Achados e remediação concreta

P0: nenhum identificado nesta inspeção estática. P1 significa gap material de autoridade, contrato ou resultado necessário; não significa exposição produtiva já observada. P2 significa robustez/manutenção/documentação, sem dispensar aceites. Todos ficam OPEN_PROVISIONAL até prova pertinente e revisão.

### I1-F01 — P1: Factory não exige lifecycle de approval para execução sensível

Critérios: C11, C17. Evidência: `packages/harness/src/createOperationalHarness.ts:70`; `packages/contracts/src/contracts.ts:329`; `packages/harness/src/runtime.ts:829`; `packages/harness/src/runtime.ts:902`; `packages/harness/src/iterative-dispatch.ts:506`; `packages/harness/src/iterative-dispatch.ts:545`.

**Cenário e impacto:** Uma tool requiresApproval=true recebe APPROVED com approvalId válido de um port que não tem execution; o guard condicional de begin é saltado e tool.execute é alcançado. No perfil tools sem effectJournal a factory também retorna registry diretamente. Não houve execução de sonda.

**Remediação e aceite proposto:** Definir admissão por risco/efeito na SPEC, exigir execution durável e journal pertinente antes de qualquer tool sensível; ausência deve retornar stop fechado, sem executor. Pela factory, testar APPROVED sem execution, replay do mesmo approval, binding diferente, timeout e confirmação falha em ambos perfis, com contador de efeito falso e restart PG.

**Mapeamento preservado:** `UP91-014`, `UP91-020`, `UP91-041`. **Gate pertinente:** T3 para contrato/approval; T4 separado para qualquer efeito externo real.

**Limites:** Worker PG compõe adapter específico com lifecycle; falha é de admissão pública reutilizável, não ausência em todos os caminhos.

### I1-F02 — P1: Regra ALLOW pode saltar pisos obrigatórios de policy

Critérios: C18, C17. Evidência: `packages/policy-engine/src/engine.ts:188`; `packages/policy-engine/src/engine.ts:206`; `packages/policy-engine/src/profile.ts:221`; `packages/policy-engine/src/engine.ts:222`; `packages/policy-engine/src/engine.ts:251`; `packages/harness/src/runtime.ts:674`.

**Cenário e impacto:** Um perfil confiável declara capability HIGH_RISK_WRITE, grant allow, papel elegível e rule ALLOW; evaluate retorna ALLOW em206–212 sem atingir floor251. No runtime neutro ALLOW+requiresApproval=false não solicita approval. Caso sintético proposto, não reproduzido.

**Remediação e aceite proposto:** Calcular safety floor antes da escolha de regra e combinar outcomes sem permitir redução; verificar medical/ADMIN/high-risk mesmo com regra vencedora. Amarrar metadata de risco à composição confiável e negar políticas inferiores no runtime público. Testar perfil customizado com grant allow+regra ALLOW para HIGH_RISK_WRITE/ADMIN e caso benigno em ambos perfis.

**Mapeamento preservado:** `UP91-012`, `UP91-024`, `UP91-044`. **Gate pertinente:** T3 para policy/segurança; T4 somente para capacidade real posterior.

**Limites:** Referência restrita pode negar antes por grant/papel; essa proteção de exemplo não é piso genérico. PolicyRequest neutro e evaluationInput de @cvg/policy-engine são interfaces distintas; estes são contraexemplos de superfícies próprias, sem alegação de adapter inexistente.

### I1-F03 — P1: Repair interno e erro de modelo escapam de reserva por tentativa

Critérios: C14. Evidência: `packages/orchestrator/src/hybrid-orchestrator.ts:129`; `packages/orchestrator/src/hybrid-orchestrator.ts:160`; `packages/orchestrator/src/hybrid-orchestrator.ts:175`; `packages/orchestrator/src/hybrid-orchestrator.ts:193`; `packages/harness/src/iterative-runtime.ts:751`; `packages/harness/src/iterative-runtime.ts:764`.

**Cenário e impacto:** maxModelCalls1 passa na guarda externa; primeiro complete gera JSON inválido, default maxDecisionRepairs1 permite segundo complete com mesmo budget; excesso é checado só após decide retornar. Se throws, usage local não é retornada.

**Remediação e aceite proposto:** Introduzir ledger/reserva atômica antes de cada tentativa e levar uso parcial/unknown em erro/timeout ao resultado e checkpoint. Repair/retry/fallback devem consumir mesmo teto residual. Pela factory usar HybridOrchestrator real com modelo falso: maxModelCalls1+JSON inválido deve causar exatamente1 chamada; exceção/timeout também consomem tentativa e restart não zera reserva.

**Mapeamento preservado:** `UP91-011`, `UP91-039`, `UP91-044`. **Gate pertinente:** T3 para contratos de budget/accounting; T4 para provider/custo externo.

**Limites:** Não medida cobrança/custo real; sequência inferida do código.

### I1-F04 — P1: Contexto montado não chega integralmente à decisão e teto é contornável

Critérios: C15. Evidência: `packages/harness/src/context-engine.ts:89`; `packages/harness/src/context-engine.ts:151`; `packages/harness/src/context-engine.ts:290`; `packages/orchestrator/src/hybrid-orchestrator.ts:69`; `packages/orchestrator/src/hybrid-orchestrator.ts:175`.

**Cenário e impacto:** DefaultContextEngine devolve profile/contextItems em campos separados. buildDecisionPrompt não os serializa; ModelRequest.context usa somente goal. trim admite mandatory acima de tokenBudget; observations originais continuam paralelas aos items selecionados.

**Remediação e aceite proposto:** Criar projeção governada e limitada, com objective/instructions pinados e contextItems necessários enviados como dados; contar framing/user/mandatory e falhar quando não cabem. HybridOrchestrator deve consumir a projeção selecionada, sem ler observations fora dela. Pela factory verificar marcadores distintos, bytes finais, omissões, mandatory oversize e conteúdo hostil sem autoridade.

**Mapeamento preservado:** `UP91-009`, `UP91-020`, `UP91-044`. **Gate pertinente:** T3 para contexto/contrato/segurança; T4 para source/provider real.

**Limites:** Comportamento scripted não prova transporte de modelo.

### I1-F05 — P1: Resposta pede evidência que não recebe e grounding default é permissivo

Critérios: C16. Evidência: `packages/harness/src/iterative-dispatch.ts:948`; `packages/harness/src/iterative-dispatch.ts:863`; `packages/harness/src/iterative-runtime.ts:1009`; `packages/harness/src/completion.ts:176`; `packages/harness/src/completion.ts:287`.

**Cenário e impacto:** composeResponse instrui Use only structured observations, mas envia apenas sistema, userMessage e input.context. Sem claimExtractor, validateClaims retorna valid=true. A proteção ACTION_CONFIRMED é útil, porém não vincula toda afirmação livre a efeito/evidência.

**Remediação e aceite proposto:** Transportar projeção autorizada de observações/efeitos e refs para compose; validar responseText e resposta modelada por mesmo guard. Exigir validação pertinente ao tipo de claim e bloquear confirmação sem efeito provado, mesmo com reasonCode genérico. Testar pela factory resultado falso conhecido, falha/UNKNOWN, responseText sem ref e zero reexecução para compor.

**Mapeamento preservado:** `UP91-010`, `UP91-015`, `UP91-044`. **Gate pertinente:** T3 para resposta/contrato/grounding; T4 para resposta institucional real.

**Limites:** Não houve alucinação real observada; falta de garantia verificável em caminho público.

### I1-F06 — P1: Busca neutra não vincula elegibilidade institucional à autoridade do run

Critérios: C15, C16. Evidência: `packages/contracts/src/execution-v2.ts:654`; `packages/contracts/src/execution-v2.ts:661`; `packages/harness/src/iterative-dispatch.ts:772`; `packages/harness/src/iterative-dispatch.ts:803`; `packages/harness/src/iterative-runtime.ts:204`.

**Cenário e impacto:** KnowledgeSearchRequest não exige tenant; dispatcher não fornece tenantId de run e aceita result.items sem validação de aprovação. Claim validation confere presença de refs, não a elegibilidade institucional. Um adapter pode implementar controles privados, mas a factory não os impõe.

**Remediação e aceite proposto:** Tornar tenant/agent/execution e aprovação/version/hash/revisão de fonte explícitos no contrato usado pelo runtime; revalidar elegibilidade antes de transportar e liberar resposta. Sem binding conhecido negar ou handoff. Testar fonte de outro tenant, desconhecida/revogada/mista e refs existentes porém não elegíveis. Limitar esta remediação ao boundary neutro; publicação de catálogo segue lane de integrações.

**Mapeamento preservado:** `UP91-015`, `UP91-010`. **Gate pertinente:** T3 para knowledge/grounding/contrato; T4 para fonte institucional real.

**Limites:** Nenhuma fonte real lida; não pontua nem duplica C39/publicação de conhecimento.

### I1-F07 — P1: Entrypoint publicado não compõe OIDC e store de sessão obrigatórios

Critérios: C20, C04. Evidência: `Dockerfile:29`; `apps/api/src/main.ts:11`; `apps/api/src/operator-identity.ts:243`; `apps/api/src/server.ts:744`; `apps/api/src/server.ts:4467`; `apps/api/src/operator-session-postgres.ts:59`; `docs/02_spec/0152_corporate_oidc_authority_contract.md:11`.

**Cenário e impacto:** main chama createConfiguredOperatorIdentityResolver e passa apenas resolver+telemetry para buildServerFromEnv. Nenhum store/OIDC é construído por esse caminho. Trusted session-aware resolver sem store retorna configuration_error, e /v1/session retorna503 antes do bootstrap.

**Remediação e aceite proposto:** Integrar client OIDC, state/store PG e preflight no entrypoint exato main, com snapshot de configuração único; rejeitar HMAC/local no modo corporativo e impedir readiness/listen elegíveis com dependência faltante. Exercitar processo e dist/imagem publicados com issuer sintético, MFA, cookie, revogação, indisponibilidade e configuração parcial; issuer/config reais exigem decisão específica.

**Mapeamento preservado:** `UP91-025`, `UP91-026`, `UP91-043`. **Gate pertinente:** T3 para integração identidade/boot; T4 separado para IAM/configuração/candidato reais.

**Limites:** O mapper OIDC e adapter PG existem, mas existência isolada não fecha o boot. Não afirmar autenticação aberta: comportamento observado no código é fechado/indisponível.

### I1-F08 — P1: Rotação HTTP ignora replace atômico e separa famílias de sessão

Critérios: C20. Evidência: `apps/api/src/server.ts:770`; `apps/api/src/server.ts:807`; `apps/api/src/server.ts:825`; `apps/api/src/operator-session.ts:24`; `apps/api/src/operator-session-postgres.ts:118`; `packages/persistence/migrations/operator-session/0000_auth.sql:103`.

**Cenário e impacto:** A rota lê existing, cria uma sessão nova, prepara cookie e só depois revoga existing. O adapter oferece replace que trava família e revalida antigo; a rota não o chama. Duas requests com tokens distintos e cookie antigo podem criar sucessores independentes; revoke antigo não revoga suas novas famílias.

**Remediação e aceite proposto:** Exigir replace atômico na composição durável para sessão existente e usar essa operação pela rota; preservar família e serializar concorrência/revoke. Rejeitar store incompleto e provar duas renovações concorrentes do mesmo cookie, logout concorrente e crash entre operações, com no máximo um sucessor elegível. Não compensar create+revoke como equivalente transacional.

**Mapeamento preservado:** `UP91-026`, `UP91-025`. **Gate pertinente:** T3 para sessão/identidade/contrato; T4 para promoção posterior.

**Limites:** Interleaving previsto estaticamente; não executada concorrência PG. Mantém relevância mesmo quando F07 for integrado; atualmente boot padrão limita exposição.

### I1-F09 — P1: Permissões limited/assigned não verificam associação ao caso

Critérios: C21, C11. Evidência: `docs/02_spec/0107_contratos_de_api.md:83`; `docs/02_spec/0111_permissoes_governanca_e_auditoria.md:62`; `packages/shared/src/auth.ts:5`; `apps/api/src/server.ts:2239`; `apps/api/src/server.ts:2245`; `apps/api/src/server.ts:1667`; `packages/persistence/src/repositories/conversation-repository.ts:391`.

**Cenário e impacto:** Operator possui audit:view_limited. GET audit/sessions aceita essa permissão e lista eventos pelo tenant/session sem actor/vínculo. SPEC0107 permite Operator somente associado ao caso. Timeline usa conversation:view_assigned, mas passa só tenant/conversation à query.

**Remediação e aceite proposto:** Definir relação de atribuição e ownership no contrato, consultar vínculo confiável antes de leitura e projetar eventos conforme limited/full; preservar Supervisor/Admin onde permitido. Testar dois Operators do mesmo tenant com casos disjuntos, Approver, Supervisor/Admin e tenant divergente pela API publicada. Adjudicar divergências de papéis da matriz normativa sob T3.

**Mapeamento preservado:** `UP91-018`, `UP91-024`, `UP91-025`. **Gate pertinente:** T3 para autorização/RBAC/contrato; T4 para tráfego/dados reais.

**Limites:** Não confundir falha intra-tenant com RLS cross-tenant; esse gate não foi avaliado. A suspeita inicial de divergência literal audit:view_full foi conferida e descartada; identificadores são iguais.

### I1-F10 — P2: Guias atuais têm horizontes incompatíveis e HTTP operacional incompleto

Critérios: C05, C11. Evidência: `docs/architecture/HARNESS_OVERVIEW.md:31`; `docs/architecture/PACKAGE_MAP.md:9`; `docs/architecture/PUBLIC_API.md:3`; `docs/02_spec/0107_contratos_de_api.md:36`; `apps/api/src/server.ts:887`; `apps/api/src/server.ts:744`.

**Cenário e impacto:** Overview diz loop/retrieval/verification sem implementação nesta fase e package map só runtime single-pass; PUBLIC_API já descreve iterative atual. SPEC0107 enumera runs e recursos legados, mas não executions/session implementados.

**Remediação e aceite proposto:** Preservar SPECs históricas e criar/ligar referência HTTP atual com payload/schema/version/stops/identity/tenant/idempotência por operação, incluindo executions/resume/trajectory/session. Atualizar overview/package map para distinguir implementado/proposto e as famílias runtime. Verificar exemplos contra exports públicos e compatibilidade; não transformar rótulo CURRENT em PASS.

**Mapeamento preservado:** `UP91-018`, `UP91-023`, `UP91-002`. **Gate pertinente:** T1 para guia fiel ao código; T3 se exigir mudança de contrato público.

**Limites:** Horizonte Phase0/1 explica parte do texto; achado é navegação/contrato vigente, não alteração retroativa de aprovação.

### I1-F11 — P2: Hotspots dificultam revisão de invariantes e ownership

Critérios: C10, C09. Evidência: `apps/api/src/server.ts:333`; `apps/api/src/server.ts:5102`; `packages/platform/src/control-plane-store.ts:1`; `packages/agent-runtime/src/runtime.ts:1`; `packages/harness/src/iterative-runtime.ts:1`; `docs/02_spec/0168_runtime_approval_request_extraction.md:13`.

**Cenário e impacto:** Contagem estática: server5531, control-plane-store1438, kernel runtime1498, iterative-runtime1488. Arquivo de servidor contém boot, queries e várias autoridades; outras extrações já existem, sem eliminar esse hotspot.

**Remediação e aceite proposto:** Decompor por módulos/rotas e composição com invariantes congeladas; separar sessão/identity/HTTP, contratos operacionais e boundary legado. Cada fatia preserva AST/behavior/ordem de efeitos, mantém negativos públicos e valida regressão pertinente; não declarar encerrada toda a decomposição por uma extração pequena.

**Mapeamento preservado:** `UP91-021`, `UP91-019`. **Gate pertinente:** T2 para extração pura; T3 obrigatório se alterar autorização, contrato ou comportamento.

**Limites:** Não usa contagem de linhas como prova de bug.

### I1-F12 — P2: Builder usa diretórios temporários globais apagados por invocação

Critérios: C12. Evidência: `scripts/build-runtime.mjs:30`; `scripts/build-runtime.mjs:59`; `scripts/build-runtime.mjs:98`.

**Cenário e impacto:** generatedConfigRoot sempre /tmp/cvg-runtime-tsconfigs; createRuntimeProjectConfigs executa rmSync recursivo. context-dir customizado não isola esse primeiro caminho. Duas builds no mesmo host podem apagar/trocar configs do outro checkout.

**Remediação e aceite proposto:** Usar diretório exclusivo por execução tanto para tsconfigs quanto contexto, com ownership e cleanup limitado à execução. Testar builds de dois checkouts com manifests distintos simultâneos, verificando outputs sem mistura; manter defaults Docker compatíveis por decisão explícita.

**Mapeamento preservado:** `UP91-003`, `UP91-021`. **Gate pertinente:** T2 para isolamento interno preservando output; T3 se contrato de CLI/config externa mudar.

**Limites:** Build não executado; contêineres separados podem isolar /tmp e mitigar cenário.

### I1-F13 — P2: Limite de resposta é checado após bufferizar conteúdo externo

Critérios: C19. Evidência: `packages/model-gateway/src/providers/ssrf-node.ts:158`; `packages/model-gateway/src/providers/ssrf-node.ts:173`; `packages/model-gateway/src/providers/openai-compatible.ts:197`; `packages/model-gateway/src/providers/openai-compatible.ts:203`.

**Cenário e impacto:** readResponse acumula todos os Buffer chunks e Buffer.concat antes de criar Response; provider faz response.text e só então assertResponseSize. O teto lógico atual não é teto de recepção/alocação.

**Remediação e aceite proposto:** Aplicar maxResponseBytes no stream do transporte e cancelar/destroy ao exceder; propagar erro seguro ao gateway. Provar por transporte real local sintético chunks acima do teto, oversized Content-Length, corpo lento, abort e limite exato, sem provider externo. Manter Host/SNI/pinning e encoding inalterados.

**Mapeamento preservado:** `UP91-028`, `UP91-039`, `UP91-004-R4`. **Gate pertinente:** T3 para contrato/segurança de transporte; T4 para provider externo.

**Limites:** Ausência de cap é comprovada no código; não medida pressão de memória/DoS ou vazão.

## Sequência de planejamento para o Lead

1. Reconciliar a presente captura e claims (UP91-001/002/003); conservar contratos/história e selecionar dono da prova de cada achado. Integrar findings ao novo roadmap/backlog sem fechar tasks por documento.
2. Resolver consumer/WHAT/ambiente (UP91-007/008) e guia HTTP/public boundaries (018/023). A falta de consumer real bloqueia sua integração, mas permite preparar SPEC e correções neutras autorizadas.
3. Sob revisão T3 específica, tratar pisos policy e lifecycle (012→014), depois contexto→resposta→grounding (009→010→015); accounting011 é transversal e deve anteceder qualification de modelo. Os contratos0166 são candidatos; referências não concedem aprovação.
4. Integrar identidade e session replacement (025→026) pelo entrypoint publicado, junto dos guards de caso018/024. Testes isolados com injeção não substituem processo main/dist; provar indisponibilidade e ausência de fallback com env parcial.
5. Planejar extrações021/019 e isolamento de build003 com regressão por fatia. F12 pode ser T2 se output/CLI mantidos. F13 altera segurança de transporte e precisa T3 antes da implementação.
6. Depois das correções, UP91-020 verifica consumidor neutro por exports compilados e HTTP→PG→worker→factory, ambos perfis. Reproduzir cada contraexemplo com fixtures; probes devem rejeitar versão sabotada e medir zero efeito indevido, calls por tentativa, refs válidas e atomicidade de sessão.
7. UP91-044 qualifica semântica/red team com modelo falso e negativos relevantes. Provider/source/efeito externo/candidato real permanecem T4 com escopo/hash/decisão humana próprios. Essa sequência não altera nem avalia os13gates de release.

Provas futuras propostas: factory real+HybridOrchestrator+spy de complete para contexto/budget; tools falsos+adapter/journal PG para lifecycle; duas conexões/processos para atomic replacement; HTTP de dois operadores/casos para RBAC; stream/socket local controlado para limite de recepção. Todas são NOT_RUN nesta lane. O Lead possui autorização para seus recursos e deve registrar execuções no pacote próprio, sem converter esta inspeção em resultado dinâmico.

## Fechamento, arquivos e hashes

Entrega documental I1 concluída. Não há trabalho de produto iniciado ou aprovação presumida. Next action: Lead incorpora notas/achados e prepara ou revisa as SPECs T3 específicas; obter evidência dinâmica pelos recursos da lane autorizada e nova crítica antes de fechar gaps. Ledgers99/20/30, coordenação e backlog compartilhado não foram alterados; este trecho funciona como handoff da lane ao controller do Lead.

Paths escritos: `architecture-audit/report.md`, `architecture-audit/findings.json`, `architecture-audit/source-manifest.json` dentro de evidenceAUD0592. `source-manifest.json` contém tamanho e SHA-256 de todas as fontes citadas mais contrato/lockfile. Referências path:linha são relativas ao snapshot, não ao root vivo que pode mudar concorrentemente.

Contrato: `bf07b6f1e4046956bfde263c4b6e4a9afbd5ee7f57e96f3f2a9801464b249968`. Fontes seladas (manifesto): `52fff07f7ff9b7fb86d5942172a912db52ab5db62142560052100e72c0b98cc0`. Hashes dos outputs serão comunicados após validação da serialização; o próprio report não inclui hash autorreferencial.
