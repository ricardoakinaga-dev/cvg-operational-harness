# R1 — reparo obrigatório antes de aceitar o registro

Dirac emitiu `REWORK_REQUIRED`, com um P2 e nenhum P0/P1 ou outro achado. O
[parecer bruto](review-r1.raw.txt), os [32 inputs exatos arquivados](review-r1-archive.json)
e o [reparo delimitado](rework-r2.json) permanecem preservados. Os arquivos do
snapshot têm extensão raw.txt para não executar código nem reinterpretar links
históricos a partir de outra pasta.

`CDX100-05-04` continha `ToolSearchHandler`, cuja fonte pesquisa metadados de
ferramentas adiadas. Essa relação não sustenta glob/grep/fuzzy search de arquivos.
Estar OPEN não torna pertinente uma candidata. A correção remove somente essa
associação e conserva os RPCs de fuzzy search, Mention e os vínculos corretos de
descoberta de ferramentas. A regressão específica rejeita o input R1 antes da
correção. Candidatos atuais passam de 1.829 para 1.828; requisitos, dimensões,
sementes, catálogo e pacotes anteriores permanecem preservados.

Na R1, os quatro comandos readonly passaram: capabilities e integrate com
`--check`, projections com `--check` e `--negative-tests`. Foram reproduzidos
12 controles de capabilities, 48 negativos/13 casos de projections e dez
controles de desigualdade com regeneração da integração. Esses dez não são
testes semânticos independentes.

O crítico conferiu 19.947 fragmentos, 43.535 qualificadores, 12.699 referências
aninhadas e 7.724 bindings; 179/179 objetos históricos e 507/507 registros
anteriores byte-exatos. Probes adicionais validaram RFC6901 com 25 positivos e
nove negativos, 14 identidades distintas e getter autenticado com um positivo e
quatro negativos. Foram conferidos 22 arquivos semente/124 spans e dez fontes
CVG/quatro spans da proposta com 18 variantes NOT_RUN.

Todos os 32+2 inputs permaneceram intactos ao final da R1. O achado impede aceitar
o registro como entregue. A revalidação R2 julgará os derivados corrigidos e a
regressão, sem converter o resultado em fechamento de G01, BUILD, paridade ou
release. Seis gaps SDK, cinco limites externos, 291 correlações TUI e G02/G03/G04
continuam obrigatórios; zero recibos funcionais.
