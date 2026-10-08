# 0805 — Runbook do ambiente real do núcleo (Fase C do plano 0374)

- Data: 07/10/2026. Task: `PLAN0374-B-FABLE-20261007` (lane C-prep, agente
  Opus sob o Fable).
- Plano: [0374](../03_build/0374_plano_producao_harness.md), Fase C (C1–C9;
  C10 é a reauditoria). Barra: [0373](../03_build/0373_barra_producao_harness.md).
  Operação vigente: [0802](0802_harness_production_operations.md), que este
  runbook não repete.
- Runbook técnico com comandos e saídas esperadas:
  [`deploy/harness/README.md`](../../deploy/harness/README.md).
- **Estado: preparado, nada executado.** Não existe destino escolhido; nenhum
  item C1–C9 foi executado em ambiente real; nenhum segredo foi gerado. A
  produção do núcleo continua `NO_GO` até o parecer C10 do Codex sobre as dez
  condições da 0373 no mesmo SHA e no mesmo digest, em ambiente real. Nenhum
  produto é liberado por este runbook (ADR-010).

## Artefatos versionados nesta rodada

| Artefato                                                                                                           | Itens              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| [`compose.production.yaml`](../../deploy/harness/compose.production.yaml)                                          | C1, C3, C5, C7, C9 |
| [`.env.example`](../../deploy/harness/.env.example)                                                                | C1, C4             |
| [`proxy/nginx.conf`](../../deploy/harness/proxy/nginx.conf)                                                        | C5                 |
| [`postgres/`](../../deploy/harness/postgres/README.md) (`roles.sql`, `backup-grants.sql`, `verify-roles.sql`)      | C2, C3             |
| [`backup/`](../../deploy/harness/backup/backup.sh) (`backup.sh`, `restore-drill.sh`, `chain-anchors.mjs`, systemd) | C6                 |
| [`secrets/README.md`](../../deploy/harness/secrets/README.md)                                                      | C4, C8             |
| [`scripts/production-target-smoke.ts`](../../scripts/production-target-smoke.ts) e teste                           | C5, C7, C8, C9     |

Verificação desta rodada, sem subir nada: `docker compose config` com o env
de exemplo (válido; só o `migrate` recebe `DATABASE_MIGRATION_URL`; sem
digest o compose recusa), `bash -n` nos scripts de backup, `node --check` no
`chain-anchors.mjs`, lógica de âncoras exercitada com o verificador real e
cadeias sintéticas (truncamento, cauda extra, ledger extra e payload
adulterado detectados), `tests/production-target-smoke.test.ts` (servidor
falso em 127.0.0.1, casos de aprovação e de falha), typecheck, ESLint e
Prettier.

## C1 — destino e manifesto

- **No repositório:** manifesto em `deploy/harness/`; segredos só em
  `/etc/cvg-harness/*.env`, fora do checkout.
- **Padrão proposto:** VM Linux dedicada + Docker Compose + PostgreSQL 16
  gerenciado (justificativa e alternativas Kubernetes/PaaS no README do
  deploy). O motivo central: a barra foi provada com a mesma imagem e as
  mesmas flags de `docker run`, e `API_TRUSTED_PROXY_ADDRESSES` só aceita IPs
  literais, o que favorece um proxy com IP fixo.
- **Passos:** README do deploy, seção C1.
- **Aceite:** manifesto versionado; segredos fora do repositório
  (`git status` limpo no host; `hc config` com `DATABASE_MIGRATION_URL` só no
  `migrate`).
- **Quem:** usuário decide destino, provedor e região; operação provisiona.

## C2 — PostgreSQL gerenciado com os quatro papéis

- **No repositório:** `roles.sql` reproduz em SQL a receita do
  `production-stack-smoke.ts` (`scripts/baseline-postgres.ts` não cria
  papéis); `verify-roles.sql` com a saída esperada documentada.
- **Passos:** [`deploy/harness/postgres/README.md`](../../deploy/harness/postgres/README.md).
- **Aceite:** "`production-stack-smoke.ts` adaptado ao destino passa 22/22". O
  smoke local sobe o próprio PostgreSQL e contêineres, então no destino ele é
  substituído check a check:

| Check do smoke local (22)                                                                                                                                                                   | Como se prova no destino                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `migration.job_completed`                                                                                                                                                                   | `hc ps -a` (`migrate` `Exited (0)`) e os dois eventos em `hc logs migrate` (C3)                                        |
| `postgres.roles_separated`                                                                                                                                                                  | `verify-roles.sql` Q1–Q5                                                                                               |
| `api.refuses_ddl_credential`                                                                                                                                                                | `hc run --rm --no-deps -e DATABASE_MIGRATION_URL=<valor fictício> api` (C3)                                            |
| `api.live`, `api.ready`                                                                                                                                                                     | `production-target-smoke`: `c5.https_live_200`, `c7.https_ready_200`                                                   |
| `auth.no_session_401`, `auth.login_200`, `auth.protected_200`                                                                                                                               | `production-target-smoke`: `c8.*` (precisa dos tokens do emissor)                                                      |
| `worker.started_production_kernel`, `api.image_healthcheck_healthy`, `worker.image_healthcheck_healthy`                                                                                     | `hc ps` com `(healthy)` e `ops-kernel-pause.mjs --status` mostrando o worker                                           |
| `pause.holds_pending_work`, `pause.resume_drains`                                                                                                                                           | `ops-kernel-pause.mjs --pause/--status/--resume` no destino (README, C7)                                               |
| `alert.worker_down_delivered_signed`                                                                                                                                                        | Parada induzida do worker com o receptor real (C7)                                                                     |
| `auth.connection_loss_503_api_alive`, `auth.connection_loss_recovers`                                                                                                                       | **Só no ensaio** com o mesmo digest: exige matar processos do banco de produção                                        |
| `webhook.signed_accepted`, `kernel.approval_requested`, `kernel.approved_effect_once`, `kernel.reuse_without_duplicate`, `kernel.approval_executed`, `webhook.replay_refused_after_restart` | **Ensaio** com o mesmo digest; no destino, só com tráfego sintético na operação assistida (D1), por decisão do usuário |

- **Quem:** administrador do serviço gerenciado (operação) executa; usuário
  aceita a exceção do papel de backup; Codex julga em C10 se o mapeamento
  basta.

## C3 — job de migração antes do serving

- **No repositório:** serviço `migrate` (`node scripts/migrate-job.mjs`,
  `restart: "no"`); `api` e `worker` com
  `depends_on: migrate: service_completed_successfully`; só o `migrate`
  recebe `DATABASE_MIGRATION_URL` e `CVG_OPERATOR_AUTH_MIGRATION_URL`.
- **Passos:** README do deploy, seção C3: janela de
  `GRANT CREATE ON DATABASE` / `REVOKE` ao dono de auth em volta de cada
  `up -d`.
- **Aceite:** API recusa `DATABASE_MIGRATION_URL`
  (`api.startup_failed` com "Production serving must not receive
  DATABASE_MIGRATION_URL"); Q3 confirma `cvg_data` → `cvg_migration` e
  `cvg_auth` → `cvg_auth_owner`.
- **Quem:** operação executa.

## C4 — segredos no cofre

- **No repositório:** formatos exigidos pelo código, comandos de geração,
  rotação por segredo e o que nunca entra em imagem/repositório:
  [`secrets/README.md`](../../deploy/harness/secrets/README.md).
- **Passos:** gerar direto no cofre, renderizar `/etc/cvg-harness/*.env`,
  varrer a imagem com gitleaks (README do deploy, C4).
- **Aceite:** rotação documentada; nenhum segredo em imagem ou repositório.
- **Quem:** usuário escolhe o cofre e quem acessa; operação gera e guarda.

## C5 — HTTPS, proxy confiável e 426

- **No repositório:** proxy nginx-unprivileged (alvo `web` do Dockerfile, já
  fixado por digest) com TLS 1.2/1.3, IP fixo na rede do compose repassado à
  API como `API_TRUSTED_PROXY_ADDRESSES`, `X-Forwarded-*` sobrescritos,
  `Forwarded` removido, HTTP simples **encaminhado** (não redirecionado) para
  a API responder 426, `/health/metrics` bloqueado. nginx em vez de Caddy:
  já está na cadeia de suprimentos do repositório, roda sem root com disco
  somente leitura e não faz chamadas ACME por conta própria; a renovação do
  certificado fica explícita (webroot ou plataforma).
- **Passos:** README do deploy, seção C5; smoke `c5.*`.
- **Aceite:** `curl` externo sem TLS recebe 426; com TLS, 200.
- **Quem:** usuário decide o nome DNS e a autoridade do certificado; operação
  executa.

## C6 — backup agendado e ensaio mensal de restore

- **No repositório:** `backup.sh` (snapshot exportado, âncoras das cabeças de
  cada ledger verificadas no mesmo snapshot com o verificador compilado da
  imagem, `pg_dump --format=custom --snapshot`, somas, manifesto, cópia
  independente das âncoras, retenção, saída ≠ 0 em qualquer falha),
  `restore-drill.sh` (PostgreSQL descartável em rede `--internal`, nunca o
  banco de produção; confere somas e âncoras; relatório JSON), timers systemd
  diário e mensal e alternativa cron.
- **Passos:** README do deploy, seção C6.
- **Aceite:** primeiro restore real registrado com cadeia íntegra (relatório
  do ensaio copiado para `docs/04_audit/evidence/<task>/`).
- **Quem:** operação executa; usuário decide onde ficam as âncoras e a cópia
  externa dos dumps, e a retenção.

## C7 — observabilidade

- **No repositório:** logs JSON com rotação no compose; alerta de parada
  obrigatório no compose (sem URL não sobe); ensaio de parada e de pausa no
  README do deploy.
- **Aceite:** parada induzida do worker gera alerta no canal real.
- **Quem:** operação escolhe o coletor de logs e opera o receptor (A3);
  usuário decide o tratamento de métricas (achado G1).

## C8 — identidade de operador

- **No repositório:** `CVG_IDENTITY_MODE=trusted` literal no compose (a API
  recusa `simulation` em produção); smoke com dois tokens, papéis esperados,
  cookie `HttpOnly`/`Secure`/`SameSite=Strict`, reuso da sessão, rota
  protegida e `/v1/admin/agents` só para Admin; emissão interina de token para
  o ensaio em `secrets/README.md`.
- **Aceite:** login real de dois operadores com papéis distintos; 401 sem
  sessão.
- **Quem:** usuário escolhe o emissor (achado G2) e os dois operadores;
  operação roda o smoke.

## C9 — mesmo digest e smoke no destino

- **No repositório:** imagem referenciada por
  `${CVG_HARNESS_IMAGE_REPOSITORY}@${CVG_HARNESS_IMAGE_DIGEST}` (o compose
  recusa subir sem digest); `production-target-smoke.ts` compara o digest
  certificado com o lido do contêiner (`docker inspect .Config.Image`).
- **Aceite:** mesmo digest da imagem em CI e em produção; relatório do smoke
  em `docs/04_audit/evidence/`, com `"status":"PASS"` e `complete: true`.
- **Quem:** CI/certificação publica o digest (achado G6); operação roda o
  smoke; Claude registra a evidência e os ledgers.

## C10 — reauditoria

Codex verifica as dez condições da 0373 no mesmo SHA e no mesmo digest, em
ambiente real, e emite o parecer do núcleo. Até lá: `NO_GO`.

## Achados da preparação (para usuário e Codex)

| Id  | Item   | Achado                                                                                                                                                                                             | Encaminhamento                                                                                             |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| G1  | C7     | `/health/metrics` responde 404 com `NODE_ENV=production` (`requestMetricsEnabled` só em `test`/`development`, `apps/api/src/server.ts`); "métricas raspadas" não é atingível sem mudança de código | Usuário: aceitar logs + `/ready` + heartbeats + alerta como evidência C7, ou SPEC de métricas autenticadas |
| G2  | C8     | Não há emissor de token implantável no repositório; as rotas OIDC não estão compostas na API (D-09 pendente)                                                                                       | Usuário escolhe o emissor; emissão manual só para ensaio                                                   |
| G3  | C2, C6 | Tabelas com `FORCE ROW LEVEL SECURITY` obrigam o papel de `pg_dump` a ter `BYPASSRLS` (exceção à regra dos quatro papéis); no PostgreSQL 16 só quem tem o atributo o concede                       | Usuário aceita a exceção (só leitura, fora do serving) ou uma das alternativas do README de postgres       |
| G4  | C2     | No PostgreSQL 16, o administrador sem `SUPERUSER` recebe `ADMIN` em cada papel que cria; a API recusa papel de sessão concedido a alguém                                                           | Revogar após `roles.sql` (Q2 vazia); se o provedor impedir, bloqueia C2                                    |
| G5  | C3     | `CREATE SCHEMA IF NOT EXISTS` checa `CREATE` no banco antes de ver que o schema existe, então o dono de auth precisa da permissão em toda execução do `migrate`                                    | Janela `GRANT/REVOKE` em volta de cada `up -d` (README do deploy, C3)                                      |
| G6  | C9     | A API não expõe versão/digest; a certificação local usou tag (`fulltest-31dc1c3`); para C9 a imagem precisa ser publicada num registro e o digest registrado pelo CI                               | Publicação da imagem com digest no CI (decisão de registro do usuário)                                     |
| G7  | C4     | `WEBHOOK_SIGNING_SECRET` aceita um só segredo; a rotação é corte coordenado com o emissor do webhook                                                                                               | Aceitar o corte ou SPEC de lista de segredos (o verificador já aceita lista)                               |
| G8  | C1, C5 | `API_TRUSTED_PROXY_ADDRESSES` só aceita IPs literais (máximo 32, sem CIDR); restringe Kubernetes/PaaS                                                                                              | Coberto pelo padrão VM; reavaliar se o destino mudar                                                       |
