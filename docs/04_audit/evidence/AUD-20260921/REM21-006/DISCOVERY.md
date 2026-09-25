# REM21-006 — Discovery

## Objetivo

Corrigir `A21-F05` e `A21-F09` no escopo autorizado por `G21-1`: worker
operacional/homologado local, sintético e descartável, sem habilitar produção.
O objetivo é tornar a ordem observável e fail-closed:

```text
not_ready -> preflight DB/RLS/fila -> health -> ready -> consumo -> drain
                                                               |
                                                     not_ready -> stopped
```

## Evidência reproduzida

- `apps/worker/src/homolog-worker.ts` emitia `worker.homolog_ready` somente
  depois que o loop terminava.
- O mesmo arquivo executava `checkHomologHealth` apenas dentro do bloco de
  sweep. Um loop sem sweep bem-sucedido não produzia uma observação de saúde
  independente.
- O caminho homologado criava um runtime PostgreSQL, mas não chamava
  `assertOperationalHarnessPostgresPreflight` antes do primeiro
  `processNext`; portanto a configuração poderia parecer armada sem a prova
  estrutural de RLS, grants, migrations e tabelas críticas.
- `apps/worker/src/main.ts` emitia `worker.operational_harness_ready` depois
  do consumo. O continuous worker iniciava o pump antes de registrar o evento
  equivalente.
- `apps/worker/src/worker.ts` já recusava `NODE_ENV=production`; esse fail
  closed é um controle a preservar, não uma autorização para produção.

## Decisões de escopo

- readiness será uma máquina de estado pequena, testável e monotônica durante
  shutdown; transições para `ready` serão impossíveis depois de `stopped`;
- o preflight real continuará sendo `assertPostgresWorkerPreflight`, com a
  lista homologada de tabelas e migrations;
- o caminho operacional em memória será explicitamente tratado como perfil
  sintético não durável, com preflight próprio e sem qualquer alegação de
  prova PostgreSQL/RLS;
- a health inicial será obrigatória antes do primeiro claim e a health
  periódica terá intervalo próprio, independente de `sweepIntervalMs`;
- falha de dependência coloca o worker em `not_ready` e suspende consumo até
  recuperação, sem forçar uma ação externa;
- JSON lines no stdout é o sink/exporter local e sintético desta task. A
  composição de exporter externo, alertas, SLOs e retenção continua em
  `REM21-011` e não é alegada como concluída aqui.

## Provas negativas planejadas

1. configuração homologada sem arming, DB, RLS ou controlled mode falha antes
   de criar um caminho de consumo;
2. outage de DB/fila no health inicial não emite `ready`;
3. grant/RLS/migration ausente falha no preflight antes do primeiro claim;
4. health periódica continua sendo observada com sweep longo ou ausente;
5. `SIGTERM` em processo real produz `not_ready` antes do drain e não produz
   nenhum evento `ready` depois do início do shutdown;
6. production continua retornando `production_controlled_worker_forbidden`.

## Limitações

Não há acesso a IdP, provider, canal, credencial, exporter externo, dado real,
piloto ou produção. PostgreSQL descartável e os testes de processo só serão
considerados evidência quando executados com `TEST_DATABASE_URL`; os testes
locais sem esse serviço permanecem explicitamente sintéticos.
