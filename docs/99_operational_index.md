# Operational index — derived navigation

This file is a manually reconciled navigation aid derived from the append-only
records; it is not generated automatically yet. The linked ledgers remain the
only mutable sources of operational status. This index must not be used to
infer approval, certification or production access.

## Sources of truth

- [runtime state](99_runtime_state.md)
- [master execution log](20_master_execution_log.md)
- [master backlog](30_backlog_master.md)
- [AUD21 executable backlog](03_build/0337_comprehensive_remediation_backlog.md)

## Arquitetura e correções em andamento — AUD-0590

- [Guia da implementação atual](architecture/CURRENT_IMPLEMENTATION_2026-09-29.md) — snapshot do código em `54257e3`; a composição e a certificação do candidato integrado continuam abertas.
- [Auditoria sistêmica AUD-0590](04_audit/0590_deep_system_audit_2026-09-28.md) — achados e notas da baseline auditada.
- [Roadmap M0–M5](03_build/0360_aud0590_remediation_roadmap.md) e [backlog A59-01–15](03_build/0361_aud0590_remediation_backlog.md) — sequência, dependências e critérios de fechamento; produção `NO_GO`.

## Current controlled work — AUD-0576

- [Current runtime state](99_runtime_state.md)
- [Current master execution log](20_master_execution_log.md)
- [Current consolidated backlog](30_backlog_master.md)
- [AUD-0576 score audit (0–100 per item)](04_audit/0576_repository_score_audit_2026-09-26.md)
- [AUD-0576 roadmap (waves R0–R5)](03_build/0352_score_roadmap_2026-09-26.md)
- [AUD-0576 backlog RA26-01–17](03_build/0353_score_backlog_2026-09-26.md)
- [Detailed M07 recovery backlog](03_build/0344_reaudit_m07_backlog.md) — `A24-03-C1M-PACKET` `IN_PROGRESS / DOCUMENTARY`

## Histórico — Current controlled work — AUD-0573 / AUD53

- [Current runtime state](99_runtime_state.md)
- [Current master execution log](20_master_execution_log.md)
- [Current consolidated backlog](30_backlog_master.md)
- [AUD-0573 execution evidence](04_audit/0574_aud0573_execution_evidence_2026-09-25.md)
- [AUD-0573 roadmap](03_build/0350_audit0573_roadmap.md) and [RA25 backlog](03_build/0351_audit0573_backlog.md)
- [AUD53 closure registry packet and outcome](04_audit/0575_aud53_closure_rebind_decision_packet.md)
- [Evidence retention policy](08_runtime/0801_evidence_retention_policy.md)
- [Detailed M07 recovery backlog](03_build/0344_reaudit_m07_backlog.md) — `A24-03-C1M-PACKET` `IN_PROGRESS / DOCUMENTARY`

## Histórico — Current controlled work — AUD52

- [Current runtime state](99_runtime_state.md)
- [Current master execution log](20_master_execution_log.md)
- [Current consolidated backlog](30_backlog_master.md)
- [Detailed M07 recovery backlog](03_build/0344_reaudit_m07_backlog.md)
- [C1L approval request and scope](04_audit/evidence/AUD-20260924/M07-S1-C1L/approval-request.md) — SHA-256 `0a6dd3efa5bc3a45b8e42062680b338e58e3b4e45a924dd177d6a12b77601f6c`
- [C1L final result — FAIL / OPEN](04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md)
- [C1L stop disposition and baseline drift hashes](04_audit/evidence/AUD-20260924/M07-S1-C1L/run-disposition.json)
- [C1L command records — STOPPED_OUT_OF_SCOPE](04_audit/evidence/AUD-20260924/M07-S1-C1L/command-records.json)
- [C1L original packet validation and frozen command plan](04_audit/evidence/AUD-20260924/M07-S1-C1L/packet-validation.json), [command plan](04_audit/evidence/AUD-20260924/M07-S1-C1L/command-plan.json)
- [C1K review disposition — STOPPED_UNAVAILABLE](04_audit/evidence/AUD-20260924/M07-S1-C1K/final-disposition.md)
- [C1J final result — FAIL / OPEN; local matrix passed](04_audit/evidence/AUD-20260924/M07-S1-C1J/final-gate-result.md)
- [AUD52 task/backlog status](03_build/0344_reaudit_m07_backlog.md)

## Historical controlled lane — AUD45

- [Historical C1J approval request — later approved and executed](04_audit/evidence/AUD-20260924/M07-S1-C1J/approval-request.md) — SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`
- [Historical C1J packet validation — preparation record](04_audit/evidence/AUD-20260924/M07-S1-C1J/packet-validation.json)
- [C1J correction patch — applied only under the approved gate](04_audit/evidence/AUD-20260924/M07-S1-C1J/correction-preview.patch)
- [C1J frozen command plan — executed; see command records](04_audit/evidence/AUD-20260924/M07-S1-C1J/command-plan.json)
- [AUD48 historical task and gate snapshot](03_build/0344_reaudit_m07_backlog.md)

- [AUD44 C1I final gate result — FAIL / OPEN](04_audit/evidence/AUD-20260924/M07-S1-C1I/final-gate-result.md)
- [AUD44 C1I quality-bar results](04_audit/evidence/AUD-20260924/M07-S1-C1I/quality-bar-results.json)
- [AUD44 C1I command records](04_audit/evidence/AUD-20260924/M07-S1-C1I/command-records.json)
- [AUD44 C1I hash-bound decision](04_audit/evidence/AUD-20260924/M07-S1-C1I/decision-record.json)
- [AUD44 C1I packet and frozen plan](04_audit/evidence/AUD-20260924/M07-S1-C1I/packet-validation.json)

- [AUD42 C1H final gate result — FAIL / OPEN](04_audit/evidence/AUD-20260924/M07-S1-C1H/final-gate-result.md)
- [AUD42 C1H quality-bar results](04_audit/evidence/AUD-20260924/M07-S1-C1H/quality-bar-results.json)
- [AUD42 C1H command records](04_audit/evidence/AUD-20260924/M07-S1-C1H/command-records.json)
- [AUD42 C1H decision and request](04_audit/evidence/AUD-20260924/M07-S1-C1H/decision-record.md)
- [AUD42 C1H packet and static validation](04_audit/evidence/AUD-20260924/M07-S1-C1H/packet-validation.json)
- [AUD36 C1G stopped preflight result](04_audit/evidence/AUD-20260924/M07-S1-C1G/final-gate-result.md)
- [AUD33 C1F final result — FAIL / OPEN](04_audit/evidence/AUD-20260924/M07-S1-C1F/final-gate-result.md)
- [AUD29 R1 delivery and repository re-audit](04_audit/0570_r1_delivery_repository_reaudit_2026-09-24.md)
- [AUD29 roadmap](03_build/0346_aud29_roadmap.md)
- [AUD29 detailed backlog](03_build/0347_aud29_backlog.md)
- [AUD43 C1I approval request](04_audit/evidence/AUD-20260924/M07-S1-C1I/approval-request.md) — SHA-256 `86bc71b2bf7dac7f500a3dbb8a942e5d4cbeb9d6638ac43bf9dd65d923b1af57`
- [AUD43 C1I packet validation](04_audit/evidence/AUD-20260924/M07-S1-C1I/packet-validation.json)
- [AUD43 C1I command plan](04_audit/evidence/AUD-20260924/M07-S1-C1I/command-plan.json) — 36 frozen steps; stopped at candidate freeze
- [AUD44 next documentary action](03_build/0348_next_stage_c1_decision.md)
- [C1 interrupted result and command records](04_audit/evidence/AUD-20260923/M07-S1-R1-C1/final-gate-result.md)
- [C1 command provenance](04_audit/evidence/AUD-20260923/M07-S1-R1-C1/command-records.json)
- [C1E output-path and npm-binding gate proposal](04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-gate.md)
- [C1E correction preview](04_audit/evidence/AUD-20260923/M07-S1-R1-C1/output-path-correction-preview.md)
- [Historical R1 human decision](04_audit/evidence/AUD-20260923/A24-04-R0/human-decision-r1-20260923.md)
- [Historical R1 Node 22 resume procedure](04_audit/evidence/AUD-20260923/A24-04-R0/node22-resume.md)
- [Historical M07-S1 delivery and repository re-audit](04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md)
- [M07 recovery roadmap](03_build/0343_reaudit_m07_roadmap.md)
- [M07 recovery backlog](03_build/0344_reaudit_m07_backlog.md)
- [historical next stage A24-04](03_build/0345_next_stage_m07_correction.md)
- [Historical A24-04 adjudication ledger](04_audit/evidence/AUD-20260923/A24-04-R0/adjudication-ledger.md)
- [Historical A24-04 proposed SPEC R1 addendum](04_audit/evidence/AUD-20260923/A24-04-R0/spec-r1-amendment.md)
- [Historical A24-04 M07-S1-R1 BUILD gate request](04_audit/evidence/AUD-20260923/A24-04-R0/r1-gate-request.md)
- [M07-S1-R1 result and command evidence](04_audit/evidence/AUD-20260923/M07-S1-R1/final-gate-result.md)
- [Approved C1 correction gate](04_audit/evidence/AUD-20260923/M07-S1-R1/correction-gate-proposal.md)
- [C1 fixture preview applied in the interrupted attempt](04_audit/evidence/AUD-20260923/M07-S1-R1/correction-preview.md)
- [documentation and implementation assessment](04_audit/0567_documentation_and_implementation_assessment_2026-09-22.md)
- [50 prioritized improvements](04_audit/0568_50_melhorias_priorizadas_2026-09-23.md)
- [50 improvements executive plan](03_build/0339_50_improvements_executive_plan.md)
- [50 improvements roadmap](03_build/0340_50_improvements_roadmap.md)
- [50 improvements detailed backlog](03_build/0341_50_improvements_backlog.md)
- [next stage P1-S1](03_build/0342_next_stage_p1_s1.md)
- [M07 package dependency discovery](00_discovery/0017_m07_package_dependencies.md)
- [M07 Discovery gate request](04_audit/evidence/AUD-20260923/M07/discovery-gate-request.md)
- [M07 documentary PRD](01_prd/0028_m07_package_dependencies.md)
- [M07 documentary SPEC](02_spec/0128_m07_package_dependency_governance.md)
- [M07 PRD human gate request](04_audit/evidence/AUD-20260923/M07-PRD/prd-gate-request.md)
- [M07 SPEC human gate request](04_audit/evidence/AUD-20260923/M07-SPEC/spec-gate-request.md)
- [M07 SPEC human decision](04_audit/evidence/AUD-20260923/M07-SPEC/human-decision-20260923.md)
- [M07-S1 local BUILD gate request](04_audit/evidence/AUD-20260923/M07-BUILD-S1/build-gate-request.md)
- [M07-S1 BUILD/AUDIT final result](04_audit/evidence/AUD-20260923/M07-BUILD-S1/final-gate-result.md)
- [M07-S1 execution candidate](04_audit/evidence/AUD-20260923/M07-BUILD-S1/execution-candidate-manifest.json)
- [M07-S1 inventory report](04_audit/evidence/AUD-20260923/M07-BUILD-S1/workspace-dependency-report.json)
- [M07-S1 lead review](04_audit/evidence/AUD-20260923/M07-BUILD-S1/lead-review.md)
- [M07-S1 command records](04_audit/evidence/AUD-20260923/M07-BUILD-S1/command-records.json)
- [M07-S1 BUILD quality bar](04_audit/evidence/AUD-20260923/M07-BUILD-S1/quality-bar.json)
- [M07 pre-implementation candidate baseline](04_audit/evidence/AUD-20260923/M07-SPEC/candidate-baseline.json)
- [M07 SPEC review record](04_audit/evidence/AUD-20260923/M07-SPEC/spec-review-record.json)
- [M07 PRD lead review](04_audit/evidence/AUD-20260923/M07-PRD/prd-review-lead.md)
- [M07 PRD review record](04_audit/evidence/AUD-20260923/M07-PRD/prd-review-record.json)
- [P1-S1 human decisions](04_audit/evidence/AUD-20260923/P1-S1/human-decisions-20260923.md)
- [M07 PRD quality bar](04_audit/evidence/AUD-20260923/M07-PRD/quality-bar.json)
- [M07 Gauntlet quality bar](04_audit/evidence/AUD-20260923/M07/quality-bar.json)
- [M05 public Harness composition discovery](00_discovery/0018_m05_public_harness_composition.md)
- [M05 Discovery gate request](04_audit/evidence/AUD-20260923/M05/discovery-gate-request.md)
- [M05 Gauntlet quality bar](04_audit/evidence/AUD-20260923/M05/quality-bar.json)
- [M05 final review evidence](04_audit/evidence/AUD-20260923/M05/final-review-record.json)
- [REM21-019 candidate evidence](04_audit/evidence/AUD-20260921/REM21-019/)
- [REM21-009 offline external packet](04_audit/evidence/AUD-20260921/REM21-009/)
- [AUD21 evidence root](04_audit/evidence/AUD-20260921/)

Historical controlled-lane interpretation after AUD44 (24/09/2026; superseded by AUD47/AUD48): C1F remained the newest
M07-S1 candidate (`89e4d30ce8b2fd1d102a200bc729249a99ebc47499e4d04a79cd7f6633890f1a`).
C1I was approved against request SHA-256
`86bc71b2bf7dac7f500a3dbb8a942e5d4cbeb9d6638ac43bf9dd65d923b1af57` and stopped
at `candidate-freeze` with exit 64 because `C1H_NPM_VERSION_FILE` is undefined.
No C1I candidate or inventory exists. The official Gauntlet state is
`FINISHED / STOP / FAIL`; M07-S1 remains `FAIL / OPEN`. S2/S3/S4 and M05 stay
blocked, G21-5/G21-6 stay closed, and production is `NO_GO`. The next task is
documentary preparation of a separate C1J gate; C1I cannot be repeated.

Historical interpretation before the R1 approval: REM21-019 is conditional with I1 not cleanly accepted;
REM21-009 is complete only offline. G21-5/G21-6 remain closed and production is
NO_GO. M01 document reconciliation is complete. M07 Discovery, PRD 0028 and
SPEC-M07-001 are approved for their documentary stages. The human-approved
M07-S1 BUILD gate ran on candidate
`a00127c13b165b81bd95d2671891e737f50bfb60c482816d0ef9c1b26fa4a797`; result:
FAIL. Inventory is complete but records 22 existing manifest findings, and
coverage misses the statement and branch thresholds. The full tests, focused
tests, typecheck and lint pass. Lead review is conditional at most; I1 is
UNAVAILABLE. M07-S1 stays open and a separately approved correction gate is
required before proceeding. The 23/09 re-audit also found that the recorded
Node 24 run differs from supported Node 22 and that the serialized candidate
fingerprint basis cannot directly reproduce the published digest. A24-04 is
the next read-only task; the 0343/0344 recovery plan requires a new gate for
code or command execution. M05 Discovery is approved with option A
(`/v1/executions` → operational PostgreSQL outbox → `operational-harness` →
`createOperationalHarness()`), legacy pair `published-agent`/`kernel`; M05
follows M07 and is not ready for handoff. G21-5/G21-6 remain closed, production
NO_GO, and M07 Discovery retains its D4 provenance limit.

## Interpretation

Read the runtime state first, then the newest execution-log entry, then the
backlog and task evidence. A task evidence directory is valid only with its
own Discovery/PRD/SPEC/BUILD/AUDIT artifacts and explicit limitations. Empty
historical files are governed by the
[evidence status catalog](04_audit/evidence/empty-artifact-status.json).
