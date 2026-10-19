# Bounded CLI source graph — IMPLEMENTED

T1 evidence for `DX100-G01:CLI-ENTRYPOINT-GRAPH`, under the Lead's existing
claim. The [frozen contract](../cli-contract.json) SHA-256 is
`511bf568773140f269b715ab8c1df8be3c055a792f3f89923891df8bbba2b97e`.
Source: official snapshot `8d9f6466ff0294785d56f55b1fe363d132fe4133`
at `/tmp/cvg-rea-codex-20261017/upstream`, read only.

[graph.json](graph.json) resolves `MultitoolCli` → `Subcommand` → command
name/aliases/cfg/hide → local or imported clap type → actual root dispatch
arm and terminal call sites. All 30 root variants have dispatch; `None`
shares the interactive `Agents` arm. The graph includes 52 nested variants,
105 type declarations, 305 fields and 127 typed/delegation edges. Counts are
recomputed in [checks.json](checks.json), not runtime coverage claims.

Fields retain their declaration owner. `flatten` and `subcommand` create
edges; fields are not copied into the nearest lexical command. In particular,
`ReviewCommand.args` belongs to imported `ReviewArgs`; queue reuses root
`InteractiveRemoteOptions` and `SessionArchiveConfigOverrides`; host sandbox
arguments resolve through four symbolic cfg aliases. Struct-like daemon
variant fields belong to the variant. `skip` fields are not arguments.
Cargo package identities, exact imports, reexports and declarations bind the
curated cross-crate resolution. Nested dispatch entries are body-bearing
source candidates, including aliases/qualified names and the sandbox
`if let`; they do not certify runtime reachability.

Four effective-schema edges remain explicitly unresolved: `SessionTuiCli`,
`ExecSharedCliOptions`, `TuiSharedCliOptions`, and exec `ResumeArgs`. Their
`Args` delegation and implementation/helper excerpts are bound, while clap
mutations and conditional positional reinterpretation require further
qualification. The Windows sandbox `setup` grammar comes from parsing the
host command vector and is recorded separately as a dynamic entry. Scalar
value-enum/parser semantics, clap expansion, transitive runtime callees and
arg0 executable-name dispatch are outside this root command graph.

## Reproduction and check

Python 3.11+ standard library only, from the repository root:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/entrypoints/cli/generate.py --check
```

`--check` writes nothing. It regenerates the graph from read-only source,
checks the frozen contract, HEAD, source blob inventory and manifest,
verifies ownership/references and source excerpt hashes, and runs in-memory
negative controls. Omitting `--check` regenerates only `graph.json`,
`checks.json` and `manifest.json` inside this lane. No target code is imported,
compiled or run. No network, installation or application tests are needed.

The root removal, alias loss, cfg loss and dispatch loss controls must be
rejected even without comparing source hashes. Artifact root/dispatch
removal and owner swapping are also rejected. [pin-tree.json](pin-tree.json)
binds the consumed source paths to blob IDs independently read with
`git ls-tree -r` at the frozen pin. It is a provenance input, not a file the
generator refreshes. [manifest.json](manifest.json) binds the contract,
consumed source hashes and every lane artifact except its own recursive
hash; compute its digest with `sha256sum`.

The reader is deliberately bounded, not rustc: delimiters, comments and
literals are tokenized; direct declarations and simple imports plus curated
public reexports/manual adapters are followed. cfg is symbolic and effective
availability requires the whole path, including module conditions. The
`limitations` array is normative to interpretation of this evidence.

Lead handoff: last action is this static implementation; next action is
integration and independent source review. Ledgers, catalog, backlog,
coordination claims and all shared integration files remain Lead-owned.
No runtime qualification, approval, release or G01 closure is asserted.
