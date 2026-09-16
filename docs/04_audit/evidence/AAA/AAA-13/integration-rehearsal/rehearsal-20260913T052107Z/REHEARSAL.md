# AAA-13 — ensaio integrado de certificação local (snapshot isolado, 2026-09-13T05:21:07Z)

- Task: `AAA-13` — integração **produtor `phase10-certify` → artefatos → verificador `phase10-verify`** com gates locais reais. Status: `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`.
- Autorização: instrução do coordenador em `docs/04_audit/evidence/AAA/AAA-13/review-coordinator-r4/next-task-agent-3.md`; full certify autorizado **somente** na cópia isolada sintética.
- Esta é uma rodada nova sobre a árvore corrente (P1-2 sweep fix, policy coverage tests, license idempotence, tracking refresh). Os três pacotes anteriores em `integration-rehearsal/` (`79a2a0d…`, 799 arquivos; `159dd98e…`, 821 arquivos; `e0de9ee3…`, 851 arquivos) foram **preservados byte a byte**; nenhum arquivo anterior foi removido ou editado.

## 1. Identidade do candidato e snapshot

| Item                     | Valor                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Origem                   | `/home/ricardo/cvg-agent-secretary-v2` (HEAD `512bc11e80fbf7c7b8baf6263aacc811ff829309`, branch `main`, dirty — 119 entradas alteradas) |
| Snapshot                 | `/tmp/opencode/aaa13-rehearsal-20260913T052107Z/repo` (commit local sintético `a99df0d3c36011b8f8f4955b5ee812d09d7c542f`, dirty)        |
| `candidateId`            | `911f049888a45ab206770c29c07a492b4294905225ce0d722f7a193e694da9d4`                                                                      |
| Arquivos                 | 855 (774 tracked + 81 untracked); hashes em `snapshot-files.sha256`                                                                     |
| Igualdade origem ↔ cópia | `originBefore = originAfter = copy = producer = 911f0498…`; 0 mismatches; nenhum `capture-drift.json`                                   |
| `runId`                  | `run-911f049888a4-mtzd9k5w`                                                                                                             |
| Node / npm               | `v24.20.0` / `11.19.0` (alvo do projeto é Node 22 — limitação declarada)                                                                |
| Ambiente                 | `CI=1`, `CVG_API_PORT=3233`, `CVG_WEB_PORT=4233`                                                                                        |
| Scripts aprovados        | `phase10-certify.mjs 46b024c8…`, `phase10-verify.mjs 24825421…`, `certification-rules.mjs 1d1edc9d…` (inalterados)                      |
| Delta vs rodada 3        | +4 adicionados, 7 alterados, 0 removidos (`candidate-delta-vs-round3.txt`)                                                              |

A cópia foi construída por `create-snapshot.mjs` a partir do escopo canônico do candidato (tracked + untracked não ignorados), **preservando a partição tracked/untracked** via `git init` local: os arquivos tracked da origem entraram no índice do snapshot; os untracked permaneceram untracked. A lista completa de hashes (`snapshot-files.sha256`, 855 linhas) foi gravada **antes** do ensaio (snapshot `05:21:13.742Z`; certify iniciou `05:21:34Z`). O `candidate-manifest.json` do produtor confere com essa lista: 855/855 hashes iguais, 0 mismatches, sem `candidate-drift.json`. Nenhuma credencial foi copiada (apenas `.env.example`; `.env`/`.env.local` são ignorados e não existem no snapshot).

## 2. Comandos, exit codes e resultados

| Etapa                   | Comando (na cópia)                                                                               | Início/fim (UTC)      | Exit  | Resultado                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------- | ----- | -------------------------------------------------------------------------- | --- | --- | --- | ------ | ------ |
| Snapshot                | `node create-snapshot.mjs <origem> <snap>/repo <evidência>`                                      | 05:21:07Z             | 0     | candidateId idêntico origem↔cópia, 0 mismatches, sem drift                 |
| Dependências            | `cp -a node_modules` (declarado; symlink evitado para não resolver pacotes da origem)            | 05:21Z                | 0     | 273 MB copiados; candidateId inalterado                                    |
| PostgreSQL              | `initdb` + `pg_ctl start` (cluster novo, porta **55435**, fsync on)                              | 05:21Z                | 0     | `cvg_aaa13_rehearsal` dedicado; `pg-verify.log` = `55435                   | on  | on  | on  | <data> | 16.15` |
| Produtor                | `npm run certify` com `TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55435/cvg_aaa13_rehearsal` | 05:21:34Z → 05:31:52Z | **0** | **16/16 gates `PASS`**, 0 skips, decisão `CONDITIONAL_GO / AAA_CONTROLLED` |
| Verificador             | `npm run certification:verify` (mesmo snapshot)                                                  | 05:31:55Z → 05:31:56Z | **0** | `current candidate qualified`; 27 hashes; mesmo `candidateId`/`runId`      |
| Negativos (suplementar) | `node scripts/phase10-verify.mjs --self-test` (mesmo snapshot, após o verify exigido)            | 05:32:03Z → 05:32:08Z | 0     | **37/37 PASS** (N1–N9 + C0–C27), gera `negative-validation.json` na cópia  |
| PostgreSQL stop         | `pg_ctl stop`                                                                                    | 05:32Z                | 0     | cluster descartável encerrado; porta 55435 liberada                        |

Logs brutos: `run/certify.stdout.log`, `run/certify.stderr.log`, `run/verify.*`, `run/selftest.*`, `run/logs/*.log` (16 gates), `run/postgres/*` (init/start/verify/stop/config). Nenhum relatório foi editado; nenhum limiar foi reduzido; nenhum achado foi removido.

## 3. Matriz gate → artefato → resultado

Fonte: `gate-matrix.json` / `gate-matrix.md` (derivada dos bytes brutos pelas regras aprovadas). Correlação completa: **16/16 gates** com `runId`, `candidateId`, `gate` e `exitCode` do cabeçalho iguais ao resultado declarado; itens de evidência com hash do manifesto = hash real; `verifyGateEvidence` = **0 falhas**; `candidate-drift.json` ausente.

| Gate           | Exit | Status | Skips | Métrica derivada dos bytes brutos                                                                                                                                                       |
| -------------- | ---- | ------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format         | 0    | PASS   | 0     | —                                                                                                                                                                                       |
| typecheck      | 0    | PASS   | 0     | —                                                                                                                                                                                       |
| lint           | 0    | PASS   | 0     | —                                                                                                                                                                                       |
| build          | 0    | PASS   | 0     | —                                                                                                                                                                                       |
| unit           | 0    | PASS   | 0     | 233 arquivos / 1634 testes PASS (0 skipped)                                                                                                                                             |
| coverage       | 0    | PASS   | 0     | 96.81 st / 93.14 br / 97.36 fn / 97.40 ln                                                                                                                                               |
| security       | 0    | PASS   | 0     | `found 0 vulnerabilities`                                                                                                                                                               |
| worker_startup | 0    | PASS   | 0     | startup+controlled smoke                                                                                                                                                                |
| postgres       | 0    | PASS   | 0     | 14 arquivos / 123 testes PASS (banco real do ensaio)                                                                                                                                    |
| e2e            | 0    | PASS   | 0     | 6 testes chromium PASS                                                                                                                                                                  |
| evals          | 0    | PASS   | 0     | 56 cenários, sucesso 0.9464, violação 0, unsafe 0, adversarial 1.0; 3 mismatches dentro dos limites                                                                                     |
| chaos          | 0    | PASS   | 0     | `chaos-report.json`: 20 testes / 10 suítes PASS, 0 pending; `phase10-result.metrics.chaos.executed=16` (artefato legado de agregação, idêntico às rodadas anteriores — ver limitations) |
| load           | 0    | PASS   | 0     | 10000 eventos, loss 0, duplicates 0, p95 4.008ms                                                                                                                                        |
| restore        | 0    | PASS   | 0     | digestMatches true, outbox/tenant ok; RPO/RTO `NOT_VALIDATED_ON_PRODUCTION_INFRASTRUCTURE`                                                                                              |
| sbom           | 0    | PASS   | 0     | 372 componentes CycloneDX                                                                                                                                                               |
| licenses       | 0    | PASS   | 0     | total 372 (21 internos), denied 0, unknown 0, unclassified 0, invalidExceptions 0                                                                                                       |

O gate PostgreSQL **executou** (não `NOT_EXECUTED`): `TEST_DATABASE_URL` apontou para o cluster descartável exclusivo do ensaio na porta 55435. Nenhum gate foi pulado ou ficou ausente.

## 4. Resultado do produtor e do verificador

- Produtor: `decision=CONDITIONAL_GO`, `certification=AAA_CONTROLLED`; `remainingBlockers` = `P0=0 and P1=0 (controlled scope)`, `external integrations not validated (provider/channel/identity)`, `human signoff pending`.
- Verificador (modo candidato atual): schema OK, 27 hashes de artefato OK, decisão recalculada coerente (`CONDITIONAL_GO`), certificação coerente (`AAA_CONTROLLED`), `current candidate qualified: 911f0498…`; exit 0.
- Negativos no snapshot: 37/37 PASS (37 checks = 9 helpers N1–N9 + 28 casos CLI C0–C27), incluindo rejeição de adulteração de log/relatório, skip obrigatório, exit code divergente, drift de candidato e evidência de outro run.
- Classificação (`analyze-run.mjs`): `clean_integration`; 0 falhas de produto, ambiente, drift ou incompatibilidade produtor/verificador.

## 5. Achados bloqueantes registrados (rótulo legado × barra AAA congelada)

O rótulo `AAA_CONTROLLED` é a decisão mecânica legada da Phase 10 (gates externos pendentes) e **não** é `AAA_CANDIDATE` nem satisfaz a barra congelada `aaa_quality_contract v2` (§5, §9.1). Nesta rodada os pisos globais de coverage **foram atingidos**, mas permanecem bloqueantes:

1. **Branches de módulos críticos ≥95%**: não medido/agregado com denominador adjudicado nesta rodada (`NOT_RUN`).
2. **Mutação selecionada 100%**: não medida nesta rodada (`NOT_RUN`, lane AAA-12).
3. **Observações brutas não adjudicadas**: o log de coverage registra `journey-workflow.ts` com 67.85% de branches; sem denominador crítico congelado, não é juízo desta rodada.
4. **Gates externos**: provider/canal/identidade `NOT_VALIDATED`; signoff humano `PENDING` — nenhum modo `EXTERNAL_OPERATIONAL_QUALIFIED`/`HUMAN_RELEASE_AUTHORIZATION` é inferível.
5. **`findings.json` do produtor mantém 5 achados P2** (4 `OPEN_ACCEPTED` + 1 `PENDING_HUMAN`, todos com `riskAccepted=true`); o ensaio não os resolve nem os revalida.
6. **Registro compartilhado em aberto**: entradas AAA-12 em `docs/99_runtime_state.md` registram subset/branches críticos abaixo da barra; não revalidados nesta rodada.
7. **Ambiente**: execução em Node 24.20.0 (alvo Node 22); snapshot local sintético, sem provider/canal/IdP/fonte institucional, sem Docker/imagem e sem benchmark comparativo.
8. **Nenhum DONE/G_QUALITY** é concedido por este pacote; AAA-13 permanece `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`.

## 6. Prova de não-mutação da árvore compartilhada

- `shared-before.txt` (05:21:07Z), `shared-after.txt` e `shared-after-final.txt` cobrem **todos os 96 arquivos** de `scripts/` + `certification/` da origem; são byte a byte idênticos: os três arquivos têm sha256 `036e4de3a4620466882c4eb4d3dbdfde469e3c3606e5eef84803c09f5085cfd3`; `shared-diff.txt` vazio (0 bytes).
- Os três scripts permanecem nos hashes aprovados; nenhum certificado/manifesto compartilhado foi escrito — produtor, verificador e self-test rodaram apenas em `/tmp/opencode/aaa13-rehearsal-20260913T052107Z/repo`.
- Portas: 55435 usada exclusivamente pelo cluster descartável (encerrado ao final); **5432 (operacional), 55432 e 55433 (outras frentes) não foram tocadas**; nenhuma sessão de outro postgres foi encerrada. (Observadas apenas como inventário: instâncias de terceiros em 5432/55432 e uma em 5543.)

## 7. Pacote de evidências

- `manifest.json` — manifesto do pacote com hashes de todos os arquivos.
- `snapshot-manifest.json`, `snapshot-files.sha256`, `snapshot-create.log`, `snapshot-create.stderr.log`, `environment-before.txt`, `origin-candidate-before.json`, `origin-candidate-after.json`, `candidate-delta-vs-round3.txt`.
- `run/certification/` — artefatos gerados na cópia: `phase10-result.json`, `manifest.json`, `candidate-manifest.json`, relatórios de evals/chaos/load/restore/SBOM/licenças, `negative-validation.json` (self-test), `findings.json`/`external-gates.json` de entrada.
- `run/logs/` — 16 logs de gate; `run/*.log|*.exit|*.txt` — produtor, verificador, self-test e ambiente.
- `run/postgres/` — initdb, settings verificados, start/stop/log do servidor.
- `gate-matrix.json`, `gate-matrix.md`, `analyze.log` — correlação gate→artefato→resultado.
- `shared-*.txt`, `shared-diff.txt`, `shared-hash-proof.txt` — não-mutação da origem.
- `limitations.md` — limitações e escopo.

## 8. Limitações

Ver `limitations.md`. Em resumo: o ensaio comprova a integração produtor→artefatos→verificador com gates locais reais e não-mutação da origem; **não** comprova qualidade integral do produto, barra AAA v2 completa, operação real, durabilidade física multi-host nem produção. Nenhum DONE, G_QUALITY ou certificado atual é concedido; aguarda revisão independente.
