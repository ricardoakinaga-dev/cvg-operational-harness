# AAA-12 rework — pedido de revisão independente (canonicalização e versão de hash)

- Task: `AAA-12`. Rodada: correção local de canonicalização/versionamento autorizada por `docs/04_audit/evidence/AAA/AAA-05/review-coordinator-v3/next-task-agent-2.md`.
- Autor: agent-2. Data: 2026-09-12. Status: **IMPLEMENTED_PENDING_INDEPENDENT_REVIEW** (sem DONE, sem SQL, sem AAA-21).
- Candidato anterior preservado: `docs/04_audit/evidence/AAA/AAA-12/manifest.json` (`33aa2807…`, superseeded).
- Novo candidato: **`8d49cb2ad7268a06bcaae6aaeebd53169c7d5db0e30a3b4dbed4a9d1f0b55492`**
  - definição exata: sha256 sobre linhas `path\0sha256` dos 13 arquivos em ordem lexicográfica, unidas por `\n` sem newline final;
  - comando de reprodução no campo `candidateDigestCommand` de `manifest-rework.json`.

## Artefatos

| Item                     | Path                                             | SHA-256 / resultado                                                                             |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Manifesto da rodada      | `rework-canonicalization/manifest-rework.json`   | contém hashes por arquivo, mapa requisito→teste e limitações                                    |
| Diff dos fontes          | `rework-canonicalization/diff-src-rework.patch`  | 212 linhas; `before/` com hashes originais em `before/HASHES.txt`                               |
| RED                      | `rework-canonicalization/red.log` / `red.exit`   | exit 1; 7 failed / 2 passed (9)                                                                 |
| GREEN focado             | `rework-canonicalization/green-hash-version.log` | exit 0; 9 passed (9)                                                                            |
| GREEN consumidores       | `rework-canonicalization/green-final.log`        | exit 0; 9 arquivos / 71 testes (canal + chaos com PostgreSQL local)                             |
| Suíte completa           | `rework-canonicalization/full-npm-test.log`      | exit 0; 178 arquivos / 913 testes PASS, 27 skips condicionais                                   |
| Typecheck                | `rework-canonicalization/typecheck.log`          | exit 0 (inclui o check de tipos de `hashVersion` no registro/round-trip)                        |
| Lint / format (canal)    | `lint-channel.log` / `format-check.log`          | exit 0 / exit 0                                                                                 |
| Cobertura full (privada) | `rework-canonicalization/coverage-full.log`      | exit 0; 86.44/81.59/89.7/87.52                                                                  |
| Cobertura subset canal   | `rework-canonicalization/coverage-channel.log`   | exit 1 declarado: functions 78.21% no subset (gateway.ts 54.54% pré-existente); full-repo passa |

## Pontos para o revisor

1. `canonicalizeJson` de `@cvg/shared` é a única fonte de hash; `canonicalizePayload` virou wrapper deprecated.
2. `hashVersion` é obrigatório no input, persistido no registro memory/file e normalizado para `legacy-local-v1` na leitura de registros antigos, sem reescrever bytes.
3. Versão é comparada **antes** de hash/replay/takeover/envio; incompatível/desconhecida → `hash_algorithm_mismatch` não retryável, zero envios, bytes preservados; mesma versão com payload divergente continua `idempotency_key_reuse`.
4. Estados `PENDING/SENDING/CONFIRMED/FAILED/UNCERTAIN` cobertos pela checagem de versão.
5. Concorrência, fencing, incerto e isolamento preservados: suítes anteriores reexecutadas em `green-final.log`.
6. Não implementados e fora do escopo: actor de reconciliação, SQL/migrations `0012`/`0013`, migração automática de registros legados, composição AAA-21, rodada ampla de cobertura.

## Observações honestas

- `format:check` repo-wide tem 12 avisos pré-existentes em artefatos de evidência pinados de rodadas anteriores; os arquivos de código e os novos artefatos desta rodada passam.
- O cluster PostgreSQL descartável (55432) continua isolado e foi usado apenas nos testes de chaos do consumidor.
