# Baseline Freeze and candidate binding — CVG Operational Harness Phase 0/1

Date: 2026-09-13T17:51:55-03:00  
Candidate: `HEAD 512bc11e80fbf7c7b8baf6263aacc811ff829309`  
Repository state: dirty brownfield candidate; pre-existing user/peer changes were preserved.

## Scope of the freeze

This is the pre-build baseline for the refoundation lane requested in the
attached master prompt. It is not a claim that the repository is green: the
worktree contains a production-assurance lane and its candidate is not clean.
The initial observations were captured before refoundation source changes.

The post-build candidate is bound separately below by a stable implementation
scope fingerprint. This preserves the pre-build comparison while preventing
the evidence/report files themselves from creating a self-referential status
hash.

## Current candidate binding

Captured after the controlled implementation and final hardening, before the
final report was written:

- Dirty status entries observed: `211`.
- Current status SHA-256: `f3ff1a3934e8d77317505b6157ae2854bd63ef5e2c789004d87c8f6ab6caa0d4`.
- Current unstaged worktree diff SHA-256: `92db6dbbc84bb67dbdc38c24acdc9dbeeedd8a0a410f1ee296b3958feba7dd1c`.
- Current staged/index diff SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Stable refoundation implementation/document scope SHA-256:
  `aedf52160ad78fcf9a38248804be2c78dc3eb4123dfa7eb6a2cde3d490124761`.

The stable scope covers the new neutral packages, demo/tests, root manifests,
architecture/refoundation documents and package resolution configuration. The
full current command comparison is in
[`evidence/REGRESSION_COMMANDS.md`](evidence/REGRESSION_COMMANDS.md).

## Repository identity and shape

- Origin identity at freeze: `cvg-agent-secretary-v2`.
- Target identity: `cvg-operational-harness`.
- Packages before refoundation: `adapters`, `agent-core`, `agent-evals`, `agent-runtime`, `approval-engine`, `channel-gateway`, `chaos`, `memory`, `model-gateway`, `observability`, `persistence`, `platform`, `policy`, `policy-engine`, `rag`, `shared`, `tools`, `workflows`.
- Applications: `api`, `worker`, `web`.
- Files outside ignored dependency/build trees observed: 6,720.
- Node: `v24.20.0`; npm: `11.19.0`; repository target engine: Node 22.

## Command results

| Command              | Result   | Observation                                                                                                                                                                                                   |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`           | **FAIL** | 249 files: 235 passed, 5 failed, 9 skipped; 1,668 passed, 12 failed, 105 skipped; 8 unhandled errors. Failures include worker/API entrypoint expectations and loopback HTTP tests blocked by sandbox `EPERM`. |
| `npm run test:evals` | **PASS** | 1 file, 8 tests.                                                                                                                                                                                              |
| `npm run typecheck`  | **PASS** | TypeScript completed with exit 0.                                                                                                                                                                             |
| `npm run lint`       | **PASS** | ESLint completed with exit 0.                                                                                                                                                                                 |
| `npm run build`      | **PASS** | Typecheck plus Vite build; 163 modules transformed.                                                                                                                                                           |

The failing baseline is retained as a known limitation and is not converted into a refoundation regression or silently ignored. The loopback failures were observed as `listen EPERM` in this sandbox; the worker/API failures also need a later focused recheck in a permitted runtime.

## Digests

These pre-build digests bind the freeze to the observed starting candidate and
are not release attestations:

```text
index_diff_sha256  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
worktree_diff_sha256 5ea8e12e41886129381419cd3a7846f7a08f50c3a65e1f69cee95838b8394d1e
status_sha256 77aca88707e8b19bd5c4ee4f709b5d84664e158ed45d823be48d910cde766049
tracked_tree_sha256 a10272963faac3b13976d25377c26767b7002403ec3fc42af92eb5250b39a833
tree_listing_sha256 43e9a2aa4216f9c7067f0acb9acceb9992109ebb04e271d1d171c9278accb297
```

## Known limitations at freeze

- The worktree is not a clean release candidate; the refoundation must preserve unrelated changes.
- The current public runtime has two paths and the canonical HTTP→SQL→worker→kernel composition remains the separate `AAA-21` task.
- PostgreSQL, Docker image, external providers/channels, real data, institutional RAG and production were not used by this freeze.
- Node 24 was available locally while the repository target is Node 22.
- Existing Secretary branding and product-specific code remain intentionally present as compatibility residue until a later, separately gated extraction.
