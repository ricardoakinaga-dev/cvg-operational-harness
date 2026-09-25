# REM21-016 — BUILD / AUDIT local

## Scope

The work stayed inside `G21-1`: local Docker daemon, synthetic environment,
memory persistence and disposable image tags only. No registry push, deploy,
provider, channel, IdP, credential, real user or real data was used. Production
remains `NO_GO` and the result is `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`.

## RED before BUILD

Before the implementation, this command failed because the runtime image
contract module did not exist:

```text
npx vitest run tests/runtime-image-contract.test.js --no-file-parallelism --maxWorkers=1
```

The RED was recorded before adding `runtime-image-contract.mjs`, the runtime
compiler/context builder, the smoke, the Docker target and the image gate
artifact binding.

## BUILD result

- `tsconfig.runtime.json` defines the API runtime graph; the build script uses
  isolated project configs so development `paths` and test includes cannot
  leak source into the emitted runtime.
- NodeNext emits JavaScript with relative `.ts` imports rewritten to `.js`.
- Workspace manifests point to `dist`; root `tsx` is dev-only.
- The generated context contains manifests, compiled `dist`, persistence
  migrations and the smoke script only. It contains no `src`, non-declaration
  `.ts`, coverage, docs or `.test.js` artifacts.
- The target runtime uses `npm ci --omit=dev`, user `cvg`, a read-only smoke,
  dropped capabilities, `no-new-privileges` and `--network none`.
- The API starts directly as `node apps/api/dist/main.js`.

## Verification

The final image gate was run on Node `22.23.2`:

```text
runId       = run-rem21-016-image-1
candidateId = b7b7bc7ea0d6c9e107e1fa1100df38ecb2c0439aafe79951acbfe00bbb4b61de
gate        = image PASS
imageId     = sha256:10ae0b8369fdf5504b44b9ab25735f577d01e1d4a8dd568f543faa882691c2fa
base        = node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
user        = cvg
entrypoint  = node apps/api/dist/main.js
rootfs      = 9 layers
smoke       = PASS; /live 200; /ready 200
```

The report and its run snapshot both hash to
`6ec9a9e2884d374403ff74e02b9de920fdb3d11025e88956cf3d25666f4714d7`.
The gate log hash is
`203b2679704b3d68edb1e2ae413b995f8a7931520656831423a8b924a5ff770b`.

Additional local checks passed:

- full unit suite: `2,081 passed`, `146 skipped`, `2,227 total`;
- runtime image contract and CI-bar contract tests: `6/6 passed`;
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run ci:bar:contract` and `git diff --check`;
- runtime context `npm ci --omit=dev --ignore-scripts`: 111 packages added,
  137 audited, zero vulnerabilities;
- local runtime smoke after production-only install: `/live=200`,
  `/ready=200`.

The negative validator cases rejected mismatched run, candidate and image id;
the raw results are in `negative-binding.json`.

## Audit limitation

The image gate was executed and recorded independently; this lane did not run
the complete CI bar or final certification/freeze. A local image id is not a
registry digest, signature or SLSA provenance. External providers/channels,
durable production infrastructure, human signoff and release authorization
remain outside this task.
