# SPEC-PR003-005 — ambiente explícito do smoke de worker

- Trilha: **T2**, correção de fixture de certificação sem alterar runtime,
  contrato público, preflight ou configuração de produção.
- Task: PR-003, fatia de certificado interino em
  [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md).
- Base: [SPEC 0151](0151_production_boot_configuration_contract.md) aprovada
  para BUILD sintético; worker controlado exige `NODE_ENV=development|test`.
- Estado: `ISOLATED_T2_BUILD_PASS / INTERIM_CERTIFIED / PRODUCTION_NO_GO`.

## Recon

Em `ae0344f`, `npm run certify` iniciou com Node 22/PostgreSQL 16 e
`worker_startup` falhou em 702 ms. O smoke inicia `npm run dev:worker` com
`CVG_WORKER_QUEUE_ADAPTER=''` e espera `queue_adapter_missing`, mas não
fornece `NODE_ENV`. O preflight agora falha antes com `node_env_invalid`.
Reprodução direta: sem `NODE_ENV`, código `node_env_invalid`; com
`NODE_ENV=test`, código `queue_adapter_missing` e mensagem esperada.

Definir `NODE_ENV=test` para o processo inteiro de certificação seria
incorreto: o build web de produção o rejeita. A fixture deve definir o
ambiente somente no processo filho controlado.

## Regra e critério de pronto

1. Nos dois smokes de worker (`worker-startup-smoke.mjs` e
   `worker-controlled-smoke.mjs`), definir `NODE_ENV: 'test'` no ambiente
   do filho, preservando as demais variáveis e expectativas. Nenhum código
   de produto ou preflight será alterado.
2. Confirmar o negativo sem ambiente em execução direta, os dois smokes
   PASS, typecheck, lint, `npm test`, `test:postgres`, E2E e certificação
   interina com origens HTTPS sintéticas. Se outro gate falhar, registrar
   a causa sem declarar GO.
3. Trabalhar apenas no branch/worktree isolado até PR-L04 liberar o root.
   O certificado do SHA isolado não substitui CI remoto, staging, IAM nem
   decisão humana de produção.

## Resultado local — 28/09/2026

- Commit `7ef74e7` definiu `NODE_ENV=test` somente nos dois processos
  filhos dos smokes. Ambos passaram; o preflight do produto não mudou.
- Primeiro certificado interino de `ae0344f`: 14/16 gates PASS,
  `build` sem origens HTTPS e `worker_startup` com fixture antiga FAIL;
  verificador confirmou `NO_GO` e 38/38 hashes.
- Segundo certificado interino, de `7ef74e7`, com origens HTTPS sintéticas:
  16/16 gates PASS; 340/2.582 testes, PostgreSQL 35/261, Chromium 12/12,
  zero skips e cobertura crítica RLS 191/197. `certification:verify`
  passou 38/38 hashes e qualificou **este candidato isolado** como
  `AAA_CONTROLLED / CONDITIONAL_GO`.
- [Prova e bundles](../04_audit/evidence/PR003-COMPOSITE-20260928/proof.json):
  os dois arquivos compactados contêm os 38 artefatos dos respectivos
  manifestos; HEAD, manifest e resultado coincidem no segundo run.
  Crítica independente aceitou o certificado local, com P2 de vínculo de
  commit no verificador. Root/CI, integrações externas, IAM, staging e
  decisão humana seguem pendentes; produção `NO_GO`.
