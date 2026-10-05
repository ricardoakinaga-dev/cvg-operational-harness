# C1_BINDING_FRESH_STATIC_REVIEW_R4

**REJECT — validade: VALID_FROZEN_STATIC_ONLY.** 1 finding P1, 0 P2. Total: **256 observações finais** (188 testes supplied + 68 probes independentes). São 248 expectativas satisfeitas e 8 reproduções da mesma falha; não representa a suíte completa do repositório.

**Installed/frontier global/production: NEVER accepted nesta crítica.** Nenhuma integração, promoção, correção de builder, release ou concessão de isolamento.

## Finding C1-R4-F01 — P1

**A escrita do inicializador `var` dentro de um catch simples é atribuída à célula errada nos dois consumidores.**

Fixture neutra, exclusivamente texto para parser/analyzer:

```js
const seed = 'label'
function f(token = 'parameter') {
  try {
  } catch (token) {
    var token = seed
    read(token)
  }
}
```

A declaração `var token` cria/pertence ao ambiente do corpo da função. Entretanto, a avaliação da escrita do inicializador dentro de `catch(token)` resolve o binding do catch. São responsabilidades distintas. O [binding loop de módulos](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `packet-source/scripts/check-product-boundary.mjs`) (linhas 778–786) e o [binding loop dinâmico](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `packet-source/scripts/boundary-code-execution.mjs`) (linhas 355–362) usam `identity(name)` da declaração para essa escrita. O [binder](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `packet-source/scripts/boundary-lexical.mjs`) conserva corretamente a propriedade var do corpo, mas não fornece a resolução distinta necessária ao alvo da escrita. [Trechos numerados e hash-verificados](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/source-excerpts.txt`).

A prova atribui apenas o label abstrato `SYMBOLIC_CAPABILITY` à identidade de `seed`. No consumidor de módulos, reexecuta estaticamente o loop congelado sobre membership abstrato. No consumidor dinâmico, chama **a implementação real e inalterada** de `auditDynamicCodeExecution` sobre AST neutra, remapeando sua origem lexical de capacidade para a identidade simbólica de `seed`. Isso é injeção de estado abstrato, não execução de fixture nem um teste end-to-end do gate com uma capacidade real.

Em `.mjs` e `.mts`, `read(token)` no catch não recebe o label e não é diagnosticado; a variante acima produz zero diagnósticos no analyzer dinâmico simbolicamente inicializado. Nas variantes com `return token` depois do catch, o label contamina indevidamente a célula do corpo. As variantes com parâmetro simples, default e sem parâmetro homônimo repetem a falha. O controle com `var token=seed` fora do catch propaga e diagnostica corretamente. **8 reproduções + 2 controles**, todos com zero erro de parse. [Raw completo](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/own-consumer-probes.json`), [comando](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `run-consumer-probes.sh`), [probe](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `runtime/deps/consumer-probes.mjs`), [log](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/own-consumer-probes.log`).

Impacto provado: perda de fluxo no domínio abstrato consumido pelos dois analisadores, comprometendo a soundness estática. Não se afirma exploit executável ou falso PASS real do frontier instalado. A correção deve distinguir propriedade da declaração e resolução do alvo de escrita, preservando as cópias iniciais parâmetro→var do corpo. Nenhuma correção foi feita.

## Outcomes originais e cobertura

| Evidência                                                            | Resultado                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| Supplied `product-boundary-lexical-static.test.js`, cópia sem edição | **188/188 PASS**, exit 0                                  |
| Outcomes originais das 122 fixtures de checker dessa suíte           | 61 PASS e 61 INCOMPLETE, todos conforme o oracle supplied |
| Probes próprios de binder                                            | 38/38 conforme propriedade das declarações                |
| Probes próprios do checker                                           | 20/20 conforme expectativa                                |
| Probes próprios de consumidores simbólicos                           | 2 controles corretos; 8 reproduções de C1-R4-F01          |

[JSON Vitest original](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/supplied-vitest.json`), [log original](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/supplied-vitest.log`), [outcomes completos](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/supplied-observations.json`), [provas R4 originais](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `runtime/tmp/r4-neutral-proofs.json`), [comando supplied](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `run-supplied.sh`).

Os probes de binder verificam parâmetros simples/default/destructuring/rest, computed names runtime, tipos computados apagados, corpo var/function, catch/lexical scopes, closures e ambientes aninhados. As cópias iniciais observadas são distintas e dirigidas, e as provas supplied verificam function initialization/última declaração e os loops dos dois consumidores. **A checagem supplied de forma de loop mais álgebra simbólica não certifica integração runtime.** [Binder próprio](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/own-binding-probes.json`), [script](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `runtime/deps/probes.mjs`), [comando](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `run-probes.sh`).

Aliases/reexports neutros, namespace exports, imports/exports type-only, referências ausentes, scalar constructor (string/BigInt/alias/última chave/destructuring/branch) e perda da prova escalar por escrita/alias/export/getter/spread/proto foram conferidos pelo checker em fixtures físicas neutras. [Resultados](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/own-checker-probes.json`), [script](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `runtime/deps/checker-probes.mjs`), [comando](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `run-checker-probes.sh`).

Exploração inicial confundiu identidade de declaração com resolução de escrita do inicializador. Corrigi o oracle de binder, retendo os [resultados exploratórios](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/exploratory-own-binding-probes.json`) e [log](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/exploratory-own-probes.log`), e testei a escrita separadamente nos consumidores. Probes exploratórios com agregados produziram diagnóstico conservador na origem e foram excluídos dos findings/totais: [raw](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/exploratory-own-consumer-probes.json`). Não houve alteração do checker congelado ou da suíte supplied.

## Integridade e execução

O SHA-256 de `frozen-inventory.json` foi validado **antes e depois**:

`69d7a202ec3ed0cbd7cffd9ef51ec878dca7cc3e7bafea49725d20294de7fc1e`

São **19.382 entradas**, incluindo 19.334 arquivos e 48 links, e **1.970 diretórios** registrados. Ambos os inventários físicos coincidem integralmente; **zero diferenças de arquivos/links e zero mudanças de mtime, inclusive diretórios, vendor, dist e node_modules**. A verificação percorre a árvore completa por lstat, sem seguir links; hashes são leitura opaca, sem consulta semântica de história ou segredos.

[Integridade pré](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/integrity-pre.json`), [integridade pós](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/integrity-post.json`), [full source mtimes pré](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/source-mtimes-pre.json`), [full source mtimes pós](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/source-mtimes-post.json`), [verificador](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `integrity.py`).

Todas as execuções da suíte/probes ocorreram na cópia física `output/runtime/deps`, com Node absoluto `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`, versão **v22.23.2**, `env -i`, HOME/TMPDIR/cache sob output. Dependências foram copiadas fisicamente; links relativos são internos ao output. Scripts e teste supplied mantêm seus hashes originais: [prova dos cinco inputs](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/copied-input-hashes.json`), [cópia](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/runtime-copy.json`). Configuração/cache de Vite ficam na cópia/output, incluindo eventuais `.vite-temp`; a preservação de observações ocorre em um setup que copia o JSON antes da limpeza supplied, sem editar o teste. [Config](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `runtime/deps/review.config.mjs`), [setup](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `runtime/deps/retain-observations.mjs`), [Node/env](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/node-environment.json`), [comandos e rawreports](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `raw/commands.json`).

Não foram executados native/code-execution suite ou payloads de evaluator/process/worker/vm. Nenhuma fixture foi importada ou executada. O helper interno supplied de resolução literal Node apenas resolve caminhos, sem importar os módulos alvo. Sem skills, subagents, network/providers, PG, Docker ou Rootgit. Escritas somente em output; continuidade local em [runtime state](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `runtime-state.json`), [execution log](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `execution-log.md`) e [backlog de review](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `backlog.json`).

## Unknown boundaries

- Installed dependency frontier, fechamento global, audit da fonte inteira e prontidão de produção permanecem **não avaliados e não aceitos**. Integridade de vendor/dist não equivale a certificação funcional desses diretórios.
- Integração com capacidades reais e semântica runtime/native não foram exercitadas. O finding usa fluxo abstrato comprovado; não reivindica um exploit end-to-end sem instrumentação.
- Annex B em sloppy scripts, todos os early errors TS/JS, propagação executável entre módulos e reflexão arbitrária não foram estabelecidos exaustivamente.
- O pacote não contém `source/docs/08_runtime/agent_coordination.md`, `source/docs/99_runtime_state.md`, `source/docs/20_master_execution_log.md` ou `source/docs/30_backlog_master.md`. Não houve fallback externo; autorização exclusiva do usuário prevalece, e os registros desta rodada ficam em output.

[Relatório estruturado](c1-binding-review-r4-reject-raw-evidence.tar.gz) (arquivo interno `report.json`). Próxima ação: remediação separada autorizada e nova crítica estática independente; nenhuma integração nesta rodada.

Links de leitura rebased ao archive; originais byte-exatos e hashes no manifesto.
