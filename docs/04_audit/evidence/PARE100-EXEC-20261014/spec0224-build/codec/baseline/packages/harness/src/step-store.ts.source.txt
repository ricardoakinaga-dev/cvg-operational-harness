import { createHash, randomUUID } from 'node:crypto'
import {
  CHECKPOINT_VERSION,
  isStepTransitionAllowed,
  type ExecutionCheckpoint,
  type ExecutionStep,
  type ExecutionStepStore
} from '@cvg/harness-contracts'

export class CheckpointError extends Error {
  public constructor(
    public readonly code:
      | 'checkpoint_integrity'
      | 'checkpoint_version'
      | 'checkpoint_binding'
      | 'step_conflict'
      | 'step_transition',
    message: string
  ) {
    super(message)
    this.name = 'CheckpointError'
  }
}

export type UnsignedCheckpoint = Omit<
  ExecutionCheckpoint,
  'checkpointId' | 'createdAt' | 'digest'
>

export function checkpointDigest(checkpoint: UnsignedCheckpoint): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizeForHash(checkpoint)))
    .digest('hex')
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, normalizeForHash(record[key])])
    )
  }
  return value
}

export function sealCheckpoint(
  unsigned: UnsignedCheckpoint
): ExecutionCheckpoint {
  return {
    ...unsigned,
    checkpointId: `ckpt_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    digest: checkpointDigest(unsigned)
  }
}

export function validateCheckpointIntegrity(
  checkpoint: ExecutionCheckpoint,
  expected: { readonly tenantId: string; readonly executionId: string }
): void {
  if (checkpoint.checkpointVersion !== CHECKPOINT_VERSION) {
    throw new CheckpointError(
      'checkpoint_version',
      `Checkpoint version ${checkpoint.checkpointVersion} is not supported`
    )
  }
  if (
    checkpoint.tenantId !== expected.tenantId ||
    checkpoint.executionId !== expected.executionId
  ) {
    throw new CheckpointError(
      'checkpoint_binding',
      'Checkpoint does not belong to the requested execution/tenant'
    )
  }
  const {
    checkpointId: _id,
    createdAt: _createdAt,
    digest,
    ...unsigned
  } = checkpoint
  void _id
  void _createdAt
  if (checkpointDigest(unsigned) !== digest) {
    throw new CheckpointError(
      'checkpoint_integrity',
      'Checkpoint digest does not match its content'
    )
  }
}

function key(tenantId: string, executionId: string): string {
  return `${tenantId}\u0000${executionId}`
}

function copy<T>(value: T): T {
  return structuredClone(value)
}

/** Process-local step/checkpoint store used by controlled proofs. */
export class InMemoryExecutionStepStore implements ExecutionStepStore {
  private readonly steps = new Map<string, Map<number, ExecutionStep>>()
  private readonly checkpoints = new Map<string, ExecutionCheckpoint>()

  public async recordStep(step: ExecutionStep): Promise<void> {
    const identity = key(step.tenantId, step.executionId)
    const steps = this.steps.get(identity) ?? new Map<number, ExecutionStep>()
    const existing = steps.get(step.stepNumber)
    if (existing) {
      if (existing.stepId !== step.stepId) {
        throw new CheckpointError(
          'step_conflict',
          'A different step already occupies this step number'
        )
      }
      if (
        existing.status !== step.status &&
        !isStepTransitionAllowed(existing.status, step.status)
      ) {
        throw new CheckpointError(
          'step_transition',
          `Step transition ${existing.status} -> ${step.status} is not allowed`
        )
      }
    } else {
      if (!Number.isSafeInteger(step.stepNumber) || step.stepNumber < 1) {
        throw new CheckpointError(
          'step_conflict',
          'A step number must be a positive integer'
        )
      }
      const blocking = [...steps.values()].filter(
        (candidate) =>
          candidate.stepNumber < step.stepNumber &&
          !['SUCCEEDED', 'FAILED', 'SKIPPED', 'WAITING'].includes(
            candidate.status
          )
      )
      if (blocking.length > 0) {
        throw new CheckpointError(
          'step_transition',
          `Step ${step.stepNumber} cannot start before step ${blocking[0]?.stepNumber} settles`
        )
      }
    }
    steps.set(step.stepNumber, copy(step))
    this.steps.set(identity, steps)
  }

  public async listSteps(
    tenantId: string,
    executionId: string
  ): Promise<readonly ExecutionStep[]> {
    const steps = this.steps.get(key(tenantId, executionId))
    if (!steps) return []
    return [...steps.values()]
      .sort((left, right) => left.stepNumber - right.stepNumber)
      .map((step) => copy(step))
  }

  public async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    validateCheckpointIntegrity(checkpoint, {
      tenantId: checkpoint.tenantId,
      executionId: checkpoint.executionId
    })
    this.checkpoints.set(
      key(checkpoint.tenantId, checkpoint.executionId),
      copy(checkpoint)
    )
  }

  public async loadCheckpoint(
    tenantId: string,
    executionId: string
  ): Promise<ExecutionCheckpoint | null> {
    const checkpoint = this.checkpoints.get(key(tenantId, executionId))
    if (!checkpoint) return null
    validateCheckpointIntegrity(checkpoint, { tenantId, executionId })
    return copy(checkpoint)
  }
}

export function createInMemoryExecutionStepStore(): InMemoryExecutionStepStore {
  return new InMemoryExecutionStepStore()
}
