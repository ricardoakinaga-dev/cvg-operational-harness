**R2 — REVISE; mandatoryFindings: 2.** Segunda e última rodada autorizada. Os testemunhos dos achados R1 foram corrigidos no escopo reproduzido. Permanecem um obrigatório P1 de supervisão do novo parser e um P2 de rastreabilidade da frontier. Ownership readonly **liberado ao Lead**; não há terceira rodada automática nem aprovação de B6/fullcert/promoção.

Fonte: `/home/ricardo/cvg-candidates/hiso005-integrated-20261018`, commit **01964962e37734553312e20cc492beab439373fb**. SPEC SHA256 `cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49`. Os17hashes de [frozen-inputs.json](frozen-inputs.json), HEAD e árvore limpa foram conferidos. Contra22ca, mudaram somente engine, helper compilado e seus três testes0236. Checker/emissor e legados mantêm os hashes R1. R1 e fontes permaneceram imutáveis nesta revisão; não houve descendentes, instalação, rede, PG/portas, gates amplos, index/commit ou edição de ledgers.

[review.json](review.json) fixa critérios SP01–18, cenários, disposição de R1, severidade, causa e limitações. [evidence-inspection.json](evidence-inspection.json) fixa os artefatos lidos e seus hashes; [reviewed-diff.patch](reviewed-diff.patch) registra o delta inspecionado. Os bytes do código julgado estão em [code-snapshots/](code-snapshots/), para leitura.

**R2-01 — P1 obrigatório: filho de gramática sobrevive ao deadline do worker.**

Engine [linha1435](code-snapshots/boundary-semantic-engine.mjs) cria `Node --check` com timeout sob o worker; `runSemanticBoundary`, linha1608, supervisiona somente o worker direto. Se o worker expira antes do watchdog interno, a morte do worker elimina também a supervisão daquele filho. Não existe cleanup da árvore/grupo nem vínculo de morte do parser com seu pai.

Reprodução p14: fixture JS pura `export const result=1;`, SHA256 `b8434db90f31a3fae3a9d614371734d4044fdf7efd241e3c06ec10c033100a69`, limite reduzido900ms. O observador identificou exclusivamente o próprio filho `Node22 --check <fixture>/entry.js` e aplicou SIGSTOP para simular parse síncrono travado. Em567ms o filho1975680 estava sob worker1975673. O caller retornou em aproximadamente944ms, com UNKNOWN/UNKNOWN_ANALYSIS_LIMIT e nenhuma prova. Após mais1.250ms, o worker já não existia, mas o parser permanecia `T(stopped)`, PPid1. O crítico enviou SIGKILL apenas a esse filho próprio e confirmou sua ausência em `/proc`.

Não é falso PROVEN: a recusa foi correta. É falha de prazo/ownership/cleanup de recurso em SP12, e impede SP17/zero obrigatórios. O teste é uma injeção controlada de stall, não a alegação de um hang espontâneo do parser ou de execução de alvo.

Artefatos exatos: [input](probes/p14-grammar-child-deadline/input.json), [fonte](probes/p14-grammar-child-deadline/entry.js), [caller próprio](probes/p14-grammar-child-deadline/caller.mjs), [output](probes/p14-grammar-child-deadline/output.json), [árvore/tempos/estado/cleanup](probes/p14-grammar-child-deadline/lifecycle-result.json), [reprodução completa](probes/lifecycle-probe.py). Os originais ficam em `/tmp/cvg-hiso005-integration-20261018/review0236-r2/` nos mesmos sufixos após probes.

Recomendação: fazer o supervisor independente deter e encerrar a árvore/grupo privado completo em timeout, erro e interrupção, com cleanup limitado e sem sinalizar processos alheios. Manter UNKNOWN/zero provas. Não basta reduzir o timeout do filho: o relógio interno inicia depois do deadline do caller e seu supervisor também morre. Controle positivo/negativo deve verificar ausência do filho após retorno, inclusive quando parado.

**R2-02 — P2 obrigatório: diagnósticos novos não recebem origem própria.**

Checker [linhas2233–2249 e2256–2273](code-snapshots/check-product-boundary.mjs) adiciona UNVERIFIED_SEMANTIC_FRONTIER diretamente em diagnostics, sem captureOrigin/reportDiagnostic. A invariante e o registro origins abrangem apenas a baseline. O originId eventual do kernel é causal e opcional, não uma identidade própria do novo diagnóstico.

No p02 independente, `occurrences` registra baseline2/resolved0/unresolved2/new4; `origins` contém somente2registros. Os quatro novos diagnósticos têm file/reason/detail e nenhum originId; seus unknowns causais têm originIdnull. Inputs preserva o hash físico da implementação, mas esse vínculo por arquivo não representa a identidade individual exigida no emissor pelo §7. O detalhe `specifier` do UNKNOWN_BINDING_VALUE também se perde na conversão para o diagnóstico host.

Artefatos: [fonte instalada](probes/p02-installed-anon-loader/evaluated/node_modules/vendor/index.js), [request](probes/p02-installed-anon-loader/request.json), [output integral](probes/p02-installed-anon-loader/output.json), [CLI](probes/p02-installed-anon-loader/cli-output.json). SHA da fonte `8a54d6434b65388a2f9de03f349d6f9cac081c45933852a3ec20d494eea872ca`. O checker julgado tem SHA `f62a8695b78c1507a9e0e2ae6b378c71d1b2fda4c237fe2ea1b7cfc063294902`.

A conclusão vem da exigência congelada de novos diagnósticos “com origem própria” e de identidade da tupla emitida antes da serialização. Não houve consumo indevido de prova histórica nem falso PASS: esses quatro continuam bloqueantes. A lacuna é SP13/rastreabilidade, descoberta nesta rodada após pergunta do Lead e confirmada no artefato próprio já executado; não exigiu cenário adicional.

Recomendação: cada novo diagnóstico recebe ID canônico atual no emissor e registro próprio. Quando não há AST real, usar origem non-AST com identidade física disponível e ponteiro/contexto/ordinal determinístico; não inventar span. Manter eventual referência anterior como causeOriginId separado. A partição original de baseline continua intacta, e IDs novos jamais consomem provas antigas. Isso completa proveniência, sem nova regra de confiança.

**Reparos R1 e verificações executadas.**

Foram19cenários focais:18sintéticos e uma validação de artefato real. Node22.23.2 absoluto, SHA `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`; parser6.0.3 SHA `569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39`. Ambiente mínimo PATH/LANG/LC_ALL/TZ, sem NODE_OPTIONS ou flagsVitest. Alvos somente lidos; `--check` não importa nem executa o alvo.

| Cenários | Observação |
| --- | --- |
| p01 | Produto finito na chave computada agora FAIL/CLI1/verifiedfalse; efeitos avaliados antes da recusa. |
| p02–p03 | Defaults externo anônimo/nomeado agora INCOMPLETE/UNKNOWN/verifiedfalse, zero provas. |
| p04–p05 | Defaults puros anônimo/nomeado importados pela chave default real continuam PASS/CLI0/verifiedtrue. |
| p06–p07 | JS tipado ou const duplicada em instaladoMATCH agora UNKNOWN_RUNTIME_SYNTAX/INCOMPLETE, verifiedfalse. |
| p08–p10 | Inline type mantém aresta de produto antes de maxFiles1; inline neutro adquire implementação; import type explícito é apagado corretamente. |
| p11–p13 | Binding computado neutro UNKNOWN; produto prevalece sobre maxNodes0; prova rehashada com dependência inexistente é recusada por recomputação. |
| p14 | Stall de gramática demonstrou R2-01; cleanup próprio concluído. |
| p15–p17 | Nome sha256 aceito pela gramática; fixture sem projetos/compiler recusa aquisição com ENOENT, sem criar output. Duplicado e flag desconhecida com dígitos mantêm CLI_OPTIONS_INVALID. Não chamar p15 de build positivo. |
| p18 | CLI strict positiva idêntica à normal, exceto telemetria. |
| Artefato real | Reader atual validou independentemente receipt115f72ef, PROVEN de proveniência,112emits elegíveis,8.203ms. |

A receita CLI real019, executada pelo Lead, saiu0 em33,65s, digest `115f72efdd904c9a1f18fc2bf57a5c280c2bd50bf8b71390ad08ffc2a7329dd2`. O crítico executou o reader corrente com esse digest externo: revalidou toolchain/compiler, inputs, closure de fonte do compiler, dependências, outputs e resoluções públicas. Ver [reader independente](probes/compiled-reference-independent-load.json) e [script próprio](probes/check-compiled-reference.mjs). Isso é proveniência de build; MATCH não recebe confiança semântica por esse resultado. A receita não transfere prova de TypeScript para emitJS.

Os reds13FAIL/1PASS, setupCLI e censo inline-type foram lidos com seus outputs reais; os artefatos permanecem históricos. O130/130PASS ocorreu antes do último reparo de censo; o resultado corrente selecionou13PASS, com84casos fora do filtro. Não foi apresentado como fullsuite nova. O diff acrescenta8engine/6CLI e usaCLIreal no preparo dos15compiled, mantendo89engine/12CLI anteriores e assertions dos15; os93legacy e tabelas/pins não mudaram de R1. Nenhum rerun amplo pelo crítico.

ConsumidorR3 do commit019: artefatoLead207imports/76exports/zero rede, fonte sem produto/aliases, build receipt lido/hashado. Nenhum alvo do consumidor foi reexecutado pelo crítico, e esse resultado não encerra os dois obrigatórios.

**Limitações e continuidade.**

O mecanismo K0–K7 continua parcial; não houve prova completa de soundness nem busca exaustiva de races. Não se reauditaram os55deltasClaude. A partição semântica integral da árvore real e gates amplos continuam pendentes. UNKNOWN correto não fecha P2/P3/HISO005/B6. O guard de gramática corrige os redsJS, mas introduz o problema de supervisão descrito; não se aceita o novo kernel só por igualdade de hashes ou pelos relatos do Lead.

Lead recebe ownership para corrigir R2-01/R2-02 sob a SPEC vigente e preservar todos os reds. Fonte alterada exige identidade e verificação novas; nenhumaR3 será iniciada automaticamente. Não promover/certificar como mecanismo aceito enquanto houver obrigatórios. Estado/ledger ficam com o Lead; este relatório e review.json são o handoff do crítico. Todos os jobs próprios terminaram e o parser parado foi eliminado.
