<!-- Portable rendering; verbatim original cli-review-r1.raw.txt -->

**ACCEPT_BOUNDED_CLI_GRAPH**

No mandatory findings within the frozen contract.

Independently confirmed:

- Contract SHA-256: `511bf568773140f269b715ab8c1df8be3c055a792f3f89923891df8bbba2b97e`.
- Manifest SHA-256: `1997d5bfd085285781c5f2a974c44468e28578592619e415a36590d948aa0334`.
- Upstream HEAD equals `8d9f6466ff0294785d56f55b1fe363d132fe4133`.
- All five artifact hashes, 41 source hashes and 41 pinned Git blobs match.
- All 1,207 distinct source anchors match their bytes, hashes, line numbers and excerpts. All 492 node IDs are unique; no orphan owner/target references.

Source inspection supports the claimed 30 root variants, 52 nested variants, 105 types, 305 fields and 127 edges. Root dispatch anchors reference the actual main dispatch.

The tricky bindings are represented correctly:

- Imported `ReviewArgs` through `ReviewCommand.args`: [main.rs:316](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/cli/src/main.rs#L316).
- Queue’s shared root-owned types: [queue_cmd.rs:12](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/cli/src/queue_cmd.rs#L12).
- Four symbolic host sandbox aliases: [main.rs:478](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/cli/src/main.rs#L478).
- Daemon variant-owned fields: [main.rs:665](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/cli/src/main.rs#L665).
- Manual `ResumeArgs` delegation and positional conversion: [cli.rs:256](https://github.com/openai/codex/blob/8d9f6466ff0294785d56f55b1fe363d132fe4133/codex-rs/exec/src/cli.rs#L256).

The four effective-schema edges, Windows setup grammar, nested dispatch candidate qualification and arg0 remain explicit limitations. No additional concrete omission or misrepresentation was found within the bounded graph.

Generator, target, tests and network were not executed. Recorded eight PASS checks and seven negative controls were inspected, not rerun. No files were written or descendant agents created. This verdict grants no full G01, parity, runtime or gate approval.
