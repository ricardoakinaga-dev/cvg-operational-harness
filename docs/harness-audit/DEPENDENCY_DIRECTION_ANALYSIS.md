# Direção de dependências

## Grafo atual

```mermaid
flowchart TD
  API[apps/api] --> CORE[agent-core]
  API --> PLATFORM[platform]
  API --> PERSIST[persistence]
  WORKER[apps/worker] --> CORE
  WORKER --> RT[agent-runtime]
  WORKER --> PERSIST
  RT --> PE[policy-engine]
  RT --> AP[approval-engine]
  RT --> MG[model-gateway]
  RT --> OBS[observability]
  PERSIST --> PLATFORM
  PERSIST --> RT
  PERSIST --> AP
  PERSIST --> CG[channel-gateway]
  TOOLS[tools] --> PERSIST
  TOOLS --> PLATFORM
  WF[workflows] --> PERSIST
  WF --> PLATFORM
  RAG[rag] --> PLATFORM
```

## Ciclos e inversões

| Achado                                                                      | Severidade  | Evidência/recomendação                                                                                                                             |
| --------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| persistence importa contracts/implementações de runtime, approval e channel | HIGH        | `packages/persistence/src/{effect-journal-postgres,runtime-approval-store,channel-effect-journal-postgres}.ts`; mover ports para contracts neutros |
| manifests omitem deps reais                                                 | HIGH        | `packages/persistence/package.json` e `apps/worker/package.json` versus imports; gate de build isolado                                             |
| policy core depende de catálogo/profile fechado CVG                         | HIGH        | `packages/policy-engine/src/capabilities.ts`, `grants.ts`; injetar registries                                                                      |
| runtime importa `Capability`/`AgentProfileName` de policy package           | MEDIUM/HIGH | trocar por contracts centrais e registry validado                                                                                                  |
| rag/tools/workflows dependem do mega-package platform                       | MEDIUM      | separar IDs/ports de control plane e produto                                                                                                       |
| dois tool systems e dois policy/runtime paths                               | HIGH        | uma capability contract e adapters de compatibilidade                                                                                              |

Há ciclo conceitual `runtime -> approval contract -> persistence adapter -> runtime contract`, ainda que o TypeScript não forme necessariamente ciclo de carregamento. A ownership direction está invertida.

## Grafo alvo

```mermaid
flowchart TD
  PRODUCT[Product host] --> PROFILE[Agent Profile / Skills / Policies]
  PROFILE --> CONTRACTS[Harness Contracts]
  CONTRACTS --> ORCH[Orchestrator]
  ORCH --> RUNTIME[Governed Runtime]
  RUNTIME --> CAPS[Capability Registry]
  CAPS --> PORTS[Ports]
  ADAPTERS[Adapters] --> PORTS
  PORTS --> EXT[External Systems]
  GOV[Policy / Approval] -. transversal .-> RUNTIME
  CTX[Context / Memory / Knowledge] -. transversal .-> ORCH
  OBS[Observability / Audit] -. transversal .-> RUNTIME
```

Regra estrutural: adapters implementam contracts; contracts jamais importam adapters ou produto. Secretary e Corp registram ontologias sem editar core.
