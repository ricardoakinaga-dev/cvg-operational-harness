# AUDIT-PG-RUN-20261105 — gates executados após liberar Docker

Data: **05/11/2026**, America/Sao_Paulo. Estado: **COMPLETED — gates solicitados PASS**.
Candidata: `d394d71a4f8e1cfb031aeca1b3442132e8a6a833`. Nenhuma correção de código,
push ou certificação completa foi feita. A [SPEC 0317](../02_spec/0317_security_guardrails.md)
continua `PROPOSED_FOR_HUMAN_T3_REVIEW`; estes resultados validam a baseline,
sem implementar os guardrails propostos nem conceder release.

## Resultado local

| Gate                          | Comando                                            | Estado                        | Exit | Duração   | Passados          | Falhos | Pulados |
| ----------------------------- | -------------------------------------------------- | ----------------------------- | ---- | --------- | ----------------- | ------ | ------- |
| PostgreSQL                    | `npm run test:postgres` com reporters default/JSON | PASS                          | 0    | 599,318 s | **482**           | **0**  | **0**   |
| Prova backup/restore/rollback | `npm run test:postgres:proof`                      | PASS                          | 0    | 19,133 s  | — (prova própria) | —      | —       |
| Phase4A                       | `npm run test:phase4a` com reporter JSON adicional | PASS                          | 0    | 21,239 s  | **102**           | **0**  | **0**   |
| Imagem e smoke não root       | `node scripts/ci-bar.mjs gate image`               | PASS                          | 0    | 80,032 s  | — (smoke próprio) | —      | —       |
| Baseline legado               | `npm run postgres:baseline`                        | NOT_APPLICABLE; não executado | —    | —         | —                 | —      | —       |

Durações medidas por processo, incluindo startup do comando. `—` significa
não aplicável ou não medido, sem inventar contagem de testes para provas.
Nenhum gate executado falhou; portanto não há log de falha desta retomada.
O erro Docker da tentativa anterior está preservado e identificado adiante.

Comandos e argumentos completos, códigos de saída, horários e duração de cada
etapa estão em [results.json](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/results.json).
A invocação PostgreSQL foi a mesma da CI:

```bash
npm run test:postgres -- --reporter=default --reporter=json --outputFile=certification/postgres-test-report.json
```

Phase4A recebeu `--reporter=json` e `--outputFile` com caminho externo completo
registrado em results.json; o script original conserva PHASE4A_PG_REQUIRED=1.
`postgres:baseline` adota schema legado e exige DATABASE_MIGRATION_URL,
BASELINE_APPROVED_BY e BASELINE_APPROVAL_REF. O banco criado era novo:
não há legado para adotar nem aprovação de baseline a fabricar.

## Ambiente, autorização e isolamento

Após o usuário informar “feito”, `getent group docker` confirmou ricardo no
grupo. O processo antigo ainda não o herdava; `sg docker` iniciou a execução
com o grupo vigente. Docker client/server **29.9.3** acessíveis, sem executar
sudo, usermod ou mudar permissões do socket nesta rodada.

- Clone externo: `/tmp/cvg-codex-20261105/repo`, HEAD destacado em d394d71a4,
  conforme [clone enxuto](clone_enxuto.md). A evidência histórica permaneceu
  fora do clone; não foi executado gate documental/release em modo sparse.
- **Node 22.23.2**, conforme `.nvmrc`; npm **10.9.8**. Runtime obtido de
  nodejs.org, checksum SHA-256 conferido contra o [arquivo oficial preservado](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/node-official-shasums.txt):
  `d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307`.
  `npm ci` reexecutado nesse runtime: exit 0, **7,741 s**.
- **PostgreSQL 16.15**, imagem `postgres:16-alpine`, digest
  `sha256:1fb72075a1de85a1d39de23c2da81baef1b71bf5c0b61a14cbbfdb072a6246d9`.
  Banco sintético `cvg_test`, usuário/senha postgres/postgres, somente loopback
  na porta aleatória **32768**. Aguardar pg_isready antes dos testes.
- Exportados somente no processo isolado:
  `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:32768/cvg_test`,
  `PHASE4A_DISPOSABLE_PG=1` e `CVG_TEST_SCOPE=core`.
- O serviço desconhecido em 5432 não foi conectado, parado ou alterado.
  Binário PostgreSQL baixado pelo Claude e sua execução foram preservados.
- [Ambiente medido](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/environment.json),
  [Docker](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/docker-version.log),
  [instalação](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/install.log) e
  [integridade das fontes](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/source-integrity.json).

## Evidência por gate

### PostgreSQL

[Log completo](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/postgres.log) e
[JSON completo](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/postgres-tests.json):
47 arquivos, 482 passados, zero falhos, pendentes ou TODO.

### Prova de banco

[Log](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/postgres-proof.log) e
[relatório](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/postgres-proof.json),
verdict PASS. O script cria dois containers próprios com portas aleatórias;
não usa simplesmente TEST_DATABASE_URL. Resultado: **32 eventos** processados
por dois workers, zero duplicação, **53 tabelas** restauradas, checksums e estado
lógico iguais; RLS, roles/grants, journals e isolamento conferidos. Corrupção
foi detectada e recuperada; restauração pré-migração seguida de roll-forward
de 0033 para 0035 foi demonstrada.

É prova local sintética, com `candidateId: null` no relatório direto do script;
não é certificação selada da CI nem medição de RPO/RTO de produção. O commit
executado e o runId estão nos registros desta tarefa.

### Phase4A

[Log](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/phase4a.log) e
[JSON](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/phase4a-tests.json):
102 passados, zero falhos, pendentes ou TODO.

### Imagem

Gate usado literalmente de verify.yml/ci-bar.mjs, após init com artefatos
externos. [Log completo do build e smoke](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/image-build-smoke.log),
[resultado do wrapper](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/image.log) e
[manifesto runtime](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/runtime-image.json).
Build target runtime com --pull; smoke com network none, read-only, tmpfs /tmp,
cap-drop ALL e no-new-privileges. Usuário configurado **cvg** (UID 10001 na
receita); smoke PASS, `/live` e `/ready` **200**, sourceIncluded false.
O smoke da receita exercita API em development/memory; bootstrap de produção
e staging exigem seus gates próprios.
Imagem `sha256:1a48d9f7f261444527bcb4b645d4f2bb3f2c362b81278cfc55f32ae8f768a269`.

A [entrada local ci-bar](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/ci-local-image-entry.json)
vincula a imagem à candidata
`71cedbd577bc66a7d38f3e04274faab499b1ad4a8a1e0673317dfdf817a45a7e`.
Somente runtime/image foram invocados por ci-bar; os demais gates solicitados
rodaram diretamente por npm. Não foi finalizado manifesto completo de CI.

## Comparação com PR #41

Referência: [Verify 143](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/41835530282),
job 126593322481, commit **06eaa98fbcd3092f82edc114259ca0329447c198** do
[PR #41](https://github.com/ricardoakinaga-dev/cvg-operational-harness/pull/41).
Artefato 13346301754, ZIP SHA-256 conferido contra o digest informado pelo GitHub:
`781ece31c961218a7ce179ea7cdfbbea448c28f6e6fbb557e6aa288d33c232c0`.
Não foi repetida nesta tarefa a verificação criptográfica da attestation.

| PostgreSQL         | CI em 06eaa98fb | Local em d394d71a4 | Diferença           |
| ------------------ | --------------- | ------------------ | ------------------- |
| Arquivos           | 47              | 47                 | 0                   |
| Testes             | 482             | 482                | 0                   |
| Passados           | 482             | 482                | 0                   |
| Falhos             | 0               | 0                  | 0                   |
| Pulados            | 0               | 0                  | 0                   |
| Duração do comando | 315,430 s       | 599,318 s          | ambientes distintos |

Além do total, o inventário por **arquivo e nome completo do teste é idêntico**:
nenhum teste adicionado/removido nessa comparação. [Comparação executada](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/postgres-comparison.json),
[JSON original CI](../04_audit/evidence/AUDIT-PG-RUN-20261105/ci-pr41-postgres-test-report.json),
[log original CI](../04_audit/evidence/AUDIT-PG-RUN-20261105/ci-pr41-postgres.log) e
[metadados CI](../04_audit/evidence/AUDIT-PG-RUN-20261105/ci-pr41-summary.json).
Node da CI também 22.23.2 e PostgreSQL 16.15 Alpine, conforme
[trecho de runtime preservado](../04_audit/evidence/AUDIT-PG-RUN-20261105/ci-runtime-excerpt.log).

## Preservação e entrega

RunId: `cvg-codex-audit-pg-20261105-20261105T235810Z`.
Logs externos completos:
`/tmp/cvg-codex-20261105/cvg-codex-audit-pg-20261105-20261105T235810Z/`.
Cópia versionável e hashes em
[run-20261105T235810Z](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/).
A [receita externa executada](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/runner.py.txt)
registra a sequência e continua após falha de gate; não houve falha nesta execução.

Relatórios históricos do clone foram separados antes da emissão dos novos;
somente saídas desta execução foram aceitas. Fonte/lockfile não mudaram,
e `certification/` recebeu resultados somente no clone descartável.
Container principal e seu volume foram removidos; a prova removeu os dois
containers próprios; tag da imagem desta task removida após captura.
[Verificações de ausência dos recursos nomeados](../04_audit/evidence/AUDIT-PG-RUN-20261105/run-20261105T235810Z/cleanup-checks.json)
usam exit 1 de inspect como resultado esperado. Não houve prune global nem
remoção de recursos alheios; imagens base/cache Docker não foram limpos.

O [preflight anterior](../04_audit/evidence/AUDIT-PG-RUN-20261105/preflight.json)
e o [erro Docker anterior](../04_audit/evidence/AUDIT-PG-RUN-20261105/docker-version.log)
continuam preservados como histórico, superado por esta retomada. O Node
22.23.3 refere-se somente à tentativa inicial/recon da SPEC, não a estes gates.

A auditoria geral do Claude pode incorporar estes resultados da candidata
identificada. Sem nova nota global, release, produção irrestrita ou mudança
de código. Produção continua **NO_GO**.
