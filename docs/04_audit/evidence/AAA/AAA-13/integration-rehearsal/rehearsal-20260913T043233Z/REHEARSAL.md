# AAA-13 — ensaio integrado de certificação local (snapshot isolado, 2026-09-13T04:32:33Z)

- Task: `AAA-13` — integração **produtor `phase10-certify` → artefatos → verificador `phase10-verify`** com gates locais reais. Status: `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`.
- Autorização: instrução do coordenador em `docs/04_audit/evidence/AAA/AAA-13/review-coordinator-r4/next-task-agent-3.md`; full certify autorizado **somente** na cópia isolada sintética.
- Esta é uma rodada nova sobre a árvore corrente (todas as lanes recentes: AAA-07 sweep call-site, AAA-09/10/11, AAA-12 actor alignment, AAA-13, AAA-14 license idempotence, AAA-17, AAA-34 coverage hardening). Os dois pacotes anteriores em `integration-rehearsal/` (`79a2a0d…`, 799 arquivos; `159dd98e…`, 821 arquivos) foram **preservados byte a byte**; a árvore compartilhada mudou desde então (851 arquivos), por isso a rodada foi refeita. Nenhum arquivo anterior foi removido ou editado.

## 1. Identidade do candidato e snapshot

| Item | Valor |
| --- | --- |
| Origem | `/home/ricardo/cvg-agent-secretary-v2` (HEAD `512bc11e80fbf7c7b8baf6263aacc811ff829309`, branch `main`, dirty — 115 entradas alteradas) |
| Snapshot | `/tmp/opencode/aaa13-rehearsal-20260913T043233Z/repo` (commit local sintético `a11eed1b3b191837d5f597f2ed6f493d4fe9845d`, dirty) |
| `candidateId` | `e0de9ee3861cbb0bbdabcf49dd17291e99296a0a5bd2a27c5d2674774217152e` |
| Arquivos | 851 (774 tracked + 77 untracked); hashes em `snapshot-files.sha256` |
| Igualdade origem ↔ cópia | `originBefore = originAfter = copy = producer = e0de9ee3…`; 0 mismatches; nenhum `capture-drift.json` |
| `runId` | `run-e0de9ee3861c-mtzbjack` |
| Node / npm | `v24.20.0` / `11.19.0` (alvo do projeto é Node 22 — limitação declarada) |
| Ambiente | `CI=1`, `CVG_API_PORT=3233`, `CVG_WEB_PORT=4233` |
| Scripts aprovados | `phase10-certify.mjs 46b024c8…`, `phase10-verify.mjs 24825421…`, `certification-rules.mjs 1d1edc9d…` (inalterados) |

A cópia foi construída por `create-snapshot.mjs` a partir do escopo canônico do candidato (tracked + untracked não ignorados), **preservando a partição tracked/untracked** via `git init` local: os arquivos tracked da origem entraram no índice do snapshot; os untracked permaneceram untracked. A lista completa de hashes (`snapshot-files.sha256`, 851 linhas) foi gravada **antes** do ensaio (04:32:41Z; certify iniciou 04:33:09Z). O `candidate-manifest.json` do produtor confere com essa lista: 851/851 hashes iguais, 0 mismatches, sem `candidate-drift.json`. Nenhuma credencial foi copiada (apenas `.env.example`; `.env`/`.env.local` são ignorados e não existem no snapshot; varredura por `.env`/`*.pem`/`*.key` fora de `node_modules` retornou vazio).

## 2. Comandos, exit codes e resultados

| Etapa | Comando (na cópia) | Início/fim (UTC) | Exit | Resultado |
| --- | --- | --- | --- | --- |
| Snapshot | `node create-snapshot.mjs <origem> <snap>/repo <evidência>` | 04:32:41Z | 0 | candidateId idêntico origem↔cópia, 0 mismatches, sem drift |
| Dependências | `cp -a node_modules` (declarado; symlink evitado para não resolver pacotes da origem) | 04:32Z | 0 | 273 MB copiados; candidateId inalterado |
| PostgreSQL | `initdb` + `pg_ctl start` (cluster novo, porta 55434, fsync on) | 04:32:55Z | 0 | `cvg_aaa13_rehearsal` dedicado; `pg-verify.log` |
| Produtor | `npm run certify` com `TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55434/cvg_aaa13_rehearsal` | 04:33:09Z → 04:43:44Z | **0** | **16/16 gates `PASS`**, 0 skips, decisão `CONDITIONAL_GO / AAA_CONTROLLED` |
| Verificador | `npm run certification:verify` (mesmo snapshot) | 04:44:06Z → 04:44:06Z | **0** | `current candidate qualified`; 27 hashes; mesmo `candidateId`/`runId` |
| Negativos (suplementar) | `node scripts/phase10-verify.mjs --self-test` (mesmo snapshot, após o verify exigido) | 04:44:15Z → 04:44:19Z | 0 | **37/37 PASS** (N1–N9 + C0–C27), gera `negative-validation.json` na cópia |
| PostgreSQL stop | `pg_ctl stop` | 04:44:51Z | 0 | cluster descartável encerrado; porta 55434 liberada |

Logs brutos: `run/certify.stdout.log`, `run/certify.stderr.log`, `run/verify.*`, `run/selftest.*`, `run/logs/*.log` (16 gates), `run/postgres/*` (init/start/verify/stop/config). Nenhum relatório foi editado; nenhum limiar foi reduzido; nenhum achado foi removido.

## 3. Matriz gate → artefato → resultado

Fonte: `gate-matrix.json` / `gate-matrix.md` (derivada dos bytes brutos pelas regras aprovadas). Correlação completa: **16/16 gates** com `runId`, `candidateId`, `gate` e `exitCode` do cabeçalho iguais ao resultado declarado; itens de evidência com hash do manifesto = hash real; `verifyGateEvidence` = **0 falhas**; `candidate-drift.json` ausente.

| Gate | Exit | Status | Skips | Métrica derivada dos bytes brutos |
| --- | --- | --- | --- | --- |
| format | 0 | PASS | 0 | — |
| typecheck | 0 | PASS | 0 | — |
| lint | 0 | PASS | 0 | — |
| build | 0 | PASS | 0 | — |
| unit | 0 | PASS | 0 | 229 arquivos / 1601 testes PASS |
| coverage | 0 | PASS | 0 | 96.74 st / 92.99 br / 97.18 fn / 97.34 ln |
| security | 0 | PASS | 0 | `found 0 vulnerabilities` |
| worker_startup | 0 | PASS | 0 | startup+controlled smoke |
| postgres | 0 | PASS | 0 | 14 arquivos / 123 testes PASS (banco real do ensaio) |
| e2e | 0 | PASS | 0 | 6 arquivos PASS |
| evals | 0 | PASS | 0 | 56 cenários, sucesso 0.9464, violação 0, unsafe 0, adversarial 1.0 |
| chaos | 0 | PASS | 0 | 20 testes / 10 suítes executados e aprovados, 0 pending |
| load | 0 | PASS | 0 | 10000 eventos, loss 0, duplicates 0, p95 5.432ms |
| restore | 0 | PASS | 0 | digestMatches true, outbox/tenant ok; RPO/RTO `NOT_VALIDATED_ON_PRODUCTION_INFRASTRUCTURE` |
| sbom | 0 | PASS | 0 | 372 componentes CycloneDX |
| licenses | 0 | PASS | 0 | total 372, denied 0, unknown 0, unclassified 0 |

O gate PostgreSQL **executou** (não `NOT_EXECUTED`): `TEST_DATABASE_URL` apontou para o cluster descartável exclusivo do ensaio na porta 55434. Nenhum gate foi pulado ou ficou ausente.

## 4. Resultado do produtor e do verificador

- Produtor: `decision=CONDITIONAL_GO`, `certification=AAA_CONTROLLED`; `remainingBlockers` = `P0=0 and P1=0 (controlled scope)`, `external integrations not validated (provider/channel/identity)`, `human signoff pending`.
- Verificador (modo candidato atual): schema OK, 27 hashes de artefato OK, decisão recalculada coerente (`CONDITIONAL_GO`), certificação coerente (`AAA_CONTROLLED`), `current candidate qualified: e0de9ee3…`; exit 0.
- Negativos no snapshot: 37/37 PASS (37 checks = 9 helpers N1–N9 + 28 casos CLI C0–C27), incluindo rejeição de adulteração de log/relatório, skip obrigatório, exit code divergente, drift de candidato e evidência de outro run.
- Classificação (`analyze-run.mjs`): `clean_integration`; 0 falhas de produto, ambiente, drift ou incompatibilidade produtor/verificador.

## 5. Achados bloqueantes registrados (rótulo legado × barra AAA congelada)

O rótulo `AAA_CONTROLLED` é a decisão mecânica legada da Phase 10 (gates externos pendentes) e **não** é `AAA_CANDIDATE` nem satisfaz a barra congelada `aaa_quality_contract v2` (§5, §9.1). Nesta rodada os pisos globais de coverage **foram atingidos** (ao contrário da rodada anterior), mas permanecem bloqueantes:

1. **Branches de módulos críticos ≥95%**: não medido/agregado com denominador adjudicado nesta rodada (`NOT_RUN`).
2. **Mutação selecionada 100%**: não medida nesta rodada (`NOT_RUN`, lane AAA-12).
3. **Observações brutas não adjudicadas**: o log de coverage registra módulos com branches baixas (ex.: `journey-workflow.ts` 67.85%); sem denominador crítico congelado, não são juízo desta rodada.
4. **Gates externos**: provider/canal/identidade `NOT_VALIDATED`; signoff humano `PENDING` — nenhum modo `EXTERNAL_OPERATIONAL_QUALIFIED`/`HUMAN_RELEASE_AUTHORIZATION` é inferível.
5. **`findings.json` do produtor mantém 5 achados P2** (4 `OPEN_ACCEPTED` com `riskAccepted=true` e 1 `PENDING_HUMAN`); o ensaio não os resolve nem os revalida.
6. **Registro compartilhado em aberto**: entradas AAA-12 em `docs/99_runtime_state.md` registram subset/branches críticos abaixo da barra; não revalidados nesta rodada.
7. **Ambiente**: execução em Node 24.20.0 (alvo Node 22); snapshot local sintético, sem provider/canal/IdP/fonte institucional, sem Docker/imagem e sem benchmark comparativo.
8. **Nenhum DONE/G_QUALITY** é concedido por este pacote; AAA-13 permanece `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`.

## 6. Prova de não-mutação da árvore compartilhada

- `shared-before.txt` (04:32:37Z), `shared-after.txt` e `shared-after-final.txt` cobrem **todos os 96 arquivos** de `scripts/` + `certification/` da origem; são byte a byte idênticos: os três arquivos têm sha256 `036e4de3a4620466882c4eb4d3dbdfde469e3c3606e5eef84803c09f5085cfd3`; `shared-diff.txt` vazio.
- Os três scripts permanecem nos hashes aprovados; nenhum certificado/manifesto compartilhado foi escrito — produtor, verificador e self-test rodaram apenas em `/tmp/opencode/aaa13-rehearsal-20260913T043233Z/repo`.
- Portas: 55434 usada exclusivamente pelo cluster descartável (encerrado ao final); **5432 (operacional), 55432 e 55433 (outras frentes/rodada anterior) não foram tocadas**; nenhuma sessão de outro postgres foi encerrada.

## 7. Pacote de evidências

- `manifest.json` — manifesto do pacote com hashes de todos os arquivos.
- `snapshot-manifest.json`, `snapshot-files.sha256`, `snapshot-create.log`, `environment-before.txt`, `origin-candidate-before.json`, `origin-candidate-after.json`.
- `run/certification/` — artefatos gerados na cópia: `phase10-result.json`, `manifest.json`, `candidate-manifest.json`, relatórios de evals/chaos/load/restore/SBOM/licenças, `negative-validation.json` (self-test), `findings.json`/`external-gates.json` de entrada.
- `run/logs/` — 16 logs de gate; `run/*.log|*.exit|*.txt` — produtor, verificador, self-test e ambiente.
- `run/postgres/` — initdb, settings verificados, start/stop/log do servidor.
- `gate-matrix.json`, `gate-matrix.md`, `analyze.log` — correlação gate→artefato→resultado.
- `shared-*.txt`, `shared-diff.txt`, `shared-hash-proof.txt` — não-mutação da origem.
- `limitations.md` — limitações e escopo.

## 8. Limitações

Ver `limitations.md`. Em resumo: o ensaio comprova a integração produtor→artefatos→verificador com gates locais reais e não-mutação da origem; **não** comprova qualidade integral do produto, barra AAA v2 completa, operação real, durabilidade física multi-host nem produção. Nenhum DONE, G_QUALITY ou certificado atual é concedido; aguarda revisão independente.
