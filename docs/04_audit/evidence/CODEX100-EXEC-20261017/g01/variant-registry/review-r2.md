# R2 — registro de fontes aceito no recorte T1

Dirac emitiu `ACCEPT_BOUNDED_SOURCE_VARIANT_REGISTRY`, sem novos achados. O
[parecer bruto R2](review-r2.raw.txt) fecha o P2 do [parecer R1](review-r1.md).
O crítico foi encerrado após a entrega.

Os [70 inputs locais e dois de raiz](review-r2-inputs.json) permaneceram íntegros,
com zero drift. Os [32 snapshots R1](review-r1-archive.json) conservam bytes,
tamanhos e hashes exatos. Catálogo, nove pacotes anteriores e normalizador
permaneceram inalterados.

A correção removeu somente `ToolSearchHandler` de busca de arquivos. Os outros
178 registros ficaram idênticos; 179 IDs, 976 dimensões propostas e 124 spans
permaneceram preservados. O registro atual contém 1.828 ligações candidatas.
FuzzyFileSearch/Mention e os vínculos pertinentes de descoberta de ferramentas
foram mantidos. A regressão independente passou com um positivo e oito negativos.

Na R2, capabilities e integração executaram `--check` com exit 0. Os 48 negativos
e 13 casos do normalizador já haviam sido reproduzidos na R1; seus inputs e
implementação não mudaram. O total corrente é de 13 controles de capabilities,
48 do normalizador e dez controles de desigualdade com regeneração da
integração. Esses dez não são provas semânticas independentes. A R1 também
preserva o censo de 19.947 fragmentos, 43.535 qualificadores, 12.699 referências
aninhadas e 7.724 bindings, além de probes RFC6901 e getter autenticado.

O aceite normaliza fontes e complementa os 179 placeholders sem alterar o
catálogo. Todos os 487 requisitos funcionais e 22 controles continuam NOT_RUN,
com zero recibos; 976 dimensões e 18 variantes da jornada proposta não são
testes executados. Owners normativos, papéis de fonte e suporte permanecem
separados. Os seis gaps SDK, cinco limites externos e 291 correlações TUI
continuam abertos.

Este parecer não fecha G01, não autentica a referência e não aprova G02/G03/G04,
SPEC, BUILD, runtime, paridade nativa ou release. A primeira jornada continua
proposta documental; contratos SDK e gates aplicáveis permanecem obrigatórios.
