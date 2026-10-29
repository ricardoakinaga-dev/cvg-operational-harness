# AUD0625-0257-P3-D9 — testes que faltavam na revisão da 0257 (só teste, sem código de produção)

Branch `claude/aud0625-0257-p3-d9`, base `426399fb28f1387089819e973efcc9666757b5ae`. Node 22.23.2, `--maxWorkers=1/2`. Nenhum arquivo de produção foi alterado. Sem push. Produção segue `NO_GO`.

| P3 | Teste | Mutante que ele mata |
| --- | --- | --- |
| S1 header depois da authz | `api-creation-authenticated.test.ts`: operador sem grant com header ausente, inválido ou curto = 404 e nada criado; sem identidade com header inválido = 401; operador com grant e sem header = 400 | ler o header antes da authz (3 falhas) |
| S6 ator da aprovação | o evento de criação carrega `Operator`/`operator.a`; o mesmo corpo e chave de outro operador com grant é 409 e o autor tem replay 200 com o mesmo id | ator sempre `System/api` |
| S7 ator da task | idem para a task (chave no corpo) | ator sempre `System/api` |
| S4 caixa do header | par `Idempotency-Key` + `idempotency-key` por socket real, com `Host` e `Content-Length` explícitos; controle: um só `Idempotency-Key` com a mesma moldura é 200 | comparação do nome sem `toLowerCase`; duplicados permitidos |
| W6 duplo clique síncrono | `export-approval-logical-operation.test.tsx`: dois `click()` dentro do mesmo `act` disparam UMA requisição | tirar o guard `auditExportInFlight` |
| PG7 ROLLBACK | `api-creation-postgres.test.ts` (AC11(f)): sessão inexistente falha depois do BEGIN, o `ROLLBACK` do pool falho lança, o `release` recebe o erro, o erro devolvido é o ORIGINAL ("Session not found") e uma só liberação | devolver o client ao pool depois de um `ROLLBACK` que falha |

Provas: 5 mutantes mortos ([mutations.txt](proofs/mutations.txt)); `api-creation-authenticated` 8/8, mais `api-creation-http` e o teste do console, 29/29; PG 16.15 em contêiner próprio (removido), `api-creation-postgres` 16/16 ([pg-api-creation-postgres.txt](proofs/pg-api-creation-postgres.txt)); typecheck 0 e eslint 0.

Nota de método: a primeira versão do S4 passava pelo motivo errado. Com a lista plana de cabeçalhos o Node não acrescenta `Host` nem o enquadramento do corpo, e o servidor respondia 400 de qualquer jeito, então o mutante da caixa sobrevivia. O teste agora declara `Host` e `Content-Length` e tem um controle que dá 200, e só então o mutante morre.
