# Reuso multi-produto

## Veredito

**Score: 4/10. Confiança: HIGH.** Existem primitives genéricos reutilizáveis, mas não existe prova executável de um segundo produto e hoje uma capability não-Secretary exige editar o core. O score é coerente com `HARNESS_SCORECARD.md`, `EXECUTIVE_REPORT.md` e `AUDIT_RESULT.json`; 5/10 exigiria ao menos um consumer não-Secretary compilando contra contracts públicos sem core edit.

## Prova conceitual CVG Corp

```text
CVG Corp
→ CorpAgentProfile
→ CorpSkills
→ CorpCapabilityCatalog + CorpPolicies
→ Harness public contracts
→ runtime/capability ports
→ Corp adapters
```

O teste decisivo de generalidade é registrar uma capability não clínica desconhecida do Secretary sem editar o core. Hoje isso falha: `CapabilitySchema` é enum fechado e profiles/grants vivem em `packages/policy-engine/src/capabilities.ts` e `packages/policy-engine/src/grants.ts`. `packages/platform/src/secretary-preset.ts`, `packages/workflows/src/**` e `packages/tools/src/local/journey-tool-registry.ts` também carregam comportamento de produto. Evidência: **CONFIRMED** por inspeção dos contracts/imports, consolidada em `TOOL_CAPABILITY_ARCHITECTURE.md`, `DEPENDENCY_DIRECTION_ANALYSIS.md` e `COMPONENT_CLASSIFICATION_MATRIX.md`.

## O que pode e não pode ser reutilizado hoje

| Estado                                     | Unidades                                                                                                                | Limite atual                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Reutilizável após boundary cleanup         | approval state machine, model gateway, effect journal/outbox semantics, tenant-scoped persistence e partes de telemetry | composição, contracts e audit durável ainda precisam ser estabilizados |
| Não reutilizável sem split/reimplementação | policy catalog, tool systems, `platform` misto, context, knowledge, memory e composition roots                          | domínio Secretary/CVG, vocabulários fragmentados ou subsystem ausente  |
| Deve permanecer no produto                 | apps, workflows, journeys/tools, preset/Test Lab e corpus institucional                                                 | são host, UX, fixtures ou domínio Secretary                            |

## Consumer-contract gate

Nenhum requisito específico de Corp entra no core. Um consumer sintético precisa provar, sem editar packages do Harness:

1. registrar profile, policy e capability não clínicos;
2. isolar dois tenants no adapter PostgreSQL;
3. obter policy denial e approval resume corretos;
4. executar uma tool Native e uma Plugin pelo mesmo contract;
5. reconstruir audit/trace após restart;
6. compilar e rodar com manifests públicos, sem imports internos;
7. remover o consumer sem alterar comportamento do Secretary.

Exit criterion para elevar a nota acima de 4: todos os sete checks PASS, sem skip, no candidato pinado. Até lá, multi-product reuse permanece **plausível, não demonstrado**.
