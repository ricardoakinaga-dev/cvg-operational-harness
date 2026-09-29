# F03 / SPEC 0163 — crítica independente I6

**Entrada:** commit `c1d5fa8db57521f4d405d918937abf1183864d68`, SPEC SHA-256 `1b8aac528dddc20271b30185b664e1bbf6942fd7bf851e3049430101cf79c053`, igual antes e depois da leitura. Revisão somente documental/de fonte; sem testes, edição ou BUILD.

**Veredito:** `REVISE` — 0 P0, 1 P1, 1 P2. Os quatro achados I5 foram resolvidos no nível da SPEC.

| Severidade | Achado | Exigência para I7 |
| --- | --- | --- |
| P1 | `OpenTelemetryTelemetry.spans()/metrics()/logs()` devolvem arrays do fallback injetável. A SPEC só define `[]` se a leitura lançar; o retorno bem-sucedido ainda pode conter marcador ou referências mutáveis. | Validar e clonar cada DTO retornado antes de expor as três leituras; negativo direto com marcador e mutação. |
| P2 | `ControlledRequestMetrics.record()` aceita `path` livre e mantém a chave no buffer de rotas; `server.ts` expõe seu snapshot. A linha de métricas API da SPEC cobre `Telemetry`, mas não esse buffer. | Definir admissão por template de rota fechado e teste negativo do buffer/saída, incluindo path com marcador. |

**Fonte:** `packages/observability/src/otel.ts:81`, `apps/api/src/request-metrics.ts:101`, `apps/api/src/server.ts:741`, SPEC 0163 §§2.2, 2.4. Nenhuma aprovação T3 resulta deste parecer.
