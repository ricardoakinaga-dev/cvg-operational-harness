# Arg0 dispatch source inventory

`DX100-G01:ARG0-DISPATCH-SOURCE` — **IMPLEMENTED**, T1 source evidence. Independent lead review is required. There are zero functional receipts, no runtime qualification, and no full G01 closure.

The frozen [contract](../arg0-contract.json) has SHA-256 `14d69cb4d6236df9f91232b35a7e93bf6c7b7ffdcb3e85a034f9a852713c9e38`. The readonly source is `/tmp/cvg-rea-codex-20261017/upstream`, commit `8d9f6466ff0294785d56f55b1fe363d132fe4133`. This worker writes only this `arg0/` directory. The lead owns integration, schema work, and ledger updates.

[inventory.json](inventory.json) retains 7 ordered branches, 8 selector literals, 11 full entry/helper bodies, 99 exact source fragments and 24 authenticated source files. The complete `arg0_dispatch` is retained at upstream `codex-rs/arg0/src/lib.rs:61–149`. Its imports, selector definitions, reexports and module declarations are bound to source. Crate bindings include workspace path declarations and package identities. `arg0_dispatch_or_else` and dispatch fallback helpers are also retained.

| Order | Stable branch ID           | Selector literals                     | Dispatch cfg                    |
| ----- | -------------------------- | ------------------------------------- | ------------------------------- |
| 1     | `arg0.linux-sandbox`       | `codex-linux-sandbox` basename        | none on branch                  |
| 2     | `arg0.apply-patch-aliases` | `apply_patch`, `applypatch` basenames | none on branch                  |
| 3     | `argv1.windows-mxc`        | `--__codex-windows-mxc`               | none on branch                  |
| 4     | `argv1.exec-helper`        | `--codex-run-as-arg0-exec-helper`     | `#[cfg(unix)]`                  |
| 5     | `argv1.fs-helper`          | `--codex-run-as-fs-helper`            | none on branch                  |
| 6     | `argv1.windows-wrapper`    | `--run-as-windows-sandbox`            | `#[cfg(target_os = "windows")]` |
| 7     | `argv1.apply-patch-mode`   | `--codex-run-as-apply-patch`          | none on branch                  |

Before these branches, `#[cfg(target_os = "linux")]` calls `codex_utils_pty::init_spawn_helper(std::env::args_os())`. Its full body, Linux reexport/module guards, `HELPER_ARG` (`--codex-run-as-process-setup`), `HELPER_EXE` (`/proc/self/exe`) and registration state definition are retained separately. This hook receives a fresh complete argument iterator before the dispatch iterator exists. Its internal call to `spawn_helper_main::dispatch` is unexpanded.

The basename dispatch uses `Path::file_name`, UTF-8 conversion and an empty-string fallback. Its two alternatives precede the five sequential argv1 tests. Missing argv0/argv1 use default `OsString` values. Helpers receive no iterator from the dispatcher; retained source shows which direct entry bodies reread global argv. Each selected helper entry declares `-> !`; the patch argument mode explicitly exits after mapping its result. Textual cfg alternatives remain evidence; no effective platform is inferred.

Patch argument mode consumes argv2 through UTF-8 conversion, emits the exact missing/non-UTF-8 diagnostic, exits 1 for cwd/runtime initialization errors, maps application `Ok` to 0 and `Err` to 1, then calls `std::process::exit(exit_code)`. Its actual call retains `LOCAL_FS.as_ref()` and `None` for sandbox. It does not reject extra arguments in the dispatch body. The separate basename patch entry rereads argv, supports stdin, and rejects extra arguments; its full helper body preserves all errors and return codes. These are source observations, without applying any patch.

The normal fallback calls `load_dotenv`, prepares PATH aliases with `InstallContext::current`, optionally sets PATH and returns the guard. The immediate alias preparation helper preserves its warning and `(None, package_path)` failure fallback. The caller wrapper invokes dispatch before its main thread/runtime. The inventory retains full source for these statements without qualifying their transitive effects.

## Reproduction

Run the Python standard-library reader from the repository root:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-adapters/arg0/build_arg0_inventory.py --check
```

`--check` authenticates the frozen contract, commit object, consumed files and Git blobs; reconstructs the inventory twice; compares every generated artifact and manifest; runs 21 in-memory negative controls; and checks that owned file hashes and mtimes did not change. It does not write files or invoke the formatter. A missing/mutated source, artifact or manifest fails closed with exit 1. It checks the consumed files, without claiming whole-upstream-tree cleanliness.

The negatives cover branch/alias/hook omission, branch order, wrong literal/comparison, Unix/Windows/Linux cfg, wrong helper and patch filesystem call, consumed arguments, patch exit mapping, definition binding, byte span, exact text, Git blob identity, runtime/receipt/transitive qualification, and a source byte mutation checked against the original Git blob. They mutate data in memory, without executing target code. Equality to the regenerated curated source model is the artifact oracle; it is not a general Rust semantic proof.

[verification.json](verification.json) records the deterministic source checks and rejection cases. [handoff.json](handoff.json) records status, limitations and proposed ledger deltas for the lead. [manifest.json](manifest.json) binds the five other files by bytes and SHA-256. The manifest excludes itself; its digest is reported externally. No generated timestamps or random data are used.

To rebuild this evidence deliberately, `--generate` writes only `inventory.json`, `verification.json` and `handoff.json`. Then format only this README with the authorized command, before `--freeze` writes the manifest:

```sh
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write '/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-adapters/arg0/README.md'
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-adapters/arg0/build_arg0_inventory.py --freeze
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-adapters/arg0/build_arg0_inventory.py --check
```

Each source record includes the full-file SHA-256, byte size and Git blob SHA-1. Each fragment carries its exact UTF-8 text, zero-based half-open byte offsets, one-based inclusive lines, fragment digest, file digest and blob identity. The reader compares working bytes with `git cat-file blob`, independently recomputes the Git blob identity, and authenticates the commit bytes against the requested pin. Source bytes undergo no newline normalization.

## Limits and handoff

The bounded lexer masks Rust comments/literals and balances delimiters. It does not parse/typecheck Rust, expand macros, evaluate cfg, import target modules or resolve every transitive dependency. Full entry bodies preserve direct call context and platform stubs. Unexpanded callees include Linux sandbox implementation, MXC Windows implementation, filesystem request handling, Windows wrapper arguments, process setup dispatch, patch implementation/options, install context, dotenv filtering and alias preparation dependencies.

Only Python source readers/checkers and the scoped Node22 README formatter are used. There is no target execution, compilation, application test, network/install, dependency/lock change, model/provider call, port/database/container resource, candidate, commit, push or deployment. Contract, ledgers, catalog, plans, application and other packages remain readonly for this worker. The lead must review this source slice independently and reconcile its own ledgers. This evidence grants no CVG authority from upstream helpers and no runtime, functional parity or release approval.
