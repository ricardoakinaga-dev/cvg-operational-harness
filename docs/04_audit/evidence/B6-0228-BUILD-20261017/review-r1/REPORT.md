# SPEC0228 — revisão independente R1

**Veredito: APPROVE_SCOPED_DIFF. Findings: nenhum defeito acionável encontrado no diff delimitado.**

O parecer cobre a primeira contenção aprovada: confiança nominal instalada retirada, nenhuma família legada suprime diagnósticos, FAIL preservado. Não conclui BUILD, B6, ADR010, gates globais ou produção.

## Autoridade e identidade

- SPEC compartilhada SHA-256 `05fa3140bff99be3b4b91c2a0f0212bd01f6dd10509785867e84d3fcd64bddfe`, conferida contra o pedido e `authority.json` (SHA-256 `568fb205bdf970beb47a81c7ce0aba0128c13646d88b05588d5c395b51e3889e`).
- Candidata `/home/ricardo/cvg-candidates/b6-0228-20261017`, branch `candidate/b6-0228-20261017`, base `5a199668eef5db4ca7aa2adc3853169ca0953cbf`.
- Inicialmente as mudanças estavam sobre a base. Durante a revisão o Lead criou o commit `f11f762f6a176417a40d2d53bdb67c633d7e1cef`, filho direto da base, contendo exatamente os cinco arquivos previstos. Seus blobs correspondem aos hashes abaixo; os 23 insumos fixados antes/depois permaneceram iguais. Alterações de certificação preparadas pelo Lead não entram neste parecer.
- Leitura de AGENTS raiz, constituição, coordenação, estado/log/backlog vigentes, ADR010, SPEC e autoridade. A instrução explícita do usuário limita toda escrita persistente a estes dois arquivos; coordenação e ledgers não foram alterados. Skill aplicada: `engineering-framework`; nenhum descendente.

| Arquivo da candidata | SHA-256 |
| --- | --- |
| `scripts/boundary-manifests.mjs` | `613e41a2aad3b181128e65f7560efbda967bbe9cd8b79ba80be9f81f3a118551` |
| `scripts/check-product-boundary.mjs` | `843fc287f03eefd2a62904f1cb87ffa98636779add1810f28866a0225846e1a0` |
| `tests/product-boundary.test.js` | `38132e99aeb79b7561906d4d4e4224cd5e1fa5fbdc0ea424a18d3093aa836655` |
| `tests/b6-0228-boundary-containment.test.js` | `a0c5bce34d500072ca212923725c1ebe05caef44af07aa84c6ad3d82adbc5dae` |
| `docs/08_runtime/0803_runbook_gates_locais.md` | `dbbf5e9199cb6115827e739c5508fb01322c3657f47f956169a87ccf39fd63c6` |

## Inspeção do contrato e testes

Em `scripts/boundary-manifests.mjs:398–470`, todas as saídas do verificador são não verificadas. Identidade nominal coincidente retorna `UNVERIFIED_INSTALLED_CONTENT`; versão divergente retorna `INSTALLED_VERSION_MISMATCH` e drift. O resultado não anuncia `source: package-lock.json`. Extração das dependências antecede a recusa; motivos específicos de ausência/identidade/manifesto inválido foram preservados.

Em `scripts/check-product-boundary.mjs:314–356`, a recusa não retorna antes da expansão de sucessores, scan literal e links físicos. Drift foi desacoplado do ramo verificado. Probes próprios cobrem dependências normais/optional/peer sob três condições de manifesto, link de produto, alvo externo, link declarado pendente e instalação aninhada. FAIL prevalece com evidência de produto mesmo junto de incerteza/drift.

Em `scripts/check-product-boundary.mjs:1714–1745`, o loop que removia diagnósticos foi eliminado integralmente; os16 grupos são somente inventário histórico. `exceptionsApplied` é falso e `exceptions` vazio. O filtro anterior em1710 continua limitado à proveniência da closure e não depende da tabela. Em105–109, legacy true acrescenta diagnóstico; em2543–2569, CLI normal/strict usa o mesmo contrato, preservando exits0/1/2 e rejeitando flag desconhecida.

A migração de expectativas em `tests/product-boundary.test.js` corresponde às seções5/6 da SPEC: metadados antes PASS agora INCOMPLETE; drift agora recusa; reflexão/host/catalog/subprocesso e site com pins continuam diagnosticados. Mudanças de linha/arquivo/ocorrência/pin/argumentos e arestas de produto continuam presentes. O novo teste focal mantém as duas versões concatenadas, ambos receptores B6, drift+literal, sucessor declarado e legacy true com/sem FAIL.

O inventário AST próprio comparou a base ao arquivo final: **131 testes de fronteira +7+7 de consumidor =145 preservados**; mesmas matrizes parametrizadas e ordem de declarações;162 chamadas `write`/`installed`/`link`/`t2Fixture` e32 chamadas `expectRefused`/`expectProductViolation` idênticas. Sete títulos foram migrados, sem casos removidos, skip/todo/fails/only. Os dois arquivos de consumidor são byte-identical à base. Os11 focais novos levam a156; o JSON fornecido registra156PASS e zero pendentes/todo. Isso não é uma nova execução dos156 pelo revisor.

Somente os cinco arquivos aprovados mudaram no commit. Runbook0803, linhas58–65, documenta INCOMPLETE/exit1 e ausência de aceite, sem reformular os outros gates. Nenhuma mudança em API/worker/kernel/produto, lockfile ou mecanismo novo de prova.

## Provas e cobertura

- **Executado pelo revisor:**29/29 probes sintéticos em Node `v22.23.2`, zero falhas, com TMP/outputs exclusivos em `/tmp/cvg-b6-0228-review-20261017`. Inclui grafo de180 pontes e saída CLI completa. Os códigos de fixture foram somente analisados, jamais executados.
- **Executado pelo revisor:**inventário AST e comparação de diagnósticos/grafo fornecidos, além de `git diff --check` focal (exit0).
- **Comparado independentemente:**165 diagnósticos estritos B6 anteriores preservados por objeto completo e multiplicidade; exatamente303 diagnósticos `UNVERIFIED_INSTALLED_PACKAGE` acrescentados. Normal/strict são idênticos.
- **Comparado independentemente:**mesmas670 entradas,998 nós,4822 arestas da closure e mesmos303 instalados; todos agora `verified:false`, `source:null`. Nenhuma perda ou corte demonstrado. `edgeCount:4932` agrega também arestas fora da closure; não é a contagem4822 do grafo exportado.
- **Evidência fornecida pelo Lead, não reexecutada:**árvore normal/strict INCOMPLETE, exit1,686 fontes,468 diagnósticos, zero exceções;12.496s/11.182s conforme recibos. Primeiro vermelho11 casos:10 falhas/1pass antes da correção, preservado no pacote.

| Critério | Avaliação deste parecer |
| --- | --- |
| B6R-01 | SUPPORTED_SCOPED — Probe próprio: neutro PASS; direto/transitivo FAIL com testemunho no grafo. |
| B6R-02 | SUPPORTED_SCOPED — Verifier e gate próprios: metadados coincidentes dão false/UNVERIFIED_INSTALLED_CONTENT; source ausente/nulo no grafo. |
| B6R-03 | SUPPORTED_SCOPED — Probe próprio: divergência exata mantém false, mismatch, drift e INCOMPLETE; nenhum range foi introduzido. |
| B6R-04 | SUPPORTED_SCOPED — Duas versões de caminho concatenado recusadas em probe próprio; novo teste conserva fixture B6; nenhum corpo instalado executado. |
| B6R-05 | SUPPORTED_SCOPED — Probes próprios: literal, link físico e dependências/optional/peer preservam FAIL, inclusive manifesto inválido ou fora do lock. |
| B6R-06 | SUPPORTED_SCOPED — Probes próprios: manifesto ausente/JSON inválido/array, instalação aninhada, link declarado pendente e alvo externo; testes antigos de identidade/ausência preservados; erro estrutural CLI exit2. |
| B6R-07 | SUPPORTED_SCOPED — Inspeção dos dois corpos B6 nos novos testes e registro focal verde; probes próprios com receptores locais inofensivos recusam em API e CLI normal/strict. |
| B6R-08 | SUPPORTED_SCOPED — Loop de supressão removido para todo o catálogo, não por família; comparação própria dos 165 diagnósticos antigos por objeto completo e multiplicidade não perdeu ocorrência; normal/strict idênticos. |
| B6R-09 | SUPPORTED_SCOPED — Probes próprios: legacy true adiciona UNAPPROVED_EXCEPTION_REQUEST sobre neutro e FAIL; nunca aplica exceção. |
| B6R-10 | SUPPORTED_SUPPLIED_TREE_EVIDENCE — Artefatos do Lead inspecionados e comparados independentemente: INCOMPLETE, 686 fontes, mesmos 303 instalados e zero supressões; árvore física não reexecutada pelo revisor. |
| B6R-11 | SUPPORTED_SCOPED — AST próprio: 131+7+7=145 casos, todas as matrizes iguais, 162 chamadas de fixture e 32 helpers negativos intactos; sete títulos migrados; sem skip/todo/fails/only; novo focal acrescenta11. |
| B6R-12 | PENDING_LEAD_VALIDATION — 156 focais/zero falhas/skips são evidência fornecida e inspecionada. Typecheck/lint/suíte completa/PG/E2E/certificação não recebem PASS deste parecer. |
| B6R-13 | PENDING_LEAD_COMPILED_CONSUMER — Diff restrito aos cinco arquivos; API/worker/kernel/produto e dois testes de consumidor byte-identical à base. Prova compilada final sem produto/aliases pertence ao Lead; não executada nem aceita aqui. |
| B6R-14 | SUPPORTED_SCOPED_AND_SUPPLIED_RECEIPTS — Probe próprio: 180 pontes no grafo/JSON CLI completos. Artefatos fornecidos: closure998 nós/4822 arestas sem perda, 686 fontes; recibos12.496s e11.182s. Performance da árvore não foi reexecutada pelo revisor. |

## Findings

Nenhum. Não há recomendação de mudança de código ou de enfraquecimento dos controles nesta R1. Os itens pendentes abaixo são limites explícitos desta revisão, não resultados verdes presumidos.

## Limites e próximo passo

B6R-12 continua pendente dos gates completos em Node22 sob responsabilidade do Lead; B6R-13 continua pendente da prova final do consumidor compilado sem produto/aliases. Este revisor não executou testes globais, aplicação, PG/Docker, serviços, rede/provider, instalações, certify/E2E, SBOM ou licenças. A performance real foi lida nos recibos, não medida novamente. A avaliação é independente do builder, mas parte da prova de árvore e dos156 focais foi fornecida e está identificada como tal.

A confiança positiva de conteúdo/semântica instalada continua ausente por desenho; a baseline permanece INCOMPLETE. Não há production GO, aceite B6/ADR010, conclusão do BUILD, push ou deploy concedidos. O Lead deve concluir e vincular os gates/prova compilada ao mesmo candidato; mudanças relevantes de fonte exigem revalidação.

## Evidências e hashes

`review.json` contém a matriz dos14 aceites, resultados completos dos29 probes, inventário AST, comparação independente, hashes dos insumos e fontes de reprodução dos probes/inventário. SHA-256 de `review.json`: `4064b7952fc896c4ce2fb8ca9837573d34df822533d365c12bb9daf804fb1248`. Os hashes temporários principais:

| Artefato próprio | SHA-256 |
| --- | --- |
| `/tmp/cvg-b6-0228-review-20261017/probes.mjs` | `16edf8a205baf31a2095a4b648309c910afe04568416e8bffb52c4a366500ea2` |
| `/tmp/cvg-b6-0228-review-20261017/probe-results.json` | `31cf1bdbd677985eb910d3e83f1046a891ff0c67f3667c4049342055c54625a1` |
| `/tmp/cvg-b6-0228-review-20261017/test-inventory.json` | `614d29be02dc58acc38c200bf0d6e95568cc80b619e1004454eacadf66e7bff8` |
| `/tmp/cvg-b6-0228-review-20261017/evidence-comparison.json` | `cb45013c9be8cd07783dbb49a47630cf9a13856e237bdc9ce0639af5afef671f` |
| `/tmp/cvg-b6-0228-review-20261017/inputs-before.json` | `b4bef254e1f6f7d0bac0085a9a3f4e7ab24a1e418ba0116f06de6942c14e5b4a` |
| `/tmp/cvg-b6-0228-review-20261017/inputs-after.json` | `b4bef254e1f6f7d0bac0085a9a3f4e7ab24a1e418ba0116f06de6942c14e5b4a` |
