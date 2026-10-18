import { createSdk } from '@cvg/sdk'
import { InMemorySessionEventStore } from '@cvg/harness'
import { PolicyEngine, REFERENCE_POLICY_PROFILE } from '@cvg/policy-engine'
import {
  ApprovalEngine as ApprovalDomain,
  InMemoryApprovalStore
} from '@cvg/approval-engine'
import type {
  ApprovalEngine as ApprovalPort,
  ModelGateway
} from '@cvg/harness-contracts'

export interface ReplyCase {
  version: 1
  id: string
  message: string
  fragments: string[]
}

/** Shared real composition; callers own only the synthetic external model. */
export function createCvgDifferentialSdk(modelGateway: ModelGateway) {
  const sessions = new InMemorySessionEventStore()
  const policyDomain = new PolicyEngine({ profile: REFERENCE_POLICY_PROFILE })
  const approvalDomain = new ApprovalDomain({
    store: new InMemoryApprovalStore()
  })
  const approvals: ApprovalPort = {
    request: async (request) => {
      const record = approvalDomain.request({
        tenantId: request.tenantId,
        operatorId: request.operatorId!,
        agentId: request.agentId,
        agentVersion: request.agentVersion!,
        action: request.action!,
        resource: request.resource!,
        payload: request.payload,
        policyVersion: request.policyVersion!,
        correlationId: request.correlationId,
        operationKey: request.operationKey,
        executionRef: request.executionRef!,
        reason: 'Synthetic comparison never authorizes a tool effect'
      })
      return {
        status: 'PENDING',
        approvalId:
          record.approvalId as import('@cvg/harness-contracts').ApprovalId,
        reason: 'Synthetic comparison requires explicit approval for any effect'
      }
    }
  }
  return createSdk({
    tenantId: 'pare100_synthetic',
    sessions,
    approvals,
    policy: {
      evaluate: async (request) => {
        const decision = policyDomain.evaluate({
          tenantId: request.tenantId,
          agentId: request.agentId,
          operatorId: 'synthetic_operator',
          operatorRole: 'Operator',
          agentProfile: 'assistant',
          capability: 'resource.read',
          action: 'resource.read',
          correlationId: request.correlationId,
          context: { dataClassification: 'PUBLIC' }
        })
        return {
          outcome: decision.decision,
          reason: decision.reason,
          policyVersion: decision.policyVersion
        }
      }
    },
    modelGateway
  })
}

/** Real public SDK/kernel/session path; only the external model is scripted. */
export async function runCvgReply(fixture: ReplyCase) {
  let modelBodies = 0
  const sdk = createCvgDifferentialSdk({
    complete: async () => {
      if (++modelBodies > 1) throw new Error('unexpected model call')
      return {
        text: fixture.fragments.join(''),
        provider: 'pare100-synthetic',
        model: 'keyless-v1',
        inputTokens: 1,
        outputTokens: 2,
        costUsd: 0
      }
    }
  })
  const sessionId = `pare100-${fixture.id}`
  await sdk.openSession(sessionId)
  const turn = await sdk.sendTurn(sessionId, fixture.message)
  const events = await sdk.readEvents(sessionId)
  if (
    turn.stopReason !== 'COMPLETED' ||
    modelBodies !== 1 ||
    turn.modelCalls !== modelBodies ||
    turn.toolCalls !== 0
  )
    throw new Error('missing or extra public CVG execution')
  return {
    native: { turn, events, modelBodies },
    projection: {
      text: turn.response,
      modelCalls: turn.modelCalls,
      toolCalls: turn.toolCalls,
      inputTokens: turn.usage.inputTokens,
      outputTokens: turn.usage.outputTokens,
      effects: []
    }
  }
}
