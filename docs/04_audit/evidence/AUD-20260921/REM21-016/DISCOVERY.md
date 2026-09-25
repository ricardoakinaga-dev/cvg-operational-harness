# REM21-016 — Discovery

## Escopo e autorização

Esta task trata `A21-F13`/`A21-F18` (`AUD20-016`) em escopo local,
sintético e descartável sob `G21-1`. O build pode usar somente o daemon Docker
local e o conteúdo do candidate; não há deploy, registry push, provider,
canal, credencial, usuário ou dado real. Produção permanece `NO_GO`.

## Baseline observado

O `Dockerfile` atual já usa multi-stage e usuário `cvg`, mas o target runtime
copiava `apps`/`packages` em fonte, instalava runtime dependencies e iniciava
`npx tsx apps/api/src/main.ts`. O image gate verificava apenas `node --version`
e `Config.User`; não havia artefato de imagem com `runId`/`candidateId`,
smoke de `/live`/`/ready`, digest negativo ou prova de ausência de dev deps.

O build TypeScript do API também falhava no baseline quando a emissão era
tentada por project references: os projetos herdavam `allowImportingTsExtensions`
sem `rewriteRelativeImportExtensions`. Assim, não havia cadeia reproduzível
de artefatos compilados para a imagem.

## Decisão de discovery

Avançar com um grafo runtime compilado (`dist`) para API e dependências
internas, manifests de workspace apontando para `dist`, contexto runtime
mínimo gerado no build stage, `npm ci --omit=dev`, entrypoint direto com
`node`, smoke controlado em memória e relatório candidate/run-bound. O digest
do image id será produzido depois do build local; nenhum digest será inventado
no código ou na documentação.

## RED planejado

`tests/runtime-image-contract.test.js` deve falhar enquanto o contrato de
runtime image/manifest não existir: exige `build:runtime`, entrypoint compilado,
ausência de `npx tsx`, relatório `rem21-016-v1` e rejeição de candidate/run
divergente.
