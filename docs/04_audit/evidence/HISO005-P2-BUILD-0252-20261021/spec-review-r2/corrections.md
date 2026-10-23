# Correções da r3 sobre a revisão r2 da SPEC0252

- **R2-M1 (prólogo de diretivas).** §5.2 ganha a definição fechada do prólogo, igual nos dois níveis: só no início do arquivo e do corpo de função; sequência máxima de `ExpressionStatement` com literal de string puro; termina na primeira instrução que não é; diretiva strict só com o texto cru exato. C12, C13 e C15 entram como positivos, e os mutantes `mut-block`, `mut-expr` e `mut-fnlate` são nomeados na AB08.
- **R2-O1.** C14 (template) entra como positivo e `mut-tpl` na AB08; helper único testado em tabela nos dois níveis (`;` vazio, escape e parênteses em corpo de função).
- **R2-O2.** Os seis mutantes da r1 que só morriam como controles são nomeados na AB08 com o fixture que mata cada um.
- **R2-O3.** C01–C15 copiados para `fixtures-c/` na evidência, com sha256 em `fixtures-c-sha256.txt`.
- Contagens: AB01 26 positivos com PROVEN falso na v7; AB02 37 positivos.
- R2-O4 a R2-O7 (redação) ficam para o BUILD registrar, sem mudar o contrato.
