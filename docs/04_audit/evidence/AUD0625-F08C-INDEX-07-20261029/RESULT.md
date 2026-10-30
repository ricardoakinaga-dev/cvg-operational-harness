# AUD0625 F08c — índice (tenant_id, updated_at) em `operational_executions`: decisão "não fazer"

Task `AUD0625-F08C-INDEX-07-20261029` (Claude Sonnet, sessão 07). Branch
`claude/aud0625-f08c-07` sobre `claude/aud0625-wave3` `4cd0ff8c7`; sem push.
Origem: EXPLAIN da SPEC 0272 (`AUD0625-F08-DECISION-RECOVERY-07-20261028`).

## Método
PostgreSQL 16.15 em contêiner próprio (`claude-07-f08c-pg`, 127.0.0.1:56002,
removido ao fim), migrações reais (`runPostgresMigrations`), linhas sintéticas
clonadas de uma decisão real "caída", `VACUUM ANALYZE`, três execuções
`EXPLAIN (ANALYZE, BUFFERS)` por consulta (vale a última), com e sem o índice
candidato `CREATE INDEX ... (tenant_id, updated_at)`. Consultas do worker:
seletor (`STUCK_APPROVAL_DECISIONS_SQL`, janela 30 s–24 h e sem teto) e as duas
contagens (`INCOMPLETE_ENVELOPE`, `INCOHERENT_TERMINAL`). Carga da máquina
~7–12; o tempo absoluto é indicativo, os **buffers** e o formato do plano são o
dado. Fonte: `measure-f08c.test.ts.txt`; brutos: `explain-raw*.txt`; tabelas:
`summary.txt`, `summary-2.txt`.

## Resultado (seletor, limit 25, janela 24 h)
| cenário | sem índice | com índice |
|---|---|---|
| A 10k, tudo na janela, 50% sem evento | 10,2 ms, Seq Scan | 0,5 ms |
| B 10k, 1% na janela | 3,4 ms (usa `idx_..._tenant_state`) | 0,8 ms |
| C 100k, tudo na janela, 50% sem evento | 57 ms, Seq Scan | 0,4 ms |
| D 100k, 1% na janela | 13,7 ms (`tenant_state`) | 0,4 ms |
| G 100k, 1% na janela, 50% sem evento | 13,1 ms | 4,7 ms |
| E 10k, tudo na janela, **0,1% sem evento** | 69 ms, Seq Scan | 78 ms |
| F 100k, tudo na janela, **0,1% sem evento** | 240 ms | 189 ms |
| H 100k, tudo na janela, **todas decididas** | 812 ms (800 mil buffers) | 791 ms (829 mil) |

Sem teto (backfill): C 55→0,3 ms, D 152→0,6 ms, G 54→3,8 ms.

## Leitura
1. O índice **ajuda de verdade** quando há muitas linhas não decididas na janela
   (o `LIMIT 25` corta cedo na ordem de `updated_at`) e no backfill sem teto com
   histórico antigo grande. Sem ele o planejador faz Seq Scan + sort, ou usa
   `idx_operational_executions_tenant_state` (que já cobre `updated_at`, mas com
   `state` no meio e portanto sem servir a ordenação).
2. No **regime estacionário** (quase tudo já decidido, o normal), o custo é o
   anti-join por linha (≈8 buffers/linha: aprovação + `NOT EXISTS` em
   `audit_events`), e o seletor precisa percorrer toda a janela para achar 25
   pendentes ou concluir que não há. Aí o índice não muda nada (E 69→78 ms,
   H 812→791 ms). O gargalo é a forma da consulta, não o acesso a
   `operational_executions`.
3. Custo do índice: ~6–8 MB por 100k linhas, build 0,1–1,5 s, e **uma escrita
   extra de índice em cada transição de execução** (`updated_at` muda em toda
   transição; já existe um índice com `updated_at`, então não se perde HOT, mas
   se soma uma escrita).
4. Magnitudes: o pior caso medido (H, 100k execuções nas últimas 24 h) é <1 s
   por tick e o índice não o resolve; os ganhos reais (57→0,4 ms, 152→0,6 ms)
   estão em cenários transitórios (backlog de recuperação, backfill) em que o
   tick já é lento por natureza e raro.

## Decisão: NÃO FAZER agora (F08c fechado)
O ganho é condicional e pequeno em termos absolutos, o caso estacionário não
melhora e o índice taxa toda transição de execução. Não se escreve a SPEC 0284 nem a
migration 0032. Reabrir se uma medição em produção (tenant real, volume de
`operational_executions` na janela > ~50 mil) mostrar o seletor acima de
~100 ms no regime estacionário; **nesse caso o índice não é a alavanca**: o
caminho seria cortar o anti-join (por exemplo, marcar a decisão recuperada em
coluna própria/`approval_decision` por approval e filtrar antes da junção, ou
um watermark por tick), o que exige SPEC própria.

## Limites
Dados sintéticos homogêneos; um único tenant; sem concorrência de escrita
durante a medição; cache quente (três execuções). Nada foi alterado em código,
migration ou catálogo; sem PG fora do contêiner próprio.
