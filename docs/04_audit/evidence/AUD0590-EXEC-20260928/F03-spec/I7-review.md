# F03 / SPEC 0163 — crítica independente I7

**Entrada:** commit `48075436f52b273d37cd96fad47583bde0290a4e`; SPEC SHA-256 `c3bc921a21e03b39f4041b6b112862af5fce32547b60326965d1788b618021b4`, estável antes/depois. Revisão somente leitura; sem testes, edição ou BUILD.

**Veredito:** `REVISE` — 0 P0, 0 P1, 2 P2. As duas respostas I6 são implementáveis na SPEC, mas restam duas contradições de aceite.

| Severidade | Achado | Exigência para I8 |
| --- | --- | --- |
| P2 | Os 63 pares do catálogo coincidem com os registros diretos `app.get/post/patch` em `server.ts`, mas `registerSecretaryJourneyRoutes` acrescenta 11 rotas. A SPEC não exige teste BUILD/CI que compare o registro efetivo completo com o catálogo. Uma rota nova vira `__unmatched__` silenciosamente. | Inventariar o grafo efetivo de rotas, incluindo registro delegado, e exigir guarda executável que falhe por deriva no candidato integrado. Preservar fallback seguro para entrada desconhecida. |
| P2 | A SPEC pede preservar `spanId` estrutural benigno em `recordLocalSpan` enquanto a implementação proposta passa esse ID como pai a `fallback.startSpan`; `InMemoryTelemetry` gera outro `spanId`. | Definir identidade esperada do span local e caminho implementável; negativo/positivo deve verificar ID do span e `parentSpanId` sem expor marcador. |

**Fontes:** SPEC 0163 §§2.2.1, 2.6 e prova; `apps/api/src/server.ts:1690`; `packages/observability/src/telemetry.ts:219`. Nenhum gate T3 é concedido por este parecer.
