# Security boundary do futuro Harness

## Trust boundaries

| Entrada              | Controle atual                                     | Gap de extração                                      |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| user/channel payload | webhook verifier, schema/size, tenant resolver     | manter body fora de identity/authority               |
| LLM output           | structured output no gateway; output policy legado | kernel depende do executor para schema específico    |
| tool args/results    | plugin boundary bounded/Zod                        | runtime raw executor usa `unknown`; unificar         |
| external responses   | provider URL/redirect/size guards                  | remote plugin/MCP boundary ausente                   |
| RAG docs             | tenant/status/version approval                     | sem signed provenance, scoring ou poisoning analysis |
| operator actions     | trusted identity/RBAC/audit                        | IdP e distributed replay ausentes                    |
| PostgreSQL           | tenant context + FORCE RLS + preflight             | preservar ownership/grants no cutover                |

Controles fortes: `tenant-scoped-postgres.ts:69-120`; migrations `0013`/`0015` FORCE RLS; `apps/worker/src/postgres-role-preflight.ts:71-240`; `apps/api/src/http-security.ts:97-203`; `packages/platform/src/tool-invocation-boundary.ts:128-206`.

Riscos: prompt/tool/RAG injection não têm modelo único; approval bypass é evitado no caminho composto, mas callers diretos precisam de autorização externa; custom identity token/replay são locais; generic URL/file tools não existem, logo SSRF/filesystem são `UNKNOWN`, não PASS; secrets manager externo não foi provado.

Score: **7/10** no recorte controlado, sem inferência de produção. A extração deve manter default-deny, tenant obrigatório, immutable proposal, approval separation, effect journal, bounded schemas e audit obrigatório.
