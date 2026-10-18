# DX100-G02:BUILD-PINNED-AUXILIARY-BWRAP

Status: **BUILT_REFERENCE_ARTIFACT**. Pin `8d9f6466ff0294785d56f55b1fe363d132fe4133`.

ELF regular: `/tmp/cvg-codex100-exec-20261017/reference-build/auxiliary-bwrap/attempt-2/target/release/bwrap`. Size **2529192 bytes**.
SHA-256: `6fca7901ff69153f99cb2636d4148727ecc417a90f248521756f922c880174b7`.

Cargo returned 0; its actual successful bin record is [cargo-bin-artifact.json](cargo-bin-artifact.json), with `fresh=false`, features `[]`, opt-level `3`, debuginfo `line-tables-only`, test/debug assertions disabled. The stdout ends with `build-finished/success=true`. Original release profile: ThinLTO, codegen-units 4, split-debuginfo off, strip false. Native build emitted `bwrap_available`, `static=standalone_bwrap`, `cap` and `/native/usr/lib64`.

Exact command, with no additional build flags:

```sh
cargo build --frozen --release -p codex-bwrap --bin bwrap --jobs 1 --message-format=json-render-diagnostics
```

## Containment and cleanup

[command.json](command.json) records the entire systemd/bwrap argv and cleared child environment. [attempt-2-scope-properties.json](attempt-2-scope-properties.json) captured live effective MemoryMax=2147483648, MemorySwapMax=0, CPUQuotaPerSecUSec=1s, TasksMax=128, RuntimeMaxUSec=10min. The first stderr line records actual cgroup files before any compiler. Namespace guards and trusted C/Rust/OpenSSL/libcap probes passed before upstream, including libcap compiled with the actual pkg-config arguments.

Before successful launch: MemAvailable 22218027008 − max(0,19327352832 − CLI current 9166815232) = **12057489408**, above 10737418240 required. Disk free 20305547264 bytes. Disk monitoring enforced 8GB free / 4GB own-size abort thresholds, with no ENOENT/retries or monitor abort; it is not a filesystem quota. Scope supervision lasted 18.028s, peak observed attempt-owned disk 37952954 bytes; Cargo reported 9.32s.

Own unit `cvg-codex100-aux-bwrap-2361357b21.scope` is inactive/dead/not-found, no control group/tasks remain: [cleanup-proof.json](cleanup-proof.json). [live.json](live.json) is TERMINAL/exit0; its stale RUNNING predecessor is [live-running-preserved.json](live-running-preserved.json). The supervisor omitted the terminal live update; finalization normalized it only after a fresh readonly scope query. No new kill or resource mutation was needed. First build scope was also inactive. Artifacts/caches are retained privately for audit. CLI scope was queried readonly for memory/status only; no other scope was controlled.

## Native layout recovery and exact environment

The first upstream attempt failed at final link: authenticated `libcap.pc` declares `libdir=/usr/lib64`, while authenticated libraries occupy `usr/lib/x86_64-linux-gnu`. Its entire evidence/code is preserved in [attempt-1](attempt-1/), especially [stderr](attempt-1/cargo.stderr.log), command, source checks, result101, tool versions and inactive proof.

Recovery changed only the private namespace view. Original sysroot is mounted readonly at `/native-input`; `/native` is a private tmpfs exposing every original member via readonly binds plus `/native/usr/lib64 -> lib/x86_64-linux-gnu`, then remounted readonly. Source/vendor/toolchain/native host files stayed unchanged. No dependency download, library substitution, pkg-config-file modification, source/lock/profile/features/compiler flag change occurred. [native-view-recovery.json](native-view-recovery.json), [run.py](run.py), [child.py](child.py) and command.json preserve the exact implementation.

Both attempts use `PKG_CONFIG_SYSROOT_DIR=/native`, `PKG_CONFIG_PATH=/native/usr/lib/x86_64-linux-gnu/pkgconfig`, `LD_LIBRARY_PATH=/native/usr/lib/x86_64-linux-gnu`; no RUSTFLAGS/CFLAGS/LDFLAGS override. Successful trusted probe reported `-I/native/usr/include -L/native/usr/lib64 -lcap`. Public `/etc/alternatives/cc -> /usr/bin/gcc` and `c++ -> /usr/bin/g++` are symlinks, preserving GCC prefix. No home/config/credentials/socket/network was exposed to compilation. Private Cargo home and target were independent of CLI; vendor config remains byte-identical and names `/vendor`.

Earlier helper failure (assumed GCC13 internal path), native link failure, stale live state, and finalizer hash-helper type error are preserved separately. No failed evidence is relabeled successful. Original native probe used an explicit correct multiarch library path, so it did not expose the pkg-config layout issue; recovery probe uses actual pkg-config output.

## Provenance and members

- [input-verification.json](input-verification.json): all five contract manifest hashes, 9288 pinned source members, 78372 vendor members, 246 authenticated native members, selected Rust/tool and public compiler hashes; vendor file registry hash authenticated.
- [final-byte-verification.json](final-byte-verification.json): all 9288 source members and all 246 native members checked again, including symlink bytes; zero drift. Critical source/Cargo.lock/profile/config/build.rs/main.rs hashes and runtime library hashes are explicit. [source-before.json](source-before.json) and [source-after.json](source-after.json) bind every source member.
- [tool-versions.json](tool-versions.json), [gcc-internal-tool-hashes.json](gcc-internal-tool-hashes.json), [rust-linker-hashes.json](rust-linker-hashes.json): Rust1.95/GCC/linker/tool identity. The original requested command was not verbose: expanded complete rustc/GCC argv was not captured; exact Cargo/namespace argv, environment, original code/profile and native outputs are preserved without inventing omitted arguments.
- [native-profile-inputs.json](native-profile-inputs.json), [native-profile-raw](native-profile-raw/), [metadata.json](metadata.json), [tree.txt](tree.txt): actual native cfg/link directives, artifact profile/features and fingerprints. All generated native objects, config.h, archives and target/work members are additionally covered by the resource manifest.
- [readelf.stdout.log](readelf.stdout.log), [file.stdout.log](file.stdout.log), [dwarf-info.stdout.log](dwarf-info.stdout.log): x86-64 ELF, Build ID `0efc5186b3fed3c21172b2f7bceb9ac33ed9979c`, `bwrap_main`, `.debug_line`, DT_NEEDED libcap.so.2/libgcc_s.so.1/libc.so.6, compiler producers. No ldd or produced-ELF execution.
- Successful raw logs: [stdout](attempt-2-cargo.stdout.log), [stderr](attempt-2-cargo.stderr.log), [supervisor stdout](attempt-2-runner.stdout.log), [supervisor stderr](attempt-2-runner.stderr.log), [journal](scope.journal.log), [monitor](disk-monitor.jsonl). First raws remain in attempt-1. Empty streams are expected captures, not missing logs.
- [manifest.json](manifest.json) enumerates exact relative paths, kinds, bytes and SHA-256 for **every file in this lane and both owned resource attempts**, excluding only manifest.json itself. It includes all raw logs, code, preserved failures, generated objects and ELF. Manifest SHA-256 is supplied in delivery.

## Handoff

Bounded standalone helper artifact only. All **487+22 NOT_RUN**, functional receipts **0**. No CVG feature, application gate/test, G02 global closure, parity, deployment or release is granted. No produced bwrap execution, descendant agents, source/lock edits, install/network, account/model/data/effect, commit/push or CLI mutation occurred. Shared runtime/log/backlog remain Lead-owned; [state.json](state.json) carries lane continuity for integration. Lead can audit the retained files without executing the ELF.
