# REM21-003 — Evidence Manifest

- program: `AUD21-COMPREHENSIVE-REMEDIATION`
- task: `REM21-003`
- finding: `A21-F02`
- status: `PASS_LOCAL / FINAL_CERT_DEFERRED`
- scope: `local/synthetic/disposable`
- production: `NO_GO`
- node: `v22.23.2`
- implementation: `apps/api/src/server.ts` and
  `apps/api/src/operator-identity.ts`
- focused tests: `apps/api/src/__tests__/identity-composition-wiring.test.ts`
- independent scout disposition: `INDEPENDENT-SCOUT.md`; not an I1 verdict.

## Checks recorded

- forged valid-format `jti` with invalid signature: `PASS`, store not called;
- issuer ausente/divergente: `PASS`, resolver rejeita antes do claim;
- concurrent legitimate token across two trusted instances: `PASS`, exactly one
  `200` and one `401`;
- replay-store error: `PASS`, request denied `401`;
- trusted identity regression: `PASS`, 38/38 tests;
- focused ESLint: `PASS`;
- Node 22 typecheck: `PASS`;
- `git diff --check`: `PASS`;
- docs links and targeted formatting: recorded in the verification summary.

## Decision and limitations

The distributed claim now happens only after the effective trusted resolver
accepts the same request token, including explicit issuer `cvg-operator`. The
decoder remains a post-authentication field extractor and is not an authority.
The full PostgreSQL/distributed gate, lease recovery, final candidate freeze
and I1 remain deferred to the later release task.

No IdP, provider, channel, credential, real data, production, commit, push or
deploy was used. The existing AUD20 certificate and `.gauntlet` state remain
untouched.
