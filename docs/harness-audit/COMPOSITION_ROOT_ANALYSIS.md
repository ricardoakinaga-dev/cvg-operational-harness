# Análise dos composition roots

## API

`apps/api/src/server.ts` é um **God File confirmado**: 5.533 linhas e 66 registros de rota. Ele contém imports e contratos (`:1-260`), construção de stores/Fastify (`:267-357`), security hooks (`:359-463`), data/control-plane routes (`:465-3170+`), runtime inbound (`:3253-3518`), checks de schema/RLS/roles (`:4050-4762`), factory de persistence (`:4985-5072`), defaults de capability/knowledge/approval (`:5113-5169`) e env bootstrap (`:5172+`). Arquivos em `routes/` frequentemente fornecem apenas path constants.

O problema não é só tamanho: o host decide implementações, políticas default, runtime inline versus outbox, repos concretos e regras específicas. Isso impede que Secretary dependa de um composition module do Harness sem o Harness herdar o produto.

## Worker

`apps/worker/src/main.ts` escolhe memória/PostgreSQL/continuous; `kernel-composition.ts` monta policy, approval, gateway, telemetry, audit, repos, fake tool e outbox. A montagem é uma boa seam, mas inclui prompt/policy/profile/capabilities sintéticas Secretary (`:53-163`) e não é neutra.

## Extração necessária

1. Definir um `HarnessCompositionInput` de ports/registries neutros.
2. Manter `apps/api` e `apps/worker` como product hosts.
3. Mover routes por bounded context sem mudar comportamento.
4. Secretary fornece profile, skills/workflows, policy catalog, prompts e adapters.
5. Harness nunca importa preset, workflow, UI ou schemas de journey.

Severidade: **HIGH** para readiness de extração; não é recomendação de refatorar nesta fase.
