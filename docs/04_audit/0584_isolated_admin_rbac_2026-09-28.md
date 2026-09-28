# AUD-0584 — permissões de rotas `/v1/admin` no candidato isolado

- Data: 28/09/2026.
- Escopo: SHA limpo `7ef74e7f4fd2b1141e416b85c7337f119e1333ab`,
  Node 22.23.2, OIDC local confiável em `NODE_ENV=development`, sessões e
  dados sintéticos em memória.
- [Sonda, resultados e hashes](evidence/AUD0584-ADMIN-RBAC-20260928/summary.json).
- Revisões independentes: [I1](evidence/AUD0584-ADMIN-RBAC-20260928/I1-review.md)
  identificou a lacuna de positivo funcional; [I2](evidence/AUD0584-ADMIN-RBAC-20260928/I2-review.md)
  aceitou a prova corrigida e confirmou os hashes, sem P0/P1 local.
- Veredito: `LOCAL_RBAC_POLICY_MATCH / I2_ACCEPT`; produção `NO_GO`.

## Procedimento e resultado

O script construiu o Fastify com sessão OIDC local, conferiu HEAD limpo e
enumerou 111 pares rota/método. Sondou os **48 pares em `/v1/admin/`** com
cookie válido de papel `Operator`, `Origin` permitido, tenant correspondente
e parâmetros/payload sintéticos. Quarenta e cinco retornaram 403. Três
retornaram 400: `GET`/`HEAD` do detalhe de capability approval e `POST`
do execute. O erro `invalid_action` nos casos `GET`/`POST` decorreu da
ausência do approval sintético solicitado, após a checagem de permissão.

A matriz em `packages/shared/src/auth.ts` concede `approval:view` e
`approval:execute` ao papel `Operator`; os handlers desses três métodos
exigem justamente essas permissões. O prefixo `/v1/admin` reúne métodos
com políticas de papel diferentes. A sonda não encontrou sucesso indevido
de `Operator` em método que exige permissão ausente.

Controles: `Operator` obteve 200 em `GET /v1/tasks`; `Admin` obteve 200
em `GET /v1/admin/agents` e `GET /v1/admin/knowledge-sources`. `Admin`
recebeu 403 ao tentar `approval:execute`, que sua role não possui. Headers
de tenant diferente produziram 403 para `Operator` e `Admin`; headers
`x-operator-role: Admin`/`x-operator-id` falsificados não elevaram a sessão
`Operator` e deram 403 em `GET /v1/admin/agents`.

Uma segunda sonda montou um agente e uma ferramenta controlados, emitiu
approval com sessão `Supervisor` (200), leu com sessão `Operator` (200),
negou leitura do objeto a uma sessão de outro tenant (400 sem revelar o
registro), negou `execute` de `Admin` e `revoke` de `Operator` (403),
executou `find_available_slots` com a sessão `Operator` autorizada (200,
ferramenta `succeeded`, status final `consumed`) e recusou replay (400).
Tudo ocorreu em memória com dados fictícios; nenhuma consulta real foi
confirmada, cancelada ou reagendada.

## Limites e próximo gate

Os três 400 da varredura ampla usam approval inexistente; o controle
funcional acima prova o ciclo positivo uma vez, sem validar cada método
admin. As sessões foram criadas diretamente no store local, de modo que
esta prova não valida o vínculo entre IdP, MFA, grupo e papel. É OIDC
local/dev com store em memória. Não qualifica IdP corporativo, PostgreSQL, root sob
PR-L04, IAM/staging, CI remoto nem o SHA final. O contrato público de API
deve documentar a permissão **por operação**, sem inferir papel pelo prefixo
da URL; esta exigência pertence à PR-207. Produção segue `NO_GO`.
