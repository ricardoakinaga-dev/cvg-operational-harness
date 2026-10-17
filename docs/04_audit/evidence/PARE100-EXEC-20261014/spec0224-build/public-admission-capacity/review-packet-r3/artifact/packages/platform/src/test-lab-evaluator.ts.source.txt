import type { ControlPlaneStore } from './control-plane-store.ts'
import {
  TestLabCaseSchema,
  type TestLabCase,
  type TestLabEvaluation,
  type TestLabSuiteResult
} from './contracts.ts'
import type { AgentId, AgentVersionId, TenantId } from './ids.ts'
import {
  runTestLab,
  type ApprovedKnowledgeResolver,
  type TestLabInput
} from './test-lab.ts'

export async function evaluateTestLabCase(input: {
  store: ControlPlaneStore
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  testCase: TestLabCase
  resolveApprovedKnowledge?: ApprovedKnowledgeResolver
}): Promise<TestLabEvaluation> {
  const testCase = TestLabCaseSchema.parse(input.testCase)
  const traceInput: TestLabInput = {
    store: input.store,
    tenantId: input.tenantId,
    agentId: input.agentId,
    versionId: input.versionId,
    message: testCase.message,
    history: testCase.history,
    ...(testCase.approvedKnowledge
      ? { approvedKnowledge: testCase.approvedKnowledge }
      : {}),
    ...(input.resolveApprovedKnowledge
      ? { resolveApprovedKnowledge: input.resolveApprovedKnowledge }
      : {})
  }
  const trace = await runTestLab(traceInput)
  const failures = [
    ...(testCase.expectedPolicyDecision &&
    trace.policy[0]?.decision !== testCase.expectedPolicyDecision
      ? [
          `policy_expected_${testCase.expectedPolicyDecision}_got_${trace.policy[0]?.decision ?? 'missing'}`
        ]
      : []),
    ...(trace.response.mode !== testCase.expectedResponseMode
      ? [
          `response_expected_${testCase.expectedResponseMode}_got_${trace.response.mode}`
        ]
      : []),
    ...(testCase.expectedHandoff !== undefined &&
    trace.handoff.requested !== testCase.expectedHandoff
      ? [
          `handoff_expected_${String(testCase.expectedHandoff)}_got_${String(trace.handoff.requested)}`
        ]
      : []),
    ...(trace.provider.externalCall ? ['external_call_must_remain_false'] : [])
  ]
  return {
    caseId: testCase.id,
    passed: failures.length === 0,
    failures,
    trace
  }
}

export async function evaluateTestLabSuite(input: {
  store: ControlPlaneStore
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  cases: TestLabCase[]
  resolveApprovedKnowledge?: ApprovedKnowledgeResolver
}): Promise<TestLabSuiteResult> {
  const cases = input.cases.map((testCase) => TestLabCaseSchema.parse(testCase))
  let results: TestLabEvaluation[] = []
  for (const testCase of cases) {
    const result = await evaluateTestLabCase({ ...input, testCase })
    results = [...results, result]
  }
  return {
    passed: results.every((result) => result.passed),
    results
  }
}
