# AAA-41-CRITIC-CLOSURE — Prompt arquivado (cópia fiel do prompt do usuário)

> Arquivado em: 2026-09-16 (UTC) — execução critic-only de fechamento Phase 4.
> Origem: prompt fornecido pelo usuário nesta sessão ("use goal, gauntlet-loop,
> orchestrate, engineering-framework, Salve uma copia ... em seguida implemente
> todo o prompt ... Me entregue um harness State of Art, Triplo AAA de qualidade").
> Destino: pasta `docs/` conforme solicitado. Este arquivo é a cópia de referência;
> a execução segue abaixo na sessão e nos artefatos `docs/phase4/evidence/CRITIC_ONLY_*`.
> Estado-alvo do harness: State of Art, Triplo AAA.

# CVG OPERATIONAL HARNESS
# PHASE 4 — CRITIC-ONLY CERTIFICATION CLOSURE
# AAA-41-CRITIC-CLOSURE

MODE: READ-ONLY / ASSURANCE ONLY

OBJECTIVE:
Obtain one valid, fresh, independent adversarial critic decision against the
exact current Phase 4 candidate and, ONLY if the critic returns APPROVE and
candidate integrity remains intact, release:

PHASE_4_HANDOFF=VERIFIED

THIS RUN MUST NOT MODIFY APPLICATION SOURCE CODE.

---

## 0. MISSION

You are NOT implementing software in this run. You are closing the remaining
independent-assurance gap for CVG Operational Harness Phase 4 — External
Capability Boundary & Governed Composition AAA-41. The current mechanical
candidate is already strongly validated. The unresolved issue is: NO VALID
FRESH INDEPENDENT CRITIC APPROVAL EXISTS FOR THE CURRENT CANDIDATE. Previous
critic attempts returned no report inside their bounded windows. NO_REPORT /
TIMEOUT is NOT APPROVE. Mission: FREEZE → INSPECT → INDEPENDENT CRITIC →
VALIDATE CRITIC → VERIFY NO MUTATION → BIND EVIDENCE → RELEASE HANDOFF IF AND
ONLY IF APPROVED.

## 1. ABSOLUTE READ-ONLY SOURCE RULE

DO NOT MODIFY: apps/**, packages/**, src/**, migrations/**, tests/**,
package.json, lockfiles, tsconfig*, Dockerfile, runtime configuration, CI
workflows, production configuration. DO NOT refactor, format source, fix code,
add tests, change dependencies, Runtime, Orchestrator, Capability Boundary,
Policy, Approval, Effect Journal, or implement Phase 4A. NOT an implementation
round.

## 2. ALLOWED WRITES

Only certification/audit artifacts: docs/phase4/evidence/**,
docs/phase4a/PHASE_4_HANDOFF.md, and existing certification metadata ONLY if the
established certification process requires evidence rebinding. Do not modify
mechanical source candidate. If source modification appears necessary: STOP,
return CRITIC_FOUND_IMPLEMENTATION_BLOCKER, preserve PHASE_4_HANDOFF=BLOCKED.

## 3. READ AUTHORITATIVE STATE

Read first: certification/candidate-manifest.json,
certification/phase10-result.json, docs/phase4/evidence/PHASE4_REPORT.md,
PHASE4_REVALIDATION_20260916.md, FINAL_CRITIC.md, FINAL_CRITIC_REVALIDATION.md,
FINAL_SENTINEL.json, FINAL_SENTINEL_REVALIDATION.json, EVIDENCE_MANIFEST.json,
docs/phase4/SPEC.md, docs/phase4/QUALITY_BAR.md, docs/phase4a/PHASE_4_HANDOFF.md.
Determine exact CURRENT candidate. Do not use stale identifiers from prose.

## 4. RECORD CANDIDATE IDENTITY

Before critic: HEAD, branch, worktree status, candidate digest, composition
fingerprint, certification run ID, evidence manifest digest, timestamp. Create
docs/phase4/evidence/CRITIC_ONLY_CANDIDATE.json or established equivalent.

## 5. PRE-CRITIC MUTATION FINGERPRINT

Deterministic fingerprint of protected candidate scope (Harness Core, Runtime,
Orchestrator, Capability contracts/Registry/Executor, Policy, Approval, Effect
Journal, Context Engine, persistence, worker integration, critical tests, Phase 4
spec + quality bar). Call it PRE_CRITIC_FINGERPRINT.

## 6. DO NOT RERUN ENTIRE ENGINEERING PHASE

Do not rebuild/remediate Phase 4. May READ mechanical evidence and run
non-mutating verification to establish evidence↔candidate correspondence. Do not
create new implementation candidate.

## 7. CRITIC INDEPENDENCE

Fresh-context, read-only, independent, adversarial, candidate-bound. Must NOT be
told implementation is correct / should pass / prior audit strong / approval
needed. Give requirements + candidate + source + tests + mechanical evidence.
Ask it to find reasons to REJECT.

## 8. CRITIC MISSION (verbatim)

"You are the independent adversarial architecture and assurance critic for CVG
Operational Harness Phase 4 — External Capability Boundary & Governed
Composition AAA-41. You are reviewing a frozen candidate. Assume the candidate
is NOT proven. Your job is NOT to help implementation. Your job is to determine
whether this exact candidate deserves independent Phase 4 approval. You are
strictly READ-ONLY. Do not modify files. Do not repair findings. Inspect actual
source, public contracts, dependency directions, tests, PostgreSQL evidence,
mechanical certification artifacts and Phase 4 requirements. Reject
documentation-only claims. Search aggressively for architectural or assurance
violations."

## 9. REQUIRED ATTACK SURFACE (A–T)

A. Core purity — B. Descriptor/implementation separation — C. Single execution
path (Runtime/Policy/Approval/Journal/Audit/Telemetry) — D. Registry (explicit,
immutable, duplicate-free, exact-versioned, deterministic; hunt latest /
auto-discovery / dynamic loading / global mutable) — E. Authority (Skill/Plugin/
MCP/tool/model/user must not grant authority) — F. Capability exposure
(REGISTERED vs EXPOSED vs AUTHORIZED vs EXECUTED) — G. Plugin optional, owns no
Policy/Approval/Runtime/Journal — H. Skill external/instructional — I. MCP
optional/simulated, no mandatory dep, no false real-MCP claim — J. Tenant
isolation (no switch via payload/model/Skill/provider) — K. Durability
(idempotency/journal/approval/replay/restart/unknown-outcome) — L. Composition
fingerprint (deterministic, order-independent, secret-safe, version-aware) —
M. Resume drift — N. Provider replaceability — O. Origin parity (native/skill/
plugin/knowledge/simulated-MCP) — P. Concurrency — Q. Public API (no deep
src/internal imports) — R. Supply chain (no dynamic untrusted loading, no false
sandbox) — S. Evidence integrity (digest/test/scope/sentinel/manifest bound) —
T. Claim honesty (no production exactly-once / real MCP / arbitrary-plugin
sandbox / production-readiness overclaims).

## 10–13. SOURCE / TEST CHALLENGE / QUESTIONS / FORMAT

Must inspect representative implementation+tests per boundary (not reports
only). Challenge mocks vs production path, negative cases, real PostgreSQL
where claimed. Answer P4-Q01…P4-Q20 PASS/FAIL. Finding format: ID / Severity
(CRITICAL/HIGH/MEDIUM/LOW/INFO) / Requirement / Source / Test-Evidence /
Problem / Exploit-Failure-mode / Why-it-matters / Required-action.

## 14–15. DECISION

Exactly one: APPROVE or REJECT. APPROVE only with: no unresolved CRITICAL, no
blocking HIGH, all P4-Q01–Q20 pass, evidence bound to frozen candidate. No
MAYBE/CONDITIONAL/LOOKS_GOOD/NO_REPORT.

## 16–18. WINDOW / RETRY / DIVERSIFY

Prior attempts timed out → allow sufficient bounded time; don't prematurely
kill healthy critic; keep bounded. TIMEOUT/NO_REPORT/TOOL_FAILURE/EMPTY =
CRITIC_INFRASTRUCTURE_FAILURE (neither APPROVE nor REJECT); retry fresh, max 3
attempts unless policy says otherwise; diversify mechanism on repeated infra
failure; same candidate + criteria.

## 19. LEDGER

docs/phase4/evidence/CRITIC_ONLY_ATTEMPTS.md with Attempt / Critic identity /
Candidate digest / Started / Finished / Result (APPROVE/REJECT/TIMEOUT/
NO_REPORT/TOOL_FAILURE) / Mutation / Notes.

## 20. MUTATION PROHIBITION

POST_CRITIC_FINGERPRINT vs PRE_CRITIC_FINGERPRINT must MATCH; else INVALID; list
files; no destructive auto-reset.

## 21–22. REJECT PATH

On REJECT: STOP, no repair; produce CRITIC_ONLY_REJECTION.md (candidate/critic/
findings/severity/required work); keep Phase 4 CONDITIONAL_PASS or FAIL per
rules; PHASE_4_HANDOFF=BLOCKED; return findings. No repair in this run.

## 23–25. APPROVE PATH

Validate exact-candidate review, digest match, MATCH, completeness, Q01–Q20,
no hidden blocker. Create FINAL_CRITIC_APPROVAL.md (phase, HEAD, digests,
critic identity/mode/times, fingerprints, Decision APPROVE, Q01–Q20, findings
by severity, residual limitations, rationale) faithfully. SHA-256 the artifact;
record in manifest.

## 26–29. REBIND / SENTINEL

Rebind evidence manifest (candidate/critic/digest/composition/mechanical/
sentinel) without regenerating candidate. No ceremonial recertification if
binding valid; report staleness honestly. Final read-only closure sentinel over
candidate identity + source fingerprint + mechanical artifact + manifest +
critic approval + digests + mutation sentinel → MATCH. Sentinel ≠ critic; both
required.

## 30–36. HANDOFF

Only if fresh APPROVE + candidate match + no mutation + mechanical valid +
binding valid + sentinel MATCH → Phase 4 PASS (controlled synthetic scope only;
NOT Production GO). Append superseding FINAL INDEPENDENT CLOSURE to
PHASE4_REPORT.md (preserve CONDITIONAL_PASS/timeout/BLOCKED history). On
success update docs/phase4a/PHASE_4_HANDOFF.md top section with
PHASE_4_HANDOFF=VERIFIED + HEAD/digest/composition/mechanical/critic identity/
APPROVE/report SHA/mutation MATCH/sentinel MATCH/scope/NO_GO. Authorization
text: "Phase 4 is independently approved for the controlled synthetic scope and
its frozen capability boundary may now be consumed by Phase 4A implementation."
+ "This is not Production GO." Then STOP — do NOT start Phase 4A
(ConversationState/DialogueManager/ResponseComposer/migrations/consumers).

## 37–38. INFRA-BLOCKED PATH

After bounded retries with no valid report: keep handoff, record
CRITIC_INFRASTRUCTURE_BLOCKED; Phase 4 CONDITIONAL_PASS; Phase 4A BLOCKED;
create CRITIC_INFRASTRUCTURE_BLOCKER.md (attempts/candidate/fingerprints/
failure modes/next mechanism). Do not punish code for infra failure.

## 39–43. INDEPENDENCE / QUALITY

No self-review as critic; else INDEPENDENCE_NOT_PROVEN, no APPROVE. No
majority-vote; one complete adversarial APPROVE > many shallow ones. Quality
gate: source+tests+deps+evidence inspected, Q01–Q20 answered, digest named,
limitations stated, decision present — else INVALID_CRITIC_REPORT → retry.
Minimum depth across: core purity, contracts, registry, runtime composition,
policy/approval/journal, tenant isolation, composition fingerprint, provider
swap, concurrency, public consumer, negative safety. Sampling OK but conclusions
justified. No report-summary-only / test-name-only / coverage-only /
pass-count-only approvals. Chain per question: REQUIREMENT → SOURCE →
EXECUTABLE TEST → CANDIDATE-BOUND EVIDENCE → CONCLUSION. Flag missing links.
Docs support, never substitute. Classify DESIGNED vs IMPLEMENTED vs TESTED vs
PROVEN.

## 44–65. REQUIREMENTS & ATTACK RECIPES (§52–§53, §260–§321)

Critical minima: P4-C01 core purity, P4-C02 descriptor separation, P4-C03 exact
registration, P4-C04 one governed path, P4-C05 bounded fail-closed data, P4-C10
durability/approval, P4-C11 tenant isolation, P4-C13 negative safety, P4-C15
candidate-bound evidence (+ determinism, origin parity, MCP optionality,
provider swap, concurrency, public conformance). Try to break: composition
(duplicate/unknown/latest/post-freeze/missing/ambiguous/order/provider/drift),
authority (skill/plugin/MCP/model/payload/provider escalation), effects
(retry/concurrent/crash/replay/approval-resume/UNKNOWN), public boundary (deep
imports, executable internals via public API). Honor trust model (Core trusted;
local plugin trusted-local; skill lower-trust; model/user/tool/knowledge
untrusted; MCP remote future/unproven if simulated). No false sandbox / real-MCP
/ production demands; keep Phase 4 scope (no 4A/Secretary/multi-agent penalty);
no requirement creep; distinguish defect vs future hardening. Required critic
header (§66) + decision block (§67: FINAL DECISION, counts, Q01–Q20, residual
limitations, rationale). Small validator OK; prefer existing infra. Protected
hash comparison; evidence writes excluded by scope.

## 66–100. WORKTREE / ARTIFACT / CONSISTENCY DISCIPLINE

Dirty worktree may be candidate identity — use manifest, no git clean/reset/
checkout/commit/push. Leave evidence in worktree. Allowed on APPROVE:
FINAL_CRITIC_APPROVAL.md, CRITIC_ONLY_ATTEMPTS.md, EVIDENCE_MANIFEST.json,
PHASE4_REPORT.md, sentinel, PHASE_4_HANDOFF.md. On REJECT: report+ledger+
rejection summary, handoff stays BLOCKED. On infra-blocked: ledger + blocker
report. Final sentinel binds source digest + composition + mechanical digest +
critic digest + manifest digest + handoff state (avoid self-hash loop via
established strategy). MISMATCH → no handoff; evidence-only repair allowed,
rerun sentinel; source change → STOP (new certification needed outside run).
Supersession preserves history; handoff names candidate+critic+sentinels+scope+
NO_GO; freezes Phase 4 boundary for 4A; documents no silent mutation. Closure
report CRITIC_ONLY_CLOSURE.md (§96 structure) links (not duplicates) raw
critic. Machine result CRITIC_ONLY_RESULT.json (§98 schema + §419
independentAssurance) with consistency validator (§99; invalid combos listed;
§100–102 valid combos). Findings control status (§103). No repair (§104–105);
assurance = falsification attempt (§106); APPROVE may carry MEDIUM/LOW/INFO
(§107–109).

## 101–140. BUDGET / ORDER / INTEGRITY

One deep critic > many short (§110). Targeted packet, expandable but not
starved/flooded (§111–114). Inspection order: requirements → contracts → deps →
registry/composition → runtime → policy/approval/journal → tenant/security →
durability/concurrency → public consumer → tests → binding → claim-vs-proof →
decision (§115). No feature work; read-only tests OK if non-mutating (§116–118).
Reproduced required-test failure → REJECT unless environment-only (§119–120).
certification:verify is support, not substitute (§121); verify authority chain,
ignore stale prose (§122–124); dirty-worktree bytes are candidate (§125–127);
report must name HEAD+digest+fingerprint (§128); stale/prior reports INVALID
(§129–130). Record identity without secrets (§131); mechanism agnostic,
independence mandatory (§132–134); no critic shopping after valid REJECT
(§135–136); APPROVE → closure (§137); APPROVE+blocking finding = INVALID
(§138–139); schema-validate (§140).

## 141–180. SENTINEL / STATUS / ANTI-CHEATS

Order: freeze → critic → validate → bind → report supersession → handoff →
final sentinel (PENDING_FINAL_SENTINEL staging if needed to avoid hash cycle;
prefer existing sentinel pattern; simple SHA-256 manifest binding; §141–144).
Human+machine readable; transition CONDITIONAL_PASS→PASS and BLOCKED→VERIFIED
only on success, production NO_GO→NO_GO (§145–150). Formulas §151–154. Success
artifacts §155; reject §156; infra-blocked §157. Terminal outputs §158–160.
No 4A plan/code/prompts/requirements/quality-bar/question/severity/decision
edits after the fact; sentinel/builder/tests/coverage/stale-approval/timeout
are not critics/reviewers (§161–175). No code/format/generated changes even if
trivial — record debt or separate remediation (§176–178). Read-only commands
(check/verify/inspect/test), evidence/metadata exceptions only (§179–181). No
lock/node_modules/network/dependency changes (§182–184). Authorized critic
mechanism only; no secrets/patient data; data minimization (§185–188). Preserve
audit history (§189). Success = boring small evidence diff (§190–191). Final
diff review + artifact + protected hash + critic/manifest/sentinel/handoff
hashes + status consistency + human consistency review (§192–200). Historical
BLOCKED/CONDITIONAL text marked superseded; authoritative top section;
unambiguous status (§201–205).

## 181–221. FINAL QUESTIONS / SEQUENCE / OUTCOMES

§206: fresh independent read-only APPROVE without mutation? YES/NO. §207:
approved bytes == certified bytes? YES/NO. §208: 4A authorized? YES/NO. §209:
production authorized? Expected NO. §210: success iff YES/YES/YES/NO. REJECT or
infra-block honest outcomes; assurance > velocity (§211–213). Principles:
NO APPROVAL WITHOUT REVIEW / NO REVIEW WITHOUT CANDIDATE IDENTITY / NO HANDOFF
WITHOUT APPROVAL / NO PRODUCTION CLAIM FROM CLOSURE / NO CODE CHANGES (§214–218).
Sequence (§219): 1 read state → 2 identify candidate → 3 record identity →
4 fingerprint → 5 validate mechanical binding → 6 critic packet → 7 launch
critic → 8 await bounded report → 9 retry on infra failure (≤3) → 10 STOP on
REJECT → 11 validate APPROVE quality → 12 post-fingerprint MATCH → 13 save/hash
approval → 14 rebind manifest → 15 result → 16 supersede report → 17 VERIFIED
handoff if eligible → 18 final sentinel → 19 consistency → 20 diff inspect →
21 terminal result → 22 STOP. §220: do not continue. §221 terminal outcomes:
A APPROVED (APPROVE+MATCH+VALID+VALID+MATCH → PASS/NO_GO/VERIFIED/4A YES STOP);
B REJECTED (REJECT preserved, CONDITIONAL_PASS or FAIL, NO_GO, BLOCKED, 4A NO,
separate remediation); C INFRASTRUCTURE BLOCKED (CONDITIONAL_PASS, NO_GO,
BLOCKED, 4A NO). No fourth outcome.

## 222–260. PACKET & ROLES

CRITIC_ONLY_REVIEW_PACKET.md with pointers (HEAD/digest/composition/requirements
version/cert run/manifest/scope/limitations + entry points: contracts, registry,
factory/composition, runtime adapter, worker durable path, policy/approval/
journal, tenant/context, fingerprint impl, public consumer, negative tests)
(§222). Neutral language — "attempt to falsify", no bias (§223); historical
timeouts stated without implying approval (§224); controlled-synthetic scope,
non-goals (4A/Secretary/Rick/multi-agent/real MCP/provider/channel/deploy),
trust/MCP/durability limits (§225–229). Hash packet, record SHA (§230); reuse
across infra retries (§231); revision protocol on factual fix (§232); no change
after valid REJECT (§233). Preserve raw per-attempt (critic-only/attempt-NN-raw
.md), normalized wrapper if needed (no semantic edits), hash both, identify
both (§234–238). Completeness: candidate/requirements/areas/findings/decision
(§239); partial → INCOMPLETE_REPORT, preserve, fresh retry allowed unless valid
decision exists (§240); partial with concrete CRITICAL →
POTENTIAL_BLOCKING_FINDING_REQUIRES_REVIEW, no handoff, conservative stop
(§241). Conflicting valid critics → CRITIC_DISAGREEMENT, BLOCKED, separate
resolution (§242). First valid complete decision stops acquisition — no shopping
(§243); timeouts aren't opinions (§244). Independence record + validator
(§245–246). Critic reads; controller writes after (§247–253: controller/critic/
mechanical/sentinel/evidence roles; document separation). Authority chain §254;
mechanical = gates pass? (§255); critic = claims supported? (§256); sentinel =
same bytes? (§257); handoff = may next phase consume? (§258); production
separate (§259).

## 261–340. DEEP CHECKS (falsification recipes)

False positives (fake registry, worker bypass, harness-swapped provider test,
metadata-only tenant check, count-only journal, fingerprint omitting security
field, throw-after-execute negative, origin silently changing policy) (§260);
terminology ≠ semantics (§261); TOCTOU validate→mutate→execute vs freeze
(§262); descriptor mutation/serialization leaks (§263–264); prototype/accessor/
non-finite/cyclic/oversized inputs fail-closed before effect (§265–268);
provider result validation; UNKNOWN ≠ silent failure-retry (§269–270); approval
replay/drift pinning (§271–272); agent/tenant self-selection; correlation ≠
authorization; telemetry cardinality/payload leakage; secret/executable-body in
fingerprint; order instability; version ambiguity/fallback/origin fallback
(§273–282); hidden paths (.execute/.invoke/handlers outside executor/adapter),
ToolRegistry access semantics, model-facing executor, user-selected impl,
dynamic import/require/eval/Function/shell from metadata, marketplace install,
MCP client dep, skill executability, knowledge authority, product-domain terms
in Core (§283–292); second consumer proof, deep-import finding, provider-swap
same-path proof, concurrent registration/execution, global state/reset hooks/
pollution, worker parity, HTTP/admin bypass, test-only guards, production
guard, real data/credentials/network, supply-chain/production/exactly-once/
sandbox/MCP/tenant/evidence overclaims (§293–315); sentinel scope/manifest/
exclusions/generated-evidence/requirement-freeze/drift/baseline/format-repair
(§316–323); Postgres clock repair must preserve state machine — injected
controlled clock OK; reject assertion-removal/timeout-bump/skip/mock-away/
semantics-change-to-fit-fixture (§324–326); skipped/chaos-policy/load/restore/
SBOM/security/coverage/evals review scoped to Phase 4 criticality (§327–335);
evidence strength STRONG/ADEQUATE/WEAK/MISSING; missing critical blocks
(§336–338); APPROVE = controlled claims sufficiently supported, not perfect
(§339); preserve limitations (§340–343); controller validates artifact, not
architecture (§344); no second-guessing valid REJECT/APPROVE (§345–346);
record SHA chain (§347–358: approval/packet/candidate/composition/mechanical/
manifest/sentinel + closure chain artifact + validator); immutability +
normalization transparency; EN/PT allowed, decision tokens machine-readable;
IDs P4-CRIT-NNN / P4-CRITIC-ATTEMPT-NN / infra codes (§359–366); history
preserved; ledger examples (§367–374); handoff validator, no force/override,
no emergency bypass, no user-approval substitute, no self-signoff (§375–379);
handoff content §380; history below (§381–384); don't rewrite phase10-result
semantics; mechanical vs phase decision may differ; single current authority;
no contradictory dashboard (§385–388); optional status-doc updates
(runtime/log/backlog) evidence-only (§389–391).

## 341–436. DIFF / RESULT / CLOSE

Zero TS/SQL/manifest/lock/CI/config/app diff expected; assert mechanically;
nonzero unexpected → no handoff; baseline = frozen candidate, not clean HEAD;
before/after fingerprint primary; start/end markers; evidence excluded by
scope; tests/manifests/migrations/config included; build output per policy
(§392–412). Binary closure score INDEPENDENT_ASSURANCE=CLOSED|OPEN (§413–418 +
§419 JSON). Ask falsification-tested-and-approved? prerequisite-satisfied?
production? (§420–422). Evidence-first, no marketing ("rock solid" etc.);
prefer "approved for the controlled Phase 4 scope" (§423–425). Preserve
production NO_GO + pending validations (§426); 4A may begin despite NO_GO via
frozen boundary; no casual reopen (§427–429). Complete iff A/B/C exactly
(§430–431). Stop on valid REJECT / mutation / unresolvable mismatch /
impossible independence; continue only for infra-timeout/invalid-incomplete/
evidence-binding-after-APPROVE (§432–433). No implementation escalation (§434).
§435 execution instruction (as §219 + outcome tree). §436 final line exactly
one of: PHASE4_CRITIC_CLOSURE=APPROVED | REJECTED | INFRASTRUCTURE_BLOCKED.
END OF PROMPT.

---

## Nota do executor

Cópia arquivada para cumprir a ordem "Salve uma copia do seguinte prompt na
pasta docs". A implementação integral do prompt segue nesta mesma rodada sob as
skills `engineering-framework`, `gauntlet-loop` e `orchestrate`, com meta ativa
(goal) e proibição de alterar código-fonte da aplicação.
