# Diagnóstico READONLY — homolog worker / SIGTERM

Resultado: defeito preexistente no oráculo do teste, sensível a transientes de saúde. A linha 425 proíbe `ready` após o primeiro `not_ready` de qualquer motivo, embora a implementação e o teste unitário de readiness permitam recuperação de dependências antes do shutdown. Não foi demonstrado defeito de drain do worker. Nenhuma correção aplicada.

## Escopo e autoridade

Lane direta de diagnóstico sob HARNESS-ISO-EXEC, usando orchestrate, sem subagentes/descendentes. Main, código, testes, claims, lockfile e ledgers permaneceram somente leitura. Artefatos próprios exclusivamente neste diretório. Execução no snapshot `/tmp/cvg-harness-iso-exec-20261003/snapshot`, Node 22.23.2, PostgreSQL sintético próprio `cvg-hiso-pg`, loopback 55594, user/database `hiso`. Sem serviços anteriores, dados reais, certify, E2E, SBOM, licenses, commit ou push. Lead recebe este relatório para integração documental; esta lane não atualiza ledgers compartilhados.

## Evidência nas fontes

- `apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts:388–404`: intervalo de saúde 25 ms, espera o primeiro `worker.homolog_health` saudável, então envia SIGTERM e espera exit `{code:0,signal:null}`.
- Mesmo teste, linhas 406–425: `findIndex` escolhe o primeiro evento `worker.readiness/status=not_ready`, **sem filtrar reason**. Reprova qualquer `ready` subsequente, mesmo anterior ao SIGTERM. O teste não fixa o início da janela de shutdown.
- `apps/worker/src/homolog-worker.ts:315–320`: `Math.min(healthIntervalMs,1000)` também vira timeout por probe; nesta fixture, 25 ms. Linhas 334–349: saúde falha emite `not_ready/dependency_health_failed`; saúde recuperada emite `ready/dependencies_recovered`.
- `apps/worker/src/health.ts:30–60,68–82`: cada probe usa `Promise.race` com timer; banco e fila são medidos em sequência. Um timeout da fila pode coexistir com banco saudável. O race não cancela o trabalho em andamento; nenhuma alteração desse contrato foi feita aqui.
- `apps/worker/src/readiness.ts:32–61`: `not_ready` aceita `ready`; `stopped` é terminal. `apps/worker/src/__tests__/readiness.test.ts:59–100` explicitamente espera recuperação após outage e só proíbe recovery após stop.
- `packages/shared/src/lifecycle.ts:58–69`: `shuttingDown=true` é definido antes de cleanup. `homolog-worker.ts:295,312,322,356,359` verifica shutdown nos pontos relevantes; `248–258` faz `not_ready/shutdown_started`, requestStop, stop, close e `stopped/shutdown_completed`. A leitura dessas fontes não revela um await entre o guard após health (322) e a marcação de recuperação (349).

## Execuções e sequência observada

1. Cinco execuções focais com captura passiva de stdout/stderr e sinais: **5/5 passaram**, cada uma com apenas 1 teste selecionado; os outros 2 casos do arquivo ficaram excluídos pelo filtro. Ver `focused-results.json` e `focused-N.*`. Sem atraso injetado.
2. Uma execução sem preload/instrumentação: **1/1 passou**, 2 casos excluídos. Ver `plain-result.json` e `plain.vitest.log`.
3. Reprodução controlada com preload externo: atraso sintético de **50 ms apenas na segunda probe de fila** (a primeira é o preflight). O preload é condicionado ao runtime homolog e recusa banco diferente de `127.0.0.1:55594/hiso`. Nenhuma fonte/teste foi editada. **Falhou exatamente em `:425:9`, expected true to be false**, exit do Vitest 1. Ver `injected-result.json`, `injected.vitest.log`, `inject-health-delay.mjs` e `injected.injection.jsonl`.

Sequência em `injected.worker-stdout.log` (linhas 5–15), UTC:

| Horário | Evento/motivo |
| --- | --- |
| 05:31:20.166 | health unhealthy: database ok, queue failed |
| 05:31:20.166 | not_ready / dependency_health_failed |
| 05:31:20.178 | health healthy |
| 05:31:20.178 | ready / dependencies_recovered |
| 05:31:20.193 | envio SIGTERM ao wrapper tsx, conforme capture.jsonl |
| 05:31:20.224 | repasse SIGTERM ao processo Node, conforme capture.jsonl |
| 05:31:20.225 | not_ready / shutdown_started |
| 05:31:20.225 | stopped / shutdown_completed |

O processo Node saiu code 0 / signal null (capture.jsonl), stderr registrou `shutdown.completed`, e não houve `ready` depois de `shutdown_started`, nem `worker.homolog_completed`. Ainda assim o teste selecionou o `not_ready` anterior, de saúde, e rejeitou a recuperação anterior ao sinal. A instrumentação registra dois PIDs porque tsx encaminha sinais ao processo Node; isso é explicitado para não confundir envio ao wrapper com início efetivo do shutdown.

## Classificação e limites

- **Bug determinístico do oráculo:** dada a sequência outage→recovery antes do shutdown, a asserção falha de forma determinística apesar do drain correto. Reprodução controlada confirma a condição, sem apresentar a injeção como ocorrência natural.
- **Flake da execução:** não falhou nas seis execuções focais sem injeção. A fixture admite transientes e combina polling de 25 ms com deadline de 25 ms. Latência/timeout pode ativar o defeito do oráculo; não é necessário pressupor mudança no worker.
- **Baseline:** homolog-worker/readiness/test são byte-idênticos entre main, snapshot e HEAD `cc1402ff163a34352c10405e9e5c77c653596084`, antes e depois. O defeito no oráculo já existe na baseline e não veio da extração do consumidor. Isso não equivale a ter executado toda a baseline histórica.
- **Ambiente:** nesta reprodução o gatilho foi imposto e é conhecido. O log agregado original `full-tests-r1.log:265–280` preserva a asserção, mas não stdout do worker ou motivos de readiness. Logo a causa temporal exata daquela ocorrência original **não pode ser confirmada**. Não atribuir a CPU, Docker, PostgreSQL indisponível, contaminação de env ou dados antigos sem evidência. Nenhuma dessas condições foi necessária para a reprodução controlada.
- **Contrato de shutdown:** nenhum `ready` pós-shutdown observado. Não alegar prova universal de ausência de races nem PASS de toda suíte; só o caso focal foi executado aqui.

## Sugestão mínima ao Lead, sem implementação

Corrigir a janela do oráculo para localizar `worker.readiness/status=not_ready/reason=shutdown_started`, exigir que esse marco exista e proibir `ready` somente depois dele; conservar exit 0 e ausência de `homolog_completed`. Preservar a recuperação legítima antes do shutdown. Não silenciar a asserção nem simplesmente aumentar o timeout para ocultar o caso.

Ressalva: `markNotReady` não emite outra transição quando já está not_ready. Se um futuro caso enviar SIGTERM enquanto ainda unhealthy, a existência do marco deve ser tratada explicitamente; esta fixture espera saúde recuperada e esta reprodução contém o marco. Um contrato novo de evento `shutdown.started`, deadline separado ou cancelamento das probes é outro escopo e deve ser avaliado na SPEC/gate correspondente (T3 se contrato público/segurança); esta lane não propõe nem faz BUILD T3.

Após autorização/integração pelo Lead, verificar que a recuperação anterior ao SIGTERM deixa de gerar falso negativo e que um `ready` realmente posterior ao shutdown ainda reprova. Reproduzir a ocorrência natural agregada exigiria preservar stdout do worker; o log original sozinho não distingue os motivos.

## Comandos reproduzíveis

Sem instrumentação:

```bash
cd /tmp/cvg-harness-iso-exec-20261003/snapshot
PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH \
  TEST_DATABASE_URL=postgres://hiso:hiso-synthetic-only@127.0.0.1:55594/hiso \
  AUD19_PG_REQUIRED=1 TSX_DISABLE_CACHE=1 \
  node node_modules/vitest/vitest.mjs run \
  apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts \
  -t 'drains cleanly on SIGTERM with no work pending' \
  --testTimeout=60000 --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

Captura passiva, reprodução com atraso e controle sem preload, respectivamente (gravando somente neste diretório):

```bash
python3 /tmp/cvg-harness-iso-exec-20261003/homolog-diagnosis/run-focused.py
python3 /tmp/cvg-harness-iso-exec-20261003/homolog-diagnosis/run-injected.py
python3 /tmp/cvg-harness-iso-exec-20261003/homolog-diagnosis/run-plain.py
```

`run-injected.py` registra exitCode 1 do Vitest como resultado esperado do diagnóstico; o runner em si termina 0 após capturar o resultado. Scripts podem ser relidos; reexecutá-los substitui seus próprios logs.

## Sentinels e higiene

`sentinel-before.json` / `sentinel-after.json`: **9/9 MATCH**, três fontes em main/snapshot/HEAD. SHA-256:

- homolog-worker: `db12847ea04563374e9f9fa1b103dabb19986d7b07eac9a470347e318fd852f9`
- readiness: `9586bb43b45d4e9953c044538f9caca218237534db8517eddd0c00d85d134f39`
- integration test: `a27d2fdafecdc5510d91ae6dfbec7123f8bfe795a1621528852b21533421140e`

`cleanup-check.log`: zero schemas/roles restantes para as seis execuções com captura (cinco passivas e uma injetada). Todas as execuções retornaram após seus próprios finally. PG do Lead permanece ativo e preservado. `original-log-binding.json` vincula SHA-256 do log agregado consultado e o trecho copiado localmente. `sequence-verdict.json` recompõe o falso negativo dos eventos capturados.

Status da lane: DIAGNOSTIC_COMPLETE / NO_FIX_APPLIED. Independência: diagnóstico próprio desta lane, não aprovação de implementação nem certificação. Próxima ação: Lead integrar achado e decidir a correção do oráculo; contratos T3 continuam sujeitos à autoridade própria.
