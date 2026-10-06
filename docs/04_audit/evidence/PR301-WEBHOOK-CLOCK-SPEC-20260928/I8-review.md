# SPEC 0162 — crítica independente I8

- Candidato examinado: SHA-256 `08892d7328ce6a7ce45943f5316f3e9de270fe21b11aeb18a55934469e520646`.
- Método: leitura integral fresh-context somente da SPEC indicada; hash confere. Não foram consultados outros arquivos/evidências; nenhum arquivo foi alterado e nenhum teste/BUILD foi executado.
- Veredito: `REVISE`; dois P1 e um P2. O contrato ainda não está pronto para aprovação humana/BUILD.

## P1

1. **A política não prova que as approvals são de pessoas distintas.** As entradas vinculam fingerprints a `(issuer, subject)` e exigem subjects/entradas diferentes, mas não definem identificador canônico nem fonte que valide a associação pessoa↔credenciais. Uma pessoa com dois certificados e subjects distintos poderia contar duas vezes.
   - **Mudança mínima pedida:** vincular cada credencial a um `person_id` estável emitido por autoridade de identidade confiável; exigir IDs distintos entre aprovadores e entre cada aprovador e executor; testar duas credenciais da mesma pessoa.
   - Referências no candidato: linhas 27, 34 e 70.

2. **Epoch inicial e baseline após rebase não estão definidos.** O contrato pede que `SAMPLE` inclua `guard_epoch` antes do primeiro insert, mas a linha singleton só surge após validar a amostra máxima. O high-water efetivo deriva de `SAMPLE`s no epoch ativo, porém não especifica como bootstrap cria esse epoch nem como `RECOVERY_REBASE` estabelece o baseline/head do novo epoch. Fica ambíguo como ocorre bootstrap e a primeira autorização depois de rebase.
   - **Mudança mínima pedida:** definir epoch de bootstrap antes da primeira amostra e fazer receipts de bootstrap/rebase estabelecerem baseline e head (incluindo `approved_safe_highwater`), ou exigir `SAMPLE` testemunhado nesse epoch antes do serving; testar primeira amostra/autorização após bootstrap e rebase.
   - Referências no candidato: linhas 21, 29 e 34.

## P2

1. **Benchmark sem taxa de chegada/modelo de carga.** A duração, concorrência e distribuição por tenant não fixam taxa oferecida nem gerador open-loop ou closed-loop. O teste closed-loop pode reduzir carga quando a latência sobe e esconder saturação. Faltam método de cálculo do percentil e número de execuções.
   - **Mudança mínima pedida:** fixar modelo/taxa, população medida e método de p99; repetir execuções e guardar cada resultado.
   - Referência no candidato: linha 89.

Sem estas correções, não aceitar o contrato. BUILD 0028 permanece não autorizado.
