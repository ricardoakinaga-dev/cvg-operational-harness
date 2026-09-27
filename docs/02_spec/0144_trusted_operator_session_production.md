# SPEC-PR301/302-001 — sessão confiável no caminho publicado

- Trilha: **T3** (identidade, autorização, persistência e possível migration).
- Estado: `PROPOSED / WAITING_HUMAN_SPEC_REVIEW`. Nenhum BUILD de identidade ou schema é autorizado por este documento. A decisão D-09 (IdP/MFA) e a revisão explícita da SPEC são pré-requisitos da implementação de produção.
- Tasks: [PR-301 e PR-302](../03_build/0356_production_backlog_2026-09-26.md); achado [AUD-0579-08](../04_audit/0579_current_candidate_deep_audit_2026-09-27.md).

## Recon e comportamento observado

`apps/api/src/main.ts` chama `buildServerFromEnv` sem `operatorSessionStore`. Na composição PostgreSQL de `apps/api/src/server.ts`, `buildServer` recebe `effectiveBuildOptions`, mas nenhum store é criado. O único store automático aparece no ramo `API_PERSISTENCE_MODE=memory`, `NODE_ENV=test`, `identityMode=trusted`. A rota `GET /v1/session` devolve 503 se o store não estiver presente. Isso é uma falha fechada de configuração, não um bypass de autenticação, mas impede a sessão de operador no entrypoint publicado.

A API já aceita retomar uma sessão existente pelo cookie sem novo bootstrap token. `apiClient.getSession` também aceita token `null`. O `createTrustedSessionBootstrap().load()` na web, porém, lança 401 antes da chamada quando não há token. O provider padrão consome o token global de uso único; a recarga posterior pode exibir autenticação necessária apesar de cookie válido. Os testes atuais injetam store manual e o E2E sobe a web em `simulation`, portanto não exercitam o caminho publicado. Esta conclusão de recarga é inspeção de fluxo, ainda sem E2E de produção controlada.

## Invariantes e fronteiras

1. Produção com console confiável não sobe sem store de sessão compartilhado e disponível; falhas do store resultam em erro estável, redigido e observável, sem recorrer a headers de simulação.
2. O cookie é `HttpOnly`, `Secure` em HTTPS e `SameSite=Strict`; a sessão pertence a um operador e tenant autenticados pelo IdP definido em D-09. Nenhum identificador fornecido pelo browser amplia o tenant ou o papel.
3. Uma recarga com cookie válido restaura a mesma identidade sem reutilizar o token de bootstrap. Expiração, revogação, logout e troca de tenant removem o acesso; token de outro operador não reutiliza a sessão anterior.
4. A sessão permanece consistente entre réplicas e reinícios. O store falha fechado se indisponível, com bounded timeout e sinal operacional. Não persistir token de bootstrap em storage do navegador.
5. A tabela, role, RLS/lookup pré-autenticação, retenção, índices, limpeza de expirados e rotação de credenciais precisam de desenho e revisão de segurança antes de migration. O lookup pré-autenticação é uma fronteira explícita, não autorização pelo `sessionId` isolado.

## Opções e proposta para revisão

| Opção                                                                              | Avaliação                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manter apenas store injetado nos testes                                            | Falha no entrypoint publicado; rejeitada.                                                                                                                               |
| Criar store em memória no processo de produção                                     | Recuperação e réplicas não compartilham revogação; rejeitada para a plataforma.                                                                                         |
| Persistir sessão em PostgreSQL com adapter `OperatorSessionStore` e compor no boot | **Proposta**, pois PostgreSQL já é requisito do modo de produção. Exige migration, acesso com privilégio mínimo, isolamento por tenant e prova de restart/concorrência. |

A web deve usar o contrato atual da API: quando houver token novo, trocá-lo por sessão; quando não houver, chamar `getSession(null)` com cookie. Resposta 401 mostra autenticação necessária; 503 mostra indisponibilidade sem descartar um cookie potencialmente válido. A futura entrada OIDC + PKCE de PR-301/302 substitui a origem do bootstrap e preserva esse contrato de sessão após aprovação D-09. A escolha de PostgreSQL e o desenho de lookup/role permanecem **propostos** até revisão humana T3 e revisão de segurança.

## Critérios de pronto e prova

- Teste de processo do entrypoint real com `NODE_ENV=production`, PostgreSQL descartável, configuração segura sintética e sem store injetado: startup só passa quando o store durável é composto; `/v1/session` deixa de responder 503 por ausência de store.
- Testes de adapter em duas instâncias e restart: criar, ler, expirar e revogar sessão; logout concorrente; indisponibilidade do banco; tenant ou papel divergente; cookie forjado ou duplicado; sessão de outro tenant negada.
- E2E em modo `trusted`, sem headers de simulação: login/primeiro bootstrap, recarga só com cookie, expiração, logout, troca de tenant, falha do store e acessibilidade das mensagens. A comparação inclui o comportamento atual como caso negativo.
- D-09, plano de migration/rollback, privacidade/retenção e revisão de segurança explícitos antes do BUILD. Depois da implementação: `typecheck`, `lint`, `npm test`, `test:postgres`, E2E e certificação no mesmo candidato, Node 22, zero skips relevantes. Verify e Security remotos devem corresponder ao mesmo SHA.

Esta SPEC não é autorização de IdP, dado real, produção ou release. Provider e canal externos continuam fora deste escopo.
