# AUD-0584 — revisão da prova funcional

- Crítico: Kuhn, leitura somente, 28/09/2026.
- Veredito: `LOCAL_RBAC_POLICY_MATCH` no SHA isolado `7ef74e7`, sem P0/P1
  local; produção `NO_GO`.
- Recalculou os quatro hashes de prova e três hashes de fonte declarados
  em [summary.json](summary.json), confirmou HEAD/worktree limpo e leu
  handlers/matriz. Não reexecutou as sondas.

A [sonda funcional](capability-positive.json) fecha o P2 local do I1:
`Supervisor` emitiu approval, `Operator` leu e executou uma vez (200,
ferramenta `succeeded`, estado `consumed`), replay retornou 400, `Admin`
em `execute` e `Operator` em `revoke` retornaram 403, e o tenant B não
obteve o objeto (400). Isso é coerente com a matriz de permissões e as
checagens anteriores ao lookup/execute.

Correção de precisão aplicada ao resumo: as sessões foram **pré-criadas
diretamente no store em memória** num servidor configurado para OIDC local;
o callback foi desabilitado. A prova não exercita autenticação no IdP,
MFA nem mapeamento de grupo para papel/tenant. Essa lacuna impede qualquer
alegação de prontidão corporativa ou de produção.
