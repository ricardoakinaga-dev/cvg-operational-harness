Os links locais abaixo apontam para o arquivo compactado. Os caminhos originais e bytes exatos estão no [manifesto](c1-reachable-review-r8-reject-artifact-manifest.json); o relatório bruto e seus links relativos estão preservados dentro dele.

# C1_REACHABLE_FRESH_REVIEW_R8 — REJECT scoped

**Veredito: REJECT**, restrito à validade de inputs globais e ao escopo C1 autorizado. Um finding **P1** impede o aceite. O gate da cópia instalada continua **INCOMPLETE**; nenhum aceite instalado, global ou de produção é concedido.

Freeze: `532640aca3626c71d49ba1acb872f3f6f95304884fccddc29240948878316e7e`.
Node: `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`, versão `v22.23.2`.

| Evidência                                                                 | Total | Passaram | Falharam |
| ------------------------------------------------------------------------- | ----: | -------: | -------: |
| Vitest nativo: arquivo fornecido, sem alterações                          |   363 |      363 |        0 |
| Provas próprias usando implementações reais / símbolos / audit parse-only |   189 |      182 |        7 |
| Relações abstratas de assignedValues/valueBranches                        |    42 |       42 |        0 |
| Provas próprias, total                                                    |   231 |      224 |        7 |

## P1 — C1-R8-F01: metadados globais inválidos recebem PASS

O checker valida a sintaxe JSON, mas não valida o formato dos manifestos, nomes de workspaces ou mapas de dependências antes de construir as raízes. `manifest.workspaces ?? []` pode eliminar toda a descoberta de workspaces; `workspaces.set(pkg.name, ...)` aceita nomes inválidos; spread seguido de `Object.keys` transforma arrays/strings de dependências em índices, descartando nomes de dependências.

Locais: [check-product-boundary.mjs](c1-reachable-review-r8-reject-raw-evidence.tar.gz), linhas 102, 136, 154–157 e 337–344.

Reprodução mais direta, preservada em [fixture dependency-array](c1-reachable-review-r8-reject-raw-evidence.tar.gz):

```json
{ "name": "@neutral/core", "dependencies": ["@neutral/consumer"] }
```

Com fonte core neutra e o produto registrado como workspace, `auditProductBoundary` real retorna **PASS**, `passed: true`, zero diagnósticos e zero violações. O input tem um mapa de dependências inválido; deveria bloquear globalmente. A forma válida de dependência do produto é detectada e recebe **FAIL** em `metadata-product-edge`.

Sete inputs inválidos receberam PASS: manifesto raiz como array; manifesto raiz como string; workspaces nulo; dependencies como array; dependencies como string; manifesto de produto não relacionado como array; nome de workspace de produto como número. Os dois controles válidos receberam PASS. Produto não relacionado mantém seu próprio gate para diagnósticos de fonte; isso não torna os inputs globais de descoberta válidos.

Evidências: [resultados completos](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [falhas brutas](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [driver](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [log](c1-reachable-review-r8-reject-raw-evidence.tar.gz). O driver terminou com exit 1. As falhas não foram corrigidas, suprimidas ou substituídas. Este finding demonstra aceite de esquema inválido; não demonstra execução nem bypass com manifesto válido.

Ação para o Lead: validar esses formatos antes de derivar raízes e aplicar o filtro de diagnósticos; adicionar regressões inertes mantendo os controles positivos e a separação dos gates de produto. Nenhum fix foi aplicado nesta crítica.

## Evidências positivas e unknowns preservados

Os três analisadores reais foram inspecionados: [boundary-lexical](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [boundary-code-execution](c1-reachable-review-r8-reject-raw-evidence.tar.gz) e [check-product-boundary](c1-reachable-review-r8-reject-raw-evidence.tar.gz).

- 80 relações nativas de ownership CJS/ESM com BindingElement, padrões aninhados/array e os cinco nomes de wrapper; 20 relações static/catch; quatro alvos de escrita de initializer em catch; três relações de cópia inicial parameter/body. São provas do binder sobre AST inerte, sem execução de fixtures.
- 35 seleções de assignedValues e sete joins de valueBranches preservam os nós identificadores originais e os caminhos esperados, incluindo wrappers, padrões e defaults. Essas são **relações abstratas**, não substitutos de classificadores nem provas nativas de capacidade.
- 21 invocações neutras de receiver, por call/tag/new e sete wrappers, mantêm INCOMPLETE. Sete positivos de own scalar recebem PASS; sete padrões selecionando constructor desconhecido mantêm INCOMPLETE. Mutação, alias, getter e valor desconhecido continuam bloqueados.
- Imports literais/transitivos, quatro classes de dependências de workspace, testes core e testes alcançados fora do core mantêm os diagnósticos físicos na closure. Vendor físico é analisado, inclusive implementação JS distinta de `.d.ts`, erro de parsing, import ausente e import não literal. Todos esses unknowns alcançados permanecem INCOMPLETE.
- Produto/legacy/vendor/teste não alcançado não contamina a closure; produto literal e por metadata recebe FAIL. Empty core recebe INCOMPLETE. JSON sintaticamente inválido, configuração/opção/path inválidos e symlink interno de fonte bloqueiam.

Drivers e resultados: [proof-driver.mjs](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [provas normalizadas](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [provas brutas](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [log](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [raw-failures inicial](c1-reachable-review-r8-reject-raw-evidence.tar.gz).

No resultado bruto inicial, `passed` das linhas de audit significa a aprovação do audit, não sucesso da assertion. A [normalização](c1-reachable-review-r8-reject-raw-evidence.tar.gz) acrescenta `proofPassed` e preserva `auditPassed`; os resultados do checker e o arquivo bruto permanecem intactos.

## Vitest nativo e gate instalado

O [log do Vitest](c1-reachable-review-r8-reject-raw-evidence.tar.gz) e o [JSON nativo](c1-reachable-review-r8-reject-raw-evidence.tar.gz) registram 363/363, um arquivo, zero falhas e zero pendentes. Comando, ambiente e cwd constam em [commands.json](c1-reachable-review-r8-reject-raw-evidence.tar.gz). O checker e o teste fornecido têm hashes iguais ao inventário; nenhuma injeção ou stub foi usado.

O scan real parse-only da cópia runtime terminou com exit 1, **INCOMPLETE**, 3.082 fontes, 592 core, 26 workspaces, 11.985 edges, zero violações e **1.610 diagnósticos**. O detalhe permanece em [installed-scope-audit.json](c1-reachable-review-r8-reject-raw-evidence.tar.gz), com [stderr vazio](c1-reachable-review-r8-reject-raw-evidence.tar.gz). Os unknowns não foram reclassificados para conseguir verde. Esse scan não concede aceite instalado/global/produção.

## Integridade e fronteira

**wholeSource/deps/dirs válidos.** As 19.382 entradas do inventário e os 1.970 diretórios foram comparados integralmente antes/depois: zero mudanças em hashes, destinos de links, inodes, mtimes/ctimes em nanossegundos, modos, tamanhos e contagens de links. Authority, freeze e inventário também ficaram inalterados. O freeze fornecido contém arquivos/links; a validade de diretórios usa o snapshot próprio before.

Evidências: [before completo](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [after completo](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [resumo after](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [driver](c1-reachable-review-r8-reject-raw-evidence.tar.gz). A [cópia física inicial](c1-reachable-review-r8-reject-raw-evidence.tar.gz) e a [verificação final](c1-reachable-review-r8-reject-raw-evidence.tar.gz) confirmam ausência de hardlinks e links externos no runtime; checker/teste permanecem idênticos. A única mudança de arquivo original na cópia foi o cache Vitest `node_modules/.vite/vitest/.../results.json`, exclusivamente em output. TMPDIR e cache também ficaram em output.

Não houve execução da suíte original code-execution nem import/avaliação de fixtures. Provas próprias usam texto neutro/AST/símbolos ou o audit real que parseia e resolve caminhos físicos. Threads normais do Vitest e o resolver já existente são infraestrutura confiável, sem payloads de evaluator/process/worker/vm. Nenhuma rede/provider/PG/Docker/subagente, leitura do checkout root/histórico/outros candidatos/skills/pareceres anteriores, fix de source ou commit foi usado. Hashes opacos de integridade não foram usados como material de segredo ou de ambiente.

Uma inspeção de metadados usou cwd incorreto e recebeu ENOENT; a leitura foi corrigida. A [falha de infraestrutura bruta](c1-reachable-review-r8-reject-raw-evidence.tar.gz) foi preservada. Não afetou testes ou veredito. Provas finitas de AST e fixtures não constituem prova universal da semântica JavaScript.

## Continuidade local

[Runtime state](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [execution log](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [backlog](c1-reachable-review-r8-reject-raw-evidence.tar.gz), [claim](c1-reachable-review-r8-reject-raw-evidence.tar.gz) e [report.json](c1-reachable-review-r8-reject-raw-evidence.tar.gz) foram escritos somente em output. Claim, integração e ledgers do repositório são responsabilidade do Lead.
