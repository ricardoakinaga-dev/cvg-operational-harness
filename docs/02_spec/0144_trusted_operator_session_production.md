# SPEC-PR301/302-001 — sessão confiável no caminho publicado

- Trilha: **T3** (identidade, autorização, persistência e possível migration).
- Estado: `APPROVED_FOR_T3_BUILD` pelo usuário em 27/09/2026, junto com D-09 (IdP corporativo OIDC com MFA obrigatório). A integração real ainda exige issuer, client, claims de MFA e mapeamento de grupos informados pelo usuário; produção e release seguem sem autorização.
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

A web deve usar o contrato atual da API: quando houver token novo, trocá-lo por sessão; quando não houver, chamar `getSession(null)` com cookie. Resposta 401 mostra autenticação necessária; 503 mostra indisponibilidade sem descartar um cookie potencialmente válido. A futura entrada OIDC + PKCE de PR-301/302 substitui a origem do bootstrap e preserva esse contrato de sessão. PostgreSQL foi aceito na revisão T3; o desenho de lookup/role ainda exige revisão de segurança antes da migration.

## Critérios de pronto e prova

- Teste de processo do entrypoint real com `NODE_ENV=production`, PostgreSQL descartável, configuração segura sintética e sem store injetado: startup só passa quando o store durável é composto; `/v1/session` deixa de responder 503 por ausência de store.
- Testes de adapter em duas instâncias e restart: criar, ler, expirar e revogar sessão; logout concorrente; indisponibilidade do banco; tenant ou papel divergente; cookie forjado ou duplicado; sessão de outro tenant negada.
- E2E em modo `trusted`, sem headers de simulação: login/primeiro bootstrap, recarga só com cookie, expiração, logout, troca de tenant, falha do store e acessibilidade das mensagens. A comparação inclui o comportamento atual como caso negativo.
- D-09, plano de migration/rollback, privacidade/retenção e revisão de segurança explícitos antes do BUILD. Depois da implementação: `typecheck`, `lint`, `npm test`, `test:postgres`, E2E e certificação no mesmo candidato, Node 22, zero skips relevantes. Verify e Security remotos devem corresponder ao mesmo SHA.

## Revisão de segurança local I1 — 27/09/2026

A inspeção independente da fronteira PostgreSQL recomendou schema de autenticação separado, cookie opaco aleatório de 256 bits com somente o digest no banco e funções `SECURITY DEFINER` para criar, consultar e revogar. O lookup ocorre antes de haver tenant autenticado; a policy comum de tenant não serve para esta tabela. O papel de runtime deve ter apenas `USAGE` no schema e `EXECUTE` nas funções, sem DML direto; startup deve verificar owner, grants, RLS, `FORCE ROW LEVEL SECURITY`, policies e `search_path`. PostgreSQL orienta fixar o `search_path` de funções com privilégio elevado e revogar o `EXECUTE` público na transação de criação ([CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html), [RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)).

**Pendência de desenho antes da migration:** definir provisionamento do owner/schema de autenticação com a role de migração sem `CREATEROLE`, grants para a role de runtime e preflight verificável. A troca de sessão atual cria a nova antes de revogar a anterior; o store precisa oferecer substituição atômica. O logout atual limpa o cookie antes de confirmar a revogação; a rota deve emitir a limpeza só depois do commit. Falhas em qualquer etapa retornam 503 e preservam o cookie anterior. Não usar store em memória como fallback em produção.

Para o IdP, a direção é Authorization Code + PKCE conduzido pela API, com `state` e `nonce` de uso único, validação de JWT/JWKS, MFA e mapeamento explícito de grupo para tenant/papel. O cookie temporário do retorno do IdP precisa ser compatível com o callback entre sites; o cookie da sessão operacional permanece `SameSite=Strict`. O token HMAC existente não será interpretado como JWT OIDC. Issuer, client, redirects, claims de MFA/grupos e política de logout federado ainda precisam ser informados. A revisão I1 foi estática e **não aprovou migration nem integração real**.

## Crítica da fatia de recarga I2 — 27/09/2026

A crítica independente rejeitou a mudança isolada em `apps/web/src/auth/session.ts`: o `App.tsx` atual mostra 503 de indisponibilidade como autenticação necessária e pode apresentar a primeira visita com 401 como sessão expirada, pois `apiClient` chama `onUnauthorized` antes do tratamento da carga. A mudança web e seu teste foram retirados da fatia; os bytes voltaram ao contrato anterior. PR-302 precisa alterar `App.tsx` e revisar o callback do cliente junto com a recarga, com teste de interface para 401 inicial, 503 com cookie e recuperação. Esses caminhos pertencem ao claim ativo PR-L04. O ajuste independente do hook da API para preservar cookie em falha do store permanece nesta fatia.

Esta SPEC não é autorização de IdP, dado real, produção ou release. Provider e canal externos continuam fora deste escopo.
