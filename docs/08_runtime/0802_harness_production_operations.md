# 0802 — Operação do núcleo em produção (barra 0373)

- Data: 06/10/2026. Task: `PROD-0373-20261006` (Claude Code).
- Escopo: API e worker do núcleo. Não libera produto, dado real, provider
  externo nem canal real; cada produto segue a sua barra.
- Evidências: `docs/04_audit/evidence/PROD-0373-20261006/`.

## Imagem

Uma imagem para API e worker, em `gcr.io/distroless/cc-debian12:nonroot`,
com o Node 22.23.2 fixado, sem shell e sem gerenciador de pacotes. Roda como
`cvg` (uid 10001); os arquivos da aplicação pertencem a root. O healthcheck
(`scripts/runtime-healthcheck.mjs`) serve aos dois comandos: na API consulta
`/live`; no worker (`CVG_WORKER_RUN_MODE` definido) exige o arquivo de vida
`/tmp/cvg-worker.alive` tocado a cada heartbeat há no máximo 60 s
(`CVG_WORKER_LIVENESS_FILE`, `CVG_WORKER_LIVENESS_MAX_AGE_MS`).

```sh
docker build --target runtime -t cvg-operational-harness:<sha> .
# API (padrão da imagem)
docker run --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m cvg-operational-harness:<sha>
# Worker
docker run ...mesmas flags... cvg-operational-harness:<sha> node apps/worker/dist/main.js
```

## Banco e papéis

Papéis separados e sem `SUPERUSER`/`BYPASSRLS`: migração (dono do schema de
dados), runtime (API e worker), dono do schema de autenticação e sessão de
operador. A receita executável está em `scripts/production-stack-smoke.ts`.
A migração `0027_worker_operations` cria `worker_heartbeats` e
`kernel_pause_switches`; o runtime precisa de `SELECT/INSERT/UPDATE` nas duas
(o preflight do worker recusa subir sem isso).

## Login de operador (condição 4)

A API em produção compõe o store de sessão PostgreSQL
(`CVG_OPERATOR_SESSION_DATABASE_URL`, `CVG_OPERATOR_AUTH_SCHEMA`,
`CVG_OPERATOR_SESSION_ROLE`). Um token assinado (`x-cvg-operator-token`,
chaveiro `CVG_OPERATOR_IDENTITY_KEYRING`) troca-se por cookie em
`GET /v1/session`; sem sessão, rota protegida responde 401. Se o banco de
autenticação cair, rotas de operador falham fechadas (503) e `/ready` reflete.

## Botão de desligar (condição 10)

```sh
DATABASE_URL=<url do runtime> POSTGRES_SCHEMA=<schema> \
  node scripts/ops-kernel-pause.mjs --tenant <tenant_id> --pause --actor <quem> --reason <motivo>
node scripts/ops-kernel-pause.mjs --tenant <tenant_id> --status
node scripts/ops-kernel-pause.mjs --tenant <tenant_id> --resume --actor <quem>
```

Com a pausa ligada o worker não pega item novo (os pendentes ficam intactos,
sem gastar tentativa) e o kernel não inicia efeito nem consome aprovação; um
turno em andamento termina `paused` e volta para a fila. O interruptor é lido
de novo imediatamente antes do corpo da ferramenta: uma pausa que chegue
depois da reserva libera a aprovação e o journal como sem efeito. Interruptor ilegível
conta como pausa. Ao retomar, os mesmos itens rodam.

## Alerta de parada (condição 9)

O monitor roda no processo da API (fora do worker) quando
`CVG_STOP_ALERT_WEBHOOK_URL` está definido; em produção sem essa variável a
API registra `stop_alert.disabled`. Variáveis: `CVG_STOP_ALERT_WEBHOOK_SECRET`
(≥ 32 caracteres), `CVG_STOP_ALERT_TENANT_ID` (ou `CVG_WORKER_TENANT_ID`),
`CVG_STOP_ALERT_WORKER_STALE_MS` (padrão 120000),
`CVG_STOP_ALERT_QUEUE_STALLED_MS` (padrão 300000) e
`CVG_STOP_ALERT_INTERVAL_MS` (padrão 30000).

Alertas: `worker_down` (nenhum heartbeat recente) e `queue_stalled` (item
pronto mais velho que o limite, ou lease vencido; suspenso durante a pausa).
Cada incidente é enviado uma vez ao abrir (`firing`) e uma vez ao fechar
(`resolved`). O receptor valida
`x-cvg-alert-signature = HMAC-SHA256(secret, "<x-cvg-alert-timestamp>.<corpo>")`.
Limiares e destino reais são decisão do responsável pela operação.

## Backup e cadeia de auditoria (condição 8)

`pg_dump --format=custom` do banco e `pg_restore` num banco novo. Depois do
restore, a cadeia do kernel é verificada a partir de `audit_events`
(`verifyPersistedKernelAudit` em `apps/worker/src/kernel-audit-chain.ts`):
sequência contínua, encadeamento, hash de cada evento e de cada payload
gravado (o worker sanitiza o payload antes de encadear). Guarde fora do banco
as cabeças e contagens de cada ledger no momento do backup e passe-as como
`anchors`, para detectar cauda truncada. O ensaio completo, com carga real do
kernel e controles de adulteração de metadado e de payload, usa a API
em processo no perfil sintético de teste:
`NODE_ENV=test npx tsx scripts/restore-audit-chain-proof.ts --output <arquivo.json>`.

## Smoke da pilha (condição 3)

`npx tsx scripts/production-stack-smoke.ts --image <ref> --output <arquivo.json>`
sobe PostgreSQL próprio, API e worker em produção endurecidos e um receptor de
alerta, e registra probes, login, webhook assinado, aprovação com um efeito,
reuso sem duplicata, replay recusado após reinício, pausa/retomada e alerta.
