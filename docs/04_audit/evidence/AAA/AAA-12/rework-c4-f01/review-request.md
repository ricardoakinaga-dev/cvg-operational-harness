# AAA-12 rework AAA12-C4-F01 — pedido de revisão independente

- Task: `AAA-12`. Rodada: correção pontual autorizada por `docs/04_audit/evidence/AAA/AAA-12/review-coordinator-hash-version/next-task-agent-2.md`.
- Autor: agent-2. Status: **IMPLEMENTED_PENDING_INDEPENDENT_REVIEW** (sem DONE, sem SQL, sem AAA-21).
- Candidato anterior preservado: `rework-canonicalization/manifest-rework.json` (`8d49cb2a…`).
- Novo candidato: **`70311445013852dcf65c8dcbf1534b266758406c79955ac3d9b7a4a4f3bc3238`** (14 arquivos; definição e comando de reprodução no `manifest-c4-f01.json`).

## O que mudou

- `#readRecord` (file): somente a **propriedade ausente** é normalizada para `legacy-local-v1`; valores explícitos `null`, número, booleano, objeto, array, string vazia ou whitespace são preservados como estão (sem reescrita).
- `decideReserve`: usa `resolvePersistedHashVersion` — ausente → legacy; valor explícito malformado/desconhecido → `version_mismatch` (fail closed), antes de hash, replay, takeover ou envio. Removido o fallback que tratava `null` como ausência.
- `assertSupportedPersistedHashVersion` aplicado a todas as transições (memory e file): `claimSend`, `renew`, `complete`, `fail`, `release`, `markUncertain`, `resolveUncertain`, `waitForTerminal` — erro estável `hash_algorithm_mismatch`, não retryável, sem mutação de bytes/revisão.
- Input de reserva inválido continua rejeitado antes de criar registro em ambos os adapters.
- `@cvg/shared`, `errors.ts`/`gateway.ts` não precisaram de mudanças; nenhum outro arquivo foi alterado.

## Evidência

| Item                      | Path                                                      | Resultado                                                                                                     |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Contraexemplo (probe)     | `probe-repro.log`                                         | `CONFIRMED_COUNTEREXAMPLE` pré-fix, exit 0 (reprodução do coordenador)                                        |
| RED                       | `red.log` / `red.exit`                                    | exit 1; 3 failed / 3 passed (6)                                                                               |
| GREEN adversarial         | `green-c4.log`                                            | exit 0; 2 arquivos / 15 testes                                                                                |
| GREEN consumidores        | `green-consumers.log`                                     | exit 0; 10 arquivos / 77 testes (canal + chaos)                                                               |
| Suíte completa            | `full-npm-test.log`                                       | exit 0; 181 arquivos / 948 testes PASS, 27 skips condicionais                                                 |
| Typecheck / lint / format | `typecheck.log` / `lint-channel.log` / `format-check.log` | exit 0 / 0 / 0                                                                                                |
| Cobertura full (privada)  | `coverage-full.log`                                       | exit 0; 86.66/81.77/90.01/87.74                                                                               |
| Cobertura subset canal    | `coverage-channel.log`                                    | exit 1 declarado: functions 79.61% no subset (`gateway.ts` 54.54% pré-existente); full-repo não oculta o FAIL |
| Diff                      | `diff-c4-f01.patch`                                       | 133 linhas; `before/` com hashes originais                                                                    |
| Matriz requisito→teste    | `manifest-c4-f01.json`                                    | 8 requisitos mapeados                                                                                         |

## Pontos para o revisor

1. Ausente × explícito inválido: somente ausência vira legado, inclusive sob caller legado suportado.
2. Nenhum caminho de mutação autoriza registro com versão malformada; bytes e `revision` preservados.
3. Paridade memory/file nos casos válidos (legado explícito, shared, ausente) e no input inválido.
4. Gateway: zero envios em todos os estados com versão malformada.
5. Débitos preservados: cobertura do subset, actor, SQL/migrations, composição AAA-21, durabilidade física.

## Limites

- Nenhuma escrita em registros compartilhados, `@cvg/shared`, `packages/persistence/`, migrations, `package.json`/lockfile ou contratos congelados.
- Cluster PostgreSQL 55432 usado somente nos testes de chaos do consumidor e segue isolado; nenhum efeito externo.
