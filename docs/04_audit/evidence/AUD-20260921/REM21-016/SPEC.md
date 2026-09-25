# REM21-016 — SPEC

## Grafo de build

`tsconfig.runtime.json` referencia somente o grafo necessário para o API:
contracts, orchestrator, harness, shared, rag, platform, approval-engine,
channel-gateway, policy-engine, model-gateway, observability, agent-runtime,
policy, persistence, agent-core e `apps/api`. O `tsconfig.base.json` habilita
`rewriteRelativeImportExtensions` para emissão NodeNext.

`scripts/build-runtime.mjs` cria configs de projeto temporárias, sem os
`paths` de desenvolvimento, executa `tsc -b --force` no grafo topológico e
cria um contexto temporário com `package.json`, lockfile, manifests dos
workspaces, `dist` dos pacotes compilados, migrations da persistence e o smoke
script. O contexto não carrega fontes, testes, coverage, docs ou dev
dependencies. O fixture sintético usado por `loop-evals` foi movido de
`src/__tests__` para `src/evals`, mantendo o runtime sem diretório de testes.

## Contrato da imagem

`scripts/runtime-image-contract.mjs` valida:

```json
{
  "schemaVersion": 1,
  "kind": "cvg-runtime-image",
  "contract": "rem21-016-v1",
  "runId": "run-...",
  "candidateId": "sha256 hex",
  "imageId": "sha256:...",
  "configUser": "cvg",
  "cmd": ["node", "apps/api/dist/main.js"],
  "smoke": { "status": "PASS", "live": 200, "ready": 200 }
}
```

O validator rejeita schema/contract incorretos, image id ausente, base sem
digest, usuário ou entrypoint divergentes, smoke não-PASS e qualquer
`runId`/`candidateId` divergente do estado corrente. O teste negativo muta
cada binding.

## Image gate

`ci-bar.mjs gate image` deve: construir `--target runtime`; gerar o report a
partir de `docker image inspect`; conferir usuário/entrypoint; executar o smoke
com `--read-only --tmpfs /tmp --cap-drop=ALL --security-opt
no-new-privileges`; e snapshotar `certification/runtime-image.json`. O report é
um artefato excluído do candidate, mas é obrigatório no run manifest e no
`ci-bar finalize`.

## Limitações

Image id local não é um digest de registry nem prova de assinatura/SLSA; base
pinada e SBOM/licenças são evidência controlada local. A validação de
registry, provenance externa, deployment e rollback fica fora de `G21-1` e
continua deferred para a certificação/freeze aplicáveis.
