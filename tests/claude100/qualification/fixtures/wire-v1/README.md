# Wire version1 — exemplo documental sintético

Estes arquivos são dados fabricados para especificar o formato e os digests do mecanismo daSPEC0229. **Não houve capturaClaude/CVG, decisão humana ou aprovação de SPEC.** Os registros de decisão/identidade são placeholders explícitos; os hashes correspondem apenas a estes exemplos, não a um executável. Nenhum índice real de confiança do Lead inclui esses captureIds.

`manifest.json`, `rule.json`, os dois índices e os receipts definem uma entrada estruturalmente válida para teste isolado futuro. O catálogo é cópia byte-exata do insumo do exemplo, não um controlador nem nova medida. Mesmo um resultado estrutural MATCH em um teste não concede paridade ou autoridade. Sem admissão deliberada de dados sintéticos pelo harness de teste, a origem real deve ser UNTRUSTED_CAPTURE.

As quatro variantes altered-\*.json preservam receipts/índices originais e mudam execution ou fixture. O vínculo do envelope deve recusá-las comoUNTRUSTED_CAPTURE. Esses resultados são expectativas de SPEC, **NOT_RUN**; não são testes executados de um comparador já implementado. Limites, tipos, estados e precedência são normativos naSPEC0229.
