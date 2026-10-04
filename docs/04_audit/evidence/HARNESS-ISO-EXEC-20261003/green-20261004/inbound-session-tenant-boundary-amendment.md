# Emenda T3 — autoridade independente de sessões e ingresso

Task: HARNESS_ISO_GREEN_20261004 / INBOUND_SESSION_TENANT. Estado: READY_FOR_HUMAN_T3_REVIEW; nenhum BUILD dependente. Somente cópia isolada, PostgreSQL descartável e dados sintéticos; NO_MODEL, promoção condicionada e T4 separado permanecem. Sem dados reais, provider real, push, piloto ou implantação.

## Dois casos concretos

Bootstrap independente R3, Node22, main.js recompilado e PostgreSQL real: webhook com HMAC válido e sem cookie continua200/enfileirado durante falha exclusiva de auth; o mesmo ingresso com cookie de operador recebe503 do hook de sessão anterior. Cookie não autentica webhook e não deve alterar sua autoridade. Outro caso: body.tenantId ou x-tenant-id divergente recebe200 e é enfileirado no tenant configurado. Não foi observada escrita em outro tenant; é comportamento preexistente do resolver que ignora claims. Evidências preservadas em /home/ricardo/.cache/cvg-harness-green-20261004/bootstrap-review-r3/output/report.json, own-probes-summary.json e http-transcript.jsonl; BS3-01/BS3-02 são dois P2, não seis defeitos.

## Contrato proposto

1. Classificar por método e template resolvido do Fastify. Probes públicas e POST /v1/webhooks/channels/:channel/messages não consultam sessão de operador, mesmo com cookie desconhecido, expirado, revogado ou sintaticamente válido. O webhook mantém obrigatoriamente HMAC, replay, HTTPS/origin, tenant canônico e fila durável. Nenhuma outra rota se torna pública. Operador e sessão mantêm store durável, falha503, isolamento de tenant e readiness503; liveness permanece200. Compartilhar o classificador interno entre hook e bootstrap evita critérios divergentes.
2. Após HMAC e antes de enfileirar, claims de tenant explicitamente presentes em body.tenantId ou x-tenant-id devem ser identificadores válidos e coincidir com o tenant canônico retornado pelo resolver confiável. Divergência/malformação resulta403 sanitizado, sem row/outbox/efeito, e a lease de replay segue a recuperação existente. Ausência desses campos preserva o formato de webhook atual; claim coincidente não concede autoridade. Campos desconhecidos ou metadados clínicos não são usados para resolver tenant. Não admitir tenant escolhido pelo cliente nem resolver por cookie/token do operador.
3. O guard é aplicado à composição de serving existente e à autoridade de tenant confiável, respeitando resolvers explicitamente injetados e tenant configurado. Sem migration, mudança de keyring/grants, dados reais ou nova autoridade de aprovação. Testar tenants distintos, cookies diversos, fault/recuperação/replay, método/template aliases e operador com identidade/cookie válidos e inválidos.

## Paths, evidência e aprovação

Scratch novo: apps/api/src/operator-session-hook.ts, helper interno de classificação, production-bootstrap.ts, server.ts exclusivamente o ponto de validação de claims de ingresso/resolver confiável, novos testes/probes próprios. Originais, SQL, preflight, lockfile e demais trechos de API permanecem protegidos. Root e arquivos em claim alheio não serão editados; integração só após gates e coordenação.

Node22, testes existentes completos de sessão/identidade/ingresso, PostgreSQL real sem skips, processo compilado e fila inspecionada, tipos/lint/formato, nova crítica independente e gates completos integrados. Não apagar casos ou relaxar assertivas. Se o comportamento proposto conflitar com contrato/teste legítimo anterior, preservar a falha e revisar o contrato antes de mudar sua barra. O veredito global continua FAIL/produçãoNO_GO até os gates efetivos, sem inferir aceite das outras frentes.

A emenda bootstrap já aprovada preservava hooks/server somente leitura. Estes dois pontos alteram essa fronteira e a admissibilidade de claims públicos; D-12 em docs/07_agents/AGENTS.md exige revisão humana T3 antes do BUILD. A aprovação solicitada cobre exclusivamente este documento e BUILD local sintético.
