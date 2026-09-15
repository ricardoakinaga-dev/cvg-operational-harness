# P2-5 remediation — task-root evidence indexes (AAA-09, AAA-10, AAA-11, AAA-17)

- status: `COMPLETED` (index-only remediation; no claim added or upgraded)
- date (UTC): 2026-09-13
- scope: documentation/evidence only; no product code, no commit, push or deploy
- finding: P2-5 "expectedEvidence path mismatch for AAA-09/10/11/17" in
  `docs/04_audit/evidence/AAA/P1-independent-review/REVIEW.md:151` and
  `docs/04_audit/evidence/AAA/P1-independent-review/review.json` (`id: "P2-5"`).
  The backlog `expectedEvidence` declares
  `docs/04_audit/evidence/AAA/<task>/manifest.json`, but only subdirectory
  manifests existed, so automated evidence traversal could miss them.

## Deliverables (new files, nothing else touched)

| File                                             | sha256                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `docs/04_audit/evidence/AAA/AAA-09/manifest.json` | `5acb559a8a0ec83b23ecdf12f53c315677ed81947db96403f16f6bc109202900` |
| `docs/04_audit/evidence/AAA/AAA-10/manifest.json` | `5970b5c6f83efade70075f8b368f526d07dea8401e90dfa8b605680f4af7afef` |
| `docs/04_audit/evidence/AAA/AAA-11/manifest.json` | `cb9a35ad7f880580a430c546867bf014b986846f0c90106ac25a8f8b1d496ca1` |
| `docs/04_audit/evidence/AAA/AAA-17/manifest.json` | `32863012251cbf7d89db992c0c752fde506686c9d9fe3bfaa2676b5bb8a8c1df` |
| `docs/04_audit/evidence/AAA/P2-5-evidence-index/validate-index.mjs` | `d900508181c9bb5e823f4198e23b2d32cfe504e5dece44b70a3555465915a8c2` |

The four indexes now exist at exactly the paths declared by the backlog
`expectedEvidence`; the backlog file itself was not modified.

## Index semantics (no new claims)

Each task-root manifest is an **index only** and states this in `indexNote`:

- `schemaVersion: 1`, `taskId`, `generatedAt`, `indexOnly: true`,
  `status: "INDEX_ONLY_NO_CLAIM"`, `files[]` with `path` + `sha256` + `purpose`,
  `authoritativeManifests`, `limitations`.
- The authoritative detailed manifests remain in the subdirectories:
  - AAA-09: `builder/manifest.json`
  - AAA-10: `ports/manifest.json` + `wiring/manifest.json`
  - AAA-11: `builder/manifest.json`
  - AAA-17: `builder/manifest.json`
- `files[]` covers **every** file under each task root at `generatedAt`
  (56 entries: manifests, logs, matrices and limitation notes), not only the
  five example manifests. AAA-10 also carries 1 `crossTaskReferences` entry for
  `AAA-12/sql-adapter/green-test-postgres.log`, a log referenced by its ports
  manifest but owned by the sibling AAA-12 tree.
- The index adds no claim, upgrades no status and does not replace the
  subdirectory manifests; all scope, test results, statuses and limitations
  remain exactly as declared by the builders.

## Validation

- Script: `validate-index.mjs` (structure, required fields, existence, sha256,
  authoritative-manifest membership, cross-task refs, completeness walk).
- Command: `node docs/04_audit/evidence/AAA/P2-5-evidence-index/validate-index.mjs`
- Exit code: `0` — output in `validation-output.log`:
  - `manifests=4 indexed_files=56 cross_task_refs=1 sha256_ok=57 failures=0 warnings=0`
  - `RESULT: PASS` (61 `[PASS]` lines, zero `[FAIL]`/`[WARN]` lines)
- Formatting: `prettier 3.8.3` `--check` on the four manifests and the
  validation script: `All matched files use Prettier code style!` (exit 0).

## Constraints honored

- Only new files were created under `docs/04_audit/evidence/`; no existing
  evidence file was modified (mtime check: only the four new root
  `manifest.json` files are newer than the session start inside the four task
  roots) and no product code was touched.
- No commit, push, deploy or external effect.
- `docs/99_runtime_state.md`, `docs/20_master_execution_log.md` and
  `docs/30_backlog_master.md` were intentionally left to the coordinator for
  this round.
- This `P2-5-evidence-index/` directory is remediation meta-evidence and is
  intentionally not indexed by the four task-root manifests.

## Limitations

- The hashes pin bytes at `generatedAt` (2026-09-13T03:31:37.754Z); the index
  does not re-execute tests, re-review evidence or confirm semantics/quality —
  only existence and byte-level integrity.
- Any later edit or addition under the four task roots makes an index stale;
  re-run `validate-index.mjs` to detect drift (extra files are reported as
  `[WARN]`, missing/mismatched files as `[FAIL]` with exit 1).
- The sha256 values in this note pin the index files themselves at note
  creation time; they are not self-referential inside the manifests.
- No review, product gate, G_QUALITY, DONE or production authorization is
  implied.
