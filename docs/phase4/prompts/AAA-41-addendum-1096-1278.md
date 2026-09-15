raw evidence where needed.

---

# 1096. TEST RESULT SUMMARY

Record:

command
exit code
test count
pass/fail/skip
duration
candidate digest.

---

# 1097. PHASE 3 BASELINE COMPARISON

Final report must compare:

Phase 3:
256 files
1785 pass
111 skipped
Postgres 26/196/0
evals 10/10

against actual Phase 4 final counts.

Explain differences.

Do not assume counts remain identical.

---

# 1098. NO REGRESSION COUNT THEATER

More tests does not automatically mean better architecture.

---

# 1099. SKIP REVIEW

Review all new Phase 4 skips.

Critical skips require explicit status.

---

# 1100. FLAKINESS REPORT

Create if any critical concurrency/restart test exhibits instability.

---

# 1101. CONCURRENCY ROUNDS

Recommended >=20 rounds for critical external side-effect concurrency when
runtime cost permits.

---

# 1102. RESTART ROUNDS

Repeat fresh-pool/process restart proof multiple times when practical.

---

# 1103. COMPOSITION REPRODUCIBILITY ROUNDS

At least two independent generations.

---

# 1104. AUTHOR EXPERIENCE REPRODUCIBILITY

If fresh-context builder test is used, record exact public docs/API supplied.

---

# 1105. CRITIC INDEPENDENCE

Critic should use fresh context where orchestration allows.

Do not prime critic with:

"implementation is correct".

Provide:

requirements
candidate
evidence.

Ask to find rejection grounds.

---

# 1106. CRITIC ROUND LIMIT

No arbitrary hard limit if critical findings continue.

Stop when:

APPROVE

or a blocker cannot be repaired in scope and Phase is honestly downgraded.

---

# 1107. CRITIC FINDING SEVERITY

Classify:

CRITICAL
HIGH
MEDIUM
LOW
INFO.

Unresolved CRITICAL:

FAIL.

Unresolved HIGH:

normally prevents full PASS unless explicitly non-critical/out-of-scope with
strong justification.

---

# 1108. CRITIC REPAIR TRACEABILITY

Each repaired finding maps to:

code diff
test
evidence.

---

# 1109. CRITIC CLOSURE

Do not mark finding closed only because documentation changed if source bug
remains.

---

# 1110. EVIDENCE SENTINEL SCOPE

Sentinel should cover:

critical source
public contracts
extension fixtures
tests
migrations
result JSON
critic report
evidence manifest.

---

# 1111. SENTINEL EXCLUSIONS

Exclude volatile caches/build artifacts deliberately and document.

---

# 1112. SENTINEL MISMATCH

No PASS until reconciled.

---

# 1113. POST-SENTINEL IMMUTABILITY

No source modifications after final MATCH.

If modification occurs:

re-run affected certification.

---

# 1114. FINAL REPORT SOURCE REFERENCES

Where useful cite:

package
file
symbol
test ID.

---

# 1115. FINAL REPORT CLAIM LEVEL

Each major claim:

PROVEN
PARTIAL
NOT_PROVEN.

---

# 1116. FINAL REPORT LIMITATIONS

Must prominently state limitations.

---

# 1117. FINAL REPORT NO MARKETING

No:

"bulletproof"
"perfect"
"fully secure"
"enterprise production-ready"

without corresponding proof.

---

# 1118. FINAL REPORT STATE-OF-ART

If declaring State-of-Art candidate:

explain exactly why and residual limitations.

---

# 1119. FINAL REPORT TRIPLE-A

If declaring Triple-A candidate:

show three AAA axis scores.

---

# 1120. FINAL REPORT PRODUCTION

Production status remains independent.

---

# 1121. PRODUCTION GO IS NOT PHASE TARGET

Do not spend Phase scope trying to force Production GO.

---

# 1122. PHASE 4 NON-GOALS SECTION

Explicitly include:

real Secretary integration
real Rick integration
real Corp integration
real WhatsApp
real agenda
real clinical data
real MCP network
remote Plugin installation
arbitrary untrusted code sandbox
marketplace
Control Plane
Skill Runtime
Conversational Intelligence.

---

# 1123. FINAL NEXT-PHASE OPTIONS

If Phase 4 strong:

Option A:
PHASE 4A — Conversational Intelligence Layer.

Option B:
PHASE 4.x — Hardening if critic/evidence exposes residual architectural debt.

Do not recommend multi-agent yet.

---

# 1124. WHY NOT MULTI-AGENT YET

The system should first prove:

single-agent product behavior
external capabilities
conversation quality
real product migration

before introducing multi-agent complexity.

Document if relevant.

---

# 1125. WHY CONVERSATIONAL INTELLIGENCE NEXT

The original Secretary problem was:

too deterministic → mechanical.

too probabilistic → unsafe.

With Phases 2–4, consequence governance is now separated from conversational
behavior.

Phase 4A can therefore allow more language flexibility while retaining hard
action/fact boundaries.

---

# 1126. PHASE 4A PRINCIPLE PREVIEW

LANGUAGE FLEXIBLE.

FACTS GROUNDED.

ACTIONS GOVERNED.

STATE DURABLE.

HANDOFF EXPLICIT.

---

# 1127. PHASE 4A SHOULD BE PRODUCT-LAYER FIRST

Do not immediately add conversational persona to Harness Core.

Use generic dialogue primitives only where truly reusable.

---

# 1128. FINAL SANITY REVIEW

Before declaring Phase complete, ask:

Did we solve the requested architectural problem?

Or did we simply create a large plugin framework?

If the latter:

simplify.

---

# 1129. COMPLEXITY REDUCTION PASS

After features work, perform one pass specifically looking for unnecessary
abstractions introduced during Phase 4.

Candidates:

duplicate registries
duplicate manifests
redundant factories
unnecessary inheritance
generic managers
unused future hooks.

Remove where safe.

---

# 1130. YAGNI REVIEW

For every future-facing feature not used by Phase 4 proofs:

consider removing or documenting instead.

---

# 1131. MINIMAL CORE

Keep Core as small as possible while satisfying:

generic capability execution
governance
composition
reproducibility.

---

# 1132. OPTIONAL PACKAGES

Prefer optional Adapter packages for protocol-specific integrations.

---

# 1133. PACKAGE COHESION

Each package should have a clear reason to exist.

---

# 1134. PACKAGE COUNT IS NOT SCORE

Do not create packages to look modular.

---

# 1135. FILE COUNT IS NOT SCORE

Same.

---

# 1136. TEST COUNT IS NOT SCORE

Same.

---

# 1137. DOCUMENT COUNT IS NOT SCORE

Same.

---

# 1138. QUALITY IS IN INVARIANTS

The strongest Phase 4 proof is:

add/remove/swap extension

without touching Core

while governance remains intact.

---

# 1139. PRIMARY DEMONSTRATION

Produce a final executable demonstration with three variants:

VARIANT A — NO SKILL

Agent Profile
→ external Capability
→ governed execution.

VARIANT B — WITH SKILL

Same Core
→ external Skill guidance
→ same governed Capability.

VARIANT C — SWAPPED PROVIDER

Same Agent/Profile semantics
→ alternative Capability Adapter/Plugin implementation
→ Runtime unchanged.

If simulated MCP adapter is implemented, optional:

VARIANT D — MCP-SHAPED PROVIDER.

---

# 1140. DEMONSTRATION ASSERTIONS

Across variants:

Runtime source unchanged.
Policy path unchanged.
Approval path unchanged.
Effect Journal path unchanged.
Audit path unchanged.
Tenant isolation unchanged.

---

# 1141. DEMO MACHINE OUTPUT

Emit structured summary for evidence.

---

# 1142. DEMO HUMAN OUTPUT

Also print concise readable trajectory.

No hidden reasoning.

---

# 1143. TRAJECTORY EXAMPLE

Conceptual only:

STEP 1 DECIDE capability.read
STEP 2 POLICY ALLOW
STEP 3 EXECUTE plugin:synthetic.read@1.0
STEP 4 OBSERVE
STEP 5 VERIFY
STEP 6 RESPOND
STOP COMPLETED.

Use actual trajectory.

---

# 1144. SKILL TRAJECTORY

Skill identity can appear as context provenance.

It must not appear as execution authority.

---

# 1145. PLUGIN TRAJECTORY

Plugin identity appears as Capability provenance.

---

# 1146. MCP TRAJECTORY

If simulated, source=MCP_SIMULATED or equivalent honest label.

---

# 1147. AUDIT PROOF

Audit timeline must correspond to actual trajectory.

---

# 1148. EFFECT PROOF

Side-effect demo verifies durable synthetic effect count.

---

# 1149. APPROVAL PROOF

High-risk variant demonstrates pause/resume.

---

# 1150. DRIFT PROOF

One demo/test shows incompatible composition resume rejected.

---

# 1151. SECRET PROOF

One demo/test shows secrets absent from safe surfaces.

---

# 1152. CORE PURITY PROOF

One build/test physically excludes extension fixtures.

---

# 1153. REPLACEABILITY PROOF

One source-diff/evidence artifact shows no Core changes when adding second
extension.

---

# 1154. FINAL EVIDENCE INDEX

Create:

docs/phase4/evidence/INDEX.md

Map each major proof to artifact/test.

---

# 1155. MACHINE-READABLE TRACEABILITY

If useful:

docs/phase4/evidence/TRACEABILITY.json

---

# 1156. FINAL CRITICAL REQUIREMENT COUNT

Report:

total critical requirements
proven
partial
failed
not proven.

---

# 1157. NO HIDDEN PARTIAL

Do not call PASS if critical item is actually PARTIAL unless PASS criteria
explicitly allow it.

---

# 1158. FINAL SCORE CAPS

Apply caps before overall score.

Examples:

Core product dependency:
overall <= 50.

Policy bypass:
overall <= 30.

Tenant leak:
overall <= 20.

Effect duplicate:
overall <= 40.

Skill inside Runtime Core:
overall <= 60.

MCP mandatory:
overall <= 70.

Evidence stale:
cannot finalize PASS.

---

# 1159. CONDITIONAL PASS EXAMPLES

Acceptable CONDITIONAL_PASS:

architecture E5 except real process restart blocked by local environment while
all structural invariants hold.

Or:

MCP only M1/M2 because real transport intentionally out of scope.

Do not use CONDITIONAL_PASS to hide security violation.

---

# 1160. FAIL EXAMPLES

Skill can call execute directly.

Plugin can mutate Policy.

Core cannot boot without Skill package.

Cross-tenant Capability leakage.

External effect duplicates after crash.

These are FAIL.

---

# 1161. FINAL PHASE NAME IN ALL REPORTS

Use consistently:

CVG Operational Harness
Phase 4 — External Capability Boundary & Governed Composition
AAA-41.

---

# 1162. FINAL ARCHITECTURAL VERSION

If project tracks architecture version, increment appropriately.

Do not invent release version if no convention exists.

---

# 1163. RELEASE

Do not publish package/release automatically.

---

# 1164. TAG

Do not create git tag automatically.

---

# 1165. COMMIT

Do not auto-commit.

---

# 1166. PUSH

Do not push.

---

# 1167. DEPLOYMENT

Do not deploy.

---

# 1168. EXTERNAL NETWORK

Do not access arbitrary remote extension sources.

---

# 1169. REAL CREDENTIALS

Do not use.

---

# 1170. REAL PATIENT DATA

Do not use.

---

# 1171. REAL CUSTOMER DATA

Do not use.

---

# 1172. FINAL USER-ORIENTED EXPLANATION

At the end, in addition to technical report, explain in simple terms:

Before Phase 4:

Harness knew how to run generic iterative agents but its capabilities were
primarily composed internally.

After Phase 4:

Harness can accept externally supplied, versioned capabilities through a
governed contract without absorbing their domain logic.

Skills remain outside.

Plugins remain optional.

MCP remains optional.

Use actual result and adjust if not fully achieved.

---

# 1173. FINAL LEARNING MAP

Include in report:

LLM thinks.
Skill teaches.
Tool/Capability acts.
MCP connects.
SDK facilitates.
Adapter translates.
Gateway routes.
Runtime maintains the cycle.
Orchestrator conducts the cycle.
Policy authorizes.
Approval human-gates.
Harness governs the whole execution.

Clarify:

Skill is outside Harness Core.

Capability Boundary is inside Harness because the engine needs a generic
socket through which external capabilities can be consumed safely.

---

# 1174. SOCKET ANALOGY

Use as architectural sanity check:

The Harness contains the SOCKET.

It does not contain every DEVICE that will ever be plugged into that socket.

Capability Boundary = socket.

Skill/Plugin/MCP integration = things plugged into or translated for that
socket.

This distinction is fundamental.

---

# 1175. FINAL PURITY STATEMENT

For PASS, the final report must be able to state truthfully:

"The CVG Operational Harness owns the socket, not the appliance."

---

# 1176. FINAL REPLACEABILITY STATEMENT

For PASS:

"Changing an external capability provider does not require redesigning the
Runtime."

---

# 1177. FINAL SKILL STATEMENT

For PASS:

"Removing all Skills does not remove the Harness's ability to execute agents."

---

# 1178. FINAL PLUGIN STATEMENT

For PASS:

"Plugin support extends the Harness but is not required for Harness existence."

---

# 1179. FINAL MCP STATEMENT

For PASS:

"MCP is an optional adapter/protocol, not a core architectural dependency."

---

# 1180. FINAL AUTHORITY STATEMENT

For PASS:

"No extension source can grant itself execution authorization."

---

# 1181. FINAL EXECUTION STATEMENT

For PASS:

"Every agent-selected side effect continues through Runtime governance,
Policy/Approval and Effect Journal regardless of capability origin."

---

# 1182. FINAL DURABILITY STATEMENT

For PASS:

"External capability composition does not weaken durable checkpoint/restart
semantics."

---

# 1183. FINAL SECURITY STATEMENT

For PASS:

"Instructional extensibility is separated from authority."

---

# 1184. FINAL LIMITATION STATEMENT

For honesty:

"Phase 4 does not prove safe execution of arbitrary malicious in-process plugin
code without OS/process isolation."

This limitation must remain explicit unless such isolation is actually
implemented and certified.

---

# 1185. FINAL MCP LIMITATION STATEMENT

If only simulated adapter:

"Phase 4 proves MCP architectural compatibility, not real MCP transport
certification."

---

# 1186. FINAL PRODUCT LIMITATION STATEMENT

"Phase 4 does not certify Secretary, Rick Professor or CVG Corp."

---

# 1187. FINAL PRODUCTION LIMITATION STATEMENT

"Phase 4 PASS does not imply Production GO."

---

# 1188. FINAL CRITIC PROMPT

When invoking the independent critic, use a mission equivalent to:

"You are the adversarial architecture and assurance critic for CVG Operational
Harness Phase 4. Assume the candidate is NOT proven. Attempt to demonstrate
that external Skills, Plugins, MCP adapters or capabilities have leaked
authority or dependencies into Harness Core. Inspect source, dependency graph,
public APIs, tests, PostgreSQL evidence, composition fingerprints and security
boundaries. Reject documentation-only claims. Search specifically for direct
execution bypass, Policy/Approval bypass, global registries, dynamic code
loading, tenant leakage, composition drift, stale evidence, false sandbox
claims and product-domain coupling. Return APPROVE only when all critical
requirements are supported by fresh executable evidence."

Do not give critic implementation author's conclusions as facts.

---

# 1189. FINAL CRITIC OUTPUT FORMAT

Critic report:

Candidate:
Digest:
Round:
Decision:

Critical findings:
High findings:
Medium findings:
Low findings:

Core purity:
Capability boundary:
Skill boundary:
Plugin boundary:
MCP boundary:
Governance:
Durability:
Tenant isolation:
Supply chain:
Evidence integrity:

Q1–Q28 results:

Final reason:
Required repairs:

---

# 1190. FINAL REPAIR LOOP

While critic = REJECT:

1. classify findings;
2. repair source;
3. add/strengthen tests;
4. rerun affected gates;
5. regenerate affected evidence;
6. update candidate digest;
7. rerun critic.

Do not merely argue with critic when executable proof can settle the issue.

---

# 1191. STOP CONDITION FOR REPAIR LOOP

Stop when:

APPROVE

or:

a critical requirement cannot be satisfied within scope.

In second case:

Phase = FAIL or CONDITIONAL_PASS only if requirement is explicitly non-critical.

---

# 1192. FINAL CERTIFICATION FREEZE

After critic APPROVE:

no feature work.

Only:

final verification
evidence refresh
consistency check
sentinel.

---

# 1193. FINAL CONSISTENCY VALIDATOR

Mechanically compare:

Phase result JSON
critic decision
sentinel result
scorecard
maturity levels
production status.

Contradiction:

certification failure until corrected.

---

# 1194. FINAL PHASE 4 REPORT STATUS BLOCK

Use exact fields:

Phase:
Candidate Digest:
Composition Fingerprint:
Phase Status:
Production Status:
Certification Level:
Triple-A Candidate:
State-of-Art Candidate:
Supply-Chain Level:
Skill Interoperability Level:
Plugin Extensibility Level:
MCP Readiness Level:
Capability Maturity Level:
Independent Critic:
Final Sentinel:
Overall Phase Score:
Overall Harness Maturity:
Next Recommended Phase:

---

# 1195. FINAL TECHNICAL SUMMARY

Include:

Core packages changed:
Extension packages created:
Public APIs added:
Migrations added:
Critical tests added:
Evals added:
Architecture gates added:
Security tests added:
PostgreSQL proofs:
Restart proofs:
Concurrency proofs:
Critic rounds:
Residual risks:

Use real values.

---

# 1196. FINAL CHANGE SURFACE SUMMARY

Show whether adding second:

Capability
Skill
Plugin

required Core changes.

Desired:

NO.

---

# 1197. FINAL BOUNDARY SUMMARY

Classify components:

HARNESS CORE
HARNESS SUPPORT
EXTENSION CONTRACT
EXTERNAL EXTENSION
PRODUCT LAYER
FUTURE/OUT-OF-SCOPE.

---

# 1198. FINAL CORE CONTENT

Expected conceptual Harness Core/support after Phase 4:

Contracts
Runtime V1/V2
Hybrid Orchestrator
Context Engine
Capability Boundary
Capability Registry
Capability Executor
Policy
Approval
Model Gateway
State/Persistence
Effect Journal
Audit
Telemetry
Worker/Durable Spine.

---

# 1199. FINAL EXTERNAL CONTENT

Expected external:

Skills
Plugin implementations
MCP adapter package if optional
domain Tools
domain Knowledge Providers
product AgentProfiles
product conversation behavior.

Some generic adapter interfaces may belong to Harness support.

---

# 1200. FINAL PHASE 4 COMMAND

Execute now and continue autonomously through all implementation and
certification stages permitted by the environment.

DO NOT stop to ask for confirmation between ordinary implementation phases.

DO NOT lower gates because implementation is difficult.

DO NOT mix Skills into Harness Core.

DO NOT confuse capability interoperability with Skill ownership.

DO NOT build product-specific behavior .

DO NOT make MCP mandatory.

DO NOT grant Plugins authority.

DO NOT bypass Runtime V2.

DO NOT bypass Policy.

DO NOT bypass Approval.

DO NOT bypass Effect Journal.

DO NOT weaken tenant isolation.

DO NOT weaken Phase 2 durability.

DO NOT weaken Phase 3 iterative Runtime guarantees.

DO NOT claim arbitrary untrusted Plugin sandboxing.

DO NOT claim real MCP certification without real MCP proof.

DO NOT claim Production GO unless independently proven.

Execute:

CVG OPERATIONAL HARNESS
PHASE 4 — EXTERNAL CAPABILITY BOUNDARY & GOVERNED COMPOSITION
AAA-41

Target:

STATE-OF-THE-ART CANDIDATE
TRIPLE-A CANDIDATE

subject to executable evidence.

Begin with Phase 3 handoff verification.

---

# 1201. POST-PHASE ARCHITECTURAL CLOSURE

After all Phase 4 requirements have been implemented and independently
certified, perform one final architectural closure review.

This review is NOT intended to add features.

Its purpose is to determine whether the Phase has actually reached a stable
architectural boundary.

Ask:

1. Is Capability Boundary now generic?
2. Is Core still pure?
3. Are Skills still external?
4. Are Plugins still optional?
5. Is MCP still optional?
6. Is composition deterministic?
7. Are external implementations replaceable?
8. Is governance unchanged in authority?
9. Are Phase 2 durability guarantees preserved?
10. Are Phase 3 iterative guarantees preserved?
11. Can we now STOP modifying Harness Core for ordinary new capabilities?

If the answer to #11 is NO:

identify why before closure.

---

# 1202. CORE STABILITY TARGET

A major goal of Phase 4 is to reach a point where ordinary future work such as:

add appointment capability
add document-search capability
add email capability
add internal-report capability
add clinical knowledge provider
add another Skill
add MCP adapter

does NOT require modification to:

Runtime V2
Hybrid Orchestrator Core
Worker
Policy Engine
Approval Engine
Effect Journal.

This is a key architectural maturity signal.

---

# 1203. CORE CHANGE EXPECTATION AFTER PHASE 4

After successful Phase 4, Core modifications should generally be reserved for:

new generic execution semantics
new governance primitives
new durability primitives
new generic capability protocol features
security hardening
performance/reliability improvements.

Not ordinary business capabilities.

---

# 1204. PRODUCT DEVELOPMENT EXPECTATION

Future product development should increasingly occur in:

AgentProfiles
Skills
Product policies/configuration
Domain Knowledge
Adapters
Capability implementations
Conversation layer.

This is intentional.

---

# 1205. ARCHITECTURAL FREEZE RECOMMENDATION

If Phase 4 achieves strong E5/Triple-A candidate status:

recommend a temporary:

HARNESS CORE FEATURE FREEZE

while Phase 4A and the first product pilot validate the architecture.

This does NOT mean no bug/security fixes.

It means avoid speculative Core expansion until a real product proves a
missing generic primitive.

---

# 1206. WHY FREEZE MATTERS

Without a temporary freeze, there is a risk of continuing to add generic
abstractions without real product pressure.

The next maturity step should come from consumption of the Harness, not
continued theoretical Core expansion.

---

# 1207. CONSUMER-DRIVEN EVOLUTION

Future Core changes should preferably be justified by:

at least one real consumer requirement

and ideally:

two independent consumer patterns

before being generalized.

---

# 1208. RULE OF TWO

When considering a new generic Harness abstraction after Phase 4:

Ask whether at least two distinct product/capability scenarios need it.

If only one:

keep it outside Core until generality is demonstrated.

Exceptions:

security
correctness
durability

may justify Core change immediately.

---

# 1209. FIRST CONSUMER VALIDATION

Phase 4A synthetic conversation layer should become the first consumer pressure
test.

After that:

CVG Agent Secretary pilot.

This will reveal whether Capability Boundary is actually ergonomic.

---

# 1210. SECOND CONSUMER VALIDATION

A later independent consumer, potentially:

Rick Professor

or:

CVG Corp

should prove the architecture is not accidentally Secretary-shaped.

---

# 1211. DO NOT FORCE ALL PRODUCTS ONTO HARNESS

Even after Phase 4, evaluate each product independently.

A product should use CVG Operational Harness when its execution model benefits
from:

governed agent loop
durability
capabilities
Policy
Audit
state.

Do not migrate software merely for architectural uniformity.

---

# 1212. RICK ARCHITECTURE REMAINS OPEN

Do not decide in Phase 4 whether Rick Professor becomes:

A. a Harness-powered product;

or

B. an external Knowledge Service consumed by Harness.

That decision belongs to a separate product architecture review.

---

# 1213. CORP ARCHITECTURE REMAINS OPEN

Same principle.

---

# 1214. SECRETARY IS LIKELY FIRST PILOT, NOT CORE OWNER

The fact that Harness originated from Secretary does NOT give Secretary
special status inside Core.

This must remain true.

---

# 1215. BROWNFIELD ORIGIN CHECK

Review names/comments/docs for residual assumptions that:

Harness exists for Secretary.

Remove misleading architectural language when safe.

Preserve historical provenance docs.

---

# 1216. HISTORICAL PROVENANCE

Do NOT erase:

Harness originated from cvg-agent-secretary-v2 brownfield extraction.

History is valuable.

But history must not become dependency.

---

# 1217. FINAL BROWNFIELD TEST

Search Core source for obsolete Secretary-specific terminology.

Classify:

historical harmless
test fixture
architectural leak.

Repair leaks.

---

# 1218. GENERIC NAMING REVIEW

Review symbols like:

SecretaryTool
SecretaryContext
SecretaryRuntime
SecretaryApproval

that may have survived extraction.

Rename only when they represent generic concepts.

Do not perform blind global rename.

---

# 1219. DOMAIN SEMANTIC REVIEW

Search Core for:

appointment
patient
tutor
veterinarian
clinical
hospital
shift handoff

and manually classify occurrences.

Core architectural dependency on these concepts:

FAIL purity.

Historical docs/examples are allowed when clearly outside Core.

---

# 1220. NON-VETERINARY PROOF

The second synthetic unrelated-domain profile from requirement #1035 should
serve as mechanical evidence that Core does not require veterinary semantics.

---

# 1221. PORTABILITY STATEMENT

If proven, final report may state:

"The Harness Core is domain-neutral at the tested architectural boundary."

Do not claim universal applicability beyond evidence.

---

# 1222. LANGUAGE/LOCALE NEUTRALITY

Harness Core should not assume pt-BR conversational wording.

Locale/persona belong Product/Profile.

Generic error codes can later be localized.

---

# 1223. TIMEZONE NEUTRALITY

Core stores canonical timestamps/UTC as already established.

Product interprets "amanhã às 15h" using contextual locale/timezone services.

Do not put São Paulo timezone into Harness Core.

---

# 1224. CHANNEL NEUTRALITY

Core remains independent of:

WhatsApp
web chat
Telegram
voice
email.

Channels adapt input/output externally.

---

# 1225. MODEL NEUTRALITY

Model Gateway preserves provider independence.

Phase 4 must not couple extension system to a particular LLM vendor.

---

# 1226. DATABASE IMPLEMENTATION BOUNDARY

Phase 4 should not unnecessarily expose PostgreSQL specifics to extensions.

Durable Core may use PostgreSQL internally.

Extension contract should not require it.

---

# 1227. WORKER NEUTRALITY

Extensions should not need to know Worker implementation.

---

# 1228. QUEUE NEUTRALITY

Same.

---

# 1229. AUDIT IMPLEMENTATION NEUTRALITY

Extensions know audit semantics only indirectly through Harness behavior.

They do not need ledger implementation details.

---

# 1230. EFFECT JOURNAL IMPLEMENTATION NEUTRALITY

External Capability implementation participates via governed protocol, not
direct table access.

---

# 1231. EXTENSION CONTRACT LONGEVITY REVIEW

Before freezing Extension API v1 candidate:

review whether it exposes unnecessary implementation details that would make
future changes difficult.

Remove leakage before certification.

---

# 1232. EXTENSION API MINIMALISM QUESTIONS

For each public field ask:

Does an extension author need this?

Can Harness derive it?

Does exposing it create future compatibility burden?

Could it leak security-sensitive semantics?

Remove unnecessary fields.

---

# 1233. CAPABILITY DESCRIPTOR MINIMALISM

Descriptor is for:

selection
validation
governance metadata
documentation.

Not internal implementation configuration dump.

---

# 1234. PLUGIN MANIFEST MINIMALISM

Manifest is for:

identity
compatibility
provided capabilities
required permissions/dependencies.

Not arbitrary execution script.

---

# 1235. SKILL MANIFEST MINIMALISM

Manifest is for:

identity
guidance metadata
requirements
compatibility.

Not executable workflow engine.

---

# 1236. EXTENSION API ERROR SURFACE

Keep stable structured codes.

Avoid leaking internal class names.

---

# 1237. PUBLIC TYPE DOCUMENTATION

Every public Extension API type should have clear semantic documentation.

---

# 1238. PUBLIC TYPE TEST

Compile a consumer package using only published declarations.

---

# 1239. PACKAGE PUBLISH READINESS

Do NOT publish.

But verify package metadata/exports are coherent enough for future publication
if that is intended.

---

# 1240. INTERNAL MONOREPO USAGE

It is acceptable for current consumers to use workspace packages.

Do not force npm publication architecture prematurely.

---

# 1241. EXTENSION ABI

Do not call TypeScript API an ABI unless actual binary/interface semantics
justify term.

Use Extension API.

---

# 1242. CAPABILITY PROTOCOL

Internal Capability invocation contract may be described as protocol only if
meaningful.

Avoid terminology inflation.

---

# 1243. MCP PROTOCOL SEPARATION

Do not conflate internal Capability contract with MCP protocol.

Adapter maps between them.

---

# 1244. SKILL FORMAT SEPARATION

External Skill manifest format is CVG extension contract, not MCP.

---

# 1245. FUTURE OPEN STANDARD SUPPORT

Document possibility of adapters to other ecosystems.

Do not implement speculative support.

---

# 1246. OPENAI/ANTHROPIC SKILL FORMATS

If existing external Skill formats are considered in future:

adapt externally.

Do not hardcode vendor format into Core.

---

# 1247. SKILL NORMALIZATION FUTURE

Potential:

Vendor Skill
→ Skill Adapter
→ CVG SkillManifest/Instruction view.

Same architectural principle as MCP.

Out of scope unless trivial.

---

# 1248. PLUGIN NORMALIZATION FUTURE

Same.

---

# 1249. CAPABILITY SOURCE AGNOSTICISM

The Core should care about normalized Capability semantics, not ecosystem
branding.

---

# 1250. FINAL ARCHITECTURE MATURITY QUESTION

After Phase 4 ask:

"Have we reached the point where CVG Operational Harness is an engine with
stable extension sockets rather than a product codebase being generalized?"

Answer with evidence.

This is the conceptual culmination of Phases 0–4.

---

# 1251. PHASE HISTORY SUMMARY

Final report should summarize evolution:

Phase 0/1:
Secretary-derived code became independent Harness foundation.

Phase 2:
Harness gained durable execution spine.

Phase 3:
Harness gained iterative Runtime V2 and Hybrid Orchestrator.

Phase 4:
Harness gained external capability sockets while keeping Skills/Plugins outside
Core.

Use actual outcome status for each.

---

# 1252. MATURITY DELTA

Report Phase 3 → Phase 4 change in maturity dimensions.

Do not only provide final score.

Example dimensions:

Capability extensibility
Core purity
External composition
Supply-chain awareness
Developer experience
Security boundary.

---

# 1253. NO ARTIFICIAL SCORE IMPROVEMENT

Some dimensions may remain unchanged or decrease if stricter measurement reveals
gaps.

Report truth.

---

# 1254. TECHNICAL DEBT REGISTER

Create/update:

docs/phase4/TECHNICAL_DEBT_REGISTER.md

Classify remaining debt:

CORE
EXTENSION
SECURITY
TESTING
DX
MCP
SUPPLY_CHAIN
PRODUCTION.

---

# 1255. DEBT PRIORITY

P0
P1
P2
P3

with rationale.

---

# 1256. DEBT DOES NOT BLOCK PASS AUTOMATICALLY

Only critical debt according to Phase criteria.

---

# 1257. OUT-OF-SCOPE REGISTER

Create concise list to prevent future confusion.

---

# 1258. FUTURE PHASE BACKLOG

Move speculative improvements there instead of implementing now.

---

# 1259. CLEAN FINAL WORKTREE REVIEW

Worktree may remain dirty intentionally.

But classify every modified file:

Phase 4 intended
pre-existing
generated evidence
unexpected.

No unexplained changes.

---

# 1260. UNEXPECTED FILE CHANGE

Investigate before finalization.

---

# 1261. GENERATED CACHE

Do not treat ignored build/test cache as source drift.

Document exclusions.

---

# 1262. SOURCE OF TRUTH

Final candidate identity must capture all relevant non-committed source changes.

HEAD alone is insufficient.

---

# 1263. FINAL BYTE ADDENDUM

If evidence/report changes after source freeze but source does not:

use final-byte addendum/fingerprint strategy consistent with previous phases.

Do not accidentally invalidate source proof.

---

# 1264. EVIDENCE SELF-REFERENCE

Avoid impossible digest self-reference loops.

Use established sentinel pattern from prior phases.

---

# 1265. REUSE EXISTING EVIDENCE INFRASTRUCTURE

Phase 3 already has evidence/sentinel mechanisms.

Reuse/adapt rather than creating incompatible second certification system.

---

# 1266. CRITIC LEDGER CONTINUITY

Use style consistent with Phase 3 six-round critic ledger when useful.

---

# 1267. GAUNTLET-LOOP

If available, use it for:

discover
implement
verify
critic
repair
reverify.

Do not allow loop to alter acceptance criteria.

---

# 1268. ORCHESTRATE

If available, use it for non-overlapping work lanes.

---

# 1269. ENGINEERING-FRAMEWORK

If available, use it for requirements/architecture/evidence traceability.

---

# 1270. SECURITY-REVIEW

Use specialized security review if available.

---

# 1271. BACKEND/DATABASE REVIEW

Use relevant specialist for:

composition persistence
PostgreSQL durability
concurrency
effect journal.

---

# 1272. NO SKILL DEPENDENCY FOR BUILD PROCESS

Important meta-rule:

The Harness repository may use development skills to BUILD the software.

That is different from Runtime depending on external agent Skills.

Do not confuse Codex skills used during engineering with Harness Skill
architecture.

---

# 1273. BUILD-TIME SKILL VS RUNTIME SKILL

Document if necessary:

Engineering Skill:
helps Codex build repository.

Runtime Skill:
external instructional extension consumed by Agent/Product.

They are separate concepts.

---

# 1274. NO META-ARCHITECTURE CONFUSION

The use of:

gauntlet-loop
orchestrate
engineering-framework

during development does not make those Skills dependencies of CVG Operational
Harness runtime.

---

# 1275. FINAL LEARNING CLARIFICATION

The architecture should preserve the mental model:

Harness = engine.

Capability Boundary = socket built into engine.

Tool/Capability = device that performs action.

Skill = external instruction/manual teaching how to use capabilities.

Plugin = optional extension package that may bring devices/adapters.

MCP = standardized cable/protocol for connecting some external devices.

Adapter = translator between cable/device and socket.

SDK = convenience library used behind adapter.

This mental model should remain true after implementation.

---

# 1276. FINAL ACCEPTANCE SENTENCE

Before issuing PASS, verify this exact semantic statement:

"The socket belongs to the engine. The appliances do not."

If the code contradicts this:

do not PASS.

---

# 1277. EXECUTE TO COMPLETION

Proceed autonomously through the complete Phase 4 lifecycle.

Do not ask the user for ordinary implementation decisions that can be resolved
from:

existing architecture
Phase requirements
tests
security principles
brownfield evidence.

Ask only if an irreversible product/business decision truly cannot be inferred.

Otherwise:

inspect
decide
document
implement
test
criticize
repair
certify.

---

# 1278. FINAL COMMAND

BEGIN PHASE 4 NOW.

Project:

CVG OPERATIONAL HARNESS

Phase:

PHASE 4 — EXTERNAL CAPABILITY BOUNDARY & GOVERNED COMPOSITION

Quality target:

STATE-OF-THE-ART CANDIDATE
TRIPLE-A CANDIDATE

Primary invariant:

SKILLS REMAIN OUTSIDE HARNESS CORE.

Primary extension invariant:

CAPABILITIES ENTER THROUGH A GENERIC GOVERNED SOCKET.

Primary authority invariant:

EXTENSIBILITY NEVER CREATES AUTHORITY.

Primary durability invariant:

EXTERNAL COMPOSITION NEVER WEAKENS THE DURABLE RUNTIME.

Primary evidence invariant:

NO CLAIM WITHOUT FRESH EXECUTABLE EVIDENCE.

Execute now.
