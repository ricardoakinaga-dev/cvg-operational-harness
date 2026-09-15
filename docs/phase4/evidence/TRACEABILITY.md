# AAA-41 Criterion Traceability

Statuses below describe controlled synthetic proof. They do not authorize
production. The final candidate identity and gate hashes are authoritative in
`certification/candidate-manifest.json`, `certification/phase10-result.json`,
and `certification/manifest.json`, verified by `npm run certification:verify`.

| Criterion | Controlled evidence                                                                                                                                                                                                               | Result                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| P4-C01    | `tests/architecture/dependency-direction.test.ts`; neutral package manifest and import scan                                                                                                                                       | PASS_CONTROLLED                       |
| P4-C02    | `capability-boundary.test.ts` descriptor detachment, frozen snapshots, captured handlers                                                                                                                                          | PASS_CONTROLLED                       |
| P4-C03    | `capability-boundary.test.ts` exact version/duplicate/latest rejection; public negative resolution matrix                                                                                                                         | PASS_CONTROLLED                       |
| P4-C04    | `capability-boundary.test.ts`, `execution-spine.test.ts`, and `operational-harness-capability-postgres.integration.test.ts` through `createOperationalHarness` and the durable `OperationalExecutionWorker` path                  | PASS_CONTROLLED                       |
| P4-C05    | `capability-boundary.test.ts` registration bounds, malformed public inputs, malformed provider outputs, no provider execution/confirmation                                                                                        | PASS_CONTROLLED                       |
| P4-C06    | locale-independent code-unit ordering test, composition ordering/fingerprint tests and `COMPOSITION_FINGERPRINT.json`; durable fingerprint mismatch tests                                                                         | PASS_CONTROLLED                       |
| P4-C07    | origin parity test for `core`, `skill`, `plugin`, `knowledge`, and simulated `mcp`                                                                                                                                                | PASS_CONTROLLED                       |
| P4-C08    | simulated `mcp` origin only; dependency-direction/package inspection; no MCP client or network path                                                                                                                               | PASS_CONTROLLED_WITH_LIMITATION       |
| P4-C09    | provider A/B swap through the same public factory with identical policy/audit path                                                                                                                                                | PASS_CONTROLLED                       |
| P4-C10    | in-memory replay/uncertain tests plus disposable PostgreSQL fresh-pool capability replay, uncertain retry, durable worker execution, and durable approval recovery                                                                | PASS_CONTROLLED_DISPOSABLE_PG         |
| P4-C11    | public tenant crossover test rejects a payload authority spoof before provider execution/confirmation; worker tenant-pair test and PostgreSQL tenant-separated journal records                                                    | PASS_CONTROLLED_DISPOSABLE_PG         |
| P4-C12    | 20 concurrent governed executions with one confirmed effect; 20 context-preserving calls                                                                                                                                          | PASS_CONTROLLED                       |
| P4-C13    | unknown origin/version/id, missing/latest version, invalid input/output/result, unauthorized profile, public deep import, and composition ambiguity negatives; source adapter remains internal and is not a public package export | PASS_CONTROLLED_WITH_SCOPE_LIMITATION |
| P4-C14    | `tests/phase4-public-consumer.test.ts` independent entrypoint consumer and adapter absence/deep-import rejection                                                                                                                  | PASS_CONTROLLED                       |
| P4-C15    | this bundle, round-one critic record, bounded fresh-critic outcome, mutation sentinel, final candidate manifest/results/logs, and final report                                                                                    | CONDITIONAL_NO_FRESH_REPORT           |

## Explicit non-claims

- MCP is simulated metadata only; no MCP client, server, network, or
  credential was used.
- The PostgreSQL scenario is disposable local infrastructure and uses only
  synthetic capability output. A fresh pool/composition is a
  restart-equivalent proof, not an OS/process crash proof for an external
  provider.
- The boundary does not claim to sandbox arbitrary malicious in-process code.
- The executable adapter is hidden from the published package surface; direct
  imports of repository-internal source modules are outside the public
  consumer contract and are not treated as an arbitrary in-process sandbox.
- Controlled replay and uncertain-effect behavior do not qualify production
  exactly-once behavior or any real side effect.
