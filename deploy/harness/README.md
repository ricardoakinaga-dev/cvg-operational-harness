# Núcleo em ambiente real — runbook técnico da Fase C (plano 0374)

- Plano: [0374, Fase C](../../docs/03_build/0374_plano_producao_harness.md) (C1–C9; C10 é a reauditoria do Codex).
- Barra: [0373](../../docs/03_build/0373_barra_producao_harness.md). Operação vigente: [0802](../../docs/08_runtime/0802_harness_production_operations.md).
- Runbook de governança (quem decide, estado, aceite): [0805](../../docs/08_runtime/0805_runbook_ambiente_real.md).
- **Estado: preparado, nada executado.** Não há destino, DNS, cofre, IdP nem
  receptor de alerta escolhidos. Produção do núcleo continua `NO_GO` até o
  parecer C10 no mesmo SHA e no mesmo digest.

## Arquivos

| Arquivo                                                                          | Para que serve                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [compose.production.yaml](compose.production.yaml)                               | `migrate` (job único), `api`, `worker`, `proxy` TLS; `postgres` só com `--profile local-postgres`  |
| [.env.example](.env.example)                                                     | Todas as variáveis, valores sintéticos, onde cada uma é consumida                                  |
| [proxy/nginx.conf](proxy/nginx.conf)                                             | Terminação TLS, cabeçalhos `X-Forwarded-*` sobrescritos, HTTP simples encaminhado para a API (426) |
| [postgres/](postgres/README.md)                                                  | `roles.sql`, `backup-grants.sql`, `verify-roles.sql` e a saída esperada de cada consulta           |
| [backup/](backup/backup.sh)                                                      | `backup.sh`, `restore-drill.sh`, `chain-anchors.mjs`, `common.sh` e unidades systemd               |
| [secrets/README.md](secrets/README.md)                                           | Formato, geração, guarda e rotação de cada segredo; emissor de token                               |
| [`scripts/production-target-smoke.ts`](../../scripts/production-target-smoke.ts) | Smoke remoto (C5, C7, C8, C9) a partir da máquina do operador                                      |

## Decisão C1 — destino

**Padrão proposto: uma VM Linux dedicada com Docker Engine e Compose v2
(≥ 2.24), PostgreSQL 16 gerenciado e o proxy TLS na própria VM.**

Por quê:

- A barra 0373 foi provada com exatamente estas peças: a mesma imagem, as
  mesmas flags (`--read-only`, `--cap-drop ALL`, `no-new-privileges`, tmpfs
  `/tmp`), o mesmo job de migração e as mesmas variáveis
  (`scripts/production-stack-smoke.ts`, 22/22). O compose repete isso 1:1;
  qualquer outro destino exige traduzir e provar de novo.
- `API_TRUSTED_PROXY_ADDRESSES` aceita só IPs literais (no máximo 32, sem
  CIDR, `apps/api/src/http-security.ts`). Numa VM o proxy tem IP fixo na rede
  do compose (`CVG_HARNESS_PROXY_IPV4`); em Kubernetes ou PaaS o salto de
  entrada costuma ter IP variável.
- O worker é um processo contínuo (heartbeat, lease, pausa). Isso cabe numa
  VM sem truque; PaaS orientado a requisição desliga processos ociosos.
- PostgreSQL gerenciado entrega TLS, correções e snapshot/PITR do provedor
  como segunda camada, sem DBA dedicado. A barra 0373 é proporcional: não
  exige alta disponibilidade, PITR formal nem on-call escalonado.

Limite aceito: um host só, sem redundância (o `restart: unless-stopped`
cobre queda de processo, não do host). Volta à mesa se a API abrir para a
internet de forma ampla, se o núcleo atender outra organização ou se um
agente passar a escrever no HIS (gatilhos da própria 0373).

Alternativas e o que mudaria:

| Destino         | O que muda                                                                                                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kubernetes      | `Deployment` de api/worker com `runAsUser: 10001`, `readOnlyRootFilesystem`, `drop: [ALL]`, `allowPrivilegeEscalation: false`, `emptyDir` em `/tmp`; `Job` de migração antes do rollout; `CronJob` de backup; segredos por External Secrets. O ingress precisa de IPs fixos para `API_TRUSTED_PROXY_ADDRESSES` (ou um proxy sidecar), senão tudo vira 426 |
| PaaS gerenciado | TLS na borda da plataforma; o IP do salto anterior varia e esbarra na lista de IPs literais; o worker precisa de instância sempre ligada; migração como job da plataforma; backup pelo agendador dela. Maior risco de C5 não fechar sem mudança de código                                                                                                 |

## Antes de começar (no host)

- Checkout do repositório no **SHA certificado** em `/opt/cvg-harness`
  (caminho sem `:`). Os arquivos deste diretório são montados de lá.
- `/etc/cvg-harness` (`root:cvg-backup`, `0750` depois de C6) com
  `harness.env` (`root`, `0600`), `backup.env` (`root:cvg-backup`, `0640`),
  `db-ca.pem` (`0644`: os contêineres rodam como uid 10001 e só leem) e
  `tls/` (`fullchain.pem` `0644`; `privkey.pem` dono uid/gid 101, `0400`,
  porque o nginx-unprivileged do proxy roda como 101 e o bind mount mantém
  dono e modo do host).
- Firewall: entrada só 80/443; saída para o PostgreSQL gerenciado, o
  receptor de alerta e o registro de imagens.
- Não exporte variáveis do `harness.env` no shell do deploy: o compose dá
  precedência ao ambiente do shell sobre o `--env-file`.

```sh
hc() { docker compose -f /opt/cvg-harness/deploy/harness/compose.production.yaml \
  --env-file /etc/cvg-harness/harness.env "$@"; }
```

## C1 — manifesto e segredos fora do repositório

```sh
install -d -m 0700 /etc/cvg-harness
install -m 0600 /opt/cvg-harness/deploy/harness/.env.example /etc/cvg-harness/harness.env
# preencher a partir do cofre (secrets/README.md); nunca editar no checkout
hc config -q && echo CONFIG_OK
hc config | grep -c DATABASE_MIGRATION_URL
git -C /opt/cvg-harness status --porcelain
```

Saída esperada: `CONFIG_OK`; `1` (só o serviço `migrate` recebe a credencial
DDL); `git status` vazio. Sem digest real, o compose recusa:
`required variable CVG_HARNESS_IMAGE_DIGEST is missing a value`. Os
placeholders `replace_me` são recusados pela própria API no boot.

**Aceite 0374:** manifesto versionado (este diretório); segredos fora do
repositório.

## C2 — PostgreSQL com os quatro papéis

Seguir [postgres/README.md](postgres/README.md): `roles.sql` como
administrador, senhas com `\password`, Q2 vazia, primeira migração (C3),
`backup-grants.sql` e `verify-roles.sql`.

Saída esperada: a tabela "Saída esperada de verify-roles.sql" daquele README.

**Aceite 0374:** `scripts/production-stack-smoke.ts` adaptado ao destino
passa 22/22. A adaptação está mapeada check a check no
[0805](../../docs/08_runtime/0805_runbook_ambiente_real.md), seção C2:
parte roda no destino (`verify-roles.sql`, logs do `migrate`, smoke remoto,
ensaios de pausa e alerta) e parte só no ensaio local com o mesmo digest
(queda de conexão no meio da troca de sessão, que exige matar processos do
banco).

## C3 — job de migração antes do serving

O dono do schema de auth precisa de `CREATE` no banco só durante o job
([0802](../../docs/08_runtime/0802_harness_production_operations.md)). Todo
`up` roda o `migrate` primeiro; API e worker só sobem se ele terminar com 0.

```sh
psql "<conexão do administrador>" -c 'GRANT CREATE ON DATABASE cvg TO cvg_auth_owner'
hc pull
hc up -d
psql "<conexão do administrador>" -c 'REVOKE CREATE ON DATABASE cvg FROM cvg_auth_owner'
hc ps -a
hc logs migrate
# A API recusa a credencial DDL (valor fictício; não conecta em nada):
hc run --rm --no-deps -e DATABASE_MIGRATION_URL=postgres://refusal-probe@127.0.0.1:1/refusal_probe api; echo "exit=$?"
```

Saída esperada: `migrate` em `Exited (0)` com
`{"event":"migration.product_applied",...,"runtimeGrants":true}` e
`{"event":"migration.operator_auth_applied",...}`; `api`, `worker` e `proxy`
`(healthy)`; a execução de recusa termina com `exit=1` e
`{"event":"api.startup_failed","code":"startup_failed","message":"Production serving must not receive DATABASE_MIGRATION_URL"}`.
Um `up -d` fora da janela falha fechado no `migrate` e não recria a API.
Q3 do `verify-roles.sql` confirma os donos dos schemas.

**Aceite 0374:** API recusa `DATABASE_MIGRATION_URL`; catálogo confirma o dono
do schema.

## C4 — segredos no cofre

Seguir [secrets/README.md](secrets/README.md). Conferência de que nada vazou
para a imagem (mesma varredura da condição 6 da 0373):

```sh
IMAGE="<repositório>@<digest certificado>"
cid=$(docker create "$IMAGE"); mkdir -p /tmp/cvg-image-fs
docker export "$cid" | tar -x -C /tmp/cvg-image-fs; docker rm "$cid"
gitleaks detect --no-git --source /tmp/cvg-image-fs --redact --exit-code 1
```

Saída esperada: `no leaks found`.

**Aceite 0374:** rotação documentada; nenhum segredo em imagem ou repositório.

## C5 — HTTPS, proxy confiável e 426

DNS do nome escolhido apontando para a VM; certificado em
`CVG_HARNESS_TLS_*` (ACME HTTP-01 pelo webroot `CVG_HARNESS_ACME_WEBROOT`,
ou certificado da plataforma). Depois de renovar:
`hc exec proxy nginx -s reload`.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://<host>/live
curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/live
curl -sSI https://<host>/live | grep -i '^strict-transport-security'
hc exec api node scripts/runtime-healthcheck.mjs; echo "probe=$?"
```

Saída esperada: `426`; `200`; `strict-transport-security: max-age=31536000`
(a API só o envia quando o pedido veio do proxy confiável); `probe=0` (o
`/live` por loopback dentro do contêiner continua isento de TLS). O smoke
remoto repete isso e testa CORS hostil (C9).

**Aceite 0374:** `curl` externo sem TLS recebe 426; com TLS, 200.

## C6 — backup agendado e ensaio de restore

O [backup.sh](backup/backup.sh) abre um snapshot `REPEATABLE READ`, verifica e
ancora as cabeças de cada ledger do kernel nesse snapshot (mesmo verificador
de `scripts/restore-audit-chain-proof.ts`, compilado na imagem) e faz
`pg_dump --format=custom --snapshot=<id>` do mesmo estado. As âncoras e as
somas vão também para `CVG_BACKUP_ANCHOR_DIR`, que deve ficar em outro disco
ou host. O [restore-drill.sh](backup/restore-drill.sh) restaura num
PostgreSQL descartável numa rede Docker `--internal` (sem rota para o banco de
produção) e confere a cadeia contra as âncoras.

```sh
useradd --system --home-dir /var/lib/cvg-harness --shell /usr/sbin/nologin cvg-backup
usermod -aG docker cvg-backup   # grupo docker equivale a root: só a operação
install -d -o cvg-backup -g cvg-backup -m 0700 \
  /var/backups/cvg-harness/sets /var/lib/cvg-harness/anchors /var/lib/cvg-harness/restore-drills
chgrp cvg-backup /etc/cvg-harness && chmod 0750 /etc/cvg-harness   # harness.env segue 0600 root
install -o root -g cvg-backup -m 0640 /dev/null /etc/cvg-harness/backup.env  # preencher do cofre
install -m 0644 /opt/cvg-harness/deploy/harness/backup/systemd/* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cvg-harness-backup.timer cvg-harness-restore-drill.timer
systemctl start cvg-harness-backup.service && journalctl -u cvg-harness-backup.service -o cat -n 5
systemctl start cvg-harness-restore-drill.service && journalctl -u cvg-harness-restore-drill.service -o cat -n 5
```

Alternativa sem systemd (`/etc/cron.d/cvg-harness`):

```cron
15 3 * * * cvg-backup /opt/cvg-harness/deploy/harness/backup/backup.sh --env-file /etc/cvg-harness/backup.env >>/var/log/cvg-harness/backup.log 2>&1
0 5 1-7 * * cvg-backup [ "$(date +\%u)" = 7 ] && /opt/cvg-harness/deploy/harness/backup/restore-drill.sh --env-file /etc/cvg-harness/backup.env >>/var/log/cvg-harness/restore-drill.log 2>&1
```

Saída esperada: `{"event":"backup.completed","message":"set=... bytes=... sha256=..."}`
e um conjunto `AAAAMMDDTHHMMSSZ/` com `harness.dump`, `anchors.json`,
`SHA256SUMS` e `manifest.json`; cópia em `CVG_BACKUP_ANCHOR_DIR`. O ensaio
termina com `restore_drill.completed` e um relatório em
`CVG_RESTORE_EVIDENCE_DIR` com `"status":"PASS"` e
`"verification":{...,"status":"PASS"}`. Qualquer falha sai com código 1 (ligar
`OnFailure=` ao canal de alerta decidido em A3). Uma cadeia inválida no banco
vivo também falha o backup (`anchors.chain_invalid`).

**Aceite 0374:** primeiro restore real registrado com cadeia íntegra (copiar o
relatório do ensaio, que não tem segredo nem dado pessoal, para
`docs/04_audit/evidence/<task>/`).

## C7 — logs, métricas e alerta de parada

- Logs: API e worker escrevem JSON por linha em stdout/stderr; o compose
  guarda em `json-file` com rotação (10 MB × 5). O coletor externo é decisão
  da operação. Conferir: `hc logs --since 10m api worker`.
- Métricas: `/health/metrics` responde **404 em produção** (o código só o
  habilita em `test`/`development`) e o proxy também o bloqueia. A raspagem
  pedida em C7 não é possível sem mudança de código; ver o achado no 0805.
- Alerta: sem `CVG_STOP_ALERT_WEBHOOK_URL` o compose nem sobe. Ensaio:

```sh
hc logs api | grep -c stop_alert.disabled     # esperado: 0
hc stop worker
# aguardar CVG_STOP_ALERT_WORKER_STALE_MS + CVG_STOP_ALERT_INTERVAL_MS (padrão 150 s)
hc start worker
# pausa/retomada (0802) com o script do checkout montado na imagem:
hc run --rm --no-deps -v /opt/cvg-harness/scripts/ops-kernel-pause.mjs:/app/scripts/ops-kernel-pause.mjs:ro \
  api node scripts/ops-kernel-pause.mjs --tenant <tenant_id> --status
```

Saída esperada: o receptor real recebe `worker_down` `firing` e depois
`resolved`, com `x-cvg-alert-signature` válida (HMAC-SHA256 de
`"<timestamp>.<corpo>"`).

**Aceite 0374:** parada induzida do worker gera alerta no canal real.

## C8 — identidade de operador

`CVG_IDENTITY_MODE=trusted` é literal no compose e a API recusa `simulation`
em produção. O emissor de tokens é decisão do usuário (ver
[secrets/README.md](secrets/README.md#emissor-de-token-de-operador-c8)).
Com dois tokens de papéis distintos (por exemplo `Admin` e `Operator`), sem
deixá-los no histórico do shell:

```sh
read -rs SMOKE_OPERATOR_A_TOKEN && export SMOKE_OPERATOR_A_TOKEN
read -rs SMOKE_OPERATOR_B_TOKEN && export SMOKE_OPERATOR_B_TOKEN
SMOKE_TARGET_URL=https://<host> SMOKE_ALLOWED_ORIGIN=https://<host> \
SMOKE_OPERATOR_A_ROLE=Admin SMOKE_OPERATOR_B_ROLE=Operator \
  npx tsx scripts/production-target-smoke.ts --output /tmp/cvg-target-smoke.json
```

Saída esperada: `PASS c8.no_session_401`, `PASS c8.operator_a_login`,
`PASS c8.operator_b_login`, `PASS c8.distinct_roles`,
`PASS c8.role_enforcement` (`/v1/admin/agents`: 200 para Admin, 403 para os
outros papéis).

**Aceite 0374:** login real de dois operadores com papéis distintos; 401 sem
sessão.

## C9 — mesmo digest e smoke no destino

A API não tem rota de versão/build. O digest implantado sai do próprio
contêiner, porque o compose referencia `repositório@sha256:...`:

```sh
for s in migrate api worker; do docker inspect --format '{{.Config.Image}}' "$(hc ps -a -q "$s")"; done
SMOKE_EXPECTED_IMAGE_DIGEST=<digest registrado pela certificação/CI> \
SMOKE_DEPLOYED_IMAGE_DIGEST=<saída acima> \
SMOKE_TARGET_URL=https://<host> SMOKE_ALLOWED_ORIGIN=https://<host> \
  npx tsx scripts/production-target-smoke.ts --output docs/04_audit/evidence/<task>/production-target-smoke.json
```

Saída esperada: as três linhas iguais ao digest certificado;
`PASS c9.image_digest_match`; relatório com `"status":"PASS"`. `complete:
false` indica checks `SKIPPED` (sem tokens, sem origem permitida): para C9
inteiro todos precisam rodar. O relatório não contém token, cookie nem id de
operador. Variáveis do smoke: `SMOKE_TARGET_URL` (obrigatória, https),
`SMOKE_PLAIN_HTTP_URL` (padrão `http://<host>`; `skip` desliga e deixa C5
incompleto), `SMOKE_ALLOWED_ORIGIN`, `SMOKE_HOSTILE_ORIGIN`,
`SMOKE_PROTECTED_PATH` (padrão `/v1/tasks`), `SMOKE_ROLE_PROBE_PATH` (padrão
`/v1/admin/agents`), `SMOKE_OPERATOR_{A,B}_{TOKEN,ROLE}`,
`SMOKE_RATE_LIMIT_REQUESTS` (padrão 40, máximo 300; só observação),
`SMOKE_EXPECT_METRICS` (padrão `false`), `SMOKE_TIMEOUT_MS`.

**Aceite 0374:** mesmo digest da imagem em CI e em produção; registro em
`docs/04_audit/evidence/`.

## Ensaio local completo (antes do destino)

Mesmo procedimento, numa máquina de ensaio, com `--profile local-postgres`:
cópia do `.env.example` fora do repositório, URLs apontando para
`postgres:5432` com `sslmode=disable` (sem `sslrootcert`),
`CVG_HARNESS_LOCAL_PG_PASSWORD` sintética, `CVG_HARNESS_DB_CA_FILE` apontando
para qualquer arquivo legível, certificado autoassinado para `localhost` e as
imagens publicadas num registro local para terem digest. Os papéis entram com
`hc --profile local-postgres exec postgres psql -U postgres -d cvg -X -v ... -f /cvg-postgres/roles.sql`.
O smoke confia no certificado com `NODE_EXTRA_CA_CERTS=<fullchain.pem>`. O
ensaio também roda `scripts/production-stack-smoke.ts --image <mesmo digest>`
(22/22) e `restore-drill.sh` sobre um backup do próprio ensaio.

## O que só o usuário ou a operação decide

- [ ] Destino (C1): VM padrão ou alternativa; provedor e região.
- [ ] Nome DNS público e autoridade do certificado TLS.
- [ ] Cofre de segredos e quem tem acesso a ele e ao grupo `docker` do host.
- [ ] Emissor de tokens de operador (IdP corporativo/OIDC, D-09, ou emissor
      interno assinado) e quais dois operadores fazem o aceite C8.
- [ ] Receptor e limiares reais do alerta de parada (A3) e para onde vão as
      falhas do backup.
- [ ] Local independente das âncoras e cópia externa dos dumps (disco, host
      ou armazenamento imutável) e retenção (`CVG_BACKUP_RETENTION_DAYS`).
- [ ] Exceção `BYPASSRLS` do papel de backup ou alternativa
      ([postgres/README.md](postgres/README.md)).
- [ ] Coletor de logs e o tratamento de C7 para métricas (aceitar logs +
      heartbeats + alerta, ou SPEC de métricas autenticadas em produção).
- [ ] Expor ou não o console web pelo proxy (fora do escopo da barra 0373).
