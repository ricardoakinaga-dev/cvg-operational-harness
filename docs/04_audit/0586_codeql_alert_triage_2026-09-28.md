# AUD-0586 — triagem dos alertas CodeQL abertos

- Data: 28/09/2026 UTC.
- Fontes: [inventário por SHA e path](evidence/AUD0586-CODEQL-20260928/alerts.json), [sonda de alias no auditor](evidence/AUD0586-CODEQL-20260928/alias-audit-probe.json), [sonda do TypeScript](evidence/AUD0586-CODEQL-20260928/ts-alias-probe.json), [sonda de regex](evidence/AUD0586-CODEQL-20260928/regex-probe.json) e [sonda de rate limit](evidence/AUD0586-CODEQL-20260928/rate-limit-probe.json).
- Escopo: 15 alertas `high` abertos no `main` remoto `02f586b`; comparação de conteúdo com root local e candidato isolado; inspeção de fonte e testes sintéticos locais. Nenhum dado real, provider, deploy, push ou BUILD de segurança.
- Veredito: `TRIAGED_WITH_OPEN_REMEDIATION / NO_GO`. Alerta aberto e experimento de complexidade não equivalem a exploração demonstrada.
- [Crítica I1](evidence/AUD0586-CODEQL-20260928/I1-review.md) `ACCEPT_TRIAGE` após reexecução em Node 22; [método de reprodução](evidence/AUD0586-CODEQL-20260928/reproduction.md).

## Inventário

Sete alertas (#10–#16) estão em cópias de rollback em `docs/04_audit/evidence/`; seus bytes são iguais entre `main` remoto, root e candidato isolado. Eles são histórico preservado, não entrypoints executados. O tratamento exige disposição formal de segurança ou exclusão de escopo revisada, preservando os hashes históricos. Não editar essas cópias para fazer o contador baixar.

Oito alertas apontam para código ativo: #17 no auditor de dependências, #6–#7 na API e #1, #2, #4, #8, #9 em regex de provider/canal/conversation. Cinco dos oito registros de alerta em caminhos ativos têm conteúdo idêntico ao `main` remoto no root; os outros três mudaram desde o `main`, mas as expressões/rotas anotadas ainda aparecem no root. O mesmo vale no candidato isolado para as expressões/rotas inspecionadas. Um SHA local diferente exige novo CodeQL remoto para saber o conjunto final.

## #17 — alias do auditor de dependências

O [alerta #17](https://github.com/ricardoakinaga-dev/cvg-operational-harness/security/code-scanning/17) marca `target.replace('*', captured)` em `scripts/workspace-dependency-audit.mjs:921`. Isto é substituição de wildcard de alias TypeScript, não sanitização de HTML/SQL. O código aceita `paths` diretamente do JSON sem verificar a cardinalidade de `*`. Em workspace sintético, o auditor retornou `PASS`/exit 0 tanto para um target válido (`apps/beta/src/*`) quanto para target com dois wildcards (`apps/beta/src/*/more/*`), que virou `MISSING_ALIAS_TARGET`. O compilador TypeScript 6.0.3 compilou o primeiro e rejeitou o segundo com `TS5062`.

O desvio confirmado é **validação incompleta de configuração no auditor**. Não foi demonstrado acesso fora do root nem execução de caminho adversarial; a resolução faz checagem `isWithin` e a compilação TypeScript rejeita o target inválido. Corrigir com validação explícita de alias compatível com TypeScript, falha de auditoria para padrão/substituição inválidos e negativo sintético; a disposição do CodeQL deve ser vinculada à revisão T3. Trocar cegamente por `replaceAll` mudaria a semântica de configuração inválida.

## #6–#7 — publish e rollback de agente

Os [alertas #6 e #7](https://github.com/ricardoakinaga-dev/cvg-operational-harness/security/code-scanning) apontam `missing-rate-limiting` nos handlers de publish e rollback do `main` antigo. Nas três árvores inspecionadas, um hook global `onRequest` é registrado antes dessas rotas, cobra até **300 requisições por IP em 60 s** e falha fechado. As rotas exigem `agent:configure`; em composição PostgreSQL há limitador compartilhado. Em `buildServer()` local sintético, 301 POSTs separados por rota produziram 300×503 antes da validação funcional e 1×429 com `retry-after: 60`/`rate_limited`. Isto comprova que o hook limita esses paths no perfil local sem sessão; **não** demonstra custo admissível para operações autenticadas, processo duplo com PostgreSQL nem chamada a preflight/publish/rollback impedida após 429.

A expressão literal “sem rate limit” é contrariada pelo hook e pela sonda, mas o limite específico por operação não está provado. Próximo negativo: esgotar orçamento com sessão válida, observar que 429 antecede o efeito, repetir com dois processos PostgreSQL, testar falha do store e `X-Forwarded-For` não confiável. Revisar se 300/min por IP é apropriado para esses handlers antes de disposição dos alertas.

## #1/#2/#4/#8/#9 — regex

Quatro construtores de URLs de provider/canal executam `.replace(/\/+$/, '')` antes de validar a URL (#1, #2, #4, #9); são alimentados por configuração, e exposição a input por request não foi encontrada na leitura. A função exportada `hasUntrustedInstructionContent` em `packages/conversation/src/state.ts:1012` usa alternativas com `\s+` e `\s*` que podem retroceder em texto sem match (#8); chamadores vistos limitam o texto, mas a função não impõe limite próprio.

Uma sonda **da substituição de URL e da função exportada**, sem serviço, usou strings sintéticas sem match com 2k, 4k, 8k e 16k caracteres. Medianas em Node 22 cresceram de 2,226 ms para 143,288 ms na regex de URL e de 2,673 ms para 170,200 ms na regex de instrução. A progressão é compatível com custo quadrático nessa família de entradas. Não mede exposição ou disponibilidade do runtime. Substituição linear e limite de entrada antes do processamento, com testes negativos e benchmark em orçamento explícito, pertencem a SPEC T3 de segurança.

## Gate seguinte

- Fechar PR-011-CODEQL com SPEC T3 aprovada, correções e negativos nas fontes ativas; não alterar arquivos históricos hash-bound.
- Reexecutar CodeQL e testes no SHA integrado após PR-L04 e publicar somente com autorização do usuário. Registrar disposição de cada alerta ativo/histórico, sem simplesmente desabilitar o check.
- Validar rotas caras, config de provider/canal e texto de conversation no mesmo digest/configuração de staging; cumprir CI/atestação, IAM e as 13 condições do [plano 0354](../03_build/0354_production_executive_plan_2026-09-26.md) antes de GO.
