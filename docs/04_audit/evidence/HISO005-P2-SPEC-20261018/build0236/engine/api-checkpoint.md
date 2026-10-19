# Builder checkpoint (not approval)

Sync `runSemanticBoundary(input)` has no top-level await and invokes the fixed Node22 worker with stdin JSON; it returns the frozen output shape. Exports for tests: `analyzeSemanticBoundary`, `validateSemanticBoundary`, `semanticOriginId`, `semanticCanonicalJson`, `SEMANTIC_LIMITS`. Internal analysis is unvalidated; worker validation runs the analyzer again and compares the full deterministic payload. Parent revalidates all returned input hashes/paths, TCB hashes and proof IDs. Host must still finalize comparator and origins.

`semanticOriginId(origin)` hashes sorted-key canonical JSON of the complete supplied origin object excluding only `id`. Omit undefined fields; do not add fields after computing id. `kind` may be the parser SyntaxKind number or reverse-enum string; expression, if present, must equal the actual node text. BindingElement synthetic fields refer to its real span. This helper is intended for the Lead emitter, keeping the exact tuple common.

Module closure proofs have `originId:null`, `rule:K5`, one deterministic ID, dependencies on actual resolved runtime modules and all physical input hash premises; origin-specific proofs use `K7` and depend on the module proof. Installed `PROVEN` requires MATCH + reference digest + reached actual runtime entries + nonempty module proofIds. An input installed record with no demonstrated runtime predecessor stays UNKNOWN.

Deliberate refusals: conditional/ambiguous exports, imports maps, symlinks (including internal aliases), generated/native/WASM, external process/host code, dynamic-import Promise consumption, loop/async/generator/new/call/apply/bind and unsupported mutation. No support claimed for real mocks/sandbox/bootstrap. All-closure invalidation is conservative: any unknown prevents all consumable proofs, rather than guessing independence.

First red and run-1 are retained. Run-1 diagnosed fractional spawnSync timeout by a public/internal discriminating probe; fixed by flooring remaining monotonic milliseconds. Focused run-2 in progress.
