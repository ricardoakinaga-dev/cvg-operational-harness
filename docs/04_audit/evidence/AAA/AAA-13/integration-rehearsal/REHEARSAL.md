# AAA-13 — ensaio integrado de certificação local (snapshot isolado)

- Task: `AAA-13` integração produtor → artefatos → verificador. Status: `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`.
- Autorização: instrução do coordenador em `review-coordinator-r4/next-task-agent-3.md`; full certify autorizado **somente** na cópia isolada sintética.
- Snapshot: `/tmp/opencode/aaa13-integration/repo`, a partir de `/home/ricardo/cvg-agent-secretary-v2`, sem reset/stash/commit na origem.
- Candidato: `79a2a0d422e2da7b5348d827f857afc15fc55c73cdf2962f122ddb6ef361710d` (799 arquivos: 774 tracked, 25 untracked) — idêntico na origem e na cópia (0 mismatches).
- Scripts nos hashes aprovados: `certification-rules.mjs 1d1edc9d…`, `phase10-verify.mjs 24825421…`, `phase10-certify.mjs 46b024c8…` (origem = cópia; inalterados após o ensaio).

## 1. Resultado do ensaio

| Etapa        | Comando                                   | Exit  | Resultado                                                                                                           |
| ------------ | ----------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| Snapshot     | `node create-snapshot.mjs …`              | 0     | candidateId origem = cópia; 0 mismatches                                                                            |
| Dependências | `npm ci --ignore-scripts`                 | 0     | instalação isolada; candidateId inalterado                                                                          |
| Produtor     | `npm run certify` (22:46:26Z → 22:57:29Z) | **0** | 16/16 gates `PASS`; decisão mecânica `CONDITIONAL_GO / AAA_CONTROLLED`; `runId=run-79a2a0d422e2-mtyz5kfq`           |
| Verificador  | `npm run certification:verify`            | **0** | `current candidate qualified`; 27 hashes de artefato; mesmo `candidateId`/`runId`; `gate-matrix`: 0 falhas, drift 0 |

Nenhuma edição de relatório, remoção de achado ou redução de limiar foi feita. Os resultados originais do produtor foram preservados antes de executar o verificador.

## 2. Vínculo candidato / runId / gate / artefato

- Cada log de gate carrega `# runId=… candidateId=… gate=… command=…` e `# exitCode=…`; a matriz confere os quatro vínculos para os 16 gates (`headerBindings` todos `ok`).
- Cada registro de gate possui `evidence[]` com `sha256`/`size`; cada artefato consta do manifesto com o `gateId` dono. A matriz confere os hashes item a item (`manifestMatch`).
- `verifyGateEvidence` re-derivou os resultados dos bytes brutos: **0 falhas**. O verificador público ainda recalculou o `candidateId` do snapshot e confirmou que nada mudou após os testes.
- `candidate-drift.json` não foi produzido.

## 3. Inventário de skips (diferença de ambiente)

Com o PostgreSQL descartável presente, **todos os gates tiveram 0 skips** e nenhuma justificativa de skip foi necessária:

- `unit`: 186 arquivos / 981 testes PASS, 0 skips (na árvore compartilhada, sem `TEST_DATABASE_URL`, o mesmo gate registra 4 arquivos/27 testes skips condicionais).
- `postgres`: 11 arquivos / 84 testes PASS, 0 skips.
- `chaos`: 16 cenários executados / 16 aprovados (CHAOS-04/05 rodaram por haver banco).
- `e2e`: 6 testes PASS. `coverage`: 87,56 / 82,69 / 91,11 / 88,65.

Isso é diferença de ambiente sintético, não melhoria de produto; o rótulo de skip da árvore compartilhada continua sendo o baseline sem banco.

## 4. Classificação

- `clean_integration`: nenhuma falha de produto, ambiente, drift ou incompatibilidade produtor/verificador. O produtor emitiu evidência que o verificador aceitou no mesmo snapshot.
- O ensaio **não** resolve findings de auditoria (F01–F03/F05 etc.) nem substitui revisão independente.

## 5. Rótulo mecânico × barra AAA congelada

`CONDITIONAL_GO / AAA_CONTROLLED` é a decisão do produtor Phase 10 com gates externos pendentes; **não** é a barra AAA-04 v2:

- Pisos congelados: ≥90 statements/lines/functions, ≥85 branches, ≥95 branches críticos, 100% mutação selecionada. Medido: statements 87,56, branches 82,69, functions 91,11, lines 88,65; branches críticos e mutação **não medidos**.
- `externalGates`: provider/canal/identidade `NOT_VALIDATED`; signoff humano `PENDING`.
- `findings.json` do produtor mantém 5 achados P2 (4 `OPEN_ACCEPTED` com `riskAccepted=true`, 1 `PENDING_HUMAN`), herdados da barra anterior; o ensaio não os revalida nem os aceita.
- Nenhuma alegação de DONE, G_QUALITY, produção, State of Art ou Triplo AAA.

## 6. Preservação

- `shared-before.txt` × `shared-after.txt`: hashes idênticos para os três scripts, `certification/manifest.json`, `phase10-result.json`, `negative-validation.json` e o digest de `certification/logs/historical/` (byte a byte).
- Nenhum certificado/manifesto compartilhado foi escrito: todo o produtor/verificador rodou em `/tmp/opencode/aaa13-integration/repo`.
- Snapshot sem credenciais: apenas `.env.example` (1010 bytes); `.env`/`.env.local` não copiados.
- Exclusões de escopo: `.gauntlet/**` e saídas geradas de `certification/` (+ `.git` original) não compõem o snapshot; entradas `findings.json`/`external-gates.json` foram copiadas. O `.git` do snapshot é um commit local do ensaio, não a história da origem.
- PostgreSQL do ensaio: pacotes Ubuntu 16.15 extraídos em `/tmp`, cluster próprio na porta **55433**, `fsync=on`, `synchronous_commit=on`, `full_page_writes=on`; 5432 (operacional) e 55432 (outra frente) não foram tocados nem reutilizados.

## 7. Artefatos e hashes

- `run/certification/`: resultado, manifesto, candidate-manifest e relatórios brutos do snapshot (11 arquivos).
- `run/logs/`: 16 logs de gate. `run/certify.log`, `run/verify.log`, `run/npm-ci.log`, `run/postgres/*`.
- `gate-matrix.json` / `gate-matrix.md` / `analyze.log`: correlação por gate.
- `snapshot-manifest.json` + `snapshot-files.sha256`: definição e hashes do snapshot.
- `shared-before.txt` / `shared-after.txt`: prova de preservação da origem.

## 8. Limitações e bloqueios

- Ambiente local sintético; provedor/canal/IdP/fonte institucional e signoff humano ausentes — gates externos permanecem pendentes.
- Barra AAA v2 não demonstrada (coverage abaixo dos pisos; mutação/branches críticos sem medição) e achados P2 do produtor permanecem.
- O ensaio prova integração e vínculo de evidência; não prova produção, durabilidade física multi-host nem qualidade integral do produto.
- `documentation-checks`/Docker/benchmark fora do escopo desta task.
