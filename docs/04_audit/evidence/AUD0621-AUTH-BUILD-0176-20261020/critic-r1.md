# Crítico R1 — AUD0621-AUTH-BUILD-0176 (fresh context, não-fork, só leitura)

Alvo: working tree da candidata `/mnt/dados/cvg-work/cvg-aud0621-auth0176-20261020`
sobre a base `6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9`, antes do commit.

Veredito: **CHANGES_REQUESTED** (sem blocker; should-fix S1–S3).

Sem bypass encontrado: Operator/Approver sem atribuição não obtém conteúdo de
caso; Supervisor/Admin não leem outro tenant; os seis readers fazem principal →
linhagem → grant → conteúdo numa unidade READ ONLY REPEATABLE READ (memória
serializada); 404 estático igual para ausente/outro tenant/sem grant; DTOs por
allowlist; respostas de mutação caem no ack; CAS+auditoria atômicos; link de
execução atômico no PostgreSQL; links de auditoria derivados da sessão
persistida; RLS FORCE e triggers de linhagem; tabela de apresentação conforme §7.

## should-fix e tratamento no reparo agrupado

| Item | Achado | Tratamento |
| --- | --- | --- |
| S1 | Completion do worker passou a depender da 0029 sem cobertura no preflight do worker | `linkAuditEventToCoreSessionWhenAvailable`: sem tabelas/privilégios 0029 o evento fica sem vínculo (só leitor full, §5) em vez de abortar a transação; preflight do worker é de `apps/worker` (fora do escopo) e fica como pendência registrada |
| S2 | Caminho trusted do Operator sem teste; teste F01 trusted passava por 503 | Novo teste trusted Operator (grant/revoke/desativação) na matriz; F01 trusted agora exige exatamente `[503,503,503]` |
| S3 | Atualidade do principal só nos readers SPEC0176, não nos readers `audit:view_full` | Exceção de escopo registrada: o leitor full de auditoria não é reader de caso da SPEC; atualidade ali fica para o dono identidade (UP91-025) |

## nits

N1 detecção de pool (modo explícito `pool` na composição) — corrigido; N2
erros crus do hook de submissão/appendLinkedAudit viravam 500 — corrigido
(`guard` no hook, `toSafeCaseError` em inbound/takeover); N3 preflight sem
`tgtype`, corpo de função e `search_path` fixo — corrigido (hash de `prosrc`,
`tgtype`, `search_path=<schema>, pg_temp`); N4 5s sobrepondo prazo menor —
corrigido; N5 trusted aceitando principal `synthetic_fixture` fora de
`NODE_ENV=test` — corrigido; N8 cache de `false` em erro do probe legado —
corrigido. Resíduos registrados: N6 backfill sem executor, N7 oráculo de
existência na submissão (IDs aleatórios), N9 submissão em memória não atômica
(modo sintético), N10 resposta retida em NEEDS_USER_INPUT/APPROVAL_REQUIRED/
COMPLETED com ferramenta até existir `presentationResponse` na origem. Fora da
lista de readers: GET `/v1/tasks` e GET `/v1/approvals` seguem tenant-wide para
Operator/Approver.
