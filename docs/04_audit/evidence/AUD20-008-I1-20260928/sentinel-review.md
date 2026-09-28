# AUD20-008 — rechecagem independente do sentinel — 28/09/2026

Hypatia retornou **`SENTINEL_MATCH`** em leitura somente após o
[parecer I1](I1-review.md). Conferiu `packetSha256` e `reviewSha256` contra
os arquivos, os oito hashes de origem, o hash do bundle e o HEAD limpo
`7ef74e7f4fd2b1141e416b85c7337f119e1333ab`. Os 1.503 registros do
manifesto conferem em tamanho e SHA-256 com o worktree; o ID é
`47440863ddc96bcfc915e5d601ca7fd6badb9642fae25b844857e49d7f685348`.
O resultado arquivado vincula esse candidato ao run
`run-pr003-composite-r2-20260928`. Nenhum teste foi reexecutado nesta
rechecagem.

O [sentinel](sentinel.json) vale somente para o candidato isolado. Não
valida o run histórico `579d2100`, o checkout root ou produção. O finding
`A21-F20` permanece aberto no registro de certificação até nova
adjudicação e certificação no SHA final.
