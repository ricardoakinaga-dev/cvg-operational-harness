# REM21-013 — SPEC

## Contrato do manifest

Arquivo: `scripts/mutation-manifest.json`.

```json
{
  "schemaVersion": 1,
  "kind": "risk-mutation-manifest",
  "contract": "rem21-013-v1",
  "mutations": [
    {
      "id": "stable-id",
      "domain": "identity",
      "mode": "vitest",
      "source": "apps/api/src/operator-identity.ts",
      "from": "exact source selector",
      "to": "single replacement",
      "sourceSha256": "sha256 of source before mutation",
      "testFiles": ["apps/api/src/__tests__/trusted-operator-identity.test.ts"],
      "budgetMs": 120000,
      "owner": "runtime-security"
    }
  ]
}
```

`mode: vitest` executa os `testFiles` na cópia isolada. `mode: driver` é
reservado aos três mutantes históricos de coverage e executa um driver inline
contra o módulo mutado. O validator rejeita campos ausentes, IDs duplicados,
domínio desconhecido, budget não positivo, caminho fora da raiz, source drift,
selector zero/múltiplo e arquivo de teste ausente.

## Máquina de execução

```text
load -> validate manifest/source hashes -> compute candidate binding
     -> copy repository without node_modules/generated evidence
     -> for each mutation: restore source -> apply exact replacement
        -> run focused driver/Vitest within budget
        -> classify KILLED | SURVIVED | TIMEOUT | ERROR
     -> write report -> exit 0 iff every result is KILLED
```

A cópia recebe um symlink somente para o `node_modules` local. `TEST_DATABASE_URL`
é removido do ambiente dos testes focados. O worktree não é alterado pelo
runner; o único artefato de origem é `certification/mutation-guard.json`, já
excluído do candidate por contrato da barra.

## Report e binding

O report usa `schemaVersion: 2`, `kind: aud21-risk-mutation-guard`,
`contract`, `manifestSha256`, `candidateId`, `runId`, versão do Node, lista de
domínios, contadores e `mutations[]`. Cada item inclui `sourceSha256`,
`budgetMs`, `durationMs`, `status`, `exitCode` e `output`. Se `CI_CANDIDATE_ID`
estiver presente, divergência com o candidate calculado falha antes da
execução; fora da barra, o candidate é calculado localmente para preservar a
proveniência.

## Seletores aprovados

O manifest contém dez mutantes: três de `coverage` e um para cada domínio
crítico. Os replacements são deliberadamente pequenos e cada um aponta para
um arquivo de teste que já verifica a decisão de segurança correspondente;
expiração no limite tem caracterização explícita no teste de identity.

## Gates

O BUILD usa `npm run mutation:guard` como gate bloqueante já conectado ao
`ci-bar`. AUDIT verifica o JSON, hashes, contadores, logs e o diff; a
certificação final completa continua reservada a `REM21-019`.
