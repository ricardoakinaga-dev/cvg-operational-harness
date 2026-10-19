# 0619 — B6: reauditoria do isolamento da candidata estável

Data: 17/10/2026. Task `B6-STABLE-20261017`, Codex. Pedido: seguir o próximo passo do [relatório 0617](0617_harness_operational_state_2026-10-17.md). Candidata examinada: **`5a199668eef5db4ca7aa2adc3853169ca0953cbf`**, branch `candidate/core-20261017`. Atividade AUDIT, fontes somente leitura, sem implementação ou release.

## Parecer

**B6: REJECT. O isolamento não pode ser declarado aceito na ADR-010.** Os dois achados P1 anteriores foram reproduzidos no verificador desta candidata. O gate da árvore da candidata e 145 testes de regressão passaram, mas controles adversariais ainda receberam PASS indevido.

Foi suprida a lacuna local de **B6-P2-02**: oito pacotes foram construídos por seus exports públicos, sem aliases; 198 imports documentados compilaram e a jornada sintética executou pelos pacotes construídos, sem a pasta do produto. Isso não encerra HISO-009 inteiro nem dispensa o restante da B6.

O núcleo mantém sua [certificação local condicional anterior](evidence/CERT-CORE-20261017/README.md). Esta auditoria não a transforma em GO de produção, não atesta o CI remoto e não examina o servidor do hospital.

## Escopo, independência e integridade

A barra foi congelada no claim antes da execução: seis achados B6 da [auditoria 0606](0606_plan0374_a5_b6_2026-10-07.md), critérios da [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md), [SPEC0178](../02_spec/0178_harness_consumer_extraction.md) e itens B1–B6 do [plano 0374](../03_build/0374_plano_producao_harness.md). Não foram reduzidos os critérios para acomodar os resultados.

O snapshot foi extraído por `git archive` do commit, sem copiar os `dist` existentes ou arquivos privados de ambiente. Foram congelados 1.029 arquivos de código, configuração e documentação aplicável. As dependências vieram de cópia física de `core-fix/node_modules`, com links de workspace resolvendo dentro da cópia. Não houve instalação nova nem verificação independente de cada byte de dependência contra tarball de registro; esse limite permanece explícito.

A variante de consumo não contém `products/`. Seus únicos arquivos de fonte/configuração remanescentes com diferenças em relação ao snapshot são `package.json` e `package-lock.json`, para remover o workspace e as entradas do consumidor. O link npm do consumidor foi removido apenas nessa variante. As fontes de pacotes e do exemplo foram preservadas. Os builds e scripts de auditoria escreveram somente em recursos próprios.

Conferência final: **zero diferenças nos 1.029 arquivos congelados do snapshot**. Nenhum código/checker/pin/lock compartilhado foi alterado. Não foram usados os artefatos modificados de certificação da worktree `core-fix` como fontes do snapshot. [Snapshot e procedência](evidence/B6-STABLE-20261017/snapshot.json); [integridade](evidence/B6-STABLE-20261017/integrity.json).

O Codex não implementou os mecanismos examinados nesta rodada; sua reprodução é independente dos resultados fornecidos pelo implementador. As sondas externas e a síntese deste relatório são do mesmo analista, sem segundo parecer independente ou subagentes. Os achados não dependem apenas dos testes originais.

## Resultados executados

| Procedimento                                     | Resultado                 | Alcance                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate original sobre a árvore física da candidata | PASS, exit 0              | 686 fontes, 646 do core, 303 pacotes instalados, 4.932 arestas, zero violações/diagnósticos e zero drift instalado/lock. O grafo tem 998 nós.                                 |
| Mesmo gate com `--strict`                        | INCOMPLETE, exit 1        | 165 diagnósticos e zero violações; exceções desativadas. Não é PASS.                                                                                                          |
| Regressões originais de fronteira e consumidor   | 145/145 PASS, zero skips  | Três arquivos: `product-boundary`, `consumers-public-surface` e `consumers-reception-agent`; Node22.23.2.                                                                     |
| Sondas de troca de receptor                      | Dois PASS indevidos       | `shutdown.install(process)` e `vi.spyOn(globalThis, 'fetch')`; os mesmos corpos recebem INCOMPLETE sem exceções.                                                              |
| Pacote instalado com caminho concatenado         | PASS indevido             | Mesmo nome de workspace do produto real; conteúdo concatenado não aciona o tripwire. Versão divergente também mantém PASS.                                                    |
| Consumidor fora do inventário                    | PASS indevido             | `SHIFT_PORT` no exemplo não aparece no grafo; o mesmo acesso no core é recusado.                                                                                              |
| Barra de denominador do produto                  | Aceita regressão reduzida | Script original do workflow aceita relatório sintético de um único teste; não exige o inventário de dois arquivos/37 testes.                                                  |
| Build público da variante sem produto            | PASS                      | Quatro invocações do builder existente: SDK, persistence, channel-gateway e model-gateway, com suas closures. Nenhum dist anterior foi reaproveitado na preparação.           |
| Imports documentados sem aliases                 | PASS                      | 198 imports, tipos e valores, de oito pacotes; TypeScript sem aliases de fonte.                                                                                               |
| Jornada por JavaScript construído                | PASS                      | 72 exports de valor conferidos, 610 resoluções de módulos; sem fonte privada, TypeScript em runtime ou módulo do produto; zero tentativas de rede observadas pelo guard Node. |

Evidências: [gate padrão](evidence/B6-STABLE-20261017/boundary-default.json), [grafo](evidence/B6-STABLE-20261017/candidate-graph.json), [gate estrito](evidence/B6-STABLE-20261017/boundary-strict.json), [regressões](evidence/B6-STABLE-20261017/regressions.json), [sondas](evidence/B6-STABLE-20261017/probes.json), [pacotes instalados](evidence/B6-STABLE-20261017/vendor-probes-r2.json), [denominador](evidence/B6-STABLE-20261017/product-denominator-probes.json), [builds](evidence/B6-STABLE-20261017/public-builds.json) e [jornada compilada](evidence/B6-STABLE-20261017/compiled-consumer-smoke-r2.json).

## Achados anteriores reavaliados

### B6-P1-01 — confiança terminal nos metadados instalados: REPRODUZIDO

O verificador original aceitou uma dependência sintética `vendor`, registrada por URL HTTPS e um campo `integrity` de formato aceito. Seu código usa `require('../../' + 'products/' + 'shift-assistant/src/main.ts')`. O produto da fixture tem nome `@cvg/shift-assistant`, como no repositório real.

O gate completo da fixture retornou **PASS**, sem diagnóstico, tanto com a versão nominal `1.0.0` quanto com versão instalada `9.9.9` contra `1.0.0` no lock. No segundo caso, o drift é apenas informativo. O componente terminal devolve `verified: true`; não comprova os bytes com o SRI. O controle com caminho literal completo é recusado e o pacote neutro é aceito.

Esta é prova de aceitação indevida do mecanismo, **não prova de que uma dependência atualmente instalada importa o produto**. O corpo do pacote sintético não foi executado. A concatenação foi avaliada separadamente com um `require` inerte, sem carregar alvo.

Remediação e aceite preservados: comprovar a identidade do conteúdo instalado e tratar conteúdo opaco/drift como não verificado, sem confiar apenas em versão/URL/texto SRI ou busca literal. Adicionar os controles concatenado/literal/neutro e versão divergente ao gate. Owner: B1/HISO-005 e engenharia de instalação. Severidade P1; confiança alta na reprodução.

### B6-P1-02 — receptor substituído conserva a exceção: REPRODUZIDO

Nas fixtures físicas, o `lifecycle.ts` exigido pelo pin foi mantido byte a byte, mas o objeto local `shutdown` foi substituído. Sua função usa a fonte recebida para obter um carregador Node. A linha permitida `shutdown.install(process)` permanece igual e consome a exceção `shutdown-signal-source`: **PASS** sem violações/diagnósticos.

Outra fixture redefine o objeto local `vi`, preservando a linha de spy permitida. O corpo obtém um carregador a partir de `globalThis.process`: **PASS**, consumindo `vitest-fetch-spy`. Desativar as exceções torna ambas **INCOMPLETE**. Um import direto de produto no core é recusado pelo controle negativo.

Os corpos foram analisados pelo checker e não executados. As sondas não afirmam que os receptores reais da candidata fazem esse carregamento. Demonstram que o binding da exceção não protege o que sua justificativa diz proteger.

Remediação e aceite preservados: vincular a exceção à identidade/import/implementação efetivamente justificada; mudança de receptor/corpo/alias deve invalidá-la. Revisar as demais famílias e espelhos compilados, sem alegar que todas foram exploradas por estas duas sondas. Owner: B1/HISO-005. Severidade P1; confiança alta.

### B6-P2-01 — exemplo e árvore real fora da barra automatizada: ABERTO

O grafo real não contém `examples/consumers`. Uma fixture com `process.env.SHIFT_PORT` no exemplo devolve PASS, enquanto o mesmo acesso no core é diagnosticado. O checker descobre manifests de `examples`, mas isso não torna seus arquivos pontos de entrada do grafo de fontes.

O contrato de gates da candidata continua sem executar `boundary:products` sobre a árvore real; testes de fixtures não preenchem esse requisito. A inspeção dos workflows e do contrato foi local, sem consulta a runs de GitHub. [Inspeção estática](evidence/B6-STABLE-20261017/static-review.json).

Aceite: rota explícita de análise do consumidor e execução/artefato da árvore real no CI. Owners: B1/B3/CI; prioridade P2.

### B6-P2-02 — consumo compilado sem aliases: EVIDÊNCIA LOCAL SUPRIDA

A variante sem `products/` construiu as closures pelo script público da própria candidata, que define `paths: {}`. Os 198 imports das tabelas de `PUBLIC_API.md` compilaram contra os exports dos oito pacotes. Foram conferidos os 72 nomes de valor em runtime.

O exemplo de recepção foi copiado byte a byte para compilação independente. JavaScript construído executou seis cenários: resposta determinística; consulta com fonte sintética; solicitação pendente sem efeito; handoff; aprovação negada sem efeito; auditoria indisponível com parada fechada. As quatro saídas da jornada foram `COMPLETED`, `COMPLETED`, `APPROVAL_REQUIRED` e `HUMAN_TAKEOVER`.

Hooks de resolução rejeitaram carregamento de fontes privadas, TypeScript em runtime, módulos do produto e módulos fora da variante. Guards de chamadas Node não observaram tentativas de rede. Isso não é atestação de sandbox do sistema operacional, durabilidade PostgreSQL ou deploy independente.

O finding de falta dessa prova local pode ser considerado suprido **neste commit e no escopo do consumidor compilado**. HISO-009 permanece aberto por seus demais aceites, inclusive a dependência de uma fronteira aceita.

### B6-P2-03 — barras por artefato: ABERTO

O escopo core continua explícito para testes/coverage. Entretanto, a configuração de typecheck inclui 17 arquivos do produto. O workflow do produto não contém etapa própria de cobertura nem proveniência; o job de imagem não depende do job de testes.

Foi executado o script original de denominador, extraído do workflow sem alterações, sobre dois relatórios sintéticos: dois arquivos/37 testes e um arquivo/um teste. Ambos retornaram **PASS**. A checagem recusa vazio/skips/arquivos estrangeiros, mas não detecta esse encolhimento de inventário. Não foram produzidos ou alterados relatórios de CI reais.

Aceite: implementar/verificar o contrato por artefato aprovado, incluindo inventário de regressões, coverage aplicável e vínculo entre testes e imagem/proveniência; arquivar execução real no candidato. A aprovação humana de B5 em 16/10 é reconhecida, sem convertê-la em prova de execução. Owners: CI/produto; prioridade P2.

### B6-P2-04 — comandos agregados incorretamente no runbook: ABERTO

O runbook da candidata ainda contém `npm run format:check typecheck lint build`, `npm run coverage:critical mutation:guard skip:governance` e `npm run docs:check-links licenses:check sbom audit:security`. Essas formas passam os demais nomes como argumentos ao primeiro script; não são execução sequencial dos gates listados.

A constatação é estática. Os comandos amplos não foram executados. Aceite: invocações individuais ou agregador existente, preservando falha e resultado por gate. Owner: B4/runbook; prioridade P2.

## Controle dos instrumentos de auditoria

Dois ajustes de medição foram necessários e ficaram preservados:

- A primeira fixture de pacote instalado usava o nome nu `shift`; o tripwire corretamente o encontrava no texto concatenado. As quatro fixtures adicionais usam o nome de workspace com namespace e o caminho do produto real, demonstrando o limite sem alterar o checker. O resultado inicial permanece em `probes.json`.
- A primeira versão do smoke externo esperava `AUDIT_FAILED`. O teste original do consumidor especifica `INSUFFICIENT_EVIDENCE` quando a auditoria falha. Foi corrigida apenas essa asserção do observador; fontes e compilados da candidata ficaram intactos. A falha inicial, scripts e recibos de ambas as execuções permanecem em [compiled-smoke-executions.json](evidence/B6-STABLE-20261017/compiled-smoke-executions.json).

Nenhum erro do instrumento foi reclassificado como defeito do produto, e nenhum resultado inicial foi apagado.

## Gate e próximo passo

| Critério                | Estado resultante                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------ |
| HISO-005 / B1           | Não aceito: B6-P1-01 e B6-P1-02 reproduzidos.                                        |
| HISO-009 / B2–B3        | Prova de consumo compilado suprida; cartão inteiro aberto.                           |
| HISO-010 / B5           | Aprovação de contrato reconhecida; implementação/evidência integral ainda pendentes. |
| HISO-014 / B6 / ADR-010 | REJECT; não alterar para isolamento aceito.                                          |
| C10                     | Não executada; sem GO de produção ou autorização de publicação.                      |

**Próxima ação executável:** preparar uma unidade de remediação de B6-P1-01/02 no owner B1/HISO-005, com task/SPEC aplicável e estes controles adversariais como aceites. Deve preservar a candidata estável e produzir outro SHA se houver mudança de código. A definição precisa decidir como provar bytes instalados e como vincular cada exceção ao receptor legítimo; suprimir diagnósticos ou repinar conteúdo sem essa prova não encerra os achados.

O restante continua na [carteira 0370](../03_build/0370_harness_product_isolation_backlog.md) e na trilha 0374. Este relatório não abre outra fila de status nem modifica os programas PARE100/Claude100. [Handoff operacional](../08_runtime/handoffs/b6_stable_20261017.md).

Limites: sem full certify, PostgreSQL, E2E, cobertura integral, Docker/imagem nova, rede externa, CI remoto, servidor real, dado real, commit, push ou deploy. A auditoria solicitada está concluída; a implementação dos achados e o aceite de isolamento permanecem abertos.
