# Reparo estático — aceite restrito

Socrates, revisor I1 com contexto novo, aprovou SG01–SG04. O Lead autenticou
27 entradas, 29 saídas e o manifesto; os 28 controles passaram e a
reexecução do Lead produziu o mesmo JSON após normalizar apenas o caminho
de saída. [Aceite e limites](acceptance-scoped.json),
[parecer](review-r1/review.json), [manifesto](publication-manifest.json).

O delta muda cinco arquivos apenas no worktree: duas palavras nos textos
de evidência dos testes, a classificação de imports dentro de `__tests__`,
a dependência de desenvolvimento do orquestrador no workspace persistence
e o metadado correspondente do lockfile. As assertivas, o guard original
de arquitetura, o runtime, os contratos, as configurações e os pins de
qualificação permanecem intactos. As 81 entradas R19 originais estão
preservadas; 79 continuam idênticas e as outras duas são os textos de teste.

A baseline reproduziu 3 PASS/2 FAIL. A primeira tentativa, preservada,
produziu 10 PASS/1 FAIL e revelou a segunda palavra no outro texto.
Depois do ajuste, as cinco assertivas dos guards e quatro casos de
checkpoint passaram; seis casos de admissão também passaram na fonte
inalterada. Tipagem, lint e formato da fonte final passaram.

A [suíte global posterior](../global-units-static-r1/README.md) terminou
com 4406 PASS, 44 FAIL e 282 SKIP, além da carga sem recurso da fixture
PostgreSQL obrigatória. O aceite é somente do delta estático; T2 integral,
PostgreSQL, E2E e paridade permanecem abertos. Nenhum código foi promovido
para ROOT, nenhum commit/push/deploy foi realizado.
