# REM21-016 — Decision record

## Decisions

1. Use compiled NodeNext artifacts for the API and its internal runtime graph.
   The former `npx tsx apps/api/src/main.ts` path made the image depend on
   TypeScript sources and production-installed development tooling.
2. Build a temporary runtime context from workspace manifests, compiled
   `dist`, migrations and the synthetic smoke script. Keeping source and test
   trees out of the context makes the runtime boundary inspectable.
3. Generate isolated TypeScript project configs for the runtime build. The
   repository's development path aliases intentionally point at `src`; using
   them for image emission caused cross-project `TS6059/TS6307` failures. The
   isolated configs resolve workspace packages through their `dist` manifests
   and exclude tests.
4. Pin the Node 22 base by digest and record that reference with the image
   metadata. The chosen local Docker target uses
   `node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9`.
5. Bind the image report to both `runId` and `candidateId`; validate the image
   id, user, entrypoint, base digest and smoke result before accepting the
   gate artifact.
6. Run the smoke with memory persistence, synthetic secrets, real-world flags
   disabled, loopback health probes, no network, read-only filesystem and
   dropped capabilities. This is a controlled construction check, not a
   production readiness or provider qualification claim.

## Rejected interpretations

- A successful local Docker build is not production release approval.
- A local image id is not a registry digest or supply-chain attestation.
- The image gate PASS does not close the independent SBOM, license, external
  integration, freeze or human-signoff requirements.
