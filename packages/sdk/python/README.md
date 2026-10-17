# CVG Python stdio client

Experimental local-source SDK for the existing CVG JSON-RPC v1 protocol.
Uses Python stdlib only: no pip, dependency installation, network access,
provider, or Node requirement in the client. The interop fixture requires the
trusted Node22 executable and CVG public packages already compiled by the Lead.
Only **CPython 3.12.3 on Linux with asyncio SelectorEventLoop** has been tested
in this build. Python3.11+, other POSIX systems, Windows and Proactor are not
claimed as verified. No wheel/pip distribution is provided.

Copy the complete `cvg_sdk/` directory including both JSON files to a trusted
application source directory. An isolated launcher uses `python3 -I -S -B` and
explicitly inserts that trusted source directory into `sys.path`. Do not rely
on PYTHONPATH, cwd, user site, .env, or HOME discovery. The package belongs to
the existing SDK; it has no Node workspace/build manifest and no TS imports.

```python
from cvg_sdk import StdioOptions, attach_stdio, create_sdk_client

# The trusted host already opened/configured these two exclusive pipe FDs.
transport = attach_stdio(input_fd=server_stdout_fd,
                        output_fd=server_stdin_fd,
                        options=StdioOptions(expected_tenant_id="host_tenant"))
try:
    client = create_sdk_client(transport)
    hello = await client.hello()
    await client.open_session("synthetic_session")
    result = await client.send_turn("Olá 🌿", "synthetic_session")
    events = await client.read_events("synthetic_session", after_sequence=0, limit=100)
finally:
    await transport.close()
```

The host must use distinct nonblocking POSIX pipe descriptors, input readable
and output writable, on the same running selector loop. It must keep them valid
and exclusively reserved until close finishes. The adapter does not duplicate,
close or change FD flags, spawn/kill processes, open network connections, read
environment files or obtain credentials. Host owns server identity, tenant,
policy/approvals, all process effects, FD errors after detach, and child shutdown.
`expected_tenant_id` checks event identity; it is not authentication and is never
sent as a wire field. These controls do not contain arbitrary OS programs.

The four calls map to `sdk.hello`, `session.open`, `turn.send`, `session.events`.
One SdkClient may bind to a transport. IDs are `py:1`, `py:2`, etc.; do not mix
manual `transport.request` IDs with its allocator. Optional session is omitted
when None. The minimal server supports hello/stateless send; session calls get
remote1003. Full server requires sessionId for send. Neither open nor event
polling is a remote execution resume. There is no new cancel/approval/streaming
RPC, Python server or implicit session state.

Defaults/ranges match stdio TS: frame1MiB (128..4MiB), pending64 (1..1024),
lifetime4096 (1..65536), buffered request bytes4MiB (frame..16MiB), deadline30s
(1..300000ms). LF/CRLF and split UTF-8 are supported; full frame size includes
delimiter. Request byte quotas persist until settlement even after write.
Client keeps one writer/partial offset; no prefix retransmission or automatic
retry/reconnect. Deadline starts at admission, includes queue/write/response,
and closes the whole connection when exceeded. All correlated responses and
event schemas/fingerprints/tenant/cursor/order are checked before settlement.

`SdkWireError` extends SdkClientError(code/message/data) with `kind`,
`request_id`, `method`, `outcome`, `retry_safe`. Before any write attempt the
outcome is `not_dispatched`; any attempted write, partial/EAGAIN/error, lost or
invalid reply, remote error (including -32602/-32603/-32081) is `unknown`.
Remote code/message/data are preserved only after validation; local messages
are fixed. `retry_safe` describes this connection only. **Nothing is retried.**
Reconcile uncertain turns using session/journal or human handoff; lack of an
event does not prove lack of effect. MODEL_FAILURE and other valid stopReasons
are delivered as results.

`await transport.close()` is idempotent terminal local cleanup without waiting
for peer/dispatch, draining queued requests or closing host FDs. Task.cancel
while awaiting an admitted request shields its internal Future, terminates the
connection and raises **SdkWireError(kind='closed', code=-32083)** carrying
per-request uncertainty, rather than asyncio.CancelledError. Already-settled
responses win the race; cancellation before entering the coroutine admits no
request. Closing the adapter never cancels a remote kernel effect.

Explicitly narrower than all TS-accepted JSON: frame depth64/nodes20000,
duplicate names and isolated Unicode surrogates rejected; output only plain
dict/list/JSON scalars; response before full local LF write rejected. JS trim,
UTF-16 lengths, typed numeric/string IDs, finite numbers and bool-vs-number
checks are deliberate. Event canonical-size validation uses a safe upper
bound (25 bytes per number); valid near-limit TS events can be refused. No
general RFC8785 implementation is claimed. New catalog keywords/refs/patterns
or schema hashes require explicit reprojection; data files are CVG source-pinned.

Run focused tests without installing anything:

```sh
python3 -I -S -B packages/sdk/python/tests/run.py --suite unit
python3 -I -S -B packages/sdk/python/tests/run.py --suite all \
  --node /home/ricardo/.nvm/versions/node/v22.23.2/bin/node \
  --evidence-dir docs/04_audit/evidence/PARE100-EXEC-20261014/spec0218/build-r1/local
```

Without `--evidence-dir`, artifacts stay in `tests/.artifacts/`. The trusted
runner launches only its literal fixture and fixed modes, with a new minimal
environment, private HOME and explicit cwd. It retains<=4096 bytes stderr and
drains excess; readiness timeout2s. Cleanup closes its stdin, waits1s, TERM.5s,
KILL.25s, verifies exit/streams and only then removes its home. It does not kill
other processes or groups. Failed termination keeps the private directory.
The TS comparison uses both public stdio adapters in a fresh Node process;
Python interop uses a real Node child across OS pipes. Raw transcripts are
retained separately; JSON semantic comparison maps IDs explicitly and never
normalizes payloads/events/counters or equates booleans with numbers.

`examples/attached_client.py` runs a fixed synthetic journey using only FDs and
expected tenant supplied by its caller; that caller must arrange inheritance
and nonblocking setup. It logs a fixed summary on stderr, writes no application
output to stdout, and never spawns or closes a server process/FD.

SPEC0218 defines this slice. Focused builder evidence is not independent
acceptance or release: Lead still owns integrated public API/scanner/gates and
fresh BUILD review. P100-025 stays open for reference SDK parity, remote
resume/cancel/notifications/streaming, other transports/platforms and packaging.
