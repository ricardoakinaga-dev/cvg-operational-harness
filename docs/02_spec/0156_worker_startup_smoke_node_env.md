# SPEC-PR003-005 — ambiente explícito do smoke de worker

- Trilha: **T2**, correção de fixture de certificação sem alterar runtime,
  contrato público, preflight ou configuração de produção.
- Task: PR-003, fatia de certificado interino em
  [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md).
- Base: [SPEC 0151](0151_production_boot_configuration_contract.md) aprovada
  para BUILD sintético; worker controlado exige `NODE_ENV=development|test`.
- Estado: `SPEC_READY / ISOLATED_T2_BUILD_AUTHORIZED / PRODUCTION_NO_GO`.

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
