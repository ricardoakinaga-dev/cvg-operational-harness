# AUD20-001 Evidence Manifest

- candidate: pending; a new candidate is required after all authorized BUILD
- run: `aud20-20260920-w1`
- scope: local/synthetic/disposable
- node: `v22.23.2` required for qualification
- baseline fingerprint: `b9ec03d60bd57872095fa6561908d590071888b50760eb29cc65693adf8ae484`
- pre-build snapshot: `/tmp/opencode/aud20-prebuild-fingerprint.json`
- expected raw evidence:
  - `baseline-eval.log`
  - `green-eval.log`
  - `focused-tests.log`
  - `test-evals.log`
  - `typecheck.log`
  - `lint.log`
  - `format-check.log`
  - `diff-check.log`
  - `self-test.log`
  - `verification-summary.json`
- no historical certification artifact may be rebound or rewritten

## Recorded Evidence

| Artifact                                 | SHA-256                                                            | Observation                              |
| ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| `baseline-eval.log`                      | `5fa095b7847227a48b56090e6bfbb029be8f4882fca387ceb93327a9799afe8c` | Node 22; 53/56; incorrectly PASS at 0.85 |
| `green-eval.log`                         | `30aa92459c32b95bf928c2485c81d30aef527bcdc7f600c52205f4111e3def9f` | Node 22; 56/56; PASS at 1.0              |
| `focused-tests.log`                      | `40fa62f6761c093def64af3c9267e6c041c038a7c9c61b3a72ef6cfff71c4f79` | 9/9                                      |
| `test-evals.log`                         | `0e3c19da5333dc69234cc7e8d5e5d3a55b43474417355769dd96a4a747661754` | 11/11                                    |
| `typecheck.log`                          | `9c7832eaf812b8c69c76c05f4c08a45c7ecfe6fe12432834bdc8b623a4e222b9` | exit 0                                   |
| `lint.log`                               | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | exit 0                                   |
| `format-check.log`                       | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` | exit 0                                   |
| `diff-check.log`                         | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | exit 0                                   |
| `self-test.log`                          | `988ccc97a11a668e1caf9a79e3170b00e616258b0be825c92fa16b714cdfa4bc` | N1-N10 and C0-C29 PASS                   |
| `certification/agent-eval-report.json`   | `eb7a5723981eabae42cffefa8dac7b1040d30641468893fd4fc5ebccc565f0db` | current generated report                 |
| `certification/negative-validation.json` | `f964429251561f6c51458a785aad19ed71b36ae8230abaacc0bbcbb02468e386` | current self-test report                 |
