# Matriz de classificação de componentes

| Componente              | Classe primária                      | Justificativa                                                | Extração preliminar                     |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------ | --------------------------------------- |
| apps/api                | H8 MIXED_RESPONSIBILITY              | host, routes, wiring, DB/security e domínio no mesmo arquivo | KEEP; extrair wiring genérico depois    |
| apps/web                | H6 PRODUCT_UI                        | console Secretary                                            | KEEP_IN_SECRETARY                       |
| apps/worker             | H8                                   | worker genérico + composição/policy sintética Secretary      | KEEP host; extrair biblioteca do worker |
| adapters                | H5 EXTERNAL_INTEGRATION              | adapters concretos e contratos de integração                 | ADAPTER_ONLY/MOVE_WITH_REFACTOR         |
| agent-core              | H8                                   | application/domain + bridge runtime legado                   | KEEP e deprecar após paridade           |
| agent-evals             | H8                                   | runner genérico + corpus/agente Secretary                    | dividir runner de dataset               |
| agent-runtime           | H1 GENERIC_HARNESS_CORE              | kernel governado com ports                                   | MOVE_WITH_REFACTOR                      |
| approval-engine         | H1                                   | state machine genérica e bem testada                         | MOVE_AS_IS inicialmente                 |
| channel-gateway         | H5                                   | canais/providers e journal de channel effects                | adapter; separar core de providers      |
| chaos                   | H7 TEST_CERTIFICATION_INFRASTRUCTURE | fault harness                                                | mover após parametrização               |
| memory                  | H2 HARNESS_SUPPORTING_INFRASTRUCTURE | apenas embrião de contrato                                   | REIMPLEMENT_IN_HARNESS                  |
| model-gateway           | H1                                   | gateway provider-agnostic                                    | MOVE_WITH_REFACTOR                      |
| observability           | H2                                   | telemetry/audit supporting                                   | MOVE_WITH_REFACTOR                      |
| persistence             | H8                                   | adapters genéricos + platform + journeys/attendance          | split por ownership                     |
| platform                | H8                                   | control plane/plugin core + Test Lab/preset/output Secretary | split obrigatório                       |
| policy                  | H3 SECRETARY_DOMAIN                  | clinical/autonomy legados                                    | KEEP/DEPRECATE                          |
| policy-engine           | H8                                   | engine genérica + catálogo/grants CVG fechados               | separar mecanismo/ontologia             |
| rag                     | H8                                   | catálogo técnico mínimo + semântica institucional            | extensão; reimplementar contracts       |
| shared                  | H4 CVG_SHARED_DOMAIN                 | fundação CVG, não Harness puro                               | manter; selecionar contracts mínimos    |
| tools                   | H8                                   | registry pequeno + handlers Secretary                        | reimplementar core; manter handlers     |
| workflows               | H3                                   | fluxos Secretary                                             | KEEP como futuros Skills do produto     |
| scripts                 | H7                                   | gates/certificação                                           | mover apenas helpers genéricos          |
| tests                   | H7                                   | testes do produto/repo                                       | manter; copiar consumer contracts       |
| docs                    | H7                                   | governança/evidência                                         | manter e referenciar                    |
| config raiz             | H2                                   | build/test tooling                                           | parametrizar                            |
| infraestrutura dedicada | H9 UNKNOWN                           | ausente                                                      | definir depois                          |
| deploy                  | H2                                   | deployment supporting com nome de produto                    | manter/parametrizar                     |
| certification           | H7                                   | artefatos de qualificação                                    | baseline, não core                      |

## Responsabilidades mistas críticas

- `platform`: control plane/plugins/versionamento coexistem com `secretary-preset`, intent/output policy e Test Lab determinístico.
- `persistence`: ports/repos genéricos coexistem com journeys/attendance e adapters que importam implementações acima da camada.
- `policy-engine`: avaliação é genérica, mas `CapabilitySchema`, catálogo, perfis e grants são ontologia fechada CVG.
- `tools`: registry não conhece domínio, mas o barrel e package dependem de persistence/platform por handlers Secretary.
- `agent-evals`: infraestrutura de cenário/threshold convive com heurística veterinária que não executa o runtime real.

Percentuais não foram atribuídos: não existe métrica defensável de responsabilidade por LOC que represente ownership ou dificuldade.
