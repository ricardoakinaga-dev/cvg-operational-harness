import {
  CapabilityGateway,
  PluginRegistry,
  type CapabilityActorAuthorizer,
  type CapabilityGatewayOptions,
  type RegisteredPlugin
} from './plugin-gateway.ts'
import { z } from 'zod'

export const CONTROLLED_SCHEDULING_PLUGIN = 'scheduling.controlled'
export const CONTROLLED_SCHEDULING_TOOL = 'find_available_slots'

const controlledActorAuthorizer: CapabilityActorAuthorizer = ({
  actor,
  requiredPermission
}) =>
  actor.role === 'System' && actor.id.startsWith('system.')
    ? [requiredPermission]
    : []

export function createControlledSchedulingPlugin(): RegisteredPlugin {
  return {
    manifest: {
      name: CONTROLLED_SCHEDULING_PLUGIN,
      version: '1.0.0',
      capabilities: ['scheduling.read'],
      permissions: ['scheduling:read'],
      tools: [
        {
          name: CONTROLLED_SCHEDULING_TOOL,
          permission: 'scheduling:read',
          risk: 'low',
          requiresApproval: false,
          intents: ['scheduling']
        }
      ],
      hooks: [],
      dependencies: [],
      configSchemaVersion: '1'
    },
    handlers: {
      [CONTROLLED_SCHEDULING_TOOL]: (_input, context) => ({
        status: 'succeeded',
        data: {
          slots: ['2026-09-01T10:00:00-03:00', '2026-09-01T14:00:00-03:00'],
          controlled: true,
          dryRun: context.dryRun
        }
      })
    },
    inputValidators: {
      [CONTROLLED_SCHEDULING_TOOL]: z
        .object({
          message: z.string().max(4000).optional(),
          requestedDate: z.string().max(80).optional()
        })
        .strict()
    },
    outputValidators: {
      [CONTROLLED_SCHEDULING_TOOL]: z
        .object({
          slots: z.array(z.string().max(80)).max(16),
          controlled: z.literal(true),
          dryRun: z.boolean()
        })
        .strict()
    }
  }
}

export function createControlledCapabilityGateway(
  options: CapabilityGatewayOptions = {}
): CapabilityGateway {
  const gatewayOptions = {
    ...options,
    actorAuthorizer: options.actorAuthorizer ?? controlledActorAuthorizer
  }
  return new CapabilityGateway(
    new PluginRegistry().register(createControlledSchedulingPlugin()),
    gatewayOptions
  )
}
