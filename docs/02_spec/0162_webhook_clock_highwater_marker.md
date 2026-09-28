# SPEC-PR301-WEBHOOK-CLOCK-001 — marcador durável do relógio de replay

- Task: subtask `PR-301-WEBHOOK-CLOCK-GUARD` de `PR-301-WEBHOOK-REPLAY` no [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md).
- Depends on: [SPEC 0160](0160_webhook_replay_window_and_processing_fence.md), especialmente A2, e BUILD sintético da inbox [SPEC 0161](0161_webhook_inbox_schema_delta.md).
- Trilha: **T3**. Estado `SPEC_DRAFT / INDEPENDENT_CRITIQUE_BLOCKED / HUMAN_T3_REVIEW_NOT_REQUESTED / BUILD_NOT_AUTHORIZED`.
- Objetivo proposto: delta aditivo `0028_webhook_clock_guard.sql` para lembrar o maior instante PostgreSQL observado mesmo após rollback de uma reserva, crash ou reinício de API.
- Escopo proposto após revisão e aprovação: apenas PostgreSQL 16 descartável, Node 22, código e testes sintéticos isolados. Sem alterar banco compartilhado, usar dado/segredo/provider real, push, deploy ou produção.

## Contexto e lacuna

A implementação local da SPEC 0160 compara chrony com PostgreSQL, mede idade/erro com relógio monotônico e fecha ingress quando a medição fica velha. Ela também detecta divergência entre amostras durante a vida do processo. O estado `previousSample`, porém, é apenas local à instância. Uma API recém-iniciada não sabe o maior instante que uma instância anterior observou. Se o relógio do banco regredir após reinício, a janela temporal poderia voltar a aceitar uma assinatura antiga.

A SPEC 0161 autorizou somente o inbox HMAC e sua migration 0027. O marcador global de relógio não pertence àquela tabela tenant-scoped; exige um delta separado com autoridade e grants próprios. Até fechar este gate, produção permanece `NO_GO`.

## Contrato proposto

### Estado durável

1. Criar `webhook_clock_guard`, singleton por schema compartilhado do serviço, com `guard_id smallint PRIMARY KEY CHECK (guard_id = 1)` e `highest_seen_at timestamptz NOT NULL`. Não guardar tenant, evento, assinatura ou payload nesta tabela.
2. A migration 0028 cria exatamente a linha `guard_id=1`, inicializada por `clock_timestamp()`. Migration repetida valida o estado existente em vez de baixar ou substituir `highest_seen_at`.
3. A tabela é infraestrutura global do serviço, deliberadamente fora do inventário de tabelas de negócio tenant-scoped. O preflight valida explicitamente sua tabela, linha singleton, owner, trigger e grants. Ela não recebe `BYPASSRLS`, DDL do runtime ou privilégios públicos.
4. Runtime recebe `SELECT` apenas nas colunas `guard_id`/`highest_seen_at` e `UPDATE` somente em `highest_seen_at`; sem `INSERT`, `DELETE`, `TRUNCATE`, ownership, DDL ou alteração do trigger. O owner de migration é distinto do runtime conforme contrato vigente.
5. Trigger `BEFORE UPDATE` rejeita mudança de `guard_id`, redução de `highest_seen_at` e valor maior que o `clock_timestamp()` observado pelo próprio trigger. Sua função é `SECURITY INVOKER`, fixa `search_path` em `pg_catalog` e usa apenas `OLD`/`NEW` e built-ins. Inserção ou exclusão em runtime não é concedida e também deve falhar no teste negativo de role.

### Avanço e decisão

1. Antes de cada reserva HMAC e de cada consulta de receipt committed, a API mantém a medição NTP/PostgreSQL da SPEC 0160 e, em uma operação PostgreSQL curta em autocommit, atualiza `highest_seen_at = clock_timestamp()` sob lock da linha. A operação só retorna sucesso se houver exatamente uma linha e o instante atual for maior ou igual ao valor durável anterior. Valor anterior ausente, regressão detectada ou falha de escrita fecham o ingress.
2. O avanço autocommit deve terminar antes da transação tenant-scoped da reserva/receipt. Assim, rollback/crash da transação inbound não reverte a observação durável do relógio.
3. A mutação/lookup seguinte compara `clock_timestamp()` com `highest_seen_at` dentro da mesma instrução decisória e aplica o orçamento residual e a idade máxima de medição da SPEC 0160. Se a amostra ficar velha entre o health check, avanço do marcador e decisão SQL, a transação falha sem criar reserva/receipt.
4. Atualizações concorrentes de instâncias distintas serializam pela única linha. Nunca usar relógio JavaScript para avançar o high-water, permitir ABA, diminuir estado, apagar a linha ou reconstruí-la em boot.
5. Uma falha posterior não desfaz um avanço já commitado. Isso pode manter ingress fechado até o relógio recuperar o maior instante observado; não há reset operacional automático. Alertar operador com erro sanitizado, sem expor tenant, eventId ou payload.
6. O marcador suplementa a comparação chrony e as amostras monotônicas. Não substitui `clock_timestamp()` como autoridade de validade, tolerância residual, readiness ou o teste de frescor imediatamente antes da decisão.

## Segurança e operação

- Nenhuma função `SECURITY DEFINER` é necessária para o contrato proposto: runtime altera somente uma coluna por grant column-level; trigger mantém monotonicidade e impede adiantamento artificial além do relógio atual. Revisores devem confirmar que o PostgreSQL suporta e aplica os grants/preflight usados pelo repositório.
- `assertTenantIsolationSchema`/preflight deve falhar no boot/readiness se tabela/linha/trigger/grants estiverem ausentes ou semanticamente incorretos, se runtime possuir coluna/DDL adicional, ou se role/runtime for owner, superuser ou `BYPASSRLS`.
- Em regressão detectada, retornar erro transitório fail-closed e alertar; não aceitar assinatura antiga enquanto se aguarda recuperação. Não diminuir marcador para recuperar serving.
- Rollback é forward-only: preservar a tabela e o maior instante. Não promover binário sem uso do guard com webhooks duráveis habilitados; desabilitar ingress durante rollout misto.
- A tabela não usa TTL. O estado é pequeno, não contém PII e precisa sobreviver à rotação/reinício do serviço.

## Verificação exigida após aprovação

1. Migration real idempotente em PostgreSQL 16 descartável; preflight aceita schema correto e rejeita: tabela/linha/trigger ausente, trigger desabilitado ou sem semântica monotônica, grants de insert/delete/DDL, owner/runtime iguais, role privilegiada e grants públicos.
2. Dois clientes/API independentes avançam simultaneamente: valor nunca diminui e ambos só reservam se o mesmo marcador persistido autorizar a decisão.
3. Injetar regressão de modo determinístico apenas no PostgreSQL descartável: fixture privilegiada desabilita temporariamente o trigger naquele schema descartável, grava marcador acima do relógio atual, reabilita/verifica o trigger e então um processo novo deve falhar fechado sem inserir inbox nem receipt. Depois de esperar o relógio alcançar o marcador, serving pode retomar sem reset.
4. Injetar crash após autocommit do guard e antes da reserva; após avanço da reserva e rollback; reiniciar pool/API e confirmar que o marcador não recua. Repetir com amostra externa stale, relógio/DB indisponível e avanço entre medição e mutação.
5. Conferir por SQL o marcador antes/depois, contagem de inbox/message/outbox/audit, HTTP 503/401 esperado, zero efeito externo e nenhum segredo/payload em log. Provar o teste com migrations reais, não apenas relógio injetado.
6. Node 22: typecheck, lint, testes focados, suite completa/PostgreSQL sem skips, cobertura crítica, E2E, formato/links e crítica independente do diff; evidência hash-bound ao commit/tabela e limpeza de container/porta.

## Limites

Esta SPEC cobre somente o marcador durável de relógio e sua decisão fail-closed. Não implementa o reconciliador interno que retoma payloads pending após expirar a assinatura, a política D-06 de retenção/exclusão, idempotência do provider, IdP, canal real, integração root/PR-L04, CI/atestação, staging ou liberação de produção. Esses gates da SPEC 0160 continuam abertos mesmo que 0162 passe.

## Crítica e decisão humana

- Crítica independente do delta: ainda não executada nesta rodada; o limite de threads de agentes foi atingido. A SPEC permanece draft e não está pronta para aprovação humana T3.
- Aprovação humana T3: não solicitada/recebida.
- BUILD: **não autorizado** até crítica independente, revisão explícita desta SPEC e aprovação humana.
