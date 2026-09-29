# F03 / SPEC 0163 — crítica independente I8

**Entrada:** commit `70eafa1aa04a657e051c02d58158185424738de9`; SPEC SHA-256 `a44d4aa5df7ba8c9c3077fc0a59a6259ad5dbba1904a4c9abdcc8e632ed9f884`, estável antes/depois. Revisão somente leitura; sem testes, edição ou BUILD.

**Veredito:** `REVISE` — 0 P0, 0 P1, 1 P2. O catálogo I7 conferiu 74/74 rotas explícitas, incluindo 11 delegadas, e a SPEC exige comparação do grafo efetivo com 34 pares `HEAD` automáticos. A asserção BUILD/CI ainda não foi implementada nem executada.

| Severidade | Achado | Exigência para I9 |
| --- | --- | --- |
| P2 | A regra de `recordLocalSpan` exige ID local `L` diferente do span de origem `S` e do pai `P`, mas a admissão do handle confere somente `L != S`. Um gerador determinístico pode devolver `P`. | Exigir `L != P` antes de `end`; negativo com colisão forçada, degradação fixa e nenhum span inválido exposto. |

**Fontes:** SPEC 0163 §§2.6 e prova; `packages/observability/src/telemetry.ts`. Nenhum gate T3 é concedido por este parecer.
