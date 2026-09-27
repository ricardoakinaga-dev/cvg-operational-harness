# 0141 — SPEC curta: prontidão antes do SIGTERM no teste homolog

- Task: PR-010, estabilização da barra CI em
  [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Trilha: T2 da [constituição](../07_agents/AGENTS.md), teste local sem
  mudança de contrato público nem efeito externo. A implementação do
  planejamento foi solicitada pelo usuário; produção permanece `NO_GO`.
- Estado: `BUILD_LOCAL_AUTHORIZED` para a regra abaixo.

## Recon

Na segunda execução de `npm test` com PostgreSQL, 2.305/2.306 testes passaram.
O caso `drains cleanly on SIGTERM with no work pending` em
`operational-harness-homolog.integration.test.ts` recebeu saída 143 em vez de 0. O teste iniciava o processo filho, esperava apenas 1.500 ms de relógio e
enviava SIGTERM. Sob carga concorrente, esse prazo não garante que o worker
tenha iniciado seu handler de sinal. O mesmo caso passou na primeira execução
da suíte; o teste já dispõe de `waitFor`, `parseJsonLines` e do evento
`worker.homolog_health` com `healthy: true`.

## Regra e aceite

1. Antes do SIGTERM, aguardar o evento de saúde `healthy: true` no output do
   filho, com timeout limitado. Preservar a asserção de saída 0 e os eventos
   de drenagem/indisponibilidade existentes; não tolerar saída 143.
2. Rodar o teste focado com PostgreSQL, `npm test` completo, `test:postgres`,
   typecheck, lint e E2E em Node 22. Reemitir o certificado após commit do
   candidato e exigir Verify/Security remotos no mesmo SHA.

## Execução e provas

- O teste agora espera `worker.homolog_health` com `healthy: true` antes de
  enviar SIGTERM. A expectativa de saída 0 e as demais asserções continuam.
- Teste focado com PostgreSQL: 1 arquivo/3 testes PASS, em duas execuções;
  `typecheck` e `lint` PASS após a alteração.
- A suíte completa, a certificação e os workflows remotos do candidato final
  ainda precisam ser observados após o commit das frentes em andamento.
