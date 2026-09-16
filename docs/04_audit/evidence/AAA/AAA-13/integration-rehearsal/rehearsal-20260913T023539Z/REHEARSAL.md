# AAA-13 — ensaio integrado de certificação local (snapshot isolado, 2026-09-13T02:35:39Z)

- Task: `AAA-13` — integração **produtor `phase10-certify` → artefatos → verificador `phase10-verify`** com gates locais reais. Status: `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`.
- Autorização: instrução do coordenador em `docs/04_audit/evidence/AAA/AAA-13/review-coordinator-r4/next-task-agent-3.md`; full certify autorizado **somente** na cópia isolada sintética.
- Este pacote é uma rodada nova. O pacote anterior em `integration-rehearsal/` (`79a2a0d…`, 799 arquivos) foi **preservado byte a byte**; a árvore compartilhada mudou desde então (821 arquivos), por isso a rodada foi refeita. Nenhum arquivo anterior foi removido ou editado.

## 1. Identidade do candidato e snapshot

| Item                     | Valor                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Origem                   | `/home/ricardo/cvg-agent-secretary-v2` (HEAD `512bc11e80fbf7c7b8baf6263aacc811ff829309`, branch `main`, dirty)                   |
| Snapshot                 | `/tmp/opencode/aaa13-rehearsal-20260913T023539Z/repo` (commit local sintético `f4026cacc362442fd5c776d7a261b9e217c52a66`, dirty) |
| `candidateId`            | `159dd98e9fe5acbd4cfa70879b5349c95b2c419f565eb183ffbd0e95c1dc1a34`                                                               |
| Arquivos                 | 821 (774 tracked + 47 untracked); hashes em `snapshot-files.sha256`                                                              |
| Igualdade origem ↔ cópia | `originBefore = originAfter = copy = producer = 159dd98e…`; 0 mismatches                                                         |
| `runId`                  | `run-159dd98e9fe5-mtz7czwz`                                                                                                      |
| Node / npm               | `v24.20.0` / `11.19.0` (alvo do projeto é Node 22 — limitação declarada)                                                         |
| Ambiente                 | `CI=1`, `CVG_API_PORT=3233`, `CVG_WEB_PORT=4233`                                                                                 |
| Scripts aprovados        | `phase10-certify.mjs 46b024c8…`, `phase10-verify.mjs 24825421…`, `certification-rules.mjs 1d1edc9d…` (inalterados)               |

A cópia foi construída por `create-snapshot.mjs` a partir do escopo canônico do candidato (tracked + untracked não ignorados), **preservando a partição tracked/untracked** via `git init` local: os arquivos tracked da origem entraram no índice do snapshot; os untracked permaneceram untracked. `git ls-files` do snapshot foi capturado **antes** do ensaio (`snapshot-files.sha256`, 821 linhas, criado às 02:35:39Z; certify iniciou 02:36:17Z). O `candidate-manifest.json` do produtor confere com essa lista: 821/821 hashes iguais, 0 mismatches, sem `candidate-drift.json`. Nenhuma credencial foi copiada (apenas `.env.example`; `.env`/`.env.local` são ignorados e não existem no snapshot).

## 2. Comandos, exit codes e resultados

| Etapa                   | Comando (na cópia)                                                                               | Início/fim (UTC)      | Exit  | Resultado                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------- | ----- | -------------------------------------------------------------------------- |
| Snapshot                | `node create-snapshot.mjs <origem> <snap>/repo <evidência>`                                      | 02:35:39Z             | 0     | candidateId idêntico origem↔cópia, 0 mismatches                            |
| Dependências            | `cp -a node_modules` (declarado; symlink evitado para não resolver pacotes da origem)            | 02:35Z                | 0     | 273 MB copiados; candidateId inalterado                                    |
| PostgreSQL              | `initdb` + `pg_ctl start` (cluster novo, porta 55433, fsync on)                                  | 02:36Z                | 0     | `cvg_aaa13_rehearsal` dedicado; `pg-verify.log`                            |
| Produtor                | `npm run certify` com `TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55433/cvg_aaa13_rehearsal` | 02:36:17Z → 02:45:03Z | **0** | **16/16 gates `PASS`**, 0 skips, decisão `CONDITIONAL_GO / AAA_CONTROLLED` |
| Verificador             | `npm run certification:verify` (mesmo snapshot)                                                  | 02:45:07Z → 02:45:08Z | **0** | `current candidate qualified`; 27 hashes; mesmo `candidateId`/`runId`      |
| Negativos (suplementar) | `node scripts/phase10-verify.mjs --self-test` (mesmo snapshot, após o verify exigido)            | 02:45:36Z → 02:45:41Z | 0     | **37/37 PASS** (N1–N9 + C0–C27), gera `negative-validation.json` na cópia  |
| PostgreSQL stop         | `pg_ctl stop`                                                                                    | 02:45Z                | 0     | cluster descartável encerrado                                              |

Logs brutos: `run/certify.stdout.log`, `run/certify.stderr.log`, `run/verify.*`, `run/selftest.*`, `run/logs/*.log` (16 gates), `run/postgres/*` (init/verify/stop/config). Nenhum relatório foi editado; nenhum limiar foi reduzido; nenhum achado foi removido.

## 3. Matriz gate → artefato → resultado

Fonte: `gate-matrix.json` / `gate-matrix.md` (derivada dos bytes brutos pelas regras aprovadas). Correlação completa: **16/16 gates** com `runId`, `candidateId`, `gate` e `exitCode` do cabeçalho iguais ao resultado declarado; 23 itens de evidência com hash do manifesto = hash real; `verifyGateEvidence` = **0 falhas**; `candidate-drift.json` ausente.

| Gate           | Exit | Status | Skips | Métrica derivada dos bytes brutos                                                          |
| -------------- | ---- | ------ | ----- | ------------------------------------------------------------------------------------------ |
| format         | 0    | PASS   | 0     | —                                                                                          |
| typecheck      | 0    | PASS   | 0     | —                                                                                          |
| lint           | 0    | PASS   | 0     | —                                                                                          |
| build          | 0    | PASS   | 0     | —                                                                                          |
| unit           | 0    | PASS   | 0     | 199 arquivos / 1204 testes PASS                                                            |
| coverage       | 0    | PASS   | 0     | 87.88 st / 83.48 br / 93.14 fn / 88.87 ln                                                  |
| security       | 0    | PASS   | 0     | `found 0 vulnerabilities`                                                                  |
| worker_startup | 0    | PASS   | 0     | startup+controlled smoke                                                                   |
| postgres       | 0    | PASS   | 0     | 14 arquivos / 122 testes PASS (banco real do ensaio)                                       |
| e2e            | 0    | PASS   | 0     | 6 testes PASS                                                                              |
| evals          | 0    | PASS   | 0     | 56 cenários, sucesso 0.9464, violação 0, adversarial 1.0                                   |
| chaos          | 0    | PASS   | 0     | 16/16 executados e aprovados (CHAOS-04/05 rodaram com banco)                               |
| load           | 0    | PASS   | 0     | 10000 eventos, loss 0, duplicates 0                                                        |
| restore        | 0    | PASS   | 0     | digestMatches true, outbox/tenant ok; RPO/RTO `NOT_VALIDATED_ON_PRODUCTION_INFRASTRUCTURE` |
| sbom           | 0    | PASS   | 0     | 372 componentes CycloneDX                                                                  |
| licenses       | 0    | PASS   | 0     | total 372, denied 0, unknown 0, unclassified 0                                             |

O gate PostgreSQL **executou** (não `NOT_EXECUTED`): `TEST_DATABASE_URL` apontou para o cluster descartável exclusivo do ensaio na porta 55433. Nenhum gate foi pulado ou ficou ausente.

## 4. Resultado do produtor e do verificador

- Produtor: `decision=CONDITIONAL_GO`, `certification=AAA_CONTROLLED`; `remainingBlockers` = `P0=0 and P1=0 (controlled scope)`, `external integrations not validated (provider/channel/identity)`, `human signoff pending`.
- Verificador (modo candidato atual): schema OK, 27 hashes de artefato OK, decisão recalculada coerente (`CONDITIONAL_GO`), certificação coerente (`AAA_CONTROLLED`), `current candidate qualified: 159dd98e…`; exit 0.
- Negativos no snapshot: 37/37 PASS (9 helpers N1–N9; 28 CLI C0–C27), incluindo rejeição de adulteração de log/relatório, skip obrigatório, exit code divergente, drift de candidato e evidência de outro run.
- Classificação (`analyze-run.mjs`): `clean_integration`; 0 falhas de produto, ambiente, drift ou incompatibilidade produtor/verificador.

## 5. Achados bloqueantes registrados (rótulo legado × barra AAA congelada)

O rótulo `AAA_CONTROLLED` é a decisão mecânica legada da Phase 10 (gates externos pendentes) e **não** é `AAA_CANDIDATE` nem satisfaz a barra congelada `aaa_quality_contract v2` (§5, §9.1). Ficam registrados como bloqueantes:

1. **Coverage abaixo dos pisos v2**: statements 87.88 < 90; branches 83.48 < 85; lines 88.87 < 90 (functions 93.14 ≥ 90 apenas).
2. **Branches de módulos críticos ≥95%**: não medido nesta rodada (`NOT_RUN`).
3. **Mutação selecionada 100%**: não medida nesta rodada (`NOT_RUN`, lane AAA-12).
4. **Gates externos**: provider/canal/identidade `NOT_VALIDATED`; signoff humano `PENDING` — nenhum modo `EXTERNAL_OPERATIONAL_QUALIFIED`/`HUMAN_RELEASE_AUTHORIZATION` é inferível.
5. **`findings.json` do produtor mantém 5 achados P2** (4 `OPEN_ACCEPTED` com `riskAccepted=true` e 1 `PENDING_HUMAN`); o ensaio não os resolve nem os revalida.
6. **Registro compartilhado em aberto**: `docs/99_runtime_state.md` (entrada AAA-12 review-coordinator-c4) registra "subset functions 79,61% FAIL e branches críticos abaixo da barra permanecem abertos; PASS global não compensa". Não revalidado nesta rodada.
7. **Ambiente**: execução em Node 24.20.0 (alvo Node 22); snapshot local sintético, sem provider/canal/IdP/fonte institucional, sem Docker/imagem e sem benchmark comparativo.

## 6. Prova de não-mutação da árvore compartilhada

- `shared-before.txt` (02:35:39Z) e `shared-after.txt` (02:45Z) cobrem **todos os 96 arquivos** de `scripts/` + `certification/` da origem; são byte a byte idênticos (`shared-diff.txt` vazio, `diff` exit 0).
- `shared-after-final.txt` recapturado após toda a escrita de evidência: sha256 `c49ef727a6a24841b85ad44522ebc6ead85a7dda53c61a2294e92516097df440`, idêntico ao before (`shared-hash-proof.txt`).
- Os três scripts permanecem nos hashes aprovados; nenhum certificado/manifesto compartilhado foi escrito — produtor, verificador e self-test rodaram apenas em `/tmp/opencode/aaa13-rehearsal-20260913T023539Z/repo`.
- Portas: 55433 usada exclusivamente pelo cluster descartável; **5432 (operacional) e 55432 (outra frente) não foram tocadas**; nenhuma sessão de outro postgres foi encerrada.

## 7. Pacote de evidências

- `manifest.json` — manifesto do pacote com hashes de todos os arquivos.
- `snapshot-manifest.json`, `snapshot-files.sha256`, `snapshot-create.log`, `environment-before.txt`, `origin-candidate-before.json`, `origin-candidate-after.json`.
- `run/certification/` — artefatos gerados na cópia: `phase10-result.json`, `manifest.json`, `candidate-manifest.json`, relatórios de evals/chaos/load/restore/SBOM/licenças, `negative-validation.json` (self-test), `findings.json`/`external-gates.json` de entrada.
- `run/logs/` — 16 logs de gate; `run/*.log|*.exit|*.txt` — produtor, verificador e self-test.
- `run/postgres/` — initdb, settings verificados, start/stop e log do servidor.
- `gate-matrix.json`, `gate-matrix.md`, `analyze.log` — correlação gate→artefato→resultado.
- `shared-*.txt`, `shared-diff.txt`, `shared-hash-proof.txt` — não-mutação da origem.
- `limitations.md` — limitações e escopo.

## 8. Limitações

Ver `limitations.md`. Em resumo: o ensaio comprova a integração produtor→artefatos→verificador com gates locais reais e não-mutação da origem; **não** comprova qualidade integral do produto, barra AAA v2, operação real, durabilidade física multi-host nem produção. Nenhum DONE, G_QUALITY ou certificado atual é concedido; aguarda revisão independente.
