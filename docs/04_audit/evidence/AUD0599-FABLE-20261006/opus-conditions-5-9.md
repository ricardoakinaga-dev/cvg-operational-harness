Fonte histórica: handback Opus, sessão Fable 77c1655f-0f79-4804-b98e-fadd3ba2bf11, SHA 34387c1. Não é validação do checkout atual.

**Levantamento das condições 5 a 9 da barra 0373, no HEAD `34387c1`** (só leitura; nada foi alterado)

Arquivos citados com alteração não commitada hoje: `package.json`, `package-lock.json`, `scripts/workspace-dependency-audit.mjs` (essa mudança não mexe na linha 921), `packages/model-gateway/tsconfig.json`, `packages/persistence/src/operational-approval-adapter.ts` e `deploy/shift-assistant/*` (apagados). A pasta `docs/04_audit/evidence/ENGINE-PROD-HISTORY-REVIEW-20261004/` não está versionada (`??`).

## 5. CI remoto

**(a) Fatos verificados**
- Remoto: `github.com/ricardoakinaga-dev/cvg-operational-harness`.
- `origin/main` = `283ab74`, publicado hoje às 08:25. O HEAD local está 2 commits à frente (`2356a25`, `34387c1`), que não foram publicados.
- O `main` local está parado em `503ded7`. O branch local está 397 commits à frente e 19 atrás do seu upstream.
- Proteção do `main`: a API devolve 404 "Branch not protected".
- Execuções em `283ab74`:
  - **Verify falhou** no passo "Initialize candidate/run bar": `ERR_MODULE_NOT_FOUND: zod`.
    - Causa: `scripts/ci-bar.mjs:17` importa `scripts/lib/certification-rules.mjs:5`, que importa `zod`.
    - Esse passo roda antes de "Gate install" (`.github/workflows/verify.yml:66` vem antes de `:70`), quando ainda não há `node_modules`.
    - É uma regressão do commit `6bc3bfc` (27/09), que não fazia parte do R2 verde.
  - **Security falhou** no job supply-chain: `npm audit --audit-level=high` acusa `source-map-js` 1.2.1 com severidade high (GHSA-68fv-2mgg-jv7q). No lockfile esse pacote é `dev:true` (linha 4812).
  - O job codeql passou, mas há **19 alertas high abertos**.
  - O secret-scan passou só por vacuidade: "0 commits scanned". O agendamento de 05/10 falhou ao varrer o `main` antigo `02f586b`, ainda sem `.gitleaks.toml`, com gitleaks 8.24.3 e 261 achados `generic-api-key`, todos em testes.
- Alertas high em caminhos ativos, todos ainda presentes no HEAD:
  - **#17, alias inválido no auditor**: `scripts/workspace-dependency-audit.mjs:921`, `target.replace('*', captured)`. Não foi corrigido: chave ou alvo com dois `*` e array de alvos vazio continuam passando.
  - **#1/#2/#4/#9, regex custosa** `/\/+$/`: `packages/channel-gateway/src/adapters/chatwoot.ts:84`, `evolution.ts:79`, `packages/model-gateway/src/providers/openai-compatible.ts:84` e `ollama.ts:71`. Não foram corrigidos.
  - **#8, regex de injeção**: `packages/conversation/src/state.ts:1012`, por causa de `\s+` e `\s*` adjacentes a grupos opcionais. Não foi corrigido.
  - **#6/#7, rate limit**: `apps/api/src/server.ts:3180` e `:3278`.
    - Há um hook global de 300 requisições por IP por minuto (`server.ts:547-565`).
    - A revisão `codeql-rate-limit-review.md` (não versionada) concluiu que é falso positivo, com prova em PostgreSQL e dois processos.
    - Os alertas continuam abertos no GitHub.
- Os outros 9 alertas high são cópias históricas em `docs/04_audit/evidence/**`. Não existe arquivo de configuração do CodeQL.
- Revisão de segredos (não versionada): 6.693 achados no histórico e 6.575 no código atual, nenhum segredo real (`ACCEPT_NO_REAL_SECRETS`).

**(b) Lacuna**
- Verify quebrado.
- Uma vulnerabilidade high em dependência de desenvolvimento.
- 8 alertas high ativos, mais 9 históricos sem decisão sobre o que fazer com eles.
- O secret-scan nunca rodou de forma real com `.gitleaks.toml` sobre o snapshot atual.
- Sem proteção do `main`.
- HEAD não publicado.

**(c) Menor mudança que fecha**
1. `scripts/ci-bar.mjs`: importar `certification-rules.mjs` de forma dinâmica só no gate de E2E, ou mover `parsePlaywrightSummary` para um módulo sem `zod`.
2. `package-lock.json`: atualizar `source-map-js` para ≥1.2.2. Exige claim próprio, e o Codex tem alterações não commitadas nesse arquivo.
3. `workspace-dependency-audit.mjs`: rejeitar quantidade de `*` diferente de 1 e arrays vazios, com testes negativos para TS5061, TS5062 e TS5066.
4. As quatro URLs: trocar a regex por um laço com `endsWith('/')`.
5. `state.ts`: normalizar espaços com `.replace(/\s+/g,' ')` e usar espaço literal ou `\s{1,3}`, além de limitar o tamanho da entrada.
6. `.github/codeql/codeql-config.yml` com `paths-ignore: docs/04_audit/evidence/**`, referenciado em `security.yml`.
7. Antes de publicar, rodar localmente gitleaks 8.28.0 com a configuração do repositório sobre o HEAD. Há risco de o allowlist não cobrir os tokens de revisão (73 achados) e os textos de documentação fora de `docs/04_audit/evidence/` e de `__tests__`. Se for o caso, acrescentar entradas revisadas.
8. Verificação: Verify e Security verdes no mesmo SHA, e `code-scanning/alerts?state=open&severity=high` vazio.

**(d) Decisão humana**
- Push.
- Dispensar #6/#7 no GitHub como falso positivo, ou adicionar um limite por rota.
- Aprovar a política de excluir as evidências históricas da varredura.
- Configurar a proteção do `main` com os checks obrigatórios.
- Versionar a revisão ENGINE-PROD.

## 6. Segredos e dependências

**(a) Fatos**
- A 0373 registra `npm audit` com 0 vulnerabilidades. Isso é coerente com `--omit=dev`, porque `source-map-js` é de desenvolvimento.
- O CI, porém, roda `npm audit` sem `--omit=dev` e hoje falha.
- Segredos: as revisões citadas acima, sem segredo real encontrado.

**(b) Lacuna**
- Falta varredura de segredos na imagem.
- A varredura de segredos no CI depende da condição 5.

**(c) Menor mudança que fecha**
- Os itens 2 e 7 da condição 5.
- Rodar gitleaks `dir` sobre o filesystem exportado da imagem.

## 7. Imagem endurecida

**(a) Fatos**
- Estágio final do `Dockerfile`: `node:22.23.2-bookworm-slim@sha256` (linha 18).
- Usa `groupadd`/`useradd` (20-21), `RUN npm ci --omit=dev` (24) e `USER cvg` (25).
- O HEALTHCHECK está em forma shell, `CMD node -e ...` (27-28), e portanto exige `/bin/sh`.
- `CMD ["node","apps/api/dist/main.js"]` (29).
- O contrato `scripts/runtime-image-contract.mjs` exige `configUser === 'cvg'` (45) e cmd igual a `['node','apps/api/dist/main.js']` (6).
- As migrações rodam dentro da API, já compiladas (`server.ts:5347`). Não é preciso `tsx` em runtime.
- `scripts/build-runtime.mjs:27` só compila `apps/api`. **O worker não está na imagem.**

**(b) O que quebra ao trocar para distroless**
- Não há `groupadd`, `useradd` nem `npm`.
- O HEALTHCHECK em forma shell deixa de funcionar.
- O ENTRYPOINT da distroless já é `/nodejs/bin/node`, então o cmd muda.
- O usuário passa a ser `nonroot` (65532), e o contrato falha.
- A versão do Node da distroless não fica fixada em 22.23.2.

**(c) Menor mudança que fecha**
- `Dockerfile`:
  - estágio `prod-deps` sobre bookworm-slim, com `npm ci --omit=dev`;
  - estágio final `gcr.io/distroless/nodejs22-debian12:nonroot@sha256`, com `COPY --chown=65532` do runtime e do `node_modules`;
  - `CMD ["apps/api/dist/main.js"]`;
  - HEALTHCHECK em forma exec `["/nodejs/bin/node","-e",…]` ou num `healthcheck.mjs`.
- Ajustar `runtime-image-contract.mjs` e `tests/runtime-image-contract.test.js`, e conferir a coerência com `scripts/runtime-image-record.mjs:61`.
- Prova: `docker run --read-only --cap-drop ALL --tmpfs /tmp`, mais `docker run --entrypoint sh` falhando, mais smoke de `/live` e `/ready`.
- Para a condição 9: uma imagem ou um entrypoint para o worker.

## 8. Backup testado

**(a) Fatos**
- `scripts/phase10-restore-check.ts` (`npm run test:restore`) é **simulação em memória** (`InMemoryDatabase`, linhas 1-5 e 25-43).
- Existe uma prova real: `scripts/rem21-010-postgres-proof.ts`, com `pg_dump --format=custom` e `pg_restore` via docker (linhas 296-330). Ela compara o digest por tabela, que inclui `audit_events` (linhas 625-628 e 760-767). Último registro em `certification/rem21-010-postgres-proof.json`, de 22/09, num candidato antigo.
- A cadeia de auditoria: `HashChainedAuditLedger` fica em memória (`packages/observability/src/audit-ledger.ts:66`, `verify()`).
- O kernel persiste `ledgerId`, `sequence`, `previousHash` e `eventHash` em `audit_events.payload.kernelAudit` (`apps/worker/src/kernel-composition.ts:436-468`).
- **Não existe verificador da cadeia a partir do banco.** `computeEventHash` não é exportado, e só um teste compara as linhas.

**(b) Lacuna**
- Falta um verificador da cadeia sobre as linhas do PostgreSQL.
- Falta um ensaio no candidato que gere eventos do kernel, faça dump e restore, e verifique a cadeia.

**(c) Menor mudança que fecha**
- Exportar `verifyAuditRecords(records)` de `audit-ledger.ts`.
- Criar `scripts/verify-audit-chain.ts`, que lê `audit_events` por `ledgerId`/`sequence` e recalcula a cadeia.
- Integrar ao `rem21-010-postgres-proof.ts` em duas etapas: a carga gera turnos do kernel; depois do restore, a verificação da cadeia passa, e uma adulteração faz ela falhar.
- Gravar a evidência ligada ao SHA.

## 9. Alerta de parada

**(a) Fatos**
- Os heartbeats existentes são só de lease: `worker_outbox_heartbeats_total` (`apps/worker/src/continuous-worker.ts:327`).
- `workerHealth()` é estático (`apps/worker/src/health.ts:14`).
- `checkHomologHealth` conta apenas os itens `pending` (`health.ts:76`). Não mede a idade do item mais antigo, embora existam as colunas `created_at` e `available_at` (migração `0016`, linhas 45-50).
- A API expõe `/health/metrics` (`server.ts:734`), só com métricas HTTP.
- `evaluateHomologAlerts` (`apps/api/src/homolog-alerts.ts`) e `evaluateOperationalAlerts` são funções puras, sem uso em produção (só em `rem21-011-observability-proof.ts:146`).
- Não há Prometheus, Alertmanager, regra de alerta, webhook nem receptor no repositório.

**(b) Lacuna**
- Falta o heartbeat de "worker vivo".
- Falta a idade do item mais antigo da fila.
- Falta o avaliador periódico.
- Falta o envio para um receptor.

**(c) Menor desenho**
- Migração com a tabela `worker_heartbeats(worker_id, last_beat_at, last_progress_at)`, atualizada a cada tick e a cada `ack`.
- Na API, `GET /health/queue` com `now()-min(available_at)` dos `pending`, por um papel de monitoramento.
- Um `alert-evaluator` (`apps/api` ou `packages/observability`) com regras `worker_stale > N s` e `oldest_pending_age > M s`, fazendo `POST` com HMAC para `ALERT_WEBHOOK_URL`.
- `scripts/alert-stop-proof.ts`:
  1. sobe PostgreSQL descartável, API, worker e um receptor `node:http` local;
  2. enfileira itens e mata o worker;
  3. confirma que o alerta foi recebido;
  4. sem nenhum serviço externo.

**(d) Decisão humana**
- Limiares e destino real do alerta.
