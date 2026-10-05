Os links locais abaixo apontam para o arquivo compactado. Os caminhos originais e bytes exatos estão no [manifesto](c1-write-wrappers-review-r7-reject-artifact-manifest.json); o relatório bruto e seus links relativos estão preservados dentro dele.

# C1_WRITE_WRAPPERS_FRESH_REVIEW_R7 — REJECT estático escopado

**REJECT.** Dois defeitos P1 produzem falsos `PASS` no `auditProductBoundary` real; um P2 perde identidade de parâmetros do wrapper CJS. A suíte fornecida executou **276/276** testes no Vitest nativo. Isso não cobre os controles abaixo e não concede aceitação instalada/global/produção. O gate instalado permanece **INCOMPLETE**, sem execução ou inferência de PASS nesta crítica.

## Evidência e contagens

| Evidência                                                     | Total | Concordam | Divergem |
| ------------------------------------------------------------- | ----: | --------: | -------: |
| Suíte fornecida, Vitest 4.1.11 nativo / Node 22.23.2          |   276 |       276 |        0 |
| Probes próprios, `auditProductBoundary` real e sem injeção    |   137 |       103 |       34 |
| Identidades reais de `createBoundaryLexical` / binder TS      |    80 |        70 |       10 |
| Callbacks reais de `assignedValues`, evidência AST estrutural |    42 |        12 |       30 |

Todos os **259** probes próprios têm zero erros de parse; nenhum fixture foi executado/importado/avaliado. Dos 137 audits reais, 25 controles neutros esperavam PASS e passaram; 112 esperavam INCOMPLETE, dos quais 78 permaneceram INCOMPLETE e 34 retornaram PASS indevidamente. Esses 34 se dividem em 20 seleções de constructor, 12 chamadas envoltas e 2 controles de identidade/política CJS. O driver retorna 0 pela coleta concluída; as divergências constam no JSON e fundamentam REJECT.

Os 276 testes foram executados pelo runner nativo, mas apenas **167** chamam diretamente o `auditProductBoundary` sem alteração; os outros **109** são provas AST/identidade/source/simbólicas ou usam injeção de identidade no analyzer. Labels abstratos e injeção de `global` da suíte fornecida não são evidência de integração nativa do loader. Nesta revisão própria não houve injeção, stub ou harness compatível.

Evidências: [log Vitest](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [JSON Vitest](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [driver próprio](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [resultados completos](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [log de probes](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [provas simbólicas fornecidas](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [comandos](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz).

## C1-R7-F1 — P1: wrappers TS perdem valores selecionados em folhas de assignment patterns

Local: [boundary-lexical.mjs](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), `assignedValues`, linha 365. Consumidores reais: [boundary-code-execution.mjs](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), `visitBinding`, e [check-product-boundary.mjs](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), fixed point de aliases.

Reprodução mínima inerte ([arquivo](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz)):

```ts
declare const record: { constructor: unknown }
let token
;({ constructor: token as any } = record)
export { token }
```

Esperado: `INCOMPLETE` / `UNVERIFIED_DYNAMIC_CODE_EXECUTION`. Observado: **PASS**, `passed=true`, diagnósticos e violações vazios. Os controles `selection-plain`, `selection-paren` e `unknown-constructor-declaration` retornam INCOMPLETE; `neutral-pattern`, selecionando a chave comum `value`, permanece PASS. O caso sem ambient declaration, [selection-parameter-as](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), também reproduz o falso PASS.

`assignedValues` remove somente ParenthesizedExpression do alvo. AsExpression, SatisfiesExpression, NonNullExpression, TypeAssertionExpression e combinações encerram a recursão sem callback para `token`. O checker real perde a seleção `record["constructor"]`, que sua política classifica como capacidade incerta quando não há prova escalar. **20** audits reais reproduzem isso em patterns simples, aninhados, com defaults e em função com parâmetro desconhecido. Separadamente, **30/42** controles AST confirmam callbacks ausentes em alvos diretos, objeto, array, default, nested e rest. Esses callbacks provam a falha estrutural comum aos dois consumidores; o falso PASS nativo demonstrado aqui pertence ao consumidor dynamic-code. Não se afirma bypass nativo do loader com base em labels.

## C1-R7-F2 — P1: chamada envolta mantém prova escalar instável

Local: [boundary-code-execution.mjs](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), `stableInitializer`, linhas 176–185.

Reprodução mínima inerte ([arquivo](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz)):

```ts
export function label(method: () => void) {
  const obj = { constructor: 'label', method: method }
  ;(obj.method as any)()
  return obj.constructor
}
```

Esperado: `INCOMPLETE` / `UNVERIFIED_DYNAMIC_CODE_EXECUTION`; observado: **PASS** e nenhum diagnóstico. `method-parameter-plain` retorna INCOMPLETE. Até o mero controle `(obj.method)()` retorna PASS. Parênteses e wrappers TS preservam o receiver da chamada: o método desconhecido pode alterar o objeto. Nenhuma implementação desse método foi gerada ou executada.

A estabilidade do objeto recusa chamadas somente quando a propriedade tem CallExpression/NewExpression como parent imediato. Os wrappers separam a propriedade desse parent; o objeto segue considerado estável e `constructor` mantém indevidamente a prova escalar. **12** audits reais reproduzem a diferença em contexto superior e em função com parâmetro. As mutações diretas, updates, delete e patterns continuam INCOMPLETE, portanto o defeito não é falta geral de detecção de writes.

## C1-R7-F3 — P2: `var` CJS destructurado perde identidade do wrapper externo

Local: [boundary-lexical.mjs](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), `wrapperVar`, linha 217.

Texto neutro: `var {value:module}={value:"label"};read(module)` ([cjs](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [cts](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz)). O binder fornece BindingElement para a declaração destructurada; `wrapperVar` exige VariableDeclaration e devolve símbolo local. Em Node CJS, o `var` externo redeclara a célula do parâmetro `module`, mesmo via pattern. O controle simples `var module="label";read(module)` é INCOMPLETE pela política conservadora existente; o pattern é PASS.

**10/80** provas reais de identidade divergem: cinco nomes (`require`, `module`, `exports`, `__filename`, `__dirname`) em cjs/cts externos destructurados. Todos os **40** casos em static block mantêm corretamente célula própria, inclusive patterns; os controles simples externos CJS e externos ESM também se comportam como esperado. Os **2** audits nativos de `module` documentam a diferença de política. O initializer neutro não demonstra aquisição perigosa em runtime: este finding é de identidade e consistência conservadora, não uma cadeia de exploração demonstrada.

## Controles e contrato preservado

Plain/parênteses/`as`/`satisfies`/non-null/assertion/nested foram comparados. Reads escalares, defaults RHS e computed keys neutras passam; assignment/compound da suíte fornecida e assignment/update/delete/for-in/for-of/patterns próprios invalidam a prova escalar. Há controles de células distintas, writes em closure externa, static blocks, wrapper externo e extensões cjs/cts/mjs/mts. O caso exploratório `scope-other-cell` não é finding: sua expectativa inicial PASS foi revista para INCOMPLETE porque o audit inclui a incerteza do objeto interno; isso está registrado no resultado. `scope-neutral-cell` fornece o controle separado de isolamento.

A suíte original code-execution não foi executada. Os três módulos reais, a suíte 276 e a config foram inspecionados e copiados sem alteração; [SHA checks](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz). Nenhum contrato foi relaxado e nenhuma correção é fornecida.

## Freeze, integridade e limites

SHA-256 confirmado: `70659412f9a715d51e82db01e684d9576d9fc0eb6b274ab2c03d5e1a4f779059`.

**Full integrity válida**: 19.382 entries congeladas (19.334 arquivos e 48 links), 1.970 diretórios, 21.355 entries protegidas no snapshot, zero mismatches do inventário e **zero alterações antes/depois**. Cobertura recursiva integral de `source`, dependências/vendor e todos os `dist`, sem exclusão de árvores. Foram comparados SHA-256, espécie, tamanho, targets dos links, modo, dispositivo/inode, nlink e mtime em nanossegundos, incluindo diretórios. Atime de leitura não é critério de imutabilidade. As três autoridades JSON também foram comparadas. Arquivos históricos foram somente hashados no inventário, sem leitura semântica de histórico/pareceres.

Runtime: **19.334 cópias físicas**, nenhum hardlink/arquivo com inode compartilhado, 48 symlinks internos e nenhum externo. Temp/cache/resultados permanecem em output. Worker threads são somente infraestrutura Vitest. [Cópia](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [driver de cópia](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [before](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [after](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [resumo válido](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [driver de integridade](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [log](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz).

Leitura inicial restrita às três autoridades e constituição interna. Nenhuma operação no Root, outros candidatos, skills, pareceres prévios, segredos/.env, rede/providers, PG/Docker, subagentes ou commit. Shell/text tools e Python stdlib serviram apenas à infraestrutura de leitura, hashing, cópia e documentos; toda execução do projeto usou o Node absoluto autorizado e dependências do packet copiadas fisicamente. Escrita exclusiva `output/**`; nenhum arquivo confiável modificado. A task já estava claimed pelo Lead.

A conclusão cobre exclusivamente a soundness estática definida. Os probes demonstram divergências do checker real, sem executar fixtures ou construir payloads evaluator/process/worker/VM. Não se infere aceitação instalada/global/produção. Próximo passo pertence ao Lead: adjudicar findings e conduzir eventual ciclo separado, preservando casos e contrato.

Ledgers locais: [state](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [execution log](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz), [backlog](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz). Versão estruturada: [report.json](c1-write-wrappers-review-r7-reject-raw-evidence.tar.gz).
