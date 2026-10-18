# C100-Q01-REF-PORT-001 — builder handoff

**IMPLEMENTED; review PENDING. No DONE/acceptance claim.**

Four owned files only:
- `tests/claude100/reference-port/protocol.mjs`
- `tests/claude100/reference-port/observer.mjs`
- `tests/claude100/reference-port/client.mjs`
- `tests/claude100/reference-port/protocol.test.js`

Pure Node22 unit: **78/78 PASS**, zero failures/skips; scoped ESLint and formatting exit0. Exact commands, historical first failure and current limitations: [result.json](result.json). Raw current unit output: [unit-terminals.log](procedures/unit-terminals.log).

Native invocation returns exactly `{file,versionArgs,args,env,cwd,stdin}`. SHA conventions: argv=`SHA(C([file,...args]))`, env=`SHA(C(env))`; stdin raw SHA, empty for version and fixed literal for port. Version recognition requires exact `2.1.302 (Claude Code)` with at most one terminal LF/CRLF and successful actual child exit. Both phases use the same fixed derived environment.

Completion convention explicitly requested by Lead: exactly one zero-length terminal per native phase/channel before NATIVE_END and per eligible body ordinal before REQUEST. Empty body is terminal only. Nonzero frames are payload; zero-length records contribute zero bytes. Full-buffer decoder rejects missing/duplicate terminals and post-terminal payload. Host must join terminal(s) and actual trusted control events across multiplexed pipes. [Framing addendum](framing-addendum.json); frozen ABI was not edited.

**One unresolved contract issue before freeze/import:** fifth HTTP attempt has no ordinal in the frozen0..3 domain. Current implementation fails CAP/nonzero without false ordinal, fifth proof or extra fields. Per-header/body cap with an existing ordinal emits REJECTED/CAP. [Clarification required](clarification-required.json). This blocks NP06 acceptance, not private source handoff.

No wrapper main, HTTP socket/server, native child, Docker/container, Claude, model/provider/account/network, positive containment or HTTP proof ran. Full gates, PG/E2E/certify, fresh independent review and final acceptance remain with Lead. The wrapper Error/AggregateError chain is retained internally; no unapproved JSON error event or diagnostic stderr is invented.

Source bytes/hashes: [source manifest](source-manifest.json). Actual reused qualified closure: [helper manifest](qualified-helper-manifest.json).

SPEC SHA256: `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04`.
Frozen ABI SHA256: `b234504c7670cbd33272bd2d49326b6c1f3c386b4da708a374f960b89ed4b659`.

Next: Lead confirm terminal framing addendum, resolve ordinal clarification before freeze/import, then fresh independent source review before any real wrapper/native/container execution.
