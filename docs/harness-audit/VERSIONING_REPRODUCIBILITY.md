# Versioning e reproducibility

| Objeto           | Estado                                                             |
| ---------------- | ------------------------------------------------------------------ |
| agent/config     | versionado e lifecycle persistido                                  |
| prompt           | id/version/hash/effectivity no Model Gateway                       |
| policy           | id/version em decision; hash do documento não universal            |
| model            | provider/model/profile registrados                                 |
| plugin/tool      | plugin versionado; tool version não aparece uniformemente no trace |
| knowledge        | source/version em narrow path                                      |
| skill            | ABSENT                                                             |
| workflow         | sem versão canônica                                                |
| build/code       | commit não basta para worktree sujo                                |
| context/evidence | sem snapshot reproduzível completo                                 |

Anchors: `packages/platform/src/contracts.ts` agent/version records; session pin em persistence schema; `model-gateway/src/prompt-registry.ts:59-151`; `policy-engine/src/engine.ts`; plugin version rejection de `latest`; trace em `platform/src/test-lab.ts:474-495`.

Uma execução não pode ser reproduzida integralmente: faltam exact build/worktree digest, tool/provider implementation version, workflow/skill version, policy hash, context/history snapshot e evidence payload. Score: **5/10**.

Contrato alvo: `ExecutionProvenance { buildDigest, agentSnapshot, promptHash, policyHash, modelProviderVersion, toolManifestDigest, skillDigest, contextDigest, evidenceDigest }`, sem persistir raw secrets/PII.
