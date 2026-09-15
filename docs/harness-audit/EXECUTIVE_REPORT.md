# Executive Summary

A auditoria encontrou uma **engine operacional real, porém incompleta e ainda embutida** no CVG Agent Secretary. O núcleo mais maduro não é um “agente inteligente”: é a infraestrutura determinística que governa efeitos — policy, approval, proposal binding, idempotência, effect journal, outbox, tenant isolation e model gateway. O runtime público/default continua sendo um pipeline determinístico single-pass; o kernel governado opt-in também é linear por turno. Não existe Orchestrator executável que observe resultados, avalie suficiência e replaine.

Decisão: **GO_WITH_PREREQUISITES**. Isso autoriza conceitualmente a preparação da extração, não a movimentação imediata de código. Primeiro é necessário congelar o candidato local, provar a composição pública canônica, inverter dependências e separar mecanismo genérico de catálogo/domínio Secretary.

## Current State

O candidato é `HEAD 512bc11e80fbf7c7b8baf6263aacc811ff829309` mais um worktree extensamente modificado. A suíte atual passou 1.680/1.785 testes (105 skips), e typecheck passou; PostgreSQL, E2E, coverage, build, lint, format, restore, load e integrações reais não foram reexecutados nesta auditoria. Evidências históricas pertencem a outros snapshots.

Foram analisados 28 componentes: 21 workspaces e sete superfícies de suporte. `apps/api/src/server.ts` é um composition root de 5.533 linhas/66 routes; `platform` e `persistence` misturam core, domínio e adapters; manifests não declaram todos os imports atuais.

## Where the Harness Already Exists

Os melhores candidatos são `approval-engine`, `model-gateway`, partes de `agent-runtime`, `observability`, policy evaluator, outbox worker e effect-journal adapters. Há contracts e testes substanciais para approval lifecycle/CAS/fencing, proposal binding, model routing/retry/fallback/circuit/budget, tenant-scoped PostgreSQL, leases, retry e dead-letter.

Estimativa conceitual: **cerca de metade (≈53%)** das 15 grandes capacidades alvo tem implementação material. É uma razão coarse de capability presence, não percentual de LOC, qualidade ou extração pronta. Extraível quase as-is é muito menor, cerca de um quarto.

## Where Secretary Is Still Coupled

Capabilities, grants e profiles são ontologia CVG fechada; tool registry contém journeys/patient/appointment; workflows, RAG e eval corpus são Secretary/veterinários; API e worker escolhem implementações concretas. `persistence` importa packages acima da camada. Um cliente Corp não consegue registrar uma capability nova sem editar o core.

## Runtime Findings

O caminho default é `webhook -> outbox/worker -> executePublishedAgent -> executeConfiguredAgent`: normaliza, classifica por regex, busca knowledge uma vez, aplica policy, escolhe template, chama um provider fake uma vez, filtra output e executa tools pré-planejadas uma vez.

O kernel opt-in adiciona policy, approval, proposal imutável, journal, limits, tool/outbox e recovery, mas recebe capability/action já escolhidas e termina após uma model/tool call. Approval retoma em outro turno sem nova model call. Classificação: **single_pass**, com rollout dual-path.

## Orchestrator Findings

Existe `WorkflowCoordinatorPort` e selector, mas nenhuma implementação ou chamada real ao `planStep`. A decisão está distribuída em if/else, policy, workflows, handoff e event dispatch. Estado machine existe para approval/outbox/takeover, não para cognição iterativa.

## Conversation Findings

Templates e regexes reduzem hallucination, mas tornam a conversa rígida e fazem controles de safety governarem linguagem. A mensagem atual, knowledge e prompt registrado não formam um contexto de modelo coerente no path default/gateway. Não há DialogueState, claim-level evidence, ambiguity repair ou tool-result synthesis.

## Governance Findings

É a maior força: policy determinística, role ceilings, approval sem self-approval, immutable proposal, CAS/fencing, effect uncertainty, RLS e tenant preflight. Limitações: três approval domains, authorization do approver fora da engine, identity/replay process-local, audit de plugin opcional e telemetry/audit voláteis na composição do kernel.

## Biggest Architectural Gap

O principal gap imediato é **canonical composition + product decoupling**: não há um único caminho público que prove Secretary como cliente de uma engine neutra. Depois vêm Orchestrator/agent loop, context/evidence, Skills, Memory e RAG real.

## Extraction Readiness

Prontidão: **4/10**. Blockers: snapshot não consolidado; dual runtimes; AAA-21/caminho HTTP→SQL→worker→kernel não provado; imports/manifests divergentes; capability ontology fechada; tool systems fragmentados; audit/trace não duráveis end-to-end; consumer/cutover/rollback tests ausentes.

## Recommended Target

Um Harness library-first com `contracts`, `runtime`, `policy-core`, `approval-core`, `model-gateway`, `capability-registry` e `observability-audit`; adapters implementam PostgreSQL/providers/channels/tools. Product hosts fornecem profile, Skills, policies, prompts e domínio. Orchestrator híbrido futuro propõe; kernel determinístico autoriza e executa.

## Top 10 Actions

1. Congelar fingerprint, exports, schemas e golden traces do candidato.
2. Demonstrar o caminho canônico HTTP→SQL→worker→kernel com fixtures.
3. Corrigir manifests e construir cada package isoladamente.
4. Criar contracts neutros sem imports de Secretary/platform mega-package.
5. Separar policy evaluator de capability/profile/grants do produto.
6. Unificar Native/Plugin em um capability manifest com schemas/auth/effects.
7. Tornar audit sink obrigatório/durável e propagar trace entre processos.
8. Congelar crash/replay/cutover/rollback e approval cross-version.
9. Provar um segundo cliente não clínico sem editar core.
10. Só então adicionar loop V2, evidence sufficiency e Skills.

## Final Decision

1. Existe engine real? **Sim**, uma engine de execução governada em formação.
2. Quanto existe? **≈53% por presença coarse de capabilities; ≈25% extraível quase as-is.**
3. Runtime? **Single-pass**, em dois caminhos de rollout.
4. Orchestrator? **Não explícito; roteamento implícito/determinístico.**
5. Principal gap? **Composição canônica/desacoplamento**, seguido de orchestration/context.
6. Extração agora? **GO_WITH_PREREQUISITES**, sem mover código nesta fase.
7. Blockers? Os oito itens de readiness acima.
8. Primeiros componentes? Approval, contracts/model gateway, runtime core, observability ports.
9. Não extrair primeiro? Apps, workflows, journeys/tools, preset/Test Lab, catalogs/grants e RAG corpus.
10. Menor v0.1? Contracts + single-turn governed runtime + policy/approval + model + capability + audit ports, consumido por Secretary e um cliente sintético.

## Scores

Secretary produto **6/10**; engine embutida **5/10**; prontidão de extração **4/10**. As notas diferem porque um produto pode ter controles locais sólidos enquanto sua engine permanece acoplada e sem interfaces de reuso.
