# Emenda T3 — bootstrap de sessões no artefato do harness

Task: `GREEN-PRODUCTION-BOOTSTRAP-01`. Estado: `SPEC_REVIEW_PENDING / BUILD_NOT_AUTHORIZED`. Data: 04/10/2026. Somente candidato isolado e dados sintéticos. Esta emenda complementa a extração e qualificação do Operational Harness; não altera o domínio do consumidor.

## Discovery e reprodução

A imagem do harness construída em contexto limpo, sem `products/`, `node_modules/` ou builds anteriores, é `sha256:0a83c19a3f6dc2c7e66b575014033b1d8bdecf9b49ac4b8438975de3c501d4d6`. Seus exports públicos compilados e smoke de desenvolvimento passaram. O teste em `NODE_ENV=production` usa PostgreSQL 16 descartável sem rede externa, 27 migrações, roles runtime/migration distintas sem superuser/BYPASSRLS, RLS, inbound durável, identidade HMAC e proxy loopback sintéticos.

O bootstrap compilado `apps/api/dist/main.js` fornece `operatorIdentityResolver`, mas não fornece `operatorSessionStore`. A composição trusted exige esse store. `/live` e `/ready` respondem 200 com transporte reconhecido como seguro; `/v1/admin/agents` responde 503, inclusive antes de avaliar identidade. O código em `createSessionAwareOperatorIdentityResolver` retorna `configuration_error` nesse estado. É falha concreta de composição, não aprovação por readiness.

Evidência preservada: `/home/ricardo/.cache/cvg-harness-green-20261004/gates/harness-production-postgres-image-r2.json` e `.log`; input completo MATCH, exit 1, assert 503 versus 401. R1 também permanece: o probe tentou HTTP sem o header do proxy e foi corretamente recusado com 426; a preparação R2 corrigiu somente a fixture de transporte. Nenhuma fonte de runtime foi alterada por esses probes.

## PRD e contrato proposto

O entrypoint oficial deve compor a mesma autoridade durável de sessões que as rotas já exigem. Configuração ausente ou inválida deve recusar o startup antes de servir. Um store indisponível depois do startup deve recusar requests protegidos e tornar a readiness indisponível; liveness permanece observação do processo. Não há fallback para memória em produção, headers autoafirmados, exclusão de replay ou bypass de RBAC/tenant.

Configuração proposta: `CVG_OPERATOR_SESSION_DATABASE_URL`, `CVG_OPERATOR_AUTH_SCHEMA` e `CVG_OPERATOR_SESSION_ROLE`. A URL corresponde a uma role dedicada de sessões, não à role de dados, migration ou owner. O schema auth deve ser privado, diferente do schema de dados. O preflight existente `assertPostgresOperatorSessionBoundary` deve verificar ownership, privilégios, funções canônicas e roles antes de construir o store. Templates e funções SQL existentes permanecem intactos. Migrações de auth são executadas por job separado na preparação sintética, nunca pela role serving.

O bootstrap reutiliza `createPostgresOperatorSessionPool`, `PostgresOperatorSessionStore` e o preflight existente. Fechamento idempotente encerra o pool em falha de startup, shutdown normal e sinal. A verificação de readiness usa consulta limitada sem criar sessão, alterar tabela ou conceder privilégio, com timeout; erros são sanitizados e não incluem connection string, segredo ou token. A identidade assinada existente continua a autoridade de autenticação; OIDC real não é qualificado por esta rodada.

## Escopo de BUILD local proposto

- Cópia privada: `apps/api/src/main.ts`, novo `apps/api/src/production-bootstrap.ts`, novos testes de bootstrap/readiness/shutdown e probes externos próprios.
- Exemplos e runbook próprios para configurar os três valores de auth e preparar as roles/migrações sintéticas separadamente; exemplos não contêm credenciais reais.
- Reusar fontes auth/persistence existentes como readonly. Não modificar `server.ts`, session hooks, funções SQL, migrations, keyrings, política de RBAC, contratos de tokens/cookies ou arquivos de outros agentes. Se a implementação exigir esse delta, preparar outra SPEC antes.
- Claim próprio antes de BUILD; todo trabalho inicialmente na cópia isolada. Promoção de Root somente por caminhos próprios, sem conflito de owner e após os gates condicionais anteriores. Nenhum push.

## Aceites obrigatórios

1. Reproduzir a falha do entrypoint oficial com o probe conservado antes do fix; preservar raw logs e source hashes.
2. Entrypoint oficial em produção com schema/role auth separados: live/ready200; request unsigned401; signed válido200; replay401; tenant divergente403; origin não aprovada403; HTTP reconhecido inseguro426.
3. Sessão durável criada pela rota existente persiste após restart; logout/revogação/replay/expiração e cookies atuais mantêm comportamento. Não substituir por store de memória.
4. Ausência de qualquer configuração obrigatória, role excessiva, schema compartilhado, grants/funções alterados ou DB indisponível recusam startup. Falha do auth store em execução impede requests e readiness, com recuperação testada e sem fallback.
5. Pools e sockets não vazam em startup parcial, aborto e shutdown; queries/espera limitadas. Falhas de saúde não escondem dados de autenticação.
6. Typecheck/lint/formato, regressões antigas de autenticação e PostgreSQL, suíte completa com cobertura, PostgreSQL dedicado, E2E nos três navegadores, variante física sem produto, imagem limpa e nova revisão independente passam sobre os bytes finais. Nenhuma asserção antiga, threshold ou gate é reduzido.

## Autoridade e limites

Esta é alteração de composição/autenticação e segurança T3. `docs/07_agents/AGENTS.md`, D-12, exige “T2 + revisão explícita da SPEC pelo usuário antes do BUILD”. A autorização genérica de correção contínua mantém o trabalho independente em andamento; esta revisão concreta precede o novo BUILD de segurança.

Autorizar esta emenda permite somente BUILD local sintético e revisão nova. Não concede CLINICAL/D2, dados reais, provider externo, IdP real, host firewall, piloto, implantação, release, push ou produção. OpenAI exclusivamente sintético continua sujeito ao pacote T4 congelado anteriormente exigido. A emenda de segurança de SHA `9cc15c17d4c86dd165f4a2ba876046343f16146a557192f07558edead9470477` mantém sua revisão separada pendente. Aprovação técnica ou de produção não é inferida por este documento.
