# C1 — precisão lexical do checker (T2)

Task `C1_LEXICAL_PRECISION_R1`, BUILD local autorizado pela correção contínua do usuário e SPEC curta C1 existente.

Recon: o checker usa grafia global por arquivo; bindings locais, nomes de tipos, metadata e reexports neutros podem receber INCOMPLETE indevido. A revisão R2 é formalmente INVALID por leitura fora do packet; seus achados são reproduções informativas, não aceite.

Escopo: cópia isolada, scripts/check-product-boundary.mjs e scripts/boundary-code-execution.mjs, helper lexical se necessário e novo teste próprio. Identidade de declaração/scope, ancestry sintática e classificação comprovada de valores escalares. Não retirar roots, vendor, tipos, testes, arestas ou desconhecidos; nada de whitelist ampla. Preservar capacidades globais verdadeiras, aquisição desconhecida, extends/decorators/computed names/defaults executáveis e reatribuições conservadoras.

Novas fixtures somente texto inerte parseado, sem execução de evaluator/processo/worker/vm. Originais 253 regressões e assertivas readonly. Pronto: regressões e novos controles estáticos verdes, scanner instalado honesto (INCOMPLETE não é PASS), hashes de originais preservados, typecheck/lint/formato e nova revisão antes promoção. Sem provider real, dados reais, push ou implantação.
