# AUD20-003 - SPEC

- programa: `AUD-20260920-REAUDIT`
- task: `AUD20-003`
- finding: `A20-F03`
- autorizacao: `G20-1`, somente escopo local, sintetico e descartavel
- fonte: `docs/03_build/0333_audit20_backlog.md`

## Objetivo

Inventariar cada teste skipped, pending ou todo observado pelos gates, exigir
ID estavel, motivo, owner, origem com hash e gate dedicado, e falhar fechado
para skip desconhecido, requerido, drift de origem ou report inconsistente.

## Criterios de aceite

1. O catalogo cobre os 35 arquivos condicionais conhecidos, incluindo o recorte
   `continuous-worker-entrypoint.integration.test.ts` e o chaos PostgreSQL.
2. Reports Vitest de unit, PostgreSQL e chaos sao vinculados ao mesmo
   `candidateId`/`runId` do certificador.
3. O inventario rejeita source drift, contagem divergente, metadata ausente,
   skip desconhecido e qualquer contrato marcado como requerido.
4. O self-test cobre os negativos de skip desconhecido e skip requerido.
5. O gate PostgreSQL executa contra fixture descartavel e nao produz skips.
6. `npm run certify` termina com todos os gates PASS no mesmo candidato.

## Fora de escopo

Providers, canais, IdP, dados reais, piloto, producao, RPO/RTO produtivo e
qualquer acao clinica, financeira, de prontuario ou sensivel.
