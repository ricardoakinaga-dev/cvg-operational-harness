# Crítica de código — BUILD SPEC0248, rodada 2

- Delta revisado: `build-r2.diff` sha256 `68962d05dfd89a6faf1e58147a4d94ad9e122fe24cdd569fe024da3d7ce55f07` (igual ao `git diff` da candidata), interdiff r1→r2 `55aa714b…`.
- Mesmo crítico da rodada 1 (não-fork, só leitura).
- Veredito: **APPROVE** — C1-01, C1-02 e C1-03 fechados; o reparo não criou obrigatório novo.

Transcrição fiel (registrada pelo executor):

- C1-01 fechado: `gateway.ts:271-277` nega teto ou estimativa não finitos; teste cobre teto Infinity sem teto na request, teto e estimativa Infinity e os dois NaN, com 0 chamadas; `-Infinity` também é negado.
- C1-02 fechado: `iterative-runtime.ts:155-186` `snapshotUsage` lê uma vez, valida a cópia e devolve só a cópia; exceção dentro do try; sucesso (1131-1135) lê `decided.usage` uma vez; `recordCall` (1179-1186) usa só a cópia; o teste 5→NaN mataria o mutante.
- C1-03 fechado: `rejects.toBe(raw)` sem porta e com a porta recusando o reparo exercita o braço `: error` e prova a cláusula da §3.1.
- P3 aplicados conferidos: C1-04, C1-05, C1-06, C1-08, C1-09; justificativas de C1-07 e C1-10 aceitáveis.

P3 novos (não bloqueiam):

- **C2-01.** `http-errors.ts:92`: o fallback sem stream chama `networkError(providerId, error)` sem `maxBytes`; inalcançável com `ResponseTooLargeError` hoje; repassar só por consistência.
- **C2-02.** No sucesso, `turn.usage === null` passou a dar `MODEL_FAILURE` "Orchestrator reported invalid model usage." (base e r1 tratavam null como vazio por `??`). O tipo `IterativeOrchestratorTurn.usage?: ModelUsage` não admite null; nenhum orquestrador ou teste do repositório devolve null; a mudança é mais restritiva e não abre caminho para COMPLETED. Registrar na nota de compatibilidade ou voltar a tratar null como ausente.

Também conferido: mesmos 16 arquivos; sem `v8 ignore`, `ts-ignore`, `eslint-disable`, `.only` ou `.skip` novos; tokens proibidos ausentes; nada fora do escopo. Não conferido pelo crítico: execução de suítes, cobertura, mutantes, typecheck, lint e PostgreSQL.

## Tratamento dos P3 novos (executor)

- C2-01: não aplicado nesta rodada (inalcançável; sem efeito). Residual registrado.
- C2-02: mantido como está, por ser mais restritivo e fora do tipo público; declarado aqui e na nota de compatibilidade do `ledger-delta.md`. Nenhuma mudança de código após o APPROVE.
