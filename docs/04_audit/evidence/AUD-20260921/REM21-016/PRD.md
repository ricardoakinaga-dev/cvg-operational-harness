# REM21-016 — PRD

## Problema

A imagem verificada não era o mesmo artefato que o código compilado: o runtime
executava TypeScript por `npx tsx`, carregava contexto de desenvolvimento e o
gate não preservava um digest ligado ao candidate. Uma imagem de outro run
poderia ser confundida com a imagem qualificada.

## Resultado desejado

Construir uma imagem runtime reproduzível a partir do candidate, com artefatos
JavaScript compilados, dependências de produção, usuário non-root, smoke de
health/readiness e evidência verificável por `runId`, `candidateId` e image id.

## Requisitos funcionais

1. O build deve compilar a API e o grafo interno necessário, reescrevendo
   imports relativos `.ts` para `.js`.
2. O target runtime não pode usar `npx`, `tsx`, TypeScript, Vitest ou fontes
   `.ts` para iniciar a API; o entrypoint deve ser `node apps/api/dist/main.js`.
3. O runtime deve instalar somente produção com `npm ci --omit=dev` em contexto
   mínimo que contenha manifests, `dist` e migrations necessárias.
4. A imagem deve usar base Node 22 pinada por digest, usuário `cvg`,
   `read-only`/capabilities reduzidas no smoke e healthcheck local.
5. O smoke deve iniciar a API com persistência memory controlada e verificar
   `/live` 200 e `/ready` 200 sem acessar PostgreSQL ou rede externa.
6. `certification/runtime-image.json` deve registrar contrato, tag, image id,
   base/rootfs metadata disponível, entrypoint, usuário, `runId`,
   `candidateId` e smoke PASS.
7. O image gate e seu verifier devem falhar quando o report estiver ausente,
   tiver outro run/candidate, usuário/entrypoint incorretos ou smoke falhar.

## Critérios de aceitação

- RED antes do BUILD para o contrato de imagem e mismatch;
- build local do target runtime sem fonte TypeScript no contexto runtime;
- `npm ci --omit=dev` passa e `node apps/api/dist/main.js` é o único entrypoint;
- smoke `/live`/`/ready` passa em container descartável;
- non-root, healthcheck e modo read-only são inspecionados;
- negative test de digest/candidate/run mismatch falha antes de qualquer claim;
- SBOM/licenças continuam gates independentes e bloqueantes;
- nada disso promove produção, valida provider/canal ou substitui freeze/I1.
