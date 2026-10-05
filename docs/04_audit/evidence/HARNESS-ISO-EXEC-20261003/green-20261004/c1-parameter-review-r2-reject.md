> Cópia de leitura com links ao archive. Original byte-exato e hashes preservados.

# C1_PARAMETER_FRESH_STATIC_REVIEW_R2

**REJECT — precisão funcional ESTÁTICA apenas.**

Os 124 testes estáticos fornecidos passaram (117 + 7). As provas independentes com texto neutro detectaram três divergências de símbolos, agrupadas em dois defeitos de ambiente. Todas também foram confirmadas com gramática JavaScript `.mjs`, sem executar os textos.

## Achados que impedem aceite

### C1-R2-S01 — P1: Parameters containing expressions and same-name body vars share a symbol despite distinct runtime environments.

Local: `source/scripts/boundary-lexical.mjs:39`. Evidência: `real-parameter-vs-body-var`, `destructured-parameter-vs-body-var` em [symbol-proofs.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `symbol-proofs.json`) e [javascript-symbol-confirmation.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `javascript-symbol-confirmation.json`).

Esperado: Parameter initializer closures reference the parameter binding; a same-name body var is a separate binding with an initial value transfer. Body writes must not rewrite the parameter binding identity.

Observado: identity(param) === identity(bodyVar), with both declarations present on the same TypeScript symbol. Confirmed in .mts and .mjs parse-only proofs.

Causa: The correction only looks outward when every runtime declaration is inside the body. A merged parameter + var symbol fails that predicate, and no distinct body/parameter key is allocated.

Impacto: The capability fixed points and stable-initializer/reference analyses consume the conflated key. This violates the requested precision and cannot establish absence of parameter/body contamination. No native exploit or additional adversarial capability fixture was generated.

Correção necessária: Model separate parameter and body var bindings for parameter lists containing expressions, preserving explicit initial-value transfer and keeping the legitimately shared simple-parameter case.

### C1-R2-S02 — P1: A body reference resolves to a parameter instead of the same-name body function.

Local: `source/scripts/boundary-lexical.mjs:39`. Evidência: `real-parameter-vs-body-function` em [symbol-proofs.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `symbol-proofs.json`) e [javascript-symbol-confirmation.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `javascript-symbol-confirmation.json`).

Esperado: The initializer closure token refers to the parameter; return token in the body refers to the hoisted body function.

Observado: identity(returnToken) === identity(parameterToken); identity(returnToken) !== identity(bodyFunctionToken). Confirmed in .mts and .mjs parse-only proofs.

Causa: The helper accepts checker.getSymbolAtLocation for body references. The parameter-only ancestry correction never revisits body references, so the TypeScript binder choice survives unchanged.

Impacto: Body reads and the actual body declaration disagree on symbol identity. Classification can attach the wrong origin to body references; precise static binding is not established. No offensive payload or native evaluation was run.

Correção necessária: Resolve references in the body against its actual runtime body environment, while preserving parameter/outer resolution for initializer closures.

## Provas neutras e semântica

Os exemplos abaixo são textos inertes. Foram apenas parseados; nenhum foi importado, chamado, compilado para execução ou avaliado.

`real-parameter-vs-body-var`:

```js
function f(/*param*/ token = 'param', value = () => /*default*/ token) {
  var /*body*/ token = 'body'
  return /*return*/ token
}
```

FunctionDeclarationInstantiation creates a separate varEnv for non-simple parameters; a same-name body var gets a copied value, not the parameter binding.

`real-parameter-vs-body-function`:

```js
function f(/*param*/ token = 'param', value = () => /*default*/ token) {
  function /*body*/ token() {}
  return /*return*/ token
}
```

A body function occupies the body var environment; a parameter-initializer closure keeps the parameter binding.

`destructured-parameter-vs-body-var`:

```js
function f({ /*param*/ token }, value = () => /*default*/ token) {
  var /*body*/ token = 'body'
  return /*return*/ token
}
```

Binding patterns make the parameter list non-simple even without a literal initializer on this binding.

A regra de instanciação de funções com expressões nos parâmetros cria um ambiente de parâmetros e um ambiente de `var` do corpo. Uma declaração `var` de mesmo nome copia o valor inicial do parâmetro para outra célula; uma declaração de função do corpo inicializa a célula do corpo. A closure criada no default conserva o ambiente dos parâmetros. Assim, igualdade de símbolo entre as duas células é incorreta, mesmo quando o valor inicial é igual. Para lista simples de parâmetros, o compartilhamento pode ser correto; esse controle passou.

A correção atual resolve o caso em que o binder encontra exclusivamente uma declaração escondida no corpo. Não resolve os símbolos mesclados parâmetro + var e não corrige os usos do corpo associados ao parâmetro quando existe uma função homônima. Os mapas de capacidades e referências usam essas identidades diretamente. Esta conclusão não depende de um payload nem de confirmação nativa.

## Verificação executada

| Evidência                               | Resultado                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Suite estática autorizada               | 124/124; 61 neutros, 61 INCOMPLETE/false, 2 controles de símbolos                                         |
| Provas próprias de símbolos/gramática   | 21/24 casos; 58/61 relações; zero erros de parse                                                          |
| Confirmação dos mesmos textos em `.mjs` | 3/3 divergências confirmadas; zero erros de parse                                                         |
| Cópia física de execução                | 20.557 entradas; zero symlinks; zero inodes compartilhados com Source                                     |
| Integridade completa Source             | 19.335 arquivos + 48 links + 1.970 diretórios, sem diferença                                              |
| Vendor / dist / testes                  | 17.346 arquivos vendor; 4.776 arquivos em dist, incluindo vendor; 412 arquivos test/spec hash-controlados |
| Scanner instalado global                | NOT_RUN; nenhum PASS global concedido                                                                     |

- **Parameter initializers with exclusively body-local function/var/class declarations:** PASS for these bounded controls. Evidência: symbol-proofs.json: outer-function-split, outer-var-split, outer-class-split, global-hidden-by-body.
- **Earlier real parameters, outer values, nested defaults, closure-local hoists, named function expressions:** PASS for tested controls; same-name body redeclarations fail as reported. Evidência: symbol-proofs.json and 124 authorized static tests.
- **Blocks, catch, hoists, CommonJS wrapper var and nested var, import/export/shorthand identity:** PASS for bounded controls. Evidência: symbol-proofs.json and vitest-static-results.json.
- **Type, ambient, metadata, import/export erasure without erasing extends/decorators/computed/field/default executable nodes:** PASS for bounded controls. Evidência: symbol-proofs.json: syntax-runtime-erasure; authorized suite type/ambient/runtime controls.
- **Own constructor scalar, literal BigInt and conservative mutation/escape/prototype/getter/spread/unknown refusals:** PASS for supplied parse/analyzer controls; no universal scalar proof claimed. Evidência: vitest-static-results.json: bigint-own-constructor, bigint-own-constructor-alias, constructor controls.
- **Neutral named reexports and module metadata versus acquired capabilities:** PASS for supplied controls. Evidência: vitest-static-results.json: module-public-metadata-export/indirect, safe-module-renamed, capability/module reexport refusal controls.
- **INCOMPLETE never treated as PASS:** PASS for supplied controls; global installed scan not run. Evidência: 61 supplied uncertainty controls assert INCOMPLETE and passed=false; checker status at source/scripts/check-product-boundary.mjs:1320.

## Integridade, controles e execução

O SHA-256 do inventário congelado confere: `6b53350a4b0a7ed26a0066c7a3f4a80819dbb4ed827bebc287c426061dde15d4`. Todos os 19.383 controles de arquivo/link conferem com o snapshot inicial; não há arquivo/link extra. Os snapshots antes/depois são idênticos, SHA-256 `6053e545e28712c40088f38e0371a6b488a6b32514b8067fa2184ae927370854`. O controle completo inclui inode, device, modo, número de links, conteúdo, target de symlink e mtime_ns de arquivos e diretórios, incluindo a raiz da Source.

Os sete inputs executados da cópia (scripts, teste e configurações) também conservam exatamente os hashes congelados: [executed-input-hashes.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `executed-input-hashes.json`).

Provas: [source-before.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `source-before.json`), [source-after.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `source-after.json`), [integrity.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `integrity.json`), [all-test-hashes-before.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `all-test-hashes-before.json`), [all-test-hashes-after.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `all-test-hashes-after.json`), [copy-proof.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `copy-proof.json`). Nenhuma alteração Source foi restaurada; nenhum incidente de integridade foi observado.

Execução com `env -i`, Node absoluto `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`, workdir do shell sempre o packet. `HOME`, `TMPDIR`, `XDG_CACHE_HOME` e cache npm apontam para output. Vitest usou root/config na cópia física. Ver [commands.json](c1-parameter-review-r2-reject-evidence.tar.gz) (arquivo interno `commands.json`) para argv, limites e evento de tooling.

O primeiro verificador local esperava o nome `symlink`, mas o inventário usa `link`; a tentativa falhou antes de emitir conclusão. O script em output foi corrigido e repetiu a leitura completa. Esse erro de tooling não alterou Source.

## Limites do mandato

- Static functional lexical/parameter/syntax precision only. REJECT does not constitute native, adversarial, full-production or universal completeness review.
- Fixtures were never imported or evaluated. Own proofs contain neutral inert text and inspect only AST/symbol identity/grammar.
- Only tests/product-boundary-lexical-static.test.js was executed through Vitest, in the physical output runtime. tests/product-boundary-code-execution.test.js and the original/native suites were not executed.
- No PostgreSQL, Docker, real provider/env, external network, subagents, certify, push or deploy.
- The only analyzer resolver subprocess is the supplied fixed physical module resolver; it uses createRequire.resolve/import.meta.resolve/stat and does not load fixture modules.
- The installed global scanner was not run; global status is NOT_RUN, never inferred PASS. No scanner roots, vendor closure, tests or type-edge exclusions were added or changed.
- The focused physical test runtime is a dependency/analyzer/test copy, not a complete installed global-closure artifact. Documentation/log copying was omitted there solely for isolation; source integrity covers the complete Source.
- Authority declares 371 baseline tests and 41 additions, totaling the 412 test/spec files independently hash-controlled. The packet supplies no original/new path membership list; every file in either set is covered by the full frozen control. No claimed 281 coverage run was repeated or accepted from a previous report.
- No prior report, Builder history, root AGENTS, coordination, ledgers, skills or other scratch was read. Required short SPEC files were read as mandated; conclusions come from own symbol proofs.

Próximo passo: corrigir as identidades dos dois ambientes em lane de Builder autorizada e repetir a revisão estática em um novo packet congelado. Este parecer não promove release.
