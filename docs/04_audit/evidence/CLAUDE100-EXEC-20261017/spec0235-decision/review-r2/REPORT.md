# SPEC0235 — bounded corrective review R2

**REVISE — one mandatory P1 residual, R2-01 (R1-02).** R1-01, R1-03, R1-04 and R1-05 are closed documentarily. The observation protocol is substantially corrected, but its port bootstrap still lacks an executable dataflow under its own closed schemas. No new broad audit or optional/editorial finding was added.

Task `C100-Q01-REF-PORT-001`; correction1 of at most2. Same independent critic, no descendants. Reviewed `2026-10-18T00:42:20.380642+00:00`.

Packet SHA-256: `f68792d9307cf143f365996a38daf61dc0100f68ac091453166c91bc10280eb9`.

SPEC SHA-256: `048fad528421a2fdd092a1848d9be786893a32dc2ed218bc058d119c2f52cd3e`.

Packet plus all11 input pins were recomputed before/after; prior R1 REPORT/verdict/manifest remained byte-identical. Exact inventory and artifact digests are in `manifest.json`.

## Mandatory residual: R2-01 / P1

Affected requirements: NP01, NP04, NP05, NP08. Origin: R1-02; this is a feasibility/identity gap in the corrected protocol, not an expanded requirement.

References in `docs/02_spec/0235_claude_native_port_probe.md`:

- Lines64,122–125,132–133 require an ephemeral observed port and the fixed resolved native environment, beginning with the version invocation.
- Lines233–249 bind the run-specific resolved configuration to the profile.
- Lines263–267 close commands to `{version,runId,seq,type}`; there is no port/config payload.
- Lines273–276 close READY without a port and expose the port only in ARMED.
- Lines94–95,299–305 require both READY/preflight, then version completion, and only then ARM_PORT/ARMED and the prompt phase; the version START already binds its exact envSha256.

The observer can select port P when it listens, but no defined pre-version message gives P to the host/client. ARMED is the first declared carrier and depends on the version ending. The already-created client also has no later host command field for P or the resolved environment. A final profile records identity; it is not a specified bootstrap delivery channel. Source/config guessing, extra unnamed IPC, an undeclared READY field or an implicit exception to the exact version environment would change the contract.

The documentary counterexample is therefore a dependency cycle: version needs resolved P → P is delivered only by ARMED → ARM_PORT requires version completion. This was derived from the text; no target or controller code was executed.

**Smallest required change:** choose one explicit finite bootstrap sequence and delivery mechanism. One sufficient option is a real bound-port value in observer READY (or a specific pre-version listening frame), validated by the host before constructing the client's resolved configuration/READY, with ARM_PORT reserved for later evidence eligibility. Another is explicitly separate version/port environments with a defined finite delivery mechanism before the prompt spawn. Only one solution is needed. Freeze when the resolved profile is bound and how mutation is rejected; do not rely on an implicit mutable file channel.

**Rejectable closure criteria:**

1. Trace the actual bound port to every applicable exact native environment using declared channels before spawn.
2. Define the run-specific profile/config freeze point and drift rejection.
3. Supply a small documentary trace showing discovery/configuration/READY/preflight/version/ARMED/prompt in an achievable order.
4. Define missing/invalid/mismatched/substituted-port rejection and a future controller negative proving no native spawn without its required resolved input. No runtime launch is requested to correct this document.

## R1 closure disposition

| Finding | Disposition | Corrected SPEC evidence |
| --- | --- | --- |
| R1-01 | CLOSED_DOCUMENTARILY | 211–257: byte domains, raw manifest, full helper/bundle snapshot, deterministic inventory/profile digests, retained role mapping and pre/post drift. Real code closure remains future. |
| R1-02 | PARTIALLY_CLOSED; R2-01/P1 remains | 259–323: trusted framing/rawpipe separation, phase/lineage/host ordering and exact local503 completion are now specified. Port bootstrap contradicts the prescribed phase order. |
| R1-03 | CLOSED_DOCUMENTARILY | 325–352 and434: synced create intents, one exact-name reconciliation, identity checks, bounded channels/calls/log driver and honest unresolved cleanup/crash handoff. |
| R1-04 | CLOSED_DOCUMENTARILY | 192–203,251–255,354–387: mandatory checks, retained artifact/trace/body/response relationships, non-null success identity, missing-evidence rejection and native signal handling. |
| R1-05 | CLOSED_DOCUMENTARILY | 389–422: deterministic terminal priorities, chronological causes, privacy/cap/late failure override, native exit preservation and no final report after publication failure. |

The existing image's declared `/var/lib/postgresql/data` is covered by the new empty owned readonly bind, no anonymous volume, and real inspect requirement at78–81. This is an appropriate contract correction. The frozen image-declared-volumes.json is read-only recon, not proof that future containers satisfy it; no Docker call was made by this critic.

The inert digest example explicitly does not claim to be a valid complete probe bundle/profile. Its four raw hashes, canonical bundle digest and toy-profile digest recompute exactly in the stated ASCII byte domain. It is supporting recipe evidence only. Actual future retained closure/invocation digests still require code freeze/review under NP10.

The literal fixed503 body is82UTF-8 bytes. The19 documentary cases agree with the specified priority table, including auth/cap/timeout/drift/response/cleanup failures after a POST, dual failures, absent final publication, native exit1 and marker-false opaque observations. These calculations validate document consistency, not actual runtime handling.

## Procedure, boundaries and handoff

Read only the corrected SPEC, its three new supporting documents, packet pins and relevant unchanged R1 context. Refreshed current coordination/ledger context without writing shared files. Retained inherited constitutional/ownership restrictions. The only writes are this REPORT, verdict.json, manifest.json and the critic's private `/tmp/cvg-claude100-exec-20261017/spec0235-review-r2/**`. Commands/procedure, byte calculations, before/after and R1 seal pins are listed in the manifest's local artifacts.

No target execution/import, BUILD, native launch, Docker/container operation, network, install, source/cache mutation, broad tests/gates, descendants, commit or Q04 interaction occurred. All NP01–NP10 runtime evidence remains NOT_RUN. The real transport remains a bounded hypothesis; no model/account/M1/parity credit or authority is inferred from SPEC0229.

Next: resolve R2-01 with a small frozen bootstrap trace in the final permitted corrective round. This R2 does not request editorial work, new capabilities or a broader audit. After documentary acceptance, explicit human T3 approval of the exact accepted SPEC still precedes BUILD and the separate code-review/native/gate preconditions. The Lead owns continuity updates; ledgers99/20/30 and R1 remain read only here.
